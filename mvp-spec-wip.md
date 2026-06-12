# The Drop — Initial Product Spec

*Working title (see Open Questions). Status: Initial draft — v0.4. Date: June 12, 2026.*

-----

## 1. Concept

An always-on, location-based game layer for physical venues (bars, coffee shops). Unlike traditional bar trivia — which is a *scheduled, hosted event* — this is ambient: a low-key game humming in the background that any patron can drop into the moment they sit down. At random-but-managed times, a question “drops” to everyone currently at the venue. Players race to answer; the fastest correct answer wins a small real-world prize (a free treat) from the venue, and everyone who answers correctly earns points toward leaderboards.

**In one line:** a presence-aware game layer that turns *being at a place* into something a little social and a little rewarding.

The trivia-night format becomes one *mode* of this later — not the starting point.

-----

## 2. Design North Star

Every design decision should ladder up to one feeling:

> **It should feel like a spontaneous group moment, not like playing a trivia game alone in public.**

The test for any feature is: *does this increase shared awareness, or does it isolate the player?* The magic is the shared beat — the same countdown ticking on a dozen phones, the room glancing up together, a visible “14 people are answering right now.”

A second, equally important principle governs the business side:

> **Be as frictionless as possible to adopt.** Nothing in the MVP should be a hard requirement that makes a venue hesitate to sign on.

-----

## 3. Target Users

- **Patrons** — people already at a venue who want a light, social, rewarding reason to engage and stay a bit longer.
- **Venues** — bars and coffee shops that want more dwell time, repeat visits, and a marketing/loyalty channel, with minimal setup and staff effort.

-----

## 4. MVP Scope — “The House Challenge”

The MVP is a single shared game per venue: everyone present is in one communal pool, competing on the same drops and leaderboards.

### In scope

**Patron experience**

- Scan a per-venue QR → branded venue page → auto-assigned handle → playing within seconds, **no signup**.
- A device token remembers the player through the session.
- An ambient “resting” screen (leaderboards + venue info + anticipation of the next drop).
- The drop: a four-option multiple-choice question, a 10–15 second countdown, and a live count of how many people are answering.
- Speed-scored results, a reveal, and a named winner.
- Lazy identity capture (phone, one-time code) prompted at the emotional peak — a win or a leaderboard placement.
- Prize redemption via a one-time code shown to staff.
- Two leaderboards: **Tonight** and **This Week**.

**Venue admin**

- Claim a venue and generate its QR.
- Set active windows and drop frequency.
- Configure prize drops: what the treat is, how often, and a daily cap.
- Choose content themes/packs and optionally add custom questions.
- A dead-simple way for staff to confirm a winner’s redemption code.
- Optional “house screen” URL (see Section 8).

**Platform**

- A content engine that serves questions reliably (Section 9).

### Deliberately out of scope (deferred — see Roadmap)

Table Mode · food ordering & delivery · solo/passive play between drops · sponsored questions · cross-venue loyalty profiles · scheduled trivia-night host mode · native apps · rich analytics · on-demand bespoke AI question generation · phone-to-TV pairing.

-----

## 5. Core Experience — Patron Journey

The experience is five distinct moments:

**1. Getting in.** Scan the QR on the table or wall → land on a branded page (“Welcome to [Bar]”) → receive an auto-handle (tweakable with one tap) → start playing. No signup, no gate. The cold path from sitting down to playing should be under ten seconds.

**2. The ambient state.** Most of the time no question is live, and this screen *cannot feel dead*. At rest it shows the live leaderboards (so there’s always something to climb), the anticipation of an incoming drop, and a subtle strip of venue content (today’s deal, the menu). If this screen feels empty, people close the tab and don’t return.

**3. The drop.** The phone buzzes and the screen takes over; if a house screen is present, the room lights up together. A four-option multiple-choice question appears with a tight countdown (10–15 seconds). While it’s live, a social signal builds — “9 people locked in.” Multiple choice is required: typing is too slow and too ambiguous to grade fairly in real time.

**4. The result.** Scored via the hybrid mechanic (Section 6). Everyone correct earns points; on prize drops, the single fastest correct answer wins the treat.

**5. The reveal & aftermath.** Show the correct answer, the winner’s name (in lights on the house screen, if present), and how fast they were. The winner gets a one-time redemption code. The leaderboard updates live, and the resting state quietly reasserts the hook: you’re three points off second place, and another drop is coming.

-----

## 6. Game Mechanics

### Scoring (hybrid model)

- A correct answer earns a **base amount** (e.g., 100 points) **plus a speed bonus that decays** across the countdown. The fastest correct answer gets the full bonus; someone answering correctly at the buzzer still banks the base.
- A wrong answer or no answer earns **zero — never negative.** Being right always pays; speed only sweetens it.
- **Speed is measured per device, from the moment the question renders on that player’s screen** — not from a global “question went live” timestamp. This neutralizes differences in phone speed and network latency so no one feels cheated.

