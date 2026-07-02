








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
        if (!confirm('Remove this phone from the catalog?')) return;
        try {
            await fetch(API_BASE_URL + '/admin/import-products/delete', {
                method: 'POST',
                headers: headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ id: id })
            });
            loadProducts();
        } catch (err) {
            alert('Could not delete. Check your connection and try again.');
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