// ─────────────────────────────────────────────────────────────────────────────
// GG data contract.
// This file is the single source of truth shared by the backend (Supabase SQL in
// supabase/migrations) and the app. Table and column names here MUST match the
// SQL exactly. If you need a change, change it here AND in the SQL.
// ─────────────────────────────────────────────────────────────────────────────

export type UUID = string;
export type ISODate = string;

// ── Enumerations (stored as text with CHECK constraints in SQL) ─────────────
export type Region =
  | 'india_north'
  | 'india_south'
  | 'india_east'
  | 'india_west'
  | 'south_asia'
  | 'middle_east'
  | 'southeast_asia'
  | 'europe'
  | 'north_america'
  | 'other';

export type PlayStyle = 'casual' | 'competitive' | 'both';
export type PlayTime = 'morning' | 'afternoon' | 'evening' | 'late_night';
export type LfgStatus = 'open' | 'full' | 'closed';
export type RequestStatus = 'pending' | 'accepted' | 'declined';
export type FriendshipStatus = 'pending' | 'accepted';
export type ReportTarget = 'profile' | 'message' | 'lfg_post' | 'community_post' | 'community_reply' | 'clip' | 'clip_comment';
export type CommunityPostKind = 'take' | 'question';
export type CommunitySort = 'hot' | 'new' | 'unanswered';
export type GameCategory = 'competitive' | 'story' | 'casual';
export type PlayStatus = 'playing' | 'finished';
export type ReportReason = 'harassment' | 'hate' | 'cheating' | 'spam' | 'scam' | 'inappropriate' | 'other';

// ── Tables ──────────────────────────────────────────────────────────────────

/** table: games — seeded by the backend, read-only for users */
export interface Game {
  id: string; // slug, e.g. 'bgmi', 'valorant'
  name: string;
  platforms: string[]; // e.g. ['mobile'] | ['pc'] | ['pc','console']
  ranks: string[]; // ordered lowest → highest, may be empty
  emoji: string; // fallback visual when there is no artwork
  category: GameCategory;
  is_coop: boolean; // story games you can play together
  steam_appid: number | null; // Steam store app id: artwork + library matching
  logo_url: string | null; // optional self-hosted artwork (game-art bucket)
  squadable: boolean; // generated: category <> 'story' or is_coop. Only these get LFG / Squad Finder
  scrims_enabled?: boolean; // 0014: team scrims are available (VALORANT, CS2). Missing on older databases.
}

/** table: profiles — one row per auth user, id = auth.users.id */
export interface Profile {
  id: UUID;
  username: string; // unique, 3–20 chars, [a-z0-9_]
  display_name: string;
  avatar_url: string | null; // public URL in the 'avatars' storage bucket
  bio: string | null; // max 280 chars
  region: Region;
  languages: string[]; // e.g. ['English','Hindi']
  play_style: PlayStyle;
  has_mic: boolean;
  play_times: PlayTime[];
  created_at: ISODate;
}

/** table: profile_games — games a user plays. PK (profile_id, game_id) */
export interface ProfileGame {
  profile_id: UUID;
  game_id: string;
  rank: string | null;
  role: string | null; // e.g. 'IGL', 'Sniper', 'Duelist'
  play_status: PlayStatus | null; // mostly for story games
}

/** table: profile_game_ids — private: visible to you and, unless either side blocked the other, to accepted
 *  friends, members of a squad (group) chat you are in, and people you have sent at least one DM message to
 *  (an empty DM someone opened with you is not enough).
 *  Write it with the save_profile_games RPC. */
export interface ProfileGameId {
  profile_id: UUID;
  game_id: string;
  in_game_id: string; // 1–64 chars (raw length, no control characters), e.g. BGMI UID or Riot ID
  updated_at: ISODate; // set by the server on insert/update (clients cannot write it)
}

/** One game from a linked Steam library (top games by playtime). */
export interface SteamGame {
  appid: number;
  name: string;
  playtime_hours: number;
}

/** table: steam_accounts — written only by the steam-link Edge Function. Readable by the same people who can
 *  see in-game IDs (see ProfileGameId); the owner can delete (unlink) their own row. */
