
const API_BASE = `${location.origin}/api`;
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 NEW SAVE-INGREDIENTS SCRIPT LOADED');
});
// Lightweight toast notification (matching Settings style)
function showToast(message, type = 'info') {
  // Remove existing toasts
  document.querySelectorAll('.notification').forEach(n => n.remove());

  const colors = { success: '#10B981', error: '#EF4444', warning: '#F59E0B', info: '#3B82F6' };
  const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
  const el = document.createElement('div');
  el.className = `notification notification-${type}`;
  el.style.cssText = `position:fixed;top:20px;right:20px;background:${colors[type]||colors.info};color:#fff;padding:12px 20px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:1000;display:flex;align-items:center;gap:8px;font:500 14px Inter, system-ui, sans-serif;animation:slideIn .3s ease;`;
  el.innerHTML = `<i class="fa-solid fa-${icons[type]||icons.info}"></i><span>${message}</span>`;
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}`;
    document.head.appendChild(style);
  }
  document.body.appendChild(el);
  setTimeout(() => { el.style.animation = 'slideOut .3s ease'; setTimeout(()=>el.remove(), 300); }, 2500);
}
function __incBatchAndClearActive() {
  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD
  const key = `batch_count_${today}`;
  const cur = parseInt(localStorage.getItem(key) || '0', 10);
  localStorage.setItem(key, String(cur + 1));          // ✅ tăng đếm trong localStorage

  // clear “phiên lô” đang mở để lần sau sinh mã mới
  localStorage.removeItem('active_batch_code');
  localStorage.removeItem('active_batch_date');

  // dọn các dữ liệu tạm (tùy chọn)
  ['ingredients_to_save','saved_import_result','ingredients_to_restore','import_meta']
    .forEach(k => sessionStorage.removeItem(k));

  console.log('[SAVE] batch_count now =', localStorage.getItem(key));
}
function bindActionButtons() {
  // --- Add Ingredients ---
  const btnAdd = document.getElementById('btnAddIngredients');
  if (btnAdd) {
    const freshAdd = btnAdd.cloneNode(true);                   // xoá mọi listener cũ
    btnAdd.replaceWith(freshAdd);
    freshAdd.addEventListener('click', () => {
      // KHÔNG xoá active_batch_code → tiếp tục cùng lô hiện tại
      sessionStorage.removeItem('ingredients_to_restore');
      sessionStorage.removeItem('ingredients_to_save');
      sessionStorage.removeItem('saved_import_result');
      sessionStorage.removeItem('import_meta');
      window.location.href = 'index.html';
    });
  }

  // --- Export ---
  const btnExport = document.getElementById('btnExport');
  if (btnExport) {
    const freshExport = btnExport.cloneNode(true);
    btnExport.replaceWith(freshExport);
    freshExport.addEventListener('click', () => {
      if (typeof exportToExcel === 'function') exportToExcel();
    });
  }

  // --- Completed Warehouse Entry ---
  const oldDone = document.getElementById('btnCompleteEntry');
  if (oldDone) {
    const btnDone = oldDone.cloneNode(true);                   // xoá mọi listener cũ (khỏi bị “bound” trước đó)
    oldDone.replaceWith(btnDone);

    btnDone.addEventListener('click', async (e) => {
      e.preventDefault();
      if (btnDone.disabled) return;
      btnDone.disabled = true;
      btnDone.classList.add('loading');

      try {
        // Lấy dữ liệu cần lưu từ sessionStorage hoặc từ bảng hiện tại
        const draftStr = sessionStorage.getItem('ingredients_to_save');
        const meta = JSON.parse(sessionStorage.getItem('import_meta') || '{}');
        let items = [];
        if (draftStr) {
          try { items = JSON.parse(draftStr) || []; } catch(_) { items = []; }
        }
        if (!items.length) {
          // fallback lấy trực tiếp từ DOM nếu cần
          const rows = document.querySelectorAll('#inventoryTableBody .tr');
          rows.forEach(row => {
            const product = row.querySelector('.td.product-name')?.textContent?.trim();
            const quantity = parseFloat(row.querySelector('.td.quantity')?.textContent?.trim() || '0');
            const unit = row.querySelector('.td.unit')?.textContent?.trim();
            const useByDate = row.querySelector('.td.use-by-date')?.textContent?.trim();
            if (product && quantity > 0 && unit) {
              items.push({ product, quantity, unit, useByDate, note: '' });
            }
          });
        }

        if (!items.length) {
          showToast('There is no raw material data to save', 'warning');
          btnDone.disabled = false;
          btnDone.classList.remove('loading');
          return;
        }

        const payload = {
          batch_code: meta.batchCode || `L${new Date().toISOString().slice(0,10)}-01`,
          received_date: meta.receivedDate || new Date().toISOString().slice(0,10),
          items
        };

        const userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
        const userId = userInfo.user_id || 1;   

        const resp = await fetch(`${API_BASE}/imports`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': String(userId),
          },
          body: JSON.stringify(payload),
          mode: 'cors'
        });
        if (!resp.ok) {
          let msg = `HTTP ${resp.status}`;
          try { const j = await resp.json(); if (j?.error) msg = j.error; } catch(_) {}
          throw new Error(msg);
        }
        const data = await resp.json();
        sessionStorage.setItem('saved_import_result', JSON.stringify(data.data));

        // Hoàn tất: tăng bộ đếm lô + dọn tạm, rồi điều hướng
        if (typeof window.finalizeBatchAndStepCounter === 'function') {
          window.finalizeBatchAndStepCounter();
        } else {
          __incBatchAndClearActive();
        }
        showToast('Stock-in completed successfully!', 'success');
        setTimeout(() => { window.location.href = '../import-raw-materials/index.html'; }, 900);
      } catch (err) {
        console.error('[CompleteEntry] error:', err);
        showToast('Error saving to database: ' + (err?.message || 'Please try again.'), 'error');
        btnDone.disabled = false;
        btnDone.classList.remove('loading');
      }
    });
  }
}

// bảo hiểm: gắn khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', bindActionButtons);

window.addEventListener('load', () => {
  const tableBody = document.getElementById('inventoryTableBody');
  if (tableBody) tableBody.innerHTML = '';

  // 1) Nếu có dữ liệu từ DB → dùng luôn
  const saved = sessionStorage.getItem('saved_import_result'); 
  if (saved) {
    try {
      const rows = JSON.parse(saved); 
      rows.forEach(r => {
      const div = document.createElement('div');
      div.className = 'tr new-ingredient';
      div.innerHTML = `
        <div class="td batch-code">${r.batch_code}</div>
        <div class="td product-name">${r.product}</div>
        <div class="td quantity">${r.quantity}</div>
        <div class="td unit">${r.unit}</div>
        <div class="td received-date">${r.received_date}</div>
        <div class="td use-by-date">${r.use_by_date}</div>
        <div class="td status"></div>
      `;
      tableBody.appendChild(div);

      // ✅ NEW: render badge từ DB (r.status) hoặc fallback theo hạn dùng
      renderStatusCell(div, r.status, r.use_by_date);
    });
 rehydrateStatusForAllRows();

      // làm nổi bật 2s
      setTimeout(() => {
        document.querySelectorAll('.tr.new-ingredient').forEach(row => {
          row.style.backgroundColor = '#fef3c7';
          setTimeout(() => {
            row.style.backgroundColor = '';
            row.classList.remove('new-ingredient');
          }, 2000);
        });
      }, 100);

      // 🔧 GẮN NÚT TRƯỚC KHI RETURN
      bindActionButtons();

      // clear tạm thời (tùy ý: giữ lại để export vẫn có data)
      // sessionStorage.removeItem('saved_import_result');
      // sessionStorage.removeItem('ingredients_to_save');
      return; // ✅ kết thúc vì đã render xong
    } catch (e) {
      console.warn('Render server result failed', e);
    }
  }

  // 2) Fallback: nếu (vì lý do gì) chưa gọi được API, dùng dữ liệu tạm từ trang trước
  const draft = sessionStorage.getItem('ingredients_to_save');
  const meta  = JSON.parse(sessionStorage.getItem('import_meta') || '{}');
  if (draft) {
    try {
      const ingredients = JSON.parse(draft);
      const batchCode = meta.batchCode || 'L-UNKNOWN';
      const receivedDate = meta.receivedDate || new Date().toISOString().split('T')[0];

      ingredients.forEach(ing => {
      const div = document.createElement('div');
      div.className = 'tr new-ingredient';
      div.innerHTML = `
        <div class="td batch-code">${batchCode}</div>
        <div class="td product-name">${ing.product}</div>
        <div class="td quantity">${ing.quantity}</div>
        <div class="td unit">${ing.unit}</div>
        <div class="td received-date">${receivedDate}</div>
        <div class="td use-by-date">${(ing.useByDate||'')}</div>
        <div class="td status"></div>
      `;
      tableBody.appendChild(div);

      // ✅ NEW: vì draft chưa có status → chỉ fallback theo hạn dùng
      renderStatusCell(div, null, ing.useByDate);
    });
rehydrateStatusForAllRows();
    } catch (e) {
      console.warn('Could not load draft ingredients:', e);
    }
  } else {
    // trạng thái trống (giữ nguyên như bạn đã làm)
  }

  // 🔧 GẮN NÚT Ở NHÁNH FALLBACK/EMPTY
  bindActionButtons();
});

// Export to Excel function
function exportToExcel() {
  try {
    const rows = document.querySelectorAll('#inventoryTableBody .tr:not(.empty-state)');
    if (rows.length === 0) {
      alert('No ingredients to export!');
      return;
    }
    const excelData = [];
    excelData.push(['Batch Code','Product Name','Quantity','Unit','Received Date','Use-by Date','Status']);
    rows.forEach(row => {
      const batchCode = row.querySelector('.td.batch-code')?.textContent?.trim() || '';
      const productName = row.querySelector('.td.product-name')?.textContent?.trim() || '';
      const quantity = row.querySelector('.td.quantity')?.textContent?.trim() || '';
      const unit = row.querySelector('.td.unit')?.textContent?.trim() || '';
      const receivedDate = row.querySelector('.td.received-date')?.textContent?.trim() || '';
      const useByDate = row.querySelector('.td.use-by-date')?.textContent?.trim() || '';
      const status = row.querySelector('.td.status .status-badge')?.textContent?.trim() || '';
      excelData.push([batchCode, productName, quantity, unit, receivedDate, useByDate, status]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Ingredients');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Ingredients_Export_${today}.xlsx`);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    alert('Error exporting to Excel. Please try again.');
  }
}

