-- The Drop — Row-Level Security (data-model §6).
--
-- Principle: deny by default. RLS is enabled on every table. Policies are added ONLY where a
-- client legitimately reads/writes its own or public rows. Tables with RLS enabled and no policy
-- are reachable only by the service_role (which bypasses RLS) via server-authoritative Route
-- Handlers — this is how `questions` (the answer key), `venue_settings`, `drops`, `venue_players`,
-- and `question_flags` stay invisible to clients.

-- Enable RLS everywhere.
alter table public.venues               enable row level security;
alter table public.venue_settings       enable row level security;
alter table public.venue_active_windows enable row level security;
alter table public.venue_members        enable row level security;
alter table public.players              enable row level security;
alter table public.venue_players        enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.packs                enable row level security;
alter table public.questions            enable row level security;
alter table public.venue_packs          enable row level security;
alter table public.drops                enable row level security;
alter table public.answers              enable row level security;
alter table public.prizes               enable row level security;
alter table public.redemptions          enable row level security;
alter table public.question_flags       enable row level security;

-- Public reads (anyone who scans a venue): branding + what you can win + theme packs.
drop policy if exists venues_public_read on public.venues;
create policy venues_public_read on public.venues for select using (true);

drop policy if exists packs_public_read on public.packs;
create policy packs_public_read on public.packs for select using (true);

drop policy if exists prizes_public_read on public.prizes;
create policy prizes_public_read on public.prizes for select using (is_active = true);

-- Players: read/update only your own profile. Inserts happen via the new-user trigger (definer).
drop policy if exists players_self_read on public.players;
create policy players_self_read on public.players for select using (auth.uid() = id);
drop policy if exists players_self_update on public.players;
create policy players_self_update on public.players for update using (auth.uid() = id) with check (auth.uid() = id);

-- Venue members: you can see your own membership rows (used by the admin UI to list your venues).
drop policy if exists members_self_read on public.venue_members;
create policy members_self_read on public.venue_members for select using (auth.uid() = user_id);

-- Answers: read only your own rows. Inserts are server-authoritative (service_role) — no client INSERT.
drop policy if exists answers_self_read on public.answers;
create policy answers_self_read on public.answers for select using (auth.uid() = player_id);

-- Redemptions: a player reads their own win codes. Staff confirmation is server-side (service_role).
drop policy if exists redemptions_self_read on public.redemptions;
create policy redemptions_self_read on public.redemptions for select using (auth.uid() = player_id);

-- Push subscriptions: a player manages their own device subscriptions directly.
drop policy if exists push_self_all on public.push_subscriptions;
create policy push_self_all on public.push_subscriptions for all
  using (auth.uid() = player_id) with check (auth.uid() = player_id);

-- ---------------------------------------------------------------------------
-- Grants. In Supabase the anon/authenticated/service_role roles already exist.
-- Service_role bypasses RLS; it gets full DML. anon/authenticated get only what RLS then gates.
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema public to anon, authenticated;

    grant select on public.venues, public.packs, public.prizes to anon, authenticated;
    grant select, update on public.players to authenticated;
    grant select on public.venue_members, public.answers, public.redemptions to authenticated;
    grant select, insert, update, delete on public.push_subscriptions to authenticated;

    -- service_role: full access (RLS-exempt). Belt-and-suspenders explicit grant.
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
  end if;
end $$;
