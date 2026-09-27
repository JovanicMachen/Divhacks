-- Campus Connect: store Going in the database and allow event chat only for
-- people who are going (or host the event, or joined its Rally).
-- Run after 20260927010000_event_status_and_chat.sql. Additive and safe to run
-- again; it never drops, renames, or loosens anything.
--
-- New table event_going: one row per person per event they marked I'm Going.
--   event_id is text, like event_messages and notifications, because official
--   Columbia listings use slug ids that are not rows in events. The existing
--   event_attendees table is left as it is (its event_id is tied to events.id).
-- event_messages gains one restrictive insert rule: the author must be going,
--   be the event's organizer, or have joined its Rally.

begin;

do $$
begin
  if to_regclass('public.event_messages') is null then
    raise exception 'Run 20260927010000_event_status_and_chat.sql first (event_messages is missing). Nothing was changed.';
  end if;
  if to_regclass('public.event_going') is not null and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'event_going' and column_name = 'user_id' and data_type = 'uuid'
  ) then
    raise exception 'public.event_going already exists with a different shape. Nothing was changed.';
  end if;
end $$;

create table if not exists public.event_going (
  event_id text not null check (char_length(event_id) between 1 and 80),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_going_user_idx on public.event_going (user_id);

-- Going is open for official listings and for stored events that are still
-- active and haven't ended. Leaving is always allowed.
create or replace function public.event_going_open(target text)
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
       where e.id = target::uuid and e.status = 'active' and (e.end_time is null or e.end_time > now())
    );
  end if;
  return target ~ '^[a-z0-9][a-z0-9-]{0,79}$';
end;
$$;
revoke all on function public.event_going_open(text) from public;
grant execute on function public.event_going_open(text) to authenticated;

-- Who may post in an event's chat: people going, its organizer, and people who
-- joined it as a Rally (when the Rally table exists).
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
revoke all on function public.can_post_in_event_chat(text) from public;
grant execute on function public.can_post_in_event_chat(text) to authenticated;

-- Row Level Security: each person sees, adds and removes only their own rows.
alter table public.event_going enable row level security;
grant select, insert, delete on public.event_going to authenticated;

do $$
begin
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

  -- Restrictive: ANDed with the existing chat insert policies.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_messages'
                  and policyname = 'Only people going can post in event chat') then
    create policy "Only people going can post in event chat"
      on public.event_messages as restrictive for insert to public
      with check (public.can_post_in_event_chat(event_id));
  end if;
end $$;

-- Deleting an event removes its Going rows (event_id is text, so no cascade).
create or replace function public.events_delete_going()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.event_going where event_id = old.id::text;
  return old;
end;
$$;

drop trigger if exists events_delete_going on public.events;
create trigger events_delete_going
  after delete on public.events
  for each row execute function public.events_delete_going();

-- Realtime: Going changes reach the same person's other devices.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_going') then
    alter publication supabase_realtime add table public.event_going;
  end if;
end $$;

commit;

-- Read-only summary.
select 'policy' as kind, tablename as "table", policyname as name, permissive || ' ' || cmd as detail
  from pg_policies
 where schemaname = 'public' and (tablename = 'event_going' or (tablename = 'event_messages' and cmd = 'INSERT'))
union all
select 'realtime', tablename, 'supabase_realtime', 'published'
  from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'event_going'
order by 1, 2, 3;