// Initialize header with dynamic data
function initHeader() {
  const elDateHeader = document.querySelector('.header .date');
  const elTimeHeader = document.querySelector('.header .time');
  const elUserHeader = document.querySelector('.header .user-name');

  function updateHeaderTime() {
    if (window.GlobalLanguage && typeof window.GlobalLanguage.updateDateTime === 'function') {
      window.GlobalLanguage.updateDateTime();
      return;
    }
    const now = new Date();
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const dateStr = `${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}`;
    let h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    const timeStr = `${String(h).padStart(2,'0')}:${m} ${ampm}`;
    if (elDateHeader) elDateHeader.textContent = dateStr;
    if (elTimeHeader) elTimeHeader.textContent = timeStr;
  }

  updateHeaderTime();
  setInterval(updateHeaderTime, 60000);

  try {
    let userInfo = JSON.parse(sessionStorage.getItem('user_info') || '{}');
    if (!userInfo || !userInfo.username) {
      userInfo = { username: 'Nguyen Van A', email: 'nguyenvana@example.com', role: 'employee' };
      sessionStorage.setItem('user_info', JSON.stringify(userInfo));
    }
    if (elUserHeader) elUserHeader.textContent = userInfo.username;
  } catch (error) {
    console.warn('Could not load user info:', error);
    if (elUserHeader) elUserHeader.textContent = 'Nguyen Van A';
  }
}
// ---- STATUS helpers ----
function parseDateLoose(s){
  if(!s) return null;
  const d = new Date(s);
  if(!isNaN(d)) return d;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return null;
}
function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }

