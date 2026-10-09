/**
 * VectorNav — Leaflet Map Module (js/map.js)
 * =============================================
 * Provides a reusable map factory + map-specific managers for each page.
 * Each page calls the relevant init function after DOM is loaded.
 */

'use strict';

/* ==========================================================================
   1. Shared Map Factory
   ========================================================================== */
const _maps   = {};    // store initialised maps by containerId
const _layers = {};    // layer groups per map

/**
 * Initialise a Leaflet map on the given container element.
 * @param {string} containerId  - id of the <div> element
 * @param {object} opts         - { lat, lon, zoom }
 * @returns {L.Map}
 */
window.initMap = function (containerId, opts = {}) {
  if (_maps[containerId]) return _maps[containerId];

  // Default to user's real position if available, else Chennai Central, Tamil Nadu
  const defaultLat = window.VN?.position?.lat || 13.0827;
  const defaultLon = window.VN?.position?.lon || 80.2707;

  const lat  = opts.lat  || defaultLat;
  const lon  = opts.lon  || defaultLon;
  const zoom = opts.zoom || 13;

  const map = L.map(containerId, {
    center: [lat, lon],
    zoom,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // Layer groups
  _layers[containerId] = {
    position:    L.layerGroup().addTo(map),
    destination: L.layerGroup().addTo(map),
    route:       L.layerGroup().addTo(map),
    trajectory:  L.layerGroup().addTo(map),
    error:       L.layerGroup().addTo(map),
    demo:        L.layerGroup().addTo(map),
  };

  _maps[containerId] = map;
  return map;
};

window.getMap    = id  => _maps[id];
window.getLayer  = (mapId, layer) => _layers[mapId]?.[layer];

/* ==========================================================================
   2. Custom Marker Icons
   ========================================================================== */
function _circleIcon(color, label = '') {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 0 0 2px ${color}40;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

function _pulseIcon(color) {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:20px;height:20px;">
        <div style="
          position:absolute;inset:0;border-radius:50%;
          background:${color};opacity:.3;
          animation:map-pulse 1.8s infinite;
        "></div>
        <div style="
          position:absolute;top:4px;left:4px;
          width:12px;height:12px;border-radius:50%;
          background:${color};border:2px solid #fff;
        "></div>
      </div>
      <style>
        @keyframes map-pulse {
          0%,100%{transform:scale(1);opacity:.3}
          50%{transform:scale(2.2);opacity:0}
        }
      </style>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

window.MapIcons = {
  position:    () => _pulseIcon('#2563eb'),
  destination: () => _circleIcon('#16a34a'),
  reference:   () => _circleIcon('#2563eb'),
  measured:    () => _circleIcon('#dc2626'),
  corrected:   () => _circleIcon('#16a34a'),
  waypoint:    () => _circleIcon('#7c3aed'),
};

/* ==========================================================================
   3. Position Marker
   ========================================================================== */
window.setPositionMarker = function (mapId, lat, lon, label = 'Current Position') {
  const lg = _layers[mapId]?.position;
  if (!lg) return;
  lg.clearLayers();
  L.marker([lat, lon], { icon: window.MapIcons.position() })
    .bindPopup(`<b>📍 ${label}</b><br>${lat.toFixed(6)}, ${lon.toFixed(6)}`)
    .addTo(lg);
};

/* ==========================================================================
   4. Destination Marker
   ========================================================================== */
window.setDestinationMarker = function (mapId, lat, lon, label = 'Destination') {
  const lg = _layers[mapId]?.destination;
  if (!lg) return;
  lg.clearLayers();
  L.marker([lat, lon], { icon: window.MapIcons.destination() })
    .bindPopup(`<b>🏁 ${label}</b><br>${lat.toFixed(6)}, ${lon.toFixed(6)}`)
    .addTo(lg);
};

/* ==========================================================================
   5. Trajectory (movement path)
   ========================================================================== */
window.updateTrajectory = function (mapId, points) {
  const lg = _layers[mapId]?.trajectory;
  if (!lg || points.length < 2) return;
  lg.clearLayers();

  const latlngs = points.map(p => [p.lat, p.lon]);
  L.polyline(latlngs, {
    color: '#2563eb', weight: 3, opacity: 0.85, dashArray: '6 4',
  }).addTo(lg);

  // Small dots at each point
  points.forEach((p, i) => {
    if (i === 0 || i === points.length - 1) return;
    L.circleMarker([p.lat, p.lon], {
      radius: 4, color: '#2563eb', fillColor: '#fff',
      fillOpacity: 1, weight: 2, opacity: 0.7,
    }).addTo(lg);
  });
};

/* ==========================================================================
   6. Route Lines (Module 3)
   ========================================================================== */
const ROUTE_COLORS = { A: '#f59e0b', B: '#16a34a', C: '#dc2626' };

/**
 * Draw a simplified route between start and end with a colour band
 * (uses a slightly different mid-point per route for visual variation).
 */
window.drawRoute = function (mapId, startLatLon, destLatLon, routeKey, isSelected = false) {
  const lg = _layers[mapId]?.route;
  if (!lg) return;

  const [sLat, sLon] = startLatLon;
  const [dLat, dLon] = destLatLon;
  const color = ROUTE_COLORS[routeKey] || '#6366f1';

  // Midpoint with offset for visual differentiation
  const offsets = { A: 0.008, B: 0, C: -0.008 };
  const off = offsets[routeKey] ?? 0;
  const mid = [(sLat + dLat) / 2 + off, (sLon + dLon) / 2 + off * 0.6];

  L.polyline([[sLat, sLon], mid, [dLat, dLon]], {
    color,
    weight:    isSelected ? 5 : 3,
    opacity:   isSelected ? 1 : 0.5,
    dashArray: isSelected ? null : '8 6',
  }).bindTooltip(`Route ${routeKey}`, { permanent: false }).addTo(lg);
};

window.clearRoutes = function (mapId) {
  _layers[mapId]?.route?.clearLayers();
};

/* ==========================================================================
   7. GPS Error Visualisation (Module 3)
   ========================================================================== */
window.showErrorVisualization = function (mapId, ref, measured, corrected) {
  const lg = _layers[mapId]?.error;
  if (!lg) return;
  lg.clearLayers();

  // Markers
  L.marker([ref.lat, ref.lon], { icon: window.MapIcons.reference() })
    .bindPopup(`<b>🔵 Reference Position</b><br>${ref.lat.toFixed(7)}, ${ref.lon.toFixed(7)}`)
    .addTo(lg);

  L.marker([measured.lat, measured.lon], { icon: window.MapIcons.measured() })
    .bindPopup(`<b>🔴 Measured (GPS) Position</b><br>${measured.lat.toFixed(7)}, ${measured.lon.toFixed(7)}`)
    .addTo(lg);

  L.marker([corrected.lat, corrected.lon], { icon: window.MapIcons.corrected() })
    .bindPopup(`<b>🟢 Corrected Position</b><br>${corrected.lat.toFixed(7)}, ${corrected.lon.toFixed(7)}`)
    .addTo(lg);

  // Lines showing error
  L.polyline([[ref.lat, ref.lon], [measured.lat, measured.lon]], {
    color: '#dc2626', weight: 2, dashArray: '6 4', opacity: 0.8,
  }).bindTooltip('GPS Error').addTo(lg);

  L.polyline([[measured.lat, measured.lon], [corrected.lat, corrected.lon]], {
    color: '#16a34a', weight: 2, dashArray: '4 3', opacity: 0.8,
  }).bindTooltip('Correction Applied').addTo(lg);

  // Accuracy circle around reference
  L.circle([ref.lat, ref.lon], {
    radius: 30, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.06, weight: 1.5,
  }).addTo(lg);
};

/* ==========================================================================
   8. Fly-to Helper
   ========================================================================== */
window.mapFlyTo = function (mapId, lat, lon, zoom = 14) {
  const map = _maps[mapId];
  if (map) map.flyTo([lat, lon], zoom, { duration: 1.2 });
};

/* ==========================================================================
   9. Demo waypoint display
   ========================================================================== */
window.showDemoWaypoints = function (mapId) {
  const lg = _layers[mapId]?.demo;
  if (!lg) return;
  lg.clearLayers();

  const pts = window.getDemoWaypoints?.() || [];
  pts.forEach((p, i) => {
    const icon = i === 0
      ? window.MapIcons.position()
      : i === pts.length - 1
        ? window.MapIcons.destination()
        : window.MapIcons.waypoint();

    L.marker([p.lat, p.lon], { icon })
      .bindPopup(`<b>${p.name}</b><br>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)
      .addTo(lg);
  });

  // Draw overall path
  const latlngs = pts.map(p => [p.lat, p.lon]);
  L.polyline(latlngs, { color: '#7c3aed', weight: 2, dashArray: '8 4', opacity: 0.5 }).addTo(lg);
};

/* ==========================================================================
   10. Map invalidate size (called when a hidden map becomes visible)
   ========================================================================== */
window.invalidateMap = function (mapId) {
  setTimeout(() => _maps[mapId]?.invalidateSize(), 150);
};

/* ==========================================================================
   11. Map Click Coordinate Picker
   Allows user to click anywhere on OpenStreetMap to set destination or origin
   ========================================================================== */
window.enableMapClickPicker = function (mapId, onPick) {
  const map = _maps[mapId];
  if (!map) return;
  map.on('click', e => {
    const { lat, lng: lon } = e.latlng;
    if (onPick) onPick(lat, lon);
  });
};

/* ==========================================================================
   12. Dynamic Route Waypoints (Between User Location & Selected Destination)
   ========================================================================== */
window.clearDemoWaypoints = function (mapId) {
  _layers[mapId]?.demo?.clearLayers();
};

window.renderRouteWaypoints = function (mapId, waypoints, polyline) {
  const map = _maps[mapId];
  if (!map) return;

  // Clear demo waypoints so they never interfere with user's custom route
  _layers[mapId]?.demo?.clearLayers();
  _layers[mapId]?.route?.clearLayers();

  const lg = _layers[mapId]?.route;
  if (!lg) return;

  // 1. Draw route line connecting start to destination
  if (polyline && polyline.length >= 2) {
    L.polyline(polyline, {
      color: '#2563eb',
      weight: 4,
      opacity: 0.85,
    }).addTo(lg);
  }

  // 2. Draw numbered waypoint markers along the route (W1, W2, etc.)
  const bounds = L.latLngBounds();
  waypoints.forEach(wp => {
    bounds.extend([wp.lat, wp.lon]);

    // Skip start and destination because they have their own prominent markers
    if (wp.index === 0 || wp.index === waypoints.length - 1) return;

    const icon = L.divIcon({
      className: '',
      html: `
        <div style="
          background: #7c3aed; color: #ffffff; font-size: 10px; font-weight: 800;
          width: 22px; height: 22px; border-radius: 50%; border: 2px solid #ffffff;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        ">
          ${wp.index}
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12],
    });

    L.marker([wp.lat, wp.lon], { icon })
      .bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;min-width:140px;">
          <strong style="color:#7c3aed;">📍 Waypoint ${wp.index}</strong><br>
          <div style="font-size:11px;color:#334155;margin:2px 0;">${wp.name}</div>
          <div style="font-size:10px;color:#64748b;font-family:monospace;">
            ${wp.lat.toFixed(5)}, ${wp.lon.toFixed(5)}
          </div>
          <div style="font-size:10px;color:#0284c7;margin-top:2px;">
            Seg: ${wp.seg_dist_km} km | Total: ${wp.cum_dist_km} km
          </div>
        </div>
      `)
      .addTo(lg);
  });

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
};
