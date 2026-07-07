// Recipe Management JavaScript

function resolveApiBase() {
  if (window.API_BASE_URL && /^https?:\/\//i.test(window.API_BASE_URL)) return window.API_BASE_URL;

  const host = window.location.hostname;

  // dev: nếu chạy trên localhost thì mới gắn :5000
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.protocol}//${host}:5000`;
  }

  // prod: không gắn port
  return window.location.origin;
}
window.API_BASE_URL = resolveApiBase();
const API_BASE_URL = window.API_BASE_URL;

console.log('[FRONT] API_BASE_URL =', API_BASE_URL);




// state cho edit
let isEditMode = false;
let currentEditingRecipeId = null;
let pendingDeleteRecipeId = null;
let pendingDeleteRecipeName = '';
let pendingDeleteRecipeCard = null;
let todayMenuRows = [];
let deletedReportIds = []; 
let allRecipesCache = [];
let chooseSelectedIds = new Set();
const RECIPES_PAGE_SIZE = 6;
let recipesCurrentPage = 1;
let filteredRecipesCache = [];

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application
    initializeApp();
});

function initializeApp() {
    // Update header time
    updateHeaderTime();
    setInterval(updateHeaderTime, 60000);
    
    // Update user info
    updateUserInfo();
    
    // Initialize search and filter functionality
    initializeSearchAndFilter();
    
    // Initialize recipe actions
    initializeRecipeActions();
    
    // Initialize file upload
    initializeFileUpload();
    
    // Initialize sidebar navigation
    initializeSidebarNavigation();
    
    // Initialize logout functionality
    initializeLogout();
    initializeTodayMenuModal();

    // Initialize create recipe modal
    initializeCreateRecipeModal();
    initializeDeleteRecipeModal();
    
    // Initialize recipe tabs
    initializeRecipeTabs();
    initializeRecipesPagination(); 
    loadRecipesFromAPI();
}
function getOwnerId() {
  try {
    const info = JSON.parse(sessionStorage.getItem('user_info') || '{}');
    return info.user_id || info.id || info.owner_id || info.userId || null;
  } catch { return null; }
}

function getAuthHeaders(json = true) {
  const token = sessionStorage.getItem('auth_token');
  const ownerId = getOwnerId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(ownerId ? { 'X-User-Id': String(ownerId) } : {}),
  };
}

// Header time update functions
function formatHeaderDate(d) {
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
}

function formatHeaderTime(d) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; 
    if (h === 0) h = 12;
    return `${String(h).padStart(2,'0')}:${m} ${ampm}`;
}

function updateHeaderTime() {
    const now = new Date();
    const elDate = document.getElementById('currentDate');
    const elTime = document.getElementById('currentTime');
    if (elDate) elDate.textContent = formatHeaderDate(now);
    if (elTime) elTime.textContent = formatHeaderTime(now);
}

// Update user info from sessionStorage
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
function initializeRecipesPagination() {
  const recipesPrevBtn = document.getElementById('recipesPrev');
  const recipesNextBtn = document.getElementById('recipesNext');

  if (recipesPrevBtn) {
    recipesPrevBtn.addEventListener('click', () => {
      if (recipesCurrentPage > 1) {
        recipesCurrentPage--;
        renderRecipesPage();
      }
    });
  }

  if (recipesNextBtn) {
    recipesNextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil((filteredRecipesCache.length || 0) / RECIPES_PAGE_SIZE) || 1;
      if (recipesCurrentPage < totalPages) {
        recipesCurrentPage++;
        renderRecipesPage();
      }
    });
  }
}

function initializeTodayMenuModal() {
    
    const btnOpen = document.getElementById('btnOpenTodayMenu');
    const btnClose = document.getElementById('closeTodayMenuModal');
    const btnCancel = document.getElementById('btnCancelTodayMenu');
    const btnSave = document.getElementById('btnSaveTodayMenu');
    const btnAddRow = document.getElementById('btnAddRowFromSearch');
    const overlay = document.getElementById('todayMenuModal');
    const dateInput = document.getElementById('todayMenuDate');

    if (!overlay) return;

    // default date = hôm nay
    if (dateInput) {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        dateInput.addEventListener('change', () => {
            loadTodayMenuFromAPI();
        });
    }

    if (btnOpen) {
        btnOpen.addEventListener('click', () => openTodayMenuModal());
    }
    [btnClose, btnCancel].forEach(btn => {
        if (btn) btn.addEventListener('click', closeTodayMenuModal);
    });

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeTodayMenuModal();
            }
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', handleSaveTodayMenu);
    }

    if (btnAddRow) {
        btnAddRow.addEventListener('click', () => openRecipeChooserForTodayMenu());
    }
        // ===== modal chọn recipe =====
    const chooseModal = document.getElementById('todayMenuChooseRecipeModal');
    const btnCancelChoose = document.getElementById('btnCancelChooseRecipe');
    const btnConfirmChoose = document.getElementById('btnConfirmChooseRecipe');
    const btnCloseChoose = document.getElementById('closeChooseRecipeModal');

    [btnCancelChoose, btnCloseChoose].forEach(btn => {
        if (btn) btn.addEventListener('click', closeChooseRecipeModal);
    });

    if (chooseModal) {
        chooseModal.addEventListener('click', (e) => {
            if (e.target === chooseModal) {
                closeChooseRecipeModal();
            }
        });
    }

    if (btnConfirmChoose) {
        btnConfirmChoose.addEventListener('click', handleConfirmChooseRecipes);
    }
}

// Search and Filter functionality
function initializeSearchAndFilter() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterRecipes, 300));
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', filterRecipes);
    }
}


function filterRecipes() {
    applyRecipesFilterAndRender(true);   // reset về trang 1 khi search/filter đổi
}




function updateResultsCount(visibleCount = null, totalCount = null) {
    if (visibleCount === null || totalCount === null) {
        totalCount = filteredRecipesCache.length || 0;
        visibleCount = Math.min(
            totalCount,
            RECIPES_PAGE_SIZE
        );
    }
    console.log(`Showing ${visibleCount} of ${totalCount} recipes (page ${recipesCurrentPage})`);
}



// Recipe Actions
function initializeRecipeActions() {
    const recipesContainer = document.getElementById('recipesContainer');
    
    if (recipesContainer) {
        recipesContainer.addEventListener('click', handleRecipeAction);
    }
    
    // Add New Recipe button
    const addRecipeBtn = document.querySelector('.btn-add-recipe');
    if (addRecipeBtn) {
        addRecipeBtn.addEventListener('click', handleAddNewRecipe);
    }
}

function handleRecipeAction(event) {
    const target = event.target.closest('.btn-action');
    if (!target) return;

    const recipeCard = target.closest('.recipe-card');
    const recipeTitle = recipeCard.querySelector('.recipe-title')?.textContent || 'Unknown Recipe';

    if (target.classList.contains('btn-view')) {
        handleViewRecipe(recipeCard, recipeTitle);
    } else if (target.classList.contains('btn-edit')) {
        handleEditRecipe(recipeCard, recipeTitle);
    } else if (target.classList.contains('btn-delete')) {
        handleDeleteRecipe(recipeCard, recipeTitle);
    } else if (target.classList.contains('btn-today')) {
        handleAddToTodayMenuFromCard(recipeCard);
    }
}
function handleAddToTodayMenuFromCard(recipeCard) {
    const recipeId = recipeCard.getAttribute('data-recipe-id');
    const recipeName = recipeCard.querySelector('.recipe-title')?.textContent || '';
    if (!recipeId) {
        showNotification('Recipe ID not found', 'error');
        return;
    }
    openTodayMenuModal({
        recipe_id: Number(recipeId),
        recipe_name: recipeName
    });
}


async function handleViewRecipe(recipeCard, recipeTitle) {
    const recipeId = recipeCard.getAttribute('data-recipe-id') ||
        recipeCard.querySelector('.btn-view')?.getAttribute('data-recipe-id');

    if (!recipeId) {
        showNotification('Recipe ID not found', 'error');
        return;
    }

    recipeCard.classList.add('loading');

    try {
        const token = sessionStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE_URL}/api/owner/recipe/${recipeId}`, {
            headers: getAuthHeaders(true)
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.error || `HTTP ${res.status}`);
        }

        openViewRecipeModal(json.data);
    } catch (err) {
        console.error('View recipe error:', err);
        showNotification('Failed to load recipe detail', 'error');
    } finally {
        recipeCard.classList.remove('loading');
    }
}

async function handleEditRecipe(recipeCard, recipeTitle) {
    const recipeId = recipeCard.getAttribute('data-recipe-id') ||
        recipeCard.querySelector('.btn-edit')?.getAttribute('data-recipe-id');

    if (!recipeId) {
        showNotification('Recipe ID not found', 'error');
        return;
    }

    recipeCard.classList.add('loading');

    try {
        const token = sessionStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE_URL}/api/owner/recipe/${recipeId}`, {
            headers: getAuthHeaders(true)
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.error || `HTTP ${res.status}`);
        }

        openEditRecipeModal(json.data); // dùng dữ liệu chi tiết để prefill
    } catch (err) {
        console.error('Edit recipe load error:', err);
        showNotification('Failed to load recipe for editing', 'error');
    } finally {
        recipeCard.classList.remove('loading');
    }
}

