# The Drop — Data Model

*Status: Initial draft — v0.1. Date: June 12, 2026. Companion to the MVP Spec (§4–10, §13). Build reference for the Phase 1 schema.*

-----

## 0. Purpose & scope

This is the canonical data model for the **Phase 1 MVP** — the House Challenge (one shared game per venue). It covers venues and admin, progressive identity, the content library, live drops, hybrid scoring, prizes and redemption, and the integrity/dispute rails. It is written against the resolved stack (§13 of the MVP spec): **Postgres on Supabase**, with `auth.users` as the identity root, Row-Level Security for multi-tenant isolation, Realtime for the synchronized drop, and Edge Functions for server-authoritative writes.

**Out of scope (deferred — see MVP spec §4, §12):** Table Mode (per-table QR), cross-venue loyalty profiles, sponsored questions, food ordering, scheduled host mode, a separate analytics warehouse, and the live on-demand content-generation pipeline. The schema is shaped so these are additive later, not rewrites.

**SMS is deferred.** The `phone` columns and consent fields exist because they are identity, not integration — they cost nothing to model now. But no SMS-sending tables (OTP delivery log, nudge/message queue) are included, and until Twilio is wired, **Tier-2 identity persistence should run through a one-tap Apple/Google OAuth link instead of phone OTP** (MVP spec §7 already allows this). Phone capture and return nudges layer on when SMS lands.

-----

## 1. Design principles

1. **`auth.users` is the identity root.** Every human — anonymous patron, claimed patron, venue owner, staffer — is a Supabase Auth user. `players` and `venue_members` are profile/role tables keyed to `auth.users.id`. Anonymous sign-in (Tier 1) creates the user; linking phone or OAuth (Tier 2) upgrades the *same* user, so the player and all their points persist across the upgrade and across devices. The browser's refresh token *is* the "device token" from the spec.

2. **The answer key never reaches the client.** This is the load-bearing security rule. Clients do **not** read the `questions` table. A live drop's prompt and options reach phones only via a **Realtime broadcast payload assembled server-side and stripped of the correct answer**. Grading happens in an Edge Function (or `SECURITY DEFINER` RPC) that can see the key; clients learn `is_correct` only after the drop closes. RLS denies client reads of `questions`, `drops.winner_*` pre-reveal, and the answer-bearing columns.

3. **Server-authoritative writes for anything that scores or pays out.** Answer submission, winner selection, and redemption confirmation go through Edge Functions / definer functions — never raw client `INSERT`s — so the one-entry rule, the elapsed-time cap, the prize cooldown, and the daily cap are enforced where they can't be tampered with.

4. **Derive at pilot scale; cache later.** Leaderboards, "is this player on prize cooldown," and "has the daily prize cap been hit" are all **computed from base tables** (`answers`, `redemptions`) rather than denormalized. At 2–3 venues this is correct and simple; aggregate/cache tables are a documented later optimization, not an MVP need.

5. **Per-device timing, not synced clocks** (MVP spec §6, §13). Each client stamps render→submit elapsed milliseconds and submits that number. The server caps and validates it. No global question-live timestamp is trusted for scoring.

-----

## 2. Entity map

```
auth.users ──1:1── players ──< answers >── drops >── questions
     │                 │                      │           │
     │                 │                      │        packs (themes)
     └─< venue_members >┘                  venues ──< venue_active_windows
                          │                   │  └── venue_settings (1:1)
                          │                   ├──< venue_packs >── packs
                          │                   ├──< prizes
                          │                   └──< venue_players (roster)
                          │
        redemptions >── drops / prizes / players / venue_members
        question_flags >── questions / drops
```

Domains, in dependency order:

- **A. Venues & admin** — `venues`, `venue_settings`, `venue_active_windows`, `venue_members`
- **B. Identity** — `players`, `venue_players`, `push_subscriptions`
- **C. Content** — `packs`, `questions`, `venue_packs`
- **D. Live play** — `drops`, `answers`
- **E. Prizes & redemption** — `prizes`, `redemptions`
- **F. Integrity & disputes** — `question_flags`

