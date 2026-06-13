import { admin } from "@/lib/supabase/admin";
import { ok, bad } from "@/lib/api";
import { currentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Everything the resting screen + house screen need in one call. Polled lightly and re-fetched on
// each reveal. Leaderboards come from the get_leaderboard definer function (ranked handles + points,
// never raw answers).
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const sb = admin();
  const { data: venue } = await sb
    .from("venues")
    .select("id, slug, name, tagline, timezone, theme, house_screen_enabled, status")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!venue) return bad("venue not found", 404);

  const [{ data: prizes }, { data: tonight }, { data: week }, liveDropRes, { data: recent }] =
    await Promise.all([
      sb.from("prizes").select("id, name, description").eq("venue_id", venue.id).eq("is_active", true),
      sb.rpc("get_leaderboard", { p_venue_id: venue.id, p_scope: "tonight", p_limit: 20 }),
      sb.rpc("get_leaderboard", { p_venue_id: venue.id, p_scope: "week", p_limit: 20 }),
      sb.rpc("get_live_drop", { p_venue_id: venue.id }),
      sb
        .from("redemptions")
        .select("issued_at, player_id, prize_id")
        .eq("venue_id", venue.id)
        .order("issued_at", { ascending: false })
        .limit(6),
    ]);

  // Resolve recent-winner handles + prize names.
  const winnerIds = Array.from(new Set((recent ?? []).map((r: any) => r.player_id)));
  const prizeIds = Array.from(new Set((recent ?? []).map((r: any) => r.prize_id)));
  const [{ data: winnerPlayers }, { data: winnerPrizes }] = await Promise.all([
    winnerIds.length ? sb.from("players").select("id, handle").in("id", winnerIds) : Promise.resolve({ data: [] as any }),
    prizeIds.length ? sb.from("prizes").select("id, name").in("id", prizeIds) : Promise.resolve({ data: [] as any }),
  ]);
  const handleById = new Map((winnerPlayers ?? []).map((p: any) => [p.id, p.handle]));
  const prizeById = new Map((winnerPrizes ?? []).map((p: any) => [p.id, p.name]));
  const recentWinners = (recent ?? []).map((r: any) => ({
    handle: handleById.get(r.player_id) ?? "Someone",
    prize: prizeById.get(r.prize_id) ?? "a treat",
    at: r.issued_at,
  }));

  // Players seen today (venue-local) — a simple pilot signal for the resting screen.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count: playersTonight } = await sb
    .from("venue_players")
    .select("player_id", { count: "exact", head: true })
    .eq("venue_id", venue.id)
    .gte("last_seen_at", startOfDay.toISOString());

  // The current player's handle, if signed in.
  let playerHandle: string | null = null;
  let claimed = false;
  const uid = await currentUserId();
  if (uid) {
    const { data: p } = await sb.from("players").select("handle, phone").eq("id", uid).maybeSingle();
    playerHandle = p?.handle ?? null;
    claimed = Boolean(p?.phone);
  }

  return ok({
    venue: {
      id: venue.id,
      slug: venue.slug,
      name: venue.name,
      tagline: venue.tagline,
      timezone: venue.timezone,
      theme: venue.theme,
      houseScreenEnabled: venue.house_screen_enabled,
      status: venue.status,
    },
    prizes: prizes ?? [],
    leaderboards: { tonight: tonight ?? [], week: week ?? [] },
    liveDrop: liveDropRes.data ?? null,
    recentWinners,
    stats: { playersTonight: playersTonight ?? 0 },
    me: { handle: playerHandle, claimed },
  });
}
