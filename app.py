








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
import json
import requests

app = Flask(__name__)

# ============================================================================
# CORE CONFIG
# ============================================================================

DATABASE = 'escrow.db'
TOKEN_EXPIRY_DAYS = 7

# Cap request bodies. Most endpoints only need a few KB, but the admin
# photo-upload endpoint accepts images up to 10MB (checked explicitly in
# that route) - the old 32KB global cap silently broke every photo
# upload before that per-route check ever ran, since Werkzeug rejects
# oversized bodies before your code executes. Base64-encoding the image
# for the imgbb API adds ~33% overhead, so this allows a little headroom
# above the raw 10MB limit.
app.config['MAX_CONTENT_LENGTH'] = 14 * 1024 * 1024

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


@app.after_request
def set_security_headers(response):
    """Security headers for the API itself. The frontend's own headers
    (set via .htaccess) only cover the static site's origin - this Flask
    app is a separate origin (Render) and gets none of those by default."""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # AUDIT FIX (LOW): HSTS was missing. This only has effect once a
    # browser has seen it over a genuine HTTPS response, so it doesn't
    # protect the very first request - but Render always terminates TLS
    # in front of this app, so it's safe to set unconditionally.
    response.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains'
    # This API only ever returns JSON - never let a browser cache a
    # response containing transaction/payout details.
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response

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
# ESCROW FEE - SERVER-SIDE SOURCE OF TRUTH
# ============================================================================
#
# SECURITY AUDIT FIX (CRITICAL): previously the buyer's STK Push and the
# seller's B2C payout were both charged/paid the same bare item amount, so
# the platform never actually collected a commission regardless of what
# the frontend displayed. The fee is now computed here, server-side, and
# is what the buyer is actually charged; the seller still receives the
# bare item amount. This value must match CONFIG.ESCROW_FEE_PERCENTAGE in
# script.js so the number shown in the pre-payment popup is accurate.
#
ESCROW_FEE_PERCENTAGE = 0.11


def calculate_fee(item_amount):
    """Returns (fee_amount, total_amount) for a given item price, rounded
    to the nearest whole shilling since M-PESA does not do cents."""
    fee_amount = round(item_amount * ESCROW_FEE_PERCENTAGE)
    total_amount = item_amount + fee_amount
    return fee_amount, total_amount

# ============================================================================
# M-PESA CALLBACK SHARED SECRET
# ============================================================================
#
# SECURITY AUDIT FIX (CRITICAL): Daraja does not cryptographically sign its
# callbacks, and /api/mpesa/stk-callback, /b2c-result and /b2c-timeout must
# stay publicly reachable with no session/token auth (Safaricom's servers
# call them directly). The only thing standing between "any request that
# guesses/obtains a CheckoutRequestID" and a forged fake-payment
# confirmation was that lookup key - which was previously leaked back to
# clients (see the GET /transactions/<id> fix below). As defense-in-depth
# even after closing that leak, every callback URL registered with Daraja
# now carries a long random secret in the query string that this server
# generated itself and Safaricom simply echoes back on every call, since
# webhooks always hit the exact URL you registered. Requests missing or
# presenting the wrong secret are rejected before any transaction lookup.
#
# Set this in your .env / Render environment:
#   MPESA_CALLBACK_SECRET=<a long random string, e.g. `python -c "import secrets; print(secrets.token_urlsafe(32))"`>
#
# If unset, a secret is generated at process startup so the app still
# works in development - but every restart invalidates in-flight
# callbacks, so ALWAYS set this explicitly in production.
MPESA_CALLBACK_SECRET = os.getenv('MPESA_CALLBACK_SECRET') or secrets.token_urlsafe(32)


def _callback_secret_valid():
    return secrets.compare_digest(
        request.args.get('key', ''), MPESA_CALLBACK_SECRET
    )

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

# ============================================================================
# SAFARICOM DARAJA (M-PESA) CONFIG
# ============================================================================
#
# STK Push (buyer pays into escrow) and B2C (automatic payout to a seller's
# M-PESA number) both go through Safaricom's Daraja API. Get everything
# below from https://developer.safaricom.co.ke - start with a SANDBOX app
# and test the full flow with fake money before ever touching production
# credentials. Going live also requires a separate Safaricom "go-live"
# approval process - it is not just a config change.
#
#   DARAJA_ENV=sandbox                     sandbox | production
#   DARAJA_CONSUMER_KEY=...                from your Daraja app
#   DARAJA_CONSUMER_SECRET=...             from your Daraja app
#   DARAJA_SHORTCODE=...                   Paybill/Till used for STK Push (PartyB)
#   DARAJA_PASSKEY=...                     Lipa Na M-Pesa Online passkey
#   DARAJA_CALLBACK_BASE_URL=https://your-app.onrender.com
#   DARAJA_INITIATOR_NAME=...              B2C API operator username
#   DARAJA_INITIATOR_PASSWORD=...          B2C API operator password (never logged, only encrypted)
#   DARAJA_B2C_SHORTCODE=...               shortcode B2C pays FROM (often same as DARAJA_SHORTCODE)
#   DARAJA_CERT_PATH=daraja_cert.pem       Safaricom's public cert - download fresh from the
#                                          Daraja portal's "Go Live" / API docs page, don't
#                                          reuse one from a tutorial - use the current one for
#                                          your environment (sandbox cert != production cert).
#
# IMPORTANT: automated payouts (B2C) only work when a seller's payout
# method is MPESA (a phone number). Safaricom's B2C API cannot pay out to
# a Till or Paybill number directly - those payouts stay manual, exactly
# as they are today.

