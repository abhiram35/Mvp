-- ─────────────────────────────────────────────────────────────────────────────
-- SquadUp 0002 – row level security, privileges and helper functions
-- Every table has RLS on. Users are the `authenticated` role; `anon` gets nothing.
-- Column-level privileges stop users from changing columns that only server
-- functions may set (e.g. lfg_posts.conversation_id).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper functions (SECURITY DEFINER so they bypass RLS → no recursion) ────

create or replace function public.is_conversation_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = cid
      and cm.profile_id = auth.uid()
  );
$$;

-- True if a blocked b or b blocked a. Only answers for pairs that include the
-- caller, so it cannot be used to probe other people's block lists.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and auth.uid() in (a, b)
     and exists (
       select 1 from public.blocks bl
       where (bl.blocker_id = a and bl.blocked_id = b)
          or (bl.blocker_id = b and bl.blocked_id = a)
     );
$$;

-- True if the conversation is a DM and the caller and the other member are
-- blocked either way (used by the messages insert policy).
create or replace function public.is_dm_blocked(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    join public.blocks bl
      on (bl.blocker_id = auth.uid() and bl.blocked_id = cm.profile_id)
      or (bl.blocker_id = cm.profile_id and bl.blocked_id = auth.uid())
    where c.id = cid
      and c.is_group = false
      and cm.profile_id <> auth.uid()
  );
$$;

revoke all on function public.is_conversation_member(uuid)   from public, anon;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
revoke all on function public.is_dm_blocked(uuid)            from public, anon;
grant execute on function public.is_conversation_member(uuid)   to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function public.is_dm_blocked(uuid)            to authenticated;

-- ── Enable RLS everywhere ───────────────────────────────────────────────────
alter table public.games                enable row level security;
alter table public.profiles             enable row level security;
alter table public.profile_games        enable row level security;
alter table public.lfg_posts            enable row level security;
alter table public.lfg_requests         enable row level security;
alter table public.friendships          enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.blocks               enable row level security;
alter table public.reports              enable row level security;

-- ── Table privileges (defence in depth on top of RLS) ───────────────────────
-- Supabase grants ALL on new public tables to anon/authenticated by default.
revoke all on table
  public.games, public.profiles, public.profile_games, public.lfg_posts, public.lfg_requests,
  public.friendships, public.conversations, public.conversation_members, public.messages,
  public.blocks, public.reports
from anon, authenticated;

grant select                         on public.games                to authenticated;
grant select, insert, update         on public.profiles             to authenticated;
grant select, insert, update, delete on public.profile_games        to authenticated;
grant select, delete                 on public.lfg_posts            to authenticated;
grant insert (id, author_id, game_id, title, description, rank, region, language,
              slots_needed, mic_required, status, expires_at)
                                     on public.lfg_posts            to authenticated;
grant update (title, description, rank, region, language, slots_needed, mic_required,
              status, expires_at)    on public.lfg_posts            to authenticated;
grant select, delete                 on public.lfg_requests         to authenticated;
grant insert (id, post_id, requester_id, message, status) on public.lfg_requests to authenticated;
grant update (status)                on public.lfg_requests         to authenticated;
grant select, delete                 on public.friendships          to authenticated;
grant insert (id, requester_id, addressee_id, status) on public.friendships to authenticated;
grant update (status)                on public.friendships          to authenticated;
grant select                         on public.conversations        to authenticated;
grant select                         on public.conversation_members to authenticated;
grant update (last_read_at)          on public.conversation_members to authenticated;
grant select                         on public.messages             to authenticated;
grant insert (id, conversation_id, sender_id, body) on public.messages to authenticated;
grant select, insert, delete         on public.blocks               to authenticated;
grant insert (id, reporter_id, target_type, target_id, reason, details, status) on public.reports to authenticated;

-- ── games: read-only for signed-in users ────────────────────────────────────
drop policy if exists games_select on public.games;
create policy games_select on public.games
  for select to authenticated using (true);

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── profile_games ───────────────────────────────────────────────────────────
drop policy if exists profile_games_select on public.profile_games;
create policy profile_games_select on public.profile_games
  for select to authenticated using (true);

drop policy if exists profile_games_insert_own on public.profile_games;
create policy profile_games_insert_own on public.profile_games
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists profile_games_update_own on public.profile_games;
create policy profile_games_update_own on public.profile_games
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists profile_games_delete_own on public.profile_games;
create policy profile_games_delete_own on public.profile_games
  for delete to authenticated using (profile_id = auth.uid());

