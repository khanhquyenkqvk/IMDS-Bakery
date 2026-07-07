// frontend/admin/smart-suggestion/assets/js/script.js

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


console.log("[SMART] API_BASE =", API_BASE);



const HISTORY_PAGE_SIZE = 4;
const WAREHOUSE_PAGE_SIZE = 3;
let historyPage = 1;
let warehousePage = 1;

// data state
let historyActivities = [];
let warehouseSuggestions = [];
let statsByTab = {
  history: [],
  warehouse: []
};
function getCurrentUserId() {
  try {
    const userInfo = JSON.parse(sessionStorage.getItem("user_info") || "{}");
    // tuỳ backend bạn lưu là user_id hay id
    return userInfo.user_id || userInfo.id || null;
  } catch (e) {
    return null;
  }
}
// ---------- Toast helper (in-page notification) ----------
function showToast(message, type = "success") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // cho animation
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  // auto hide
  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener(
      "transitionend",
      () => {
        toast.remove();
      },
      { once: true }
    );
  }, 3000);
}
function getActiveTabKey() {
  const activeBtn = document.querySelector(".tab-btn.active");
  if (!activeBtn) return "warehouse"; // default
  const target = activeBtn.getAttribute("data-target");
  return target === "historyTab" ? "history" : "warehouse";
}

function setActiveTab(tabKey) {
  const targetId = tabKey === "history" ? "historyTab" : "warehouseTab";

  document.querySelectorAll(".tab-btn").forEach(btn => {
    const isTarget = btn.getAttribute("data-target") === targetId;
    btn.classList.toggle("active", isTarget);
  });

  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === targetId);
  });

  // render đúng data cho tab
  renderStatsFor(tabKey);
  if (tabKey === "history") {
    renderHistory();
  } else {
    renderWarehouse();
  }
}

// ------------------ helpers ------------------
async function fetchJson(url, options = {}) {
  const token = sessionStorage.getItem("auth_token");
  const userId = getCurrentUserId();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(userId ? { "X-User-Id": String(userId) } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    console.error("Invalid JSON from", url, e);
    throw new Error("Invalid JSON");
  }
  if (!res.ok || data.success === false) {
    console.error("API error", url, data);
    throw new Error(data.error || data.message || "API error");
  }
  return data;
}


// ------------------ UI creators (giữ nguyên style) ------------------
function createStatCard(stat) {
  const card = document.createElement("div");
  card.className = `stat-card ${stat.color}`;

  const number = document.createElement("div");
  number.className = "stat-number";
  number.textContent = stat.value;

  const label = document.createElement("div");
  label.className = "stat-label";
  label.textContent = stat.label.en;
  label.setAttribute("data-en", stat.label.en);
  label.setAttribute("data-vi", stat.label.vi);

  const desc = document.createElement("div");
  desc.className = "stat-desc";
  desc.textContent = stat.desc.en;
  desc.setAttribute("data-en", stat.desc.en);
  desc.setAttribute("data-vi", stat.desc.vi);

  card.append(number, label, desc);
  return card;
}

function createActivityCard(item) {
  const card = document.createElement("div");
  card.className = `activity-card ${item.status.key === "approved" ? "approved" : "success"}`;

  const head = document.createElement("div");
  head.className = "card-head";

  const title = document.createElement("div");
  title.className = "activity-title";
  title.textContent = item.title.en;
  title.setAttribute("data-en", item.title.en);
  title.setAttribute("data-vi", item.title.vi);

  const status = document.createElement("span");
  status.className = `status-chip ${item.status.key}`;
  status.textContent = item.status.en;
  status.setAttribute("data-en", item.status.en);
  status.setAttribute("data-vi", item.status.vi);

  head.append(title, status);

  const body = document.createElement("div");
  body.className = "activity-body";
  body.textContent = item.summary.en;
  body.setAttribute("data-en", item.summary.en);
  body.setAttribute("data-vi", item.summary.vi);

  const note = document.createElement("div");
  note.className = "activity-note";
  note.textContent = item.note.en || "";
  note.setAttribute("data-en", item.note.en || "");
  note.setAttribute("data-vi", item.note.vi || "");

  const meta = document.createElement("div");
  meta.className = "activity-meta";
  meta.innerHTML = `<i class="fa-regular fa-clock"></i><span>${item.meta.time}</span><i class="fa-regular fa-user"></i><span>${item.meta.author}</span>`;

  const footer = document.createElement("div");
  footer.className = "card-head";
  const spacer = document.createElement("div");
  spacer.style.flex = "1";
  const link = document.createElement("a");
  link.href = item.detail || "#";
  link.className = "see-more";
  link.textContent = "See details ->";
  link.setAttribute("data-en", "See details ->");
  link.setAttribute("data-vi", "Xem chi tiết ->");
  footer.append(spacer, link);

  card.append(head, body, note, meta, footer);
  return card;
}

