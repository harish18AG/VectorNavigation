/**
 * VectorNav — Core Application JS
 * ================================
 * Handles:
 *  - API base URL
 *  - Active sidebar navigation highlight
 *  - Global mode state (LIVE / DEMO)
 *  - GPS status bar updates
 *  - Presentation Mode toggle
 *  - Shared utility functions
 */

'use strict';

/* ==========================================================================
   1. Configuration
   ========================================================================== */
const API_BASE = 'http://localhost:5000/api';

/** Application state shared across all modules */
window.VN = {
  mode:       'demo',   // 'live' | 'demo'
  position:   null,     // { lat, lon, alt, accuracy }
  destination: null,    // { lat, lon }
  sessionId:  _genSessionId(),
  lastError:  null,
};

function _genSessionId() {
  return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ==========================================================================
   2. Sidebar Navigation — Highlight current page
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const currentFile = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    if (href === currentFile || (currentFile === '' && href === 'index.html')) {
      item.classList.add('active');
    }
  });

  // Init server status check
  checkServerStatus();

  // Init mode from localStorage
  const savedMode = localStorage.getItem('vn_mode') || 'demo';
  setMode(savedMode, false);
});

/* ==========================================================================
   3. Mode Switching (LIVE / DEMO)
   ========================================================================== */
function setMode(mode, save = true) {
  window.VN.mode = mode;
  if (save) localStorage.setItem('vn_mode', mode);

  const dot   = document.querySelector('.mode-dot');
  const label = document.getElementById('mode-label');

  if (dot) {
    dot.className = 'mode-dot' + (mode === 'demo' ? ' demo' : '');
  }
  if (label) {
    label.textContent = mode === 'demo' ? 'DEMO MODE' : 'LIVE GPS';
  }

  // Update GPS status bar
  if (mode === 'demo') {
    updateStatusBar({
      status:   'demo',
      label:    'Demo Mode',
      lat:      '—',
      lon:      '—',
      alt:      '—',
      accuracy: '—',
    });
  }
}

/** Toggle mode (called by sidebar footer button) */
window.toggleMode = function () {
  const next = window.VN.mode === 'live' ? 'demo' : 'live';
  setMode(next);

  if (next === 'live') {
    window.stopDemoMode();
    window.startLiveGPS();
    window.showAlert('Switched to Live GPS. Fetching your device location...', 'info');
  } else {
    window.stopLiveGPS();
    window.showAlert('Switched to Demo Simulation Mode.', 'info');
  }
};

/* ==========================================================================
   4. GPS Status Bar
   ========================================================================== */
function updateStatusBar(info) {
  const el = id => document.getElementById(id);

  const dotEl = el('status-dot');
  if (dotEl) {
    dotEl.className = `status-dot ${info.status}`;
  }

  const labelEl = el('gps-status-label');
  if (labelEl) labelEl.textContent = info.label || '—';

  ['lat','lon','alt','accuracy'].forEach(k => {
    const e = el(`gps-${k}`);
    if (e) e.textContent = info[k] || '—';
  });

  const updEl = el('gps-updated');
  if (updEl) updEl.textContent = new Date().toLocaleTimeString();
}

/** Update status bar from a real GPS position object */
window.updateStatusFromPosition = function (pos) {
  updateStatusBar({
    status:   'active',
    label:    'GPS Active',
    lat:      pos.lat.toFixed(6),
    lon:      pos.lon.toFixed(6),
    alt:      pos.alt.toFixed(1) + ' m',
    accuracy: pos.accuracy.toFixed(1) + ' m',
  });
};

window.updateStatusFromDemo = function (pos) {
  updateStatusBar({
    status:   'demo',
    label:    'Demo Mode',
    lat:      pos.lat.toFixed(6),
    lon:      pos.lon.toFixed(6),
    alt:      pos.alt.toFixed(1) + ' m',
    accuracy: (pos.accuracy || 4.2).toFixed(1) + ' m',
  });
};

/* ==========================================================================
   5. Server Status Check
   ========================================================================== */
async function checkServerStatus() {
  try {
    const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('not ok');
    const data = await res.json();
    console.log('[VectorNav] Backend:', data.message);
  } catch {
    console.warn('[VectorNav] Backend not reachable — running in offline-frontend mode.');
    const bar = document.querySelector('.gps-status-bar');
    if (bar) {
      bar.insertAdjacentHTML('beforeend',
        `<span class="alert alert-warning text-xs" style="margin:0;padding:4px 10px;">
          ⚠ Backend offline — calculations use client-side JS math
        </span>`
      );
    }
  }
}

/* ==========================================================================
   6. API Helpers
   ========================================================================== */
window.apiPost = async function (endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};

window.apiGet = async function (endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  return res.json();
};

