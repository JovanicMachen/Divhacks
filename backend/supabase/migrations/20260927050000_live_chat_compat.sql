-- Campus Connect: event chat and Going for the LIVE database, adapting to the
-- events.status column and events_status_check constraint that already exist.
--
-- Why this file: 20260927010000_event_status_and_chat.sql assumes it owns
-- events_status_check and that status uses 'active' / 'abandoned'. On the live
-- database the constraint comes from an older system with its own values, so
-- that file rolls back and 20260927030000_going_and_chat_access.sql then stops
-- (it needs event_messages). This file does what both were meant to do, without
-- touching the existing constraint or any existing status value.
--
-- What it does:
--   1. Reads the allowed status values from events_status_check (or the enum
--      type, if status is an enum) and records, in campus_event_status_map:
--        cancelled_value  the existing value that means cancelled, if there is
--                         one ('abandoned', 'cancelled' or 'canceled'); null
--                         means cancellation is recorded by timestamp only
--        closed_values    existing values that mean the event is over
--        cancel_column    the cancellation timestamp: an existing cancelled_at,
--                         canceled_at or abandoned_at column, or a new
--                         abandoned_at when none exists
--   2. Adds events.pinned_message_id.
--   3. Creates event_messages and event_message_deletions (soft delete with a
--      private copy of the text), event_going, their RLS, and realtime.
--   4. Chat posting requires Going, being the organizer, or a Rally join.
--   5. cancel_event(id) lets an owner cancel using the mapped value, so no
--      client ever writes a status the constraint doesn't allow.
--
-- Safe to run again. Nothing is dropped except, if present, the
-- events_abandoned_at_matches_status check that 20260927010000 adds, and only
-- when it contradicts the live mapping. If you later run
-- 20260927010000, 20260927020000 or 20260927030000, run this file again after them.

begin;

-- 1. Preconditions.
do $$
begin
  if to_regclass('public.events') is null then
    raise exception 'public.events does not exist. Nothing was changed.';
  end if;
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'events' and column_name = 'id') is distinct from 'uuid' then
    raise exception 'public.events.id must be uuid. Nothing was changed.';
  end if;
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'events' and column_name = 'created_by') is distinct from 'uuid' then
    raise exception 'public.events.created_by must be uuid. Nothing was changed.';
  end if;
  if to_regclass('public.event_messages') is not null and (
    select data_type from information_schema.columns
     where table_schema = 'public' and table_name = 'event_messages' and column_name = 'user_id') is distinct from 'uuid' then
    raise exception 'public.event_messages exists with a different shape. Nothing was changed.';
  end if;
  if to_regclass('public.event_going') is not null and (
    select data_type from information_schema.columns
     where table_schema = 'public' and table_name = 'event_going' and column_name = 'user_id') is distinct from 'uuid' then
    raise exception 'public.event_going exists with a different shape. Nothing was changed.';
  end if;
end $$;

-- 2. How the live status column is used. One row, read by the functions below.
create table if not exists public.campus_event_status_map (
  id boolean primary key default true check (id),
  status_type text not null,
  allowed_values text[] not null default '{}',
  active_value text,
  cancelled_value text,
  closed_values text[] not null default '{}',
  cancel_column text not null,
  updated_at timestamptz not null default now()
);
alter table public.campus_event_status_map enable row level security;
revoke all on public.campus_event_status_map from anon, authenticated;

do $$
declare
  status_type text;
  enum_type oid;
  allowed text[] := '{}';
  def text;
  status_default text;
  active_v text;
  cancel_v text;
  closed_v text[];
  cancel_col text;
  candidate text;