function computeStatusFromExp(expStr){
  const exp = parseDateLoose(expStr);
  if(!exp) return 'normal';
  const today = startOfDay(new Date());
  const soon  = new Date(today); soon.setDate(today.getDate()+7);
  const expDay = startOfDay(exp);
  if (expDay < today)  return 'expired';
  if (expDay <= soon)  return 'expSoon';   // <-- OK
  return 'normal';
}


// Map status DB -> class + label (nhận nhiều biến thể)
function mapDbStatusToUi(s){
  s = (s || '').toLowerCase().trim();

  // normal
  if (['valid','normal','ok'].includes(s)) {
    return { cls:'normal', label:'Normal' };
  }

  // expiring soon (nhận cả expSoon do client fallback trả về)
  if ([
    'nearexpiry','near_expiry','near expiry','near-expiry',
    'expsoon','exp_soon','exp-soon','expsoon(<=7d)','expsoon <=7d',
    'expsoon(≤7d)','expsoon ≤7d','expsoon <= 7d','expsoon ≤ 7d',
    'expsoon','expsoon', 'expsoon(=7d)', 'exps', 'expsoonish', 'expsoon-ish',
    'expsoon(<=7)', 'expsoon(≤7)', 'expsoon 7d', 
    'expsoon7', 'expsoon<=7', 'expsoon≤7', 'expsoon <=7d', 'expsoon ≤7d',
    'expsoon<= 7d', 'expsoon ≤ 7d',
    'expsoon (<=7d)', 'expsoon (≤7d)',
    'expsoon ', 'exp soon', 'exp_soon ', 'exp-soon ',
    'expsoon', 'expsoon ', 'expsoon  ', // đề phòng dữ liệu tạp
    'expsoon(<=7d)', 'expsoon(≤7d)',
    'expsoon(7d)', 'expSoon' // <— QUAN TRỌNG: nhận cả expSoon từ client fallback
  ].includes(s)){
    return { cls:'warning', label:'Expiring soon' };
  }

  // expired
  if (['expired','overdue','past_due','past-due'].includes(s)) {
    return { cls:'critical', label:'Expired' };
  }

  // default
  return { cls:'normal', label:'Normal' };
}


