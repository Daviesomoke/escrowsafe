








/**
 * SecureEscrow Kenya - Language Toggle (English / Swahili)
 * Walks the page for [data-i18n] elements and swaps their text using the
 * dictionary in translations.js. Preference is remembered in localStorage.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'secureescrow_lang';

    function getKey(obj, path) {
        return path.split('.').reduce(function (acc, part) {
            return acc && acc[part] !== undefined ? acc[part] : undefined;
        }, obj);
    }

    function applyLanguage(lang) {
        if (typeof TRANSLATIONS === 'undefined') return;
        const dict = TRANSLATIONS[lang];
        if (!dict) return;

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            const key = el.getAttribute('data-i18n');
            const value = getKey(dict, key);
            if (value !== undefined) el.textContent = value;
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-placeholder');
            const value = getKey(dict, key);
            if (value !== undefined) el.setAttribute('placeholder', value);
        });

        document.documentElement.setAttribute('lang', lang === 'sw' ? 'sw' : 'en');
        document.querySelectorAll('.lang-toggle button').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
        });
        document.querySelectorAll('.legal-notice').forEach(function (el) {
            el.style.display = lang === 'sw' ? 'block' : 'none';
        });
    }

    function setLanguage(lang) {
        localStorage.setItem(STORAGE_KEY, lang);
        applyLanguage(lang);
    }

    function injectToggle() {
        const menuToggle = document.getElementById('menuToggle');
        if (!menuToggle || document.querySelector('.lang-toggle')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'lang-toggle';
        wrapper.innerHTML =
            '<button type="button" data-lang="en">EN</button>' +
            '<button type="button" data-lang="sw">SW</button>';

        menuToggle.parentNode.insertBefore(wrapper, menuToggle);

        wrapper.querySelectorAll('button').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setLanguage(btn.getAttribute('data-lang'));
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        injectToggle();
        const saved = localStorage.getItem(STORAGE_KEY) || 'en';
        applyLanguage(saved);
    });
})();