-- 0015: streaming scrims on YouTube (or Twitch).
--
-- * Streaming is opt-in per scrim: the host captain marks a scrim "OK to stream" while it is open
--   and before any team has requested it, so every requesting team agrees knowingly.
-- * Once booked, either captain can attach the stream link (YouTube / Twitch https URLs only).
-- * Moderators can feature a scrim at the top of the board.
-- Safe to run more than once.

alter table public.scrims add column if not exists stream_allowed boolean not null default false;
alter table public.scrims add column if not exists stream_url text;
alter table public.scrims add column if not exists featured_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scrims_stream_url_check') then
    alter table public.scrims add constraint scrims_stream_url_check check (
      stream_url is null or (
        char_length(stream_url) <= 200
        and stream_url ~* '^https://((www|m)\.)?(youtube\.com|youtu\.be|twitch\.tv)/[^\s]+$'
      )
    );
  end if;
end;
$$;

create index if not exists scrims_featured_idx on public.scrims (featured_at desc) where featured_at is not null;

-- Same rule as the app (src/features/scrims/logic.ts → cleanStreamUrl).
create or replace function public.gg_valid_stream_url(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_url is not null and char_length(p_url) <= 200
     and p_url ~* '^https://((www|m)\.)?(youtube\.com|youtu\.be|twitch\.tv)/[^\s]+$';
$$;

-- ── set_scrim_streaming(p_scrim_id, p_allowed) → void ───────────────────────
-- Host captain. Turning streaming ON: open scrim, before the start, and no request yet (pending
-- or otherwise), so nobody was booked without seeing it. Turning it OFF: any time before the start
-- (open or booked); this also clears the link.
create or replace function public.set_scrim_streaming(p_scrim_id uuid, p_allowed boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor();
  v_scrim  public.scrims%rowtype;
begin
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.teams where id = v_scrim.host_team_id and captain_id = me) then
    raise exception 'Only the host captain can change streaming' using errcode = '42501';
  end if;
  if now() >= v_scrim.scheduled_at then
    raise exception 'This scrim has already started' using errcode = '22023';
  end if;
  if coalesce(p_allowed, false) then
    if v_scrim.status <> 'open' then
      raise exception 'Streaming can only be turned on while the scrim is open' using errcode = '22023';
    end if;
    if exists (select 1 from public.scrim_requests r where r.scrim_id = p_scrim_id and r.status in ('pending','accepted','declined')) then
      raise exception 'Teams already requested this scrim without streaming. Post a new scrim to stream it.' using errcode = '22023';
    end if;
    update public.scrims set stream_allowed = true where id = p_scrim_id;
  else
    if v_scrim.status not in ('open','booked') then
      raise exception 'This scrim is finished' using errcode = '22023';
    end if;
    update public.scrims set stream_allowed = false, stream_url = null where id = p_scrim_id;
  end if;
end;
$$;

-- ── set_scrim_stream_url(p_scrim_id, p_url) → void ──────────────────────────
-- Either captain of a booked (or just finished) scrim that allows streaming. null / '' clears it.
create or replace function public.set_scrim_stream_url(p_scrim_id uuid, p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me       uuid := public.gg_scrim_actor();
  v_scrim  public.scrims%rowtype;
  v_url    text := nullif(btrim(coalesce(p_url, '')), '');
  v_mine   uuid;
  v_other  uuid;
begin
  select * into v_scrim from public.scrims where id = p_scrim_id for update;
  if not found then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.teams where id = v_scrim.host_team_id and captain_id = me) then
    v_mine := v_scrim.host_team_id;  v_other := v_scrim.opponent_team_id;
  elsif v_scrim.opponent_team_id is not null
        and exists (select 1 from public.teams where id = v_scrim.opponent_team_id and captain_id = me) then
    v_mine := v_scrim.opponent_team_id;  v_other := v_scrim.host_team_id;
  else
    raise exception 'Only a team captain can add the stream link' using errcode = '42501';
  end if;
  if not v_scrim.stream_allowed then
    raise exception 'Both teams didn''t agree to stream this scrim' using errcode = '22023';
  end if;
  if v_scrim.status not in ('booked','completed','disputed') then
    raise exception 'Add the stream link once the scrim is booked' using errcode = '22023';
  end if;
  if v_url is not null and not public.gg_valid_stream_url(v_url) then
    raise exception 'Use a YouTube or Twitch link (https://…)' using errcode = '22023';
  end if;

  update public.scrims set stream_url = v_url where id = p_scrim_id;

  if v_url is not null and v_url is distinct from v_scrim.stream_url then
    perform public.gg_notify_team(
      v_other, 'scrim_update', public.gg_team_label(v_mine) || ' is streaming your scrim',
      'Tap to watch or share the stream.',
      public.gg_route('/scrims/[id]', p_scrim_id), me,
      jsonb_build_object('scrim_id', p_scrim_id), false);
  end if;
end;
$$;

-- ── set_scrim_featured(p_scrim_id, p_featured) → void (moderators) ─────────
create or replace function public.set_scrim_featured(p_scrim_id uuid, p_featured boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := public.gg_require_moderator();
begin
  if not exists (select 1 from public.scrims where id = p_scrim_id) then
    raise exception 'Scrim not found' using errcode = 'P0002';
  end if;
  update public.scrims
     set featured_at = case when coalesce(p_featured, false) then now() else null end
   where id = p_scrim_id;
end;
$$;

revoke all on function public.gg_valid_stream_url(text) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.set_scrim_streaming(uuid, boolean)',
    'public.set_scrim_stream_url(uuid, text)',
    'public.set_scrim_featured(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
