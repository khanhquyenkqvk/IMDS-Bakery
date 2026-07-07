// frontend/admin/user-management/assets/js/user-management.js

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


console.log("[USER-MGMT] API_BASE =", API_BASE);


const USER_PAGE_SIZE = 5;
const HISTORY_PAGE_SIZE = 5;

let usersData = [];
let filteredUsers = [];
let userCurrentPage = 1;
let editingUserId = null;
let confirmResolve = null;
let historyData = [];
let filteredHistory = [];
let historyCurrentPage = 1;



document.addEventListener('DOMContentLoaded', () => {
  initUserManagement();
  initHistoryFilters();
  initConfirmModal();   
  initUserToast();      
});

async function initUserManagement() {
  initUserFiltersUI();
  initUserModalEvents();
  await Promise.all([
    loadUserSummary(),
    loadUsers(),
    loadUserHistory()
  ]);
}
/* =======================
   Confirm Modal
   ======================= */
function initConfirmModal() {
  const modal = document.getElementById('confirmModal');
  const btnClose = document.getElementById('btnCloseConfirm');
  const btnCancel = document.getElementById('btnCancelConfirm');
  const btnOk = document.getElementById('btnOkConfirm');

  const close = (result) => {
    if (modal) modal.classList.remove('show');
    if (confirmResolve) {
      confirmResolve(result);
      confirmResolve = null;
    }
  };

  btnClose?.addEventListener('click', () => close(false));
  btnCancel?.addEventListener('click', () => close(false));
  btnOk?.addEventListener('click', () => close(true));

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      close(false);
    }
  });
}

// openConfirmDialog trả về Promise<boolean>
function openConfirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel' }) {
  const modal = document.getElementById('confirmModal');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const btnOk = document.getElementById('btnOkConfirm');
  const btnCancel = document.getElementById('btnCancelConfirm');

  if (!modal) return Promise.resolve(false);

  if (titleEl) titleEl.textContent = title || 'Confirm';
  if (msgEl) msgEl.textContent = message || 'Are you sure?';
  if (btnOk) btnOk.textContent = confirmText || 'Confirm';
  if (btnCancel) btnCancel.textContent = cancelText || 'Cancel';

  modal.classList.add('show');

  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

/* =======================
   Toast for this page
   ======================= */
let toastTimer = null;

function initUserToast() {
  const toast = document.getElementById('umToast');
  if (!toast) return;
  toast.addEventListener('click', () => hideUserToast());
}

function showUserToast(message, type = 'success', duration = 2500) {
  const toast = document.getElementById('umToast');
  if (!toast) return;
  const msgEl = toast.querySelector('.um-toast-message');

  toast.classList.remove('error');
  if (type === 'error') {
    toast.classList.add('error');
  }

  if (msgEl) msgEl.textContent = message;

  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    hideUserToast();
  }, duration);
}

function hideUserToast() {
  const toast = document.getElementById('umToast');
  if (!toast) return;
  toast.classList.remove('show');
}

/* =======================
   Common fetch helper
   ======================= */
async function fetchJSON(url, options = {}) {
  const token = sessionStorage.getItem('auth_token');
  const baseHeaders = { 'Content-Type': 'application/json' };
  if (token) {
    baseHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      ...baseHeaders,
      ...(options.headers || {})
    }
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    console.error('Cannot parse JSON', e);
  }
  if (!res.ok || !data || data.success === false) {
    const msg = (data && data.message) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}


/* =======================
   1. Summary cards
   ======================= */
async function loadUserSummary() {
  try {
    const data = await fetchJSON(`${API_BASE}/api/admin/users/summary`);
    const sum = data.data || {};
    const elTotal = document.getElementById('summaryTotalUsers');
    const elActive = document.getElementById('summaryActiveUsers');
    const elLocked = document.getElementById('summaryLockedUsers');
    const elRoles = document.getElementById('summaryRolesDefined');

    if (elTotal) elTotal.textContent = sum.total_users ?? 0;
    if (elActive) elActive.textContent = sum.active_users ?? 0;
    if (elLocked) elLocked.textContent = sum.locked_users ?? 0;
    if (elRoles) elRoles.textContent = sum.roles_defined ?? 0;
  } catch (err) {
    console.error('loadUserSummary error:', err);
  }
}

