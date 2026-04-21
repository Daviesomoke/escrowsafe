


"""
SecureEscrow Kenya - Backend Server
Run with: python app.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import random
import string
from datetime import datetime, timedelta
import os

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Allow frontend to talk to backend

# Database file name
DATABASE = 'escrow.db'


def init_database():
    """Create database tables if they don't exist."""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Transactions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            auth_code TEXT NOT NULL,
            item_name TEXT NOT NULL,
            item_details TEXT,
            amount REAL NOT NULL,
            buyer_phone TEXT NOT NULL,
            seller_phone TEXT NOT NULL,
            transaction_type TEXT,
            delivery_deadline TEXT,
            status TEXT DEFAULT 'FUNDS_SECURED',
            created_at TEXT NOT NULL,
            shipped_at TEXT,
            delivered_at TEXT,
            released_at TEXT,
            disputed_at TEXT
        )
    ''')
    
    # Activity log table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            created_at TEXT NOT NULL
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully.")


def get_db_connection():
    """Create a database connection."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def generate_transaction_id():
    """Generate a unique transaction ID."""
    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    random_part = ''.join(random.choices(chars, k=6))
    return f'ESC-{random_part}'


def generate_auth_code():
    """Generate a 6-digit authorization code."""
    return str(random.randint(100000, 999999))


def log_activity(transaction_id, action, details=''):
    """Record an activity in the log."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO activity_logs (transaction_id, action, details, created_at)
        VALUES (?, ?, ?, ?)
    ''', (transaction_id, action, details, datetime.now().isoformat()))
    conn.commit()
    conn.close()


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple endpoint to verify server is running."""
    return jsonify({'status': 'ok', 'message': 'SecureEscrow API is running'})


@app.route('/api/transactions/create', methods=['POST'])
def create_transaction():
    """Create a new escrow transaction."""
    data = request.json
    
    # Validate required fields
    required_fields = ['itemName', 'amount', 'buyerPhone', 'sellerPhone']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Generate IDs
    transaction_id = generate_transaction_id()
    auth_code = generate_auth_code()
    
    # Save to database
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO transactions (
            id, auth_code, item_name, item_details, amount,
            buyer_phone, seller_phone, transaction_type, delivery_deadline,
            status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        transaction_id,
        auth_code,
        data.get('itemName'),
        data.get('itemDetails', ''),
        data.get('amount'),
        data.get('buyerPhone'),
        data.get('sellerPhone'),
        data.get('transactionType', ''),
        data.get('deliveryDeadline', ''),
        'FUNDS_SECURED',
        datetime.now().isoformat()
    ))
    
    conn.commit()
    conn.close()
    
    # Log activity
    log_activity(transaction_id, 'CREATED', f"Transaction created by buyer {data.get('buyerPhone')}")
    
    return jsonify({
        'success': True,
        'transactionId': transaction_id,
        'authCode': auth_code,
        'message': 'Transaction created successfully'
    }), 201


@app.route('/api/transactions/<transaction_id>', methods=['GET'])
def get_transaction(transaction_id):
    """Get a single transaction by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    transaction['amount'] = float(transaction['amount'])
    
    return jsonify(transaction)


