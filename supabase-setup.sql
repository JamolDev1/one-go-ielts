-- Run this in Supabase Dashboard -> SQL Editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_exam_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email, '@', 1)),
    'student'
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_exam_user_created on auth.users;
create trigger on_exam_user_created after insert on auth.users
for each row execute procedure public.handle_new_exam_user();

create table if not exists public.exam_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete restrict,
  student_name text not null,
  started_at timestamptz,
  submitted_at timestamptz not null default now(),
  answers jsonb not null default '{}'::jsonb,
  user_agent text
);
create index if not exists exam_submissions_submitted_at_idx on public.exam_submissions(submitted_at desc);

alter table public.profiles enable row level security;
alter table public.exam_submissions enable row level security;

create or replace function public.is_exam_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Profiles: students can read only their own role; admins can read profiles for management.
drop policy if exists "profile read own or admin" on public.profiles;
create policy "profile read own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_exam_admin());

-- Students can submit only under their own auth ID. No student read/update/delete access.
drop policy if exists "student submit own exam" on public.exam_submissions;
create policy "student submit own exam" on public.exam_submissions for insert to authenticated
with check (student_id = auth.uid());
drop policy if exists "admin read submissions" on public.exam_submissions;
create policy "admin read submissions" on public.exam_submissions for select to authenticated
using (public.is_exam_admin());

-- No update/delete policies are intentionally created for student submissions.
-- After creating your own teacher account, promote it with this statement (replace username):
-- update public.profiles set role = 'admin' where username = 'teacher';