/* =======================
   2. Load users & render
   ======================= */
async function loadUsers() {
  try {
    const data = await fetchJSON(`${API_BASE}/api/admin/users`);
    usersData = data.data || [];
    userCurrentPage = 1;
    applyUserFilters();
  } catch (err) {
    console.error('loadUsers error:', err);
  }
}

function initUserFiltersUI() {
  const searchInput = document.getElementById('userSearchInput');
  const roleFilter = document.getElementById('roleFilter');
  const statusFilter = document.getElementById('statusFilter');
  const addBtn = document.getElementById('btnOpenAddUser');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      userCurrentPage = 1;
      applyUserFilters();
    });
  }
  if (roleFilter) {
    roleFilter.addEventListener('change', () => {
      userCurrentPage = 1;
      applyUserFilters();
    });
  }
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      userCurrentPage = 1;
      applyUserFilters();
    });
  }
  if (addBtn) {
    addBtn.addEventListener('click', () => openUserModalForCreate());
  }

  // Event delegation for actions (edit / lock / delete)
  const tbody = document.getElementById('userTableBody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.action-btn');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.classList.contains('edit')) {
        openUserModalForEdit(id);
      } else if (btn.classList.contains('lock')) {
        const currentStatus = btn.dataset.status;
        toggleUserStatus(id, currentStatus);
      } else if (btn.classList.contains('delete')) {
        deleteUser(id);
      }
    });
  }
}

function applyUserFilters() {
  const searchInput = document.getElementById('userSearchInput');
  const roleFilter = document.getElementById('roleFilter');
  const statusFilter = document.getElementById('statusFilter');

  const term = (searchInput?.value || '').trim().toLowerCase();
  const roleVal = roleFilter?.value || '';
  const statusVal = statusFilter?.value || '';

  filteredUsers = usersData.filter(u => {
    const nameEmail = `${u.full_name || ''} ${u.username || ''} ${u.email || ''}`.toLowerCase();
    const matchTerm = !term || nameEmail.includes(term);
    const matchRole = !roleVal || (u.role_name || '').toLowerCase() === roleVal.toLowerCase();
    const matchStatus = !statusVal || (u.status || '') === statusVal;
    return matchTerm && matchRole && matchStatus;
  });

  renderUserTablePage();
}

