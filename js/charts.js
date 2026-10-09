/**
 * VectorNav — Chart.js Module (js/charts.js)
 * =============================================
 * Creates and updates all Chart.js charts:
 *   - Speed vs Time
 *   - Velocity (vx, vy, vz) vs Time
 *   - Acceleration vs Time
 *   - GPS Accuracy / Error vs Time
 *   - Analytics charts (summary bars)
 */

'use strict';

/* ==========================================================================
   1. Shared Chart Registry
   ========================================================================== */
const _charts = {};
const MAX_DATA_POINTS = 60;   // keep last 60 readings per chart

function _getOrCreate(id) { return _charts[id]; }

/* ==========================================================================
   2. Common Chart Defaults
   ========================================================================== */
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size   = 11;
Chart.defaults.color       = '#64748b';

const CHART_COLORS = {
  blue:   { border: '#2563eb', bg: 'rgba(37,99,235,.12)'  },
  cyan:   { border: '#0ea5e9', bg: 'rgba(14,165,233,.12)' },
  green:  { border: '#16a34a', bg: 'rgba(22,163,74,.12)'  },
  red:    { border: '#dc2626', bg: 'rgba(220,38,38,.12)'  },
  orange: { border: '#d97706', bg: 'rgba(217,119,6,.12)'  },
  purple: { border: '#7c3aed', bg: 'rgba(124,58,237,.12)' },
};

function _lineDataset(label, color, data = [], yAxisID = 'y') {
  const c = CHART_COLORS[color] || CHART_COLORS.blue;
  return {
    label,
    data,
    borderColor:     c.border,
    backgroundColor: c.bg,
    borderWidth:     2,
    pointRadius:     2.5,
    pointHoverRadius: 5,
    fill:            true,
    tension:         0.35,
    yAxisID,
  };
}

function _barDataset(label, color, data = []) {
  const c = CHART_COLORS[color] || CHART_COLORS.blue;
  return {
    label, data,
    backgroundColor: c.border,
    borderRadius:    4,
    borderSkipped:   false,
  };
}

