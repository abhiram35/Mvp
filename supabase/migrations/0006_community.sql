-- ─────────────────────────────────────────────────────────────────────────────
-- GG 0006 – Community (blog / forum): takes and questions, replies, GGs
-- Implements the "Community" section of src/lib/types.ts exactly.
-- Counters (gg_count, reply_count, last_activity_at) and solved_reply_id are
-- server-maintained: users cannot write them (column-level privileges).
-- GGs can only be given / removed through toggle_post_gg / toggle_reply_gg.
-- Safe to run again.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── community_posts ─────────────────────────────────────────────────────────
create table if not exists public.community_posts (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references public.profiles (id) on delete cascade,
  kind              text not null check (kind in ('take','question')),
  game_id           text references public.games (id) on delete set null,
  title             text not null check (char_length(btrim(title)) between 5 and 120 and char_length(title) <= 120),
  body              text not null check (char_length(btrim(body)) >= 1 and char_length(body) <= 5000),
  solved_reply_id   uuid, -- FK to community_replies added below (circular reference)
  gg_count          integer not null default 0 check (gg_count >= 0),
  reply_count       integer not null default 0 check (reply_count >= 0),
  last_activity_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint community_posts_solution_only_questions
    check (solved_reply_id is null or kind = 'question')
);
create index if not exists community_posts_created_idx        on public.community_posts (created_at desc);
create index if not exists community_posts_last_activity_idx  on public.community_posts (last_activity_at desc);
create index if not exists community_posts_game_created_idx   on public.community_posts (game_id, created_at desc);
create index if not exists community_posts_kind_replies_idx   on public.community_posts (kind, reply_count);
create index if not exists community_posts_author_id_idx      on public.community_posts (author_id);
create index if not exists community_posts_solved_reply_idx   on public.community_posts (solved_reply_id)
  where solved_reply_id is not null;

