/**
 * VectorNav — Module 1 JS (js/module1.js)
 * ==========================================
 * GPS Position & Coordinate Calculation
 *
 * Flow:
 *   INPUT (GPS / Manual) → Position Vector → Distance → OUTPUT
 *
 * Displays step-by-step calculations for:
 *   - ECEF position vector  r(t) = xi + yj + zk
 *   - 3-D Euclidean distance formula
 *   - Haversine great-circle distance
 */

'use strict';

/* ==========================================================================
   1. State
   ========================================================================== */
let _origin = null;      // { lat, lon, alt }
let _dest   = null;      // { lat, lon, alt }

/* ==========================================================================
   2. Init — called from module1.html onload
   ========================================================================== */
window.initModule1 = function () {
  const startLat = window.VN.position ? window.VN.position.lat : 13.0827;
  const startLon = window.VN.position ? window.VN.position.lon : 80.2707;

  const map = window.initMap('mod1-map', { lat: startLat, lon: startLon, zoom: 12 });
  window.showDemoWaypoints('mod1-map');

  // Populate preset dropdowns with rich Chennai & South India locations
  window.populateSouthIndiaDropdown('preset-dest-select');

  // Check if live position exists
  if (window.VN.position && window.VN.mode === 'live') {
    const p = window.VN.position;
    _setOrigin(p.lat, p.lon, p.alt || 0, p.accuracy || 0, 'live');
  } else if (window.VN.mode === 'demo') {
    const pts = window.getDemoWaypoints();
    if (pts.length > 0) {
      _setOrigin(pts[0].lat, pts[0].lon, pts[0].alt, 4.2, 'demo');
      _setDest(pts[pts.length - 1].lat, pts[pts.length - 1].lon, pts[pts.length - 1].alt);
    }
  }

  // Subscribe to live GPS / Demo updates
  window.onPositionUpdate(pos => {
    if (pos.source === 'demo' && _userOriginLocked) {
      // User has fixed their location (e.g. Tiruvallur) and clicked Start Demo.
      // Move vehicle marker along the route and update position vector without resetting origin!
      _updateSimulatedVehicleProgress(pos);
    } else {
      _setOrigin(pos.lat, pos.lon, pos.alt || 0, pos.accuracy || 0, pos.source);
    }
  });

  // Enable click anywhere on map to set Destination with live reverse-geocoded address
  window.enableMapClickPicker('mod1-map', (lat, lon) => {
    window.setDestinationByMapClick(lat, lon);
  });
};

/* ==========================================================================
   2b. Address Search & Reverse Geocoding Helpers
   ========================================================================== */
let _searchDebounce = null;

