








/**
 * SecureEscrow Kenya - Frontend Client
 * Magic Link Authorization System with Payout Methods
 * Connects to Flask Backend API
 * 
 * OTP system removed - ready for future integration
 */

(function() {
    'use strict';

    // ============================================================================
    // CONFIGURATION
    // ============================================================================


    // ---------------------------------------------------------------
    //  When deploying to Render, replace the URL below with your
    //  actual Render backend URL, e.g.:
    //  const API_BASE_URL = 'https://your-app-name.onrender.com/api';
    //
    //  NOTE: the backend now restricts CORS to specific origins via the
    //  ALLOWED_ORIGINS environment variable (see app.py / .env.example).
    //  Make sure the domain this script is served from is included in
    //  that list, or API requests will be blocked by the browser.
    // ---------------------------------------------------------------
    const API_BASE_URL = 'https://your-app-name.onrender.com/api';
    

    
    const CONFIG = {
        WHATSAPP_NUMBER: '254791190667',
        ESCROW_FEE_PERCENTAGE: 0.11,
        LOADER_DELAY: 2200,
        COUNTER_ANIMATION_DURATION: 1500,
        TOAST_DEFAULT_DURATION: 5000,
        WHATSAPP_TOOLTIP_DELAY: 2000,
        COUNTER_START_DELAY: 2500,
        WELCOME_MESSAGE_DELAY: 2800
    };

    const TRANSACTION_STATUS = {
        FUNDS_SECURED: 'FUNDS_SECURED',
        AWAITING_DELIVERY: 'AWAITING_DELIVERY',
        DELIVERED: 'DELIVERED',
        FUNDS_RELEASED: 'FUNDS_RELEASED',
        DISPUTED: 'DISPUTED'
    };

    // ============================================================================
    // API CLIENT
    // ============================================================================
    
    const ApiClient = {
        
        async createTransaction(data) {
            const response = await fetch(`${API_BASE_URL}/transactions/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return response.json();
        },
        
        async getTransaction(transactionId, token) {
            const url = token
                ? `${API_BASE_URL}/transactions/${transactionId}?token=${encodeURIComponent(token)}`
                : `${API_BASE_URL}/transactions/${transactionId}`;
            const response = await fetch(url);
            return response.json();
        },
        
        async validateToken(transactionId, token) {
            const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            return response.json();
        },
        
        async trackByPhone(phone) {
            const response = await fetch(`${API_BASE_URL}/transactions/track/${phone}`);
            return response.json();
        },
        
        async updateStatus(transactionId, status, phone, token) {
            const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, phone, token })
            });
            return response.json();
        },
        
        async releaseFunds(transactionId, token) {
            const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/release`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            return response.json();
        },
        
        async resendMagicLink(transactionId, phone) {
            const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/resend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            return response.json();
        },
        
        async updatePayout(transactionId, token, payoutData) {
            const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/payout`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, ...payoutData })
            });
            return response.json();
        },
        
        async getPayout(transactionId, token) {
            const url = `${API_BASE_URL}/transactions/${transactionId}/payout?token=${encodeURIComponent(token || '')}`;
            const response = await fetch(url);
            return response.json();
        }
    };

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================
    
    function validateKenyanPhone(phone) {
        const cleanPhone = phone.replace(/\s+/g, '');
        const phoneRegex = /^(0|\+254)[71]\d{8}$/;
        return phoneRegex.test(cleanPhone);
    }

    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function formatKES(amount) {
        return 'KES ' + amount.toLocaleString('en-KE');
    }
    
    function getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    /**
     * Escape a value for safe insertion into innerHTML.
     * SECURITY: transaction.item_name (and other user-supplied fields)
     * must never be inserted into innerHTML without this - otherwise a
     * malicious "item name" containing HTML/script could execute in the
     * browser of anyone viewing the transaction (stored XSS).
     */
    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Remove the magic-link "token" (and optionally "id") query
     * parameters from the visible URL without reloading the page.
     *
     * SECURITY: magic tokens arrive via SMS as part of a URL. Once the
     * page has read and validated the token, leaving it visible in the
     * address bar means it persists in browser history, can be leaked
     * via the Referer header on outbound links, or seen by anyone
     * looking at the screen/screenshots. We strip it immediately after
     * use while keeping the transaction id for convenience.
     */
    function stripTokenFromUrl() {
        if (!window.history || !window.history.replaceState) {
            return;
        }
        const url = new URL(window.location.href);
        if (url.searchParams.has('token')) {
            url.searchParams.delete('token');
            window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash);
        }
    }

    // ============================================================================
    // PAGE LOADER
    // ============================================================================
    
    function initializePageLoader() {
        const loader = document.getElementById('pageLoader');
        if (!loader) return;

        const statusEl = document.getElementById('loaderStatus');
        const statusMessages = [
            'Initializing secure environment…',
            'Verifying encryption layer…',
            'Loading transaction engine…',
            'Ready'
        ];

        if (statusEl) {
            let msgIdx = 0;
            const interval = setInterval(function() {
                msgIdx++;
                if (msgIdx >= statusMessages.length) { clearInterval(interval); return; }
                statusEl.style.opacity = '0';
                setTimeout(function() {
                    statusEl.textContent = statusMessages[msgIdx];
                    statusEl.style.opacity = '1';
                }, 200);
            }, Math.floor(CONFIG.LOADER_DELAY / statusMessages.length));
        }

        setTimeout(function() {
            loader.classList.add('fade-out');
            setTimeout(function() {
                if (loader && loader.parentNode) {
                    loader.parentNode.removeChild(loader);
                }
            }, 600);
        }, CONFIG.LOADER_DELAY);
    }

    // ============================================================================
    // ANIMATED METRICS COUNTERS
    // ============================================================================
    
    function initializeAnimatedCounters() {
        const counters = document.querySelectorAll('.counter');
        
        if (!counters.length) {
            return;
        }
        
        counters.forEach(function(counter) {
            const targetValue = parseInt(counter.getAttribute('data-target'), 10);
            let currentValue = 0;
            const stepTime = 20;
            const totalSteps = CONFIG.COUNTER_ANIMATION_DURATION / stepTime;
            const incrementPerStep = targetValue / totalSteps;
            
            const animationTimer = setInterval(function() {
                currentValue += incrementPerStep;
                
                if (currentValue >= targetValue) {
                    counter.textContent = targetValue;
                    clearInterval(animationTimer);
                } else {
                    counter.textContent = Math.floor(currentValue);
                }
            }, stepTime);
        });
    }

    // ============================================================================
    // TOAST NOTIFICATION SYSTEM
    // ============================================================================
    
    const ToastManager = {
        container: null,
        icons: {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
            error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/></svg>',
            info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16v-4M12 8h.01"/></svg>'
        },
        titles: { success: 'Done', error: 'Error', warning: 'Heads up', info: 'Note' },
        
        ensureContainerExists: function() {
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.className = 'toast-container';
                document.body.appendChild(this.container);
            }
        },
        
        display: function(message, type, title, duration) {
            this.ensureContainerExists();
            
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            
            const displayTitle = title || this.titles[type] || 'Notice';
            const displayIcon = this.icons[type] || this.icons.info;
            
            toast.innerHTML = `
                <span class="toast-icon">${displayIcon}</span>
                <div class="toast-content">
                    <div class="toast-title">${displayTitle}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button type="button" class="toast-close" aria-label="Dismiss">×</button>
            `;
            
            const closeButton = toast.querySelector('.toast-close');
            closeButton.addEventListener('click', function() {
                toast.remove();
            });
            
            this.container.appendChild(toast);
            
            if (duration > 0) {
                setTimeout(function() {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, duration);
            }
        },
        
        success: function(message, title) {
            this.display(message, 'success', title, CONFIG.TOAST_DEFAULT_DURATION);
        },
        
        error: function(message, title) {
            this.display(message, 'error', title, CONFIG.TOAST_DEFAULT_DURATION);
        },
        
        warning: function(message, title) {
            this.display(message, 'warning', title, CONFIG.TOAST_DEFAULT_DURATION);
        },
        
        info: function(message, title) {
            this.display(message, 'info', title, CONFIG.TOAST_DEFAULT_DURATION);
        },

        // Every network catch block was independently writing the same
        // "Could not connect to server." toast - one wrong word in one
        // of the eight copies would've been an easy typo to miss. Now
        // there's exactly one string to get right.
        connectionError: function() {
            this.display(
                "Can't reach the server right now. Check your connection and try again.",
                'error', 'Connection issue', CONFIG.TOAST_DEFAULT_DURATION
            );
        }
    };

    // ============================================================================
    // CONFIRM DIALOG
    // ============================================================================
    // Replaces window.confirm() for release/ship/dispute actions. A native
    // browser confirm() is unstyled, blocks the whole tab, and looks the
    // same on every website on earth - not something you want gating a
    // "send real money" action on a payments app. This is a small
    // Promise-based modal built on the same .modal-overlay/.modal pattern
    // already used elsewhere on the site, so it doesn't introduce a new
    // visual language.
    const ConfirmDialog = {
        overlay: null,

        icons: {
            default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>',
            danger:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>'
        },

        ensure: function() {
            if (this.overlay) return;
            this.overlay = document.createElement('div');
            this.overlay.className = 'modal-overlay';
            this.overlay.innerHTML =
                '<div class="modal confirm-dialog">' +
                    '<div class="confirm-dialog-icon"></div>' +
                    '<div class="confirm-dialog-title"></div>' +
                    '<div class="confirm-dialog-message"></div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn-outline confirm-dialog-cancel">Cancel</button>' +
                        '<button type="button" class="btn-danger confirm-dialog-confirm"></button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(this.overlay);
        },

        // options: { title, message, confirmText, tone: 'default'|'danger'|'warning' }
        // Returns a Promise<boolean> - true if confirmed, false if cancelled.
        show: function(options) {
            this.ensure();
            const tone = options.tone || 'default';
            const dialog = this.overlay.querySelector('.confirm-dialog');
            const iconEl = this.overlay.querySelector('.confirm-dialog-icon');
            const titleEl = this.overlay.querySelector('.confirm-dialog-title');
            const messageEl = this.overlay.querySelector('.confirm-dialog-message');
            const confirmBtn = this.overlay.querySelector('.confirm-dialog-confirm');
            const cancelBtn = this.overlay.querySelector('.confirm-dialog-cancel');

            dialog.className = 'modal confirm-dialog tone-' + tone;
            iconEl.innerHTML = this.icons[tone] || this.icons.default;
            titleEl.textContent = options.title || 'Are you sure?';
            messageEl.textContent = options.message || '';
            confirmBtn.textContent = options.confirmText || 'Confirm';
            confirmBtn.className = (tone === 'default' ? 'btn btn-primary' : 'btn btn-danger') + ' confirm-dialog-confirm';

            const overlay = this.overlay;

            return new Promise(function(resolve) {
                function close(result) {
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                    confirmBtn.removeEventListener('click', onConfirm);
                    cancelBtn.removeEventListener('click', onCancel);
                    overlay.removeEventListener('click', onOverlayClick);
                    document.removeEventListener('keydown', onKeydown);
                    resolve(result);
                }
                function onConfirm() { close(true); }
                function onCancel() { close(false); }
                function onOverlayClick(e) { if (e.target === overlay) close(false); }
                function onKeydown(e) { if (e.key === 'Escape') close(false); }

                confirmBtn.addEventListener('click', onConfirm);
                cancelBtn.addEventListener('click', onCancel);
                overlay.addEventListener('click', onOverlayClick);
                document.addEventListener('keydown', onKeydown);

                overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            });
        }
    };

    // ============================================================================
    // BACK TO TOP BUTTON
    // ============================================================================
    
    function initializeBackToTop() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'back-to-top';
        button.innerHTML = '↑';
        button.setAttribute('aria-label', 'Return to top of page');
        document.body.appendChild(button);
        
        window.addEventListener('scroll', function() {
            const shouldBeVisible = window.scrollY > 300;
            button.classList.toggle('visible', shouldBeVisible);
        });
        
        button.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ============================================================================
    // WHATSAPP INTEGRATION
    // ============================================================================
    
    const WhatsAppIntegration = {
        button: null,
        tooltip: null,
        
        initialize: function() {
            this._createFloatingButton();
            this._createTooltip();
            this._bindEventListeners();
            this._handlePositionAdjustment();
        },
        
        _createFloatingButton: function() {
            const button = document.createElement('a');
            button.className = 'whatsapp-float';
            button.href = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent('Hello SecureEscrow Kenya, I need assistance with...')}`;
            button.target = '_blank';
            button.rel = 'noopener noreferrer';
            button.setAttribute('aria-label', 'Contact customer support via WhatsApp');
            
            button.innerHTML = `
                <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M16 2C8.28 2 2 8.28 2 16c0 2.47.64 4.88 1.86 7L2.5 29.5l6.64-1.36C11.28 29.32 13.61 30 16 30c7.72 0 14-6.28 14-14S23.72 2 16 2zm0 25.67c-2.25 0-4.45-.6-6.36-1.73l-.46-.27-3.95.81.84-3.85-.3-.47C4.5 19.92 3.83 17.98 3.83 16c0-6.72 5.45-12.17 12.17-12.17S28.17 9.28 28.17 16 22.72 27.67 16 27.67z"/>
                    <path d="M22.92 19.2c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.14-.42-2.17-1.34-.8-.72-1.34-1.6-1.5-1.87-.16-.27-.02-.42.12-.55.12-.12.27-.32.41-.48.13-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.47-.84-2.01-.22-.52-.44-.45-.61-.46-.16 0-.34-.02-.52-.02-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27 0 1.34.98 2.63 1.11 2.81.14.18 1.92 2.93 4.65 4.11.65.28 1.16.45 1.56.58.66.21 1.25.18 1.72.11.52-.08 1.6-.65 1.83-1.29.23-.63.23-1.18.16-1.29-.07-.11-.25-.18-.52-.31z"/>
                </svg>
            `;
            
            document.body.appendChild(button);
            this.button = button;
        },
        
        _createTooltip: function() {
            const tooltip = document.createElement('div');
            tooltip.className = 'whatsapp-tooltip';
            tooltip.textContent = 'Chat with Customer Support';
            document.body.appendChild(tooltip);
            this.tooltip = tooltip;
        },
        
        _bindEventListeners: function() {
            const self = this;
            
            this.button.addEventListener('mouseenter', function() {
                self.tooltip.classList.add('visible');
            });
            
            this.button.addEventListener('mouseleave', function() {
                self.tooltip.classList.remove('visible');
            });
            
            setTimeout(function() {
                self.tooltip.classList.add('visible');
                setTimeout(function() {
                    self.tooltip.classList.remove('visible');
                }, CONFIG.TOAST_DEFAULT_DURATION);
            }, CONFIG.WHATSAPP_TOOLTIP_DELAY);
        },
        
        _handlePositionAdjustment: function() {
            const self = this;
            
            window.addEventListener('scroll', function() {
                const backToTopButton = document.querySelector('.back-to-top');
                const shouldOffset = backToTopButton && backToTopButton.classList.contains('visible');
                self.button.classList.toggle('with-back-to-top', shouldOffset);
            });
        }
    };

    // ============================================================================
    // ESCROW FORM HANDLER
    // ============================================================================
    
    function initializeEscrowForm() {
        const form = document.querySelector('.escrow-form');
        if (!form) {
            return;
        }

        // Block accidental native form submission
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();
        });
        
        // Payout fields toggle
        const payoutType = document.getElementById('payoutType');
        const payoutNumberField = document.getElementById('payoutNumberField');
        const payoutAccountField = document.getElementById('payoutAccountField');
        
        if (payoutType) {
            payoutType.addEventListener('change', function() {
                if (this.value === 'TILL') {
                    payoutNumberField.style.display = 'block';
                    payoutAccountField.style.display = 'none';
                } else if (this.value === 'PAYBILL') {
                    payoutNumberField.style.display = 'block';
                    payoutAccountField.style.display = 'block';
                } else {
                    payoutNumberField.style.display = 'none';
                    payoutAccountField.style.display = 'none';
                }
            });
        }
        
        // Amount input with fee calculation
        const amountInput = form.querySelector('#amount');
        const displayAmount = document.querySelector('#displayAmount');
        const totalAmountDisplay = document.querySelector('#totalAmount');
        
        if (amountInput) {
            amountInput.addEventListener('input', function() {
                const baseAmount = parseFloat(this.value) || 0;
                const feeAmount = baseAmount * CONFIG.ESCROW_FEE_PERCENTAGE;
                const totalAmount = baseAmount + feeAmount;
                
                if (displayAmount) {
                    displayAmount.textContent = formatKES(baseAmount);
                }
                if (totalAmountDisplay) {
                    totalAmountDisplay.textContent = formatKES(totalAmount);
                }
            });
        }
        
        // Submit button handler
        const submitButton = document.getElementById('continuePaymentBtn');
        if (!submitButton) {
            console.error('Continue payment button not found');
            return;
        }
        
        submitButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const itemNameInput = form.querySelector('#itemName');
            const amountInput = form.querySelector('#amount');
            const buyerPhoneInput = form.querySelector('#buyerContact');
            const sellerPhoneInput = form.querySelector('#sellerContact');
            
            let isValid = true;
            let errorMessage = '';
            let errorTitle = '';
            
            if (!itemNameInput || !itemNameInput.value.trim()) {
                isValid = false;
                errorTitle = 'Description needed';
                errorMessage = "What's being sold? Add a short item description.";
            } else if (!amountInput || !amountInput.value || parseFloat(amountInput.value) < 100) {
                isValid = false;
                errorTitle = 'Amount too low';
                errorMessage = 'Minimum transaction amount is KES 100.';
            } else if (!buyerPhoneInput || !validateKenyanPhone(buyerPhoneInput.value)) {
                isValid = false;
                errorTitle = "Check the buyer's number";
                errorMessage = "That doesn't look like a valid Kenyan number - try 07XX XXX XXX.";
            } else if (!sellerPhoneInput || !validateKenyanPhone(sellerPhoneInput.value)) {
                isValid = false;
                errorTitle = "Check the seller's number";
                errorMessage = "That doesn't look like a valid Kenyan number - try 07XX XXX XXX.";
            } else if (buyerPhoneInput.value === sellerPhoneInput.value) {
                isValid = false;
                errorTitle = 'Same number twice';
                errorMessage = "Buyer and seller can't be the same phone number.";
            }
            
            if (!isValid) {
                ToastManager.error(errorMessage, errorTitle);
                return;
            }
            
            const baseAmount = parseFloat(amountInput.value);
            const feeAmount = baseAmount * CONFIG.ESCROW_FEE_PERCENTAGE;
            const totalAmount = baseAmount + feeAmount;
            
            const transactionData = {
                itemName: itemNameInput.value.trim(),
                itemDetails: form.querySelector('#itemDetails')?.value || '',
                amount: baseAmount,
                buyerPhone: buyerPhoneInput.value,
                sellerPhone: sellerPhoneInput.value,
                transactionType: form.querySelector('#transactionType')?.value || '',
                deliveryDeadline: form.querySelector('#deliveryDeadline')?.value || '',
                payoutType: document.getElementById('payoutType')?.value || 'MPESA',
                payoutNumber: document.getElementById('payoutNumber')?.value || '',
                payoutAccount: document.getElementById('payoutAccount')?.value || ''
            };
            
            // Remove any existing payment popup
            const existingPopup = document.getElementById('paymentPopup');
            if (existingPopup) {
                existingPopup.remove();
            }
            
            const paymentHTML = `
                <div class="payment-popup-overlay" id="paymentPopup">
                    <div class="payment-popup">
                        <div class="popup-header">
                            <h3>Ready to secure this transaction?</h3>
                            <button type="button" class="popup-close" id="closePaymentPopup" aria-label="Close">&times;</button>
                        </div>
                        <div class="popup-body">
                            <div class="payment-summary">
                                <div class="summary-item">
                                    <span class="summary-label">Item</span>
                                    <span class="summary-value">${escapeHtml(itemNameInput.value)}</span>
                                </div>
                                <div class="summary-divider"></div>
                                <div class="summary-item">
                                    <span class="summary-label">Item amount</span>
                                    <span class="summary-value">${formatKES(baseAmount)}</span>
                                </div>
                                <div class="summary-item summary-total">
                                    <span class="summary-label">Total payment</span>
                                    <span class="summary-value">${formatKES(totalAmount)}</span>
                                </div>
                            </div>
                            <div class="payment-note">
                                <p>An M-PESA prompt will be sent to your phone.</p>
                                <p class="note-small">Enter your PIN to complete the payment. Funds are held securely until delivery confirmation.</p>
                            </div>
                            <div class="popup-actions">
                                <button type="button" class="btn-primary-pay" id="confirmPaymentButton">Confirm and pay with M-PESA</button>
                                <button type="button" class="btn-secondary-pay" id="cancelPaymentButton">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', paymentHTML);
            const popupElement = document.getElementById('paymentPopup');
            
            function dismissPopup() {
                popupElement.classList.add('closing');
                setTimeout(function() {
                    if (popupElement && popupElement.parentNode) {
                        popupElement.remove();
                    }
                }, 200);
            }
            
            document.getElementById('confirmPaymentButton').addEventListener('click', async function() {
                dismissPopup();
                ToastManager.info('Setting up your transaction…', 'One moment');
                
                try {
                    const result = await ApiClient.createTransaction(transactionData);
                    
                    if (result.success) {
                        ToastManager.success("Transaction created - the seller's been notified.", 'Done');
                        form.reset();
                        if (displayAmount) displayAmount.textContent = 'KES 0';
                        if (totalAmountDisplay) totalAmountDisplay.textContent = 'KES 0';
                        setTimeout(function() {
                            ToastManager.info('Reference: ' + result.transactionId, 'Save this for tracking');
                        }, 500);
                    } else {
                        ToastManager.error(
                            result.error || "Couldn't create that transaction - try again in a moment.",
                            'Transaction failed'
                        );
                    }
                } catch (error) {
                    console.error('API Error:', error);
                    ToastManager.connectionError();
                }
            });
            
            document.getElementById('cancelPaymentButton').addEventListener('click', dismissPopup);
            document.getElementById('closePaymentPopup').addEventListener('click', dismissPopup);
            
            popupElement.addEventListener('click', function(event) {
                if (event.target === popupElement) {
                    dismissPopup();
                }
            });
        });
        
        // Set default delivery deadline
        const deadlineInput = form.querySelector('#deliveryDeadline');
        if (deadlineInput) {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            deadlineInput.min = now.toISOString().slice(0, 16);
            
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 3);
            defaultDate.setMinutes(defaultDate.getMinutes() - defaultDate.getTimezoneOffset());
            deadlineInput.value = defaultDate.toISOString().slice(0, 16);
        }
    }

    // ============================================================================
    // CONTACT FORM HANDLER
    // ============================================================================
    
    function initializeContactForm() {
        const form = document.querySelector('.contact-form');
        if (!form) {
            return;
        }
        
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            
            const nameInput = form.querySelector('#fullName, [name="fullName"]');
            const emailInput = form.querySelector('#emailAddress, [name="emailAddress"]');
            const messageInput = form.querySelector('#messageContent, [name="messageContent"]');
            
            let isValid = true;
            let errorMessage = '';
            
            if (!nameInput || !nameInput.value.trim()) {
                isValid = false;
                errorMessage = "Don't forget your name.";
            } else if (!emailInput || !validateEmail(emailInput.value)) {
                isValid = false;
                errorMessage = "That email address doesn't look right.";
            } else if (!messageInput || !messageInput.value.trim()) {
                isValid = false;
                errorMessage = "Add a message before sending.";
            }
            
            if (isValid) {
                ToastManager.success("Thanks - we'll get back to you shortly.", 'Message sent');
                form.reset();
            } else {
                ToastManager.error(errorMessage, 'One thing missing');
            }
        });
    }

    // ============================================================================
    // TRANSACTION TRACKING PAGE
    // ============================================================================
    
    // State variables shared across tracking functions
    let currentVerifiedPhone = null;
    let currentMagicToken = null;
    let currentUserRole = null;
    let currentTransactionId = null;
    
    // Guards to prevent duplicate initialization and validation
    let isValidatingToken = false;
    let trackingInitialized = false;
    
    function initializeTrackingPage() {
        // Only run setup once, regardless of how many times the function is called
        if (trackingInitialized) {
            return;
        }
        trackingInitialized = true;

        const trackForm = document.getElementById('trackForm');
        const phoneForm = document.getElementById('phoneForm');
        
        // Check URL for token and transaction ID
        const urlToken = getUrlParameter('token');
        const urlId = getUrlParameter('id');
        
        // If a magic token is present, validate it (synchronously guarded)
        if (urlToken && urlId && !isValidatingToken) {
            isValidatingToken = true;
            validateAndDisplayWithToken(urlId, urlToken);
        } 
        // If only an ID is present (no token), load the transaction for viewing
        else if (urlId && !currentTransactionId) {
            currentTransactionId = urlId;
            loadTransactionById(urlId);
        }

        // Track by Transaction ID form
        if (trackForm) {
            trackForm.addEventListener('submit', async function(event) {
                event.preventDefault();
                const transactionId = document.getElementById('trackId').value.trim().toUpperCase();
                currentTransactionId = transactionId;
                currentMagicToken = null;
                loadTransactionById(transactionId);
            });
        }

        // Track by Phone Number form
        if (phoneForm) {
            phoneForm.addEventListener('submit', async function(event) {
                event.preventDefault();
                const phoneNumber = document.getElementById('trackPhone').value.trim();
                
                ToastManager.info('Looking that up…', 'One moment');
                
                try {
                    const result = await ApiClient.trackByPhone(phoneNumber);
                    
                    if (result.error) {
                        ToastManager.error("Nothing found for that number.", 'No results');
                    } else if (result.transactions && result.transactions.length > 0) {
                        currentVerifiedPhone = phoneNumber;
                        currentUserRole = null;
                        currentMagicToken = null;
                        currentTransactionId = result.transactions[0].id;
                        renderTransactionDetails(result.transactions[0], phoneNumber, null, null);
                    }
                } catch (error) {
                    ToastManager.connectionError();
                }
            });
        }

        // Phone verification button
        const verifyBtn = document.getElementById('verifyPhoneBtn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', function() {
                const phone = document.getElementById('verifyPhone').value.trim();
                
                if (!validateKenyanPhone(phone)) {
                    ToastManager.error("That doesn't look like a valid Kenyan number.", 'Check the number');
                    return;
                }
                
                currentVerifiedPhone = phone;
                currentUserRole = null;
                document.getElementById('verificationSection').style.display = 'none';
                
                if (currentTransactionId) {
                    loadTransactionWithPhone(currentTransactionId, phone);
                }
            });
        }
    }

    async function validateAndDisplayWithToken(transactionId, token) {
        ToastManager.info('Checking your link…', 'One moment');
        
        try {
            const result = await ApiClient.validateToken(transactionId, token);
            
            if (result.success) {
                currentMagicToken = token;
                currentVerifiedPhone = result.role === 'buyer' 
                    ? result.transaction.buyer_phone 
                    : result.transaction.seller_phone;
                currentUserRole = result.role;
                currentTransactionId = transactionId;
                renderTransactionDetails(result.transaction, currentVerifiedPhone, token, result.role);
            } else {
                ToastManager.error(
                    result.error || "This link has expired or isn't valid anymore.",
                    'Link no longer works'
                );
                loadTransactionById(transactionId);
            }
        } catch (error) {
            ToastManager.connectionError();
        } finally {
            // SECURITY: always remove the token from the visible URL once
            // it has been used, regardless of outcome.
            stripTokenFromUrl();
        }
    }

    async function loadTransactionById(transactionId) {
        ToastManager.info('Looking up that transaction…', 'One moment');
        
        try {
            const transaction = await ApiClient.getTransaction(transactionId);
            
            if (transaction.error) {
                ToastManager.error("No transaction matches that reference.", 'Not found');
            } else {
                currentMagicToken = null;
                currentUserRole = null;
                currentTransactionId = transactionId;
                renderTransactionDetails(transaction, null, null, null);
            }
        } catch (error) {
            ToastManager.connectionError();
        }
    }

    async function loadTransactionWithPhone(transactionId, phone) {
        try {
            const transaction = await ApiClient.getTransaction(transactionId);
            
            if (transaction.error) {
                ToastManager.error("That transaction couldn't be found.", 'Not found');
            } else {
                currentMagicToken = null;
                currentUserRole = null;
                currentTransactionId = transactionId;
                renderTransactionDetails(transaction, phone, null, null);
            }
        } catch (error) {
            ToastManager.connectionError();
        }
    }

    async function refreshTransactionDisplay() {
        if (!currentTransactionId) {
            return;
        }
        
        try {
            const transaction = await ApiClient.getTransaction(currentTransactionId, currentMagicToken);
            
            if (!transaction.error) {
                renderTransactionDetails(
                    transaction, 
                    currentVerifiedPhone, 
                    currentMagicToken, 
                    currentUserRole
                );
            }
        } catch (error) {
            console.error('Failed to refresh:', error);
        }
    }

    async function loadCurrentPayoutSettings(transactionId, token) {
        try {
            const result = await ApiClient.getPayout(transactionId, token);
            
            if (!result.error) {
                const radio = document.querySelector(
                    'input[name="payoutType"][value="' + result.payoutType + '"]'
                );
                if (radio) {
                    radio.checked = true;
                }
                
                const numInput = document.getElementById('payoutNumberInput');
                const accInput = document.getElementById('payoutAccountInput');
                
                if (numInput) {
                    numInput.value = result.payoutNumber || '';
                }
                if (accInput) {
                    accInput.value = result.payoutAccount || '';
                }
                
                updatePayoutFieldsVisibility(result.payoutType);
            }
        } catch (error) {
            console.error('Failed to load payout settings:', error);
        }
    }

    function updatePayoutFieldsVisibility(type) {
        const numberContainer = document.getElementById('payoutNumberContainer');
        const accountContainer = document.getElementById('payoutAccountContainer');
        
        if (!numberContainer || !accountContainer) {
            return;
        }
        
        if (type === 'TILL') {
            numberContainer.style.display = 'block';
            accountContainer.style.display = 'none';
        } else if (type === 'PAYBILL') {
            numberContainer.style.display = 'block';
            accountContainer.style.display = 'block';
        } else {
            numberContainer.style.display = 'none';
            accountContainer.style.display = 'none';
        }
    }

    function renderTransactionDetails(transaction, verifiedPhone, magicToken, userRole) {
        const displayContainer = document.getElementById('transactionDisplay');
        const verificationSection = document.getElementById('verificationSection');
        
        if (!displayContainer) {
            return;
        }

        // The /track/<phone> endpoint returns a masked summary (no
        // buyer_phone/seller_phone, but includes role + counterparty_phone)
        // to avoid exposing the full counterparty number. Detect which
        // shape we were given.
        const hasFullPhones = (transaction.buyer_phone !== undefined && transaction.seller_phone !== undefined);

        const isBuyer  = hasFullPhones ? (verifiedPhone === transaction.buyer_phone)  : (transaction.role === 'buyer');
        const isSeller = hasFullPhones ? (verifiedPhone === transaction.seller_phone) : (transaction.role === 'seller');
        const isBuyerToken = (userRole === 'buyer');
        const isSellerToken = (userRole === 'seller');

        const statusConfig = {};
        statusConfig['AWAITING_PAYMENT'] = { class: 'status-pending', text: 'Awaiting payment' };
        statusConfig[TRANSACTION_STATUS.FUNDS_SECURED] = { class: 'status-secured', text: 'Funds secured' };
        statusConfig[TRANSACTION_STATUS.AWAITING_DELIVERY] = { class: 'status-awaiting', text: 'Shipped' };
        statusConfig[TRANSACTION_STATUS.DELIVERED] = { class: 'status-delivered', text: 'Delivered' };
        statusConfig['RELEASE_PROCESSING'] = { class: 'status-awaiting', text: 'Payout processing' };
        statusConfig[TRANSACTION_STATUS.FUNDS_RELEASED] = { class: 'status-released', text: 'Complete' };
        statusConfig[TRANSACTION_STATUS.DISPUTED] = { class: 'status-disputed', text: 'Disputed' };
        
        const currentStatus = statusConfig[transaction.status] || { class: '', text: transaction.status };
        
        // Build the transaction details HTML
        let detailsHtml = '';
        
        detailsHtml += '<div class="transaction-details-card">';
        detailsHtml += '<div class="transaction-header">';
        detailsHtml += '<h3>Transaction ' + escapeHtml(transaction.id) + '</h3>';
        detailsHtml += '<span class="status-badge ' + currentStatus.class + '">' + currentStatus.text + '</span>';
        detailsHtml += '</div>';
        
        detailsHtml += '<div class="transaction-info-grid">';
        // SECURITY: item_name is user-supplied free text. It is escaped
        // here to prevent stored XSS - never insert it raw into innerHTML.
        detailsHtml += '<div class="info-item"><span class="info-label">Item</span><span class="info-value">' + escapeHtml(transaction.item_name) + '</span></div>';
        detailsHtml += '<div class="info-item"><span class="info-label">Amount</span><span class="info-value">' + formatKES(transaction.amount) + '</span></div>';

        if (hasFullPhones) {
            detailsHtml += '<div class="info-item"><span class="info-label">Buyer</span><span class="info-value">' + escapeHtml(transaction.buyer_phone) + '</span></div>';
            detailsHtml += '<div class="info-item"><span class="info-label">Seller</span><span class="info-value">' + escapeHtml(transaction.seller_phone) + '</span></div>';
        } else {
            const yourLabel = isBuyer ? 'You (Buyer)' : (isSeller ? 'You (Seller)' : 'You');
            const otherLabel = isBuyer ? 'Seller' : 'Buyer';
            if (verifiedPhone) {
                detailsHtml += '<div class="info-item"><span class="info-label">' + escapeHtml(yourLabel) + '</span><span class="info-value">' + escapeHtml(verifiedPhone) + '</span></div>';
            }
            if (transaction.counterparty_phone) {
                detailsHtml += '<div class="info-item"><span class="info-label">' + escapeHtml(otherLabel) + '</span><span class="info-value">' + escapeHtml(transaction.counterparty_phone) + '</span></div>';
            }
        }

        detailsHtml += '<div class="info-item"><span class="info-label">Initiated</span><span class="info-value">' + new Date(transaction.created_at).toLocaleString() + '</span></div>';
        
        if (transaction.shipped_at) {
            detailsHtml += '<div class="info-item"><span class="info-label">Shipped</span><span class="info-value">' + new Date(transaction.shipped_at).toLocaleString() + '</span></div>';
        }
        
        if (transaction.released_at) {
            detailsHtml += '<div class="info-item"><span class="info-label">Released</span><span class="info-value">' + new Date(transaction.released_at).toLocaleString() + '</span></div>';
        }
        
        detailsHtml += '</div>'; // Close transaction-info-grid
        
        // Determine which actions to show based on role and status
        const canRelease = (
            transaction.status === TRANSACTION_STATUS.FUNDS_SECURED ||
            transaction.status === TRANSACTION_STATUS.AWAITING_DELIVERY ||
            transaction.status === TRANSACTION_STATUS.DELIVERED
        );
        
        if (isBuyerToken && canRelease) {
            detailsHtml += '<div class="action-section buyer-section">';
            detailsHtml += '<p class="role-indicator">You are verified as the Buyer</p>';
            detailsHtml += '<button type="button" class="btn-release-funds" id="releaseFundsButton" data-transaction-id="' + transaction.id + '" data-amount="' + transaction.amount + '">Release Funds to Seller</button>';
            detailsHtml += '<button type="button" class="btn-dispute" id="raiseDisputeButton">Raise a Dispute</button>';
            detailsHtml += '</div>';
        }
        else if (isBuyer && !isBuyerToken && canRelease) {
            detailsHtml += '<div class="action-section buyer-section">';
            detailsHtml += '<p class="role-indicator">You are verified as the Buyer</p>';
            detailsHtml += '<button type="button" class="btn-resend-link" id="resendLinkButton" data-transaction-id="' + transaction.id + '">Resend Magic Link</button>';
            detailsHtml += '<button type="button" class="btn-dispute" id="raiseDisputeButton">Raise a Dispute</button>';
            detailsHtml += '<p class="link-hint">A magic link will be sent to your phone to authorize release.</p>';
            detailsHtml += '</div>';
        }
        else if ((isSellerToken || isSeller) && transaction.status === TRANSACTION_STATUS.FUNDS_SECURED) {
            detailsHtml += '<div class="action-section seller-section">';
            detailsHtml += '<p class="role-indicator">You are verified as the Seller</p>';
            detailsHtml += '<button type="button" class="btn-mark-shipped" id="markShippedButton" data-transaction-id="' + transaction.id + '">Mark Item as Shipped</button>';
            detailsHtml += '<button type="button" class="btn-payout-settings" id="showPayoutSettingsBtn" style="margin-top:10px">Set Payout Method</button>';
            detailsHtml += '</div>';
        }
        else if ((isSellerToken || isSeller) && transaction.status === TRANSACTION_STATUS.AWAITING_DELIVERY) {
            detailsHtml += '<div class="action-section seller-section">';
            detailsHtml += '<p class="role-indicator">You are verified as the Seller</p>';
            detailsHtml += '<div class="info-message">Waiting for buyer to confirm delivery.</div>';
            detailsHtml += '</div>';
        }
        else if (transaction.status === TRANSACTION_STATUS.FUNDS_RELEASED) {
            detailsHtml += '<div class="action-section completed-section">';
            detailsHtml += '<p class="completion-message">Payment sent to seller.</p>';
            detailsHtml += '</div>';
        }
        else if (!verifiedPhone) {
            detailsHtml += '<div class="action-section viewer-section">';
            detailsHtml += '<p class="role-indicator">Verify your phone number to access transaction actions.</p>';
            detailsHtml += '<button type="button" class="btn-verify-prompt" id="showVerificationBtn">Verify Phone Number</button>';
            detailsHtml += '</div>';
            
            if (verificationSection) {
                verificationSection.style.display = 'block';
            }
        }
        else {
            detailsHtml += '<div class="action-section viewer-section">';
            detailsHtml += '<p class="role-indicator">View only. You are not authorized to perform actions on this transaction.</p>';
            detailsHtml += '</div>';
        }
        
        detailsHtml += '</div>'; // Close transaction-details-card
        
        // Update the display
        displayContainer.innerHTML = detailsHtml;
        
        // Attach event listeners after the DOM is updated
        setTimeout(function() {
            
            // Release Funds Button
            const releaseButton = document.getElementById('releaseFundsButton');
            if (releaseButton) {
                releaseButton.addEventListener('click', async function() {
                    const txnId = this.dataset.transactionId;
                    const releaseAmount = parseFloat(this.dataset.amount);
                    
                    const confirmed = await ConfirmDialog.show({
                        title: 'Release funds to seller?',
                        message: 'You\'re about to send ' + formatKES(releaseAmount) + ' to the seller. This can\'t be undone.',
                        confirmText: 'Release ' + formatKES(releaseAmount),
                        tone: 'danger'
                    });
                    if (!confirmed) {
                        return;
                    }
                    
                    ToastManager.info('Sending the release...', 'One moment');
                    
                    try {
                        const result = await ApiClient.releaseFunds(txnId, currentMagicToken);
                        
                        if (result.success) {
                            ToastManager.success("Payment's on its way to the seller.", 'Released');
                            await refreshTransactionDisplay();
                        } else {
                            ToastManager.error(
                                result.error || "Couldn't release funds right now - try again shortly.",
                                'Release failed'
                            );
                        }
                    } catch (error) {
                        ToastManager.connectionError();
                    }
                });
            }
            
            // Resend Magic Link Button
            const resendButton = document.getElementById('resendLinkButton');
            if (resendButton) {
                resendButton.addEventListener('click', async function() {
                    const txnId = this.dataset.transactionId;
                    
                    ToastManager.info('Sending a new link…', 'One moment');
                    
                    try {
                        const result = await ApiClient.resendMagicLink(txnId, verifiedPhone);
                        
                        if (result.success) {
                            ToastManager.success('New link sent to your phone.', 'Sent');
                        } else {
                            ToastManager.error(
                                result.error || "Couldn't send that link - try again shortly.",
                                'Send failed'
                            );
                        }
                    } catch (error) {
                        ToastManager.connectionError();
                    }
                });
            }
            
            // Mark as Shipped Button
            const shipButton = document.getElementById('markShippedButton');
            if (shipButton) {
                shipButton.addEventListener('click', async function() {
                    const txnId = this.dataset.transactionId;
                    
                    const confirmed = await ConfirmDialog.show({
                        title: 'Mark as shipped?',
                        message: 'This lets the buyer know their item is on the way.',
                        confirmText: 'Mark Shipped',
                        tone: 'default'
                    });
                    if (!confirmed) {
                        return;
                    }
                    
                    ToastManager.info('Updating…', 'One moment');
                    
                    try {
                        const result = await ApiClient.updateStatus(
                            txnId, 
                            'AWAITING_DELIVERY', 
                            verifiedPhone, 
                            currentMagicToken
                        );
                        
                        if (result.success) {
                            ToastManager.success('Marked as shipped.', 'Updated');
                            await refreshTransactionDisplay();
                        } else {
                            ToastManager.error(
                                result.error || "Couldn't update the status - try again.",
                                'Update failed'
                            );
                        }
                    } catch (error) {
                        ToastManager.connectionError();
                    }
                });
            }
            
            // Raise Dispute Button
            const disputeButton = document.getElementById('raiseDisputeButton');
            if (disputeButton) {
                disputeButton.addEventListener('click', async function() {
                    const txnId = releaseButton?.dataset.transactionId || resendButton?.dataset.transactionId;
                    
                    if (!txnId) {
                        return;
                    }
                    
                    const confirmed = await ConfirmDialog.show({
                        title: 'Raise a dispute?',
                        message: 'Funds stay locked in escrow while we look into it. Only do this if something\'s actually gone wrong.',
                        confirmText: 'Raise Dispute',
                        tone: 'warning'
                    });
                    if (!confirmed) {
                        return;
                    }
                    
                    ToastManager.info('Filing your dispute…', 'One moment');
                    
                    try {
                        const result = await ApiClient.updateStatus(
                            txnId, 
                            'DISPUTED', 
                            verifiedPhone, 
                            currentMagicToken
                        );
                        
                        if (result.success) {
                            ToastManager.warning("Dispute filed - we'll be in touch.", 'Filed');
                            await refreshTransactionDisplay();
                        } else {
                            ToastManager.error(
                                result.error || "Couldn't file that dispute - try again shortly.",
                                'Dispute not filed'
                            );
                        }
                    } catch (error) {
                        ToastManager.connectionError();
                    }
                });
            }
            
            // Payout Settings Button
            const payoutBtn = document.getElementById('showPayoutSettingsBtn');
            if (payoutBtn) {
                payoutBtn.addEventListener('click', function() {
                    const section = document.getElementById('payoutSettingsSection');
                    if (section) {
                        section.style.display = 'block';
                        loadCurrentPayoutSettings(transaction.id, magicToken);
                    }
                });
            }
            
            // Show Verification Button
            const showVerifyBtn = document.getElementById('showVerificationBtn');
            if (showVerifyBtn && verificationSection) {
                showVerifyBtn.addEventListener('click', function() {
                    verificationSection.style.display = 'block';
                });
            }
            
        }, 0);
    }

    // ============================================================================
    // PAYOUT SETTINGS INITIALIZATION
    // ============================================================================
    
    function initializePayoutSettings() {
        const payoutRadios = document.querySelectorAll('input[name="payoutType"]');
        
        if (payoutRadios.length > 0) {
            payoutRadios.forEach(function(radio) {
                radio.addEventListener('change', function() {
                    updatePayoutFieldsVisibility(this.value);
                });
            });
        }
        
        const savePayoutBtn = document.getElementById('savePayoutBtn');
        if (!savePayoutBtn) {
            return;
        }

        savePayoutBtn.addEventListener('click', async function() {
            const checkedRadio = document.querySelector('input[name="payoutType"]:checked');
            if (!checkedRadio) {
                return;
            }
            
            const payoutType = checkedRadio.value;
            const payoutNumber = document.getElementById('payoutNumberInput')?.value || '';
            const payoutAccount = document.getElementById('payoutAccountInput')?.value || '';
            
            if (payoutType !== 'MPESA' && !payoutNumber) {
                ToastManager.error(
                    `Add your ${payoutType === 'TILL' ? 'Till' : 'Paybill'} number to continue.`,
                    'Number needed'
                );
                return;
            }
            
            if (payoutType === 'PAYBILL' && !payoutAccount) {
                ToastManager.error('Add the account number for that Paybill.', 'Account needed');
                return;
            }
            
            ToastManager.info('Saving your payout details…', 'One moment');
            
            try {
                const result = await ApiClient.updatePayout(
                    currentTransactionId, 
                    currentMagicToken, 
                    { payoutType, payoutNumber, payoutAccount }
                );
                
                if (result.success) {
                    ToastManager.success("Payout method's set.", 'Saved');
                    document.getElementById('payoutSettingsSection').style.display = 'none';
                } else {
                    ToastManager.error(
                        result.error || "Couldn't save that - try again in a moment.",
                        'Save failed'
                    );
                }
            } catch (error) {
                ToastManager.connectionError();
            }
        });
    }

    // ============================================================================
    // MOBILE NAVIGATION
    // ============================================================================
    
    function initializeMobileNavigation() {
        const toggleButton = document.getElementById('menuToggle');
        const sidebar = document.getElementById('mobileSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const navigationLinks = document.querySelectorAll('.sidebar-nav .nav-link');
        
        if (!toggleButton || !sidebar || !overlay) {
            return;
        }
        
        toggleButton.addEventListener('click', function(event) {
            event.stopPropagation();
            
            const isCurrentlyOpen = sidebar.classList.contains('active');
            
            if (isCurrentlyOpen) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                document.body.classList.remove('sidebar-open');
                document.body.style.overflow = '';
            } else {
                sidebar.classList.add('active');
                overlay.classList.add('active');
                document.body.classList.add('sidebar-open');
                document.body.style.overflow = 'hidden';
            }
        });
        
        function dismissSidebar() {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.classList.remove('sidebar-open');
            document.body.style.overflow = '';
        }
        
        overlay.addEventListener('click', dismissSidebar);
        
        navigationLinks.forEach(function(link) {
            link.addEventListener('click', dismissSidebar);
        });
        
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && sidebar.classList.contains('active')) {
                dismissSidebar();
            }
        });
    }

    // ============================================================================
    // SMOOTH SCROLLING
    // ============================================================================
    
    function initializeSmoothScrolling() {
        document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
            anchor.addEventListener('click', function(event) {
                const href = this.getAttribute('href');
                
                if (href === '#' || href === '#0') {
                    return;
                }
                
                const targetElement = document.querySelector(href);
                if (targetElement) {
                    event.preventDefault();
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    // ============================================================================
    // ACTIVE NAVIGATION HIGHLIGHTING
    // ============================================================================
    
    function highlightCurrentPageInNavigation() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        document.querySelectorAll('.nav-link').forEach(function(link) {
            link.classList.remove('active');
            const linkHref = link.getAttribute('href');
            
            if (linkHref === currentPage || (currentPage === '' && linkHref === 'index.html')) {
                link.classList.add('active');
            }
        });
    }

    // ============================================================================
    // APPLICATION ENTRY POINT
    // ============================================================================
    
    async function checkBackendConnection() {
        try {
            const response = await fetch(API_BASE_URL + '/health');
            if (response.ok) {
                console.log('Backend connected successfully.');
            }
        } catch (error) {
            console.warn('Backend not reachable. Start the server with: python app.py');
        }
    }

    // Guard to prevent the application from initializing twice
    let appInitialized = false;
    
    function initializeApplication() {
        if (appInitialized) {
            return;
        }
        appInitialized = true;
        
        console.log('Initializing SecureEscrow Kenya...');
        
        initializePageLoader();
        initializeMobileNavigation();
        initializeBackToTop();
        WhatsAppIntegration.initialize();
        initializeEscrowForm();
        initializeContactForm();
        initializeTrackingPage();
        initializePayoutSettings();
        initializeSmoothScrolling();
        highlightCurrentPageInNavigation();
        
        setTimeout(initializeAnimatedCounters, CONFIG.COUNTER_START_DELAY);
        
        checkBackendConnection();
        
        if (!localStorage.getItem('visited_escrow')) {
            setTimeout(function() {
                ToastManager.info('Welcome to SecureEscrow Kenya.', 'Welcome');
            }, CONFIG.WELCOME_MESSAGE_DELAY);
            localStorage.setItem('visited_escrow', 'true');
        }
    }

    // Start the application when the DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApplication);
    } else {
        initializeApplication();
    }

})();