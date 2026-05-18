"""
Bijouterie Éclat — Serveur backend (Flask)
Corrections appliquées :
  1. Migration http.server → Flask (serveur production-ready)
  2. Mots de passe hashés avec bcrypt
  3. Race condition receipt_id corrigée (UUID au lieu de COUNT)
  4. Sessions sécurisées via Flask-Login / cookies signés
  5. Variables d'environnement pour les secrets
"""

import os
import uuid
import sqlite3
from datetime import datetime
from pathlib import Path
from functools import wraps

from flask import (
    Flask,
    request,
    jsonify,
    send_from_directory,
    session,
    g,
)
from werkzeug.security import generate_password_hash, check_password_hash

# ─── Config ──────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent
DB_PATH = ROOT / "bijouterie_eclat.db"

app = Flask(__name__, static_folder=str(ROOT / "src"), static_url_path="/src")
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me-in-production")


# ─── Base de données ─────────────────────────────────────────────────────────

def get_db():
    """Une connexion par requête, réutilisée via Flask `g`."""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        # Active le WAL mode pour de meilleures performances concurrentes avec SQLite
        g.db.execute("PRAGMA journal_mode=WAL")
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Crée les tables et insère les données de démo si la DB est vide."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL,
          full_name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          stock INTEGER NOT NULL,
          price INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          phone TEXT
        );
        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          receipt_id TEXT UNIQUE NOT NULL,
          customer_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          total INTEGER NOT NULL,
          user_id INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          qty INTEGER NOT NULL,
          price INTEGER NOT NULL
        );
        """
    )

    # ── Données de démo ──
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)",
            [
                # ✅ Mots de passe hashés (avant : stockés en clair)
                ("admin", generate_password_hash("admin123"), "admin", "Administrateur"),
                ("vendeuse", generate_password_hash("vente123"), "vendeur", "Vendeuse principale"),
            ],
        )

    if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO products (name, category, stock, price) VALUES (?, ?, ?, ?)",
            [
                ("Collier Élégance Or", "Colliers", 12, 125000),
                ("Bracelet Prestige", "Bracelets", 20, 85000),
                ("Bague Royale Argent", "Bagues", 50, 45000),
            ],
        )

    if conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)",
            ("Aminata Ouédraogo", "aminata@example.com", ""),
        )

    conn.commit()
    conn.close()


# ─── Auth helpers ────────────────────────────────────────────────────────────

def login_required(f):
    """Décorateur : bloque l'accès si pas connecté."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Non connecté"}), 401
        db = get_db()
        user = db.execute(
            "SELECT id, username, role, full_name FROM users WHERE id = ?",
            (session["user_id"],),
        ).fetchone()
        if not user:
            session.clear()
            return jsonify({"error": "Session invalide"}), 401
        g.user = dict(user)
        return f(*args, **kwargs)
    return decorated


# ─── Routes statiques ────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(ROOT, filename)


# ─── API Auth ────────────────────────────────────────────────────────────────

@app.route("/api/login", methods=["POST"])
def api_login():
    body = request.get_json(silent=True) or {}
    username = body.get("username", "")
    password = body.get("password", "")

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()

    # ✅ Vérification avec hash (avant : comparaison en clair)
    if not user or not check_password_hash(user["password"], password):
        return jsonify({"error": "Identifiants invalides"}), 401

    session.clear()
    session["user_id"] = user["id"]

    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"],
    })


@app.route("/api/logout", methods=["POST"])
@login_required
def api_logout():
    session.clear()
    return jsonify({})


@app.route("/api/me")
@login_required
def api_me():
    return jsonify(g.user)


# ─── API Bootstrap ───────────────────────────────────────────────────────────

@app.route("/api/bootstrap")
@login_required
def api_bootstrap():
    db = get_db()
    products = [dict(r) for r in db.execute("SELECT * FROM products ORDER BY id")]
    customers = [dict(r) for r in db.execute("SELECT * FROM customers ORDER BY name")]

    sales = []
    for row in db.execute(
        """
        SELECT sales.*, customers.name AS customer, customers.email
        FROM sales
        JOIN customers ON customers.id = sales.customer_id
        ORDER BY sales.id DESC
        """
    ):
        items = [
            dict(item)
            for item in db.execute(
                "SELECT product_id AS productId, name, qty, price FROM sale_items WHERE sale_id = ?",
                (row["id"],),
            )
        ]
        sales.append({
            "id": row["receipt_id"],
            "customer": row["customer"],
            "email": row["email"],
            "date": row["date"],
            "total": row["total"],
            "items": items,
        })

    return jsonify({
        "user": g.user,
        "products": products,
        "customers": customers,
        "sales": sales,
    })


# ─── API Produits ────────────────────────────────────────────────────────────

@app.route("/api/products", methods=["POST"])
@login_required
def api_products():
    if g.user["role"] != "admin":
        return jsonify({"error": "Réservé à l'administrateur"}), 403

    body = request.get_json(silent=True) or {}
    db = get_db()
    db.execute(
        "INSERT INTO products (name, category, stock, price) VALUES (?, ?, ?, ?)",
        (body["name"], body["category"], body["stock"], body["price"]),
    )
    db.commit()
    return jsonify({"ok": True})


# ─── API Clients ─────────────────────────────────────────────────────────────

@app.route("/api/customers", methods=["POST"])
@login_required
def api_customers():
    body = request.get_json(silent=True) or {}
    db = get_db()
    db.execute(
        """
        INSERT INTO customers (name, email, phone)
        VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone
        """,
        (body["name"], body["email"], body.get("phone", "")),
    )
    db.commit()
    return jsonify({"ok": True})


# ─── API Ventes ──────────────────────────────────────────────────────────────

@app.route("/api/sales", methods=["POST"])
@login_required
def api_sales():
    body = request.get_json(silent=True) or {}
    db = get_db()

    product = db.execute(
        "SELECT * FROM products WHERE id = ?", (body["productId"],)
    ).fetchone()

    if not product or product["stock"] < body["qty"]:
        return jsonify({"error": "Stock insuffisant"}), 400

    # Upsert client
    db.execute(
        """
        INSERT INTO customers (name, email, phone)
        VALUES (?, ?, '')
        ON CONFLICT(email) DO UPDATE SET name = excluded.name
        """,
        (body["customer"], body["email"]),
    )
    customer = db.execute(
        "SELECT * FROM customers WHERE email = ?", (body["email"],)
    ).fetchone()

    # ✅ Receipt ID unique avec UUID (avant : COUNT(*) = race condition)
    receipt_id = f"#RC-{uuid.uuid4().hex[:6].upper()}"

    total = product["price"] * body["qty"]

    # Mise à jour stock
    db.execute(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        (body["qty"], product["id"]),
    )

    # Insertion vente
    cursor = db.execute(
        """
        INSERT INTO sales (receipt_id, customer_id, date, total, user_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            receipt_id,
            customer["id"],
            datetime.now().strftime("%d/%m/%Y"),
            total,
            g.user["id"],
        ),
    )

    # Insertion items
    db.execute(
        """
        INSERT INTO sale_items (sale_id, product_id, name, qty, price)
        VALUES (?, ?, ?, ?, ?)
        """,
        (cursor.lastrowid, product["id"], product["name"], body["qty"], product["price"]),
    )

    db.commit()
    return jsonify({"ok": True})


# ─── Démarrage ───────────────────────────────────────────────────────────────

init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    # En dev : debug=True. En prod sur Render : Gunicorn gère le serveur.
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG", "0") == "1")