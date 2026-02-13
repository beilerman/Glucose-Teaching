// ─── AGP Chart Module ───────────────────────────────────────────────────────
// Renders the three standard AGP panels:
//   1. Composite 24-hour profile with percentile bands (5/10/25/50/75/90/95)
//   2. Daily glucose thumbnails
// Uses Chart.js with the annotation plugin.

import {
  POINTS_PER_DAY,
  SIMULATION_STEP_MINUTES,
  GLUCOSE_LOW,
  GLUCOSE_HIGH,
  GLUCOSE_VERY_HIGH,
  GLUCOSE_VERY_LOW,
  COLORS,
} from './constants.js';

// ─── Percentile Helpers ─────────────────────────────────────────────────────

function percentile(sorted, p) {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Slice 14-day data into per-time-of-day columns, then compute percentiles.
 * Returns { p5, p10, p25, p50, p75, p90, p95 } — each an array[POINTS_PER_DAY].
 */
function computePercentileBands(data) {
  const numDays = Math.floor(data.length / POINTS_PER_DAY);
  if (numDays === 0) return null;

  const bands = {
    p5: [], p10: [], p25: [], p50: [], p75: [], p90: [], p95: [],
  };

  for (let t = 0; t < POINTS_PER_DAY; t++) {
    const col = [];
    for (let d = 0; d < numDays; d++) {
      col.push(data[d * POINTS_PER_DAY + t]);
    }
    col.sort((a, b) => a - b);

    bands.p5.push(percentile(col, 5));
    bands.p10.push(percentile(col, 10));
    bands.p25.push(percentile(col, 25));
    bands.p50.push(percentile(col, 50));
    bands.p75.push(percentile(col, 75));
    bands.p90.push(percentile(col, 90));
    bands.p95.push(percentile(col, 95));
  }
  return bands;
}

// ─── Time Labels ────────────────────────────────────────────────────────────

function buildTimeLabels() {
  const labels = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += SIMULATION_STEP_MINUTES) {
      labels.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return labels;
}

const TIME_LABELS = buildTimeLabels();

// ─── AGP Profile Chart ─────────────────────────────────────────────────────

let agpChartInstance = null;

/**
 * Render (or update) the main AGP composite profile chart.
 */
export function renderAGPChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const bands = computePercentileBands(data);
  if (!bands) return;

  // Build datasets: filled bands + median line
  const datasets = [
    // 5th–95th outer band (light grey)
    {
      label: '5th–95th percentile',
      data: bands.p95,
      borderColor: 'transparent',
      backgroundColor: COLORS.idrFill,
      fill: '+1',
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 0,
      order: 5,
    },
    {
      label: '_p5_lower',
      data: bands.p5,
      borderColor: 'rgba(148,163,184,0.3)',
      borderDash: [4, 4],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 1,
      order: 5,
    },
    // 25th–75th inner band (blue)
    {
      label: '25th–75th percentile (IQR)',
      data: bands.p75,
      borderColor: 'transparent',
      backgroundColor: COLORS.iqrFill,
      fill: '+1',
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 0,
      order: 3,
    },
    {
      label: '_p25_lower',
      data: bands.p25,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 0,
      order: 3,
    },
    // Median line (dark blue, prominent)
    {
      label: 'Median (50th)',
      data: bands.p50,
      borderColor: COLORS.median,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 3,
      order: 1,
    },
  ];

  const annotations = {
    targetZoneBox: {
      type: 'box',
      yMin: GLUCOSE_LOW,
      yMax: GLUCOSE_HIGH,
      backgroundColor: COLORS.targetZone,
      borderWidth: 0,
      drawTime: 'beforeDatasetsDraw',
    },
    targetLow: {
      type: 'line',
      yMin: GLUCOSE_LOW,
      yMax: GLUCOSE_LOW,
      borderColor: 'rgba(34, 197, 94, 0.5)',
      borderWidth: 1.5,
      borderDash: [6, 4],
      drawTime: 'beforeDatasetsDraw',
      label: {
        content: `${GLUCOSE_LOW} mg/dL`,
        enabled: true,
        position: 'start',
        backgroundColor: 'rgba(34,197,94,0.8)',
        color: '#fff',
        font: { size: 10 },
        padding: 2,
        borderRadius: 3,
      },
    },
    targetHigh: {
      type: 'line',
      yMin: GLUCOSE_HIGH,
      yMax: GLUCOSE_HIGH,
      borderColor: 'rgba(34, 197, 94, 0.5)',
      borderWidth: 1.5,
      borderDash: [6, 4],
      drawTime: 'beforeDatasetsDraw',
      label: {
        content: `${GLUCOSE_HIGH} mg/dL`,
        enabled: true,
        position: 'start',
        backgroundColor: 'rgba(34,197,94,0.8)',
        color: '#fff',
        font: { size: 10 },
        padding: 2,
        borderRadius: 3,
      },
    },
  };

  const config = {
    type: 'line',
    data: { labels: TIME_LABELS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        y: {
          min: 40,
          max: 350,
          title: { display: true, text: 'Glucose (mg/dL)', font: { weight: 'bold' } },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        x: {
          title: { display: true, text: 'Time of Day', font: { weight: 'bold' } },
          ticks: {
            callback(value) {
              const label = this.getLabelForValue(value);
              if (label && label.endsWith(':00')) {
                const h = parseInt(label);
                if (h % 3 === 0) return label;
              }
              return null;
            },
            autoSkip: false,
            maxRotation: 0,
          },
          grid: { color: 'rgba(0,0,0,0.03)' },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            filter: item => !item.text.startsWith('_'),
            usePointStyle: true,
            padding: 16,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.dataset.label.startsWith('_')) return null;
              return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(0)} mg/dL`;
            },
          },
        },
        annotation: { annotations },
      },
    },
  };

  if (agpChartInstance) {
    agpChartInstance.data = config.data;
    agpChartInstance.options = config.options;
    agpChartInstance.update();
  } else {
    agpChartInstance = new Chart(ctx, config);
  }
}

// ─── Daily Thumbnail Charts ─────────────────────────────────────────────────

const dailyCharts = [];

/**
 * Render small daily glucose profile thumbnails.
 * @param {HTMLElement} container – the wrapper div for thumbnails
 * @param {number[]} data – full simulation data
 */
export function renderDailyThumbnails(container, data) {
  const numDays = Math.floor(data.length / POINTS_PER_DAY);
  if (numDays === 0) return;

  // Clear old thumbnails
  container.innerHTML = '';
  dailyCharts.forEach(c => c.destroy());
  dailyCharts.length = 0;

  for (let d = 0; d < numDays; d++) {
    const dayData = data.slice(d * POINTS_PER_DAY, (d + 1) * POINTS_PER_DAY);

    const wrapper = document.createElement('div');
    wrapper.className = 'daily-thumb';

    const label = document.createElement('div');
    label.className = 'daily-thumb-label';
    label.textContent = `Day ${d + 1}`;
    wrapper.appendChild(label);

    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 100;
    wrapper.appendChild(canvas);

    container.appendChild(wrapper);

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: TIME_LABELS,
        datasets: [{
          data: dayData,
          borderColor: COLORS.median,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
        }],
      },
      options: {
        responsive: false,
        animation: false,
        scales: {
          y: {
            min: 40, max: 350,
            display: false,
          },
          x: {
            display: false,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          annotation: {
            annotations: {
              targetLow: {
                type: 'line', yMin: GLUCOSE_LOW, yMax: GLUCOSE_LOW,
                borderColor: 'rgba(34,197,94,0.4)', borderWidth: 1, borderDash: [3, 3],
              },
              targetHigh: {
                type: 'line', yMin: GLUCOSE_HIGH, yMax: GLUCOSE_HIGH,
                borderColor: 'rgba(34,197,94,0.4)', borderWidth: 1, borderDash: [3, 3],
              },
            },
          },
        },
      },
    });
    dailyCharts.push(chart);
  }
}

/**
 * Destroy all chart instances (for cleanup).
 */
export function destroyCharts() {
  if (agpChartInstance) { agpChartInstance.destroy(); agpChartInstance = null; }
  dailyCharts.forEach(c => c.destroy());
  dailyCharts.length = 0;
}
