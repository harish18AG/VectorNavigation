/**
 * VectorNav — GPS Module (js/gps.js)
 * =====================================
 * Manages:
 *  - Browser Geolocation API (Live GPS Mode)
 *  - Demo Mode simulator with predefined waypoints
 *  - GPS data history for motion calculations
 *  - Event system to notify all modules of position updates
 */

'use strict';

/* ==========================================================================
   1. Demo Waypoints & Routes
   Default route: Chennai Central → Marina Beach → Guindy → Velachery → OMR Sholinganallur
   Alternate routes: South India Regional, Hyderabad
   ========================================================================== */
const DEMO_ROUTES = {
  chennai: [
    { lat: 13.0827, lon: 80.2707, alt: 10, name: 'Chennai Central Station' },
    { lat: 13.0645, lon: 80.2835, alt: 8,  name: 'Marina Beach' },
    { lat: 13.0335, lon: 80.2778, alt: 9,  name: 'Santhome Cathedral' },
    { lat: 13.0067, lon: 80.2570, alt: 11, name: 'Adyar Bridge' },
    { lat: 12.9915, lon: 80.2337, alt: 14, name: 'IIT Madras / Guindy' },
    { lat: 12.9756, lon: 80.2207, alt: 12, name: 'Velachery Bypass' },
    { lat: 12.9348, lon: 80.2312, alt: 10, name: 'OMR Thoraipakkam' },
    { lat: 12.8988, lon: 80.2279, alt: 8,  name: 'Sholinganallur Junction' },
    { lat: 12.8258, lon: 80.2217, alt: 24, name: 'Siruseri SIPCOT IT Park' },
  ],
  south_regional: [
    { lat: 13.0827, lon: 80.2707, alt: 10,  name: 'Chennai, TN' },
    { lat: 13.6288, lon: 79.4192, alt: 162, name: 'Tirupati, AP' },
    { lat: 12.9165, lon: 79.1325, alt: 216, name: 'Vellore, TN' },
    { lat: 12.9716, lon: 77.5946, alt: 920, name: 'Bengaluru, KA' },
    { lat: 11.6643, lon: 78.1460, alt: 278, name: 'Salem, TN' },
    { lat: 11.0168, lon: 76.9558, alt: 411, name: 'Coimbatore, TN' },
    { lat: 9.9252,  lon: 78.1198, alt: 136, name: 'Madurai, TN' },
    { lat: 11.9416, lon: 79.8083, alt: 10,  name: 'Puducherry' },
  ],
  hyderabad: [
    { lat: 17.4949, lon: 78.3996, alt: 542, name: 'JNTU Hyderabad' },
    { lat: 17.4870, lon: 78.3930, alt: 539, name: 'Nizampet Road' },
    { lat: 17.4785, lon: 78.3873, alt: 537, name: 'Kukatpally' },
    { lat: 17.4700, lon: 78.3820, alt: 534, name: 'Miyapur Junction' },
    { lat: 17.4654, lon: 78.3756, alt: 532, name: 'KPHB Colony' },
    { lat: 17.4600, lon: 78.3780, alt: 530, name: 'Hitech City Junction' },
    { lat: 17.4530, lon: 78.3770, alt: 528, name: 'Madhapur' },
    { lat: 17.4474, lon: 78.3762, alt: 526, name: 'Hitech City' },
    { lat: 17.4440, lon: 78.3640, alt: 524, name: 'Kondapur' },
    { lat: 17.4401, lon: 78.3489, alt: 522, name: 'Gachibowli' },
    { lat: 17.4330, lon: 78.3440, alt: 520, name: 'Nanakramguda' },
    { lat: 17.4239, lon: 78.3418, alt: 518, name: 'Botanical Garden' },
  ],
};

let _activeRouteKey = 'chennai';
let DEMO_WAYPOINTS = DEMO_ROUTES[_activeRouteKey];

