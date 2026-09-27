-- Campus Connect: Rallies, organization accounts, informational paid events,
-- and a private log for the temporary demo admin override.
-- Run after 20260927010000_event_status_and_chat.sql. Additive and safe to run
-- again: it never drops, renames, or loosens anything. Existing events become
-- event_type 'event' and existing profiles stay non-organization.
--
-- events.status keeps its meaning (active / abandoned / ended). A Rally's own
-- lifecycle lives in rally_status (forming / active / expired), so a Rally that
-- expires is still an 'active', uncancelled row, kept for history.
--
-- events gains:
--   event_type               'event' | 'rally'
--   rally_status             forming -> active when enough people join, or
--                            forming -> expired when the window closes first
--   rally_min_participants   2 to 20
--   rally_expires_at         2 to 15 minutes after the Rally is posted
--   rally_anonymous          hides the creator from other users in the app;
--                            created_by still holds the real owner
--   rally_participant_count  kept by the database from rally_participants
--   rally_activated_at       when it reached its minimum
--   organization_event       set by the database from the poster's profile
--   is_paid, price_display   informational only; no payment is taken
-- profiles gains: is_org, org_verified_at (only the server can set them)
-- New tables: rally_participants, admin_event_actions

begin;

-- 1. Check the live tables before touching them.
do $$
declare
  similar_columns text;
begin
  if to_regclass('public.events') is null or to_regclass('public.profiles') is null then
    raise exception 'public.events and public.profiles must exist. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'events_status_check' and conrelid = 'public.events'::regclass) then
    raise exception 'Run 20260927010000_event_status_and_chat.sql first (events.status is missing). Nothing was changed.';
  end if;

  select string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name) into similar_columns
    from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'events' and column_name in (
            'type', 'kind', 'event_kind', 'is_rally', 'rally', 'min_participants', 'max_participants',
            'expires_at', 'is_anonymous', 'anonymous', 'is_org_event', 'org_event', 'organization_id',
            'price', 'cost', 'ticket_price', 'is_free', 'paid'))
       or (table_name = 'profiles' and column_name in (
            'role', 'account_type', 'is_organization', 'organization', 'org', 'is_verified', 'verified')));
  if similar_columns is not null then
    raise exception 'Found existing columns that may already mean the same thing: %. Nothing was changed; map them first.',
      similar_columns;
  end if;
end $$;

-- 2. Columns.
alter table public.events
  add column if not exists event_type text not null default 'event',
  add column if not exists rally_status text,
  add column if not exists rally_min_participants integer,
  add column if not exists rally_expires_at timestamptz,
  add column if not exists rally_anonymous boolean not null default false,
  add column if not exists rally_participant_count integer not null default 0,
  add column if not exists rally_activated_at timestamptz,
  add column if not exists organization_event boolean not null default false,
  add column if not exists is_paid boolean not null default false,
  add column if not exists price_display text;

