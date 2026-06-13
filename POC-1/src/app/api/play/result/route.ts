import { admin } from "@/lib/supabase/admin";
import { ok, bad, requirePlayer } from "@/lib/api";

// A player's own result for a drop, after reveal: their points, correctness, and — if they won a
// prize drop — their one-time redemption code. This is the only path that returns correctness, and
// only for the requesting player's own answer.
export async function GET(req: Request) {
  const playerId = await requirePlayer();
  if (!playerId) return bad("not signed in", 401);
  const { searchParams } = new URL(req.url);
  const dropId = searchParams.get("dropId");
  if (!dropId) return bad("dropId required");

  const sb = admin();
  const { data: ans } = await sb
    .from("answers")
    .select("is_correct, points_awarded, selected_option, answer_number, elapsed_ms")
    .eq("drop_id", dropId)
    .eq("player_id", playerId)
    .maybeSingle();

  const { data: redemption } = await sb
    .from("redemptions")
    .select("code, status, expires_at, prize_id")
    .eq("drop_id", dropId)
    .eq("player_id", playerId)
    .maybeSingle();

  let prizeName: string | null = null;
  if (redemption) {
    const { data: prize } = await sb.from("prizes").select("name").eq("id", redemption.prize_id).single();
    prizeName = prize?.name ?? null;
  }

  return ok({
    answered: Boolean(ans),
    isCorrect: ans?.is_correct ?? null,
    points: ans?.points_awarded ?? 0,
    elapsedMs: ans?.elapsed_ms ?? null,
    won: Boolean(redemption),
    code: redemption?.code ?? null,
    prizeName,
    expiresAt: redemption?.expires_at ?? null,
  });
}
