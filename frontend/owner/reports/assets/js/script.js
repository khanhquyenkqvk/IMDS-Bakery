const API_BASE = window.API_BASE_URL || location.origin;
const RESTOCK_PAGE_SIZE = 6;
let restockLogData = [];
let restockCurrentPage = 1;

document.addEventListener('DOMContentLoaded', () => {
  function getOwnerId() {
  try {
    const info = JSON.parse(sessionStorage.getItem('user_info') || '{}');
    return info.user_id || info.id || info.owner_id || info.userId || null;
  } catch { return null; }
}

function getAuthHeaders() {
  const token = sessionStorage.getItem('auth_token');
  const ownerId = getOwnerId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(ownerId ? { 'X-User-Id': String(ownerId) } : {}),
  };
}

  // Header helpers
  const formatHeaderDate = (d) => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
  };
  const formatHeaderTime = (d) => {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
  };
  const updateHeaderTime = () => {
    const now = new Date();
    const elDate = document.getElementById('currentDate');
    const elTime = document.getElementById('currentTime');
    if (elDate) elDate.textContent = formatHeaderDate(now);
    if (elTime) elTime.textContent = formatHeaderTime(now);
  };
  const updateUserInfo = () => {
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
      const userNameEl = document.querySelector('.user-name');
      if (userInfo && userInfo.username && userNameEl) {
        userNameEl.textContent = userInfo.username;
      }
    } catch (err) {
      console.warn('Could not parse user_info', err);
    }
  };
    const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const formatRangeLabel = (startStr, endStr) => {
    if (!startStr || !endStr) return '';
    const s = new Date(startStr);
    const e = new Date(endStr);
    const sLabel = `${monthShort[s.getMonth()]} ${String(s.getDate()).padStart(2,'0')}`;
    const eLabel = `${monthShort[e.getMonth()]} ${String(e.getDate()).padStart(2,'0')}, ${e.getFullYear()}`;
    return `${sLabel} - ${eLabel}`;
  };

  const formatMonthLabel = (startStr) => {
    if (!startStr) return '';
    const d = new Date(startStr);
    return `${monthShort[d.getMonth()]} ${d.getFullYear()}`;
  };
  // Export buttons in modals
  const restockExportBtn = document.querySelector('#restockModal .btn-export');
  if (restockExportBtn) {
    restockExportBtn.addEventListener('click', () => {
      window.location.href = `${API_BASE}/api/owner/reports/restock-frequency/export`;
    });
  }

  const inventoryExportBtn = document.querySelector('#activeModal .btn-export');
  if (inventoryExportBtn) {
    inventoryExportBtn.addEventListener('click', () => {
      window.location.href = `${API_BASE}/api/owner/reports/inventory-analysis/export`;
    });
  }

  const wasteExportBtn = document.querySelector('#wasteModal .btn-export');
  if (wasteExportBtn) {
    wasteExportBtn.addEventListener('click', () => {
      window.location.href = `${API_BASE}/api/owner/reports/waste-summary/export`;
    });
  }
const btnViewWasteActions = document.getElementById('btnViewWasteActions');
  if (btnViewWasteActions) {
    btnViewWasteActions.addEventListener('click', (e) => {
      e.preventDefault();
      toggleModal('wasteModal', true);
    });
  }


