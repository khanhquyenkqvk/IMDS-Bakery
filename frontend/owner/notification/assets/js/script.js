// Owner Notifications JavaScript (with detail modal)
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


console.log("[NOTIF] API_BASE =", API_BASE);


const NOTIFS_PER_PAGE = 10;
let notifications = [];
let currentFilter = "all";
let currentPage = 1;
let currentDetailNotification = null;
let advancedFilter = false;   
let sortMode = "time_desc";

document.addEventListener("DOMContentLoaded", function () {
  initializeNotificationsPage();
});

async function initializeNotificationsPage() {
  updateHeaderTime();
  setInterval(updateHeaderTime, 60000);

  updateUserInfo();
  initializeSidebarNavigation();
  initializeLogout();
  initDetailModalEvents();

  await loadNotificationsFromApi();

  attachEvents();
  updateCounts();
  renderNotifications();
}

/* =========================
   Header helpers
   ========================= */

function formatHeaderDate(d) {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return dayNames[d.getDay()] + ", " + monthNames[d.getMonth()] + " " + d.getDate();
}
function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token = sessionStorage.getItem("auth_token");
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const info = JSON.parse(sessionStorage.getItem("user_info") || "{}");
    const uid = info.user_id || info.id;
    if (uid) headers["X-User-Id"] = String(uid);
  } catch {}
  return headers;
}

function formatHeaderTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return String(h).padStart(2, "0") + ":" + m + " " + ampm;
}

function updateHeaderTime() {
  const now = new Date();
  const elDate = document.getElementById("currentDate");
  const elTime = document.getElementById("currentTime");
  if (elDate) elDate.textContent = formatHeaderDate(now);
  if (elTime) elTime.textContent = formatHeaderTime(now);
}

/* =========================
   User & sidebar
   ========================= */

function updateUserInfo() {
  try {
    const userInfo = JSON.parse(sessionStorage.getItem("user_info") || "{}");
    const userNameEl = document.querySelector(".user-name");
    if (userInfo && userInfo.username && userNameEl) {
      userNameEl.textContent = userInfo.username;
    }
  } catch (error) {
    console.log("Could not get user info from sessionStorage");
  }
}

function initializeSidebarNavigation() {
  document
    .querySelectorAll(".sidebar .menu-item[data-href]")
    .forEach(function (btn) {
      btn.addEventListener("click", function () {
        const href = this.getAttribute("data-href");
        if (href && href !== "#") {
          location.href = href;
        }
      });
    });
}

function initializeLogout() {
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

/* =========================
   Load notifications
   ========================= */

async function loadNotificationsFromApi() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/notifications`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!data.success) {
      console.error("Failed to load notifications:", data);
      notifications = [];
      return;
    }
    const list = data.data || [];
    notifications = list.map((row) => ({
      id: row.id,
      alert_id: row.alert_id,
      alert_type: row.alert_type,
      severity: row.severity,
      status: row.status,
      title: row.title,
      message: row.message,
      type: row.type,
      category: row.category || "inventory",
      timeAgo: row.timeAgo || formatTimeAgo(row.created_at),
      impact: row.impact || "Medium",
      primaryAction: row.primaryAction || "View Details",
      unread: row.status === "Pending" || !!row.unread,
      // detail fields:
      batch_id: row.batch_id,
      ingredient_name: row.ingredient_name,
      lot_code: row.lot_code,
      expiry_date: row.expiry_date,
      manufacture_date: row.manufacture_date,
      quantity: row.quantity,
      unit: row.unit,
      created_at: row.created_at,
    }));
  } catch (err) {
    console.error("Error calling notifications API:", err);
    notifications = [];
  }
}

function formatTimeAgo(iso) {
  if (!iso) return "";
  const created = new Date(iso);
  const now = new Date();
  const diffMs = now - created;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes} mins ago`;
  if (hours < 24) return `${hours} hours ago`;
  return `${days} days ago`;
}

/* =========================
   Events
   ========================= */

