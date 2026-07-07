// Owner Inventory JavaScript

const API_BASE = window.API_BASE || '';

let inventoryData = [];
let filteredData = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let currentSearch = '';
let currentStatusFilter = 'all';
let currentSort = { field: 'expiry_date', direction: 'asc' };
let pendingDeleteId = null;
let advancedMode = false;

document.addEventListener('DOMContentLoaded', function () {
  initializeInventoryPage();
});
function getCurrentUserId() {
  try {
    const info = JSON.parse(sessionStorage.getItem('user_info') || '{}');
    return info.user_id || info.id || info.employee_id || null;
  } catch {
    return null;
  }
}
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };

  const token = sessionStorage.getItem('auth_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
    if (userInfo && (userInfo.user_id || userInfo.id)) {
      headers['X-User-Id'] = String(userInfo.user_id || userInfo.id);
    }
  } catch (e) {
    console.warn('Could not parse user_info', e);
  }

  return headers;
}

function initializeInventoryPage() {
  updateHeaderTime();
  setInterval(updateHeaderTime, 60000);

  updateUserInfo();
  initializeSidebarNavigation();
  initializeLogout();

  initializeInventoryUI();
}

// =========================
// Header time helpers
// =========================
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

// =========================
// User info
// =========================
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

// =========================
// Sidebar navigation
// =========================
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

// =========================
// Logout
// =========================
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
function applyAiImportDraftIfAny() {
  const raw = sessionStorage.getItem('ai_import_draft');
  if (!raw) return;

  let draft;
  try {
    draft = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid ai_import_draft', e);
    sessionStorage.removeItem('ai_import_draft');
    return;
  }

  // dùng 1 lần rồi xóa
  sessionStorage.removeItem('ai_import_draft');

  // Mở modal ở chế độ create
  openInventoryModal('create');

  const ingredientSelect = document.getElementById('ingredientSelect');
  const quantityInput = document.getElementById('quantityInput');
  const unitSelect = document.getElementById('unitSelect');
  const manuInput = document.getElementById('manufactureDateInput');
  const statusSelect = document.getElementById('statusSelect');
  const aiSugInput = document.getElementById('aiSuggestionId');

  if (aiSugInput && draft.suggestion_id) {
    aiSugInput.value = draft.suggestion_id;
  }

  if (ingredientSelect && draft.ingredient_id) {
    ingredientSelect.value = String(draft.ingredient_id);
    ingredientSelect.dispatchEvent(new Event('change')); // set unit + expiry
  }

  if (quantityInput && draft.quantity != null) {
    quantityInput.value = draft.quantity;
  }

  if (unitSelect && draft.unit) {
    const opt = Array.from(unitSelect.options).find(o => o.value === draft.unit);
    if (opt) {
      unitSelect.value = draft.unit;
    }
  }

  if (statusSelect) {
    statusSelect.value = 'Valid';
  }

  showToast(
    `Loaded AI suggestion for ${draft.ingredient_name || 'ingredient'}. Please review and save.`,
    'info'
  );
}



