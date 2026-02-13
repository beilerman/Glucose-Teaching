# Insulin Titration & AGP Simulation Tool

## Project Overview

Interactive teaching tool for medical students and residents to practice insulin titration using AGP (Ambulatory Glucose Profile) visualization. Built as vanilla JS with ES modules — no build step, no framework.

## Architecture

```
index.html              ← semantic HTML shell, loads Chart.js + annotation plugin via CDN
css/styles.css          ← all styling (no Tailwind)
js/
  constants.js          ← glucose thresholds, clinical targets, simulation params, colors
  scenarios.js          ← 7 clinical cases with meal plans, patient profiles, teaching points
  simulation.js         ← PK/PD simulation engine (carb absorption, insulin action, HGP, exercise)
  metrics.js            ← glucometrics calculation (TIR/TBR/TAR/CV/GMI) and target evaluation
  agpChart.js           ← AGP composite profile (percentile bands) + daily thumbnails via Chart.js
  feedback.js           ← educational feedback engine with directional hints
  app.js                ← application controller wiring everything together
```

## Clinical Standards

AGP visualization follows the 2019 ATTD international consensus:
- 5-level glucose ranges: Very Low (<54), Low (54–69), In Range (70–180), High (181–250), Very High (>250)
- Percentile bands: 5th/25th/50th (median)/75th/95th
- TIR stacked bar with color coding
- Targets: TIR ≥70%, TBR <4%, TVLR <1%, TAR <25%, TVAR <5%, CV <36%

---

## KNOWN ISSUES — Clinical Validation Audit

The following issues were identified during expert endocrinology review and must be fixed before this tool is used for teaching. Each item includes the file, the problem, and the correct clinical behavior.

### Simulation Engine (`js/simulation.js`)

#### 1. Carb absorption curve peaks too early
- **Current:** `generateEffectCurve(carbGlucoseRise, 48, 12)` — peaks at step 12 = 60 minutes
- **Correct:** Mixed meals peak glucose impact at 90–120 min post-ingestion. Simple carbs peak ~45–60 min, but the scenarios use mixed meals (60–100g carb servings).
- **Fix:** Change carb curve to `peakStep: 18–24` (90–120 min). Consider adding a `carbType` field to meals for future scenarios (simple vs complex carbs).

#### 2. Insulin action curve timing is wrong relative to carbs
- **Current:** Rapid-analog bolus uses `generateEffectCurve(bolusEffect, 42, 15)` — peak at step 15 = 75 min
- **Correct:** Rapid-acting analogs (lispro, aspart, glulisine): onset 10–15 min, peak 60–90 min, duration 4–5 hr. The peak is close but the duration (42 steps = 210 min = 3.5 hr) is too short.
- **Fix:** Extend bolus duration to `54 steps` (4.5 hr) with peak at step `12–15` (60–75 min). This creates a realistic mismatch where carbs peak LATER than insulin, producing the post-meal spike-then-drop pattern that teaches the "timing matters" lesson.

#### 3. `estimateGlucoseAtStep` is O(n) and inaccurate
- **Current:** Iterates from step 0 every call with a hardcoded initial glucose of 110, ignoring the adjusted initial glucose from the integration phase.
- **Fix:** Maintain a running glucose estimate as you iterate through the meal loop, or pass the actual current glucose forward. The correction logic depends on accurate glucose estimation — if it's wrong, corrections fire at wrong times.

#### 4. Exercise model is too simplistic
- **Current:** Flat `-0.8 mg/dL` per 5-min step during exercise only.
- **Correct physiology:**
  - During aerobic exercise: glucose disposal increases 2–5x via GLUT4 translocation (insulin-independent). Drop rate should be ~1.5–2.5 mg/dL per step depending on intensity.
  - Post-exercise (next 6–12 hr): glycogen replenishment increases insulin sensitivity, causing delayed hypoglycemia. This is the #1 reason patients with T1DM fear exercise.
  - The exercise scenario (Case 4) is clinically useless without the delayed effect — it's the delayed hypos that patients actually struggle with.
