// Owner Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function () {
  initializeDashboard();
});
const API_BASE_URL = window.API_BASE_URL || `${location.origin}`;
function getCurrentUserId() {
  try {
    const userInfo = JSON.parse(sessionStorage.getItem("user_info") || "{}");
    return userInfo.user_id || userInfo.id || null;
  } catch (e) {
    return null;
  }
}
function getAuthHeaders() {
  const token = sessionStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const userId = getCurrentUserId();
  if (userId) headers['X-User-Id'] = String(userId);
  return headers;
}

function initializeDashboard() {
  updateHeaderTime();
  setInterval(updateHeaderTime, 60000);

  updateUserInfo();
  initializeSidebarNavigation();
  initializeLogout();
  initializePanels();
  loadOwnerDashboardSummary();
  initializeUrgentViewButton();
  loadOwnerTodayMenu();
  loadOwnerAIRecommendations();
  loadOwnerForecast();
  initializeAiRemoveModal(); 
  // nếu quay lại từ Inventory với anchor #aiRecommendationPanel thì tự mở panel AI
  if (location.hash === '#aiRecommendationPanel') {
    const panel = document.getElementById('aiRecommendationPanel');
    if (panel) {
      panel.classList.remove('collapsed');
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

}

// Header time helpers
function formatHeaderDate(d) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return dayNames[d.getDay()] + ', ' + monthNames[d.getMonth()] + ' ' + d.getDate();
}

function formatHeaderTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return String(h).padStart(2, '0') + ':' + m + ' ' + ampm;
}

function updateHeaderTime() {
  const now = new Date();
  const elDate = document.getElementById('currentDate');
  const elTime = document.getElementById('currentTime');
  if (elDate) elDate.textContent = formatHeaderDate(now);
  if (elTime) elTime.textContent = formatHeaderTime(now);
}

// User info
function updateUserInfo() {
  try {
    const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
    const userNameEl = document.querySelector('.user-name');
    if (userInfo && userInfo.username && userNameEl) {
      userNameEl.textContent = userInfo.username;
    }
  } catch (error) {
    console.log('Could not get user info from sessionStorage');
  }
}

// Sidebar navigation (same behavior như trang recipe)
function initializeSidebarNavigation() {
  document.querySelectorAll('.sidebar .menu-item[data-href]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const href = this.getAttribute('data-href');
      if (href && href !== '#') {
        const abs = new URL(href, window.location).href;
        window.location.assign(abs);

      }
    });
  });
}
// Logout
function initializeLogout() {
  const btnLogout = document.getElementById('btnLogout');
  if (!btnLogout) return;

  btnLogout.addEventListener('click', function () {
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_info');
    sessionStorage.removeItem('user_token');
    sessionStorage.removeItem('user_role');
    sessionStorage.removeItem('user_role_id');
    localStorage.removeItem('bakery_credentials');
    window.location.href = '../../login/index.html';
  });
}

