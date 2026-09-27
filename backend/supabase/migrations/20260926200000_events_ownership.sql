-- Campus Connect: student-posted events with ownership, plus Going / Saved.
-- Additive and re-runnable: nothing is dropped or renamed.
--
-- Rules enforced by Row Level Security:
--   * any signed-in user can read events;
--   * a user can only insert student events owned by themselves
--     (created_by defaults to auth.uid(); a forged owner is rejected);
--   * a user can only delete their own student events; official listings
--     can't be deleted from the app;
--   * there is no UPDATE policy, so events can't be edited from the app.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null default 'student',
  title text not null,
  category text not null,
  description text not null default '',
  location_name text not null default '',
  location_id text,
  map_x double precision,
  map_y double precision,
  lat double precision,
  lng double precision,
  host_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_source_check') then
    alter table public.events
      add constraint events_source_check check (source in ('official', 'student'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_category_check') then
    alter table public.events
      add constraint events_category_check
      check (category in ('Free Food', 'Social', 'Academic', 'Career', 'Sports', 'Entertainment'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_title_length') then
    alter table public.events
      add constraint events_title_length check (char_length(btrim(title)) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_description_length') then
    alter table public.events
      add constraint events_description_length check (char_length(description) <= 400);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_time_order') then
    alter table public.events
      add constraint events_time_order check (ends_at > starts_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_map_point') then
    alter table public.events
      add constraint events_map_point
      check ((map_x is null) = (map_y is null)
             and (map_x is null or (map_x between 0 and 100 and map_y between 0 and 100)));
  end if;
end $$;

create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists events_created_by_idx on public.events (created_by);

alter table public.events enable row level security;

grant select, insert, delete on public.events to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                 and policyname = 'Events are readable by signed-in users') then
    create policy "Events are readable by signed-in users"
      on public.events for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                 and policyname = 'Users can post their own student events') then
    create policy "Users can post their own student events"
      on public.events for insert to authenticated
      with check (auth.uid() = created_by and source = 'student');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                 and policyname = 'Users can delete their own student events') then
    create policy "Users can delete their own student events"
      on public.events for delete to authenticated
      using (auth.uid() = created_by and source = 'student');
  end if;
end $$;

-- Going / Saved. Rows disappear with their event or their user.
create table if not exists public.event_attendees (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table if not exists public.saved_events (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists event_attendees_event_idx on public.event_attendees (event_id);
create index if not exists saved_events_event_idx on public.saved_events (event_id);

alter table public.event_attendees enable row level security;
alter table public.saved_events enable row level security;

grant select, insert, delete on public.event_attendees to authenticated;
grant select, insert, delete on public.saved_events to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['event_attendees', 'saved_events'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                   and policyname = 'Users can read their own rows') then
      execute format('create policy "Users can read their own rows" on public.%I
                        for select to authenticated using (auth.uid() = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                   and policyname = 'Users can add their own rows') then
      execute format('create policy "Users can add their own rows" on public.%I
                        for insert to authenticated with check (auth.uid() = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                   and policyname = 'Users can remove their own rows') then
      execute format('create policy "Users can remove their own rows" on public.%I
                        for delete to authenticated using (auth.uid() = user_id)', t);
    end if;
  end loop;
end $$;

-- Realtime: broadcast inserts and deletes on events to subscribed clients.
-- DELETE payloads carry the primary key (id), which is all the app needs.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;
