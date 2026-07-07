const API_BASE = window.API_BASE || `${location.origin}/api`;

// assets/js/employee-home.js (Updated: Use 'warning_type' from API, handle N/A lot_code)
(function () {
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function () {
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('user_info');
            window.location.href = '../../login/index.html';
        });
    }

    // Sidebar navigation for items with data-href
    document.querySelectorAll('.sidebar .menu-item[data-href]')
        .forEach(function (el) {
            el.addEventListener('click', function () {
                // Remove active class from all menu items
                document.querySelectorAll('.sidebar .menu-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // Add active class to clicked item
                el.classList.add('active');
                
                // Store active state in sessionStorage
                const url = el.getAttribute('data-href');
                if (url) {
                    sessionStorage.setItem('active_menu', url);
                    window.location.href = url;
                }
            });
        });

    // Header realtime date/time and username
    function formatHeaderDate(d) {
        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
    }
    function formatHeaderTime(d) {
        let h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (h === 0) h = 12;
        return `${String(h).padStart(2,'0')}:${m} ${ampm}`;
    }
    const elDate = document.getElementById('currentDate');
    const elTime = document.getElementById('currentTime');
    const elUser = document.querySelector('.header .user-name');
    function tickHeader() {
        // If global language manager exists, delegate for proper VI/EN formatting
        if (window.GlobalLanguage && typeof window.GlobalLanguage.updateDateTime === 'function') {
            window.GlobalLanguage.updateDateTime();
            return;
        }
        // Fallback: English formatting
        const now = new Date();
        if (elDate) elDate.textContent = formatHeaderDate(now);
        if (elTime) elTime.textContent = formatHeaderTime(now);
    }
    tickHeader();
    setInterval(tickHeader, 60000); // Update every minute

    // Get username from sessionStorage (from login)
    try {
        const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
        if (userInfo && userInfo.username && elUser) {
            elUser.textContent = userInfo.username;
        }
    } catch (_) {}
    
    // Clear active menu state when on homepage
    sessionStorage.removeItem('active_menu');
    
    // Remove active from all menu items on homepage
    document.querySelectorAll('.sidebar .menu-item').forEach(item => {
        item.classList.remove('active');
    });
    // === Recent activity history on homepage ===
const MAX_RECENT_ACTIVITIES = 6;

function getLang() {
  try {
    if (window.GlobalLanguage?.getLanguage) return window.GlobalLanguage.getLanguage();
    if (typeof window.GlobalLanguage?.current === 'string') return window.GlobalLanguage.current;
  } catch(_) {}
  return 'en';
}

// Parse "YYYY-MM-DD HH:MM[:SS]" -> "HH:MM"
function formatTimeHHMM(str) {
  if (!str) return '--:--';
  const m = String(str).match(/[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  // fallback timestamps
  if (/^\d+$/.test(String(str))) {
    const ts = String(str).length === 10 ? Number(str) * 1000 : Number(str);
    const d = new Date(ts);
    if (!isNaN(d)) {
      return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }
  }
  return '--:--';
}

function buildActivityTexts(item, isVi) {
  const qty = (item.quantity != null && item.quantity !== '—') ? item.quantity : '';
  const unit = item.unit || '';
  const lot = item.batch_code || '';
  const name = item.raw_material || '';
  const status = item.status || '';

  switch (item.act) {
    case 'Import':
      return {
        action: isVi ? `Nhập ${qty}${unit ? ' ' + unit : ''} ${name}` : `Import ${qty}${unit ? ' ' + unit : ''} ${name}`,
        detail: lot ? (isVi ? `Lô ${lot}` : `Lot ${lot}`) : ''
      };
    case 'Export':
      return {
        action: isVi ? `Xuất ${qty}${unit ? ' ' + unit : ''} ${name}` : `Export ${qty}${unit ? ' ' + unit : ''} ${name}`,
        detail: lot ? (isVi ? `Lô ${lot}` : `Lot ${lot}`) : ''
      };
    case 'Use':
      return {
        action: isVi ? `Ghi nhận sử dụng ${name}` : `Recorded use of ${name}`,
        detail: `${lot ? (isVi ? `Lô ${lot}` : `Lot ${lot}`) + ' • ' : ''}${isVi ? 'Trừ' : 'Deduct'} ${qty}${unit ? ' ' + unit : ''}`
      };
    case 'Waste':
      return {
        action: isVi ? `Hủy ${qty}${unit ? ' ' + unit : ''} ${name}` : `Waste ${qty}${unit ? ' ' + unit : ''} ${name}`,
        detail: lot ? (isVi ? `Lô ${lot}` : `Lot ${lot}`) : ''
      };
    case 'Adjust':
      return {
        action: isVi ? `Điều chỉnh ${name}` : `Adjust ${name}`,
        detail: `${isVi ? 'Số lượng' : 'Quantity'}: ${qty}${unit ? ' ' + unit : ''}${lot ? ` • ${isVi ? 'Lô' : 'Lot'} ${lot}` : ''}`
      };
    case 'Make cakes':
      return {
        action: isVi ? `Làm bánh: ${name}` : `Make cakes: ${name}`,
        detail: `${qty ? `${qty} ` : ''}${isVi ? 'bánh' : 'cake'}${qty && qty > 1 ? 's' : ''} • ${status || (isVi ? 'Trạng thái' : 'Status')}`
      };
    default:
      return {
        action: item.act ? `${item.act} ${name}` : (isVi ? 'Hoạt động' : 'Activity'),
        detail: lot ? (isVi ? `Lô ${lot}` : `Lot ${lot}`) : ''
      };
  }
}
// Giữ LẠI đúng 1 hàm getLang() (bản đầu tiên ở trên) và XOÁ bản trùng bên dưới

function renderRecentActivitiesLoading() {
  const body = document.querySelector('#activityHistory .card-body');
  if (!body) return;
  const isVi = getLang() === 'vi';
  body.innerHTML = `
    <div class="row">
      <span class="primary">${isVi ? 'Đang tải…' : 'Loading…'}</span>
      <span class="secondary"></span>
    </div>
  `;
}

function renderRecentActivities(list) {
  const wrap = document.querySelector('#activityHistory .card-body');
  if (!wrap) return;

  const isVi = getLang() === 'vi';
  wrap.innerHTML = ''; // clear mẫu

  if (!Array.isArray(list) || list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'activity';
    empty.innerHTML = `
      <span class="time">--:--</span>
      <span class="action">${isVi ? 'Chưa có lịch sử gần đây' : 'No recent activity'}</span>
      <span class="detail"></span>`;
    wrap.appendChild(empty);
    return;
  }
  

list.slice(0, MAX_RECENT_ACTIVITIES).forEach(item => {
  const time = formatTimeHHMM(item.time);
  const { action, detail } = buildActivityTexts(item, isVi);

  const row = document.createElement('div');
  row.className = 'activity';
  row.innerHTML = `
    <span class="time">${time}</span>
    <span class="action">${action}</span>
    <span class="detail">${detail}</span>
  `;
  row.classList.add('activity-enter'); // <-- thêm dòng này
  wrap.appendChild(row);
});

}

async function loadRecentActivityHistory() {
    renderRecentActivitiesLoading();
  try {
    const params = new URLSearchParams({
      from: '', to: '', act: 'All', status: 'All', implementer: 'All'
    });
    const res = await fetch(`${API_BASE}/history?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderRecentActivities(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error('recent history load error:', e);
    renderRecentActivities([]);
  }
}

// === Today Menu preview on homepage ===
const MAX_MENU_PREVIEW = 3; // đổi tùy ý (2, 3, 5, ...)

const statusTextPreview = {
  'havent-done': { en: "Haven't done", vi: 'Chưa làm' },
  'doing':       { en: 'Doing',        vi: 'Đang làm' },
  'done':        { en: 'Done',         vi: 'Hoàn thành' }
};

function normalizeStatusPreview(status = '') {
  const s = String(status).toLowerCase();
  if (s.includes('done') && !s.includes("haven")) return 'done';
  if (s.includes('doing')) return 'doing';
  return 'havent-done';
}

function getLang() {
  try {
    if (window.GlobalLanguage?.getLanguage) {
      return window.GlobalLanguage.getLanguage();
    }
    if (typeof window.GlobalLanguage?.current === 'string') {
      return window.GlobalLanguage.current;
    }
  } catch(_) {}
  return 'en';
}

function renderTodayMenuLoading() {
  const listEl = document.querySelector('#todaysMenu .list');
  if (!listEl) return;
  const isVi = getLang() === 'vi';
  listEl.innerHTML = `
    <div class="row">
      <span class="primary">${isVi ? 'Đang tải thực đơn hôm nay…' : "Loading today's menu…"}</span>
      <span class="secondary"></span>
    </div>`;
}

function renderTodayMenuEmpty() {
  const listEl = document.querySelector('#todaysMenu .list');
  if (!listEl) return;
  const isVi = getLang() === 'vi';
  listEl.innerHTML = `
    <div class="row">
      <span class="primary">${isVi ? 'Chưa có thực đơn hôm nay' : 'No items for today'}</span>
      <span class="secondary">${isVi ? 'Vui lòng kiểm tra lại sau' : 'Please check back later'}</span>
    </div>`;
}

function renderTodayMenuPreview(items = []) {
  const card = document.getElementById('todaysMenu');
  const listEl = card?.querySelector('.list');
  if (!card || !listEl) return;

  const isVi = getLang() === 'vi';
  listEl.innerHTML = ''; // xoá list mẫu

  if (!items.length) {
    renderTodayMenuEmpty();
    return;
  }

  const unitPiece = isVi ? 'chiếc' : 'pieces';
  const limited = items.slice(0, MAX_MENU_PREVIEW);

limited.forEach(item => {
  const statusKey = normalizeStatusPreview(item.status);
  const statusLabel = statusTextPreview[statusKey][isVi ? 'vi' : 'en'];

  // 🟢🟡🔴 icon trạng thái
  let statusIcon = '';
  if (statusKey === 'done') statusIcon = '✅';
  else if (statusKey === 'doing') statusIcon = '🟡';
  else statusIcon = '⏳';

  const primary = `${item.product_name} - ${item.quantity} ${unitPiece}`;
  const secondary = `${statusIcon} ${isVi ? 'Trạng thái: ' : 'Status: '}${statusLabel}`;

  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <span class="primary">${primary}</span>
    <span class="secondary">${secondary}</span>
  `;
  listEl.appendChild(row);
});


  // Nếu còn nhiều mục hơn giới hạn, hiển thị gợi ý xem tất cả
  const remaining = items.length - limited.length;
  if (remaining > 0) {
    const hint = document.createElement('div');
    hint.className = 'row';
    hint.style.justifyContent = 'center';
    hint.innerHTML = `
      <span class="primary" style="text-align:center; font-weight:600;">
        ${isVi ? `Xem tất cả (+${remaining})` : `See all (+${remaining})`}
      </span>
      <span class="secondary"></span>
    `;
    // click cả card đã điều hướng rồi, nhưng thêm UX: click vào dòng này cũng đi
    hint.addEventListener('click', () => {
      const url = card.getAttribute('data-href') || '../today-menu/today-menu.html';
      location.href = url;
    });
    listEl.appendChild(hint);
  }
}

async function loadTodayMenuPreview() {
  try {
    renderTodayMenuLoading(); // tránh flash dữ liệu mẫu
    const res = await fetch(`${API_BASE}/today-menu/`);
    const json = await res.json();
    if (!json?.success || !Array.isArray(json.data)) {
      renderTodayMenuEmpty();
      return;
    }
    renderTodayMenuPreview(json.data);
  } catch (err) {
    console.error('loadTodayMenuPreview error:', err);
    renderTodayMenuEmpty();
  }
}
    
// Real-time Alerts Loader (limit to 2 items + toggle show more)
    const MAX_ALERT_ITEMS = 2;
    let redExpanded = false;
    let yellowExpanded = false;
    let __alertsCache = null;

    function buildDaysText(isVi, days_left) {
        if (isVi) {
            if (days_left >= 0) return `${days_left} ngày nữa hết hạn`;
            return `Hết hạn ${Math.abs(days_left)} ngày trước`;
        }
        return days_left >= 0 ? `${days_left} days left to expire` : `Expired ${Math.abs(days_left)} day(s) ago`;
    }

    function renderRed(data) {
        const urgentRed = document.querySelector('.urgent-red .urgent-content');
        if (!urgentRed) return;

        const isVi = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function' && window.GlobalLanguage.getLanguage() === 'vi');
        const titleRed = isVi ? 'Sắp hết hạn' : 'Expiring soon';
        const tagUrgent = isVi ? 'Khẩn' : 'Urgent';

        const list = Array.isArray(data.expiringSoon) ? data.expiringSoon : [];
        const limit = redExpanded ? list.length : Math.min(list.length, MAX_ALERT_ITEMS);
        const moreCount = Math.max(0, list.length - limit);

        let html = `<h3>${titleRed}</h3>`;
        if (list.length === 0) {
            html += isVi
                ? '<div class="urgent-item"><p class="name">Không có lô sắp hết hạn</p><p class="meta">Tất cả lô đều an toàn</p></div>'
                : '<div class="urgent-item"><p class="name">No urgent expirations</p><p class="meta">All batches are safe</p></div>';
            urgentRed.innerHTML = html;
            return;
        }

        for (let i = 0; i < limit; i++) {
            const item = list[i];
            const daysText = buildDaysText(isVi, item.days_left);
            html += `<div class="urgent-item">
                        <p class="name">${item.ingredient_name} - Batch ${item.lot_code}</p>
                        <p class="meta">${daysText} (${item.expiry_date})</p>
                     </div>`;
        }

        // Tag đỏ
        html += `<span class="tag">${tagUrgent}</span>`;

        // Nút xem thêm / thu gọn
        if (moreCount > 0) {
            const btnLabel = redExpanded
                ? (isVi ? 'Thu gọn' : 'Collapse')
                : (isVi ? `Xem tất cả (+${moreCount})` : `Show all (+${moreCount})`);
            html += `<button class="urgent-more" data-kind="red">${btnLabel}</button>`;
        } else if (redExpanded && list.length > MAX_ALERT_ITEMS) {
            // Khi đang mở rộng nhưng không còn moreCount (phòng trường hợp giới hạn thay đổi)
            const btnLabel = isVi ? 'Thu gọn' : 'Collapse';
            html += `<button class="urgent-more" data-kind="red">${btnLabel}</button>`;
        }

        urgentRed.innerHTML = html;

        // Gắn sự kiện toggle
        const btn = urgentRed.querySelector('button.urgent-more[data-kind="red"]');
        if (btn) {
            btn.addEventListener('click', () => {
                redExpanded = !redExpanded;
                renderRed(__alertsCache || { expiringSoon: [] });
            });
        }
    }

    function renderYellow(data) {
        const urgentYellow = document.querySelector('.urgent-yellow .urgent-content');
        if (!urgentYellow) return;

        const isVi = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function' && window.GlobalLanguage.getLanguage() === 'vi');
        const titleYellow = isVi ? 'Cảnh báo sớm' : 'Early warning';

        const list = Array.isArray(data.earlyWarnings) ? data.earlyWarnings : [];
        const limit = yellowExpanded ? list.length : Math.min(list.length, MAX_ALERT_ITEMS);
        const moreCount = Math.max(0, list.length - limit);

        let html = `<h3>${titleYellow}</h3>`;
        if (list.length === 0) {
            html += isVi
                ? '<div class="urgent-item"><p class="name">Không có cảnh báo sớm</p><p class="meta">Theo dõi kho thường xuyên</p></div>'
                : '<div class="urgent-item"><p class="name">No early warnings</p><p class="meta">Monitor stock regularly</p></div>';
            urgentYellow.innerHTML = html;
            return;
        }

        for (let i = 0; i < limit; i++) {
            const item = list[i];
            let metaText;

            if (item.warning_type === 'Low Stock') {
                metaText = isVi
                    ? `Tồn kho: ${item.current_stock || 'N/A'} ${item.stock_unit || 'đv'} (${item.warning_type})`
                    : `Stock: ${item.current_stock || 'N/A'} ${item.stock_unit || 'units'} (${item.warning_type})`;
            } else if (item.warning_type === 'Near Expiry') {
                const daysText = isVi
                    ? (item.days_left >= 0 ? `${item.days_left} ngày nữa hết hạn` : `Theo dõi sát`)
                    : (item.days_left >= 0 ? `${item.days_left} days left to expire` : `Monitor closely`);
                metaText = `${daysText} (${item.warning_type})`;
            } else {
                metaText = isVi ? (item.warning_type || 'Theo dõi tồn kho') : (item.warning_type || 'Monitor stock');
            }

            const lotDisplay = item.lot_code !== 'N/A'
                ? (isVi ? `Lô ${item.lot_code}` : `Batch ${item.lot_code}`)
                : (isVi ? 'Tồn kho chung' : 'General Stock');

            html += `<div class="urgent-item">
                        <p class="name">${item.ingredient_name} - ${lotDisplay}</p>
                        <p class="meta">${metaText}</p>
                     </div>`;
        }

        // Nút xem thêm / thu gọn
        if (moreCount > 0) {
            const btnLabel = yellowExpanded
                ? (isVi ? 'Thu gọn' : 'Collapse')
                : (isVi ? `Xem tất cả (+${moreCount})` : `Show all (+${moreCount})`);
            html += `<button class="urgent-more" data-kind="yellow">${btnLabel}</button>`;
        } else if (yellowExpanded && list.length > MAX_ALERT_ITEMS) {
            const btnLabel = isVi ? 'Thu gọn' : 'Collapse';
            html += `<button class="urgent-more" data-kind="yellow">${btnLabel}</button>`;
        }

        urgentYellow.innerHTML = html;

        // Gắn sự kiện toggle
        const btn = urgentYellow.querySelector('button.urgent-more[data-kind="yellow"]');
        if (btn) {
            btn.addEventListener('click', () => {
                yellowExpanded = !yellowExpanded;
                renderYellow(__alertsCache || { earlyWarnings: [] });
            });
        }
    }

    function renderBadge(data) {
        const badgeEl = document.getElementById('notificationBadge');
        if (!badgeEl) return;
        const total = data.totalAlerts || 0;
        badgeEl.textContent = total;
        badgeEl.style.display = total > 0 ? 'inline' : 'none';
    }
    // ===== Spoiled / Wasted Materials (homepage, real Waste_Reports) =====
const MAX_WASTE_ITEMS = 5;

function renderSpoiledLoading() {
  const list = document.querySelector('#spoiledMaterials .list');
  const total = document.getElementById('spTotal');
  if (!list) return;
  const isVi = getLang() === 'vi';
  list.innerHTML = `
    <div class="row">
      <span class="primary">${isVi ? 'Đang tải…' : 'Loading…'}</span>
      <span class="secondary"></span>
    </div>`;
  if (total) total.textContent = '—';
}

function renderSpoiledEmpty() {
  const list = document.querySelector('#spoiledMaterials .list');
  const total = document.getElementById('spTotal');
  if (!list) return;
  const isVi = getLang() === 'vi';
  list.innerHTML = `
    <div class="row">
      <span class="primary">${isVi ? 'Chưa ghi nhận hư hỏng/hủy' : 'No spoiled/waste recorded'}</span>
      <span class="secondary">${isVi ? 'Kho sạch sẽ 👌' : 'Inventory is clean 👌'}</span>
    </div>`;
  if (total) total.textContent = isVi ? 'Tổng: 0' : 'Total: 0';
}

function renderSpoiledList(items = []) {
  const list = document.querySelector('#spoiledMaterials .list');
  const total = document.getElementById('spTotal');
  if (!list) return;

  const isVi = getLang() === 'vi';
  list.innerHTML = '';

  if (!items.length) {
    renderSpoiledEmpty();
    return;
  }

  // Lấy tối đa N bản ghi mới nhất
  const limited = items.slice(0, MAX_WASTE_ITEMS);

  // Tính tổng theo đơn vị
  const totalsByUnit = {};
  limited.forEach(it => {
    const n = parseFloat(it.quantity) || 0;
    const unit = it.unit || '';
    totalsByUnit[unit] = (totalsByUnit[unit] || 0) + n;
  });

  limited.forEach(it => {
    const name = it.raw_material || '—';
    const qty  = (it.quantity ?? '—');
    const unit = it.unit || '';
    const lot  = it.batch_code ? (isVi ? `Lô ${it.batch_code}` : `Lot ${it.batch_code}`) : '';
    const when = formatTimeHHMM(it.time);
    const reason = it.reason ? ` • ${it.reason}` : '';

    // dùng class .sp-item.red bạn đã có
    const row = document.createElement('div');
    row.className = 'sp-item red';
    row.innerHTML = `
      <div class="sp-text">
        <div class="name">🗑️ ${name}</div>
        <div class="meta">${lot}${lot ? ' • ' : ''}${isVi ? 'Lúc' : 'At'} ${when}${reason}</div>
      </div>
      <div class="sp-flag">–${qty} ${unit}</div>
    `;
    list.appendChild(row);
  });

  // Render tổng
  const sumText = Object.entries(totalsByUnit)
    .map(([unit, n]) => `${isVi ? 'Tổng' : 'Total'}: ${n} ${unit || ''}`.trim())
    .join(' • ');

  if (total) total.textContent = sumText || (isVi ? 'Tổng: 0' : 'Total: 0');
}

async function loadSpoiledMaterialsReal() {
  // hiện "Loading…"
  renderSpoiledLoading();
  try {
    // ví dụ: 7 ngày gần đây, lấy tối đa 30 record, CHỈ Waste_Reports (include_transactions=0)
    const params = new URLSearchParams({ days: 7, limit: 30, include_transactions: 0 });
    const res = await fetch(`${API_BASE}/waste-reports/recent?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (!json?.success || !Array.isArray(json.data)) {
      renderSpoiledEmpty();
      return;
    }

    // sort phòng backend (đã sort rồi nhưng cho chắc)
    const sorted = json.data.sort((a,b) => {
      const ta = new Date(a.time).getTime() || 0;
      const tb = new Date(b.time).getTime() || 0;
      return tb - ta;
    });

    renderSpoiledList(sorted);
  } catch (err) {
    console.error('loadSpoiledMaterialsReal error:', err);
    renderSpoiledEmpty();
  }
}

// --- INITIAL: clear demo content & show loading placeholder ---
const urgentRedBox = document.querySelector('.urgent-red .urgent-content');
const urgentYellowBox = document.querySelector('.urgent-yellow .urgent-content');

(function showUrgentPlaceholders(){
  const isVi = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function' && window.GlobalLanguage.getLanguage() === 'vi');
  const titleRed = isVi ? 'Sắp hết hạn' : 'Expiring soon';
  const titleYellow = isVi ? 'Cảnh báo sớm' : 'Early warning';
  const loadingText = isVi ? 'Đang tải…' : 'Loading…';

  if (urgentRedBox) {
    urgentRedBox.innerHTML = `
      <h3>${titleRed}</h3>
      <div class="urgent-item"><p class="name">${loadingText}</p></div>
    `;
  }
  if (urgentYellowBox) {
    urgentYellowBox.innerHTML = `
      <h3>${titleYellow}</h3>
      <div class="urgent-item"><p class="name">${loadingText}</p></div>
    `;
  }
})();

    async function loadAlertsRealTime() {
        try {
            const response = await fetch(`${API_BASE}/alerts`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'API error');

            __alertsCache = result.data; // cache lại để toggle không cần gọi API
            // Render theo giới hạn
            renderRed(__alertsCache);
            renderYellow(__alertsCache);
            renderBadge(__alertsCache);

            console.log('Loaded alerts:', __alertsCache);  // Debug
        } catch (err) {
            console.error('Alert load error:', err);
        }
    }
    renderRecentActivitiesLoading();     // hiện chữ Loading ngay lập tức
    loadRecentActivityHistory();         // sau đó fetch & render
    setInterval(loadRecentActivityHistory, 180000);

    loadAlertsRealTime();
    setInterval(loadAlertsRealTime, 300000);  // 5 min
    loadTodayMenuPreview();
    setInterval(loadTodayMenuPreview, 300000); // 5 phút cập nhật 1 lần
    loadRecentActivityHistory();
    setInterval(loadRecentActivityHistory, 180000); // 3 phút cập nhật 1 lần
    loadSpoiledMaterialsReal();
    setInterval(loadSpoiledMaterialsReal, 300000);

  // === Focus Urgent section when coming from Owner Dashboard ===
  function focusUrgentIfNeeded() {
    if (window.location.hash !== '#urgent') return;

    const urgentSection = document.getElementById('urgent');
    if (!urgentSection) return;

    // cuộn tới phần Urgent
    urgentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // thêm class highlight trong vài giây cho dễ nhìn
    urgentSection.classList.add('urgent-highlight');
    setTimeout(() => {
      urgentSection.classList.remove('urgent-highlight');
    }, 2500);
  }

  focusUrgentIfNeeded();   // gọi khi load trang
})();