// Render badge + set data-status trên dòng
function renderStatusCell(row, dbStatus, expDateStr){
  const m = dbStatus ? mapDbStatusToUi(dbStatus) 
                     : mapDbStatusToUi(computeStatusFromExp(expDateStr));
  const cell = row.querySelector('.td.status');
  if (cell){
    const label = localizeStatusLabel(m.label, m.cls);
    cell.innerHTML = `<span class="status-badge ${m.cls}">${label}</span>`;
    row.dataset.status = m.cls; // dùng cho filter
  }
}
// --- Sau renderStatusCell(...) ---
function rehydrateStatusForAllRows(){
  document.querySelectorAll('#inventoryTableBody .tr').forEach(row=>{
    // Nếu ô status chưa có badge → tính lại theo hạn dùng
    const hasBadge = row.querySelector('.td.status .status-badge');
    if (!hasBadge) {
      const exp = row.querySelector('.td.use-by-date')?.textContent?.trim();
      renderStatusCell(row, null, exp);
    }
    // Đồng thời đảm bảo có data-status để Filter dùng
    if (!row.dataset.status) {
      const exp = row.querySelector('.td.use-by-date')?.textContent?.trim();
      const m = mapDbStatusToUi(computeStatusFromExp(exp));
      row.dataset.status = m.cls;
    }
  });
  // After ensuring badges exist, localize their labels according to current language
  localizeAllStatusBadges();
}

// ===== Localization helpers for Status labels =====
function localizeStatusLabel(label, cls){
  const isVi = (window.GlobalLanguage && typeof window.GlobalLanguage.getLanguage==='function' && window.GlobalLanguage.getLanguage()==='vi');
  if (!isVi) return label; // keep English
  // Prefer class mapping for stability
  if (cls === 'normal') return 'Bình thường';
  if (cls === 'warning') return 'Sắp hết hạn';
  if (cls === 'critical') return 'Hết hạn';
  // Fallback by label text
  const t = String(label||'').toLowerCase();
  if (t.includes('expiring')) return 'Sắp hết hạn';
  if (t.includes('expired')) return 'Hết hạn';
  return 'Bình thường';
}
function localizeAllStatusBadges(){
  document.querySelectorAll('.td.status .status-badge').forEach(badge => {
    const cls = badge.classList.contains('critical') ? 'critical' : badge.classList.contains('warning') ? 'warning' : 'normal';
    badge.textContent = localizeStatusLabel(badge.textContent, cls);
  });
}

