// ─── Application Controller ─────────────────────────────────────────────────
// Wires together scenarios, simulation, charting, metrics, and feedback.

import scenarios from './scenarios.js';
import { simulateGlucose } from './simulation.js';
import { calculateMetrics, evaluateTargets, isScenarioComplete } from './metrics.js';
import { renderAGPChart, renderDailyThumbnails, destroyCharts } from './agpChart.js';
import { generateFeedback, getTeachingContent } from './feedback.js';
import {
  COLORS,
  TARGET_TIR,
  TARGET_TBR,
  TARGET_TVLR,
  TARGET_TAR,
  TARGET_TVAR,
  TARGET_CV,
} from './constants.js';

// ─── State ──────────────────────────────────────────────────────────────────

let currentScenarioIndex = 0;
let baselineData = null;   // initial flawed-regimen simulation
let currentData = null;    // latest user simulation
let baselineMetrics = null;
let currentMetrics = null;

// ─── DOM References ─────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const els = {
  scenarioSelect:   $('scenario-select'),
  patientInfo:      $('patient-info'),
  scenarioDesc:     $('scenario-description'),
  basalInput:       $('basal-input'),
  icInput:          $('ic-ratio-input'),
  isfInput:         $('isf-input'),
  simulateBtn:      $('simulate-btn'),
  resetBtn:         $('reset-btn'),
  agpCanvas:        $('agp-chart'),
  dailyContainer:   $('daily-thumbnails'),
  tirBar:           $('tir-bar'),
  metricsTable:     $('metrics-table'),
  feedbackPanel:    $('feedback-panel'),
  teachingPanel:    $('teaching-panel'),
  successModal:     $('success-modal'),
  modalCloseBtn:    $('modal-close-btn'),
  viewToggle:       $('view-toggle'),
  comparisonHint:   $('comparison-hint'),
};

// ─── Scenario Loading ───────────────────────────────────────────────────────

function loadScenario(index) {
  currentScenarioIndex = index;
  const scenario = scenarios[index];

  // Reset charts
  destroyCharts();

  // Patient info panel
  const p = scenario.patientProfile;
  els.patientInfo.innerHTML = `
    <div class="info-row"><span class="info-label">Age:</span> ${p.age} years</div>
    <div class="info-row"><span class="info-label">Weight:</span> ${p.weight}</div>
    <div class="info-row"><span class="info-label">Diagnosis:</span> ${p.type}</div>
    <div class="info-row"><span class="info-label">HbA1c:</span> ${p.a1c}</div>
    <div class="info-row"><span class="info-label">Notes:</span> ${p.notes}</div>
    <hr class="divider">
    <div class="info-row"><span class="info-label">Basal:</span> ${scenario.flawedRegimen.basal} units/day</div>
    <div class="info-row"><span class="info-label">I:C Ratio:</span> 1:${scenario.flawedRegimen.ic}</div>
    <div class="info-row"><span class="info-label">ISF:</span> 1:${scenario.flawedRegimen.isf} mg/dL</div>
  `;
  els.scenarioDesc.textContent = scenario.description;

  // Populate inputs with flawed values
  els.basalInput.value = scenario.flawedRegimen.basal;
  els.icInput.value = scenario.flawedRegimen.ic;
  els.isfInput.value = scenario.flawedRegimen.isf;

  // Run baseline simulation
  const result = simulateGlucose(scenario.flawedRegimen, scenario);
  baselineData = result.dataPoints;
  currentData = baselineData;
  baselineMetrics = calculateMetrics(baselineData);
  currentMetrics = baselineMetrics;

  // Enable simulate button
  els.simulateBtn.disabled = false;

  // Render
  renderAll(scenario);
  renderTeachingPanel(scenario);
  clearFeedback();
  els.comparisonHint.classList.add('hidden');
}

// ─── Simulation ─────────────────────────────────────────────────────────────

