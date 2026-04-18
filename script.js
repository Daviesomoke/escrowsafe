





/**
 * SecureEscrow Kenya - Complete JavaScript File
 */

(function() {
    'use strict';

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
        
        show(message, type, title, duration) {
            this.init();
            
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            
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
                <button class="toast-close">×</button>
            `;
            
            toast.querySelector('.toast-close').addEventListener('click', function() {
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
        
        success(message, title) {
            this.show(message, 'success', title, 5000);
        },
        
        error(message, title) {
            this.show(message, 'error', title, 5000);
        },
        
        warning(message, title) {
            this.show(message, 'warning', title, 5000);
        },
        
        info(message, title) {
            this.show(message, 'info', title, 5000);
        }
    };

    // ===== BACK TO TOP BUTTON =====
    function initBackToTop() {
        const button = document.createElement('button');
        button.className = 'back-to-top';
        button.innerHTML = '↑';
        button.setAttribute('aria-label', 'Back to top');
        document.body.appendChild(button);
        
        window.addEventListener('scroll', function() {
            if (window.scrollY > 300) {
                button.classList.add('visible');
            } else {
                button.classList.remove('visible');
            }
        });
        
        button.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
        
        return button;
    }

    // ===== WHATSAPP INTEGRATION =====
    const whatsappButton = {
        phoneNumber: '254791190667',
        button: null,
        tooltip: null,
        
        init: function() {
            this.createButton();
            this.createTooltip();
            this.setupEvents();
            this.adjustPosition();
        },
        
        createButton: function() {
            const button = document.createElement('a');
            button.className = 'whatsapp-float';
            button.href = 'https://wa.me/254791190667?text=Hello%20SecureEscrow%20Kenya%2C%20I%20need%20assistance%20with...';
            button.target = '_blank';
            button.setAttribute('aria-label', 'Contact us on WhatsApp');
            
            button.innerHTML = `
                <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 2C8.28 2 2 8.28 2 16c0 2.47.64 4.88 1.86 7L2.5 29.5l6.64-1.36C11.28 29.32 13.61 30 16 30c7.72 0 14-6.28 14-14S23.72 2 16 2zm0 25.67c-2.25 0-4.45-.6-6.36-1.73l-.46-.27-3.95.81.84-3.85-.3-.47C4.5 19.92 3.83 17.98 3.83 16c0-6.72 5.45-12.17 12.17-12.17S28.17 9.28 28.17 16 22.72 27.67 16 27.67z"/>
                    <path d="M22.92 19.2c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.14-.42-2.17-1.34-.8-.72-1.34-1.6-1.5-1.87-.16-.27-.02-.42.12-.55.12-.12.27-.32.41-.48.13-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.47-.84-2.01-.22-.52-.44-.45-.61-.46-.16 0-.34-.02-.52-.02-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27 0 1.34.98 2.63 1.11 2.81.14.18 1.92 2.93 4.65 4.11.65.28 1.16.45 1.56.58.66.21 1.25.18 1.72.11.52-.08 1.6-.65 1.83-1.29.23-.63.23-1.18.16-1.29-.07-.11-.25-.18-.52-.31z"/>
                </svg>
            `;
            
            document.body.appendChild(button);
            this.button = button;
        },
        
        createTooltip: function() {
            const tooltip = document.createElement('div');
            tooltip.className = 'whatsapp-tooltip';
            tooltip.textContent = 'Chat with Customer Support';
            document.body.appendChild(tooltip);
            this.tooltip = tooltip;
        },
        
        setupEvents: function() {
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
                }, 5000);
            }, 2000);
        },
        
        adjustPosition: function() {
            const self = this;
            
            window.addEventListener('scroll', function() {
                const backToTop = document.querySelector('.back-to-top');
                if (backToTop && backToTop.classList.contains('visible')) {
                    self.button.classList.add('with-back-to-top');
                } else {
                    self.button.classList.remove('with-back-to-top');
                }
            });
        }
    };

    // ===== FORM VALIDATION HELPERS =====
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

    // ===== ESCROW FORM HANDLER =====
    function initEscrowForm() {
        const form = document.querySelector('.escrow-form');
        if (!form) return;
        
        const amountInput = form.querySelector('#amount, [name="amount"]');
        const displayAmount = document.querySelector('#displayAmount');
        const escrowFee = document.querySelector('#escrowFee');
        const totalAmount = document.querySelector('#totalAmount');
        
        if (amountInput) {
            amountInput.addEventListener('input', function() {
                const amount = parseFloat(this.value) || 0;
                const fee = amount * 0.02;
                const total = amount + fee;
                
                if (displayAmount) displayAmount.textContent = formatKES(amount);
                if (escrowFee) escrowFee.textContent = formatKES(fee);
                if (totalAmount) totalAmount.textContent = formatKES(total);
            });
        }
        
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const itemName = form.querySelector('#itemName, [name="itemName"]');
            const amount = form.querySelector('#amount, [name="amount"]');
            const sellerPhone = form.querySelector('#sellerContact, [name="sellerContact"]');
            
            let isValid = true;
            let errorMessage = '';
            
            if (!itemName || !itemName.value.trim()) {
                isValid = false;
                errorMessage = 'Please enter the item description';
            } else if (!amount || !amount.value || parseFloat(amount.value) < 100) {
                isValid = false;
                errorMessage = 'Amount must be at least KES 100';
            } else if (!sellerPhone || !validateKenyanPhone(sellerPhone.value)) {
                isValid = false;
                errorMessage = 'Please enter a valid Kenyan phone number';
            }
            
            if (isValid) {
                const confirmMessage = 'Proceed with transaction for ' + formatKES(parseFloat(amount.value)) + '?';
                
                if (confirm(confirmMessage)) {
                    ToastManager.success('Transaction initiated! Redirecting to payment...', 'Success');
                    form.reset();
                    if (displayAmount) displayAmount.textContent = 'KES 0';
                    if (escrowFee) escrowFee.textContent = 'KES 0';
                    if (totalAmount) totalAmount.textContent = 'KES 0';
                }
            } else {
                ToastManager.error(errorMessage, 'Validation Error');
            }
        });
        
        const deadlineInput = form.querySelector('#deliveryDeadline, [name="deliveryDeadline"]');
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

    // ===== CONTACT FORM HANDLER =====
    function initContactForm() {
        const form = document.querySelector('.contact-form');
        if (!form) return;
        
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const name = form.querySelector('#fullName, [name="fullName"]');
            const email = form.querySelector('#emailAddress, [name="emailAddress"]');
            const message = form.querySelector('#messageContent, [name="messageContent"]');
            
            let isValid = true;
            let errorMessage = '';
            
            if (!name || !name.value.trim()) {
                isValid = false;
                errorMessage = 'Please enter your name';
            } else if (!email || !validateEmail(email.value)) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            } else if (!message || !message.value.trim()) {
                isValid = false;
                errorMessage = 'Please enter your message';
            }
            
            if (isValid) {
                ToastManager.success('Thank you! We will respond within 2 hours.', 'Message Sent');
                form.reset();
            } else {
                ToastManager.error(errorMessage, 'Form Error');
            }
        });
    }

    




    // ===== MOBILE SIDEBAR NAVIGATION =====
function initMobileSidebar() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('mobileSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const closeBtn = document.getElementById('sidebarClose');
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    
    if (!menuToggle || !sidebar || !overlay) return;
    
    // Open sidebar
    menuToggle.addEventListener('click', function() {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.classList.add('sidebar-open');
        document.body.style.overflow = 'hidden';
    });
    
    // Close sidebar function
    function closeSidebar() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.classList.remove('sidebar-open');
        document.body.style.overflow = '';
    }
    
    // Close on overlay click
    overlay.addEventListener('click', closeSidebar);
    
    // Close on close button
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSidebar);
    }
    
    // Close on nav link click
    navLinks.forEach(function(link) {
        link.addEventListener('click', closeSidebar);
    });
    
    // Close on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) {
            closeSidebar();
        }
    });
}

    // ===== SMOOTH SCROLLING =====
    function initSmoothScrolling() {
        document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
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
                }
            });
        });
    }

    // ===== SCROLL ANIMATIONS =====
    function initScrollAnimations() {
        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, {
            threshold: 0.1
        });
        
        document.querySelectorAll('.trust-card, .stat-card, .process-step, .feature-item').forEach(function(el) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            observer.observe(el);
        });
    }

    // ===== MAIN INITIALIZATION =====
    function init() {
        initMobileSidebar();      // NEW - Sidebar navigation
        initBackToTop();
        whatsappButton.init();
        initEscrowForm();
        initContactForm();
        initSmoothScrolling();
        initScrollAnimations();
        
        if (!localStorage.getItem('visited_escrow')) {
            setTimeout(function() {
                ToastManager.info('Welcome to SecureEscrow Kenya! Click the WhatsApp icon for support.', 'Welcome');
            }, 1000);
            localStorage.setItem('visited_escrow', 'true');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();