function renderUserTablePage() {
  const tbody = document.getElementById('userTableBody');
  const paginationEl = document.getElementById('userPagination');
  if (!tbody) return;

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USER_PAGE_SIZE));
  if (userCurrentPage > totalPages) userCurrentPage = totalPages;

  const start = (userCurrentPage - 1) * USER_PAGE_SIZE;
  const end = start + USER_PAGE_SIZE;
  const pageRows = filteredUsers.slice(start, end);

  tbody.innerHTML = pageRows.map(u => {
    const role = u.role_name || 'Unknown';
    const email = u.email || '';
    const phone = u.phone || '';
    const fullName = u.full_name || u.username || '';
    const status = u.status || 'Active';
    const lastLogin = u.last_login ? formatDateTime(u.last_login) : '—';
    const createdBy = 'System'; // hiện tại chưa có cột created_by trong Users

    let roleClass = 'blue';
    if (role.toLowerCase() === 'admin') roleClass = 'red';
    else if (role.toLowerCase() === 'owner') roleClass = 'purple';

    const statusClass = status === 'Active' ? 'green' : 'orange';
    const lockIcon = status === 'Active' ? 'fa-lock-open' : 'fa-lock';

    return `
      <tr>
        <td>
          <div class="user-cell">
            <span class="avatar"></span>
            <div>
              <div class="name">${escapeHtml(fullName)}</div>
              <div class="muted">${escapeHtml(email)}</div>
            </div>
          </div>
        </td>
        <td><span class="pill ${roleClass}">${escapeHtml(role)}</span></td>
        <td>${escapeHtml(phone)}</td>
        <td><span class="status ${statusClass}">${status}</span></td>
        <td>${lastLogin}</td>
        <td>${createdBy}</td>
        <td class="actions">
          <button class="action-btn edit" data-id="${u.user_id}" title="Edit user">
            <i class="fa-regular fa-pen-to-square"></i>
          </button>
          <button class="action-btn lock" data-id="${u.user_id}" data-status="${status}" title="${status === 'Active' ? 'Lock account' : 'Unlock account'}">
            <i class="fa-solid ${lockIcon}"></i>
          </button>
          <button class="action-btn delete" data-id="${u.user_id}" title="Delete user">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  renderPagination(filteredUsers.length, USER_PAGE_SIZE, userCurrentPage, paginationEl, (page) => {
    userCurrentPage = page;
    renderUserTablePage();
  });
}

function renderPagination(totalItems, pageSize, currentPage, container, onChange) {
  if (!container) return;
  container.innerHTML = '';

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(currentPage, totalPages);

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Page ${page} / ${totalPages}`;
  container.appendChild(info);

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '<';
  prev.disabled = page === 1;
  prev.addEventListener('click', () => onChange(page - 1));
  container.appendChild(prev);

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = '>';
  next.disabled = page === totalPages;
  next.addEventListener('click', () => onChange(page + 1));
  container.appendChild(next);
}

/* =======================
   3. Modal Add / Edit User
   ======================= */
function initUserModalEvents() {
  const modal = document.getElementById('userModal');
  const btnClose = document.getElementById('btnCloseUserModal');
  const btnCancel = document.getElementById('btnCancelUser');
  const form = document.getElementById('userForm');

  const closeModal = () => {
    if (modal) modal.classList.remove('show');
    editingUserId = null;
    clearUserFormError();
  };

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

    if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const action = await submitUserForm();  
        closeModal();
        await loadUserSummary();
        await loadUsers();

        // Toast theo action
        if (action === 'create') {
          showUserToast('User created successfully.', 'success');
        } else if (action === 'update') {
          showUserToast('User updated successfully.', 'success');
        }
      } catch (err) {
        setUserFormError(err.message || 'Error saving user');
        showUserToast(err.message || 'Error saving user', 'error');
      }
    });
  }

}

function openUserModalForCreate() {
  editingUserId = null;
  const modal = document.getElementById('userModal');
  const title = document.getElementById('userModalTitle');
  const pwdField = document.getElementById('passwordField');

  if (title) title.textContent = 'Add User';
  fillUserFormFields({
    full_name: '',
    username: '',
    email: '',
    phone: '',
    role_name: '',
    status: 'Active',
    password: ''
  });

  if (pwdField) pwdField.style.display = 'block';

  clearUserFormError();
  if (modal) modal.classList.add('show');
}

function openUserModalForEdit(userId) {
  const user = usersData.find(u => u.user_id === userId);
  if (!user) return;

  editingUserId = userId;
  const modal = document.getElementById('userModal');
  const title = document.getElementById('userModalTitle');
  const pwdField = document.getElementById('passwordField');

  if (title) title.textContent = 'Edit User';

  fillUserFormFields({
    full_name: user.full_name || '',
    username: user.username || '',
    email: user.email || '',
    phone: user.phone || '',
    role_name: user.role_name || '',
    status: user.status || 'Active',
    password: ''
  });

  // Edit: password optional -> có thể ẩn field nếu muốn
  if (pwdField) pwdField.style.display = 'block';

  clearUserFormError();
  if (modal) modal.classList.add('show');
}

