import "./load-env";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * Offline content generation (MVP spec §9, §13). The model GENERATES; nothing it produces goes live.
 * Rows land at status `pending_review` with the model's self-flagged ambiguity score, for a human to
 * approve in the admin review queue. Biased toward stable, unambiguous facts; time-sensitive items
 * are explicitly discouraged.
 *
 * Usage:  npm run gen:questions -- <pack-slug> [count]
 *   e.g.  npm run gen:questions -- music-80s 15
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

if (!apiKey) {
  console.error("✗ ANTHROPIC_API_KEY not set. The seeded library works without this; set the key to expand it.");
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error("✗ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const packSlug = process.argv[2] || "general";
const count = Math.min(Number(process.argv[3] || 12), 40);

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
const anthropic = new Anthropic({
  apiKey,
  ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
});

const SYSTEM = `You generate trivia questions for a live bar game where wrong "correct" answers cause real disputes over real prizes. Rules:
- Only stable, unambiguous, verifiable facts. NO time-sensitive items (current champions, "latest", ages, anything that changes).
- Multiple-choice questions need exactly 4 options with exactly one unambiguously correct answer.
- Keep prompts short enough to read on a phone in a noisy bar.
- For each question, self-assess an ambiguity/risk score from 0 (rock-solid) to 1 (risky/ambiguous). Be honest; flag anything you're not fully sure about.
Return ONLY valid JSON.`;

async function main() {
  const { data: pack } = await sb.from("packs").select("id, name").eq("slug", packSlug).maybeSingle();
  const theme = pack?.name ?? packSlug;

  console.log(`→ generating ${count} "${theme}" questions with ${model}…`);
  const msg = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Generate ${count} multiple-choice trivia questions about "${theme}". Respond with JSON of shape:
{"questions":[{"prompt":"...","options":["a","b","c","d"],"correct_option":0,"category":"...","difficulty":1,"ambiguity_score":0.05}]}
difficulty is 1-5. correct_option is the 0-based index of the right option.`,
      },
    ],
  });

  const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join("");
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  const questions = parsed.questions ?? [];

  const rows = questions
    .filter((q: any) => Array.isArray(q.options) && q.options.length === 4 && typeof q.correct_option === "number")
    .map((q: any) => ({
      pack_id: pack?.id ?? null,
      format: "multiple_choice",
      prompt: q.prompt,
      options: q.options,
      correct_option: q.correct_option,
      category: q.category ?? theme,
      difficulty: q.difficulty ?? null,
      status: "pending_review", // the human-approve gate
      source: "ai_generated",
      ambiguity_score: q.ambiguity_score ?? null,
      generation_meta: { model, pack: packSlug, generated_at: new Date().toISOString() },
    }));

  if (!rows.length) {
    console.error("✗ Model returned no usable questions.");
    process.exit(1);
  }
  const { error } = await sb.from("questions").insert(rows);
  if (error) throw new Error(error.message);

  console.log(`✓ Inserted ${rows.length} questions at status=pending_review.`);
  console.log("  Approve them in the admin → Content review queue before they can go live.");
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