window.handleAddressSearch = function (query) {
  clearTimeout(_searchDebounce);
  const container = document.getElementById('dest-search-suggestions');
  if (!container) return;

  if (!query || query.trim().length < 2) {
    container.style.display = 'none';
    return;
  }

  _searchDebounce = setTimeout(async () => {
    try {
      const res = await window.apiGet(`/geocode?q=${encodeURIComponent(query.trim())}`);
      if (res && res.results && res.results.length > 0) {
        container.innerHTML = res.results.map(r => {
          const safeName = (r.display_name || '').replace(/'/g, "\\'");
          return `
            <div class="search-suggestion-item" onclick="window.selectAddressSuggestion(${r.lat}, ${r.lon}, '${safeName}')">
              <span class="search-suggestion-icon">📍</span>
              <span class="search-suggestion-text">${r.display_name}</span>
            </div>
          `;
        }).join('');
        container.style.display = 'block';
      } else {
        container.innerHTML = '<div style="padding:10px 14px;font-size:.8rem;color:var(--txt-muted);">No matching address found. Try another place name.</div>';
        container.style.display = 'block';
      }
    } catch {
      container.style.display = 'none';
    }
  }, 300);
};

window.selectAddressSuggestion = function (lat, lon, displayName) {
  const container = document.getElementById('dest-search-suggestions');
  if (container) container.style.display = 'none';
  const input = document.getElementById('dest-search-input');
  if (input) input.value = displayName;

  _setDest(lat, lon, 10, displayName);
  window.mapFlyTo('mod1-map', lat, lon, 14);
  window.showAlert(`Destination selected: ${displayName.substring(0, 50)}...`, 'success');
};

async function _reverseGeocode(lat, lon) {
  try {
    const res = await window.apiGet(`/reverse-geocode?lat=${lat}&lon=${lon}`);
    if (res && res.display_name) {
      return res.display_name;
    }
  } catch {}
  return `Location [${lat.toFixed(5)}, ${lon.toFixed(5)}]`;
}

window.setDestinationByMapClick = async function (lat, lon) {
  window.setText('selected-address-text', '⏳ Looking up street address from map...');
  window.setText('disp-dest-lat', lat.toFixed(6));
  window.setText('disp-dest-lon', lon.toFixed(6));

  const address = await _reverseGeocode(lat, lon);
  _setDest(lat, lon, 10, address);
  window.showAlert(`📍 Destination address set: ${address.substring(0, 60)}...`, 'success');
};

/* Close suggestions dropdown when clicking outside */
document.addEventListener('click', e => {
  const container = document.getElementById('dest-search-suggestions');
  const input = document.getElementById('dest-search-input');
  if (container && input && !container.contains(e.target) && e.target !== input) {
    container.style.display = 'none';
  }
});

/* ==========================================================================
   3. Use My Location (Live GPS button)
   ========================================================================== */
window.useMyLocation = function () {
  if (!navigator.geolocation) {
    window.showAlert('Geolocation not supported — use Manual Entry.', 'warning');
    return;
  }
  const btn = document.getElementById('btn-use-location');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Getting location…'; }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lon, altitude: alt, accuracy } = pos.coords;
      _setOrigin(lat, lon, alt || 0, accuracy, 'live');
      window.showAlert('GPS location obtained successfully!', 'success');
      if (btn) { btn.disabled = false; btn.textContent = '📍 Use My Location'; }
    },
    err => {
      window.showAlert(`GPS unavailable: ${err.message}. Use Manual Entry.`, 'warning');
      if (btn) { btn.disabled = false; btn.textContent = '📍 Use My Location'; }
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
};

/* ==========================================================================
   4. Manual Location Entry
   ========================================================================== */
window.useManualLocation = function () {
  const lat = parseFloat(document.getElementById('manual-lat')?.value);
  const lon = parseFloat(document.getElementById('manual-lon')?.value);
  const alt = parseFloat(document.getElementById('manual-alt')?.value || 0);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    window.showAlert('Please enter valid latitude (−90 to 90) and longitude (−180 to 180).', 'danger');
    return;
  }
  _setOrigin(lat, lon, alt, 0, 'manual');
  window.showAlert('Manual location set.', 'success');
};

/* ==========================================================================
   5. Set Destination
   ========================================================================== */
window.setDestination = function () {
  const lat = parseFloat(document.getElementById('dest-lat')?.value);
  const lon = parseFloat(document.getElementById('dest-lon')?.value);
  const alt = parseFloat(document.getElementById('dest-alt')?.value || 0);

  if (isNaN(lat) || isNaN(lon)) {
    window.showAlert('Please enter a valid destination.', 'danger');
    return;
  }
  _setDest(lat, lon, alt);
  window.showAlert('Destination applied.', 'success');
};

/* ==========================================================================
   6. Internal — set origin + trigger calculations
   ========================================================================== */
let _userOriginLocked = false;

function _setOrigin(lat, lon, alt, accuracy, source) {
  if (source === 'live' || source === 'manual') {
    _userOriginLocked = true;
  }

  _origin = { lat, lon, alt, accuracy };
  window.VN.position = _origin;

  // Update position vector display
  _calcPositionVector(lat, lon, alt, accuracy, source);

  // Update map
  window.setPositionMarker('mod1-map', lat, lon,
    source === 'live' ? 'Your Location' : source === 'demo' ? 'Demo Start' : 'Manual Location');
  window.mapFlyTo('mod1-map', lat, lon, 13);

  // If user sets a custom or live location, clear unrelated demo waypoints
  if (source !== 'demo') {
    window.clearDemoWaypoints('mod1-map');
  }

  // Recalculate distance if destination is set
  if (_dest) _calcDistance();
}