function _baseLineOptions(title, yLabel = '', y2Label = '') {
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend:  { position: 'top', labels: { boxWidth: 12, padding: 12 } },
      title:   { display: !!title, text: title, font: { size: 13, weight: '700' }, padding: { bottom: 10 } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)}` } },
    },
    scales: {
      x: {
        grid: { color: 'rgba(0,0,0,.04)' },
        ticks: { maxTicksLimit: 10, maxRotation: 0 },
      },
      y: {
        grid: { color: 'rgba(0,0,0,.04)' },
        title: { display: !!yLabel, text: yLabel, font: { size: 11 } },
        beginAtZero: true,
      },
    },
    animation: { duration: 200 },
  };
  if (y2Label) {
    opts.scales.y2 = {
      position: 'right',
      grid: { drawOnChartArea: false },
      title: { display: true, text: y2Label, font: { size: 11 } },
      beginAtZero: true,
    };
  }
  return opts;
}

/* ==========================================================================
   3. Speed vs Time Chart
   ========================================================================== */
window.initSpeedChart = function (canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || _charts[canvasId]) return;

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        _lineDataset('Speed (km/h)', 'blue'),
      ],
    },
    options: _baseLineOptions('', 'Speed (km/h)'),
  });
};

window.pushSpeedData = function (canvasId, label, speedKmh) {
  const chart = _charts[canvasId];
  if (!chart) return;
  _pushPoint(chart, 0, label, speedKmh);
  chart.update('none');
};

/* ==========================================================================
   4. Velocity vs Time Chart
   ========================================================================== */
window.initVelocityChart = function (canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || _charts[canvasId]) return;

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        _lineDataset('Vx (m/s)', 'blue'),
        _lineDataset('Vy (m/s)', 'cyan'),
        _lineDataset('Vz (m/s)', 'purple'),
      ],
    },
    options: _baseLineOptions('', 'Velocity (m/s)'),
  });
};

window.pushVelocityData = function (canvasId, label, vx, vy, vz) {
  const chart = _charts[canvasId];
  if (!chart) return;
  _pushPoint(chart, 0, label, vx);
  _pushPoint(chart, 1, label, vy);
  _pushPoint(chart, 2, label, vz, false);  // label already added
  chart.update('none');
};

/* ==========================================================================
   5. Acceleration vs Time Chart
   ========================================================================== */
window.initAccelChart = function (canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || _charts[canvasId]) return;

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        _lineDataset('Acceleration magnitude (m/s²)', 'orange'),
      ],
    },
    options: _baseLineOptions('', 'Acceleration (m/s²)'),
  });
};

window.pushAccelData = function (canvasId, label, acc) {
  const chart = _charts[canvasId];
  if (!chart) return;
  _pushPoint(chart, 0, label, acc);
  chart.update('none');
};

/* ==========================================================================
   6. GPS Error / Accuracy vs Time Chart
   ========================================================================== */
window.initErrorChart = function (canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || _charts[canvasId]) return;

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        _lineDataset('GPS Accuracy (m)', 'green'),
      ],
    },
    options: _baseLineOptions('', 'Accuracy / Error (m)'),
  });
};

window.pushErrorData = function (canvasId, label, errorM) {
  const chart = _charts[canvasId];
  if (!chart) return;
  _pushPoint(chart, 0, label, errorM);
  chart.update('none');
};

/* ==========================================================================
   7. Analytics Charts
   ========================================================================== */
window.initAnalyticsSpeedChart = function (canvasId, labels, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (_charts[canvasId]) { _charts[canvasId].destroy(); }

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [ _lineDataset('Speed (km/h)', 'blue', data) ],
    },
    options: _baseLineOptions('Speed Over Time', 'km/h'),
  });
};

window.initAnalyticsAccelChart = function (canvasId, labels, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (_charts[canvasId]) { _charts[canvasId].destroy(); }

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [ _lineDataset('Acceleration (m/s²)', 'orange', data) ],
    },
    options: _baseLineOptions('Acceleration Over Time', 'm/s²'),
  });
};

window.initAnalyticsAccuracyChart = function (canvasId, labels, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (_charts[canvasId]) { _charts[canvasId].destroy(); }

  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [ _lineDataset('GPS Accuracy (m)', 'green', data) ],
    },
    options: _baseLineOptions('GPS Accuracy Over Time', 'm'),
  });
};

window.initAnalyticsSummaryChart = function (canvasId, labels, values) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (_charts[canvasId]) { _charts[canvasId].destroy(); }

  const colors = ['blue','cyan','green','orange','purple','red'];
  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Statistics',
        data: values,
        backgroundColor: colors.map(c => CHART_COLORS[c].border),
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(0,0,0,.04)' }, beginAtZero: true },
      },
      animation: { duration: 300 },
    },
  });
};

/* ==========================================================================
   8. Clear Chart Data
   ========================================================================== */
window.clearChart = function (canvasId) {
  const chart = _charts[canvasId];
  if (!chart) return;
  chart.data.labels = [];
  chart.data.datasets.forEach(ds => { ds.data = []; });
  chart.update();
};

window.clearAllCharts = function () {
  Object.keys(_charts).forEach(id => window.clearChart(id));
};

/* ==========================================================================
   9. Internal helper — push data point, trim old
   ========================================================================== */
function _pushPoint(chart, dsIdx, label, value, pushLabel = true) {
  if (pushLabel) {
    chart.data.labels.push(label);
    if (chart.data.labels.length > MAX_DATA_POINTS) chart.data.labels.shift();
  }
  const ds = chart.data.datasets[dsIdx];
  if (!ds) return;
  ds.data.push(+(value || 0).toFixed(4));
  if (ds.data.length > MAX_DATA_POINTS) ds.data.shift();
}

/* ==========================================================================
   10. Destroy / cleanup
   ========================================================================== */
window.destroyChart = function (canvasId) {
  if (_charts[canvasId]) {
    _charts[canvasId].destroy();
    delete _charts[canvasId];
  }
};
