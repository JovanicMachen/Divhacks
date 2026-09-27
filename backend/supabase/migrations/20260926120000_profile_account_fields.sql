-- Campus Connect: fields used by /profile and /profile/edit.
-- Additive and re-runnable: never drops or renames existing columns, and does
-- not add a signup trigger (the app inserts the user's own row only if none exists).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade
);

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists username text,
  add column if not exists bio text,
  add column if not exists website text,
  add column if not exists university text default 'Columbia University',
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz default now();

-- NOT VALID: enforce on new writes without failing on any existing rows.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles
      add constraint profiles_username_format
      check (username is null or username ~ '^[a-z0-9._]{3,30}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length') then
    alter table public.profiles
      add constraint profiles_bio_length
      check (bio is null or char_length(bio) <= 150) not valid;
  end if;
end $$;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

-- Row Level Security: anyone signed in can read profiles; only the owner writes.
alter table public.profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'Profiles are readable by signed-in users') then
    create policy "Profiles are readable by signed-in users"
      on public.profiles for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'Users can insert their own profile') then
    create policy "Users can insert their own profile"
      on public.profiles for insert to authenticated with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'Users can update their own profile') then
    create policy "Users can update their own profile"
      on public.profiles for update to authenticated
      using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;

-- Storage: public "avatars" bucket; each user writes only under "<their uuid>/".
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'Avatar images are publicly readable') then
    create policy "Avatar images are publicly readable"
      on storage.objects for select using (bucket_id = 'avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'Users can upload their own avatar') then
    create policy "Users can upload their own avatar"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'Users can update their own avatar') then
    create policy "Users can update their own avatar"
      on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and policyname = 'Users can delete their own avatar') then
    create policy "Users can delete their own avatar"
      on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