/* Comprehensive South India Preset Locations */
window.SOUTH_INDIA_PRESETS = {
  // Chennai Hubs & Heritage
  'chn_central':    { name: 'Chennai Central Railway Station', lat: 13.0827, lon: 80.2707, alt: 10 },
  'chn_marina':     { name: 'Marina Beach, Chennai', lat: 13.0499, lon: 80.2824, alt: 6 },
  'chn_guindy':     { name: 'Guindy / IIT Madras, Chennai', lat: 12.9915, lon: 80.2337, alt: 14 },
  'chn_tnagar':     { name: 'T. Nagar (Pondy Bazaar), Chennai', lat: 13.0418, lon: 80.2341, alt: 11 },
  'chn_annanagar':  { name: 'Anna Nagar Tower Park, Chennai', lat: 13.0850, lon: 80.2101, alt: 18 },
  'chn_airport':    { name: 'Chennai International Airport (MAA)', lat: 12.9941, lon: 80.1709, alt: 16 },
  'chn_tambaram':   { name: 'Tambaram Railway Terminal, Chennai', lat: 12.9249, lon: 80.1000, alt: 32 },
  'chn_velachery':  { name: 'Velachery Grand Mall, Chennai', lat: 12.9756, lon: 80.2207, alt: 12 },

  // Chennai IT Corridor & Greater Region
  'chn_omr':        { name: 'OMR Thoraipakkam IT Corridor, Chennai', lat: 12.9348, lon: 80.2312, alt: 10 },
  'chn_sholi':      { name: 'Sholinganallur Junction, Chennai', lat: 12.8988, lon: 80.2279, alt: 8 },
  'chn_siruseri':   { name: 'Siruseri SIPCOT IT Park, Chennai', lat: 12.8258, lon: 80.2217, alt: 24 },
  'chn_mahabs':     { name: 'Mahabalipuram Shore Temple, TN', lat: 12.6208, lon: 80.1945, alt: 12 },
  'chn_kanchi':     { name: 'Kanchipuram Silk City, TN', lat: 12.8342, lon: 79.7036, alt: 83 },
  'chn_chengal':    { name: 'Chengalpattu Junction, TN', lat: 12.6841, lon: 79.9836, alt: 45 },

  // Tamil Nadu Major Cities
  'pondi':          { name: 'Puducherry (Pondicherry Promenade)', lat: 11.9416, lon: 79.8083, alt: 10 },
  'coimbatore':     { name: 'Coimbatore Junction, Tamil Nadu', lat: 11.0168, lon: 76.9558, alt: 411 },
  'madurai':        { name: 'Madurai Meenakshi Temple, TN', lat: 9.9252, lon: 78.1198, alt: 136 },
  'trichy':         { name: 'Tiruchirappalli (Trichy Rockfort), TN', lat: 10.7905, lon: 78.7047, alt: 85 },
  'salem':          { name: 'Salem Junction, Tamil Nadu', lat: 11.6643, lon: 78.1460, alt: 278 },
  'vellore':        { name: 'Vellore Fort / VIT, Tamil Nadu', lat: 12.9165, lon: 79.1325, alt: 216 },
  'tirunelveli':    { name: 'Tirunelveli Junction, Tamil Nadu', lat: 8.7139, lon: 77.7567, alt: 47 },

  // Surrounding South Indian Cities (Andhra, Karnataka, Kerala, Telangana)
  'tirupati':       { name: 'Tirupati (Alipiri), Andhra Pradesh', lat: 13.6288, lon: 79.4192, alt: 162 },
  'bangalore':      { name: 'Bengaluru (MG Road / Majestic), KA', lat: 12.9716, lon: 77.5946, alt: 920 },
  'mysore':         { name: 'Mysuru (Mysore Palace), Karnataka', lat: 12.2958, lon: 76.6394, alt: 763 },
  'kochi':          { name: 'Kochi (Marine Drive), Kerala', lat: 9.9312, lon: 76.2673, alt: 4 },
  'trivandrum':     { name: 'Thiruvananthapuram Central, Kerala', lat: 8.5241, lon: 76.9366, alt: 10 },
  'vijayawada':     { name: 'Vijayawada Junction, Andhra Pradesh', lat: 16.5062, lon: 80.6480, alt: 20 },
  'vizag':          { name: 'Visakhapatnam (Beach Road), AP', lat: 17.6868, lon: 83.2185, alt: 45 },
  'hyderabad':      { name: 'Hyderabad (Hitech City), Telangana', lat: 17.4474, lon: 78.3762, alt: 526 },

  // Tiruvallur & North-West Hubs
  'tiruvallur':     { name: 'Tiruvallur District HQ, Tamil Nadu', lat: 13.1439, lon: 79.9083, alt: 42 },
  'sriperumbudur':  { name: 'Sriperumbudur Industrial Hub, TN', lat: 12.9675, lon: 79.9442, alt: 37 },
  'arakkonam':      { name: 'Arakkonam Junction, Tamil Nadu', lat: 13.0784, lon: 79.6677, alt: 85 },
  'poondi':         { name: 'Poondi Reservoir, Tiruvallur, TN', lat: 13.1932, lon: 79.8601, alt: 44 },
};