// Initialize header when page loads
document.addEventListener('DOMContentLoaded', initHeader);
// ========== SEARCH + SORT cho trang Save Ingredients ==========

// nhỏ gọn: bỏ dấu tiếng Việt để tìm kiếm dễ hơn
function stripAccents(str='') {
  try {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return str; // fallback
  }
}

// lấy text 1 ô theo "key"
function getCellText(row, key) {
  const sel = {
    'batch': '.td.batch-code',
    'product': '.td.product-name',
    'qty': '.td.quantity',
    'unit': '.td.unit',
    'received': '.td.received-date',
    'useby': '.td.use-by-date',
    'status': '.td.status'
  }[key];
  return (row.querySelector(sel)?.textContent || '').trim();
}

// ép kiểu để sort đúng
function parseForSort(value, key) {
  if (key === 'qty') return parseFloat(value.replace(',', '.')) || 0;
  if (key === 'received' || key === 'useby') {
    const t = Date.parse(value);
    return isNaN(t) ? -Infinity : t;
  }
  // batch code: LYYYY-MM-DD-XX → sort tự nhiên theo số cuối
  if (key === 'batch') {
    const m = /-(\d+)$/.exec(value);
    const seq = m ? parseInt(m[1], 10) : 0;
    return { value, seq };
  }
  return value.toLowerCase();
}

// so sánh hai hàng theo key + dir
function compareRows(a, b, key, dir) {
  const va = getCellText(a, keyMap[key]);
  const vb = getCellText(b, keyMap[key]);
  const pa = parseForSort(va, keyMap[key]);
  const pb = parseForSort(vb, keyMap[key]);

  let cmp = 0;
  if (typeof pa === 'object' && typeof pb === 'object') {
    // batch: ưu tiên ngày rồi đến seq
    if (pa.value !== pb.value) cmp = pa.value.localeCompare(pb.value);
    else cmp = pa.seq - pb.seq;
  } else if (typeof pa === 'number' && typeof pb === 'number') {
    cmp = pa - pb;
  } else if (typeof pa === 'number') {
    cmp = pa - (parseFloat(pb) || 0);
  } else if (typeof pb === 'number') {
    cmp = (parseFloat(pa) || 0) - pb;
  } else {
    cmp = String(pa).localeCompare(String(pb));
  }
  return dir === 'asc' ? cmp : -cmp;
}

// ánh xạ class header -> key nội bộ
const keyMap = {
  batch:    'batch',        // .td.batch-code
  product:  'product',      // .td.product-name
  qty:      'qty',          // .td.quantity
  unit:     'unit',         // .td.unit
  received: 'received',     // .td.received-date
  useby:    'useby',        // .td.use-by-date
  status:   'status'        // .td.status
};

