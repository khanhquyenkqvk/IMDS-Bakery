// assets/js/barcode-wasm.js
// ZXing-C++ WASM ROI Scanner + DB lookup + Auto-fill

import {
  readBarcodesFromImageData,
  setZXingModuleOverrides,
  getZXingModule,
} from "https://esm.sh/@sec-ant/zxing-wasm/reader";

setZXingModuleOverrides({
  locateFile: (path, prefix) => {
    if (path.endsWith(".wasm")) {
      return `https://esm.sh/@sec-ant/zxing-wasm/dist/reader/${path}`;
    }
    return prefix + path;
  },
});

getZXingModule().catch(() => {});

(function () {
  // ===== CONFIG =====
function resolveApiOrigin() {
  if (window.API_BASE && /^https?:\/\//i.test(window.API_BASE)) return window.API_BASE;
  if (window.API_BASE_URL && /^https?:\/\//i.test(window.API_BASE_URL)) return window.API_BASE_URL;

  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `${location.protocol}//${host}:5000`;
  }
  return location.origin; // https://imdsbakery.id.vn
}

const API_ORIGIN = resolveApiOrigin();
const API_BASE = `${API_ORIGIN}/api`;

  // Expect endpoint: GET /api/ingredients/by-barcode?code=xxxx
  // Return: { success:true, data:{ name:"Sugar", unit:"kg" } }

  // ===== ELEMENTS =====
  const modal = document.getElementById("barcodeModal");
  const videoEl = document.getElementById("barcodeVideo");
  const resultEl = document.getElementById("barcodeResultText");
  const hintEl = document.getElementById("barcodeHint");
  const btnOpen = document.getElementById("btnBarcode");
  const btnClose = document.getElementById("btnCloseBarcode");
  const btnTorch = document.getElementById("btnTorch");
  const cameraSelect = document.getElementById("cameraSelect");
  const roiBox = document.getElementById("roiBox");
  const viewport = document.getElementById("scanStage"); // ✅ dùng scanStage

  if (!btnOpen || !modal || !videoEl || !resultEl) {
    console.warn("[BARCODE/WASM] missing elements");
    return;
  }

  // ===== STATE =====
  let stream = null;
  let track = null;
  let timer = null;
  let busy = false;
  let isStarting = false;
  const SCAN_COOLDOWN_MS = 1200;       // time to ignore re-scan of same/any code
let cooldownUntil = 0;              // timestamp
let lastAcceptedCode = "";   

  // stability
  let last = "";
  let sameCount = 0;

  // torch
  let torchOn = false;
// ===== SUCCESS SOUND (beep) =====
let audioCtx = null;

function playSuccessBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    if (!audioCtx) audioCtx = new Ctx();

    // Some browsers require resume after user gesture (your Start Scan click is a gesture)
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

    const now = audioCtx.currentTime;

    // Two-tone "scanner" beep: 880Hz then 1320Hz
    const o1 = audioCtx.createOscillator();
    const g1 = audioCtx.createGain();
    o1.type = "sine";
    o1.frequency.setValueAtTime(880, now);
    g1.gain.setValueAtTime(0.0001, now);
    g1.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
    o1.connect(g1).connect(audioCtx.destination);
    o1.start(now);
    o1.stop(now + 0.11);

    const o2 = audioCtx.createOscillator();
    const g2 = audioCtx.createGain();
    o2.type = "sine";
    o2.frequency.setValueAtTime(1320, now + 0.12);
    g2.gain.setValueAtTime(0.0001, now + 0.12);
    g2.gain.exponentialRampToValueAtTime(0.22, now + 0.13);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    o2.connect(g2).connect(audioCtx.destination);
    o2.start(now + 0.12);
    o2.stop(now + 0.23);
  } catch (_) {}
}

  function setHint(msg) {
    if (hintEl) hintEl.textContent = msg || "";
  }

  // ROI success effect (optional)
  function okEffect() {
    try {
      if (roiBox) roiBox.classList.add("scan-ok");
      if (viewport) viewport.classList.add("shake");
      if (navigator.vibrate) navigator.vibrate(80);
      setTimeout(() => roiBox && roiBox.classList.remove("scan-ok"), 450);
      setTimeout(() => viewport && viewport.classList.remove("shake"), 260);
    } catch (_) {}
  }

  function showModal() {
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }
  function hideModal() {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }

  function hardStopStream() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    busy = false;
    isStarting = false;

    try {
      if (btnTorch) btnTorch.onclick = null;
      torchOn = false;
      if (btnTorch) btnTorch.style.display = "none";
    } catch (_) {}

    try { if (track) track.stop(); } catch (_) {}
    track = null;

    try {
      if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
    } catch (_) {}
    stream = null;

    try { videoEl.pause(); } catch (_) {}
    try { videoEl.srcObject = null; } catch (_) {}
    try { videoEl.load(); } catch (_) {}

    last = "";
    sameCount = 0;
  }
