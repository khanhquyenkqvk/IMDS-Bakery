// Warehouse Data - Script with i18n + search/filter + pagination
(function () {
  "use strict";

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


console.log("[WAREHOUSE] API_BASE =", API_BASE);

  const PAGE_SIZE = 10;

  let allActivities = [];
  let currentPage = 1;

  // ---------- Utils ----------
  function getLang() {
    if (window.GlobalLanguage && typeof GlobalLanguage.getLanguage === "function") {
      return GlobalLanguage.getLanguage();
    }
    const saved = localStorage.getItem("app_language_admin");
    return saved === "vi" ? "vi" : "en";
  }

  function formatDateTimeISO(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    const lang = getLang();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    if (lang === "vi") {
      return `${hh}:${mm} ngày ${dd}/${MM}/${yyyy}`;
    }
    return `${hh}:${mm} ${dd}/${MM}/${yyyy}`;
  }

  function safeText(el, text) {
    if (el) el.textContent = text;
  }

  function applyLang() {
    if (window.GlobalLanguage && typeof GlobalLanguage.applyLanguage === "function") {
      GlobalLanguage.applyLanguage();
    }
  }

  // Map transaction type -> label & css
  function mapTypeToLabelAndClass(type) {
    const t = (type || "").toLowerCase();
    if (t === "import") return { labelEn: "Import", labelVi: "Nhập", cls: "status-badge status-import", key: "import" };
    if (t === "export") return { labelEn: "Export", labelVi: "Xuất", cls: "status-badge status-export", key: "export" };
    // Use, Waste, Adjust -> Expect (shrinkage)
    return { labelEn: "Expect", labelVi: "Hao hụt", cls: "status-badge status-expect", key: "expect" };
  }

  // ---------- Render functions ----------
  function renderSummary(summary) {
    if (!summary) return;
    const lang = getLang();
    const unit = lang === "vi" ? "lô" : "batches";
    safeText(
      document.getElementById("cardTotalImport"),
      `${summary.total_import_batches || 0} ${unit}`
    );
    safeText(
      document.getElementById("cardTotalExport"),
      `${summary.total_export_batches || 0} ${unit}`
    );
    safeText(
      document.getElementById("cardTotalLoss"),
      `${summary.total_loss_batches || 0} ${unit}`
    );
    safeText(
      document.getElementById("cardCurrentInventory"),
      `${summary.current_inventory_batches || 0} ${unit}`
    );
  }

  function getFilters() {
    const searchInput = document.querySelector(".search-input");
    const filterSelect = document.querySelector(".filter-select");
    return {
      searchTerm: searchInput ? (searchInput.value || "").toLowerCase() : "",
      filter: filterSelect ? (filterSelect.value || "all").toLowerCase() : "all",
    };
  }

  function getFilteredActivities() {
    const { searchTerm, filter } = getFilters();
    return (allActivities || []).filter((a) => {
      const map = mapTypeToLabelAndClass(a.type);
      const typeKey = map.key || "";
      const rowText = [
        formatDateTimeISO(a.created_at),
        map.labelVi,
        a.ingredient_name,
        a.lot_code,
        a.quantity,
        a.unit,
        a.employee_name,
      ]
        .join(" ")
        .toLowerCase();

      const matchSearch = rowText.includes(searchTerm);
      const matchFilter = filter === "all" || typeKey === filter;
      return matchSearch && matchFilter;
    });
  }

  function updatePagination(totalItems, totalPages) {
    const info = document.getElementById("warehousePageInfo");
    const btnPrev = document.getElementById("warehousePagePrev");
    const btnNext = document.getElementById("warehousePageNext");

    if (info) {
      const displayCurrent = totalItems === 0 ? 0 : currentPage;
      info.textContent = `${displayCurrent} / ${totalPages}`;
    }
    if (btnPrev) {
      btnPrev.disabled = currentPage <= 1 || totalItems === 0;
    }
    if (btnNext) {
      btnNext.disabled = currentPage >= totalPages || totalItems === 0;
    }
  }

  function renderActivitiesTable() {
    const tbody = document.getElementById("warehouseTableBody");
    if (!tbody) return;

    const filtered = getFilteredActivities();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    if (!pageItems.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;" data-en="No data" data-vi="Không có dữ liệu">Không có dữ liệu</td></tr>';
      updatePagination(filtered.length, totalPages);
      applyLang();
      return;
    }

    const rowsHtml = pageItems
      .map((a) => {
        const dt = formatDateTimeISO(a.created_at);
        const map = mapTypeToLabelAndClass(a.type);
        const qty = Number(a.quantity || 0);
        const isPlus = (map.labelEn || "").toLowerCase() === "import";
        const qtyText = `${isPlus ? "+" : "-"}${qty} ${a.unit || ""}`;
        const qtyClass = isPlus ? "text-right text-green" : "text-right text-red";

        return `
          <tr>
            <td>${dt}</td>
            <td><span class="${map.cls}" data-type="${map.key}" data-en="${map.labelEn}" data-vi="${map.labelVi}">${map.labelVi}</span></td>
            <td>${a.ingredient_name || ""}</td>
            <td>${a.lot_code || ""}</td>
            <td class="${qtyClass}">${qtyText}</td>
            <td>${a.employee_name || ""}</td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = rowsHtml;
    updatePagination(filtered.length, totalPages);
    applyLang();
  }

  function setActivities(activities) {
    allActivities = activities || [];
    currentPage = 1;
    renderActivitiesTable();
  }

  function renderStats(stats) {
  if (!stats) return;
  const lang = getLang();

  // ---- Top employee ----
  const emp = stats.top_employee;
  if (emp) {
    const name = emp.employee_name || emp.username || "--";
    safeText(document.getElementById("topEmployeeName"), name);
    safeText(
      document.getElementById("topEmployeeCode"),
      `ID ${emp.user_id || ""}`
    );

    const metaEl = document.getElementById("topEmployeeMeta");
    if (metaEl) {
      const tx = emp.tx_count || 0;
      const textEn = `${tx} transactions`;
      const textVi = `${tx} giao dịch`;

      metaEl.setAttribute("data-en", textEn);
      metaEl.setAttribute("data-vi", textVi);
      metaEl.textContent = (lang === "vi") ? textVi : textEn;
    }

    const avatar = document.getElementById("topEmployeeAvatar");
    if (avatar) avatar.textContent = (name[0] || "A").toUpperCase();
  }

  // ---- Top imported ingredient ----
  const ing = stats.top_import_ingredient;
  if (ing) {
    safeText(
      document.getElementById("topImportIngredientName"),
      ing.ingredient_name || "--"
    );

    const metaEl = document.getElementById("topImportIngredientMeta");
    if (metaEl) {
      const cnt = ing.import_batches || 0;
      const textEn = `${cnt} batches`;
      const textVi = `${cnt} lô`;

      metaEl.setAttribute("data-en", textEn);
      metaEl.setAttribute("data-vi", textVi);
      metaEl.textContent = (lang === "vi") ? textVi : textEn;
    }
  }

    // Expiring soon
    const expListEl = document.getElementById("expiringSoonList");
    const items = stats.expiring_soon || [];
    if (expListEl) {
      if (!items.length) {
        expListEl.innerHTML =
          '<div class="expire-item"><span data-en="No batches expiring soon." data-vi="Không có lô sắp hết hạn.">Không có lô sắp hết hạn.</span></div>';
      } else {
        expListEl.innerHTML = items
          .map((e) => {
            const days = e.days_left != null ? `${e.days_left} ngày` : "";
            return `
              <div class="expire-item">
                <span>${e.lot_code} - ${e.ingredient_name} (${days})</span>
              </div>
            `;
          })
          .join("");
      }
    }

    const warningText = document.getElementById("generalWarningText");
    if (warningText) {
      if (!items.length) {
        warningText.textContent = lang === "vi" ? "Không có lô sắp hết hạn." : "No lots are about to expire.";
      } else {
        warningText.textContent = lang === "vi"
          ? `${items.length} lô sắp hết hạn.`
          : `${items.length} lots are about to expire.`;
      }
    }
    applyLang();
  }

  function renderPeriodicSummary(periods) {    renderPeriodicSummaryPaginated(periods || []);  }
  // Pagination for periodic summary
  let periodicData = [];
  let periodicPage = 1;
  const PERIODIC_PAGE_SIZE = 5;

  function getPeriodicPageData(periods) {
    const totalPages = Math.max(1, Math.ceil((periods.length || 0) / PERIODIC_PAGE_SIZE));
    periodicPage = Math.min(Math.max(periodicPage, 1), totalPages);
    const start = (periodicPage - 1) * PERIODIC_PAGE_SIZE;
    return { pageItems: periods.slice(start, start + PERIODIC_PAGE_SIZE), totalPages };
  }

  function renderPeriodicPagination(totalPages) {
    const info = document.getElementById("periodicPageInfo");
    const prev = document.getElementById("periodicPagePrev");
    const next = document.getElementById("periodicPageNext");
    if (info) info.textContent = `Page ${totalPages === 0 ? 0 : periodicPage} / ${totalPages}`;
    if (prev) prev.disabled = periodicPage <= 1;
    if (next) next.disabled = periodicPage >= totalPages;
  }

  function renderPeriodicSummaryPaginated(periods) {
    if (periods) {
      periodicData = periods;
      periodicPage = 1;
    } else {
      periods = periodicData;
    }
    const tbody = document.getElementById("periodicSummaryBody");
    if (!tbody) return;
    const lang = getLang();
    const unit = lang === "vi" ? "lô" : "batches";
    if (!periods || periods.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;" data-en="No summary data" data-vi="Không có dữ liệu tổng kết">Không có dữ liệu tổng kết</td></tr>';
      renderPeriodicPagination(1);
      applyLang();
      return;
    }
    const { pageItems, totalPages } = getPeriodicPageData(periods);
    const rowsHtml = pageItems
      .map((p) => {
        return `
          <tr>
            <td>${p.week_label}</td>
            <td>${p.time_range}</td>
            <td>${p.import_batches} ${unit}</td>
            <td>${p.export_batches} ${unit}</td>
            <td>${p.expect_batches} ${unit}</td>
            <td>${p.ending_balance_batches} ${unit}</td>
            <td>
              <button
                class="btn-export"
                data-year="${p.year}"
                data-week="${p.week}"
              >
                <span data-en="Export" data-vi="Xuất">${lang === "vi" ? "Xuất" : "Export"}</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
    tbody.innerHTML = rowsHtml;
    tbody.querySelectorAll(".btn-export").forEach((btn) => {
      btn.addEventListener("click", function () {
        const year = this.getAttribute("data-year");
        const week = this.getAttribute("data-week");
        exportWeeklyReport(year, week);
      });
    });
    renderPeriodicPagination(totalPages);
    applyLang();
  }

  async function exportWeeklyReport(year, week) {
    if (!year || !week) {
      alert("Missing year or week for export.");
      return;
    }

    try {
      const token = sessionStorage.getItem("auth_token");
      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(
        `${API_BASE}/api/warehouse/summary-export?year=${year}&week=${week}`,
        {
          method: "GET",
          headers,
        }
      );

      if (!res.ok) {
        console.error("Export failed with status", res.status);
        alert("Export failed. Please try again.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `warehouse_week_${week}_${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting weekly report:", err);
      alert("Export failed due to network error.");
    }
  }


  // ---------- Search, filter & pagination ----------
  function filterAndRender() {
    currentPage = 1;
    renderActivitiesTable();
  }

  function initSearchAndFilter() {
    const searchInput = document.querySelector(".search-input");
    const filterSelect = document.querySelector(".filter-select");
    const btnPrev = document.getElementById("warehousePagePrev");
    const btnNext = document.getElementById("warehousePageNext");

    if (filterSelect && !filterSelect.value) {
      filterSelect.value = "all";
    }

    if (searchInput) {
      searchInput.removeEventListener("input", filterAndRender);
      searchInput.addEventListener("input", filterAndRender);
    }
    if (filterSelect) {
      filterSelect.removeEventListener("change", filterAndRender);
      filterSelect.addEventListener("change", filterAndRender);
    }
    if (btnPrev) {
      btnPrev.onclick = function () {
        if (currentPage > 1) {
          currentPage -= 1;
          renderActivitiesTable();
        }
      };
    }
    if (btnNext) {
      btnNext.onclick = function () {
        const totalPages = Math.max(1, Math.ceil(getFilteredActivities().length / PAGE_SIZE));
        if (currentPage < totalPages) {
          currentPage += 1;
          renderActivitiesTable();
        }
      };
    }
  }

  // ---------- Load dashboard from API ----------
  async function loadWarehouseDashboard() {
    try {
      const token = sessionStorage.getItem("auth_token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/warehouse/dashboard`, {
        method: "GET",
        headers,
      });

      if (!res.ok) {
        console.error("Failed to load warehouse dashboard", res.status);
        return;
      }

      const data = await res.json();
      renderSummary(data.summary);
      setActivities(data.activities || []);
      renderStats(data.stats);
      renderPeriodicSummaryPaginated(data.periodic_summary || []);      setupPeriodicPagination(); 
      initSearchAndFilter();
      renderActivitiesTable();
    } catch (err) {
      console.error("Error loading warehouse dashboard:", err);
    }
  }

  // Wait for DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadWarehouseDashboard);
  } else {
    loadWarehouseDashboard();
  }
    function setupPeriodicPagination() {
    const prev = document.getElementById('periodicPagePrev');
    const next = document.getElementById('periodicPageNext');
    if (prev) prev.addEventListener('click', () => { periodicPage -= 1; renderPeriodicSummaryPaginated(); });
    if (next) next.addEventListener('click', () => { periodicPage += 1; renderPeriodicSummaryPaginated(); });
  }
})();