-----

## 3. Enumerated types

```sql
create type venue_status        as enum ('setup', 'active', 'paused');
create type venue_member_role   as enum ('owner', 'manager', 'staff');
create type question_format     as enum ('multiple_choice', 'closest_guess', 'poll');
create type question_status     as enum ('draft', 'pending_review', 'approved', 'rejected', 'retired');
create type question_source     as enum ('ai_generated', 'venue_authored', 'platform_curated');
create type drop_status         as enum ('scheduled', 'live', 'revealed', 'voided');
create type redemption_status   as enum ('issued', 'redeemed', 'expired', 'voided');
create type flag_status         as enum ('open', 'resolved', 'dismissed');
```

`text`-with-`CHECK` is an alternative if we want to add values without a migration; enums are chosen here for legibility and because these sets are stable.

-----

## A. Venues & admin

### `venues`

The tenant root. One row per physical location.

```sql
create table venues (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,          -- per-venue URL: /v/{slug}
  name                 text not null,
  timezone             text not null default 'America/Los_Angeles',  -- IANA; anchors "Tonight"/"This Week"
  status               venue_status not null default 'setup',
  logo_url             text,
  theme                jsonb not null default '{}',   -- brand tokens (carry demo.html's palette forward)
  house_screen_enabled boolean not null default false,
  house_screen_token   uuid not null default gen_random_uuid(),  -- unguessable /v/{slug}/screen?t=
  created_at           timestamptz not null default now()
);
```

- **`slug`** powers the scan-to-play URL and the house-screen URL; unique and human-ish.
- **`timezone`** is load-bearing: every "Tonight" (daily reset) and "This Week" boundary is computed in venue-local time, so a 1am answer counts toward the right day.
- **`theme`** is JSONB so each venue's branded page is data-driven without schema changes; the demo's color tokens are the starting shape.
- **`house_screen_token`** lets the optional TV display load a read-only screen via an unguessable URL without a login — keeps the house screen "just a URL," never required.

### `venue_settings` (1:1 with `venues`)

All operational knobs in one place, separate from identity columns so the venue admin form maps cleanly.

```sql
create table venue_settings (
  venue_id                    uuid primary key references venues(id) on delete cascade,
  drops_per_hour              numeric not null default 4,     -- cadence (MVP open question: defaults)
  min_minutes_between_drops   int     not null default 8,     -- jitter floor so drops feel "random but managed"
  countdown_seconds           int     not null default 12,    -- 10–15s window (spec §5)
  -- scoring (hybrid model, spec §6)
  base_points                 int     not null default 100,
  max_speed_bonus             int     not null default 100,
  -- prize logic (spec §6)
  prize_drops_per_day         int     not null default 3,
  daily_prize_cap             int     not null default 5,     -- max treats given out / day
  prize_cooldown_minutes      int     not null default 60,    -- per-person points-only cooldown after a win
  redemption_ttl_minutes      int     not null default 30,    -- how long a win code stays redeemable
  -- content
  question_repeat_cooldown_days int   not null default 14,    -- don't re-serve a question to a venue within N days
  -- staff redemption (shape pending the open redemption-flow decision — see §10)
  staff_pin_hash              text,
  updated_at                  timestamptz not null default now()
);
```

- Splitting cadence, scoring, prize, and content config here keeps `venues` about identity/branding and makes the admin "settings" screen a single-row edit.
- The **defaults are placeholders** for the still-open "default cadence" product question (MVP spec §14); centralizing them means tuning is a data change, not code.

### `venue_active_windows`

When drops are allowed to fire. Multiple rows per day permitted (e.g., a slow lunch window plus an evening window).

```sql
create table venue_active_windows (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references venues(id) on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6),  -- 0=Sunday
  starts_at    time not null,
  ends_at      time not null,
  check (ends_at > starts_at)
);
create index on venue_active_windows (venue_id, day_of_week);
```

