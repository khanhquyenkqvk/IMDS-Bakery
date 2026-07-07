/* --- ĐỒNG HỒ (Giữ nguyên) --- */
function updateClock() {
  const now = new Date();
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  document.getElementById("clock").textContent = `${String(h).padStart(2,'0')}:${m} ${ampm}`;
}
updateClock();
setInterval(updateClock, 60000);

/* --- FAKE DATA FALLBACK (Cập nhật status dựa trên ngày 2025-11-03) --- */
const fakeDataFromDatabase = [
  { id: 1, code: "L2025-10-03-02", name: "Wheat Flour", quantity: "10 kg", received: "2025-09-22", useby: "2026-03-22", status: "good" },
  { id: 2, code: "L2025-10-03-02", name: "Fresh Milk", quantity: "8 L", received: "2025-09-24", useby: "2025-10-01", status: "expired" },
  { id: 3, code: "L2025-10-03-02", name: "Whipping Cream", quantity: "7 L", received: "2025-09-24", useby: "2025-10-01", status: "expired" },
  { id: 4, code: "L2025-10-03-02", name: "Eggs", quantity: "15 pcs", received: "2025-09-24", useby: "2025-09-30", status: "expired" },
  { id: 5, code: "L2025-10-03-02", name: "Butter", quantity: "3 kg", received: "2025-09-23", useby: "2025-11-23", status: "low" },
  { id: 6, code: "L2025-10-03-02", name: "Sugar", quantity: "12 kg", received: "2025-09-25", useby: "2026-09-25", status: "good" }
];

// Format quantity without trailing .00
function formatQuantityDisplay(val) {
  const num = parseFloat(val);
  if (!Number.isFinite(num)) return val || "0";
  return num.toFixed(2).replace(/\.?0+$/, "");
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

/* --- LOGIC MỚI ĐỂ LẤY VÀ HIỂN THỊ DỮ LIỆU TỪ DATABASE --- */

// 1. Chờ trang tải xong
document.addEventListener("DOMContentLoaded", () => {
  // Gọi hàm tải dữ liệu
  fetchInventoryData();
  
  // Setup table click listener
  setupTableListeners();
});
let currentInventoryData = [];
let filteredData = [];
let currentPage = 1;
const PAGE_SIZE = 10;
// API base URL (dùng cho tất cả fetch)
const API_BASE = window.API_BASE || `${location.origin}/api`;
function normalizeStatus(raw) {
  const s = String(raw || '').trim();

  // chuẩn theo dropdown
  if (['Valid','NearExpiry','Opened','UsedUp','Expired'].includes(s)) return s;

  // các biến thể hay gặp
  const low = s.toLowerCase();
  if (low === 'in stock' || low === 'instock') return 'Valid';
  if (low === 'nearly expired' || low === 'near expiry' || low === 'near-expiry') return 'NearExpiry';
  if (low === 'used up' || low === 'usedup') return 'UsedUp';

  // legacy/fake
  if (low === 'good') return 'Valid';
  if (low === 'expired') return 'Expired';
  if (low === 'low') return 'Opened'; // tuỳ nghiệp vụ bạn muốn low là gì

  return 'Valid';
}

async function fetchInventoryData() {
  try {
      const tableBody = document.getElementById("inventoryBody");
  if (tableBody) {
    tableBody.innerHTML = `
      <tr><td colspan="7" style="text-align:center; color:#6b7280; padding:20px;">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span> Loading inventory...</span>
      </td></tr>`;
  }

  const response = await fetch(`${API_BASE}/inventory`);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText.substring(0, 100)}`);
    }
    const data = await response.json();
    console.log('API Data length:', data.length);
    console.log('First item:', data[0] || 'No data');
    
    // ✅ Map lại key đúng với JSON backend
    const mappedData = (data || []).map(item => ({
      id: item.id || item.batch_id || item.lot_code, // fallback ID theo lot_code
      code: item.lot_code,
      name: item.ingredient_name,
      quantity: `${formatQuantityDisplay(item.quantity)} ${item.unit || ''}`,
      received: new Date(item.manufacture_date).toISOString().split('T')[0],
      useby: new Date(item.expiry_date).toISOString().split('T')[0],
      status: normalizeStatus(item.status)
    }));

    currentInventoryData = mappedData;
    filteredData = mappedData;
    renderPage(1);
    } catch (error) {
    console.error('Lỗi khi tải dữ liệu:', error);
    // ❌ Không render fake data khi load
    const tableBody = document.getElementById("inventoryBody");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr><td colspan="7" style="text-align:center; color:#6b7280; padding:20px;">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span> Failed to load inventory data.</span>
        </td></tr>`;
    }
  }

}
// Toggle popup hiển thị
function togglePopup(popupId, btnId) {
  const popup = document.getElementById(popupId);
  const btn = document.getElementById(btnId);

  // Ẩn tất cả popup khác trước
  document.querySelectorAll('.popup-box').forEach(p => p.style.display = 'none');

  // Nếu popup đang ẩn → bật lên
  if (popup.style.display !== 'block') {
    const rect = btn.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const popupWidth = popup.offsetWidth || 250; // fallback width
    const viewportWidth = window.innerWidth;

    // Tính vị trí cơ bản (ngay dưới nút)
    let top = rect.bottom + scrollY + 6;
    let left = rect.left + scrollX;

    // Nếu popup bị tràn ra khỏi màn hình → canh sang phải của nút
    if (left + popupWidth > viewportWidth - 20) {
      left = rect.right + scrollX - popupWidth; // canh phải theo nút
    }

    popup.style.position = 'absolute';
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
    popup.style.display = 'block';
  } else {
    popup.style.display = 'none';
  }
}


