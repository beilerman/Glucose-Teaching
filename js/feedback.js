// ─── Educational Feedback Engine ────────────────────────────────────────────
// Generates contextual teaching feedback based on the user's regimen vs the
// scenario's true needs and the resulting metrics.

import { TARGET_TIR, TARGET_TBR, TARGET_CV } from './constants.js';

/**
 * Generate structured feedback for the learner.
 * @param {Object} scenario  – current scenario definition
 * @param {Object} regimen   – user's proposed regimen { basal, ic, isf }
 * @param {Object} metrics   – calculated AGP metrics
 * @param {Object} targets   – evaluateTargets() result
 * @returns {Object} feedback – { summary, details[], hints[], status }
 */
export function generateFeedback(scenario, regimen, metrics, targets) {
  const { trueNeeds, teachingPoints } = scenario;
  const feedback = {
    summary: '',
    details: [],
    hints: [],
    status: 'neutral', // 'success' | 'warning' | 'danger' | 'neutral'
  };

  if (!metrics) return feedback;

  // ── Overall status ────────────────────────────────────────────────────
  const tirMet = targets.tir?.met;
  const tbrSafe = targets.tbr?.met && targets.tvlr?.met;

  if (tirMet && tbrSafe) {
    feedback.status = 'success';
    feedback.summary = 'Excellent — this regimen achieves target glycemic control with acceptable safety.';
  } else if (!tbrSafe) {
    feedback.status = 'danger';
    feedback.summary = 'Warning — this regimen causes excessive hypoglycemia. Safety is the top priority.';
  } else if (metrics.tir < 50) {
    feedback.status = 'danger';
    feedback.summary = 'Significant hyperglycemia persists. The regimen needs further adjustment.';
  } else {
    feedback.status = 'warning';
    feedback.summary = 'Improving but not yet at target. Review the pattern and adjust further.';
  }

  // ── Specific metric feedback ──────────────────────────────────────────
  if (metrics.tar > 25) {
    feedback.details.push(`Time Above Range is ${metrics.tar}% (target <25%). Hyperglycemia remains a problem.`);
  }
  if (metrics.tvar > 5) {
    feedback.details.push(`Time in Very High range is ${metrics.tvar}% (target <5%). Severe hyperglycemia needs urgent attention.`);
  }
  if (metrics.tbr >= 4) {
    feedback.details.push(`Time Below Range is ${metrics.tbr}% (target <4%). Hypoglycemia risk is too high.`);
  }
  if (metrics.tvlr >= 1) {
    feedback.details.push(`Time in Very Low range is ${metrics.tvlr}% (target <1%). Severe hypoglycemia detected — reduce insulin.`);
  }
  if (metrics.cv >= 36) {
    feedback.details.push(`Glucose variability (CV) is ${metrics.cv}% (target <36%). Large swings indicate instability.`);
  }

  // ── Directional hints (compare user regimen to true needs) ────────────
  if (!tirMet || !tbrSafe) {
    // Basal hints
    const basalRatio = regimen.basal / trueNeeds.basal;
    if (basalRatio < 0.85) {
      feedback.hints.push('Consider increasing the basal dose — fasting and overnight glucose are running high.');
    } else if (basalRatio > 1.2) {
      feedback.hints.push('The basal dose may be too high — check for overnight or fasting hypoglycemia.');
    }

    // I:C ratio hints
    const icRatio = regimen.ic / trueNeeds.ic;
    if (icRatio > 1.2) {
      feedback.hints.push('The I:C ratio may be too high (too few units per carb gram). Post-meal spikes suggest lowering it.');
    } else if (icRatio < 0.8) {
      feedback.hints.push('The I:C ratio may be too low (too many units per carb gram), contributing to post-meal lows.');
    }

    // ISF hints
    const isfRatio = regimen.isf / trueNeeds.isf;
    if (isfRatio < 0.75) {
      feedback.hints.push('The ISF may be too aggressive (too low). Each correction unit drops glucose more than intended, risking lows.');
    } else if (isfRatio > 1.3) {
      feedback.hints.push('The ISF may be too conservative (too high). Corrections aren\'t bringing glucose down enough.');
    }

    // Scenario-specific contextual hints
    if (scenario.stressFactor && basalRatio < 1.1) {
      feedback.hints.push('During illness, insulin needs increase 20–40%. Consider a temporary increase in basal and correction frequency.');
    }
    if (scenario.dawnPhenomenon && basalRatio < 1.0) {
      feedback.hints.push('The early-morning glucose rise (dawn phenomenon) requires more basal coverage between 3–8 AM.');
    }
  }

  return feedback;
}

/**
 * Get the scenario's teaching points for the "Learn More" panel.
 */
export function getTeachingContent(scenario) {
  return scenario.teachingPoints || null;
}