-- ── lfg_posts ───────────────────────────────────────────────────────────────
drop policy if exists lfg_posts_select on public.lfg_posts;
create policy lfg_posts_select on public.lfg_posts
  for select to authenticated using (true);

drop policy if exists lfg_posts_insert_own on public.lfg_posts;
create policy lfg_posts_insert_own on public.lfg_posts
  for insert to authenticated
  with check (author_id = auth.uid() and status = 'open' and conversation_id is null);

drop policy if exists lfg_posts_update_own on public.lfg_posts;
create policy lfg_posts_update_own on public.lfg_posts
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists lfg_posts_delete_own on public.lfg_posts;
create policy lfg_posts_delete_own on public.lfg_posts
  for delete to authenticated using (author_id = auth.uid());

-- ── lfg_requests ────────────────────────────────────────────────────────────
drop policy if exists lfg_requests_select on public.lfg_requests;
create policy lfg_requests_select on public.lfg_requests
  for select to authenticated
  using (
    requester_id = auth.uid()
    or exists (select 1 from public.lfg_posts p
               where p.id = lfg_requests.post_id and p.author_id = auth.uid())
  );

-- Join request: as yourself, pending, not on your own post, post open and
-- unexpired, and no block between you and the author.
drop policy if exists lfg_requests_insert_own on public.lfg_requests;
create policy lfg_requests_insert_own on public.lfg_requests
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.lfg_posts p
      where p.id = lfg_requests.post_id
        and p.author_id <> auth.uid()
        and p.status = 'open'
        and p.expires_at > now()
        and not public.is_blocked_between(auth.uid(), p.author_id)
    )
  );

-- Post author may decline (or reset to pending). Accepting must go through the
-- accept_lfg_request RPC so the group chat is created; accepted rows are final.
drop policy if exists lfg_requests_update_author on public.lfg_requests;
create policy lfg_requests_update_author on public.lfg_requests
  for update to authenticated
  using (
    status <> 'accepted'
    and exists (select 1 from public.lfg_posts p
                where p.id = lfg_requests.post_id and p.author_id = auth.uid())
  )
  with check (
    status in ('pending','declined')
    and exists (select 1 from public.lfg_posts p
                where p.id = lfg_requests.post_id and p.author_id = auth.uid())
  );

-- Requester may withdraw their own pending request.
drop policy if exists lfg_requests_delete_own on public.lfg_requests;
create policy lfg_requests_delete_own on public.lfg_requests
  for delete to authenticated
  using (requester_id = auth.uid() and status = 'pending');

-- ── friendships ─────────────────────────────────────────────────────────────
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and addressee_id <> auth.uid()
    and status = 'pending'
    and not public.is_blocked_between(auth.uid(), addressee_id)
  );

drop policy if exists friendships_accept on public.friendships;
create policy friendships_accept on public.friendships
  for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status = 'accepted'
              and not public.is_blocked_between(auth.uid(), requester_id));

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- ── conversations (created only by RPCs) ────────────────────────────────────
drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations
  for select to authenticated using (public.is_conversation_member(id));

-- ── conversation_members (created only by RPCs) ─────────────────────────────
drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id));

drop policy if exists conversation_members_update_own on public.conversation_members;
create policy conversation_members_update_own on public.conversation_members
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ── messages ────────────────────────────────────────────────────────────────
drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and not public.is_dm_blocked(conversation_id)
  );

-- ── blocks ──────────────────────────────────────────────────────────────────
drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = auth.uid());

drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- Blocking someone also removes any friendship / friend request between you.
create or replace function public.handle_block_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships f
  where (f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
     or (f.requester_id = new.blocked_id and f.addressee_id = new.blocker_id);
  update public.lfg_requests r
     set status = 'declined'
   where r.status = 'pending'
     and exists (select 1 from public.lfg_posts p
                 where p.id = r.post_id
                   and ((p.author_id = new.blocker_id and r.requester_id = new.blocked_id)
                     or (p.author_id = new.blocked_id and r.requester_id = new.blocker_id)));
  return new;
end;
$$;
revoke all on function public.handle_block_created() from public, anon, authenticated;

drop trigger if exists blocks_after_insert on public.blocks;
create trigger blocks_after_insert
  after insert on public.blocks
  for each row execute function public.handle_block_created();

-- ── reports: insert only, never readable by users ───────────────────────────
-- Note for the app: insert without `.select()` (there is no SELECT permission).
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