// Khởi tạo Search + Sort
(function initSearchAndSort() {
  const tbody = document.getElementById('inventoryTableBody');
  const searchInput = document.getElementById('searchInput');
  const header = document.querySelector('.inventory-table .table-header');
  if (!tbody || !header) return;

  // ========== SEARCH ==========
  let searchTimer = null;
  function applySearch() {
    const q = stripAccents((searchInput?.value || '').trim().toLowerCase());
    const rows = tbody.querySelectorAll('.tr');
    if (!q) {
      rows.forEach(r => r.style.display = '');
      return;
    }
    rows.forEach(row => {
      const textJoin = [
        getCellText(row, 'batch'),
        getCellText(row, 'product'),
        getCellText(row, 'qty'),
        getCellText(row, 'unit'),
        getCellText(row, 'received'),
        getCellText(row, 'useby'),
        getCellText(row, 'status')
      ].join(' | ');
      const hay = stripAccents(textJoin.toLowerCase());
      row.style.display = hay.includes(q) ? '' : 'none';
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applySearch, 120); // debounce
    });
  }

  // ========== SORT ==========
  // gán data-key cho từng th header theo class
  const mapHeaderClassToKey = [
    { cls: 'batch-code',   key: 'batch' },
    { cls: 'product-name', key: 'product' },
    { cls: 'quantity',     key: 'qty' },
    { cls: 'unit',         key: 'unit' },
    { cls: 'received-date',key: 'received' },
    { cls: 'use-by-date',  key: 'useby' },
    { cls: 'status',       key: 'status' }
  ];

  mapHeaderClassToKey.forEach(({cls, key}) => {
    const th = header.querySelector(`.th.${cls}`);
    if (th) th.dataset.sortKey = key;
  });

  let currentSort = { key: null, dir: 'asc' };

  header.addEventListener('click', (e) => {
    const th = e.target.closest('.th');
    if (!th || !th.dataset.sortKey) return;
    const key = th.dataset.sortKey;

    // toggle asc/desc nếu click lại cùng cột
    if (currentSort.key === key) {
      currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      currentSort = { key, dir: 'asc' };
    }

    // loại bỏ indicator cũ
    header.querySelectorAll('.th').forEach(h => h.classList.remove('sorted-asc','sorted-desc'));
    th.classList.add(currentSort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');

    // sort rows đang hiển thị
    const rows = Array.from(tbody.querySelectorAll('.tr'));
    rows.sort((a, b) => compareRows(a, b, currentSort.key, currentSort.dir));
    rows.forEach(r => tbody.appendChild(r));
  });
})();
// ===== helpers =====
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const tableBody = $('#inventoryTableBody');

function parseDate(s){
  if(!s) return null;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
  if(!ok) return null;
  const d = new Date(s); return isNaN(d.getTime()) ? null : d;
}
function getCell(row, cls){ return (row.querySelector(`.td.${cls}`)?.textContent || '').trim(); }
function uniqueUnits(){
  const set = new Set();
  $$('.td.unit', tableBody).forEach(td => set.add(td.textContent.trim()));
  return [...set].filter(Boolean).sort();
}

// ===== FILTER =====
let filterState = { status:'all', unit:'all', recvFrom:'', recvTo:'', expFrom:'', expTo:'' };
let filterPopover;

function applyFilter(){
  const rows = document.querySelectorAll('#inventoryTableBody .tr');

  // BẢO HIỂM: ensure mọi row đều có dataset.status & badge
  rows.forEach(row => {
    if (!row.dataset.status) {
      const exp = row.querySelector('.td.use-by-date')?.textContent?.trim();
      const m = mapDbStatusToUi(computeStatusFromExp(exp));
      row.dataset.status = m.cls;
      const cell = row.querySelector('.td.status');
      if (cell && !cell.querySelector('.status-badge')) {
        cell.innerHTML = `<span class="status-badge ${m.cls}">${m.label}</span>`;
      }
    }
  });

  // … phần lọc như bạn đã có …
  rows.forEach(row=>{
    // Unit
    const unit = row.querySelector('.td.unit')?.textContent?.trim() || '';
    if (filterState.unit !== 'all' && unit !== filterState.unit) { row.style.display = 'none'; return; }

    // Date ranges
    const rcv  = parseDateLoose(row.querySelector('.td.received-date')?.textContent?.trim());
    const exp  = parseDateLoose(row.querySelector('.td.use-by-date')?.textContent?.trim());
    const rFrom = parseDateLoose(filterState.recvFrom);
    const rTo   = parseDateLoose(filterState.recvTo);
    const eFrom = parseDateLoose(filterState.expFrom);
    const eTo   = parseDateLoose(filterState.expTo);
    if (rFrom && (!rcv || startOfDay(rcv) < startOfDay(rFrom))) { row.style.display='none'; return; }
    if (rTo   && (!rcv || startOfDay(rcv) > startOfDay(rTo)))   { row.style.display='none'; return; }
    if (eFrom && (!exp || startOfDay(exp) < startOfDay(eFrom))) { row.style.display='none'; return; }
    if (eTo   && (!exp || startOfDay(exp) > startOfDay(eTo)))   { row.style.display='none'; return; }

    // Status filter
    if (filterState.status !== 'all') {
      const need = filterState.status === 'expired' ? 'critical'
                : filterState.status === 'expSoon' ? 'warning' : 'normal';
      if ((row.dataset.status || 'normal') !== need) { row.style.display='none'; return; }
    }

    row.style.display='';
  });
}