function handleDeleteRecipe(recipeCard, recipeTitle) {
    const recipeId = recipeCard.getAttribute('data-recipe-id') ||
        recipeCard.querySelector('.btn-view')?.getAttribute('data-recipe-id');

    if (!recipeId) {
        showNotification('Recipe ID not found', 'error');
        return;
    }

    // ✔️ Không dùng confirm() nữa → mở modal UI đẹp
    openDeleteRecipeModal(recipeId, recipeTitle, recipeCard);
}



function handleAddNewRecipe() {
    openCreateRecipeModal();
}

// File Upload functionality
function initializeFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const chooseFilesBtn = document.querySelector('.btn-choose-files');
    const uploadCard = document.querySelector('.upload-card');
    
    if (chooseFilesBtn && fileInput) {
        chooseFilesBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelection);
    }
    
    // Drag and drop functionality
    if (uploadCard) {
        uploadCard.addEventListener('dragover', handleDragOver);
        uploadCard.addEventListener('dragleave', handleDragLeave);
        uploadCard.addEventListener('drop', handleFileDrop);
    }
}

function handleFileSelection(event) {
    const files = event.target.files;
    if (files.length > 0) {
        processFiles(files);
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.style.background = 'linear-gradient(135deg, #5a67d8 0%, #667eea 100%)';
    event.currentTarget.style.transform = 'scale(1.02)';
}

function handleDragLeave(event) {
    event.preventDefault();
    event.currentTarget.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    event.currentTarget.style.transform = 'scale(1)';
}

function handleFileDrop(event) {
    event.preventDefault();
    event.currentTarget.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    event.currentTarget.style.transform = 'scale(1)';
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processFiles(files);
    }
}

function processFiles(files) {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.png'];
    const validFiles = [];
    
    Array.from(files).forEach(file => {
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        if (allowedTypes.includes(fileExtension)) {
            validFiles.push(file);
        }
    });
    
    if (validFiles.length > 0) {
        showNotification(`Uploading ${validFiles.length} file(s)...`, 'info');
        
        // Simulate file upload
        setTimeout(() => {
            showNotification(`Successfully uploaded ${validFiles.length} file(s)`, 'success');
            console.log('Uploaded files:', validFiles.map(f => f.name));
        }, 2000);
    } else {
        showNotification('Please select valid file types (PDF, DOC, DOCX, TXT, JPG, PNG)', 'error');
    }
}

// Sidebar Navigation
function initializeSidebarNavigation() {
    document.querySelectorAll('.sidebar .menu-item[data-href]').forEach(btn => {
        btn.addEventListener('click', function() {
            const href = this.getAttribute('data-href');
            if (href && href !== '#') {
                location.href = href;
            }
        });
    });
}

// Logout functionality
function initializeLogout() {
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function() {
            // Clear all session data
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('user_info');
            sessionStorage.removeItem('user_token');
            sessionStorage.removeItem('user_role');
            sessionStorage.removeItem('user_role_id');
            // Clear localStorage credentials
            localStorage.removeItem('bakery_credentials');
            // Redirect to login page
            window.location.href = '../../login/index.html';
        });
    }
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '500',
        fontSize: '14px',
        zIndex: '10000',
        maxWidth: '300px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease',
        backgroundColor: type === 'success' ? '#10b981' : 
                        type === 'error' ? '#ef4444' : 
                        type === 'warning' ? '#f59e0b' : '#3b82f6'
    });
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after delay
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add fadeOut animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
`;
document.head.appendChild(style);
// =======================================
// Load recipes from backend API
// =======================================
async function loadRecipesFromAPI() {
    const container = document.getElementById('recipesContainer');
    const loading = document.getElementById('recipesLoading');
    if (!container) return;

    // bật loader, ẩn grid
    if (loading) loading.classList.remove('hidden');
    container.classList.add('hidden');
    container.innerHTML = '';

    try {
        const searchInput = document.getElementById('searchInput');
        const search = searchInput ? searchInput.value.trim() : '';

        const token = sessionStorage.getItem('auth_token');
        const res = await fetch(
            `${API_BASE_URL}/api/owner/recipe/list${search ? `?search=${encodeURIComponent(search)}` : ''}`,
            {
                headers: getAuthHeaders(true)
            }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        console.log('Recipe list response:', json);
        if (!json.success) throw new Error(json.error || 'API returned error');

        const recipes = json.data || [];
        allRecipesCache = recipes;

        // bỏ skeleton cũ
        const skeleton = document.querySelector('.recipes-loading');
        if (skeleton) skeleton.remove();

        // áp filter + phân trang (reset về page 1)
        applyRecipesFilterAndRender(true);
    } catch (err) {
        console.error('Failed to load recipes:', err);
        showNotification('Failed to load recipes from server', 'error');

        const skeleton = document.querySelector('.recipes-loading');
        if (skeleton) skeleton.remove();

        // nếu lỗi, clear
        allRecipesCache = [];
        applyRecipesFilterAndRender(true);
    } finally {
        if (loading) loading.classList.add('hidden');
        container.classList.remove('hidden');
    }
}

function applyRecipesFilterAndRender(resetPage = false) {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';

    filteredRecipesCache = (allRecipesCache || []).filter(r => {
        const title = (r.name || '').toLowerCase();
        const desc  = (r.description || '').toLowerCase();
        const status = (r.status || '').toLowerCase();

        const matchesSearch = !searchTerm ||
            title.includes(searchTerm) ||
            desc.includes(searchTerm);

        const matchesStatus = !statusFilter || status === statusFilter.toLowerCase();
        return matchesSearch && matchesStatus;
    });

    if (resetPage) {
        recipesCurrentPage = 1;
    }
    renderRecipesPage();
}

function renderRecipesPage() {
    const container = document.getElementById('recipesContainer');
    const pager = document.getElementById('recipesPagination');
    const info = document.getElementById('recipesPageInfo');
    const prevBtn = document.getElementById('recipesPrev');
    const nextBtn = document.getElementById('recipesNext');

    if (!container) return;

    container.innerHTML = '';

    const totalItems = filteredRecipesCache.length;
    if (!totalItems) {
        container.innerHTML = `
            <div class="recipes-empty">
                <i class="fa-regular fa-face-sad-tear"></i>
                <div class="recipes-empty-title">No recipes found</div>
                <div class="recipes-empty-desc">
                    Try changing search keywords or status filter.
                </div>
            </div>
        `;
        if (pager) pager.style.display = 'none';
        updateResultsCount(0, 0);
        return;
    }

    const totalPages = Math.ceil(totalItems / RECIPES_PAGE_SIZE) || 1;
    if (recipesCurrentPage > totalPages) recipesCurrentPage = totalPages;
    if (recipesCurrentPage < 1) recipesCurrentPage = 1;

    const start = (recipesCurrentPage - 1) * RECIPES_PAGE_SIZE;
    const end = start + RECIPES_PAGE_SIZE;
    const pageItems = filteredRecipesCache.slice(start, end);

    pageItems.forEach(r => {
        const card = buildRecipeCardFromAPI(r);
        container.appendChild(card);
    });

    // pagination UI
    if (pager) {
        pager.style.display = totalPages > 1 ? 'flex' : 'none';
    }
    if (info) {
        info.textContent = `${recipesCurrentPage} / ${totalPages}`;
    }
    if (prevBtn) {
        prevBtn.disabled = recipesCurrentPage === 1;
    }
    if (nextBtn) {
        nextBtn.disabled = recipesCurrentPage === totalPages;
    }

    updateResultsCount(pageItems.length, totalItems);
}

function getRecipeImageUrl(recipe) {
    const path = recipe.image_path;
    if (!path) {
        return 'assets/img/placeholder.jpg';
    }

    // Nếu path là URL đầy đủ
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }

    // Ảnh upload từ server Flask: "/static/recipe_images/xxx.jpg"
    if (path.startsWith('/static/')) {
        return `${API_BASE_URL}${path}`;
    }

    // Data cũ: chỉ là tên file trong thư mục assets/img/
    return `assets/img/${path}`;
}


function buildRecipeCardFromAPI(recipe) {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.setAttribute('data-status', recipe.status || 'active');
    card.setAttribute('data-recipe-id', recipe.recipe_id);


    const imageUrl = getRecipeImageUrl(recipe);

    const shortDesc = recipe.description || '';

    let prepTimeText = 'Prep: N/A';
    let cookTimeText = '';
    let servingsText = 'Serves: N/A';
    let difficultyText = '';

    if (typeof recipe.prep_time === 'number') {
        prepTimeText = `Prep: ${recipe.prep_time} minutes`;
    }
    if (typeof recipe.cook_time === 'number') {
        cookTimeText = `Cook: ${recipe.cook_time} minutes`;
    }
    if (typeof recipe.serves === 'number') {
        servingsText = `Serves: ${recipe.serves}`;
    }
    if (recipe.difficulty) {
        const d = String(recipe.difficulty);
        difficultyText = d.charAt(0).toUpperCase() + d.slice(1);
    }

    const updated = recipe.created_at
        ? new Date(recipe.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
          })
        : '';

    const statusKey = recipe.status || 'active';
    const statusLabel = statusKey.charAt(0).toUpperCase() + statusKey.slice(1);

    const difficultyClass = difficultyText ? `diff-${difficultyText.toLowerCase()}` : '';

card.innerHTML = `
  <div class="recipe-image">
      <img src="${imageUrl}" alt="${recipe.name}">
  </div>
  <div class="recipe-content">
      <div class="recipe-header">
          <h3 class="recipe-title">${recipe.name}</h3>
          <div class="recipe-status">
              <span class="status-badge status-${statusKey}">
                  ${statusLabel}
              </span>
          </div>
      </div>

      <!-- mô tả ngắn -->
      <p class="recipe-description">
          ${shortDesc || 'No description yet.'}
      </p>

      <!-- chip độ khó -->
      <div class="recipe-tags">
          ${
            difficultyText
              ? `<span class="difficulty-chip ${difficultyClass}">
                   <i class="fa-solid fa-layer-group"></i>
                   Difficulty: ${difficultyText}
                 </span>`
              : ''
          }
      </div>

      <!-- thanh info prep / cook / serves -->
      <div class="recipe-meta recipe-meta-bar">
          <span class="recipe-meta-item">
              <i class="fa-regular fa-clock"></i>
              ${prepTimeText}${cookTimeText ? ` - ${cookTimeText}` : ''}
          </span>
          <span class="recipe-meta-separator"></span>
          <span class="recipe-meta-item">
              <i class="fa-solid fa-users"></i>
              ${servingsText}
          </span>
      </div>

      <div class="recipe-updated">
          <i class="fa-regular fa-calendar"></i>
          ${updated ? `Updated: ${updated}` : 'Not updated yet'}
      </div>

            <div class="recipe-actions">
          <button class="btn-action btn-view" title="View Recipe" data-recipe-id="${recipe.recipe_id}">
              <i class="fa-regular fa-eye"></i>
          </button>
          <button class="btn-action btn-edit" title="Edit Recipe" data-recipe-id="${recipe.recipe_id}">
              <i class="fa-regular fa-edit"></i>
          </button>
          <button class="btn-action btn-today" title="Add to Today's Menu">
              <i class="fa-solid fa-calendar-plus"></i>
          </button>
          <button class="btn-action btn-delete" title="Delete Recipe">
              <i class="fa-solid fa-trash"></i>
          </button>
      </div>

  </div>
