








"""
SecureEscrow Kenya - Backend Server
Magic Link Authorization System with Payout Methods
Run with: python app.py

SECURITY HARDENING NOTES (read before deploying)
--------------------------------------------------
- CORS is now restricted to ALLOWED_ORIGINS (set via env var, comma separated).
- Rate limiting is applied via Flask-Limiter (see requirements.txt).
- Magic tokens are now single-use and enforced server-side (token_used).
- Transaction IDs use 8 random characters (was 6) for higher entropy.
- /api/transactions/track/<phone> masks phone numbers and strips
  sensitive fields (payout details, item details).
- /api/transactions/<id>/payout (GET) now requires the seller's token.
- All free-text inputs are length-limited and stripped of HTML tags.
- SMS logs store a redacted version of magic links (token removed).
- debug mode and host binding are controlled via environment variables.
- A request body size cap (MAX_CONTENT_LENGTH) is enforced.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import sqlite3
import hashlib
import secrets
import random
import string
from datetime import datetime, timedelta
import os
import base64
import re
import time
import requests

app = Flask(__name__)

# ============================================================================
# CORE CONFIG
# ============================================================================

DATABASE = 'escrow.db'
TOKEN_EXPIRY_DAYS = 7

# Cap request bodies at 32 KB - plenty for this API, blocks abuse uploads
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024

# ============================================================================
# CORS - restrict to known frontend origins only
# ============================================================================
#
# Set ALLOWED_ORIGINS in your .env / Render environment, comma separated:
#   ALLOWED_ORIGINS=https://securescrowkenya.com,https://www.securescrowkenya.com
#
# For local development the defaults below also allow the common
# Live Server / localhost ports.

_default_origins = (
    'https://securescrowkenya.com,'
    'https://www.securescrowkenya.com,'
    'http://127.0.0.1:5500,'
    'http://localhost:5500'
)
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv('ALLOWED_ORIGINS', _default_origins).split(',')
    if o.strip()
]

CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})

# ============================================================================
# RATE LIMITING
# ============================================================================
#
# Default storage is in-memory, which is fine for a single Render instance.
# For multi-instance deployments, set RATELIMIT_STORAGE_URI to a shared
# Redis URL.

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=['200 per hour'],
    storage_uri=os.getenv('RATELIMIT_STORAGE_URI', 'memory://')
)

# ============================================================================
# FRONTEND BASE URL (used to build magic links sent via SMS)
# ============================================================================
#
# IMPORTANT: set this to your live frontend URL in production, e.g.
#   FRONTEND_BASE_URL=https://securescrowkenya.com/track.html
#
# The previous hardcoded value (http://127.0.0.1:5500/track.html) only
# works on the developer's own machine - real users would receive a
# broken link.

FRONTEND_BASE_URL = os.getenv('FRONTEND_BASE_URL', 'http://127.0.0.1:5500/track.html')

# ============================================================================
# SMS CONFIGURATION — Africa's Talking  (loaded from .env)
# ============================================================================
AFRICASTALKING_ENV       = os.getenv('AFRICASTALKING_ENV', 'sandbox')
AFRICASTALKING_USERNAME  = os.getenv('AFRICASTALKING_USERNAME')
AFRICASTALKING_API_KEY   = os.getenv('AFRICASTALKING_API_KEY')
AFRICASTALKING_SENDER_ID = os.getenv('AFRICASTALKING_SENDER_ID', '')

AFRICASTALKING_SMS_URL = (
    'https://api.sandbox.africastalking.com/version1/messaging'
    if AFRICASTALKING_ENV == 'sandbox'
    else 'https://api.africastalking.com/version1/messaging'
)

# ============================================================================
# INPUT LIMITS
# ============================================================================

MAX_ITEM_NAME_LEN     = 120
MAX_ITEM_DETAILS_LEN  = 1000
MAX_PAYOUT_FIELD_LEN  = 40
MAX_DEADLINE_LEN      = 60
MAX_TXN_TYPE_LEN      = 40
MAX_AMOUNT            = 10_000_000  # KES 10,000,000 sanity cap

# ============================================================================
# PHONE IMPORT SERVICE — CONFIG
# ============================================================================
#
# The import shop always routes the escrow transaction to YOU as the seller.
# Buyers never see a "seller phone" field or any fee breakdown - they just
# pick a phone and pay the single listed price. Set these in your .env /
# Render environment before going live:
#
#   IMPORT_SELLER_PHONE=0712345678      <- your business M-PESA number
#   IMPORT_PAYOUT_TYPE=MPESA            <- MPESA | TILL | PAYBILL
#   IMPORT_PAYOUT_NUMBER=0712345678     <- Till/Paybill number if not MPESA
#   IMPORT_PAYOUT_ACCOUNT=              <- Paybill account ref, if used
#
# Until IMPORT_SELLER_PHONE is set, the order endpoint returns a friendly
# "not configured yet" error instead of creating broken transactions.

IMPORT_SELLER_PHONE   = os.getenv('IMPORT_SELLER_PHONE', '')
IMPORT_PAYOUT_TYPE    = os.getenv('IMPORT_PAYOUT_TYPE', 'MPESA')
IMPORT_PAYOUT_NUMBER  = os.getenv('IMPORT_PAYOUT_NUMBER', '')
IMPORT_PAYOUT_ACCOUNT = os.getenv('IMPORT_PAYOUT_ACCOUNT', '')

# ============================================================================
# PHONE IMPORT SERVICE — ADMIN CATALOG TOOL
# ============================================================================
#
# The catalog now lives in the database, editable from admin.html (a
# private, password-gated page - not linked anywhere in the site nav).
# Set these before using it:
#
#   IMPORT_ADMIN_KEY=choose-a-long-random-password
#   IMGBB_API_KEY=get-a-free-key-from-api.imgbb.com
#
# admin.html asks for IMPORT_ADMIN_KEY once and remembers it on that
# device. Photos taken in admin.html are uploaded to imgbb (free image
# hosting) automatically - nothing is ever stored on Render's disk,
# which is wiped on every redeploy anyway.

IMPORT_ADMIN_KEY = os.getenv('IMPORT_ADMIN_KEY', '')
IMGBB_API_KEY    = os.getenv('IMGBB_API_KEY', '')

MAX_SPEC_LEN     = 60
MAX_SPECS_COUNT  = 6


def require_admin_key():
    """Returns True if the request carries a valid admin key header."""
    if not IMPORT_ADMIN_KEY:
        return False
    supplied = request.headers.get('X-Admin-Key', '')
    return secrets.compare_digest(supplied, IMPORT_ADMIN_KEY)


# Seed products used ONLY the very first time the app runs (when the
# import_products table is empty). Edit/add/remove everything afterwards
# from admin.html instead of here.
_SEED_IMPORT_PRODUCTS = [
    {
        'id': 'iphone-12-64',
        'name': 'iPhone 12 - 64GB',
        'condition': 'Grade A (Excellent)',
        'specs': ['64GB storage', 'Factory unlocked', 'Battery health 85%+', 'Face ID working'],
        'price': 42000,
        'eta': '10-14 days',
        'image': '',
        'badge': '',
    },
    {
        'id': 'iphone-13-128',
        'name': 'iPhone 13 - 128GB',
        'condition': 'Grade A (Excellent)',
        'specs': ['128GB storage', 'Factory unlocked', 'Battery health 88%+', 'Face ID working'],
        'price': 58000,
        'eta': '10-14 days',
        'image': '',
        'badge': 'Popular',
    },
    {
        'id': 'samsung-s21-128',
        'name': 'Samsung Galaxy S21 - 128GB',
        'condition': 'Grade A (Excellent)',
        'specs': ['128GB storage', 'Factory unlocked', 'Battery 90%+', 'Fingerprint working'],
        'price': 39000,
        'eta': '10-14 days',
        'image': '',
        'badge': '',
    },
]


def get_import_product(product_id):
    """Look up an active catalog product by id. Returns None if not found."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM import_products WHERE id = ? AND active = 1', (product_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return _row_to_product(row)


