-- 0012: the app is now called Vinq.
-- Re-creates three functions with player-facing text that said "GG" (the default group-chat
-- notification title and two moderation notices). Bodies are otherwise identical to 0008/0009.
-- "GG" as the like button ("GGs") and the GG Score are unchanged. Safe to run more than once;
-- `create or replace` keeps existing grants.

create or replace function public.gg_notify(
  p_recipient       uuid,
  p_type            text,
  p_title           text,
  p_body            text,
  p_route           jsonb,
  p_actor           uuid    default null,
  p_extra           jsonb   default '{}'::jsonb,
  p_show_actor      boolean default true,
  p_respect_blocks  boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_data jsonb;
begin
  if p_recipient is null or p_recipient = p_actor then
    return null;
  end if;
  if p_respect_blocks and p_actor is not null and exists (
       select 1 from public.blocks b
       where (b.blocker_id = p_recipient and b.blocked_id = p_actor)
          or (b.blocker_id = p_actor and b.blocked_id = p_recipient)) then
    return null;
  end if;

  v_data := coalesce(p_extra, '{}'::jsonb) || jsonb_build_object('route', p_route);
  if p_show_actor and p_actor is not null then
    v_data := v_data || jsonb_build_object('actor_id', p_actor);
  end if;

  begin
    insert into public.notifications (recipient_id, type, title, body, data)
    select p_recipient, p_type,
           left(coalesce(nullif(btrim(p_title), ''), 'Vinq'), 80),
           nullif(left(btrim(coalesce(p_body, '')), 160), ''),
           v_data
    where exists (select 1 from public.profiles where id = p_recipient)
    returning id into v_id;
  exception when others then
    raise log 'gg_notify skipped (%): %', p_type, sqlerrm;
    return null;
  end;
  return v_id;
end;
$$;

create or replace function public.resolve_report(
  p_report_id  uuid,
  p_action     text,
  p_ban_days   integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me        uuid := public.gg_require_moderator();
  v_rep     public.reports%rowtype;
  v_target  uuid;
  v_what    text;
  v_done    boolean := false;
  v_until   timestamptz;
begin
  select * into v_rep from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if p_action not in ('dismiss','remove_content','ban_user') then
    raise exception 'Unknown action: %', p_action using errcode = '22023';
  end if;

  if p_action = 'dismiss' then
    update public.reports set status = 'reviewed' where id = v_rep.id;
    return;
  end if;

  v_target := coalesce(v_rep.target_user_id,
                       public.gg_report_target_user(v_rep.target_type, v_rep.target_id));

  if p_action = 'remove_content' then
    case v_rep.target_type
      when 'message' then
        delete from public.messages where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your message';
      when 'lfg_post' then
        delete from public.lfg_posts where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your lobby';
      when 'community_post' then
        delete from public.community_posts where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your post';
      when 'community_reply' then
        delete from public.community_replies where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your reply';
      when 'profile' then
        update public.profiles set bio = null, avatar_url = null where id = v_rep.target_id;
        v_done := found; v_what := 'A moderator removed your bio and avatar';
    end case;

    update public.reports set status = 'actioned'
     where id = v_rep.id
        or (status = 'open' and target_type = v_rep.target_type and target_id = v_rep.target_id);

    if v_done then
      perform public.gg_notify(
        v_target, 'moderation', v_what,
        'Reason: ' || public.gg_reason_label(v_rep.reason) || '. Please keep Vinq friendly.',
        public.gg_route('/notifications'), me,
        jsonb_build_object('action', 'remove_content', 'target_type', v_rep.target_type),
        p_show_actor => false, p_respect_blocks => false);
    end if;
    return;
  end if;

  -- ban_user
  if p_ban_days is null or p_ban_days < 1 or p_ban_days > 365 then
    raise exception 'Ban length must be 1–365 days' using errcode = '22023';
  end if;
  if v_target is null or not exists (select 1 from public.profiles where id = v_target) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if v_target = me then
    raise exception 'You cannot ban yourself' using errcode = '22023';
  end if;

  v_until := now() + make_interval(days => p_ban_days);
  update public.profiles set banned_until = v_until where id = v_target;
  update public.reports set status = 'actioned'
   where id = v_rep.id
      or (status = 'open' and target_type = v_rep.target_type and target_id = v_rep.target_id);

  perform public.gg_notify(
    v_target, 'moderation',
    'Your account is paused until ' || to_char(v_until at time zone 'Asia/Kolkata', 'FMDD Mon'),
    'You can still read and browse. Reason: ' || public.gg_reason_label(v_rep.reason) || '.',
    public.gg_route('/notifications'), me,
    jsonb_build_object('action', 'ban_user', 'banned_until', v_until),
    p_show_actor => false, p_respect_blocks => false);
end;
$$;

create or replace function public.unban_user(p_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me     uuid := public.gg_require_moderator();
  v_was  timestamptz;
begin
  select banned_until into v_was from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  update public.profiles set banned_until = null where id = p_profile_id;
  if v_was > now() then
    perform public.gg_notify(
      p_profile_id, 'moderation', 'Your account is active again',
      'Welcome back. Please keep Vinq friendly.',
      public.gg_route('/notifications'), me,
      jsonb_build_object('action', 'unban'),
      p_show_actor => false, p_respect_blocks => false);
  end if;
end;
$$;