-- ── community_replies ───────────────────────────────────────────────────────
create table if not exists public.community_replies (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.community_posts (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) >= 1 and char_length(body) <= 3000),
  gg_count    integer not null default 0 check (gg_count >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists community_replies_post_created_idx on public.community_replies (post_id, created_at);
create index if not exists community_replies_author_id_idx    on public.community_replies (author_id);

-- Circular FK: the solution reply. Deleting that reply clears the solution.
alter table public.community_posts
  drop constraint if exists community_posts_solved_reply_id_fkey;
alter table public.community_posts
  add constraint community_posts_solved_reply_id_fkey
  foreign key (solved_reply_id) references public.community_replies (id) on delete set null;

-- ── GG tables ───────────────────────────────────────────────────────────────
create table if not exists public.community_post_ggs (
  post_id     uuid not null references public.community_posts (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, profile_id)
);
create index if not exists community_post_ggs_profile_id_idx on public.community_post_ggs (profile_id);

create table if not exists public.community_reply_ggs (
  reply_id    uuid not null references public.community_replies (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (reply_id, profile_id)
);
create index if not exists community_reply_ggs_profile_id_idx on public.community_reply_ggs (profile_id);

-- ── Triggers ────────────────────────────────────────────────────────────────

-- updated_at only moves when the user-editable content changes (not on counter
-- updates), so the app can show "edited" when updated_at > created_at.
create or replace function public.handle_community_post_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.game_id is distinct from old.game_id then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_before_update on public.community_posts;
create trigger community_posts_before_update
  before update on public.community_posts
  for each row execute function public.handle_community_post_updated();

create or replace function public.handle_community_reply_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.body is distinct from old.body then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists community_replies_before_update on public.community_replies;
create trigger community_replies_before_update
  before update on public.community_replies
  for each row execute function public.handle_community_reply_updated();

-- reply_count + last_activity_at
create or replace function public.handle_community_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set reply_count = reply_count + 1,
           last_activity_at = greatest(last_activity_at, new.created_at)
     where id = new.post_id;
    return new;
  else
    update public.community_posts
       set reply_count = greatest(reply_count - 1, 0)
     where id = old.post_id;
    return old;
  end if;
end;
$$;

drop trigger if exists community_replies_after_insert_delete on public.community_replies;
create trigger community_replies_after_insert_delete
  after insert or delete on public.community_replies
  for each row execute function public.handle_community_reply_count();

-- gg_count on posts
create or replace function public.handle_community_post_gg_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set gg_count = gg_count + 1 where id = new.post_id;
    return new;
  else
    update public.community_posts set gg_count = greatest(gg_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;

drop trigger if exists community_post_ggs_after_insert_delete on public.community_post_ggs;
create trigger community_post_ggs_after_insert_delete
  after insert or delete on public.community_post_ggs
  for each row execute function public.handle_community_post_gg_count();

-- gg_count on replies
create or replace function public.handle_community_reply_gg_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_replies set gg_count = gg_count + 1 where id = new.reply_id;
    return new;
  else
    update public.community_replies set gg_count = greatest(gg_count - 1, 0) where id = old.reply_id;
    return old;
  end if;
end;
$$;

drop trigger if exists community_reply_ggs_after_insert_delete on public.community_reply_ggs;
create trigger community_reply_ggs_after_insert_delete
  after insert or delete on public.community_reply_ggs
  for each row execute function public.handle_community_reply_gg_count();

revoke all on function public.handle_community_post_updated()   from public, anon, authenticated;
revoke all on function public.handle_community_reply_updated()  from public, anon, authenticated;
revoke all on function public.handle_community_reply_count()    from public, anon, authenticated;
revoke all on function public.handle_community_post_gg_count()  from public, anon, authenticated;
revoke all on function public.handle_community_reply_gg_count() from public, anon, authenticated;

-- ── RLS + privileges ────────────────────────────────────────────────────────
alter table public.community_posts     enable row level security;
alter table public.community_replies   enable row level security;
alter table public.community_post_ggs  enable row level security;
alter table public.community_reply_ggs enable row level security;

revoke all on table
  public.community_posts, public.community_replies,
  public.community_post_ggs, public.community_reply_ggs
from anon, authenticated;

grant select, delete                                  on public.community_posts     to authenticated;
grant insert (id, author_id, kind, game_id, title, body) on public.community_posts  to authenticated;
grant update (title, body, game_id)                   on public.community_posts     to authenticated;
grant select, delete                                  on public.community_replies   to authenticated;
grant insert (id, post_id, author_id, body)           on public.community_replies   to authenticated;
grant update (body)                                   on public.community_replies   to authenticated;
grant select                                          on public.community_post_ggs  to authenticated;
grant select                                          on public.community_reply_ggs to authenticated;

-- community_posts: everyone signed in reads, except across a block (either way).
drop policy if exists community_posts_select on public.community_posts;
create policy community_posts_select on public.community_posts
  for select to authenticated
  using (not public.is_blocked_between(auth.uid(), author_id));

drop policy if exists community_posts_insert_own on public.community_posts;
create policy community_posts_insert_own on public.community_posts
  for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists community_posts_update_own on public.community_posts;
create policy community_posts_update_own on public.community_posts
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists community_posts_delete_own on public.community_posts;
create policy community_posts_delete_own on public.community_posts
  for delete to authenticated using (author_id = auth.uid());

-- community_replies: hidden across a block (either way, with the reply author).
-- Rows also need the parent post to be visible (posts policy hides blocked authors).
drop policy if exists community_replies_select on public.community_replies;
create policy community_replies_select on public.community_replies
  for select to authenticated
  using (
    not public.is_blocked_between(auth.uid(), author_id)
    and exists (select 1 from public.community_posts p where p.id = community_replies.post_id)
  );

-- Reply as yourself, to a post whose author has no block with you.
drop policy if exists community_replies_insert_own on public.community_replies;
create policy community_replies_insert_own on public.community_replies
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.community_posts p
      where p.id = community_replies.post_id
        and not public.is_blocked_between(auth.uid(), p.author_id)
    )
  );

drop policy if exists community_replies_update_own on public.community_replies;
create policy community_replies_update_own on public.community_replies
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- Delete your own reply, or any reply on your own post (moderating your thread).
drop policy if exists community_replies_delete on public.community_replies;
create policy community_replies_delete on public.community_replies
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.community_posts p
               where p.id = community_replies.post_id and p.author_id = auth.uid())
  );

-- GG rows: users may read their own; all writes go through the toggle RPCs.
drop policy if exists community_post_ggs_select_own on public.community_post_ggs;
create policy community_post_ggs_select_own on public.community_post_ggs
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists community_reply_ggs_select_own on public.community_reply_ggs;
create policy community_reply_ggs_select_own on public.community_reply_ggs
  for select to authenticated using (profile_id = auth.uid());

-- ── RPCs ────────────────────────────────────────────────────────────────────