- **Fix:** Add a post-exercise insulin sensitivity multiplier that extends 6–12 hr after exercise cessation. Model as a decaying sensitivity boost (e.g., 1.3x for 2 hr, 1.2x for next 4 hr, 1.1x for remaining 6 hr).

#### 5. Hypo auto-treatment uses wrong math
- **Current:** `hypoRise = (HYPO_TREATMENT_CARBS / effectiveNeeds.ic) * effectiveNeeds.isf`
- **Correct:** The "rule of 15" is an empirical rule: 15g fast-acting carbs raises glucose ~50 mg/dL in most adults regardless of their I:C or ISF. The current formula makes hypo treatment ISF-dependent, which is physiologically wrong — oral glucose absorption bypasses the insulin sensitivity pathway.
- **Fix:** Replace with a fixed glucose rise of ~50 mg/dL applied over a fast absorption curve (peak at step 3–4 = 15–20 min, duration 12 steps = 60 min). This matches real glucose tab pharmacokinetics.

### Scenario Definitions (`js/scenarios.js`)

#### 6. Case 2 (Fasting Hyperglycemia) — ISF is wrong for T2DM
- **Current:** ISF = 50 for a 92 kg T2DM patient
- **Correct:** T2DM patients are insulin resistant. A 92 kg T2DM with A1c 8.6% would typically have ISF of 25–35 mg/dL per unit. ISF 50 is a T1DM-range sensitivity.
- **Fix:** Change `trueNeeds.isf` to 30, `flawedRegimen.isf` to 30. Adjust trueNeeds.ic to 8–10 (T2DM patients need more insulin per carb gram). This also means the basal gap (18 vs 24) produces a more realistic fasting drift.

#### 7. Case 3 (Roller-Coaster) — may not reliably produce visible hypos
- **Current:** flawedRegimen `{ basal: 20, ic: 20, isf: 30 }` vs trueNeeds `{ basal: 20, ic: 15, isf: 50 }`
- **Problem:** The I:C of 20 under-doses meals (producing spikes), then the ISF of 30 over-corrects. But the correction logic has a `lookaheadInsulinEffect` guard that may dampen the over-correction enough that hypos don't reliably appear in the sim.
- **Fix:** Verify by running the simulation. If hypos don't appear, reduce the lookahead dampening for this scenario, or make the ISF gap wider (e.g., ISF 25 flawed vs 50 true). The teaching point requires visible roller-coaster traces.

#### 8. Case 5 (Sick Day) — uniform 14-day illness is unrealistic
- **Current:** `stressFactor: 1.3` applies uniformly to all 14 days
- **Correct:** Real illness has phases: days 1–3 onset (increasing stress hormones), days 4–7 peak illness (stress factor 1.3–1.5), days 8–10 recovery (decreasing back toward 1.0), days 11–14 well.
- **Fix:** Replace scalar `stressFactor` with a `stressProfile` array of per-day multipliers:
  ```js
  stressProfile: [1.0, 1.1, 1.2, 1.3, 1.4, 1.4, 1.3, 1.2, 1.1, 1.0, 1.0, 1.0, 1.0, 1.0]
  ```
  Update `simulation.js` to read the day-specific stress factor. This teaches students that sick-day insulin adjustments are temporary and must be stepped back during recovery.

#### 9. Case 6 (Dawn Phenomenon) — conflates two problems
- **Current:** `flawedRegimen.basal = 18` vs `trueNeeds.basal = 22`, AND `dawnPhenomenon: true`
- **Problem:** The scenario has both insufficient basal AND dawn phenomenon. If the student simply raises basal to 22, they'll fix the overall basal deficit but may still see dawn rises. Or they might overshoot basal to compensate for dawn, causing overnight lows before the dawn surge.
- **Decision:** This is arguably a good teaching challenge (real patients have both). But the teaching points should explicitly address the layered nature: step 1 is fix baseline basal, step 2 is address residual dawn rise. Update `teachingPoints.adjustmentGuide` to reflect the two-step approach.

