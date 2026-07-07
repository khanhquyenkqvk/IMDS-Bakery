const API_BASE = `${location.origin}/api`;

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('.table.ingredients .tbody');
  const addLineLink = document.querySelector('.add-line');
  const btnCancel = document.getElementById('btnCancel');
  const btnReset = document.getElementById('btnReset');
  const btnSave = document.getElementById('btnSave');
  const shipmentDate = document.getElementById('date');
  const shipmentBatch = document.getElementById('batchCode');
  const elDateHeader = document.querySelector('.header .date');
  const elTimeHeader = document.querySelector('.header .time');
  const elUserHeader = document.querySelector('.header .user-name');
  const suggestionsDropdown = document.getElementById('recipeSuggestionsDropdown');
  let suggestionsCache = [];
  

  function updateDeleteState() {
    const rows = tbody.querySelectorAll('.tr');
    rows.forEach((row) => {
      const delBtn = row.querySelector('.row-del');
      if (!delBtn) return;
      delBtn.disabled = rows.length <= 1;
    });
  }
  if (suggestionsDropdown) {
    suggestionsDropdown.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      if (Number.isNaN(idx)) return;
      const item = suggestionsCache[idx];
      if (!item) return;
      fillImportRowFromSuggestion(item.name, item.unit, item.recommended_quantity || item.needed_per_batch || 0);
      // reset selection
      suggestionsDropdown.value = '';
    });
  }

// === helpers lô ===
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function peekNextBatchCode() {
  const today = todayISO();
  const todayKey = `batch_count_${today}`;
  const lastDateKey = `last_batch_date`;

  const lastDate = localStorage.getItem(lastDateKey);
  if (lastDate !== today) {
    Object.keys(localStorage).forEach(k => k.startsWith('batch_count_') && localStorage.removeItem(k));
    localStorage.setItem(lastDateKey, today);
  }

  const count = parseInt(localStorage.getItem(todayKey) || '0');
  const next = count + 1;
  return `L${today}-${String(next).padStart(2, '0')}`;
}

function getActiveBatchCode() {
  const today = todayISO();
  const active = localStorage.getItem('active_batch_code');
  const activeDate = localStorage.getItem('active_batch_date');
  if (active && activeDate === today) return active;

  const code = peekNextBatchCode();
  localStorage.setItem('active_batch_code', code);
  localStorage.setItem('active_batch_date', today);
  return code;
}

