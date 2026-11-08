-- 0013: in-app feedback ("Send feedback" in Me → Feedback & community).
-- Players can send ideas / bug reports / other notes. They can't read anyone's feedback, including
-- their own. The owner reads it in the Supabase Table Editor (table `feedback`) or SQL Editor.
-- Banned players can still send feedback (useful for appeals). Max 10 messages per player per day.
-- Safe to run more than once.

create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references auth.users (id) on delete set null,
  category     text not null default 'idea' check (category in ('idea', 'bug', 'other')),
  message      text not null check (char_length(btrim(message)) between 3 and 2000 and char_length(message) <= 2000),
  app_version  text check (app_version is null or char_length(app_version) <= 40),
  platform     text check (platform is null or platform in ('ios', 'android', 'web')),
  status       text not null default 'new' check (status in ('new', 'read', 'done')),
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'feedback_created_idx') then
    create index feedback_created_idx on public.feedback (created_at desc);
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'feedback_profile_created_idx') then
    create index feedback_profile_created_idx on public.feedback (profile_id, created_at desc);
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.feedback'::regclass) then
    alter table public.feedback enable row level security;
  end if;
end $$;

-- Clients may insert only; never read, update or delete. Only these columns can be set.
revoke all on table public.feedback from anon, authenticated;
grant insert (profile_id, category, message, app_version, platform) on table public.feedback to authenticated;
grant all on table public.feedback to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedback' and policyname = 'feedback_insert_own') then
    create policy feedback_insert_own on public.feedback
      for insert to authenticated
      with check (profile_id = auth.uid());
  end if;
end $$;

-- Daily cap per player (10). Runs as definer so it can count rows the player can't read.
create or replace function public.feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is not null and (
    select count(*) from public.feedback
    where profile_id = new.profile_id and created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'You have sent a lot of feedback today. Thanks! Try again tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.feedback_rate_limit() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'feedback_rate_limit' and tgrelid = 'public.feedback'::regclass) then
    create trigger feedback_rate_limit before insert on public.feedback
      for each row execute function public.feedback_rate_limit();
  end if;
end $$;
