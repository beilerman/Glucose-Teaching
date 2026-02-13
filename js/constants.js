// ─── Glucose Thresholds (mg/dL) ─────────────────────────────────────────────
// Matches international consensus AGP ranges
export const GLUCOSE_VERY_LOW = 54;
export const GLUCOSE_LOW = 70;
export const GLUCOSE_TARGET_MIN = 70;
export const GLUCOSE_TARGET_MAX = 180;
export const GLUCOSE_HIGH = 180;
export const GLUCOSE_VERY_HIGH = 250;
export const GLUCOSE_FLOOR = 40;

// ─── Clinical Targets (international consensus) ─────────────────────────────
export const TARGET_TIR = 70;   // ≥70 %
export const TARGET_TBR = 4;    // <4 %
export const TARGET_TVLR = 1;   // <1 %
export const TARGET_TAR = 25;   // <25 %
export const TARGET_TVAR = 5;   // <5 %
export const TARGET_CV = 36;    // <36 %

// ─── Simulation Parameters ──────────────────────────────────────────────────
export const SIMULATION_STEP_MINUTES = 5;
export const POINTS_PER_DAY = (24 * 60) / SIMULATION_STEP_MINUTES; // 288
export const SIMULATION_DAYS = 14;
export const HYPO_TREATMENT_CARBS = 15;
export const GLUCOSE_CORRECTION_TARGET = 120;

// ─── AGP Color Palette (clinical standard) ──────────────────────────────────
export const COLORS = {
  veryLow:    { bg: '#8B0000', text: '#fff' },   // dark red
  low:        { bg: '#DC2626', text: '#fff' },   // red
  inRange:    { bg: '#16A34A', text: '#fff' },   // green
  high:       { bg: '#EAB308', text: '#000' },   // yellow
  veryHigh:   { bg: '#EA580C', text: '#fff' },   // orange

  median:     '#1E3A5F',                          // dark blue line
  iqrFill:    'rgba(59, 130, 246, 0.35)',         // blue band  (25-75th)
  idrFill:    'rgba(148, 163, 184, 0.25)',        // grey band  (5-95th / 10-90th)
  targetZone: 'rgba(34, 197, 94, 0.08)',          // faint green zone

  mealDose:   'rgba(59, 130, 246, 0.85)',
  corrDose:   'rgba(249, 115, 22, 0.85)',
};
