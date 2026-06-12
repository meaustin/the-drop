# The Drop

Working title for an **always-on, location-based trivia game for physical venues** (bars, coffee shops, breweries). While people are at a venue, a question periodically “drops” to everyone present at once; players race to answer, the fastest correct answer wins a small real-world prize from the venue, and points feed leaderboards that bring people back. The name plays on the core mechanic — a question *drops*.

It is the ambient, always-on opposite of traditional scheduled/hosted bar trivia. The whole-venue MVP play mode is called the **“House Challenge.”**

## Current stage

Pre-build. The MVP is scoped, the go-to-market plan is written, and a polished offline pitch demo (Phase 0) has been built. The production app has **not** been started. The immediate real-world next step is recruiting 2–3 pilot venues (primary targets: Mo’s Place in Playa del Rey, and Three Weavers in Inglewood).

## Source-of-truth docs

These files hold the full, canonical detail. **Read the relevant one before working on product, go-to-market, or schema decisions, and keep them updated as decisions change — don’t let decisions live only in chat.**

- @mvp-spec-wip.md — product spec: concept, the hybrid game mechanics, progressive identity, notifications, the AI-plus-verification content engine, MVP scope, build phasing, and roadmap.
- @gtm-plan-wip.md — go-to-market: local-first pilot strategy, target-venue profiles, the in-person pitch + follow-up email + question guide, the pilot offer, and the launch-night playbook.
- @data-model-wip.md — the Phase 1 Postgres/Supabase data model: every table, the integrity rules (one-entry, prize cooldown, daily cap), the answer-key security model, RLS shape, and what’s deferred. Read before touching the schema or anything that scores, pays out, or persists identity.
- `demo.html` — the Phase 0 offline pitch demo (self-contained HTML, no build needed). A presenter-controlled prototype of the core drop moment used in venue pitches. Run it by opening in a browser or adding to a phone’s home screen. See the Phase 0 section in the MVP spec for what it intentionally fakes vs. what it gets right.

## Guiding principles (don’t relitigate without reason — rationale is in the spec)

- **Feel like a spontaneous group moment, not solo trivia in public.** Favor shared-awareness over anything that isolates the player.
- **Frictionless for venues to adopt.** Nothing in the MVP is a hard requirement that would make a venue hesitate (a screen is optional, not required).
- **Land and expand.** Narrow MVP to get into venues cheaply; later features are opt-in upgrades to an already-captured base.

## Conventions

- “The Drop” is a working title; revisit naming as an open question.
- When a settled decision changes (pricing, name, scope, pilot results), update the relevant spec file above and adjust its version/date line.

## Build / run

No production code yet — the stack is chosen (see §13 of the MVP spec) but not scaffolded. Planned: a TypeScript codebase — Next.js (App Router) PWA on Vercel; Supabase (Postgres + Realtime + Auth + Edge Functions + Storage) as the backend; Twilio for SMS/OTP; and the Anthropic Claude API for the content engine. Add concrete build, test, and run commands here once the app is scaffolded so they’re loaded every session.