export interface SteamAccount {
  profile_id: UUID;
  steam_id: string; // SteamID64 (17 digits)
  persona_name: string | null; // max 64 chars, profanity-masked by the server
  avatar_url: string | null; // always https:// (or null)
  profile_url: string | null; // always https://steamcommunity.com/… (or null)
  library_public: boolean; // false = the player's Steam game details are private
  game_count: number;
  games: SteamGame[];
  linked_at: ISODate;
  synced_at: ISODate;
}

/** table: lfg_posts — "looking for group" posts */
export interface LfgPost {
  id: UUID;
  author_id: UUID;
  game_id: string;
  title: string; // max 80 chars
  description: string | null; // max 500 chars
  rank: string | null; // rank wanted, free text matching Game.ranks
  region: Region;
  language: string;
  slots_needed: number; // 1–9
  mic_required: boolean;
  status: LfgStatus;
  conversation_id: UUID | null; // group chat created for this post
  expires_at: ISODate; // default now() + 6 hours
  created_at: ISODate;
}

/** table: lfg_requests — a player asking to join an LFG post. unique (post_id, requester_id) */
export interface LfgRequest {
  id: UUID;
  post_id: UUID;
  requester_id: UUID;
  message: string | null; // max 200 chars
  status: RequestStatus;
  created_at: ISODate;
}

/** table: friendships — unique pair regardless of direction */
export interface Friendship {
  id: UUID;
  requester_id: UUID;
  addressee_id: UUID;
  status: FriendshipStatus;
  created_at: ISODate;
}

/** table: conversations — DMs and group chats */
export interface Conversation {
  id: UUID;
  is_group: boolean;
  title: string | null; // groups only
  lfg_post_id: UUID | null;
  last_message_at: ISODate;
  created_at: ISODate;
}

/** table: conversation_members — PK (conversation_id, profile_id) */
export interface ConversationMember {
  conversation_id: UUID;
  profile_id: UUID;
  last_read_at: ISODate;
  joined_at: ISODate;
}

/** table: messages */
export interface Message {
  id: UUID;
  conversation_id: UUID;
  sender_id: UUID;
  body: string; // 1–2000 chars
  created_at: ISODate;
}

/** table: blocks — PK (blocker_id, blocked_id) */
export interface Block {
  blocker_id: UUID;
  blocked_id: UUID;
  created_at: ISODate;
}

/** table: reports — users can insert, only moderators read */
export interface Report {
  id: UUID;
  reporter_id: UUID;
  target_type: ReportTarget;
  target_id: UUID;
  reason: ReportReason;
  details: string | null; // max 1000 chars
  status: 'open' | 'reviewed' | 'actioned';
  created_at: ISODate;
}


// ── Community (takes and questions) ────────────────────────────────────────────────

/** table: community_posts — opinions ("take") and help questions ("question") */
export interface CommunityPost {
  id: UUID;
  author_id: UUID;
  kind: CommunityPostKind;
  game_id: string | null; // null = general / not about one game
  title: string; // 5–120 chars
  body: string; // 1–5000 chars, plain text (line breaks kept)
  is_spoiler: boolean; // body hidden behind a tap
  solved_reply_id: UUID | null; // questions only: the reply the author marked as the answer
  gg_count: number; // maintained by the server, read-only for users
  reply_count: number; // maintained by the server, read-only for users
  last_activity_at: ISODate; // created_at, bumped on each new reply
  created_at: ISODate;
  updated_at: ISODate;
}

/** table: community_replies */
export interface CommunityReply {
  id: UUID;
  post_id: UUID;
  author_id: UUID;
  body: string; // 1–3000 chars
  gg_count: number; // maintained by the server
  created_at: ISODate;
  updated_at: ISODate;
}

/** table: community_post_ggs — PK (post_id, profile_id). Users insert/delete only their own row via the toggle RPC. */
export interface CommunityPostGg {
  post_id: UUID;
  profile_id: UUID;
  created_at: ISODate;
}

/** table: community_reply_ggs — PK (reply_id, profile_id) */
export interface CommunityReplyGg {
  reply_id: UUID;
  profile_id: UUID;
  created_at: ISODate;
}

type AuthorLite = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

/** Row returned by list_community_posts / get_community_post */
export interface CommunityPostSummary {
  post: CommunityPost;
  author: AuthorLite;
  has_gg: boolean; // the caller gave this post a GG
  is_solved: boolean; // question with solved_reply_id set
}

