-- Campus Connect: upgrade an existing public.events / event_attendees /
-- saved_events to what the app needs.
--
-- Use this instead of 20260926200000_events_ownership.sql on a database that
-- already has an events table. It is safe to run again.
--
-- What it never does: drop, rename, or recreate a table or column; rewrite
-- existing values other than filling the new `source` column; loosen an
-- existing policy.
--
-- It stops before changing anything if public.events already has a column that
-- looks like the same idea as one it would add (for example start_time or
-- latitude), so no duplicate columns are created.

begin;

-- 1. Check the live table before touching it.
do $$
declare
  similar_columns text;
  id_type text;
  owner_type text;
begin
  if to_regclass('public.events') is null then
    raise exception 'public.events does not exist. Run 20260926200000_events_ownership.sql instead of this file.';
  end if;

  select data_type into id_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'id';
  if id_type is null then
    raise exception 'public.events has no id column. Nothing was changed.';
  end if;

  select data_type into owner_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'created_by';
  if owner_type is distinct from 'uuid' then
    raise exception 'public.events.created_by is %, not uuid, so it cannot be compared with auth.uid(). Nothing was changed.',
      coalesce(owner_type, 'missing');
  end if;

  select string_agg(column_name, ', ' order by column_name) into similar_columns
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events'
     and column_name in (
       'start_time', 'end_time', 'start_at', 'end_at', 'start_date', 'end_date',
       'starts', 'ends', 'date', 'time', 'event_date', 'event_time', 'closes_at', 'expires_at',
       'latitude', 'longitude', 'lon', 'long',
       'is_official', 'official', 'event_source', 'event_type',
       'host', 'organizer', 'building', 'building_id', 'location_key'
     );
  if similar_columns is not null then
    raise exception 'public.events already has: %. These may mean the same thing as starts_at, ends_at, lat, lng, source, host_name or location_id. Nothing was changed; map these columns before running this file.',
      similar_columns;
  end if;
end $$;

-- 2. Add the columns the app reads and writes. All nullable, so existing rows are untouched.
alter table public.events
  add column if not exists source text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists location_id text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists host_name text;

-- 3. Fill `source` for existing rows. Rows with an owner are student posts;
--    rows with no owner can't belong to a student, so they are official.
update public.events
   set source = case when created_by is null then 'official' else 'student' end
 where source is null;

alter table public.events alter column source set default 'student';
alter table public.events alter column source set not null;

-- 4. Defaults so the app never has to send an owner or an id.
do $$
declare
  id_type text;
  id_default text;
  owner_default text;
begin
  select data_type, column_default into id_type, id_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'id';
  if id_default is null and id_type = 'uuid' then
    alter table public.events alter column id set default gen_random_uuid();
  elsif id_default is null and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'events' and column_name = 'id' and is_identity = 'YES'
  ) then
    raise notice 'public.events.id (%) has no default. New posts from the app will fail until it gets one.', id_type;
  end if;

  select column_default into owner_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'created_by';
  if owner_default is null then
    alter table public.events alter column created_by set default auth.uid();
  end if;
end $$;

-- 5. Checks. Existing rows already satisfy both (source was just filled; the new time columns are empty).
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'events_source_check' and conrelid = 'public.events'::regclass) then
    alter table public.events
      add constraint events_source_check check (source in ('official', 'student'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'events_time_order' and conrelid = 'public.events'::regclass) then
    alter table public.events
      add constraint events_time_order check (starts_at is null or ends_at is null or ends_at > starts_at);
  end if;
end $$;

create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists events_created_by_idx on public.events (created_by);

-- 6. Row Level Security on events.
alter table public.events enable row level security;
grant select, insert, delete on public.events to authenticated;

-- 6a. Access policies, only where the table has none for that action yet.
--     An existing policy is left exactly as it is.
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'events'
                    and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')) then
    create policy "Events are readable by signed-in users"
      on public.events for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'events'
                    and permissive = 'PERMISSIVE' and cmd in ('INSERT', 'ALL')) then
    create policy "Users can post their own student events"
      on public.events for insert to authenticated
      with check (auth.uid() = created_by and source = 'student');
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'events'
                    and permissive = 'PERMISSIVE' and cmd in ('DELETE', 'ALL')) then
    create policy "Users can delete their own student events"
      on public.events for delete to authenticated
      using (auth.uid() = created_by and source = 'student');
  end if;
end $$;

-- 6b. Ownership limits. RESTRICTIVE policies are ANDed with every other policy,
--     so they can only narrow access, whatever policies already exist.
--     They apply to every client role; the service role bypasses RLS as usual.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                  and policyname = 'Only owners can post student events') then
    create policy "Only owners can post student events"
      on public.events as restrictive for insert to public
      with check (auth.uid() = created_by and source = 'student');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                  and policyname = 'Only owners can delete student events') then
    create policy "Only owners can delete student events"
      on public.events as restrictive for delete to public
      using (auth.uid() = created_by and source = 'student');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                  and policyname = 'Only owners can edit student events') then
    create policy "Only owners can edit student events"
      on public.events as restrictive for update to public
      using (auth.uid() = created_by and source = 'student')
      with check (auth.uid() = created_by and source = 'student');
  end if;
