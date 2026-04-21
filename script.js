




/**
 * SecureEscrow Kenya - Frontend Client
 * Connects to Flask Backend API
 */

(function() {
    'use strict';

    // ============================================================================
    // CONFIGURATION
    // ============================================================================
    
    const API_BASE_URL = 'http://127.0.0.1:5000/api';
    
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
        
        async getTransaction(transactionId) {
            const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}`);
            return response.json();
        },
        
        async trackByPhone(phone) {
            const response = await fetch(`${API_BASE_URL}/transactions/track/${phone}`);
            return response.json();
        },
        
        async updateStatus(transactionId, status, phone) {
            const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, phone })
            });
            return response.json();
        },
        
        async releaseFunds(transactionId, authCode, phone) {
            const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/release`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authCode, phone })
            });
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

    // ============================================================================
    // PAGE LOADER
    // ============================================================================
    
    function initializePageLoader() {
        const loader = document.getElementById('pageLoader');
        if (!loader) return;
        setTimeout(function() {
            loader.classList.add('fade-out');
            setTimeout(function() {
                if (loader && loader.parentNode) {
                    loader.parentNode.removeChild(loader);
                }
            }, 500);
        }, CONFIG.LOADER_DELAY);
    }

    // ============================================================================
    // ANIMATED METRICS COUNTERS
    // ============================================================================
    
    function initializeAnimatedCounters() {
        const counters = document.querySelectorAll('.counter');
        if (!counters.length) return;
        
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
        icons: { success: '✓', error: '✗', warning: '!', info: 'i' },
        titles: { success: 'Success', error: 'Error', warning: 'Warning', info: 'Information' },
        
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
            toast.className = `toast ${type}`;
            
            const displayTitle = title || this.titles[type] || 'Notice';
            const displayIcon = this.icons[type] || '•';
            
            toast.innerHTML = `
                <span class="toast-icon">${displayIcon}</span>
                <div class="toast-content">
                    <div class="toast-title">${displayTitle}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" aria-label="Dismiss">×</button>
            `;
            
            const closeButton = toast.querySelector('.toast-close');
            closeButton.addEventListener('click', function() { toast.remove(); });
            
            this.container.appendChild(toast);
            
            if (duration > 0) {
                setTimeout(function() {
                    if (toast.parentElement) toast.remove();
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
        }
    };

    // ============================================================================
    // BACK TO TOP BUTTON
    // ============================================================================
    
    function initializeBackToTop() {
        const button = document.createElement('button');
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
    // AUTHORIZATION CODE DISPLAY
    // ============================================================================
    
    function displayAuthorizationCodePopup(transactionId, authorizationCode) {
        const existingPopup = document.getElementById('authPopup');
        if (existingPopup) existingPopup.remove();
        
        const overlayHtml = `
            <div class="auth-popup-overlay" id="authPopup">
                <div class="auth-popup">
                    <div class="auth-popup-header">
                        <h3>Transaction Created Successfully</h3>
                    </div>
                    <div class="auth-popup-body">
                        <div class="auth-code-display">
                            <p class="auth-label">Transaction Reference</p>
                            <p class="auth-value">${transactionId}</p>
                        </div>
                        <div class="auth-code-display auth-code-main">
                            <p class="auth-label">Authorization Code</p>
                            <p class="auth-value-large">${authorizationCode}</p>
                        </div>
                        <div class="auth-warning">
                            <p><strong>Save this code somewhere safe. It cannot be recovered.</strong></p>
                            <p>You will need this six-digit code to authorize the release of funds.</p>
                            <p>Never share this code with anyone, including the seller.</p>
                        </div>
                        <div class="auth-actions">
                            <button class="btn-auth-primary" id="copyCodesButton">Copy Both Codes</button>
                            <button class="btn-auth-secondary" id="confirmSavedButton">I Have Saved My Code</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', overlayHtml);
        
        const popupElement = document.getElementById('authPopup');
        
        document.getElementById('copyCodesButton').addEventListener('click', function() {
            const textToCopy = `Transaction ID: ${transactionId}\nAuthorization Code: ${authorizationCode}`;
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textToCopy).then(function() {
                    ToastManager.success('Codes copied to clipboard', 'Copied');
                }).catch(function() {
                    ToastManager.error('Unable to copy codes automatically', 'Copy Failed');
                });
            } else {
                ToastManager.info('Please manually copy the codes', 'Copy Unavailable');
            }
        });
        
        document.getElementById('confirmSavedButton').addEventListener('click', function() {
            popupElement.remove();
            ToastManager.info('Your funds are now secured in escrow.', 'Transaction Secured');
        });
        
        popupElement.addEventListener('click', function(event) {
            if (event.target === popupElement) {
                popupElement.remove();
            }
        });
    }

    // ============================================================================
    // SMS PREVIEW
    // ============================================================================
    
    function displaySmsPreview(transactionId, buyerPhone, sellerPhone, itemName, amount) {
        const formattedAmount = formatKES(amount);
        
        const existingPreview = document.getElementById('smsPreview');
        if (existingPreview) existingPreview.remove();
        
        const overlayHtml = `
            <div class="sms-preview-overlay" id="smsPreview">
                <div class="sms-preview">
                    <div class="sms-header">
                        <span>SMS Notification — Sent to Seller</span>
                        <button class="sms-close" id="closeSmsPreview" aria-label="Close preview">&times;</button>
                    </div>
                    <div class="sms-body">
                        <div class="sms-bubble">
                            <p class="sms-sender">SecureEscrow Kenya</p>
                            <p class="sms-text">Transaction: ${transactionId}</p>
                            <p class="sms-text">Buyer: ${buyerPhone}</p>
                            <p class="sms-text">Item: ${itemName}</p>
                            <p class="sms-text">Amount: ${formattedAmount}</p>
                            <p class="sms-text" style="margin-top: 10px;">Funds secured in escrow. Please prepare for delivery. You will receive ${formattedAmount} after buyer confirmation.</p>
                        </div>
                        <p class="sms-note">Recipient: ${sellerPhone}</p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', overlayHtml);
        
        const previewElement = document.getElementById('smsPreview');
        
        document.getElementById('closeSmsPreview').addEventListener('click', function() {
            previewElement.remove();
        });
        
        previewElement.addEventListener('click', function(event) {
            if (event.target === previewElement) {
                previewElement.remove();
            }
        });
    }

    // ============================================================================
    // ESCROW FORM HANDLER
    // ============================================================================
    
    function initializeEscrowForm() {
        const form = document.querySelector('.escrow-form');
        if (!form) return;
        
        const amountInput = form.querySelector('#amount');
        const displayAmount = document.querySelector('#displayAmount');
        const escrowFeeDisplay = document.querySelector('#escrowFee');
        const totalAmountDisplay = document.querySelector('#totalAmount');
        
        if (amountInput) {
            amountInput.addEventListener('input', function() {
                const baseAmount = parseFloat(this.value) || 0;
                const feeAmount = baseAmount * CONFIG.ESCROW_FEE_PERCENTAGE;
                const totalAmount = baseAmount + feeAmount;
                
                if (displayAmount) displayAmount.textContent = formatKES(baseAmount);
                if (escrowFeeDisplay) escrowFeeDisplay.textContent = formatKES(feeAmount);
                if (totalAmountDisplay) totalAmountDisplay.textContent = formatKES(totalAmount);
            });
        }
        
        form.addEventListener('submit', async function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            const itemNameInput = form.querySelector('#itemName');
            const amountInput = form.querySelector('#amount');
            const buyerPhoneInput = form.querySelector('#buyerContact');
            const sellerPhoneInput = form.querySelector('#sellerContact');
            
            let isValid = true;
            let errorMessage = '';
            
            if (!itemNameInput || !itemNameInput.value.trim()) {
                isValid = false;
                errorMessage = 'Please enter the item description';
            } else if (!amountInput || !amountInput.value || parseFloat(amountInput.value) < 100) {
                isValid = false;
                errorMessage = 'Amount must be at least KES 100';
            } else if (!buyerPhoneInput || !validateKenyanPhone(buyerPhoneInput.value)) {
                isValid = false;
                errorMessage = 'Please enter a valid buyer phone number';
            } else if (!sellerPhoneInput || !validateKenyanPhone(sellerPhoneInput.value)) {
                isValid = false;
                errorMessage = 'Please enter a valid seller phone number';
            } else if (buyerPhoneInput.value === sellerPhoneInput.value) {
                isValid = false;
                errorMessage = 'Buyer and seller phone numbers must be different';
            }
            
            if (!isValid) {
                ToastManager.error(errorMessage, 'Validation Error');
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
                deliveryDeadline: form.querySelector('#deliveryDeadline')?.value || ''
            };
            
            const existingPopup = document.getElementById('paymentPopup');
            if (existingPopup) existingPopup.remove();
            
            const paymentHTML = `
                <div class="payment-popup-overlay" id="paymentPopup">
                    <div class="payment-popup">
                        <div class="popup-header">
                            <h3>Ready to secure this transaction?</h3>
                            <button class="popup-close" id="closePaymentPopup" aria-label="Close">&times;</button>
                        </div>
                        <div class="popup-body">
                            <div class="payment-summary">
                                <div class="summary-item">
                                    <span class="summary-label">Item</span>
                                    <span class="summary-value">${itemNameInput.value}</span>
                                </div>
                                <div class="summary-divider"></div>
                                <div class="summary-item">
                                    <span class="summary-label">Item amount</span>
                                    <span class="summary-value">${formatKES(baseAmount)}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="summary-label">Protection fee (11%)</span>
                                    <span class="summary-value">${formatKES(feeAmount)}</span>
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
                                <button class="btn-primary-pay" id="confirmPaymentButton">Confirm and pay with M-PESA</button>
                                <button class="btn-secondary-pay" id="cancelPaymentButton">Cancel</button>
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
                
                ToastManager.info('Creating transaction...', 'Please wait');
                
                try {
                    const result = await ApiClient.createTransaction(transactionData);
                    
                    if (result.success) {
                        setTimeout(function() {
                            displayAuthorizationCodePopup(result.transactionId, result.authCode);
                            displaySmsPreview(result.transactionId, buyerPhoneInput.value, sellerPhoneInput.value, itemNameInput.value, baseAmount);
                        }, 300);
                        
                        form.reset();
                        if (displayAmount) displayAmount.textContent = 'KES 0';
                        if (escrowFeeDisplay) escrowFeeDisplay.textContent = 'KES 0';
                        if (totalAmountDisplay) totalAmountDisplay.textContent = 'KES 0';
                        
                        ToastManager.success('Transaction created successfully', 'Success');
                    } else {
                        ToastManager.error(result.error || 'Failed to create transaction', 'Error');
                    }
                } catch (error) {
                    console.error('API Error:', error);
                    ToastManager.error('Could not connect to server. Make sure backend is running.', 'Connection Error');
                }
            });
            
            document.getElementById('cancelPaymentButton').addEventListener('click', dismissPopup);
            document.getElementById('closePaymentPopup').addEventListener('click', dismissPopup);
            
            popupElement.addEventListener('click', function(event) {
                if (event.target === popupElement) dismissPopup();
            });
        });
        
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
        if (!form) return;
        
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            
            const nameInput = form.querySelector('#fullName, [name="fullName"]');
            const emailInput = form.querySelector('#emailAddress, [name="emailAddress"]');
            const messageInput = form.querySelector('#messageContent, [name="messageContent"]');
            
            let isValid = true;
            let errorMessage = '';
            
            if (!nameInput || !nameInput.value.trim()) {
                isValid = false;
                errorMessage = 'Please enter your name';
            } else if (!emailInput || !validateEmail(emailInput.value)) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            } else if (!messageInput || !messageInput.value.trim()) {
                isValid = false;
                errorMessage = 'Please enter your message';
            }
            
            if (isValid) {
                ToastManager.success('Thank you for contacting us. We will respond within two hours during business hours.', 'Message Received');
                form.reset();
            } else {
                ToastManager.error(errorMessage, 'Form Incomplete');
            }
        });
    }

    // ============================================================================
    // TRANSACTION TRACKING PAGE
    // ============================================================================
    
    function initializeTrackingPage() {
        const trackForm = document.getElementById('trackForm');
        const phoneForm = document.getElementById('phoneForm');
        
        if (!trackForm && !phoneForm) return;
        
        if (trackForm) {
            trackForm.addEventListener('submit', async function(event) {
                event.preventDefault();
                const transactionId = document.getElementById('trackId').value.trim().toUpperCase();
                
                ToastManager.info('Searching for transaction...', 'Please wait');
                
                try {
                    const transaction = await ApiClient.getTransaction(transactionId);
                    
                    if (transaction.error) {
                        ToastManager.error('No transaction found with this reference.', 'Not Found');
                    } else {
                        renderTransactionDetails(transaction, null);
                    }
                } catch (error) {
                    ToastManager.error('Could not connect to server.', 'Connection Error');
                }
            });
        }
        
        if (phoneForm) {
            phoneForm.addEventListener('submit', async function(event) {
                event.preventDefault();
                const phoneNumber = document.getElementById('trackPhone').value.trim();
                
                ToastManager.info('Searching for transactions...', 'Please wait');
                
                try {
                    const result = await ApiClient.trackByPhone(phoneNumber);
                    
                    if (result.error) {
                        ToastManager.error('No transactions found for this phone number.', 'Not Found');
                    } else if (result.transactions && result.transactions.length > 0) {
                        renderTransactionDetails(result.transactions[0], phoneNumber);
                    }
                } catch (error) {
                    ToastManager.error('Could not connect to server.', 'Connection Error');
                }
            });
        }
    }

    function renderTransactionDetails(transaction, verifiedPhone) {
        const displayContainer = document.getElementById('transactionDisplay');
        if (!displayContainer) return;
        
        const isBuyer = verifiedPhone === transaction.buyer_phone;
        const isSeller = verifiedPhone === transaction.seller_phone;
        
        const statusConfig = {
            [TRANSACTION_STATUS.FUNDS_SECURED]: { class: 'status-secured', text: 'Funds Secured — Awaiting Delivery' },
            [TRANSACTION_STATUS.AWAITING_DELIVERY]: { class: 'status-awaiting', text: 'Shipped — Awaiting Confirmation' },
            [TRANSACTION_STATUS.DELIVERED]: { class: 'status-delivered', text: 'Delivered — Ready for Release' },
            [TRANSACTION_STATUS.FUNDS_RELEASED]: { class: 'status-released', text: 'Completed — Funds Released' },
            [TRANSACTION_STATUS.DISPUTED]: { class: 'status-disputed', text: 'Dispute Raised — Under Review' }
        };
        
        const currentStatus = statusConfig[transaction.status] || { class: '', text: transaction.status };
        
        let detailsHtml = `
            <div class="transaction-details-card">
                <div class="transaction-header">
                    <h3>Transaction ${transaction.id}</h3>
                    <span class="status-badge ${currentStatus.class}">${currentStatus.text}</span>
                </div>
                
                <div class="transaction-info-grid">
                    <div class="info-item">
                        <span class="info-label">Item</span>
                        <span class="info-value">${transaction.item_name}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Amount</span>
                        <span class="info-value">${formatKES(transaction.amount)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Buyer</span>
                        <span class="info-value">${transaction.buyer_phone}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Seller</span>
                        <span class="info-value">${transaction.seller_phone}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Initiated</span>
                        <span class="info-value">${new Date(transaction.created_at).toLocaleString()}</span>
                    </div>
                </div>
        `;
        
        if (isBuyer && (transaction.status === TRANSACTION_STATUS.FUNDS_SECURED || 
                        transaction.status === TRANSACTION_STATUS.AWAITING_DELIVERY ||
                        transaction.status === TRANSACTION_STATUS.DELIVERED)) {
            detailsHtml += `
                <div class="action-section buyer-section">
                    <p class="role-indicator">You are transacting as the Buyer</p>
                    <div class="auth-input-group">
                        <label for="authCodeInput">Enter your authorization code to release funds</label>
                        <div class="auth-input-wrapper">
                            <input type="text" id="authCodeInput" placeholder="Six-digit code" maxlength="6" class="auth-input" inputmode="numeric">
                            <button class="btn-release-funds" id="releaseFundsButton" data-transaction-id="${transaction.id}">Release Funds</button>
                        </div>
                    </div>
                    <button class="btn-dispute" id="raiseDisputeButton">Raise a Dispute</button>
                </div>
            `;
        } else if (isSeller && transaction.status === TRANSACTION_STATUS.FUNDS_SECURED) {
            detailsHtml += `
                <div class="action-section seller-section">
                    <p class="role-indicator">You are transacting as the Seller</p>
                    <button class="btn-mark-shipped" id="markShippedButton" data-transaction-id="${transaction.id}">Mark Item as Shipped</button>
                </div>
            `;
        } else if (transaction.status === TRANSACTION_STATUS.FUNDS_RELEASED) {
            detailsHtml += `
                <div class="action-section completed-section">
                    <p class="completion-message">This transaction is complete. Funds have been released to the seller.</p>
                </div>
            `;
        } else {
            detailsHtml += `
                <div class="action-section viewer-section">
                    <p class="role-indicator">View only. Verify your phone number to access transaction actions.</p>
                </div>
            `;
        }
        
        detailsHtml += `</div>`;
        displayContainer.innerHTML = detailsHtml;
        
        setTimeout(() => {
            const releaseButton = document.getElementById('releaseFundsButton');
            if (releaseButton) {
                releaseButton.addEventListener('click', async function() {
                    const authInput = document.getElementById('authCodeInput');
                    const transactionId = this.dataset.transactionId;
                    
                    if (!authInput.value) {
                        ToastManager.error('Please enter your authorization code.', 'Code Required');
                        return;
                    }
                    
                    ToastManager.info('Verifying authorization code...', 'Please wait');
                    
                    try {
                        const result = await ApiClient.releaseFunds(transactionId, authInput.value, transaction.buyer_phone);
                        
                        if (result.success) {
                            ToastManager.success('Funds have been released to the seller.', 'Transaction Complete');
                            setTimeout(() => location.reload(), 1500);
                        } else {
                            ToastManager.error(result.error || 'The authorization code you entered is incorrect.', 'Access Denied');
                        }
                    } catch (error) {
                        ToastManager.error('Could not connect to server.', 'Connection Error');
                    }
                });
            }
            
            const shipButton = document.getElementById('markShippedButton');
            if (shipButton) {
                shipButton.addEventListener('click', async function() {
                    const transactionId = this.dataset.transactionId;
                    
                    if (confirm('Confirm that the item has been shipped? The buyer will be notified.')) {
                        ToastManager.info('Updating status...', 'Please wait');
                        
                        try {
                            const result = await ApiClient.updateStatus(transactionId, 'AWAITING_DELIVERY', transaction.seller_phone);
                            
                            if (result.success) {
                                ToastManager.success('Item marked as shipped. The buyer has been notified.', 'Status Updated');
                                setTimeout(() => location.reload(), 1500);
                            } else {
                                ToastManager.error(result.error || 'Failed to update status.', 'Error');
                            }
                        } catch (error) {
                            ToastManager.error('Could not connect to server.', 'Connection Error');
                        }
                    }
                });
            }
            
            const disputeButton = document.getElementById('raiseDisputeButton');
            if (disputeButton) {
                disputeButton.addEventListener('click', async function() {
                    if (confirm('Raise a dispute for this transaction? A support agent will review the case.')) {
                        const transactionId = releaseButton?.dataset.transactionId;
                        if (transactionId) {
                            ToastManager.info('Filing dispute...', 'Please wait');
                            
                            try {
                                const result = await ApiClient.updateStatus(transactionId, 'DISPUTED', verifiedPhone);
                                
                                if (result.success) {
                                    ToastManager.warning('Dispute raised. Our team will contact both parties within 24 hours.', 'Dispute Filed');
                                    setTimeout(() => location.reload(), 1500);
                                } else {
                                    ToastManager.error(result.error || 'Failed to raise dispute.', 'Error');
                                }
                            } catch (error) {
                                ToastManager.error('Could not connect to server.', 'Connection Error');
                            }
                        }
                    }
                });
            }
        }, 100);
    }

    // ============================================================================
    // MOBILE NAVIGATION
    // ============================================================================
    
    function initializeMobileNavigation() {
        const toggleButton = document.getElementById('menuToggle');
        const sidebar = document.getElementById('mobileSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const navigationLinks = document.querySelectorAll('.sidebar-nav .nav-link');
        
        if (!toggleButton || !sidebar || !overlay) return;
        
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
                if (href === '#' || href === '#0') return;
                
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
            const response = await fetch(`${API_BASE_URL}/health`);
            if (response.ok) {
                console.log('Backend connected successfully.');
            } else {
                console.warn('Backend not responding.');
            }
        } catch (error) {
            console.warn('Backend not reachable. Start the server with: python app.py');
        }
    }
    
    function initializeApplication() {
        initializePageLoader();
        initializeMobileNavigation();
        initializeBackToTop();
        WhatsAppIntegration.initialize();
        initializeEscrowForm();
        initializeContactForm();
        initializeTrackingPage();
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApplication);
    } else {
        initializeApplication();
    }

})();