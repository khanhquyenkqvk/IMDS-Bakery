// Admin Settings Page Logic (aligned with employee settings)
function resolveApiBase() {
  // ưu tiên nếu bạn set sẵn (vd khi deploy)
  if (window.API_BASE && /^https?:\/\//i.test(window.API_BASE)) return window.API_BASE;
  if (window.API_BASE_URL && /^https?:\/\//i.test(window.API_BASE_URL)) return window.API_BASE_URL;

  const host = window.location.hostname;

  // dev (localhost) mới dùng :5000
  if (host === "localhost" || host === "127.0.0.1") {
    return `${window.location.protocol}//${host}:5000`;
  }

  // prod: KHÔNG thêm port
  return window.location.origin; // vd: https://imdsbakery.id.vn
}

window.API_BASE = resolveApiBase();
const API_BASE = window.API_BASE;

console.log("[ADMIN-SETTINGS] API_BASE =", API_BASE);

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
    fetchAndFillUserInfo();
    initLogout();
    hydrateUserName();
});


function initLanguage() {
    if (window.GlobalLanguage) window.GlobalLanguage.initialize();
}

function initHeaderClock() {
    const elDate = document.querySelector('.header .date');
    const elTime = document.querySelector('.header .time');
    const tick = () => {
        if (window.GlobalLanguage && typeof window.GlobalLanguage.updateDateTime === 'function') {
            return window.GlobalLanguage.updateDateTime();
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
    if (saveBtn) saveBtn.addEventListener('click', handleSave);
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        loadSettings();
        showToast('Đã hoàn tác thay đổi / Changes reverted');
    });
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
        const raw = localStorage.getItem('adminSettings');
        const stored = raw ? JSON.parse(raw) : {};
        const sessionDefaults = getSessionUserInfo();
        const lang = (window.GlobalLanguage && window.GlobalLanguage.getLanguage && window.GlobalLanguage.getLanguage()) || stored.language || 'en';
        setFormValues({ ...sessionDefaults, ...stored, language: lang });
        if (window.GlobalLanguage) window.GlobalLanguage.setLanguage(lang);
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
    localStorage.setItem('adminSettings', JSON.stringify(toStore));
    if (window.GlobalLanguage) window.GlobalLanguage.setLanguage(settings.language || 'en');
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
    if (el && info.fullName) el.textContent = info.fullName;
}

async function fetchAndFillUserInfo() {
    const token = sessionStorage.getItem('auth_token');
    if (!token) return fillFromSession();
    try {
        const res = await fetch(`${API_BASE}/user/current`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) return fillFromSession();
        const result = await res.json();
        if (!result || result.success === false) return fillFromSession();
        const info = result.data || {};
        sessionStorage.setItem('user_info', JSON.stringify(info));
        applyUserInfo(info);
    } catch (err) {
        console.warn('Failed to fetch user info', err);
        fillFromSession();
    }
}

function applyUserInfo(info) {
    const fullName = info.username || info.full_name || info.name || '';
    const email = info.email || '';
    const phone = info.phone || info.phone_number || '';
    if (fullName) setValue('#fullName', fullName);
    if (email) setValue('#email', email);
    if (phone) setValue('#phone', phone);
    hydrateUserName();
}

function fillFromSession() {
    const info = getSessionUserInfo();
    applyUserInfo(info);
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