end $$;

-- 7. Going (event_attendees) and Saved (saved_events): user-owned rows.
do $$
declare
  t text;
  user_type text;
  user_default text;
  event_type text;
  events_id_type text;
  fk_delete_rule "char";
begin
  select data_type into events_id_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'events' and column_name = 'id';

  foreach t in array array['event_attendees', 'saved_events'] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'public.% does not exist; skipped.', t;
      continue;
    end if;

    select data_type, column_default into user_type, user_default
      from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = 'user_id';
    if user_type is distinct from 'uuid' then
      raise exception 'public.%.user_id is %, not uuid. Nothing was changed.', t, coalesce(user_type, 'missing');
    end if;
    if user_default is null then
      execute format('alter table public.%I alter column user_id set default auth.uid()', t);
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, delete on public.%I to authenticated', t);

    -- Access policies, only where none exist for that action.
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                    and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')) then
      execute format('create policy "Users can read their own rows" on public.%I
                        for select to authenticated using (auth.uid() = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                    and permissive = 'PERMISSIVE' and cmd in ('INSERT', 'ALL')) then
      execute format('create policy "Users can add their own rows" on public.%I
                        for insert to authenticated with check (auth.uid() = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                    and permissive = 'PERMISSIVE' and cmd in ('DELETE', 'ALL')) then
      execute format('create policy "Users can remove their own rows" on public.%I
                        for delete to authenticated using (auth.uid() = user_id)', t);
    end if;

    -- Ownership limits (restrictive: only narrow access).
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                    and policyname = 'Only the owner can add this row') then
      execute format('create policy "Only the owner can add this row" on public.%I
                        as restrictive for insert to public with check (auth.uid() = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                    and policyname = 'Only the owner can remove this row') then
      execute format('create policy "Only the owner can remove this row" on public.%I
                        as restrictive for delete to public using (auth.uid() = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                    and policyname = 'Only the owner can change this row') then
      execute format('create policy "Only the owner can change this row" on public.%I
                        as restrictive for update to public
                        using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    end if;

    -- A user's saved list is private.
    if t = 'saved_events' and not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t
         and policyname = 'Only the owner can see saved events') then
      create policy "Only the owner can see saved events"
        on public.saved_events as restrictive for select to public using (auth.uid() = user_id);
    end if;

    -- Remove Going / Saved rows with their event, so deleting an event can't fail
    -- on another user's row that the deleter isn't allowed to touch.
    select c.confdeltype into fk_delete_rule
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and c.conrelid = format('public.%I', t)::regclass
       and c.confrelid = 'public.events'::regclass
       and a.attname = 'event_id'
     limit 1;

    select data_type into event_type
      from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = 'event_id';

    if fk_delete_rule is null then
      if event_type is distinct from events_id_type then
        raise notice 'public.%.event_id is % but events.id is %; no foreign key added.', t, event_type, events_id_type;
      else
        -- NOT VALID: new rows are checked; existing rows are left as they are.
        execute format('alter table public.%I add constraint %I foreign key (event_id)
                          references public.events (id) on delete cascade not valid',
                       t, t || '_event_id_fkey_cascade');
      end if;
    elsif fk_delete_rule <> 'c' then
      raise notice 'public.% already has a foreign key to events without ON DELETE CASCADE. It was left unchanged; deleting an event that other users marked Going or Saved will fail until it cascades.', t;
    end if;

    fk_delete_rule := null;
  end loop;
end $$;

-- 8. Realtime: send event inserts and deletes to subscribed clients.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

commit;

-- 9. Read-only summary of the result.
select 'column' as kind, table_name as "table", column_name as name, data_type as detail
  from information_schema.columns
 where table_schema = 'public' and table_name = 'events'
   and column_name in ('source', 'starts_at', 'ends_at', 'location_id', 'lat', 'lng', 'host_name', 'created_by')
union all
select 'policy', tablename, policyname, permissive || ' ' || cmd
  from pg_policies
 where schemaname = 'public' and tablename in ('events', 'event_attendees', 'saved_events')
union all
select 'source count', 'events', source, count(*)::text
  from public.events
 group by source
union all
select 'ACTION NEEDED', c.conrelid::regclass::text, c.conname,
       'foreign key to events without ON DELETE CASCADE: deleting an event that others marked Going or Saved will fail'
  from pg_constraint c
 where c.contype = 'f'
   and c.confrelid = 'public.events'::regclass
   and c.conrelid in (select to_regclass('public.event_attendees') union select to_regclass('public.saved_events'))
   and c.confdeltype <> 'c'
order by 1, 2, 3;