function createPill(badge) {
  const pill = document.createElement("span");
  pill.className = `pill ${badge.tone || "blue"}`;
  pill.textContent = badge.text;
  return pill;
}

function createMetricBox(metric) {
  const box = document.createElement("div");
  box.className = `metric-box ${metric.tone || ""}`.trim();

  const value = document.createElement("div");
  value.className = "value";
  value.textContent = metric.value;

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = metric.label;

  box.append(value, label);
  return box;
}

function createMessageRow(msg) {
  const row = document.createElement("div");
  row.className = `message ${msg.type}`;
  const iconClass = {
    critical: "fa-solid fa-triangle-exclamation",
    warning: "fa-solid fa-circle-exclamation",
    success: "fa-solid fa-circle-check",
    hint: "fa-solid fa-circle-info",
    pending: "fa-solid fa-hourglass-half"
  }[msg.type] || "fa-solid fa-circle-info";

  const iconEl = document.createElement("i");
  iconEl.className = iconClass;
  const text = document.createElement("div");
  text.textContent = msg.text;
  row.append(iconEl, text);
  return row;
}

function createWarehouseCard(item) {
  const card = document.createElement("div");
  const tone = item.urgency === "High" ? "red" : item.urgency === "Medium" ? "yellow" : "blue";
  card.className = `suggestion-card tone-${tone}`;

  const head = document.createElement("div");
  head.className = "card-head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "suggestion-title";
  const title = document.createElement("span");
  title.textContent = item.ingredient_name;
  titleWrap.append(title);

  const badgeWrap = document.createElement("div");
  badgeWrap.style.display = "flex";
  badgeWrap.style.alignItems = "center";
  badgeWrap.style.flexWrap = "wrap";
  badgeWrap.style.gap = "6px";

  const badges = [];
  if (item.urgency === "High") badges.push({ text: "High priority", tone: "red" });
  else if (item.urgency === "Medium") badges.push({ text: "Medium priority", tone: "yellow" });
  else badges.push({ text: "Normal", tone: "blue" });

  if (item.alerts && item.alerts.has_near_expiry) {
    badges.push({ text: "Near expiry", tone: "yellow" });
  }
  if (item.alerts && item.alerts.has_expired) {
    badges.push({ text: "Expired batch", tone: "red" });
  }

  badges.forEach(b => badgeWrap.appendChild(createPill(b)));

  const actionBtn = document.createElement("button");
  actionBtn.className = "action-btn";
  actionBtn.textContent = "Send to Owner for approval";
  actionBtn.addEventListener("click", () => sendSuggestionToOwner(item));

  head.append(titleWrap, badgeWrap, actionBtn);

  const metaRow = document.createElement("div");
  metaRow.className = "meta-row";
  const lastImported = item.last_import_date || "N/A";
  metaRow.innerHTML = `<i class="fa-regular fa-calendar"></i><span>Last imported: ${lastImported}</span>`;

  const metricsGrid = document.createElement("div");
  metricsGrid.className = "metrics-grid";

  const metrics = [
    { label: "Current inventory", value: `${item.current_stock} ${item.unit}` },
    { label: "Average daily consumption", value: `${item.avg_daily_usage} ${item.unit}/day` },
    { label: "Days of cover", value: item.days_of_cover != null ? `${item.days_of_cover} days` : "N/A", tone: (item.days_of_cover && item.days_of_cover <= 3) ? "red" : (item.days_of_cover && item.days_of_cover <= 7) ? "yellow" : "" },
    { label: "Import proposal", value: `${item.suggested_qty} ${item.unit}`, tone: "blue" }
  ];
  metrics.forEach(m => metricsGrid.appendChild(createMetricBox(m)));

  const progress = document.createElement("div");
  progress.className = "progress";
  const track = document.createElement("div");
  track.className = "progress-track";
  const fill = document.createElement("div");
  fill.className = "progress-fill";
  const progressPercent = item.days_of_cover ? Math.max(0, Math.min(100, (item.days_of_cover / (item.target_days || 14)) * 100)) : 0;
  fill.style.width = `${progressPercent}%`;
  track.appendChild(fill);
  progress.appendChild(track);

  const messagesWrap = document.createElement("div");
  const msgs = [];
  if (item.days_of_cover && item.days_of_cover <= 3) {
    msgs.push({ type: "critical", text: `Urgent: Stock will run out in about ${item.days_of_cover} days.` });
  } else if (item.days_of_cover && item.days_of_cover <= 7) {
    msgs.push({ type: "warning", text: `Warning: Stock is expected to be low within ${item.days_of_cover} days.` });
  } else {
    msgs.push({ type: "hint", text: "Stock is relatively safe, monitor regularly." });
  }
  msgs.forEach(msg => messagesWrap.appendChild(createMessageRow(msg)));

  card.append(head, metaRow, metricsGrid, progress, messagesWrap);
  return card;
}

