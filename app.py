





"""
SecureEscrow Kenya - Backend Server
Magic Link Authorization System with OTP Verification
Run with: python app.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import hashlib
import secrets
import random
import string
from datetime import datetime, timedelta
import os
import re
import time
import requests

app = Flask(__name__)
CORS(app)

DATABASE = 'escrow.db'
TOKEN_EXPIRY_DAYS = 7
OTP_EXPIRY_MINUTES = 5
RELEASE_OTP_THRESHOLD = 10000

AFRICASTALKING_USERNAME = 'sandbox'
AFRICASTALKING_API_KEY = 'your_api_key_here'
AFRICASTALKING_SENDER_ID = 'SecureEscrow'
AFRICASTALKING_SMS_URL = 'https://api.africastalking.com/version1/messaging'


def init_database():
    """Create database tables if they don't exist."""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            magic_token_hash TEXT,
            seller_token_hash TEXT,
            token_expires_at TEXT,
            token_used INTEGER DEFAULT 0,
            item_name TEXT NOT NULL,
            item_details TEXT,
            amount REAL NOT NULL,
            buyer_phone TEXT NOT NULL,
            seller_phone TEXT NOT NULL,
            transaction_type TEXT,
            delivery_deadline TEXT,
            payout_type TEXT DEFAULT 'MPESA',
            payout_number TEXT,
            payout_account TEXT,
            otp_hash TEXT,
            otp_expires_at TEXT,
            otp_attempts INTEGER DEFAULT 0,
            payment_verified INTEGER DEFAULT 0,
            status TEXT DEFAULT 'FUNDS_SECURED',
            created_at TEXT NOT NULL,
            shipped_at TEXT,
            delivered_at TEXT,
            released_at TEXT,
            disputed_at TEXT,
            token_resend_count INTEGER DEFAULT 0,
            last_resend_at TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor_phone TEXT,
            details TEXT,
            created_at TEXT NOT NULL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sms_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT,
            recipient_phone TEXT NOT NULL,
            message_type TEXT NOT NULL,
            message_content TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Database initialized.")


