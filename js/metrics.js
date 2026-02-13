// ─── AGP Metrics Calculation ────────────────────────────────────────────────
// Computes the standard international-consensus glucometrics from CGM data.

import {
  GLUCOSE_VERY_LOW,
  GLUCOSE_LOW,
  GLUCOSE_HIGH,
  GLUCOSE_VERY_HIGH,
  POINTS_PER_DAY,
  TARGET_TIR,
  TARGET_TBR,
  TARGET_TVLR,
  TARGET_TAR,
  TARGET_TVAR,
  TARGET_CV,
} from './constants.js';

/**
 * Calculate all standard AGP metrics from a glucose data array.
 * @param {number[]} data  – full simulation data (all days)
 * @returns {Object} metrics
 */
export function calculateMetrics(data) {
  if (!data || data.length === 0) return null;

  const n = data.length;

  // Time-in-range buckets
  let veryLow = 0, low = 0, inRange = 0, high = 0, veryHigh = 0;
  let sum = 0, sumSq = 0;

  for (let i = 0; i < n; i++) {
    const g = data[i];
    sum += g;
    sumSq += g * g;

    if (g < GLUCOSE_VERY_LOW)       veryLow++;
    else if (g < GLUCOSE_LOW)       low++;
    else if (g <= GLUCOSE_HIGH)     inRange++;
    else if (g <= GLUCOSE_VERY_HIGH) high++;
    else                             veryHigh++;
  }

  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const sd = Math.sqrt(Math.max(0, variance));
  const cv = (sd / mean) * 100;

  // GMI (Glucose Management Indicator) — regression from mean glucose
  const gmi = 3.31 + 0.02392 * mean;

  const pct = v => +((v / n) * 100).toFixed(1);

  return {
    tir:      pct(inRange),
    tbr:      pct(low),
    tvlr:     pct(veryLow),
    tar:      pct(high),
    tvar:     pct(veryHigh),
    mean:     +mean.toFixed(0),
    sd:       +sd.toFixed(0),
    cv:       +cv.toFixed(1),
    gmi:      +gmi.toFixed(1),
    numDays:  Math.ceil(n / POINTS_PER_DAY),
  };
}

/**
 * Evaluate whether metrics meet clinical targets.
 * Returns an object keyed by metric name → { value, target, met }.
 */
export function evaluateTargets(metrics) {
  if (!metrics) return {};
  return {
    tir:  { value: metrics.tir,  target: `≥${TARGET_TIR}%`,  met: metrics.tir  >= TARGET_TIR },
    tbr:  { value: metrics.tbr,  target: `<${TARGET_TBR}%`,  met: metrics.tbr  <  TARGET_TBR },
    tvlr: { value: metrics.tvlr, target: `<${TARGET_TVLR}%`, met: metrics.tvlr <  TARGET_TVLR },
    tar:  { value: metrics.tar,  target: `<${TARGET_TAR}%`,  met: metrics.tar  <  TARGET_TAR },
    tvar: { value: metrics.tvar, target: `<${TARGET_TVAR}%`, met: metrics.tvar <  TARGET_TVAR },
    cv:   { value: metrics.cv,   target: `<${TARGET_CV}%`,   met: metrics.cv   <  TARGET_CV },
  };
}

/**
 * Determine overall scenario outcome.
 * Success requires TIR met AND TBR safe.
 */
export function isScenarioComplete(metrics) {
  if (!metrics) return false;
  return metrics.tir >= TARGET_TIR && metrics.tbr < TARGET_TBR && metrics.tvlr < TARGET_TVLR;
}
