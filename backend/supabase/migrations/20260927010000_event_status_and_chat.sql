-- Campus Connect: cancel an event early, and a live chat room for every event.
-- Run after 20260926221000_events_live_schema_compat_v2.sql (and the other files
-- before this one). Additive and safe to run again: it never drops, renames, or
-- loosens anything, and existing events all start as 'active'.
--
-- events gains:
--   status             'active' | 'abandoned' | 'ended'. The app shows 'abandoned'
--                      as "Cancelled". Events past end_time are treated as ended by
--                      the app from their times; nothing writes 'ended' yet.
--   abandoned_at       set by the database when an owner cancels the event.
--   pinned_message_id  one organizer message pinned to the top of the event chat.
--
-- New tables:
--   event_messages           one row per chat message. Text event_id, like
--                            notifications, because official listings use slug ids
--                            that are not rows in events.
--   event_message_deletions  the original text of soft-deleted messages, for
--                            moderation. No client role can read or write it.

begin;

-- 1. Check the live table before touching it.
do $$
declare
  id_type text;
  status_type text;
  similar_columns text;
  messages_user_type text;
begin
  if to_regclass('public.events') is null then
    raise exception 'public.events does not exist. Nothing was changed.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'events' and column_name = 'source') then
    raise exception 'public.events has no source column yet. Run 20260926221000_events_live_schema_compat_v2.sql first. Nothing was changed.';
  end if;

  select data_type into id_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'id';
  if id_type is distinct from 'uuid' then
    raise exception 'public.events.id is %, not uuid. Nothing was changed.', coalesce(id_type, 'missing');
  end if;

  -- A second column for the same idea would make the app ambiguous.
  select string_agg(column_name, ', ' order by column_name) into similar_columns
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events'
     and column_name in (
       'state', 'event_status', 'lifecycle', 'is_active', 'active',
       'is_cancelled', 'is_canceled', 'cancelled', 'canceled', 'cancelled_at', 'canceled_at',
       'is_archived', 'archived', 'archived_at', 'ended_at', 'pinned_message', 'pinned_message_text'
     );
  if similar_columns is not null then
    raise exception 'public.events already has: %. These may already mean an event''s status or pinned message. Nothing was changed; map these columns before running this file.',
      similar_columns;
  end if;

  -- A status column is only reused if this file created it (it owns events_status_check).
  select data_type into status_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'status';
  if status_type is not null and not exists (
    select 1 from pg_constraint where conname = 'events_status_check' and conrelid = 'public.events'::regclass
  ) then
    raise exception 'public.events already has a status column (%) that this file did not create. Nothing was changed; check what its values mean first.',
      status_type;
  end if;

  if to_regclass('public.event_messages') is not null then
    select data_type into messages_user_type
      from information_schema.columns
     where table_schema = 'public' and table_name = 'event_messages' and column_name = 'user_id';
    if messages_user_type is distinct from 'uuid' then
      raise exception 'public.event_messages already exists and its user_id is %, not uuid. Nothing was changed.',
        coalesce(messages_user_type, 'missing');
    end if;
  end if;
end $$;

-- 2. Event status. Existing rows get 'active'.
alter table public.events
  add column if not exists status text not null default 'active',
  add column if not exists abandoned_at timestamptz,
  add column if not exists pinned_message_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'events_status_check' and conrelid = 'public.events'::regclass) then
    alter table public.events
      add constraint events_status_check check (status in ('active', 'abandoned', 'ended'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'events_abandoned_at_matches_status' and conrelid = 'public.events'::regclass) then
    alter table public.events
      add constraint events_abandoned_at_matches_status
      check ((status = 'abandoned') = (abandoned_at is not null));
  end if;
end $$;

create index if not exists events_status_idx on public.events (status);

-- 3. Chat messages.
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
  if not exists (select 1 from pg_constraint
                  where conname = 'event_messages_event_id_format' and conrelid = 'public.event_messages'::regclass) then
    alter table public.event_messages
      add constraint event_messages_event_id_format check (char_length(event_id) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'event_messages_length' and conrelid = 'public.event_messages'::regclass) then
    alter table public.event_messages
      add constraint event_messages_length check (char_length(message) <= 500);
  end if;
  -- A live message has text; a deleted one keeps none (see the deletions table).
  if not exists (select 1 from pg_constraint
                  where conname = 'event_messages_not_blank' and conrelid = 'public.event_messages'::regclass) then
    alter table public.event_messages
      add constraint event_messages_not_blank
      check ((deleted_at is null and char_length(btrim(message)) > 0) or (deleted_at is not null and message = ''));
  end if;
end $$;

create index if not exists event_messages_event_created_idx on public.event_messages (event_id, created_at);
create index if not exists event_messages_created_idx on public.event_messages (created_at);
create index if not exists event_messages_user_idx on public.event_messages (user_id);

-- Original text of deleted messages. RLS on with no policies: only the service
-- role and the SQL editor can read it.
create table if not exists public.event_message_deletions (
  message_id uuid primary key references public.event_messages (id) on delete cascade,
  event_id text not null,
  user_id uuid not null,
  message text not null,
  deleted_at timestamptz not null default now()
);
alter table public.event_message_deletions enable row level security;
revoke all on public.event_message_deletions from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'events_pinned_message_fkey' and conrelid = 'public.events'::regclass) then
    alter table public.events
      add constraint events_pinned_message_fkey
      foreign key (pinned_message_id) references public.event_messages (id) on delete set null;
  end if;
