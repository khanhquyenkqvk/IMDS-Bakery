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

  console.log("[ADMIN REPORT] API_BASE =", API_BASE);

  function getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    const token = sessionStorage.getItem("auth_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }



  // ===========================================
  // COMMON: Search / Filter cho trang Warehouse
  // (giữ nguyên đoạn filterTable cũ)
  // ===========================================

  const searchInput = document.querySelector('.search-input');
  const filterSelect = document.querySelector('.filter-select');
  const tableBody = document.getElementById('warehouseTableBody');
  const tableRows = tableBody ? tableBody.querySelectorAll('tr') : [];

  function filterTable() {
    if (!tableRows || tableRows.length === 0) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const filterValue = filterSelect ? filterSelect.value.toLowerCase() : 'all actions';

    tableRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 6) return;

      const rowText = Array.from(cells)
        .map(cell => cell.textContent.toLowerCase())
        .join(' ');

      const operationType = cells[1].textContent.toLowerCase();

      const matchesSearch = rowText.includes(searchTerm);
      const matchesFilter =
        filterValue === 'all actions' || operationType.includes(filterValue);

      row.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
    });
  }

  if (searchInput) searchInput.addEventListener('input', filterTable);
  if (filterSelect) filterSelect.addEventListener('change', filterTable);


  // ===========================================
  // DETAIL TAB – EXPORT EXCEL (CSV) (giữ nguyên)
  // ===========================================

  function initDetailExport() {
    const exportBtn = document.querySelector('.btn-export-excel');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
      const table = document.querySelector('.detail-table');
      if (!table) return;

      let csvContent = "";

      const headers = [...table.querySelectorAll("thead th")].map(th => th.innerText);
      csvContent += headers.join(",") + "\n";

      const rows = table.querySelectorAll("tbody tr");
      rows.forEach(row => {
        const cols = [...row.querySelectorAll("td")].map(td => td.innerText);
        csvContent += cols.join(",") + "\n";
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "Detailed_Inventory_Report.csv";
      link.style.visibility = "hidden";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }


  // ===========================================
  // SUMMARY + KPI – gọi API
  // ===========================================

  async function loadSummaryCards() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/report/summary`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!json.success) return;

      const d = json.data;
      const totalLotsEl = document.getElementById('sumTotalLots');
      const trendLabelEl = document.getElementById('sumTrendLabel');
      const trendDescEl = document.getElementById('sumTrendDesc');
      const wasteRateEl = document.getElementById('sumWasteRate');
      const autoEl = document.getElementById('sumAutoReporting');
      const autoDescEl = document.getElementById('sumAutoReportingDesc');

      if (totalLotsEl) totalLotsEl.textContent = d.total_inventory_lots;
      if (trendLabelEl) trendLabelEl.textContent = formatTrendLabel(d.trend_label);
      if (trendDescEl) {
        const sign = d.trend_percent >= 0 ? '+' : '';
        trendDescEl.textContent = formatTrendDesc(sign, d.trend_percent);
      }
      if (wasteRateEl) wasteRateEl.textContent = `${d.waste_rate}%`;
      if (autoEl) autoEl.textContent = d.auto_reporting_enabled ? 'On' : 'Off';
      if (autoDescEl) autoDescEl.textContent = formatAutoDesc(d.auto_reporting_frequency);
    } catch (err) {
      console.error('loadSummaryCards error:', err);
    }
  }

let kpiCache = null;
let detailCache = [];
let detailPage = 1;
const detailPageSize = 10;

  async function loadInventoryKpi() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/report/inventory-kpi`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!json.success) return;

      kpiCache = json.data;
      applyInventoryKpi(kpiCache);
    } catch (err) {
      console.error('loadInventoryKpi error:', err);
    }
  }

  function applyInventoryKpi(d) {
      if (!d) return;
      const totalLotsEl = document.getElementById('kpiTotalLots');
      const goodCountEl = document.getElementById('kpiGoodCount');
      const goodPercentEl = document.getElementById('kpiGoodPercent');
      const warnCountEl = document.getElementById('kpiWarningCount');
      const warnPercentEl = document.getElementById('kpiWarningPercent');
      const dangerCountEl = document.getElementById('kpiDangerCount');
      const dangerPercentEl = document.getElementById('kpiDangerPercent');

      if (totalLotsEl) totalLotsEl.textContent = d.total_lots;
      if (goodCountEl) goodCountEl.textContent = d.good.count;
      if (goodPercentEl) goodPercentEl.textContent = formatPercentText(d.good.percent);
      if (warnCountEl) warnCountEl.textContent = d.warning.count;
      if (warnPercentEl) warnPercentEl.textContent = formatPercentText(d.warning.percent);
      if (dangerCountEl) dangerCountEl.textContent = d.danger.count;
      if (dangerPercentEl) dangerPercentEl.textContent = formatPercentText(d.danger.percent);
  }

  function formatPercentText(value) {
    const lang = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function')
      ? window.GlobalLanguage.getLanguage()
      : (localStorage.getItem('app_language_admin') || 'en');
    return lang === 'vi'
      ? `${value}% tổng số`
      : `${value}% of the total`;
  }

  function formatTrendLabel(label) {
    const lang = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function')
      ? window.GlobalLanguage.getLanguage()
      : (localStorage.getItem('app_language_admin') || 'en');
    const lower = (label || '').toLowerCase();
    if (lang === 'vi') {
      if (lower.includes('up')) return 'Tăng';
      if (lower.includes('down')) return 'Giảm';
      if (lower.includes('stable')) return 'Ổn định';
    }
    return label || '';
  }

  function formatTrendDesc(sign, percent) {
    const lang = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function')
      ? window.GlobalLanguage.getLanguage()
      : (localStorage.getItem('app_language_admin') || 'en');
    const base = `${sign}${percent}%`;
    return lang === 'vi'
      ? `${base} so với tháng trước`
      : `${base} compared to last month`;
  }

  function formatAutoDesc(freq) {
    const lang = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function')
      ? window.GlobalLanguage.getLanguage()
      : (localStorage.getItem('app_language_admin') || 'en');
    const lower = (freq || '').toLowerCase();
    if (lang === 'vi') {
      if (lower === 'daily') return 'Gửi hằng ngày';
      if (lower === 'weekly') return 'Gửi hằng tuần';
      if (lower === 'monthly') return 'Gửi hằng tháng';
      return `Gửi ${freq || ''}`;
    }
    return lower === 'daily' ? 'Send daily' : `Send ${lower || freq || ''}`;
  }

  // Re-apply labels when language changes
  window.addEventListener('app-language-change', () => {
    if (kpiCache) applyInventoryKpi(kpiCache);
    applyInventoryDetail(detailCache);
    loadAnalysisData();
  });


  // ===========================================
  // TREND TAB – Load from API + Render Charts
  // ===========================================

  let trendChart = null;
  let barChart = null;
  let pieChart = null;

  async function loadTrendData() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/report/trend`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!json.success) return;

      const d = json.data;
      renderTrendChart(d);
      updateTrendSummary(d.summary);
    } catch (err) {
      console.error('loadTrendData error:', err);
    }
  }

  function renderTrendChart(data) {
    const canvas = document.getElementById("inventoryTrendChart");
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext("2d");

    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "Import",
            data: data.import,
            borderWidth: 3,
            borderColor: "#16A34A",
            backgroundColor: "rgba(22,163,74,0.08)",
            tension: 0.4,
            fill: true,
            pointRadius: 4,
          },
          {
            label: "Export",
            data: data.export,
            borderWidth: 3,
            borderColor: "#2563EB",
            backgroundColor: "rgba(37,99,235,0.08)",
            tension: 0.4,
            fill: true,
            pointRadius: 4,
          },
          {
            label: "Deduct",
            data: data.deduct,
            borderWidth: 3,
            borderColor: "#DC2626",
            backgroundColor: "rgba(220,38,38,0.12)",
            tension: 0.4,
            fill: true,
            pointRadius: 4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } }
      }
    });
  }

  function updateTrendSummary(summary) {
    document.getElementById("trendImportNum").textContent = summary.import;
    document.getElementById("trendExportNum").textContent = summary.export;
    document.getElementById("trendDeductNum").textContent = summary.deduct;
  }


  // ===========================================
  // ANALYSIS TAB – call API
  // ===========================================

  async function loadAnalysisData() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/report/analysis`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!json.success) return;

      renderAnalysis(json.data);
    } catch (err) {
      console.error('loadAnalysisData error:', err);
    }
  }

  function renderAnalysis(data) {
    // PERFORMANCE
    document.getElementById("analysisWasteValue").textContent = data.performance.wasteRate + "%";
    document.getElementById("analysisWasteBar").style.width = data.performance.wasteRate + "%";

    document.getElementById("analysisGoodValue").textContent = data.performance.goodRatio + "%";
    document.getElementById("analysisGoodBar").style.width = data.performance.goodRatio + "%";

    document.getElementById("analysisFifoValue").textContent = data.performance.fifo + "%";
    document.getElementById("analysisFifoBar").style.width = data.performance.fifo + "%";

    // RECOMMENDATIONS
    const box = document.getElementById("recommendBox");
    box.innerHTML = "";
    data.recommendations.forEach(rec => {
      const div = document.createElement("div");
      div.className = `recommend-item ${rec.type}`;
      const lang = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function')
        ? window.GlobalLanguage.getLanguage()
        : (localStorage.getItem('app_language_admin') || 'en');
      div.innerHTML = `
        <i class="${getRecommendIcon(rec.type)}"></i>
        <div>
          <h4>${formatRecommendText(rec.title, 'title', rec.type, lang)}</h4>
          <p>${formatRecommendText(rec.text, 'text', rec.type, lang)}</p>
        </div>
      `;
      box.appendChild(div);
    });
  }

  function formatRecommendText(text, field, type, lang) {
    const currentLang = lang || ((window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function')
      ? window.GlobalLanguage.getLanguage()
      : (localStorage.getItem('app_language_admin') || 'en'));

    // If API already provides {en,vi}
    if (typeof text === 'object' && text !== null) {
      return currentLang === 'vi' ? (text.vi || text.en || '') : (text.en || text.vi || '');
    }

    // Fallback map by type and field
    const key = (type || '').toLowerCase();
    const map = {
      vi: {
        title: {
          good: 'Tốt',
          balance: 'Cân bằng tồn kho',
          fifo: 'Cải thiện FIFO',
          inspection: 'Kiểm tra'
        },
        text: {
          good: 'Tỷ lệ hao hụt đang dưới ngưỡng 5% mục tiêu.',
          balance: 'Tỷ lệ tồn tốt trên 70%, kho đang ở trạng thái ổn.',
          fifo: 'Một số xuất không lấy từ lô cũ nhất. Nhắc nhân viên luôn chọn lô sớm nhất.',
          inspection: 'Tăng kiểm tra định kỳ cho các lô gần hết hạn hoặc thường xuyên hao hụt.'
        }
      }
    };

    if (currentLang === 'vi') {
      const translated = map.vi[field] && map.vi[field][key];
      if (translated) return translated;

      // Fallback translation by matching English text content
      const t = (text || '').toLowerCase();
      const patterns = [
        { match: 'inventory balance', title: 'Cân bằng tồn kho', text: 'Tỷ lệ tồn tốt trên 70%, kho đang ổn định.' },
        { match: 'good inventory ratio is above 70%', text: 'Tỷ lệ tồn tốt trên 70%, kho đang ổn định.' },
        { match: 'improve fifo usage', title: 'Cải thiện FIFO' },
        { match: 'some usage is not from the oldest batches', text: 'Một số xuất không lấy từ lô cũ nhất. Nhắc nhân viên luôn chọn lô sớm nhất.' },
        { match: 'inspection', title: 'Kiểm tra' },
        { match: 'increase routine checks', text: 'Tăng kiểm tra định kỳ cho các lô gần hết hạn hoặc hay hao hụt.' }
      ];
      for (const p of patterns) {
        if (t.includes(p.match)) {
          if (field === 'title' && p.title) return p.title;
          if (field === 'text' && p.text) return p.text;
        }
      }
    }

    return text || '';
  }

  function getRecommendIcon(type) {
    switch (type) {
      case "good": return "fa-solid fa-circle-check";
      case "note": return "fa-solid fa-triangle-exclamation";
      case "urgent": return "fa-solid fa-bolt";
      case "suggest": return "fa-solid fa-circle-info";
      default: return "fa-solid fa-info-circle";
    }
  }


  // ===========================================
  // INVENTORY OVERVIEW CHARTS (BAR + PIE)
  // ===========================================

  async function initInventoryCharts() {
    if (typeof Chart === 'undefined') return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/report/inventory-overview`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!json.success) return;

      const dist = json.data.distribution;
      const st = json.data.status;

      const barCanvas = document.getElementById('inventoryDistributionChart');
      if (barCanvas) {
        const ctxBar = barCanvas.getContext('2d');
        if (barChart) barChart.destroy();
        barChart = new Chart(ctxBar, {
          type: 'bar',
          data: {
            labels: dist.labels,
            datasets: [{
              label: 'Units',
              data: dist.values,
              backgroundColor: '#3B82F6',
              borderRadius: 10,
              maxBarThickness: 36
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
          }
        });
      }

      const pieCanvas = document.getElementById('inventoryStatusChart');
      if (pieCanvas) {
        const ctxPie = pieCanvas.getContext('2d');
        if (pieChart) pieChart.destroy();
        pieChart = new Chart(ctxPie, {
          type: 'doughnut',
          data: {
            labels: ['Critical', 'Low', 'Good'],
            datasets: [{
              data: [st.critical, st.low, st.good],
              backgroundColor: ['#DC2626', '#F59E0B', '#16A34A'],
              borderColor: '#fff',
              cutout: '30%'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
          }
        });
      }
       // ----- CẬP NHẬT LEGEND TEXT THEO DB -----
    const totalLots = st.critical + st.low + st.good || 0;
    const pc = v => totalLots ? Math.round((v * 100) / totalLots) : 0;

    const crtText = document.getElementById('legendCriticalText');
    const lowText = document.getElementById('legendLowText');
    const goodText = document.getElementById('legendGoodText');

    if (crtText)  crtText.textContent  = `Critical: ${st.critical} (${pc(st.critical)}%)`;
    if (lowText)  lowText.textContent  = `Low: ${st.low} (${pc(st.low)}%)`;
    if (goodText) goodText.textContent = `Good: ${st.good} (${pc(st.good)}%)`;
    } catch (err) {
      console.error('initInventoryCharts error:', err);
    }
  }


  // ===========================================
  // INVENTORY DETAIL TABLE – call API
  // ===========================================

  async function loadInventoryDetail() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/report/inventory-detail`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!json.success) return;

      // API may return data under various keys; normalize to an array
      const payload = json.data || {};
      const incoming = Array.isArray(payload.detail)
        ? payload.detail
        : (Array.isArray(json.items) ? json.items : null);

      if (incoming) {
        detailCache = incoming;
      }

      applyInventoryDetail(detailCache || []);
    } catch (err) {
      console.error('loadInventoryDetail error:', err);
    }
  }

  function applyInventoryDetail(items) {
    const tbody = document.getElementById('detailTableBody');
    if (!tbody || !items) return;

    const lang = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function')
      ? window.GlobalLanguage.getLanguage()
      : (localStorage.getItem('app_language_admin') || 'en');

    tbody.innerHTML = '';
    const start = (detailPage - 1) * detailPageSize;
    const end = start + detailPageSize;
    const pageItems = items.slice(start, end);

    pageItems.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${start + idx + 1}</td>
        <td>${item.ingredient_name}</td>
        <td>${item.current_stock}</td>
        <td>${item.unit}</td>
        <td>${item.lot_count}</td>
        <td><span class="status ${item.status_level}">${item.status_text}</span></td>
      `;
      tbody.appendChild(tr);
    });

    updateDetailPagination(items.length);
  }

  function updateDetailPagination(total) {
    const pageInfo = document.getElementById('detailPageInfo');
    const prevBtn = document.getElementById('detailPrev');
    const nextBtn = document.getElementById('detailNext');
    const totalPages = Math.max(1, Math.ceil(total / detailPageSize));
    detailPage = Math.min(detailPage, totalPages);

    if (pageInfo) pageInfo.textContent = `${detailPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = detailPage <= 1;
    if (nextBtn) nextBtn.disabled = detailPage >= totalPages;
  }


  // ===========================================
  // REPORTING CENTER: Tabs + INIT
  // ===========================================

  function initInventoryTabs() {
    const tabs = document.querySelectorAll('.inventory-tab');
    const panels = document.querySelectorAll('.inventory-tab-panel');
    if (!tabs.length || !panels.length) return;

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-target');

        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(targetId).classList.add('active');

        if (targetId === "tab-detail") loadInventoryDetail();
        if (targetId === "tab-trend") loadTrendData();
        if (targetId === "tab-analysis") loadAnalysisData();
      });
    });

    // Pagination controls
    const prevBtn = document.getElementById('detailPrev');
    const nextBtn = document.getElementById('detailNext');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (detailPage > 1) {
          detailPage -= 1;
          applyInventoryDetail(detailCache || []);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil((detailCache || []).length / detailPageSize));
        if (detailPage < totalPages) {
          detailPage += 1;
          applyInventoryDetail(detailCache || []);
        }
      });
    }
  }

  function initReportingCenter() {
    const inventoryReport = document.querySelector('.inventory-report');
    if (!inventoryReport) return;

    initInventoryTabs();
    initInventoryCharts();
    initDetailExport();
  }

  function init() {
    filterTable();
    initReportingCenter();
    loadSummaryCards();
    loadInventoryKpi();
    detailPage = 1;
    loadInventoryDetail();
    loadTrendData();
    loadAnalysisData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