`;

    return card;
}

async function loadTodayMenuFromAPI(preselectedRecipe = null) {
    const dateInput = document.getElementById('todayMenuDate');
    const tbody = document.getElementById('todayMenuTbody');
    const emptyBox = document.getElementById('todayMenuEmpty');
    if (!dateInput || !tbody) return;

    const dateStr = dateInput.value;
    const token = sessionStorage.getItem('auth_token');

    try {
        const res = await fetch(
            `${API_BASE_URL}/api/owner/production-reports?date=${encodeURIComponent(dateStr)}`,
            {
                headers: getAuthHeaders(true)
            }
        );
        const json = await res.json();
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `HTTP ${res.status}`);
        }
        deletedReportIds = [];
        todayMenuRows = (json.data || []).map(r => ({
        report_id: r.report_id,
        recipe_id: r.recipe_id,
        recipe_name: r.recipe_name,
        quantity: r.quantity || 0,
        note: r.note || '',
        status: r.status || "Haven't done"
    }));


        // nếu mở từ card: auto add nếu chưa có
        if (preselectedRecipe) {
            const exists = todayMenuRows.some(r => r.recipe_id === preselectedRecipe.recipe_id);
            if (!exists) {
                todayMenuRows.push({
                    report_id: null,
                    recipe_id: preselectedRecipe.recipe_id,
                    recipe_name: preselectedRecipe.recipe_name,
                    quantity: 1,
                    note: '',
                    status: "Haven't done"
                });
            }
        }

        renderTodayMenuTable();
    } catch (err) {
        console.error('Load today menu error:', err);
        showNotification('Failed to load today menu', 'error');
    }
}

function renderTodayMenuTable() {
    const tbody = document.getElementById('todayMenuTbody');
    const emptyBox = document.getElementById('todayMenuEmpty');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!todayMenuRows.length) {
        if (emptyBox) emptyBox.classList.remove('hidden');
        return;
    }
    if (emptyBox) emptyBox.classList.add('hidden');

    todayMenuRows.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;

        const statusText = row.status || "Haven't done";
        const statusClass = statusText.toLowerCase().replace(/[\s']/g, '-');

        tr.innerHTML = `
            <td>${row.recipe_name || ''}</td>
            <td>
                <input type="number" min="0" step="1" value="${row.quantity || 0}" class="today-menu-qty">
            </td>
            <td>
                <input type="text" value="${row.note || ''}" class="today-menu-note" placeholder="Note (optional)">
            </td>
            <td>
                <span class="today-menu-status-text status-${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td style="text-align:center;">
                <button type="button" class="today-menu-remove" title="Remove row">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    // events update & remove (KHÔNG còn change status)
    tbody.querySelectorAll('tr').forEach(tr => {
        const idx = Number(tr.dataset.index);
        const qtyInput = tr.querySelector('.today-menu-qty');
        const noteInput = tr.querySelector('.today-menu-note');
        const btnRemove = tr.querySelector('.today-menu-remove');

        if (qtyInput) {
            qtyInput.addEventListener('change', () => {
                todayMenuRows[idx].quantity = parseInt(qtyInput.value || '0', 10) || 0;
            });
        }
        if (noteInput) {
            noteInput.addEventListener('input', () => {
                todayMenuRows[idx].note = noteInput.value;
            });
        }
        if (btnRemove) {
    btnRemove.addEventListener('click', () => {
        const removedRow = todayMenuRows[idx];
        if (removedRow && removedRow.report_id) {
            deletedReportIds.push(removedRow.report_id);   // 👈 lưu id để backend xoá
        }

        // xoá khỏi mảng hiển thị
        todayMenuRows.splice(idx, 1);
        renderTodayMenuTable();
    });
}

    });
}


function openTodayMenuModal(preselectedRecipe = null) {
    const overlay = document.getElementById('todayMenuModal');
    if (!overlay) return;

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // load dữ liệu hiện có từ server (theo ngày)
    loadTodayMenuFromAPI(preselectedRecipe);
}

function closeTodayMenuModal() {
    const overlay = document.getElementById('todayMenuModal');
    if (!overlay) return;
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}