-- list_community_posts(...) → setof jsonb (CommunityPostSummary)
-- Each row: { "post": CommunityPost, "author": {id, username, display_name, avatar_url},
--             "has_gg": bool, "is_solved": bool }
create or replace function public.list_community_posts(
  p_sort     text,
  p_kind     text,
  p_game_id  text,
  p_search   text,
  p_limit    integer default 20,
  p_offset   integer default 0
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  v_sort   text := coalesce(p_sort, 'hot');
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_like   text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v_sort not in ('hot','new','unanswered') then
    raise exception 'Unknown sort: %', v_sort using errcode = '22023';
  end if;
  if p_kind is not null and p_kind not in ('take','question') then
    raise exception 'Unknown post kind: %', p_kind using errcode = '22023';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(left(v_search, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select jsonb_build_object(
           'post', to_jsonb(p),
           'author', jsonb_build_object('id', a.id, 'username', a.username,
                                        'display_name', a.display_name, 'avatar_url', a.avatar_url),
           'has_gg', exists (select 1 from public.community_post_ggs g
                             where g.post_id = p.id and g.profile_id = me),
           'is_solved', (p.kind = 'question' and p.solved_reply_id is not null)
         )
  from public.community_posts p
  join public.profiles a on a.id = p.author_id
  where (p_kind is null or p.kind = p_kind)
    and (p_game_id is null or p.game_id = p_game_id)
    and (v_sort <> 'unanswered' or (p.kind = 'question' and p.reply_count = 0))
    and (v_like is null or p.title ilike v_like or p.body ilike v_like)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me and b.blocked_id = p.author_id)
         or (b.blocker_id = p.author_id and b.blocked_id = me)
    )
  order by
    case when v_sort = 'hot' then
      (p.gg_count + 2 * p.reply_count + 1)::double precision
      / power(greatest(extract(epoch from (now() - p.created_at))::double precision, 0) / 3600.0 + 2, 1.5)
    end desc nulls last,
    p.created_at desc,
    p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- get_community_post(p_post_id) → setof jsonb (0 or 1 CommunityPostSummary)
create or replace function public.get_community_post(p_post_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
           'post', to_jsonb(p),
           'author', jsonb_build_object('id', a.id, 'username', a.username,
                                        'display_name', a.display_name, 'avatar_url', a.avatar_url),
           'has_gg', exists (select 1 from public.community_post_ggs g
                             where g.post_id = p.id and g.profile_id = me),
           'is_solved', (p.kind = 'question' and p.solved_reply_id is not null)
         )
  from public.community_posts p
  join public.profiles a on a.id = p.author_id
  where p.id = p_post_id
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me and b.blocked_id = p.author_id)
         or (b.blocker_id = p.author_id and b.blocked_id = me)
    );
end;
$$;

-- list_community_replies(p_post_id, p_limit, p_offset) → setof jsonb (CommunityReplyItem)
-- Each row: { "reply": CommunityReply, "author": {...}, "has_gg": bool, "is_solution": bool }
-- Solution first, then oldest first. Nothing if the post is missing or its author is blocked either way.
create or replace function public.list_community_replies(
  p_post_id  uuid,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  v_post public.community_posts%rowtype;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_post from public.community_posts where id = p_post_id;
  if not found then
    return;
  end if;
  if exists (select 1 from public.blocks b
             where (b.blocker_id = me and b.blocked_id = v_post.author_id)
                or (b.blocker_id = v_post.author_id and b.blocked_id = me)) then
    return;
  end if;

  return query
  select jsonb_build_object(
           'reply', to_jsonb(r),
           'author', jsonb_build_object('id', a.id, 'username', a.username,
                                        'display_name', a.display_name, 'avatar_url', a.avatar_url),
           'has_gg', exists (select 1 from public.community_reply_ggs g
                             where g.reply_id = r.id and g.profile_id = me),
           'is_solution', coalesce(r.id = v_post.solved_reply_id, false)
         )
  from public.community_replies r
  join public.profiles a on a.id = r.author_id
  where r.post_id = p_post_id
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me and b.blocked_id = r.author_id)
         or (b.blocker_id = r.author_id and b.blocked_id = me)
    )
  order by coalesce(r.id = v_post.solved_reply_id, false) desc, r.created_at asc, r.id asc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- toggle_post_gg(p_post_id) → jsonb { "has_gg": bool, "gg_count": int }
