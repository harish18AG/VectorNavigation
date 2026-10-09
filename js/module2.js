/**
 * VectorNav — Module 2 JS (js/module2.js)
 * ==========================================
 * Motion, Velocity & Direction Analysis
 *
 * Flow:
 *   Position history → Velocity → Speed → Acceleration → Direction → Charts
 *
 * All values derived from consecutive GPS readings — no random numbers.
 */

'use strict';

/* ==========================================================================
   1. State
   ========================================================================== */
let _prevVelocity = null;   // { vx, vy, vz, timestamp }
let _trajectoryPoints = []; // [ { lat, lon } ]
let _tickCount = 0;

/* ==========================================================================
   2. Init
   ========================================================================== */
window.initModule2 = function () {
  const startLat = window.VN.position ? window.VN.position.lat : 13.0827;
  const startLon = window.VN.position ? window.VN.position.lon : 80.2707;
  window.initMap('mod2-map', { lat: startLat, lon: startLon, zoom: 12 });

  // Init charts
  window.initSpeedChart('speed-chart');
  window.initVelocityChart('velocity-chart');
  window.initAccelChart('accel-chart');
  window.initErrorChart('error-chart-m2');

  // Subscribe to position updates
  window.onPositionUpdate(_handlePositionUpdate);

  // Draw initial compass (North)
  _drawCompass(0, 'N', 0);
};

/* ==========================================================================
   3. Position Update Handler
   ========================================================================== */
function _handlePositionUpdate(pos) {
  _trajectoryPoints.push({ lat: pos.lat, lon: pos.lon });
  if (_trajectoryPoints.length > 200) _trajectoryPoints.shift();

  // Update map trajectory
  window.updateTrajectory('mod2-map', _trajectoryPoints);
  window.setPositionMarker('mod2-map', pos.lat, pos.lon);

  // Get last 2 points for motion calc
  const history = window.getLastPoints(2);
  if (history.length < 2) return;

  const p1 = history[history.length - 2];
  const p2 = history[history.length - 1];

  _calcMotion(p1, p2);
}

/* ==========================================================================
   4. Calculate Motion from two GPS readings
   ========================================================================== */
async function _calcMotion(p1, p2) {
  _tickCount++;
  const timeLabel = new Date().toLocaleTimeString('en-IN', { hour12: false });

  let vel, acc;

  try {
    // Try backend
    const res = await window.apiPost('/velocity', {
      lat1: p1.lat, lon1: p1.lon, alt1: p1.alt || 0, t1: p1.timestamp / 1000,
      lat2: p2.lat, lon2: p2.lon, alt2: p2.alt || 0, t2: p2.timestamp / 1000,
    });
    if (res.status === 'ok') {
      vel = res.velocity;
      // acceleration
      if (_prevVelocity) {
        const accRes = await window.apiPost('/acceleration', {
          vx1: _prevVelocity.vx, vy1: _prevVelocity.vy, vz1: _prevVelocity.vz,
          t1:  _prevVelocity.ts,
          vx2: vel.vx, vy2: vel.vy, vz2: vel.vz,
          t2:  p2.timestamp / 1000,
        });
        if (accRes.status === 'ok') acc = accRes.acceleration;
      }
    }
  } catch {}

  // Client-side fallback
  if (!vel) {
    const v = window.clientMath.velocity(p1, p1.timestamp, p2, p2.timestamp);
    if (!v) return;
    vel = {
      vx: v.vx, vy: v.vy, vz: v.vz,
      speed_ms: v.speed_ms, speed_kmh: v.speed_kmh,
      delta_t: v.dt,
    };
  }

  if (!acc && _prevVelocity) {
    const a = window.clientMath.acceleration(
      _prevVelocity, _prevVelocity.ts * 1000,
      { vx: vel.vx, vy: vel.vy, vz: vel.vz }, p2.timestamp
    );
    if (a) acc = { ax: a.ax, ay: a.ay, az: a.az, acc_magnitude: a.magnitude };
  }

  // Direction
  const p1prev = window.getLastPoints(2)[0];
  const bearing = p1prev
    ? window.clientMath.bearing(p1.lat, p1.lon, p2.lat, p2.lon)
    : 0;
  const cardinal = window.clientMath.cardinal(bearing);

  // Update UI
  _displayVelocity(vel);
  if (acc) _displayAcceleration(acc);
  _drawCompass(bearing, cardinal, vel.speed_kmh);

  // Push to charts
  window.pushSpeedData('speed-chart',    timeLabel, vel.speed_kmh);
  window.pushVelocityData('velocity-chart', timeLabel, vel.vx, vel.vy, vel.vz);
  if (acc) window.pushAccelData('accel-chart', timeLabel, acc.acc_magnitude);
  window.pushErrorData('error-chart-m2', timeLabel, p2.accuracy || 4.2);

  // Save for next acc calc
  _prevVelocity = { vx: vel.vx, vy: vel.vy, vz: vel.vz, ts: p2.timestamp / 1000 };

  // Dashboard top cards
  window.setText('dash-speed',    window.fmt.kmh(vel.speed_kmh));
  window.setText('dash-direction', cardinal + ' ' + window.fmt.deg(bearing));
  if (acc) window.setText('dash-accel', window.fmt.n(acc.acc_magnitude, 4) + ' m/s²');

  // Presentation
  window.updatePresentationValues({
    speed:     window.fmt.n(vel.speed_kmh, 1) + ' km/h',
    direction: cardinal + ' ' + window.fmt.deg(bearing),
    lat:       p2.lat.toFixed(6),
    lon:       p2.lon.toFixed(6),
  });

  // Persist to history
  window.apiPost('/history', {
    lat:          p2.lat,
    lon:          p2.lon,
    speed:        vel.speed_ms,
    acceleration: acc ? acc.acc_magnitude : 0,
    direction:    bearing,
    accuracy:     p2.accuracy || 4.2,
    altitude:     p2.alt || 0,
    session_id:   window.VN.sessionId,
  }).catch(() => {});
}