@app.route('/api/transactions/track/<phone>', methods=['GET'])
def track_by_phone(phone):
    """Find transactions by buyer or seller phone number."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM transactions 
        WHERE buyer_phone = ? OR seller_phone = ?
        ORDER BY created_at DESC
        LIMIT 10
    ''', (phone, phone))
    
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        return jsonify({'error': 'No transactions found'}), 404
    
    transactions = []
    for row in rows:
        t = dict(row)
        t['amount'] = float(t['amount'])
        transactions.append(t)
    
    return jsonify({'transactions': transactions})


@app.route('/api/transactions/<transaction_id>/status', methods=['PUT'])
def update_status(transaction_id):
    """Update transaction status (shipped, delivered, disputed)."""
    data = request.json
    new_status = data.get('status')
    phone = data.get('phone')  # Who is making the update
    
    if not new_status:
        return jsonify({'error': 'Status is required'}), 400
    
    valid_statuses = ['AWAITING_DELIVERY', 'DELIVERED', 'DISPUTED']
    if new_status not in valid_statuses:
        return jsonify({'error': 'Invalid status'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get transaction to verify permissions
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    
    # Verify permissions
    if new_status == 'AWAITING_DELIVERY':
        if phone != transaction['seller_phone']:
            conn.close()
            return jsonify({'error': 'Only seller can mark as shipped'}), 403
        cursor.execute('''
            UPDATE transactions 
            SET status = ?, shipped_at = ?
            WHERE id = ?
        ''', (new_status, datetime.now().isoformat(), transaction_id))
        log_activity(transaction_id, 'SHIPPED', f"Seller {phone} marked as shipped")
        
    elif new_status == 'DELIVERED':
        if phone != transaction['buyer_phone']:
            conn.close()
            return jsonify({'error': 'Only buyer can confirm delivery'}), 403
        cursor.execute('''
            UPDATE transactions 
            SET status = ?, delivered_at = ?
            WHERE id = ?
        ''', (new_status, datetime.now().isoformat(), transaction_id))
        log_activity(transaction_id, 'DELIVERED', f"Buyer {phone} confirmed delivery")
        
    elif new_status == 'DISPUTED':
        if phone not in [transaction['buyer_phone'], transaction['seller_phone']]:
            conn.close()
            return jsonify({'error': 'Unauthorized'}), 403
        cursor.execute('''
            UPDATE transactions 
            SET status = ?, disputed_at = ?
            WHERE id = ?
        ''', (new_status, datetime.now().isoformat(), transaction_id))
        log_activity(transaction_id, 'DISPUTED', f"Dispute raised by {phone}")
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'status': new_status})


@app.route('/api/transactions/<transaction_id>/release', methods=['POST'])
def release_funds(transaction_id):
    """Release funds to seller (requires auth code)."""
    data = request.json
    auth_code = data.get('authCode')
    phone = data.get('phone')
    
    if not auth_code:
        return jsonify({'error': 'Authorization code is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    
    # Verify buyer
    if phone != transaction['buyer_phone']:
        conn.close()
        return jsonify({'error': 'Only buyer can release funds'}), 403
    
    # Verify auth code
    if auth_code != transaction['auth_code']:
        conn.close()
        log_activity(transaction_id, 'RELEASE_FAILED', f"Invalid auth code attempt by {phone}")
        return jsonify({'error': 'Invalid authorization code'}), 403
    
    # Verify status allows release
    if transaction['status'] not in ['FUNDS_SECURED', 'AWAITING_DELIVERY', 'DELIVERED']:
        conn.close()
        return jsonify({'error': f"Cannot release funds from status: {transaction['status']}"}), 400
    
    # Update status
    cursor.execute('''
        UPDATE transactions 
        SET status = ?, released_at = ?
        WHERE id = ?
    ''', ('FUNDS_RELEASED', datetime.now().isoformat(), transaction_id))
    
    conn.commit()
    conn.close()
    
    log_activity(transaction_id, 'RELEASED', f"Funds released by buyer {phone}")
    
    return jsonify({
        'success': True,
        'message': 'Funds released to seller successfully',
        'amount': transaction['amount']
    })


@app.route('/api/transactions/<transaction_id>/activities', methods=['GET'])
def get_activities(transaction_id):
    """Get activity log for a transaction."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM activity_logs 
        WHERE transaction_id = ?
        ORDER BY created_at DESC
    ''', (transaction_id,))
    
    rows = cursor.fetchall()
    conn.close()
    
    activities = [dict(row) for row in rows]
    
    return jsonify({'activities': activities})


# ============================================================================
# START SERVER
# ============================================================================

if __name__ == '__main__':
    init_database()
    print("\n" + "=" * 50)
    print("SecureEscrow Kenya Backend Server")
    print("=" * 50)
    print("\nServer running at: http://127.0.0.1:5000")
    print("Press Ctrl+C to stop\n")
    app.run(debug=True, host='127.0.0.1', port=5000)