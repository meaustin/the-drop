import "server-only";
import { admin } from "@/lib/supabase/admin";
import { publishToVenue } from "@/lib/realtime/publish";
import { RT_EVENT } from "@/lib/realtime/channel";
import { computePoints } from "@/lib/scoring";
import type { DropPayload, RevealPayload } from "@/lib/types";

const GRACE_MS = 1500; // server answer-cutoff grace beyond the visible countdown

type Settings = {
  countdown_seconds: number;
  base_points: number;
  max_speed_bonus: number;
  prize_drops_per_day: number;
  daily_prize_cap: number;
  prize_cooldown_minutes: number;
  redemption_ttl_minutes: number;
  question_repeat_cooldown_days: number;
};

function genCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

async function getSettings(venueId: string): Promise<Settings | null> {
  const { data } = await admin().from("venue_settings").select("*").eq("venue_id", venueId).single();
  return (data as Settings) ?? null;
}

/**
 * Eligible question = approved, belonging to this venue OR an enabled pack, not currently flagged,
 * and not served at this venue within the repeat-cooldown. Blends in non-knowledge formats so the
 * board doesn't become "the three smartest regulars" (spec §6).
 */
export async function selectQuestionForVenue(venueId: string): Promise<string | null> {
  const sb = admin();
  const settings = await getSettings(venueId);
  const cooldownDays = settings?.question_repeat_cooldown_days ?? 14;

  const { data: enabledPacks } = await sb
    .from("venue_packs")
    .select("pack_id")
    .eq("venue_id", venueId)
    .eq("enabled", true);
  const packIds = (enabledPacks ?? []).map((r: any) => r.pack_id);

  // Approved questions for this venue (venue-authored OR in an enabled global pack).
  const { data: candidates } = await sb
    .from("questions")
    .select("id, format, venue_id, pack_id")
    .eq("status", "approved")
    .or(`venue_id.eq.${venueId}${packIds.length ? `,pack_id.in.(${packIds.join(",")})` : ""}`)
    .limit(500);
  if (!candidates || candidates.length === 0) return null;

  // Exclude open-flagged questions.
  const { data: flagged } = await sb.from("question_flags").select("question_id").eq("status", "open");
  const flaggedSet = new Set((flagged ?? []).map((r: any) => r.question_id));

  // Exclude questions served at this venue within the cooldown window.
  const since = new Date(Date.now() - cooldownDays * 86400_000).toISOString();
  const { data: recent } = await sb
    .from("drops")
    .select("question_id")
    .eq("venue_id", venueId)
    .gte("started_at", since);
  const recentSet = new Set((recent ?? []).map((r: any) => r.question_id));

  let pool = candidates.filter((q: any) => !flaggedSet.has(q.id) && !recentSet.has(q.id));
  if (pool.length === 0) pool = candidates.filter((q: any) => !flaggedSet.has(q.id)); // cooldown exhausted → allow repeats
  if (pool.length === 0) return null;

  // ~25% of the time, prefer a non-multiple-choice drop if one is available (content mix).
  const nonMc = pool.filter((q: any) => q.format !== "multiple_choice");
  if (nonMc.length && Math.random() < 0.25) pool = nonMc;

  return pool[Math.floor(Math.random() * pool.length)].id;
}

async function decidePrizeDrop(venueId: string, settings: Settings): Promise<string | null> {
  const sb = admin();
  const { data: prizes } = await sb
    .from("prizes")
    .select("id")
    .eq("venue_id", venueId)
    .eq("is_active", true)
    .limit(1);
  if (!prizes || prizes.length === 0) return null;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count } = await sb
    .from("drops")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId)
    .eq("is_prize_drop", true)
    .gte("started_at", startOfDay.toISOString());
  if ((count ?? 0) >= settings.prize_drops_per_day) return null;

  // Spread prize drops across the day rather than front-loading them.
  return Math.random() < 0.35 ? prizes[0].id : null;
}