// ------------------ render functions ------------------
function renderStatsFor(tabKey) {
  const grid = document.getElementById("statsGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const dataset = statsByTab[tabKey] || [];
  dataset.forEach(stat => grid.appendChild(createStatCard(stat)));
}

function renderHistory() {
  const historyEl = document.getElementById("historyList");
  if (!historyEl) return;
  historyEl.innerHTML = "";
  const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
  const pageItems = historyActivities.slice(start, start + HISTORY_PAGE_SIZE);
  pageItems.forEach(item => historyEl.appendChild(createActivityCard(item)));
  updatePagination("history");
}
function urgencyScore(urgency) {
  const u = (urgency || "").toLowerCase();
  if (u === "high") return 0;      // ưu tiên cao nhất
  if (u === "medium") return 1;
  if (u === "low") return 2;
  return 3;                        // Unknown hoặc khác -> thấp nhất
}

function renderWarehouse() {
  const warehouseEl = document.getElementById("warehouseList");
  if (!warehouseEl) return;
  warehouseEl.innerHTML = "";
  const start = (warehousePage - 1) * WAREHOUSE_PAGE_SIZE;
  const pageItems = warehouseSuggestions.slice(start, start + WAREHOUSE_PAGE_SIZE);
  pageItems.forEach(item => warehouseEl.appendChild(createWarehouseCard(item)));
  updatePagination("warehouse");
}

// ------------------ load from API ------------------
async function loadWarehouseData() {
  try {
    const data = await fetchJson(`${API_BASE}/api/admin/smart-suggestions/warehouse?page=1&page_size=50`);
    const payload = data.data || {};
    warehouseSuggestions = Array.isArray(payload.items) ? payload.items : [];

    // 🔥 SẮP XẾP THEO MỨC ĐỘ ƯU TIÊN
    warehouseSuggestions.sort((a, b) => {
      const sa = urgencyScore(a.urgency);
      const sb = urgencyScore(b.urgency);
      if (sa !== sb) return sa - sb;   // High -> Medium -> Low -> Unknown

      // cùng urgency thì sort days_of_cover (ít ngày hơn -> ưu tiên hơn)
      const da = a.days_of_cover != null ? Number(a.days_of_cover) : Infinity;
      const db = b.days_of_cover != null ? Number(b.days_of_cover) : Infinity;
      return da - db;
    });

    const sum = payload.summary || {};
    statsByTab.warehouse = [
      { value: sum.total_suggestions || 0, label: { en: "Total suggestions", vi: "Tổng gợi ý" }, desc: { en: "From smart warehouse", vi: "Từ kho thông minh" }, color: "blue" },
      { value: sum.urgent || 0, label: { en: "Urgent", vi: "Khẩn cấp" }, desc: { en: "Need to cover immediately", vi: "Cần xử lý ngay" }, color: "red" },
      { value: sum.almost_gone || 0, label: { en: "Almost gone", vi: "Sắp hết" }, desc: { en: "Expected during the week", vi: "Hết trong tuần" }, color: "purple" },
      { value: sum.owner_approved || 0, label: { en: "Owner approved", vi: "Chủ duyệt" }, desc: { en: "Ready to import", vi: "Sẵn sàng nhập" }, color: "green" }
    ];

    warehousePage = 1;

    const activeKey = getActiveTabKey();
    if (activeKey === "warehouse") {
      renderStatsFor("warehouse");
      renderWarehouse();
    }

  } catch (err) {
    console.error("Load warehouse suggestions error:", err);
  }
}

function safeJsonParseMaybe(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!s) return null;
  if (!(s.startsWith("{") || s.startsWith("["))) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function timeAgoFromISO(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

function summarizeIssues(reasonsOrMaterials) {
  // reasons: [{issue:"Expired"}, ...] OR materials_check: [{status:"NearExpiry"}, ...]
  const list = Array.isArray(reasonsOrMaterials) ? reasonsOrMaterials : [];
  const map = {};
  list.forEach(x => {
    const key = (x.issue || x.status || "Unknown").toString();
    map[key] = (map[key] || 0) + 1;
  });
  const parts = Object.entries(map)
    .sort((a,b) => b[1]-a[1])
    .map(([k,v]) => `${k}(${v})`);
  return parts.length ? parts.join(", ") : "No issues";
}

function summarizeSubstitutions(subs) {
  const arr = Array.isArray(subs) ? subs : [];
  if (!arr.length) return "No substitutions";
  const top = arr.slice(0, 3).map(s => {
    const from = s?.from?.name || s?.from?.ingredient_name || "Unknown";
    const to = s?.to?.name || s?.to?.ingredient_name || "Unknown";
    return `${from} → ${to}`;
  });
  const more = arr.length > 3 ? ` (+${arr.length - 3} more)` : "";
  return top.join(" | ") + more;
}

function normalizeHistoryItem(raw) {
  // raw có thể đã đúng format hoặc đang là “chuỗi JSON”
  const lang = (window.GlobalLanguage && GlobalLanguage.getLanguage && GlobalLanguage.getLanguage()) || "en";

  // 1) nếu backend đã trả đúng shape {title:{en,vi}, summary:{en,vi}...} thì giữ nguyên
  if (raw && raw.title && typeof raw.title === "object" && raw.summary && typeof raw.summary === "object") {
    return raw;
  }

  // 2) cố parse các field dạng chuỗi JSON
  const parsed =
    safeJsonParseMaybe(raw?.summary) ||
    safeJsonParseMaybe(raw?.payload) ||
    safeJsonParseMaybe(raw?.details) ||
    safeJsonParseMaybe(raw?.raw) ||
    safeJsonParseMaybe(raw?.message);

  // fallback nếu không parse được
  if (!parsed) {
    const txt = typeof raw === "string" ? raw : (raw?.summary || raw?.message || JSON.stringify(raw || {}));
    const short = txt.length > 220 ? txt.slice(0, 220) + "..." : txt;
    return {
      title: { en: "AI Activity", vi: "Hoạt động AI" },
      status: { key: (raw?.status_key || "success"), en: "Success", vi: "Thành công" },
      summary: { en: short, vi: short },
      note: { en: "", vi: "" },
      meta: { time: timeAgoFromISO(raw?.created_at), author: raw?.created_by || "System" },
      detail: raw?.detail_url || "#"
    };
  }

  // 3) build nội dung đẹp
  const recipeName = parsed.target_recipe_name || parsed.recipe_name || parsed.target_recipe || "Unknown recipe";
  const reasons = parsed.reasons || parsed.materials_check || parsed.problems || [];
  const issuesText = summarizeIssues(reasons);
  const subs = parsed.substitutions || parsed.subs || [];
  const subsText = summarizeSubstitutions(subs);

  const approved =
    (raw?.status || raw?.status_key || "").toLowerCase().includes("approved") ||
    (raw?.status || "").toLowerCase().includes("approved");

  const statusObj = approved
    ? { key: "approved", en: "Approved", vi: "Đã duyệt" }
    : { key: "success", en: "Success", vi: "Thành công" };

  const summaryEn = `Recipe: ${recipeName}. Issues: ${issuesText}.`;
  const summaryVi = `Bánh: ${recipeName}. Vấn đề: ${issuesText}.`;

  const noteEn = `Substitutions: ${subsText}`;
  const noteVi = `Thay thế: ${subsText}`;

  return {
    title: { en: "AI recipe substitute suggestion", vi: "Gợi ý thay thế công thức AI" },
    status: statusObj,
    summary: { en: summaryEn, vi: summaryVi },
    note: { en: noteEn, vi: noteVi },
    meta: {
      time: timeAgoFromISO(raw?.created_at || parsed.created_at),
      author: raw?.created_by || raw?.author || "AI"
    },
    detail: raw?.detail_url || "#"
  };
}

async function loadHistoryDataFromAPI() {
  try {
    const data = await fetchJson(`${API_BASE}/api/admin/smart-suggestions/history?page=1&page_size=20`);
    const payload = data.data || {};
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    historyActivities = rawItems.map(normalizeHistoryItem);

    const sum = payload.summary || {};
    statsByTab.history = [
      { value: sum.total_activity || historyActivities.length, label: { en: "Total activity", vi: "Tổng hoạt động" }, desc: { en: "All operations", vi: "Tất cả thao tác" }, color: "blue" },
      { value: sum.approved || 0, label: { en: "Approved", vi: "Đã duyệt" }, desc: { en: "Approved suggestions", vi: "Gợi ý đã duyệt" }, color: "green" },
      { value: sum.success || 0, label: { en: "Success", vi: "Thành công" }, desc: { en: "Operation completed", vi: "Hoàn tất triển khai" }, color: "purple" },
      { value: sum.alternative_formula || 0, label: { en: "Alternative formula", vi: "Công thức thay thế" }, desc: { en: "AI created", vi: "AI tạo mới" }, color: "orange" }
    ];

    historyPage = 1;

    const activeKey = getActiveTabKey();
    if (activeKey === "history") {
      renderStatsFor("history");
      renderHistory();
    }

  } catch (err) {
    console.error("Load history error:", err);
  }
}

// ------------------ actions ------------------
async function sendSuggestionToOwner(item) {
  try {
    const payload = {
      ingredient_id: item.ingredient_id,
      suggested_qty: item.suggested_qty,
      unit: item.unit,
      urgency: item.urgency,
      avg_daily_usage: item.avg_daily_usage,
      days_of_cover: item.days_of_cover,
      reason: `Stock will run out in ~${item.days_of_cover || "N/A"} days.`
    };
    await fetchJson(`${API_BASE}/api/admin/smart-suggestions/send`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast("Suggestion sent to owner.", "success");
    // reload history for better UX
    loadHistoryDataFromAPI();
  } catch (err) {
    console.error("Send suggestion error:", err);
    showToast("Cannot send suggestion: " + err.message, "error");
  }
}

// ------------------ tabs + pagination + header + auth (giữ nguyên gần như cũ) ------------------
function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", function () {
      const target = this.getAttribute("data-target");
      const tabKey = target === "warehouseTab" ? "warehouse" : "history";

      // lưu tab để reload không bị nhảy
      sessionStorage.setItem("admin_smart_tab", tabKey);

      // dùng helper đã viết
      setActiveTab(tabKey);
    });
  });
}