function finalizeBatchAndStepCounter() {
  const today = todayISO();
  const todayKey = `batch_count_${today}`;
  const current = parseInt(localStorage.getItem(todayKey) || '0');
  localStorage.setItem(todayKey, String(current + 1));   // ✅ tăng đếm

  // clear phiên hiện tại
  localStorage.removeItem('active_batch_code');
  localStorage.removeItem('active_batch_date');

  // (tùy chọn) dọn draft
  sessionStorage.removeItem('ingredients_to_save');
  sessionStorage.removeItem('saved_import_result');
  sessionStorage.removeItem('ingredients_to_restore');
  sessionStorage.removeItem('import_meta');
}
  

  // Fallback EN-only formatters (used only if GlobalLanguage is unavailable)
  function formatHeaderDate(d) {
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
  }
  function formatHeaderTime(d) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${String(h).padStart(2,'0')}:${m} ${ampm}`;
  }

  function createRowElement() {
    const wrapper = document.createElement('div');
    wrapper.className = 'tr';
    wrapper.innerHTML = `
      <div class="td product"><input type="text" placeholder="Enter the name of the product"></div>
      <div class="td qty"><input type="number" value="0" aria-label="Quantity" title="Quantity"></div>
      <div class="td unit">
        <select aria-label="Unit" title="Unit">
          <option>Kg</option>
          <option>g</option>
          <option>L</option>
          <option>ml</option>
          <option>pcs</option>
          <option>pack</option>
          <option>bag</option>
          <option>box</option>
        </select>
      </div>
      <div class="td date"><input type="date" aria-label="Use-by date" title="Use-by date" value="${todayISO()}"></div>
      <div class="td note"><input type="text" placeholder="Notes (optional)"></div>
      <div class="td actions">
        <button class="row-del" title="Remove row"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    return wrapper;
  }

  function addRowAfter(targetRow) {
    console.log('🔍 addRowAfter called');
    const newRow = createRowElement();
    if (targetRow && targetRow.parentElement === tbody) {
      targetRow.insertAdjacentElement('afterend', newRow);
    } else {
      tbody.appendChild(newRow);
    }
    updateDeleteState();
  }

  // Simple add line handler - only works on exact button click
  if (addLineLink) {
    console.log('🔧 Setting up add-line button (simple approach)...');
    
    // Remove all existing listeners
    const newAddLineLink = addLineLink.cloneNode(true);
    addLineLink.parentNode.replaceChild(newAddLineLink, addLineLink);
    
    // Single, simple click handler
    newAddLineLink.addEventListener('click', function(e) {
      // Only proceed if clicked exactly on the add-line element or its direct children
      const clickedElement = e.target;
      const addLineElement = e.currentTarget;
      
      console.log('🎯 Click detected:', clickedElement.tagName, clickedElement.className);
      console.log('🎯 Current target:', addLineElement.className);
      
      // Check if click is on add-line or its direct children (i, span)
      if (clickedElement === addLineElement || 
          clickedElement.parentElement === addLineElement ||
          clickedElement.closest('.add-line') === addLineElement) {
        
        e.preventDefault();
        e.stopPropagation();
        
        console.log('✅ Valid add-line click - adding row...');
        const newRow = createRowElement();
        tbody.appendChild(newRow);
        updateDeleteState();
        console.log('✅ Row added successfully!');
      } else {
        console.log('❌ Invalid click target, ignoring');
      }
    });
  }

  // Event delegation for delete only
  tbody.addEventListener('click', (e) => {
    // Only handle delete button clicks, ignore other clicks
    const delBtn = e.target.closest('.row-del');
    if (delBtn && !delBtn.disabled) {
      e.preventDefault();
      e.stopPropagation();
      const row = delBtn.closest('.tr');
      row.remove();
      updateDeleteState();
    }
  });

  // Cancel -> back to homepage
if (btnCancel) {
  btnCancel.addEventListener('click', () => {
    finalizeBatchAndStepCounter();
    window.location.href = '../homepage/index.html';
  });
}


  // Re-enter -> clear all inputs
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      tbody.querySelectorAll('.tr').forEach((row, index) => {
        const product = row.querySelector('.td.product input');
        const qty = row.querySelector('.td.qty input');
        const unit = row.querySelector('.td.unit select');
        const date = row.querySelector('.td.date input');
        const note = row.querySelector('.td.note input');
        if (product) product.value = '';
        if (qty) qty.value = '0';
        if (unit) unit.selectedIndex = 0;
        if (date) date.value = todayISO();
        if (note) note.value = '';
      });
    });
  }

  // Save button - Remove event listener to avoid conflicts
  // Navigation is handled by onclick in HTML

  // Logout functionality
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      // Clear session data
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('user_info');
      sessionStorage.removeItem('ingredients_to_save');
      sessionStorage.removeItem('ingredients_to_restore');
      
      // Redirect to login page
      window.location.href = '../../login/index.html';
    });
  }
  // ===== RECIPE INGREDIENT SUGGESTIONS =====