/** Row returned by list_community_replies */
export interface CommunityReplyItem {
  reply: CommunityReply;
  author: AuthorLite;
  has_gg: boolean;
  is_solution: boolean; // this reply is the post's solved_reply_id
}

export interface GgToggleResult {
  has_gg: boolean;
  gg_count: number;
}

// ── Custom AI themes (docs/CUSTOM_THEMES.md) ────────────────────────────────
/** A saved custom_themes row as the app selects it. Only the generate-theme Edge Function inserts rows;
 *  the owner may rename (name only) or delete. `spec` is untrusted JSON — run it through
 *  validateSpec() from src/theme/custom.ts before use. The player's prompt is never selected. */
export interface CustomTheme {
  id: UUID;
  name: string; // 2–24 chars
  spec: unknown;
  created_at: ISODate;
}

/** get_theme_quota(): 2 successful generations per IST calendar month, max 6 saved themes. */
export interface ThemeQuota {
  used: number;
  limit: number; // 2
  remaining: number;
  resets_at: ISODate; // next 1st of the month, 00:00 IST
  saved: number;
  saved_limit: number; // 6
}

// RpcFunctions (all Supabase RPCs) is declared once, at the end of this file.


export interface SquadmateMatch {
  profile: Profile;
  game: ProfileGame;
  match_score: number; // 0–100
  shared_languages: string[];
  /** Squad finder results now include reputation and rank good teammates higher. */
  reputation?: ReputationSummary;
}

export interface ConversationSummary {
  conversation_id: UUID;
  is_group: boolean;
  title: string; // group title, or the other person's display_name for DMs
  avatar_url: string | null; // other person's avatar for DMs
  other_profile_id: UUID | null; // DMs only
  last_message: string | null;
  last_message_at: ISODate;
  unread_count: number;
}

// ── Joined shapes the app commonly selects ──────────────────────────────────
export type LfgPostWithAuthor = LfgPost & { author: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> };
export type MessageWithSender = Message & { sender: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> };

// ── Display labels ──────────────────────────────────────────────────────────
export const REGION_LABELS: Record<Region, string> = {
  india_north: 'India – North',
  india_south: 'India – South',
  india_east: 'India – East',
  india_west: 'India – West',
  south_asia: 'South Asia',
  middle_east: 'Middle East',
  southeast_asia: 'Southeast Asia',
  europe: 'Europe',
  north_america: 'North America',
  other: 'Other',
};

export const PLAY_TIME_LABELS: Record<PlayTime, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  late_night: 'Late night',
};

export const PLAY_STYLE_LABELS: Record<PlayStyle, string> = {
  casual: 'Casual',
  competitive: 'Competitive',
  both: 'Both',
};

// Global languages first, then the Indian languages our early players asked for.
export const LANGUAGES = [
  'English', 'Spanish', 'Portuguese', 'French', 'German', 'Arabic', 'Russian', 'Turkish', 'Indonesian', 'Filipino',
  'Vietnamese', 'Thai', 'Japanese', 'Korean', 'Chinese',
  'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu',
] as const;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  cheating: 'Cheating or selling hacks',
  spam: 'Spam',
  scam: 'Scam or fraud',
  inappropriate: 'Sexual or inappropriate content',
  other: 'Something else',
};

export const GAME_CATEGORY_LABELS: Record<GameCategory, string> = {
  competitive: 'Competitive',
  story: 'Story',
  casual: 'Co-op & Casual',
};

export const PLAY_STATUS_LABELS: Record<PlayStatus, string> = {
  playing: 'Playing now',
  finished: 'Finished',
};

export const COMMUNITY_KIND_LABELS: Record<CommunityPostKind, string> = {
  take: 'Take',
  question: 'Question',
};

// ═════════════════════════════════════════════════════════════════════════════
// Phase 2: notifications, teammate ratings + XP, moderation, telemetry.
// Backend: supabase/migrations/0008_engagement.sql, 0009_safety_telemetry.sql,
// supabase/functions/send-push. Spec: docs/PHASE2.md
// ═════════════════════════════════════════════════════════════════════════════