#### 10. Cases 4 (Exercise) & 7 (Weekend) — unsolvable with current UI
- **Current:** `flawedRegimen === trueNeeds` for both. The three sliders (basal, IC, ISF) cannot fix a problem that requires day-specific or meal-specific adjustments.
- **Problem:** Students will try every combination of basal/IC/ISF and never achieve target metrics because the problem is behavioral, not regimen-based. This is frustrating without explanation.
- **Fix options (pick one):**
  - **(A) Add scenario-specific UI controls:** For Case 4, add a checkbox "Reduce lunch bolus by 50% on exercise days" and a "Pre-exercise snack (15g carbs)" option. For Case 7, add a "Weekend I:C ratio" field. This is the richer teaching experience.
  - **(B) Make these observation-only cases:** Show the AGP, ask the student to identify the pattern, then present a multiple-choice question about the correct strategy. Remove the "simulate" flow for these cases.
  - **(C) Adjust the regimen slightly off for these too:** Give a flawed basal or IC so there IS something to fix with sliders, and layer the exercise/weekend issue on top. The student learns regimen titration AND behavioral pattern recognition in one case.

### Feedback Engine (`js/feedback.js`)

#### 11. Hint thresholds compare against raw `trueNeeds` instead of `effectiveNeeds`
- **Current:** `const basalRatio = regimen.basal / trueNeeds.basal` on line 64
- **Problem:** For Case 5 (sick day), `trueNeeds.basal = 20` but the effective need during illness is `20 * 1.3 = 26`. If the student correctly raises basal to 26, the hint system says "basal is too high" because `26/20 = 1.3 > 1.2`.
- **Fix:** Compute `effectiveNeeds` the same way `simulation.js` does (applying stressFactor) and compare against that. Import or duplicate the effective-needs logic.

#### 12. No feedback path for exercise/weekend scenarios
- **Current:** Feedback only addresses basal/IC/ISF mismatches.
- **Fix:** Add scenario-type-aware feedback. For exercise scenarios, detect that metrics diverge on exercise vs rest days and suggest day-specific strategies. For weekend scenarios, detect weekday-vs-weekend pattern and suggest carb awareness or dual ratios.

### Simulation Engine — Minor Issues

#### 13. Random noise is unseeded
- **Current:** `Math.random()` noise on line 150 means every simulation run produces different results for the same inputs.
- **Problem:** Students can't reliably compare two runs. Pedagogically, reproducibility matters — if they change IC from 15 to 12 and the chart looks different, they should know the difference is from their change, not from noise.
- **Fix:** Use a seeded PRNG (e.g., mulberry32). Seed with scenario index so each scenario is deterministic. Optionally expose a "re-randomize" button for students who want to see variability.

#### 14. Correction bolus only fires at meal times
- **Current:** Corrections only happen inside the meal-finding loop (line 78–119).
- **Problem:** In real life, patients check glucose and correct between meals too (especially CGM users). For Case 5 (sick day), the teaching point explicitly says "increase correction frequency," but the sim doesn't allow inter-meal corrections.
- **Fix:** Add a separate correction-check loop that fires every 2–4 hours (or at configurable intervals), independent of meal timing.

---

## Implementation Priority

1. **P0 (safety-critical for teaching accuracy):** Items 5, 6, 11 — wrong math or wrong clinical values that produce misleading results
2. **P1 (major educational impact):** Items 1, 2, 4, 8, 13 — timing/physiology issues that affect what patterns students see
3. **P2 (usability/completeness):** Items 3, 7, 9, 10, 12, 14 — quality-of-life and scenario completeness

## Dev Notes

- No build step — open `index.html` directly or use any static server
- Chart.js 4.4.0 + annotation plugin 3.0.1 loaded from CDN
- All modules use ES module imports (`type="module"` in the script tag)
- Simulation runs synchronously on the main thread; fine for 14 days x 288 points = 4032 data points