async function loadRecipeImportSuggestions() {
  const listEl = document.getElementById('recipeSuggestionsList');
  if (!listEl || !suggestionsDropdown) return;

  listEl.innerHTML = `
    <div class="loading">Loading suggestions...</div>
  `;
  suggestionsCache = [];
  suggestionsDropdown.innerHTML = `
    <option value="">Choose ingredient</option>
  `;

  try {
    const resp = await fetch(`${API_BASE}/import-suggestions`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const result = await resp.json();

    // No data
    if (!result.success || !Array.isArray(result.data) || !result.data.length) {
      listEl.innerHTML = `
        <div class="empty-text">No missing ingredients detected.</div>
      `;
      suggestionsCache = [];
      suggestionsDropdown.innerHTML = `
        <option value="">No missing ingredients</option>
      `;
      return;
    }

    suggestionsCache = result.data;
    listEl.classList.add('empty');
    listEl.innerHTML = '';

    result.data.forEach((item, idx) => {
      const option = document.createElement('option');
      option.value = idx;
      option.textContent = `${item.name} (${item.unit}) - Need ${item.needed_per_batch} / Stock ${item.current_stock}`;
      suggestionsDropdown.appendChild(option);
    });

  } catch (err) {
    console.error('Cannot load suggestions:', err);
    listEl.innerHTML = `
      <div class="empty-text">Error loading suggestions. Please try again.</div>
    `;
    suggestionsDropdown.innerHTML = `
      <option value="">Error loading</option>
    `;
    suggestionsCache = [];
  }
}


  function fillImportRowFromSuggestion(name, unit, qty) {
    const rows = tbody.querySelectorAll('.tr');

    // tìm dòng đầu tiên đang trống tên
    let target = null;
    rows.forEach(row => {
      const nameInput = row.querySelector('.td.product input');
      if (!target && nameInput && !nameInput.value.trim()) {
        target = row;
      }
    });

    // nếu không có dòng trống → thêm dòng mới
    if (!target) {
      target = createRowElement();
      tbody.appendChild(target);
      updateDeleteState();
    }

    const nameInput = target.querySelector('.td.product input');
    const qtyInput  = target.querySelector('.td.qty input');
    const unitSelect = target.querySelector('.td.unit select');
    const dateInput = target.querySelector('.td.date input');

    if (nameInput) nameInput.value = name;
    if (qtyInput)  qtyInput.value  = qty && qty > 0 ? qty : 0;
    if (unitSelect) {
      let matched = false;
      unitSelect.querySelectorAll('option').forEach(opt => {
        if (opt.textContent.trim().toLowerCase() === String(unit || '').toLowerCase()) {
          opt.selected = true;
          matched = true;
        }
      });
      if (!matched) unitSelect.selectedIndex = 0;
    }
    if (dateInput && !dateInput.value) {
      dateInput.value = todayISO();
    }

    // focus vào ô hạn dùng để employee chỉ cần chọn ngày
    if (dateInput) dateInput.focus();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // click handler cho list gợi ý
  const suggestList = document.getElementById('recipeSuggestionsList');
  if (suggestList) {
    suggestList.addEventListener('click', (e) => {
      const item = e.target.closest('.suggest-item');
      if (!item) return;
      const name = item.dataset.name;
      const unit = item.dataset.unit;
      const qty  = parseFloat(item.dataset.qty || '0') || 0;
      fillImportRowFromSuggestion(name, unit, qty);
    });
  }

  // gọi khi load trang
  loadRecipeImportSuggestions();

  // Initialize state
  updateDeleteState();
  
  // Check for ingredients to restore from save page
  const ingredientsToRestore = sessionStorage.getItem('ingredients_to_restore');
  if (ingredientsToRestore) {
    try {
      const ingredients = JSON.parse(ingredientsToRestore);
      console.log('Restoring ingredients from save page:', ingredients);
      
      // Clear existing rows first (but keep at least one empty row if no ingredients)
      tbody.innerHTML = '';
      
      // Add each ingredient as a new row
      ingredients.forEach((ingredient, index) => {
        const newRow = createRowElement();
        
        // Fill in the data
        const productInput = newRow.querySelector('.td.product input');
        const qtyInput = newRow.querySelector('.td.qty input');
        const unitSelect = newRow.querySelector('.td.unit select');
        const dateInput = newRow.querySelector('.td.date input');
        const noteInput = newRow.querySelector('.td.note input');
        
        if (productInput) productInput.value = ingredient.product || '';
        if (qtyInput) qtyInput.value = ingredient.quantity || '0';
        if (unitSelect) {
          // Find matching unit option
          const options = unitSelect.querySelectorAll('option');
          for (let option of options) {
            if (option.textContent.trim() === ingredient.unit) {
              option.selected = true;
              break;
            }
          }
        }
        if (dateInput) dateInput.value = ingredient.useByDate || todayISO();
        if (noteInput) noteInput.value = ingredient.note || '';
        
        tbody.appendChild(newRow);
      });
      
      // Clear the restoration data
      sessionStorage.removeItem('ingredients_to_restore');
      
      // Update delete state for restored rows
      updateDeleteState();
      
    } catch (error) {
      console.warn('Could not restore ingredients:', error);
      sessionStorage.removeItem('ingredients_to_restore');
    }
  } else {
    // No ingredients to restore, ensure there's at least one empty row
    if (tbody.children.length === 0) {
      const emptyRow = createRowElement();
      tbody.appendChild(emptyRow);
      updateDeleteState();
    }
  }
  
  // Ensure initial date input(s) have today's date
  tbody.querySelectorAll('.td.date input').forEach((el) => {
    if (!el.value) el.value = todayISO();
  });

// Set shipment info defaults
if (shipmentDate) {
  shipmentDate.value = todayISO();
}
if (shipmentBatch) {
  shipmentBatch.value = getActiveBatchCode(); 
}

  // Header realtime
  (function initHeader() {
    function tickHeader() {
      if (window.GlobalLanguage && typeof window.GlobalLanguage.updateDateTime === 'function') {
        window.GlobalLanguage.updateDateTime();
        return;
      }
      const now = new Date();
      if (elDateHeader) elDateHeader.textContent = formatHeaderDate(now);
      if (elTimeHeader) elTimeHeader.textContent = formatHeaderTime(now);
    }
    tickHeader();
    setInterval(tickHeader, 60000);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
      if (userInfo && userInfo.username && elUserHeader) {
        elUserHeader.textContent = userInfo.username;
      }
    } catch (_) {}
  })();
  window.finalizeBatchAndStepCounter = finalizeBatchAndStepCounter;
window.getActiveBatchCode = getActiveBatchCode;
  // ===============================
// INGREDIENT AUTOCOMPLETE (Product Name)
// ===============================
const SUGGEST_API = `${API_BASE}/ingredients/suggest`;

function ensureSuggestBox(inputEl) {
  const td = inputEl.closest('.td.product');
  if (!td) return null;

  td.style.position = 'relative';

  let box = td.querySelector('.suggest-box');
  if (box) return box;

  box = document.createElement('div');
  box.className = 'suggest-box';
  box.style.cssText = `
    position:absolute; left:0; right:0; top:calc(100% + 6px);
    background:#fff; border:1px solid #e5e7eb; border-radius:10px;
    box-shadow:0 10px 20px rgba(0,0,0,.08);
    max-height:240px; overflow:auto; z-index:9999; display:none;
  `;
  td.appendChild(box);
  return box;
}

async function fetchSuggest(q) {
  const url = `${SUGGEST_API}?q=${encodeURIComponent(q)}&limit=8`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const j = await resp.json();
  return (j && j.success && Array.isArray(j.data)) ? j.data : [];
}

function renderSuggest(box, items) {
  if (!box) return;
  if (!items.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  box.innerHTML = items.map(it => `
    <div class="suggest-item"
      data-id="${it.ingredient_id}"
      data-name="${String(it.name || '').replace(/"/g, '&quot;')}"
      data-unit="${String(it.unit || '').replace(/"/g, '&quot;')}"
      style="padding:10px 12px; cursor:pointer; display:flex; justify-content:space-between; gap:12px;">
      <div style="font-weight:600; color:#111827;">${it.name}</div>
      <div style="font-size:12px; color:#6b7280;">${it.unit || ''}</div>
    </div>
  `).join('');

  box.style.display = 'block';
}

let __suggestTimer = null;

// 1) Gõ -> hiện gợi ý
tbody.addEventListener('input', (e) => {
  const input = e.target.closest('.td.product input');
  if (!input) return;

  // Nếu user gõ lại => clear ingredient_id cũ (tránh chọn 1 cái rồi sửa chữ)
  input.dataset.ingredientId = '';

  const q = (input.value || '').trim();
  const box = ensureSuggestBox(input);

  clearTimeout(__suggestTimer);

  if (q.length < 2) { // >=2 ký tự mới suggest
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    return;
  }

  __suggestTimer = setTimeout(async () => {
    const items = await fetchSuggest(q).catch(() => []);
    renderSuggest(box, items);
  }, 120);
});

// 2) Click item -> fill name + unit + lưu ingredient_id
tbody.addEventListener('click', (e) => {
  const item = e.target.closest('.suggest-item');
  if (!item) return;

  const row = item.closest('.tr');
  const nameInput = row.querySelector('.td.product input');
  const unitSelect = row.querySelector('.td.unit select');

  const ingId = item.dataset.id || '';
  const name = item.dataset.name || '';
  const unit = item.dataset.unit || '';

  if (nameInput) {
    nameInput.value = name;
    nameInput.dataset.ingredientId = ingId; // ✅ rất quan trọng
  }

  if (unitSelect && unit) {
    let matched = false;
    unitSelect.querySelectorAll('option').forEach(opt => {
      if (opt.textContent.trim().toLowerCase() === unit.trim().toLowerCase()) {
        opt.selected = true;
        matched = true;
      }
    });
    if (!matched) unitSelect.selectedIndex = 0;
  }

  // Hide dropdown
  const box = row.querySelector('.suggest-box');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }

  // Focus qty
  try { row.querySelector('.td.qty input')?.focus(); } catch (_) {}
});

// 3) Click ra ngoài -> đóng dropdown
document.addEventListener('click', (e) => {
  if (e.target.closest('.td.product')) return;
  document.querySelectorAll('.suggest-box').forEach(b => {
    b.style.display = 'none';
    b.innerHTML = '';
  });
});
});

