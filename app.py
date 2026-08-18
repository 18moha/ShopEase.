import os
import sqlite3
from datetime import datetime, timedelta
import random
from flask import Flask, jsonify, request, render_template, send_from_directory

app = Flask(__name__, template_folder='templates', static_folder='static')
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shopease.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    db_exists = os.path.exists(DB_PATH)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create Tables matching the ERD
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS USERS (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'cashier'))
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS PRODUCTS (
        product_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        retail_price REAL NOT NULL,
        cost_price REAL NOT NULL,
        stock_quantity INTEGER NOT NULL,
        threshold INTEGER NOT NULL DEFAULT 5
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS SALES (
        sale_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        total_amount REAL NOT NULL,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash', 'M-Pesa', 'Credit')),
        FOREIGN KEY (user_id) REFERENCES USERS(user_id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS SALES_ITEMS (
        item_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        cost REAL NOT NULL, -- store cost price at time of sale to compute historical profit accurately
        FOREIGN KEY (sale_id) REFERENCES SALES(sale_id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES PRODUCTS(product_id)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS CUSTOMERS (
        customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        current_debt REAL NOT NULL DEFAULT 0.0,
        max_limit REAL NOT NULL DEFAULT 2000.0
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS CREDITS (
        credit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        sale_id INTEGER, -- NULL for repayments
        amount_due REAL NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('unpaid', 'partially_paid', 'paid', 'repayment')),
        FOREIGN KEY (customer_id) REFERENCES CUSTOMERS(customer_id),
        FOREIGN KEY (sale_id) REFERENCES SALES(sale_id) ON DELETE SET NULL
    )
    ''')
    
    conn.commit()

    # Seed initial data if newly created or empty
    cursor.execute("SELECT COUNT(*) FROM USERS")
    if cursor.fetchone()[0] == 0:
        print("Database empty. Seeding initial presentation data...")
        
        # 1. Seed Users (passwords plain-text for presentation ease or simple mock hash)
        cursor.execute("INSERT INTO USERS (username, password_hash, role) VALUES ('admin', 'admin123', 'admin')")
        cursor.execute("INSERT INTO USERS (username, password_hash, role) VALUES ('cashier', 'cashier123', 'cashier')")
        
        # 2. Seed Products
        products = [
            ("Jogoo Maize Meal 2kg", "Premium sifted maize meal for Ugali", 200.00, 160.00, 45, 10),
            ("Blue Band Margarine 500g", "Margarine spread for bread", 280.00, 210.00, 30, 8),
            ("Safari Tea 250g", "Finest Kenyan black tea", 140.00, 105.00, 22, 5),
            ("Broadways Bread 400g", "Sweet sliced white bread", 65.00, 50.00, 40, 12),
            ("Cowvi Fresh Milk 1L", "Pasteurized whole milk", 110.00, 85.00, 6, 10),       # Low stock
            ("Kasuku Cooking Fat 1kg", "Solid vegetable cooking fat", 370.00, 290.00, 4, 5), # Low stock
            ("Kibuyu Pure Honey 500g", "Raw organic honey", 450.00, 320.00, 15, 4),
            ("Mumias Sugar 1kg", "Local white sugar", 160.00, 130.00, 35, 10),
            ("Rina Vegetable Oil 1L", "Refined liquid cooking oil", 320.00, 250.00, 28, 6),
            ("Omo Hand Wash 500g", "Active detergent powder", 180.00, 140.00, 18, 5)
        ]
        cursor.executemany(
            "INSERT INTO PRODUCTS (name, description, retail_price, cost_price, stock_quantity, threshold) VALUES (?, ?, ?, ?, ?, ?)",
            products
        )
        
        # 3. Seed Customers
        customers = [
            ("John Mutua", "0712345678", 1200.00, 5000.00),
            ("Mary Wanjiku", "0722112233", 450.00, 3000.00),
            ("David Ochieng", "0733445566", 0.00, 2500.00),
            ("Grace Mwangi", "0744998877", 2800.00, 4000.00)
        ]
        cursor.executemany(
            "INSERT INTO CUSTOMERS (name, phone, current_debt, max_limit) VALUES (?, ?, ?, ?)",
            customers
        )
        
        # 4. Seed Historical Sales (last 7 days to populate charts)
        now = datetime.now()
        for day_offset in range(6, -1, -1):
            date_str = (now - timedelta(days=day_offset)).strftime('%Y-%m-%d')
            # Generate 2-5 transactions per day
            num_tx = random.randint(3, 6)
            for tx_idx in range(num_tx):
                time_str = f"{date_str} {random.randint(8, 19):02d}:{random.randint(0, 59):02d}:00"
                pay_method = random.choices(['Cash', 'M-Pesa', 'Credit'], weights=[45, 45, 10])[0]
                
                # Pick random items
                items_count = random.randint(1, 3)
                # Select random products
                cursor.execute("SELECT * FROM PRODUCTS")
                all_prods = cursor.fetchall()
                tx_items = random.sample(all_prods, items_count)
                
                total_amount = 0.0
                sales_list = []
                for prod in tx_items:
                    qty = random.randint(1, 3)
                    item_price = prod['retail_price']
                    item_cost = prod['cost_price']
                    total_amount += (item_price * qty)
                    sales_list.append((prod['product_id'], qty, item_price, item_cost))
                
                # If credit, pick a customer with a balance
                cust_id = None
                if pay_method == 'Credit':
                    cursor.execute("SELECT customer_id, name, current_debt, max_limit FROM CUSTOMERS WHERE current_debt > 0")
                    eligible_custs = cursor.fetchall()
                    if eligible_custs:
                        selected_cust = random.choice(eligible_custs)
                        cust_id = selected_cust['customer_id']
                    else:
                        pay_method = 'Cash' # fallback
                
                # Insert Sale
                # cashier = user_id 2, admin = user_id 1
                user_id = random.choice([1, 2])
                cursor.execute(
                    "INSERT INTO SALES (user_id, timestamp, total_amount, payment_method) VALUES (?, ?, ?, ?)",
                    (user_id, time_str, total_amount, pay_method)
                )
                sale_id = cursor.lastrowid
                
                # Insert Sale Items
                for prod_id, qty, retail, cost in sales_list:
                    cursor.execute(
                        "INSERT INTO SALES_ITEMS (sale_id, product_id, quantity, price, cost) VALUES (?, ?, ?, ?, ?)",
                        (sale_id, prod_id, qty, retail, cost)
                    )
                
                # Log credit transaction
                if pay_method == 'Credit' and cust_id is not None:
                    cursor.execute(
                        "INSERT INTO CREDITS (customer_id, sale_id, amount_due, date, status) VALUES (?, ?, ?, ?, 'unpaid')",
                        (cust_id, sale_id, total_amount, time_str)
                    )
        
        # Add some repayments to make ledger look authentic
        repayments = [
            (1, 400.00, (now - timedelta(days=2)).strftime('%Y-%m-%d 10:15:00')),
            (2, 200.00, (now - timedelta(days=1)).strftime('%Y-%m-%d 14:30:00')),
            (4, 500.00, now.strftime('%Y-%m-%d 09:00:00'))
        ]
        for cust_id, amt, time_str in repayments:
            cursor.execute(
                "INSERT INTO CREDITS (customer_id, sale_id, amount_due, date, status) VALUES (?, NULL, ?, ?, 'repayment')",
                (cust_id, -amt, time_str)
            )
            
        conn.commit()
    conn.close()

# Initialize DB on import/startup
init_db()

# --- ROUTES ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM USERS WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()
    
    if user and user['password_hash'] == password:
        return jsonify({
            "success": True,
            "username": user['username'],
            "role": user['role']
        })
    else:
        return jsonify({"error": "Invalid username or password."}), 401

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    # User role filter to obfuscate profit
    role = request.args.get('role', 'cashier')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Total Revenue
    cursor.execute("SELECT SUM(total_amount) FROM SALES")
    revenue = cursor.fetchone()[0] or 0.0
    
    # 2. Total Cost and Net Profit
    cursor.execute("SELECT SUM(quantity * cost) FROM SALES_ITEMS")
    total_cost = cursor.fetchone()[0] or 0.0
    net_profit = revenue - total_cost
    
    # 3. Total Outstanding Debt
    cursor.execute("SELECT SUM(current_debt) FROM CUSTOMERS")
    total_debt = cursor.fetchone()[0] or 0.0
    
    # 4. Low Stock count and list
    cursor.execute("SELECT * FROM PRODUCTS WHERE stock_quantity <= threshold")
    low_stock_products = [dict(row) for row in cursor.fetchall()]
    
    # 5. Recent Sales with Cashier Username and Item count
    cursor.execute('''
        SELECT s.sale_id, s.timestamp, s.total_amount, s.payment_method, u.username as cashier_name,
               (SELECT SUM(quantity) FROM SALES_ITEMS WHERE sale_id = s.sale_id) as item_count
        FROM SALES s
        JOIN USERS u ON s.user_id = u.user_id
        ORDER BY s.timestamp DESC LIMIT 6
    ''')
    recent_sales = [dict(row) for row in cursor.fetchall()]
    
    # 6. Sales & Profit Chart Data for last 7 days
    now = datetime.now()
    chart_labels = []
    chart_sales = []
    chart_profit = []
    
    for i in range(6, -1, -1):
        date_str = (now - timedelta(days=i)).strftime('%Y-%m-%d')
        chart_labels.append((now - timedelta(days=i)).strftime('%a')) # 'Mon', 'Tue', etc.
        
        # Sales for that day
        cursor.execute("SELECT SUM(total_amount) FROM SALES WHERE timestamp LIKE ?", (f"{date_str}%",))
        day_sales = cursor.fetchone()[0] or 0.0
        chart_sales.append(day_sales)
        
        # Profit for that day
        cursor.execute('''
            SELECT SUM(si.quantity * (si.price - si.cost)) 
            FROM SALES_ITEMS si
            JOIN SALES s ON si.sale_id = s.sale_id
            WHERE s.timestamp LIKE ?
        ''', (f"{date_str}%",))
        day_profit = cursor.fetchone()[0] or 0.0
        chart_profit.append(day_profit)
        
    conn.close()
    
    # Obfuscate profit metrics if role is cashier
    response_data = {
        "revenue": round(revenue, 2),
        "outstanding_debt": round(total_debt, 2),
        "low_stock_count": len(low_stock_products),
        "low_stock_list": low_stock_products,
        "recent_sales": recent_sales,
        "chart": {
            "labels": chart_labels,
            "sales": [round(x, 2) for x in chart_sales]
        }
    }
    
    if role == 'admin':
        response_data["cost"] = round(total_cost, 2)
        response_data["profit"] = round(net_profit, 2)
        response_data["chart"]["profit"] = [round(x, 2) for x in chart_profit]
        
    return jsonify(response_data)

@app.route('/api/products', methods=['GET', 'POST'])
def handle_products():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
        cursor.execute("SELECT * FROM PRODUCTS ORDER BY name ASC")
        products = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(products)
        
    elif request.method == 'POST':
        # Add product
        data = request.json
        name = data.get('name')
        description = data.get('description', '')
        retail_price = float(data.get('retail_price', 0.0))
        cost_price = float(data.get('cost_price', 0.0))
        stock_quantity = int(data.get('stock_quantity', 0))
        threshold = int(data.get('threshold', 5))
        
        if not name or retail_price <= 0 or cost_price <= 0:
            return jsonify({"error": "Invalid product credentials. Prices must be positive values."}), 400
            
        try:
            cursor.execute('''
                INSERT INTO PRODUCTS (name, description, retail_price, cost_price, stock_quantity, threshold)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (name, description, retail_price, cost_price, stock_quantity, threshold))
            conn.commit()
            new_id = cursor.lastrowid
            conn.close()
            return jsonify({"message": "Product added successfully", "product_id": new_id})
        except Exception as e:
            conn.close()
            return jsonify({"error": str(e)}), 500

@app.route('/api/products/<int:prod_id>', methods=['PUT', 'DELETE'])
def edit_product(prod_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify product exists
    cursor.execute("SELECT * FROM PRODUCTS WHERE product_id = ?", (prod_id,))
    product = cursor.fetchone()
    if not product:
        conn.close()
        return jsonify({"error": "Product not found"}), 404
        
    if request.method == 'PUT':
        data = request.json
        name = data.get('name')
        description = data.get('description', '')
        retail_price = float(data.get('retail_price', 0.0))
        cost_price = float(data.get('cost_price', 0.0))
        stock_quantity = int(data.get('stock_quantity', 0))
        threshold = int(data.get('threshold', 5))
        
        if not name or retail_price <= 0 or cost_price <= 0:
            conn.close()
            return jsonify({"error": "Invalid values. Prices must be positive."}), 400
            
        cursor.execute('''
            UPDATE PRODUCTS 
            SET name = ?, description = ?, retail_price = ?, cost_price = ?, stock_quantity = ?, threshold = ?
            WHERE product_id = ?
        ''', (name, description, retail_price, cost_price, stock_quantity, threshold, prod_id))
        conn.commit()
        conn.close()
        return jsonify({"message": "Product updated successfully"})
        
    elif request.method == 'DELETE':
        # Check if product was already sold
        cursor.execute("SELECT COUNT(*) FROM SALES_ITEMS WHERE product_id = ?", (prod_id,))
        sold_count = cursor.fetchone()[0]
        if sold_count > 0:
            conn.close()
            return jsonify({"error": "Cannot delete product. Transaction history exists. Reduce stock to 0 instead."}), 400
            
        cursor.execute("DELETE FROM PRODUCTS WHERE product_id = ?", (prod_id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Product deleted successfully"})

@app.route('/api/customers', methods=['GET', 'POST'])
def handle_customers():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
        cursor.execute("SELECT * FROM CUSTOMERS ORDER BY name ASC")
        customers = [dict(row) for row in cursor.fetchall()]
        
        # Fetch ledger history for each customer
        for cust in customers:
            cursor.execute('''
                SELECT c.credit_id, c.amount_due, c.date, c.status, s.sale_id, s.payment_method
                FROM CREDITS c
                LEFT JOIN SALES s ON c.sale_id = s.sale_id
                WHERE c.customer_id = ?
                ORDER BY c.date DESC
            ''', (cust['customer_id'],))
            cust['history'] = [dict(row) for row in cursor.fetchall()]
            
        conn.close()
        return jsonify(customers)
        
    elif request.method == 'POST':
        data = request.json
        name = data.get('name')
        phone = data.get('phone')
        max_limit = float(data.get('max_limit', 2000.0))
        
        if not name or not phone:
            conn.close()
            return jsonify({"error": "Name and phone are required fields."}), 400
            
        try:
            cursor.execute('''
                INSERT INTO CUSTOMERS (name, phone, current_debt, max_limit)
                VALUES (?, ?, 0.0, ?)
            ''', (name, phone, max_limit))
            conn.commit()
            new_id = cursor.lastrowid
            conn.close()
            return jsonify({"message": "Customer registered successfully", "customer_id": new_id})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"error": "Phone number is already registered to another customer."}), 400
        except Exception as e:
            conn.close()
            return jsonify({"error": str(e)}), 500

@app.route('/api/checkout', methods=['POST'])
def process_checkout():
    data = request.json
    payment_method = data.get('payment_method')
    customer_id = data.get('customer_id')
    items = data.get('items', []) # [{'product_id': 1, 'quantity': 2}]
    role = data.get('role', 'cashier')
    
    if not payment_method or not items:
        return jsonify({"error": "Missing payment method or cart items."}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Calculate total and validate stock first
        total_amount = 0.0
        products_to_update = []
        
        for item in items:
            prod_id = item['product_id']
            qty = int(item['quantity'])
            
            if qty <= 0:
                conn.close()
                return jsonify({"error": "Invalid quantity in cart."}), 400
                
            cursor.execute("SELECT * FROM PRODUCTS WHERE product_id = ?", (prod_id,))
            prod = cursor.fetchone()
            if not prod:
                conn.close()
                return jsonify({"error": f"Product with ID {prod_id} not found."}), 404
                
            if prod['stock_quantity'] < qty:
                conn.close()
                return jsonify({"error": f"Insufficient stock for '{prod['name']}'. Available: {prod['stock_quantity']}."}), 400
                
            total_amount += prod['retail_price'] * qty
            products_to_update.append((prod, qty))
            
        # Check credit limit if payment method is Credit
        customer = None
        if payment_method == 'Credit':
            if not customer_id:
                conn.close()
                return jsonify({"error": "Credit payment selected, but no customer specified."}), 400
                
            cursor.execute("SELECT * FROM CUSTOMERS WHERE customer_id = ?", (customer_id,))
            customer = cursor.fetchone()
            if not customer:
                conn.close()
                return jsonify({"error": "Customer not found."}), 404
                
            projected_debt = customer['current_debt'] + total_amount
            if projected_debt > customer['max_limit']:
                conn.close()
                return jsonify({
                    "error": f"Credit limit exceeded. Limit: KSh {customer['max_limit']:.2f}, "
                             f"Current Debt: KSh {customer['current_debt']:.2f}, "
                             f"New Purchase: KSh {total_amount:.2f}."
                }), 400
                
        # Start transaction modifications
        user_id = 1 if role == 'admin' else 2
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # 1. Insert Sales Record
        cursor.execute('''
            INSERT INTO SALES (user_id, timestamp, total_amount, payment_method)
            VALUES (?, ?, ?, ?)
        ''', (user_id, timestamp, total_amount, payment_method))
        sale_id = cursor.lastrowid
        
        # 2. Insert Sale Items and Decrement Stock
        for prod, qty in products_to_update:
            # Log sale item
            cursor.execute('''
                INSERT INTO SALES_ITEMS (sale_id, product_id, quantity, price, cost)
                VALUES (?, ?, ?, ?, ?)
            ''', (sale_id, prod['product_id'], qty, prod['retail_price'], prod['cost_price']))
            
            # Decrement stock
            new_stock = prod['stock_quantity'] - qty
            cursor.execute('''
                UPDATE PRODUCTS SET stock_quantity = ? WHERE product_id = ?
            ''', (new_stock, prod['product_id']))
            
        # 3. Handle Credit Ledger entry
        if payment_method == 'Credit' and customer:
            # Update customer debt balance
            new_debt = customer['current_debt'] + total_amount
            cursor.execute('''
                UPDATE CUSTOMERS SET current_debt = ? WHERE customer_id = ?
            ''', (new_debt, customer['customer_id']))
            
            # Add credits transaction
            cursor.execute('''
                INSERT INTO CREDITS (customer_id, sale_id, amount_due, date, status)
                VALUES (?, ?, ?, ?, 'unpaid')
            ''', (customer['customer_id'], sale_id, total_amount, timestamp))
            
        conn.commit()
        conn.close()
        return jsonify({
            "message": "Checkout completed successfully!",
            "sale_id": sale_id,
            "total": total_amount,
            "timestamp": timestamp
        })
        
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Checkout failed: {str(e)}"}), 500

@app.route('/api/repayment', methods=['POST'])
def process_repayment():
    data = request.json
    customer_id = data.get('customer_id')
    amount = float(data.get('amount', 0.0))
    
    if not customer_id or amount <= 0:
        return jsonify({"error": "Invalid customer ID or repayment amount."}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Validate customer
        cursor.execute("SELECT * FROM CUSTOMERS WHERE customer_id = ?", (customer_id,))
        customer = cursor.fetchone()
        if not customer:
            conn.close()
            return jsonify({"error": "Customer not found."}), 404
            
        current_debt = customer['current_debt']
        if current_debt <= 0:
            conn.close()
            return jsonify({"error": "Customer has no outstanding debt."}), 400
            
        repayment_amount = min(amount, current_debt)
        new_debt = current_debt - repayment_amount
        
        # 1. Update customer debt
        cursor.execute('''
            UPDATE CUSTOMERS SET current_debt = ? WHERE customer_id = ?
        ''', (new_debt, customer['customer_id']))
        
        # 2. Insert repayment record in credits
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO CREDITS (customer_id, sale_id, amount_due, date, status)
            VALUES (?, NULL, ?, ?, 'repayment')
        ''', (customer['customer_id'], -repayment_amount, timestamp))
        
        # Update unpaid credits
        cursor.execute('''
            SELECT * FROM CREDITS 
            WHERE customer_id = ? AND status = 'unpaid' 
            ORDER BY date ASC
        ''', (customer['customer_id'],))
        unpaid_credits = cursor.fetchall()
        
        remaining_repay = repayment_amount
        for cred in unpaid_credits:
            if remaining_repay <= 0:
                break
                
            due = cred['amount_due']
            if remaining_repay >= due:
                cursor.execute("UPDATE CREDITS SET status = 'paid' WHERE credit_id = ?", (cred['credit_id'],))
                remaining_repay -= due
            else:
                cursor.execute("UPDATE CREDITS SET status = 'partially_paid' WHERE credit_id = ?", (cred['credit_id'],))
                remaining_repay = 0
                
        conn.commit()
        conn.close()
        return jsonify({
            "message": f"Repayment of KSh {repayment_amount:.2f} logged successfully.",
            "new_debt": new_debt,
            "repaid_amount": repayment_amount
        })
        
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Repayment logging failed: {str(e)}"}), 500

if __name__ == '__main__':
    print("Starting ShopEase backend server...")
    app.run(debug=True, port=5000)