function calcExpiryDate(days) {
  if (!days || isNaN(days)) return null;
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

  async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === "videoinput");
  }

  async function populateCameraSelect() {
    if (!cameraSelect) return;
    cameraSelect.innerHTML = `<option value="">Auto camera</option>`;
    const cams = await listCameras();
    cams.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = c.deviceId;
      opt.textContent = c.label || `Camera ${i + 1}`;
      cameraSelect.appendChild(opt);
    });
  }

  async function tryEnableTorch(t) {
    if (!btnTorch) return;
    btnTorch.style.display = "none";
    try {
      const caps = t.getCapabilities ? t.getCapabilities() : {};
      if (caps && caps.torch) {
        btnTorch.style.display = "inline-flex";
        btnTorch.onclick = async () => {
          torchOn = !torchOn;
          await t.applyConstraints({ advanced: [{ torch: torchOn }] });
        };
      }
    } catch (_) {
      btnTorch.style.display = "none";
    }
  }

  function getROI(videoW, videoH) {
    if (!roiBox || !viewport) {
      const w = Math.floor(videoW * 0.7);
      const h = Math.floor(videoH * 0.35);
      return { x: Math.floor((videoW - w) / 2), y: Math.floor((videoH - h) / 2), w, h };
    }

    const vpRect = viewport.getBoundingClientRect();
    const roiRect = roiBox.getBoundingClientRect();

    const rx = (roiRect.left - vpRect.left) / vpRect.width;
    const ry = (roiRect.top - vpRect.top) / vpRect.height;
    const rw = roiRect.width / vpRect.width;
    const rh = roiRect.height / vpRect.height;

    const x = Math.max(0, Math.floor(rx * videoW));
    const y = Math.max(0, Math.floor(ry * videoH));
    const w = Math.min(videoW - x, Math.floor(rw * videoW));
    const h = Math.min(videoH - y, Math.floor(rh * videoH));
    return { x, y, w, h };
  }

  function isValidEAN13(code) {
    if (!/^\d{13}$/.test(code)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(code[i], 10) * (i % 2 === 0 ? 1 : 3);
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(code[12], 10);
  }

async function lookupIngredientByBarcode(code) {
  const url = `${API_BASE}/barcode/lookup?code=${encodeURIComponent(code)}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data && data.success && data.data) return data.data;
  return null;
}


  function fillRowFromFoundIngredient(ing, barcode) {
    const tbody = document.querySelector(".table.ingredients .tbody");
    if (!tbody) return;

    const rows = tbody.querySelectorAll(".tr");
    let target = null;

    rows.forEach(row => {
      const nameInput = row.querySelector(".td.product input");
      if (!target && nameInput && !nameInput.value.trim()) target = row;
    });

    if (!target) {
      // không có dòng trống => tự thêm 1 dòng
      const addLine = document.querySelector(".add-line");
      if (addLine) addLine.click();
      target = tbody.querySelector(".tr:last-child") || rows[rows.length - 1];
    }

    const nameInput = target.querySelector(".td.product input");
    const qtyInput = target.querySelector(".td.qty input");
    const unitSelect = target.querySelector(".td.unit select");
    const dateInput = target.querySelector(".td.date input"); 
    const noteInput = target.querySelector(".td.note input");

    if (nameInput) nameInput.value = ing.name || "";

    if (unitSelect && ing.unit) {
      const u = String(ing.unit).toLowerCase().trim();
      let matched = false;
      unitSelect.querySelectorAll("option").forEach(opt => {
        if (opt.textContent.trim().toLowerCase() === u) {
          opt.selected = true;
          matched = true;
        }
      });
      if (!matched) unitSelect.selectedIndex = 0;
    }

    // qty mặc định 1 nếu đang 0
    if (qtyInput && (!qtyInput.value || qtyInput.value === "0")) qtyInput.value = "1";
    // === AUTO FILL EXPIRY DATE ===
    if (dateInput && ing.shelf_life_days) {
    const expiry = calcExpiryDate(ing.shelf_life_days);
    if (expiry) dateInput.value = expiry;
    }


    // lưu barcode vào note cho dễ trace
    if (noteInput && barcode) {
      const old = (noteInput.value || "").trim();
      if (!old.includes(barcode)) noteInput.value = old ? `${old} | barcode:${barcode}` : `barcode:${barcode}`;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    try { qtyInput && qtyInput.focus(); } catch (_) {}
  }

  async function onFinalDecoded(code) {
  const nowMs = Date.now();

  // Global cooldown to avoid spam (same barcode stays in ROI)
  if (nowMs < cooldownUntil) return;

  // Avoid same code repeated immediately
  if (code === lastAcceptedCode && nowMs < cooldownUntil) return;

  lastAcceptedCode = code;
  cooldownUntil = nowMs + SCAN_COOLDOWN_MS;

  resultEl.textContent = code;
  okEffect();
  playSuccessBeep();

  try {
    setHint("Looking up barcode...");
    const ing = await lookupIngredientByBarcode(code);

    if (!ing) {
      setHint("Not found in database.");
      // Keep scanning (DO NOT stop camera / DO NOT close modal)
      return;
    }

    fillRowFromFoundIngredient(ing, code);
    setHint(`Added: ${ing.name || "Unknown"} (${ing.unit || "-"})`);

    // Keep scanning (DO NOT stop camera / DO NOT close modal)
    return;
  } catch (e) {
    console.warn("[BARCODE/WASM] lookup error:", e);
    setHint("Lookup error. Please try again.");
    // Keep scanning
    return;
  }
}


  async function decodeLoop() {
    if (busy) return;
    if (!videoEl.videoWidth || !videoEl.videoHeight) return;

    busy = true;
    try {
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      const { x, y, w, h } = getROI(vw, vh);

      const canvas = document.createElement("canvas");
      const targetW = Math.min(900, w);
      const scale = targetW / w;
      canvas.width = Math.max(1, Math.floor(w * scale));
      canvas.height = Math.max(1, Math.floor(h * scale));

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(videoEl, x, y, w, h, 0, 0, canvas.width, canvas.height);

      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const res = await readBarcodesFromImageData(img, {
        tryHarder: true,
        formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF"],
        maxSymbols: 1,
      });

      if (res && res.length) {
        const raw = String(res[0].text || "").trim();

        // filter EAN13 checksum
        if (/^\d{13}$/.test(raw) && !isValidEAN13(raw)) return;

        if (raw === last) sameCount++;
        else { last = raw; sameCount = 1; }

        if (sameCount >= 2) {
          // chốt 1 lần, rồi reset stability để tránh spam
          last = "";
          sameCount = 0;

          await onFinalDecoded(raw);
        }
      }
    } catch (_) {
      // ignore
    } finally {
      busy = false;
    }
  }

  async function startScan() {
    if (isStarting) return;
    isStarting = true;

    hardStopStream();
    showModal();
    resultEl.textContent = "Scanning...";
    setHint("Đang mở camera...");

    if (!navigator.mediaDevices?.getUserMedia) {
      alert("❌ Camera not available!");
      stopScan(true);
      return;
    }

    await populateCameraSelect().catch(() => {});

    const deviceId = cameraSelect && cameraSelect.value ? cameraSelect.value : null;

    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.error("[BARCODE/WASM] getUserMedia error:", err);
      alert(`❌ Camera error: ${err?.name || "Unknown"} - ${err?.message || err}`);
      stopScan(true);
      return;
    }

    videoEl.srcObject = stream;
    track = stream.getVideoTracks()[0] || null;

    if (track) {
      try {
        await track.applyConstraints({
          advanced: [
            { focusMode: "continuous" },
            { exposureMode: "continuous" },
            { whiteBalanceMode: "continuous" },
          ],
        });
      } catch (_) {}
      await tryEnableTorch(track);
    }

    try { await videoEl.play(); } catch (_) {}

    setHint("Place the code inside the frame to scan.");
    timer = setInterval(decodeLoop, 120);
    isStarting = false;
  }

  // closeAndStop = true: stop camera + đóng modal
  function stopScan(closeAndStop = true) {
    hardStopStream();
    if (closeAndStop) hideModal();
    if (closeAndStop) setHint("");
    if (closeAndStop) resultEl.textContent = "-";
  }
function stopCameraOnly() {
  hardStopStream();            // dừng camera + timer
  // KHÔNG hideModal()
  // KHÔNG reset resultEl
}

  // ===== EVENTS =====
  btnOpen.addEventListener("click", (e) => {
    e.preventDefault();
    startScan();
  });

  btnClose?.addEventListener("click", (e) => {
    e.preventDefault();
    stopScan(true);
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) stopScan(true);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("show")) stopScan(true);
  });

  cameraSelect?.addEventListener("change", () => {
    if (modal.classList.contains("show")) startScan();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopScan(true);
  });

  window.addEventListener("pagehide", () => stopScan(true));
  window.addEventListener("beforeunload", () => stopScan(true));
})();
