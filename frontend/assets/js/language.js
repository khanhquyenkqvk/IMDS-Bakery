// Simple global language manager used by Settings and other pages
// It only translates elements that explicitly declare data-en/data-vi,
// so database-driven content (without these attributes) will not be touched.

(function () {
    const STORAGE_KEY = 'app_language';

    function getLanguage() {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === 'vi' ? 'vi' : 'en';
    }

    function setLanguage(lang) {
        const normalized = lang === 'vi' ? 'vi' : 'en';
        localStorage.setItem(STORAGE_KEY, normalized);
        applyLanguage(normalized);
        // Sync select/button UI if present
        const select = document.getElementById('language');
        if (select) {
            select.value = normalized;
        }
        try {
            window.dispatchEvent(new CustomEvent('app-language-change', { detail: normalized }));
        } catch (_) {}
    }

    function applyLanguage(lang) {
        const attr = lang === 'vi' ? 'data-vi' : 'data-en';
        const elements = document.querySelectorAll('[data-en], [data-vi]');
        elements.forEach(el => {
            const raw = el.getAttribute(attr);
            const text = normalizeText(raw);
            if (typeof text === 'string' && text.length) {
                el.textContent = text;
            }
        });
    }

    function updateDateTime() {
        // Localized header date/time formatting
        const elDate = document.querySelector('.header .date');
        const elTime = document.querySelector('.header .time');
        if (!elDate && !elTime) return;

        const lang = getLanguage();
        const now = new Date();

        if (elDate) {
            if (lang === 'vi') {
                const dayNames = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
                const weekday = dayNames[now.getDay()];
                const day = now.getDate();
                const month = now.getMonth() + 1;
                // Format: "Thứ năm, ngày 30 tháng 10"
                elDate.textContent = `${weekday}, ngày ${day} tháng ${month}`;
            } else {
                const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                elDate.textContent = `${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}`;
            }
        }

        if (elTime) {
            let h = now.getHours();
            const m = String(now.getMinutes()).padStart(2, '0');
            if (lang === 'vi') {
                // 12-hour with SA/CH suffix (AM/PM)
                const suffix = h < 12 ? 'SA' : 'CH';
                let hh = h % 12; if (hh === 0) hh = 12;
                elTime.textContent = `${String(hh).padStart(2,'0')}:${m} ${suffix}`;
            } else {
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12; if (h === 0) h = 12;
                elTime.textContent = `${String(h).padStart(2,'0')}:${m} ${ampm}`;
            }
        }
    }

    function initialize() {
        const current = getLanguage();
        applyLanguage(current);
        try {
            window.dispatchEvent(new CustomEvent('app-language-change', { detail: current }));
        } catch (_) {}

        // Wire select if present
        const select = document.getElementById('language');
        if (select) {
            select.value = current;
            select.addEventListener('change', function () {
                setLanguage(this.value);
                updateDateTime();
            });
        }

        // Wire any buttons with data-lang="vi|en"
        document.querySelectorAll('[data-lang]').forEach(btn => {
            btn.addEventListener('click', function () {
                const lang = this.getAttribute('data-lang');
                setLanguage(lang);
                updateDateTime();
            });
        });

        // Initial date/time localization pass
        try { updateDateTime(); } catch (_) {}
    }

    window.GlobalLanguage = {
        initialize,
        setLanguage,
        getLanguage,
        applyLanguage,
        updateDateTime
    };

    function normalizeText(val) {
        if (typeof val !== 'string') return '';
        try {
            return decodeURIComponent(escape(val));
        } catch (_) {
            return val;
        }
    }
    // Auto-init so every page that includes language.js will apply saved language
    try {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
    } catch (_) {}

})();


