// Clips (v1: shared links, no uploads). Mirrors docs/CLIPS_AND_PARTY.md, migration 0017.
// Kept inside the feature so the clip screens don't depend on src/lib/types.ts changes.

export type ClipPlatform = 'youtube' | 'twitch' | 'medal';

/** get_clip_feed p_feed values. */
export type ClipFeed = 'squad' | 'for_you' | 'cups';

export interface ClipAuthor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

/** A clip row (table `clips`) as the feed returns it: clip columns + author + my_gg. */
export interface Clip {
  id: string;
  author_id: string;
  game_id: string | null;
  url: string;
  platform: ClipPlatform;
  video_id: string;
  title: string;
  caption: string | null;
  tournament_id: string | null;
  gg_count: number;
  comment_count: number;
  created_at: string;
  author: ClipAuthor;
  /** I have given this clip a GG. */
  my_gg: boolean;
}

/** table `clip_comments` (not removed) with the author's profile embedded. */
export interface ClipComment {
  id: string;
  clip_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: ClipAuthor;
}

/** toggle_clip_gg result. */
export interface ClipGgResult {
  gg: boolean;
  gg_count: number;
}

export interface ParsedClipUrl {
  platform: ClipPlatform;
  videoId: string;
}