const DEMO_INTERVAL_MS   = 2000;   // 2 s between simulation steps
const DEMO_ACCURACY_BASE = 4.2;    // simulated GPS accuracy (m)

/* ==========================================================================
   2. GPS History Buffer  (stores last N readings for motion calculations)
   ========================================================================== */
const GPS_HISTORY_SIZE = 50;
const gpsHistory = [];   // [ { lat, lon, alt, accuracy, timestamp } ]

/** Add a point to the history buffer */
function pushGpsHistory(point) {
  gpsHistory.push({ ...point, timestamp: Date.now() });
  if (gpsHistory.length > GPS_HISTORY_SIZE) gpsHistory.shift();
}

/** Get last N points */
function getLastPoints(n = 2) {
  return gpsHistory.slice(-Math.min(n, gpsHistory.length));
}

window.getGpsHistory = () => [...gpsHistory];
window.getLastPoints = getLastPoints;

/* ==========================================================================
   3. Event Bus — other modules subscribe to position updates
   ========================================================================== */
const _handlers = [];

window.onPositionUpdate = function (handler) {
  _handlers.push(handler);
};

function _emit(point) {
  _handlers.forEach(h => {
    try { h(point); } catch (e) { console.error('[GPS emit error]', e); }
  });
}

/* ==========================================================================
   4. Live GPS Mode — Automatic & On-Demand Current Location
   ========================================================================== */
let _watchId = null;

window.autoDetectCurrentLocation = function (onSuccess, onError) {
  if (!navigator.geolocation) {
    if (onError) onError('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lon, altitude, accuracy } = pos.coords;
      const point = {
        lat, lon,
        alt: altitude || 0,
        accuracy: accuracy || 4.2,
        source: 'live',
      };
      window.VN.position = point;
      window.setMode('live');
      pushGpsHistory(point);
      _emit(point);
      window.updateStatusFromPosition(point);

      // Persist to backend
      window.apiPost('/position', { lat, lon, alt: altitude || 0, accuracy }).catch(() => {});

      if (onSuccess) onSuccess(point);
    },
    err => {
      console.warn('[Geolocation error]', err.message);
      if (onError) onError(err.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
};

window.startLiveGPS = function () {
  if (!navigator.geolocation) {
    window.showAlert('Geolocation not supported by this browser.', 'danger');
    return;
  }

  window.setMode('live');
  _watchId = navigator.geolocation.watchPosition(
    position => {
      const { latitude: lat, longitude: lon, altitude, accuracy } = position.coords;
      const point = {
        lat, lon,
        alt:      altitude || 0,
        accuracy: accuracy || 0,
        source:   'live',
      };
      window.VN.position = point;
      pushGpsHistory(point);
      _emit(point);
      window.updateStatusFromPosition(point);

      // Persist to backend
      window.apiPost('/position', { lat, lon, alt: altitude || 0, accuracy })
        .catch(() => {});   // non-critical
    },
    err => {
      console.warn('[LiveGPS error]', err.message);
      window.showAlert('GPS permission denied or unavailable. You can enter coordinates manually or use Demo Mode.', 'warning');
      window.setMode('demo');
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
};

window.stopLiveGPS = function () {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
};

/* ==========================================================================
   5. Demo Mode Simulator & Route Selection
   ========================================================================== */
let _demoInterval  = null;
let _demoIndex     = 0;
let _demoRunning   = false;
let DEMO_PATH      = _buildDemoPath();

/** Switch demo route between 'chennai', 'south_regional', 'hyderabad' */
window.setDemoRoute = function (routeKey) {
  if (!DEMO_ROUTES[routeKey]) return;
  _activeRouteKey = routeKey;
  DEMO_WAYPOINTS  = DEMO_ROUTES[routeKey];
  DEMO_PATH       = _buildDemoPath();
  _demoIndex      = 0;

  // Refresh visible demo markers on all active maps
  ['map', 'nav-map', 'mod1-map', 'mod2-map', 'mod3-map'].forEach(id => {
    if (window.getMap(id)) {
      window.showDemoWaypoints(id);
      const start = DEMO_WAYPOINTS[0];
      window.mapFlyTo(id, start.lat, start.lon, routeKey === 'south_regional' ? 7 : 12);
    }
  });

  window.showAlert(`Demo Route switched to: ${routeKey.toUpperCase()}`, 'info');
};

/**
 * Interpolate between two waypoints in `steps` micro-steps
 * to make motion smoother.
 */
function _interpolate(p1, p2, steps) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      lat:      p1.lat + (p2.lat - p1.lat) * t,
      lon:      p1.lon + (p2.lon - p1.lon) * t,
      alt:      p1.alt + (p2.alt - p1.alt) * t,
      accuracy: DEMO_ACCURACY_BASE + Math.random() * 1.5,
      name:     i === steps ? p2.name : '',
      source:   'demo',
    });
  }
  return pts;
}

/** Build full interpolated demo path */
let _hasCustomRoutePath = false;

window.setCustomDemoPath = function (points) {
  if (!points || points.length < 2) return;
  const normalized = points.map((p, idx) => {
    if (Array.isArray(p)) return { lat: p[0], lon: p[1], alt: 10, name: `Step ${idx}` };
    return { lat: p.lat, lon: p.lon, alt: p.alt || 10, name: p.name || `Waypoint ${p.index || idx}` };
  });

  const path = [];
  // Sample or interpolate between waypoints to create smooth simulated driving steps
  for (let i = 0; i < normalized.length - 1; i++) {
    const p1 = normalized[i];
    const p2 = normalized[i + 1];
    const steps = 4;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      path.push({
        lat: p1.lat + (p2.lat - p1.lat) * t,
        lon: p1.lon + (p2.lon - p1.lon) * t,
        alt: p1.alt + (p2.alt - p1.alt) * t,
        accuracy: DEMO_ACCURACY_BASE + Math.random() * 1.5,
        name: s === steps ? p2.name : '',
        source: 'demo',
      });
    }
  }
  DEMO_PATH = path;
  _demoIndex = 0;
  _hasCustomRoutePath = true;
};

