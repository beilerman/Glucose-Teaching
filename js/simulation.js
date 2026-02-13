// ─── Glucose Simulation Engine ──────────────────────────────────────────────
// PK/PD-inspired model: insulin & carb curves, basal/HGP balance, exercise,
// stress, dawn phenomenon, hypo auto-treatment.

import {
  SIMULATION_STEP_MINUTES,
  POINTS_PER_DAY,
  GLUCOSE_FLOOR,
  GLUCOSE_VERY_LOW,
  GLUCOSE_TARGET_MAX,
  GLUCOSE_CORRECTION_TARGET,
  HYPO_TREATMENT_CARBS,
} from './constants.js';

// ─── Effect Curves ──────────────────────────────────────────────────────────

function generateEffectCurve(totalEffect, durationSteps, peakStep) {
  const curve = new Array(durationSteps).fill(0);
  if (durationSteps === 0 || peakStep <= 0) return curve;
  let sum = 0;
  for (let i = 0; i < durationSteps; i++) {
    const x = i + 1;
    const value = Math.pow(x / peakStep, 2) * Math.exp(2 * (1 - x / peakStep));
    curve[i] = Math.max(0, value);
    sum += curve[i];
  }
  if (sum === 0) return curve;
  const scale = totalEffect / sum;
  return curve.map(v => v * scale);
}

// ─── Main Simulation ────────────────────────────────────────────────────────

/**
 * Run a full 14-day simulation with the given regimen against the scenario's
 * true physiological needs.  Returns { dataPoints, doseEvents }.
 */