// Ẩn popup khi click ra ngoài
document.addEventListener('click', (e) => {
  const isInside = e.target.closest('.popup-box, #btnFilter, #btnSort');
  if (!isInside) {
    document.querySelectorAll('.popup-box').forEach(p => p.style.display = 'none');
  }
});

// Nút mở popup
document.getElementById("btnFilter")?.addEventListener("click", (e) => {
  e.stopPropagation();
  togglePopup("filterPopup", "btnFilter");
});
document.getElementById("btnSort")?.addEventListener("click", (e) => {
  e.stopPropagation();
  togglePopup("sortPopup", "btnSort");
});

// --- FILTER FUNCTION ---
document.getElementById("applyFilter")?.addEventListener("click", () => {
  renderPage(1, computeFilteredSortedData());
  showToast('Filter applied!', 'info');
  document.getElementById("filterPopup").style.display = 'none';
});

document.getElementById("resetFilter")?.addEventListener("click", () => {
  document.getElementById("filterStatus").value = "all";
  renderPage(1, computeFilteredSortedData());
  showToast('Filter reset.', 'info');
  document.getElementById("filterPopup").style.display = 'none';
});

// --- SORT FUNCTION ---
document.getElementById("applySort")?.addEventListener("click", () => {
  renderPage(1, computeFilteredSortedData());
  showToast('Sorted successfully!', 'info');
  document.getElementById("sortPopup").style.display = 'none';
});

document.getElementById("resetSort")?.addEventListener("click", () => {
  document.getElementById("sortBy").value = "none";
  renderPage(1, computeFilteredSortedData());
  showToast('Sort reset.', 'info');
  document.getElementById("sortPopup").style.display = 'none';
});

function computeFilteredSortedData() {
  let data = [...currentInventoryData];
  const filterVal = document.getElementById("filterStatus")?.value || "all";
  if (filterVal !== "all") data = data.filter(i => i.status === filterVal);

  const keyword = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  if (keyword) {
    data = data.filter(item => {
      return [item.code, item.name, item.status].some(field => (field || '').toLowerCase().includes(keyword));
    });
  }

  const sortVal = document.getElementById("sortBy")?.value || "none";
  switch (sortVal) {
    case 'expiryAsc':
      data.sort((a, b) => new Date(a.useby) - new Date(b.useby));
      break;
    case 'expiryDesc':
      data.sort((a, b) => new Date(b.useby) - new Date(a.useby));
      break;
    case 'nameAsc':
      data.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'nameDesc':
      data.sort((a, b) => b.name.localeCompare(a.name));
      break;
  }
  filteredData = data;
  return data;
}