begin
  select format_type(a.atttypid, a.atttypmod), t.oid
    into status_type, enum_type
    from pg_attribute a
    left join pg_type t on t.oid = a.atttypid and t.typtype = 'e'
   where a.attrelid = 'public.events'::regclass and a.attname = 'status' and not a.attisdropped;

  if status_type is null then
    -- No status column at all: add a plain one. Nothing existing is changed.
    alter table public.events add column status text not null default 'active';
    status_type := 'text';
    allowed := array['active'];
  elsif enum_type is not null then
    select array_agg(e.enumlabel order by e.enumsortorder) into allowed from pg_enum e where e.enumtypid = enum_type;
  else
    -- Prefer the existing events_status_check; otherwise any other check on status.
    select pg_get_constraintdef(c.oid) into def
      from pg_constraint c
     where c.conrelid = 'public.events'::regclass and c.conname = 'events_status_check';
    if def is null then
      select string_agg(pg_get_constraintdef(c.oid), ' ') into def
        from pg_constraint c
       where c.conrelid = 'public.events'::regclass and c.contype = 'c'
         and c.conname <> 'events_abandoned_at_matches_status'
         and pg_get_constraintdef(c.oid) ~ '\mstatus\M';
    end if;
    if def is not null then
      select coalesce(array_agg(distinct m[1]), '{}') into allowed from regexp_matches(def, '''([^'']*)''', 'g') as m;
    end if;
  end if;

  select column_default into status_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'status';

  foreach candidate in array array['active', 'published', 'open', 'scheduled', 'upcoming', 'live', 'approved'] loop
    if candidate = any (allowed) then active_v := candidate; exit; end if;
  end loop;
  active_v := coalesce(active_v, substring(status_default from '''([^'']*)'''), allowed[1]);

  -- Only ever reuse a value the live constraint already allows.
  foreach candidate in array array['abandoned', 'cancelled', 'canceled'] loop
    if candidate = any (allowed) then cancel_v := candidate; exit; end if;
  end loop;

  select coalesce(array_agg(v), '{}') into closed_v
    from unnest(allowed) v
   where v in ('ended', 'completed', 'complete', 'expired', 'past', 'closed', 'finished', 'archived');

  -- Reuse an existing cancellation timestamp if there is one.
  foreach candidate in array array['cancelled_at', 'canceled_at', 'abandoned_at'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'events' and column_name = candidate
                  and data_type in ('timestamp with time zone', 'timestamp without time zone')) then
      cancel_col := candidate;
      exit;
    end if;
  end loop;
  if cancel_col is null then
    alter table public.events add column abandoned_at timestamptz;
    cancel_col := 'abandoned_at';
  end if;

  insert into public.campus_event_status_map as m
         (id, status_type, allowed_values, active_value, cancelled_value, closed_values, cancel_column, updated_at)
  values (true, status_type, allowed, active_v, cancel_v, closed_v, cancel_col, now())
  on conflict (id) do update
     set status_type = excluded.status_type, allowed_values = excluded.allowed_values,
         active_value = excluded.active_value, cancelled_value = excluded.cancelled_value,
         closed_values = excluded.closed_values, cancel_column = excluded.cancel_column, updated_at = now();

  -- 20260927010000 ties abandoned_at to status = 'abandoned'; that contradicts a
  -- live mapping that cancels with another value or another column.
  if exists (select 1 from pg_constraint
              where conname = 'events_abandoned_at_matches_status' and conrelid = 'public.events'::regclass)
     and (cancel_v is distinct from 'abandoned' or cancel_col <> 'abandoned_at') then
    alter table public.events drop constraint events_abandoned_at_matches_status;
  end if;
end $$;

-- 3. Pinned organizer message.
alter table public.events add column if not exists pinned_message_id uuid;