**Why hybrid:** pure “first correct wins” is dramatic but brutal — almost everyone loses every round, which demoralizes the room. Speed-scoring keeps everyone in the game and building toward the leaderboard, while the prize still produces a single headline winner.

### Prize logic

- On a **prize drop**, the fastest correct answer wins the treat.
- A **per-person cooldown** prevents one sharp regular from sweeping every prize in a night — after winning a treat, a player is points-only for a while. This rotates the free stuff around the room and keeps newcomers hooked.
- **Most drops are points-only.** Prize drops are rarer and more special, which protects both the feel and the venue’s costs.

### Content mix

Blend in **non-knowledge drops** — closest-guess number questions, quick polls, venue-specific questions — so the leaderboard doesn’t simply become the three smartest regulars every night. This keeps the boards feeling winnable for everyone.

### Leaderboards

- **Tonight** (daily reset) — drives “stay for one more.”
- **This Week** — drives “come back Thursday.”
  Daily resets keep the board winnable for first-timers; the weekly board is the longer chase.

### Anti-gaming

One entry per person/device per drop · per-person prize cooldown · in-person redemption (self-limits fraud since prizes are claimed at the counter) · venue-set budget and frequency caps.

-----

## 7. Identity & On-Ramp (Progressive)

Identity is captured in tiers, each unlocked only when the player has a fresh reason to commit. Nothing is required up front.

**Tier 1 — Anonymous (default).** Scan → auto-handle → play, no signup. A device token accumulates points through the session.

**Tier 2 — Claimed.** Triggered at the emotional peak (a win or a leaderboard placement): a single lightweight step — **a phone number plus a one-time code (magic-link style, no password).** Phone earns its place three ways:

1. Delivers the prize.
1. Persists the player across visits, so the weekly board carries real weight.
1. With explicit opt-in, enables return nudges (“you’re still 2nd this week — come defend it”).

*Privacy:* keep prize/leaderboard use separate from any marketing consent, clearly. A one-tap Apple/Google login can be offered as an alternative, but phone stays primary because of the return loop.

**Tier 3 — Installed.** Adding the web app to the home screen unlocks push notifications (Section 8). Offered at the right moment, never required to play.

*Later:* a full “regulars” profile, cross-venue identity, and loyalty.

-----

## 8. Notifications & The House Screen

Reliable “buzz in your pocket” notifications are the weak spot of a no-install web app. The plan uses **three channels doing three different jobs**, which together cover venues with and without a screen:

|Channel         |Job                     |Notes                                                 |
|----------------|------------------------|------------------------------------------------------|
|**House screen**|Live, in-room alert     |Optional per venue; no install needed                 |
|**PWA push**    |Live, in-pocket alert   |For engaged players who installed the web app         |
|**SMS**         |Return / retention nudge|*Not* for live drops — too slow for a 15-second window|

### The house screen

A “house screen” is simply a URL the venue displays on any TV or monitor it already has — no phone-to-TV pairing, no special hardware.

- **At rest:** the live leaderboard, plus upcoming events / menu (a genuine selling point for the venue).
- **On a drop:** it goes big — *question incoming*, the question, the countdown, the winner’s name.
- It becomes the thing that grabs the whole room at once, creating the communal “everyone’s heads drop” moment — and it doubles as a notification, since the room itself becomes the alert.

**Important:** the house screen is *in the MVP but never required.* Many venues already have a screen showing something, but we must not make one a condition of signing on. The phone side has to carry the live alert on its own for screen-less venues.

### PWA push (the iOS consideration)

- On **iOS**, web push works **only** once the web app is added to the Home Screen — there is no push for a plain Safari tab. So the home-screen install is the only door to pocket notifications on iPhone. **Android** is more permissive (push can work in-browser with permission).
- **Build effort:** moderate and well-trodden — a web manifest, a service worker, a push-subscription flow, and a small backend to store subscriptions and send pushes. The real cost is UX friction: iOS won’t show an install prompt automatically, so we have to walk the user through Share → Add to Home Screen, and some won’t bother.
- **Decision:** include PWA push in the MVP, but as the **opt-in top tier — never a gate to play.** Asked at the right moment (“add [Bar] to your home screen so we can buzz you the second a drop hits”), it layers cleanly onto the progressive identity model. This is what lets a screen-less venue still reach its regulars live.

-----

## 9. Content Engine

**The core risk:** AI-generated trivia will confidently produce wrong answers, and a wrong “correct” answer in a game with real prizes is poison — it causes disputes, embarrassment, and erodes the trust the whole experience depends on. **Raw model output must never go straight to a live prize drop.** Everything passes a verification gate.

### Structure