function updatePagination(type) {
  if (type === "history") {
    const total = Math.max(1, Math.ceil(historyActivities.length / HISTORY_PAGE_SIZE));
    const info = document.getElementById("historyPageInfo");
    const prev = document.getElementById("historyPrev");
    const next = document.getElementById("historyNext");
    if (info) info.textContent = `${historyPage} / ${total}`;
    if (prev) prev.disabled = historyPage <= 1;
    if (next) next.disabled = historyPage >= total;
  } else {
    const total = Math.max(1, Math.ceil(warehouseSuggestions.length / WAREHOUSE_PAGE_SIZE));
    const info = document.getElementById("warehousePageInfo");
    const prev = document.getElementById("warehousePrev");
    const next = document.getElementById("warehouseNext");
    if (info) info.textContent = `${warehousePage} / ${total}`;
    if (prev) prev.disabled = warehousePage <= 1;
    if (next) next.disabled = warehousePage >= total;
  }
}

function setupPagination() {
  const hPrev = document.getElementById("historyPrev");
  const hNext = document.getElementById("historyNext");
  if (hPrev) hPrev.addEventListener("click", () => {
    if (historyPage > 1) {
      historyPage--;
      renderHistory();
    }
  });
  if (hNext) hNext.addEventListener("click", () => {
    const total = Math.ceil(historyActivities.length / HISTORY_PAGE_SIZE);
    if (historyPage < total) {
      historyPage++;
      renderHistory();
    }
  });

  const wPrev = document.getElementById("warehousePrev");
  const wNext = document.getElementById("warehouseNext");
  if (wPrev) wPrev.addEventListener("click", () => {
    if (warehousePage > 1) {
      warehousePage--;
      renderWarehouse();
    }
  });
  if (wNext) wNext.addEventListener("click", () => {
    const total = Math.ceil(warehouseSuggestions.length / WAREHOUSE_PAGE_SIZE);
    if (warehousePage < total) {
      warehousePage++;
      renderWarehouse();
    }
  });
}