// =========================
// Inventory UI
// =========================
function initializeInventoryUI() {
  // Nút Add New Item
  const addBtn = document.querySelector('.add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      openInventoryModal('create');
    });
  }

  // Search
  const searchInput = document.getElementById('inventorySearch');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      currentSearch = this.value.toLowerCase();
      currentPage = 1;
      applyInventoryFilters();
    });
  }

  // Status filter
  const statusSelect = document.getElementById('statusFilter');
  if (statusSelect) {
    statusSelect.addEventListener('change', function () {
      currentStatusFilter = this.value;
      currentPage = 1;
      applyInventoryFilters();
    });
  }
 // Nút lọc nâng cao (phễu): chỉ hiện batch "nguy hiểm"
  const btnFilterAdvanced = document.getElementById('btnFilterAdvanced');
  if (btnFilterAdvanced) {
    btnFilterAdvanced.addEventListener('click', function () {
      advancedMode = !advancedMode;
      this.classList.toggle('active', advancedMode);
      currentPage = 1;
      applyInventoryFilters();
    });
  }
  // Sort by expiry date
  const btnSortExpiry = document.getElementById('btnSortExpiry');
  if (btnSortExpiry) {
    btnSortExpiry.addEventListener('click', function () {
      currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      currentPage = 1;
      applyInventoryFilters();
    });
  }
  document.getElementById('pagePrev')?.addEventListener('click', () => renderInventoryTable(currentPage - 1));
  document.getElementById('pageNext')?.addEventListener('click', () => renderInventoryTable(currentPage + 1));

  // Table actions (edit / view / delete)
  const tbody = document.getElementById('inventoryTableBody');
  if (tbody) {
    tbody.addEventListener('click', function (e) {
      const actionIcon = e.target;
      const row = actionIcon.closest('tr');
      if (!row) return;
      const batchId = row.getAttribute('data-id');
      if (!batchId) return;

      if (actionIcon.dataset.action === 'edit') {
        const item = inventoryData.find(it => String(it.batch_id) === String(batchId));
        if (item) {
          openInventoryModal('edit', item);
        }
      } else if (actionIcon.dataset.action === 'view') {
        const item = inventoryData.find(it => String(it.batch_id) === String(batchId));
        if (item) {
          openInventoryModal('view', item);
        }
      } else if (actionIcon.dataset.action === 'delete') {
        handleDeleteBatch(batchId);
      }
    });
  }

  // Modal buttons
  const modalOverlay = document.getElementById('inventoryModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');

  [btnCloseModal, btnCancelModal].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', function () {
        closeInventoryModal();
      });
    }
  });

  if (modalOverlay) {
    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) {
        closeInventoryModal();
      }
    });
  }

  // Submit form
  const form = document.getElementById('inventoryForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveInventoryForm();
    });
  }
  // Delete modal
  const deleteModal = document.getElementById('deleteModal');
  const btnCancelDelete = document.getElementById('btnCancelDelete');
  const btnCloseDeleteModal = document.getElementById('btnCloseDeleteModal');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');

  [btnCancelDelete, btnCloseDeleteModal].forEach(btn => {
    if (btn) btn.addEventListener('click', closeDeleteModal);
  });

  if (deleteModal) {
    deleteModal.addEventListener('click', function (e) {
      if (e.target === deleteModal) closeDeleteModal();
    });
  }

  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', confirmDeleteBatch);
  }

  // Load dữ liệu
  fetchInventorySummary();
  fetchIngredientsForDropdown();
  fetchInventoryList();
}

