// assets/js/recipe.js (Fixed: Declared statusText/statusClass in scope; minor cleanup for duplication)
document.addEventListener("DOMContentLoaded", async () => {  // async for await
  // ---- Clock ----
  function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const clockElement = document.getElementById("clock");
    if (clockElement) clockElement.textContent = time;
  }
  setInterval(updateClock, 1000);
  updateClock();

  // API Base URL
const API_BASE = window.API_BASE || `${location.origin}/api`;
  function getCurrentUserId() {
  try {
    const info = JSON.parse(sessionStorage.getItem('user_info') || '{}');
    return info.user_id || info.id || info.employee_id || null;
  } catch (e) {
    console.warn('Cannot parse user_info from sessionStorage', e);
    return null;
  }
}
async function fetchApprovedSubstitute(recipeId) {
  const token = sessionStorage.getItem('auth_token');

  const url = `${API_BASE}/employee/recipe-substitutes/approved?recipe_id=${encodeURIComponent(recipeId)}`;
  console.log("[APPROVED] GET", url, "hasToken=", !!token);

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  });

  const json = await res.json().catch(() => ({}));
  console.log("[APPROVED] status=", res.status, "json=", json);

  if (!res.ok) return null;
  if (!json.success) return null;

  return json.data || null;
}


async function applyApprovedSubstitute(suggestionId) {
  const token = sessionStorage.getItem('auth_token');
  const userId = getCurrentUserId();
  const res = await fetch(`${API_BASE}/employee/recipe-substitutes/${suggestionId}/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { 'X-User-Id': String(userId) } : {}),
    }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
  return true;
}

  // Image mapping for recipe list
  const IMG_MAP = {
    1: "Pink-Strawberry-Cake.webp",
    2: "Choco-Tiramisu.webp",
    3: "Sweet-Vanilla-Cupcake.webp",
    4: "Blueberry-Muffins.png",
    5: "Classic-Tiramisu.jpg",
    6: "French-Macarons.jpg",
    7: "Blueberry-Cheesecake.jpg",
    8: "Strawberry-Tart.jpg"
  };
// Helper: láº¥y URL áº£nh cho recipe (employee side)
function getRecipeImageUrlForEmployee(recipe) {
  const backendBase = location.origin;
  const path = recipe.image_path;

  if (path) {
    // Náº¿u backend tráº£ full URL
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    // Náº¿u lÃ  Ä‘Æ°á»ng dáº«n static cá»§a Flask, vd "/static/recipe_images/xxx.jpg"
    if (path.startsWith('/static/')) {
      return `${backendBase}${path}`;
    }

    // Data cÅ©: chá»‰ tÃªn file trong assets/img/
    return `assets/img/${path}`;
  }

  // KhÃ´ng cÃ³ image_path â†’ dÃ¹ng map cá»©ng cho 8 bÃ¡nh demo
  const mapped = IMG_MAP[recipe.recipe_id];
  if (mapped) {
    return `assets/img/${mapped}`;
  }

  // Fallback cuá»‘i cÃ¹ng
  return 'assets/img/placeholder.jpg'; // nhá»› Ä‘áº£m báº£o cÃ³ file nÃ y
}

  // No fallback list here to preserve original behavior

  // ID mapping (if needed for legacy)
  const ID_MAPPING = {
    "pink-strawberry-mousse": 1,
    "choco-tiramisu": 2,
    "sweet-vanilla-cupcake": 3,
    "blueberry-muffins": 4,
    "classic-tiramisu": 5,
    "french-macarons": 6,
    "blueberry-cheesecake": 7,
    "strawberry-tart": 8
  };

  // --- Toast Notification Function (Moved inside for proper scope) ---
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) {
      console.warn('Toast container not found');  // Fallback log if missing
      alert(message);  // Ultimate fallback to alert
      return;
    }

    // Táº¡o toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fa-solid fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'} toast-icon"></i>
      <span class="toast-message">${message}</span>
      <button class="toast-close">&times;</button>
    `;
    container.appendChild(toast);

    // Auto remove sau 3s
    const timeout = setTimeout(() => {
      toast.remove();
      clearTimeout(timeout);
    }, 3000);

    // Close khi click X
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
      clearTimeout(timeout);
    });
  }

  // --- Helper láº¥y ID (string or numeric) ---
