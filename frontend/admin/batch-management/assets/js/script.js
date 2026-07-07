// Batch Management - Script (FIFO + Detail + Edit + Add New + Search/Pagination)
(function () {
    'use strict';
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


console.log('[BATCH] API_BASE =', API_BASE);


    const PAGE_SIZE = 10;

    let currentEditingBatchId = null;
    let ingredientsCache = null;
    let allBatches = [];
    let activeFilter = 'all';
    let currentSearchTerm = '';
    let currentPage = 1;

    // ---------------------------
    // Common helpers
    // ---------------------------
    function getLanguage() {
        return window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function'
            ? window.GlobalLanguage.getLanguage()
            : 'en';
    }

    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast ' + (type === 'error' ? 'toast-error' : 'toast-success');

        const iconSpan = document.createElement('span');
        iconSpan.className = 'toast-icon';
        iconSpan.innerHTML = type === 'error' ? '&#9888;' : '&#10003;';

        const textSpan = document.createElement('span');
        textSpan.textContent = message;

        toast.appendChild(iconSpan);
        toast.appendChild(textSpan);
        container.appendChild(toast);

        setTimeout(() => toast.remove(), 3000);
    }

    function formatDate(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        if (Number.isNaN(d.getTime())) return isoString;
        return d.toLocaleDateString('vi-VN');
    }

    function formatDateInput(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        if (Number.isNaN(d.getTime())) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };

    const token = sessionStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // ✅ lấy user_id từ sessionStorage.user_info
    try {
        const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
        if (userInfo && userInfo.user_id) {
            headers['X-User-Id'] = String(userInfo.user_id);
        }
    } catch (e) {
        console.warn('Could not parse user_info', e);
    }

    return headers;
}


    function applyLanguage() {
        if (window.GlobalLanguage) {
            if (typeof GlobalLanguage.applyLanguage === 'function') {
                GlobalLanguage.applyLanguage();
            } else if (typeof GlobalLanguage.updateLanguage === 'function') {
                GlobalLanguage.updateLanguage();
            } else if (typeof GlobalLanguage.initialize === 'function') {
                GlobalLanguage.initialize();
            }
        }
    }

    // ---------------------------
    // Data helpers (filter/search/paging)
    // ---------------------------
    function getFilteredBatches() {
        let list = allBatches || [];

        if (activeFilter !== 'all') {
            list = list.filter(b => (b.ui_status || 'active') === activeFilter);
        }

        if (currentSearchTerm) {
            const term = currentSearchTerm.toLowerCase();
            list = list.filter(b => {
                const lot = (b.lot_code || '').toLowerCase();
                const name = (b.ingredient_name || '').toLowerCase();
                return lot.includes(term) || name.includes(term);
            });
        }

        return list;
    }

    function updatePagination(totalItems, totalPages) {
        const info = document.getElementById('batchPageInfo');
        const btnPrev = document.getElementById('batchPagePrev');
        const btnNext = document.getElementById('batchPageNext');

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

    // ---------------------------
    // Load FIFO batches
    // ---------------------------
    async function loadFIFOBatches() {
        try {
            const res = await fetch(`${API_BASE}/api/batches/fifo`, {
                method: 'GET',
                headers: getAuthHeaders()
            });

            if (!res.ok) throw new Error('API /api/batches/fifo error');

            const json = await res.json();
            if (json.status !== 'success') throw new Error(json.message || 'API error');

            allBatches = json.batches || [];
            currentPage = 1;
            renderBatchTable();
            updateSummaryCards(json.summary || {});
            updateTabCounts();
        } catch (err) {
            console.error(err);
            const lang = getLanguage();
            showToast(
                lang === 'vi'
                    ? 'Không tải được dữ liệu lô nguyên liệu.'
                    : 'Failed to load batch data.',
                'error'
            );
        }
    }

    // ---------------------------
    // Render table
    // ---------------------------
    function renderBatchTable() {
        const tbody = document.getElementById('batchTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const filtered = getFilteredBatches();
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filtered.slice(start, start + PAGE_SIZE);

        const statusMap = {
            'active': {
                className: 'status-active',
                textVi: 'Đang hoạt động',
                textEn: 'Active',
                iconHtml: ''
            },
            'nearly-expired': {
                className: 'status-nearly-expired',
                textVi: 'Sắp hết hạn',
                textEn: 'Nearly expired',
                iconHtml: ''
            },
            'expired': {
                className: 'status-expired',
                textVi: 'Đã hết hạn',
                textEn: 'Expired',
                iconHtml: '<i class="fa-solid fa-xmark"></i> '
            }
        };

        pageItems.forEach((b, idx) => {
            const ui_status = b.ui_status || 'active';
            const info = statusMap[ui_status] || statusMap['active'];

            const tr = document.createElement('tr');
            tr.setAttribute('data-status', ui_status);
            tr.dataset.batchId = b.batch_id;

            tr.innerHTML = `
                <td>${start + idx + 1}</td>
                <td>${b.lot_code}</td>
                <td>${b.ingredient_name}</td>
                <td>${formatDate(b.manufacture_date)}</td>
                <td>${formatDate(b.expiry_date)}</td>
                <td>${b.quantity} ${b.unit}</td>
                <td>
                    <span class="status-badge ${info.className}">
                        ${info.iconHtml}
                        <span data-en="${info.textEn}" data-vi="${info.textVi}">${info.textVi}</span>
                    </span>
                </td>
                <td class="actions">
                    <button class="btn-detail"><span data-en="Detail" data-vi="Chi tiết">Chi tiết</span></button>
                    <button class="btn-fix"><span data-en="Fix" data-vi="Sửa">Sửa</span></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        attachRowButtonHandlers();
        updatePagination(filtered.length, totalPages);
        applyLanguage();
    }

    function updateSummaryCards(summary) {
        const total = summary.total || 0;
        const active = summary.active || 0;
        const nearlyExpired = summary.nearly_expired || 0;
        const expired = summary.expired || 0;

        const elTotal = document.getElementById('totalIngredients');
        const elActive = document.getElementById('activeCount');
        const elNearly = document.getElementById('nearlyExpiredCount');
        const elExpired = document.getElementById('expiredCount');

        if (elTotal) elTotal.textContent = total;
        if (elActive) elActive.textContent = active;
        if (elNearly) elNearly.textContent = nearlyExpired;
        if (elExpired) elExpired.textContent = expired;
    }

    // ---------------------------
    // Filter tabs + search + pagination
    // ---------------------------
    const filterTabs = document.querySelectorAll('.tab-btn');
    const searchInput = document.getElementById('batchSearchInput');
    const btnPrevPage = document.getElementById('batchPagePrev');
    const btnNextPage = document.getElementById('batchPageNext');

    function updateTabCounts() {
        const counts = {
            'all': allBatches.length,
            'active': allBatches.filter(b => (b.ui_status || 'active') === 'active').length,
            'nearly-expired': allBatches.filter(b => (b.ui_status || 'active') === 'nearly-expired').length,
            'expired': allBatches.filter(b => (b.ui_status || 'active') === 'expired').length
        };

        filterTabs.forEach(tab => {
            const filter = tab.getAttribute('data-filter');
            const countSpan = tab.querySelector('.tab-count');
            if (countSpan && counts[filter] !== undefined) {
                countSpan.textContent = `(${counts[filter]})`;
            }
        });
    }

    filterTabs.forEach(tab => {
        tab.addEventListener('click', function () {
            filterTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            activeFilter = this.getAttribute('data-filter');
            currentPage = 1;
            renderBatchTable();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            currentSearchTerm = this.value || '';
            currentPage = 1;
            renderBatchTable();
        });
    }

    if (btnPrevPage) {
        btnPrevPage.addEventListener('click', function () {
            if (currentPage > 1) {
                currentPage -= 1;
                renderBatchTable();
            }
        });
    }

    if (btnNextPage) {
        btnNextPage.addEventListener('click', function () {
            const totalPages = Math.max(1, Math.ceil(getFilteredBatches().length / PAGE_SIZE));
            if (currentPage < totalPages) {
                currentPage += 1;
                renderBatchTable();
            }
        });
    }

    // ---------------------------
    // Modals (detail / edit / add)
    // ---------------------------
    const detailModal = document.getElementById('detailModal');
    const editModal = document.getElementById('editModal');
    const addModal = document.getElementById('addModal');

    const detailCloseBtn = document.getElementById('detailCloseBtn');
    const editCancelBtn = document.getElementById('editCancelBtn');
    const editSaveBtn = document.getElementById('editSaveBtn');

    const addCancelBtn = document.getElementById('addCancelBtn');
    const addCloseIcon = document.getElementById('addCloseIcon');
    const addSaveBtn = document.getElementById('addSaveBtn');

    function openModal(modal) {
        if (!modal) return;
        modal.classList.remove('hidden');
        applyLanguage();
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.add('hidden');
    }

    if (detailCloseBtn) detailCloseBtn.addEventListener('click', () => closeModal(detailModal));
    if (editCancelBtn) editCancelBtn.addEventListener('click', () => closeModal(editModal));
    if (addCancelBtn) addCancelBtn.addEventListener('click', () => closeModal(addModal));
    if (addCloseIcon) addCloseIcon.addEventListener('click', () => closeModal(addModal));

    [detailModal, editModal, addModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    // ---------------------------
    // Detail / Edit helpers
    // ---------------------------
    async function fetchBatchDetail(batchId) {
        const res = await fetch(`${API_BASE}/api/batches/${batchId}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('API /api/batches/{id} error');
        const json = await res.json();
        if (json.status !== 'success') throw new Error(json.message || 'API error');
        return json.batch;
    }

    function fillDetailModal(batch) {
        const productNameEl = document.getElementById('detailProductName');
        const lotCodeEl = document.getElementById('detailLotCode');
        const quantityEl = document.getElementById('detailQuantity');
        const mDateEl = document.getElementById('detailManufactureDate');
        const eDateEl = document.getElementById('detailExpiryDate');
        const statusBadge = document.getElementById('detailStatusBadge');
        const statusText = document.getElementById('detailStatusText');
        const remainingEl = document.getElementById('detailRemainingDays');
        const creatorEl = document.getElementById('detailCreator');

        if (productNameEl) productNameEl.textContent = batch.ingredient_name;
        if (lotCodeEl) lotCodeEl.textContent = batch.lot_code;
        if (quantityEl) quantityEl.textContent = `${batch.quantity} ${batch.unit || ''}`;
        if (mDateEl) mDateEl.textContent = formatDate(batch.manufacture_date);
        if (eDateEl) eDateEl.textContent = formatDate(batch.expiry_date);
        if (remainingEl) remainingEl.textContent =
            (batch.days_remaining != null ? batch.days_remaining : '--');
        if (creatorEl) creatorEl.textContent = batch.creator_name || '--';

        if (statusBadge && statusText) {
            statusBadge.classList.remove('status-active', 'status-nearly-expired', 'status-expired');
            const ui_status = batch.ui_status || 'active';
            if (ui_status === 'expired') {
                statusBadge.classList.add('status-expired');
                statusText.dataset.en = 'Expired';
                statusText.dataset.vi = 'Đã hết hạn';
                statusText.textContent = 'Expired';
            } else if (ui_status === 'nearly-expired') {
                statusBadge.classList.add('status-nearly-expired');
                statusText.dataset.en = 'Nearly expired';
                statusText.dataset.vi = 'Sắp hết hạn';
                statusText.textContent = 'Nearly expired';
            } else {
                statusBadge.classList.add('status-active');
                statusText.dataset.en = 'Active';
                statusText.dataset.vi = 'Đang hoạt động';
                statusText.textContent = 'Active';
            }
        }

        applyLanguage();
    }

    function fillEditModal(batch) {
        currentEditingBatchId = batch.batch_id;

        const productNameEl = document.getElementById('editProductName');
        const lotCodeEl = document.getElementById('editLotCode');
        const qtyInput = document.getElementById('editQuantity');
        const mDateInput = document.getElementById('editManufactureDate');
        const eDateInput = document.getElementById('editExpiryDate');

        if (productNameEl) productNameEl.textContent = batch.ingredient_name;
        if (lotCodeEl) lotCodeEl.textContent = batch.lot_code;
        if (qtyInput) qtyInput.value = batch.quantity != null ? batch.quantity : '';
        if (mDateInput) mDateInput.value = formatDateInput(batch.manufacture_date);
        if (eDateInput) eDateInput.value = formatDateInput(batch.expiry_date);

        applyLanguage();
    }

    if (editSaveBtn) {
        editSaveBtn.addEventListener('click', async function () {
            if (!currentEditingBatchId) return;

            const qtyInput = document.getElementById('editQuantity');
            const mDateInput = document.getElementById('editManufactureDate');
            const eDateInput = document.getElementById('editExpiryDate');

            const quantity = qtyInput && qtyInput.value !== '' ? parseFloat(qtyInput.value) : null;
            const manufDate = mDateInput ? mDateInput.value || null : null;
            const expiryDate = eDateInput ? eDateInput.value || null : null;

            const lang = getLanguage();

            if (quantity != null && quantity < 0) {
                showToast(
                    lang === 'vi' ? 'Số lượng phải lớn hơn hoặc bằng 0' : 'Quantity must be >= 0',
                    'error'
                );
                return;
            }

            try {
                const body = {};
                if (quantity != null) body.quantity = quantity;
                if (manufDate !== null) body.manufacture_date = manufDate;
                if (expiryDate !== null) body.expiry_date = expiryDate;

                const res = await fetch(`${API_BASE}/api/batches/${currentEditingBatchId}`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(body)
                });

                if (!res.ok) throw new Error('Update API error');
                const json = await res.json();
                if (json.status !== 'success') throw new Error(json.message || 'Update failed');

                showToast(
                    lang === 'vi' ? 'Cập nhật lô thành công' : 'Batch updated successfully',
                    'success'
                );

                closeModal(editModal);
                await loadFIFOBatches();
            } catch (err) {
                console.error(err);
                showToast(
                    lang === 'vi'
                        ? 'Không cập nhật được lô. Vui lòng thử lại.'
                        : 'Failed to update batch. Please try again.',
                    'error'
                );
            }
        });
    }

    // ---------------------------
    // Add New batch
    // ---------------------------
    const btnAddNew = document.querySelector('.btn-add-new');
    const addIngredientSelect = document.getElementById('addIngredientSelect');
    const addQuantityInput = document.getElementById('addQuantity');
    const addLotCodeInput = document.getElementById('addLotCode');
    const addQuantityUnitLabel = document.getElementById('addQuantityUnitLabel');
    const addCreatedDateEl = document.getElementById('addCreatedDate');
    const addExpiryDateEl = document.getElementById('addExpiryDate');

    async function loadIngredientsOptions() {
        if (ingredientsCache && ingredientsCache.length) return ingredientsCache;

        const res = await fetch(`${API_BASE}/api/batches/ingredients`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('API /api/batches/ingredients error');
        const json = await res.json();
        if (json.status !== 'success') throw new Error(json.message || 'API error');

        ingredientsCache = json.ingredients || [];
        if (addIngredientSelect) {
            addIngredientSelect.innerHTML = '';

            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = getLanguage() === 'vi' ? 'Chọn nguyên liệu' : 'Select ingredients';
            addIngredientSelect.appendChild(defaultOpt);

            ingredientsCache.forEach(ing => {
                const opt = document.createElement('option');
                opt.value = ing.ingredient_id;
                opt.textContent = ing.name;
                opt.dataset.unit = ing.unit || '';
                opt.dataset.shelf_life_days = ing.shelf_life_days ?? '';
                addIngredientSelect.appendChild(opt);
            });
        }
        return ingredientsCache;
    }

    function resetAddForm() {
        if (addIngredientSelect) addIngredientSelect.value = '';
        if (addQuantityInput) addQuantityInput.value = '';
        if (addLotCodeInput) addLotCodeInput.value = '';
        if (addQuantityUnitLabel) addQuantityUnitLabel.textContent = '';
        if (addCreatedDateEl) addCreatedDateEl.textContent = '';
        if (addExpiryDateEl) addExpiryDateEl.textContent = '';
    }

    if (addIngredientSelect && addQuantityUnitLabel) {
        addIngredientSelect.addEventListener('change', function () {
            const opt = this.selectedOptions[0];
            const unit = opt && opt.dataset.unit ? opt.dataset.unit : '';
            const shelfLife = opt && opt.dataset.shelf_life_days
                ? parseInt(opt.dataset.shelf_life_days, 10)
                : null;

            addQuantityUnitLabel.textContent = unit || '';

            // Tính Use-by date = hôm nay + shelf_life_days (nếu có)
            if (addExpiryDateEl) {
                if (!shelfLife || Number.isNaN(shelfLife)) {
                    addExpiryDateEl.textContent = '';
                } else {
                    const today = new Date();
                    const expiry = new Date(today);
                    expiry.setDate(expiry.getDate() + shelfLife);
                    addExpiryDateEl.textContent = expiry.toLocaleDateString('vi-VN');
                }
            }
        });
    }

    if (btnAddNew) {
        btnAddNew.addEventListener('click', async function () {
            // set Date created = hôm nay
            if (addCreatedDateEl) {
                const today = new Date();
                addCreatedDateEl.textContent = today.toLocaleDateString('vi-VN');
            }

            try {
                await loadIngredientsOptions();
                resetAddForm();
                openModal(addModal);
            } catch (err) {
                console.error(err);
                const lang = getLanguage();
                showToast(
                    lang === 'vi'
                        ? 'Không tải được danh sách nguyên liệu.'
                        : 'Failed to load ingredients list.',
                    'error'
                );
            }
        });
    }

    if (addSaveBtn) {
        addSaveBtn.addEventListener('click', async function () {
            const lang = getLanguage();

            const ingredientId = addIngredientSelect ? addIngredientSelect.value : '';
            const quantity = addQuantityInput && addQuantityInput.value !== ''
                ? parseFloat(addQuantityInput.value)
                : NaN;

            if (!ingredientId) {
                showToast(
                    lang === 'vi' ? 'Vui lòng chọn nguyên liệu.' : 'Please select an ingredient.',
                    'error'
                );
                return;
            }
            
            if (Number.isNaN(quantity) || quantity <= 0) {
                showToast(
                    lang === 'vi' ? 'Số lượng phải lớn hơn 0.' : 'Quantity must be greater than 0.',
                    'error'
                );
                return;
            }

            try {
                const body = {
                    ingredient_id: parseInt(ingredientId, 10),
                    quantity: quantity
                    // manufacture_date: không gửi, backend đang ngày hôm nay
                };

                const res = await fetch(`${API_BASE}/api/batches`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(body)
                });

                const json = await res.json().catch(() => ({}));

                if (!res.ok || json.status !== 'success') {
                    const serverMsg = json && json.message ? json.message : '';
                    throw new Error(serverMsg || 'Create failed');
                }

                const lotCode = json.batch && json.batch.lot_code ? json.batch.lot_code : '';

                showToast(
                    lang === 'vi'
                        ? `Tạo lô mới thành công${lotCode ? ': ' + lotCode : ''}`
                        : `Created new batch successfully${lotCode ? ': ' + lotCode : ''}`,
                    'success'
                );

                if (addLotCodeInput && lotCode) {
                    addLotCodeInput.value = lotCode;
                }

                closeModal(addModal);
                await loadFIFOBatches();
            } catch (err) {
                console.error(err);
                const msg = err && err.message ? err.message : '';
                showToast(
                    lang === 'vi'
                        ? `Không tạo được lô mới. ${msg ? 'Lý do: ' + msg : 'Vui lòng thử lại.'}`
                        : `Failed to create new batch. ${msg ? 'Reason: ' + msg : 'Please try again.'}`,
                    'error'
                );
            }

        });
    }

    // ---------------------------
    // Gán event cho nút Detail / Fix sau khi render bảng
    // ---------------------------
    function attachRowButtonHandlers() {
        document.querySelectorAll('.btn-detail').forEach(btn => {
            btn.onclick = async function (e) {
                e.preventDefault();
                const row = this.closest('tr');
                const batchId = row && row.dataset.batchId;
                if (!batchId) return;

                try {
                    const batch = await fetchBatchDetail(batchId);
                    fillDetailModal(batch);
                    openModal(detailModal);
                } catch (err) {
                    console.error(err);
                    const lang = getLanguage();
                    showToast(
                        lang === 'vi' ? 'Không lấy được chi tiết lô.' : 'Failed to load batch detail.',
                        'error'
                    );
                }
            };
        });

        document.querySelectorAll('.btn-fix').forEach(btn => {
            btn.onclick = async function (e) {
                e.preventDefault();
                const row = this.closest('tr');
                const batchId = row && row.dataset.batchId;
                if (!batchId) return;

                try {
                    const batch = await fetchBatchDetail(batchId);
                    fillEditModal(batch);
                    openModal(editModal);
                } catch (err) {
                    console.error(err);
                    const lang = getLanguage();
                    showToast(
                        lang === 'vi'
                            ? 'Không lấy được dữ liệu lô để chỉnh sửa.'
                            : 'Failed to load batch for editing.',
                        'error'
                    );
                }
            };
        });
    }

    // ---------------------------
    // Init
    // ---------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            loadFIFOBatches();
        });
    } else {
        loadFIFOBatches();
    }
})();

