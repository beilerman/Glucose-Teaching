// ─── Scenario Definitions ───────────────────────────────────────────────────
// Each scenario defines:
//   trueNeeds      – the patient's actual physiological insulin requirements
//   flawedRegimen  – the starting regimen the learner must fix
//   mealPlan       – 14 days of meals (with optional exercise / stress flags)
//   teachingPoints – educational content surfaced after simulation

function generateMeals(templates) {
  // Expand a weekly template into 14 days with small daily jitter
  const meals = [];
  for (let day = 1; day <= 14; day++) {
    const weekday = ((day - 1) % 7);
    const dayTemplate = templates[weekday] || templates[weekday % templates.length];
    for (const m of dayTemplate) {
      const jitterCarbs = Math.round(m.carbs + (Math.random() - 0.5) * 10);
      meals.push({
        day,
        hour: m.hour,
        carbs: Math.max(10, jitterCarbs),
        ...(m.exercise ? { exercise: { ...m.exercise } } : {}),
      });
    }
  }
  return meals;
}

const scenarios = [
  // ── Case 1: Post-Meal Spikes ────────────────────────────────────────────
  {
    id: 'postmeal-spikes',
    name: 'Case 1: Post-Meal Spikes',
    description:
      'A 42-year-old with T1DM. Fasting glucose is stable around 100 mg/dL, but they experience significant hyperglycemia (>250 mg/dL) after every meal, especially dinner.',
    patientProfile: {
      age: 42, weight: '78 kg', type: 'Type 1 DM', a1c: '8.2%',
      notes: 'Reports feeling "fine" in the morning but fatigued after meals.',
    },
    trueNeeds:     { basal: 20, ic: 10, isf: 50 },
    flawedRegimen: { basal: 20, ic: 15, isf: 50 },
    mealPlan: generateMeals([
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 75 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 55 }, { hour: 13, carbs: 80 }, { hour: 19, carbs: 70 }],
      [{ hour: 8, carbs: 65 }, { hour: 13, carbs: 70 }, { hour: 19, carbs: 90 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 75 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 62 }, { hour: 13, carbs: 72 }, { hour: 19, carbs: 85 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 75 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 58 }, { hour: 13, carbs: 78 }, { hour: 19, carbs: 82 }],
    ]),
    teachingPoints: {
      pattern: 'Post-prandial hyperglycemia',
      keyInsight:
        'The I:C ratio is too high (too few units per gram of carb). Lowering the ratio increases the bolus dose to cover meals adequately.',
      adjustmentGuide:
        'Reduce the I:C ratio (e.g., from 1:15 to 1:10). Do NOT increase basal — fasting values are already on target.',
      clinicalPearl:
        'Always check fasting glucose first. If fasting is in range, post-meal spikes point to bolus dosing, not basal.',
    },
  },

  // ── Case 2: Fasting Hyperglycemia ───────────────────────────────────────
  {
    id: 'fasting-hyperglycemia',
    name: 'Case 2: Fasting Hyperglycemia',
    description:
      'A 55-year-old with T2DM on basal-bolus therapy. Post-meal control is reasonable, but glucose drifts up overnight, leading to fasting values of 180–220 mg/dL every morning.',
    patientProfile: {
      age: 55, weight: '92 kg', type: 'Type 2 DM', a1c: '8.6%',
      notes: 'No nocturnal hypoglycemia reported. Dinner at 7 PM, bedtime snack occasionally.',
    },
    trueNeeds:     { basal: 24, ic: 15, isf: 50 },
    flawedRegimen: { basal: 18, ic: 15, isf: 50 },
    mealPlan: generateMeals([
      [{ hour: 8, carbs: 50 }, { hour: 13, carbs: 60 }, { hour: 19, carbs: 70 }],
      [{ hour: 8, carbs: 55 }, { hour: 13, carbs: 65 }, { hour: 19, carbs: 60 }],
      [{ hour: 8, carbs: 50 }, { hour: 13, carbs: 70 }, { hour: 19, carbs: 65 }],
      [{ hour: 8, carbs: 50 }, { hour: 13, carbs: 60 }, { hour: 19, carbs: 70 }],
      [{ hour: 8, carbs: 52 }, { hour: 13, carbs: 62 }, { hour: 19, carbs: 68 }],
      [{ hour: 8, carbs: 50 }, { hour: 13, carbs: 60 }, { hour: 19, carbs: 70 }],
      [{ hour: 8, carbs: 48 }, { hour: 13, carbs: 58 }, { hour: 19, carbs: 72 }],
    ]),
    teachingPoints: {
      pattern: 'Nocturnal drift / inadequate basal coverage',
      keyInsight:
        'Insufficient basal insulin fails to suppress hepatic glucose production overnight. Glucose rises steadily from midnight to morning.',
      adjustmentGuide:
        'Increase basal dose by 2–4 units. Keep bolus ratios unchanged — post-meal control is adequate.',
      clinicalPearl:
        'Titrate basal to fasting glucose. The "fasting first" rule: fix the fasting number before adjusting bolus doses.',
    },
  },

  // ── Case 3: Correction-Induced Hypoglycemia ────────────────────────────
  {
    id: 'correction-hypo',
    name: 'Case 3: Correction-Induced Hypoglycemia',
    description:
      'A 30-year-old with T1DM. They spike after meals (under-dosed bolus), then over-correct, causing repeated hypoglycemic episodes 3–4 hours after eating.',
    patientProfile: {
      age: 30, weight: '68 kg', type: 'Type 1 DM', a1c: '7.8%',
      notes: 'Reports frequent "crashes" in the afternoon and before bed. Uses glucose tabs 4–5 times/week.',
    },
    trueNeeds:     { basal: 20, ic: 15, isf: 50 },
    flawedRegimen: { basal: 20, ic: 20, isf: 30 },
    mealPlan: generateMeals([
      [{ hour: 8, carbs: 80 }, { hour: 13, carbs: 90 }, { hour: 19, carbs: 60 }],
      [{ hour: 8, carbs: 75 }, { hour: 13, carbs: 85 }, { hour: 19, carbs: 65 }],
      [{ hour: 8, carbs: 80 }, { hour: 13, carbs: 95 }, { hour: 19, carbs: 70 }],
      [{ hour: 8, carbs: 80 }, { hour: 13, carbs: 90 }, { hour: 19, carbs: 60 }],
      [{ hour: 8, carbs: 78 }, { hour: 13, carbs: 88 }, { hour: 19, carbs: 68 }],
      [{ hour: 8, carbs: 80 }, { hour: 13, carbs: 90 }, { hour: 19, carbs: 60 }],
      [{ hour: 8, carbs: 82 }, { hour: 13, carbs: 92 }, { hour: 19, carbs: 62 }],
    ]),
    teachingPoints: {
      pattern: 'Post-correction hypoglycemia (roller-coaster pattern)',
      keyInsight:
        'The ISF is too aggressive (1:30 instead of 1:50), so each correction unit drops glucose more than expected, causing lows.',
      adjustmentGuide:
        'Increase the ISF (e.g., 30 → 50) AND decrease the I:C ratio (20 → 15). Both changes are needed to fix meal coverage and prevent over-correction.',
      clinicalPearl:
        'The "roller-coaster" pattern (spike then crash) usually means the I:C ratio and ISF are both off. Fix the bolus first, then the correction factor.',
    },
  },

  // ── Case 4: Exercise-Induced Hypoglycemia ──────────────────────────────
  {
    id: 'exercise-hypo',
    name: 'Case 4: Exercise-Induced Hypoglycemia',
    description:
      'A 28-year-old with T1DM who jogs every other day after lunch. Non-exercise days are well-controlled; exercise days show hypoglycemia 1–2 hours into the run.',
    patientProfile: {
      age: 28, weight: '72 kg', type: 'Type 1 DM', a1c: '6.9%',
      notes: 'Runs 5K at ~3 PM on Mon/Wed/Fri. Has had two episodes of symptomatic hypoglycemia during runs this month.',
    },
    trueNeeds:     { basal: 22, ic: 12, isf: 45 },
    flawedRegimen: { basal: 22, ic: 12, isf: 45 },
    mealPlan: generateMeals([
      // Mon: exercise
      [{ hour: 8, carbs: 70 }, { hour: 13, carbs: 80, exercise: { startMins: 120, durationMins: 60 } }, { hour: 19, carbs: 75 }],
      // Tue: rest
      [{ hour: 8, carbs: 70 }, { hour: 13, carbs: 80 }, { hour: 19, carbs: 75 }],
      // Wed: exercise
      [{ hour: 8, carbs: 70 }, { hour: 13, carbs: 80, exercise: { startMins: 120, durationMins: 60 } }, { hour: 19, carbs: 75 }],
      // Thu: rest
      [{ hour: 8, carbs: 70 }, { hour: 13, carbs: 80 }, { hour: 19, carbs: 75 }],
      // Fri: exercise
      [{ hour: 8, carbs: 70 }, { hour: 13, carbs: 80, exercise: { startMins: 120, durationMins: 60 } }, { hour: 19, carbs: 75 }],
      // Sat: rest
      [{ hour: 8, carbs: 70 }, { hour: 13, carbs: 80 }, { hour: 19, carbs: 75 }],
      // Sun: rest
      [{ hour: 8, carbs: 70 }, { hour: 13, carbs: 80 }, { hour: 19, carbs: 75 }],
    ]),
    teachingPoints: {
      pattern: 'Exercise-induced hypoglycemia on alternating days',
      keyInsight:
        'The regimen is correct for rest days. On exercise days, increased glucose uptake by muscles causes lows. The solution is not to change the overall regimen.',
      adjustmentGuide:
        'Options: (1) reduce lunch bolus by 25–50% on exercise days, (2) eat a 15–20 g carb snack before exercise, or (3) reduce basal by ~20% on exercise days if using a pump.',
      clinicalPearl:
        'Not every glucose problem requires a regimen change. Exercise management is about day-specific strategies, not blanket dose adjustments.',
    },
  },

  // ── Case 5: Sick Day Hyperglycemia ─────────────────────────────────────
  {
    id: 'sick-day',
    name: 'Case 5: Sick Day Hyperglycemia',
    description:
      'A 45-year-old with T1DM has a respiratory infection. Despite eating less than usual, glucose is persistently elevated (200–300+ mg/dL) around the clock.',
    patientProfile: {
      age: 45, weight: '80 kg', type: 'Type 1 DM', a1c: '7.2%',
      notes: 'Sick for 3 days with fever and reduced appetite. Eating ~50% of normal. Still taking usual insulin doses.',
    },
    trueNeeds:     { basal: 20, ic: 15, isf: 50 },
    flawedRegimen: { basal: 20, ic: 15, isf: 50 },
    stressFactor: 1.3,
    mealPlan: generateMeals([
      [{ hour: 9, carbs: 30 }, { hour: 14, carbs: 40 }, { hour: 19, carbs: 40 }],
      [{ hour: 9, carbs: 30 }, { hour: 14, carbs: 40 }, { hour: 19, carbs: 40 }],
      [{ hour: 9, carbs: 25 }, { hour: 14, carbs: 35 }, { hour: 19, carbs: 35 }],
      [{ hour: 9, carbs: 30 }, { hour: 14, carbs: 40 }, { hour: 19, carbs: 40 }],
      [{ hour: 9, carbs: 28 }, { hour: 14, carbs: 38 }, { hour: 19, carbs: 38 }],
      [{ hour: 9, carbs: 30 }, { hour: 14, carbs: 40 }, { hour: 19, carbs: 40 }],
      [{ hour: 9, carbs: 30 }, { hour: 14, carbs: 40 }, { hour: 19, carbs: 40 }],
    ]),
    teachingPoints: {
      pattern: 'Stress hyperglycemia / sick-day insulin resistance',
      keyInsight:
        'Illness causes counter-regulatory hormone release (cortisol, glucagon, epinephrine), increasing insulin resistance by 20–40%. Even with reduced food intake, glucose rises.',
      adjustmentGuide:
        'Increase basal by 20–30% during illness. Increase correction frequency. NEVER stop insulin during sick days — this is a common and dangerous mistake.',
      clinicalPearl:
        '"Sick day rules": increase fluids, monitor ketones, increase basal insulin, correct more frequently, and seek medical attention if ketones are moderate/large.',
    },
  },

  // ── Case 6: Dawn Phenomenon ────────────────────────────────────────────
  {
    id: 'dawn-phenomenon',
    name: 'Case 6: Dawn Phenomenon',
    description:
      'A 50-year-old with T2DM. Glucose is well-controlled during the day and stable through the early night, but rises consistently between 3–8 AM without any food intake.',
    patientProfile: {
      age: 50, weight: '88 kg', type: 'Type 2 DM', a1c: '7.9%',
      notes: 'Bedtime glucose is ~120 mg/dL but fasting is 170–200 mg/dL. No nocturnal eating.',
    },
    trueNeeds:     { basal: 22, ic: 12, isf: 45 },
    flawedRegimen: { basal: 18, ic: 12, isf: 45 },
    dawnPhenomenon: true,
    mealPlan: generateMeals([
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 70 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 70 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 58 }, { hour: 13, carbs: 72 }, { hour: 19, carbs: 78 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 70 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 62 }, { hour: 13, carbs: 68 }, { hour: 19, carbs: 82 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 70 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 70 }, { hour: 19, carbs: 80 }],
    ]),
    teachingPoints: {
      pattern: 'Dawn phenomenon — early-morning glucose rise',
      keyInsight:
        'Growth hormone and cortisol surge between 3–8 AM, increasing hepatic glucose output. The current basal dose cannot suppress this.',
      adjustmentGuide:
        'Increase basal insulin to cover the dawn rise. If on a pump, consider a higher overnight basal rate from 3–8 AM.',
      clinicalPearl:
        'Distinguish dawn phenomenon (glucose rising after 3 AM from a normal nadir) from the Somogyi effect (rebound hyperglycemia after nocturnal hypoglycemia). The CGM pattern makes this distinction clear.',
    },
  },

  // ── Case 7: Weekend Lifestyle Changes ──────────────────────────────────
  {
    id: 'weekend-changes',
    name: 'Case 7: Weekend Lifestyle Changes',
    description:
      'A 35-year-old with T1DM. Weekday control is excellent. On weekends, they sleep in, eat a large brunch, and glucose spikes to 280+ mg/dL after the late morning meal.',
    patientProfile: {
      age: 35, weight: '75 kg', type: 'Type 1 DM', a1c: '7.1%',
      notes: 'Weekend meals are larger and higher-carb (pancakes, brunch). Weekday meals are consistent.',
    },
    trueNeeds:     { basal: 20, ic: 10, isf: 50 },
    flawedRegimen: { basal: 20, ic: 10, isf: 50 },
    mealPlan: generateMeals([
      // Mon–Fri: well-controlled weekday pattern
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 75 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 75 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 75 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 75 }, { hour: 19, carbs: 80 }],
      [{ hour: 8, carbs: 60 }, { hour: 13, carbs: 75 }, { hour: 19, carbs: 80 }],
      // Sat–Sun: weekend brunch pattern
      [{ hour: 10, carbs: 100 }, { hour: 14, carbs: 85 }, { hour: 20, carbs: 95 }],
      [{ hour: 10, carbs: 100 }, { hour: 14, carbs: 85 }, { hour: 20, carbs: 95 }],
    ]),
    teachingPoints: {
      pattern: 'Weekend hyperglycemia from lifestyle changes',
      keyInsight:
        'The regimen is correct for weekday meals. Weekend brunch portions are much larger, and the same I:C ratio cannot cover the extra carbs without additional bolus.',
      adjustmentGuide:
        'Options: (1) more accurate carb counting on weekends, (2) a more aggressive I:C ratio for weekend meals, or (3) portion awareness.',
      clinicalPearl:
        'Pattern recognition across days of the week is a key AGP skill. The daily profile thumbnails make weekend vs. weekday differences immediately visible.',
    },
  },
];

export default scenarios;
