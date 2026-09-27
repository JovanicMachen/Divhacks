-- Campus Connect: per-user notifications.
-- Additive and safe to run again: creates the table if it's missing, adds any
-- missing columns if it exists, and never drops, renames, or loosens anything.
--
-- Each row belongs to one signed-in user. Users can only read, mark read, and
-- remove their own rows. dedupe_key is unique per user, so the same
-- notification (for example "starts soon" for one event) is created once,
-- even when two devices generate it at the same moment.

begin;

do $$
declare
  user_type text;
begin
  if to_regclass('public.notifications') is not null then
    select data_type into user_type
      from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id';
    if user_type is distinct from 'uuid' then
      raise exception 'public.notifications already exists and its user_id is %, not uuid. Nothing was changed.',
        coalesce(user_type, 'missing');
    end if;
  end if;
end $$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  -- Text, not a foreign key: official listings use slug ids, and a notification
  -- should outlive a deleted event so the panel can say it's unavailable.
  event_id text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb
);

alter table public.notifications
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists event_id text,
  add column if not exists dedupe_key text,
  add column if not exists read_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists metadata jsonb;

-- Existing rows (if any) get a unique key so the uniqueness rule can apply.
update public.notifications set dedupe_key = id::text where dedupe_key is null;
alter table public.notifications alter column dedupe_key set not null;

do $$
begin
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id') is null then
    alter table public.notifications alter column user_id set default auth.uid();
  end if;
end $$;

create unique index if not exists notifications_user_dedupe_key on public.notifications (user_id, dedupe_key);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- Row Level Security: only the owner.
alter table public.notifications enable row level security;
grant select, insert, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications'
                  and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')) then
    create policy "Users can read their own notifications"
      on public.notifications for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications'
                  and permissive = 'PERMISSIVE' and cmd in ('INSERT', 'ALL')) then
    create policy "Users can create their own notifications"
      on public.notifications for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications'
                  and permissive = 'PERMISSIVE' and cmd in ('UPDATE', 'ALL')) then
    create policy "Users can mark their own notifications read"
      on public.notifications for update to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications'
                  and permissive = 'PERMISSIVE' and cmd in ('DELETE', 'ALL')) then
    create policy "Users can remove their own notifications"
      on public.notifications for delete to authenticated using (auth.uid() = user_id);
  end if;

  -- Restrictive: ANDed with every other policy, so no other rule can open these rows up.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications'
                  and policyname = 'Notifications are private to their owner') then
    create policy "Notifications are private to their owner"
      on public.notifications as restrictive for all to public
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Realtime: a notification created on one device appears on the owner's other devices.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

commit;

-- Read-only summary of the result.
select 'column' as kind, column_name as name, data_type as detail
  from information_schema.columns
 where table_schema = 'public' and table_name = 'notifications'
union all
select 'policy', policyname, permissive || ' ' || cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'notifications'
union all
select 'realtime', 'supabase_realtime', 'notifications published'
  from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'notifications'
order by 1, 2;