function _buildDemoPath() {
  const path = [];
  for (let i = 0; i < DEMO_WAYPOINTS.length - 1; i++) {
    const pts = _interpolate(DEMO_WAYPOINTS[i], DEMO_WAYPOINTS[i + 1], 5);
    path.push(...pts);
  }
  return path;
}

window.startDemoMode = async function () {
  if (_demoRunning) return;

  // Check if user has an active custom position and destination
  if (window.VN.position && window.VN.destination && !_hasCustomRoutePath) {
    try {
      const res = await window.apiPost('/route-waypoints', {
        start_lat: window.VN.position.lat,
        start_lon: window.VN.position.lon,
        dest_lat: window.VN.destination.lat,
        dest_lon: window.VN.destination.lon,
      });
      if (res && res.status === 'ok' && res.waypoints) {
        window.setCustomDemoPath(res.polyline || res.waypoints);
      }
    } catch {}
  }

  _demoRunning = true;
  _demoIndex   = 0;

  const tick = () => {
    if (!_demoRunning) return;

    const point = DEMO_PATH[_demoIndex % DEMO_PATH.length];
    window.VN.position = point;
    pushGpsHistory(point);
    _emit(point);
    window.updateStatusFromDemo(point);

    _demoIndex++;
    _demoInterval = setTimeout(tick, DEMO_INTERVAL_MS);
  };

  tick();
  const rDesc = _hasCustomRoutePath ? 'your selected route' : (_activeRouteKey === 'chennai' ? 'Chennai' : _activeRouteKey === 'south_regional' ? 'South India' : 'Hyderabad');
  window.showAlert(`Demo Mode started — simulating motion along ${rDesc}.`, 'info');
};

window.stopDemoMode = function () {
  _demoRunning = false;
  clearTimeout(_demoInterval);
  window.showAlert('Demo Mode stopped.', 'info');
};

window.resetDemoMode = function () {
  window.stopDemoMode();
  gpsHistory.length = 0;
  setTimeout(() => window.startDemoMode(), 300);
};

