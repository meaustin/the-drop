"use client";

// Presentational countdown ring. The fraction (1 → 0) and seconds are driven by the parent's
// per-device timer so the visual matches exactly what scoring uses.
export function Countdown({
  fraction,
  secondsLeft,
  size = 132,
}: {
  fraction: number;
  secondsLeft: number;
  size?: number;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const urgent = secondsLeft <= 3;
  const color = urgent ? "#ff3d71" : secondsLeft <= 6 ? "#ffc24b" : "#7c5cff";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2a2a3a" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
          style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.3s" }}
        />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center text-4xl font-black tnum ${
          urgent ? "text-drop animate-pulse" : "text-white"
        }`}
      >
        {Math.max(0, Math.ceil(secondsLeft))}
      </div>
    </div>
  );
}
