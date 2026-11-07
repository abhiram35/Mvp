-- ─────────────────────────────────────────────────────────────────────────────
-- GG 0001 – schema
-- Implements the tables in src/lib/types.ts exactly (names, columns, enum values).
-- Enumerations are stored as text with CHECK constraints.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto; -- gen_random_uuid() (built in on PG13+, harmless)

-- ── games ───────────────────────────────────────────────────────────────────
create table if not exists public.games (
  id         text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name       text not null check (char_length(name) between 1 and 80),
  platforms  text[] not null default '{}'
             check (platforms <@ array['mobile','pc','console']::text[] and cardinality(platforms) >= 1),
  ranks      text[] not null default '{}',
  emoji      text not null default '🎮' check (char_length(emoji) between 1 and 16)
);

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url    text check (avatar_url is null or char_length(avatar_url) <= 1000),
  bio           text check (bio is null or char_length(bio) <= 280),
  region        text not null check (region in (
                  'india_north','india_south','india_east','india_west','south_asia',
                  'middle_east','southeast_asia','europe','north_america','other')),
  languages     text[] not null default '{}' check (cardinality(languages) <= 15),
  play_style    text not null default 'casual' check (play_style in ('casual','competitive','both')),
  has_mic       boolean not null default false,
  play_times    text[] not null default '{}'
                check (play_times <@ array['morning','afternoon','evening','late_night']::text[]),
  created_at    timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

-- ── profile_games ───────────────────────────────────────────────────────────
create table if not exists public.profile_games (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  game_id     text not null references public.games (id) on delete cascade,
  rank        text check (rank is null or char_length(rank) <= 40),
  role        text check (role is null or char_length(role) <= 40),
  primary key (profile_id, game_id)
);
create index if not exists profile_games_game_id_idx on public.profile_games (game_id);

-- ── conversations (created before lfg_posts; FK to lfg_posts added below) ─────
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  is_group         boolean not null default false,
  title            text check (title is null or char_length(title) <= 120),
  lfg_post_id      uuid,
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- ── lfg_posts ───────────────────────────────────────────────────────────────
create table if not exists public.lfg_posts (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.profiles (id) on delete cascade,
  game_id          text not null references public.games (id) on delete cascade,
  title            text not null check (char_length(btrim(title)) between 1 and 80),
  description      text check (description is null or char_length(description) <= 500),
  rank             text check (rank is null or char_length(rank) <= 40),
  region           text not null check (region in (
                     'india_north','india_south','india_east','india_west','south_asia',
                     'middle_east','southeast_asia','europe','north_america','other')),
  language         text not null check (char_length(btrim(language)) between 1 and 40),
  slots_needed     integer not null default 1 check (slots_needed between 1 and 9),
  mic_required     boolean not null default false,
  status           text not null default 'open' check (status in ('open','full','closed')),
  conversation_id  uuid references public.conversations (id) on delete set null,
  expires_at       timestamptz not null default (now() + interval '6 hours'),
  created_at       timestamptz not null default now(),
  constraint lfg_posts_expiry_window check (expires_at <= created_at + interval '7 days')
);
create index if not exists lfg_posts_status_created_idx on public.lfg_posts (status, created_at desc);
create index if not exists lfg_posts_game_id_idx       on public.lfg_posts (game_id);
create index if not exists lfg_posts_author_id_idx     on public.lfg_posts (author_id);
create index if not exists lfg_posts_expires_at_idx    on public.lfg_posts (expires_at);
create unique index if not exists lfg_posts_conversation_id_key
  on public.lfg_posts (conversation_id) where conversation_id is not null;

alter table public.conversations
  drop constraint if exists conversations_lfg_post_id_fkey;
alter table public.conversations
  add constraint conversations_lfg_post_id_fkey
  foreign key (lfg_post_id) references public.lfg_posts (id) on delete set null;
create index if not exists conversations_lfg_post_id_idx on public.conversations (lfg_post_id);

-- ── lfg_requests ────────────────────────────────────────────────────────────
create table if not exists public.lfg_requests (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.lfg_posts (id) on delete cascade,
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  message       text check (message is null or char_length(message) <= 200),
  status        text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at    timestamptz not null default now(),
  constraint lfg_requests_post_requester_key unique (post_id, requester_id)
);
create index if not exists lfg_requests_requester_id_idx on public.lfg_requests (requester_id);
create index if not exists lfg_requests_post_status_idx  on public.lfg_requests (post_id, status);

-- ── friendships ─────────────────────────────────────────────────────────────
create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','accepted')),
  created_at    timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_id_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_id_idx on public.friendships (addressee_id);

-- ── conversation_members ────────────────────────────────────────────────────
create table if not exists public.conversation_members (
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  last_read_at     timestamptz not null default now(),
  joined_at        timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create index if not exists conversation_members_profile_id_idx on public.conversation_members (profile_id);

-- ── messages ────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  body             text not null check (char_length(btrim(body)) >= 1 and char_length(body) <= 2000),
  created_at       timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index if not exists messages_sender_id_idx on public.messages (sender_id);

-- ── blocks ──────────────────────────────────────────────────────────────────
create table if not exists public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);

-- ── reports ─────────────────────────────────────────────────────────────────
-- target_id is polymorphic (profile / message / lfg_post id), so it has no FK:
-- the report must survive even if the reported content is deleted.
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('profile','message','lfg_post')),
  target_id    uuid not null,
  reason       text not null check (reason in ('harassment','hate','cheating','spam','scam','inappropriate','other')),
  details      text check (details is null or char_length(details) <= 1000),
  status       text not null default 'open' check (status in ('open','reviewed','actioned')),
  created_at   timestamptz not null default now()
);
create index if not exists reports_status_created_idx on public.reports (status, created_at desc);
create index if not exists reports_target_idx on public.reports (target_type, target_id);
