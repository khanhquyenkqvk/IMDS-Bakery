// Help Page Interactions

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
    console.log('Help center loaded:', new Date().toISOString());
    initLanguage();
    initHeaderClock();
    initSidebarNavigation();
    initFaqAccordion();
    initSearchAndFilters();
    initContactActions();
    initLogout();
    updateUserName();
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

function initFaqAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach((item) => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        if (!question || !answer) return;
        question.addEventListener('click', () => {
            const isOpen = item.classList.contains('active');
            faqItems.forEach(i => {
                i.classList.remove('active');
                i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
            });
            if (!isOpen) {
                item.classList.add('active');
                question.setAttribute('aria-expanded', 'true');
            }
        });
    });
}

function initSearchAndFilters() {
    const searchInput = document.getElementById('helpSearch');
    const chips = Array.from(document.querySelectorAll('.filter-chips .chip'));
    const filterable = () => Array.from(document.querySelectorAll('.guide-card, .faq-item, .resource'));
    let activeTopic = 'all';

    const apply = () => {
        const query = (searchInput?.value || '').toLowerCase().trim();
        filterable().forEach((el) => {
            const topic = el.getAttribute('data-topic') || '';
            const matchesTopic = activeTopic === 'all' || topic === activeTopic;
            const text = el.textContent.toLowerCase();
            const matchesQuery = !query || text.includes(query);
            const visible = matchesTopic && matchesQuery;
            el.classList.toggle('is-hidden', !visible);
        });
    };

    chips.forEach((chip) => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeTopic = chip.getAttribute('data-topic') || 'all';
            apply();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', apply);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                apply();
                const firstMatch = document.querySelector('.guide-card:not(.is-hidden), .faq-item:not(.is-hidden), .resource:not(.is-hidden)');
                firstMatch?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    apply();
}

function initContactActions() {
    const actionable = document.querySelectorAll('[data-action], .contact-chip');
    actionable.forEach((el) => {
        el.addEventListener('click', () => {
            const action = el.getAttribute('data-action');
            handleAction(action);
        });
    });

    const btnFaq = document.getElementById('btnViewAllFaq');
    if (btnFaq) {
        btnFaq.addEventListener('click', () => {
            document.querySelector('.faq-card')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

}

function handleAction(action) {
    switch (action) {
        case 'call':
            showToast('Calling hotline 1900 6868...');
            break;
        case 'email':
            window.location.href = 'mailto:support@imds-bakery.com';
            break;
        case 'chat':
            showToast('Opening live chat for you.');
            break;
        case 'open-ticket':
            showToast('Ticket form coming right up.');
            break;
        case 'open-inventory':
            window.location.href = '../check_inventory/lot-list.html';
            break;
        case 'download-handbook':
            showToast('Preparing handbook...');
            break;
        case 'open-recipes':
            window.location.href = '../recipe/recipe-list.html';
            break;
        case 'view-library':
            showToast('Opening resource library.');
            break;
        case 'tour':
            showToast('Starting a short guided tour.');
            break;
        default:
            showToast('Action ready.');
    }
}

function showToast(message) {
    const old = document.querySelector('.help-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'help-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #26599F;
        color: #fff;
        padding: 12px 16px;
        border-radius: 10px;
        box-shadow: 0 12px 24px rgba(0,0,0,0.2);
        z-index: 1200;
        font-weight: 600;
        font-size: 14px;
        animation: fadeIn 0.2s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
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

function updateUserName() {
    try {
        const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
        const el = document.querySelector('.user-name');
        if (el && (userInfo.username || userInfo.full_name)) {
            el.textContent = userInfo.username || userInfo.full_name;
        }
    } catch (_) {
        /* ignore */
    }
}
