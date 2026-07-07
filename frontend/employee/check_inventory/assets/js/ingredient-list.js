document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = window.API_BASE || `${location.origin}/api`;
  const selectedLotCode = localStorage.getItem('selectedLot');
  const tableBody = document.getElementById('ingredientBody');
  const alertBox = document.querySelector('.alert-box');
  const searchInput = document.getElementById('searchInput');
  const statusSelect = document.getElementById('statusFilter');
  const pageInfo = document.getElementById('pageInfo');
  const btnPrev = document.getElementById('pagePrev');
  const btnNext = document.getElementById('pageNext');

  const PAGE_SIZE = 10;
  let ingredientData = [];
  let filteredData = [];
  let currentPage = 1;
  let currentSearch = '';
  let currentStatus = '';
  let sortOrder = 'asc'; // for product name

  function formatDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date)) return dateString || '';
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function updateBreadcrumb(lotCode) {
    const lotCodeElement = document.getElementById('lotCodeBreadcrumb');
    if (lotCodeElement && lotCode) lotCodeElement.textContent = lotCode;
  }

  if (selectedLotCode) updateBreadcrumb(selectedLotCode);

  function buildRow(item) {
    let status = item.status;
    let icon = '';
    let statusClass = '';
    let statusKey = '';
    if (status === 'In Stock') { icon = '<i class="fa-solid fa-check-circle"></i>'; statusClass = 'good'; statusKey = 'in stock'; }
    else if (status === 'LowStock') { icon = '<i class="fa-solid fa-exclamation-triangle"></i>'; statusClass = 'low'; statusKey = 'lowstock'; }
    else if (status === 'Expired') { icon = '<i class="fa-solid fa-times-circle"></i>'; statusClass = 'expired'; statusKey = 'expired'; }
    else if (status === 'NearExpiry') { icon = '<i class="fa-solid fa-clock"></i>'; statusClass = 'nearly-expired'; statusKey = 'nearexpiry'; }

    const isVi = window.GlobalLanguage?.getLanguage?.() === 'vi';
    const labelByKey = (k) => {
      if (k === 'in stock') return isVi ? 'Còn hàng' : 'In stock';
      if (k === 'lowstock') return isVi ? 'Sắp hết hàng' : 'Low stock';
      if (k === 'expired') return isVi ? 'Hết hạn' : 'Expired';
      if (k === 'nearexpiry') return isVi ? 'Sắp hết hạn' : 'Near expiry';
      return status;
    };

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.lot_code}</td>
      <td>${item.ingredient_name}</td>
      <td>${formatQuantityDisplay(item.quantity)}</td>
      <td>${formatQuantityDisplay(item.quantity_left ?? 'N/A')}</td>
      <td>${item.unit}</td>
      <td>${formatDate(item.manufacture_date)}</td>
      <td>${formatDate(item.expiry_date)}</td>
      <td><span class="status ${statusClass}" data-status="${statusKey}">${icon} ${labelByKey(statusKey)}</span></td>
    `;
    return tr;
  }

  function updateAlertCounts(data) {
    if (!alertBox) return;
    let lowStockCount = 0, nearExpiryCount = 0, expiredCount = 0;
    data.forEach(item => {
      const status = item.status;
      if (status === 'LowStock') lowStockCount++;
      else if (status === 'Expired') expiredCount++;
      else if (status === 'NearExpiry') nearExpiryCount++;
    });
    const isVi = window.GlobalLanguage?.getLanguage?.() === 'vi';
    alertBox.innerHTML = isVi
      ? `⚠️ Cảnh báo: ${nearExpiryCount} nguyên liệu sắp hết hạn, ${lowStockCount} nguyên liệu sắp hết hàng và ${expiredCount} nguyên liệu đã hết hạn!`
      : `⚠️ Warning: ${nearExpiryCount} ingredients are about to expire, ${lowStockCount} ingredients are low in quantity, and ${expiredCount} ingredients have expired!`;
  }

  function applyFiltersAndRender(resetPage = false) {
    filteredData = ingredientData.filter(item => {
      const text = `${item.lot_code} ${item.ingredient_name}`.toLowerCase();
      if (currentSearch && !text.includes(currentSearch)) return false;
      if (currentStatus) {
        const key = (item.status || '').toLowerCase();
        if (!key.includes(currentStatus)) return false;
      }
      return true;
    });

    // sort by product name
    filteredData.sort((a, b) => {
      const aVal = (a.ingredient_name || '').toLowerCase();
      const bVal = (b.ingredient_name || '').toLowerCase();
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    if (resetPage) currentPage = 1;
    renderPage(currentPage);
  }

  function renderPage(page) {
    const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(page, 1), totalPages);
    tableBody.innerHTML = '';

    if (!filteredData.length) {
      tableBody.innerHTML = '<tr><td colspan="8">No ingredients found.</td></tr>';
      updatePagination(totalPages);
      return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredData.slice(start, start + PAGE_SIZE);
    pageItems.forEach(item => tableBody.appendChild(buildRow(item)));
    updatePagination(totalPages);
    window.GlobalLanguage?.applyLanguage?.(window.GlobalLanguage.getLanguage?.());
  }

  function updatePagination(totalPages) {
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= totalPages;
  }

async function refreshTable() {
  tableBody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';

  if (!selectedLotCode) {
    tableBody.innerHTML = '<tr><td colspan="8">No lot selected. Please go back.</td></tr>';
    return;
  }

  const token = sessionStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    // ✅ 1) luôn fetch toàn bộ inventory
    const res = await fetch(`${API_BASE}/inventory`, { headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);

    // ✅ 2) normalize dạng array
    const all = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);

    // ✅ 3) lọc theo base lot code
    const lotItems = all.filter(x => String(x.lot_code || '').startsWith(selectedLotCode));

    ingredientData = lotItems;
    updateAlertCounts(ingredientData);
    applyFiltersAndRender(true);

  } catch (error) {
    console.error('Error fetching inventory:', error);
    tableBody.innerHTML = `<tr><td colspan="8">Cannot load lot data. ${error.message}</td></tr>`;
  }
}


  // initial load
  refreshTable();

  // search
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentSearch = searchInput.value.toLowerCase();
      applyFiltersAndRender(true);
    });
  }

  // filter status
  document.getElementById('filterSubmit')?.addEventListener('click', () => {
    currentStatus = (statusSelect?.value || '').toLowerCase();
    document.querySelector('.filter-dropdown').style.display = 'none';
    applyFiltersAndRender(true);
  });

  // sort by product name
  document.getElementById('btnSort')?.addEventListener('click', () => {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    applyFiltersAndRender(false);
  });

  // pagination controls
  btnPrev?.addEventListener('click', () => renderPage(currentPage - 1));
  btnNext?.addEventListener('click', () => renderPage(currentPage + 1));

  function formatQuantityDisplay(val) {
    const num = parseFloat(val);
    if (!Number.isFinite(num)) return val || "0";
    return num.toFixed(2).replace(/\.0+$/, '').replace(/\.$/, '');
  }

  // Refresh and Back
  document.getElementById("btnRefresh")?.addEventListener("click", refreshTable);
  document.getElementById("btnBack")?.addEventListener("click", () => window.location.href = "lot-list.html");

  // Filter dropdown toggle
  document.getElementById('btnFilter')?.addEventListener('click', () => {
    const filterDropdown = document.querySelector('.filter-dropdown');
    filterDropdown.style.display = filterDropdown.style.display === 'block' ? 'none' : 'block';
  });
});
