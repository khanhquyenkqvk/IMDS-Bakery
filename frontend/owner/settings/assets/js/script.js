// Owner Settings Page Logic (aligned with employee settings)

function formatHeaderDate(d) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
}

function formatHeaderTime(d) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

document.addEventListener('DOMContentLoaded', () => {
    initLanguage();
    initHeaderClock();
    initSidebarNavigation();
    initForm();
    initLogout();
    hydrateUserName();
});

function initLanguage() {
    if (window.GlobalLanguage) {
        window.GlobalLanguage.initialize();
    }
}

function initHeaderClock() {
    const elDate = document.querySelector('.header .date');
    const elTime = document.querySelector('.header .time');
    const tick = () => {
        if (window.GlobalLanguage && typeof window.GlobalLanguage.updateDateTime === 'function') {
            window.GlobalLanguage.updateDateTime();
            return;
        }
        const now = new Date();
        if (elDate) elDate.textContent = formatHeaderDate(now);
        if (elTime) elTime.textContent = formatHeaderTime(now);
    };
    tick();
    setInterval(tick, 60000);
}

function initSidebarNavigation() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    sidebar.addEventListener('click', (e) => {
        const btn = e.target.closest('.menu-item[data-href]');
        if (!btn || btn.hasAttribute('aria-current')) return;
        const href = btn.getAttribute('data-href');
        if (href) window.location.href = href;
    });
}

function initForm() {
    const saveBtn = document.getElementById('btnSave');
    const cancelBtn = document.getElementById('btnCancel');
    loadSettings();

    if (saveBtn) {
        saveBtn.addEventListener('click', handleSave);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            loadSettings();
            showToast('Đã hoàn tác thay đổi / Changes reverted');
        });
    }
}

function getSessionUserInfo() {
    try {
        const info = JSON.parse(sessionStorage.getItem('user_info') || '{}');
        return {
            fullName: info.username || info.full_name || '',
            email: info.email || '',
            phone: info.phone || info.phone_number || ''
        };
    } catch (_) {
        return { fullName: '', email: '', phone: '' };
    }
}

function getFormValues() {
    return {
        fullName: valueOf('#fullName'),
        email: valueOf('#email'),
        phone: valueOf('#phone'),
        language: valueOf('#language'),
        measurementUnits: valueOf('#measurementUnits'),
        autoSync: checked('#autoSync'),
        aiSuggestion: checked('#aiSuggestion'),
        emailNotifications: checked('#emailNotifications'),
        currentPassword: valueOf('#currentPassword'),
        newPassword: valueOf('#newPassword'),
        confirmPassword: valueOf('#confirmPassword')
    };
}

function setFormValues(data = {}) {
    setValue('#fullName', data.fullName || '');
    setValue('#email', data.email || '');
    setValue('#phone', data.phone || '');
    setValue('#language', data.language || 'en');
    setValue('#measurementUnits', data.measurementUnits || 'grams-ml');
    setChecked('#autoSync', data.autoSync !== false);
    setChecked('#aiSuggestion', data.aiSuggestion !== false);
    setChecked('#emailNotifications', data.emailNotifications !== false);
    setValue('#currentPassword', '');
    setValue('#newPassword', '');
    setValue('#confirmPassword', '');
}

function loadSettings() {
    try {
        const raw = localStorage.getItem('ownerSettings');
        const stored = raw ? JSON.parse(raw) : {};
        const sessionDefaults = getSessionUserInfo();
        const globalLang = localStorage.getItem('app_language');
        const lang = (globalLang === 'vi' || globalLang === 'en')
            ? globalLang
            : (stored.language === 'vi' ? 'vi' : 'en');
        setFormValues({ ...sessionDefaults, ...stored, language: lang });
        if (window.GlobalLanguage) {
            window.GlobalLanguage.setLanguage(lang);
        }
    } catch (e) {
        console.warn('Failed to load settings', e);
    }
}

function handleSave() {
    const settings = getFormValues();
    if (!validate(settings)) return;
    const toStore = { ...settings };
    delete toStore.currentPassword;
    delete toStore.newPassword;
    delete toStore.confirmPassword;
    localStorage.setItem('ownerSettings', JSON.stringify(toStore));
    const lang = (settings.language === 'vi') ? 'vi' : 'en';
    localStorage.setItem('app_language', lang);

    if (window.GlobalLanguage) {
        window.GlobalLanguage.setLanguage(lang);
    }
    showToast('Đã lưu cài đặt / Settings saved');
}

function validate(settings) {
    if (settings.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) {
        showToast('Email không hợp lệ / Invalid email');
        return false;
    }
    if (settings.newPassword || settings.confirmPassword) {
        if ((settings.newPassword || '').length < 8) {
            showToast('Mật khẩu mới tối thiểu 8 ký tự / Password needs 8+ chars');
            return false;
        }
        if (settings.newPassword !== settings.confirmPassword) {
            showToast('Mật khẩu không khớp / Passwords do not match');
            return false;
        }
    }
    return true;
}

function initLogout() {
    const btnLogout = document.getElementById('btnLogout');
    if (!btnLogout) return;
    btnLogout.addEventListener('click', () => {
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('user_info');
        localStorage.removeItem('bakery_credentials');
        window.location.href = '../../login/index.html';
    });
}

function hydrateUserName() {
    const info = getSessionUserInfo();
    const el = document.querySelector('.user-name');
    if (el && info.fullName) {
        el.textContent = info.fullName;
    }
}

function valueOf(selector) {
    const el = document.querySelector(selector);
    return el ? el.value.trim() : '';
}

function setValue(selector, val) {
    const el = document.querySelector(selector);
    if (el) el.value = val;
}

function checked(selector) {
    const el = document.querySelector(selector);
    return el ? !!el.checked : false;
}

function setChecked(selector, state) {
    const el = document.querySelector(selector);
    if (el) el.checked = !!state;
}

function showToast(message) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
}
