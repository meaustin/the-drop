-- The Drop — trusted database functions.
--
-- Division of responsibility (a deliberate refinement of the data model's "Edge Functions /
-- SECURITY DEFINER RPC" guidance): the heavy server-authoritative writes — grading an answer,
-- selecting a prize winner under cooldown/cap, confirming a redemption, scheduling drops — run in
-- Next.js Route Handlers using the service_role key (one TS codebase, deploys to Vercel). The trust
-- boundary is identical: those handlers never run with a client's privileges and the answer key
-- never leaves the server.
--
-- The functions BELOW are the ones clients legitimately call *directly* with their own identity,
-- where we still must not expose raw rows: leaderboards (ranked handles + points, never raw answers)
-- and live-drop reconnect (the prompt + options, never the correct answer). Both are SECURITY
-- DEFINER and read-only.

-- ---------------------------------------------------------------------------
-- Auto-handle generation (spec §5: "receive an auto-handle")
-- ---------------------------------------------------------------------------
create or replace function public.gen_handle()
returns text
language plpgsql
as $$
declare
  adjectives text[] := array[
    'Swift','Lucky','Cosmic','Neon','Mellow','Rowdy','Sly','Brave','Witty','Turbo',
    'Velvet','Electric','Golden','Midnight','Salty','Rapid','Crimson','Jazzy','Wild','Cool'];
  nouns text[] := array[
    'Otter','Falcon','Comet','Tiger','Pixel','Maverick','Phoenix','Nomad','Bandit','Hopper',
    'Marlin','Lynx','Rover','Sparrow','Badger','Cobra','Heron','Jaguar','Raven','Walrus'];
begin
  return adjectives[1 + floor(random()*array_length(adjectives,1))::int]
       || nouns[1 + floor(random()*array_length(nouns,1))::int]
       || (10 + floor(random()*90)::int)::text;  -- e.g. SwiftOtter42
end;
$$;

-- On any new auth user (anonymous scan, OAuth, or admin), ensure a players profile exists.
-- Idempotent: an admin and a patron are both users; a stray player row for an admin is harmless.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.players (id, handle)
  values (new.id, public.gen_handle())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at touch for venue_settings
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_touch_venue_settings on public.venue_settings;
create trigger trg_touch_venue_settings
  before update on public.venue_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Leaderboards (derived; spec §6, data-model §5)
-- Scope 'tonight' = since local midnight; 'week' = since local Monday 00:00, in venue tz.
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_venue_id uuid, p_scope text default 'tonight', p_limit int default 50)
returns table (player_id uuid, handle text, points bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (
    select coalesce((select timezone from public.venues where id = p_venue_id), 'America/Los_Angeles') as zone
  ),
  bounds as (
    select case
             when p_scope = 'week' then
               date_trunc('week', (now() at time zone (select zone from tz)))
             else
               date_trunc('day',  (now() at time zone (select zone from tz)))
           end as local_start,
           (select zone from tz) as zone
  ),
  window_start as (
    -- convert the venue-local start back to an absolute instant
    select (local_start at time zone zone) as ws from bounds
  )
  select p.id as player_id,
         p.handle,
         sum(a.points_awarded)::bigint as points,
         rank() over (order by sum(a.points_awarded) desc, min(a.created_at) asc) as rank
  from public.answers a
  join public.drops d  on d.id = a.drop_id
  join public.players p on p.id = a.player_id
  where d.venue_id = p_venue_id
    and d.status <> 'voided'
    and a.created_at >= (select ws from window_start)
  group by p.id, p.handle
  order by points desc, min(a.created_at) asc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Live-drop reconnect: the current live drop for a venue, answer stripped.
-- Lets a client that joins mid-countdown (or reconnects) render the drop without
-- ever reading public.questions. Returns null when nothing is live.
-- ---------------------------------------------------------------------------
create or replace function public.get_live_drop(p_venue_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when d.id is null then null else jsonb_build_object(
    'dropId', d.id,
    'venueId', d.venue_id,
    'format', q.format,
    'prompt', q.prompt,
    'options', q.options,            -- never includes correct_option / correct_number
    'unit', q.unit,
    'category', q.category,
    'isPrizeDrop', d.is_prize_drop,
    'prize', case when d.is_prize_drop then (
        select jsonb_build_object('name', pr.name, 'description', pr.description)
        from public.prizes pr where pr.id = d.prize_id) else null end,
    'countdownSeconds', d.countdown_seconds,
    'startedAt', d.started_at,
    'closesAt', d.closes_at
  ) end
  from public.drops d
  join public.questions q on q.id = d.question_id
  where d.venue_id = p_venue_id
    and d.status = 'live'
    and d.closes_at > now()
  order by d.started_at desc
  limit 1;
$$;

revoke all on function public.get_leaderboard(uuid, text, int) from public;
revoke all on function public.get_live_drop(uuid) from public;
grant execute on function public.get_leaderboard(uuid, text, int) to anon, authenticated;
grant execute on function public.get_live_drop(uuid) to anon, authenticated;