create or replace function public.toggle_post_gg(p_post_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  v_author uuid;
  v_has    boolean;
  v_count  integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select author_id into v_author from public.community_posts where id = p_post_id;
  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if v_author = me then
    raise exception 'You cannot GG your own post' using errcode = '22023';
  end if;
  if exists (select 1 from public.blocks b
             where (b.blocker_id = me and b.blocked_id = v_author)
                or (b.blocker_id = v_author and b.blocked_id = me)) then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  delete from public.community_post_ggs where post_id = p_post_id and profile_id = me;
  if found then
    v_has := false;
  else
    insert into public.community_post_ggs (post_id, profile_id) values (p_post_id, me)
    on conflict (post_id, profile_id) do nothing;
    v_has := true;
  end if;

  select gg_count into v_count from public.community_posts where id = p_post_id;
  return jsonb_build_object('has_gg', v_has, 'gg_count', coalesce(v_count, 0));
end;
$$;

-- toggle_reply_gg(p_reply_id) → jsonb { "has_gg": bool, "gg_count": int }
create or replace function public.toggle_reply_gg(p_reply_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me            uuid := auth.uid();
  v_author      uuid;
  v_post_author uuid;
  v_has         boolean;
  v_count       integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select r.author_id, p.author_id into v_author, v_post_author
  from public.community_replies r
  join public.community_posts p on p.id = r.post_id
  where r.id = p_reply_id;
  if not found then
    raise exception 'Reply not found' using errcode = 'P0002';
  end if;
  if v_author = me then
    raise exception 'You cannot GG your own reply' using errcode = '22023';
  end if;
  if exists (select 1 from public.blocks b
             where (b.blocker_id = me and b.blocked_id in (v_author, v_post_author))
                or (b.blocked_id = me and b.blocker_id in (v_author, v_post_author))) then
    raise exception 'Reply not found' using errcode = 'P0002';
  end if;

  delete from public.community_reply_ggs where reply_id = p_reply_id and profile_id = me;
  if found then
    v_has := false;
  else
    insert into public.community_reply_ggs (reply_id, profile_id) values (p_reply_id, me)
    on conflict (reply_id, profile_id) do nothing;
    v_has := true;
  end if;

  select gg_count into v_count from public.community_replies where id = p_reply_id;
  return jsonb_build_object('has_gg', v_has, 'gg_count', coalesce(v_count, 0));
end;
$$;

-- set_solution(p_post_id, p_reply_id) → void. Post author only, questions only.
-- p_reply_id null clears the solution.
create or replace function public.set_solution(p_post_id uuid, p_reply_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  v_post public.community_posts%rowtype;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_post from public.community_posts where id = p_post_id for update;
  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if v_post.author_id <> me then
    raise exception 'Only the author can choose the answer' using errcode = '42501';
  end if;
  if v_post.kind <> 'question' then
    raise exception 'Only questions can have an answer' using errcode = '22023';
  end if;
  if p_reply_id is not null and not exists (
       select 1 from public.community_replies r
       where r.id = p_reply_id and r.post_id = p_post_id) then
    raise exception 'That reply is not on this post' using errcode = '22023';
  end if;

  update public.community_posts set solved_reply_id = p_reply_id where id = p_post_id;
end;
$$;

revoke all on function public.list_community_posts(text, text, text, text, integer, integer) from public, anon;
revoke all on function public.get_community_post(uuid)                                      from public, anon;
revoke all on function public.list_community_replies(uuid, integer, integer)                from public, anon;
revoke all on function public.toggle_post_gg(uuid)                                          from public, anon;
revoke all on function public.toggle_reply_gg(uuid)                                         from public, anon;
revoke all on function public.set_solution(uuid, uuid)                                      from public, anon;

grant execute on function public.list_community_posts(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.get_community_post(uuid)                                      to authenticated;
grant execute on function public.list_community_replies(uuid, integer, integer)                to authenticated;
grant execute on function public.toggle_post_gg(uuid)                                          to authenticated;
grant execute on function public.toggle_reply_gg(uuid)                                         to authenticated;
grant execute on function public.set_solution(uuid, uuid)                                      to authenticated;

-- ── Reports: allow community_post / community_reply targets ─────────────────
-- 0001 left the target_type CHECK unnamed; drop whichever CHECK covers
-- target_type, then add a named one.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.reports'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%target_type%'
  loop
    execute format('alter table public.reports drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('profile','message','lfg_post','community_post','community_reply'));

-- ── Realtime: open threads update live (RLS still applies) ──────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_replies'
  ) then
    alter publication supabase_realtime add table public.community_replies;
  end if;
end;
$$;
