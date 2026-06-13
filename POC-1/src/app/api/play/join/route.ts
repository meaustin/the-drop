import { admin } from "@/lib/supabase/admin";
import { ok, bad, requirePlayer } from "@/lib/api";

// Called once after anonymous sign-in: records the player on the venue roster (venue_players) for
// return-nudge targeting and pilot analytics. Live presence is ephemeral (Realtime), not stored here.
export async function POST(req: Request) {
  const playerId = await requirePlayer();
  if (!playerId) return bad("not signed in", 401);
  const { venueId } = (await req.json().catch(() => ({}))) as { venueId?: string };
  if (!venueId) return bad("venueId required");

  const sb = admin();
  const now = new Date().toISOString();

  const { data: existing } = await sb
    .from("venue_players")
    .select("visit_count")
    .eq("venue_id", venueId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (existing) {
    await sb
      .from("venue_players")
      .update({ last_seen_at: now, visit_count: existing.visit_count + 1 })
      .eq("venue_id", venueId)
      .eq("player_id", playerId);
  } else {
    await sb.from("venue_players").insert({ venue_id: venueId, player_id: playerId });
  }
  await sb.from("players").update({ last_seen_at: now }).eq("id", playerId);

  const { data: player } = await sb.from("players").select("handle, phone").eq("id", playerId).single();
  return ok({ handle: player?.handle ?? null, claimed: Boolean(player?.phone) });
}