function openViewRecipeModal(data) {
    const modal = document.getElementById('viewRecipeModal');
    if (!modal) return;

    // Tiêu đề & subtitle
    document.getElementById('viewRecipeTitle').textContent = data.name || 'Recipe Detail';
    document.getElementById('viewRecipeSubtitle').textContent =
        data.description ? data.description.slice(0, 80) + (data.description.length > 80 ? '...' : '') : '';

    // Ảnh
    const imgEl = document.getElementById('viewRecipeImage');
    imgEl.src = getRecipeImageUrl(data);

    // Status badge
    const status = data.status || 'active';
    const badge = document.getElementById('viewRecipeStatusBadge');
    badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);

    // Difficulty
    const diffText = data.difficulty ? String(data.difficulty) : '';
    const diffNice = diffText ? diffText.charAt(0).toUpperCase() + diffText.slice(1) : 'N/A';
    document.getElementById('viewRecipeDifficulty').textContent = diffNice;

    // Time & serves
    const prep = data.prep_time || 0;
    const cook = data.cook_time || 0;
    document.getElementById('viewRecipeTimes').textContent = `Prep ${prep} min / Cook ${cook} min`;
    document.getElementById('viewRecipeServes').textContent = `Serves ${data.serves || 0}`;

    // Created at
    let createdText = 'Not updated';
    if (data.created_at) {
        const d = new Date(data.created_at);
        createdText = d.toLocaleString();
    }
    document.getElementById('viewRecipeCreatedAt').textContent = createdText;

    // Description
    document.getElementById('viewRecipeDescription').textContent =
        data.description || 'No description';

    // Ingredients
    const ulIng = document.getElementById('viewRecipeIngredients');
    ulIng.innerHTML = '';
    (data.ingredients || []).forEach(ing => {
        const li = document.createElement('li');
        const qty = formatQuantityDisplay(ing.quantity);
        li.textContent = `${qty} ${ing.unit} - ${ing.name}`;
        ulIng.appendChild(li);
    });

    // Instructions
    const olIns = document.getElementById('viewRecipeInstructions');
    olIns.innerHTML = '';
    (data.instructions || []).forEach((step, idx) => {
        const li = document.createElement('li');
        li.textContent = step || `Step ${idx + 1}`;
        olIns.appendChild(li);
    });

    // Open modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// init close buttons for view modal (gọi trong initializeApp hoặc dưới cùng file)
document.addEventListener('DOMContentLoaded', () => {
    const viewModal = document.getElementById('viewRecipeModal');
    const closeBtns = [
        document.getElementById('closeViewModal'),
        document.getElementById('viewModalCloseBtn')
    ];

    closeBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                viewModal.classList.remove('active');
                document.body.style.overflow = '';
            });
        }
    });

    if (viewModal) {
        viewModal.addEventListener('click', (e) => {
            if (e.target === viewModal) {
                viewModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }
});
function openEditRecipeModal(data) {
    const modal = document.getElementById('createRecipeModal');
    if (!modal) return;

    isEditMode = true;
    currentEditingRecipeId = data.recipe_id;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    const form = document.getElementById('createRecipeForm');
    if (!form) return;

    // Step 1 – chính
    form.querySelector('#recipeName').value = data.name || '';
    form.querySelector('#recipeDescription').value = data.description || '';
    form.querySelector('#prepTime').value = data.prep_time || '';
    form.querySelector('#cookTime').value = data.cook_time || '';
    form.querySelector('#serves').value = data.serves || '';

    // difficulty radio
    if (data.difficulty) {
        const diffVal = String(data.difficulty).toLowerCase();
        const radio = form.querySelector(`input[name="difficulty"][value="${diffVal}"]`);
        if (radio) radio.checked = true;
    }

    // Ảnh – hiển thị lại ảnh cũ
    resetImageUploadArea();
    const imagePathInput = document.getElementById('recipeImagePath');
    if (imagePathInput) {
        imagePathInput.value = data.image_path || '';
    }
    const uploadArea = document.getElementById('imageUploadArea');
    if (data.image_path && uploadArea) {
        const imgUrl = getRecipeImageUrl(data);
        uploadArea.innerHTML = `
            <div class="selected-image">
                <img src="${imgUrl}" alt="Selected recipe image" style="max-width: 100%; max-height: 150px; border-radius: 8px; object-fit: cover;">
                <p style="margin-top: 12px; color: #059669; font-weight: 500;">
                    <i class="fa-solid fa-check-circle"></i> Current image
                </p>
                <button type="button" class="btn-change-image" style="margin-top: 8px; background: #667eea; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">
                    Change Image
                </button>
            </div>
        `;
        const changeBtn = uploadArea.querySelector('.btn-change-image');
        if (changeBtn) {
            changeBtn.addEventListener('click', () => {
                document.getElementById('recipeImageInput').click();
            });
        }
    }

    // Step 2 – ingredients
    const ingredientsList = document.getElementById('ingredientsList');
    if (ingredientsList) {
        ingredientsList.innerHTML = '';
        (data.ingredients || []).forEach(ing => {
            const qty = formatQuantityDisplay(ing.quantity);
            const div = document.createElement('div');
            div.className = 'ingredient-item';
            div.innerHTML = `
                <div class="form-group">
                    <input type="text" name="ingredientName[]" class="ingredient-name" placeholder="Search ingredient..." autocomplete="off" required value="${ing.name || ''}">
                    <input type="hidden" name="ingredientId[]" class="ingredient-id" value="${ing.ingredient_id || ''}">
                    <div class="ingredient-suggest hidden"></div>
                </div>
                <div class="form-group">
                    <input type="number" name="ingredientQuantity[]" placeholder="1" min="0" step="1" value="${qty || 1}" required>
                </div>
                <div class="form-group">
                    <select name="ingredientUnit[]" required>
                        <option value="Kg" ${ing.unit === 'Kg' ? 'selected' : ''}>Kg</option>
                        <option value="g" ${ing.unit === 'g' ? 'selected' : ''}>g</option>
                        <option value="L" ${ing.unit === 'L' ? 'selected' : ''}>L</option>
                        <option value="ml" ${ing.unit === 'ml' ? 'selected' : ''}>ml</option>
                        <option value="pcs" ${ing.unit === 'pcs' ? 'selected' : ''}>pcs</option>
                        <option value="pack" ${ing.unit === 'pack' ? 'selected' : ''}>pack</option>
                        <option value="bag"  ${ing.unit === 'bag'  ? 'selected' : ''}>bag</option>
                        <option value="box"  ${ing.unit === 'box'  ? 'selected' : ''}>box</option>

                    </select>
                </div>
                <button type="button" class="btn-remove-ingredient" title="Remove ingredient">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
            const removeBtn = div.querySelector('.btn-remove-ingredient');
            removeBtn.addEventListener('click', () => div.remove());
            ingredientsList.appendChild(div);
            bindIngredientAutocomplete(div);
        });

        // nếu không có ingredient nào (trường hợp dữ liệu trống) thì để 1 dòng
        if (!ingredientsList.children.length) {
            addIngredientItem();
        }
    }

    // Step 3 – instructions
    const instructionsList = document.getElementById('instructionsList');
    if (instructionsList) {
        instructionsList.innerHTML = '';
        const insArr = data.instructions && data.instructions.length ? data.instructions : [''];
        insArr.forEach((step, index) => {
            const item = document.createElement('div');
            item.className = 'instruction-item';
            item.innerHTML = `
                <div class="step-number">${index + 1}</div>
                <textarea name="instructionStep[]" placeholder="Step ${index + 1}: Describe what to do..." required>${step || ''}</textarea>
                <button type="button" class="btn-remove-step" title="Remove step">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
            const removeBtn = item.querySelector('.btn-remove-step');
            removeBtn.addEventListener('click', () => {
                if (instructionsList.children.length > 1) {
                    item.remove();
                    updateStepNumbers();
                } else {
                    showNotification('At least one instruction step is required', 'warning');
                }
            });
            instructionsList.appendChild(item);
        });
        updateStepNumbers();
    }

    // reset bước về Step 1 khi mở edit
    currentStep = 1;
    updateStepDisplay();

    // đổi title modal cho rõ
    const titleText = modal.querySelector('.modal-title-text h3');
    const subText = modal.querySelector('.modal-title-text p');
    if (titleText) titleText.textContent = 'Edit Recipe';
    if (subText) subText.textContent = 'Update your cake recipe';
}

// Create Recipe Modal Functions
// =======================================

let currentStep = 1;
const totalSteps = 4;

function initializeCreateRecipeModal() {
    const modal = document.getElementById('createRecipeModal');
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const nextBtn = document.getElementById('nextBtn');
    const previousBtn = document.getElementById('previousBtn');
    const form = document.getElementById('createRecipeForm');
    const chooseImageBtn = document.getElementById('chooseImageBtn');
    const imageInput = document.getElementById('recipeImageInput');
    const imageUploadArea = document.getElementById('imageUploadArea');
    
    // Close modal events
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCreateRecipeModal);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeCreateRecipeModal);
    }
    
    // Navigation events
    if (nextBtn) {
        nextBtn.addEventListener('click', handleNextStep);
    }
    
    if (previousBtn) {
        previousBtn.addEventListener('click', handlePreviousStep);
    }
    
    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeCreateRecipeModal();
            }
        });
    }
    
    // Image upload events
    if (chooseImageBtn && imageInput) {
        chooseImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();        // không cho nổi bọt
            imageInput.click();
        });
    }

    if (imageInput) {
        imageInput.addEventListener('change', handleRecipeImageUpload);
    }

    // Drag and drop cho vùng upload (KHÔNG handle click nữa)
    if (imageUploadArea) {
        imageUploadArea.addEventListener('dragover', handleImageDragOver);
        imageUploadArea.addEventListener('dragleave', handleImageDragLeave);
        imageUploadArea.addEventListener('drop', handleImageDrop);
    }

    
    // Dynamic form events
    initializeIngredientsList();
    initializeInstructionsList();
    
    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            closeCreateRecipeModal();
        }
    });
}

