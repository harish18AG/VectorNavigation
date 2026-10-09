/**
 * VectorNav — Module 3 JS (js/module3.js)
 * ==========================================
 * Route Optimization & GPS Error Correction
 *
 * Part A: Route Optimization
 *   - Three routes A/B/C with cost function
 *   - Sliders for weights w1 (distance), w2 (time), w3 (error)
 *   - Optimal route selection
 *
 * Part B: GPS Error Simulator
 *   - Simulate error of 5/10/20/50/custom metres
 *   - Show Reference (blue), Measured (red), Corrected (green) on map
 *   - Error formula step-by-step
 *   - Correction model with improvement %
 */

'use strict';

/* ==========================================================================
   1. State
   ========================================================================== */
let _routeStart  = null;   // { lat, lon }
let _routeDest   = null;   // { lat, lon }
let _routes      = null;   // { A:{...}, B:{...}, C:{...} }
let _optimalKey  = 'B';
let _errorRef    = null;   // { lat, lon }
let _errorSim    = 20;     // error metres

/* Cost weights */
let _w1 = 0.5, _w2 = 0.3, _w3 = 0.2;

/* ==========================================================================
   2. Init
   ========================================================================== */
window.initModule3 = function () {
  const startLat = window.VN.position ? window.VN.position.lat : 13.0827;
  const startLon = window.VN.position ? window.VN.position.lon : 80.2707;

  window.initMap('mod3-map', { lat: startLat, lon: startLon, zoom: 11 });

  // Default start/dest from current position or demo waypoints
  const pts = window.getDemoWaypoints ? window.getDemoWaypoints() : [];
  if (window.VN.position) {
    _routeStart = { lat: window.VN.position.lat, lon: window.VN.position.lon };
  } else if (pts.length >= 2) {
    _routeStart = { lat: pts[0].lat, lon: pts[0].lon };
  } else {
    _routeStart = { lat: 13.0827, lon: 80.2707 }; // Chennai Central
  }

  _routeDest = pts.length >= 2 ? { lat: pts[pts.length-1].lat, lon: pts[pts.length-1].lon } : { lat: 12.8988, lon: 80.2279 }; // Sholinganallur

  // Pre-fill inputs
  _setInputVal('r-start-lat', _routeStart.lat.toFixed(5));
  _setInputVal('r-start-lon', _routeStart.lon.toFixed(5));
  _setInputVal('r-dest-lat',  _routeDest.lat.toFixed(5));
  _setInputVal('r-dest-lon',  _routeDest.lon.toFixed(5));

  _errorRef = { lat: _routeStart.lat, lon: _routeStart.lon };
  _setInputVal('err-ref-lat', _errorRef.lat.toFixed(6));
  _setInputVal('err-ref-lon', _errorRef.lon.toFixed(6));

  // Subscribe to position updates for error ref
  window.onPositionUpdate(pos => {
    _errorRef = { lat: pos.lat, lon: pos.lon };
    window.setText('err-ref-lat-disp', pos.lat.toFixed(6));
    window.setText('err-ref-lon-disp', pos.lon.toFixed(6));
  });

  // Enable click on map to set Destination with reverse geocoding
  window.enableMapClickPicker('mod3-map', async (lat, lon) => {
    _routeDest = { lat, lon };
    _setInputVal('r-dest-lat', lat.toFixed(5));
    _setInputVal('r-dest-lon', lon.toFixed(5));

    let addr = `Location [${lat.toFixed(5)}, ${lon.toFixed(5)}]`;
    try {
      const res = await window.apiGet(`/reverse-geocode?lat=${lat}&lon=${lon}`);
      if (res && res.display_name) addr = res.display_name;
    } catch {}

    const searchInput = document.getElementById('r-dest-search-input');
    if (searchInput) searchInput.value = addr;

    window.setDestinationMarker('mod3-map', lat, lon, addr);
    window.showAlert(`Destination set from map: ${addr.substring(0, 50)}...`, 'success');
  });

  // Init sliders
  _updateWeightDisplays();
};

/* ==========================================================================
   2b. Route Address Search
   ========================================================================== */
let _routeSearchDebounce = null;

