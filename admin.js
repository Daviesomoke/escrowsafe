








/**
 * SecureEscrow Kenya - Catalog Admin
 * Private tool for managing the phone import catalog from a phone browser.
 * Not linked anywhere in the public site - keep this URL to yourself.
 */

(function () {
    'use strict';

    // Must match the API_BASE_URL used in script.js / import.js.
    const API_BASE_URL = 'https://your-app-name.onrender.com/api';
    const STORAGE_KEY = 'secureescrow_admin_key';

    let adminKey = '';
    let products = [];
    let pendingPhotoFile = null;

    function headers(extra) {
        return Object.assign({ 'X-Admin-Key': adminKey }, extra || {});
    }

    // ============================================================================
    // TOAST + CONFIRM DIALOG
    // ============================================================================
    // admin.html previously used raw alert()/confirm() - functional but it
    // looks like a browser default popup, not part of this app. These reuse
    // the exact same .toast / .modal-overlay CSS already defined in
    // style.css (which this page already links), so it's visually
    // consistent with the rest of the site rather than a one-off.

    const Toast = {
        container: null,
        icons: {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
            error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
        },
        ensure: function () {
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.className = 'toast-container';
                document.body.appendChild(this.container);
            }
        },
        show: function (message, type, title) {
            this.ensure();
            const toast = document.createElement('div');
            toast.className = 'toast ' + (type || 'info');
            toast.innerHTML =
                '<span class="toast-icon">' + (this.icons[type] || '') + '</span>' +
                '<div class="toast-content">' +
                '<div class="toast-title">' + (title || (type === 'error' ? 'Error' : 'Done')) + '</div>' +
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

    const ConfirmDialog = {
        overlay: null,
        ensure: function () {
            if (this.overlay) return;
            this.overlay = document.createElement('div');
            this.overlay.className = 'modal-overlay';
            this.overlay.innerHTML =
                '<div class="modal confirm-dialog">' +
                    '<div class="confirm-dialog-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg></div>' +
                    '<div class="confirm-dialog-title"></div>' +
                    '<div class="confirm-dialog-message"></div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn-outline confirm-dialog-cancel">Cancel</button>' +
                        '<button type="button" class="btn-danger confirm-dialog-confirm"></button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(this.overlay);
        },
        show: function (options) {
            this.ensure();
            const dialog = this.overlay.querySelector('.confirm-dialog');
            const titleEl = this.overlay.querySelector('.confirm-dialog-title');
            const messageEl = this.overlay.querySelector('.confirm-dialog-message');
            const confirmBtn = this.overlay.querySelector('.confirm-dialog-confirm');
            const cancelBtn = this.overlay.querySelector('.confirm-dialog-cancel');

            dialog.className = 'modal confirm-dialog tone-danger';
            titleEl.textContent = options.title || 'Are you sure?';
            messageEl.textContent = options.message || '';
            confirmBtn.textContent = options.confirmText || 'Confirm';

            const overlay = this.overlay;
            return new Promise(function (resolve) {
                function close(result) {
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                    confirmBtn.removeEventListener('click', onConfirm);
                    cancelBtn.removeEventListener('click', onCancel);
                    overlay.removeEventListener('click', onOverlayClick);
                    resolve(result);
                }
                function onConfirm() { close(true); }
                function onCancel() { close(false); }
                function onOverlayClick(e) { if (e.target === overlay) close(false); }

                confirmBtn.addEventListener('click', onConfirm);
                cancelBtn.addEventListener('click', onCancel);
                overlay.addEventListener('click', onOverlayClick);

                overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
        }
    };

    function formatKES(amount) {
        return 'KES ' + Number(amount).toLocaleString('en-KE');
    }

    // ============================================================================
    // GATE
    // ============================================================================

    async function tryUnlock(key) {
        const errorEl = document.getElementById('adminGateError');
        errorEl.textContent = '';
        try {
            const res = await fetch(API_BASE_URL + '/admin/import-products', {
                headers: { 'X-Admin-Key': key }
            });
            if (res.status === 401) {
                errorEl.textContent = 'Wrong key. Try again.';
                return false;
            }
            if (!res.ok) {
                errorEl.textContent = 'Could not reach the server. Check your connection.';
                return false;
            }
            adminKey = key;
            localStorage.setItem(STORAGE_KEY, key);
            showDashboard();
            return true;
        } catch (err) {
            errorEl.textContent = 'Could not reach the server. Check your connection.';
            return false;
        }
    }

    function showDashboard() {
        document.getElementById('adminGate').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'block';
        loadProducts();
    }

    // ============================================================================
    // PRODUCT LIST
    // ============================================================================

    async function loadProducts() {
        const listEl = document.getElementById('adminProductList');
        try {
            const res = await fetch(API_BASE_URL + '/admin/import-products', { headers: headers() });
            const data = await res.json();
            products = data.products || [];
            renderProductList();
        } catch (err) {
            listEl.innerHTML = '<div class="import-empty">Could not load the catalog. Pull to refresh.</div>';
        }
    }

    function renderProductList() {
        const listEl = document.getElementById('adminProductList');
        if (products.length === 0) {
            listEl.innerHTML = '<div class="import-empty">No phones yet. Tap "Add New Phone" to start.</div>';
            return;
        }

        listEl.innerHTML = products.map(function (p) {
            const imgHtml = p.image
                ? '<img src="' + p.image + '" class="admin-row-thumb" alt="">'
                : '<div class="admin-row-thumb admin-row-thumb--empty">📱</div>';
            const statusLabel = p.active ? '' : '<span class="admin-row-hidden">Hidden</span>';
            return (
                '<div class="admin-row" data-id="' + p.id + '">' +
                    imgHtml +
                    '<div class="admin-row-info">' +
                        '<div class="admin-row-name">' + escapeHtml(p.name) + ' ' + statusLabel + '</div>' +
                        '<div class="admin-row-price">' + formatKES(p.price) + '</div>' +
                    '</div>' +
                    '<div class="admin-row-actions">' +
                        '<button type="button" class="admin-edit-btn" data-id="' + p.id + '">Edit</button>' +
                        '<button type="button" class="admin-delete-btn" data-id="' + p.id + '">Delete</button>' +
                    '</div>' +
                '</div>'
            );
        }).join('');

        listEl.querySelectorAll('.admin-edit-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const product = products.find(function (p) { return p.id === btn.getAttribute('data-id'); });
                if (product) openForm(product);
            });
        });
        listEl.querySelectorAll('.admin-delete-btn').forEach(function (btn) {
            btn.addEventListener('click', function () { deleteProduct(btn.getAttribute('data-id')); });
        });
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    async function deleteProduct(id) {
        const product = products.find(function (p) { return p.id === id; });
        const confirmed = await ConfirmDialog.show({
            title: 'Remove this phone?',
            message: product
                ? '"' + product.name + '" will be removed from the catalog. This can\'t be undone.'
                : 'This will be removed from the catalog. This can\'t be undone.',
            confirmText: 'Remove'
        });
        if (!confirmed) return;

        try {
            const res = await fetch(API_BASE_URL + '/admin/import-products/delete', {
                method: 'POST',
                headers: headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ id: id })
            });
            if (!res.ok) throw new Error('Delete failed');
            Toast.show('Removed from the catalog.', 'success');
            loadProducts();
        } catch (err) {
            Toast.show('Could not delete. Check your connection and try again.', 'error');
        }
    }

    // ============================================================================
    // ADD / EDIT FORM
    // ============================================================================

    function openForm(product) {
        pendingPhotoFile = null;
        const form = document.getElementById('adminProductForm');
        form.reset();
        document.getElementById('adminFormStatus').textContent = '';
        document.getElementById('adminPhotoPreview').style.display = 'none';
        document.getElementById('adminPhotoLabelText').textContent = 'Tap to take or choose a photo';

        if (product) {
            document.getElementById('adminFormTitle').textContent = 'Edit Phone';
            document.getElementById('adminProductId').value = product.id;
            document.getElementById('adminName').value = product.name;
            document.getElementById('adminCondition').value = product.condition || '';
            document.getElementById('adminPrice').value = product.price;
            document.getElementById('adminSpecs').value = (product.specs || []).join(', ');
            document.getElementById('adminEta').value = product.eta || '';
            document.getElementById('adminBadge').value = product.badge || '';
            document.getElementById('adminActive').checked = !!product.active;
            if (product.image) {
                const preview = document.getElementById('adminPhotoPreview');
                preview.src = product.image;
                preview.style.display = 'block';
                document.getElementById('adminPhotoLabelText').textContent = 'Tap to replace photo';
            }
            form.dataset.existingImage = product.image || '';
        } else {
            document.getElementById('adminFormTitle').textContent = 'Add New Phone';
            document.getElementById('adminProductId').value = '';
            document.getElementById('adminActive').checked = true;
            form.dataset.existingImage = '';
        }

        document.getElementById('adminFormOverlay').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeForm() {
        document.getElementById('adminFormOverlay').classList.remove('active');
        document.body.style.overflow = '';
    }

    function onPhotoSelected(e) {
        const file = e.target.files[0];
        if (!file) return;
        pendingPhotoFile = file;

        const reader = new FileReader();
        reader.onload = function (ev) {
            const preview = document.getElementById('adminPhotoPreview');
            preview.src = ev.target.result;
            preview.style.display = 'block';
            document.getElementById('adminPhotoLabelText').textContent = 'Tap to change photo';
        };
        reader.readAsDataURL(file);
    }

    async function uploadPhotoIfNeeded() {
        if (!pendingPhotoFile) {
            return document.getElementById('adminProductForm').dataset.existingImage || '';
        }
        const formData = new FormData();
        formData.append('image', pendingPhotoFile);

        const res = await fetch(API_BASE_URL + '/admin/upload-image', {
            method: 'POST',
            headers: headers(), // no Content-Type - browser sets multipart boundary
            body: formData
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
            throw new Error(result.error || 'Photo upload failed');
        }
        return result.url;
    }

    async function submitForm(e) {
        e.preventDefault();
        const statusEl = document.getElementById('adminFormStatus');
        const saveBtn = document.getElementById('adminSaveBtn');
        statusEl.textContent = '';
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        try {
            let imageUrl = '';
            if (pendingPhotoFile) {
                saveBtn.textContent = 'Uploading photo…';
                imageUrl = await uploadPhotoIfNeeded();
            } else {
                imageUrl = document.getElementById('adminProductForm').dataset.existingImage || '';
            }

            saveBtn.textContent = 'Saving…';
            const payload = {
                id: document.getElementById('adminProductId').value,
                name: document.getElementById('adminName').value.trim(),
                condition: document.getElementById('adminCondition').value.trim() || 'Grade A (Excellent)',
                price: parseFloat(document.getElementById('adminPrice').value),
                specs: document.getElementById('adminSpecs').value,
                eta: document.getElementById('adminEta').value.trim() || '10-14 days',
                badge: document.getElementById('adminBadge').value.trim(),
                image: imageUrl,
                active: document.getElementById('adminActive').checked
            };

            const res = await fetch(API_BASE_URL + '/admin/import-products/save', {
                method: 'POST',
                headers: headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(payload)
            });
            const result = await res.json();

            if (!res.ok || !result.success) {
                statusEl.textContent = result.error || 'Could not save. Please try again.';
                return;
            }

            closeForm();
            loadProducts();
        } catch (err) {
            statusEl.textContent = err.message || 'Something went wrong. Please try again.';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Phone';
        }
    }

    // ============================================================================
    // INIT
    // ============================================================================

    document.addEventListener('DOMContentLoaded', function () {
        const savedKey = localStorage.getItem(STORAGE_KEY);
        if (savedKey) {
            adminKey = savedKey;
            tryUnlock(savedKey);
        }

        document.getElementById('adminUnlockBtn').addEventListener('click', function () {
            const key = document.getElementById('adminKeyInput').value.trim();
            if (key) tryUnlock(key);
        });
        document.getElementById('adminKeyInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') document.getElementById('adminUnlockBtn').click();
        });

        document.getElementById('adminLogoutBtn').addEventListener('click', function () {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        });

        document.getElementById('adminAddBtn').addEventListener('click', function () { openForm(null); });
        document.getElementById('adminFormClose').addEventListener('click', closeForm);
        document.getElementById('adminFormOverlay').addEventListener('click', function (e) {
            if (e.target === document.getElementById('adminFormOverlay')) closeForm();
        });

        document.getElementById('adminPhotoInput').addEventListener('change', onPhotoSelected);

        document.getElementById('adminProductForm').addEventListener('submit', submitForm);
    });
})();