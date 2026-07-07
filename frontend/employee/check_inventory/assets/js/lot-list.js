document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = window.API_BASE || `${location.origin}/api`;
  const lotGrid = document.getElementById("lotGrid");
  const loadingSpinner = document.getElementById("loadingSpinner");

  let groupedLots = [];
  let currentPage = 1;
  const PAGE_SIZE = 20;

  function getAuthHeaders() {
    const h = { "Content-Type": "application/json" };
    const token = sessionStorage.getItem("auth_token");
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: getAuthHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || json.error || `HTTP ${res.status}`);
    }
    // ✅ accept both: array OR {success,data}
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.items)) return json.items;
    return [];
  }

  function formatQuantityDisplay(val) {
    const num = parseFloat(val);
    if (!Number.isFinite(num)) return val || "0";
    return num.toFixed(2).replace(/\.?0+$/, "");
  }

  function buildBaseLotCode(lotCode) {
    const parts = String(lotCode || "").split("-");
    // logic cũ của bạn
    let base = parts.slice(0, 3).join("-");
    if (parts.length > 3) base = parts.slice(0, 4).join("-");
    return base;
  }

  function updatePagination(totalPages) {
    const pageInfo = document.getElementById("pageInfo");
    const prevBtn = document.getElementById("pagePrev");
    const nextBtn = document.getElementById("pageNext");
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }

  function renderPage(page = currentPage) {
    const totalPages = Math.max(1, Math.ceil(groupedLots.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(page, 1), totalPages);

    lotGrid.innerHTML = "";

    if (groupedLots.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lot-empty";
      empty.textContent = "No lots found";
      lotGrid.appendChild(empty);
      updatePagination(totalPages);
      return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = groupedLots.slice(start, start + PAGE_SIZE);

    pageItems.forEach(group => {
      const card = document.createElement("article");
      card.className = "lot-card";

      const ingredientListHtml = group.items
        .slice(0, 6) // optional: tránh card quá dài
        .map(item => `
          <li>
            <span>${item.ingredient_name || ""}</span>
            <span>${formatQuantityDisplay(item.quantity)} ${item.unit || ""}</span>
          </li>
        `).join("");

      card.innerHTML = `
        <div class="lot-top">${group.lotCode}</div>
        <ul class="lot-items">${ingredientListHtml}</ul>
      `;

      card.addEventListener("click", () => {
        localStorage.setItem("selectedLot", group.lotCode); // base lot code
        window.location.href = "ingredient-list.html";
      });

      lotGrid.appendChild(card);
    });

    updatePagination(totalPages);
  }

  async function init() {
    try {
      if (loadingSpinner) loadingSpinner.style.display = "block";
      if (lotGrid) lotGrid.innerHTML = "";

      const list = await fetchJson(`${API_BASE}/inventory`);

      // ✅ group by base lot code
      const groupedData = {};
      list.forEach(item => {
        const baseLot = buildBaseLotCode(item.lot_code);
        if (!groupedData[baseLot]) groupedData[baseLot] = [];
        groupedData[baseLot].push(item);
      });

      groupedLots = Object.entries(groupedData).map(([lotCode, items]) => ({ lotCode, items }));
      renderPage(1);
    } catch (err) {
      console.error("Error fetching inventory:", err);
      lotGrid.innerHTML = `<div class="lot-empty">Failed to load inventory: ${err.message}</div>`;
    } finally {
      if (loadingSpinner) loadingSpinner.style.display = "none";
    }
  }

  document.getElementById("pagePrev")?.addEventListener("click", () => renderPage(currentPage - 1));
  document.getElementById("pageNext")?.addEventListener("click", () => renderPage(currentPage + 1));

  init();
});
