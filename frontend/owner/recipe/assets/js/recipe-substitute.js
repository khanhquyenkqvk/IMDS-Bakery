// frontend/owner/recipe/assets/js/recipe-substitute.js
(function () {
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


  console.log("[FRONT] API_BASE_URL =", API_BASE_URL);
  console.log("[FRONT] generate URL =", `${API_BASE_URL}/api/owner/recipe-substitutes/generate`);


  function getOwnerId() {
    try {
      const info = JSON.parse(sessionStorage.getItem("user_info") || "{}");
      return (
        info.user_id ||
        info.id ||
        info.owner_id ||
        info.userId ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  function getAuthHeaders() {
    const token = sessionStorage.getItem('auth_token');
    const ownerId = getOwnerId();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ownerId ? { "X-User-Id": String(ownerId) } : {}),
    };
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) { alert(message); return; }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fa-solid fa-${type === 'success' ? 'check-circle' : (type === 'error' ? 'triangle-exclamation' : 'circle-info')} toast-icon"></i>
      <div class="toast-message">${message}</div>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    container.appendChild(toast);

    const t = setTimeout(() => toast.remove(), 3000);
    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(t);
      toast.remove();
    });
  }
function setAiStatus(state, text, sub) {
  const pill = document.getElementById('aiStatusPill');
  const t = document.getElementById('aiStatusText');
  const s = document.getElementById('aiStatusSub');
  if (!pill || !t || !s) return;

  pill.classList.remove('ai-status--running', 'ai-status--success', 'ai-status--error', 'ai-pulse');

  if (state === 'running') {
    pill.classList.add('ai-status--running', 'ai-pulse');
  } else if (state === 'success') {
    pill.classList.add('ai-status--success');
  } else if (state === 'error') {
    pill.classList.add('ai-status--error');
  } else {
    pill.classList.add('ai-status--success');
  }

  t.textContent = text || '';
  s.textContent = sub || '';
}

