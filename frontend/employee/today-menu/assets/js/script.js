(async function() {
    'use strict';
    const API_BASE = window.API_BASE || `${location.origin}/api`;
     if (!window.GlobalLanguage) {
        window.GlobalLanguage = { current: 'en' };
    }
    // -------------------------------
    // 🧩 Update DB status (Flask API)
    // -------------------------------
    async function updateMenuStatus(menuId, newStatus) {
        try {
            const res = await fetch(`${API_BASE}/today-menu/update-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    menu_id: menuId,
                    status: newStatus
                })
            });
            const data = await res.json();
            if (!data.success) {
                console.error('❌ Failed to update status:', data);
                showNotification('❌ Update failed on server!', 'error');
            } else {
                console.log(`✅ Updated menu_id=${menuId} to ${newStatus}`);
            }
        } catch (err) {
            console.error('Error calling update-status API:', err);
            showNotification('⚠️ Cannot connect to server!', 'error');
        }
    }

    // -------------------------------
    // 🧩 Status text & translation
    // -------------------------------
    const statusText = {
        'havent-done': { en: "Haven't done", vi: 'Chưa làm' },
        'doing': { en: 'Doing', vi: 'Đang làm' },
        'done': { en: 'Done', vi: 'Hoàn thành' }
    };

    function normalizeStatus(status) {
        const s = status.toLowerCase();
        if (s.includes('done') && !s.includes("haven")) return 'done';
        if (s.includes('doing')) return 'doing';
        return 'havent-done';
    }

    function updateStatusBadge(menuId, newStatus) {
        const row = document.querySelector(`tr[data-menu="${menuId}"]`);
        if (!row) return;

        const badge = row.querySelector('.status-badge');
        if (!badge) return;

        badge.classList.remove('status-done', 'status-doing', 'status-havent-done');
        badge.classList.add(`status-${newStatus}`);

        const lang =
    window.GlobalLanguage && typeof window.GlobalLanguage.current === 'string'
        ? window.GlobalLanguage.current.toLowerCase()
        : 'en';

        badge.textContent = statusText[newStatus][lang] || statusText[newStatus].en;
    }

    // -------------------------------
    // 🧩 Button handlers
    // -------------------------------
    function getCurrentStatus(menuId) {
        const row = document.querySelector(`tr[data-menu="${menuId}"]`);
        if (!row) return 'havent-done';
        const badge = row.querySelector('.status-badge');
        if (badge.classList.contains('status-done')) return 'done';
        if (badge.classList.contains('status-doing')) return 'doing';
        return 'havent-done';
    }

    function getProductName(menuId) {
        const row = document.querySelector(`tr[data-menu="${menuId}"]`);
        return row ? row.querySelector('.product-name').textContent.trim() : menuId;
    }

    async function handleStart(menuId) {
        const currentStatus = getCurrentStatus(menuId);
        const lang =
    window.GlobalLanguage && typeof window.GlobalLanguage.current === 'string'
        ? window.GlobalLanguage.current.toLowerCase()
        : 'en';

        const name = getProductName(menuId);

        if (currentStatus === 'done') {
            const msg = lang === 'en'
                ? 'Already completed. Change to Doing?'
                : 'Đã hoàn thành. Bạn có muốn đổi thành Đang làm không?';
            if (!confirm(msg)) return;
        }

        updateStatusBadge(menuId, 'doing');
        await updateMenuStatus(menuId, 'Doing');
        const notifMsg = lang === 'en'
        ? `Started ${name}`
        : `Bắt đầu làm ${name}`;
        showNotification(notifMsg, 'info');

    }

    async function handleComplete(menuId) {
    const currentStatus = getCurrentStatus(menuId);
    const lang = window.GlobalLanguage?.current?.toLowerCase() || 'en';
    const name = getProductName(menuId);

    // Nếu đã hoàn thành rồi
    if (currentStatus === 'done') {
        showNotification(`${name} is already done.`, 'info');
        return;
    }

    // 🔹 1. Gọi API lấy nguyên liệu từ công thức
    const res = await fetch(`${API_BASE}/today-menu/recipes/${menuId}`);
    const data = await res.json();
    if (!data.success) {
        showNotification('⚠️ Cannot load ingredients for this recipe!', 'error');
        return;
    }

    // 🔹 2. Hiển thị modal
    const modal = document.getElementById('confirmModal');
    const list = document.getElementById('ingredientList');
    const text = document.getElementById('confirmText').querySelector('b');
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelConfirm');

    text.textContent = name;
    list.innerHTML = data.ingredients
    .map(i => `<div><span>${i.ingredient_name}</span><span>${i.quantity} ${i.unit}</span></div>`)
    .join('');


    modal.style.display = 'flex';

    cancelBtn.onclick = () => {
        modal.style.display = 'none';
    };

    confirmBtn.onclick = async () => {
        modal.style.display = 'none';
        updateStatusBadge(menuId, 'done');

        // 🔹 3. Gửi API update status + trừ kho
        const deductRes = await fetch(`${API_BASE}/today-menu/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ menu_id: menuId })
        });

        const deductData = await deductRes.json();
        if (deductData.success) {
            showNotification(`Completed ${name}! 🎉`, 'success');
        } else {
            showNotification('⚠️ Failed to deduct ingredients!', 'error');
        }
    };
}


    // -------------------------------
    // 🧩 Load Today Menu
    // -------------------------------