function getCurrentRecipeId() {
  const url = new URL(location.href);
  let id = url.searchParams.get("id") || localStorage.getItem("selectedRecipeId");
  if (id && ID_MAPPING[id]) id = ID_MAPPING[id];
  return parseInt(id, 10) || 1;
}
function setRecipeIdInUrl(recipeId) {
  const u = new URL(window.location.href);
  u.searchParams.set('id', String(recipeId));
  history.replaceState({}, '', u.toString());
}




  // --- Update recipe content in recipe-replace-1.html ---
  async function updateRecipeContentInReplace1(recipeId) {
    console.log('Updating recipe content for ID:', recipeId);
    
    try {
      const recipe = await fetchRecipeById(recipeId);
      if (!recipe) {
        console.error('Failed to fetch recipe data');
        return;
      }

      // Update breadcrumb
      const breadcrumbSpan = document.getElementById("recipeBreadcrumb");
      if (breadcrumbSpan) {
        breadcrumbSpan.textContent = recipe.menu_name || recipe.name;
        if (breadcrumbSpan.tagName === 'A') {
          breadcrumbSpan.setAttribute('href', `recipe-detail.html?id=${recipeId}`);
        }
      }

      // Update title
      const recipeTitleEl = document.getElementById("recipeTitle");
      if (recipeTitleEl) {
        recipeTitleEl.textContent = recipe.menu_name || recipe.name;
      }

      // Update image
      if (recipeImageEl) {
      const imgUrl = getRecipeImageUrlForEmployee(recipe);
      recipeImageEl.src = imgUrl;
      recipeImageEl.alt = recipe.menu_name || recipe.name;
    }


      // Update meta
      const recipeMetaEl = document.getElementById("recipeMeta");
      if (recipeMetaEl) {
        const meta = recipe.meta || ["General dessert", "â€¢ Prep: 30 minutes"];
        recipeMetaEl.innerHTML = meta.map(m => `<span class="meta-tag">${m}</span>`).join('');
      }

      // Update recipe content grid
      const recipeContentGridEl = document.getElementById("recipeContentGrid");
      if (recipeContentGridEl) {
        recipeContentGridEl.innerHTML = '';

        // Ingredients
        const ingredientsList = document.createElement("div");
        ingredientsList.className = "ingredients-list";
        ingredientsList.innerHTML = "<h3>Ingredients</h3>";
        (recipe.ingredients || []).forEach(ing => {
          const row = document.createElement("div");
          row.className = "ingredient-row";
          row.dataset.ingredient = ing.ingredient_id || ing.name;
          row.innerHTML = `<span class="name">${ing.name}</span><span class="amount" data-amount="${ing.quantity}" data-unit="${ing.unit}">${formatQuantityDisplay(ing.quantity)} ${ing.unit}</span>`;
          ingredientsList.appendChild(row);
        });
        recipeContentGridEl.appendChild(ingredientsList);
        initBaseAmounts();

        // Instructions
        const instructionsList = document.createElement("div");
        instructionsList.className = "instructions-list";
        instructionsList.innerHTML = "<h3>Instructions</h3>";
        recipe.instructions.forEach((inst, idx) => {
          const row = document.createElement("div");
          row.className = "instruction-row";
          row.innerHTML = `<span class="step">Step ${idx + 1}:</span><span class="instruction">${inst}</span>`;
          instructionsList.appendChild(row);
        });
        recipeContentGridEl.appendChild(instructionsList);
      }

      // Update AI suggestions based on selected recipe
      await renderApprovedSuggestionSummaryForReplace1(recipeId);

      // Update active state in sidebar
      updateActiveRecipeInSidebar(recipeId);

      console.log('Recipe content updated successfully');
    } catch (error) {
      console.error('Error updating recipe content:', error);
    }
  }

  // --- Update AI suggestions based on recipe ---
  function updateAISuggestions(recipe) {
    const aiSection = document.querySelector('.ai-suggested-section');
    if (!aiSection) return;

    // Update reason text based on recipe
    const reasonItems = aiSection.querySelectorAll('.reason-item');
    if (reasonItems.length >= 2) {
      // Update first reason based on recipe name
      const firstReason = reasonItems[0].querySelector('.reason-text');
      if (firstReason) {
        firstReason.textContent = `Whipping Cream in stock only 0.4 L and about to expire for ${recipe.menu_name || recipe.name}`;
      }
      
      // Update second reason
      const secondReason = reasonItems[1].querySelector('.reason-text');
      if (secondReason) {
        secondReason.textContent = `DSS recommends using Heavy Cream (180 ml, ratio 0.9) to maintain quality and avoid production interruptions for ${recipe.menu_name || recipe.name}.`;
      }
    }
  }

  // --- Update recipe content in recipe-replace-2.html ---
  async function updateRecipeContentInReplace2(recipeId) {
    console.log('Updating recipe content for Replace-2, ID:', recipeId);
    
    try {
      const recipe = await fetchRecipeById(recipeId);
      if (!recipe) {
        console.error('Failed to fetch recipe data');
        return;
      }

      // Update breadcrumb
      const breadcrumbSpan = document.getElementById("recipeBreadcrumb");
      if (breadcrumbSpan) {
        breadcrumbSpan.textContent = recipe.menu_name || recipe.name;
        if (breadcrumbSpan.tagName === 'A') {
          breadcrumbSpan.setAttribute('href', `recipe-replace-2.html?id=${recipe?.recipe_id || getCurrentRecipeId()}`);
        }
      }

      // Update AI suggestions based on selected recipe for Replace-2
      updateAISuggestionsForReplace2(recipe);

      // Update active state in sidebar
      updateActiveRecipeInSidebar(recipeId);
      await initReplace2FromBackend(recipeId);

      console.log('Recipe content updated successfully for Replace-2');
    } catch (error) {
      console.error('Error updating recipe content for Replace-2:', error);
    }
  }
async function renderApprovedSuggestionSummaryForReplace1(recipeId) {
  const wrap = document.querySelector('.ai-suggested-section');
  if (!wrap) return;

  const btnDetail = wrap.querySelector('.btn-detail-ai');
  const btnCancel = wrap.querySelector('.btn-cancel-ai');

  const sug = await fetchApprovedSubstitute(recipeId);

  // ✅ luôn bind cancel về recipe-detail (dù có sug hay không)
  if (btnCancel) {
    btnCancel.style.display = 'inline-flex';
    btnCancel.onclick = (e) => {
      e.preventDefault();
      window.location.href = `recipe-detail.html?id=${encodeURIComponent(recipeId)}`;
    };
  }

  // ❌ Không có suggestion đã duyệt
  if (!sug) {
    wrap.style.display = 'block';

    // ✅ Ẩn nút Detail
    if (btnDetail) btnDetail.style.display = 'none';

    // ✅ show message rõ ràng
    const items = wrap.querySelectorAll('.reason-item .reason-text');
    if (items[0]) items[0].textContent = "No approved substitute formula is available for this recipe.";
    if (items[1]) items[1].textContent = "Please wait for the owner to approve or create a new suggestion.";
    const approvedEl = wrap.querySelector('.reason-item.approved .approved-text');
    if (approvedEl) approvedEl.textContent = "";
    return;
  }

  // ✅ Có suggestion
  wrap.style.display = 'block';
  wrap.dataset.suggestionId = sug.suggestion_id;

  // ✅ Hiện Detail lại
  if (btnDetail) {
    btnDetail.style.display = 'inline-flex';
    btnDetail.onclick = (e) => {
      e.preventDefault();
      window.location.href = `recipe-replace-2.html?id=${encodeURIComponent(recipeId)}`;
    };
  }

  // render reasons
  const d = sug.details || {};
  const reasons = Array.isArray(d.reasons) ? d.reasons : [];
  const reasonLines = reasons.map(r => {
    const issue = r.issue || '';
    if (issue === 'Expired' || issue === 'NearExpiry') return `${r.ingredient_name} (${issue}, ${r.days_left ?? 'N/A'} days left)`;
    if (issue === 'LowStock') return `${r.ingredient_name} (Not enough)`;
    return `${r.ingredient_name} (${issue})`;
  });

  const items = wrap.querySelectorAll('.reason-item .reason-text');
  if (items[0]) items[0].textContent = reasonLines[0] || 'Inventory issue detected';
  if (items[1]) items[1].textContent =
    (d.substitutions?.[0] || d.substitution)
      ? `DSS suggests an alternative formula approved by owner.`
      : `Approved alternative formula is available.`;

  const approvedEl = wrap.querySelector('.reason-item.approved .approved-text');
  if (approvedEl) approvedEl.textContent = "Owner approved.";
}