- **Default platform library.** AI *generates* a large pool cheaply; a human-checked pass approves what enters the live library. The generator is biased toward stable, unambiguous facts and away from time-sensitive ones that go stale. (Here, AI is primarily *our* tool for building a big vetted library upfront.)
- **Theme selection.** The venue picks which vetted packs/categories are active — “80s music, movies, a little sports” — drawn from the pre-approved library. Low risk, good UX.
- **Venue-authored.** Venues may add their own questions, understanding they own the accuracy of those (or we run a light sanity check).
- **Local flavor (its own category).** Questions about the neighborhood or the venue itself are a real differentiator a generic trivia app can’t match. Because the AI doesn’t *know* facts like when the bar opened, these are venue-supplied facts with AI helping phrase them — not AI-invented.

### Question metadata

Each question carries category, difficulty, and format (multiple choice / closest-guess / poll) so the system can mix in non-knowledge drops and calibrate difficulty.

### Dispute safety-valve

One bad question will eventually slip through. Any flagged question **auto-pulls from rotation**, and the venue can **void the round or comp the prize gracefully.**

### Deferred to v1.1

Live, on-demand “type a theme and generate bespoke questions for my venue right now” — it requires the verification pipeline running in real time, which is more to build and riskier. The MVP still gets the AI selling point without betting the launch on unvetted live output.

-----

## 10. Strategic Note — Land and Expand

The expensive, hard-won part of this business is getting into venues and building a base of patrons who have played. Once that’s done frictionlessly, **every later feature is an upsell to an audience already captured, at almost no new acquisition cost.** “Get in cheap, expand later” isn’t just the safer path — it’s where the leverage lives. This is why the MVP is deliberately narrow and the roadmap is a sequence of opt-in venue upgrades.

-----

## 11. Build Phasing

Three phases, built in order. Each one de-risks the next.

### Phase 0 — The Demo (build this first)

A self-contained, presenter-controlled prototype you run on your own phone during a pitch, so an owner *feels* the core moment in under a minute. It is the single most important thing to build before talking to venues, and it comes **before** any of the real MVP — it lets you win pilots and validate the feeling without building a backend.

**What it does:** on a tap (you trigger it on cue, not randomly), a question drops with the full takeover and countdown; you answer; it reveals the win — the correct answer, a faked live leaderboard, the “you won a free [treat]” moment, and the redemption-code screen. Thirty to sixty seconds end to end, and instantly re-runnable.

**What it fakes (so it stays cheap):**

- Single device, single player. The “14 people are answering” counter and the leaderboard names are canned, not real.
- No backend, no accounts, no content pipeline — a handful of hardcoded sample questions.
- No QR onboarding, no venue admin, no real prize logic.
- Presenter-triggered timing, so you can fire a drop exactly when you want it in the conversation.

**What it must get right** (the *feeling* is the entire pitch):

- The drop, countdown, and reveal should look and feel like the real thing — this is the part that sells. Polish here isn’t wasted: the visual and interaction design carries straight into the real drop UI later.
- It must run **offline / self-contained** on your phone. Bar Wi-Fi is unreliable; never let a dead connection kill a demo.
- Include a couple of question types — a normal trivia drop and a “closest guess” or poll — to show the variety.
- Optional: a second “house screen” view you can throw on a laptop to convey the room-wide moment.

**Why it comes first:** it’s cheap, it’s the best possible sales asset, and it tests whether the core moment lands *before* you commit to the full build. A clickable demo beats a finished app for learning.

### Phase 1 — The MVP

The real House Challenge product defined in Sections 4–10: live multiplayer drops, the content engine, progressive identity, the venue admin, leaderboards, and notifications — built for the first 2–3 pilot venues.

### Phase 2 and beyond

The opt-in venue upgrades in the Post-MVP Roadmap below.

-----

## 12. Post-MVP Roadmap (Indicative)

Roughly in order of how cleanly each builds on what came before:

1. **Solo / passive play** between drops — keeps the app alive in quiet rooms.
1. **PWA push refinements** and broader notification coverage.
1. **Sponsored questions** — a brewery pays to drop a branded question + reward. A genuine, aligned revenue stream.
1. **Table Mode** (requires per-table QR) — private games for the people at your table; also enables table-level prize delivery.
1. **Loyalty / regulars program** — the leaderboard evolves into cross-visit, cross-venue loyalty.
1. **Bespoke on-demand AI question generation** per venue.
1. **Food & drink ordering / delivery** — rides on per-table identity + payments + POS integration (heavy; several tiers out).
1. **Scheduled trivia-night host mode** — replaces a paid human host; turns the platform into an event tool.
1. **Phone-to-TV pairing** and richer house-screen interactivity.

-----

## 13. Tech Stack