/** Fire a drop at a venue now. `forcePrize` lets the admin "fire a prize drop" on demand. */
export async function fireDrop(
  venueId: string,
  opts: { forcePrize?: boolean; questionId?: string } = {}
): Promise<{ ok: true; drop: DropPayload } | { ok: false; reason: string }> {
  const sb = admin();
  const settings = await getSettings(venueId);
  if (!settings) return { ok: false, reason: "venue has no settings" };

  // Don't overlap a live drop.
  const { data: live } = await sb
    .from("drops")
    .select("id, closes_at")
    .eq("venue_id", venueId)
    .eq("status", "live")
    .gt("closes_at", new Date().toISOString())
    .limit(1);
  if (live && live.length) return { ok: false, reason: "a drop is already live" };

  const questionId = opts.questionId ?? (await selectQuestionForVenue(venueId));
  if (!questionId) return { ok: false, reason: "no eligible question (add/approve content or enable a pack)" };

  const { data: q } = await sb
    .from("questions")
    .select("id, format, prompt, options, unit, category")
    .eq("id", questionId)
    .single();
  if (!q) return { ok: false, reason: "question not found" };

  let prizeId: string | null = null;
  if (opts.forcePrize) {
    const { data: prizes } = await sb
      .from("prizes").select("id").eq("venue_id", venueId).eq("is_active", true).limit(1);
    prizeId = prizes?.[0]?.id ?? null;
    if (!prizeId) return { ok: false, reason: "no active prize configured" };
  } else {
    prizeId = await decidePrizeDrop(venueId, settings);
  }

  const startedAt = new Date();
  const closesAt = new Date(startedAt.getTime() + settings.countdown_seconds * 1000 + GRACE_MS);

  const { data: drop, error } = await sb
    .from("drops")
    .insert({
      venue_id: venueId,
      question_id: questionId,
      is_prize_drop: prizeId != null,
      prize_id: prizeId,
      status: "live",
      countdown_seconds: settings.countdown_seconds,
      started_at: startedAt.toISOString(),
      closes_at: closesAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !drop) return { ok: false, reason: error?.message ?? "insert failed" };

  let prize = null as DropPayload["prize"];
  if (prizeId) {
    const { data: p } = await sb.from("prizes").select("name, description").eq("id", prizeId).single();
    if (p) prize = { name: p.name, description: p.description };
  }

  const payload: DropPayload = {
    dropId: drop.id,
    venueId,
    format: q.format,
    prompt: q.prompt,
    options: (q.options as string[] | null) ?? null,
    unit: q.unit ?? null,
    category: q.category ?? null,
    isPrizeDrop: prizeId != null,
    prize,
    countdownSeconds: settings.countdown_seconds,
    startedAt: startedAt.toISOString(),
    closesAt: closesAt.toISOString(),
  };

  await publishToVenue(venueId, RT_EVENT.drop, payload);
  return { ok: true, drop: payload };
}

/**
 * Reveal a drop. Idempotent and time-guarded: callable by the first client whose countdown ends
 * (or by the cron reconciler). Grades closest-guess rankings, selects a prize winner under the
 * per-person cooldown + daily cap, issues a redemption code, and broadcasts the reveal.
 */
export async function revealDrop(
  dropId: string,
  opts: { force?: boolean } = {}
): Promise<{ ok: true; reveal: RevealPayload } | { ok: false; reason: string }> {
  const sb = admin();
  const { data: drop } = await sb.from("drops").select("*").eq("id", dropId).single();
  if (!drop) return { ok: false, reason: "drop not found" };

  if (drop.status !== "live") {
    // Already revealed/voided — rebuild and return the existing reveal (idempotent).
    return { ok: true, reveal: await buildReveal(dropId) };
  }
  if (!opts.force && new Date(drop.closes_at).getTime() > Date.now()) {
    return { ok: false, reason: "not yet closed" };
  }

  const settings = await getSettings(drop.venue_id);
  if (!settings) return { ok: false, reason: "venue has no settings" };

  const { data: q } = await sb.from("questions").select("*").eq("id", drop.question_id).single();
  if (!q) return { ok: false, reason: "question not found" };

  // Atomic transition: only one caller flips live → revealed.
  const { data: claimed } = await sb
    .from("drops")
    .update({ status: "revealed", revealed_at: new Date().toISOString() })
    .eq("id", dropId)
    .eq("status", "live")
    .select("id");
  if (!claimed || claimed.length === 0) {
    // Lost the race; another caller revealed it.
    return { ok: true, reveal: await buildReveal(dropId) };
  }

  // Finalize closest-guess scoring (can only rank once all answers are in).
  if (q.format === "closest_guess") {
    const { data: answers } = await sb
      .from("answers")
      .select("id, answer_number, elapsed_ms")
      .eq("drop_id", dropId);
    const ranked = (answers ?? [])
      .filter((a: any) => a.answer_number != null)
      .map((a: any) => ({ ...a, dist: Math.abs(Number(a.answer_number) - Number(q.correct_number)) }))
      .sort((x, y) => x.dist - y.dist || x.elapsed_ms - y.elapsed_ms);
    for (let i = 0; i < ranked.length; i++) {
      const isWinner = i === 0;
      await sb
        .from("answers")
        .update({
          is_correct: isWinner,
          points_awarded: settings.base_points + (isWinner ? settings.max_speed_bonus : 0),
        })
        .eq("id", ranked[i].id);
    }
  }

  // Prize winner selection (prize drops only).
  let winner: RevealPayload["winner"] = null;
  if (drop.is_prize_drop && drop.prize_id) {
    winner = await selectAndAwardWinner(drop, settings);
  }

  const reveal = await buildReveal(dropId);
  await publishToVenue(drop.venue_id, RT_EVENT.reveal, reveal);
  return { ok: true, reveal };
}

async function selectAndAwardWinner(drop: any, settings: Settings): Promise<RevealPayload["winner"]> {
  const sb = admin();

  // Daily cap check (derived; data-model §E).
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count: issuedToday } = await sb
    .from("redemptions")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", drop.venue_id)
    .gte("issued_at", startOfDay.toISOString());
  if ((issuedToday ?? 0) >= settings.daily_prize_cap) return null;

  // Correct answers, fastest first.
  const { data: correct } = await sb
    .from("answers")
    .select("player_id, elapsed_ms")
    .eq("drop_id", drop.id)
    .eq("is_correct", true)
    .order("elapsed_ms", { ascending: true });
  if (!correct || correct.length === 0) return null;

  const cooldownStart = new Date(Date.now() - settings.prize_cooldown_minutes * 60_000).toISOString();

  for (const cand of correct) {
    // Per-person cooldown (derived): skip players who won here within the cooldown window.
    const { count: recentWins } = await sb
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", drop.venue_id)
      .eq("player_id", cand.player_id)
      .gte("issued_at", cooldownStart);
    if ((recentWins ?? 0) > 0) continue;

    // Issue the win. Unique(drop_id) guarantees one winner even under a race.
    const expiresAt = new Date(Date.now() + settings.redemption_ttl_minutes * 60_000).toISOString();
    let code = genCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await sb.from("redemptions").insert({
        drop_id: drop.id,
        venue_id: drop.venue_id,
        player_id: cand.player_id,
        prize_id: drop.prize_id,
        code,
        expires_at: expiresAt,
      });
      if (!error) {
        await sb.from("drops").update({ winner_player_id: cand.player_id }).eq("id", drop.id);
        const { data: p } = await sb.from("players").select("handle").eq("id", cand.player_id).single();
        return { handle: p?.handle ?? "Winner", elapsedMs: cand.elapsed_ms };
      }
      if (error.message.includes("redemptions_drop_id_key") || error.code === "23505") {
        // drop already has a winner (race) — stop.
        if (error.message.includes("drop_id")) return null;
        code = genCode(); // code collision — retry with a new code
        continue;
      }
      return null;
    }
  }
  return null;
}