def get_db_connection():
    conn = sqlite3.connect(DATABASE, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def generate_transaction_id():
    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    random_part = ''.join(random.choices(chars, k=6))
    return f'ESC-{random_part}'


def generate_token():
    return secrets.token_urlsafe(24)[:32]


def generate_otp():
    return str(random.randint(100000, 999999))


def hash_value(value):
    return hashlib.sha256(value.encode()).hexdigest()


def validate_kenyan_phone(phone):
    clean_phone = re.sub(r'\s+', '', phone)
    pattern = r'^(0|\+254)[71]\d{8}$'
    return bool(re.match(pattern, clean_phone))


def normalize_phone(phone):
    clean_phone = re.sub(r'\s+', '', phone)
    if clean_phone.startswith('0'):
        return '254' + clean_phone[1:]
    elif clean_phone.startswith('+254'):
        return clean_phone[1:]
    return clean_phone


def log_activity(transaction_id, action, actor_phone=None, details=''):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO activity_logs (transaction_id, action, actor_phone, details, created_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (transaction_id, action, actor_phone, details, datetime.now().isoformat()))
            conn.commit()
            conn.close()
            return
        except sqlite3.OperationalError:
            if attempt < max_retries - 1:
                time.sleep(0.5)


def log_sms(transaction_id, recipient_phone, message_type, message_content, status):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO sms_logs (transaction_id, recipient_phone, message_type, message_content, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (transaction_id, recipient_phone, message_type, message_content, status, datetime.now().isoformat()))
            conn.commit()
            conn.close()
            return
        except sqlite3.OperationalError:
            if attempt < max_retries - 1:
                time.sleep(0.5)


def send_real_sms(recipient_phone, message, transaction_id=None, message_type='general'):
    """Send SMS via Africa's Talking API."""
    try:
        response = requests.post(
            AFRICASTALKING_SMS_URL,
            headers={
                'apiKey': AFRICASTALKING_API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            data={
                'username': AFRICASTALKING_USERNAME,
                'to': '+' + recipient_phone,
                'message': message,
                'from': AFRICASTALKING_SENDER_ID
            },
            timeout=10
        )
        success = response.status_code in [200, 201]
        status = 'SENT' if success else 'FAILED'
        log_sms(transaction_id, recipient_phone, message_type, message, status)
        
        if success:
            print(f"SMS sent to {recipient_phone}")
        else:
            print(f"SMS failed: {response.text}")
        
        return success
    except Exception as e:
        print(f"SMS error: {str(e)}")
        log_sms(transaction_id, recipient_phone, message_type, message, f'ERROR: {str(e)}')
        return False


def send_simulated_sms(recipient_phone, message, transaction_id=None, message_type='general'):
    """Fallback SMS simulation when API is not configured."""
    print(f"\n--- SMS ---")
    print(f"To: {recipient_phone}")
    print(f"Type: {message_type}")
    print(f"Message:\n{message}")
    print(f"--- End SMS ---\n")
    log_sms(transaction_id, recipient_phone, message_type, message, 'SIMULATED')
    return True


def send_sms(recipient_phone, message, transaction_id=None, message_type='general'):
    """Send SMS - tries real API first, falls back to simulation."""
    if AFRICASTALKING_API_KEY != 'your_api_key_here':
        return send_real_sms(recipient_phone, message, transaction_id, message_type)
    else:
        return send_simulated_sms(recipient_phone, message, transaction_id, message_type)


def send_otp_sms(phone_number, otp_code, transaction_id):
    message = f"SecureEscrow Kenya: Your verification code is {otp_code}. Valid for {OTP_EXPIRY_MINUTES} minutes. Do not share this code."
    return send_sms(phone_number, message, transaction_id, 'otp')


def send_buyer_magic_link_sms(buyer_phone, transaction_id, magic_token, item_name, amount):
    base_url = "http://127.0.0.1:5500/track.html"
    magic_link = f"{base_url}?id={transaction_id}&token={magic_token}"
    
    message = f"""SecureEscrow Kenya
Transaction: {transaction_id}
Item: {item_name}
Amount: KES {amount:,.0f}

Release funds: {magic_link}

Keep this link private. Do not share.
Expires in {TOKEN_EXPIRY_DAYS} days."""
    
    return send_sms(buyer_phone, message, transaction_id, 'buyer_magic_link')


def send_seller_tracking_sms(seller_phone, transaction_id, seller_token, buyer_phone, item_name, amount):
    base_url = "http://127.0.0.1:5500/track.html"
    tracking_link = f"{base_url}?id={transaction_id}&token={seller_token}"
    
    message = f"""SecureEscrow Kenya
Transaction: {transaction_id}
Buyer: {buyer_phone}
Item: {item_name}
Amount: KES {amount:,.0f}

Status: Funds Secured - Awaiting Delivery

Track: {tracking_link}

Prepare item for delivery."""
    
    return send_sms(seller_phone, message, transaction_id, 'seller_tracking')


def send_seller_release_notification(seller_phone, transaction_id, seller_token, buyer_phone, item_name, amount, payout_type='MPESA'):
    base_url = "http://127.0.0.1:5500/track.html"
    tracking_link = f"{base_url}?id={transaction_id}&token={seller_token}"
    
    payout_text = "your M-PESA account"
    if payout_type == 'TILL':
        payout_text = "your Till number"
    elif payout_type == 'PAYBILL':
        payout_text = "your Paybill account"
    
    message = f"""SecureEscrow Kenya
Transaction: {transaction_id}
Buyer: {buyer_phone}
Item: {item_name}
Amount: KES {amount:,.0f}

Status: Funds Released - Payment Complete

Track: {tracking_link}

Funds sent to {payout_text}."""
    
    return send_sms(seller_phone, message, transaction_id, 'seller_release_notification')


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'SecureEscrow API is running'})