function setBtnBusy(btn, busy, idleHtml) {
  if (!btn) return;
  if (busy) {
    btn.dataset._idleHtml = btn.innerHTML;
    btn.classList.add('is-loading');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span class="btn-label">Generating…</span>`;
  } else {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    btn.innerHTML = idleHtml || btn.dataset._idleHtml || btn.innerHTML;
  }
}

  function ensureAiToolbar() {
    const root = document.getElementById('suggestionContainer');
    if (!root) return;

    if (root.querySelector('.ai-toolbar')) return;

    const bar = document.createElement('div');
    bar.className = 'ai-toolbar';
    bar.style.display = 'flex';
    bar.style.gap = '10px';
    bar.style.margin = '10px 0 16px 0';

    bar.innerHTML = `
      <button class="suggestion-btn suggestion-btn--primary" id="btnGenerateAiSub">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
        <span class="btn-label">Generate AI suggestions</span>
      </button>
      <button class="suggestion-btn suggestion-btn--ghost" id="btnRefreshAiSub">
        <i class="fa-solid fa-rotate"></i> Refresh list
      </button>

      <div class="ai-status ai-status--success" id="aiStatusPill" title="AI status">
        <span class="dot"></span>
        <div>
          <div id="aiStatusText">Ready</div>
          <small class="ai-status-sub" id="aiStatusSub">Waiting for command</small>
        </div>
      </div>
    `;
    const btnGen = bar.querySelector('#btnGenerateAiSub');

    function pulseLed(el, ms = 2400){
      if (!el) return;
      el.classList.add('led-on');
      setTimeout(() => el.classList.remove('led-on'), ms);
    }

    // khi vừa render toolbar (vừa mở tab suggest)
    pulseLed(btnGen, 2600);


    // Chèn ngay sau summary (cho đẹp)
    const summary = root.querySelector('.suggestion-summary');
    if (summary && summary.parentNode) {
      summary.parentNode.insertBefore(bar, summary.nextSibling);
    } else {
      root.insertBefore(bar, root.firstChild);
    }

    bar.querySelector('#btnGenerateAiSub')?.addEventListener('click', async (e) => {
  const btnGen = e.currentTarget;
  const btnRef = bar.querySelector('#btnRefreshAiSub');

  // vibe AI progress (fake but modern)
  const steps = [
    "Scanning inventory signals…",
    "Detecting expired / low-stock materials…",
    "Synthesizing alternative formulas…",
    "Validating units & constraints…",
    "Finalizing suggestions…"
  ];

  let stepTimer = null;
  let i = 0;

  try {
    setBtnBusy(btnGen, true);
    btnGen.classList.add('is-busy');
    pulseLed(btnGen, 4000);

    if (btnRef) btnRef.disabled = true;

    setAiStatus('running', 'Generating', steps[0]);
    showToast('AI is generating suggestions…', 'info');

    stepTimer = setInterval(() => {
      i = (i + 1) % steps.length;
      setAiStatus('running', 'Generating', steps[i]);
    }, 900);

    // generate
    const r = await generateSuggestions(3);

    clearInterval(stepTimer);
    stepTimer = null;

    const created = r?.created ?? 0;
    const updated = r?.updated ?? 0;

    setAiStatus('success', 'Done', `Created ${created} • Updated ${updated}`);
    showToast(`Done: created ${created}, updated ${updated}.`, 'success');

    // reload list
    await loadRecipeSubstitutes({ generate: false });
  } catch (err) {
    if (stepTimer) clearInterval(stepTimer);

    console.error(err);
    setAiStatus('error', 'Failed', (err?.message || String(err)).slice(0, 80));
    showToast(`Generate failed: ${err?.message || err}`, 'error');
  } finally {
    setBtnBusy(btnGen, false);
    btnGen.classList.remove('is-busy');
    if (btnRef) btnRef.disabled = false;
  }
});


    bar.querySelector('#btnRefreshAiSub')?.addEventListener('click', async () => {
      await loadRecipeSubstitutes({ generate: false });
    });
  }

  async function generateSuggestions(maxPerRecipe = 3) {
    const ownerId = getOwnerId();
    if (!ownerId) {
      showToast('Missing owner id in sessionStorage (user_info).', 'error');
      return { success: false };
    }
    console.log("[FRONT] calling generate API...");
const url = `${API_BASE_URL}/api/owner/recipe-substitutes/generate`;
console.log("[FRONT] POST", url);

let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ max_per_recipe: maxPerRecipe, use_ai: true })
  });
} catch (e) {
  console.error("[FRONT] fetch error:", e);
  showToast(`Fetch error: ${e?.message || e}`, "error");
  return { success: false };
}

console.log("[FRONT] response status =", res.status);
const text = await res.text();
console.log("[FRONT] response body =", text);

let json = {};
try { json = JSON.parse(text); } catch (_) {}
if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
return json;

  }

  async function fetchPendingList() {
    const res = await fetch(`${API_BASE_URL}/api/owner/recipe-substitutes/list?status=Pending`, {
      headers: getAuthHeaders()
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
    return json.data || [];
  }

  async function approveSuggestion(id) {
    const res = await fetch(`${API_BASE_URL}/api/owner/recipe-substitutes/${id}/approve`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
  }

  async function rejectSuggestion(id) {
    const res = await fetch(`${API_BASE_URL}/api/owner/recipe-substitutes/${id}/reject`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
  }

  function getRecipeNameFromCard(card) {
    return card?.querySelector('h3')?.textContent?.trim() || 'this recipe';
  }

  function renderSubstituteCards(items) {
    ensureAiToolbar();

    const list = document.querySelector('#suggestionContainer .suggestion-list');
    if (!list) return;

    if (!items.length) {
      list.innerHTML = `<div class="recipes-empty">
        <i class="fa-regular fa-face-smile"></i>
        <div class="recipes-empty-title">No substitute suggestions</div>
        <div class="recipes-empty-desc">All recipes look feasible with current inventory.</div>
      </div>`;
      return;
    }

    list.innerHTML = items.map(s => {
      const d = s.details || {};

      const reasonsText = (d.reasons || []).map(r => {
        const issue = r.issue || '';
        if (issue === 'NearExpiry' || issue === 'Expired') {
          return `${r.ingredient_name} (${issue}, ${r.days_left ?? 'N/A'} days left)`;
        }
        if (issue === 'LowStock') return `${r.ingredient_name} (LowStock)`;
        return `${r.ingredient_name} (${issue})`;
      }).join(', ');

      const materials = (d.materials_check || []);
      const materialsHtml = materials.length ? `
        <div class="materials-panel">
          <div class="materials-heading">
            <span>Check raw materials</span>
            <span class="materials-hint">Need vs Inventory</span>
          </div>
          <div class="materials-table">
            <div class="materials-row materials-row--head">
              <span>Product Name</span>
              <span>Need to use</span>
              <span>Inventory</span>
              <span>Status</span>
              <span>Use-by date</span>
            </div>
            ${materials.map(m => {
              const days = (m.days_left == null) ? 'N/A' : `${m.days_left} days`;
              const danger = (m.status === 'Expired' || m.status === 'NotEnough');
              const warning = (m.status === 'NearExpiry');

              return `
                <div class="materials-row">
                  <span>${m.ingredient_name || '-'}</span>
                  <span>${m.need_qty || 0} ${m.need_unit || ''}</span>
                  <span>${m.inventory_qty || 0} ${m.inventory_unit || ''}</span>
                  <span>
                    <span class="
                      status-chip
                      ${danger ? 'status-chip--danger' : ''}
                      ${warning ? 'status-chip--warning' : ''}
                      ${(!danger && !warning) ? 'status-chip--ok' : ''}
                    ">
                      ${m.status}
                    </span>
                  </span>
                  <span class="${danger ? 'use-by use-by--danger' : ''}">${days}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : '';

      // ✅ ẨN ID (không hiển thị #suggestion_id nữa)
      return `
        <article class="suggestion-card suggestion-card--high" data-suggestion-id="${s.suggestion_id}">
          <div class="suggestion-card__header">
            <div>
              <h3>${d.target_recipe_name || 'Recipe'}</h3>
              <div class="suggestion-tags">
                <span class="priority-chip priority-chip--high">Pending</span>
                <span class="priority-chip priority-chip--info">Has AI formula</span>
              </div>
            </div>
            <div class="suggestion-batch">AI Proposal</div>
          </div>

          <div class="suggestion-alert">
            <span class="alert-title">Suggested reasons:</span>
            <p>${reasonsText || 'Inventory/expiry issue detected.'}</p>
          </div>

          ${materialsHtml}

          <div class="suggestion-actions">
            <button class="suggestion-btn suggestion-btn--ghost btn-open-ai">
              <i class="fa-solid fa-wand-magic-sparkles"></i> AI Formula
            </button>
            <button class="suggestion-btn suggestion-btn--ghost btn-reject">
              <i class="fa-solid fa-xmark"></i> Reject
            </button>
            <button class="suggestion-btn suggestion-btn--primary btn-approve">
              Approve
            </button>
          </div>
        </article>
      `;
    }).join('');

    // Bind events
    list.querySelectorAll('.btn-open-ai').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('[data-suggestion-id]');
        const id = Number(card?.dataset?.suggestionId);
        const item = items.find(x => x.suggestion_id === id);
        if (item) openAiFormulaModal(item);
      });
    });

    list.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = e.target.closest('[data-suggestion-id]');
        const id = card?.dataset?.suggestionId;
        if (!id) return;

        const recipeName = getRecipeNameFromCard(card);
        btn.disabled = true;

        try {
          showToast(`Approving AI suggestion for "${recipeName}"…`, 'info');
          await approveSuggestion(id);
          showToast(`"${recipeName}" approved.`, 'success');

          // ✅ reload list để summary đúng
          await loadRecipeSubstitutes({ generate: false });
        } catch (err) {
          showToast(`Failed to approve "${recipeName}": ${err.message || err}`, 'error');
          btn.disabled = false;
        }
      });
    });

    list.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = e.target.closest('[data-suggestion-id]');
        const id = card?.dataset?.suggestionId;
        if (!id) return;

        const recipeName = getRecipeNameFromCard(card);
        btn.disabled = true;

        try {
          showToast(`Rejecting AI suggestion for "${recipeName}"…`, 'info');
          await rejectSuggestion(id);
          showToast(`"${recipeName}" rejected.`, 'success');

          // ✅ reload list để summary đúng
          await loadRecipeSubstitutes({ generate: false });
        } catch (err) {
          showToast(`Failed to reject "${recipeName}": ${err.message || err}`, 'error');
          btn.disabled = false;
        }
      });
    });
  }

  function getPriorityFromSuggestion(s) {
    const d = s?.details || {};
    const reasons = Array.isArray(d.reasons) ? d.reasons : [];
    const materials = Array.isArray(d.materials_check) ? d.materials_check : [];

    const hasExpired =
      reasons.some(r => String(r.issue).toLowerCase() === 'expired') ||
      materials.some(m => String(m.status) === 'Expired');

    const hasNotEnough =
      reasons.some(r => String(r.issue).toLowerCase() === 'lowstock') ||
      materials.some(m => String(m.status) === 'NotEnough');

    if (hasExpired || hasNotEnough) return 'Urgent';

    const hasNearExpiry =
      reasons.some(r => String(r.issue).toLowerCase() === 'nearexpiry') ||
      materials.some(m => String(m.status) === 'NearExpiry');

    if (hasNearExpiry) return 'Medium';
    return 'Medium';
  }

  function updateSubstituteSummary(items) {
    const root = document.getElementById('suggestionContainer');
    if (!root) return;

    const elTotal = root.querySelector('.summary-number[data-stat="total"]');
    const elUrg = root.querySelector('.summary-number[data-stat="urgent"]');
    const elMed = root.querySelector('.summary-number[data-stat="medium"]');

    const total = items.length;

    const recipeIds = new Set(
      items.map(s => Number(s?.details?.target_recipe_id)).filter(Boolean)
    );
    const dishesCanBeMade = recipeIds.size;

    let urgent = 0, medium = 0;
    items.forEach(s => {
      const p = getPriorityFromSuggestion(s);
      if (p === 'Urgent') urgent++;
      else medium++;
    });

    if (elTotal) elTotal.textContent = String(total);
    if (elUrg) elUrg.textContent = String(urgent);
    if (elMed) elMed.textContent = String(medium);

    const totalCard = root.querySelector('.summary-card--info');
    const desc = totalCard?.querySelector('.summary-desc');
    if (desc) desc.textContent = `Dishes that can be made: ${dishesCanBeMade}`;
  }

  function openAiFormulaModal(item) {
    const modal = document.getElementById('aiFormulaModal');
    const body = document.getElementById('aiFormulaBody');
    const title = document.getElementById('aiFormulaTitle');
    if (!modal || !body || !title) return;

    const d = item.details || {};

    title.textContent = d.target_recipe_name
      ? `AI-Suggested Alternative Recipe — ${d.target_recipe_name}`
      : 'AI-Suggested Alternative Recipe';

    const rows = Array.isArray(d.alternative_ingredients) ? d.alternative_ingredients : [];
    const aiSteps = Array.isArray(d.ai_instructions) ? d.ai_instructions : [];

    const prettyWarehouse = (s) => {
      if (!s) return { label: 'N/A', cls: 'status-chip--ok' };
      const v = String(s);
      if (v === 'NotEnough' || v === 'LowStock') return { label: 'Not enough', cls: 'status-chip--danger' };
      if (v === 'Expired') return { label: 'Expired', cls: 'status-chip--danger' };
      if (v === 'ExpiringSoon' || v === 'NearExpiry') return { label: 'Expiring soon', cls: 'status-chip--warning' };
      if (v === 'InStock') return { label: 'In stock', cls: 'status-chip--ok' };
      return { label: v, cls: 'status-chip--ok' };
    };

    const fmtQtyUnit = (obj) => {
      if (!obj) return '-';
      const qty = (obj.qty == null ? '' : String(obj.qty));
      const unit = obj.unit ? String(obj.unit) : '';
      return `${qty} ${unit}`.trim() || '-';
    };

    const fmtNameQtyUnit = (obj) => {
      if (!obj) return '-';
      const name = obj.name ? String(obj.name) : '';
      const qty = (obj.qty == null ? '' : String(obj.qty));
      const unit = obj.unit ? String(obj.unit) : '';
      return (name ? `${name} — ${qty} ${unit}` : `${qty} ${unit}`).trim() || '-';
    };

    const materialsHtml = rows.length ? `
      <div class="materials-panel">
        <div class="materials-heading">
          <span>Alternative material list</span>
          <span class="materials-hint">Full recipe ingredients</span>
        </div>

        <div class="materials-table">
          <div class="materials-row materials-row--head">
            <span>Ingredient</span>
            <span>Original formula</span>
            <span>Replace</span>
            <span>Warehouse status</span>
          </div>

          ${rows.map(r => {
            const type = (r.type || '').toLowerCase();
            const isReplaced = (type === 'replaced');
            const wh = prettyWarehouse(r.warehouse_status);
            return `
              <div class="materials-row ${isReplaced ? 'materials-row--highlight' : ''}">
                <span>${r.name || '-'}</span>
                <span>${fmtQtyUnit(r.original)}</span>
                <span>${isReplaced ? `<b>${fmtNameQtyUnit(r.new)}</b>` : fmtQtyUnit(r.new)}</span>
                <span><span class="status-chip ${wh.cls}">${wh.label}</span></span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : `<div class="materials-panel"><b>No ingredient list generated.</b></div>`;

    const instructionsHtml = aiSteps.length ? `
      <div class="materials-panel materials-panel--steps" style="margin-top:16px;">
        <div class="materials-heading">
          <span>AI-tailored instructions</span>
          <span class="materials-hint">Updated steps</span>
        </div>

        <div class="materials-table">
          <div class="materials-row materials-row--head">
            <span>Step</span>
            <span>Note</span>
          </div>

          ${aiSteps.map((t, idx) => `
            <div class="materials-row">
              <span>${idx + 1}</span>
              <span>${t}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : `
      <div class="materials-panel" style="margin-top:16px;">
        <div class="materials-heading">
          <span>AI-tailored instructions</span>
          <span class="materials-hint">No step list from backend</span>
        </div>
        <div style="padding:10px;">
          ${d?.new_recipe?.notes || 'No instruction generated'}
        </div>
      </div>
    `;

    body.innerHTML = `${materialsHtml}${instructionsHtml}`;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // close modal
  (function bindAiModalClose() {
    const modal = document.getElementById('aiFormulaModal');
    const btnX = document.getElementById('closeAiFormulaModal');
    const btnClose = document.getElementById('btnCloseAiFormula');

    [btnX, btnClose].forEach(btn => {
      if (btn) btn.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      });
    });

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    }
  })();

  async function loadRecipeSubstitutes(opts = { generate: false }) {
    ensureAiToolbar();

    try {
      // ✅ chỉ generate khi bạn muốn dùng AI (bấm nút)
      if (opts.generate) {
        const r = await generateSuggestions(3);
        if (r?.created != null) {
          showToast(`Generated ${r.created} suggestion(s).`, 'success');
        }
      }

      const list = await fetchPendingList();
      renderSubstituteCards(list);
      updateSubstituteSummary(list);
    } catch (err) {
      console.error(err);
      showToast(err.message || String(err), 'error');
    }
  }

  async function generateThenLoad() {
    await loadRecipeSubstitutes({ generate: true });
  }

  // hook để script.js gọi khi mở tab
  window.__loadRecipeSubstitutes = function () {
    // ✅ mở tab chỉ load list thôi (không generate)
    return loadRecipeSubstitutes({ generate: false });
  };
})();
