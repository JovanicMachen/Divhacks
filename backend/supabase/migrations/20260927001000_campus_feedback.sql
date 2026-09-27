-- Campus notes shared from Ask Gemini.
-- Additive: creates the table if it's missing and never drops or renames anything.
-- Every signed-in student can read the notes. A student can only add or remove their own.

begin;

create table if not exists public.campus_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null,
  question text not null,
  answer text not null,
  event_id text,
  created_at timestamptz not null default now(),
  constraint campus_feedback_author_len check (char_length(author_name) between 1 and 80),
  constraint campus_feedback_question_len check (char_length(question) between 1 and 280),
  constraint campus_feedback_answer_len check (char_length(answer) between 1 and 500)
);

alter table public.campus_feedback enable row level security;
grant select, insert, delete on public.campus_feedback to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'campus_feedback' and cmd = 'SELECT'
  ) then
    create policy "Signed-in students can read campus feedback"
      on public.campus_feedback for select to authenticated
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'campus_feedback' and cmd = 'INSERT'
  ) then
    create policy "Students can share their own feedback"
      on public.campus_feedback for insert to authenticated
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'campus_feedback' and cmd = 'DELETE'
  ) then
    create policy "Students can remove their own feedback"
      on public.campus_feedback for delete to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists campus_feedback_created_idx on public.campus_feedback (created_at desc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'campus_feedback'
     ) then
    alter publication supabase_realtime add table public.campus_feedback;
  end if;
end $$;

commit;