function fillUserFormFields(u) {
  document.getElementById('inputFullName')?.setAttribute('value', '');
  document.getElementById('inputUsername')?.setAttribute('value', '');
  const fullName = document.getElementById('inputFullName');
  const username = document.getElementById('inputUsername');
  const email = document.getElementById('inputEmail');
  const phone = document.getElementById('inputPhone');
  const role = document.getElementById('inputRole');
  const status = document.getElementById('inputStatus');
  const pwd = document.getElementById('inputPassword');

  if (fullName) fullName.value = u.full_name || '';
  if (username) username.value = u.username || '';
  if (email) email.value = u.email || '';
  if (phone) phone.value = u.phone || '';
  if (role) role.value = u.role_name || '';
  if (status) status.value = u.status || 'Active';
  if (pwd) pwd.value = u.password || '';
}

function getUserFormData() {
  const fullName = document.getElementById('inputFullName')?.value.trim();
  const username = document.getElementById('inputUsername')?.value.trim();
  const email = document.getElementById('inputEmail')?.value.trim();
  const phone = document.getElementById('inputPhone')?.value.trim();
  const roleName = document.getElementById('inputRole')?.value;
  const status = document.getElementById('inputStatus')?.value || 'Active';
  const password = document.getElementById('inputPassword')?.value;

  return { fullName, username, email, phone, roleName, status, password };
}