@app.route('/api/transactions/create', methods=['POST'])
def create_transaction():
    data = request.json
    
    required_fields = ['itemName', 'amount', 'buyerPhone', 'sellerPhone']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    amount = float(data.get('amount', 0))
    if amount < 100:
        return jsonify({'error': 'Amount must be at least KES 100'}), 400
    
    buyer_phone = data.get('buyerPhone', '')
    seller_phone = data.get('sellerPhone', '')
    
    if not validate_kenyan_phone(buyer_phone):
        return jsonify({'error': 'Invalid buyer phone number'}), 400
    
    if not validate_kenyan_phone(seller_phone):
        return jsonify({'error': 'Invalid seller phone number'}), 400
    
    if normalize_phone(buyer_phone) == normalize_phone(seller_phone):
        return jsonify({'error': 'Buyer and seller phone numbers must be different'}), 400
    
    transaction_id = generate_transaction_id()
    magic_token = generate_token()
    seller_token = generate_token()
    magic_token_hash = hash_value(magic_token)
    seller_token_hash = hash_value(seller_token)
    token_expires_at = (datetime.now() + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()
    
    payout_type = data.get('payoutType', 'MPESA')
    payout_number = data.get('payoutNumber', '')
    payout_account = data.get('payoutAccount', '')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO transactions (
            id, magic_token_hash, seller_token_hash, token_expires_at, item_name, item_details, amount,
            buyer_phone, seller_phone, transaction_type, delivery_deadline, payout_type, payout_number, payout_account,
            status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        transaction_id, magic_token_hash, seller_token_hash, token_expires_at,
        data.get('itemName', '').strip(), data.get('itemDetails', ''), amount,
        normalize_phone(buyer_phone), normalize_phone(seller_phone),
        data.get('transactionType', ''), data.get('deliveryDeadline', ''),
        payout_type, payout_number, payout_account,
        'FUNDS_SECURED', datetime.now().isoformat()
    ))
    
    conn.commit()
    conn.close()
    
    log_activity(transaction_id, 'CREATED', normalize_phone(buyer_phone), f"Transaction created. Amount: {amount}")
    
    # Send SMS notifications
    send_buyer_magic_link_sms(normalize_phone(buyer_phone), transaction_id, magic_token, data.get('itemName', ''), amount)
    send_seller_tracking_sms(normalize_phone(seller_phone), transaction_id, seller_token, normalize_phone(buyer_phone), data.get('itemName', ''), amount)
    
    return jsonify({
        'success': True,
        'transactionId': transaction_id,
        'message': 'Transaction created. Check your phone for the magic link.'
    }), 201