async function loadOverview() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/reports/overview` , { headers: getAuthHeaders() });
    const json = await res.json();
    if (!json.success) return;
    const d = json.data;

    const restockValue = document.querySelector('#restockCard .kpi-value');
    const activeValue = document.querySelector('#activeCard .kpi-value');
    const wasteValue   = document.querySelector('#wasteCard .kpi-value');

    if (restockValue) restockValue.textContent = d.total_restock_events ?? 0;
    if (activeValue) activeValue.textContent   = d.active_ingredients ?? 0;
    if (wasteValue)  wasteValue.textContent    = `${(d.waste_rate_percent ?? 0).toFixed(1)}%`;
  } catch (err) {
    console.error('Overview error', err);
  }
}
function updateReportMeta() {
  const now = new Date();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const label = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  const restockMeta   = document.getElementById('restockMeta');
  const inventoryMeta = document.getElementById('inventoryMeta');
  const productionMeta= document.getElementById('productionMeta');
  const wasteMeta     = document.getElementById('wasteMeta');

  if (restockMeta)   restockMeta.textContent   = `${label} | PDF`;
  if (inventoryMeta) inventoryMeta.textContent = `${label} | Excel`;
  if (productionMeta)productionMeta.textContent= `${label} | PDF`;
  if (wasteMeta)     wasteMeta.textContent     = `${label} | PDF`;
}
function renderRestockLogPage() {
  const tbody = document.querySelector('#restockModal .restock-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const totalItems = restockLogData.length;
  if (!totalItems) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="7" style="text-align:center; padding:8px 0;">
        No restock data in this period.
      </td>`;
    tbody.appendChild(tr);

    const pager = document.getElementById('restockPagination');
    if (pager) pager.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(totalItems / RESTOCK_PAGE_SIZE);
  if (restockCurrentPage > totalPages) restockCurrentPage = totalPages;
  if (restockCurrentPage < 1) restockCurrentPage = 1;

  const start = (restockCurrentPage - 1) * RESTOCK_PAGE_SIZE;
  const end = start + RESTOCK_PAGE_SIZE;
  const pageItems = restockLogData.slice(start, end);

  pageItems.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.ingredient_name}</strong></td>
      <td><span class="pill pill-green">${item.frequency >= 8 ? 'High (Weekly)' : 'Medium'}</span></td>
      <td>${item.avg_quantity ?? 0} ${item.unit || ''}</td>
      <td>${item.last_restock || '-'}</td>
      <td>${item.next_expected || '-'}</td>
      <td>
        <div class="trend-wrapper ${item.trend.toLowerCase()}">
          <i class="fa-solid ${
            item.trend === 'Rising'
              ? 'fa-arrow-up'
              : item.trend === 'Falling'
              ? 'fa-arrow-down'
              : 'fa-minus'
          }"></i>
          <span>${item.trend}</span>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  // cập nhật thanh phân trang
  const pager = document.getElementById('restockPagination');
  if (pager) {
    pager.style.display = totalPages > 1 ? 'flex' : 'none';

    const info = document.getElementById('restockPageInfo');
    if (info) info.textContent = `${restockCurrentPage} / ${totalPages}`;

    const prevBtn = document.getElementById('restockPrev');
    const nextBtn = document.getElementById('restockNext');
    if (prevBtn) prevBtn.disabled = restockCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = restockCurrentPage === totalPages;
  }
}