The scheduler (pg_cron → Edge Function, spec §13) reads these in venue-local time to decide whether a venue is "open for drops" right now.

### `venue_members`

Who can administer a venue, and at what level. This is the multi-tenant access spine for RLS.

```sql
create table venue_members (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       venue_member_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (venue_id, user_id)
);
create index on venue_members (user_id);
```

- **owner** claims/owns the venue; **manager** configures; **staff** confirm redemptions. A claim flow inserts the first `owner` row.
- RLS policies on all venue-scoped tables check `exists (select 1 from venue_members where venue_id = … and user_id = auth.uid())`.

-----

## B. Identity (progressive)

### `players`

Profile keyed 1:1 to the Auth user, so points persist across the anonymous→claimed upgrade and across devices. PK *is* the auth id — this makes RLS trivial (`auth.uid() = id`).

```sql
create table players (
  id                 uuid primary key references auth.users(id) on delete cascade,
  handle             text not null,                 -- auto-assigned, one-tap editable; NOT globally unique
  phone              text unique,                   -- Tier 2; nullable. SMS delivery deferred (see §0)
  phone_verified_at  timestamptz,
  marketing_opt_in   boolean not null default false,
  marketing_opt_in_at timestamptz,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now()
);
```

- **Tier 1 (anonymous):** row created on first scan with an auto `handle`; `phone` null.
- **Tier 2 (claimed):** at the emotional peak, the player links phone (later) or OAuth (now); the auth identity is linked to the *same* user, so this row is unchanged and the points carry. `phone` set + `phone_verified_at` stamped when OTP lands.
- **Consent is kept separate from delivery** (spec §7): `marketing_opt_in` gates return nudges; it is intentionally distinct from `phone` (which exists for prize delivery / persistence). A player can be claimed without consenting to marketing.
- `handle` is deliberately **not unique** — auto-handles collide and per-venue display is fine; uniqueness would force ugly disambiguation.

### `venue_players` (roster / known-at-venue)

A durable record that a player has been seen at a venue — for return-nudge targeting, "regular" detection, and pilot analytics. **Live presence** ("14 people are answering right now") is *not* stored here; it is ephemeral Realtime channel presence.

```sql
create table venue_players (
  venue_id      uuid not null references venues(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  visit_count   int not null default 1,
  primary key (venue_id, player_id)
);
```

### `push_subscriptions` (Tier 3)

Web Push (VAPID) endpoints, one per installed device. Lets a screen-less venue still buzz its regulars (spec §8).

```sql
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on push_subscriptions (player_id);
```

A player may have several (phone + tablet). The push-sender Edge Function fans out to all of a venue's present, subscribed players on a drop.

-----

## C. Content

### `packs`

Themed bundles of platform-curated questions a venue can switch on ("80s music," "movies," "a little sports").

```sql
create table packs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);
```

### `questions`

The heart of the content engine. One table holds platform-curated questions, venue-authored questions, and venue "local flavor" — distinguished by `venue_id` (null = platform-global) and `source`.

```sql
create table questions (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid references venues(id) on delete cascade,  -- null = platform-global library
  pack_id         uuid references packs(id),                     -- theme; platform questions
  format          question_format not null,
  prompt          text not null,
  options         jsonb,        -- ["...","...","...","..."] for MC/poll; null for closest_guess
  correct_option  smallint,     -- index into options (MC only)
  correct_number  numeric,      -- closest_guess only
  category        text,
  difficulty      smallint check (difficulty between 1 and 5),
  status          question_status not null default 'draft',
  source          question_source not null,
  ambiguity_score numeric,      -- model self-flagged confidence/ambiguity (spec §9, §13)
  generation_meta jsonb,        -- provenance: model id, batch id, judge verdict
  created_by      uuid references auth.users(id),  -- null for AI-generated
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),

  -- format integrity: the right answer fields must exist for the format
  constraint mc_shape   check (format <> 'multiple_choice'
                               or (options is not null and correct_option is not null and correct_number is null)),
  constraint cg_shape   check (format <> 'closest_guess'
                               or (correct_number is not null and options is null and correct_option is null)),
  constraint poll_shape check (format <> 'poll'
                               or (options is not null and correct_option is null and correct_number is null))
);
create index on questions (status, pack_id);
create index on questions (venue_id) where venue_id is not null;
```

