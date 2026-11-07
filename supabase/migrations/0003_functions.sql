-- ─────────────────────────────────────────────────────────────────────────────
-- SquadUp 0003 – RPC functions (see RpcFunctions in src/lib/types.ts) + triggers
-- All RPCs are SECURITY DEFINER with a fixed search_path, check auth.uid(),
-- and validate permissions themselves (arguments are never trusted).
-- Expired LFG posts are not closed by a job: the app filters expires_at > now().
-- ─────────────────────────────────────────────────────────────────────────────

-- ── get_or_create_dm(other_id) → uuid ───────────────────────────────────────
create or replace function public.get_or_create_dm(other_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  cid uuid;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if other_id is null or other_id = me then
    raise exception 'You cannot message yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'Finish setting up your profile first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.blocks
             where (blocker_id = me and blocked_id = other_id)
                or (blocker_id = other_id and blocked_id = me)) then
    raise exception 'You cannot message this player' using errcode = '42501';
  end if;

  -- Serialise concurrent calls for the same pair so only one DM is created.
  perform pg_advisory_xact_lock(
    hashtextextended(least(me, other_id)::text || ':' || greatest(me, other_id)::text, 0));

  select c.id into cid
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.profile_id = me
  join public.conversation_members b on b.conversation_id = c.id and b.profile_id = other_id
  where c.is_group = false
  order by c.created_at
  limit 1;

  if cid is null then
    insert into public.conversations (is_group) values (false) returning id into cid;
    insert into public.conversation_members (conversation_id, profile_id)
    values (cid, me), (cid, other_id);
  end if;

  return cid;
end;
$$;

-- ── accept_lfg_request(request_id) → uuid (conversation id) ─────────────────
create or replace function public.accept_lfg_request(request_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  req       public.lfg_requests%rowtype;
  post      public.lfg_posts%rowtype;
  cid       uuid;
  accepted  integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into req from public.lfg_requests r where r.id = accept_lfg_request.request_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  -- Lock the post row so concurrent accepts cannot overfill it.
  select * into post from public.lfg_posts p where p.id = req.post_id for update;
  if not found or post.author_id <> me then
    raise exception 'Only the post author can accept requests' using errcode = '42501';
  end if;

  if req.status = 'accepted' then
    return post.conversation_id; -- idempotent
  end if;
  if post.status = 'closed' then
    raise exception 'This post is closed' using errcode = '22023';
  end if;
  if post.status = 'full' then
    raise exception 'This squad is already full' using errcode = '22023';
  end if;
  if exists (select 1 from public.blocks
             where (blocker_id = me and blocked_id = req.requester_id)
                or (blocker_id = req.requester_id and blocked_id = me)) then
    raise exception 'You cannot accept this player' using errcode = '42501';
  end if;

  cid := post.conversation_id;
  if cid is null then
    insert into public.conversations (is_group, title, lfg_post_id)
    values (true, post.title, post.id)
    returning id into cid;
    update public.lfg_posts set conversation_id = cid where id = post.id;
  end if;

  insert into public.conversation_members (conversation_id, profile_id)
  values (cid, me), (cid, req.requester_id)
  on conflict (conversation_id, profile_id) do nothing;

  update public.lfg_requests set status = 'accepted' where id = req.id;

  select count(*) into accepted
  from public.lfg_requests r
  where r.post_id = post.id and r.status = 'accepted';

  if accepted >= post.slots_needed then
    update public.lfg_posts set status = 'full' where id = post.id;
  end if;

  return cid;
end;
$$;

-- ── find_squadmates(...) → setof jsonb (SquadmateMatch) ─────────────────────
-- Each row: { "profile": Profile, "game": ProfileGame, "match_score": int, "shared_languages": text[] }
-- Score: same region +30, shared languages +15 each (max +30), same play style
-- (or either 'both') +20, overlapping play times +5 each, both have mic +10; cap 100.
create or replace function public.find_squadmates(
  p_game_id     text,
  p_region      text,
  p_language    text,
  p_play_style  text,
  p_limit       integer default 30
)
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
  if p_game_id is null then
    raise exception 'Choose a game' using errcode = '22023';
  end if;

  return query
  with caller as (
    select p.region, p.languages, p.play_style, p.has_mic, p.play_times
    from public.profiles p where p.id = me
  ),
  candidates as (
    select pr, pg,
      coalesce(array(
        select l from unnest(pr.languages) l
        where l = any (coalesce((select c.languages from caller c), '{}'::text[]))
        order by l
      ), '{}'::text[]) as shared,
      (
        case when pr.region = (select c.region from caller c) then 30 else 0 end
        + least(15 * cardinality(array(
            select l from unnest(pr.languages) l
            where l = any (coalesce((select c.languages from caller c), '{}'::text[])))), 30)
        + case when pr.play_style = (select c.play_style from caller c)
                 or 'both' in (pr.play_style, (select c.play_style from caller c))
               then 20 else 0 end
        + 5 * cardinality(array(
            select t from unnest(pr.play_times) t
            where t = any (coalesce((select c.play_times from caller c), '{}'::text[]))))
        + case when pr.has_mic and coalesce((select c.has_mic from caller c), false) then 10 else 0 end
      ) as raw_score
    from public.profile_games pg
    join public.profiles pr on pr.id = pg.profile_id
    where pg.game_id = p_game_id
      and pr.id <> me
      and (p_region is null or pr.region = p_region)
      and (p_language is null or p_language = any (pr.languages))
      and (p_play_style is null or pr.play_style = p_play_style or pr.play_style = 'both')
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me and b.blocked_id = pr.id)
           or (b.blocker_id = pr.id and b.blocked_id = me)
      )
  )
  select jsonb_build_object(
           'profile', to_jsonb(c.pr),
           'game', to_jsonb(c.pg),
           'match_score', least(c.raw_score, 100),
           'shared_languages', to_jsonb(c.shared)
         )
  from candidates c
  order by least(c.raw_score, 100) desc, (c.pr).created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