async function submitUserForm() {
  const { fullName, username, email, phone, roleName, status, password } = getUserFormData();

  if (!fullName || !username) {
    throw new Error('Full name và username là bắt buộc.');
  }
  if (!roleName) {
    throw new Error('Vui lòng chọn role.');
  }

  if (!editingUserId && !password) {
    throw new Error('Password là bắt buộc khi tạo mới user.');
  }

  if (editingUserId) {
    // Update
    const payload = {
      full_name: fullName,
      username,
      email,
      phone,
      role_name: roleName,
      status
    };
    if (password) payload.password = password;

    await fetchJSON(`${API_BASE}/api/admin/users/${editingUserId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    return 'update';
  } else {
    // Create
    const payload = {
      full_name: fullName,
      username,
      email,
      phone,
      role_name: roleName,
      status,
      password
    };
    await fetchJSON(`${API_BASE}/api/admin/users`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return 'create';
  }
}


function setUserFormError(msg) {
  const el = document.getElementById('userFormError');
  if (el) el.textContent = msg || '';
}

function clearUserFormError() {
  setUserFormError('');
}

/* =======================
   4. Lock / Unlock / Delete
   ======================= */
async function toggleUserStatus(userId, currentStatus) {
  const newStatus = currentStatus === 'Active' ? 'Locked' : 'Active';

  const title = newStatus === 'Locked' ? 'Lock account' : 'Unlock account';
  const message = newStatus === 'Locked'
    ? 'Are you sure you want to lock this account? The user will not be able to log in.'
    : 'Are you sure you want to unlock this account?';
  const confirmText = newStatus === 'Locked' ? 'Lock' : 'Unlock';

  const ok = await openConfirmDialog({
    title,
    message,
    confirmText,
    cancelText: 'Cancel'
  });
  if (!ok) return;

  try {
    await fetchJSON(`${API_BASE}/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    await loadUserSummary();
    await loadUsers();

    showUserToast(
      newStatus === 'Locked' ? 'Account locked successfully.' : 'Account unlocked successfully.',
      'success'
    );
  } catch (err) {
    showUserToast(err.message || 'Cannot update status', 'error');
  }
}


async function deleteUser(userId) {
  const ok = await openConfirmDialog({
    title: 'Delete user',
    message: 'Are you sure you want to delete this user? This action cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel'
  });
  if (!ok) return;

  try {
    await fetchJSON(`${API_BASE}/api/admin/users/${userId}`, {
      method: 'DELETE'
    });
    await loadUserSummary();
    await loadUsers();
    showUserToast('User deleted successfully.', 'success');
  } catch (err) {
    showUserToast(err.message || 'Cannot delete user', 'error');
  }
}

/* =======================
   6. Utils
   ======================= */
function formatDateTime(dt) {
  if (!dt) return '—';

  // Trả nguyên chuỗi database
  return dt.toString().trim();
}


function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
/* =======================
   5. History tab (User Activity Logs)
   ======================= */

async function loadUserHistory() {
  try {
    const data = await fetchJSON(`${API_BASE}/api/admin/users/history`);
    historyData = data.data || [];
    historyCurrentPage = 1;
    populateHistoryFilters(historyData);
    applyHistoryFilters();
  } catch (err) {
    console.error('loadUserHistory error:', err);
  }
}

function initHistoryFilters() {
  const searchInput = document.getElementById('historySearchInput');
  const userFilter = document.getElementById('historyUserFilter');
  const actionFilter = document.getElementById('historyActionFilter');

  searchInput?.addEventListener('input', () => {
    historyCurrentPage = 1;
    applyHistoryFilters();
  });
  userFilter?.addEventListener('change', () => {
    historyCurrentPage = 1;
    applyHistoryFilters();
  });
  actionFilter?.addEventListener('change', () => {
    historyCurrentPage = 1;
    applyHistoryFilters();
  });
}

function populateHistoryFilters(logs) {
  const userFilter = document.getElementById('historyUserFilter');
  const actionFilter = document.getElementById('historyActionFilter');
  if (!userFilter || !actionFilter) return;

  const users = new Set();
  const actions = new Set();

  logs.forEach(l => {
    if (l.actor_name) users.add(l.actor_name);
    if (l.action) actions.add(l.action);
  });

  userFilter.innerHTML =
    '<option value="">Filter User</option>' +
    [...users].map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');

  actionFilter.innerHTML =
    '<option value="">Filter Action</option>' +
    [...actions].map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
}

function applyHistoryFilters() {
  const searchInput = document.getElementById('historySearchInput');
  const userFilter = document.getElementById('historyUserFilter');
  const actionFilter = document.getElementById('historyActionFilter');

  const term = (searchInput?.value || '').trim().toLowerCase();
  const userVal = userFilter?.value || '';
  const actionVal = actionFilter?.value || '';

  filteredHistory = historyData.filter(log => {
    const timeText = (log.created_at || '').toString().toLowerCase();
    const userText = (log.actor_name || '');
    const actionText = (log.action || '');
    const detailText = (log.detail || '').toLowerCase();
    const ipText = (log.ip_address || '').toLowerCase();

    const matchTerm =
      !term ||
      timeText.includes(term) ||
      userText.toLowerCase().includes(term) ||
      actionText.toLowerCase().includes(term) ||
      detailText.includes(term) ||
      ipText.includes(term);

    const matchUser = !userVal || userText === userVal;
    const matchAction = !actionVal || actionText === actionVal;

    return matchTerm && matchUser && matchAction;
  });

  renderHistoryPage();
}

function renderHistoryPage() {
  const tbody = document.getElementById('historyTableBody');
  const paginationEl = document.getElementById('historyPagination');
  if (!tbody) return;

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;

  const start = (historyCurrentPage - 1) * HISTORY_PAGE_SIZE;
  const end = start + HISTORY_PAGE_SIZE;
  const pageRows = filteredHistory.slice(start, end);

  tbody.innerHTML = pageRows.map(log => `
      <tr>
        <td>${formatDateTime(log.created_at)}</td>
        <td>${escapeHtml(log.actor_name || 'System')}</td>
        <td>${escapeHtml(log.action || '')}</td>
        <td>${escapeHtml(log.detail || '')}</td>
        <td>${escapeHtml(log.ip_address || '')}</td>
      </tr>
  `).join('');

  renderPagination(
    filteredHistory.length,
    HISTORY_PAGE_SIZE,
    historyCurrentPage,
    paginationEl,
    (page) => {
      historyCurrentPage = page;
      renderHistoryPage();
    }
  );
}
