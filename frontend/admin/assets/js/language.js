// Admin-specific language manager
// Uses separate localStorage key to keep admin and employee language preferences separate
// It only translates elements that explicitly declare data-en/data-vi,
// so database-driven content (without these attributes) will not be touched.

(function () {
    const STORAGE_KEY = 'app_language_admin'; // Separate key for admin

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
    }

    function applyLanguage(lang) {
        // Default to saved language when not provided
        const current = lang || getLanguage();
        const attr = current === 'vi' ? 'data-vi' : 'data-en';
        const elements = document.querySelectorAll('[data-en], [data-vi], [data-en-placeholder], [data-vi-placeholder], [data-en-title], [data-vi-title]');
        elements.forEach(el => {
            const text = el.getAttribute(attr);
            if (typeof text === 'string' && text.length) {
                el.textContent = text;
            }
            // Support placeholders/titles via data-*-placeholder/title if present
            const placeholderAttr = current === 'vi' ? 'data-vi-placeholder' : 'data-en-placeholder';
            if (el.hasAttribute(placeholderAttr)) {
                const ph = el.getAttribute(placeholderAttr);
                if (ph != null) el.setAttribute('placeholder', ph);
            }
            const titleAttr = current === 'vi' ? 'data-vi-title' : 'data-en-title';
            if (el.hasAttribute(titleAttr)) {
                const tt = el.getAttribute(titleAttr);
                if (tt != null) el.setAttribute('title', tt);
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
})();
