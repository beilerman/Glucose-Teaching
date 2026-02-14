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

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
// Deterministic random number generator so students can reliably compare runs.

function mulberry32(seed) {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return hash;
}

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

// ─── Stress Factor Helpers ───────────────────────────────────────────────────

function getStressFactor(scenario, day) {
  if (scenario.stressProfile && Array.isArray(scenario.stressProfile)) {
    const idx = Math.min(day - 1, scenario.stressProfile.length - 1);
    return scenario.stressProfile[idx];
  }
  if (scenario.stressFactor) return scenario.stressFactor;
  return 1.0;
}

function getEffectiveNeeds(trueNeeds, stressFactor) {
  if (stressFactor && stressFactor !== 1.0) {
    return {
      basal: trueNeeds.basal * stressFactor,
      ic: trueNeeds.ic / stressFactor,
      isf: trueNeeds.isf / stressFactor,
    };
  }
  return { ...trueNeeds };
}

function getInitialGlucose(regimen, effectiveNeeds) {
  if (regimen.basal < effectiveNeeds.basal) return 155;
  if (regimen.basal > effectiveNeeds.basal * 1.15) return 90;
  return 110;
}

// ─── Main Simulation ────────────────────────────────────────────────────────

/**
 * Run a full 14-day simulation with the given regimen against the scenario's
 * true physiological needs.  Returns { dataPoints, doseEvents }.
 */
