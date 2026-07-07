// ================================
// HISTORY PAGE (Fixed API_BASE + auth + normalize response)
// ================================
const API_BASE = window.API_BASE || `${location.origin}/api`;

function getAuthHeaders() {
  const h = { "Content-Type": "application/json" };
  const token = sessionStorage.getItem("auth_token");
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: getAuthHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
  return json;
}

// 1) Clock (giữ logic của bạn, nhưng đừng tạo API_BASE trong đây)
function updateClock() {
  const fixedTime = new Date();
  fixedTime.setHours(8, 30, 0);
  const time = fixedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const clockEl = document.getElementById("clock");
  if (clockEl) clockEl.textContent = time;
}
updateClock();

// State for pagination
let historyData = [];
let currentPage = 1;
const PAGE_SIZE = 10;

document.addEventListener("DOMContentLoaded", () => {
  loadImplementersOptions().finally(() => loadHistoryData());
});

// ================================
// Load data
// ================================
async function loadHistoryData() {
  const tableBody = document.getElementById("history-table-body");
  const isVi = window.GlobalLanguage?.getLanguage?.() === "vi";
  if (tableBody) {
    tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px;">${isVi ? "Đang tải..." : "Loading..."}</td></tr>`;
  }

  try {
    const from = document.getElementById("from-date")?.value || "";
    const to = document.getElementById("to-date")?.value || "";
    const act = document.getElementById("filter-act")?.value || "All";
    const status = document.getElementById("filter-status")?.value || "All";
    const implementer = document.getElementById("filter-implementer")?.value || "All";

    const params = new URLSearchParams({ from, to, act, status, implementer });

    const json = await fetchJson(`${API_BASE}/history?${params.toString()}`);

    // ✅ Normalize: accept array OR {data:[]}
    const list = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
    historyData = list;

    renderPage(1);
  } catch (err) {
    console.error("Lỗi khi tải dữ liệu:", err);
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="9" style="color:red; text-align:center;">${isVi ? "Không thể tải dữ liệu" : "Failed to load data"}: ${err.message}</td></tr>`;
    }
  }
}

async function loadImplementersOptions() {
  const select = document.getElementById("filter-implementer");
  if (!select) return;

  while (select.options.length > 1) select.remove(1);

  try {
    const json = await fetchJson(`${API_BASE}/history/implementers`);
    const list = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);

    list.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });

    select.value = "All";
  } catch (err) {
    console.error("Failed to load implementers:", err);
    select.value = "All";
  }
}

// ================================
// Render helpers (giữ logic của bạn)
// ================================
function createHistoryRow(item) {
  const actHtml = getActHtml(item.act);
  const statusHtml = getStatusHtml(item.status);
  const productHtml = getProductHtml(item.act, item.raw_material);
  const noteHtml = getNoteHtml(item.note);

  return `
    <tr>
      <td>${formatTime(item.time)}</td>
      <td>${actHtml}</td>
      <td>${productHtml}</td>
      <td>${item.batch_code || ""}</td>
      <td class="qty-cell">${formatQuantity(item.act, item.quantity)}</td>
      <td>${item.unit || ""}</td>
      <td>${statusHtml}</td>
      <td>${item.implementer || ""}</td>
      ${noteHtml}
    </tr>
  `;
}

function formatTime(datetimeStr) {
  if (!datetimeStr) return "";
  const str = String(datetimeStr).trim();
  const m1 = str.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (m1) return `${m1[1]} ${m1[2]}`;
  const m2 = str.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (m2) return `${m2[1]} ${m2[2]}:${m2[3]}`;
  if (/^\d+$/.test(str)) {
    const ts = str.length === 10 ? Number(str) * 1000 : Number(str);
    const d = new Date(ts);
    if (!isNaN(d)) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    }
  }
  return str;
}

function formatQuantity(act, qty) {
  if (qty === null || qty === undefined || qty === "") return "";
  const n = parseFloat(qty);
  if (isNaN(n)) return qty;

  let sign = "";
  if (["Import"].includes(act)) sign = "+";
  else if (["Export", "Use", "Waste"].includes(act)) sign = "-";
  else if (act === "Adjust") sign = n >= 0 ? "+" : "-";

  const cls = sign === "+" ? "qty-plus" : sign === "-" ? "qty-minus" : "";
  return `<span class="${cls}">${sign}${Math.abs(n)}</span>`;
}

function getActHtml(act) {
  const actMap = {
    Import: { color: "#196df4ff", en: "Import", vi: "Nhập kho" },
    Export: { color: "#e13160ff", en: "Export", vi: "Xuất kho" },
    Use: { color: "#f59e0b", en: "Use", vi: "Sử dụng" },
    Waste: { color: "#431e1eff", en: "Waste", vi: "Hủy" },
    Adjust: { color: "#0efe22ff", en: "Adjust", vi: "Điều chỉnh" },
    "Make cakes": { color: "#10b981", en: "Make cakes", vi: "Làm bánh" },
    Default: { color: "#6b7280", en: act, vi: act },
  };

  const item = actMap[act] || actMap.Default;
  const isVi = window.GlobalLanguage?.getLanguage?.() === "vi";
  const text = isVi ? item.vi : item.en;

  return `
    <div class="act-cell" data-act="${act}">
      <span class="act-dot" style="background:${item.color}"></span>
      <span data-en="${item.en}" data-vi="${item.vi}">${text}</span>
    </div>
  `;
}

function getStatusHtml(status) {
  const statusMap = {
    Valid:      { class: "good",          color: "#dcfce7", text: { en: "In stock",        vi: "Còn hàng" },      icon: "fa-check" },
    NearExpiry: { class: "nearly-expired",color: "#fef3c7", text: { en: "Nearly expired", vi: "Sắp hết hạn" },   icon: "fa-triangle-exclamation" },
    Expired:    { class: "expired",       color: "#fee2e2", text: { en: "Expired",        vi: "Hết hạn" },       icon: "fa-xmark" },
    Opened:     { class: "opened",        color: "#fef9c3", text: { en: "Opened",         vi: "Đã mở" },         icon: "fa-folder-open" },
    UsedUp:     { class: "used-up",       color: "#e5e7eb", text: { en: "Used up",        vi: "Đã dùng hết" },   icon: "fa-box-open" },
    Complete:   { class: "complete",      color: "#d1fae5", text: { en: "Complete",       vi: "Hoàn thành" },    icon: "fa-check" },
    Done:       { class: "complete",      color: "#d1fae5", text: { en: "Complete",       vi: "Hoàn thành" },    icon: "fa-check" },
    Default:    { class: "good",          color: "#dcfce7", text: { en: status,           vi: status },          icon: "fa-info-circle" },
  };

  const item = statusMap[status] || statusMap.Default;
  const isVi = window.GlobalLanguage?.getLanguage?.() === "vi";
  const text = isVi ? item.text.vi : item.text.en;

  return `
    <span class="status ${item.class}" style="background:${item.color};">
      <i class="fa-solid ${item.icon}"></i>
      <span data-en="${item.text.en}" data-vi="${item.text.vi}">${text}</span>
    </span>
  `;
}

function getProductHtml(act, material) {
  if (act === "Make cakes") return `<a href="#" class="table-link">${material || ""}</a>`;
  return material || "";
}

function getNoteHtml(note) {
  if (!note) return "<td></td>";
  if (note === "Detail" || note === "See Ingredients") {
    const translations = {
      Detail: { en: "Detail", vi: "Chi tiết" },
      "See Ingredients": { en: "See Ingredients", vi: "Xem nguyên liệu" },
    };
    const t = translations[note] || { en: note, vi: note };
    const isVi = window.GlobalLanguage?.getLanguage?.() === "vi";
    const displayText = isVi ? t.vi : t.en;
    return `<td><a href="#" class="table-link"><span data-en="${t.en}" data-vi="${t.vi}">${displayText}</span></a></td>`;
  }
  return `<td class="note-text">${note}</td>`;
}

function renderPage(page = 1) {
  const tableBody = document.getElementById("history-table-body");
  const list = historyData || [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(page, 1), totalPages);

  if (!tableBody) return;

  tableBody.innerHTML = "";
  if (list.length === 0) {
    const isVi = window.GlobalLanguage?.getLanguage?.() === "vi";
    tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px;">${isVi ? "Không có dữ liệu" : "No history data."}</td></tr>`;
    updatePagination(totalPages);
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);
  pageItems.forEach(item => tableBody.insertAdjacentHTML("beforeend", createHistoryRow(item)));

  updatePagination(totalPages);
  window.GlobalLanguage?.applyLanguage?.(window.GlobalLanguage.getLanguage?.());
}

function updatePagination(totalPages) {
  const pageInfo = document.getElementById("pageInfo");
  const prevBtn = document.getElementById("pagePrev");
  const nextBtn = document.getElementById("pageNext");
  if (pageInfo) pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

document.getElementById("pagePrev")?.addEventListener("click", () => renderPage(currentPage - 1));
document.getElementById("pageNext")?.addEventListener("click", () => renderPage(currentPage + 1));

document.getElementById("btnSearch")?.addEventListener("click", () => loadHistoryData());
