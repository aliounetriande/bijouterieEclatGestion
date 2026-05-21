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
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id TEXT UNIQUE NOT NULL,
          customer_id INTEGER NOT NULL,
          item_name TEXT NOT NULL,
          item_description TEXT,
          price INTEGER NOT NULL,
          advance INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'en_attente',
          date_created TEXT NOT NULL,
          date_delivered TEXT,
          user_id INTEGER NOT NULL
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


@app.route("/src/<path:filename>")
def static_src(filename):
    return send_from_directory(ROOT / "src", filename)


@app.route("/index.html")
def index_html():
    return send_from_directory(ROOT, "index.html")


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
        "orders": [
            dict(r) for r in db.execute(
                """
                SELECT orders.*, customers.name AS customer, customers.email
                FROM orders
                JOIN customers ON customers.id = orders.customer_id
                ORDER BY orders.id DESC
                """
            )
        ],
        "users": [
            dict(r) for r in db.execute("SELECT id, username, role, full_name FROM users ORDER BY id")
        ] if g.user["role"] == "admin" else [],
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


@app.route("/api/products/<int:product_id>", methods=["DELETE"])
@login_required
def api_delete_product(product_id):
    db = get_db()
    product = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not product:
        return jsonify({"error": "Produit introuvable"}), 404

    # Vérifier si le produit a des ventes associées
    has_sales = db.execute(
        "SELECT COUNT(*) FROM sale_items WHERE product_id = ?", (product_id,)
    ).fetchone()[0]
    if has_sales:
        return jsonify({"error": "Impossible de supprimer : ce produit a des ventes associées"}), 400

    db.execute("DELETE FROM products WHERE id = ?", (product_id,))
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


@app.route("/api/customers/<int:customer_id>", methods=["DELETE"])
@login_required
def api_delete_customer(customer_id):
    db = get_db()
    customer = db.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if not customer:
        return jsonify({"error": "Client introuvable"}), 404

    # Vérifier si le client a des ventes associées
    has_sales = db.execute(
        "SELECT COUNT(*) FROM sales WHERE customer_id = ?", (customer_id,)
    ).fetchone()[0]
    if has_sales:
        return jsonify({"error": "Impossible de supprimer : ce client a des ventes associées"}), 400

    db.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    db.commit()
    return jsonify({"ok": True})


# ─── API Admin : Reset mot de passe ─────────────────────────────────────

@app.route("/api/users/<int:user_id>/reset-password", methods=["POST"])
@login_required
def api_reset_password(user_id):
    if g.user["role"] != "admin":
        return jsonify({"error": "Réservé à l'administrateur"}), 403

    body = request.get_json(silent=True) or {}
    new_password = body.get("password", "").strip()

    if len(new_password) < 6:
        return jsonify({"error": "Le mot de passe doit faire au moins 6 caractères"}), 400

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404

    db.execute(
        "UPDATE users SET password = ? WHERE id = ?",
        (generate_password_hash(new_password), user_id),
    )
    db.commit()
    return jsonify({"ok": True})


# ─── API Bootstrap (ajout liste users pour admin) ───────────────────────────

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


# ─── API Commandes ───────────────────────────────────────────────────────────

@app.route("/api/orders", methods=["POST"])
@login_required
def api_create_order():
    body = request.get_json(silent=True) or {}
    db = get_db()

    # Validation
    if not body.get("itemName") or not body.get("price"):
        return jsonify({"error": "Nom du bijou et prix requis"}), 400
    if not body.get("customer") or not body.get("email"):
        return jsonify({"error": "Informations client requises"}), 400

    price = int(body["price"])
    advance = int(body.get("advance", 0))

    if advance < 0 or advance > price:
        return jsonify({"error": "Montant de l'avance invalide"}), 400

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

    order_id = f"#CMD-{uuid.uuid4().hex[:6].upper()}"

    db.execute(
        """
        INSERT INTO orders (order_id, customer_id, item_name, item_description, price, advance, status, date_created, user_id)
        VALUES (?, ?, ?, ?, ?, ?, 'en_attente', ?, ?)
        """,
        (
            order_id,
            customer["id"],
            body["itemName"],
            body.get("itemDescription", ""),
            price,
            advance,
            datetime.now().strftime("%d/%m/%Y"),
            g.user["id"],
        ),
    )
    db.commit()
    return jsonify({"ok": True, "orderId": order_id})


@app.route("/api/orders/<int:order_id>/deliver", methods=["POST"])
@login_required
def api_deliver_order(order_id):
    db = get_db()
    order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()

    if not order:
        return jsonify({"error": "Commande introuvable"}), 404
    if order["status"] == "livre":
        return jsonify({"error": "Commande déjà livrée"}), 400

    now = datetime.now().strftime("%d/%m/%Y")

    # Marquer comme livré
    db.execute(
        "UPDATE orders SET status = 'livre', date_delivered = ? WHERE id = ?",
        (now, order_id),
    )

    # Créer la vente correspondante
    receipt_id = f"#RC-{uuid.uuid4().hex[:6].upper()}"
    cursor = db.execute(
        """
        INSERT INTO sales (receipt_id, customer_id, date, total, user_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            receipt_id,
            order["customer_id"],
            now,
            order["price"],
            g.user["id"],
        ),
    )

    # Créer l'item de vente (product_id = 0 car c'est une commande sur mesure)
    db.execute(
        """
        INSERT INTO sale_items (sale_id, product_id, name, qty, price)
        VALUES (?, ?, ?, ?, ?)
        """,
        (cursor.lastrowid, 0, order["item_name"], 1, order["price"]),
    )

    db.commit()
    return jsonify({"ok": True})


@app.route("/api/orders/<int:order_id>", methods=["DELETE"])
@login_required
def api_delete_order(order_id):
    db = get_db()
    order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()

    if not order:
        return jsonify({"error": "Commande introuvable"}), 404
    if order["status"] == "livre":
        return jsonify({"error": "Impossible de supprimer une commande livrée"}), 400

    db.execute("DELETE FROM orders WHERE id = ?", (order_id,))
    db.commit()
    return jsonify({"ok": True})


# ─── Démarrage ───────────────────────────────────────────────────────────────

init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    # En dev : debug=True. En prod sur Render : Gunicorn gère le serveur.
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG", "0") == "1")