function _updateSimulatedVehicleProgress(pos) {
  // Move vehicle marker on map without wiping route start
  window.setPositionMarker('mod1-map', pos.lat, pos.lon, 'Navigating Vehicle');
  _calcPositionVector(pos.lat, pos.lon, pos.alt || 10, pos.accuracy || 4.2, 'demo');

  if (_dest) {
    const hav = window.clientMath.haversine(pos.lat, pos.lon, _dest.lat, _dest.lon);
    window.setText('dist-hav', Number(hav).toFixed(2) + ' m');
    window.setText('dist-km', (hav / 1000).toFixed(3) + ' km');
    window.setText('out-dist', (hav / 1000).toFixed(3) + ' km');
  }
}

function _setDest(lat, lon, alt, addressName = '') {
  _dest = { lat, lon, alt };
  window.VN.destination = { lat, lon };

  // Clear static demo route markers so only user's active route shows
  window.clearDemoWaypoints('mod1-map');

  const label = addressName || 'Destination';
  window.setDestinationMarker('mod1-map', lat, lon, label);

  // Fill dest fields
  const dl  = document.getElementById('dest-lat');
  const dlo = document.getElementById('dest-lon');
  const da  = document.getElementById('dest-alt');
  if (dl)  dl.value  = lat.toFixed(6);
  if (dlo) dlo.value = lon.toFixed(6);
  if (da)  da.value  = alt || 10;

  // Update display badges
  window.setText('disp-dest-lat', lat.toFixed(6));
  window.setText('disp-dest-lon', lon.toFixed(6));
  window.setText('disp-dest-alt', (alt || 10) + ' m');
  if (addressName) {
    window.setText('selected-address-text', addressName);
  }

  if (_origin) _calcDistance();
}

/* ==========================================================================
   7. Position Vector Calculation  r(t) = xi + yj + zk
   ========================================================================== */
async function _calcPositionVector(lat, lon, alt, accuracy, source) {
  let ecef;
  try {
    const res = await window.apiPost('/position', { lat, lon, alt, accuracy });
    if (res.status === 'ok') {
      ecef = res.position;
    }
  } catch {}

  if (!ecef) {
    // Fallback — client-side
    const c = window.clientMath.latLonToEcef(lat, lon, alt);
    const mag = Math.sqrt(c.x**2 + c.y**2 + c.z**2);
    ecef = { ...c, magnitude: mag, latitude: lat, longitude: lon, altitude: alt };
  }

  // Display in UI
  _displayPositionVector(ecef, accuracy);
}

function _displayPositionVector(ecef, accuracy) {
  const s = v => Number(v).toFixed(3);
  const sx = v => Number(v).toFixed(6);

  // Step-by-step display
  window.setText('pv-lat',      sx(ecef.latitude));
  window.setText('pv-lon',      sx(ecef.longitude));
  window.setText('pv-alt',      s(ecef.altitude) + ' m');
  window.setText('pv-accuracy', s(accuracy) + ' m');
  window.setText('pv-x',        s(ecef.x) + ' m');
  window.setText('pv-y',        s(ecef.y) + ' m');
  window.setText('pv-z',        s(ecef.z) + ' m');
  window.setText('pv-magnitude',s(ecef.magnitude) + ' m');
  window.setText('pv-formula',
    `r(t) = ${Number(ecef.x).toFixed(1)}î + ${Number(ecef.y).toFixed(1)}ĵ + ${Number(ecef.z).toFixed(1)}k̂`);

  // Output summary row
  window.setText('out-lat', sx(ecef.latitude));
  window.setText('out-lon', sx(ecef.longitude));
  window.setText('out-alt', s(ecef.altitude) + ' m');
  window.setText('out-accuracy', s(accuracy) + ' m');

  // Draw coordinate visualization
  _drawCoordinateViz(ecef.x, ecef.y, ecef.z);
}