DARAJA_ENV               = os.getenv('DARAJA_ENV', 'sandbox')
DARAJA_CONSUMER_KEY      = os.getenv('DARAJA_CONSUMER_KEY', '')
DARAJA_CONSUMER_SECRET   = os.getenv('DARAJA_CONSUMER_SECRET', '')
DARAJA_SHORTCODE         = os.getenv('DARAJA_SHORTCODE', '')
DARAJA_PASSKEY           = os.getenv('DARAJA_PASSKEY', '')
DARAJA_CALLBACK_BASE_URL = os.getenv('DARAJA_CALLBACK_BASE_URL', '')
DARAJA_INITIATOR_NAME    = os.getenv('DARAJA_INITIATOR_NAME', '')
DARAJA_INITIATOR_PASSWORD= os.getenv('DARAJA_INITIATOR_PASSWORD', '')
DARAJA_B2C_SHORTCODE     = os.getenv('DARAJA_B2C_SHORTCODE', '') or DARAJA_SHORTCODE
DARAJA_CERT_PATH         = os.getenv('DARAJA_CERT_PATH', 'daraja_cert.pem')

DARAJA_BASE_URL = (
    'https://api.safaricom.co.ke' if DARAJA_ENV == 'production'
    else 'https://sandbox.safaricom.co.ke'
)