function renderReplace2TablesFromSuggestion(sug) {
  const d = sug?.details || {};
  const rows = Array.isArray(d.alternative_ingredients) ? d.alternative_ingredients : [];
  const steps = Array.isArray(d.ai_instructions) ? d.ai_instructions : [];

  // --- Alternative material list table ---
  const tbody = document.querySelector('.alternative-material-list tbody');
  if (tbody) {
    tbody.innerHTML = rows.map(r => {
      const isReplaced = String(r.type || '').toLowerCase() === 'replaced';
      const orig = r.original ? `${r.original.qty} ${r.original.unit || ''}` : '-';
      const rep = r.new?.name
        ? `${r.new.name} - ${r.new.qty} ${r.new.unit || ''}`
        : `${r.new?.qty ?? ''} ${r.new?.unit ?? ''}`.trim();

      const ws = String(r.warehouse_status || 'N/A');
      let cls = 'in-stock';
      let label = ws;

      if (ws === 'NotEnough' || ws === 'LowStock') { cls = 'low-stock'; label = 'Not enough'; }
      if (ws === 'ExpiringSoon' || ws === 'NearExpiry') { cls = 'nearly-expired'; label = 'Expiring soon'; }
      if (ws === 'Expired') { cls = 'expired'; label = 'Expired'; }

      return `
        <tr class="${isReplaced ? 'row-highlight' : ''}">
          <td>${r.name || '-'}</td>
          <td>${orig}</td>
          <td>${isReplaced ? `<b>${rep}</b>` : rep}</td>
          <td><span class="status ${cls}">${label}</span></td>
        </tr>
      `;
    }).join('');
  }

  // --- AI instructions table ---
  const stepBody = document.querySelector('.ai-tailored-instructions tbody');
  if (stepBody) {
    stepBody.innerHTML = steps.map((t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${t}</td>
      </tr>
    `).join('');
  }

  // --- Approval section ---
    const approval = document.querySelector('.approval-section');
    if (approval) {
      const ps = approval.querySelectorAll('p');

      // ưu tiên tên, fallback mới dùng ID
      const approver =
        sug.approved_by_name
          ? sug.approved_by_name
          : (sug.approved_by ? `Owner (ID: ${sug.approved_by})` : 'Owner');

      if (ps[0]) ps[0].textContent = `Approved by: ${approver}`;
      if (ps[1]) ps[1].textContent = `Date: ${sug.created_at ?? ''}`;
      if (ps[2]) ps[2].textContent = `Status: ${sug.status}`;
    }

}

async function initReplace2FromBackend(recipeId) {
  const rid = recipeId ?? getCurrentRecipeId();
  const sug = await fetchApprovedSubstitute(rid);
  const wrap = document.querySelector('.ai-suggested-section');
  if (!wrap) return;

  const btnApply = document.querySelector('.btn-perform-substitution');
  const btnCancel = document.querySelector('.btn-cancel-substitution');

  // Cancel về replace-1 đúng id
  if (btnCancel) {
    btnCancel.onclick = () => window.location.href = `recipe-replace-1.html?id=${encodeURIComponent(rid)}`;
  }

  // ❌ không có sug
  if (!sug) {
    wrap.style.display = 'block';

    // ✅ clear bảng + hiện message
    const tbody1 = document.querySelector('.alternative-material-list tbody');
    if (tbody1) tbody1.innerHTML = `<tr><td colspan="4">No approved substitute formula is available for this recipe.</td></tr>`;

    const tbody2 = document.querySelector('.ai-tailored-instructions tbody');
    if (tbody2) tbody2.innerHTML = `<tr><td colspan="2">N/A</td></tr>`;

    const approval = document.querySelector('.approval-section');
    if (approval) {
      const ps = approval.querySelectorAll('p');
      if (ps[0]) ps[0].textContent = `Approved by: N/A`;
      if (ps[1]) ps[1].textContent = `Date: N/A`;
      if (ps[2]) ps[2].textContent = `Status: N/A`;
    }

    // ✅ disable Apply
    if (btnApply) {
      btnApply.disabled = true;
      btnApply.style.opacity = 0.6;
    }
    return;
  }

  // ✅ có sug
  wrap.style.display = 'block';
  wrap.dataset.suggestionId = sug.suggestion_id;

  if (btnApply) {
  btnApply.disabled = false;
  btnApply.style.opacity = 1;

  btnApply.onclick = async (e) => {
    e.preventDefault();

    // chống click 2 lần
    btnApply.disabled = true;
    btnApply.style.opacity = 0.7;

    try {
      setAIApplyStatus('running', 'AI is applying the approved substitution to the recipe dataset…');

      await applyApprovedSubstitute(sug.suggestion_id);

      setAIApplyStatus('success', 'Substitution applied successfully. Redirecting to updated recipe…');

      // cho kịp render UI + đọc message
      await sleep(1400);

      window.location.href = `recipe-detail.html?id=${encodeURIComponent(rid)}`;
    } catch (e2) {
      setAIApplyStatus('error', `Apply failed: ${e2.message || e2}`);

      // mở lại nút để thử lại
      btnApply.disabled = false;
      btnApply.style.opacity = 1;
    }
  };
}


  renderReplace2TablesFromSuggestion(sug);
}
// ✅ expose functions ra global (để test trên console + HTML gọi được)
window.getCurrentRecipeId = getCurrentRecipeId;
window.renderApprovedSuggestionSummaryForReplace1 = renderApprovedSuggestionSummaryForReplace1;
window.initReplace2FromBackend = initReplace2FromBackend;

// ✅ auto-run theo page
const p = (location.pathname || "").toLowerCase();
console.log("[AUTO-RUN] page =", p, "recipeId =", getCurrentRecipeId());

if (p.includes("recipe-replace-1.html")) {
  console.log("[AUTO-RUN] replace-1: load approved suggestion...");
  renderApprovedSuggestionSummaryForReplace1(getCurrentRecipeId());
}
if (p.includes("recipe-replace-2.html")) {
  console.log("[AUTO-RUN] replace-2: load approved suggestion...");
  initReplace2FromBackend(getCurrentRecipeId());
}

// --- Shared function to render usage list (Enhanced debug) ---
  function renderUsageList(recipe, usageListEl) {
    if (!usageListEl) return;
    usageListEl.innerHTML = "";
    console.log('DEBUG Full recipe data for ingredients:', recipe.ingredients);  // Log entire ingredients array from backend
    (recipe.ingredients || []).forEach(ing => {
      const stockStr = (ing.stock !== undefined && ing.stock_unit) ? `${ing.stock}${ing.stock_unit}` : "0g";
      const ingredientId = ing.ingredient_id || ing.name;
      
      // Use backend-computed flags first (reliable, includes current date)
      let isExpired = ing.is_expired || false;
      let expiryStatus = ing.expiry_status || 'Normal';
      let isLowStock = ing.is_low_stock || false;

      // Fallback JS computation only if backend flags missing (for legacy)
      if (ing.is_expired === undefined || ing.expiry_status === undefined) {
        const today = new Date();
        if (ing.expiry_date) {
          const expDate = new Date(ing.expiry_date);
          const daysLeft = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
          isExpired = daysLeft < 0;
          if (daysLeft < 0) {
            expiryStatus = 'Expired';
          } else if (daysLeft <= 3) {
            expiryStatus = 'NearExpiry';
          }
        } else if (ing.shelf_life_days !== undefined) {
          const createdDate = new Date(ing.created_at || today);
          const expiryDate = new Date(createdDate);
          expiryDate.setDate(createdDate.getDate() + ing.shelf_life_days);
          const daysLeft = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
          isExpired = daysLeft < 0 || ing.shelf_life_days < 0;
          if (daysLeft < 0 || ing.shelf_life_days < 0) {
            expiryStatus = 'Expired';
          } else if (daysLeft <= 3) {
            expiryStatus = 'NearExpiry';
          }
        }
        isLowStock = parseFloat(ing.stock || 0) < parseFloat(ing.quantity || 0) && ing.unit === ing.stock_unit;
      }

      let statusText, statusClass;
      if (isExpired) {
        statusText = expiryStatus;
        statusClass = 'expired';
      } else if (isLowStock) {
        statusText = 'Low Stock';
        statusClass = 'low-stock';
      } else {
        statusText = 'In Stock';
        statusClass = 'in-stock';
      }

      // Localize status label
      const isViLang = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function' && window.GlobalLanguage.getLanguage() === 'vi');
      let localizedStatus = statusText;
      if (isViLang) {
        if (String(statusText).toLowerCase().includes('expired')) localizedStatus = 'Háº¿t háº¡n';
        else if (String(statusText).toLowerCase().includes('low')) localizedStatus = 'Sáº¯p háº¿t hÃ ng';
        else if (String(statusText).toLowerCase().includes('in stock')) localizedStatus = 'CÃ²n hÃ ng';
      }

      // Enhanced debug log
      console.log(`DEBUG Ingredient: ${ing.name} (ID: ${ingredientId}) - Backend flags: is_expired=${ing.is_expired}, expiry_status=${ing.expiry_status}, is_low_stock=${ing.is_low_stock}, days_left=${ing.days_left}, batch_status=${ing.batch_status || 'N/A'}, expiry_date=${ing.expiry_date} | Computed: isExpired=${isExpired}, statusText=${statusText}, isLowStock=${isLowStock}`);

      const item = document.createElement("div");
      item.className = "usage-item";
      item.dataset.ingredient = ingredientId;
      const checkboxId = `usage-${ingredientId}`;
      item.innerHTML = `
        <input type="checkbox" id="${checkboxId}">
        <label for="${checkboxId}">
          <span class="item-name"> ${ing.name} <span class="stock-info" data-need="${ing.quantity}" data-unit="${ing.unit}">Need: ${formatQuantityDisplay(ing.quantity)} ${ing.unit} / Stock: ${formatQuantityDisplay(stockStr)}</span> </span>
        </label>
      <div class="item-actions">
        <span class="status-stock ${statusClass}">${localizedStatus}</span>
        <button class="btn-usage use" data-en="Use" data-vi="DÃ¹ng" ${isExpired ? 'disabled title="Cannot use expired ingredient"' : ''}>Use</button>
        <button class="btn-usage open" data-en="Open" data-vi="Má»Ÿ" ${isExpired ? 'disabled title="Cannot open expired ingredient"' : ''}>Open</button>
        <button class="btn-usage report" data-ingredient="${ingredientId}" data-en="Report" data-vi="BÃ¡o cÃ¡o">Report</button>
      </div>
      `;
      usageListEl.appendChild(item);
      // Apply language for the newly added row
      try {
        if (window.GlobalLanguage && typeof window.GlobalLanguage.applyLanguage === 'function') {
          const lang = window.GlobalLanguage.getLanguage ? window.GlobalLanguage.getLanguage() : 'en';
          window.GlobalLanguage.applyLanguage(lang);
        }
      } catch(_) {}
    });
  }

  // --- Shared function to check for issues (Use backend flags) ---
  function checkForIssues(recipe) {
    let hasIssue = false;
    let issueIng = null;
    for (let ing of (recipe.ingredients || [])) {
      let isExpired = ing.is_expired || false;
      let isLowStock = ing.is_low_stock || false;

      // Fallback if backend flags missing
      if (ing.is_expired === undefined) {
        const today = new Date();
        if (ing.expiry_date) {
          const expDate = new Date(ing.expiry_date);
          const daysLeft = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
          isExpired = daysLeft < 0;
        } else if (ing.shelf_life_days !== undefined) {
          const createdDate = new Date(ing.created_at || today);
          const expiryDate = new Date(createdDate);
          expiryDate.setDate(createdDate.getDate() + ing.shelf_life_days);
          const daysLeft = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
          isExpired = daysLeft < 0 || ing.shelf_life_days < 0;
        }
        isLowStock = parseFloat(ing.stock || 0) < parseFloat(ing.quantity || 0) && ing.unit === ing.stock_unit;
      }

      if (isExpired || isLowStock) {
        hasIssue = true;
        issueIng = ing;
        break;
      }
    }
    return { hasIssue, issueIng };
  }

  // --- Update recipe content in recipe-detail.html ---
  async function updateRecipeContentInDetail(recipeId) {
    console.log('Updating recipe content for Detail, ID:', recipeId);
    
    try {
      const recipe = await fetchRecipeById(recipeId);
      if (!recipe) {
        console.error('Failed to fetch recipe data');
        return;
      }

      const { hasIssue, issueIng } = checkForIssues(recipe);

      // Update breadcrumb
      const breadcrumbSpan = document.getElementById("recipeBreadcrumb");
      if (breadcrumbSpan) {
        breadcrumbSpan.textContent = recipe.menu_name || recipe.name;
      }

      // Update title
      const recipeTitleEl = document.getElementById("recipeTitle");
      if (recipeTitleEl) {
        recipeTitleEl.textContent = recipe.menu_name || recipe.name;
      }

      // Update image
      const recipeImageEl = document.getElementById("recipeImage");
      if (recipeImageEl) {
      const imgUrl = getRecipeImageUrlForEmployee(recipe);
      recipeImageEl.src = imgUrl;
      recipeImageEl.alt = recipe.menu_name || recipe.name;
    }


      // Update meta
      const recipeMetaEl = document.getElementById("recipeMeta");
      if (recipeMetaEl) {
        const meta = recipe.meta || ["General dessert", "â€¢ Prep: 30 minutes"];
        recipeMetaEl.innerHTML = meta.map(m => `<span class="meta-tag">${m}</span>`).join('');
      }

      // Update recipe content grid
      const recipeContentGridEl = document.getElementById("recipeContentGrid");
      if (recipeContentGridEl) {
        recipeContentGridEl.innerHTML = '';

        // Ingredients
        const ingredientsList = document.createElement("div");
        ingredientsList.className = "ingredients-list";
        ingredientsList.innerHTML = "<h3>Ingredients</h3>";
        (recipe.ingredients || []).forEach(ing => {
          const row = document.createElement("div");
          row.className = "ingredient-row";
          row.dataset.ingredient = ing.ingredient_id || ing.name;
          row.innerHTML = `<span class="name">${ing.name}</span><span class="amount" data-amount="${ing.quantity}" data-unit="${ing.unit}">${formatQuantityDisplay(ing.quantity)} ${ing.unit}</span>`;
          ingredientsList.appendChild(row);
        });
        recipeContentGridEl.appendChild(ingredientsList);
        initBaseAmounts();

        // Instructions
        const instructionsList = document.createElement("div");
        instructionsList.className = "instructions-list";
        instructionsList.innerHTML = "<h3>Instructions</h3>";
        recipe.instructions.forEach((inst, idx) => {
          const row = document.createElement("div");
          row.className = "instruction-row";
          row.innerHTML = `<span class="step">Step ${idx + 1}:</span><span class="instruction">${inst}</span>`;
          instructionsList.appendChild(row);
        });
        recipeContentGridEl.appendChild(instructionsList);
      }

      // Usage List
      const usageListEl = document.getElementById("usageList");
      renderUsageList(recipe, usageListEl);

      // Handle Ingredient Warning Notification
      const warningEl = document.getElementById("ingredientWarning");
      if (hasIssue && warningEl && issueIng) {
        const nameEl = document.getElementById("warningIngredient");
        if (nameEl) {
          nameEl.textContent = issueIng.name;
        }
        const warningP = document.getElementById("warningMessage");
        const reason = issueIng.is_expired ? 'expired or about to expire' : 'low stock and not enough quantity';
        warningP.innerHTML = `Warning: <span id="warningIngredient">${issueIng.name}</span> in stock ${reason}. This ingredient cannot be safely used in the current formulation.`;
        warningEl.style.display = "block";

        // Event listeners for warning buttons
        const cancelBtn = document.querySelector(".btn-warning-cancel");
        if (cancelBtn) {
          cancelBtn.addEventListener("click", () => {
            warningEl.style.display = "none";
          });
        }

        const altBtn = document.querySelector(".btn-warning-alternative");
        if (altBtn) {
          altBtn.addEventListener("click", () => {
            localStorage.setItem("selectedRecipeId", recipeId);
            window.location.href = "recipe-replace-1.html";
          });
        }
      } else if (warningEl) {
        warningEl.style.display = "none";
      }

      // Update active state in sidebar
      updateActiveRecipeInSidebar(recipeId);

      console.log('Recipe content updated successfully for Detail');
    } catch (error) {
      console.error('Error updating recipe content for Detail:', error);
    }
  }

  // --- Update AI suggestions for Replace-2 based on recipe ---
  function updateAISuggestionsForReplace2(recipe) {
    const aiSection = document.querySelector('.ai-suggested-section');
    if (!aiSection) return;

    // Keep alternative material list and AI-tailored instructions as default
    // Only update approval section with recipe name if needed
    const approvalSection = aiSection.querySelector('.approval-section');
    if (approvalSection) {
      const firstP = approvalSection.querySelector('p');
      if (firstP) {
        const recipeName = recipe.menu_name || recipe.name || '';
        const enText = `Approved by: Pham Van A (Bakery owner) for ${recipeName}`;
        const viText = `PhÃª duyá»‡t bá»Ÿi: Pháº¡m VÄƒn A (Chá»§ tiá»‡m) cho ${recipeName}`;
        firstP.setAttribute('data-en', enText);
        firstP.setAttribute('data-vi', viText);
        const isVi = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function' && window.GlobalLanguage.getLanguage() === 'vi');
        firstP.textContent = isVi ? viText : enText;
      }
      try {
        if (window.GlobalLanguage && typeof window.GlobalLanguage.applyLanguage === 'function') {
          const lang = window.GlobalLanguage.getLanguage ? window.GlobalLanguage.getLanguage() : 'en';
          window.GlobalLanguage.applyLanguage(lang);
        }
      } catch(_) {}
    }
  }

  // --- Update active recipe in sidebar ---
  function updateActiveRecipeInSidebar(recipeId) {
    const listWrap = document.getElementById("recipeListItems");
    if (!listWrap) return;

    // Remove active class from all items
    listWrap.querySelectorAll('.recipe-item').forEach(item => {
      item.classList.remove('active');
    });

    // Add active class to current recipe (without changing position)
    const currentItem = listWrap.querySelector(`[data-recipe-id="${recipeId}"]`);
    if (currentItem) {
      currentItem.classList.add('active');
    }
  }

  // --- Fetch all recipes ---
  async function fetchAllRecipes() {
    console.log('Fetching all recipes...');
    try {
      const response = await fetch(`${API_BASE}/recipe/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      console.log('Fetched recipes:', result.data);
      if (result.success && Array.isArray(result.data)) {
        return result.data;
      }
      console.warn('API returned no recipes');
      return [];
    } catch (error) {
      console.warn('Fetch error:', error);
      return [];
    }
  }

  // --- Fetch single recipe by numeric ID ---
  async function fetchRecipeById(recipeId) {
    console.log('Fetching recipe ID:', recipeId);
    try {
      const response = await fetch(`${API_BASE}/recipe/${recipeId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      console.log('Fetched recipe:', result.data);
      if (result.success) {
        // No more mock: Use instructions from API (array or fallback)
        if (!result.data.instructions || result.data.instructions.length === 0) {
          result.data.instructions = ["No instructions available"];
        }
        return result.data;
      } else {
        console.warn('API error:', result.error);
        return null;
      }
    } catch (error) {
      console.warn('Fetch error:', error);
      return null;
    }
  }

  // --- Functions for Production Scaling (Defined early for scope) ---
  function initBaseAmounts() {
    document.querySelectorAll(".ingredient-row").forEach(row => {
      const amountEl = row.querySelector("[data-amount]");
      if (amountEl) {
        // LÆ°u base gá»‘c vÃ o data-base-amount (náº¿u chÆ°a cÃ³)
        if (!amountEl.dataset.baseAmount) {
          amountEl.dataset.baseAmount = amountEl.dataset.amount;  // Base = initial amount
        }
      }
    });
    document.querySelectorAll(".stock-info").forEach(info => {
      if (!info.dataset.baseNeed) {
        info.dataset.baseNeed = info.dataset.need;  // Base need
      }
    });
    console.log('Base amounts initialized');
  }

  function scaleIngredients(factor) {
    console.log('Scaling ingredients by factor:', factor);
    // Scale tá»« base gá»‘c
    document.querySelectorAll(".ingredient-row").forEach(row => {
      const amountEl = row.querySelector("[data-amount]");
      if (amountEl) {
        const baseAmount = parseFloat(amountEl.dataset.baseAmount || amountEl.dataset.amount);  // Æ¯u tiÃªn base
        const unit = amountEl.dataset.unit;
        const scaled = Math.round(baseAmount * factor * 10) / 10;
        amountEl.textContent = `${scaled}${unit}`;
        // KhÃ´ng overwrite data-amount, chá»‰ update display (data-base-amount giá»¯ nguyÃªn)
      }
    });

    // Scale need trong stock-info
    document.querySelectorAll(".stock-info").forEach(info => {
      const baseNeed = parseFloat(info.dataset.baseNeed || info.dataset.need);
      const unit = info.dataset.unit;
      const scaled = Math.round(baseNeed * factor * 10) / 10;
      const stockMatch = info.textContent.match(/\/ Stock: (.*)$/);
      const stock = stockMatch ? stockMatch[1] : '0g';
      info.innerHTML = `Need: ${scaled}${unit} / Stock: ${stock}`;
      // KhÃ´ng overwrite data-need, chá»‰ update display
    });
  }

  // --- Toggle Production Section & Calculate ---
  const toggleBtn = document.getElementById("toggleProduction");
  const productionSection = document.getElementById("productionSection");
  const recipeContentGrid = document.getElementById("recipeContentGrid");
  const calculateBtn = document.getElementById("calculateBtn");
  const numCakesInput = document.getElementById("numCakes");

  if (toggleBtn && productionSection && recipeContentGrid && calculateBtn && numCakesInput) {
    let currentScaleFactor = 1;  // Scale hiá»‡n táº¡i (khá»Ÿi táº¡o 1)

    function toggleProduction() {
      const isProductionMode = !productionSection.classList.contains("hidden");
      productionSection.classList.toggle("hidden");
      recipeContentGrid.style.display = isProductionMode ? "grid" : "none";
      toggleBtn.textContent = isProductionMode ? "Calculate Production Quantity" : "View Recipe Details";
      
      if (!isProductionMode) {
        // Reset vá» base khi toggle vá» view mode
        currentScaleFactor = 1;
        numCakesInput.value = 1;
        scaleIngredients(1);  // Hiá»ƒn thá»‹ base
      }
    }

    toggleBtn.addEventListener("click", toggleProduction);

    calculateBtn.addEventListener("click", () => {
      const newScale = parseInt(numCakesInput.value) || 1;
      scaleIngredients(newScale);  // Scale tá»« base gá»‘c
      currentScaleFactor = newScale;  // Cáº­p nháº­t scale hiá»‡n táº¡i (chá»‰ Ä‘á»ƒ track, khÃ´ng dÃ¹ng cho tÃ­nh)
    });
  }


// --- recipe-list.html: Load dynamic grid + search + pagination ---
const recipeGrid = document.getElementById("recipeGrid");
const recipeGridLoading = document.getElementById("recipeGridLoading");
const recipeSearchInput = document.getElementById("recipeSearch");
const recipePageInfo = document.getElementById("recipePageInfo");
const recipePagePrev = document.getElementById("recipePagePrev");
const recipePageNext = document.getElementById("recipePageNext");
let allRecipes = [];
let filteredRecipes = [];
let recipePage = 1;
const RECIPES_PER_PAGE = 8;

function renderRecipeGrid(list) {
  if (!recipeGrid) return;
  recipeGrid.innerHTML = "";
  list.forEach(r => {
    const card = document.createElement("article");
    card.className = "recipe-card";
    card.dataset.recipeId = r.recipe_id;
    const imgUrl = getRecipeImageUrlForEmployee(r);
    card.innerHTML = `
      <div class="recipe-img">
        <img src="${imgUrl}" alt="${r.menu_name}">
      </div>
      <div class="recipe-info">
        <h3>${r.menu_name}</h3>
        <button class="btn-view-recipe"
                data-recipe-id="${r.recipe_id}"
                data-en="View Recipe"
                data-vi="Xem">
          View Recipe
        </button>
      </div>
    `;
    recipeGrid.appendChild(card);
  });
  try {
    if (window.GlobalLanguage && typeof window.GlobalLanguage.applyLanguage === 'function') {
      const lang = window.GlobalLanguage.getLanguage ? window.GlobalLanguage.getLanguage() : 'en';
      window.GlobalLanguage.applyLanguage(lang);
    }
  } catch (_) {}
}

function renderRecipePage(page = recipePage) {
  if (!recipeGrid) return;
  const totalPages = Math.max(1, Math.ceil(filteredRecipes.length / RECIPES_PER_PAGE));
  recipePage = Math.min(Math.max(page, 1), totalPages);
  const start = (recipePage - 1) * RECIPES_PER_PAGE;
  const slice = filteredRecipes.slice(start, start + RECIPES_PER_PAGE);
  renderRecipeGrid(slice);
  if (recipePageInfo) recipePageInfo.textContent = `Page ${totalPages === 0 ? 0 : recipePage} / ${totalPages}`;
  if (recipePagePrev) recipePagePrev.disabled = recipePage <= 1;
  if (recipePageNext) recipePageNext.disabled = recipePage >= totalPages;
}

function applyRecipeFilters() {
  const term = (recipeSearchInput?.value || "").toLowerCase();
  filteredRecipes = allRecipes.filter(r => (r.menu_name || "").toLowerCase().includes(term));
  recipePage = 1;
  renderRecipePage(1);
}

(function initRecipeList() {
  if (!recipeGrid) return;
  if (recipeGridLoading) recipeGridLoading.style.display = 'grid';
  recipeGrid.style.display = 'none';

  fetchAllRecipes().then(recipes => {
    allRecipes = Array.isArray(recipes) ? recipes : [];
    filteredRecipes = allRecipes;
    if (recipeGridLoading) recipeGridLoading.style.display = 'none';
    recipeGrid.style.display = 'grid';
    renderRecipePage(1);
  });

  recipeGrid.addEventListener("click", (event) => {
    const t = event.target;
    let recipeId = t.dataset.recipeId || t.closest(".recipe-card")?.dataset.recipeId;
    if (recipeId) {
      const numericId = ID_MAPPING[recipeId] || recipeId;
      localStorage.setItem("selectedRecipeId", numericId);
      window.location.href = `recipe-detail.html?id=${encodeURIComponent(numericId)}`;
    }
  });

  recipeSearchInput?.addEventListener("input", applyRecipeFilters);
  recipePagePrev?.addEventListener("click", () => renderRecipePage(recipePage - 1));
  recipePageNext?.addEventListener("click", () => renderRecipePage(recipePage + 1));
})();

// --- recipe-detail.html: Load and render ---
  const breadcrumbSpan = document.getElementById("recipeBreadcrumb");
  const recipeTitleEl = document.getElementById("recipeTitle");
  const recipeImageEl = document.getElementById("recipeImage");
  const recipeMetaEl = document.getElementById("recipeMeta");
  const recipeContentGridEl = document.getElementById("recipeContentGrid");
  const usageListEl = document.getElementById("usageList");
  if (breadcrumbSpan || recipeTitleEl) {
    const currentId = getCurrentRecipeId();
    let recipe = await fetchRecipeById(currentId);

    // Fallback to mock if backend fails (rare now)
    if (!recipe) {
      // Minimal fallback
      recipe = {
        recipe_id: currentId,
        menu_name: "Default Recipe",
        ingredients: [],
        instructions: ["No data available"]
      };
      console.log('Using fallback data for ID:', currentId);
    }

    if (!recipe) {
      console.error("No recipe data");
      return;
    }

    const { hasIssue, issueIng } = checkForIssues(recipe);

    console.log('Rendering recipe:', recipe);
    const recipeNumericId = recipe?.recipe_id || currentId;

    // Update breadcrumb/title/image/meta
    if (breadcrumbSpan) breadcrumbSpan.textContent = recipe.menu_name || recipe.name;
    if (breadcrumbSpan && breadcrumbSpan.tagName === 'A') {
    const path = (window.location.pathname || '').toLowerCase();
    const currentQuery = window.location.search || '';
    const url = new URL(window.location.href);
    if (path.includes('recipe-replace-1.html')) {
      const newUrl = new URL('recipe-replace-1.html', url);
      newUrl.search = `?id=${recipeNumericId}`;
      breadcrumbSpan.setAttribute('href', newUrl.pathname + newUrl.search);
    } else if (path.includes('recipe-replace-2.html')) {
      const newUrl = new URL('recipe-replace-2.html', url);
      newUrl.search = `?id=${recipeNumericId}`;
      breadcrumbSpan.setAttribute('href', newUrl.pathname + newUrl.search);
    } else {
      const newUrl = new URL('recipe-detail.html', url);
      newUrl.search = `?id=${recipeNumericId}`;
      breadcrumbSpan.setAttribute('href', newUrl.pathname + newUrl.search);
    }
    }
    if (recipeTitleEl) recipeTitleEl.textContent = recipe.menu_name || recipe.name;
    if (recipeImageEl) {
      const imgUrl = getRecipeImageUrlForEmployee(recipe);
      recipeImageEl.src = imgUrl;
      recipeImageEl.alt = recipe.menu_name || recipe.name;
    }

    // DÃ¹ng meta tá»« API, fallback náº¿u null
    if (recipeMetaEl) {
      const meta = recipe.meta || ["General dessert", "â€¢ Prep: 30 minutes"];
      recipeMetaEl.innerHTML = meta.map(m => `<span class="meta-tag">${m}</span>`).join('');
    }

    // Clear and render ingredients/instructions
    if (recipeContentGridEl) {
      recipeContentGridEl.innerHTML = '';  // Clear previous

      // Ingredients
      const ingredientsList = document.createElement("div");
      ingredientsList.className = "ingredients-list";
      ingredientsList.innerHTML = "<h3>Ingredients</h3>";
      (recipe.ingredients || []).forEach(ing => {
        const row = document.createElement("div");
        row.className = "ingredient-row";
        row.dataset.ingredient = ing.ingredient_id || ing.name;  // Prefer ID
        row.innerHTML = `<span class="name">${ing.name}</span><span class="amount" data-amount="${ing.quantity}" data-unit="${ing.unit}">${formatQuantityDisplay(ing.quantity)} ${ing.unit}</span>`;
        ingredientsList.appendChild(row);
      });
      recipeContentGridEl.appendChild(ingredientsList);
      initBaseAmounts();  // Gá»i sau khi render ingredients

      // Instructions
      const instructionsList = document.createElement("div");
      instructionsList.className = "instructions-list";
      instructionsList.innerHTML = "<h3>Instructions</h3>";
      recipe.instructions.forEach((inst, idx) => {
        const row = document.createElement("div");
        row.className = "instruction-row";
        row.innerHTML = `<span class="step">Step ${idx + 1}:</span><span class="instruction">${inst}</span>`;
        instructionsList.appendChild(row);
      });
      recipeContentGridEl.appendChild(instructionsList);
    }

    // Usage List
    renderUsageList(recipe, usageListEl);

    // Handle Ingredient Warning Notification
    const warningEl = document.getElementById("ingredientWarning");
    if (hasIssue && warningEl && issueIng) {
      const nameEl = document.getElementById("warningIngredient");
      if (nameEl) nameEl.textContent = issueIng.name;
      const warningP = document.getElementById("warningMessage");
      const reason = issueIng.is_expired ? 'expired or about to expire' : 'low stock and not enough quantity';
      warningP.innerHTML = `Warning: <span id="warningIngredient">${issueIng.name}</span> in stock ${reason}. This ingredient cannot be safely used in the current formulation.`;
      warningEl.style.display = "block";

      // Event listeners for warning buttons
      const cancelBtn = document.querySelector(".btn-warning-cancel");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          warningEl.style.display = "none";
        });
      }

      const altBtn = document.querySelector(".btn-warning-alternative");
      if (altBtn) {
        altBtn.addEventListener("click", async () => {
          const rid = recipeNumericId || recipeId;
          localStorage.setItem("selectedRecipeId", rid);

          // ✅ đi replace-1 kèm recipe id để load suggestion thật
          window.location.href = `recipe-replace-1.html?id=${encodeURIComponent(rid)}`;
        });

      }
    } else if (warningEl) {
      warningEl.style.display = "none";
    }

    // Sidebar Recipe List from API (original behavior)
    const listWrap = document.getElementById("recipeListItems");
    if (listWrap) {
      const allRecipes = await fetchAllRecipes();
      listWrap.innerHTML = "";
      allRecipes.forEach(r => {
        const el = document.createElement("div");
        const isCurrent = r.recipe_id == currentId;
        el.className = isCurrent ? "recipe-item active" : "recipe-item";
        el.dataset.recipeId = r.recipe_id;
        el.dataset.type = (r.menu_name || r.name).toLowerCase();
        el.innerHTML = `
          <span class="recipe-item-name">${r.menu_name || r.name}</span>
          <span class="recipe-item-info">Recipe • ${r.ingredients_count || 5} Ingredients</span>
          <i class="fa-solid fa-tag"></i>
        `;
        el.addEventListener("click", async () => {
          localStorage.setItem("selectedRecipeId", r.recipe_id);
          setRecipeIdInUrl(r.recipe_id);
          if (window.location.pathname.includes('recipe-replace-1.html')) {
            await updateRecipeContentInReplace1(r.recipe_id);
          } else if (window.location.pathname.includes('recipe-replace-2.html')) {
            await updateRecipeContentInReplace2(r.recipe_id);
          } else if (window.location.pathname.includes('recipe-detail.html')) {
            await updateRecipeContentInDetail(r.recipe_id);
          } else {
            window.location.href = `recipe-detail.html?id=${r.recipe_id}`;
          }
        });
        listWrap.appendChild(el);
      });
    }
  }
  // No static binding needed
  // Remove safety fallback injection to preserve original API-driven list

  // --- Ingredient Usage Management: Checkbox events and Use All --- 
  const usageList = document.getElementById("usageList");
  const btnUseAll = document.querySelector(".btn-use-all");
  if (usageList && btnUseAll) {
    usageList.addEventListener("change", (e) => {
      if (e.target.type === "checkbox") {
        const item = e.target.closest(".usage-item");
        const useBtn = item.querySelector(".btn-usage.use");
        const openBtn = item.querySelector(".btn-usage.open");
        if (e.target.checked) {
          useBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
          openBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        } else {
          const isVi = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage === 'function' && window.GlobalLanguage.getLanguage() === 'vi');
          useBtn.textContent = isVi ? 'DÃ¹ng' : 'Use';
          openBtn.textContent = isVi ? 'Má»Ÿ' : 'Open';
        }
      }
    });

    btnUseAll.addEventListener("click", () => {
      const checkboxes = usageList.querySelectorAll("input[type='checkbox']");
      checkboxes.forEach((cb) => {
        cb.checked = true;
        const item = cb.closest(".usage-item");
        const useBtn = item.querySelector(".btn-usage.use");
        const openBtn = item.querySelector(".btn-usage.open");
        useBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        openBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
      });
    });
  }

  // --- Report Modal Handling with Backend Integration ---
  const reportModal = document.getElementById("reportModal");
  const reportForm = document.getElementById("reportForm");
  const closeModal = document.querySelector(".close");
  const reportIngredientEl = document.getElementById("reportIngredient");

  // Event delegation for Report buttons
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-usage") && e.target.classList.contains("report")) {
      const item = e.target.closest(".usage-item");
      const ingId = parseInt(item.dataset.ingredient);
      const ingNameSpan = item.querySelector(".item-name");
      const ingName = ingNameSpan.firstChild.textContent.trim();  // Get name before stock-info
      reportIngredientEl.textContent = ingName;
      reportModal.dataset.ingredientId = ingId;  // Store ID for submit
      reportModal.style.display = "flex";
    }
  });

  // Close modal
  if (closeModal) {
    closeModal.addEventListener("click", () => {
      reportModal.style.display = "none";
    });
  }

  // Close on outside click
  window.addEventListener("click", (e) => {
    if (e.target === reportModal) {
      reportModal.style.display = "none";
    }
  });

  // Form submit - Send to backend
  if (reportForm) {
    reportForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const selectedType = document.querySelector('input[name="reportType"]:checked');
      if (selectedType) {
        const ingredientId = parseInt(reportModal.dataset.ingredientId);
         const userId = getCurrentUserId();
      if (!userId) {
        showToast("Cannot detect current user. Please re-login.", "error");
        return;
      }
        if (isNaN(ingredientId)) {
          alert("Invalid ingredient ID.");
          return;
        }
        try {
          const response = await fetch(`${API_BASE}/recipe/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ingredient_id: ingredientId, report_type: selectedType.value, user_id: userId })
          });
          const result = await response.json();
          if (result.success) {
            showToast('Report submitted successfully!', 'success');
          } else {
            showToast(`Error: ${result.error || 'Unknown'}`, 'error');
          }
          reportModal.style.display = "none";
          reportForm.reset();
        } catch (error) {
          showToast(`Network error: ${error.message}`, 'error');
        }
      } else {
        showToast("Please select a report type.", 'error');
      }
    });
  }

  // Footer buttons
  const btnCancel = document.querySelector(".btn-cancel");
  const btnUseIngredients = document.querySelector(".btn-use-ingredients");
  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      window.location.href = "recipe-list.html";
    });
  }
  if (btnUseIngredients) {
  btnUseIngredients.addEventListener("click", async () => {
    const usageList = document.getElementById("usageList");
    const allItems = usageList.querySelectorAll(".usage-item");
    const checkedItems = usageList.querySelectorAll(".usage-item input[type='checkbox']:checked");

    if (checkedItems.length === 0) {
      showToast("No ingredients selected.", "error");
      return;
    }

    // TRUE chỉ khi chọn đúng TẤT CẢ nguyên liệu của recipe
    const usedAllIngredients = (checkedItems.length === allItems.length);

    const usageData = Array.from(checkedItems).map(cb => {
      const item = cb.closest(".usage-item");
      const ingId = parseInt(item.dataset.ingredient);
      const info = item.querySelector(".stock-info");
      const need = parseFloat(info.dataset.need);
      const unit = info.dataset.unit;
      return { ingredient_id: ingId, quantity: need, unit: unit };
    });

    const userId = getCurrentUserId();
    if (!userId) {
      showToast("Cannot detect current user. Please re-login.", "error");
      return;
    }
     const payload = {
      usage: usageData,
      user_id: userId,
      recipe_id: getCurrentRecipeId(),          // <<< thêm
      used_all_ingredients: usedAllIngredients  // <<< thêm
    };
    try {
      const response = await fetch(`${API_BASE}/recipe/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.success) {
        showToast(`${checkedItems.length} ingredients used successfully! Inventory & Today's Menu updated.`, "success");
        const currentId = getCurrentRecipeId();
        setTimeout(() => {
          window.location.href = `recipe-detail.html?id=${encodeURIComponent(currentId)}`;
        }, 1500);
      } else {
        showToast(`Inventory update error: ${result.error || "Unknown"}`, "error");
      }
    } catch (error) {
      showToast(`Network error: ${error.message}`, "error");
    }
  });
}
function placeAIStatusNearSection() {
  const box = document.getElementById('aiApplyStatus');
  const section = document.querySelector('.ai-suggested-section');
  if (!box || !section) return;

  const rect = section.getBoundingClientRect();

  // đảm bảo box có width trước khi đo
  box.style.display = 'block';

  const boxW = box.offsetWidth || 360;
  const padding = 12;

  const top = rect.top + window.scrollY + padding;
  let left = rect.right + window.scrollX - boxW - padding;

  // tránh tràn màn hình trái
  const minLeft = window.scrollX + 12;
  if (left < minLeft) left = minLeft;

  box.style.top = `${top}px`;
  box.style.left = `${left}px`;
}