-- ── list_my_conversations() → ConversationSummary rows ──────────────────────
create or replace function public.list_my_conversations()
returns table (
  conversation_id   uuid,
  is_group          boolean,
  title             text,
  avatar_url        text,
  other_profile_id  uuid,
  last_message      text,
  last_message_at   timestamptz,
  unread_count      integer
)
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
  select
    c.id,
    c.is_group,
    case when c.is_group then coalesce(c.title, 'Squad chat')
         else coalesce(op.display_name, 'Deleted player') end,
    case when c.is_group then null::text else op.avatar_url end,
    case when c.is_group then null::uuid else op.id end,
    lm.body,
    c.last_message_at,
    coalesce((
      select count(*)::integer from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> me
        and m.created_at > mine.last_read_at
    ), 0)
  from public.conversation_members mine
  join public.conversations c on c.id = mine.conversation_id
  left join lateral (
    select p.id, p.display_name, p.avatar_url
    from public.conversation_members om
    join public.profiles p on p.id = om.profile_id
    where om.conversation_id = c.id and om.profile_id <> me
    limit 1
  ) op on not c.is_group
  left join lateral (
    select m.body from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where mine.profile_id = me
  order by c.last_message_at desc;
end;
$$;

-- ── mark_conversation_read(p_conversation_id) → void ────────────────────────
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.conversation_members
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and profile_id = me;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ── delete_my_account() → void ──────────────────────────────────────────────
-- Deleting auth.users cascades to profiles and from there to every user table.
-- Group conversations survive for the other members; empty DMs are removed.
create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- DMs the user was in: remove the whole conversation (other side loses the thread too).
  delete from public.conversations c
  where c.is_group = false
    and exists (select 1 from public.conversation_members cm
                where cm.conversation_id = c.id and cm.profile_id = me);

  -- Avatar files (rows only; Supabase removes the stored objects lazily).
  begin
    delete from storage.objects
    where bucket_id = 'avatars' and (storage.foldername(name))[1] = me::text;
  exception when others then
    null; -- never block account deletion on storage cleanup
  end;

  delete from auth.users where id = me;
end;
$$;

-- ── is_username_available(p_username) → boolean ─────────────────────────────
create or replace function public.is_username_available(p_username text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,20}$' then
    return false;
  end if;
  -- The caller's own current username counts as available (for edit profile).
  return not exists (
    select 1 from public.profiles p
    where lower(p.username) = lower(p_username)
      and p.id <> auth.uid()
  );
end;
$$;

-- ── Trigger: keep conversations.last_message_at up to date ──────────────────
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set last_message_at = greatest(last_message_at, new.created_at)
   where id = new.conversation_id;
  -- Sending a message means you have read the conversation up to now.
  update public.conversation_members
     set last_read_at = greatest(last_read_at, new.created_at)
   where conversation_id = new.conversation_id
     and profile_id = new.sender_id;
  return new;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.handle_new_message();

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on function public.get_or_create_dm(uuid)                          from public, anon;
revoke all on function public.accept_lfg_request(uuid)                        from public, anon;
revoke all on function public.find_squadmates(text, text, text, text, integer) from public, anon;
revoke all on function public.list_my_conversations()                         from public, anon;
revoke all on function public.mark_conversation_read(uuid)                    from public, anon;
revoke all on function public.delete_my_account()                             from public, anon;
revoke all on function public.is_username_available(text)                     from public, anon;
revoke all on function public.handle_new_message()                            from public, anon, authenticated;

grant execute on function public.get_or_create_dm(uuid)                          to authenticated;
grant execute on function public.accept_lfg_request(uuid)                        to authenticated;
grant execute on function public.find_squadmates(text, text, text, text, integer) to authenticated;
grant execute on function public.list_my_conversations()                         to authenticated;
grant execute on function public.mark_conversation_read(uuid)                    to authenticated;
grant execute on function public.delete_my_account()                             to authenticated;
grant execute on function public.is_username_available(text)                     to authenticated;