/* ==========================================================================
   8. Distance Calculation  d = √(Δx² + Δy² + Δz²)
   ========================================================================== */
async function _calcDistance() {
  if (!_origin || !_dest) return;

  let dist;
  try {
    const res = await window.apiPost('/position', {
      lat: _origin.lat, lon: _origin.lon, alt: _origin.alt,
      dest_lat: _dest.lat, dest_lon: _dest.lon, dest_alt: _dest.alt,
    });
    if (res.status === 'ok' && res.distance) {
      dist = res.distance;
    }
  } catch {}

  if (!dist) {
    // Client-side fallback
    const e1 = window.clientMath.latLonToEcef(_origin.lat, _origin.lon, _origin.alt);
    const e2 = window.clientMath.latLonToEcef(_dest.lat,   _dest.lon,   _dest.alt);
    const dx = e2.x - e1.x, dy = e2.y - e1.y, dz = e2.z - e1.z;
    const d3d = Math.sqrt(dx**2 + dy**2 + dz**2);
    const hav = window.clientMath.haversine(_origin.lat, _origin.lon, _dest.lat, _dest.lon);
    dist = {
      delta_x: dx, delta_y: dy, delta_z: dz,
      dx_sq: dx**2, dy_sq: dy**2, dz_sq: dz**2,
      sum_sq: dx**2+dy**2+dz**2,
      distance_3d_m: d3d, distance_hav_m: hav, distance_km: hav/1000,
    };
  }

  _displayDistance(dist);
}

function _displayDistance(d) {
  const s = (v, dp = 3) => Number(v).toFixed(dp);

  window.setText('dist-dx',    s(d.delta_x) + ' m');
  window.setText('dist-dy',    s(d.delta_y) + ' m');
  window.setText('dist-dz',    s(d.delta_z) + ' m');
  window.setText('dist-dx2',   s(d.dx_sq));
  window.setText('dist-dy2',   s(d.dy_sq));
  window.setText('dist-dz2',   s(d.dz_sq));
  window.setText('dist-sum',   s(d.sum_sq));
  window.setText('dist-3d',    s(d.distance_3d_m) + ' m');
  window.setText('dist-hav',   s(d.distance_hav_m) + ' m');
  window.setText('dist-km',    s(d.distance_km, 4) + ' km');

  // Output row
  window.setText('out-dist',   s(d.distance_km, 4) + ' km');
  window.setText('out-dest',   `${Number(_dest.lat).toFixed(5)}, ${Number(_dest.lon).toFixed(5)}`);

  // Update presentation overlay
  window.updatePresentationValues({ dist: s(d.distance_km, 2) + ' km' });

  // Calculate & render real route waypoints from My Location to Destination
  _fetchAndRenderRouteWaypoints();
}

/* ==========================================================================
   8b. Dynamic Route Waypoints Generator (My Location → Destination)
   ========================================================================== */
async function _fetchAndRenderRouteWaypoints() {
  if (!_origin || !_dest) return;

  // Clear static demo waypoints so only real route waypoints appear!
  window.clearDemoWaypoints('mod1-map');

  try {
    const res = await window.apiPost('/route-waypoints', {
      start_lat: _origin.lat,
      start_lon: _origin.lon,
      dest_lat: _dest.lat,
      dest_lon: _dest.lon,
    });

    if (res && res.status === 'ok' && res.waypoints) {
      // 1. Draw route polyline and numbered waypoint markers
      window.renderRouteWaypoints('mod1-map', res.waypoints, res.polyline);

      // 2. Program demo simulation to follow THIS specific route (e.g. Tiruvallur -> Sriperumbudur)
      if (window.setCustomDemoPath) {
        window.setCustomDemoPath(res.polyline || res.waypoints);
      }

      // 3. Update UI breakdown
      _displayWaypointsUI(res);
    }
  } catch (err) {
    console.warn('Route waypoints fetch warning:', err);
  }
}