// =========================
// API helpers
// =========================
async function fetchInventorySummary() {
  const el = document.getElementById('inventorySummary');
  if (!el) return;

  try {
    const res = await fetch(`${API_BASE}/api/owner/inventory/summary`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();
    if (!data.success) {
      el.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation"></i>
        <b>Critical Inventory Issues</b> &nbsp;Cannot load summary
      `;
      return;
    }

    el.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation"></i>
      <b>Critical Inventory Issues</b>
      &nbsp;${data.expired} expired • ${data.expiring_48h} expiring in 48hrs • ${data.low_stock} low stock items
    `;
  } catch (err) {
    console.error('Error loading inventory summary:', err);
    el.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation"></i>
      <b>Critical Inventory Issues</b> &nbsp;Error loading data
    `;
    showToast('Cannot load inventory summary.', 'error');
  }
}

async function fetchInventoryList() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/inventory/batches` , {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!data.success) {
      console.error('Cannot load inventory list', data);
      return;
    }
    inventoryData = data.items || [];
    applyInventoryFilters();
  } catch (err) {
    console.error('Error loading inventory list:', err);
    showToast('Cannot load inventory list.', 'error');
  }
}

async function fetchIngredientsForDropdown() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/inventory/ingredients` , {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!data.success) return;

    const select = document.getElementById('ingredientSelect');
    const unitSelect = document.getElementById('unitSelect');
    if (!select || !unitSelect) return;

    // Ingredient dropdown
    select.innerHTML = '<option value="">Select ingredient...</option>';
    (data.items || []).forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.ingredient_id;
      opt.textContent = item.name;
      opt.dataset.unit = item.unit; // lưu unit của ingredient
      opt.dataset.shelf = item.shelf_life_days;
      select.appendChild(opt);
    });

    // Khi chọn ingredient → tự điền unit mặc định (nếu có)
    select.addEventListener('change', function () {
      const selected = this.options[this.selectedIndex];
      if (!selected) return;
      const ingredientUnit = selected.dataset.unit;
      if (ingredientUnit) {
        // Nếu unit mặc định đang có trong list thì chọn, không thì giữ nguyên
        const option = Array.from(unitSelect.options).find(
          o => o.value === ingredientUnit
        );
        if (option) {
          unitSelect.value = ingredientUnit;
        }
      }
      recalcExpiryFromShelfLife();
    });
    const manuInput = document.getElementById('manufactureDateInput');
    if (manuInput) {
      manuInput.addEventListener('change', recalcExpiryFromShelfLife);
    }
    applyAiImportDraftIfAny();
  } catch (err) {
    console.error('Error loading ingredients:', err);
  }
}
function recalcExpiryFromShelfLife() {
  const ingredientSelect = document.getElementById('ingredientSelect');
  const manuInput = document.getElementById('manufactureDateInput');
  const expiryInput = document.getElementById('expiryDateInput');
  if (!ingredientSelect || !manuInput || !expiryInput) return;

  const selected = ingredientSelect.options[ingredientSelect.selectedIndex];
  if (!selected) return;

  const shelfStr = selected.dataset.shelf;
  const manuVal = manuInput.value;
  if (!shelfStr || !manuVal) return;

  const shelfDays = parseInt(shelfStr, 10);
  if (!shelfDays || isNaN(shelfDays)) return;

  const d = new Date(manuVal);
  if (isNaN(d.getTime())) return;

  d.setDate(d.getDate() + shelfDays);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  expiryInput.value = `${yyyy}-${mm}-${dd}`;
}


// =========================
// Filter + sort + render
// =========================
function parseDateYMD(str) {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function compareByCritical(a, b) {
  // điểm ưu tiên: số càng nhỏ càng nguy hiểm
  function score(item) {
    const tag = (item.status_tag || '').toLowerCase();
    if (tag === 'expired') return 0;
    if (tag === 'expiring_48h') return 1;
    if (tag === 'near_expiry') return 2;
    if (tag === 'low_stock') return 3;
    return 4; // còn lại
  }

  const sa = score(a);
  const sb = score(b);
  if (sa !== sb) return sa - sb;

  // cùng mức độ thì sort theo ngày hết hạn tăng dần
  const da = parseDateYMD(a.expiry_date);
  const db = parseDateYMD(b.expiry_date);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da - db;
}

function applyInventoryFilters() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  filteredData = inventoryData.filter(item => {
    // 1) search theo tên nguyên liệu + lot code
    if (currentSearch) {
      const text = (item.ingredient_name + ' ' + item.lot_code).toLowerCase();
      if (!text.includes(currentSearch)) return false;
    }

    // 2) lọc theo dropdown status (All / In stock / Low stock / ...)
    const tag = String(item.status_tag || '').toLowerCase();
    if (currentStatusFilter !== 'all') {
      if (tag !== String(currentStatusFilter).toLowerCase()) return false;
    }


    // 3) chế độ advanced: chỉ giữ lại batch "nguy hiểm"
    if (advancedMode) {
      const tag = (item.status_tag || '').toLowerCase();
      let isCritical = false;

      // a) các status rủi ro từ backend
      if (['expired', 'expiring_48h', 'near_expiry', 'low_stock'].includes(tag)) {
        isCritical = true;
      } else if (item.expiry_date) {
        // b) không gắn tag nhưng sắp hết hạn trong 7 ngày tới
        const exp = parseDateYMD(item.expiry_date);
        if (exp) {
          const diffDays = Math.round((exp - today) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 7) {
            isCritical = true;
          }
        }
      }

      if (!isCritical) return false;
    }

    return true;
  });

  // 4) sort
  filteredData.sort((a, b) => {
    // ở chế độ advanced: sort theo mức độ nguy hiểm + ngày hết hạn
    if (advancedMode) {
      return compareByCritical(a, b);
    }

    // sort cũ theo currentSort
    let v1 = a[currentSort.field];
    let v2 = b[currentSort.field];

    if (currentSort.field === 'expiry_date') {
      v1 = v1 || '';
      v2 = v2 || '';
    }

    if (v1 === v2) return 0;
    if (v1 == null) return 1;
    if (v2 == null) return -1;

    if (v1 > v2) return currentSort.direction === 'asc' ? 1 : -1;
    return currentSort.direction === 'asc' ? -1 : 1;
  });

  currentPage = 1;
  renderInventoryTable(currentPage);
}


function statusBadgeClass(tag) {
  const t = String(tag || '').toLowerCase();
  switch (t) {
    case 'expired': return 'badge red-light';
    case 'expiring_48h':
    case 'near_expiry':
    case 'nearexpiry':
      return 'badge yellow-light';
    case 'low_stock':
    case 'lowstock':
      return 'badge yellow-light';
    case 'usedup':
    case 'used_up':
      return 'badge gray-light';
    default:
      return 'badge green-light';
  }
}


function renderInventoryTable(page = currentPage) {
  const tbody = document.getElementById('inventoryTableBody');
  if (!tbody) return;

  const list = filteredData || [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(page, 1), totalPages);

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:16px;">No data</td>
      </tr>
    `;
    updatePagination(totalPages);
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  const rowsHtml = pageItems.map(item => {
    return `
      <tr data-id="${item.batch_id}">
        <td><span class="dot ${item.priority_color}"></span></td>
        <td class="no-wrap">${item.lot_code}</td>
        <td>${item.ingredient_name}</td>
        <td>${item.quantity} ${item.unit}</td>
        <td>${item.manufacture_date || '-'}</td>
        <td>${item.expiry_date || '-'}</td>
        <td><span class="${statusBadgeClass(item.status_tag)}">${item.status_label}</span></td>
        <td class="actions">
          <i class="fa-solid fa-pen" data-action="edit" title="Edit"></i>
          <i class="fa-solid fa-eye" data-action="view" title="View"></i>
          <i class="fa-solid fa-trash" data-action="delete" title="Delete"></i>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;
  updatePagination(totalPages);
}

function updatePagination(totalPages) {
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('pagePrev');
  const nextBtn = document.getElementById('pageNext');
  if (pageInfo) pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

// =========================
// Modal helpers
// =========================
function openInventoryModal(mode, item) {
  const modal = document.getElementById('inventoryModal');
  if (!modal) return;

  const titleEl = document.getElementById('inventoryModalTitle');
  const batchIdInput = document.getElementById('batchId');
  const ingredientSelect = document.getElementById('ingredientSelect');
  const lotCodeInput = document.getElementById('lotCodeInput');
  const quantityInput = document.getElementById('quantityInput');
  const unitSelect = document.getElementById('unitSelect');
  const manuInput = document.getElementById('manufactureDateInput');
  const expiryInput = document.getElementById('expiryDateInput');
  const statusSelect = document.getElementById('statusSelect');
  const saveBtn = document.getElementById('btnSaveInventory');
  const aiSugInput = document.getElementById('aiSuggestionId');   // 🔥 đưa lên đây

  if (mode === 'create') {
    titleEl.textContent = 'Add New Item';
    batchIdInput.value = '';
    ingredientSelect.value = '';
    generateLotCode().then(code => {
      lotCodeInput.value = code;
    });
    quantityInput.value = '';
    unitSelect.value = '';

    // set today cho manufacture_date
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    manuInput.value = `${yyyy}-${mm}-${dd}`;

    expiryInput.value = '';
    statusSelect.value = 'Valid';

    if (aiSugInput) aiSugInput.value = '';   // reset

    saveBtn.style.display = '';
    enableInventoryForm(true);

    recalcExpiryFromShelfLife();
  } 
  else if (mode === 'edit' && item) {
    titleEl.textContent = 'Edit Item';
    batchIdInput.value = item.batch_id;
    ingredientSelect.value = item.ingredient_id;
    lotCodeInput.value = item.lot_code;
    quantityInput.value = item.quantity;
    unitSelect.value = item.unit;
    manuInput.value = item.manufacture_date || '';
    expiryInput.value = item.expiry_date || '';
    statusSelect.value = item.status_db || 'Valid';

    if (aiSugInput) aiSugInput.value = '';   // edit không liên quan AI

    saveBtn.style.display = '';
    enableInventoryForm(true);
  } 
  else if (mode === 'view' && item) {
    titleEl.textContent = 'Batch details';
    batchIdInput.value = item.batch_id;
    ingredientSelect.value = item.ingredient_id;
    lotCodeInput.value = item.lot_code;
    quantityInput.value = item.quantity;
    unitSelect.value = item.unit;
    manuInput.value = item.manufacture_date || '';
    expiryInput.value = item.expiry_date || '';
    statusSelect.value = item.status_db || 'Valid';

    if (aiSugInput) aiSugInput.value = '';

    saveBtn.style.display = 'none';
    enableInventoryForm(false);
  }

  modal.dataset.mode = mode;
  modal.classList.add('show');
}

async function generateLotCode() {
  try {
    const res = await fetch(`${API_BASE}/api/owner/inventory/generate-lotcode` , {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) return data.lot_code;
    showToast("Cannot generate lot code!", "error");
    return "";
  } catch (err) {
    console.error("generateLotCode error:", err);
    showToast("Error generating lot code!", "error");
    return "";
  }
}

function enableInventoryForm(enabled) {
  const form = document.getElementById('inventoryForm');
  if (!form) return;
  Array.from(form.elements).forEach(el => {
    if (el.id === 'btnCancelModal' || el.id === 'btnCloseModal') return;
    if (el.tagName === 'BUTTON' && el.type === 'submit') {
      el.disabled = !enabled;
    } else {
      el.readOnly = !enabled;
      if (el.tagName === 'SELECT') {
        el.disabled = !enabled;
      }
    }
  });
}

function closeInventoryModal() {
  const modal = document.getElementById('inventoryModal');
  if (!modal) return;
  modal.classList.remove('show');
}

// =========================
// Save form (create / edit)
// =========================
async function saveInventoryForm() {
  const aiSuggestionIdEl = document.getElementById('aiSuggestionId');
  const aiSuggestionId = aiSuggestionIdEl ? aiSuggestionIdEl.value : '';
  const modal = document.getElementById('inventoryModal');
  if (!modal) return;

  const mode = modal.dataset.mode;

  const batchId = document.getElementById('batchId').value;
  const ingredientId = document.getElementById('ingredientSelect').value;
  const lotCode = document.getElementById('lotCodeInput').value.trim();
  const quantity = document.getElementById('quantityInput').value;
  const unit = document.getElementById('unitSelect').value;
  const manuDate = document.getElementById('manufactureDateInput').value;
  const expiryDate = document.getElementById('expiryDateInput').value;
  const status = document.getElementById('statusSelect').value;

  if (!ingredientId || !lotCode || !quantity || !unit || !manuDate || !expiryDate) {
    alert('Please fill in all required fields.');
    return;
  }

  const payload = {
    ingredient_id: parseInt(ingredientId, 10),
    lot_code: lotCode,
    quantity: parseFloat(quantity),
    unit: unit,
    manufacture_date: manuDate,
    expiry_date: expiryDate,
    status: status,
  };
  // chỉ cần khi tạo mới
  const createdBy = getCurrentUserId();
  const currentUserId = getCurrentUserId();

  if (mode === 'create' && createdBy) {
    payload.created_by = createdBy;
  }
  if (mode === 'edit' && batchId && currentUserId) {
  payload.updated_by = currentUserId;
}
  // Có thể gửi thêm created_by từ user_info nếu muốn
  try {
    let url = `${API_BASE}/api/owner/inventory/batches`;
    let method = 'POST';

    if (mode === 'edit' && batchId) {
      url = `${API_BASE}/api/owner/inventory/batches/${batchId}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),        
      body: JSON.stringify(payload)
    });

    const data = await res.json();

        if (!data.success) {
      console.error('Save inventory failed:', data);
      showToast('Save failed!', 'error');
      return;
    }

    const redirectBack = sessionStorage.getItem('ai_import_redirect_back') === 'owner_dashboard';
    const fromAi = new URLSearchParams(window.location.search).get('from_ai') === '1';

    if (redirectBack && fromAi) {
      // dùng 1 lần rồi clear
      sessionStorage.removeItem('ai_import_redirect_back');

      // 🔥 Nếu biết suggestion nào, xóa luôn để nó không hiện lại trên dashboard
      if (aiSuggestionId) {
        try {
          await fetch(`${API_BASE}/api/owner/ai/recommendations/${aiSuggestionId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
        } catch (err) {
          console.error('Failed to archive AI suggestion from Inventory:', err);
          // không cần chặn redirect chỉ vì xóa fail
        }
      }

      closeInventoryModal();
      showToast('Saved from AI suggestion. Redirecting back to dashboard...', 'success');

      window.location.href = '../dashboard/index.html#aiRecommendationPanel';
      return;
    }



    // flow bình thường (không tới từ AI)
    closeInventoryModal();
    await fetchInventorySummary();
    await fetchInventoryList();
    showToast('Saved successfully.', 'success');

  } catch (err) {
    console.error('Error saving inventory:', err);
    showToast('Error saving inventory!', 'error');
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

  // hiệu ứng hiện
  requestAnimationFrame(() => toast.classList.add('show'));

  // tự ẩn
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// =========================
// Delete batch
// =========================
function handleDeleteBatch(batchId) {
  pendingDeleteId = batchId;
  const modal = document.getElementById('deleteModal');
  const msg = document.getElementById('deleteMessage');

  if (msg) {
    const item = inventoryData.find(it => String(it.batch_id) === String(batchId));
    if (item) {
      msg.textContent = `Are you sure you want to delete batch "${item.lot_code}" (${item.ingredient_name})?`;
    } else {
      msg.textContent = 'Are you sure you want to delete this batch?';
    }
  }

  if (modal) modal.classList.add('show');
}
function closeDeleteModal() {
  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.remove('show');
  pendingDeleteId = null;
}

async function confirmDeleteBatch() {
  if (!pendingDeleteId) return;

  try {
    const res = await fetch(`${API_BASE}/api/owner/inventory/batches/${pendingDeleteId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()         
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Delete failed!', 'error');
    } else {
      showToast('Batch marked as used up.', 'success');
      await fetchInventorySummary();
      await fetchInventoryList();
    }
  } catch (err) {
    console.error('Error deleting batch:', err);
    showToast('Error deleting batch!', 'error');
  } finally {
    closeDeleteModal();
  }
}