async function loadTodayMenu() {
    const tbody = document.querySelector('.menu-table tbody');
    const table = document.querySelector('.menu-table');
    const loading = document.getElementById('loadingIndicator');

    try {
        // 🔹 Ẩn bảng, hiện thông báo “Loading...”
        table.classList.add('loading');
        loading.style.display = 'block';

        const res = await fetch(`${API_BASE}/today-menu/`);
        const data = await res.json();

        if (data.success) {
            tbody.innerHTML = ''; // Xoá dữ liệu cũ
            const currentLang =
                window.GlobalLanguage && window.GlobalLanguage.current
                    ? window.GlobalLanguage.current
                    : 'en';

            data.data.forEach(item => {
                const normalized = normalizeStatus(item.status);
                const displayStatus =
                    statusText[normalized][currentLang] ||
                    statusText[normalized].en;

                const tr = document.createElement('tr');
                tr.setAttribute('data-menu', item.menu_id);
                tr.innerHTML = `
                    <td class="product-name">${item.product_name}</td>
                    <td class="quantity">${item.quantity}</td>
                    <td class="note">${item.note || ''}</td>
                    <td><span class="status-badge status-${normalized}">${displayStatus}</span></td>
                    <td class="actions">
                        <button class="btn-start" data-menu="${item.menu_id}">Start</button>
                        <button class="btn-complete" data-menu="${item.menu_id}">Complete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            attachButtonEvents();
        }
    } catch (err) {
        console.error('Error loading today menu:', err);
        showNotification('⚠️ Failed to load menu data!', 'error');
    } finally {
        // 🔹 Khi có dữ liệu hoặc lỗi -> ẩn loading, hiện bảng
        loading.style.display = 'none';
        table.classList.remove('loading');
    }
}



    function attachButtonEvents() {
        document.querySelectorAll('.btn-start').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                const menuId = btn.getAttribute('data-menu');
                handleStart(menuId);
            });
        });

        document.querySelectorAll('.btn-complete').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                const menuId = btn.getAttribute('data-menu');
                handleComplete(menuId);
            });
        });
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.className = `notification notification-${type}`;
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            color: '#fff',
            fontWeight: '600',
            backgroundColor: type === 'success' ? '#10b981' :
                             type === 'error' ? '#ef4444' : '#3b82f6',
            zIndex: 9999
        });
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2500);
    }

    // -------------------------------
    // 🧩 Init
    // -------------------------------
    document.addEventListener('DOMContentLoaded', async () => {
        await loadTodayMenu();
    });
})();
