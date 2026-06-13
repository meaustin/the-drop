// The hybrid scoring model (MVP spec §6, data-model §D).
//
//   correct  → base_points + speed bonus that decays linearly across the countdown window
//   wrong/none → 0 (never negative)
//   poll       → base_points for participating (no correct answer, no winner)
//
// Speed is measured PER DEVICE (elapsed_ms is render→submit on that player's phone), so this
// function is intentionally clock-agnostic: it only needs the elapsed time and the window.

export type ScoreInput = {
  isCorrect: boolean;
  isPoll: boolean;
  elapsedMs: number;
  windowMs: number; // countdown_seconds * 1000
  basePoints: number;
  maxSpeedBonus: number;
};

export function computePoints({
  isCorrect,
  isPoll,
  elapsedMs,
  windowMs,
  basePoints,
  maxSpeedBonus,
}: ScoreInput): number {
  if (isPoll) return basePoints; // participation
  if (!isCorrect) return 0;
  const clamped = Math.max(0, Math.min(elapsedMs, windowMs));
  const speedFraction = windowMs > 0 ? 1 - clamped / windowMs : 0;
  return basePoints + Math.round(maxSpeedBonus * speedFraction);
}

/** Server caps a device-reported elapsed time so a tampered/lagged value can't game scoring. */
export function capElapsedMs(reported: number, windowMs: number, graceMs = 1500): number {
  if (!Number.isFinite(reported) || reported < 0) return windowMs; // treat garbage as slowest
  return Math.min(reported, windowMs + graceMs);
}