/** Return current demo waypoints for map display */
window.getDemoWaypoints  = () => DEMO_WAYPOINTS;
window.getDemoPath       = () => DEMO_PATH;
window.isDemoRunning     = () => _demoRunning;
window.getActiveDemoRouteKey = () => _activeRouteKey;

/* ==========================================================================
   6. Client-Side Math Helpers  (used when backend is offline)
   ========================================================================== */
const DEG2RAD = Math.PI / 180;
const EARTH_R  = 6_371_000;

window.clientMath = {

  haversine(lat1, lon1, lat2, lon2) {
    const phi1 = lat1 * DEG2RAD, phi2 = lat2 * DEG2RAD;
    const dphi  = (lat2 - lat1) * DEG2RAD;
    const dlam  = (lon2 - lon1) * DEG2RAD;
    const a = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlam/2)**2;
    return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  },

  latLonToEcef(lat, lon, alt = 0) {
    const a  = 6_378_137.0, f = 1/298.257223563;
    const e2 = 2*f - f*f;
    const φ  = lat * DEG2RAD, λ = lon * DEG2RAD;
    const N  = a / Math.sqrt(1 - e2 * Math.sin(φ)**2);
    return {
      x: (N + alt) * Math.cos(φ) * Math.cos(λ),
      y: (N + alt) * Math.cos(φ) * Math.sin(λ),
      z: (N * (1 - e2) + alt) * Math.sin(φ),
    };
  },

  velocity(p1, t1, p2, t2) {
    const dt = (t2 - t1) / 1000;   // ms → s
    if (dt <= 0) return null;
    const e1 = this.latLonToEcef(p1.lat, p1.lon, p1.alt);
    const e2 = this.latLonToEcef(p2.lat, p2.lon, p2.alt);
    const vx = (e2.x - e1.x) / dt;
    const vy = (e2.y - e1.y) / dt;
    const vz = (e2.z - e1.z) / dt;
    const speed = Math.sqrt(vx**2 + vy**2 + vz**2);
    return { vx, vy, vz, speed_ms: speed, speed_kmh: speed * 3.6, dt };
  },

  acceleration(v1, t1, v2, t2) {
    const dt = (t2 - t1) / 1000;
    if (dt <= 0) return null;
    const ax = (v2.vx - v1.vx) / dt;
    const ay = (v2.vy - v1.vy) / dt;
    const az = (v2.vz - v1.vz) / dt;
    return { ax, ay, az, magnitude: Math.sqrt(ax**2 + ay**2 + az**2), dt };
  },

  bearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * DEG2RAD, φ2 = lat2 * DEG2RAD;
    const dλ = (lon2 - lon1) * DEG2RAD;
    const x  = Math.sin(dλ) * Math.cos(φ2);
    const y  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
    return (Math.atan2(x, y) / DEG2RAD + 360) % 360;
  },

  cardinal(deg) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                  'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  },

  gpsError(refLat, refLon, measLat, measLon) {
    return this.haversine(refLat, refLon, measLat, measLon);
  },

  simulateError(lat, lon, errorM) {
    const azimuth = Math.random() * 2 * Math.PI;
    const dLat = (errorM * Math.cos(azimuth)) / 111319;
    const dLon = (errorM * Math.sin(azimuth)) / (111319 * Math.cos(lat * DEG2RAD));
    return { lat: lat + dLat, lon: lon + dLon };
  },

  routeCost(dist_km, time_min, error_m, w1 = 0.5, w2 = 0.3, w3 = 0.2) {
    const wSum  = w1 + w2 + w3;
    const nw1 = w1/wSum, nw2 = w2/wSum, nw3 = w3/wSum;
    const d = Math.min(dist_km/20,  1);
    const t = Math.min(time_min/60, 1);
    const e = Math.min(error_m/50,  1);
    return {
      cost_dist:  +(nw1 * d).toFixed(4),
      cost_time:  +(nw2 * t).toFixed(4),
      cost_error: +(nw3 * e).toFixed(4),
      total_cost: +(nw1*d + nw2*t + nw3*e).toFixed(4),
      w1: +nw1.toFixed(4), w2: +nw2.toFixed(4), w3: +nw3.toFixed(4),
    };
  },
};