export type NotificationType =
  | 'lfg_request' // someone asked to join your lobby
  | 'lfg_accepted' // your join request was accepted
  | 'message' // new chat message (DM or squad chat)
  | 'friend_request'
  | 'friend_accepted'
  | 'community_reply' // reply on your post
  | 'community_solution' // your reply was marked as the solution
  | 'rating_received' // a teammate rated you (positive tags only)
  | 'moderation' // a moderator acted on your content or account
  | 'team_invite' // invited to a scrim team
  | 'scrim_request' // a team asked to play your scrim
  | 'scrim_update' // scrim accepted / declined / cancelled / result / no-show
  | 'tournament_update' // registration, start, your match is ready, results, cancelled
  | 'organiser_application' // organiser application submitted (mods) / reviewed (applicant)
  | 'clip_comment' // someone commented on your clip (route /clips/[id])
  | 'party_invite'; // invited to a party (route /lobby)

/** Where tapping a notification goes. `params` are Expo Router params. */
export interface NotificationRoute {
  pathname: '/lfg/[id]' | '/chat/[id]' | '/friends' | '/community/[id]' | '/user/[id]' | '/notifications' | '/scrims/[id]' | '/teams/[id]'
    | '/scrims' | '/moderation' | '/tournaments/[id]' | '/tournaments/match/[id]'
    | '/chats' | '/lfg' | '/lobby' | '/clips/[id]';
  params?: Record<string, string>;
}

/** table: notifications — created ONLY by server triggers. Recipient can read and set read_at. */
export interface AppNotification {
  id: UUID;
  recipient_id: UUID;
  type: NotificationType;
  title: string; // ≤ 80 chars, e.g. "Rhea wants to join your lobby"
  body: string | null; // ≤ 160 chars
  data: { route: NotificationRoute; actor_id?: UUID } & Record<string, unknown>;
  read_at: ISODate | null;
  created_at: ISODate;
}

/** table: push_tokens — PK token. Owner upserts/deletes their own rows. */
export interface PushToken {
  token: string; // Expo push token "ExponentPushToken[...]"
  profile_id: UUID;
  platform: 'ios' | 'android';
  created_at: ISODate;
  updated_at: ISODate;
}

// ── Teammate ratings + XP ───────────────────────────────────────────────────
/** Public praise tags plus the private "toxic" flag (never shown on profiles; feeds moderation). */
export type RatingTag = 'good_comms' | 'chill' | 'clutch' | 'shotcaller' | 'toxic';
export const PUBLIC_RATING_TAGS = ['good_comms', 'chill', 'clutch', 'shotcaller'] as const;
export type PublicRatingTag = (typeof PUBLIC_RATING_TAGS)[number];

export const RATING_TAG_LABELS: Record<RatingTag, string> = {
  good_comms: 'Good comms',
  chill: 'Chill',
  clutch: 'Clutch',
  shotcaller: 'Shotcaller',
  toxic: 'Toxic',
};

/** table: teammate_ratings — unique (rater_id, ratee_id, lfg_post_id). Insert via rate_teammate RPC only. */
export interface TeammateRating {
  id: UUID;
  rater_id: UUID;
  ratee_id: UUID;
  lfg_post_id: UUID;
  tags: RatingTag[]; // 1–4 tags; 'toxic' cannot be combined with praise tags
  created_at: ISODate;
}

/** Public reputation of a player (get_player_stats). Toxic counts are never exposed. */
export interface PlayerStats {
  profile_id: UUID;
  xp: number;
  level: number; // floor(sqrt(xp / 50)) + 1
  xp_into_level: number; // xp earned since the start of the current level
  xp_for_next: number; // xp needed from the start of this level to the next
  squads_joined: number; // accepted into someone's lobby + own lobbies that filled at least one slot
  lobbies_hosted: number;
  ratings_received: number; // number of teammates who rated this player (any tags)
  positive_ratings: number; // ratings with at least one praise tag
  tag_counts: Record<PublicRatingTag, number>;
  solutions: number; // community replies marked as the answer
}

/** Compact reputation for cards (squad finder, lobby rows). */
export interface ReputationSummary {
  level: number;
  ratings_received: number;
  top_tags: PublicRatingTag[]; // up to 2, most received first
}

/** One teammate the caller can rate for a lobby (list_rateable_teammates). */
export interface RateableTeammate {
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  already_rated: boolean;
  my_tags: RatingTag[]; // empty if not rated yet
}