function bindAIStatusReflow() {
  const onMove = () => {
    const box = document.getElementById('aiApplyStatus');
    if (box && box.style.display === 'block') placeAIStatusNearSection();
  };

  window.addEventListener('scroll', onMove, { passive: true });
  window.addEventListener('resize', onMove);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let aiStatusTimer = null;

function setAIApplyStatus(state, message, autoHide = true) {
  const box = document.getElementById('aiApplyStatus');
  const badge = document.getElementById('aiApplyBadge');
  const msg = document.getElementById('aiApplyMsg');
  if (!box || !badge || !msg) return;

  // reset timer cũ nếu có
  if (aiStatusTimer) {
    clearTimeout(aiStatusTimer);
    aiStatusTimer = null;
  }

  box.style.display = 'block';
  box.classList.remove('running', 'success', 'error');

  if (state === 'running') {
    box.classList.add('running');
    badge.textContent = 'RUNNING';
  }
  if (state === 'success') {
    box.classList.add('success');
    badge.textContent = 'SUCCESS';
  }
  if (state === 'error') {
    box.classList.add('error');
    badge.textContent = 'FAILED';
  }

  msg.textContent = message || '';

  // ✅ tự động tắt sau 3 giây (trừ khi đang running)
  if (autoHide && state !== 'running') {
    aiStatusTimer = setTimeout(() => {
      box.style.display = 'none';
    }, 3000);
  }
}


function hideAIApplyStatus() {
  const box = document.getElementById('aiApplyStatus');
  if (box) box.style.display = 'none';
}
bindAIStatusReflow();

});

function formatQuantityDisplay(val) {
  const num = parseFloat(val);
  if (!Number.isFinite(num)) return val || "0";
  return num.toFixed(2).replace(/\.0+$/, "").replace(/\.$/, "");
}