// header, user info, sidebar, logout như cũ (copy từ file hiện tại của bạn)

function formatHeaderDate(d) {
  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
}
function formatHeaderTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
}
function updateHeaderTime() {
  const now = new Date();
  const elDate = document.getElementById("currentDate");
  const elTime = document.getElementById("currentTime");
  if (elDate) elDate.textContent = formatHeaderDate(now);
  if (elTime) elTime.textContent = formatHeaderTime(now);
}

function updateUserInfo() {
  try {
    const userInfo = JSON.parse(sessionStorage.getItem("user_info") || "{}");
    const userNameEl = document.querySelector(".user-name");
    if (userInfo && userInfo.username && userNameEl) {
      userNameEl.textContent = userInfo.username;
    }
  } catch (_) {}
}

function setupSidebarNav() {
  document.querySelectorAll(".sidebar .menu-item[data-href]").forEach(btn => {
    btn.addEventListener("click", function () {
      const href = this.getAttribute("data-href");
      if (href && href !== "#") location.href = href;
    });
  });
}
function setupLogout() {
  const btnLogout = document.getElementById("btnLogout");
  if (!btnLogout) return;
  btnLogout.addEventListener("click", function () {
    sessionStorage.removeItem("auth_token");
    sessionStorage.removeItem("user_info");
    sessionStorage.removeItem("user_token");
    sessionStorage.removeItem("user_role");
    sessionStorage.removeItem("user_role_id");
    localStorage.removeItem("bakery_credentials");
    window.location.href = "../../login/index.html";
  });
}

// init
document.addEventListener("DOMContentLoaded", function () {
  setupSidebarNav();
  setupLogout();
  setupTabs();
  const savedTab = sessionStorage.getItem("admin_smart_tab");
  const initialTabKey = savedTab === "history" ? "history" : "warehouse";
  setActiveTab(initialTabKey);
  setupPagination();
  updateUserInfo();
  updateHeaderTime();
  setInterval(updateHeaderTime, 60000);

  // load data from backend
  loadWarehouseData();
  loadHistoryDataFromAPI();

  if (window.GlobalLanguage && GlobalLanguage.initialize) {
    GlobalLanguage.initialize();
  }
});
