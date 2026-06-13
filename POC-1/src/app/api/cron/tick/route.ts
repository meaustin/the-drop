import { admin } from "@/lib/supabase/admin";
import { ok, bad } from "@/lib/api";
import { fireDrop, revealDrop } from "@/lib/engine";
import { isWithinActiveWindow, type ActiveWindow } from "@/lib/windows";
import { CRON_SECRET } from "@/lib/env";

export const dynamic = "force-dynamic";

// The scheduler tick (spec §13: "pg_cron → Edge Function"; here a Vercel Cron → Route Handler).
// On each call it (1) reconciles any live drop whose countdown has elapsed, and (2) fires a fresh
// drop for each active venue that is inside an active window and due per its cadence.
// Guarded by CRON_SECRET (Bearer header or ?key=).
export async function POST(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
  if (!CRON_SECRET || provided !== CRON_SECRET) return bad("unauthorized", 401);

  const sb = admin();
  const now = new Date();
  const fired: string[] = [];
  const revealed: string[] = [];

  // (1) Reconcile due reveals across all venues.
  const { data: dueLive } = await sb
    .from("drops")
    .select("id")
    .eq("status", "live")
    .lt("closes_at", now.toISOString());
  for (const d of dueLive ?? []) {
    const r = await revealDrop(d.id, { force: true });
    if (r.ok) revealed.push(d.id);
  }

  // (2) Consider firing for each active venue.
  const { data: venues } = await sb
    .from("venues")
    .select("id, timezone, status")
    .eq("status", "active");

  for (const v of venues ?? []) {
    const { data: windows } = await sb
      .from("venue_active_windows")
      .select("day_of_week, starts_at, ends_at")
      .eq("venue_id", v.id);
    if (!isWithinActiveWindow(v.timezone, (windows ?? []) as ActiveWindow[], now)) continue;

    const { data: settings } = await sb
      .from("venue_settings")
      .select("drops_per_hour, min_minutes_between_drops")
      .eq("venue_id", v.id)
      .single();
    if (!settings) continue;

    // Skip if a drop is currently live.
    const { data: live } = await sb
      .from("drops")
      .select("id")
      .eq("venue_id", v.id)
      .eq("status", "live")
      .gt("closes_at", now.toISOString())
      .limit(1);
    if (live && live.length) continue;

    // Due if enough time has passed since the last drop started.
    const intervalMin = Math.max(
      settings.min_minutes_between_drops,
      settings.drops_per_hour > 0 ? 60 / settings.drops_per_hour : 15
    );
    const { data: last } = await sb
      .from("drops")
      .select("started_at")
      .eq("venue_id", v.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const elapsedMin = last?.started_at
      ? (now.getTime() - new Date(last.started_at).getTime()) / 60000
      : Infinity;
    if (elapsedMin < intervalMin) continue;

    const res = await fireDrop(v.id);
    if (res.ok) fired.push(v.id);
  }

  return ok({ firedVenues: fired, revealedDrops: revealed, at: now.toISOString() });
}

// Allow GET for Vercel Cron (which issues GETs) as well.
export const GET = POST;