export function simulateGlucose(regimen, scenario) {
  const { trueNeeds, mealPlan, dawnPhenomenon } = scenario;

  // Validate inputs
  if (regimen.ic <= 0 || regimen.isf <= 0 || regimen.basal < 0) {
    throw new Error('Invalid regimen values — all must be positive.');
  }

  // Seeded PRNG for reproducibility (seed from scenario id + regimen values)
  const seed = hashString(
    (scenario.id || 'default') + ':' + regimen.basal + ':' + regimen.ic + ':' + regimen.isf
  );
  const random = mulberry32(seed);

  const totalDays = Math.ceil(
    Math.max(...mealPlan.map(m => m.day)) / 1
  );
  const totalSteps = totalDays * POINTS_PER_DAY;

  const glucoseEffects = new Float64Array(totalSteps);
  const doseEvents = [];

  // ── 1. Basal / Hepatic Glucose Production ─────────────────────────────
  // Per-day computation supports variable stress profiles (e.g. sick day phases)
  for (let i = 0; i < totalSteps; i++) {
    const currentDay = 1 + Math.floor(i / POINTS_PER_DAY);
    const sf = getStressFactor(scenario, currentDay);
    const effNeeds = getEffectiveNeeds(trueNeeds, sf);

    const hourOfDay = Math.floor((i % POINTS_PER_DAY) * SIMULATION_STEP_MINUTES / 60);
    const hgpEffect = (effNeeds.isf / 50) * 1.5;
    const basalEffect = (regimen.basal / effNeeds.basal) * hgpEffect;

    let hgp = hgpEffect;
    if (dawnPhenomenon && hourOfDay >= 3 && hourOfDay < 8) {
      hgp *= 1.4;
    }
    glucoseEffects[i] += hgp - basalEffect;
  }

  // ── 2. Meals, Boluses, Corrections ────────────────────────────────────

  const day1EffNeeds = getEffectiveNeeds(trueNeeds, getStressFactor(scenario, 1));
  const initialGlucose = getInitialGlucose(regimen, day1EffNeeds);

  for (let step = 0; step < totalSteps; step++) {
    const currentDay = 1 + Math.floor(step / POINTS_PER_DAY);
    const hourOfDay = Math.floor((step % POINTS_PER_DAY) * SIMULATION_STEP_MINUTES / 60);
    const isTopOfHour = ((step * SIMULATION_STEP_MINUTES) % 60) === 0;

    const meal = mealPlan.find(m => m.day === currentDay && m.hour === hourOfDay && isTopOfHour);
    if (!meal) continue;

    const sf = getStressFactor(scenario, currentDay);
    const effectiveNeeds = getEffectiveNeeds(trueNeeds, sf);

    // Carb absorption curve (true physiological effect)
    // Mixed meals: peak at 90–120 min (step 18–24), duration ~5 hr
    const trueBolusNeeded = meal.carbs / effectiveNeeds.ic;
    const carbGlucoseRise = trueBolusNeeded * effectiveNeeds.isf;
    const carbCurve = generateEffectCurve(carbGlucoseRise, 54, 18);
    applyEffect(glucoseEffects, step, carbCurve, totalSteps);

    // Meal bolus (using the patient's CURRENT regimen)
    // Rapid-acting analog: onset 10–15 min, peak 60–75 min, duration 4.5 hr
    const mealBolusDose = Math.round(meal.carbs / regimen.ic);
    if (mealBolusDose > 0) {
      doseEvents.push({ step, dose: mealBolusDose, type: 'meal' });
      const bolusEffect = -mealBolusDose * effectiveNeeds.isf;
      const bolusCurve = generateEffectCurve(bolusEffect, 54, 14);
      applyEffect(glucoseEffects, step, bolusCurve, totalSteps);
    }

    // Correction bolus at meal time
    const approxGlucose = estimateGlucoseAtStep(glucoseEffects, step, initialGlucose);
    if (approxGlucose > GLUCOSE_TARGET_MAX) {
      applyCorrection(glucoseEffects, step, approxGlucose, regimen, effectiveNeeds, doseEvents, totalSteps);
    }
  }


  // ── 3. Exercise Effects ───────────────────────────────────────────────
  // During exercise: enhanced glucose disposal via GLUT4 translocation
  // Post-exercise: insulin sensitivity boost from glycogen replenishment (6–12 hr)

  for (const meal of mealPlan) {
    if (!meal.exercise) continue;
    const dayStart = (meal.day - 1) * POINTS_PER_DAY;
    const exStartStep = dayStart + (meal.hour * 60 + meal.exercise.startMins) / SIMULATION_STEP_MINUTES;
    const exDurSteps = meal.exercise.durationMins / SIMULATION_STEP_MINUTES;

    // During exercise: ~1.5 mg/dL drop per step (moderate aerobic)
    const dropPerStep = -1.5;
    for (let i = 0; i < exDurSteps; i++) {
      const idx = Math.round(exStartStep + i);
      if (idx >= 0 && idx < totalSteps) {
        glucoseEffects[idx] += dropPerStep;
      }
    }

    // Post-exercise insulin sensitivity boost (decaying over 12 hours)
    const exEndStep = Math.round(exStartStep + exDurSteps);
    const postExPhases = [
      { durationHrs: 2, dropPerStep: -0.3 },   // 0–2 hr: strong sensitivity boost
      { durationHrs: 4, dropPerStep: -0.2 },   // 2–6 hr: moderate boost
      { durationHrs: 6, dropPerStep: -0.1 },   // 6–12 hr: mild boost (delayed hypo risk)
    ];

    let phaseStart = exEndStep;
    for (const phase of postExPhases) {
      const phaseSteps = (phase.durationHrs * 60) / SIMULATION_STEP_MINUTES;
      for (let i = 0; i < phaseSteps; i++) {
        const idx = phaseStart + i;
        if (idx >= 0 && idx < totalSteps) {
          glucoseEffects[idx] += phase.dropPerStep;
        }
      }
      phaseStart += phaseSteps;
    }
  }

  // ── 4. Step-by-step integration ───────────────────────────────────────

  const dataPoints = new Float64Array(totalSteps);
  let glucose = initialGlucose;
  let treatingHypo = false;

  for (let step = 0; step < totalSteps; step++) {
    glucose += glucoseEffects[step];
    glucose += (random() - 0.5) * 2; // physiological noise (seeded for reproducibility)

    // Auto hypo treatment (rule of 15)
    // 15g fast-acting carbs raises glucose ~50 mg/dL regardless of ISF
    // (oral glucose absorption bypasses insulin sensitivity pathway)
    if (glucose < GLUCOSE_VERY_LOW && !treatingHypo) {
      const hypoRise = 50;
      // Fast absorption: peak at 15–20 min, total duration ~60 min
      const hypoCurve = generateEffectCurve(hypoRise, 12, 4);
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

function applyCorrection(glucoseEffects, step, approxGlucose, regimen, effectiveNeeds, doseEvents, totalSteps) {
  const desiredDrop = approxGlucose - GLUCOSE_CORRECTION_TARGET;
  const scheduledDrop = lookaheadInsulinEffect(glucoseEffects, step, 54, totalSteps);
  const neededDrop = desiredDrop - scheduledDrop;

  if (neededDrop > 0) {
    const rawDose = neededDrop / regimen.isf;
    const corrDose = rawDose >= 0.5 ? Math.round(rawDose) : 0;
    if (corrDose > 0) {
      doseEvents.push({ step, dose: corrDose, type: 'correction' });
      const corrEffect = -corrDose * effectiveNeeds.isf;
      const corrCurve = generateEffectCurve(corrEffect, 54, 14);
      applyEffect(glucoseEffects, step, corrCurve, totalSteps);
    }
  }
}