function openFilterPopover(btn){
  if(filterPopover) filterPopover.remove();
  filterPopover = document.createElement('div');
  filterPopover.className='popover';
  const units = uniqueUnits();
  filterPopover.innerHTML = `
    <div class="row"><label>Status</label>
      <select id="fltStatus">
        <option value="all">All</option>
        <option value="normal">Normal</option>
        <option value="expSoon">Expiring soon (≤7d)</option>
        <option value="expired">Expired</option>
      </select>
    </div>
    <div class="row"><label>Unit</label>
      <select id="fltUnit">
        <option value="all">All</option>
        ${units.map(u=>`<option value="${u}">${u}</option>`).join('')}
      </select>
    </div>
    <div class="row"><label>Received from</label><input type="date" id="fltRecvFrom"></div>
    <div class="row"><label>Received to</label><input type="date" id="fltRecvTo"></div>
    <div class="row"><label>Use-by from</label><input type="date" id="fltExpFrom"></div>
    <div class="row"><label>Use-by to</label><input type="date" id="fltExpTo"></div>
    <div class="actions">
      <button class="btn" id="fltClear">Clear</button>
      <button class="btn primary" id="fltApply">Apply</button>
    </div>
  `;

  // set state
  filterPopover.querySelector('#fltStatus').value = filterState.status;
  filterPopover.querySelector('#fltUnit').value   = filterState.unit;
  filterPopover.querySelector('#fltRecvFrom').value = filterState.recvFrom;
  filterPopover.querySelector('#fltRecvTo').value   = filterState.recvTo;
  filterPopover.querySelector('#fltExpFrom').value  = filterState.expFrom;
  filterPopover.querySelector('#fltExpTo').value    = filterState.expTo;

  // position
  const rect = btn.getBoundingClientRect();
  const host = btn.parentElement.getBoundingClientRect();
  filterPopover.style.left = (rect.left - host.left) + 'px';
  filterPopover.style.top  = (rect.bottom - host.top + 8) + 'px';
  btn.parentElement.appendChild(filterPopover);

  // events
  filterPopover.querySelector('#fltClear').onclick = () => {
    filterState = { status:'all', unit:'all', recvFrom:'', recvTo:'', expFrom:'', expTo:'' };
    applyFilter(); filterPopover.remove();
  };
  filterPopover.querySelector('#fltApply').onclick = () => {
    filterState = {
      status:  filterPopover.querySelector('#fltStatus').value,
      unit:    filterPopover.querySelector('#fltUnit').value,
      recvFrom:filterPopover.querySelector('#fltRecvFrom').value,
      recvTo:  filterPopover.querySelector('#fltRecvTo').value,
      expFrom: filterPopover.querySelector('#fltExpFrom').value,
      expTo:   filterPopover.querySelector('#fltExpTo').value,
    };
    applyFilter(); filterPopover.remove();
  };

  // click outside to close
  setTimeout(()=>{
    const close=(ev)=>{ if(!filterPopover.contains(ev.target) && ev.target!==btn){ filterPopover.remove(); document.removeEventListener('mousedown', close); } };
    document.addEventListener('mousedown', close);
  },0);
}