@app.route('/api/transactions/<transaction_id>/request-otp', methods=['POST'])
def request_otp(transaction_id):
    """Generate and send OTP to buyer for payment verification."""
    data = request.json
    phone = data.get('phone', '')
    
    if not phone:
        return jsonify({'error': 'Phone number is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    
    if normalize_phone(phone) != transaction['buyer_phone']:
        conn.close()
        return jsonify({'error': 'Phone does not match buyer'}), 403
    
    if transaction['status'] != 'FUNDS_SECURED':
        conn.close()
        return jsonify({'error': 'Transaction is not in the correct state'}), 400
    
    # Rate limiting for resend
    if transaction['otp_expires_at']:
        otp_expires = datetime.fromisoformat(transaction['otp_expires_at'])
        resend_available = otp_expires - timedelta(minutes=OTP_EXPIRY_MINUTES) + timedelta(minutes=2)
        if datetime.now() < resend_available:
            conn.close()
            return jsonify({'error': 'Please wait before requesting a new code'}), 429
    
    otp_code = generate_otp()
    otp_hash = hash_value(otp_code)
    otp_expires_at = (datetime.now() + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat()
    
    cursor.execute('''
        UPDATE transactions 
        SET otp_hash = ?, otp_expires_at = ?, otp_attempts = 0
        WHERE id = ?
    ''', (otp_hash, otp_expires_at, transaction_id))
    
    conn.commit()
    conn.close()
    
    send_otp_sms(transaction['buyer_phone'], otp_code, transaction_id)
    log_activity(transaction_id, 'OTP_SENT', transaction['buyer_phone'], 'OTP sent for payment verification')
    
    return jsonify({'success': True, 'message': 'Verification code sent to your phone'})


@app.route('/api/transactions/<transaction_id>/verify-otp', methods=['POST'])
def verify_otp(transaction_id):
    """Verify OTP and mark payment as verified."""
    data = request.json
    phone = data.get('phone', '')
    otp_code = data.get('otp', '')
    
    if not phone or not otp_code:
        return jsonify({'error': 'Phone and OTP are required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    
    if normalize_phone(phone) != transaction['buyer_phone']:
        conn.close()
        return jsonify({'error': 'Phone does not match buyer'}), 403
    
    if not transaction['otp_hash']:
        conn.close()
        return jsonify({'error': 'No OTP was requested'}), 400
    
    # Check expiry
    otp_expires_at = datetime.fromisoformat(transaction['otp_expires_at'])
    if datetime.now() > otp_expires_at:
        conn.close()
        return jsonify({'error': 'Code has expired. Request a new one.'}), 403
    
    # Check attempts
    if transaction['otp_attempts'] >= 3:
        conn.close()
        return jsonify({'error': 'Too many attempts. Request a new code.'}), 429
    
    # Verify OTP
    otp_hash = hash_value(otp_code)
    if otp_hash != transaction['otp_hash']:
        cursor.execute('UPDATE transactions SET otp_attempts = otp_attempts + 1 WHERE id = ?', (transaction_id,))
        conn.commit()
        conn.close()
        attempts_left = 3 - (transaction['otp_attempts'] + 1)
        return jsonify({'error': f'Invalid code. {attempts_left} attempts remaining.'}), 403
    
    # Mark as verified
    cursor.execute('UPDATE transactions SET payment_verified = 1, otp_hash = NULL, otp_expires_at = NULL WHERE id = ?', (transaction_id,))
    conn.commit()
    conn.close()
    
    log_activity(transaction_id, 'OTP_VERIFIED', transaction['buyer_phone'], 'Payment verified via OTP')
    
    return jsonify({'success': True, 'message': 'Phone verified successfully'})


@app.route('/api/transactions/<transaction_id>/request-release-otp', methods=['POST'])
def request_release_otp(transaction_id):
    """Generate and send OTP for releasing funds above threshold."""
    data = request.json
    phone = data.get('phone', '')
    token = data.get('token', '')
    
    if not phone:
        return jsonify({'error': 'Phone number is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    
    if normalize_phone(phone) != transaction['buyer_phone']:
        conn.close()
        return jsonify({'error': 'Phone does not match buyer'}), 403
    
    if token:
        token_hash_check = hash_value(token)
        if token_hash_check != transaction['magic_token_hash']:
            conn.close()
            return jsonify({'error': 'Invalid token'}), 403
    
    if transaction['amount'] <= RELEASE_OTP_THRESHOLD:
        conn.close()
        return jsonify({'error': 'OTP not required for this amount'}), 400
    
    if transaction['status'] not in ['FUNDS_SECURED', 'AWAITING_DELIVERY', 'DELIVERED']:
        conn.close()
        return jsonify({'error': 'Cannot release from current status'}), 400
    
    # Rate limiting
    if transaction['otp_expires_at']:
        otp_expires = datetime.fromisoformat(transaction['otp_expires_at'])
        resend_available = otp_expires - timedelta(minutes=OTP_EXPIRY_MINUTES) + timedelta(minutes=2)
        if datetime.now() < resend_available:
            conn.close()
            return jsonify({'error': 'Please wait before requesting a new code'}), 429
    
    otp_code = generate_otp()
    otp_hash = hash_value(otp_code)
    otp_expires_at = (datetime.now() + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat()
    
    cursor.execute('''
        UPDATE transactions 
        SET otp_hash = ?, otp_expires_at = ?, otp_attempts = 0
        WHERE id = ?
    ''', (otp_hash, otp_expires_at, transaction_id))
    
    conn.commit()
    conn.close()
    
    send_otp_sms(transaction['buyer_phone'], otp_code, transaction_id)
    log_activity(transaction_id, 'RELEASE_OTP_SENT', transaction['buyer_phone'], 'OTP sent for fund release')
    
    return jsonify({'success': True, 'message': 'Verification code sent to your phone'})


@app.route('/api/transactions/<transaction_id>', methods=['GET'])
def get_transaction(transaction_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    transaction['amount'] = float(transaction['amount'])
    transaction.pop('magic_token_hash', None)
    transaction.pop('seller_token_hash', None)
    transaction.pop('token_expires_at', None)
    transaction.pop('otp_hash', None)
    
    return jsonify(transaction)


@app.route('/api/transactions/<transaction_id>/validate', methods=['POST'])
def validate_token(transaction_id):
    data = request.json
    token = data.get('token', '')
    
    if not token:
        return jsonify({'error': 'Token is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    token_hash = hash_value(token)
    
    is_buyer = (token_hash == transaction['magic_token_hash'])
    is_seller = (token_hash == transaction['seller_token_hash'])
    
    if not is_buyer and not is_seller:
        conn.close()
        log_activity(transaction_id, 'TOKEN_VALIDATION_FAILED', None, 'Invalid token')
        return jsonify({'error': 'Invalid token'}), 403
    
    token_expires_at = datetime.fromisoformat(transaction['token_expires_at'])
    if datetime.now() > token_expires_at:
        conn.close()
        return jsonify({'error': 'Token has expired'}), 403
    
    conn.close()
    
    role = 'buyer' if is_buyer else 'seller'
    log_activity(transaction_id, 'TOKEN_VALIDATED', transaction[role + '_phone'], f'{role.capitalize()} validated')
    
    return jsonify({
        'success': True,
        'role': role,
        'isBuyer': is_buyer,
        'isSeller': is_seller,
        'transaction': {
            'id': transaction['id'],
            'item_name': transaction['item_name'],
            'amount': float(transaction['amount']),
            'buyer_phone': transaction['buyer_phone'],
            'seller_phone': transaction['seller_phone'],
            'status': transaction['status'],
            'created_at': transaction['created_at'],
            'payout_type': transaction['payout_type'],
            'payout_number': transaction['payout_number'],
            'payout_account': transaction['payout_account'],
            'payment_verified': transaction['payment_verified']
        }
    })


@app.route('/api/transactions/<transaction_id>/release', methods=['POST'])
def release_funds(transaction_id):
    data = request.json
    token = data.get('token', '')
    otp_code = data.get('otp', '')
    
    if not token:
        return jsonify({'error': 'Authorization token is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    token_hash = hash_value(token)
    
    if token_hash != transaction['magic_token_hash']:
        conn.close()
        log_activity(transaction_id, 'RELEASE_FAILED', None, 'Invalid token')
        return jsonify({'error': 'Invalid authorization token'}), 403
    
    token_expires_at = datetime.fromisoformat(transaction['token_expires_at'])
    if datetime.now() > token_expires_at:
        conn.close()
        return jsonify({'error': 'Token has expired'}), 403
    
    allowed_statuses = ['FUNDS_SECURED', 'AWAITING_DELIVERY', 'DELIVERED']
    if transaction['status'] not in allowed_statuses:
        conn.close()
        return jsonify({'error': f'Cannot release funds from status: {transaction["status"]}'}), 400
    
    # OTP check for amounts above threshold
    if transaction['amount'] > RELEASE_OTP_THRESHOLD:
        if not otp_code:
            conn.close()
            return jsonify({'requireOtp': True, 'message': 'OTP required for this amount'}), 403
        
        if not transaction['otp_hash']:
            conn.close()
            return jsonify({'error': 'No OTP was requested'}), 400
        
        otp_expires_at = datetime.fromisoformat(transaction['otp_expires_at'])
        if datetime.now() > otp_expires_at:
            conn.close()
            return jsonify({'error': 'OTP has expired. Request a new one.'}), 403
        
        if transaction['otp_attempts'] >= 3:
            conn.close()
            return jsonify({'error': 'Too many attempts. Request a new code.'}), 429
        
        otp_hash = hash_value(otp_code)
        if otp_hash != transaction['otp_hash']:
            cursor.execute('UPDATE transactions SET otp_attempts = otp_attempts + 1 WHERE id = ?', (transaction_id,))
            conn.commit()
            conn.close()
            return jsonify({'error': 'Invalid OTP code'}), 403
    
    cursor.execute('''
        UPDATE transactions 
        SET status = ?, released_at = ?, token_used = 1, otp_hash = NULL, otp_expires_at = NULL
        WHERE id = ?
    ''', ('FUNDS_RELEASED', datetime.now().isoformat(), transaction_id))
    
    conn.commit()
    conn.close()
    
    log_activity(transaction_id, 'FUNDS_RELEASED', transaction['buyer_phone'], f"Funds released. Amount: {transaction['amount']}")
    
    send_seller_release_notification(
        transaction['seller_phone'], transaction_id, generate_token(),
        transaction['buyer_phone'], transaction['item_name'],
        float(transaction['amount']), transaction['payout_type']
    )
    
    return jsonify({
        'success': True,
        'message': 'Funds released to seller successfully',
        'amount': float(transaction['amount'])
    })


@app.route('/api/transactions/<transaction_id>/payout', methods=['PUT'])
def update_payout(transaction_id):
    data = request.json
    token = data.get('token', '')
    payout_type = data.get('payoutType', 'MPESA')
    payout_number = data.get('payoutNumber', '')
    payout_account = data.get('payoutAccount', '')
    
    if not token:
        return jsonify({'error': 'Authorization token is required'}), 400
    
    if payout_type not in ['MPESA', 'TILL', 'PAYBILL']:
        return jsonify({'error': 'Invalid payout type'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    token_hash = hash_value(token)
    
    if token_hash != transaction['seller_token_hash']:
        conn.close()
        return jsonify({'error': 'Only seller can update payout method'}), 403
    
    cursor.execute('''
        UPDATE transactions 
        SET payout_type = ?, payout_number = ?, payout_account = ?
        WHERE id = ?
    ''', (payout_type, payout_number, payout_account, transaction_id))
    
    conn.commit()
    conn.close()
    
    log_activity(transaction_id, 'PAYOUT_UPDATED', transaction['seller_phone'], f"Payout updated to {payout_type}")
    
    return jsonify({'success': True, 'message': 'Payout method updated', 'payoutType': payout_type})


@app.route('/api/transactions/<transaction_id>/payout', methods=['GET'])
def get_payout(transaction_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT payout_type, payout_number, payout_account FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'error': 'Transaction not found'}), 404
    
    return jsonify({
        'payoutType': row['payout_type'] or 'MPESA',
        'payoutNumber': row['payout_number'] or '',
        'payoutAccount': row['payout_account'] or ''
    })


@app.route('/api/transactions/<transaction_id>/resend', methods=['POST'])
def resend_magic_link(transaction_id):
    data = request.json
    phone = data.get('phone', '')
    
    if not phone:
        return jsonify({'error': 'Phone number is required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    
    if normalize_phone(phone) != transaction['buyer_phone']:
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403
    
    if transaction['last_resend_at']:
        last_resend = datetime.fromisoformat(transaction['last_resend_at'])
        if datetime.now() - last_resend < timedelta(hours=1):
            conn.close()
            return jsonify({'error': 'Please wait 1 hour before requesting another link'}), 429
    
    new_token = generate_token()
    new_token_hash = hash_value(new_token)
    new_expires_at = (datetime.now() + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()
    
    cursor.execute('''
        UPDATE transactions 
        SET magic_token_hash = ?, token_expires_at = ?, 
            token_resend_count = token_resend_count + 1, last_resend_at = ?
        WHERE id = ?
    ''', (new_token_hash, new_expires_at, datetime.now().isoformat(), transaction_id))
    
    conn.commit()
    conn.close()
    
    log_activity(transaction_id, 'TOKEN_RESENT', transaction['buyer_phone'], 'New magic link sent')
    send_buyer_magic_link_sms(transaction['buyer_phone'], transaction_id, new_token, transaction['item_name'], float(transaction['amount']))
    
    return jsonify({'success': True, 'message': 'New magic link sent to your phone'})


@app.route('/api/transactions/<transaction_id>/status', methods=['PUT'])
def update_status(transaction_id):
    data = request.json
    new_status = data.get('status')
    phone = data.get('phone')
    token = data.get('token', '')
    
    if not new_status:
        return jsonify({'error': 'Status is required'}), 400
    
    valid_statuses = ['AWAITING_DELIVERY', 'DELIVERED', 'DISPUTED']
    if new_status not in valid_statuses:
        return jsonify({'error': 'Invalid status'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404
    
    transaction = dict(row)
    
    if token:
        token_hash = hash_value(token)
        if token_hash == transaction['magic_token_hash']:
            verified_phone = transaction['buyer_phone']
        elif token_hash == transaction['seller_token_hash']:
            verified_phone = transaction['seller_phone']
        else:
            conn.close()
            return jsonify({'error': 'Invalid token'}), 403
    elif phone:
        verified_phone = normalize_phone(phone)
        if verified_phone not in [transaction['buyer_phone'], transaction['seller_phone']]:
            conn.close()
            return jsonify({'error': 'Phone number not authorized'}), 403
    else:
        conn.close()
        return jsonify({'error': 'Phone or token required'}), 400
    
    if new_status == 'AWAITING_DELIVERY':
        if verified_phone != transaction['seller_phone']:
            conn.close()
            return jsonify({'error': 'Only seller can mark as shipped'}), 403
        if transaction['status'] != 'FUNDS_SECURED':
            conn.close()
            return jsonify({'error': 'Cannot mark as shipped from current status'}), 400
        cursor.execute('UPDATE transactions SET status = ?, shipped_at = ? WHERE id = ?',
                      (new_status, datetime.now().isoformat(), transaction_id))
        log_activity(transaction_id, 'SHIPPED', verified_phone, 'Seller marked as shipped')
        
    elif new_status == 'DELIVERED':
        if verified_phone != transaction['buyer_phone']:
            conn.close()
            return jsonify({'error': 'Only buyer can confirm delivery'}), 403
        if transaction['status'] != 'AWAITING_DELIVERY':
            conn.close()
            return jsonify({'error': 'Cannot confirm delivery from current status'}), 400
        cursor.execute('UPDATE transactions SET status = ?, delivered_at = ? WHERE id = ?',
                      (new_status, datetime.now().isoformat(), transaction_id))
        log_activity(transaction_id, 'DELIVERED', verified_phone, 'Buyer confirmed delivery')
        
    elif new_status == 'DISPUTED':
        if verified_phone not in [transaction['buyer_phone'], transaction['seller_phone']]:
            conn.close()
            return jsonify({'error': 'Unauthorized'}), 403
        if transaction['status'] in ['FUNDS_RELEASED', 'DISPUTED']:
            conn.close()
            return jsonify({'error': 'Cannot dispute from current status'}), 400
        cursor.execute('UPDATE transactions SET status = ?, disputed_at = ? WHERE id = ?',
                      (new_status, datetime.now().isoformat(), transaction_id))
        log_activity(transaction_id, 'DISPUTED', verified_phone, 'Dispute raised')
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'status': new_status})


@app.route('/api/transactions/track/<phone>', methods=['GET'])
def track_by_phone(phone):
    normalized_phone = normalize_phone(phone)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM transactions 
        WHERE buyer_phone = ? OR seller_phone = ?
        ORDER BY created_at DESC LIMIT 10
    ''', (normalized_phone, normalized_phone))
    
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        return jsonify({'error': 'No transactions found'}), 404
    
    transactions = []
    for row in rows:
        t = dict(row)
        t['amount'] = float(t['amount'])
        t.pop('magic_token_hash', None)
        t.pop('seller_token_hash', None)
        t.pop('token_expires_at', None)
        t.pop('otp_hash', None)
        transactions.append(t)
    
    return jsonify({'transactions': transactions})


# ============================================================================
# START SERVER
# ============================================================================

if __name__ == '__main__':
    init_database()
    print("\n" + "=" * 50)
    print("SecureEscrow Kenya Backend Server")
    print("OTP Verification System Active")
    print("=" * 50)
    print(f"\nToken expiry: {TOKEN_EXPIRY_DAYS} days")
    print(f"OTP expiry: {OTP_EXPIRY_MINUTES} minutes")
    print(f"Release OTP threshold: KES {RELEASE_OTP_THRESHOLD:,.0f}")
    print("\nServer running at: http://127.0.0.1:5000")
    print("Press Ctrl+C to stop\n")
    app.run(debug=True, host='127.0.0.1', port=5000)