// Panel collapse / expand
function initializePanels() {
  document.querySelectorAll('[data-panel-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const panel = this.closest('.panel');
      if (!panel) return;
      panel.classList.toggle('collapsed');
    });
  });
}
async function loadOwnerDashboardSummary() {
  try {
    const token = sessionStorage.getItem('auth_token'); // nếu bạn đang dùng JWT
    const res = await fetch(`${API_BASE_URL}/api/owner/dashboard/summary`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error('Failed to load dashboard summary:', data);
      return;
    }

    const summary = data.data || {};

    // ====== Cập nhật Alert banner ======
    const expiredCountEl = document.getElementById('expiredCount');
    const exp48CountEl   = document.getElementById('exp48Count');
    const lowStockEl     = document.getElementById('lowStockCount');

    const expiredItems   = summary.expired_items   ?? 0;
    const expiring48h    = summary.expiring_48h    ?? 0;
    const lowStockItems  = summary.low_stock_items ?? 0;

    if (expiredCountEl) {
      expiredCountEl.textContent = `${expiredItems} item${expiredItems === 1 ? '' : 's'} expired`;
    }

    if (exp48CountEl) {
      exp48CountEl.textContent = `${expiring48h} item${expiring48h === 1 ? '' : 's'} expiring within 48 hours`;
    }

    if (lowStockEl) {
      lowStockEl.textContent = `${lowStockItems} item${lowStockItems === 1 ? '' : 's'} low in stock`;
    }

    // ====== Cập nhật 4 stat values ======
    const statRevenueEl        = document.getElementById('statRevenue');
    const statActiveProductsEl = document.getElementById('statActiveProducts');
    const statLowStockEl       = document.getElementById('statLowStock');
    const statExpiringEl       = document.getElementById('statExpiring');

    if (statRevenueEl)        statRevenueEl.textContent        = summary.restock_frequency   ?? 0;
    if (statActiveProductsEl) statActiveProductsEl.textContent = summary.active_products     ?? 0;
    if (statLowStockEl)       statLowStockEl.textContent       = lowStockItems;
    if (statExpiringEl)       statExpiringEl.textContent       = summary.expiring_soon_7d    ?? 0;

    // ====== Cập nhật trend / status (nếu backend có) ======
    const statRevenueTrendEl        = document.getElementById('statRevenueTrend');
    const statActiveProductsTrendEl = document.getElementById('statActiveProductsTrend');
    const statLowStockTrendEl       = document.getElementById('statLowStockTrend');
    const statExpiringStatusEl      = document.getElementById('statExpiringStatus');

    // ví dụ backend trả: restock_change_pct = 12.5
    if (statRevenueTrendEl && typeof summary.restock_change_pct === 'number') {
      const v = summary.restock_change_pct;
      statRevenueTrendEl.textContent = (v > 0 ? `+${v}` : `${v}`) + '%';
    }

    // ví dụ backend trả: active_products_change = 3
    if (statActiveProductsTrendEl && typeof summary.active_products_change === 'number') {
      const v = summary.active_products_change;
      statActiveProductsTrendEl.textContent = (v > 0 ? `+${v}` : `${v}`);
    }

    // ví dụ backend trả: low_stock_change = -2
    if (statLowStockTrendEl && typeof summary.low_stock_change === 'number') {
      const v = summary.low_stock_change;
      statLowStockTrendEl.textContent = (v > 0 ? `+${v}` : `${v}`);
    }

    // ví dụ backend trả: expiring_severity = 'Urgent' | 'Normal' | 'OK'
    if (statExpiringStatusEl) {
      if (summary.expiring_severity) {
        statExpiringStatusEl.textContent = summary.expiring_severity;
      } else {
        // fallback: nếu có item sắp hết hạn thì để 'Urgent', không thì 'OK'
        const expSoon = summary.expiring_soon_7d ?? 0;
        statExpiringStatusEl.textContent = expSoon > 0 ? 'Urgent' : 'OK';
      }
    }

  } catch (err) {
    console.error('Error loading owner dashboard summary:', err);
  }
}

// ===== Urgent details popup (Owner) =====
let ownerAlertsCache = null;
let pendingRemoveSuggestionId = null;

function buildDaysTextOwner(days_left) {
  if (days_left >= 0) return `${days_left} days left to expire`;
  return `Expired ${Math.abs(days_left)} day(s) ago`;
}

function renderOwnerRed(data) {
  const box = document.getElementById('urgentOwnerRed');
  if (!box) return;

  const list = Array.isArray(data.expiringSoon) ? data.expiringSoon : [];
  let html = '<h3>Expiring soon</h3>';

  if (!list.length) {
    html += `
      <div class="urgent-item">
        <p class="name">No urgent expirations</p>
        <p class="meta">All batches are safe</p>
      </div>
      <span class="tag">OK</span>`;
    box.innerHTML = html;
    return;
  }

  // 👉 Không giới hạn số lượng, loop hết
  list.forEach(item => {
    const daysText = buildDaysTextOwner(item.days_left);
    html += `
      <div class="urgent-item">
        <p class="name">${item.ingredient_name} - Batch ${item.lot_code}</p>
        <p class="meta">${daysText} (${item.expiry_date})</p>
      </div>`;
  });

  html += '<span class="tag">Urgent</span>';
  box.innerHTML = html;
}