window.apiDelete = async function (endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
  return res.json();
};

/* ==========================================================================
   7. Alert / Toast
   ========================================================================== */
window.showAlert = function (msg, type = 'info', duration = 4000) {
  const container = document.getElementById('alert-container') || _createAlertContainer();
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.style.cssText = 'max-width:420px;box-shadow:var(--shadow-lg);animation:slideIn .25s ease;';
  el.innerHTML = `<span>${_alertIcon(type)}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
};

function _createAlertContainer() {
  const c = document.createElement('div');
  c.id = 'alert-container';
  c.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
  document.body.appendChild(c);
  return c;
}

function _alertIcon(type) {
  const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '❌' };
  return icons[type] || '•';
}

/* ==========================================================================
   8. Number Formatting
   ========================================================================== */
window.fmt = {
  /** Format with n decimal places, fallback to '—' */
  n: (v, dp = 3) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(dp),
  /** km/h */
  kmh: v => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(1) + ' km/h',
  /** m/s */
  ms: v => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(3) + ' m/s',
  /** degrees */
  deg: v => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(2) + '°',
  /** metres */
  m: v => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(2) + ' m',
  /** km */
  km: v => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(3) + ' km',
};

window.setText = function (id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
};

/* ==========================================================================
   9. Presentation Mode
   ========================================================================== */
window.openPresentationMode = function () {
  let overlay = document.getElementById('pres-overlay');
  if (!overlay) {
    overlay = _buildPresentationOverlay();
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
};

window.closePresentationMode = function () {
  const o = document.getElementById('pres-overlay');
  if (o) o.style.display = 'none';
};

function _buildPresentationOverlay() {
  const div = document.createElement('div');
  div.id = 'pres-overlay';
  div.className = 'presentation-overlay';
  div.innerHTML = `
    <div class="presentation-header">
      <div>
        <div class="presentation-title">🛰 VectorNav — Application of Vector Calculus in GPS Navigation</div>
        <div style="font-size:.75rem;color:var(--clr-gray-400);margin-top:4px;">
          B.Tech Capstone Project | Applied Mathematics + Computer Science
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="closePresentationMode()">✕ Exit Presentation</button>
    </div>
    <div class="presentation-body" style="grid-template-columns:1fr 1fr 1fr;align-items:start;">
      <div class="pres-card">
        <div class="pres-card-label">📍 Module 1 — Position</div>
        <div class="pres-card-value" id="pres-lat">—</div>
        <div style="font-size:.7rem;color:var(--clr-gray-400);margin-top:4px;">Latitude</div>
        <div class="pres-card-value" id="pres-lon">—</div>
        <div style="font-size:.7rem;color:var(--clr-gray-400);margin-top:4px;">Longitude</div>
        <div style="font-size:.7rem;color:var(--clr-primary-300);margin-top:8px;font-family:var(--font-mono);">r(t) = xi + yj + zk</div>
      </div>
      <div class="pres-card">
        <div class="pres-card-label">⚡ Module 2 — Motion</div>
        <div class="pres-card-value" id="pres-speed">—</div>
        <div style="font-size:.7rem;color:var(--clr-gray-400);margin-top:4px;">Speed (km/h)</div>
        <div class="pres-card-value" id="pres-direction">—</div>
        <div style="font-size:.7rem;color:var(--clr-gray-400);margin-top:4px;">Direction</div>
        <div style="font-size:.7rem;color:var(--clr-primary-300);margin-top:8px;font-family:var(--font-mono);">v = dr/dt</div>
      </div>
      <div class="pres-card">
        <div class="pres-card-label">🗺 Module 3 — Route & Error</div>
        <div class="pres-card-value" id="pres-dist">—</div>
        <div style="font-size:.7rem;color:var(--clr-gray-400);margin-top:4px;">Optimised Route (km)</div>
        <div class="pres-card-value" id="pres-error">—</div>
        <div style="font-size:.7rem;color:var(--clr-gray-400);margin-top:4px;">GPS Error (m)</div>
        <div style="font-size:.7rem;color:var(--clr-primary-300);margin-top:8px;font-family:var(--font-mono);">Cost = w₁d + w₂t + w₃e</div>
      </div>
    </div>
    <div style="padding:0 var(--sp-6) var(--sp-5);">
      <div style="font-size:.7rem;color:var(--clr-gray-500);text-align:center;">
        All calculations derived from real GPS / Demo Mode data using Python + JavaScript vector calculus engine
      </div>
    </div>
  `;
  return div;
}

/** Called by other modules to push current values to presentation overlay */
window.updatePresentationValues = function (vals) {
  ['lat','lon','speed','direction','dist','error'].forEach(k => {
    if (vals[k] != null) window.setText(`pres-${k}`, vals[k]);
  });
};
