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
export type ReportTarget = 'profile' | 'message' | 'lfg_post' | 'community_post' | 'community_reply';
export type CommunityPostKind = 'take' | 'question';
export type CommunitySort = 'hot' | 'new' | 'unanswered';
export type ReportReason = 'harassment' | 'hate' | 'cheating' | 'spam' | 'scam' | 'inappropriate' | 'other';

// ── Tables ──────────────────────────────────────────────────────────────────

/** table: games — seeded by the backend, read-only for users */
export interface Game {
  id: string; // slug, e.g. 'bgmi', 'valorant'
  name: string;
  platforms: string[]; // e.g. ['mobile'] | ['pc'] | ['pc','console']
  ranks: string[]; // ordered lowest → highest, may be empty
  emoji: string; // simple visual until real artwork exists
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


// ── Community (blog / forum) ────────────────────────────────────────────────

/** table: community_posts — opinions ("take") and help questions ("question") */
export interface CommunityPost {
  id: UUID;
  author_id: UUID;
  kind: CommunityPostKind;
  game_id: string | null; // null = general / not about one game
  title: string; // 5–120 chars
  body: string; // 1–5000 chars, plain text (line breaks kept)
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

// ── Database functions (Supabase RPC) ───────────────────────────────────────
// Call with: supabase.rpc('<name>', { ...args })

export interface RpcFunctions {
  /** Returns the id of the 1-to-1 conversation with other_id, creating it if needed. Fails if either side blocked the other. */
  get_or_create_dm: { args: { other_id: UUID }; returns: UUID };

  /** Author accepts a join request: marks it accepted, adds requester to the post's group chat
   *  (creating the chat on first accept), and sets post status to 'full' when slots run out. Returns the conversation id. */
  accept_lfg_request: { args: { request_id: UUID }; returns: UUID };

  /** Squad finder. Returns other users who play game_id, excluding blocked users either way and the caller.
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
      p_search: string | null; // case-insensitive match on title/body, null = none
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
}

export interface SquadmateMatch {
  profile: Profile;
  game: ProfileGame;
  match_score: number; // 0–100
  shared_languages: string[];
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

export const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Urdu'] as const;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  cheating: 'Cheating or selling hacks',
  spam: 'Spam',
  scam: 'Scam or fraud',
  inappropriate: 'Sexual or inappropriate content',
  other: 'Something else',
};

export const COMMUNITY_KIND_LABELS: Record<CommunityPostKind, string> = {
  take: 'Take',
  question: 'Question',
};