function renderPage(page = 1, data = filteredData) {
  const list = Array.isArray(data) ? data : [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);
  renderTable(pageItems);
  updateAlertBox(list);
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

document.getElementById('pagePrev')?.addEventListener('click', () => {
  renderPage(currentPage - 1);
});
document.getElementById('pageNext')?.addEventListener('click', () => {
  renderPage(currentPage + 1);
});

function renderTable(data) {
  const tableBody = document.getElementById("inventoryBody");
  tableBody.innerHTML = "";

  if (data.length === 0) {
    const isVi = window.GlobalLanguage && window.GlobalLanguage.getLanguage && window.GlobalLanguage.getLanguage() === 'vi';
    const emptyText = isVi ? 'Không tìm thấy nguyên liệu nào.' : 'No ingredients found.';
    tableBody.innerHTML = `<tr><td colspan="7"><span data-en="No ingredients found." data-vi="Không tìm thấy nguyên liệu nào.">${emptyText}</span></td></tr>`;
    return;
  }

  data.forEach(item => {
    const row = document.createElement("tr");
    row.setAttribute("data-id", item.code);

let statusHtml = '';
let quantityClass = 'quantity-default';
const status = item.status || 'Valid'; // ✅ lấy từ item

switch (status) {
  case 'NearExpiry':
    statusHtml = `<span class="status nearly-expired">
                    <i class="fa-solid fa-circle-info"></i>
                    <span data-en="Nearly expired" data-vi="Sắp hết hạn">Nearly expired</span>
                  </span>`;
    quantityClass = 'quantity-nearly-expired';
    break;
  case 'Opened':
    statusHtml = `<span class="status low">
                    <span data-en="Opened" data-vi="Đã mở">Opened</span>
                  </span>`;
    quantityClass = 'quantity-low';
    break;
  case 'Expired':
    statusHtml = `<span class="status expired">
                    <span data-en="Expired" data-vi="Hết hạn">Expired</span>
                  </span>`;
    quantityClass = 'quantity-expired';
    break;
  case 'UsedUp':
    statusHtml = `<span class="status usedup">
                    <span data-en="Used up" data-vi="Đã sử dụng hết">Used up</span>
                  </span>`;
    break;
  case 'Valid':
  default:
    statusHtml = `<span class="status good">
                    <span data-en="In stock" data-vi="Còn hàng">In stock</span>
                  </span>`;
    break;
}



    row.innerHTML = `
      <td>${item.code || 'N/A'}</td>
      <td>${item.name || 'N/A'}</td>
      <td class="${quantityClass}">${item.quantity || '0.00'}</td> 
      <td>${item.received || 'N/A'}</td>
      <td>${item.useby || 'N/A'}</td>
      <td>${statusHtml}</td> 
      <td class="operation-icons">
        <a href="#" class="icon-edit"><i class="fa-solid fa-pen-to-square"></i></a>
        <a href="#" class="icon-delete"><i class="fa-solid fa-trash-can"></i></a>
      </td>
    `;
    
    tableBody.appendChild(row);
  });
  
  if (window.GlobalLanguage && window.GlobalLanguage.applyLanguage) {
    window.GlobalLanguage.applyLanguage(window.GlobalLanguage.getLanguage());
  }
}

/* --- SETUP TABLE CLICK LISTENERS FOR EDIT/DELETE --- */
function setupTableListeners() {
  const tableBody = document.getElementById("inventoryBody");
  tableBody.addEventListener("click", function(e) {
    const iconLink = e.target.closest(".icon-edit, .icon-delete");
    if (!iconLink) return; 

    e.preventDefault(); 
    
    const row = iconLink.closest("tr");
    const itemId = row.getAttribute("data-id"); 
    const productName = row.cells[1].textContent.trim();

    if (iconLink.classList.contains("icon-edit")) {
      handleEdit(itemId, productName);
    } else if (iconLink.classList.contains("icon-delete")) {
      handleDelete(itemId, productName);
    }
  });
}

/* --- LOGIC NÚT (FILTER, SORT, TÌM KIẾM) --- */
const searchInput = document.getElementById("searchInput");
if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderPage(1, computeFilteredSortedData());
  });
}


