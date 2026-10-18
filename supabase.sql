-- Rode no SQL Editor do Supabase.
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  notes text,
  due_at timestamptz,
  priority smallint default 0,
  done boolean default false,
  done_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tasks enable row level security;

create policy "own tasks" on tasks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