end $$;

-- 4. Rules the database enforces for signed-in clients. The SQL editor and the
--    service role (no user JWT) are not limited, so an admin can still correct rows.
create or replace function public.is_client_request()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', '') in ('authenticated', 'anon');
$$;

-- Chat is open for official listings, and for student events that are still
-- active and haven't reached end_time. Unknown event ids are closed.
create or replace function public.event_chat_open(target text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return exists (
      select 1 from public.events e
       where e.id = target::uuid
         and e.status = 'active'
         and (e.end_time is null or e.end_time > now())
    );
  end if;
  return target ~ '^[a-z0-9][a-z0-9-]{0,79}$';
end;
$$;

revoke all on function public.event_chat_open(text) from public;
grant execute on function public.event_chat_open(text) to authenticated;

-- Events: an owner may cancel once. A cancelled event can't be restored, and
-- abandoned_at always comes from the database clock.
create or replace function public.events_guard_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if not public.is_client_request() then
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'active' or new.status <> 'abandoned' then
      raise exception 'A cancelled event can''t be restored, and an event can only be cancelled while it is active.'
        using errcode = '42501';
    end if;
    new.abandoned_at := now();
    new.pinned_message_id := old.pinned_message_id;
  else
    new.abandoned_at := old.abandoned_at;
  end if;

  if new.pinned_message_id is distinct from old.pinned_message_id and new.pinned_message_id is not null then
    if new.status <> 'active' or not exists (
      select 1 from public.event_messages m
       where m.id = new.pinned_message_id
         and m.event_id = new.id::text
         and m.user_id = new.created_by
         and m.deleted_at is null
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

-- Messages: the author, event and time never change. Deleting is a soft delete
-- that moves the text into event_message_deletions. Edits are not supported yet.
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
  if new.event_id is distinct from old.event_id
     or new.user_id is distinct from old.user_id
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
    update public.events set pinned_message_id = null where pinned_message_id = old.id;
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

-- Deleting an event removes its chat (event_id is text, so there is no cascade).
create or replace function public.events_delete_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.event_messages where event_id = old.id::text;
  return old;
end;
$$;

drop trigger if exists events_delete_chat on public.events;
create trigger events_delete_chat
  after delete on public.events
  for each row execute function public.events_delete_chat();

-- 5. Row Level Security.
grant update (status, pinned_message_id) on public.events to authenticated;

do $$
begin
  -- Owners can change their own student events (today: cancel and pin).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                  and permissive = 'PERMISSIVE' and cmd in ('UPDATE', 'ALL')) then
    create policy "Owners can update their own student events"
      on public.events for update to authenticated
      using (auth.uid() = created_by and source = 'student')
      with check (auth.uid() = created_by and source = 'student');
  end if;
  -- Already created by the compat file; recreated here only if it is missing.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                  and policyname = 'Only owners can edit student events') then
    create policy "Only owners can edit student events"
      on public.events as restrictive for update to public
      using (auth.uid() = created_by and source = 'student')
      with check (auth.uid() = created_by and source = 'student');
  end if;
end $$;

alter table public.event_messages enable row level security;
grant select, insert on public.event_messages to authenticated;
grant update (deleted_at) on public.event_messages to authenticated;

do $$
begin
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

  -- Restrictive: ANDed with any other policy, so nothing else can open these up.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_messages'
                  and policyname = 'Messages are posted as yourself in an open chat') then
    create policy "Messages are posted as yourself in an open chat"
      on public.event_messages as restrictive for insert to public
      with check (auth.uid() = user_id and public.event_chat_open(event_id));
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
end $$;

-- 6. Realtime: new and deleted messages reach everyone with that event open.
--    Event status and pin changes already travel on the published events table.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_messages') then
    alter publication supabase_realtime add table public.event_messages;
  end if;
end $$;

commit;

-- 7. Read-only summary of the result.
select 'column' as kind, table_name as "table", column_name as name, data_type as detail
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'events' and column_name in ('status', 'abandoned_at', 'pinned_message_id'))
     or table_name in ('event_messages', 'event_message_deletions'))
union all
select 'policy', tablename, policyname, permissive || ' ' || cmd
  from pg_policies
 where schemaname = 'public' and tablename in ('events', 'event_messages', 'event_message_deletions')
union all
select 'realtime', tablename, 'supabase_realtime', 'published'
  from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename in ('events', 'event_messages')
union all
select 'status count', 'events', status, count(*)::text
  from public.events
 group by status
order by 1, 2, 3;