alter table public.profiles
  add column if not exists is_org boolean not null default false,
  add column if not exists org_verified_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_event_type_check' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_event_type_check check (event_type in ('event', 'rally'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_rally_status_check' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_rally_status_check
      check (rally_status is null or rally_status in ('forming', 'active', 'expired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_rally_fields' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_rally_fields check (
      (event_type = 'rally' and rally_status is not null and rally_min_participants is not null and rally_expires_at is not null)
      or (event_type = 'event' and rally_status is null and rally_min_participants is null and rally_expires_at is null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_rally_min_range' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_rally_min_range
      check (rally_min_participants is null or rally_min_participants between 2 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_price_display' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_price_display check (
      (is_paid and price_display is not null and char_length(price_display) between 1 and 24)
      or (not is_paid and price_display is null)
    );
  end if;
end $$;

create index if not exists events_rally_forming_idx on public.events (rally_expires_at) where rally_status = 'forming';

-- 3. Rally participants. One row per person per Rally (the primary key).
create table if not exists public.rally_participants (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists rally_participants_user_idx on public.rally_participants (user_id);

-- 4. Private log of demo admin actions. No client role can read or write it.
create table if not exists public.admin_event_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  event_id text not null,
  action text not null check (action in ('delete', 'cancel')),
  created_at timestamptz not null default now()
);
alter table public.admin_event_actions enable row level security;
revoke all on public.admin_event_actions from anon, authenticated;

-- 5. Helpers.
create or replace function public.is_client_request()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', '') in ('authenticated', 'anon');
$$;

-- Set only inside the database's own Rally functions below.
create or replace function public.is_rally_internal()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('campus.rally_internal', true), '') = 'on';
$$;

create or replace function public.rally_joinable(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
     where e.id = target
       and e.event_type = 'rally'
       and e.status = 'active'
       and ((e.rally_status = 'forming' and e.rally_expires_at > now())
         or (e.rally_status = 'active' and (e.end_time is null or e.end_time > now())))
  );
$$;
revoke all on function public.rally_joinable(uuid) from public;
grant execute on function public.rally_joinable(uuid) to authenticated;

-- 6. New events: the database decides the Rally state, the owner's
--    organization flag, and the anonymous host name. Client values are ignored.
create or replace function public.events_prepare_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_client_request() then
    return new;
  end if;

  new.organization_event := coalesce((select p.is_org from public.profiles p where p.id = auth.uid()), false);
  if not new.organization_event or not new.is_paid then
    new.is_paid := false;
    new.price_display := null;
  end if;

  if new.event_type = 'rally' then
    if new.rally_min_participants is null or new.rally_min_participants not between 2 and 20 then
      raise exception 'A Rally needs between 2 and 20 people.' using errcode = '22023';
    end if;
    if new.rally_expires_at is null
       or new.rally_expires_at < now() + interval '110 seconds'
       or new.rally_expires_at > now() + interval '15 minutes 10 seconds' then
      raise exception 'A Rally window is 2 to 15 minutes.' using errcode = '22023';
    end if;
    new.rally_status := 'forming';
    new.rally_participant_count := 0;
    new.rally_activated_at := null;
    new.start_time := now();
    new.end_time := new.rally_expires_at;
    new.is_paid := false;
    new.price_display := null;
    if new.rally_anonymous then
      new.host_name := 'Anonymous student';
    end if;
  else
    new.event_type := 'event';
    new.rally_status := null;
    new.rally_min_participants := null;
    new.rally_expires_at := null;
    new.rally_anonymous := false;
    new.rally_participant_count := 0;
    new.rally_activated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists events_prepare_insert on public.events;
create trigger events_prepare_insert
  before insert on public.events
  for each row execute function public.events_prepare_insert();

-- Signed-in clients can't change Rally state, counts, times of a Rally, or the
-- organization / paid flags after posting. Only the functions below can.
create or replace function public.events_guard_rally()
returns trigger
language plpgsql
as $$
begin
  if not public.is_client_request() or public.is_rally_internal() then
    return new;
  end if;
  new.event_type := old.event_type;
  new.rally_status := old.rally_status;
  new.rally_min_participants := old.rally_min_participants;
  new.rally_expires_at := old.rally_expires_at;
  new.rally_anonymous := old.rally_anonymous;
  new.rally_participant_count := old.rally_participant_count;
  new.rally_activated_at := old.rally_activated_at;
  new.organization_event := old.organization_event;
  new.is_paid := old.is_paid;
  new.price_display := old.price_display;
  if old.event_type = 'rally' then
    new.start_time := old.start_time;
    new.end_time := old.end_time;
    new.host_name := old.host_name;
  end if;
  return new;
end;
$$;

drop trigger if exists events_guard_rally on public.events;
create trigger events_guard_rally
  before update on public.events
  for each row execute function public.events_guard_rally();

-- The creator is the first participant.
create or replace function public.events_rally_add_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type = 'rally' and new.created_by is not null then
    insert into public.rally_participants (event_id, user_id)
    values (new.id, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists events_rally_add_creator on public.events;
create trigger events_rally_add_creator
  after insert on public.events
  for each row execute function public.events_rally_add_creator();

-- Count participants and switch the Rally on when it reaches its minimum
-- before the window closes. An active Rally runs for an hour from then.
create or replace function public.rally_participants_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.event_id, old.event_id);
  joined integer;
begin
  select count(*) into joined from public.rally_participants where event_id = target;
  perform set_config('campus.rally_internal', 'on', true);
  update public.events e
     set rally_participant_count = joined,
         rally_status = case
           when e.rally_status = 'forming' and joined >= e.rally_min_participants and e.rally_expires_at > now()
             then 'active' else e.rally_status end,
         rally_activated_at = case
           when e.rally_status = 'forming' and joined >= e.rally_min_participants and e.rally_expires_at > now()
             then now() else e.rally_activated_at end,
         start_time = case
           when e.rally_status = 'forming' and joined >= e.rally_min_participants and e.rally_expires_at > now()
             then now() else e.start_time end,
         end_time = case
           when e.rally_status = 'forming' and joined >= e.rally_min_participants and e.rally_expires_at > now()
             then now() + interval '1 hour' else e.end_time end
   where e.id = target and e.event_type = 'rally';
  perform set_config('campus.rally_internal', 'off', true);
  return null;
end;
$$;

drop trigger if exists rally_participants_sync on public.rally_participants;
create trigger rally_participants_sync
  after insert or delete on public.rally_participants
  for each row execute function public.rally_participants_sync();

-- Marks Rallies whose window closed before they filled. Any signed-in client
-- calls this when its timer reaches zero; the result is the same for everyone.
create or replace function public.expire_rallies()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  perform set_config('campus.rally_internal', 'on', true);
  update public.events
     set rally_status = 'expired'
   where event_type = 'rally' and rally_status = 'forming' and rally_expires_at <= now();
  get diagnostics changed = row_count;
  perform set_config('campus.rally_internal', 'off', true);
  return changed;
end;
$$;
revoke all on function public.expire_rallies() from public;
grant execute on function public.expire_rallies() to authenticated;

-- Organization status comes only from the server (service role), never from a
-- profile edit in the browser.
create or replace function public.profiles_guard_org()
returns trigger
language plpgsql
as $$
begin
  if not public.is_client_request() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_org := false;
    new.org_verified_at := null;
  else
    new.is_org := old.is_org;
    new.org_verified_at := old.org_verified_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_org on public.profiles;
create trigger profiles_guard_org
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_org();

-- 7. Row Level Security for participants: each person sees and adds only their
--    own row; counts reach everyone through events.rally_participant_count.
alter table public.rally_participants enable row level security;
grant select, insert, delete on public.rally_participants to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rally_participants'
                  and policyname = 'Users can see their own Rally joins') then
    create policy "Users can see their own Rally joins"
      on public.rally_participants for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rally_participants'
                  and policyname = 'Users can join open Rallies as themselves') then
    create policy "Users can join open Rallies as themselves"
      on public.rally_participants for insert to authenticated
      with check (auth.uid() = user_id and public.rally_joinable(event_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rally_participants'
                  and policyname = 'Users can leave a Rally') then
    create policy "Users can leave a Rally"
      on public.rally_participants for delete to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rally_participants'
                  and policyname = 'Rally joins are only your own') then
    create policy "Rally joins are only your own"
      on public.rally_participants as restrictive for all to public
      using (auth.uid() = user_id) with check (auth.uid() = user_id and public.rally_joinable(event_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rally_participants'
                  and policyname = 'Rally joins are never edited') then
    create policy "Rally joins are never edited"
      on public.rally_participants as restrictive for update to public using (false);
  end if;
end $$;

-- 8. Expire Rallies every minute on the server too, when pg_cron is enabled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('campus-connect-expire-rallies', '* * * * *', 'select public.expire_rallies()');
    exception when others then
      raise notice 'pg_cron is installed but the Rally job could not be scheduled: %', sqlerrm;
    end;
  end if;
end $$;

commit;

-- 9. Read-only summary.
select 'column' as kind, table_name as "table", column_name as name, data_type as detail
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'events' and (column_name like 'rally%' or column_name in ('event_type', 'organization_event', 'is_paid', 'price_display')))
     or (table_name = 'profiles' and column_name in ('is_org', 'org_verified_at'))
     or table_name in ('rally_participants', 'admin_event_actions'))
union all
select 'policy', tablename, policyname, permissive || ' ' || cmd
  from pg_policies
 where schemaname = 'public' and tablename in ('rally_participants', 'admin_event_actions')
union all
select 'trigger', event_object_table, trigger_name, action_timing || ' ' || event_manipulation
  from information_schema.triggers
 where trigger_schema = 'public'
   and trigger_name in ('events_prepare_insert', 'events_guard_rally', 'events_rally_add_creator',
                        'rally_participants_sync', 'profiles_guard_org')
order by 1, 2, 3;