function attachEvents() {
  document.querySelectorAll(".notif-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document
        .querySelectorAll(".notif-tab")
        .forEach((t) => t.classList.remove("active"));
      this.classList.add("active");
      currentFilter = this.getAttribute("data-filter") || "all";
      currentPage = 1;
      renderNotifications();
    });
  });
 // === Nút Filter (phễu) thông minh ===
  const filterBtn = document.querySelector(
    ".notification-header-actions .btn-icon[title='Filter']"
  );
  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      advancedFilter = !advancedFilter;
      filterBtn.classList.toggle("active", advancedFilter);
      currentPage = 1;
      renderNotifications();
    });
  }

  // === Nút Sort ===
  const sortBtn = document.querySelector(
    ".notification-header-actions .btn-icon[title='Sort']"
  );
  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      // xoay mode: time_desc -> priority_desc -> time_asc -> time_desc...
      if (sortMode === "time_desc") {
        sortMode = "priority_desc";
        sortBtn.title = "Sort by priority";
      } else if (sortMode === "priority_desc") {
        sortMode = "time_asc";
        sortBtn.title = "Sort oldest first";
      } else {
        sortMode = "time_desc";
        sortBtn.title = "Sort newest first";
      }
      sortBtn.dataset.mode = sortMode; // dùng cho CSS nếu cần
      currentPage = 1;
      renderNotifications();
    });
  }
  const prev = document.getElementById("prevPage");
  const next = document.getElementById("nextPage");
  if (prev) {
    prev.addEventListener("click", function () {
      if (currentPage > 1) {
        currentPage--;
        renderNotifications();
      }
    });
  }
  if (next) {
    next.addEventListener("click", function () {
      const totalPages = getTotalPages();
      if (currentPage < totalPages) {
        currentPage++;
        renderNotifications();
      }
    });
  }

  const markAll = document.getElementById("btnMarkAllRead");
  if (markAll) {
    markAll.addEventListener("click", async function () {
      try {
        const userInfo = JSON.parse(
          sessionStorage.getItem("user_info") || "{}"
        );
        const res = await fetch(`${API_BASE}/api/owner/notifications/mark-all-read`,
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ user_id: userInfo.user_id || null }),
          }
        );
        const data = await res.json();
        if (!data.success) {
          console.error("Failed to mark all as read on server:", data);
        }
      } catch (err) {
        console.error("Error calling mark-all-read API:", err);
      }

      notifications.forEach((n) => (n.unread = false));
      updateCounts();
      renderNotifications();
    });
  }
}

/* =========================
   Filters & pagination
   ========================= */

function isImportantNotification(n) {
  const type = (n.type || "").toLowerCase();       // critical / high / medium / low...
  const impact = (n.impact || "").toLowerCase();   // High / Medium / Low...
  const isCriticalType = type === "critical" || type === "high";
  const isHighImpact = impact === "high" || impact === "very high";

  // quy ước: important = chưa đọc & (critical/high hoặc impact cao hoặc AI)
  return n.unread && (isCriticalType || isHighImpact || n.category === "ai");
}

function applyFilter(list) {
  let result = list;

  // filter theo tab
  if (currentFilter === "unread") {
    result = result.filter((n) => n.unread);
  } else if (currentFilter === "critical") {
    result = result.filter((n) => n.type === "critical");
  } else if (currentFilter === "warning") {
    result = result.filter((n) => n.type === "high" || n.type === "medium");
  } else if (currentFilter === "ai") {
    result = result.filter((n) => n.category === "ai");
  }

  // filter nâng cao (phễu): chỉ giữ thông báo quan trọng
  if (advancedFilter) {
    result = result.filter(isImportantNotification);
  }

  return result;
}
function priorityRank(n) {
  const type = (n.type || "").toLowerCase();
  if (type === "critical") return 0;
  if (type === "high") return 1;
  if (type === "medium") return 2;
  return 3; // low / info
}

function sortNotifications(list) {
  const arr = [...list];

  if (sortMode === "priority_desc") {
    arr.sort((a, b) => {
      const ra = priorityRank(a);
      const rb = priorityRank(b);
      if (ra !== rb) return ra - rb; // rank nhỏ = ưu tiên hơn

      // cùng priority thì sort theo thời gian mới nhất trước
      const da = new Date(a.created_at || 0);
      const db = new Date(b.created_at || 0);
      return db - da;
    });
  } else if (sortMode === "time_asc" || sortMode === "time_desc") {
    arr.sort((a, b) => {
      const da = new Date(a.created_at || 0);
      const db = new Date(b.created_at || 0);
      return sortMode === "time_desc" ? db - da : da - db;
    });
  }

  return arr;
}


function getTotalPages() {
  const filtered = applyFilter(notifications);
  return Math.max(1, Math.ceil(filtered.length / NOTIFS_PER_PAGE));
}