function openCreateRecipeModal() {
    const modal = document.getElementById('createRecipeModal');
    if (modal) {
        // 🚩 đảm bảo vào chế độ tạo mới
        isEditMode = false;
        currentEditingRecipeId = null;

        // 🚩 set lại title & subtitle đúng cho chế độ Create
        const titleText = modal.querySelector('.modal-title-text h3');
        const subText = modal.querySelector('.modal-title-text p');
        if (titleText) titleText.textContent = 'Create New Recipe';
        if (subText) subText.textContent = 'Add a delicious recipe to your collection';

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        const form = document.getElementById('createRecipeForm');
        if (form) {
            form.reset();
        }

        // reset bước + danh sách ingredient / instruction
        resetModalToStep1();
        resetImageUploadArea();

        const firstInput = modal.querySelector('input[type="text"]');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 300);
        }
    }
}



function closeCreateRecipeModal() {
    const modal = document.getElementById('createRecipeModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';

        const form = document.getElementById('createRecipeForm');
        if (form) {
            form.reset();
        }

        resetImageUploadArea();
        // reset state edit
        isEditMode = false;
        currentEditingRecipeId = null;
        currentStep = 1;
    }
}
function openDeleteRecipeModal(recipeId, recipeName, recipeCard) {
    const modal = document.getElementById('deleteRecipeModal');
    if (!modal) return;

    pendingDeleteRecipeId = recipeId;
    pendingDeleteRecipeName = recipeName;
    pendingDeleteRecipeCard = recipeCard;

    const nameEl = document.getElementById('deleteRecipeName');
    if (nameEl) {
        nameEl.textContent = recipeName || 'Unknown Recipe';
    }

    const subtitle = document.getElementById('deleteRecipeSubtitle');
    if (subtitle) {
        subtitle.textContent = 'This action cannot be undone. Please confirm before deleting.';
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDeleteRecipeModal() {
    const modal = document.getElementById('deleteRecipeModal');
    if (!modal) return;

    modal.classList.remove('active');
    document.body.style.overflow = '';

    pendingDeleteRecipeId = null;
    pendingDeleteRecipeName = '';
    pendingDeleteRecipeCard = null;
}

// Khởi tạo event cho modal delete – gọi trong initializeApp hoặc DOMContentLoaded
function initializeDeleteRecipeModal() {
    const modal = document.getElementById('deleteRecipeModal');
    if (!modal) return;

    const btnClose = document.getElementById('closeDeleteModal');
    const btnCancel = document.getElementById('btnCancelDelete');
    const btnConfirm = document.getElementById('btnConfirmDelete');

    [btnClose, btnCancel].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', closeDeleteRecipeModal);
        }
    });

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeDeleteRecipeModal();
            }
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', handleConfirmDeleteRecipe);
    }
}

