





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
        
        async getPayout(transactionId) {
            const response = await fetch(`${API_BASE_URL}/transactions/${transactionId}/payout`);
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

    // ============================================================================
    // PAGE LOADER
    // ============================================================================
    
    function initializePageLoader() {
        const loader = document.getElementById('pageLoader');
        if (!loader) {
            return;
        }
        
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
        icons: { success: 'OK', error: 'X', warning: '!', info: 'i' },
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
            toast.className = 'toast ' + type;
            
            const displayTitle = title || this.titles[type] || 'Notice';
            const displayIcon = this.icons[type] || '•';
            
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
                                    <span class="summary-value">${itemNameInput.value}</span>
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
                ToastManager.info('Creating transaction...', 'Please wait');
                
                try {
                    const result = await ApiClient.createTransaction(transactionData);
                    
                    if (result.success) {
                        ToastManager.success('Transaction created! Seller has been notified.', 'Success');
                        form.reset();
                        if (displayAmount) displayAmount.textContent = 'KES 0';
                        if (totalAmountDisplay) totalAmountDisplay.textContent = 'KES 0';
                        setTimeout(function() {
                            ToastManager.info('Reference: ' + result.transactionId, 'Transaction ID');
                        }, 500);
                    } else {
                        ToastManager.error(result.error || 'Failed to create transaction', 'Error');
                    }
                } catch (error) {
                    console.error('API Error:', error);
                    ToastManager.error('Could not connect to server.', 'Connection Error');
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
                errorMessage = 'Please enter your name';
            } else if (!emailInput || !validateEmail(emailInput.value)) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            } else if (!messageInput || !messageInput.value.trim()) {
                isValid = false;
                errorMessage = 'Please enter your message';
            }
            
            if (isValid) {
                ToastManager.success('Thank you for contacting us.', 'Message Received');
                form.reset();
            } else {
                ToastManager.error(errorMessage, 'Form Incomplete');
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
                
                ToastManager.info('Searching for transactions...', 'Please wait');
                
                try {
                    const result = await ApiClient.trackByPhone(phoneNumber);
                    
                    if (result.error) {
                        ToastManager.error('No transactions found for this phone number.', 'Not Found');
                    } else if (result.transactions && result.transactions.length > 0) {
                        currentVerifiedPhone = phoneNumber;
                        currentUserRole = null;
                        currentMagicToken = null;
                        currentTransactionId = result.transactions[0].id;
                        renderTransactionDetails(result.transactions[0], phoneNumber, null, null);
                    }
                } catch (error) {
                    ToastManager.error('Could not connect to server.', 'Connection Error');
                }
            });
        }

        // Phone verification button
        const verifyBtn = document.getElementById('verifyPhoneBtn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', function() {
                const phone = document.getElementById('verifyPhone').value.trim();
                
                if (!validateKenyanPhone(phone)) {
                    ToastManager.error('Please enter a valid phone number', 'Invalid Phone');
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
        ToastManager.info('Verifying your access...', 'Please wait');
        
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
                ToastManager.error(result.error || 'Invalid or expired link', 'Access Denied');
                loadTransactionById(transactionId);
            }
        } catch (error) {
            ToastManager.error('Could not connect to server.', 'Connection Error');
        }
    }

    async function loadTransactionById(transactionId) {
        ToastManager.info('Searching for transaction...', 'Please wait');
        
        try {
            const transaction = await ApiClient.getTransaction(transactionId);
            
            if (transaction.error) {
                ToastManager.error('No transaction found with this reference.', 'Not Found');
            } else {
                currentMagicToken = null;
                currentUserRole = null;
                currentTransactionId = transactionId;
                renderTransactionDetails(transaction, null, null, null);
            }
        } catch (error) {
            ToastManager.error('Could not connect to server.', 'Connection Error');
        }
    }

    async function loadTransactionWithPhone(transactionId, phone) {
        try {
            const transaction = await ApiClient.getTransaction(transactionId);
            
            if (transaction.error) {
                ToastManager.error('Transaction not found.', 'Not Found');
            } else {
                currentMagicToken = null;
                currentUserRole = null;
                currentTransactionId = transactionId;
                renderTransactionDetails(transaction, phone, null, null);
            }
        } catch (error) {
            ToastManager.error('Could not connect to server.', 'Connection Error');
        }
    }

    async function refreshTransactionDisplay() {
        if (!currentTransactionId) {
            return;
        }
        
        try {
            const transaction = await ApiClient.getTransaction(currentTransactionId);
            
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

    async function loadCurrentPayoutSettings(transactionId) {
        try {
            const result = await ApiClient.getPayout(transactionId);
            
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
        
        const isBuyer = verifiedPhone === transaction.buyer_phone;
        const isSeller = verifiedPhone === transaction.seller_phone;
        const isBuyerToken = (userRole === 'buyer');
        const isSellerToken = (userRole === 'seller');

        const statusConfig = {};
        statusConfig[TRANSACTION_STATUS.FUNDS_SECURED] = { class: 'status-secured', text: 'Funds secured' };
        statusConfig[TRANSACTION_STATUS.AWAITING_DELIVERY] = { class: 'status-awaiting', text: 'Shipped' };
        statusConfig[TRANSACTION_STATUS.DELIVERED] = { class: 'status-delivered', text: 'Delivered' };
        statusConfig[TRANSACTION_STATUS.FUNDS_RELEASED] = { class: 'status-released', text: 'Complete' };
        statusConfig[TRANSACTION_STATUS.DISPUTED] = { class: 'status-disputed', text: 'Disputed' };
        
        const currentStatus = statusConfig[transaction.status] || { class: '', text: transaction.status };
        
        // Build the transaction details HTML
        let detailsHtml = '';
        
        detailsHtml += '<div class="transaction-details-card">';
        detailsHtml += '<div class="transaction-header">';
        detailsHtml += '<h3>Transaction ' + transaction.id + '</h3>';
        detailsHtml += '<span class="status-badge ' + currentStatus.class + '">' + currentStatus.text + '</span>';
        detailsHtml += '</div>';
        
        detailsHtml += '<div class="transaction-info-grid">';
        detailsHtml += '<div class="info-item"><span class="info-label">Item</span><span class="info-value">' + transaction.item_name + '</span></div>';
        detailsHtml += '<div class="info-item"><span class="info-label">Amount</span><span class="info-value">' + formatKES(transaction.amount) + '</span></div>';
        detailsHtml += '<div class="info-item"><span class="info-label">Buyer</span><span class="info-value">' + transaction.buyer_phone + '</span></div>';
        detailsHtml += '<div class="info-item"><span class="info-label">Seller</span><span class="info-value">' + transaction.seller_phone + '</span></div>';
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
                    
                    if (!confirm('Release ' + formatKES(releaseAmount) + ' to seller? This cannot be undone.')) {
                        return;
                    }
                    
                    ToastManager.info('Processing release...', 'Please wait');
                    
                    try {
                        const result = await ApiClient.releaseFunds(txnId, currentMagicToken);
                        
                        if (result.success) {
                            ToastManager.success('Payment sent to seller.', 'Transaction Complete');
                            await refreshTransactionDisplay();
                        } else {
                            ToastManager.error(result.error || 'Failed to release funds.', 'Error');
                        }
                    } catch (error) {
                        ToastManager.error('Could not connect to server.', 'Connection Error');
                    }
                });
            }
            
            // Resend Magic Link Button
            const resendButton = document.getElementById('resendLinkButton');
            if (resendButton) {
                resendButton.addEventListener('click', async function() {
                    const txnId = this.dataset.transactionId;
                    
                    ToastManager.info('Sending new magic link...', 'Please wait');
                    
                    try {
                        const result = await ApiClient.resendMagicLink(txnId, verifiedPhone);
                        
                        if (result.success) {
                            ToastManager.success('New magic link sent to your phone.', 'Link Sent');
                        } else {
                            ToastManager.error(result.error || 'Failed to send link.', 'Error');
                        }
                    } catch (error) {
                        ToastManager.error('Could not connect to server.', 'Connection Error');
                    }
                });
            }
            
            // Mark as Shipped Button
            const shipButton = document.getElementById('markShippedButton');
            if (shipButton) {
                shipButton.addEventListener('click', async function() {
                    const txnId = this.dataset.transactionId;
                    
                    if (!confirm('Confirm that the item has been shipped?')) {
                        return;
                    }
                    
                    ToastManager.info('Updating status...', 'Please wait');
                    
                    try {
                        const result = await ApiClient.updateStatus(
                            txnId, 
                            'AWAITING_DELIVERY', 
                            verifiedPhone, 
                            currentMagicToken
                        );
                        
                        if (result.success) {
                            ToastManager.success('Marked as shipped.', 'Status Updated');
                            await refreshTransactionDisplay();
                        } else {
                            ToastManager.error(result.error || 'Failed to update status.', 'Error');
                        }
                    } catch (error) {
                        ToastManager.error('Could not connect to server.', 'Connection Error');
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
                    
                    if (!confirm('Raise a dispute for this transaction?')) {
                        return;
                    }
                    
                    ToastManager.info('Filing dispute...', 'Please wait');
                    
                    try {
                        const result = await ApiClient.updateStatus(
                            txnId, 
                            'DISPUTED', 
                            verifiedPhone, 
                            currentMagicToken
                        );
                        
                        if (result.success) {
                            ToastManager.warning('Dispute filed. We will contact you.', 'Dispute Filed');
                            await refreshTransactionDisplay();
                        } else {
                            ToastManager.error(result.error || 'Failed to raise dispute.', 'Error');
                        }
                    } catch (error) {
                        ToastManager.error('Could not connect to server.', 'Connection Error');
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
                        loadCurrentPayoutSettings(transaction.id);
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
                ToastManager.error('Please enter the Till or Paybill number.', 'Required Field');
                return;
            }
            
            if (payoutType === 'PAYBILL' && !payoutAccount) {
                ToastManager.error('Please enter the account number.', 'Required Field');
                return;
            }
            
            ToastManager.info('Updating payout method...', 'Please wait');
            
            try {
                const result = await ApiClient.updatePayout(
                    currentTransactionId, 
                    currentMagicToken, 
                    { payoutType, payoutNumber, payoutAccount }
                );
                
                if (result.success) {
                    ToastManager.success('Payout method updated.', 'Success');
                    document.getElementById('payoutSettingsSection').style.display = 'none';
                } else {
                    ToastManager.error(result.error || 'Failed to update', 'Error');
                }
            } catch (error) {
                ToastManager.error('Could not connect to server.', 'Connection Error');
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