/** Rebuild the reveal payload from persisted state (used for idempotent re-reveal). */
async function buildReveal(dropId: string): Promise<RevealPayload> {
  const sb = admin();
  const { data: drop } = await sb.from("drops").select("*").eq("id", dropId).single();
  const { data: q } = await sb.from("questions").select("*").eq("id", drop!.question_id).single();
  const { data: answers } = await sb
    .from("answers")
    .select("selected_option, player_id, elapsed_ms, is_correct")
    .eq("drop_id", dropId);

  let tally: number[] | null = null;
  if (q!.options && Array.isArray(q!.options)) {
    tally = new Array((q!.options as string[]).length).fill(0);
    for (const a of answers ?? []) {
      if (a.selected_option != null && tally[a.selected_option] != null) tally[a.selected_option]++;
    }
  }

  let winner: RevealPayload["winner"] = null;
  if (drop!.winner_player_id) {
    const win = (answers ?? []).find((a: any) => a.player_id === drop!.winner_player_id);
    const { data: p } = await sb.from("players").select("handle").eq("id", drop!.winner_player_id).single();
    winner = { handle: p?.handle ?? "Winner", elapsedMs: win?.elapsed_ms ?? 0 };
  }

  return {
    dropId,
    format: q!.format,
    correctOption: q!.correct_option ?? null,
    correctNumber: q!.correct_number != null ? Number(q!.correct_number) : null,
    unit: q!.unit ?? null,
    isPrizeDrop: drop!.is_prize_drop,
    winner,
    answerCount: (answers ?? []).length,
    tally,
  };
}

/** Grade a single submitted answer (MC/poll at submit time). Returns points + correctness. */
export function gradeImmediate(
  format: string,
  selectedOption: number | null,
  correctOption: number | null,
  elapsedMs: number,
  settings: Pick<Settings, "countdown_seconds" | "base_points" | "max_speed_bonus">
): { isCorrect: boolean | null; points: number } {
  if (format === "poll") {
    return { isCorrect: null, points: settings.base_points };
  }
  if (format === "multiple_choice") {
    const isCorrect = selectedOption === correctOption;
    const points = computePoints({
      isCorrect,
      isPoll: false,
      elapsedMs,
      windowMs: settings.countdown_seconds * 1000,
      basePoints: settings.base_points,
      maxSpeedBonus: settings.max_speed_bonus,
    });
    return { isCorrect, points };
  }
  // closest_guess is graded at reveal (needs all answers to rank).
  return { isCorrect: null, points: 0 };
}