// Global function to navigate to save ingredients page
function navigateToSaveIngredients() {
  console.log('navigateToSaveIngredients called!');
  
  try {
    const tbody = document.querySelector('.table.ingredients .tbody');
    if (!tbody) {
      console.log('tbody not found, navigating anyway');
      window.location.href = 'save-ingredients.html';
      return;
    }
    
    // Check if there are any ingredients to save
    const hasIngredients = Array.from(tbody.querySelectorAll('.tr')).some(row => {
      const product = row.querySelector('.td.product input')?.value?.trim();
      return product && product.length > 0;
    });
    
    console.log('Has ingredients:', hasIngredients);
    
    if (hasIngredients) {
      // Save current data as draft before navigating
      const data = [];
      tbody.querySelectorAll('.tr').forEach((row) => {
        const product = row.querySelector('.td.product input')?.value?.trim() || '';
        if (!product) return;
        const qty = parseFloat(row.querySelector('.td.qty input')?.value || '0') || 0;
        const unit = row.querySelector('.td.unit select')?.value || '';
        const date = row.querySelector('.td.date input')?.value || '';
        const note = row.querySelector('.td.note input')?.value?.trim() || '';
        data.push({ product, quantity: qty, unit, useByDate: date, note });
      });
      
      console.log('Saving data to sessionStorage:', data);
      sessionStorage.setItem('ingredients_to_save', JSON.stringify(data));
    }
    
    // Clear any existing navigation timeouts
    if (window.navigationTimeout) {
      clearTimeout(window.navigationTimeout);
    }
    
    // Navigate to save ingredients page with slight delay
    console.log('Navigating to save-ingredients.html');
    window.navigationTimeout = setTimeout(() => {
      window.location.href = 'save-ingredients.html';
    }, 100);
    
  } catch (error) {
    console.error('Error in navigateToSaveIngredients:', error);
    // Fallback navigation
    window.location.href = 'save-ingredients.html';
  }

}