window.handleRouteAddressSearch = function (query) {
  clearTimeout(_routeSearchDebounce);
  const container = document.getElementById('r-dest-search-suggestions');
  if (!container) return;

  if (!query || query.trim().length < 2) {
    container.style.display = 'none';
    return;
  }

  _routeSearchDebounce = setTimeout(async () => {
    try {
      const res = await window.apiGet(`/geocode?q=${encodeURIComponent(query.trim())}`);
      if (res && res.results && res.results.length > 0) {
        container.innerHTML = res.results.map(r => {
          const safeName = (r.display_name || '').replace(/'/g, "\\'");
          return `
            <div class="search-suggestion-item" onclick="window.selectRouteAddressSuggestion(${r.lat}, ${r.lon}, '${safeName}')">
              <span class="search-suggestion-icon">📍</span>
              <span class="search-suggestion-text">${r.display_name}</span>
            </div>
          `;
        }).join('');
        container.style.display = 'block';
      } else {
        container.innerHTML = '<div style="padding:10px 14px;font-size:.8rem;color:var(--txt-muted);">No matching address found.</div>';
        container.style.display = 'block';
      }
    } catch {
      container.style.display = 'none';
    }
  }, 300);
};

window.selectRouteAddressSuggestion = function (lat, lon, displayName) {
  const container = document.getElementById('r-dest-search-suggestions');
  if (container) container.style.display = 'none';
  const input = document.getElementById('r-dest-search-input');
  if (input) input.value = displayName;

  _routeDest = { lat, lon };
  _setInputVal('r-dest-lat', lat.toFixed(5));
  _setInputVal('r-dest-lon', lon.toFixed(5));

  window.setDestinationMarker('mod3-map', lat, lon, displayName);
  window.mapFlyTo('mod3-map', lat, lon, 13);
  window.showAlert(`Destination selected: ${displayName.substring(0, 50)}...`, 'success');
};

/* Close suggestions dropdown when clicking outside */
document.addEventListener('click', e => {
  const container = document.getElementById('r-dest-search-suggestions');
  const input = document.getElementById('r-dest-search-input');
  if (container && input && !container.contains(e.target) && e.target !== input) {
    container.style.display = 'none';
  }
});

/* Use current live GPS location as route start */
window.useCurrentLocationAsRouteStart = function () {
  window.autoDetectCurrentLocation(
    pos => {
      _routeStart = { lat: pos.lat, lon: pos.lon };
      _setInputVal('r-start-lat', pos.lat.toFixed(6));
      _setInputVal('r-start-lon', pos.lon.toFixed(6));
      window.setPositionMarker('mod3-map', pos.lat, pos.lon, 'Start (My Location)');
      window.mapFlyTo('mod3-map', pos.lat, pos.lon, 13);
      window.showAlert('Current location set as Route Start!', 'success');
    },
    err => {
      window.showAlert(`Could not get live location: ${err}. Please allow browser location permissions.`, 'warning');
    }
  );
};

/* Quick fill destination from South India preset */
window.fillPresetRouteDest = function (sel) {
  const v = sel.value;
  if (!v || !window.SOUTH_INDIA_PRESETS || !window.SOUTH_INDIA_PRESETS[v]) return;
  const p = window.SOUTH_INDIA_PRESETS[v];
  _routeDest = { lat: p.lat, lon: p.lon };
  _setInputVal('r-dest-lat', p.lat.toFixed(5));
  _setInputVal('r-dest-lon', p.lon.toFixed(5));
  const searchInput = document.getElementById('r-dest-search-input');
  if (searchInput) searchInput.value = p.name;
  window.setDestinationMarker('mod3-map', p.lat, p.lon, p.name);
  window.mapFlyTo('mod3-map', p.lat, p.lon, 12);
  window.showAlert(`Destination set to ${p.name}`, 'info');
};

/* ==========================================================================
   3. Route Optimization
   ========================================================================== */
window.generateRoutes = async function () {
  const sLat = parseFloat(_getInputVal('r-start-lat'));
  const sLon = parseFloat(_getInputVal('r-start-lon'));
  const dLat = parseFloat(_getInputVal('r-dest-lat'));
  const dLon = parseFloat(_getInputVal('r-dest-lon'));

  if (isNaN(sLat)||isNaN(sLon)||isNaN(dLat)||isNaN(dLon)) {
    window.showAlert('Please enter valid start and destination coordinates.', 'danger');
    return;
  }

  _routeStart = { lat: sLat, lon: sLon };
  _routeDest  = { lat: dLat, lon: dLon };

  const btn = document.getElementById('btn-generate-routes');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Calculating…'; }

  let data;
  try {
    data = await window.apiPost('/route', {
      start_lat: sLat, start_lon: sLon,
      dest_lat:  dLat, dest_lon:  dLon,
      w1: _w1, w2: _w2, w3: _w3,
    });
  } catch {
    data = null;
  }

  if (!data || data.status !== 'ok') {
    // Client-side fallback
    data = _generateRoutesClientSide(sLat, sLon, dLat, dLon);
  }

  _routes    = data.routes;
  _optimalKey = data.optimal_route;

  _renderRouteCards();
  _drawRoutesOnMap();

  if (btn) { btn.disabled = false; btn.textContent = '🗺 Generate Routes'; }
  window.showAlert(`Routes calculated. Optimal: Route ${_optimalKey}`, 'success');
};

function _generateRoutesClientSide(sLat, sLon, dLat, dLon) {
  const baseDist = window.clientMath.haversine(sLat, sLon, dLat, dLon) / 1000;
  const mults = { A: 1.10, B: 1.00, C: 1.18 };
  const speeds = { A: 38, B: 45, C: 32 };
  const errors = { A: 9.5, B: 6.8, C: 11.2 };
  const routes = {};

  ['A','B','C'].forEach(k => {
    const dist = baseDist * mults[k];
    const time = (dist / speeds[k]) * 60;
    const cost = window.clientMath.routeCost(dist, time, errors[k], _w1, _w2, _w3);
    routes[k] = { label: `Route ${k}`, distance_km: +dist.toFixed(2), time_min: +time.toFixed(2), error_m: errors[k], cost };
  });

  const best = Object.keys(routes).reduce((a, b) =>
    routes[a].cost.total_cost < routes[b].cost.total_cost ? a : b
  );
  routes[best].optimal = true;

  return { routes, optimal_route: best };
}

/* ==========================================================================
   4. Render Route Cards
   ========================================================================== */
function _renderRouteCards() {
  if (!_routes) return;
  ['A','B','C'].forEach(k => {
    const r = _routes[k];
    const c = r.cost;
    const card = document.getElementById(`route-card-${k}`);
    if (!card) return;

    const isOpt = k === _optimalKey;
    card.className = `route-card ${isOpt ? 'optimal' : ''}`;

    card.innerHTML = `
      <div class="route-badge ${isOpt ? 'optimal' : ''}">
        ${isOpt ? '✅ OPTIMAL' : `Route ${k}`}
      </div>
      <div style="font-size:1.3rem;font-weight:700;margin-bottom:8px;">Route ${k}</div>
      <div class="route-stat"><span class="route-stat-label">Distance</span><span class="route-stat-value">${r.distance_km} km</span></div>
      <div class="route-stat"><span class="route-stat-label">Est. Time</span><span class="route-stat-value">${r.time_min.toFixed(1)} min</span></div>
      <div class="route-stat"><span class="route-stat-label">GPS Error</span><span class="route-stat-value">${r.error_m} m</span></div>
      <div class="route-stat"><span class="route-stat-label">Total Cost</span><span class="route-stat-value text-accent">${c.total_cost}</span></div>
      <div style="margin-top:8px;font-size:.72rem;color:var(--txt-muted);">
        Cost = ${c.w1}×${c.dist_norm ?? '—'} + ${c.w2}×${c.time_norm ?? '—'} + ${c.w3}×${c.error_norm ?? '—'}
      </div>
    `;
  });

  // Optimal summary
  if (_routes[_optimalKey]) {
    const r = _routes[_optimalKey];
    window.setText('optimal-label',  `Route ${_optimalKey}`);
    window.setText('optimal-dist',   r.distance_km + ' km');
    window.setText('optimal-time',   r.time_min.toFixed(1) + ' min');
    window.setText('optimal-cost',   r.cost.total_cost);
    window.updatePresentationValues({ dist: r.distance_km + ' km' });
  }

  // Cost breakdown
  _displayCostBreakdown();
}

function _displayCostBreakdown() {
  if (!_routes || !_routes[_optimalKey]) return;
  const c = _routes[_optimalKey].cost;
  window.setText('cost-w1',    window.fmt.n(_w1, 2));
  window.setText('cost-w2',    window.fmt.n(_w2, 2));
  window.setText('cost-w3',    window.fmt.n(_w3, 2));
  window.setText('cost-dist',  window.fmt.n(c.cost_dist, 4));
  window.setText('cost-time',  window.fmt.n(c.cost_time, 4));
  window.setText('cost-error', window.fmt.n(c.cost_error, 4));
  window.setText('cost-total', window.fmt.n(c.total_cost, 4));
}

/* ==========================================================================
   5. Draw Routes on Map
   ========================================================================== */
function _drawRoutesOnMap() {
  if (!_routeStart || !_routeDest) return;
  window.clearRoutes('mod3-map');

  const s = [_routeStart.lat, _routeStart.lon];
  const d = [_routeDest.lat,  _routeDest.lon];

  ['A','B','C'].forEach(k => {
    window.drawRoute('mod3-map', s, d, k, k === _optimalKey);
  });

  window.setPositionMarker('mod3-map', _routeStart.lat, _routeStart.lon, 'Start');
  window.setDestinationMarker('mod3-map', _routeDest.lat, _routeDest.lon, 'Destination');

  // Fit bounds
  const map = window.getMap('mod3-map');
  if (map) {
    map.fitBounds([[_routeStart.lat, _routeStart.lon], [_routeDest.lat, _routeDest.lon]], { padding: [40, 40] });
  }
}

/* ==========================================================================
   6. Weight Sliders
   ========================================================================== */
window.onWeightChange = function (which, value) {
  const v = parseFloat(value);
  if (which === 'w1') _w1 = v;
  if (which === 'w2') _w2 = v;
  if (which === 'w3') _w3 = v;
  _updateWeightDisplays();

  // Recalculate costs with new weights if routes exist
  if (_routes && _routeStart && _routeDest) {
    window.generateRoutes();
  }
};

function _updateWeightDisplays() {
  ['w1','w2','w3'].forEach(w => {
    window.setText(`${w}-val`, eval(`_${w}`).toFixed(2));
  });
}

/* ==========================================================================
   7. GPS Error Simulator
   ========================================================================== */
window.setErrorAmount = function (m) {
  _errorSim = m;
  document.querySelectorAll('.error-btn').forEach(b => b.classList.remove('active'));
  const btnId = `err-btn-${m}`;
  const btn = document.getElementById(btnId);
  if (btn) btn.classList.add('active');
  window.setText('err-amount-display', m + ' m');
};

window.runErrorSimulation = async function () {
  // Use current position or _errorRef
  const ref = _errorRef || window.VN.position;
  if (!ref) {
    window.showAlert('No reference position available. Start Demo Mode first.', 'warning');
    return;
  }

  const lat = ref.lat, lon = ref.lon, alt = ref.alt || 0;

  let result;
  try {
    const res = await window.apiPost('/error', {
      lat, lon, alt, error_m: _errorSim, correction_factor: 0.85,
    });
    if (res.status === 'ok') result = res;
  } catch {}

  if (!result) {
    // Client-side fallback
    const meas = window.clientMath.simulateError(lat, lon, _errorSim);
    const corrLat = meas.lat + 0.85 * (lat - meas.lat);
    const corrLon = meas.lon + 0.85 * (lon - meas.lon);
    const errBefore = window.clientMath.gpsError(lat, lon, meas.lat, meas.lon);
    const errAfter  = window.clientMath.gpsError(lat, lon, corrLat, corrLon);
    result = {
      status: 'ok',
      simulation: {
        reference: { lat, lon, alt },
        measured:  { lat: meas.lat, lon: meas.lon, alt },
        delta_x: (meas.lat - lat) * 111319,
        delta_y: (meas.lon - lon) * 111319,
        delta_z: 0,
        error_hav_m: errBefore,
      },
      correction: {
        reference: { lat, lon },
        measured:  { lat: meas.lat, lon: meas.lon },
        corrected: { lat: corrLat,  lon: corrLon  },
        error_before_m: errBefore,
        error_after_m:  errAfter,
        improvement_pct: ((errBefore - errAfter)/errBefore * 100),
        correction_factor: 0.85,
      },
    };
  }

  _displayErrorResult(result);
};

function _displayErrorResult(result) {
  const sim = result.simulation;
  const cor = result.correction;
  const ref = sim.reference;
  const meas = sim.measured;
  const corrected = cor.corrected;

  // Map
  window.showErrorVisualization('mod3-map',
    { lat: ref.lat,       lon: ref.lon       },
    { lat: meas.lat,      lon: meas.lon      },
    { lat: corrected.lat, lon: corrected.lon }
  );
  window.mapFlyTo('mod3-map', ref.lat, ref.lon, 15);

  // Display step-by-step
  window.setText('err-ref-lat-disp',   ref.lat.toFixed(7));
  window.setText('err-ref-lon-disp',   ref.lon.toFixed(7));
  window.setText('err-meas-lat',        meas.lat.toFixed(7));
  window.setText('err-meas-lon',        meas.lon.toFixed(7));
  window.setText('err-corr-lat',        corrected.lat.toFixed(7));
  window.setText('err-corr-lon',        corrected.lon.toFixed(7));

  window.setText('err-dx',             window.fmt.n(sim.delta_x, 3) + ' m');
  window.setText('err-dy',             window.fmt.n(sim.delta_y, 3) + ' m');
  window.setText('err-dz',             window.fmt.n(sim.delta_z || 0, 3) + ' m');
  window.setText('err-distance',       window.fmt.n(sim.error_hav_m, 3) + ' m');

  window.setText('corr-before',        window.fmt.n(cor.error_before_m, 3) + ' m');
  window.setText('corr-after',         window.fmt.n(cor.error_after_m,  3) + ' m');
  window.setText('corr-improvement',   window.fmt.n(cor.improvement_pct, 1) + ' %');
  window.setText('corr-factor',        (cor.correction_factor * 100).toFixed(0) + ' %');

  window.updatePresentationValues({ error: window.fmt.n(sim.error_hav_m, 2) });
  window.showAlert(`GPS error simulated: ${window.fmt.n(sim.error_hav_m, 2)} m → corrected to ${window.fmt.n(cor.error_after_m, 2)} m`, 'success');
}

/* ==========================================================================
   8. Vector Calculus Educational Demo
   ========================================================================== */
window.runVectorCalcDemo = async function (op) {
  let result;
  try {
    const res = await window.apiPost('/vector', { operation: op });
    if (res.status === 'ok') result = res;
  } catch {}

  if (!result) {
    window.showAlert(`Backend offline — demo calculation not available.`, 'warning');
    return;
  }

  const panel = document.getElementById('vc-result-panel');
  if (!panel) return;

  let html = '';
  if (op === 'gradient' && result.gradient) {
    const g = result.gradient;
    html = `<div class="calc-result-label">∇f Result</div>
      <div class="calc-result-value">∂f/∂x = ${g.df_dx} | ∂f/∂y = ${g.df_dy}</div>
      <div style="font-size:.75rem;color:var(--clr-primary-200);margin-top:4px;">Magnitude |∇f| = ${g.magnitude}</div>`;
  } else if (op === 'divergence' && result.divergence) {
    const d = result.divergence;
    html = `<div class="calc-result-label">∇·F Result</div>
      <div class="calc-result-value">∂Fx/∂x = ${d.dFx_dx} | ∂Fy/∂y = ${d.dFy_dy}</div>
      <div style="font-size:.75rem;color:var(--clr-primary-200);margin-top:4px;">∇·F = ${d.divergence}</div>`;
  } else if (op === 'curl' && result.curl) {
    const c = result.curl;
    html = `<div class="calc-result-label">(∇×F)_z Result</div>
      <div class="calc-result-value">∂Fy/∂x = ${c.dFy_dx} | ∂Fx/∂y = ${c.dFx_dy}</div>
      <div style="font-size:.75rem;color:var(--clr-primary-200);margin-top:4px;">(∇×F)_z = ${c.curl_z}</div>`;
  } else if (op === 'line_integral' && result.line_integral) {
    const li = result.line_integral;
    html = `<div class="calc-result-label">∫C F·dr Result</div>
      <div class="calc-result-value">${li.total_integral}</div>
      <div style="font-size:.75rem;color:var(--clr-primary-200);margin-top:4px;">${li.segments.length} segments computed</div>`;
  }

  panel.innerHTML = html;
  panel.style.display = 'block';
};

/* ==========================================================================
   9. Helpers
   ========================================================================== */
function _getInputVal(id) {
  return document.getElementById(id)?.value || '';
}
function _setInputVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
