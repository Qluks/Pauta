-- Schema atual do Pauta. Pode ser executado em um projeto novo ou existente.
-- A migração preserva os registros atuais. Prazos antigos com horário são
-- copiados para due_at_legacy antes de due_at virar a data usada pelo app.

create extension if not exists pgcrypto;

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  color smallint,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.lists add column if not exists color smallint;
alter table public.lists add column if not exists position integer;
alter table public.lists add column if not exists created_at timestamptz not null default now();
with ordered as (
  select id, row_number() over (partition by user_id order by created_at, id) - 1 as next_position
  from public.lists
)
update public.lists l set position = ordered.next_position
from ordered where l.id = ordered.id and l.position is null;
alter table public.lists alter column position set default 0;
alter table public.lists alter column position set not null;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_at date,
  due_time time,
  notified_at timestamptz,
  priority smallint not null default 0,
  list_id uuid references public.lists(id) on delete set null,
  tags text[] not null default '{}',
  recurrence text,
  snoozed_until date,
  checklist jsonb not null default '[]'::jsonb
);

alter table public.tasks add column if not exists updated_at timestamptz not null default now();
alter table public.tasks add column if not exists due_time time;
alter table public.tasks add column if not exists notified_at timestamptz;
alter table public.tasks add column if not exists priority smallint not null default 0;
alter table public.tasks add column if not exists list_id uuid;
alter table public.tasks add column if not exists tags text[] not null default '{}';
alter table public.tasks add column if not exists recurrence text;
alter table public.tasks add column if not exists snoozed_until date;
alter table public.tasks add column if not exists checklist jsonb not null default '[]'::jsonb;

do $$
declare
  due_type text;
begin
  select data_type into due_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'tasks' and column_name = 'due_at';
  if due_type in ('timestamp with time zone', 'timestamp without time zone') then
    alter table public.tasks add column if not exists due_at_legacy timestamptz;
    update public.tasks set due_at_legacy = due_at where due_at is not null and due_at_legacy is null;
  end if;
end $$;

alter table public.tasks alter column due_at type date using due_at::date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_list_id_fkey' and conrelid = 'public.tasks'::regclass) then
    alter table public.tasks add constraint tasks_list_id_fkey
      foreign key (list_id) references public.lists(id) on delete set null not valid;
  end if;
end $$;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default '',
  body text not null default '',
  color text,
  tags text[] not null default '{}',
  checklist jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  archived boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes add column if not exists title text not null default '';
alter table public.notes add column if not exists body text not null default '';
alter table public.notes add column if not exists color text;
alter table public.notes add column if not exists tags text[] not null default '{}';
alter table public.notes add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table public.notes add column if not exists pinned boolean not null default false;
alter table public.notes add column if not exists archived boolean not null default false;
alter table public.notes add column if not exists position integer;
alter table public.notes add column if not exists created_at timestamptz not null default now();
alter table public.notes add column if not exists updated_at timestamptz not null default now();
with ordered as (
  select id, row_number() over (partition by user_id order by updated_at desc, created_at desc, id) - 1 as next_position
  from public.notes
)
update public.notes n set position = ordered.next_position
from ordered where n.id = ordered.id and n.position is null;
alter table public.notes alter column position set default 0;
alter table public.notes alter column position set not null;

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  note_id uuid references public.notes(id) on delete cascade,
  kind text not null check (kind in ('link', 'file')),
  title text not null default '',
  url text,
  path text,
  mime text,
  size bigint,
  created_at timestamptz not null default now(),
  constraint attachments_single_owner check ((task_id is null) <> (note_id is null))
);

alter table public.attachments add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.attachments add column if not exists note_id uuid references public.notes(id) on delete cascade;
alter table public.attachments add column if not exists kind text;
alter table public.attachments add column if not exists title text not null default '';
alter table public.attachments add column if not exists url text;
alter table public.attachments add column if not exists path text;
alter table public.attachments add column if not exists mime text;
alter table public.attachments add column if not exists size bigint;
alter table public.attachments add column if not exists created_at timestamptz not null default now();

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  tz text not null default 'America/Sao_Paulo',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions add column if not exists p256dh text not null default '';
alter table public.push_subscriptions add column if not exists auth text not null default '';
alter table public.push_subscriptions add column if not exists tz text not null default 'America/Sao_Paulo';
alter table public.push_subscriptions add column if not exists user_agent text not null default '';
alter table public.push_subscriptions add column if not exists created_at timestamptz not null default now();

create table if not exists public.calendar_feed_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create or replace function public.touch_task_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
before update on public.tasks
for each row execute function public.touch_task_updated_at();

create index if not exists tasks_user_due_idx on public.tasks (user_id, due_at);
create index if not exists tasks_user_list_idx on public.tasks (user_id, list_id);
create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index if not exists attachments_user_task_idx on public.attachments (user_id, task_id);
create index if not exists attachments_user_note_idx on public.attachments (user_id, note_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.attachments enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.calendar_feed_tokens enable row level security;

grant select, insert, update, delete on public.lists, public.tasks, public.notes, public.attachments, public.push_subscriptions to authenticated;
revoke all on public.calendar_feed_tokens from anon, authenticated;

create or replace function public.create_calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  raw_token text := encode(gen_random_bytes(32), 'hex');
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.calendar_feed_tokens (user_id, token_hash)
  values (current_user_id, encode(digest(raw_token, 'sha256'), 'hex'))
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = now();

  return raw_token;
end;
$$;

create or replace function public.revoke_calendar_feed_token()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.calendar_feed_tokens where user_id = auth.uid();
end;
$$;

revoke all on function public.create_calendar_feed_token() from public, anon;
revoke all on function public.revoke_calendar_feed_token() from public, anon;
grant execute on function public.create_calendar_feed_token() to authenticated;
grant execute on function public.revoke_calendar_feed_token() to authenticated;

drop policy if exists "own lists" on public.lists;
create policy "own lists" on public.lists for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (list_id is null or exists (
      select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()
    ))
  );

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own attachments" on public.attachments;
create policy "own attachments" on public.attachments for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      (task_id is not null and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()))
      or
      (note_id is not null and exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()))
    )
  );

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "Users can read own attachment files" on storage.objects;
create policy "Users can read own attachment files" on storage.objects for select
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can upload own attachment files" on storage.objects;
create policy "Users can upload own attachment files" on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can delete own attachment files" on storage.objects;
create policy "Users can delete own attachment files" on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.tasks; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.lists; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.notes; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.attachments; exception when duplicate_object then null; end;
  end if;
end $$;
