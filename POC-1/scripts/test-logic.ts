// Fast, dependency-free unit checks for the pure game logic (scoring + active windows).
// Run: npx tsx scripts/test-logic.ts
import { computePoints, capElapsedMs } from "../src/lib/scoring";
import { isWithinActiveWindow, localNow } from "../src/lib/windows";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
}

const S = { basePoints: 100, maxSpeedBonus: 100, windowMs: 12000 };

// Wrong/none never scores.
check("wrong answer = 0", computePoints({ isCorrect: false, isPoll: false, elapsedMs: 100, ...S }) === 0);
// Instant correct = base + full bonus.
check("instant correct = base + full bonus", computePoints({ isCorrect: true, isPoll: false, elapsedMs: 0, ...S }) === 200);
// At the buzzer correct = base only.
check("buzzer correct = base only", computePoints({ isCorrect: true, isPoll: false, elapsedMs: 12000, ...S }) === 100);
// Half-time correct ≈ base + half bonus.
check("half-time correct = base + half bonus", computePoints({ isCorrect: true, isPoll: false, elapsedMs: 6000, ...S }) === 150);
// Faster always scores >= slower for correct answers (monotonic).
check(
  "faster beats slower",
  computePoints({ isCorrect: true, isPoll: false, elapsedMs: 2000, ...S }) >
    computePoints({ isCorrect: true, isPoll: false, elapsedMs: 9000, ...S })
);
// Polls award base for participation.
check("poll = base points", computePoints({ isCorrect: false, isPoll: true, elapsedMs: 5000, ...S }) === 100);
// Elapsed cap: garbage/negatives treated as slowest; overshoot clamped to window+grace.
check("cap negative → window", capElapsedMs(-50, 12000) === 12000);
check("cap overshoot → window+grace", capElapsedMs(999999, 12000) === 13500);
check("cap normal passes through", capElapsedMs(3200, 12000) === 3200);

// Active windows — construct a known instant and verify tz-local evaluation.
const tz = "America/Los_Angeles";
const { dow, minutes } = localNow(tz, new Date("2026-06-12T20:00:00-07:00")); // Fri 8pm PT
check("localNow computes Friday", dow === 5);
check("localNow computes 20:00", minutes === 20 * 60);
check(
  "inside an evening window",
  isWithinActiveWindow(tz, [{ day_of_week: 5, starts_at: "16:00", ends_at: "23:00" }], new Date("2026-06-12T20:00:00-07:00"))
);
check(
  "outside the window (wrong day)",
  !isWithinActiveWindow(tz, [{ day_of_week: 1, starts_at: "16:00", ends_at: "23:00" }], new Date("2026-06-12T20:00:00-07:00"))
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
