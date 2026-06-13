-- The Drop — Phase 1 MVP schema (Supabase / Postgres).
-- Realizes data-model-wip.md against the resolved stack (MVP spec §13):
-- Postgres on Supabase, auth.users as the identity root, RLS for multi-tenant isolation,
-- Realtime broadcast for the synchronized drop, server-authoritative writes for scoring/payout.
--
-- Tables & types only here; functions live in 0002, RLS in 0003, public views in 0004.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.venue_status      as enum ('setup', 'active', 'paused');
  create type public.venue_member_role as enum ('owner', 'manager', 'staff');
  create type public.question_format   as enum ('multiple_choice', 'closest_guess', 'poll');
  create type public.question_status   as enum ('draft', 'pending_review', 'approved', 'rejected', 'retired');
  create type public.question_source   as enum ('ai_generated', 'venue_authored', 'platform_curated');
  create type public.drop_status       as enum ('scheduled', 'live', 'revealed', 'voided');
  create type public.redemption_status as enum ('issued', 'redeemed', 'expired', 'voided');
  create type public.flag_status       as enum ('open', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- A. Venues & admin
-- ---------------------------------------------------------------------------
create table if not exists public.venues (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,
  tagline              text,
  timezone             text not null default 'America/Los_Angeles',
  status               public.venue_status not null default 'setup',
  logo_url             text,
  theme                jsonb not null default '{}'::jsonb,
  house_screen_enabled boolean not null default true,
  house_screen_token   uuid not null default gen_random_uuid(),
  created_at           timestamptz not null default now()
);

create table if not exists public.venue_settings (
  venue_id                      uuid primary key references public.venues(id) on delete cascade,
  drops_per_hour                numeric not null default 6,
  min_minutes_between_drops     int     not null default 4,
  countdown_seconds             int     not null default 12,
  base_points                   int     not null default 100,
  max_speed_bonus               int     not null default 100,
  prize_drops_per_day           int     not null default 6,
  daily_prize_cap               int     not null default 10,
  prize_cooldown_minutes        int     not null default 45,
  redemption_ttl_minutes        int     not null default 30,
  question_repeat_cooldown_days int     not null default 14,
  staff_pin_hash                text,
  updated_at                    timestamptz not null default now()
);

create table if not exists public.venue_active_windows (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at   time not null,
  ends_at     time not null,
  check (ends_at > starts_at)
);
create index if not exists idx_active_windows_venue on public.venue_active_windows (venue_id, day_of_week);

create table if not exists public.venue_members (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.venue_member_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (venue_id, user_id)
);
create index if not exists idx_venue_members_user on public.venue_members (user_id);

-- ---------------------------------------------------------------------------
-- B. Identity (progressive) — players is 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id                  uuid primary key references auth.users(id) on delete cascade,
  handle              text not null,
  phone               text unique,
  phone_verified_at   timestamptz,
  marketing_opt_in    boolean not null default false,
  marketing_opt_in_at timestamptz,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now()
);

create table if not exists public.venue_players (
  venue_id      uuid not null references public.venues(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  visit_count   int not null default 1,
  primary key (venue_id, player_id)
);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_player on public.push_subscriptions (player_id);

-- ---------------------------------------------------------------------------
-- C. Content
-- ---------------------------------------------------------------------------
create table if not exists public.packs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  emoji       text,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.questions (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid references public.venues(id) on delete cascade,  -- null = platform-global
  pack_id         uuid references public.packs(id),
  format          public.question_format not null,
  prompt          text not null,
  options         jsonb,
  correct_option  smallint,
  correct_number  numeric,
  unit            text,
  category        text,
  difficulty      smallint check (difficulty between 1 and 5),
  status          public.question_status not null default 'draft',
  source          public.question_source not null,
  ambiguity_score numeric,
  generation_meta jsonb,
  created_by      uuid references auth.users(id),
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint mc_shape   check (format <> 'multiple_choice'
                               or (options is not null and correct_option is not null and correct_number is null)),
  constraint cg_shape   check (format <> 'closest_guess'
                               or (correct_number is not null and options is null and correct_option is null)),
  constraint poll_shape check (format <> 'poll'
                               or (options is not null and correct_option is null and correct_number is null))
);
create index if not exists idx_questions_status_pack on public.questions (status, pack_id);
create index if not exists idx_questions_venue on public.questions (venue_id) where venue_id is not null;

create table if not exists public.venue_packs (
  venue_id uuid not null references public.venues(id) on delete cascade,
  pack_id  uuid not null references public.packs(id) on delete cascade,
  enabled  boolean not null default true,
  primary key (venue_id, pack_id)
);

-- ---------------------------------------------------------------------------
-- D. Live play
-- ---------------------------------------------------------------------------
create table if not exists public.drops (
  id                uuid primary key default gen_random_uuid(),
  venue_id          uuid not null references public.venues(id) on delete cascade,
  question_id       uuid not null references public.questions(id),
  is_prize_drop     boolean not null default false,
  prize_id          uuid,  -- FK added in 0001b once prizes exists
  status            public.drop_status not null default 'scheduled',
  countdown_seconds int not null,
  scheduled_for     timestamptz,
  started_at        timestamptz,
  closes_at         timestamptz,
  revealed_at       timestamptz,
  winner_player_id  uuid references public.players(id),
  created_at        timestamptz not null default now(),
  check (is_prize_drop = false or prize_id is not null)
);
create index if not exists idx_drops_venue_started on public.drops (venue_id, started_at desc);
create index if not exists idx_drops_status on public.drops (status);

create table if not exists public.answers (
  id              uuid primary key default gen_random_uuid(),
  drop_id         uuid not null references public.drops(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  selected_option smallint,
  answer_number   numeric,
  elapsed_ms      int not null check (elapsed_ms >= 0),
  is_correct      boolean,
  points_awarded  int not null default 0,
  created_at      timestamptz not null default now(),
  unique (drop_id, player_id)
);
create index if not exists idx_answers_drop on public.answers (drop_id);
create index if not exists idx_answers_player on public.answers (player_id, created_at desc);

-- ---------------------------------------------------------------------------
-- E. Prizes & redemption
-- ---------------------------------------------------------------------------
create table if not exists public.prizes (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_prizes_venue on public.prizes (venue_id) where is_active;

create table if not exists public.redemptions (
  id                    uuid primary key default gen_random_uuid(),
  drop_id               uuid not null unique references public.drops(id),
  venue_id              uuid not null references public.venues(id) on delete cascade,
  player_id             uuid not null references public.players(id),
  prize_id              uuid not null references public.prizes(id),
  code                  text not null unique,
  status                public.redemption_status not null default 'issued',
  issued_at             timestamptz not null default now(),
  expires_at            timestamptz not null,
  redeemed_at           timestamptz,
  redeemed_by_member_id uuid references public.venue_members(id),
  created_at            timestamptz not null default now()
);
create index if not exists idx_redemptions_venue on public.redemptions (venue_id, issued_at desc);
create index if not exists idx_redemptions_player on public.redemptions (player_id, venue_id, issued_at desc);

do $$ begin
  alter table public.drops add constraint drops_prize_fk foreign key (prize_id) references public.prizes(id);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- F. Integrity & disputes
-- ---------------------------------------------------------------------------
create table if not exists public.question_flags (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  drop_id     uuid references public.drops(id),
  flagged_by  uuid references auth.users(id),
  reason      text,
  status      public.flag_status not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);
create index if not exists idx_flags_open on public.question_flags (question_id) where status = 'open';