function _displayWaypointsUI(res) {
  const container = document.getElementById('route-waypoints-card');
  if (!container) return;

  container.style.display = 'block';
  window.setText('wp-count-badge', `${res.total_waypoints} Waypoints`);
  window.setText('wp-stat-count', res.total_waypoints);
  window.setText('wp-total-dist', `${res.distance_km} km`);
  window.setText('wp-total-time', `~${res.duration_min} min`);
  window.setText('wp-source-badge', res.source === 'osrm_road_routing' ? 'Live Road Routing (OSRM)' : 'Vector Geodesic Interpolation');

  const tbody = document.getElementById('waypoints-table-body');
  if (tbody && res.waypoints) {
    tbody.innerHTML = res.waypoints.map(wp => `
      <tr style="cursor:pointer;" onclick="window.mapFlyTo('mod1-map', ${wp.lat}, ${wp.lon}, 15)" title="Click to zoom on map">
        <td>
          <span class="badge" style="background:${wp.index === 0 ? '#2563eb' : wp.index === res.waypoints.length - 1 ? '#16a34a' : '#7c3aed'};color:#fff;font-size:10px;font-weight:700;">
            ${wp.label}
          </span>
        </td>
        <td><strong>${wp.name}</strong></td>
        <td style="font-family:var(--font-mono);font-size:11px;">${wp.lat.toFixed(5)}, ${wp.lon.toFixed(5)}</td>
        <td style="font-family:var(--font-mono);font-size:11px;">
          ${wp.index === 0 ? '—' : `Δx:${wp.delta_r.dx}m, Δy:${wp.delta_r.dy}m, Δz:${wp.delta_r.dz}m`}
        </td>
        <td style="font-weight:700;color:var(--clr-primary-700);">${wp.cum_dist_km} km</td>
      </tr>
    `).join('');
  }
}

/* ==========================================================================
   9. 3D Coordinate Visualization (Canvas)
   ========================================================================== */
function _drawCoordinateViz(x, y, z) {
  const canvas = document.getElementById('coord-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#0f2044';
  ctx.fillRect(0, 0, W, H);

  // Grid dots
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let gx = 20; gx < W; gx += 20)
    for (let gy = 20; gy < H; gy += 20)
      ctx.fillRect(gx, gy, 1, 1);

  // Axes
  const axisLen = 80;
  // Project isometric: X → right-down, Y → right-up, Z → up
  const axes = [
    { dx:  axisLen,     dy: axisLen * 0.5,  color: '#ef4444', label: 'X (East)', val: x },
    { dx:  axisLen,     dy: -axisLen * 0.5, color: '#22c55e', label: 'Y (North)', val: y },
    { dx:  0,           dy: -axisLen,       color: '#3b82f6', label: 'Z (Up)', val: z },
  ];

  axes.forEach(ax => {
    // Axis line
    ctx.beginPath();
    ctx.strokeStyle = ax.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + ax.dx, cy + ax.dy);
    ctx.stroke();

    // Arrow head
    _arrowHead(ctx, cx + ax.dx, cy + ax.dy, Math.atan2(ax.dy, ax.dx), ax.color);

    // Label
    ctx.fillStyle = ax.color;
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText(ax.label, cx + ax.dx + (ax.dx > 0 ? 6 : ax.dx < 0 ? -36 : -18),
                            cy + ax.dy + (ax.dy > 0 ? 14 : -6));
  });

  // Origin
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Dashed lines to position point (scaled projection)
  const sc = 60;   // scale factor for display
  const mag = Math.sqrt(x**2 + y**2 + z**2) || 1;
  const nx = x / mag, ny = y / mag, nz = z / mag;
  // Isometric projection of normalised vector
  const px = cx + sc * (nx - ny) * 0.7;
  const py = cy + sc * (nz * 0.6 - (nx + ny) * 0.35);

  ctx.beginPath();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = 'rgba(255,255,255,.3)';
  ctx.lineWidth = 1;
  ctx.moveTo(cx, cy);
  ctx.lineTo(px, py);
  ctx.stroke();

  // Position point
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.stroke();

  // Label
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 10px Inter, sans-serif';
  ctx.fillText('r(t)', px + 10, py - 4);

  // Origin label
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText('O', cx + 7, cy + 14);
}