function renderNotifications() {
  const listEl = document.getElementById("notificationList");
  if (!listEl) return;

  const filtered = applyFilter(notifications);
  const sorted = sortNotifications(filtered);

  // dùng length của sorted cũng được, 2 thằng cùng length
  const totalPages = Math.max(
    1,
    Math.ceil(sorted.length / NOTIFS_PER_PAGE)
  );
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * NOTIFS_PER_PAGE;
  const pageItems = sorted.slice(start, start + NOTIFS_PER_PAGE);                      

  listEl.innerHTML = "";
  if (!pageItems.length) {
    listEl.innerHTML =
      '<p style="font-size:14px;color:#6b7280;">No notifications for this filter.</p>';
  } else {
    pageItems.forEach((n) => {
      listEl.appendChild(buildNotificationCard(n));
    });
  }

  const pageInfo = document.getElementById("pageInfo");
  const prev = document.getElementById("prevPage");
  const next = document.getElementById("nextPage");
  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
  }
  if (prev) prev.disabled = currentPage <= 1;
  if (next) next.disabled = currentPage >= totalPages;
}


function buildNotificationCard(n) {
  const card = document.createElement("article");
  card.className = "notif-card" + (n.unread ? " unread" : "");

  const typeChipClass =
    n.type === "critical"
      ? "notif-chip notif-chip--urgent"
      : n.type === "high"
      ? "notif-chip notif-chip--high"
      : n.type === "medium"
      ? "notif-chip notif-chip--medium"
      : "notif-chip notif-chip--low";

  const categoryChipClass =
    n.category === "inventory"
      ? "notif-chip notif-chip--inventory"
      : n.category === "ai"
      ? "notif-chip notif-chip--ai"
      : "notif-chip notif-chip--inventory";

  card.innerHTML = `
    <div class="notif-card-header">
      <span class="${typeChipClass}">
        ${n.type === "critical"
          ? "Urgent"
          : n.type.charAt(0).toUpperCase() + n.type.slice(1)}
      </span>
      <span class="${categoryChipClass}">
        ${n.category === "ai" ? "AI" : capitalizeFirst(n.category)}
      </span>
    </div>
    <div class="notif-body">
      <div class="notif-title">${n.title}</div>
      <div class="notif-message">${n.message}</div>
      <div class="notif-meta">
        <span><i class="fa-regular fa-clock"></i>${n.timeAgo || ""}</span>
        <span><i class="fa-solid fa-bullseye"></i>Impact: ${n.impact}</span>
      </div>
      <div class="notif-actions">
        <button class="notif-primary-btn" type="button">
          ${n.primaryAction}
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </div>
  `;

  const btn = card.querySelector(".notif-primary-btn");
  if (btn) {
    btn.addEventListener("click", () => openNotificationDetail(n));
  }

  return card;
}

/* =========================
   Counts
   ========================= */

function updateCounts() {
  const all = notifications.length;
  const unread = notifications.filter((n) => n.unread).length;
  const critical = notifications.filter((n) => n.type === "critical").length;
  const warning = notifications.filter(
    (n) => n.type === "high" || n.type === "medium"
  ).length;
  const ai = notifications.filter((n) => n.category === "ai").length;

  setText("countAll", all);
  setText("countUnread", unread);
  setText("countCritical", critical);
  setText("countWarning", warning);
  setText("countAI", ai);

  const badge = document.getElementById("notificationBadge");
  if (badge) badge.textContent = String(all);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* =========================
   Detail modal logic
   ========================= */

function initDetailModalEvents() {
  const overlay = document.getElementById("notificationDetailOverlay");
  const closeTop = document.getElementById("notifDetailCloseBtn");
  const closeBottom = document.getElementById("btnDetailCloseBottom");
  const markReadBtn = document.getElementById("btnDetailMarkRead");

  if (closeTop) {
    closeTop.addEventListener("click", closeNotificationDetail);
  }
  if (closeBottom) {
    closeBottom.addEventListener("click", closeNotificationDetail);
  }
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeNotificationDetail();
      }
    });
  }
  if (markReadBtn) {
    markReadBtn.addEventListener("click", markDetailAsRead);
  }
}