/* ==========================================================================
   5. Display Velocity
   ========================================================================== */
function _displayVelocity(vel) {
  window.setText('vel-vx',     window.fmt.n(vel.vx, 4) + ' m/s');
  window.setText('vel-vy',     window.fmt.n(vel.vy, 4) + ' m/s');
  window.setText('vel-vz',     window.fmt.n(vel.vz, 4) + ' m/s');
  window.setText('vel-speed',  window.fmt.n(vel.speed_ms, 4) + ' m/s');
  window.setText('vel-kmh',    window.fmt.n(vel.speed_kmh, 2) + ' km/h');
  window.setText('vel-dt',     window.fmt.n(vel.delta_t, 3) + ' s');

  // Speed formula breakdown
  window.setText('spd-vx2',   window.fmt.n(vel.vx**2, 4));
  window.setText('spd-vy2',   window.fmt.n(vel.vy**2, 4));
  window.setText('spd-vz2',   window.fmt.n(vel.vz**2, 4));
  window.setText('spd-sum',   window.fmt.n(vel.vx**2 + vel.vy**2 + vel.vz**2, 4));
  window.setText('spd-result',window.fmt.n(vel.speed_ms, 4) + ' m/s');
}

/* ==========================================================================
   6. Display Acceleration
   ========================================================================== */
function _displayAcceleration(acc) {
  window.setText('acc-ax',  window.fmt.n(acc.ax, 4) + ' m/s²');
  window.setText('acc-ay',  window.fmt.n(acc.ay, 4) + ' m/s²');
  window.setText('acc-az',  window.fmt.n(acc.az, 4) + ' m/s²');
  window.setText('acc-mag', window.fmt.n(acc.acc_magnitude, 4) + ' m/s²');
}

/* ==========================================================================
   7. Compass Canvas
   ========================================================================== */
function _drawCompass(bearing, cardinal, speedKmh) {
  const canvas = document.getElementById('compass-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, r = Math.min(cx, cy) - 10;

  ctx.clearRect(0, 0, W, H);

  // Background circle
  const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
  grad.addColorStop(0, '#0f2044');
  grad.addColorStop(1, '#071530');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(59,130,246,.4)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Tick marks
  for (let i = 0; i < 360; i += 10) {
    const rad = (i - 90) * Math.PI / 180;
    const isMain = i % 90 === 0;
    const inR  = r - (isMain ? 14 : 8);
    ctx.beginPath();
    ctx.moveTo(cx + r * Math.cos(rad), cy + r * Math.sin(rad));
    ctx.lineTo(cx + inR * Math.cos(rad), cy + inR * Math.sin(rad));
    ctx.strokeStyle = isMain ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.2)';
    ctx.lineWidth = isMain ? 2 : 1;
    ctx.stroke();
  }

  // Cardinal labels
  const cardLabels = [
    { label: 'N', deg: 0 },
    { label: 'E', deg: 90 },
    { label: 'S', deg: 180 },
    { label: 'W', deg: 270 },
  ];
  cardLabels.forEach(({ label, deg }) => {
    const rad = (deg - 90) * Math.PI / 180;
    const tx = cx + (r - 26) * Math.cos(rad);
    const ty = cy + (r - 26) * Math.sin(rad);
    ctx.fillStyle = label === 'N' ? '#ef4444' : 'rgba(255,255,255,.8)';
    ctx.font = `bold 13px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, tx, ty);
  });

  // Inner circle
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(37,99,235,.3)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(59,130,246,.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Needle
  const needleRad = (bearing - 90) * Math.PI / 180;
  const needleLen = r * 0.7;
  const tailLen   = r * 0.25;

  // North (red) tip
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + needleLen * Math.cos(needleRad),
    cy + needleLen * Math.sin(needleRad)
  );
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // South (blue) tail
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx - tailLen * Math.cos(needleRad),
    cy - tailLen * Math.sin(needleRad)
  );
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Centre dot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Info text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(cardinal, cx, cy + r * 0.42);

  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = '11px Inter, sans-serif';
  ctx.fillText(bearing.toFixed(1) + '°', cx, cy + r * 0.58);

  // Speed in centre
  ctx.fillStyle = '#60a5fa';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillText(speedKmh.toFixed(1), cx, cy);
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.font = '9px Inter, sans-serif';
  ctx.fillText('km/h', cx, cy + 14);

  window.setText('compass-cardinal', cardinal);
  window.setText('compass-bearing',  bearing.toFixed(2) + '°');
}

/* ==========================================================================
   8. Clear Data Button
   ========================================================================== */
window.clearModule2Data = function () {
  _prevVelocity     = null;
  _trajectoryPoints = [];
  _tickCount        = 0;

  window.clearAllCharts();

  const ids = ['vel-vx','vel-vy','vel-vz','vel-speed','vel-kmh','vel-dt',
               'spd-vx2','spd-vy2','spd-vz2','spd-sum','spd-result',
               'acc-ax','acc-ay','acc-az','acc-mag'];
  ids.forEach(id => window.setText(id, '—'));
  _drawCompass(0, 'N', 0);

  window.getLayer('mod2-map', 'trajectory')?.clearLayers();
  window.showAlert('Module 2 data cleared.', 'info');
};