def _row_to_product(row):
    import json
    d = dict(row)
    d['condition'] = d.pop('condition_label', '')
    try:
        d['specs'] = json.loads(d['specs']) if d['specs'] else []
    except (ValueError, TypeError):
        d['specs'] = []
    return d


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

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS import_products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            condition_label TEXT,
            specs TEXT,
            price REAL NOT NULL,
            eta TEXT,
            image TEXT,
            badge TEXT,
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')

    conn.commit()

    # Seed the catalog once, only if it's completely empty (first run).
    import json
    cursor.execute('SELECT COUNT(*) FROM import_products')
    if cursor.fetchone()[0] == 0:
        now = datetime.now().isoformat()
        for p in _SEED_IMPORT_PRODUCTS:
            cursor.execute('''
                INSERT INTO import_products
                    (id, name, condition_label, specs, price, eta, image, badge, active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ''', (
                p['id'], p['name'], p['condition'], json.dumps(p['specs']),
                p['price'], p['eta'], p['image'], p['badge'], now, now
            ))
        conn.commit()

    conn.close()
    print("Database initialized.")


def get_db_connection():
    conn = sqlite3.connect(DATABASE, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def generate_transaction_id():
    # 8 chars from a 32-character set => 32^8 (~1.1 trillion) combinations.
    # Previously 6 chars (~1 billion) - increased for better resistance
    # against ID enumeration/guessing attacks.
    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    random_part = ''.join(secrets.choice(chars) for _ in range(8))
    return f'ESC-{random_part}'


def generate_token():
    return secrets.token_urlsafe(24)[:32]


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


def mask_phone(phone):
    """Mask a phone number for display, e.g. 254712345678 -> 2547****678"""
    if not phone or len(phone) < 6:
        return '****'
    return phone[:4] + '****' + phone[-3:]


def sanitize_text(value, max_len):
    """Strip HTML tags/control characters and enforce a max length.

    This is defense-in-depth against stored XSS - the frontend should
    also escape output, but we never want raw markup persisted either.
    """
    if value is None:
        return ''
    value = str(value)
    # Remove anything that looks like an HTML tag
    value = re.sub(r'<[^>]*>', '', value)
    # Strip control characters (keep normal whitespace)
    value = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', value)
    return value.strip()[:max_len]


def redact_link_for_log(message):
    """Replace any ?id=...&token=... query string in a message with a
    redacted placeholder before it is written to sms_logs, so raw
    magic tokens are never persisted in plaintext logs."""
    return re.sub(
        r'(\?id=[^\s&]+&token=)[^\s]+',
        r'\1[REDACTED]',
        message
    )


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
    safe_content = redact_link_for_log(message_content)
    for attempt in range(max_retries):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO sms_logs (transaction_id, recipient_phone, message_type, message_content, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (transaction_id, recipient_phone, message_type, safe_content, status, datetime.now().isoformat()))
            conn.commit()
            conn.close()
            return
        except sqlite3.OperationalError:
            if attempt < max_retries - 1:
                time.sleep(0.5)


def send_real_sms(recipient_phone, message, transaction_id=None, message_type='general'):
    """Send SMS via Africa's Talking API."""
    try:
        post_data = {
            'username': AFRICASTALKING_USERNAME,
            'to':       '+' + recipient_phone,
            'message':  message,
        }
        if AFRICASTALKING_ENV == 'live' and AFRICASTALKING_SENDER_ID:
            post_data['from'] = AFRICASTALKING_SENDER_ID

        response = requests.post(
            AFRICASTALKING_SMS_URL,
            headers={
                'apiKey':       AFRICASTALKING_API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept':       'application/json'
            },
            data=post_data,
            timeout=10
        )

        success = response.status_code in [200, 201]
        status  = 'SENT' if success else 'FAILED'
        log_sms(transaction_id, recipient_phone, message_type, message, status)

        if success:
            print(f"SMS sent to {recipient_phone}")
        else:
            # Do NOT print credentials (username/env) - only non-sensitive
            # diagnostic info, to avoid leaking account details into logs.
            print(f"SMS failed (status {response.status_code}) for {message_type}")

        return success

    except Exception as e:
        print(f"SMS error: {type(e).__name__}")
        log_sms(transaction_id, recipient_phone, message_type, message, 'ERROR')
        return False


def send_simulated_sms(recipient_phone, message, transaction_id=None, message_type='general'):
    """Fallback SMS simulation — used when ENV is not sandbox/live or key missing."""
    print(f"\n--- SIMULATED SMS ---")
    print(f"To:      +{recipient_phone}")
    print(f"Type:    {message_type}")
    print(f"Message:\n{message}")
    print(f"--- End SMS ---\n")
    log_sms(transaction_id, recipient_phone, message_type, message, 'SIMULATED')
    return True


def send_sms(recipient_phone, message, transaction_id=None, message_type='general'):
    """Route SMS to real API or simulation based on AFRICASTALKING_ENV."""
    if AFRICASTALKING_ENV in ('sandbox', 'live'):
        return send_real_sms(recipient_phone, message, transaction_id, message_type)
    else:
        return send_simulated_sms(recipient_phone, message, transaction_id, message_type)


def send_buyer_magic_link_sms(buyer_phone, transaction_id, magic_token, item_name, amount):
    magic_link = f"{FRONTEND_BASE_URL}?id={transaction_id}&token={magic_token}"

    message = f"""SecureEscrow Kenya
Transaction: {transaction_id}
Item: {item_name}
Amount: KES {amount:,.0f}

Release funds: {magic_link}

Keep this link private. Do not share.
Expires in {TOKEN_EXPIRY_DAYS} days."""

    return send_sms(buyer_phone, message, transaction_id, 'buyer_magic_link')


def send_seller_tracking_sms(seller_phone, transaction_id, seller_token, buyer_phone, item_name, amount):
    tracking_link = f"{FRONTEND_BASE_URL}?id={transaction_id}&token={seller_token}"

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
    tracking_link = f"{FRONTEND_BASE_URL}?id={transaction_id}&token={seller_token}"

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
@limiter.limit('5 per hour')
def create_transaction():
    data = request.json or {}

    required_fields = ['itemName', 'amount', 'buyerPhone', 'sellerPhone']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400

    try:
        amount = float(data.get('amount', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid amount'}), 400

    if amount < 100:
        return jsonify({'error': 'Amount must be at least KES 100'}), 400

    if amount > MAX_AMOUNT:
        return jsonify({'error': f'Amount exceeds maximum allowed (KES {MAX_AMOUNT:,.0f})'}), 400

    buyer_phone  = data.get('buyerPhone', '')
    seller_phone = data.get('sellerPhone', '')

    if not validate_kenyan_phone(buyer_phone):
        return jsonify({'error': 'Invalid buyer phone number'}), 400

    if not validate_kenyan_phone(seller_phone):
        return jsonify({'error': 'Invalid seller phone number'}), 400

    if normalize_phone(buyer_phone) == normalize_phone(seller_phone):
        return jsonify({'error': 'Buyer and seller phone numbers must be different'}), 400

    payout_type = data.get('payoutType', 'MPESA')
    if payout_type not in ['MPESA', 'TILL', 'PAYBILL']:
        return jsonify({'error': 'Invalid payout type'}), 400

    item_name      = sanitize_text(data.get('itemName', ''), MAX_ITEM_NAME_LEN)
    item_details   = sanitize_text(data.get('itemDetails', ''), MAX_ITEM_DETAILS_LEN)
    transaction_type = sanitize_text(data.get('transactionType', ''), MAX_TXN_TYPE_LEN)
    delivery_deadline = sanitize_text(data.get('deliveryDeadline', ''), MAX_DEADLINE_LEN)
    payout_number  = sanitize_text(data.get('payoutNumber', ''), MAX_PAYOUT_FIELD_LEN)
    payout_account = sanitize_text(data.get('payoutAccount', ''), MAX_PAYOUT_FIELD_LEN)

    if not item_name:
        return jsonify({'error': 'Item name is required'}), 400

    transaction_id   = generate_transaction_id()
    magic_token      = generate_token()
    seller_token     = generate_token()
    magic_token_hash = hash_value(magic_token)
    seller_token_hash= hash_value(seller_token)
    token_expires_at = (datetime.now() + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()

    conn   = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO transactions (
            id, magic_token_hash, seller_token_hash, token_expires_at,
            item_name, item_details, amount, buyer_phone, seller_phone,
            transaction_type, delivery_deadline, payout_type, payout_number, payout_account,
            status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        transaction_id, magic_token_hash, seller_token_hash, token_expires_at,
        item_name, item_details, amount,
        normalize_phone(buyer_phone), normalize_phone(seller_phone),
        transaction_type, delivery_deadline,
        payout_type, payout_number, payout_account,
        'FUNDS_SECURED', datetime.now().isoformat()
    ))

    conn.commit()
    conn.close()

    log_activity(transaction_id, 'CREATED', normalize_phone(buyer_phone), f"Amount: {amount}")

    send_buyer_magic_link_sms(normalize_phone(buyer_phone), transaction_id, magic_token, item_name, amount)
    send_seller_tracking_sms(normalize_phone(seller_phone), transaction_id, seller_token, normalize_phone(buyer_phone), item_name, amount)

    return jsonify({
        'success':       True,
        'transactionId': transaction_id,
        'message':       'Transaction created. Check your phone for the magic link.'
    }), 201


@app.route('/api/transactions/<transaction_id>', methods=['GET'])
@limiter.limit('30 per hour')
def get_transaction(transaction_id):
    conn   = get_db_connection()
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
    transaction.pop('token_used', None)

    return jsonify(transaction)


@app.route('/api/transactions/<transaction_id>/validate', methods=['POST'])
@limiter.limit('20 per hour')
def validate_token(transaction_id):
    data  = request.json or {}
    token = data.get('token', '')

    if not token:
        return jsonify({'error': 'Token is required'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404

    transaction = dict(row)
    token_hash  = hash_value(token)

    is_buyer  = (token_hash == transaction['magic_token_hash'])
    is_seller = (token_hash == transaction['seller_token_hash'])

    if not is_buyer and not is_seller:
        conn.close()
        log_activity(transaction_id, 'TOKEN_VALIDATION_FAILED', None, 'Invalid token')
        return jsonify({'error': 'Invalid token'}), 403

    token_expires_at = datetime.fromisoformat(transaction['token_expires_at'])
    if datetime.now() > token_expires_at:
        conn.close()
        return jsonify({'error': 'Token has expired'}), 403

    # The buyer's magic token is single-use for *authorizing release*.
    # It remains valid for viewing/validation here even after the funds
    # have been released, so the buyer can still see the final status -
    # the /release endpoint itself is what enforces single-use.

    conn.close()

    role = 'buyer' if is_buyer else 'seller'
    log_activity(transaction_id, 'TOKEN_VALIDATED', transaction[role + '_phone'], f'{role.capitalize()} validated')

    return jsonify({
        'success':  True,
        'role':     role,
        'isBuyer':  is_buyer,
        'isSeller': is_seller,
        'transaction': {
            'id':            transaction['id'],
            'item_name':     transaction['item_name'],
            'amount':        float(transaction['amount']),
            'buyer_phone':   transaction['buyer_phone'],
            'seller_phone':  transaction['seller_phone'],
            'status':        transaction['status'],
            'created_at':    transaction['created_at'],
            'payout_type':   transaction['payout_type'],
            'payout_number': transaction['payout_number'],
            'payout_account':transaction['payout_account']
        }
    })


@app.route('/api/transactions/<transaction_id>/release', methods=['POST'])
@limiter.limit('10 per hour')
def release_funds(transaction_id):
    data  = request.json or {}
    token = data.get('token', '')

    if not token:
        return jsonify({'error': 'Authorization token is required'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404

    transaction = dict(row)
    token_hash  = hash_value(token)

    if token_hash != transaction['magic_token_hash']:
        conn.close()
        log_activity(transaction_id, 'RELEASE_FAILED', None, 'Invalid token')
        return jsonify({'error': 'Invalid authorization token'}), 403

    # Enforce single-use: once this magic token has been used for a
    # release, it can never authorize another one (replay protection).
    if transaction['token_used']:
        conn.close()
        log_activity(transaction_id, 'RELEASE_FAILED', transaction['buyer_phone'], 'Token already used')
        return jsonify({'error': 'This authorization link has already been used'}), 403

    token_expires_at = datetime.fromisoformat(transaction['token_expires_at'])
    if datetime.now() > token_expires_at:
        conn.close()
        return jsonify({'error': 'Token has expired'}), 403

    allowed_statuses = ['FUNDS_SECURED', 'AWAITING_DELIVERY', 'DELIVERED']
    if transaction['status'] not in allowed_statuses:
        conn.close()
        return jsonify({'error': f'Cannot release funds from status: {transaction["status"]}'}), 400

    cursor.execute('''
        UPDATE transactions
        SET status = ?, released_at = ?, token_used = 1
        WHERE id = ?
    ''', ('FUNDS_RELEASED', datetime.now().isoformat(), transaction_id))

    conn.commit()
    conn.close()

    log_activity(transaction_id, 'FUNDS_RELEASED', transaction['buyer_phone'], f"Amount: {transaction['amount']}")

    send_seller_release_notification(
        transaction['seller_phone'], transaction_id, generate_token(),
        transaction['buyer_phone'], transaction['item_name'],
        float(transaction['amount']), transaction['payout_type']
    )

    return jsonify({
        'success': True,
        'message': 'Funds released to seller successfully',
        'amount':  float(transaction['amount'])
    })


@app.route('/api/transactions/<transaction_id>/payout', methods=['PUT'])
@limiter.limit('20 per hour')
def update_payout(transaction_id):
    data           = request.json or {}
    token          = data.get('token', '')
    payout_type    = data.get('payoutType', 'MPESA')
    payout_number  = sanitize_text(data.get('payoutNumber', ''), MAX_PAYOUT_FIELD_LEN)
    payout_account = sanitize_text(data.get('payoutAccount', ''), MAX_PAYOUT_FIELD_LEN)

    if not token:
        return jsonify({'error': 'Authorization token is required'}), 400

    if payout_type not in ['MPESA', 'TILL', 'PAYBILL']:
        return jsonify({'error': 'Invalid payout type'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({'error': 'Transaction not found'}), 404

    transaction = dict(row)
    token_hash  = hash_value(token)

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

    log_activity(transaction_id, 'PAYOUT_UPDATED', transaction['seller_phone'], f"Payout: {payout_type}")

    return jsonify({'success': True, 'message': 'Payout method updated', 'payoutType': payout_type})


@app.route('/api/transactions/<transaction_id>/payout', methods=['GET'])
@limiter.limit('20 per hour')
def get_payout(transaction_id):
    # SECURITY: this endpoint used to be completely unauthenticated and
    # would return a seller's M-PESA/Till/Paybill details to anyone who
    # knew (or guessed) a transaction ID. It now requires the seller's
    # own token, passed as a query parameter: ?token=<sellerToken>
    token = request.args.get('token', '')

    if not token:
        return jsonify({'error': 'Authorization token is required'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT seller_token_hash, payout_type, payout_number, payout_account FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({'error': 'Transaction not found'}), 404

    if hash_value(token) != row['seller_token_hash']:
        return jsonify({'error': 'Invalid authorization token'}), 403

    return jsonify({
        'payoutType':    row['payout_type']    or 'MPESA',
        'payoutNumber':  row['payout_number']  or '',
        'payoutAccount': row['payout_account'] or ''
    })


@app.route('/api/transactions/<transaction_id>/resend', methods=['POST'])
@limiter.limit('5 per hour')
def resend_magic_link(transaction_id):
    data  = request.json or {}
    phone = data.get('phone', '')

    if not phone:
        return jsonify({'error': 'Phone number is required'}), 400

    conn   = get_db_connection()
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

    new_token      = generate_token()
    new_token_hash = hash_value(new_token)
    new_expires_at = (datetime.now() + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()

    cursor.execute('''
        UPDATE transactions
        SET magic_token_hash = ?, token_expires_at = ?, token_used = 0,
            token_resend_count = token_resend_count + 1, last_resend_at = ?
        WHERE id = ?
    ''', (new_token_hash, new_expires_at, datetime.now().isoformat(), transaction_id))

    conn.commit()
    conn.close()

    log_activity(transaction_id, 'TOKEN_RESENT', transaction['buyer_phone'], 'New magic link sent')
    send_buyer_magic_link_sms(transaction['buyer_phone'], transaction_id, new_token, transaction['item_name'], float(transaction['amount']))

    return jsonify({'success': True, 'message': 'New magic link sent to your phone'})


@app.route('/api/transactions/<transaction_id>/status', methods=['PUT'])
@limiter.limit('30 per hour')
def update_status(transaction_id):
    data       = request.json or {}
    new_status = data.get('status')
    phone      = data.get('phone')
    token      = data.get('token', '')

    if not new_status:
        return jsonify({'error': 'Status is required'}), 400

    valid_statuses = ['AWAITING_DELIVERY', 'DELIVERED', 'DISPUTED']
    if new_status not in valid_statuses:
        return jsonify({'error': 'Invalid status'}), 400

    conn   = get_db_connection()
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
@limiter.limit('10 per hour')
def track_by_phone(phone):
    # SECURITY: this endpoint previously returned full transaction details
    # (including the counterparty's phone number, item details, and
    # payout info) for ANY phone number, with no verification that the
    # requester actually owns that number. It is rate-limited and now
    # returns a minimal, masked summary only.
    if not validate_kenyan_phone(phone):
        return jsonify({'error': 'Invalid phone number'}), 400

    normalized_phone = normalize_phone(phone)

    conn   = get_db_connection()
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
        is_buyer = (t['buyer_phone'] == normalized_phone)

        transactions.append({
            'id':          t['id'],
            'item_name':   t['item_name'],
            'amount':      float(t['amount']),
            'status':      t['status'],
            'created_at':  t['created_at'],
            'role':        'buyer' if is_buyer else 'seller',
            # Counterparty phone is masked - full number requires the
            # magic link sent to that party.
            'counterparty_phone': mask_phone(t['seller_phone'] if is_buyer else t['buyer_phone']),
        })

    return jsonify({'transactions': transactions})


# ============================================================================
# PHONE IMPORT SERVICE — ENDPOINTS
# ============================================================================

@app.route('/api/import/products', methods=['GET'])
def get_import_products():
    """Public catalog for the import shop page. Only fields the buyer
    should see are returned - no cost breakdown, just the total price."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM import_products WHERE active = 1 ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()

    public_products = [
        {
            'id':        p['id'],
            'name':      p['name'],
            'condition': p['condition'],
            'specs':     p['specs'],
            'price':     p['price'],
            'eta':       p['eta'],
            'image':     p['image'],
            'badge':     p.get('badge', ''),
        }
        for p in (_row_to_product(r) for r in rows)
    ]
    return jsonify({'products': public_products})


@app.route('/api/import/order', methods=['POST'])
@limiter.limit('5 per hour')
def create_import_order():
    """Places an import order as a normal SecureEscrow transaction, with
    the seller side (you) filled in server-side so it can't be tampered
    with from the browser. The price is also read from the server-side
    catalog, never trusted from the client."""
    data = request.json or {}

    if not IMPORT_SELLER_PHONE or not validate_kenyan_phone(IMPORT_SELLER_PHONE):
        return jsonify({'error': 'Import service is not configured yet. Please contact support.'}), 503

    product = get_import_product(data.get('productId', ''))
    if not product:
        return jsonify({'error': 'That phone is no longer available'}), 400

    buyer_phone = data.get('buyerPhone', '')
    if not validate_kenyan_phone(buyer_phone):
        return jsonify({'error': 'Invalid phone number'}), 400

    normalized_buyer  = normalize_phone(buyer_phone)
    normalized_seller = normalize_phone(IMPORT_SELLER_PHONE)

    if normalized_buyer == normalized_seller:
        return jsonify({'error': 'This number cannot be used to place an order'}), 400

    buyer_name       = sanitize_text(data.get('buyerName', ''), 80)
    delivery_city    = sanitize_text(data.get('deliveryCity', ''), 60)
    delivery_address = sanitize_text(data.get('deliveryAddress', ''), 200)
    notes            = sanitize_text(data.get('notes', ''), 300)

    amount    = float(product['price'])
    item_name = product['name']

    detail_parts = [f"Import order - {product.get('condition', '')}".strip(' -')]
    if buyer_name:
        detail_parts.append(f"Buyer: {buyer_name}")
    if delivery_city:
        detail_parts.append(f"City: {delivery_city}")
    if delivery_address:
        detail_parts.append(f"Address: {delivery_address}")
    if notes:
        detail_parts.append(f"Notes: {notes}")
    item_details = sanitize_text(' | '.join(detail_parts), MAX_ITEM_DETAILS_LEN)

    transaction_id    = generate_transaction_id()
    magic_token       = generate_token()
    seller_token      = generate_token()
    magic_token_hash  = hash_value(magic_token)
    seller_token_hash = hash_value(seller_token)
    token_expires_at  = (datetime.now() + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO transactions (
            id, magic_token_hash, seller_token_hash, token_expires_at,
            item_name, item_details, amount, buyer_phone, seller_phone,
            transaction_type, delivery_deadline, payout_type, payout_number, payout_account,
            status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        transaction_id, magic_token_hash, seller_token_hash, token_expires_at,
        item_name, item_details, amount,
        normalized_buyer, normalized_seller,
        'PHONE_IMPORT', product.get('eta', ''),
        IMPORT_PAYOUT_TYPE, IMPORT_PAYOUT_NUMBER, IMPORT_PAYOUT_ACCOUNT,
        'FUNDS_SECURED', datetime.now().isoformat()
    ))
    conn.commit()
    conn.close()

    log_activity(transaction_id, 'CREATED', normalized_buyer, f"Import order: {item_name} - Amount: {amount}")

    send_buyer_magic_link_sms(normalized_buyer, transaction_id, magic_token, item_name, amount)
    send_seller_tracking_sms(normalized_seller, transaction_id, seller_token, normalized_buyer, item_name, amount)

    return jsonify({
        'success':       True,
        'transactionId': transaction_id,
        'message':       'Order placed. Check your phone for a secure link to track it.'
    }), 201


# ============================================================================
# PHONE IMPORT SERVICE — ADMIN ENDPOINTS
# ============================================================================
# All of these require a valid X-Admin-Key header matching IMPORT_ADMIN_KEY.
# admin.html is the only page that calls these - it's not linked from the
# public site nav, so keep its URL private.

@app.route('/api/admin/import-products', methods=['GET'])
@limiter.limit('60 per hour')
def admin_list_import_products():
    if not require_admin_key():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM import_products ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()

    return jsonify({'products': [_row_to_product(r) for r in rows]})


@app.route('/api/admin/import-products/save', methods=['POST'])
@limiter.limit('60 per hour')
def admin_save_import_product():
    """Creates a new product, or updates an existing one if `id` matches
    a product already in the catalog."""
    if not require_admin_key():
        return jsonify({'error': 'Unauthorized'}), 401

    import json

    data = request.json or {}

    name = sanitize_text(data.get('name', ''), MAX_ITEM_NAME_LEN)
    if not name:
        return jsonify({'error': 'Phone name is required'}), 400

    try:
        price = float(data.get('price', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid price'}), 400
    if price <= 0 or price > MAX_AMOUNT:
        return jsonify({'error': 'Enter a valid price'}), 400

    condition = sanitize_text(data.get('condition', 'Grade A (Excellent)'), 60)
    eta       = sanitize_text(data.get('eta', '10-14 days'), MAX_DEADLINE_LEN)
    image     = sanitize_text(data.get('image', ''), 500)
    badge     = sanitize_text(data.get('badge', ''), 30)
    active    = 1 if data.get('active', True) else 0

    raw_specs = data.get('specs', [])
    if isinstance(raw_specs, str):
        raw_specs = [s.strip() for s in raw_specs.split(',') if s.strip()]
    specs = [sanitize_text(s, MAX_SPEC_LEN) for s in raw_specs][:MAX_SPECS_COUNT]

    product_id = sanitize_text(data.get('id', ''), 80)
    now = datetime.now().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    if product_id:
        cursor.execute('SELECT id FROM import_products WHERE id = ?', (product_id,))
        existing = cursor.fetchone()
    else:
        existing = None

    if existing:
        cursor.execute('''
            UPDATE import_products
            SET name = ?, condition_label = ?, specs = ?, price = ?, eta = ?,
                image = ?, badge = ?, active = ?, updated_at = ?
            WHERE id = ?
        ''', (name, condition, json.dumps(specs), price, eta, image, badge, active, now, product_id))
    else:
        slug_base = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or 'phone'
        product_id = f"{slug_base}-{secrets.token_hex(3)}"
        cursor.execute('''
            INSERT INTO import_products
                (id, name, condition_label, specs, price, eta, image, badge, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (product_id, name, condition, json.dumps(specs), price, eta, image, badge, active, now, now))

    conn.commit()
    conn.close()

    return jsonify({'success': True, 'id': product_id})


@app.route('/api/admin/import-products/delete', methods=['POST'])
@limiter.limit('60 per hour')
def admin_delete_import_product():
    if not require_admin_key():
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.json or {}
    product_id = data.get('id', '')
    if not product_id:
        return jsonify({'error': 'Missing product id'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM import_products WHERE id = ?', (product_id,))
    conn.commit()
    conn.close()

    return jsonify({'success': True})


@app.route('/api/admin/upload-image', methods=['POST'])
@limiter.limit('30 per hour')
def admin_upload_image():
    """Receives a photo from admin.html and forwards it to imgbb's free
    hosting API, returning a permanent URL. Render's own filesystem isn't
    used, since it's wiped on every redeploy."""
    if not require_admin_key():
        return jsonify({'error': 'Unauthorized'}), 401

    if not IMGBB_API_KEY:
        return jsonify({'error': 'Image hosting is not configured yet (missing IMGBB_API_KEY).'}), 503

    if 'image' not in request.files:
        return jsonify({'error': 'No image file received'}), 400

    image_file = request.files['image']
    if not image_file.filename:
        return jsonify({'error': 'No image file received'}), 400

    image_bytes = image_file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        return jsonify({'error': 'Image too large (max 10MB)'}), 400

    try:
        encoded = base64.b64encode(image_bytes).decode('utf-8')
        response = requests.post(
            'https://api.imgbb.com/1/upload',
            data={'key': IMGBB_API_KEY, 'image': encoded},
            timeout=20
        )
        result = response.json()
        if not response.ok or not result.get('success'):
            return jsonify({'error': 'Image upload failed. Please try again.'}), 502

        return jsonify({'success': True, 'url': result['data']['url']})
    except requests.RequestException:
        return jsonify({'error': 'Image upload failed. Please check your connection.'}), 502


# ============================================================================
# START SERVER
# ============================================================================

if __name__ == '__main__':
    init_database()

    debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    host       = os.getenv('HOST', '127.0.0.1')
    port       = int(os.getenv('PORT', '5000'))

    print("\n" + "=" * 50)
    print("SecureEscrow Kenya Backend Server")
    print("=" * 50)
    print(f"\nToken expiry   : {TOKEN_EXPIRY_DAYS} days")
    print(f"SMS mode       : {AFRICASTALKING_ENV.upper()}")
    print(f"Allowed origins: {', '.join(ALLOWED_ORIGINS)}")
    print(f"Debug mode     : {debug_mode}")
    print(f"\nServer running at: http://{host}:{port}")
    print("Press Ctrl+C to stop\n")

    app.run(debug=debug_mode, host=host, port=port)