async function loadRestockModal() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/reports/restock-frequency`, { headers: getAuthHeaders() });
    const json = await res.json();
    if (!json.success) return;
    const d = json.data;

    // Period chip
    const periodEl = document.getElementById('restockPeriod');
    if (periodEl && d.period) {
      periodEl.textContent = formatRangeLabel(d.period.start_date, d.period.end_date);
    }

    // ====== SUMMARY CARDS ======
    const avgEl      = document.querySelector('#restockModal .metric-card--blue .metric-value');
    const avgNoteEl  = document.querySelector('#restockModal .metric-card--blue .metric-note');
    const mostValEl  = document.querySelector('#restockModal .metric-card--orange .metric-value');
    const mostNoteEl = document.querySelector('#restockModal .metric-card--orange .metric-note');
    const relEl      = document.querySelector('#restockModal .metric-card--green .metric-value');
    const relBar     = document.querySelector('#restockModal .metric-card--green .metric-bar span');

    const summary = d.summary || {};

    // 1) Avg. restock frequency
    const currAvg = summary.avg_restock_frequency_days ?? 0;
    if (avgEl) {
      avgEl.innerHTML = `${currAvg} <span>days</span>`;
    }

    if (avgNoteEl) {
      const prevAvg = summary.prev_avg_restock_frequency_days;
      const diff    = summary.avg_freq_diff_days;
      const label   = summary.prev_period_label || 'previous period';

      if (typeof prevAvg === 'number' && prevAvg > 0 && typeof diff === 'number') {
        const absDiff = Math.abs(diff).toFixed(1);
        let iconClass = 'fa-minus';
        let textPart  = 'same as';

        // diff > 0 nghĩa là hiện tại NHANH hơn (số ngày giữa 2 lần nhập giảm)
        if (diff > 0) {
          iconClass = 'fa-arrow-down';
          textPart  = 'faster than';
        } else if (diff < 0) {
          iconClass = 'fa-arrow-up';
          textPart  = 'slower than';
        }

        avgNoteEl.innerHTML =
          `<i class="fa-solid ${iconClass}"></i> ${absDiff} days ${textPart} ${label}`;
      } else {
        avgNoteEl.textContent = 'No previous period data for comparison';
      }
    }

    // 2) Most frequent item
    if (summary.most_frequent_item) {
      const mf = summary.most_frequent_item;
      if (mostValEl) {
        mostValEl.textContent = mf.ingredient_name;
      }
      if (mostNoteEl) {
        const times = mf.restock_times ?? 0;
        mostNoteEl.textContent = `Restocked ${times} times in this period`;
      }
    } else {
      if (mostValEl) mostValEl.textContent = 'No data';
      if (mostNoteEl) mostNoteEl.textContent = 'No restock activity in this period';
    }

    // 3) Supplier reliability
    const rel = summary.supplier_reliability_percent ?? 0;
    if (relEl)  relEl.textContent  = `${rel}%`;
    if (relBar) relBar.style.width = `${rel}%`;

    // ====== Restock log + pagination (giữ nguyên phần sau của bạn) ======
    restockLogData = Array.isArray(d.log) ? d.log : [];
    restockCurrentPage = 1;
    renderRestockLogPage();
  } catch (err) {
    console.error('Restock modal error', err);
  }
}


async function loadInventoryModal() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/reports/inventory-analysis`, { headers: getAuthHeaders() });
    const json = await res.json();
    if (!json.success) return;
    const d = json.data;

    // Summary cards
    const valEls = document.querySelectorAll('#activeModal .summary-card .summary-value');
    if (valEls.length >= 6) {
      valEls[0].textContent = d.summary.total_items;
      valEls[1].textContent = d.summary.active;
      valEls[2].textContent = d.summary.low_stock;
      valEls[3].textContent = d.summary.expired;
      valEls[4].innerHTML   = `${d.summary.avg_turnover_days}<span> days</span>`;
      valEls[5].textContent = `${d.summary.waste_rate_percent}%`;
    }

    // Top used ingredients – 2 dòng
    const topItems = d.top_used || [];
    const topEls = document.querySelectorAll('#activeModal .top-item');
    topItems.slice(0, topEls.length).forEach((it, idx) => {
      const el = topEls[idx];
      el.querySelector('.top-name').textContent = `${it.rank}. ${it.name}`;
      const barSpan = el.querySelector('.top-bar span');
      if (barSpan) barSpan.style.width = `${it.usage_index}%`;
    });
            // Stock Movement (Last 5 Months) – dùng d.movement
    const move = d.movement || [];
    const mvEl = document.getElementById('stockMovementChart');
    if (mvEl) {
      mvEl.innerHTML = '';

      if (!move.length) {
        mvEl.innerHTML = '<div class="chart-empty">No movement data in selected period.</div>';
      } else {
        let maxVal = 0;
        move.forEach(m => {
          maxVal = Math.max(maxVal, m.incoming || 0, m.outgoing || 0, m.waste || 0);
        });
        if (!maxVal) maxVal = 1;

        move.forEach(m => {
          const group = document.createElement('div');
          group.className = 'bar-group';

          const stack = document.createElement('div');
          stack.className = 'bar-stack';

          const barIn = document.createElement('div');
          barIn.className = 'bar incoming';
          barIn.style.height = `${(m.incoming / maxVal) * 90 || 4}px`;

          const barOut = document.createElement('div');
          barOut.className = 'bar outgoing';
          barOut.style.height = `${(m.outgoing / maxVal) * 90 || 4}px`;

          const barWaste = document.createElement('div');
          barWaste.className = 'bar waste';
          barWaste.style.height = `${(m.waste / maxVal) * 90 || 4}px`;

          stack.appendChild(barIn);
          stack.appendChild(barOut);
          stack.appendChild(barWaste);

          const values = document.createElement('div');
          values.className = 'bar-values';
          values.innerHTML = `
            <span>${m.incoming}</span>
            <span>${m.outgoing}</span>
            <span>${m.waste}</span>
          `;

          const label = document.createElement('div');
          label.className = 'bar-label';
          const [year, month] = m.label.split('-');
          label.textContent = monthShort[parseInt(month, 10) - 1];

          group.appendChild(stack);
          group.appendChild(values);
          group.appendChild(label);
          mvEl.appendChild(group);
        });
      }
    }



    // Expiry risk alert
    const alertCard = document.querySelector('#activeModal .alert-card');
    if (alertCard && d.expiry_risk) {
      alertCard.querySelector('.alert-item').textContent =
        `${d.expiry_risk.ingredient_name} — Batch ${d.expiry_risk.batch_code}`;
      const pill = alertCard.querySelector('.pill');
      if (pill) pill.textContent = `${d.expiry_risk.days_left} Days Left`;
    }
  } catch (err) {
    console.error('Inventory modal error', err);
  }
}
async function loadTopMovingIngredientsPanel() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/reports/inventory-analysis`, { headers: getAuthHeaders() });
    const json = await res.json();
    if (!json.success) return;
    const d = json.data;

    const menuChart = document.getElementById('menuTrendChart');
    if (!menuChart) return;

    menuChart.innerHTML = '';
    (d.top_used || []).forEach(it => {
      const row = document.createElement('div');
      row.className = 'menu-trend-row';

      const label = document.createElement('div');
      label.className = 'menu-trend-label';
      label.textContent = `${it.rank}. ${it.name}`;

      const barWrap = document.createElement('div');
      barWrap.className = 'menu-trend-bar';
      const barSpan = document.createElement('span');
      barSpan.style.width = `${it.usage_index || 0}%`;
      barWrap.appendChild(barSpan);

      const value = document.createElement('div');
      value.className = 'menu-trend-value';
      // Nếu BE chưa trả total_qty / share_percent thì đổi thành it.usage_index
      value.textContent = `${it.usage_index || 0}%`;

      row.appendChild(label);
      row.appendChild(barWrap);
      row.appendChild(value);
      menuChart.appendChild(row);
    });
  } catch (err) {
    console.error('Top moving ingredients panel error', err);
  }
}

async function loadInboundTrendPanel() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/reports/restock-frequency`, { headers: getAuthHeaders() });
    const json = await res.json();
    if (!json.success) return;
    const trend = json.data.trend || [];
    const chart = document.getElementById('importTrendChart');
    if (!chart) return;

    chart.innerHTML = '';
    if (!trend.length) {
      chart.innerHTML = '<div class="chart-empty">No import activity in the last 6 months.</div>';
      return;
    }

    const maxQty = Math.max(...trend.map(t => t.total_qty || 0)) || 1;
    const monthNamesShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    trend.forEach(item => {
      const wrap = document.createElement('div');
      wrap.className = 'chart-month';

      const bar = document.createElement('div');
      bar.className = 'chart-month-bar';
      const h = (item.total_qty / maxQty) * 80;
      bar.style.height = `${h + 20}px`;

      const label = document.createElement('div');
      label.className = 'chart-month-label';
      const [year, month] = item.label.split('-');
      label.textContent = monthNamesShort[parseInt(month, 10) - 1];

      const sub = document.createElement('div');
      sub.className = 'chart-month-sub';
      sub.textContent = `${item.imports} events • ${item.ingredient_count} items`;

      const val = document.createElement('div');
      val.className = 'chart-month-value';
      val.textContent = `${item.total_qty} kg`;

      wrap.appendChild(bar);
      wrap.appendChild(label);
      wrap.appendChild(sub);
      wrap.appendChild(val);
      chart.appendChild(wrap);
    });
  } catch (err) {
    console.error('Inbound trend panel error', err);
  }
}