// ===== SORT MODULE (scoped to avoid name clashes) =====
(() => {
  const bodyEl = document.getElementById('inventoryTableBody');
  if (!bodyEl) return;

  const getCell = (row, cls) => (row.querySelector(`.td.${cls}`)?.textContent || '').trim();
  const parseDate = (s) => {
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  /** Gắn chỉ số gốc theo thứ tự hiện tại, chỉ gắn cho dòng chưa có */
  function ensureOrigIndex() {
    const rows = Array.from(bodyEl.querySelectorAll('.tr'));
    let max = -1;
    rows.forEach(r => {
      if (r.dataset.origIndex !== undefined) {
        const n = parseInt(r.dataset.origIndex, 10);
        if (!isNaN(n)) max = Math.max(max, n);
      }
    });
    rows.forEach(r => {
      if (!r.dataset.origIndex) r.dataset.origIndex = String(++max);
    });
  }
  // lần đầu + khi có dòng mới được append
  ensureOrigIndex();
  new MutationObserver(muts => {
    if (muts.some(m => m.addedNodes && m.addedNodes.length)) ensureOrigIndex();
  }).observe(bodyEl, { childList: true });

  function resetSortToOriginal() {
    const rows = Array.from(bodyEl.querySelectorAll('.tr'));
    rows.sort((a, b) =>
      (parseInt(a.dataset.origIndex || '0', 10) - parseInt(b.dataset.origIndex || '0', 10))
    );
    rows.forEach(r => bodyEl.appendChild(r));
  }

  function sortBy(colClass, dir = 'asc') {
    const rows = Array.from(bodyEl.querySelectorAll('.tr')).filter(r => r.style.display !== 'none');
    const toNum = (v) => {
      const n = parseFloat((v || '').replace(/,/g, ''));
      return isNaN(n) ? null : n;
    };
    rows.sort((a, b) => {
      let va = getCell(a, colClass), vb = getCell(b, colClass);
      const na = toNum(va), nb = toNum(vb);
      if (na !== null && nb !== null) return dir === 'asc' ? na - nb : nb - na;
      const da = parseDate(va), db = parseDate(vb);
      if (da && db) return dir === 'asc' ? da - db : db - da;
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    rows.forEach(r => bodyEl.appendChild(r));
  }

  // Popover chọn cột & hướng sắp xếp
  let sortPopover;
  function openSortPopover(btn) {
    if (sortPopover) sortPopover.remove();
    sortPopover = document.createElement('div');
    sortPopover.className = 'popover';
    sortPopover.innerHTML = `
      <div class="row"><label>Column</label>
        <select id="srtCol">
          <option value="batch-code">Batch code</option>
          <option value="product-name">Product Name</option>
          <option value="quantity">Quantity</option>
          <option value="unit">Unit</option>
          <option value="received-date">Received date</option>
          <option value="use-by-date">Use-by date</option>
          <option value="status">Status</option>
        </select>
      </div>
      <div class="row"><label>Order</label>
        <select id="srtDir">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>
      <div class="actions">
        <button class="btn" id="srtReset">Reset</button>
        <button class="btn primary" id="srtApply">Apply</button>
      </div>
    `;
    const rect = btn.getBoundingClientRect();
    const host = btn.parentElement.getBoundingClientRect();
    sortPopover.style.position = 'absolute';
    sortPopover.style.left = (rect.left - host.left) + 'px';
    sortPopover.style.top  = (rect.bottom - host.top + 8) + 'px';
    btn.parentElement.appendChild(sortPopover);

    sortPopover.querySelector('#srtReset').onclick = () => { resetSortToOriginal(); sortPopover.remove(); };
    sortPopover.querySelector('#srtApply').onclick = () => {
      sortBy(sortPopover.querySelector('#srtCol').value, sortPopover.querySelector('#srtDir').value);
      sortPopover.remove();
    };

    setTimeout(() => {
      const close = (ev) => {
        if (!sortPopover.contains(ev.target) && ev.target !== btn) {
          sortPopover.remove(); document.removeEventListener('mousedown', close);
        }
      };
      document.addEventListener('mousedown', close);
    }, 0);
  }

  // Bind nút Sort: ưu tiên id="btnSort", nếu không có thì dùng .sort-box
  const btnSort = document.getElementById('btnSort') || document.querySelector('.sort-box');
  if (btnSort) btnSort.addEventListener('click', (e) => { e.stopPropagation(); openSortPopover(btnSort); });
})();

// ===== bind buttons =====
(function(){
  const btnFilter = $('#btnFilter');
  const btnSort   = $('#btnSort');
  if (btnFilter) btnFilter.addEventListener('click', (e)=>{ e.stopPropagation(); openFilterPopover(btnFilter); });
  if (btnSort)   btnSort.addEventListener('click',   (e)=>{ e.stopPropagation(); openSortPopover(btnSort); });
})();

