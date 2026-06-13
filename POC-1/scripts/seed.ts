import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const OWNER_EMAIL = "owner@thedrop.test";
const OWNER_PASSWORD = "dropdemo123";

const VENUES = [
  {
    slug: "mos-place",
    name: "Mo’s Place",
    tagline: "Playa del Rey’s neighborhood sports bar",
    timezone: "America/Los_Angeles",
    windows: { start: "12:00", end: "23:30" }, // open most of the day
    prizes: ["Free draft beer", "Free basket of fries"],
  },
  {
    slug: "three-weavers",
    name: "Three Weavers Brewing",
    tagline: "It’s more than beer, it’s community.",
    timezone: "America/Los_Angeles",
    windows: { start: "15:00", end: "22:00" }, // taproom opens at 3pm
    prizes: ["Free 4oz pour", "Free pint"],
  },
];

async function getOrCreateOwner(): Promise<string> {
  // Try to find existing.
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users.find((u) => u.email === OWNER_EMAIL);
  if (existing) return existing.id;
  const { data, error } = await sb.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("create owner failed: " + error?.message);
  return data.user.id;
}

async function upsertVenue(v: (typeof VENUES)[number], packIds: string[]): Promise<string> {
  const { data: existing } = await sb.from("venues").select("id").eq("slug", v.slug).maybeSingle();
  let venueId = existing?.id as string | undefined;

  if (!venueId) {
    const { data, error } = await sb
      .from("venues")
      .insert({ slug: v.slug, name: v.name, tagline: v.tagline, timezone: v.timezone, status: "active" })
      .select("id")
      .single();
    if (error || !data) throw new Error("insert venue failed: " + error?.message);
    venueId = data.id;
  } else {
    await sb.from("venues").update({ name: v.name, tagline: v.tagline, status: "active" }).eq("id", venueId);
  }

  await sb.from("venue_settings").upsert({ venue_id: venueId }, { onConflict: "venue_id" });

  // Active windows every day.
  await sb.from("venue_active_windows").delete().eq("venue_id", venueId);
  const windows = Array.from({ length: 7 }, (_, dow) => ({
    venue_id: venueId,
    day_of_week: dow,
    starts_at: v.windows.start,
    ends_at: v.windows.end,
  }));
  await sb.from("venue_active_windows").insert(windows);

  // Prizes.
  const { data: existingPrizes } = await sb.from("prizes").select("name").eq("venue_id", venueId);
  const have = new Set((existingPrizes ?? []).map((p) => p.name));
  const toAdd = v.prizes.filter((p) => !have.has(p)).map((name) => ({ venue_id: venueId, name }));
  if (toAdd.length) await sb.from("prizes").insert(toAdd);

  // Enable all packs.
  await sb.from("venue_packs").upsert(
    packIds.map((pack_id) => ({ venue_id: venueId, pack_id, enabled: true })),
    { onConflict: "venue_id,pack_id" }
  );

  return venueId!;
}

async function main() {
  console.log("→ seeding The Drop");
  const lib = JSON.parse(readFileSync(join(process.cwd(), "supabase", "seed", "questions.json"), "utf8"));

  // Packs.
  const packIdBySlug = new Map<string, string>();
  for (const p of lib.packs) {
    const { data: existing } = await sb.from("packs").select("id").eq("slug", p.slug).maybeSingle();
    if (existing) {
      packIdBySlug.set(p.slug, existing.id);
    } else {
      const { data } = await sb.from("packs").insert(p).select("id").single();
      packIdBySlug.set(p.slug, data!.id);
    }
  }
  console.log(`  ✓ ${packIdBySlug.size} packs`);

  // Owner + venues.
  const ownerId = await getOrCreateOwner();
  console.log(`  ✓ owner ${OWNER_EMAIL}`);
  const venueIdBySlug = new Map<string, string>();
  for (const v of VENUES) {
    const id = await upsertVenue(v, [...packIdBySlug.values()]);
    venueIdBySlug.set(v.slug, id);
    await sb.from("venue_members").upsert(
      { venue_id: id, user_id: ownerId, role: "owner" },
      { onConflict: "venue_id,user_id" }
    );
  }
  console.log(`  ✓ ${venueIdBySlug.size} venues (active, with windows + prizes + packs)`);

  // Questions — only if the library is empty (idempotent-ish).
  const { count: existingQ } = await sb.from("questions").select("id", { count: "exact", head: true });
  if ((existingQ ?? 0) > 0) {
    console.log(`  • questions already present (${existingQ}) — skipping question load`);
  } else {
    const platform = lib.questions.map((q: any) => ({
      pack_id: packIdBySlug.get(q.pack) ?? null,
      format: q.format,
      prompt: q.prompt,
      options: q.options ?? null,
      correct_option: q.correct_option ?? null,
      correct_number: q.correct_number ?? null,
      unit: q.unit ?? null,
      category: q.category ?? null,
      difficulty: q.difficulty ?? null,
      status: q.status ?? "approved",
      source: "platform_curated",
      ambiguity_score: q.ambiguity_score ?? null,
      approved_by: (q.status ?? "approved") === "approved" ? ownerId : null,
      approved_at: (q.status ?? "approved") === "approved" ? new Date().toISOString() : null,
    }));
    const venueQ = lib.venueQuestions.map((q: any) => ({
      venue_id: venueIdBySlug.get(q.venueSlug),
      format: q.format,
      prompt: q.prompt,
      options: q.options ?? null,
      correct_option: q.correct_option ?? null,
      correct_number: q.correct_number ?? null,
      unit: q.unit ?? null,
      category: q.category ?? null,
      difficulty: q.difficulty ?? null,
      status: "approved",
      source: "venue_authored",
      created_by: ownerId,
      approved_by: ownerId,
      approved_at: new Date().toISOString(),
    }));
    const { error } = await sb.from("questions").insert([...platform, ...venueQ]);
    if (error) throw new Error("insert questions failed: " + error.message);
    console.log(`  ✓ ${platform.length} platform + ${venueQ.length} venue questions`);
  }

  console.log("\n✓ Seed complete.");
  console.log(`  Play:   /v/mos-place   ·   /v/three-weavers`);
  console.log(`  Screen: /v/mos-place/screen`);
  console.log(`  Admin:  /admin  (owner@thedrop.test / dropdemo123)`);
}

main().catch((e) => {
  console.error("\n✗", e.message);
  process.exit(1);
});