*Resolved June 12, 2026. Optimizes for solo-founder velocity, low ops burden, and low cost at pilot scale (2–3 venues): one language end-to-end, managed services over self-hosted infrastructure, and nothing here that forces a heavier build than the narrow MVP needs.*

### Decision at a glance

|Layer                       |Choice                                                                   |Why                                                                                                  |
|----------------------------|-------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
|**Language**                |TypeScript everywhere                                                     |One language client-to-server; carries the demo’s web work forward; largest hiring/AI-assist pool.    |
|**Client**                  |Next.js (App Router) PWA, React                                          |Scan-to-play with no install; add-to-home-screen unlocks iOS push; the house screen and admin are just more routes.|
|**Hosting**                 |Vercel                                                                   |Zero-config Next.js deploys, edge CDN, cron; free/low tier covers pilots.                             |
|**Backend platform**        |Supabase — Postgres + Realtime + Auth + Edge Functions + Storage         |Batteries-included BaaS: the synchronized-drop transport, the database, identity, and serverless logic in one managed product.|
|**Realtime / “shared beat”**|Supabase Realtime (Broadcast + Postgres changes)                         |Fan a drop out to every device in a venue channel near-simultaneously without running a socket fleet. |
|**Identity**                |Supabase Auth — anonymous → phone OTP                                     |Anonymous session for Tier 1; phone + one-time code (no password) for Tier 2, matching progressive identity (§7).|
|**Push**                    |Web Push (VAPID) via service worker                                       |The opt-in in-pocket alert; subscriptions stored in Postgres, sent from a serverless function.        |
|**SMS**                     |Twilio                                                                    |Powers both phone-OTP delivery and Tier-2 return nudges.                                              |
|**Content engine**          |Anthropic Claude API (`claude-opus-4-8`), Batch API, structured outputs   |Bulk-generate a vetted question library offline and cheaply; human review gate before anything goes live.|

### The critical piece — synchronized drops

The magic is the shared beat (§2), so the realtime transport is the load-bearing choice. A scheduler (a Postgres `pg_cron` job → a Supabase Edge Function) selects the next question for each venue inside its active window and frequency, writes a `drop` row, and **broadcasts it to the `venue:{id}` channel** — every present client and the house screen receive it together.

Per §6, **speed is scored per device from the moment the question renders**, so we do *not* need synchronized clocks: each client stamps render time and answer time and submits the elapsed milliseconds; an edge function validates it (caps the elapsed, rejects duplicates, enforces the one-entry rule and the per-person prize cooldown) and writes the score. Postgres row-level security isolates each venue’s data for the multi-tenant admin.

### The content engine

Generation is asynchronous and not latency-sensitive, so it runs through the **Batch API** (50% cost) against `claude-opus-4-8`, biased toward stable, unambiguous facts. **Structured outputs** return each question as clean JSON (prompt, four options, correct index, category, difficulty, format, plus a self-flagged confidence/ambiguity score). An optional second LLM-as-judge pass pre-filters obviously weak or time-sensitive items; **a human approves what enters the live library** (§9) — raw output never reaches a live prize drop. Live on-demand generation stays deferred to v1.1.

### Watch items / escape hatches

- **Realtime fan-out limits.** Supabase Realtime’s per-project connection and message ceilings are comfortable at pilot scale but are the first thing to monitor as venues grow. Keep the realtime layer behind a thin client interface so a swap to a dedicated provider (Ably, Pusher) is a contained change, not a rewrite.
- **iOS web push friction** (already noted in §8) — home-screen install is the only door to pocket notifications on iPhone; the in-app live UI and the house screen must carry the live moment for everyone who doesn’t install.
- **SMS cost** — Twilio is per-message; the venue-set frequency/budget caps and the points-only cooldown keep both SMS and prize spend bounded.

### Deliberately not in the stack yet

Native apps · a dedicated realtime cluster · phone-to-TV pairing · a real-time content-generation pipeline · separate analytics infrastructure. Each is a later opt-in upgrade (§§11–12), not an MVP requirement.

### Schema

The concrete Phase 1 data model that realizes this stack — every table, the integrity rules, the answer-key security model, and the RLS shape — lives in `data-model-wip.md`.

-----

## 14. Open Questions / Next Steps

These are intentionally unresolved at this stage:

- **Go-to-market wedge** — how we land the first venues; which type of venue to start with; the pitch.
- **Pricing / business model** — venue subscription, per-location fees, prize-cost handling, and where sponsored questions fit later.
- **Naming & branding** — “The Drop” is the current working title (it plays on the core mechanic — a question *drops*).
- **Default cadence** — concrete defaults for drops-per-hour and prize-drop frequency.
- **Redemption flow detail** — exactly how staff confirm a winner (tap-to-confirm in admin, a PIN, etc.).

-----

*This is a living document — expect it to change as decisions firm up.*