async function handleConfirmDeleteRecipe() {
    if (!pendingDeleteRecipeId || !pendingDeleteRecipeCard) {
        showNotification('No recipe selected for deletion', 'error');
        return;
    }

    const btnConfirm = document.getElementById('btnConfirmDelete');
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
    }

    const token = sessionStorage.getItem('auth_token');
    const recipeId = pendingDeleteRecipeId;
    const recipeName = pendingDeleteRecipeName;
    const recipeCard = pendingDeleteRecipeCard;

    recipeCard.classList.add('loading');

    try {
        const res = await fetch(`${API_BASE_URL}/api/owner/recipe/${recipeId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(true)
        });

        const json = await res.json();
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `HTTP ${res.status}`);
        }

        // Xoá card kèm animation
        recipeCard.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => {
            recipeCard.remove();
            updateResultsCount();
        }, 300);

        showNotification(`Recipe "${recipeName}" has been deleted`, 'success');
        closeDeleteRecipeModal();
    } catch (err) {
        console.error('Delete recipe error:', err);
        showNotification('Failed to delete recipe: ' + err.message, 'error');
        recipeCard.classList.remove('loading');
    } finally {
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = '<i class="fa-solid fa-trash"></i> Delete Recipe';
        }
    }
}

async function handleSaveTodayMenu() {
    const hasRows = todayMenuRows.length > 0;
    const hasDeletions = deletedReportIds.length > 0;

    // Không còn dòng nào và cũng không xoá gì trong DB => khỏi gọi API
    if (!hasRows && !hasDeletions) {
        showNotification('No change to save', 'warning');
        return;
    }

    const dateInput = document.getElementById('todayMenuDate');
    if (!dateInput || !dateInput.value) {
        showNotification('Please select production date', 'error');
        return;
    }

    // Lấy owner id
    let ownerId = getCurrentUserId();
    if (!ownerId) {
        ownerId = 1;
    }
    const token = sessionStorage.getItem('auth_token');
    const btnSave = document.getElementById('btnSaveTodayMenu');

    // Chỉ validate quantity với các dòng còn lại
    for (const r of todayMenuRows) {
        if (!r.quantity || r.quantity <= 0) {
            showNotification('Quantity must be greater than 0', 'error');
            return;
        }
    }

    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    try {
        const payload = {
            date: dateInput.value,
            rows: todayMenuRows.map(r => ({
                report_id: r.report_id || null,
                recipe_id: r.recipe_id,
                quantity: r.quantity,
                note: r.note || '',
                status: r.status || "Haven't done",
                created_by: ownerId
            })),
            deleted_ids: deletedReportIds,
            created_by: ownerId
        };

        const res = await fetch(`${API_BASE_URL}/api/owner/production-reports/bulk-save`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `HTTP ${res.status}`);
        }

        showNotification('Today menu has been saved successfully', 'success');
        deletedReportIds = [];
        closeTodayMenuModal();
    } catch (err) {
        console.error('Save today menu error:', err);
        showNotification('Failed to save today menu: ' + err.message, 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="fa-solid fa-save"></i> Save Today Menu';
        }
    }
}

function openRecipeChooserForTodayMenu() {
    if (!allRecipesCache.length) {
        showNotification('No recipes available to choose', 'warning');
        return;
    }

    const modal = document.getElementById('todayMenuChooseRecipeModal');
    const grid = document.getElementById('chooseRecipeGrid');
    const empty = document.getElementById('chooseRecipeEmpty');
    const searchInput = document.getElementById('chooseRecipeSearchInput');

    if (!modal || !grid) return;

    chooseSelectedIds = new Set();

    // render lần đầu
    renderChooseRecipeGrid(allRecipesCache);

    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = debounce(() => {
            const keyword = searchInput.value.trim().toLowerCase();
            const filtered = allRecipesCache.filter(r =>
                (r.name || '').toLowerCase().includes(keyword)
            );
            renderChooseRecipeGrid(filtered);
        }, 200);
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function renderChooseRecipeGrid(recipes) {
    const grid = document.getElementById('chooseRecipeGrid');
    const empty = document.getElementById('chooseRecipeEmpty');
    if (!grid) return;

    grid.innerHTML = '';

    if (!recipes.length) {
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    recipes.forEach(r => {
        const alreadyInMenu = todayMenuRows.some(row => row.recipe_id === r.recipe_id);

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'choose-recipe-card';
        card.dataset.recipeId = r.recipe_id;

        if (alreadyInMenu) {
            card.classList.add('disabled');
        }

        card.innerHTML = `
            <div class="choose-recipe-image">
                <img src="${getRecipeImageUrl(r)}" alt="${r.name}">
            </div>
            <div class="choose-recipe-info">
                <span class="choose-recipe-name">${r.name}</span>
                <span class="choose-recipe-tag">
                    ${alreadyInMenu ? 'Already in today menu' : 'Click to select'}
                </span>
            </div>
            <div class="choose-recipe-checkbox">
                <i class="fa-regular fa-square"></i>
            </div>
        `;

        if (!alreadyInMenu) {
            card.addEventListener('click', () => toggleChooseRecipeCard(card));
        }

        grid.appendChild(card);
    });
}

function toggleChooseRecipeCard(card) {
    const id = Number(card.dataset.recipeId);
    const icon = card.querySelector('.choose-recipe-checkbox i');

    if (chooseSelectedIds.has(id)) {
        chooseSelectedIds.delete(id);
        card.classList.remove('selected');
        if (icon) icon.className = 'fa-regular fa-square';
    } else {
        chooseSelectedIds.add(id);
        card.classList.add('selected');
        if (icon) icon.className = 'fa-solid fa-square-check';
    }
}

function closeChooseRecipeModal() {
    const modal = document.getElementById('todayMenuChooseRecipeModal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
    chooseSelectedIds = new Set();
}

function handleConfirmChooseRecipes() {
    if (!chooseSelectedIds.size) {
        showNotification('Please select at least one recipe', 'warning');
        return;
    }

    allRecipesCache.forEach(r => {
        if (chooseSelectedIds.has(r.recipe_id)) {
            const exists = todayMenuRows.some(row => row.recipe_id === r.recipe_id);
            if (!exists) {
                todayMenuRows.push({
                    report_id: null,
                    recipe_id: r.recipe_id,
                    recipe_name: r.name,
                    quantity: 1,
                    note: '',
                    status: "Haven't done"
                });
            }
        }
    });

    renderTodayMenuTable();
    closeChooseRecipeModal();
}


function handleRecipeImageUpload(event) {
    const files = event.target.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            displaySelectedImage(file);
        } else {
            showNotification('Please select a valid image file', 'error');
        }
    }
}

function handleImageDragOver(event) {
    event.preventDefault();
    event.currentTarget.style.borderColor = '#667eea';
    event.currentTarget.style.background = '#f0f4ff';
}

function handleImageDragLeave(event) {
    event.preventDefault();
    event.currentTarget.style.borderColor = '#d1d5db';
    event.currentTarget.style.background = '#f9fafb';
}

function handleImageDrop(event) {
    event.preventDefault();
    event.currentTarget.style.borderColor = '#d1d5db';
    event.currentTarget.style.background = '#f9fafb';
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            displaySelectedImage(file);
            
            // Update the file input
            const imageInput = document.getElementById('recipeImageInput');
            if (imageInput) {
                const dt = new DataTransfer();
                dt.items.add(file);
                imageInput.files = dt.files;
            }
        } else {
            showNotification('Please select a valid image file', 'error');
        }
    }
}

function displaySelectedImage(file) {
    const uploadArea = document.getElementById('imageUploadArea');
    if (uploadArea) {
        const reader = new FileReader();
        reader.onload = function(e) {
            uploadArea.innerHTML = `
                <div class="selected-image">
                    <img src="${e.target.result}" alt="Selected recipe image" style="max-width: 100%; max-height: 150px; border-radius: 8px; object-fit: cover;">
                    <p style="margin-top: 12px; color: #059669; font-weight: 500;">
                        <i class="fa-solid fa-check-circle"></i> Image selected: ${file.name}
                    </p>
                    <button type="button" class="btn-change-image" style="margin-top: 8px; background: #667eea; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">
                        Change Image
                    </button>
                </div>
            `;
            const imagePathInput = document.getElementById('recipeImagePath');
            if (imagePathInput) {
                imagePathInput.value = file.name; // vd: "MyCake.jpg"
            }
            // Add event listener to change image button
            const changeBtn = uploadArea.querySelector('.btn-change-image');
            if (changeBtn) {
                changeBtn.addEventListener('click', () => {
                    document.getElementById('recipeImageInput').click();
                });
            }
        };
        reader.readAsDataURL(file);
    }
}

function resetImageUploadArea() {
    const uploadArea = document.getElementById('imageUploadArea');
    if (uploadArea) {
        uploadArea.innerHTML = `
            <div class="upload-icon">
                <i class="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <p>Drag and drop or click to upload</p>
            <button type="button" class="btn-choose-image" id="chooseImageBtn">Select Files</button>
        `;
        
        // Gắn lại cho nút, không gắn cho cả vùng
        const chooseBtn = uploadArea.querySelector('#chooseImageBtn');
        if (chooseBtn) {
            chooseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('recipeImageInput').click();
            });
        }
    }
    const imagePathInput = document.getElementById('recipeImagePath');
    if (imagePathInput) {
        imagePathInput.value = '';
    }
}

function getCurrentUserId() {
    try {
        const raw = sessionStorage.getItem('user_info');
        if (!raw) return null;

        const u = JSON.parse(raw);

        // Thử lần lượt các key có thể có
        return (
            u.user_id ||
            u.id ||
            u.userId ||
            u.employee_id ||
            u.owner_id ||
            null
        );
    } catch (e) {
        console.error('Cannot parse user_info from sessionStorage', e);
        return null;
    }
}

async function handleCreateRecipeSubmit(event = null) {
    if (event) {
        event.preventDefault();
    }

    console.log('>>> handleCreateRecipeSubmit START. Edit mode =', isEditMode);

    const form = document.getElementById('createRecipeForm');
    if (!form) {
        showNotification('Form not found', 'error');
        return;
    }

    const formData = new FormData(form);

    let createdBy = getCurrentUserId();
    if (!createdBy) createdBy = 1;

    const token = sessionStorage.getItem('auth_token');

    // ===== 1) UPLOAD ẢNH nếu có file mới =====
    let uploadedImagePath = null;
    const imageInput = document.getElementById('recipeImageInput');
    const hiddenImagePathInput = document.getElementById('recipeImagePath');
    const oldImagePath = hiddenImagePathInput ? hiddenImagePathInput.value : null;

    if (imageInput && imageInput.files && imageInput.files[0]) {
        const imgFile = imageInput.files[0];
        const fd = new FormData();
        fd.append('image', imgFile);

        try {
            const uploadRes = await fetch(`${API_BASE_URL}/api/owner/recipe/upload-image`, {
                method: 'POST',
                headers: getAuthHeaders(false),
                body: fd
            });

            const uploadJson = await uploadRes.json();
            console.log('Upload image response:', uploadJson);

            if (!uploadRes.ok || uploadJson.success === false) {
                throw new Error(uploadJson.error || `Upload image failed (HTTP ${uploadRes.status})`);
            }

            uploadedImagePath = uploadJson.image_path;
        } catch (err) {
            console.error('Upload image error:', err);
            showNotification('Upload image failed, please try again', 'error');
            return;
        }
    } else if (isEditMode && oldImagePath) {
        // không upload mới -> giữ ảnh cũ
        uploadedImagePath = oldImagePath;
    }

    // ===== 2) TẠO PAYLOAD =====
    const payload = {
        menu_name: formData.get('recipeName'),
        description: formData.get('recipeDescription'),
        difficulty: formData.get('difficulty'),
        prep_time: parseInt(formData.get('prepTime') || '0', 10) || null,
        cook_time: parseInt(formData.get('cookTime') || '0', 10) || null,
        serves: parseInt(formData.get('serves') || '0', 10) || null,
        created_by: createdBy,
        image_path: uploadedImagePath,
        ingredients: [],
        instructions: []
    };

    // nếu đang edit thì gửi thêm status cho backend (theo card)
    if (isEditMode) {
        payload.status = 'active'; // nếu sau này bạn có field status chọn trên form thì lấy ở đó
    }

    if (!payload.menu_name || !payload.difficulty ||
        !payload.prep_time || !payload.cook_time || !payload.description) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    // Ingredients
    const ingIds   = formData.getAll('ingredientId[]');
    const ingNames = formData.getAll('ingredientName[]');
    const ingQtys = formData.getAll('ingredientQuantity[]');
    const ingUnits = formData.getAll('ingredientUnit[]');

    ingNames.forEach((name, idx) => {
        name = (name || '').trim();
        const id = parseInt(ingIds[idx] || '0', 10) || null;
        if (!name) return;
        payload.ingredients.push({
            ingredient_id: id,
            ingredient_name: name,
            quantity: parseFloat(ingQtys[idx] || '0') || 0,
            unit: ingUnits[idx] || 'g'
        });
    });

    // Instructions
    const steps = formData.getAll('instructionStep[]');
    steps.forEach(step => {
        const text = (step || '').trim();
        if (text) payload.instructions.push(text);
    });

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.innerHTML = isEditMode ? 'Saving...' : 'Creating...';
    }

    // ===== 3) CALL API (Create / Update) =====
    try {
        const url = isEditMode
            ? `${API_BASE_URL}/api/owner/recipe/${currentEditingRecipeId}`
            : `${API_BASE_URL}/api/owner/recipe/create`;
        const method = isEditMode ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: getAuthHeaders(true),
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        console.log(isEditMode ? 'Update recipe response:' : 'Create recipe response:', json);

        if (!res.ok || (json && json.success === false)) {
            throw new Error(json.error || `HTTP ${res.status}`);
        }

        if (isEditMode) {
            showNotification(`Recipe "${payload.menu_name}" has been updated successfully!`, 'success');
        } else {
            showNotification(`Recipe "${payload.menu_name}" has been created successfully!`, 'success');
        }


        closeCreateRecipeModal();
        loadRecipesFromAPI();

    } catch (err) {
        console.error('Create/Update recipe error:', err);
        showNotification('Failed to save recipe on server: ' + err.message, 'error');
    } finally {
        if (nextBtn) {
            if (currentStep === totalSteps) {
                nextBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Recipe';
            } else {
                nextBtn.innerHTML = 'Next <i class="fa-solid fa-chevron-right"></i>';
            }
            nextBtn.disabled = false;
        }
    }
}



// Add new recipe to UI
function addRecipeToUI(recipeData) {
    const recipesContainer = document.querySelector('.recipes-container');
    if (!recipesContainer) return;
    
    // Calculate total time
    const totalTime = (parseInt(recipeData.prepTime) + parseInt(recipeData.cookTime));
    const timeDisplay = totalTime >= 60 ? `${Math.floor(totalTime/60)}h ${totalTime%60}min` : `${totalTime}min`;
    
    // Get current date
    const currentDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
    
    // Create image URL (use placeholder if no image uploaded)
    const imageUrl = recipeData.image && recipeData.image.size > 0 
        ? URL.createObjectURL(recipeData.image) 
        : 'assets/img/placeholder.jpg';
    
    // Create new recipe card
    const newRecipeCard = document.createElement('div');
    newRecipeCard.className = 'recipe-card';
    newRecipeCard.setAttribute('data-status', 'active');
    
    newRecipeCard.innerHTML = `
        <div class="recipe-image">
            <img src="${imageUrl}" alt="${recipeData.name}">
        </div>
        <div class="recipe-content">
            <div class="recipe-header">
                <h3 class="recipe-title">${recipeData.name}</h3>
                <div class="recipe-status">
                    <span class="status-badge status-active">Active</span>
                </div>
            </div>
            <p class="recipe-description">${recipeData.description}</p>
            <div class="recipe-meta">
                <span class="recipe-time"><i class="fa-regular fa-clock"></i> ${timeDisplay}</span>
                <span class="recipe-servings"><i class="fa-solid fa-users"></i> 4 servings</span>
            </div>
            <div class="recipe-updated">Updated: ${currentDate}</div>
            <div class="recipe-actions">
                <button class="btn-action btn-view" title="View Recipe">
                    <i class="fa-regular fa-eye"></i>
                </button>
                <button class="btn-action btn-edit" title="Edit Recipe">
                    <i class="fa-regular fa-edit"></i>
                </button>
                <button class="btn-action btn-delete" title="Delete Recipe">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    
    // Add event listeners for the new recipe actions
    const viewBtn = newRecipeCard.querySelector('.btn-view');
    const editBtn = newRecipeCard.querySelector('.btn-edit');
    const deleteBtn = newRecipeCard.querySelector('.btn-delete');
    
    if (viewBtn) {
        viewBtn.addEventListener('click', () => handleViewRecipe(recipeData));
    }
    
    if (editBtn) {
        editBtn.addEventListener('click', () => handleEditRecipe(recipeData));
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDeleteRecipe(newRecipeCard, recipeData));
    }
    
    // Insert the new recipe at the beginning of the container
    recipesContainer.insertBefore(newRecipeCard, recipesContainer.firstChild);
    
    // Add a subtle animation
    newRecipeCard.style.opacity = '0';
    newRecipeCard.style.transform = 'translateY(20px)';
    setTimeout(() => {
        newRecipeCard.style.transition = 'all 0.3s ease';
        newRecipeCard.style.opacity = '1';
        newRecipeCard.style.transform = 'translateY(0)';
    }, 100);
}