function openNotificationDetail(n) {
  currentDetailNotification = n;

  const overlay = document.getElementById("notificationDetailOverlay");
  if (!overlay) return;

  const titleEl = document.getElementById("detailTitle");
  const timeEl = document.getElementById("detailTimeAgo");
  const infoEl = document.getElementById("detailInformation");
  const relatedEl = document.getElementById("detailRelatedItem");
  const recommendedEl = document.getElementById("detailRecommended");
  const chipEl = document.getElementById("detailPriorityChip");
  const priorityLabelEl = document.getElementById("detailPriorityLabel");
  const impactLabelEl = document.getElementById("detailImpactLabel");

  if (titleEl) titleEl.textContent = n.title;
  if (timeEl) timeEl.textContent = n.timeAgo || "";

  // Chip style theo type
  if (chipEl) {
    chipEl.className = "detail-chip";
    if (n.type === "critical") {
      chipEl.classList.add("detail-chip-urgent");
      chipEl.textContent = "🔥 Urgent";
    } else if (n.type === "high") {
      chipEl.classList.add("detail-chip-high");
      chipEl.textContent = "⚡ High";
    } else if (n.type === "medium") {
      chipEl.classList.add("detail-chip-medium");
      chipEl.textContent = "Medium";
    } else {
      chipEl.classList.add("detail-chip-medium");
      chipEl.textContent = "Info";
    }
  }

  // Detailed information text theo alert_type
  const ingredient = n.ingredient_name || "Unknown item";
  const lot = n.lot_code || "N/A";
  const qtyText =
    typeof n.quantity === "number"
      ? `${n.quantity} ${n.unit || ""}`
      : "";
  const mfg = n.manufacture_date || "";
  const exp = n.expiry_date || "";

  let infoText = "";
  if (n.alert_type === "Expired") {
    infoText =
      `This batch of ${ingredient} (lot ${lot}) was received on ${mfg || "N/A"} ` +
      `and has now passed its expiry date ${exp || ""}. ` +
      `Please remove it from inventory immediately to prevent usage.`;
  } else if (n.alert_type === "NearExpiry") {
    infoText =
      `This batch of ${ingredient} (lot ${lot}) is approaching its expiry date ${exp || ""}. ` +
      `Review production plans to use it before it expires.`;
  } else if (n.alert_type === "LowStock") {
    infoText =
      `Stock level for ${ingredient} is low. Current remaining quantity: ${qtyText || "N/A"}. ` +
      `Consider reordering to avoid interruptions in production.`;
  } else if (n.alert_type === "Waste") {
    infoText =
      `Waste has been reported for ${ingredient} (lot ${lot}). ` +
      `Recorded quantity: ${qtyText || "N/A"}. Review the waste reason and update records if needed.`;
  } else {
    infoText = n.message || "";
  }

  if (infoEl) infoEl.textContent = infoText;

  if (relatedEl) {
    relatedEl.textContent = `${ingredient} – Batch ${lot}`;
  }

  // Recommended actions
  let recText = "";
  if (n.alert_type === "Expired") {
    recText =
      "Remove expired items from inventory, record waste, and verify that no expired items remain in production or display.";
  } else if (n.alert_type === "NearExpiry") {
    recText =
      "Prioritize this batch in upcoming production plans or promotions to minimize waste.";
  } else if (n.alert_type === "LowStock") {
    recText =
      "Check purchase orders and place a replenishment order to reach the normal stock level.";
  } else if (n.alert_type === "Waste") {
    recText =
      "Review the waste report, confirm the root cause, and apply corrective actions if necessary.";
  } else {
    recText = "Review the related items and take appropriate actions.";
  }
  if (recommendedEl) recommendedEl.textContent = recText;

  // Priority + impact labels
  if (priorityLabelEl) {
    priorityLabelEl.textContent =
      n.type === "critical"
        ? "Urgent"
        : n.type === "high"
        ? "High"
        : n.type === "medium"
        ? "Medium"
        : "Low";
  }
  if (impactLabelEl) {
    impactLabelEl.textContent = n.impact || "Medium";
  }

  overlay.classList.remove("hidden");
}

function closeNotificationDetail() {
  const overlay = document.getElementById("notificationDetailOverlay");
  if (overlay) overlay.classList.add("hidden");
  currentDetailNotification = null;
}

async function markDetailAsRead() {
  if (!currentDetailNotification) {
    closeNotificationDetail();
    return;
  }

  const n = currentDetailNotification;

  // Gọi API mark-read
  try {
    const userInfo = JSON.parse(sessionStorage.getItem("user_info") || "{}");
    const res = await fetch(`${API_BASE}/api/owner/notifications/${n.alert_id}/mark-read`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ user_id: userInfo.user_id || null }),
      }
    );
    const data = await res.json();
    if (!data.success) {
      console.error("Failed to mark single notification as read:", data);
    }
  } catch (err) {
    console.error("Error calling mark-read API:", err);
  }

  // Cập nhật local state
  const target = notifications.find((x) => x.alert_id === n.alert_id);
  if (target) {
    target.unread = false;
    target.status = "Resolved";
  }

  updateCounts();
  renderNotifications();
  closeNotificationDetail();
}