// ── Moderation ──────────────────────────────────────────────────────────────
export type ModerationAction = 'dismiss' | 'remove_content' | 'ban_user';

/** Row returned by list_reports (moderators only). */
export interface ReportQueueItem {
  report: Report;
  reporter: Pick<Profile, 'id' | 'username' | 'display_name'>;
  /** The reported person (author of the content, or the profile itself). */
  target_user: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
  /** Short text preview of the reported content (null if it was already deleted). */
  target_preview: string | null;
  /** How many open reports exist against target_user in total. */
  open_reports_against_user: number;
  /** Times this user was flagged toxic by distinct teammates in the last 30 days. */
  toxic_flags_30d: number;
}

/** Ban status for the signed-in player (get_my_status). */
export interface MyStatus {
  banned_until: ISODate | null; // non-null and in the future = cannot post, message, host or reply
  is_moderator: boolean;
}

// ── Telemetry ───────────────────────────────────────────────────────────────
/** table: app_events — client may insert only these names; the server logs the rest itself. */
export type ClientEventName = 'app_open' | 'theme_changed' | 'onboarding_completed';

/** table: app_errors — crash / error reports. Insert-only for clients (signed in or not). */
export interface AppErrorReport {
  message: string; // ≤ 500
  stack: string | null; // ≤ 4000
  context: Record<string, unknown> | null; // screen, action, etc.
  app_version: string | null;
  platform: 'ios' | 'android' | 'web';
  is_fatal: boolean;
}

/** Beta metrics for the owner/moderators (get_beta_metrics). */
export interface BetaMetrics {
  days: number;
  total_players: number;
  new_players: number;
  daily_active: { day: string; players: number }[]; // last `days` days, oldest first
  lobbies_created: number;
  join_requests: number;
  squads_formed: number; // accepted requests
  messages_sent: number;
  community_posts: number;
  ratings_given: number;
  day1_retention: number | null; // share 0–1 of players who signed up ≥1 day ago and came back the next day
  day7_retention: number | null;
  errors_last_24h: number;
}

// ── Database functions (Supabase RPC) ───────────────────────────────────────
// Call with: supabase.rpc('<name>', { ...args })

/** One game in save_profile_games. rank / role: max 40 chars, null or '' = none.
 *  in_game_id: null = keep existing, '' = remove, string = set (trimmed; max 64 chars, no control characters). */
export interface SaveProfileGameInput {
  game_id: string;
  rank: string | null;
  role: string | null;
  play_status: PlayStatus | null;
  in_game_id: string | null;
}

export interface RpcFunctions {
  /** Atomically replaces the caller's games and in-game IDs (docs/REVIEW_FIXES.md §3). Games not in p_games are
   *  removed (with their IDs). At most 30 games, no duplicates. Invalid input raises (code 22023) and changes nothing;
   *  not signed in / no profile raises 42501. */
  save_profile_games: { args: { p_games: SaveProfileGameInput[] }; returns: null };

  /** Returns the id of the 1-to-1 conversation with other_id, creating it if needed. Fails if either side blocked the other. */
  get_or_create_dm: { args: { other_id: UUID }; returns: UUID };

  /** Author accepts a join request: marks it accepted, adds requester to the post's group chat
   *  (creating the chat on first accept), and sets post status to 'full' when slots run out. Returns the conversation id. */
  accept_lfg_request: { args: { request_id: UUID }; returns: UUID };

  /** Squad finder. Returns other users who play game_id, excluding blocked users either way, paused (banned)
   *  players and the caller. Returns nothing for games that are not squadable (single-player story games).
   *  Optional filters may be null. Sorted by match_score desc. */
  find_squadmates: {
    args: {
      p_game_id: string;
      p_region: Region | null;
      p_language: string | null;
      p_play_style: PlayStyle | null;
      p_limit?: number; // default 30
    };
    returns: SquadmateMatch[];
  };

  /** Conversations for the current user with last message and unread count, newest first. */
  list_my_conversations: { args: Record<string, never>; returns: ConversationSummary[] };

  /** Marks a conversation as read for the current user. */
  mark_conversation_read: { args: { p_conversation_id: UUID }; returns: null };