// Multi-step navigation functions
function handleNextStep() {
    if (validateCurrentStep()) {
        if (currentStep < totalSteps) {
            currentStep++;
            updateStepDisplay();
            if (currentStep === totalSteps) {
                populateReviewStep();
            }
        } else {
            // Final step - save recipe
            handleCreateRecipeSubmit();
        }
    }
}

function handlePreviousStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepDisplay();
    }
}

function updateStepDisplay() {
    // Update progress indicators
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        step.classList.remove('active', 'completed');
        if (index + 1 < currentStep) {
            step.classList.add('completed');
        } else if (index + 1 === currentStep) {
            step.classList.add('active');
        }
    });

    // Update form steps
    document.querySelectorAll('.form-step').forEach((step, index) => {
        step.classList.remove('active');
        if (index + 1 === currentStep) {
            step.classList.add('active');
        }
    });

    // Update buttons
    const previousBtn = document.getElementById('previousBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (previousBtn) {
        previousBtn.style.display = currentStep > 1 ? 'flex' : 'none';
    }
    
    if (nextBtn) {
        if (currentStep === totalSteps) {
            nextBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Recipe';
        } else {
            nextBtn.innerHTML = 'Next <i class="fa-solid fa-chevron-right"></i>';
        }
    }
}

function validateCurrentStep() {
    const currentStepElement = document.getElementById(`step${currentStep}`);
    if (!currentStepElement) return true;

    const requiredFields = currentStepElement.querySelectorAll('[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.style.borderColor = '#ef4444';
            isValid = false;
        } else {
            field.style.borderColor = '#d1d5db';
        }
    });

    if (!isValid) {
        showNotification('Please fill in all required fields', 'error');
    }

    return isValid;
}

function populateReviewStep() {
    const reviewContent = document.getElementById('reviewContent');
    if (!reviewContent) return;

    const formData = new FormData(document.getElementById('createRecipeForm'));
    
    // Get ingredients
    const ingredientNames = formData.getAll('ingredientName[]');
    const ingredientQuantities = formData.getAll('ingredientQuantity[]');
    const ingredientUnits = formData.getAll('ingredientUnit[]');
    
    // Get instructions
    const instructions = formData.getAll('instructionStep[]');
    
    const totalTime = (parseInt(formData.get('prepTime') || 0) + parseInt(formData.get('cookTime') || 0));
    
    reviewContent.innerHTML = `
        <div class="review-item">
            <div class="review-label">${formData.get('recipeName') || 'Untitled Recipe'}</div>
            <div class="review-value">${formData.get('recipeDescription') || 'No description provided'}</div>
        </div>
        
        <div class="review-item">
            <div class="review-label">Difficulty</div>
            <div class="review-value">${formData.get('difficulty') || 'Medium'}</div>
        </div>
        
        <div class="review-item">
            <div class="review-label">Prep Time</div>
            <div class="review-value">${formData.get('prepTime') || 0} mins</div>
        </div>
        
        <div class="review-item">
            <div class="review-label">Cook Time</div>
            <div class="review-value">${formData.get('cookTime') || 0} mins</div>
        </div>
        
        <div class="review-item">
            <div class="review-label">Total Time</div>
            <div class="review-value">${totalTime} mins</div>
        </div>
        
        <div class="review-item">
            <div class="review-label">Ingredients (${ingredientNames.length})</div>
            <ul class="review-list">
                ${ingredientNames.map((name, i) => 
                    name ? `<li>${formatQuantityDisplay(ingredientQuantities[i])} ${ingredientUnits[i]} ${name}</li>` : ''
                ).join('')}
            </ul>
        </div>
        
        <div class="review-item">
            <div class="review-label">Instructions (${instructions.filter(i => i.trim()).length} steps)</div>
            <ul class="review-list">
                ${instructions.map((instruction, i) => 
                    instruction.trim() ? `<li>Step ${i + 1}: ${instruction}</li>` : ''
                ).join('')}
            </ul>
        </div>
    `;
}

// Dynamic ingredients list
function initializeIngredientsList() {
    const addBtn = document.getElementById('addIngredientBtn');
    if (addBtn) {
        addBtn.addEventListener('click', addIngredientItem);
    }
     document.querySelectorAll('#ingredientsList .ingredient-item').forEach(row => {
    bindIngredientAutocomplete(row);
});
}