- **The verification gate lives in `status`** (spec §9): AI generates rows at `draft`/`pending_review`; a human moves approved items to `approved`. **Only `approved` questions are ever eligible for a live drop.** Raw model output (any non-`approved` status) cannot reach a prize drop — enforced in the selection query, and reinforced by RLS hiding this table from clients entirely.
- **`options` as JSONB**, not a child table: the option set is tiny and fixed (4), and we never need to query "questions containing option X." Per-option pick-rate analytics can be computed from `answers.selected_option` without a child table.
- **CHECK constraints** make malformed questions impossible to persist — an MC question without a correct index, or a closest-guess with options, is rejected at write time.
- **`ambiguity_score` + `generation_meta`** carry the engine's self-flag and provenance so the review queue can sort the riskiest items to the top, and a bad pack/batch is traceable.
- Eligible-for-venue questions = `status = 'approved'` AND (`venue_id = :venue` OR `pack_id` in the venue's enabled packs), minus anything with an open flag or used within `question_repeat_cooldown_days` (derived from `drops`).

### `venue_packs`

Which platform themes a venue has switched on.

```sql
create table venue_packs (
  venue_id uuid not null references venues(id) on delete cascade,
  pack_id  uuid not null references packs(id) on delete cascade,
  enabled  boolean not null default true,
  primary key (venue_id, pack_id)
);
```

-----

## D. Live play

### `drops`

One row per question fired at a venue. Created `scheduled` by the scheduler, flipped to `live` at broadcast, `revealed` after the countdown, or `voided` on dispute.

```sql
create table drops (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid not null references venues(id) on delete cascade,
  question_id      uuid not null references questions(id),
  is_prize_drop    boolean not null default false,
  prize_id         uuid references prizes(id),     -- set when is_prize_drop
  status           drop_status not null default 'scheduled',
  countdown_seconds int not null,                  -- snapshot of setting at fire time
  scheduled_for    timestamptz,
  started_at       timestamptz,                    -- the broadcast moment ("the shared beat")
  closes_at        timestamptz,                    -- started_at + countdown + grace; server cutoff for answers
  revealed_at      timestamptz,
  winner_player_id uuid references players(id),    -- prize drops only; set at reveal
  created_at       timestamptz not null default now(),
  check (is_prize_drop = false or prize_id is not null)
);
create index on drops (venue_id, started_at desc);
create index on drops (status);
```

- **`countdown_seconds` is snapshotted** onto the drop (not read live from settings) so changing a venue's config never retroactively alters an in-flight or historical drop.
- **`started_at` is the only "global" timestamp**, and it is used for the *room's* shared beat and the server answer cutoff (`closes_at`) — **never for scoring**. Scoring uses per-device `elapsed_ms` (principle 5).
- The broadcast payload the Edge Function sends to `venue:{id}` is built from `drops` + `questions` **with the answer stripped**; clients render from that payload, not from a table read.
- `winner_player_id` stays null until reveal and is RLS-hidden from clients pre-reveal.

### `answers`

One row per player per drop. The `UNIQUE` constraint *is* the one-entry anti-gaming rule (spec §6).

```sql
create table answers (
  id              uuid primary key default gen_random_uuid(),
  drop_id         uuid not null references drops(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  selected_option smallint,   -- MC / poll
  answer_number   numeric,    -- closest_guess
  elapsed_ms      int not null check (elapsed_ms >= 0),  -- per-device render→submit; server-capped
  is_correct      boolean,    -- set by the grading function (null for polls)
  points_awarded  int not null default 0,
  created_at      timestamptz not null default now(),
  unique (drop_id, player_id)
);
create index on answers (drop_id);
create index on answers (player_id, created_at desc);
```

- **Writes go through a grading Edge Function / `SECURITY DEFINER` RPC**, never a raw client insert: the function caps `elapsed_ms` at `countdown_seconds*1000 (+ grace)`, rejects late/duplicate entries, reads the hidden key, sets `is_correct`, and computes `points_awarded`. Clients can read back only their own row (and only see `is_correct`/`points_awarded` after `closes_at`).
- **Scoring (hybrid, spec §6):** for a correct answer,
  `points_awarded = base_points + round(max_speed_bonus * (1 − min(elapsed_ms, window) / window))`, where `window = countdown_seconds*1000`. Wrong/none = 0, never negative. **Polls** (no correct answer) award `base_points` for participation and have no winner. **Closest-guess** grades by smallest `|answer_number − correct_number|`, ties broken by `elapsed_ms`.

-----

## E. Prizes & redemption

### `prizes`

The configurable treats a venue offers. Cadence and caps live in `venue_settings`; this defines *what* the treat is.

```sql
create table prizes (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  name        text not null,        -- "Free draft beer"
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on prizes (venue_id) where is_active;
```

### `redemptions` (prize wins)

One row per prize-drop win. This table is the source of truth for the win, the one-time staff code, and — by derivation — the per-person cooldown and the daily cap.

```sql
create table redemptions (
  id                    uuid primary key default gen_random_uuid(),
  drop_id               uuid not null unique references drops(id),  -- one win per prize drop
  venue_id              uuid not null references venues(id) on delete cascade,
  player_id             uuid not null references players(id),
  prize_id              uuid not null references prizes(id),
  code                  text not null unique,                       -- shown to staff at the counter
  status                redemption_status not null default 'issued',
  issued_at             timestamptz not null default now(),
  expires_at            timestamptz not null,
  redeemed_at           timestamptz,
  redeemed_by_member_id uuid references venue_members(id),
  created_at            timestamptz not null default now()
);
create index on redemptions (venue_id, issued_at desc);
create index on redemptions (player_id, venue_id, issued_at desc);
```

- **`drop_id unique`** guarantees a prize drop produces at most one winner record.
- **Per-person cooldown** (spec §6) is *derived*, not stored: at winner-selection time the function checks `max(issued_at)` for `(player_id, venue_id)` against `prize_cooldown_minutes`. A player still on cooldown is skipped, and the next-fastest correct answer wins — rotating the treats around the room.
- **Daily cap** is *derived*: `count(*) where venue_id = … and issued_at::date (venue tz) = today` vs `daily_prize_cap`. If the cap is hit, the drop is still played for points but issues no prize.
- **In-person redemption** (the self-limiting fraud control, spec §6): the win shows `code`; a staffer confirms it, flipping `status` to `redeemed` and stamping `redeemed_by_member_id`. The exact confirm UX (admin tap vs. staff PIN) is the open redemption-flow question — see §10; the columns support either.
- **Comp/void path** (dispute safety valve, spec §9): a `redemptions.status = 'voided'` (with the parent `drops.status = 'voided'`) cleanly comps a contested win.

-----

## F. Integrity & disputes

### `question_flags`

The dispute safety valve (spec §9): "one bad question will eventually slip through." A flag auto-pulls the question from rotation and supports voiding the round.

```sql
create table question_flags (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  drop_id     uuid references drops(id),       -- the round it surfaced in, if any
  flagged_by  uuid references auth.users(id),  -- staffer or player; null = system
  reason      text,
  status      flag_status not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);
create index on question_flags (question_id) where status = 'open';
```

- **Auto-pull:** the venue question-selection query excludes any question with an `open` flag, so a flagged item leaves rotation immediately. Resolving the flag (`resolved`/`dismissed`) returns it (or the reviewer retires the question via `questions.status = 'retired'`).

-----

## 4. Cross-cutting: how the rules are enforced

| Rule (MVP spec) | Mechanism |
|---|---|
| One entry per player per drop (§6) | `unique (drop_id, player_id)` on `answers` |
| Speed scored per device, never global clock (§6, §13) | `answers.elapsed_ms`, capped by the grading function; `drops.started_at` used only for the room beat + `closes_at` |
| Right answer never leaks (§9) | Clients never read `questions`; drop payload is server-built without the key; grading is server-side; RLS hides `questions` + pre-reveal `winner`/answer columns |
| Per-person prize cooldown (§6) | Derived from `redemptions` `max(issued_at)` per `(player, venue)` at winner selection |
| Daily prize cap (§6) | Derived count from `redemptions` per venue per local day |
| Most drops points-only; prize drops rarer (§6) | `drops.is_prize_drop` set by scheduler per `prize_drops_per_day` |
| In-person redemption (§6) | `redemptions.code` + staff confirmation status transition |
| Flagged question auto-pulls; round voidable (§9) | `question_flags` (open) excluded from selection; `drops.status='voided'`, `redemptions.status='voided'` |
| Multi-tenant isolation (§13) | RLS on every venue-scoped table via `venue_members` |
| Approved-only content reaches live drops (§9) | Selection filters `questions.status='approved'`; non-approved rows never eligible |

-----

## 5. Leaderboards (derived)

Two boards per venue (spec §6): **Tonight** (daily reset) and **This Week**. Both are aggregations of `answers.points_awarded` over `drops` scoped to a venue and time window, in the venue's timezone. At pilot scale this is a live query, not a maintained table.

```sql
-- Parameterized leaderboard (illustrative): SECURITY DEFINER function so clients
-- get ranked names + points without read access to raw answers.
-- window_start is computed in venue tz: local midnight (Tonight) or local week start (This Week).
select p.id, p.handle, sum(a.points_awarded) as points
from answers a
join drops  d on d.id = a.drop_id
join players p on p.id = a.player_id
where d.venue_id = :venue_id
  and a.created_at >= :window_start
group by p.id, p.handle
order by points desc, min(a.created_at) asc   -- ties: earlier cumulative leader ranks higher
limit 50;
```

- **Tonight = since local midnight; This Week = since local Monday 00:00**, both in `venues.timezone`. (Open nuance for §10: a bar night crossing midnight — whether "Tonight" should track the *operating session* rather than the calendar day. Calendar day in venue tz is the MVP default.)
- Exposed to clients through a `SECURITY DEFINER` function / view, so the resting screen and house screen get ranked handles + points without any client read of `answers`.
- **Later optimization (not MVP):** a `leaderboard_entries` rollup refreshed on answer write, if live aggregation ever strains. Documented so it's a known lever, not a surprise.

-----

## 6. Row-Level Security sketch

Not full policy SQL (some depends on the open redemption decision), but the intended shape:

- **`players`** — a player reads/updates only their own row: `auth.uid() = id`.
- **`venues`, `packs`** — public read of branding/theme + enabled packs (anyone who scans). No client write.
- **`drops`** — public read of the *current* live drop's non-key fields for a venue (or, cleaner, clients receive drops only via broadcast and read no rows directly). Pre-reveal `winner_player_id` hidden.
- **`questions`** — **no client access at all.** Service role / definer functions only.
- **`answers`** — a player may read only their own rows; inserts go through the grading function, not direct client writes. Leaderboards come from the definer function.
- **`redemptions`** — a player reads their own win codes; staff of the venue (`venue_members`) read/confirm their venue's codes.
- **Venue-scoped admin tables** (`venue_settings`, `venue_active_windows`, `venue_packs`, `prizes`, `venue_players`, `question_flags`) — read/write gated by `venue_members` membership for that `venue_id`, role-checked where it matters (only `owner`/`manager` edit settings; `staff` confirm redemptions).

-----

## 7. Indexing summary

Beyond PKs/uniques, the hot paths:

- `drops (venue_id, started_at desc)` — recent/active drop lookup, repeat-cooldown check.
- `answers (drop_id)` — live "N answering" count + grading.
- `answers (player_id, created_at desc)` — a player's history; leaderboard inputs.
- `redemptions (venue_id, issued_at desc)` — daily cap + venue redemption list.
- `redemptions (player_id, venue_id, issued_at desc)` — per-person cooldown check.
- `questions (status, pack_id)` and partial `questions (venue_id)` — venue eligibility selection.
- `venue_members (user_id)` — RLS membership checks.
- partial `question_flags (question_id) where status='open'` — auto-pull filter.

-----

## 8. Lifecycle walk-throughs (sanity checks)

**A patron joins and plays a points drop.** Scan `/v/{slug}` → anonymous Auth user + `players` row (auto handle) → `venue_players` upserted → client subscribes to `venue:{id}`. Scheduler fires: writes a `drops` row (`is_prize_drop=false`), broadcasts the stripped payload. Client renders, stamps render time, player taps an option, submits `elapsed_ms`. Grading function caps the time, grades against the hidden key, writes the `answers` row (unique drop+player), computes points. Reveal: `drops.status='revealed'`; leaderboard function reflects new totals.

**A prize drop produces a winner.** Same path, `is_prize_drop=true`, `prize_id` set. At reveal the winner-selection function orders correct answers by `elapsed_ms`, skips any player still inside `prize_cooldown_minutes` (from `redemptions`) and stops if `daily_prize_cap` is hit; the chosen player gets `drops.winner_player_id` + a `redemptions` row with a unique `code` and `expires_at`. Winner sees the code; a staffer confirms at the counter → `status='redeemed'`.

**The claim/upgrade.** At a win or leaderboard placement, the player links OAuth (now) / phone OTP (when SMS lands). Auth links to the *same* user; `players` row persists, `phone`/`phone_verified_at` set on OTP, optional `marketing_opt_in` captured separately. Weekly board now carries real weight because the identity survives the next visit.

**A bad question slips through.** A staffer flags it → `question_flags` (open) → question auto-excluded from future selection. The disputed round is voided (`drops.status='voided'`); if it was a prize drop, `redemptions.status='voided'` comps it gracefully. Reviewer later retires the question.

-----

## 9. What's intentionally deferred

| Deferred (spec ref) | Why it's not in this model yet |
|---|---|
| SMS sending / OTP delivery log / nudge queue | Integration deferred (§0). Phone + consent columns exist; the *delivery* tables land with Twilio. |
| Table Mode (per-table QR) | §4 deferred. Adds a `tables` entity + `drops.table_id` scoping later — additive. |
| Cross-venue loyalty profiles | §7/§12 later. `players` is already global; a loyalty layer sits on top. |
| Sponsored questions | §12. Adds sponsor/campaign fields to `questions` later. |
| Live on-demand AI generation | §9 v1.1. The current `questions.status` gate already models the review flow; live gen just adds a real-time path into it. |
| Analytics warehouse | §4 deferred. Pilot signals (did people play, did the room light up) are derivable from `answers`/`drops`/`redemptions`/`venue_players` — no separate store needed for MVP. |
| Leaderboard rollup cache | Live aggregation is correct at pilot scale; a rollup table is a documented later lever (§5). |

-----

## 10. Open data-model questions (tied to open product questions)

- **Redemption confirmation shape** (MVP spec §14 open). `redemptions` supports both an admin-tap (`redeemed_by_member_id`) and a staff-PIN (`venue_settings.staff_pin_hash`) flow; the choice between them — and whether staff need real accounts vs. a shared PIN — is unresolved. The columns don't block the build; the confirm UI does.
- **"Tonight" boundary** — calendar day in venue tz (current default) vs. an operating-session window that can cross midnight (§5 nuance).
- **Cadence defaults** — `venue_settings` defaults (`drops_per_hour`, `prize_drops_per_day`, `daily_prize_cap`) are placeholders pending the open "default cadence" decision (§14).
- **Scoring constants** — `base_points` / `max_speed_bonus` and the decay curve are first-guess; tune against the demo's feel and pilot data.

-----

*Living document — expect it to change as the schema is scaffolded and the pilots teach us what's real.*
