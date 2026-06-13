// Active-window evaluation in venue-local time (no synced clocks needed; we only ask "is it
// HH:MM on day D in the venue's timezone right now?").

export type ActiveWindow = { day_of_week: number; starts_at: string; ends_at: string };

export function localNow(timezone: string, now = new Date()): { dow: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: map[wd] ?? 0, minutes: (hour % 24) * 60 + minute };
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function isWithinActiveWindow(
  timezone: string,
  windows: ActiveWindow[],
  now = new Date()
): boolean {
  if (!windows.length) return false;
  const { dow, minutes } = localNow(timezone, now);
  return windows.some(
    (w) => w.day_of_week === dow && minutes >= toMinutes(w.starts_at) && minutes < toMinutes(w.ends_at)
  );
}