function renderOwnerYellow(data) {
  const box = document.getElementById('urgentOwnerYellow');
  if (!box) return;

  const list = Array.isArray(data.earlyWarnings) ? data.earlyWarnings : [];
  let html = '<h3>Early warning</h3>';

  if (!list.length) {
    html += `
      <div class="urgent-item">
        <p class="name">No early warnings</p>
        <p class="meta">Monitor stock regularly</p>
      </div>`;
    box.innerHTML = html;
    return;
  }

  // 👉 Không giới hạn số lượng, loop hết
  list.forEach(item => {
    let metaText;

    if (item.warning_type === 'Low Stock') {
      metaText = `Stock: ${item.current_stock || 'N/A'} ${item.stock_unit || 'units'} (${item.warning_type})`;
    } else if (item.warning_type === 'Near Expiry') {
      metaText = `${buildDaysTextOwner(item.days_left)} (${item.warning_type})`;
    } else {
      metaText = item.warning_type || 'Monitor stock';
    }

    const lotDisplay =
      item.lot_code !== 'N/A'
        ? `Batch ${item.lot_code}`
        : 'General stock';

    html += `
      <div class="urgent-item">
        <p class="name">${item.ingredient_name} - ${lotDisplay}</p>
        <p class="meta">${metaText}</p>
      </div>`;
  });

  box.innerHTML = html;
}
function initializeAiRemoveModal() {
  const modal = document.getElementById('aiRemoveModal');
  const btnCancel = document.getElementById('btnCancelAiRemove');
  const btnClose = document.getElementById('btnCloseAiRemove');
  const btnConfirm = document.getElementById('btnConfirmAiRemove');

  [btnCancel, btnClose].forEach(btn => {
    if (btn) btn.addEventListener('click', closeAiRemoveModal);
  });

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAiRemoveModal();
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', confirmAiRemoveSuggestion);
  }
}

function openAiRemoveModal(item) {
  // Lấy id an toàn từ item trả về backend
  const suggestionId = Number(item.id);

  console.log('[AI] openAiRemoveModal called, suggestionId =', suggestionId, 'item =', item);

  if (!suggestionId || Number.isNaN(suggestionId)) {
    console.error('[AI] Invalid suggestion id:', item);
    showToast('Cannot remove suggestion: invalid ID.', 'error');
    return;
  }

  pendingRemoveSuggestionId = suggestionId;

  const modal = document.getElementById('aiRemoveModal');
  const msg = document.getElementById('aiRemoveMessage');

  if (msg) {
    msg.textContent = `Remove suggestion for "${item.ingredient_name}" from dashboard?`;
  }

  // Nếu KHÔNG tìm thấy modal trong DOM → dùng window.confirm để vẫn xóa được
  if (!modal) {
    const ok = window.confirm(`Remove suggestion for "${item.ingredient_name}" from dashboard?`);
    if (ok) {
      // gọi thẳng API
      ownerArchiveSuggestion(suggestionId)
        .then(() => {
          showToast('Suggestion removed from dashboard.', 'success');
          return loadOwnerAIRecommendations();
        })
        .catch(err => {
          console.error(err);
          showToast('Cannot remove suggestion: ' + err.message, 'error');
        });
    }
    return;
  }

  // Có modal thì show như cũ
  modal.classList.add('show');
}


function closeAiRemoveModal() {
  const modal = document.getElementById('aiRemoveModal');
  if (modal) modal.classList.remove('show');
  pendingRemoveSuggestionId = null;
}

async function confirmAiRemoveSuggestion() {
  console.log('[AI] confirmAiRemoveSuggestion, pendingRemoveSuggestionId =', pendingRemoveSuggestionId);

  if (!pendingRemoveSuggestionId) {
    closeAiRemoveModal();
    return;
  }

  try {
    await ownerArchiveSuggestion(pendingRemoveSuggestionId, { silent: true });
    showToast('Suggestion removed from dashboard.', 'success');
    await loadOwnerAIRecommendations();
  } catch (err) {
    console.error(err);
    showToast('Cannot remove suggestion: ' + err.message, 'error');
  } finally {
    closeAiRemoveModal();
  }
}

async function loadOwnerAlerts() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/alerts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'API error');

    ownerAlertsCache = result.data || {};

    renderOwnerRed(ownerAlertsCache);
    renderOwnerYellow(ownerAlertsCache);
  } catch (err) {
    console.error('Owner alerts load error:', err);
    const red = document.getElementById('urgentOwnerRed');
    const yellow = document.getElementById('urgentOwnerYellow');
    if (red) {
      red.innerHTML = `
        <h3>Expiring soon</h3>
        <div class="urgent-item">
          <p class="name">Cannot load alerts</p>
        </div>`;
    }
    if (yellow) {
      yellow.innerHTML = `
        <h3>Early warning</h3>
        <div class="urgent-item">
          <p class="name">Cannot load alerts</p>
        </div>`;
    }
  }
}