DARAJA_CONFIGURED = bool(
    DARAJA_CONSUMER_KEY and DARAJA_CONSUMER_SECRET and
    DARAJA_SHORTCODE and DARAJA_PASSKEY and DARAJA_CALLBACK_BASE_URL
)
DARAJA_B2C_CONFIGURED = bool(
    DARAJA_CONFIGURED and DARAJA_INITIATOR_NAME and
    DARAJA_INITIATOR_PASSWORD and os.path.exists(DARAJA_CERT_PATH)
)

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
            status TEXT DEFAULT 'AWAITING_PAYMENT',
            created_at TEXT NOT NULL,
            shipped_at TEXT,
            delivered_at TEXT,
            released_at TEXT,
            disputed_at TEXT,
            token_resend_count INTEGER DEFAULT 0,
            last_resend_at TEXT,
            payment_status TEXT DEFAULT 'PENDING',
            mpesa_checkout_request_id TEXT,
            mpesa_merchant_request_id TEXT,
            mpesa_receipt_number TEXT,
            payout_status TEXT DEFAULT 'NOT_STARTED',
            payout_conversation_id TEXT,
            payout_receipt_number TEXT
        )
    ''')

    # Migration for databases created before M-PESA columns existed.
    # SQLite has no "ADD COLUMN IF NOT EXISTS", so each ALTER is wrapped
    # individually - already-present columns just raise and get skipped.
    _mpesa_columns = [
        ('payment_status', "TEXT DEFAULT 'PENDING'"),
        ('mpesa_checkout_request_id', 'TEXT'),
        ('mpesa_merchant_request_id', 'TEXT'),
        ('mpesa_receipt_number', 'TEXT'),
        ('payout_status', "TEXT DEFAULT 'NOT_STARTED'"),
        ('payout_conversation_id', 'TEXT'),
        ('payout_receipt_number', 'TEXT'),
        # fee_amount / total_amount: added when the fee-collection bug was
        # fixed (see calculate_fee above). `amount` stays the item price
        # (what the seller receives); `total_amount` is what the buyer is
        # actually charged via STK Push. Existing rows get fee_amount=0,
        # total_amount=amount so historical transactions - which genuinely
        # never collected a fee - aren't misrepresented.
        ('fee_amount', 'REAL DEFAULT 0'),
        ('total_amount', 'REAL'),
    ]
    for column_name, column_def in _mpesa_columns:
        try:
            cursor.execute(f'ALTER TABLE transactions ADD COLUMN {column_name} {column_def}')
        except sqlite3.OperationalError:
            pass  # column already exists

    cursor.execute('UPDATE transactions SET total_amount = amount WHERE total_amount IS NULL')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mpesa_callback_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            callback_type TEXT NOT NULL,
            raw_payload TEXT NOT NULL,
            received_at TEXT NOT NULL
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


def send_seller_release_notification(seller_phone, transaction_id, buyer_phone, item_name, amount, payout_type='MPESA'):
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

Funds sent to {payout_text}."""

    return send_sms(seller_phone, message, transaction_id, 'seller_release_notification')


# ============================================================================
# SAFARICOM DARAJA HELPERS
# ============================================================================

_daraja_token_cache = {'token': None, 'expires_at': 0}


def daraja_get_access_token():
    """OAuth token for all Daraja calls. Cached in memory until shortly
    before it expires (tokens are valid ~1 hour) to avoid re-authenticating
    on every request."""
    now = time.time()
    if _daraja_token_cache['token'] and now < _daraja_token_cache['expires_at']:
        return _daraja_token_cache['token']

    url = f"{DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials"
    response = requests.get(
        url,
        auth=(DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET),
        timeout=15
    )
    response.raise_for_status()
    result = response.json()

    token = result['access_token']
    # Refresh 2 minutes early to be safe against clock drift
    _daraja_token_cache['token'] = token
    _daraja_token_cache['expires_at'] = now + int(result.get('expires_in', 3599)) - 120
    return token


def daraja_stk_push(phone, amount, account_reference, description, transaction_id):
    """Sends an STK Push prompt to the buyer's phone asking them to enter
    their M-PESA PIN to pay into escrow. Returns Safaricom's response dict,
    which includes CheckoutRequestID - used later to match the callback
    back to this transaction."""
    access_token = daraja_get_access_token()
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    password = base64.b64encode(
        f"{DARAJA_SHORTCODE}{DARAJA_PASSKEY}{timestamp}".encode()
    ).decode()

    payload = {
        'BusinessShortCode': DARAJA_SHORTCODE,
        'Password': password,
        'Timestamp': timestamp,
        'TransactionType': 'CustomerPayBillOnline',
        'Amount': int(round(amount)),
        'PartyA': phone,
        'PartyB': DARAJA_SHORTCODE,
        'PhoneNumber': phone,
        'CallBackURL': f"{DARAJA_CALLBACK_BASE_URL}/api/mpesa/stk-callback?key={MPESA_CALLBACK_SECRET}",
        'AccountReference': account_reference[:12],
        'TransactionDesc': description[:13],
    }

    response = requests.post(
        f"{DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest",
        json=payload,
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=20
    )
    result = response.json()
    log_activity(transaction_id, 'STK_PUSH_SENT', None,
                 f"CheckoutRequestID: {result.get('CheckoutRequestID', 'n/a')}")
    return result


def daraja_get_security_credential():
    """Encrypts the B2C initiator password with Safaricom's public
    certificate, as required for every B2C request. Never send or log
    the raw initiator password anywhere else."""
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography import x509

    with open(DARAJA_CERT_PATH, 'rb') as f:
        cert_data = f.read()
    cert = x509.load_pem_x509_certificate(cert_data)
    public_key = cert.public_key()

    encrypted = public_key.encrypt(
        DARAJA_INITIATOR_PASSWORD.encode(),
        padding.PKCS1v15()
    )
    return base64.b64encode(encrypted).decode()


def daraja_b2c_payout(phone, amount, remarks, transaction_id):
    """Sends money directly to a seller's M-PESA number. Only ever called
    for sellers whose payout method is MPESA - Daraja's B2C API cannot pay
    a Till or Paybill number."""
    access_token = daraja_get_access_token()
    security_credential = daraja_get_security_credential()

    payload = {
        'InitiatorName': DARAJA_INITIATOR_NAME,
        'SecurityCredential': security_credential,
        'CommandID': 'BusinessPayment',
        'Amount': int(round(amount)),
        'PartyA': DARAJA_B2C_SHORTCODE,
        'PartyB': phone,
        'Remarks': remarks[:100],
        'QueueTimeOutURL': f"{DARAJA_CALLBACK_BASE_URL}/api/mpesa/b2c-timeout?key={MPESA_CALLBACK_SECRET}",
        'ResultURL': f"{DARAJA_CALLBACK_BASE_URL}/api/mpesa/b2c-result?key={MPESA_CALLBACK_SECRET}",
        'Occasion': transaction_id,
    }

    response = requests.post(
        f"{DARAJA_BASE_URL}/mpesa/b2c/v1/paymentrequest",
        json=payload,
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=20
    )
    result = response.json()
    log_activity(transaction_id, 'B2C_PAYOUT_INITIATED', None,
                 f"ConversationID: {result.get('ConversationID', 'n/a')}")
    return result


def log_mpesa_callback(callback_type, raw_payload):
    """Every Daraja callback gets logged verbatim before any processing -
    this is your audit trail for payment disputes and debugging, since
    Safaricom won't replay a callback for you after the fact."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO mpesa_callback_logs (callback_type, raw_payload, received_at)
        VALUES (?, ?, ?)
    ''', (callback_type, json.dumps(raw_payload), datetime.now().isoformat()))
    conn.commit()
    conn.close()


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

    fee_amount, total_amount = calculate_fee(amount)

    transaction_id   = generate_transaction_id()
    magic_token      = generate_token()
    seller_token     = generate_token()
    magic_token_hash = hash_value(magic_token)
    seller_token_hash= hash_value(seller_token)
    token_expires_at = (datetime.now() + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()

    # If Daraja isn't configured yet, fall back to the original manual-payment
    # flow (funds assumed already sent outside the app) so the site keeps
    # working exactly as before while you're testing M-PESA in sandbox.
    initial_status = 'AWAITING_PAYMENT' if DARAJA_CONFIGURED else 'FUNDS_SECURED'
    initial_payment_status = 'PENDING' if DARAJA_CONFIGURED else 'PAID'

    conn   = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO transactions (
            id, magic_token_hash, seller_token_hash, token_expires_at,
            item_name, item_details, amount, fee_amount, total_amount,
            buyer_phone, seller_phone,
            transaction_type, delivery_deadline, payout_type, payout_number, payout_account,
            status, created_at, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        transaction_id, magic_token_hash, seller_token_hash, token_expires_at,
        item_name, item_details, amount, fee_amount, total_amount,
        normalize_phone(buyer_phone), normalize_phone(seller_phone),
        transaction_type, delivery_deadline,
        payout_type, payout_number, payout_account,
        initial_status, datetime.now().isoformat(), initial_payment_status
    ))

    conn.commit()
    conn.close()

    log_activity(transaction_id, 'CREATED', normalize_phone(buyer_phone), f"Amount: {amount}, Fee: {fee_amount}, Total: {total_amount}")

    if DARAJA_CONFIGURED:
        # Real payment collection: send an STK Push prompt to the buyer's
        # phone right now, for the fee-inclusive TOTAL (not the bare item
        # amount - see calculate_fee). Nothing is marked FUNDS_SECURED
        # until the callback confirms it - but both parties get their
        # tracking links immediately, same as the manual flow. The
        # tracking page itself shows "Awaiting Payment" until the
        # callback fires.
        try:
            stk_result = daraja_stk_push(
                normalize_phone(buyer_phone), total_amount, transaction_id, item_name, transaction_id
            )
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE transactions
                SET mpesa_checkout_request_id = ?, mpesa_merchant_request_id = ?
                WHERE id = ?
            ''', (
                stk_result.get('CheckoutRequestID'),
                stk_result.get('MerchantRequestID'),
                transaction_id
            ))
            conn.commit()
            conn.close()

            stk_sent = stk_result.get('ResponseCode') == '0'
        except Exception as e:
            log_activity(transaction_id, 'STK_PUSH_FAILED', None, str(e))
            stk_sent = False

        tracking_link = f"{FRONTEND_BASE_URL}?id={transaction_id}&token={magic_token}"
        if stk_sent:
            buyer_message = (
                f"SecureEscrow Kenya\nEnter your M-PESA PIN on the prompt sent to your "
                f"phone to pay KES {total_amount:,.0f} (item KES {amount:,.0f} + escrow fee "
                f"KES {fee_amount:,.0f}) for {item_name}.\n\nTrack: {tracking_link}"
            )
        else:
            buyer_message = (
                f"SecureEscrow Kenya\nWe couldn't send the M-PESA payment prompt. "
                f"Please retry payment.\n\nTrack: {tracking_link}"
            )
        send_sms(normalize_phone(buyer_phone), buyer_message, transaction_id, 'stk_push_prompt')

        seller_tracking_link = f"{FRONTEND_BASE_URL}?id={transaction_id}&token={seller_token}"
        seller_message = (
            f"SecureEscrow Kenya\nA buyer wants to purchase: {item_name} (KES {amount:,.0f}).\n"
            f"We've requested payment from them - you'll get another SMS once it's confirmed.\n\n"
            f"Track: {seller_tracking_link}"
        )
        send_sms(normalize_phone(seller_phone), seller_message, transaction_id, 'seller_awaiting_payment')

        return jsonify({
            'success':       True,
            'transactionId': transaction_id,
            'paymentRequired': True,
            'stkPushSent':   stk_sent,
            'message': ('Check your phone and enter your M-PESA PIN to complete payment.'
                        if stk_sent else
                        'Transaction created, but the payment prompt failed to send. Please retry payment.')
        }), 201

    # Legacy manual-payment path (Daraja not configured). The buyer needs
    # to know the fee-inclusive total since they're paying outside the
    # app; the seller still only sees the item amount they'll receive.
    send_buyer_magic_link_sms(normalize_phone(buyer_phone), transaction_id, magic_token, item_name, total_amount)
    send_seller_tracking_sms(normalize_phone(seller_phone), transaction_id, seller_token, normalize_phone(buyer_phone), item_name, amount)

    return jsonify({
        'success':       True,
        'transactionId': transaction_id,
        'message':       'Transaction created. Check your phone for the magic link.'
    }), 201


@app.route('/api/transactions/<transaction_id>/retry-payment', methods=['POST'])
@limiter.limit('5 per hour')
def retry_payment(transaction_id):
    """Re-sends the STK Push prompt - for when a buyer cancelled it,
    let it time out, or it failed to send the first time.

    SECURITY AUDIT FIX (HIGH): this endpoint previously had no
    authorization check at all - anyone who knew or found a transaction
    ID could repeatedly trigger unwanted M-PESA STK prompts to the
    buyer's phone (harassment/abuse), and it broke the token-based
    authorization model used by every other state-changing endpoint in
    this app. It now requires the buyer's own magic token, same as
    /release and /status."""
    if not DARAJA_CONFIGURED:
        return jsonify({'error': 'M-PESA payments are not configured yet'}), 503

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

    if hash_value(token) != transaction['magic_token_hash']:
        conn.close()
        log_activity(transaction_id, 'RETRY_PAYMENT_FAILED', None, 'Invalid token')
        return jsonify({'error': 'Invalid authorization token'}), 403

    if transaction['status'] != 'AWAITING_PAYMENT':
        conn.close()
        return jsonify({'error': f"Cannot retry payment from status: {transaction['status']}"}), 400

    try:
        # total_amount may be NULL on rows created before this column
        # existed - fall back to amount (no fee) for those old
        # transactions only, so a retry never charges more than the
        # buyer was originally told.
        retry_amount = float(transaction['total_amount'] or transaction['amount'])
        stk_result = daraja_stk_push(
            transaction['buyer_phone'], retry_amount,
            transaction_id, transaction['item_name'], transaction_id
        )
        cursor.execute('''
            UPDATE transactions
            SET mpesa_checkout_request_id = ?, mpesa_merchant_request_id = ?
            WHERE id = ?
        ''', (
            stk_result.get('CheckoutRequestID'),
            stk_result.get('MerchantRequestID'),
            transaction_id
        ))
        conn.commit()
        conn.close()

        if stk_result.get('ResponseCode') == '0':
            return jsonify({'success': True, 'message': 'Payment prompt sent. Check your phone.'})
        return jsonify({'error': 'Failed to send payment prompt. Please try again.'}), 502
    except Exception as e:
        conn.close()
        log_activity(transaction_id, 'STK_PUSH_FAILED', None, str(e))
        return jsonify({'error': 'Failed to send payment prompt. Please try again.'}), 502


@app.route('/api/mpesa/stk-callback', methods=['POST'])
@limiter.limit('200 per hour')
def stk_callback():
    """Safaricom calls this after the buyer completes (or cancels/fails)
    the STK Push prompt. This endpoint is publicly reachable with no
    session/token auth - that's a Daraja requirement, not a choice - so
    it never trusts the payload blindly: it requires the callback secret
    that only this server and Safaricom (via the registered CallBackURL)
    know, looks up the transaction by CheckoutRequestID, and cross-checks
    the paid amount before confirming anything."""
    if not _callback_secret_valid():
        # Do NOT log the payload here or return any detail - an attacker
        # probing this endpoint should learn nothing beyond "rejected".
        return jsonify({'ResultCode': 1, 'ResultDesc': 'Rejected'}), 403

    payload = request.json or {}
    log_mpesa_callback('stk_push', payload)

    try:
        stk_callback_data = payload['Body']['stkCallback']
        checkout_request_id = stk_callback_data['CheckoutRequestID']
        result_code = stk_callback_data['ResultCode']
    except (KeyError, TypeError):
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE mpesa_checkout_request_id = ?', (checkout_request_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        # Unknown CheckoutRequestID - log and acknowledge, nothing to update
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    transaction = dict(row)
    transaction_id = transaction['id']

    if result_code != 0:
        # SECURITY AUDIT FIX (MEDIUM): use an atomic conditional UPDATE
        # (WHERE payment_status = 'PENDING') instead of a separate
        # read-then-write, so two near-simultaneous retried callbacks
        # can't both pass a stale idempotency check and both send SMS.
        cursor.execute('''
            UPDATE transactions SET payment_status = 'FAILED'
            WHERE id = ? AND payment_status = 'PENDING'
        ''', (transaction_id,))
        conn.commit()
        already_handled = cursor.rowcount == 0
        conn.close()
        if already_handled:
            return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})
        log_activity(transaction_id, 'PAYMENT_FAILED', None,
                     stk_callback_data.get('ResultDesc', 'Payment failed or cancelled'))
        send_sms(
            transaction['buyer_phone'],
            f"SecureEscrow Kenya\nPayment for transaction {transaction_id} was not completed. "
            f"Please retry payment to continue.",
            transaction_id, 'payment_failed'
        )
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    # Extract confirmed payment details from Safaricom's metadata
    metadata = {
        item['Name']: item.get('Value')
        for item in stk_callback_data.get('CallbackMetadata', {}).get('Item', [])
    }
    paid_amount = metadata.get('Amount')
    receipt_number = metadata.get('MpesaReceiptNumber')

    # SECURITY: never trust the callback amount blindly - cross-check it
    # against what this transaction actually expects before confirming.
    # expected_amount is the fee-inclusive TOTAL the buyer was charged
    # via STK Push, NOT the bare item amount (that's what the seller
    # receives - see calculate_fee).
    expected_amount = float(transaction['total_amount'] or transaction['amount'])
    if paid_amount is None or abs(float(paid_amount) - expected_amount) > 1:
        cursor.execute('''
            UPDATE transactions SET payment_status = 'MISMATCH'
            WHERE id = ? AND payment_status = 'PENDING'
        ''', (transaction_id,))
        conn.commit()
        conn.close()
        log_activity(transaction_id, 'PAYMENT_AMOUNT_MISMATCH', None,
                     f"Expected {expected_amount}, callback reported {paid_amount}")
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    # SECURITY AUDIT FIX (MEDIUM - idempotency race): the idempotency
    # check used to be a separate SELECT before this UPDATE, leaving a
    # window where two concurrent retried callbacks could both read
    # payment_status != 'PAID' and both proceed, sending duplicate SMS
    # (the UPDATE itself was harmless to repeat, but the notifications
    # weren't). Gating the UPDATE itself on payment_status = 'PENDING'
    # makes the whole check-and-set atomic at the database level - only
    # one concurrent request can ever see rowcount == 1.
    cursor.execute('''
        UPDATE transactions
        SET status = 'FUNDS_SECURED', payment_status = 'PAID', mpesa_receipt_number = ?
        WHERE id = ? AND payment_status = 'PENDING'
    ''', (receipt_number, transaction_id))
    conn.commit()
    already_processed = cursor.rowcount == 0
    conn.close()

    if already_processed:
        # Either already PAID (Safaricom retried the same callback) or
        # in some other state - don't re-notify either party.
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    log_activity(transaction_id, 'PAYMENT_CONFIRMED', transaction['buyer_phone'],
                 f"Receipt: {receipt_number}, Amount: {paid_amount}")

    # Payment is confirmed - let both parties know. They already have
    # their tracking links from transaction creation; this is just a
    # status update, not a new link.
    send_sms(
        transaction['buyer_phone'],
        f"SecureEscrow Kenya\nPayment confirmed! KES {expected_amount:,.0f} paid for "
        f"{transaction['item_name']} is now secured in escrow. Receipt: {receipt_number}",
        transaction_id, 'payment_confirmed_buyer'
    )
    send_sms(
        transaction['seller_phone'],
        f"SecureEscrow Kenya\nBuyer's payment for {transaction['item_name']} has been "
        f"confirmed and KES {float(transaction['amount']):,.0f} is secured in escrow for "
        f"you. You may proceed with fulfillment.",
        transaction_id, 'payment_confirmed_seller'
    )

    return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})


@app.route('/api/transactions/<transaction_id>', methods=['GET'])
@limiter.limit('30 per hour')
def get_transaction(transaction_id):
    # SECURITY: this endpoint used to return full buyer/seller phone
    # numbers and payout details to ANYONE who knew a transaction ID -
    # no proof of identity required. It now only returns that data when
    # the caller supplies a valid buyer or seller token (?token=...).
    # Without one, phone numbers are masked and payout/item_details are
    # omitted entirely - matching the same protection already applied
    # to /api/transactions/track/<phone>.
    token = request.args.get('token', '')

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE id = ?', (transaction_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({'error': 'Transaction not found'}), 404

    transaction = dict(row)
    transaction['amount'] = float(transaction['amount'])
    transaction['fee_amount'] = float(transaction['fee_amount'] or 0)
    transaction['total_amount'] = float(transaction['total_amount'] or transaction['amount'])
    transaction.pop('magic_token_hash', None)
    transaction.pop('seller_token_hash', None)
    transaction.pop('token_expires_at', None)
    transaction.pop('token_used', None)
    # SECURITY AUDIT FIX (CRITICAL): mpesa_checkout_request_id in
    # particular was being returned here to ANY caller who knew a
    # transaction ID, no token required. That value is exactly the
    # lookup key /api/mpesa/stk-callback uses to identify which
    # transaction to mark as paid - since that callback endpoint must
    # stay publicly reachable (Safaricom calls it directly, with no
    # session of its own), leaking this ID would have let someone submit
    # a forged callback payload claiming a transaction was paid when it
    # never was, then have real funds released to the seller. These IDs
    # are purely internal correlation values; no legitimate frontend use
    # ever needs them, authorized or not.
    transaction.pop('mpesa_checkout_request_id', None)
    transaction.pop('mpesa_merchant_request_id', None)
    transaction.pop('mpesa_receipt_number', None)
    transaction.pop('payout_conversation_id', None)
    transaction.pop('payout_receipt_number', None)

    is_authorized = False
    if token:
        token_hash = hash_value(token)
        is_authorized = (
            token_hash == row['magic_token_hash'] or
            token_hash == row['seller_token_hash']
        )

    if not is_authorized:
        transaction['buyer_phone']  = mask_phone(transaction['buyer_phone'])
        transaction['seller_phone'] = mask_phone(transaction['seller_phone'])
        transaction.pop('payout_number', None)
        transaction.pop('payout_account', None)
        transaction.pop('item_details', None)

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

    amount = float(transaction['amount'])

    # Automated payout only works for MPESA sellers - Daraja's B2C API
    # cannot pay a Till or Paybill number directly. Those stay manual,
    # exactly as before.
    use_automated_payout = (
        DARAJA_B2C_CONFIGURED and transaction['payout_type'] == 'MPESA'
    )

    # SECURITY AUDIT FIX (CRITICAL - double-release race condition): the
    # checks above (token validity, token_used, status) were previously
    # read in one SELECT and acted on afterwards, with no lock held in
    # between. Two near-simultaneous requests carrying the same
    # still-valid, still-unused token (a double-click, a replayed
    # request, or a deliberately concurrent attack) could both pass
    # every check and both reach daraja_b2c_payout / the manual release
    # below, paying the seller twice for one transaction.
    #
    # This UPDATE closes that window by making the claim itself atomic:
    # it only succeeds (rowcount == 1) if the row *still* matches the
    # same status/token_used conditions at the moment of the write, not
    # just at the moment of the earlier read. SQLite serializes writers
    # against a single database file, so only one concurrent request can
    # ever win this race - the loser sees rowcount == 0 and is rejected
    # before any payout is ever attempted. token_used is burned here,
    # atomically, rather than after a successful Daraja call as before.
    claim_status = 'RELEASE_PROCESSING' if use_automated_payout else 'FUNDS_RELEASED'
    claim_params = [claim_status]
    claim_sql = 'UPDATE transactions SET status = ?, token_used = 1'
    if not use_automated_payout:
        claim_sql += ', released_at = ?'
        claim_params.append(datetime.now().isoformat())
    claim_sql += '''
        WHERE id = ? AND status IN ('FUNDS_SECURED', 'AWAITING_DELIVERY', 'DELIVERED')
        AND token_used = 0
    '''
    claim_params.append(transaction_id)

    cursor.execute(claim_sql, claim_params)
    conn.commit()

    if cursor.rowcount == 0:
        # Lost the race (or replayed/stale request) - another request
        # already claimed this release. Do NOT attempt any payout.
        conn.close()
        log_activity(transaction_id, 'RELEASE_FAILED', transaction['buyer_phone'],
                     'Release already claimed by a concurrent or prior request')
        return jsonify({'error': 'This release has already been processed.'}), 409

    if use_automated_payout:
        try:
            b2c_result = daraja_b2c_payout(
                transaction['payout_number'] or transaction['seller_phone'],
                amount, f"Escrow release {transaction_id}", transaction_id
            )
        except Exception as e:
            # We already claimed the release and burned the token above,
            # which is intentional here: once Daraja may have received
            # the request, blindly allowing a "retry" from the same link
            # risks a genuine double payout if this was a network error
            # rather than a real rejection. Leave status as
            # RELEASE_PROCESSING and payout_status FAILED for manual
            # reconciliation, same as a failed /b2c-result callback.
            cursor.execute('''
                UPDATE transactions SET payout_status = 'FAILED' WHERE id = ?
            ''', (transaction_id,))
            conn.commit()
            conn.close()
            log_activity(transaction_id, 'RELEASE_FAILED', transaction['buyer_phone'], f"B2C error: {e}")
            return jsonify({'error': 'Payout could not be started. Our team will follow up shortly.'}), 502

        if b2c_result.get('ResponseCode') != '0':
            cursor.execute('''
                UPDATE transactions SET payout_status = 'FAILED' WHERE id = ?
            ''', (transaction_id,))
            conn.commit()
            conn.close()
            log_activity(transaction_id, 'RELEASE_FAILED', transaction['buyer_phone'],
                         f"B2C rejected: {b2c_result.get('ResponseDescription', 'unknown')}")
            return jsonify({'error': 'Payout could not be started. Our team will follow up shortly.'}), 502

        # Daraja accepted the payout request - status/token were already
        # claimed atomically above. Just record the ConversationID for
        # matching the eventual /b2c-result callback.
        cursor.execute('''
            UPDATE transactions
            SET payout_status = 'PROCESSING', payout_conversation_id = ?
            WHERE id = ?
        ''', (b2c_result.get('ConversationID'), transaction_id))
        conn.commit()
        conn.close()

        log_activity(transaction_id, 'PAYOUT_PROCESSING', transaction['buyer_phone'], f"Amount: {amount}")

        send_sms(
            transaction['buyer_phone'],
            f"SecureEscrow Kenya\nRelease confirmed. KES {amount:,.0f} is being sent to the "
            f"seller now - you'll get a final confirmation shortly.",
            transaction_id, 'release_processing_buyer'
        )

        return jsonify({
            'success': True,
            'message': 'Release confirmed. Payout to seller is processing.',
            'amount':  amount
        })

    # Manual payout path (Till/Paybill sellers, or B2C not configured
    # yet) - status, released_at and token_used were already set
    # atomically above.
    conn.close()

    log_activity(transaction_id, 'FUNDS_RELEASED', transaction['buyer_phone'], f"Amount: {amount}")

    send_seller_release_notification(
        transaction['seller_phone'], transaction_id,
        transaction['buyer_phone'], transaction['item_name'],
        amount, transaction['payout_type']
    )

    return jsonify({
        'success': True,
        'message': 'Funds released to seller successfully',
        'amount':  amount
    })


@app.route('/api/mpesa/b2c-result', methods=['POST'])
@limiter.limit('200 per hour')
def b2c_result():
    """Safaricom calls this once a B2C payout actually completes (or
    fails). Like the STK callback, this is unauthenticated by necessity,
    so besides the shared callback secret it only ever acts on
    ConversationIDs it recognizes."""
    if not _callback_secret_valid():
        return jsonify({'ResultCode': 1, 'ResultDesc': 'Rejected'}), 403

    payload = request.json or {}
    log_mpesa_callback('b2c_result', payload)

    try:
        result = payload['Result']
        conversation_id = result['ConversationID']
        result_code = result['ResultCode']
    except (KeyError, TypeError):
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM transactions WHERE payout_conversation_id = ?', (conversation_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    transaction = dict(row)
    transaction_id = transaction['id']

    if transaction['payout_status'] == 'COMPLETED':
        conn.close()
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    if result_code != 0:
        cursor.execute('''
            UPDATE transactions SET payout_status = 'FAILED' WHERE id = ?
        ''', (transaction_id,))
        conn.commit()
        conn.close()
        log_activity(transaction_id, 'PAYOUT_FAILED', None, result.get('ResultDesc', 'Payout failed'))
        # A failed payout after the buyer's release token is already
        # burned needs a human - notify both sides rather than silently
        # leaving the seller unpaid.
        send_sms(
            transaction['seller_phone'],
            f"SecureEscrow Kenya\nAutomatic payout for transaction {transaction_id} failed. "
            f"Our team will process this manually - contact support if you don't hear back soon.",
            transaction_id, 'payout_failed_seller'
        )
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})

    result_params = {
        item['Key']: item.get('Value')
        for item in result.get('ResultParameters', {}).get('ResultParameter', [])
    }
    receipt_number = result_params.get('TransactionReceipt', '')

    # SECURITY AUDIT FIX (MEDIUM - dispute overwrite race): a dispute can
    # be raised (see /status) while a payout is RELEASE_PROCESSING, in
    # the window between the buyer clicking release and this callback
    # arriving. The money has genuinely already left via Daraja by the
    # time this callback fires - that's a fact, not something a dispute
    # can undo - so payout_status/receipt are always recorded. But the
    # transaction's `status` itself is only advanced to FUNDS_RELEASED if
    # it hasn't since become DISPUTED, so a dispute raised in that window
    # doesn't get silently erased. Davies still needs to know the payout
    # completed despite the dispute, so that's logged explicitly too.
    cursor.execute('''
        UPDATE transactions
        SET status = CASE WHEN status = 'DISPUTED' THEN status ELSE 'FUNDS_RELEASED' END,
            payout_status = 'COMPLETED', payout_receipt_number = ?, released_at = ?
        WHERE id = ?
    ''', (receipt_number, datetime.now().isoformat(), transaction_id))
    conn.commit()
    conn.close()

    if transaction['status'] == 'DISPUTED':
        log_activity(transaction_id, 'PAYOUT_COMPLETED_DURING_DISPUTE', None,
                     f"Receipt: {receipt_number} - payout completed via Daraja after a dispute "
                     f"was raised; status kept as DISPUTED for manual review, but funds did move.")
    else:
        log_activity(transaction_id, 'PAYOUT_COMPLETED', None, f"Receipt: {receipt_number}")

    send_sms(
        transaction['seller_phone'],
        f"SecureEscrow Kenya\nKES {float(transaction['amount']):,.0f} has been sent to your "
        f"M-PESA for transaction {transaction_id}. Receipt: {receipt_number}",
        transaction_id, 'payout_completed_seller'
    )

    return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})


@app.route('/api/mpesa/b2c-timeout', methods=['POST'])
@limiter.limit('200 per hour')
def b2c_timeout():
    """Safaricom calls this if a B2C request times out entirely (rare -
    most outcomes arrive via /b2c-result instead)."""
    if not _callback_secret_valid():
        return jsonify({'ResultCode': 1, 'ResultDesc': 'Rejected'}), 403
    payload = request.json or {}
    log_mpesa_callback('b2c_timeout', payload)
    return jsonify({'ResultCode': 0, 'ResultDesc': 'Accepted'})


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

    # AUDIT FIX (MEDIUM): payout details used to be editable at any
    # transaction status, including RELEASE_PROCESSING/FUNDS_RELEASED.
    # Changing the payout number after a payout was already dispatched
    # to the old one (or is actively in flight) doesn't move already-sent
    # money, but it corrupts the stored record of where funds actually
    # went - support/dispute review would show a payout number that
    # doesn't match what Daraja was actually told. Lock it once release
    # has started.
    locked_statuses = ['RELEASE_PROCESSING', 'FUNDS_RELEASED']
    if transaction['status'] in locked_statuses:
        conn.close()
        return jsonify({'error': 'Payout method can no longer be changed - release has already started.'}), 400

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
    # SECURITY: this endpoint used to accept a bare phone number as
    # "proof" of being the buyer or seller (no token required). Since
    # phone numbers are known to both parties in a transaction (and were
    # also exposed by the old, unmasked GET endpoint above), that path
    # let either party - or a third party who obtained the numbers -
    # forge status changes as if performed by the other side. A valid
    # token is now required for every status change, no exceptions.
    data       = request.json or {}
    new_status = data.get('status')
    token      = data.get('token', '')

    if not new_status:
        return jsonify({'error': 'Status is required'}), 400

    valid_statuses = ['AWAITING_DELIVERY', 'DELIVERED', 'DISPUTED']
    if new_status not in valid_statuses:
        return jsonify({'error': 'Invalid status'}), 400

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

    token_hash = hash_value(token)
    if token_hash == transaction['magic_token_hash']:
        verified_phone = transaction['buyer_phone']
    elif token_hash == transaction['seller_token_hash']:
        verified_phone = transaction['seller_phone']
    else:
        conn.close()
        log_activity(transaction_id, 'STATUS_UPDATE_FAILED', None, 'Invalid token')
        return jsonify({'error': 'Invalid token'}), 403

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

    # SECURITY AUDIT FIX (CRITICAL): this endpoint used to hardcode
    # status='FUNDS_SECURED' immediately on order creation, with no STK
    # Push, no Daraja call, no payment verification of any kind. Anyone
    # could place an order that the system showed as fully paid without
    # ever paying anything - if that "Funds Secured" signal were used to
    # decide when to ship a real phone, orders could be fulfilled for
    # free. This now mirrors the exact same real payment-collection flow
    # used by the main escrow endpoint: an STK Push is sent for the real
    # amount, and status only becomes FUNDS_SECURED once Safaricom's own
    # callback confirms the payment (see stk_callback above).
    initial_status = 'AWAITING_PAYMENT' if DARAJA_CONFIGURED else 'FUNDS_SECURED'
    initial_payment_status = 'PENDING' if DARAJA_CONFIGURED else 'PAID'

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO transactions (
            id, magic_token_hash, seller_token_hash, token_expires_at,
            item_name, item_details, amount, fee_amount, total_amount,
            buyer_phone, seller_phone,
            transaction_type, delivery_deadline, payout_type, payout_number, payout_account,
            status, created_at, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        transaction_id, magic_token_hash, seller_token_hash, token_expires_at,
        item_name, item_details, amount, 0, amount,
        normalized_buyer, normalized_seller,
        'PHONE_IMPORT', product.get('eta', ''),
        IMPORT_PAYOUT_TYPE, IMPORT_PAYOUT_NUMBER, IMPORT_PAYOUT_ACCOUNT,
        initial_status, datetime.now().isoformat(), initial_payment_status
    ))
    conn.commit()
    conn.close()

    log_activity(transaction_id, 'CREATED', normalized_buyer, f"Import order: {item_name} - Amount: {amount}")

    if DARAJA_CONFIGURED:
        try:
            stk_result = daraja_stk_push(
                normalized_buyer, amount, transaction_id, item_name, transaction_id
            )
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE transactions
                SET mpesa_checkout_request_id = ?, mpesa_merchant_request_id = ?
                WHERE id = ?
            ''', (
                stk_result.get('CheckoutRequestID'),
                stk_result.get('MerchantRequestID'),
                transaction_id
            ))
            conn.commit()
            conn.close()
            stk_sent = stk_result.get('ResponseCode') == '0'
        except Exception as e:
            log_activity(transaction_id, 'STK_PUSH_FAILED', None, str(e))
            stk_sent = False

        tracking_link = f"{FRONTEND_BASE_URL}?id={transaction_id}&token={magic_token}"
        if stk_sent:
            buyer_message = (
                f"SecureEscrow Kenya\nEnter your M-PESA PIN on the prompt sent to your "
                f"phone to pay KES {amount:,.0f} for {item_name}.\n\nTrack: {tracking_link}"
            )
        else:
            buyer_message = (
                f"SecureEscrow Kenya\nWe couldn't send the M-PESA payment prompt for your "
                f"order. Please retry payment.\n\nTrack: {tracking_link}"
            )
        send_sms(normalized_buyer, buyer_message, transaction_id, 'stk_push_prompt')

        seller_tracking_link = f"{FRONTEND_BASE_URL}?id={transaction_id}&token={seller_token}"
        send_sms(
            normalized_seller,
            f"SecureEscrow Kenya\nNew phone import order: {item_name} (KES {amount:,.0f}).\n"
            f"Payment has been requested from the buyer - you'll get another SMS once it's "
            f"confirmed.\n\nTrack: {seller_tracking_link}",
            transaction_id, 'seller_awaiting_payment'
        )

        return jsonify({
            'success':       True,
            'transactionId': transaction_id,
            'paymentRequired': True,
            'stkPushSent':   stk_sent,
            'message': ('Check your phone and enter your M-PESA PIN to complete payment.'
                        if stk_sent else
                        'Order created, but the payment prompt failed to send. Please retry payment.')
        }), 201

    # Legacy manual-payment path - only reachable if Daraja isn't
    # configured yet (sandbox/testing), same as the main escrow endpoint.
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

    # AUDIT FIX (LOW): this endpoint is admin-only so the blast radius was
    # always small, but it forwarded whatever bytes it received straight
    # to imgbb with no check that they're actually an image. A quick
    # magic-byte check rejects obviously-wrong uploads before they ever
    # leave the server, rather than relying entirely on imgbb's own
    # validation.
    image_signatures = (b'\xff\xd8\xff', b'\x89PNG\r\n\x1a\n', b'GIF87a', b'GIF89a', b'RIFF')
    if not any(image_bytes.startswith(sig) for sig in image_signatures):
        return jsonify({'error': 'That file does not look like a valid image'}), 400

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