export function simulateGlucose(regimen, scenario) {
  const { trueNeeds, mealPlan, stressFactor, dawnPhenomenon } = scenario;

  // Validate inputs
  if (regimen.ic <= 0 || regimen.isf <= 0 || regimen.basal < 0) {
    throw new Error('Invalid regimen values — all must be positive.');
  }

  const totalDays = Math.ceil(
    Math.max(...mealPlan.map(m => m.day)) / 1
  );
  const totalSteps = totalDays * POINTS_PER_DAY;

  // Effective true needs (adjusted for stress / illness)
  const effectiveNeeds = stressFactor
    ? {
        basal: trueNeeds.basal * stressFactor,
        ic: trueNeeds.ic / stressFactor,
        isf: trueNeeds.isf / stressFactor,
      }
    : { ...trueNeeds };

  const glucoseEffects = new Float64Array(totalSteps);
  const doseEvents = [];

  // ── 1. Basal / Hepatic Glucose Production ─────────────────────────────
  const hgpEffect = (effectiveNeeds.isf / 50) * 1.5;
  const basalEffect = (regimen.basal / effectiveNeeds.basal) * hgpEffect;

  for (let i = 0; i < totalSteps; i++) {
    const hourOfDay = Math.floor((i % POINTS_PER_DAY) * SIMULATION_STEP_MINUTES / 60);
    let hgp = hgpEffect;
    if (dawnPhenomenon && hourOfDay >= 3 && hourOfDay < 8) {
      hgp *= 1.4;
    }
    glucoseEffects[i] += hgp - basalEffect;
  }

  // ── 2. Meals, Boluses, Corrections ────────────────────────────────────

  for (let step = 0; step < totalSteps; step++) {
    const currentDay = 1 + Math.floor(step / POINTS_PER_DAY);
    const hourOfDay = Math.floor((step % POINTS_PER_DAY) * SIMULATION_STEP_MINUTES / 60);
    const isTopOfHour = ((step * SIMULATION_STEP_MINUTES) % 60) === 0;

    const meal = mealPlan.find(m => m.day === currentDay && m.hour === hourOfDay && isTopOfHour);
    if (!meal) continue;

    // Carb absorption curve  (true physiological effect)
    const trueBolusNeeded = meal.carbs / effectiveNeeds.ic;
    const carbGlucoseRise = trueBolusNeeded * effectiveNeeds.isf;
    const carbCurve = generateEffectCurve(carbGlucoseRise, 48, 12);
    applyEffect(glucoseEffects, step, carbCurve, totalSteps);

    // Meal bolus  (using the patient's CURRENT regimen)
    const mealBolusDose = Math.round(meal.carbs / regimen.ic);
    if (mealBolusDose > 0) {
      doseEvents.push({ step, dose: mealBolusDose, type: 'meal' });
      const bolusEffect = -mealBolusDose * effectiveNeeds.isf;
      const bolusCurve = generateEffectCurve(bolusEffect, 42, 15);
      applyEffect(glucoseEffects, step, bolusCurve, totalSteps);
    }

    // Correction bolus at meal time
    const approxGlucose = estimateGlucoseAtStep(glucoseEffects, step, 110);
    if (approxGlucose > GLUCOSE_TARGET_MAX) {
      const desiredDrop = approxGlucose - GLUCOSE_CORRECTION_TARGET;
      // Look ahead for already-scheduled insulin
      const scheduledDrop = lookaheadInsulinEffect(glucoseEffects, step, 42, totalSteps);
      const neededDrop = desiredDrop - scheduledDrop;

      if (neededDrop > 0) {
        const rawDose = neededDrop / regimen.isf;
        const corrDose = rawDose >= 0.5 ? Math.round(rawDose) : 0;
        if (corrDose > 0) {
          doseEvents.push({ step, dose: corrDose, type: 'correction' });
          const corrEffect = -corrDose * effectiveNeeds.isf;
          const corrCurve = generateEffectCurve(corrEffect, 42, 15);
          applyEffect(glucoseEffects, step, corrCurve, totalSteps);
        }
      }
    }
  }

  // ── 3. Exercise Effects ───────────────────────────────────────────────

  for (const meal of mealPlan) {
    if (!meal.exercise) continue;
    const dayStart = (meal.day - 1) * POINTS_PER_DAY;
    const exStartStep = dayStart + (meal.hour * 60 + meal.exercise.startMins) / SIMULATION_STEP_MINUTES;
    const exDurSteps = meal.exercise.durationMins / SIMULATION_STEP_MINUTES;
    const dropPerStep = -0.8;
    for (let i = 0; i < exDurSteps; i++) {
      const idx = Math.round(exStartStep + i);
      if (idx >= 0 && idx < totalSteps) {
        glucoseEffects[idx] += dropPerStep;
      }
    }
  }

  // ── 4. Step-by-step integration ───────────────────────────────────────

  const dataPoints = new Float64Array(totalSteps);
  let glucose = 110;
  let treatingHypo = false;

  // Adjust initial glucose based on basal mismatch
  if (regimen.basal < effectiveNeeds.basal) glucose = 155;
  else if (regimen.basal > effectiveNeeds.basal * 1.15) glucose = 90;

  for (let step = 0; step < totalSteps; step++) {
    glucose += glucoseEffects[step];
    glucose += (Math.random() - 0.5) * 2; // physiological noise

    // Auto hypo treatment  (rule of 15)
    if (glucose < GLUCOSE_VERY_LOW && !treatingHypo) {
      const hypoRise = (HYPO_TREATMENT_CARBS / effectiveNeeds.ic) * effectiveNeeds.isf;
      const hypoCurve = generateEffectCurve(hypoRise, 24, 6);
      applyEffect(glucoseEffects, step, hypoCurve, totalSteps);
      treatingHypo = true;
    }
    if (glucose > 80) treatingHypo = false;

    glucose = Math.max(GLUCOSE_FLOOR, glucose);
    dataPoints[step] = glucose;
  }

  return { dataPoints: Array.from(dataPoints), doseEvents };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function applyEffect(effects, startStep, curve, totalSteps) {
  for (let i = 0; i < curve.length; i++) {
    const idx = startStep + i;
    if (idx < totalSteps) effects[idx] += curve[i];
  }
}

function estimateGlucoseAtStep(effects, step, initialGlucose) {
  let g = initialGlucose;
  for (let i = 0; i < step; i++) g += effects[i];
  return g;
}

function lookaheadInsulinEffect(effects, step, horizon, totalSteps) {
  let drop = 0;
  for (let i = 0; i < horizon && step + i < totalSteps; i++) {
    if (effects[step + i] < 0) drop -= effects[step + i];
  }
  return drop;
}
