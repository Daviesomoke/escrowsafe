








/**
 * SecureEscrow Kenya - Phone Import Shop
 * Fetches the curated product catalog and handles placing an order
 * as a normal escrow transaction, routed to the business seller account.
 */

(function () {
    'use strict';

    // ---------------------------------------------------------------
    //  Must match the API_BASE_URL used in script.js. When deploying,
    //  update both to your live Render backend URL, e.g.:
    //  const API_BASE_URL = 'https://your-app-name.onrender.com/api';
    // ---------------------------------------------------------------
    const API_BASE_URL = 'https://your-app-name.onrender.com/api';

    let selectedProduct = null;

    function formatKES(amount) {
        return 'KES ' + Number(amount).toLocaleString('en-KE');
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function validateKenyanPhone(phone) {
        const clean = (phone || '').replace(/\s+/g, '');
        return /^(0|\+254)[71]\d{8}$/.test(clean);
    }

    // ============================================================================
    // TOAST (self-contained, uses the shared .toast-container CSS)
    // ============================================================================

    const Toast = {
        container: null,
        ensure: function () {
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.className = 'toast-container';
                document.body.appendChild(this.container);
            }
        },
        show: function (message, type) {
            this.ensure();
            const toast = document.createElement('div');
            toast.className = 'toast ' + (type || 'info');
            toast.innerHTML =
                '<div class="toast-content">' +
                '<div class="toast-title">' + (type === 'error' ? 'Error' : 'Notice') + '</div>' +
                '<div class="toast-message">' + escapeHtml(message) + '</div>' +
                '</div>' +
                '<button type="button" class="toast-close" aria-label="Dismiss">&times;</button>';
            toast.querySelector('.toast-close').addEventListener('click', function () {
                toast.remove();
            });
            this.container.appendChild(toast);
            setTimeout(function () {
                if (toast.parentElement) toast.remove();
            }, 6000);
        }
    };

    // ============================================================================
    // PRODUCT GRID
    // ============================================================================

    function renderProducts(products) {
        const grid = document.getElementById('importGrid');
        if (!grid) return;

        if (!products || products.length === 0) {
            grid.innerHTML = '<div class="import-empty">No phones available right now — check back soon.</div>';
            return;
        }

        grid.innerHTML = products.map(function (product) {
            const badge = product.badge
                ? '<span class="import-badge">' + escapeHtml(product.badge) + '</span>'
                : '';
            const specs = (product.specs || [])
                .map(function (spec) { return '<li>' + escapeHtml(spec) + '</li>'; })
                .join('');

            return (
                '<div class="import-card">' +
                    badge +
                    '<div class="import-card-image">' +
                        '<img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.name) + '" loading="lazy" ' +
                        'onerror="this.parentElement.classList.add(\'import-card-image--fallback\'); this.remove();">' +
                    '</div>' +
                    '<div class="import-card-body">' +
                        '<h3 class="import-card-name">' + escapeHtml(product.name) + '</h3>' +
                        '<p class="import-card-condition">' + escapeHtml(product.condition) + '</p>' +
                        '<ul class="import-card-specs">' + specs + '</ul>' +
                        '<div class="import-card-footer">' +
                            '<div class="import-card-price">' + formatKES(product.price) + '</div>' +
                            '<div class="import-card-eta">Delivered in ' + escapeHtml(product.eta || 'a few days') + '</div>' +
                        '</div>' +
                        '<button type="button" class="btn btn-primary btn-full import-order-btn" data-product-id="' + escapeHtml(product.id) + '">' +
                            'Order This Phone' +
                        '</button>' +
                    '</div>' +
                '</div>'
            );
        }).join('');

        grid.querySelectorAll('.import-order-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const product = products.find(function (p) { return p.id === btn.getAttribute('data-product-id'); });
                if (product) openOrderModal(product);
            });
        });
    }

    async function loadProducts() {
        const loadingEl = document.getElementById('importLoading');
        try {
            const response = await fetch(API_BASE_URL + '/import/products');
            const data = await response.json();
            renderProducts(data.products || []);
        } catch (err) {
            const grid = document.getElementById('importGrid');
            if (grid) {
                grid.innerHTML = '<div class="import-empty">Couldn\'t load phones right now. Please refresh the page.</div>';
            }
        } finally {
            if (loadingEl && loadingEl.parentElement) loadingEl.remove();
        }
    }

    // ============================================================================
    // ORDER MODAL
    // ============================================================================

    function openOrderModal(product) {
        selectedProduct = product;

        document.getElementById('orderProductName').textContent = product.name;
        document.getElementById('orderTotalAmount').textContent = formatKES(product.price);
        document.getElementById('orderStepForm').style.display = 'block';
        document.getElementById('orderStepSuccess').style.display = 'none';
        document.getElementById('orderForm').reset();

        const overlay = document.getElementById('orderModalOverlay');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeOrderModal() {
        const overlay = document.getElementById('orderModalOverlay');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        selectedProduct = null;
    }

    async function submitOrder(event) {
        event.preventDefault();
        if (!selectedProduct) return;

        const buyerName = document.getElementById('orderBuyerName').value.trim();
        const buyerPhone = document.getElementById('orderBuyerPhone').value.trim();
        const city = document.getElementById('orderCity').value.trim();
        const address = document.getElementById('orderAddress').value.trim();
        const notes = document.getElementById('orderNotes').value.trim();

        if (!buyerName) {
            Toast.show('Please enter your name.', 'error');
            return;
        }
        if (!validateKenyanPhone(buyerPhone)) {
            Toast.show('Please enter a valid Kenyan phone number.', 'error');
            return;
        }

        const submitBtn = document.getElementById('orderSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Placing Order…';

        try {
            const response = await fetch(API_BASE_URL + '/import/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: selectedProduct.id,
                    buyerName: buyerName,
                    buyerPhone: buyerPhone,
                    deliveryCity: city,
                    deliveryAddress: address,
                    notes: notes
                })
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                Toast.show(result.error || 'Something went wrong placing your order.', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Confirm & Pay Into Escrow';
                return;
            }

            document.getElementById('orderSuccessText').textContent =
                'Order ' + result.transactionId + ' for ' + selectedProduct.name + ' — ' + formatKES(selectedProduct.price) + '.';
            document.getElementById('orderStepForm').style.display = 'none';
            document.getElementById('orderStepSuccess').style.display = 'block';
        } catch (err) {
            Toast.show('Network error. Please check your connection and try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm & Pay Into Escrow';
        }
    }

    // ============================================================================
    // INIT
    // ============================================================================

    document.addEventListener('DOMContentLoaded', function () {
        loadProducts();

        const overlay = document.getElementById('orderModalOverlay');
        const closeBtn = document.getElementById('orderModalClose');
        const form = document.getElementById('orderForm');

        if (closeBtn) closeBtn.addEventListener('click', closeOrderModal);
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) closeOrderModal();
            });
        }
        if (form) form.addEventListener('submit', submitOrder);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay && overlay.classList.contains('active')) {
                closeOrderModal();
            }
        });
    });
})();