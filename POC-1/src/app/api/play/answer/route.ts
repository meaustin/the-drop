import { admin } from "@/lib/supabase/admin";
import { ok, bad, requirePlayer } from "@/lib/api";
import { capElapsedMs } from "@/lib/scoring";
import { gradeImmediate } from "@/lib/engine";
import { RT_EVENT, venueChannel } from "@/lib/realtime/channel";

// Server-authoritative answer submission (data-model principle 3). Clients NEVER insert answers
// directly — this caps the elapsed time, reads the hidden key, enforces the one-entry rule, and
// grades MC/poll immediately. Correctness is intentionally NOT returned (clients learn it at reveal).
export async function POST(req: Request) {
  const playerId = await requirePlayer();
  if (!playerId) return bad("not signed in", 401);

  const body = await req.json().catch(() => null);
  if (!body?.dropId) return bad("dropId required");
  const { dropId } = body;
  const selectedOption =
    typeof body.selectedOption === "number" ? body.selectedOption : null;
  const answerNumber = typeof body.answerNumber === "number" ? body.answerNumber : null;
  const reportedElapsed = Number(body.elapsedMs);

  const sb = admin();
  const { data: drop } = await sb
    .from("drops")
    .select("id, venue_id, question_id, status, closes_at, countdown_seconds")
    .eq("id", dropId)
    .single();
  if (!drop) return bad("drop not found", 404);
  if (drop.status !== "live") return bad("drop is closed", 409);
  if (new Date(drop.closes_at).getTime() < Date.now()) return bad("too late", 409);

  // The answer key — visible only to the service role here, never to the client.
  const { data: q } = await sb
    .from("questions")
    .select("format, correct_option")
    .eq("id", drop.question_id)
    .single();
  if (!q) return bad("question missing", 500);

  const { data: settings } = await sb
    .from("venue_settings")
    .select("countdown_seconds, base_points, max_speed_bonus")
    .eq("venue_id", drop.venue_id)
    .single();
  if (!settings) return bad("venue settings missing", 500);

  const windowMs = drop.countdown_seconds * 1000;
  const elapsedMs = capElapsedMs(reportedElapsed, windowMs);

  const graded = gradeImmediate(
    q.format,
    selectedOption,
    q.correct_option ?? null,
    elapsedMs,
    {
      countdown_seconds: drop.countdown_seconds,
      base_points: settings.base_points,
      max_speed_bonus: settings.max_speed_bonus,
    }
  );

  const { error } = await sb.from("answers").insert({
    drop_id: dropId,
    player_id: playerId,
    selected_option: selectedOption,
    answer_number: answerNumber,
    elapsed_ms: elapsedMs,
    is_correct: graded.isCorrect,
    points_awarded: graded.points,
  });

  if (error) {
    // 23505 = unique(drop_id, player_id) → already answered (the one-entry rule).
    if (error.code === "23505") return bad("already answered", 409);
    return bad(error.message, 500);
  }

  // Fire-and-forget social signal: tell the room someone locked in (drives the live counter).
  void fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      body: JSON.stringify({
        messages: [{ topic: venueChannel(drop.venue_id), event: RT_EVENT.answered, payload: { dropId } }],
      }),
    }
  ).catch(() => {});

  return ok({ accepted: true });
}