function handleSimulate() {
  const scenario = scenarios[currentScenarioIndex];
  const regimen = {
    basal: parseFloat(els.basalInput.value),
    ic:    parseFloat(els.icInput.value),
    isf:   parseFloat(els.isfInput.value),
  };

  // Validation
  if (isNaN(regimen.basal) || isNaN(regimen.ic) || isNaN(regimen.isf)) {
    showValidationError('Please enter valid numbers for all fields.');
    return;
  }
  if (regimen.basal <= 0 || regimen.ic <= 0 || regimen.isf <= 0) {
    showValidationError('All values must be greater than zero.');
    return;
  }

  // Run new simulation
  const result = simulateGlucose(regimen, scenario);
  currentData = result.dataPoints;
  currentMetrics = calculateMetrics(currentData);

  // Generate feedback
  const targets = evaluateTargets(currentMetrics);
  const feedback = generateFeedback(scenario, regimen, currentMetrics, targets);
  renderFeedback(feedback);

  // Render updated charts
  renderAll(scenario);
  els.comparisonHint.classList.remove('hidden');

  // Check completion
  if (isScenarioComplete(currentMetrics)) {
    showSuccessModal();
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderAll(scenario) {
  renderAGPChart(els.agpCanvas, currentData);
  renderDailyThumbnails(els.dailyContainer, currentData);
  renderTIRBar(currentMetrics);
  renderMetricsTable(currentMetrics);
}

function renderTIRBar(metrics) {
  if (!metrics) return;
  // Stacked horizontal bar: very-low | low | in-range | high | very-high
  const segments = [
    { pct: metrics.tvlr, color: COLORS.veryLow.bg, label: `<54: ${metrics.tvlr}%` },
    { pct: metrics.tbr,  color: COLORS.low.bg,      label: `<70: ${metrics.tbr}%` },
    { pct: metrics.tir,  color: COLORS.inRange.bg,   label: `70-180: ${metrics.tir}%` },
    { pct: metrics.tar,  color: COLORS.high.bg,      label: `>180: ${metrics.tar}%` },
    { pct: metrics.tvar, color: COLORS.veryHigh.bg,   label: `>250: ${metrics.tvar}%` },
  ];

  els.tirBar.innerHTML = segments
    .filter(s => s.pct > 0)
    .map(s => `<div class="tir-segment" style="width:${Math.max(s.pct, 2)}%;background:${s.color}" title="${s.label}">
      ${s.pct >= 8 ? s.pct + '%' : ''}
    </div>`)
    .join('');
}

function renderMetricsTable(metrics) {
  if (!metrics) return;
  const targets = evaluateTargets(metrics);

  const rows = [
    { label: 'Time in Range (70–180)',      value: `${metrics.tir}%`,  target: targets.tir },
    { label: 'Time Below Range (<70)',      value: `${metrics.tbr}%`,  target: targets.tbr },
    { label: 'Time Very Low (<54)',         value: `${metrics.tvlr}%`, target: targets.tvlr },
    { label: 'Time Above Range (>180)',     value: `${metrics.tar}%`,  target: targets.tar },
    { label: 'Time Very High (>250)',       value: `${metrics.tvar}%`, target: targets.tvar },
    { label: 'Glucose Variability (CV)',    value: `${metrics.cv}%`,   target: targets.cv },
    { label: 'Mean Glucose',               value: `${metrics.mean} mg/dL`, target: null },
    { label: 'GMI (est. A1c)',             value: `${metrics.gmi}%`,  target: null },
    { label: 'Std Deviation',              value: `${metrics.sd} mg/dL`, target: null },
  ];

  els.metricsTable.innerHTML = rows.map(r => {
    let statusClass = '';
    let statusIcon = '';
    if (r.target) {
      statusClass = r.target.met ? 'met' : 'unmet';
      statusIcon = r.target.met
        ? '<span class="status-icon met">&#10003;</span>'
        : '<span class="status-icon unmet">&#10007;</span>';
    }
    return `<tr class="${statusClass}">
      <td>${r.label}</td>
      <td class="metric-value">${r.value}</td>
      <td class="metric-target">${r.target ? r.target.target : '—'}</td>
      <td>${statusIcon}</td>
    </tr>`;
  }).join('');
}

function renderFeedback(feedback) {
  const statusClasses = {
    success: 'feedback-success',
    warning: 'feedback-warning',
    danger:  'feedback-danger',
    neutral: 'feedback-neutral',
  };

  let html = `<div class="feedback-card ${statusClasses[feedback.status]}">`;
  html += `<p class="feedback-summary">${feedback.summary}</p>`;

  if (feedback.details.length > 0) {
    html += '<ul class="feedback-details">';
    feedback.details.forEach(d => html += `<li>${d}</li>`);
    html += '</ul>';
  }

  if (feedback.hints.length > 0) {
    html += '<div class="feedback-hints"><strong>Hints:</strong><ul>';
    feedback.hints.forEach(h => html += `<li>${h}</li>`);
    html += '</ul></div>';
  }

  html += '</div>';
  els.feedbackPanel.innerHTML = html;
}

function clearFeedback() {
  els.feedbackPanel.innerHTML = '<p class="text-muted">Run a simulation to see feedback here.</p>';
}

function renderTeachingPanel(scenario) {
  const tp = getTeachingContent(scenario);
  if (!tp) {
    els.teachingPanel.innerHTML = '';
    return;
  }
  els.teachingPanel.innerHTML = `
    <details class="teaching-details">
      <summary class="teaching-summary">Learning Objectives (click to reveal after attempting)</summary>
      <div class="teaching-content">
        <p><strong>Pattern:</strong> ${tp.pattern}</p>
        <p><strong>Key Insight:</strong> ${tp.keyInsight}</p>
        <p><strong>Adjustment Guide:</strong> ${tp.adjustmentGuide}</p>
        <p class="clinical-pearl"><strong>Clinical Pearl:</strong> ${tp.clinicalPearl}</p>
      </div>
    </details>
  `;
}

function showValidationError(msg) {
  els.feedbackPanel.innerHTML = `<div class="feedback-card feedback-danger"><p>${msg}</p></div>`;
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function showSuccessModal() {
  els.successModal.classList.remove('hidden');
  els.successModal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    els.successModal.classList.add('visible');
  });
}

function hideSuccessModal() {
  els.successModal.classList.remove('visible');
  els.successModal.setAttribute('aria-hidden', 'true');
  setTimeout(() => els.successModal.classList.add('hidden'), 300);
}

// ─── Event Listeners ────────────────────────────────────────────────────────

els.scenarioSelect.addEventListener('change', e => loadScenario(parseInt(e.target.value)));
els.simulateBtn.addEventListener('click', handleSimulate);
els.resetBtn.addEventListener('click', () => loadScenario(currentScenarioIndex));
els.modalCloseBtn.addEventListener('click', hideSuccessModal);

// Keyboard shortcut: Enter to simulate
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.target === els.basalInput || e.target === els.icInput || e.target === els.isfInput)) {
    e.preventDefault();
    handleSimulate();
  }
});

// ─── Populate Scenario Dropdown ─────────────────────────────────────────────

scenarios.forEach((s, i) => {
  const option = document.createElement('option');
  option.value = i;
  option.textContent = s.name;
  els.scenarioSelect.appendChild(option);
});

// ─── Initialize ─────────────────────────────────────────────────────────────

loadScenario(0);