async function loadProductionModal() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/reports/production-summary`, { headers: getAuthHeaders() });
    const json = await res.json();
    if (!json.success) return;
    const d = json.data;

    // Period label
    const periodEl = document.getElementById('productionPeriod');
    if (periodEl && d.period) {
      periodEl.textContent = formatRangeLabel(d.period.start_date, d.period.end_date);
    }

    // Summary
    document.getElementById('prodTotalUsed').textContent =
      d.summary.total_used_qty ?? 0;
    document.getElementById('prodTotalWaste').textContent =
      d.summary.total_waste_qty ?? 0;
    document.getElementById('prodAvgDaily').innerHTML =
      `${d.summary.avg_daily_usage ?? 0} <span>units/day</span>`;
    document.getElementById('prodWasteRate').textContent =
      `${d.summary.production_waste_rate ?? 0}%`;

        // Daily chart
        // Daily chart
    const chartEl = document.getElementById('productionDailyChart');
    const daily = d.daily || [];
    if (chartEl && daily.length) {
      chartEl.innerHTML = '';
      let maxVal = 0;
      daily.forEach(it => {
        maxVal = Math.max(maxVal, it.used_qty || 0, it.waste_qty || 0);
      });
      if (!maxVal) maxVal = 1;

      daily.forEach(it => {
        const group = document.createElement('div');
        group.className = 'bar-group';

        const stack = document.createElement('div');
        stack.className = 'bar-stack';

        const barUse = document.createElement('div');
        barUse.className = 'bar incoming';
        barUse.style.height = `${(it.used_qty / maxVal) * 90 || 4}px`;

        const barWaste = document.createElement('div');
        barWaste.className = 'bar waste';
        barWaste.style.height = `${(it.waste_qty / maxVal) * 90 || 4}px`;

        stack.appendChild(barUse);
        stack.appendChild(barWaste);

        const values = document.createElement('div');
        values.className = 'bar-values';
        values.innerHTML = `
          <span>${it.used_qty}</span>
          <span>${it.waste_qty}</span>
        `;

        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = it.date;

        group.appendChild(stack);
        group.appendChild(values);
        group.appendChild(label);
        chartEl.appendChild(group);
      });
    }


    // Top used ingredients list
    const topList = document.getElementById('productionTopList');
    if (topList) {
      topList.innerHTML = '';
      (d.top_used || []).forEach(it => {
        const item = document.createElement('div');
        item.className = 'top-item';
        item.innerHTML = `
          <div class="top-name">${it.rank}. ${it.name}</div>
          <div class="top-row">
            <div class="top-bar"><span style="width:${it.usage_index || 0}%;"></span></div>
          </div>
        `;
        topList.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Production modal error', err);
  }
}

async function loadWasteModal() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/reports/waste-summary`, { headers: getAuthHeaders() });
    if (!res.ok) {
      console.error('waste-summary HTTP error', res.status);
      // hiển thị fallback period là tháng hiện tại
      const periodEl = document.getElementById('wastePeriod');
      if (periodEl) {
        const now = new Date();
        periodEl.textContent = `${monthShort[now.getMonth()]} ${now.getFullYear()}`;
      }
      return;
    }

    const json = await res.json();
    if (!json.success) {
      console.error('waste-summary API error', json.error);
      const breakdownEl = document.getElementById('wasteBreakdownSummary');
      if (breakdownEl) breakdownEl.textContent = 'Cannot load waste data.';
      return;
    }

    const d = json.data;

    // ===== PERIOD CHIP =====
    const periodEl = document.getElementById('wastePeriod');
    if (periodEl) {
      if (d.period && d.period.start_date) {
        // ví dụ: "Nov 2025"
        periodEl.textContent = formatMonthLabel(d.period.start_date);
      } else {
        const now = new Date();
        periodEl.textContent = `${monthShort[now.getMonth()]} ${now.getFullYear()}`;
      }
    }

    // ===== SUMMARY CARDS =====
    const summaryCards = document.querySelectorAll('#wasteModal .summary-card');
    if (summaryCards.length >= 4) {
      summaryCards[0].querySelector('.summary-value').innerHTML =
        `${d.summary.total_waste_kg} <span>kg</span>`;
      summaryCards[1].querySelector('.summary-value').textContent =
        `${d.summary.waste_rate_percent}%`;
      summaryCards[2].querySelector('.summary-value').textContent =
        d.summary.top_cause || '-';
      summaryCards[3].querySelector('.summary-value').innerHTML =
        `${d.summary.rescued_kg} <span>kg</span>`;
    }

    // ===== WASTE BREAKDOWN BY REASON =====
    const breakdownEl = document.getElementById('wasteBreakdownSummary');
    if (breakdownEl) {
      const total = d.summary.total_waste_kg;
      const parts = (d.breakdown || []).map(
        b => `${b.reason} (${b.percent}%)`
      );
      if (!parts.length) {
        breakdownEl.textContent = 'No waste records in this period.';
      } else {
        breakdownEl.innerHTML =
          `Total ${total} kg<br><small>${parts.join(' • ')}</small>`;
      }
    }

    // ===== HIGHEST WASTE CATEGORIES =====
    const catList = document.getElementById('wasteCategoriesList');
    if (catList) {
      catList.innerHTML = '';
      const categories = d.categories || [];
      if (!categories.length) {
        catList.innerHTML =
          '<div class="chart-empty">No category data in this period.</div>';
      } else {
        const totalCatKg = categories.reduce(
          (acc, c) => acc + (c.kg || 0),
          0
        );
        categories.forEach(cat => {
          const pct = totalCatKg ? Math.round((cat.kg / totalCatKg) * 100) : 0;
          const row = document.createElement('div');
          row.className = 'waste-category';
          row.innerHTML = `
            <div class="top-name">${cat.category}</div>
            <div class="waste-row">
              <div class="top-bar"><span style="width:${pct}%;"></span></div>
              <div class="top-change up">${cat.kg} kg</div>
            </div>
            <div class="cat-meta">${pct}% of total waste</div>
          `;
          catList.appendChild(row);
        });
      }
    }

    // ===== CRITICAL ALERT =====
    const alertCard = document.querySelector('#wasteModal .alert-card');
    if (alertCard) {
      const alertItem = alertCard.querySelector('.alert-item');
      if (d.critical_alert && d.critical_alert.message) {
        alertItem.textContent = d.critical_alert.message;
        alertCard.style.display = 'block';
      } else {
        alertCard.style.display = 'none';
      }
    }

    // ===== TOP WASTED INGREDIENTS LOG =====
    const tableWrap = document.querySelector('#wasteModal .modal-table');
    if (tableWrap) {
      const head = tableWrap.querySelector('.table-head');
      // xóa các dòng demo cũ
      tableWrap.querySelectorAll('.table-row').forEach(r => r.remove());

      const list = d.top_wasted || [];
      if (!list.length) {
        const emptyRow = document.createElement('div');
        emptyRow.className = 'table-row';
        emptyRow.innerHTML =
          '<div colspan="5">No waste log entries for this period.</div>';
        tableWrap.appendChild(emptyRow);
      } else {
        list.forEach(item => {
          let pillClass = 'pill-red';
          const rt = (item.reason_type || '').toLowerCase();
          if (rt.includes('spoil')) pillClass = 'pill-orange';
          else if (rt.includes('production')) pillClass = 'pill-blue';
          else if (rt.includes('other')) pillClass = 'pill-amber';

          const row = document.createElement('div');
          row.className = 'table-row';
          row.innerHTML = `
            <div><strong>${item.ingredient_name}</strong></div>
            <div class="qty-loss">${item.quantity} ${item.unit}</div>
            <div><span class="pill ${pillClass}">${item.reason}</span></div>
            <div>${item.report_date}</div>
            <div class="status status-disposed">${item.status}</div>
          `;
          tableWrap.appendChild(row);
        });
      }

      // đảm bảo table-head luôn ở trên cùng
      if (head && head !== tableWrap.firstChild) {
        tableWrap.insertBefore(head, tableWrap.firstChild);
      }
    }
  } catch (err) {
    console.error('Waste modal error', err);
    const breakdownEl = document.getElementById('wasteBreakdownSummary');
    if (breakdownEl) breakdownEl.textContent = 'Error loading waste report.';
  }
}




  // Sidebar navigation
  document.querySelectorAll('.sidebar .menu-item[data-href]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const href = btn.getAttribute('data-href');
      if (href && href !== '#') window.location.href = href;
    });
  });

  // Logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      sessionStorage.clear();
      localStorage.removeItem('bakery_credentials');
      window.location.href = '../../login/index.html';
    });
  }

  updateUserInfo();
  updateHeaderTime();
  updateReportMeta();
  loadOverview();
  loadInboundTrendPanel(); 
  loadTopMovingIngredientsPanel();  
  setInterval(updateHeaderTime, 60000);

  // Modal handling
  const modals = [
    { trigger: 'restockCard', modal: 'restockModal', close: 'restockClose' },
    { trigger: 'activeCard', modal: 'activeModal', close: 'activeClose' },
    { trigger: 'wasteCard', modal: 'wasteModal', close: 'wasteClose' },
    { trigger: 'productionTrigger', modal: 'productionModal', close: 'productionClose' },
  ];

  const hideAll = () => {
    modals.forEach(({ modal }) => {
      const m = document.getElementById(modal);
      if (m) {
        m.classList.remove('open');
        m.style.display = 'none';
        m.setAttribute('aria-hidden', 'true');
      }
    });
  };

  function toggleModal(id, show) {
    hideAll();
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.toggle('open', show);
    m.style.display = show ? 'flex' : 'none';
    m.setAttribute('aria-hidden', show ? 'false' : 'true');

    if (show) {
      if (id === 'restockModal') loadRestockModal();
      if (id === 'activeModal')  loadInventoryModal();
      if (id === 'wasteModal')   loadWasteModal();
      if (id === 'productionModal') loadProductionModal();
    }
  }



  modals.forEach(({ trigger, modal, close }) => {
    const t = document.getElementById(trigger);
    const m = document.getElementById(modal);
    const c = document.getElementById(close);

    if (t && m) {
      t.addEventListener('click', () => toggleModal(modal, true));
      t.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleModal(modal, true);
        }
      });
    }
    if (c) c.addEventListener('click', () => toggleModal(modal, false));
    m?.addEventListener('click', (e) => {
      if (e.target === m) toggleModal(modal, false);
    });
  });
  const restockPrevBtn = document.getElementById('restockPrev');
  const restockNextBtn = document.getElementById('restockNext');

  if (restockPrevBtn) {
    restockPrevBtn.addEventListener('click', () => {
      if (restockCurrentPage > 1) {
        restockCurrentPage--;
        renderRestockLogPage();
      }
    });
  }

  if (restockNextBtn) {
    restockNextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil((restockLogData.length || 0) / RESTOCK_PAGE_SIZE) || 1;
      if (restockCurrentPage < totalPages) {
        restockCurrentPage++;
        renderRestockLogPage();
      }
    });
  }

  hideAll();
  // View buttons trong "Available Reports"
  document.querySelectorAll('[data-modal-target]').forEach(btn => {
    const targetId = btn.getAttribute('data-modal-target');
    if (!targetId) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleModal(targetId, true);
    });
  });
  document.querySelectorAll('.avail-row .circle-btn[data-download]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-download');
      let url = null;
      if (type === 'restock') {
        url = `${API_BASE}/api/owner/reports/restock-frequency/export`;
      } else if (type === 'inventory') {
        url = `${API_BASE}/api/owner/reports/inventory-analysis/export`;
      } else if (type === 'waste') {
        url = `${API_BASE}/api/owner/reports/waste-summary/export`;
      }
      if (url) window.location.href = url;
    });
  });
  const prodExportBtn = document.querySelector('#productionModal .btn-export');
  if (prodExportBtn) {
    prodExportBtn.addEventListener('click', () => {
      window.location.href = `${API_BASE}/api/owner/reports/production-summary/export`;
    });
  }

  document.querySelectorAll('.avail-row .circle-btn[data-download]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-download');
      let url = null;
      if (type === 'restock') {
        url = `${API_BASE}/api/owner/reports/restock-frequency/export`;
      } else if (type === 'inventory') {
        url = `${API_BASE}/api/owner/reports/inventory-analysis/export`;
      } else if (type === 'waste') {
        url = `${API_BASE}/api/owner/reports/waste-summary/export`;
      } else if (type === 'production') {
        url = `${API_BASE}/api/owner/reports/production-summary/export`;
      }
      if (url) window.location.href = url;
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAll();
  });
});
