

/**
 * SecureEscrow Kenya - Main JavaScript Application
 * Professional escrow platform with enhanced interactivity
 */

(function() {
    'use strict';

    // ===== APPLICATION STATE =====
    const AppState = {
        currentPage: 'home',
        forms: {},
        modals: {},
        initialized: false
    };

    // ===== UTILITY FUNCTIONS =====
    
    /**
     * Debounce function to limit function calls
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Format currency in Kenyan Shillings
     */
    function formatKES(amount) {
        return new Intl.NumberFormat('en-KE', {
            style: 'currency',
            currency: 'KES',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount).replace('KES', 'KES ');
    }

    /**
     * Format date to local string
     */
    function formatDate(date) {
        return new Date(date).toLocaleDateString('en-KE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Validate Kenyan phone number
     */
    function validateKenyanPhone(phone) {
        const cleanPhone = phone.replace(/\s+/g, '');
        const phoneRegex = /^(0|\+254)[71]\d{8}$/;
        return phoneRegex.test(cleanPhone);
    }

    /**
     * Validate email format
     */
    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // ===== TOAST NOTIFICATION SYSTEM =====
    
    const ToastManager = {
        container: null,
        
        init() {
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.className = 'toast-container';
                document.body.appendChild(this.container);
            }
        },
        
        show(message, type = 'info', title = '', duration = 5000) {
            this.init();
            
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            
            const icons = {
                success: '✓',
                error: '✗',
                warning: '⚠',
                info: 'ℹ'
            };
            
            const titles = {
                success: title || 'Success',
                error: title || 'Error',
                warning: title || 'Warning',
                info: title || 'Information'
            };
            
            toast.innerHTML = `
                <span class="toast-icon">${icons[type]}</span>
                <div class="toast-content">
                    <div class="toast-title">${titles[type]}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" onclick="this.parentElement.remove()">×</button>
            `;
            
            this.container.appendChild(toast);
            
            if (duration > 0) {
                setTimeout(() => {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, duration);
            }
            
            return toast;
        },
        
        success(message, title = '') {
            return this.show(message, 'success', title);
        },
        
        error(message, title = '') {
            return this.show(message, 'error', title);
        },
        
        warning(message, title = '') {
            return this.show(message, 'warning', title);
        },
        
        info(message, title = '') {
            return this.show(message, 'info', title);
        }
    };

    // ===== MODAL SYSTEM =====
    
    const ModalManager = {
        createModal(id, title, content, options = {}) {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.id = `modal-${id}`;
            
            const modal = document.createElement('div');
            modal.className = 'modal';
            
            modal.innerHTML = `
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${options.showFooter !== false ? `
                    <div class="modal-footer">
                        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                        <button class="btn btn-primary" data-modal-action="confirm">Confirm</button>
                    </div>
                ` : ''}
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            setTimeout(() => overlay.classList.add('active'), 10);
            
            return overlay;
        },
        
        confirm(title, message, onConfirm, onCancel) {
            const modal = this.createModal('confirm', title, `<p>${message}</p>`);
            
            const confirmBtn = modal.querySelector('[data-modal-action="confirm"]');
            const cancelBtn = modal.querySelector('.modal-close');
            
            confirmBtn.addEventListener('click', () => {
                if (onConfirm) onConfirm();
                modal.remove();
            });
            
            cancelBtn.addEventListener('click', () => {
                if (onCancel) onCancel();
            });
            
            return modal;
        }
    };

    // ===== FORM VALIDATION =====
    
    const FormValidator = {
        rules: {
            required: (value) => value && value.trim().length > 0,
            email: (value) => validateEmail(value),
            phone: (value) => validateKenyanPhone(value),
            min: (value, min) => parseFloat(value) >= min,
            max: (value, max) => parseFloat(value) <= max,
            minLength: (value, min) => value.length >= min
        },
        
        messages: {
            required: 'This field is required',
            email: 'Please enter a valid email address',
            phone: 'Please enter a valid Kenyan phone number',
            min: 'Value must be at least {0}',
            max: 'Value must be at most {0}',
            minLength: 'Must be at least {0} characters'
        },
        
        validateField(field, rules) {
            const value = field.value;
            let isValid = true;
            let errorMessage = '';
            
            for (const rule of rules) {
                const [ruleName, param] = rule.split(':');
                
                if (this.rules[ruleName]) {
                    const valid = this.rules[ruleName](value, param);
                    if (!valid) {
                        isValid = false;
                        errorMessage = this.messages[ruleName].replace('{0}', param);
                        break;
                    }
                }
            }
            
            this.updateFieldStatus(field, isValid, errorMessage);
            return isValid;
        },
        
        updateFieldStatus(field, isValid, errorMessage) {
            const formGroup = field.closest('.form-field');
            const existingError = formGroup.querySelector('.error-message');
            
            field.classList.remove('error', 'success');
            field.classList.add(isValid ? 'success' : 'error');
            
            if (existingError) {
                existingError.remove();
            }
            
            if (!isValid) {
                const error = document.createElement('span');
                error.className = 'error-message';
                error.textContent = errorMessage;
                formGroup.appendChild(error);
            }
        },
        
        validateForm(form, fieldRules) {
            let isValid = true;
            
            for (const [fieldName, rules] of Object.entries(fieldRules)) {
                const field = form.querySelector(`[name="${fieldName}"]`);
                if (field) {
                    const fieldValid = this.validateField(field, rules);
                    if (!fieldValid) isValid = false;
                }
            }
            
            return isValid;
        }
    };

    // ===== ESCROW CALCULATOR =====
    
    const EscrowCalculator = {
        FEE_PERCENTAGE: 0.02, // 2%
        
        calculate(amount) {
            const fee = amount * this.FEE_PERCENTAGE;
            const total = amount + fee;
            
            return {
                amount: amount,
                fee: fee,
                total: total,
                formatted: {
                    amount: formatKES(amount),
                    fee: formatKES(fee),
                    total: formatKES(total)
                }
            };
        },
        
        updateDisplay(amountInput, displayElements) {
            const amount = parseFloat(amountInput.value) || 0;
            const calculation = this.calculate(amount);
            
            if (displayElements.amount) {
                displayElements.amount.textContent = calculation.formatted.amount;
            }
            if (displayElements.fee) {
                displayElements.fee.textContent = calculation.formatted.fee;
            }
            if (displayElements.total) {
                displayElements.total.textContent = calculation.formatted.total;
            }
            
            return calculation;
        }
    };

    // ===== ANIMATION OBSERVER =====
    
    const AnimationObserver = {
        init() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('animate-fade-in');
                        observer.unobserve(entry.target);
                    }
                });
            }, {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            });
            
            document.querySelectorAll('.trust-card, .stat-card, .process-step, .feature-item').forEach(el => {
                observer.observe(el);
            });
        }
    };

    // ===== BACK TO TOP BUTTON =====
    
    const BackToTop = {
        init() {
            const button = document.createElement('button');
            button.className = 'back-to-top';
            button.innerHTML = '↑';
            button.setAttribute('aria-label', 'Back to top');
            document.body.appendChild(button);
            
            window.addEventListener('scroll', debounce(() => {
                if (window.scrollY > 300) {
                    button.classList.add('visible');
                } else {
                    button.classList.remove('visible');
                }
            }, 100));
            
            button.addEventListener('click', () => {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            });
        }
    };

    // ===== FORM HANDLERS =====
    
    function initEscrowForm() {
        const form = document.getElementById('escrowInitForm') || document.querySelector('.escrow-form');
        if (!form) return;
        
        const amountInput = form.querySelector('#amount, [name="amount"]');
        const displayAmount = document.querySelector('#displayAmount');
        const escrowFee = document.querySelector('#escrowFee');
        const totalAmount = document.querySelector('#totalAmount');
        
        // Fee calculation
        if (amountInput) {
            amountInput.addEventListener('input', () => {
                EscrowCalculator.updateDisplay(amountInput, {
                    amount: displayAmount,
                    fee: escrowFee,
                    total: totalAmount
                });
            });
        }
        
        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const fieldRules = {
                'itemName': ['required', 'minLength:3'],
                'amount': ['required', 'min:100'],
                'sellerContact': ['required', 'phone'],
                'deliveryDeadline': ['required']
            };
            
            const isValid = FormValidator.validateForm(form, fieldRules);
            
            if (isValid) {
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                
                ModalManager.confirm(
                    'Confirm Transaction',
                    `Are you sure you want to proceed with this transaction for ${formatKES(parseFloat(data.amount))}?`,
                    () => {
                        ToastManager.success('Transaction initiated successfully! Proceeding to payment...', 'Success');
                        // Here you would typically submit to server
                        console.log('Transaction data:', data);
                    }
                );
            } else {
                ToastManager.error('Please correct the errors in the form.', 'Validation Error');
            }
        });
        
        // Set minimum date for deadline
        const deadlineInput = form.querySelector('#deliveryDeadline, [name="deliveryDeadline"]');
        if (deadlineInput) {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            deadlineInput.min = now.toISOString().slice(0, 16);
            
            // Set default to 3 days from now
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 3);
            defaultDate.setMinutes(defaultDate.getMinutes() - defaultDate.getTimezoneOffset());
            deadlineInput.value = defaultDate.toISOString().slice(0, 16);
        }
    }

    function initContactForm() {
        const form = document.getElementById('contactForm') || document.querySelector('.contact-form');
        if (!form) return;
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const fieldRules = {
                'fullName': ['required', 'minLength:2'],
                'emailAddress': ['required', 'email'],
                'messageContent': ['required', 'minLength:10']
            };
            
            const isValid = FormValidator.validateForm(form, fieldRules);
            
            if (isValid) {
                ToastManager.success(
                    'Thank you for your message. Our team will respond within 2 hours during business hours.',
                    'Message Sent'
                );
                form.reset();
            } else {
                ToastManager.error('Please fill in all required fields correctly.', 'Form Error');
            }
        });
    }

    // ===== MOBILE MENU ENHANCEMENT =====
    
    function enhanceMobileMenu() {
        const menuToggle = document.querySelector('.mobile-menu-checkbox');
        const nav = document.querySelector('.primary-nav');
        const navLinks = document.querySelectorAll('.nav-link');
        
        if (!menuToggle || !nav) return;
        
        // Close menu when link is clicked
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.checked = false;
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (menuToggle.checked && 
                !nav.contains(e.target) && 
                !e.target.closest('.mobile-menu-label')) {
                menuToggle.checked = false;
            }
        });
        
        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menuToggle.checked) {
                menuToggle.checked = false;
            }
        });
    }

    // ===== SMOOTH SCROLLING =====
    
    function initSmoothScrolling() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#' || href === '#0') return;
                
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                    
                    // Update URL without jumping
                    history.pushState(null, null, href);
                }
            });
        });
    }

    // ===== LAZY LOADING IMAGES =====
    
    function initLazyLoading() {
        if ('loading' in HTMLImageElement.prototype) {
            document.querySelectorAll('img[loading="lazy"]').forEach(img => {
                img.src = img.dataset.src;
            });
        } else {
            // Fallback for browsers that don't support lazy loading
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lazysizes/5.3.2/lazysizes.min.js';
            document.body.appendChild(script);
        }
    }

    // ===== PAGE-SPECIFIC INITIALIZATION =====
    
    function getCurrentPage() {
        const path = window.location.pathname;
        const page = path.split('/').pop().replace('.html', '');
        return page || 'index';
    }

    function initPageSpecific() {
        const page = getCurrentPage();
        
        switch(page) {
            case 'index':
            case '':
                initEscrowForm();
                break;
            case 'contact':
                initContactForm();
                break;
            case 'how-it-works':
                // Initialize any how-it-works specific features
                break;
            case 'about':
                // Initialize any about page specific features
                break;
        }
    }

    // ===== MAIN INITIALIZATION =====
    
    function init() {
        if (AppState.initialized) return;
        
        // Initialize global features
        BackToTop.init();
        AnimationObserver.init();
        enhanceMobileMenu();
        initSmoothScrolling();
        initLazyLoading();
        
        // Initialize page-specific features
        initPageSpecific();
        
        // Show welcome message on first visit
        if (!localStorage.getItem('visited')) {
            setTimeout(() => {
                ToastManager.info(
                    'Welcome to SecureEscrow Kenya! Your funds are protected with us.',
                    'Welcome'
                );
            }, 1000);
            localStorage.setItem('visited', 'true');
        }
        
        AppState.initialized = true;
        
        // Expose utilities to global scope for debugging
        window.SecureEscrow = {
            ToastManager,
            ModalManager,
            FormValidator,
            EscrowCalculator
        };
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();