function _arrowHead(ctx, x, y, angle, color) {
  const len = 8, w = 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-len, -w);
  ctx.lineTo(-len, w);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/* ==========================================================================
   10. Quick-fill destination helper & Dropdown Populator
   ========================================================================== */
window.populateSouthIndiaDropdown = function (selectId) {
  const sel = document.getElementById(selectId);
  if (!sel || !window.SOUTH_INDIA_PRESETS) return;

  const presets = window.SOUTH_INDIA_PRESETS;
  sel.innerHTML = `
    <option value="">— Choose a City / Landmark —</option>
    <optgroup label="📍 Chennai Hubs & Heritage">
      <option value="chn_central">Chennai Central Railway Station</option>
      <option value="chn_marina">Marina Beach, Chennai</option>
      <option value="chn_guindy">Guindy / IIT Madras, Chennai</option>
      <option value="chn_tnagar">T. Nagar (Pondy Bazaar), Chennai</option>
      <option value="chn_annanagar">Anna Nagar Tower, Chennai</option>
      <option value="chn_airport">Chennai International Airport (MAA)</option>
      <option value="chn_tambaram">Tambaram Terminal, Chennai</option>
      <option value="chn_velachery">Velachery Grand Mall, Chennai</option>
    </optgroup>
    <optgroup label="💻 Chennai IT Corridor & Greater Region">
      <option value="chn_omr">OMR Thoraipakkam IT Corridor</option>
      <option value="chn_sholi">Sholinganallur Junction, Chennai</option>
      <option value="chn_siruseri">Siruseri SIPCOT IT Park, Chennai</option>
      <option value="chn_mahabs">Mahabalipuram Shore Temple, TN</option>
      <option value="chn_kanchi">Kanchipuram Silk City, TN</option>
      <option value="chn_chengal">Chengalpattu Junction, TN</option>
    </optgroup>
    <optgroup label="🏛 Tamil Nadu Major Cities">
      <option value="pondi">Puducherry (Pondicherry Promenade)</option>
      <option value="coimbatore">Coimbatore Junction, Tamil Nadu</option>
      <option value="madurai">Madurai Meenakshi Temple, TN</option>
      <option value="trichy">Tiruchirappalli (Trichy Rockfort), TN</option>
      <option value="salem">Salem Junction, Tamil Nadu</option>
      <option value="vellore">Vellore Fort / VIT, Tamil Nadu</option>
      <option value="tirunelveli">Tirunelveli Junction, Tamil Nadu</option>
    </optgroup>
    <optgroup label="🌏 South India Regional Cities">
      <option value="tirupati">Tirupati (Alipiri), Andhra Pradesh</option>
      <option value="bangalore">Bengaluru (MG Road / Majestic), KA</option>
      <option value="mysore">Mysuru (Mysore Palace), Karnataka</option>
      <option value="kochi">Kochi (Marine Drive), Kerala</option>
      <option value="trivandrum">Thiruvananthapuram Central, Kerala</option>
      <option value="vijayawada">Vijayawada Junction, Andhra Pradesh</option>
      <option value="vizag">Visakhapatnam (Beach Road), AP</option>
      <option value="hyderabad">Hyderabad (Hitech City), Telangana</option>
    </optgroup>
  `;
};

window.fillPresetDest = function (sel) {
  const v = sel.value;
  if (!v || !window.SOUTH_INDIA_PRESETS || !window.SOUTH_INDIA_PRESETS[v]) return;
  const p = window.SOUTH_INDIA_PRESETS[v];
  const dl  = document.getElementById('dest-lat');
  const dlo = document.getElementById('dest-lon');
  const da  = document.getElementById('dest-alt');
  if (dl)  dl.value  = p.lat;
  if (dlo) dlo.value = p.lon;
  if (da)  da.value  = p.alt;

  // Immediately apply destination to map
  window.setDestination();
};