-- 4. Chat tables.
create table if not exists public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
alter table public.event_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_messages_event_id_format' and conrelid = 'public.event_messages'::regclass) then
    alter table public.event_messages add constraint event_messages_event_id_format check (char_length(event_id) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_messages_length' and conrelid = 'public.event_messages'::regclass) then
    alter table public.event_messages add constraint event_messages_length check (char_length(message) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_messages_not_blank' and conrelid = 'public.event_messages'::regclass) then
    alter table public.event_messages add constraint event_messages_not_blank
      check ((deleted_at is null and char_length(btrim(message)) > 0) or (deleted_at is not null and message = ''));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_pinned_message_fkey' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_pinned_message_fkey
      foreign key (pinned_message_id) references public.event_messages (id) on delete set null;
  end if;
end $$;

create index if not exists event_messages_event_created_idx on public.event_messages (event_id, created_at);
create index if not exists event_messages_created_idx on public.event_messages (created_at);
create index if not exists event_messages_user_idx on public.event_messages (user_id);

create table if not exists public.event_message_deletions (
  message_id uuid primary key references public.event_messages (id) on delete cascade,
  event_id text not null,
  user_id uuid not null,
  message text not null,
  deleted_at timestamptz not null default now()
);
alter table public.event_message_deletions enable row level security;
revoke all on public.event_message_deletions from anon, authenticated;

-- 5. Going.
create table if not exists public.event_going (
  event_id text not null check (char_length(event_id) between 1 and 80),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_going_user_idx on public.event_going (user_id);

-- 6. Helpers. All read the live status mapping instead of fixed values.
create or replace function public.is_client_request()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', '') in ('authenticated', 'anon');
$$;

-- True while a stored event is neither cancelled, closed by status, nor past end_time.
create or replace function public.event_is_open(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.campus_event_status_map%rowtype;
  ok boolean;
begin
  select * into m from public.campus_event_status_map where id;
  execute format(
    'select exists (select 1 from public.events e where e.id = $1'
    || ' and ($2::text is null or e.status::text is distinct from $2)'
    || ' and not (coalesce(e.status::text, '''') = any ($3))'
    || ' and e.%I is null and (e.end_time is null or e.end_time > now()))',
    m.cancel_column)
  into ok using target, m.cancelled_value, m.closed_values;
  return ok;
end;
$$;

-- Official listings (slug ids) are always open; stored events use event_is_open.
create or replace function public.event_chat_open(target text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.event_is_open(target::uuid);
  end if;
  return target ~ '^[a-z0-9][a-z0-9-]{0,79}$';
end;
$$;

create or replace function public.event_going_open(target text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.event_chat_open(target);
end;
$$;

create or replace function public.can_post_in_event_chat(target text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  joined boolean := false;
begin
  if me is null then
    return false;
  end if;
  if exists (select 1 from public.event_going g where g.event_id = target and g.user_id = me) then
    return true;
  end if;
  if target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    if exists (select 1 from public.events e where e.id = target::uuid and e.created_by = me) then
      return true;
    end if;
    if to_regclass('public.rally_participants') is not null then
      execute 'select exists (select 1 from public.rally_participants where event_id = $1 and user_id = $2)'
        into joined using target::uuid, me;
      return joined;
    end if;
  end if;
  return false;
end;
$$;

-- Rally joins (only used once the Rally migration has run) follow the same mapping.
create or replace function public.rally_joinable(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.campus_event_status_map%rowtype;
  ok boolean;
begin
  select * into m from public.campus_event_status_map where id;
  execute format(
    'select exists (select 1 from public.events e where e.id = $1 and e.event_type = ''rally'''
    || ' and ($2::text is null or e.status::text is distinct from $2) and e.%I is null'
    || ' and ((e.rally_status = ''forming'' and e.rally_expires_at > now())'
    || '   or (e.rally_status = ''active'' and (e.end_time is null or e.end_time > now()))))',
    m.cancel_column)
  into ok using target, m.cancelled_value;
  return ok;
end;
$$;

revoke all on function public.event_is_open(uuid) from public;
revoke all on function public.event_chat_open(text) from public;
revoke all on function public.event_going_open(text) from public;
revoke all on function public.can_post_in_event_chat(text) from public;
revoke all on function public.rally_joinable(uuid) from public;
grant execute on function public.event_is_open(uuid) to authenticated;
grant execute on function public.event_chat_open(text) to authenticated;
grant execute on function public.event_going_open(text) to authenticated;
grant execute on function public.can_post_in_event_chat(text) to authenticated;
grant execute on function public.rally_joinable(uuid) to authenticated;

-- 7. Cancelling. Owners call cancel_event(); a plain update can't change the
--    status or the cancellation time. The live constraint is never bypassed:
--    the status is only set to a value it already allows.
create or replace function public.cancel_event(target uuid)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.campus_event_status_map%rowtype;
  current_row public.events%rowtype;
  result public.events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to cancel an event.' using errcode = '42501';
  end if;
  select * into m from public.campus_event_status_map where id;
  select * into current_row from public.events where id = target for update;
  if not found then
    raise exception 'This event no longer exists.' using errcode = 'P0002';
  end if;
  if current_row.created_by is distinct from auth.uid() or coalesce(to_jsonb(current_row) ->> 'source', 'student') <> 'student' then
    raise exception 'Only the event''s host can cancel it.' using errcode = '42501';
  end if;
  if to_jsonb(current_row) ->> m.cancel_column is not null
     or (m.cancelled_value is not null and current_row.status::text = m.cancelled_value) then
    raise exception 'This event was already cancelled.' using errcode = '42501';
  end if;

  perform set_config('campus.internal', 'on', true);
  if m.cancelled_value is null then
    execute format('update public.events set %I = now() where id = $1', m.cancel_column) using target;
  else
    execute format('update public.events set %I = now(), status = cast($2 as %s) where id = $1', m.cancel_column, m.status_type)
      using target, m.cancelled_value;
  end if;
  perform set_config('campus.internal', 'off', true);

  select * into result from public.events where id = target;
  return result;
end;
$$;
revoke all on function public.cancel_event(uuid) from public;
grant execute on function public.cancel_event(uuid) to authenticated;

-- Client updates keep status and the cancellation time as they were, and may
-- only pin the organizer's own message in that event.
create or replace function public.events_guard_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.campus_event_status_map%rowtype;
  was jsonb := to_jsonb(old);
begin
  if not public.is_client_request() or coalesce(current_setting('campus.internal', true), '') = 'on' then
    return new;
  end if;
  select * into m from public.campus_event_status_map where id;
  new := jsonb_populate_record(new, jsonb_build_object('status', was -> 'status', m.cancel_column, was -> m.cancel_column));

  if new.pinned_message_id is distinct from old.pinned_message_id and new.pinned_message_id is not null then
    if not public.event_is_open(new.id) or not exists (
      select 1 from public.event_messages msg
       where msg.id = new.pinned_message_id and msg.event_id = new.id::text
         and msg.user_id = new.created_by and msg.deleted_at is null
    ) then
      raise exception 'Only a message the organizer posted in this event can be pinned.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_guard_lifecycle on public.events;
create trigger events_guard_lifecycle
  before update on public.events
  for each row execute function public.events_guard_lifecycle();

-- Messages: author, event and time never change; delete is a soft delete that
-- keeps the text privately; edits aren't supported.
create or replace function public.event_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_client_request() then
      new.message := btrim(new.message);
      new.created_at := now();
      new.edited_at := null;
      new.deleted_at := null;
    end if;
    return new;
  end if;
  if not public.is_client_request() then
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'This message was already deleted.' using errcode = '42501';
  end if;
  if new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'A message''s author, event and time can''t be changed.' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    insert into public.event_message_deletions (message_id, event_id, user_id, message)
    values (old.id, old.event_id, old.user_id, old.message)
    on conflict (message_id) do nothing;
    new.deleted_at := now();
    new.message := '';
    new.edited_at := old.edited_at;
    perform set_config('campus.internal', 'on', true);
    update public.events set pinned_message_id = null where pinned_message_id = old.id;
    perform set_config('campus.internal', 'off', true);
    return new;
  end if;
  if new.message is distinct from old.message or new.edited_at is distinct from old.edited_at then
    raise exception 'Messages can''t be edited.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists event_messages_guard on public.event_messages;
create trigger event_messages_guard
  before insert or update on public.event_messages
  for each row execute function public.event_messages_guard();

-- Deleting an event removes its chat and Going rows (text ids, so no cascade).
create or replace function public.events_delete_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.event_messages where event_id = old.id::text;
  delete from public.event_going where event_id = old.id::text;
  return old;
end;
$$;

drop trigger if exists events_delete_chat on public.events;
create trigger events_delete_chat
  after delete on public.events
  for each row execute function public.events_delete_chat();
drop trigger if exists events_delete_going on public.events;

-- 8. Row Level Security.
grant update (pinned_message_id) on public.events to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                  and permissive = 'PERMISSIVE' and cmd in ('UPDATE', 'ALL')) then
    create policy "Owners can update their own student events"
      on public.events for update to authenticated
      using (auth.uid() = created_by) with check (auth.uid() = created_by);
  end if;
end $$;

alter table public.event_messages enable row level security;
grant select, insert on public.event_messages to authenticated;
grant update (deleted_at) on public.event_messages to authenticated;

alter table public.event_going enable row level security;
grant select, insert, delete on public.event_going to authenticated;

do $$
begin
  -- Chat: anyone signed in reads; posting and deleting are the author's own.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_messages'
                  and policyname = 'Event chat is readable by signed-in users') then
    create policy "Event chat is readable by signed-in users"
      on public.event_messages for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_messages'
                  and policyname = 'Users can post in open event chats') then
    create policy "Users can post in open event chats"
      on public.event_messages for insert to authenticated
      with check (auth.uid() = user_id and public.event_chat_open(event_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_messages'
                  and policyname = 'Users can delete their own messages') then
    create policy "Users can delete their own messages"
      on public.event_messages for update to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_messages'
                  and policyname = 'Messages are posted as yourself in an open chat') then
    create policy "Messages are posted as yourself in an open chat"
      on public.event_messages as restrictive for insert to public
      with check (auth.uid() = user_id and public.event_chat_open(event_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_messages'
                  and policyname = 'Only people going can post in event chat') then
    create policy "Only people going can post in event chat"
      on public.event_messages as restrictive for insert to public
      with check (public.can_post_in_event_chat(event_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_messages'
                  and policyname = 'Only the author can change a message') then
    create policy "Only the author can change a message"
      on public.event_messages as restrictive for update to public
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_messages'
                  and policyname = 'Messages are soft-deleted only') then
    create policy "Messages are soft-deleted only"
      on public.event_messages as restrictive for delete to public using (false);
  end if;

  -- Going: each person sees, adds and removes only their own rows.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_going'
                  and policyname = 'Users can see their own Going') then
    create policy "Users can see their own Going"
      on public.event_going for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_going'
                  and policyname = 'Users can mark themselves going') then
    create policy "Users can mark themselves going"
      on public.event_going for insert to authenticated
      with check (auth.uid() = user_id and public.event_going_open(event_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_going'
                  and policyname = 'Users can stop going') then
    create policy "Users can stop going"
      on public.event_going for delete to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_going'
                  and policyname = 'Going rows are only your own') then
    create policy "Going rows are only your own"
      on public.event_going as restrictive for all to public
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_going'
                  and policyname = 'Going rows are never edited') then
    create policy "Going rows are never edited"
      on public.event_going as restrictive for update to public using (false);
  end if;
end $$;

-- 9. Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_messages') then
      alter publication supabase_realtime add table public.event_messages;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_going') then
      alter publication supabase_realtime add table public.event_going;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
      alter publication supabase_realtime add table public.events;
    end if;
  end if;
end $$;

commit;

-- 10. Read-only summary: the status mapping this file chose, then what exists.
select 'status map' as kind, 'events' as "table",
       'allowed: ' || array_to_string(allowed_values, ', ') as name,
       'cancelled_value=' || coalesce(cancelled_value, '(none: timestamp only)')
       || ', closed=' || coalesce(nullif(array_to_string(closed_values, ', '), ''), '(none)')
       || ', cancel_column=' || cancel_column || ', status_type=' || status_type as detail
  from public.campus_event_status_map
union all
select 'policy', tablename, policyname, permissive || ' ' || cmd
  from pg_policies
 where schemaname = 'public' and tablename in ('event_messages', 'event_going')
union all
select 'realtime', tablename, 'supabase_realtime', 'published'
  from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename in ('events', 'event_messages', 'event_going')
order by 1, 2, 3;
