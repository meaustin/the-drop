# The Drop — Phase 1 MVP (POC-1)

The real **House Challenge**: an always-on, location-based trivia game for physical venues. A
question *drops* to everyone present at once, the fastest correct answer wins a real treat from the
venue, and leaderboards bring people back. Built on the resolved stack from the spec — **Supabase +
Next.js**, deployable to **Vercel**.

This is a working application, not a clickable demo. It implements live multiplayer drops, the
hybrid scoring model, prize logic with cooldowns and redemption codes, progressive identity, the
venue admin, both leaderboards, the optional house screen, the AI-plus-human content engine, and
Web Push — the full scope of MVP spec §§4–10.

---

## What you need to provide

| # | Service | Required? | What it powers | What to copy |
|---|---------|-----------|----------------|--------------|
| 1 | **Supabase project** | ✅ Required | Postgres, Auth (anon → phone/OAuth), Realtime, the whole backend | Project URL, anon key, service_role key, project ref + DB password |
| 2 | **Anthropic API key** | ⬜ Optional | *Generating* the question library (a seeded library ships, so the game runs without it) | `ANTHROPIC_API_KEY` |
| 3 | **Twilio** *or* **Google/Apple OAuth** | ⬜ Optional | Tier-2 claim (phone OTP via Twilio, or OAuth). SMS return-nudges need Twilio | Twilio SID/token/messaging SID, or OAuth client id/secret |
| 4 | **Web Push (VAPID)** | ⬜ Optional | In-pocket "buzz" for installed users | Generated for you: `npm run gen:vapid` |
| 5 | **Vercel** | ⬜ Optional for dev | Hosting on the open internet (HTTPS for real phones, the cron scheduler) | Connect the repo; add the same env vars |

> The game is fully playable with only **#1** (plus the seeded library, which is already in the repo).
> Everything else is a progressive upgrade, exactly as the spec frames it.

---

## Setup (≈10 minutes)

### 1. Create the Supabase project
- New project at [supabase.com](https://supabase.com) (free tier is fine for pilots).
- **Authentication → Providers → Anonymous**: enable anonymous sign-ins (this is Tier-1 scan-to-play).
- *(Optional)* Configure **Phone** (Twilio) and/or **Google/Apple** providers for the Tier-2 claim.

### 2. Configure env
```bash
cd POC-1
cp .env.example .env.local
```
Fill in from **Supabase → Project Settings → API** and **→ Database**:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`
- Set a random `CRON_SECRET`.

### 3. Install + push the schema
```bash
npm install
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"   # paste DB password when asked
npm run db:push                                            # applies supabase/migrations
```

### 4. Seed the pilot venues + vetted question library
```bash
npm run db:seed
```
Creates **Mo's Place** and **Three Weavers** (active, with windows, prizes, packs), a vetted starter
question library, and an owner login: `owner@thedrop.test` / `dropdemo123`.

### 5. Run
```bash
npm run dev
```
- Patron / scan-to-play: **/v/mos-place**
- House screen (put on a TV): **/v/mos-place/screen**
- Venue admin: **/admin**

From the admin, use **Fire a points drop / Fire a prize drop** to trigger the live moment on cue
(great for a pitch or the launch-night seed drop). In production the **Vercel cron** (`vercel.json`,
every minute) fires drops automatically inside each venue's active windows.

### Optional extras
```bash
npm run gen:vapid                      # → paste VAPID keys into .env.local for Web Push
npm run gen:questions -- music-80s 15  # → AI-generate questions (needs ANTHROPIC_API_KEY);
                                       #   they land as pending_review for human approval
```

---

## Verify without a live project
Even with no Supabase keys you can validate the important parts:
```bash
npm run test            # pure game logic (hybrid scoring + active-window math)
npm run db:verify-local # applies the real migrations to a local Postgres (stubs Supabase) and
                        # asserts the answer key is service-role-only
npm run build           # full typecheck + production build
```

---

## How it maps to the spec

| Spec | Implementation |
|---|---|
| Synchronized drop / "shared beat" (§2, §13) | Server fans a stripped payload to `venue:{id}` via Supabase Realtime broadcast (`src/lib/realtime/`) |
| Per-device speed scoring, no synced clocks (§6) | Client stamps render→submit `elapsed_ms`; server caps + grades (`src/lib/scoring.ts`, `/api/play/answer`) |
| Hybrid scoring — right always pays, speed sweetens (§6) | `computePoints()` — base + decaying bonus, never negative |
| Prize logic: cooldown, daily cap, one winner (§6) | `revealDrop()` winner selection (`src/lib/engine.ts`) |
| Answer key never reaches the client (§9) | `questions` is RLS service-role-only; drop payload + leaderboards are answer-stripped definer reads |
| Progressive identity: anon → phone/OAuth (§7) | Supabase Auth anonymous → `updateUser({phone})` / `linkIdentity`; consent kept separate |
| House screen, never required (§8) | `/v/[slug]/screen` — just a URL, optional token gate |
| PWA push (§8) | `public/sw.js` + `src/lib/push.ts` + VAPID |
| AI generates, human approves (§9) | `gen:questions` → `pending_review` → admin review queue → `approved` |
| Dispute safety valve (§9) | `question_flags` auto-pulls from rotation; round/redemption voidable |

### Two deliberate refinements (the spec says: improve where you can)
1. **Server-authoritative logic runs as Next.js Route Handlers (service_role), not Supabase Edge
   Functions.** Same trust boundary (the key never leaves the server), but one TypeScript codebase
   that deploys to Vercel with zero Deno/Edge-Function plumbing. The transport and data layers sit
   behind thin interfaces (`src/lib/realtime/`, `src/lib/supabase/`), so swapping either is contained
   — exactly the escape hatch the spec asks for.
2. **RLS is enforced in Postgres for client reads; privileged writes go through service_role
   handlers** rather than `SECURITY DEFINER` RPCs for everything. Definer functions are still used
   where a client must call directly without seeing raw rows (leaderboards, live-drop reconnect).

---

## Project layout
```
supabase/migrations/   real schema, functions, RLS (push with `supabase db push`)
supabase/seed/         vetted question library (JSON)
src/app/               routes: /, /v/[slug], /v/[slug]/screen, /admin, /api/*
src/components/play/   the patron experience (drop, reveal, resting, claim)
src/components/screen/ the house screen
src/components/admin/  the venue admin
src/lib/               engine, scoring, realtime, supabase clients, windows
scripts/               seed, generate-questions, verify-local, test-logic, gen-vapid
```