function addIngredientItem() {
    const ingredientsList = document.getElementById('ingredientsList');
    if (!ingredientsList) return;

    const newItem = document.createElement('div');
    newItem.className = 'ingredient-item';
    newItem.innerHTML = `
        <div class="form-group">
            <input type="text" name="ingredientName[]" class="ingredient-name" placeholder="Search ingredient..." autocomplete="off" required>
            <input type="hidden" name="ingredientId[]" class="ingredient-id">
            <div class="ingredient-suggest hidden"></div>
        </div>
        <div class="form-group">
            <input type="number" name="ingredientQuantity[]" placeholder="1" min="0" step="1" value="1" required>
        </div>
        <div class="form-group">
            <select name="ingredientUnit[]" required>
                <option value="Kg">Kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="ml">ml</option>
                <option value="pcs">pcs</option>
                <option value="pack">pack</option>
                <option value="bag">bag</option>
                <option value="box">box</option>
            </select>
        </div>
        <button type="button" class="btn-remove-ingredient" title="Remove ingredient">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;

    // Add remove functionality
    const removeBtn = newItem.querySelector('.btn-remove-ingredient');
    removeBtn.addEventListener('click', () => {
        newItem.remove();
    });

    ingredientsList.appendChild(newItem);
    bindIngredientAutocomplete(newItem);

}

// Dynamic instructions list
function initializeInstructionsList() {
    const addBtn = document.getElementById('addStepBtn');
    const instructionsList = document.getElementById('instructionsList');
    
    if (addBtn) {
        addBtn.addEventListener('click', addInstructionStep);
    }

    // Initialize existing remove buttons
    if (instructionsList) {
        instructionsList.addEventListener('click', (e) => {
            if (e.target.closest('.btn-remove-step')) {
                const item = e.target.closest('.instruction-item');
                if (instructionsList.children.length > 1) {
                    item.remove();
                    updateStepNumbers();
                } else {
                    showNotification('At least one instruction step is required', 'warning');
                }
            }
        });
    }
}

function addInstructionStep() {
    const instructionsList = document.getElementById('instructionsList');
    if (!instructionsList) return;

    const stepNumber = instructionsList.children.length + 1;
    const newItem = document.createElement('div');
    newItem.className = 'instruction-item';
    newItem.innerHTML = `
        <div class="step-number">${stepNumber}</div>
        <textarea name="instructionStep[]" placeholder="Step ${stepNumber}: Describe what to do..." required></textarea>
        <button type="button" class="btn-remove-step" title="Remove step">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;

    instructionsList.appendChild(newItem);
}

function updateStepNumbers() {
    const instructionsList = document.getElementById('instructionsList');
    if (!instructionsList) return;

    const items = instructionsList.querySelectorAll('.instruction-item');
    items.forEach((item, index) => {
        const stepNumber = item.querySelector('.step-number');
        const textarea = item.querySelector('textarea');
        
        if (stepNumber) {
            stepNumber.textContent = index + 1;
        }
        
        if (textarea) {
            textarea.placeholder = `Step ${index + 1}: Describe what to do...`;
        }
    });
}

// Reset modal to step 1
function resetModalToStep1() {
    currentStep = 1;
    updateStepDisplay();
    
    // Reset ingredients list to one item
    const ingredientsList = document.getElementById('ingredientsList');
    if (ingredientsList) {
        const items = ingredientsList.querySelectorAll('.ingredient-item');
        items.forEach((item, index) => {
            if (index > 0) item.remove();
        });
    }
    
    // Reset instructions list to two items
    const instructionsList = document.getElementById('instructionsList');
    if (instructionsList) {
        const items = instructionsList.querySelectorAll('.instruction-item');
        items.forEach((item, index) => {
            if (index > 1) item.remove();
        });
        updateStepNumbers();
    }
}

// Recipe Tabs functionality
function initializeRecipeTabs() {
    console.log('Initializing recipe tabs...'); // Debug log
    const tabButtons = document.querySelectorAll('.tab-button');
    console.log('Found tab buttons:', tabButtons.length); // Debug log
    
    if (tabButtons.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', handleTabClick);
        });
    }
}
function handleTabClick(event) {
    console.log('Tab clicked:', event.target); // Debug log
    const clickedTab = event.target;
    const tabData = clickedTab.getAttribute('data-tab');
    console.log('Tab data:', tabData); // Debug log
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Add active class to clicked tab
    clickedTab.classList.add('active');
    
    // Handle tab content switching
    if (tabData === 'cake-recipes') {
        showCakeRecipes();
    } else if (tabData === 'suggest-recipes') {
        showSuggestRecipes();
    }
}

function showCakeRecipes() {
    const recipesContainer = document.getElementById('recipesContainer');
    const suggestionContainer = document.getElementById('suggestionContainer');
    const pagination = document.getElementById('recipesPagination');

    if (recipesContainer) recipesContainer.classList.remove('hidden');
    if (suggestionContainer) suggestionContainer.classList.add('hidden');
    if (pagination) pagination.style.display = filteredRecipesCache.length > RECIPES_PAGE_SIZE ? 'flex' : 'none';
}

function showSuggestRecipes() {
    const recipesContainer = document.getElementById('recipesContainer');
    const suggestionContainer = document.getElementById('suggestionContainer');
    const loading = document.getElementById('recipesLoading');
    const pagination = document.getElementById('recipesPagination');

    if (recipesContainer) recipesContainer.classList.add('hidden');

    // ✅ QUAN TRỌNG: show container TRƯỚC
    if (suggestionContainer) suggestionContainer.classList.remove('hidden');

    if (loading) loading.classList.add('hidden');
    if (pagination) pagination.style.display = 'none';

    // ✅ delay 1 tick để DOM chắc chắn render xong
    setTimeout(() => {
        if (window.__loadRecipeSubstitutes) {
            console.log('[TAB] load recipe substitutes');
            window.__loadRecipeSubstitutes();
        }
    }, 0);
}




function formatQuantityDisplay(val) {
    const num = parseFloat(val);
    if (!Number.isFinite(num)) return val || '0';
    return num.toFixed(2).replace(/\.0+$/, '').replace(/\.$/, '');
}
async function fetchIngredients(keyword) {
  const res = await fetch(`${API_BASE_URL}/api/ingredients?q=${encodeURIComponent(keyword)}&limit=20`);
  const json = await res.json();
  if (!res.ok || !json.success) return [];
  return json.data || [];
}

function bindIngredientAutocomplete(rowEl) {
  const input = rowEl.querySelector('.ingredient-name');
  const hiddenId = rowEl.querySelector('.ingredient-id');
  const box = rowEl.querySelector('.ingredient-suggest');

  let lastItems = [];

  input.addEventListener('input', debounce(async () => {
    const q = input.value.trim();
    hiddenId.value = "";          // user gõ lại thì reset id
    if (!q) { box.classList.add('hidden'); box.innerHTML = ""; return; }

    lastItems = await fetchIngredients(q);
    if (!lastItems.length) { box.classList.add('hidden'); box.innerHTML = ""; return; }

    box.innerHTML = lastItems.map(it => `
      <button type="button" class="suggest-item" data-id="${it.ingredient_id}" data-name="${it.name}" data-unit="${it.unit || ''}">
        ${it.name} ${it.unit ? `<span class="muted">(${it.unit})</span>` : ''}
      </button>
    `).join("");

    box.classList.remove('hidden');
  }, 250));

  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.suggest-item');
    if (!btn) return;
    input.value = btn.dataset.name;
    hiddenId.value = btn.dataset.id;
     // ✅ auto fill unit
  const unitFromApi = (btn.dataset.unit || '').trim();     // vd: "g", "Kg", "ml"
  const unitSelect = rowEl.querySelector('select[name="ingredientUnit[]"]');

  if (unitSelect && unitFromApi) {
    // normalize để match option (case-insensitive)
    const target = unitFromApi.toLowerCase();
    const opt = Array.from(unitSelect.options).find(o => (o.value || '').toLowerCase() === target);
    if (opt) unitSelect.value = opt.value;
  }
    box.classList.add('hidden');
    box.innerHTML = "";
  });

  document.addEventListener('click', (e) => {
    if (!rowEl.contains(e.target)) {
      box.classList.add('hidden');
    }
  });
}
// ===============================
// FIX: Refresh list button
// ===============================
document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('btnRefreshSuggestions');
  if (!btnRefresh) {
    console.warn('[Suggest] Refresh button not found');
    return;
  }

  btnRefresh.addEventListener('click', () => {
    console.log('[Suggest] Refresh list clicked');
    if (window.__loadRecipeSubstitutes) {
      window.__loadRecipeSubstitutes();
    } else {
      console.error('[Suggest] __loadRecipeSubstitutes not found');
    }
  });
});