function initializeUrgentViewButton() {
  const btn = document.getElementById('btnViewUrgent');
  const modal = document.getElementById('urgentModal');
  const backdrop = document.getElementById('urgentModalBackdrop');
  const closeBtn = document.getElementById('urgentModalClose');

  if (!btn || !modal) return;

  const openModal = () => {
    modal.classList.add('open');
    document.body.classList.add('no-scroll');
    if (!ownerAlertsCache) {
      // lần đầu mới gọi API
      const redBox = document.getElementById('urgentOwnerRed');
      const yellowBox = document.getElementById('urgentOwnerYellow');
      if (redBox) redBox.innerHTML = '<h3>Expiring soon</h3><div class="urgent-item"><p class="name">Loading...</p></div>';
      if (yellowBox) yellowBox.innerHTML = '<h3>Early warning</h3><div class="urgent-item"><p class="name">Loading...</p></div>';
      loadOwnerAlerts();
    }
  };

  const closeModal = () => {
    modal.classList.remove('open');
    document.body.classList.remove('no-scroll');
  };

  btn.addEventListener('click', openModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closeModal();
    }
  });
}
// =========== Today's Menu Details cho OWNER ===========
async function loadOwnerTodayMenu() {
  const tbody = document.getElementById('todayMenuBody');
  if (!tbody) return;

  // trạng thái loading
  tbody.innerHTML = `
    <tr>
      <td colspan="4" style="text-align:center; padding:12px;">
        Loading today's menu...
      </td>
    </tr>
  `;

  try {
    const token = sessionStorage.getItem('auth_token');

    const res = await fetch(`${API_BASE_URL}/api/owner/today-menu`, {
      headers: getAuthHeaders()
    });

    let result = {};
    try {
      result = await res.json();
    } catch (e) {
      // backend trả về không phải JSON (ví dụ 500 HTML)
      console.error('Today menu response is not JSON', e);
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:12px; color:#b91c1c;">
            Cannot load today's menu (invalid response).
          </td>
        </tr>
      `;
      return;
    }

    if (!res.ok || !result.success) {
      console.error('Failed to load today menu:', result);
      const msg = result.message || result.error || 'Server error';
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:12px; color:#b91c1c;">
            Cannot load today's menu: ${msg}
          </td>
        </tr>
      `;
      return;
    }

    const list = Array.isArray(result.data) ? result.data : [];

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; padding:12px;">
            No menu planned for today.
          </td>
        </tr>
      `;
      return;
    }

    // map status -> CSS class giống giao diện demo
    const statusClassMap = {
      'Done': 'status-done',
      'Completed': 'status-done',
      'Doing': 'status-doing',
      'InProgress': 'status-doing',
      'In Progress': 'status-doing',
      'Pending': 'status-pending',
      "Haven't done": 'status-pending',
      'NotStarted': 'status-pending'
    };

    const rowsHtml = list.map(item => {
      const name = item.product_name || 'N/A';
      const qty  = item.quantity ?? '';
      const note = (item.note || '').trim();
      const statusRaw = (item.status || '').trim() || 'Pending';
      const cssClass = statusClassMap[statusRaw] || 'status-pending';

      // convert note thành <ul><li>...</li></ul> nếu có nhiều dòng
      let noteHtml = '';
      if (note.includes('\n') || note.includes('•')) {
        const parts = note
          .replace(/•/g, '\n')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);
        noteHtml = `
          <ul>
            ${parts.map(p => `<li>${p}</li>`).join('')}
          </ul>
        `;
      } else if (note) {
        noteHtml = `<ul><li>${note}</li></ul>`;
      } else {
        noteHtml = '<span style="color:#9ca3af;">No note</span>';
      }

      return `
        <tr>
          <td class="cake-name">${name}</td>
          <td class="cake-qty">${qty}</td>
          <td class="cake-note">
            ${noteHtml}
          </td>
          <td class="cake-status">
            <span class="status-pill ${cssClass}">${statusRaw}</span>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml;

  } catch (err) {
    console.error('Error loading today menu:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:12px; color:#b91c1c;">
          Error loading today's menu.
        </td>
      </tr>
    `;
  }
}
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============ AI-Powered Recommendations (Owner) ============
async function loadOwnerAIRecommendations() {
  const container = document.getElementById("aiRecoList");
  if (!container) return;

  container.innerHTML = `
    <div style="padding:12px; text-align:center;">Loading AI recommendations...</div>
  `;

  try {
    const token = sessionStorage.getItem("auth_token");
    const userId = getCurrentUserId();
    const res = await fetch(`${API_BASE_URL}/api/owner/ai/recommendations`, {
      headers: getAuthHeaders()
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || result.message || "API error");
    }

    const items = Array.isArray(result.data) ? result.data : [];
    if (!items.length) {
      container.innerHTML = `
        <div style="padding:12px; text-align:center;">No AI recommendations yet.</div>
      `;
      const chip = document.getElementById("aiNewCountChip");
      if (chip) chip.textContent = "0 New";
      return;
    }

    container.innerHTML = "";
    items.forEach(item => container.appendChild(createOwnerAiCard(item)));
    const pendingCount = items.filter(it => it.db_status === "Pending").length;
    const chip = document.getElementById("aiNewCountChip");
    if (chip) chip.textContent = `${pendingCount} New`;
  } catch (err) {
    console.error("loadOwnerAIRecommendations error:", err);
    container.innerHTML = `
      <div style="padding:12px; text-align:center; color:#b91c1c;">
        Cannot load AI recommendations.
      </div>
    `;
  }
}

function createOwnerAiCard(item) {
  const card = document.createElement("article");
  const urgencyTone = item.urgency === "High" ? "pink" : item.urgency === "Medium" ? "amber" : "indigo";
  card.className = `ai-card ai-card--${urgencyTone}`;

  // 🔥 Chuẩn hóa status 1 lần
  const rawStatus = (item.db_status || "").trim();
  const statusLower = rawStatus.toLowerCase();

  const top = document.createElement("div");
  top.className = "ai-card-top";

  const titleBlock = document.createElement("div");
  titleBlock.className = "ai-title-block";

  const nameRow = document.createElement("div");
  nameRow.className = "ai-name-row";
  nameRow.innerHTML = `<span class="ai-dot ai-dot--sparkle"></span><h3 class="ai-card-title">${item.ingredient_name}</h3>`;

  const tagsRow = document.createElement("div");
  tagsRow.className = "ai-tags-row";
  const urgencyLabel = item.urgency === "High" ? "High Priority" :
    item.urgency === "Medium" ? "Medium Priority" : "Normal";
  const urgencyClass = item.urgency === "High" ? "ai-pill--danger" :
    item.urgency === "Medium" ? "ai-pill--medium" : "ai-pill--normal";
  tagsRow.innerHTML = `
    <span class="ai-pill ${urgencyClass}">${urgencyLabel}</span>
    <span class="ai-pill ai-pill--gray">${item.db_status}</span>
  `;

  titleBlock.append(nameRow, tagsRow);

  const topActions = document.createElement("div");
  topActions.className = "ai-top-actions";

  if (statusLower === "pending") {
    const approveBtn = document.createElement("button");
    approveBtn.className = "ai-chip-btn ai-chip-btn--outline";
    approveBtn.textContent = "Approve suggestion";
    approveBtn.addEventListener("click", async () => {
      try {
        await ownerUpdateSuggestionStatus(item.id, "Approved");
      } catch (err) {
        console.error(err);
      }
    });

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "ai-chip-btn ai-chip-btn--ghost";
    rejectBtn.textContent = "Reject";
    rejectBtn.addEventListener("click", () => {
      ownerUpdateSuggestionStatus(item.id, "Rejected");
    });

    topActions.append(approveBtn, rejectBtn);
  } else {
    const statusSpan = document.createElement("span");
    statusSpan.className =
      statusLower === "approved"
        ? "ai-status ai-status--success"
        : "ai-status ai-status--pending";
    statusSpan.textContent = rawStatus;      // vẫn hiện đúng chữ gốc
    topActions.appendChild(statusSpan);
  }

  top.append(titleBlock, topActions);
  card.appendChild(top);



  const meta = document.createElement("p");
  meta.className = "ai-meta";
  meta.textContent = `Created: ${item.created_at} • By: ${item.admin_name}`;
  card.appendChild(meta);

  const metricsGrid = document.createElement("div");
  metricsGrid.className = "ai-metrics-grid";

  metricsGrid.innerHTML = `
    <div class="ai-metric-box">
      <div class="ai-metric-value">${item.current_stock ?? "N/A"} ${item.unit || ""}</div>
      <div class="ai-metric-label">Current Inventory</div>
    </div>
    <div class="ai-metric-box">
      <div class="ai-metric-value">${item.avg_daily_usage} ${item.unit || ""}/day</div>
      <div class="ai-metric-label">Average Daily Consumption</div>
    </div>
    <div class="ai-metric-box ${item.days_of_cover && item.days_of_cover <= 3 ? "ai-metric-box--warning" : ""}">
      <div class="ai-metric-value">${item.days_of_cover || "N/A"} days</div>
      <div class="ai-metric-label">Days of Cover</div>
    </div>
    <div class="ai-metric-box">
      <div class="ai-metric-value">${item.suggested_qty} ${item.unit || ""}</div>
      <div class="ai-metric-label">Suggested Input Quantity</div>
    </div>
  `;
  card.appendChild(metricsGrid);

  const progress = document.createElement("div");
  progress.className = "ai-progress";
  const track = document.createElement("div");
  track.className = "ai-progress-track";
  const bar = document.createElement("div");
  bar.className = `ai-progress-bar ai-progress-bar--${urgencyTone}`;
  const cover = item.days_of_cover || 0;
  const targetDays = 14;
  bar.style.width = `${Math.max(0, Math.min(100, (cover / targetDays) * 100))}%`;
  track.appendChild(bar);
  progress.appendChild(track);
  const note = document.createElement("div");
  note.className = "ai-progress-note";
  note.textContent = `${cover || 0} days / target 14 days`;
  progress.appendChild(note);
  card.appendChild(progress);

  const alertDiv = document.createElement("div");
  const alertClass =
    item.urgency === "High" ? "ai-alert ai-alert--danger" :
    item.urgency === "Medium" ? "ai-alert ai-alert--warning" :
    "ai-alert ai-alert--hint";
  alertDiv.className = alertClass;
  alertDiv.innerHTML = `
    <i class="fa-solid fa-triangle-exclamation"></i>
    <div class="ai-alert-text">
      <span>${item.urgency === "High" ? "Urgent:" : item.urgency === "Medium" ? "Warning:" : "Hint:"}</span>
      ${item.reason || "AI suggestion based on stock & forecast."}
    </div>
  `;
  card.appendChild(alertDiv);
  const actions = document.createElement("div");
  actions.className = "ai-actions";

  if (statusLower === "approved") {
    const openBtn = document.createElement("button");
    openBtn.className = "ai-btn ai-btn--primary";
    openBtn.textContent = "Create import in Inventory";
    openBtn.addEventListener("click", () => openInventoryFromSuggestion(item));
    actions.appendChild(openBtn);

    const removeBtn = document.createElement("button");
    removeBtn.className = "ai-btn ai-btn--ghost";
    removeBtn.textContent = "Remove from dashboard";
    removeBtn.addEventListener("click", () => openAiRemoveModal(item));
    actions.appendChild(removeBtn);

  } else if (statusLower === "rejected") {
    const removeBtn = document.createElement("button");
    removeBtn.className = "ai-btn ai-btn--ghost";
    removeBtn.textContent = "Remove from dashboard";
    removeBtn.addEventListener("click", () => openAiRemoveModal(item));
    actions.appendChild(removeBtn);

  } else {
    const smallNote = document.createElement("span");
    smallNote.style.fontSize = "12px";
    smallNote.style.color = "#6b7280";
    smallNote.textContent = "Approve to enable import in Inventory.";
    actions.appendChild(smallNote);
  }

  card.appendChild(actions);
  return card;
}



// Cho Owner: cập nhật trạng thái suggestion (Approved / Rejected)
async function ownerUpdateSuggestionStatus(id, status, options = {}) {
  const { silent = false } = options;

  try {
    const token = sessionStorage.getItem("auth_token");
    const userId = getCurrentUserId();

    const res = await fetch(
      `${API_BASE_URL}/api/owner/ai/recommendations/${id}/status`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status })
      }
    );

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || result.message || "API error");
    }

    // nếu không silent thì reload list
    if (!silent) {
      await loadOwnerAIRecommendations();
    }

    return result;
  } catch (err) {
    console.error("ownerUpdateSuggestionStatus error:", err);
    if (!silent) {
      alert("Cannot update status: " + err.message);
    }
    throw err;
  }
}


// ============ AI Demand Forecast (Owner) ============
async function loadOwnerForecast() {
  const container = document.getElementById("forecastList");
  if (!container) return;

  container.innerHTML = `
    <div style="padding:12px; text-align:center;">Loading forecast...</div>
  `;

  try {
    const token = sessionStorage.getItem("auth_token");
    const res = await fetch(`${API_BASE_URL}/api/owner/dashboard/forecast`, {
      headers: getAuthHeaders()
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || result.message || "API error");
    }
    const list = Array.isArray(result.data) ? result.data : [];
    if (!list.length) {
      container.innerHTML = `
        <div style="padding:12px; text-align:center;">No forecast data.</div>
      `;
      return;
    }

    container.innerHTML = "";
    list.forEach(item => container.appendChild(createForecastRow(item)));
  } catch (err) {
    console.error("loadOwnerForecast error:", err);
    container.innerHTML = `
      <div style="padding:12px; text-align:center; color:#b91c1c;">
        Cannot load forecast.
      </div>
    `;
  }
}

function createForecastRow(item) {
  const row = document.createElement("article");
  row.className = "forecast-row";

  const header = document.createElement("div");
  header.className = "forecast-row-header";

  const name = document.createElement("span");
  name.className = "forecast-name";
  name.textContent = item.ingredient_name;

  const badge = document.createElement("div");
  badge.className = "forecast-badge";

  const pct = document.createElement("span");
  pct.className = "forecast-badge-percent";
  pct.textContent = `${item.coverage_pct}%`;

  const delta = document.createElement("span");
  delta.className = "forecast-badge-delta";
  delta.textContent = `${item.delta_pct >= 0 ? "+ " : "- "}${Math.abs(item.delta_pct)}%`;

  badge.append(pct, delta);
  header.append(name, badge);

  const track = document.createElement("div");
  track.className = "forecast-bar-track";
  const fill = document.createElement("div");
  const className = item.delta_pct < 0 ? "forecast-bar-fill--red" : "forecast-bar-fill--green";
  fill.className = `forecast-bar-fill ${className}`;
  fill.style.width = `${Math.max(0, Math.min(100, item.coverage_pct))}%`;
  track.appendChild(fill);

  const meta = document.createElement("p");
  meta.className = "forecast-meta";
  const trendClass = item.delta_pct < 0 ? "trend-down" : "trend-up";
  const arrow = item.delta_pct < 0 ? "↓" : "↑";
  meta.innerHTML = `
    Current: ${item.current_stock} ${item.unit} 
    <span class="arrow">→</span> 
    <span class="highlight">Forecast: ${item.forecast_qty} ${item.unit}</span> 
    <span class="${trendClass}">${arrow}</span>
  `;

  row.append(header, track, meta);
  return row;
}
function openInventoryFromSuggestion(item) {
  try {
    const suggestionId = item.id ?? item.suggestion_id ?? item.recommendation_id;

    const draft = {
      suggestion_id: suggestionId,           // 🔥 dùng id đã chuẩn hóa
      ingredient_id: item.ingredient_id,
      ingredient_name: item.ingredient_name,
      quantity: item.suggested_qty,
      unit: item.unit,
      note: item.reason || ""
    };

    sessionStorage.setItem("ai_import_draft", JSON.stringify(draft));
    sessionStorage.setItem("ai_import_redirect_back", "owner_dashboard");

    window.location.href = "../Inventory/index.html?from_ai=1";
  } catch (err) {
    alert("Cannot open inventory: " + err.message);
  }
}


async function ownerArchiveSuggestion(id, options = {}) {
  const { silent = false } = options;

  try {
    const token = sessionStorage.getItem("auth_token");
    const userId = getCurrentUserId();

    const res = await fetch(`${API_BASE_URL}/api/owner/ai/recommendations/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || result.message || "API error");
    }

    if (!silent) {
      showToast('Suggestion removed from dashboard.', 'success');
      await loadOwnerAIRecommendations();
    }

    return result;
  } catch (err) {
    console.error("ownerArchiveSuggestion error:", err);
    if (!silent) {
      showToast('Cannot remove suggestion: ' + err.message, 'error');
    }
    throw err;
  }
}