  /** Permanently deletes the caller's account and all their data (required by app stores). */
  delete_my_account: { args: Record<string, never>; returns: null };

  /** True if username is free (case-insensitive) and valid. Callable before a profile exists. */
  is_username_available: { args: { p_username: string }; returns: boolean };

  // ── Community ──
  /** Feed. Excludes posts by users blocked in EITHER direction (server-side). Pagination: offset paging with
   *  p_limit / p_offset. Returns setof jsonb, so supabase-js gives an array of CommunityPostSummary objects. */
  list_community_posts: {
    args: {
      p_sort: CommunitySort; // hot = score by GGs + replies decayed by age; new = newest; unanswered = questions with 0 replies, newest first
      p_kind: CommunityPostKind | null; // null = both
      p_game_id: string | null; // null = all games
      p_search: string | null; // case-insensitive match on title, or body for non-spoiler posts only; null = none
      p_limit?: number; // default 20, max 50
      p_offset?: number; // default 0 (simple offset paging)
    };
    returns: CommunityPostSummary[];
  };

  /** One post with author. Returns no row if missing or the author is blocked either way. */
  get_community_post: { args: { p_post_id: UUID }; returns: CommunityPostSummary[] };

  /** Replies oldest-first, solution pinned first. Excludes blocked authors either way. */
  list_community_replies: { args: { p_post_id: UUID; p_limit?: number; p_offset?: number }; returns: CommunityReplyItem[] };

  /** Gives or removes the caller's GG on a post. Cannot GG your own post. */
  toggle_post_gg: { args: { p_post_id: UUID }; returns: GgToggleResult };

  /** Gives or removes the caller's GG on a reply. Cannot GG your own reply. */
  toggle_reply_gg: { args: { p_reply_id: UUID }; returns: GgToggleResult };

  /** Post author marks a reply on their QUESTION as the solution (p_reply_id), or clears it (null). */
  set_solution: { args: { p_post_id: UUID; p_reply_id: UUID | null }; returns: null };

  // ── Custom themes ──
  /** The caller's AI theme quota for the current IST month and saved-theme count. */
  get_theme_quota: { args: Record<string, never>; returns: ThemeQuota };

  // ── Notifications ──
  /** Unread count for the bell badge. */
  count_unread_notifications: { args: Record<string, never>; returns: number };
  /** Mark one (p_id) or all (p_id null) notifications read. */
  mark_notifications_read: { args: { p_id: UUID | null }; returns: null };
  /** Upsert this device's Expo push token for the caller (reassigns it if another account had it). */
  register_push_token: { args: { p_token: string; p_platform: 'ios' | 'android' }; returns: null };

  // ── Ratings + XP ──
  /** Teammates from a lobby the caller can rate (both were in its squad chat). Empty if not eligible. */
  list_rateable_teammates: { args: { p_lfg_post_id: UUID }; returns: RateableTeammate[] };
  /** Rate or re-rate a teammate for a lobby. Allowed only if both were in the lobby's squad, from the moment
   *  the squad chat exists until 7 days after the lobby was created. Returns the ratee's updated public stats. */
  rate_teammate: { args: { p_lfg_post_id: UUID; p_ratee_id: UUID; p_tags: RatingTag[] }; returns: PlayerStats };
  /** Public stats for any player (zeros if none yet). */
  get_player_stats: { args: { p_profile_id: UUID }; returns: PlayerStats };

  // ── Moderation ──
  get_my_status: { args: Record<string, never>; returns: MyStatus };
  /** Moderators only. p_status null = open. Newest first. */
  list_reports: { args: { p_status: Report['status'] | null; p_limit?: number; p_offset?: number }; returns: ReportQueueItem[] };
  /** Moderators only. remove_content deletes the reported row (message/post/reply/lfg post); ban_user sets banned_until
   *  = now() + p_ban_days (1–365) on the target user; both mark the report 'actioned' and notify the target. dismiss marks 'reviewed'. */
  resolve_report: { args: { p_report_id: UUID; p_action: ModerationAction; p_ban_days?: number | null }; returns: null };
  /** Moderators only. Lift a ban early. */
  unban_user: { args: { p_profile_id: UUID }; returns: null };

  // ── Telemetry ──
  /** Moderators only. */
  get_beta_metrics: { args: { p_days?: number }; returns: BetaMetrics };
}