// Event listeners cho modals
document.addEventListener('DOMContentLoaded', () => {
  // Edit modal
  const editModal = document.getElementById('editModal');
  const deleteModal = document.getElementById('deleteModal');
  const closeButtons = document.querySelectorAll('.close');
  const cancelEdit = document.getElementById('cancelEdit');
  const cancelDelete = document.getElementById('cancelDelete');

  if (closeButtons.length > 0) {
    closeButtons.forEach(btn => btn.addEventListener('click', () => {
      editModal.style.display = 'none';
      deleteModal.style.display = 'none';
    }));
  }

  if (cancelEdit) cancelEdit.addEventListener('click', () => editModal.style.display = 'none');
  if (cancelDelete) cancelDelete.addEventListener('click', () => deleteModal.style.display = 'none');

  // Outside click to close
  window.addEventListener('click', (e) => {
    if (e.target === editModal) editModal.style.display = 'none';
    if (e.target === deleteModal) deleteModal.style.display = 'none';
  });

// Edit form
const editForm = document.getElementById('editForm');
if (editForm) {
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    if (!id || id === 'N/A') {
      alert('Invalid ID. Refresh page.');
      return;
    }
    const data = {
    code: document.getElementById('editCode').value.trim(),
    name: document.getElementById('editName').value.trim(),
    quantity: parseFloat(document.getElementById('editQuantity').value || 0),
    received: document.getElementById('editReceived').value,
    useby: document.getElementById('editUseby').value,
    status: document.getElementById('editStatus').value,
    unit: 'g'
  };

    try {
      const response = await fetch(`${API_BASE}/inventory/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      showToast(result.message || 'Updated successfully!', 'success');

      document.getElementById('editModal').style.display = 'none';
      fetchInventoryData();
    } catch (error) {
      console.error('PUT Error:', error);
      showToast('Update Error: ' + error.message, 'error');

    }
  });
}

// Delete form (tương tự)
const deleteForm = document.getElementById('deleteForm');
if (deleteForm) {
  deleteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('deleteId').value;
    if (!id || id === 'N/A') {
      alert('Invalid ID. Refresh page.');
      return;
    }
    const reason = document.getElementById('deleteReason').value;
    if (!reason.trim()) {
      alert('Please enter reason for deletion.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/inventory/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason })
    });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      showToast(result.message || 'Deleted successfully!', 'error');

      document.getElementById('deleteModal').style.display = 'none';
      await new Promise(resolve => setTimeout(resolve, 300));
      fetchInventoryData();

    } catch (error) {
      console.error('DELETE Error:', error);
      showToast('Delete Error: ' + error.message, 'error');

    }
  });
}
});

// FIX handleEdit: Extract data an toàn hơn (handle undefined)
function handleEdit(id, name) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;
  document.getElementById('editId').value = id || '';
  document.getElementById('editCode').value = row.cells[0]?.textContent?.trim() || '';
  document.getElementById('editName').value = name || row.cells[1]?.textContent?.trim() || '';
  const qtyText = row.cells[2]?.textContent?.trim() || '0';
  document.getElementById('editQuantity').value = qtyText.replace(/[^0-9.]/g, '') || '0';
  document.getElementById('editReceived').value = row.cells[3]?.textContent?.trim() || '';
  document.getElementById('editUseby').value = row.cells[4]?.textContent?.trim() || '';
  const statusEl = row.cells[5]?.querySelector('.status');
  if (statusEl) {
    const statusText = statusEl.textContent.trim();
const map = {
  'In stock': 'Valid',
  'Opened': 'Opened',
  'Nearly expired': 'NearExpiry',
  'Expired': 'Expired',
  'Used up': 'UsedUp'
};
document.getElementById('editStatus').value = map[statusText] || 'Valid';

  }
  document.getElementById('editModal').style.display = 'block';
}

// handleDelete: Mở modal
function handleDelete(id, name) {
  document.getElementById('deleteId').value = id;
  document.getElementById('deleteName').textContent = name;
  document.getElementById('deleteReason').value = '';
  document.getElementById('deleteModal').style.display = 'block';
}

/* --- ĐĂNG XUẤT (Giữ nguyên) --- */
document.getElementById("btnLogout")?.addEventListener("click", () => {
  // Clear session and redirect
  sessionStorage.clear();
  localStorage.removeItem('bakery_credentials');
  window.location.href = '../../login/index.html';
});
// Sync language for modals
function updateModalLanguage() {
  const lang = window.GlobalLanguage ? window.GlobalLanguage.getLanguage() : 'en';
  document.querySelectorAll('[data-en]').forEach(el => {
    el.textContent = el.getAttribute(`data-${lang}`) || el.getAttribute('data-en');
  });
  // Update select options
  const statusSelect = document.getElementById('editStatus');
  if (statusSelect) {
    Array.from(statusSelect.options).forEach(opt => {
      opt.textContent = opt.getAttribute(`data-${lang}`) || opt.textContent;
    });
  }
}

// Call on load and lang change
document.addEventListener('DOMContentLoaded', () => {
  // ... existing code ...
  updateModalLanguage();
  
  // Listen for lang change
  if (window.GlobalLanguage && GlobalLanguage.applyLanguage) {
    const originalApply = GlobalLanguage.applyLanguage;
    GlobalLanguage.applyLanguage = function(newLang) {
      originalApply(newLang);
      updateModalLanguage();
    };
  }
});
// --- Dynamic Warning Box (Accurate meaning) ---
function updateAlertBox(data) {
  const alertBox = document.querySelector('.alert-box');
  if (!alertBox) return;

  let nearExpiry = 0;
  let expired = 0;
  let openedOrUsed = 0;

  // Đếm theo status
  data.forEach(item => {
    const s = (item.status || '').trim();
    if (s === 'NearExpiry') nearExpiry++;
    else if (s === 'Expired') expired++;
    else if (s === 'Opened' || s === 'UsedUp') openedOrUsed++;
  });

  // Nếu không có cảnh báo
  if (nearExpiry === 0 && expired === 0 && openedOrUsed === 0) {
    alertBox.style.display = 'none';
    return;
  }

  // Có cảnh báo → hiển thị lại
  alertBox.style.display = 'block';

  // Tạo nội dung tiếng Anh
  const parts = [];
  if (nearExpiry > 0)
    parts.push(`${nearExpiry} ingredient${nearExpiry > 1 ? 's' : ''} are about to expire`);
  if (openedOrUsed > 0)
    parts.push(`${openedOrUsed} ingredient${openedOrUsed > 1 ? 's' : ''} have been opened or used up`);
  if (expired > 0)
    parts.push(`${expired} ingredient${expired > 1 ? 's' : ''} have expired`);

  const message = `⚠️ Warning: ${parts.join(', ')}!`;
  alertBox.innerHTML = message;
}
// --- TOAST NOTIFICATION FUNCTION ---
function showToast(message, type = 'info') {
  // Tạo container nếu chưa có
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // Tạo toast mới
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  // Icon theo loại
  const icons = {
    success: '<i class="fa-solid fa-circle-check"></i>',
    error: '<i class="fa-solid fa-circle-xmark"></i>',
    info: '<i class="fa-solid fa-circle-info"></i>'
  };

  toast.innerHTML = `${icons[type] || icons.info} <span>${message}</span>`;

  // Thêm toast vào container
  container.appendChild(toast);

  // Tự động xóa sau 3 giây
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}


