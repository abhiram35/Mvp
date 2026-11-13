// Pure helpers for clips: link parsing (mirrors post_clip's server rules), thumbnails,
// labels, counts, validation and media colours. No React / React Native imports here,
// so everything is unit-tested in __tests__/logic.test.ts.
import { contrast, mixHex } from '../../theme/design';
import type { Clip, ClipFeed, ClipPlatform, ParsedClipUrl } from './types';

// ── Link parsing ────────────────────────────────────────────────────────────

// Same patterns as gg_parse_clip_url() in supabase/migrations/0017_clips_party.sql.
const CLIP_PATTERNS: readonly { platform: ClipPlatform; re: RegExp }[] = [
  { platform: 'youtube', re: /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\/?\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$/i },
  { platform: 'youtube', re: /^https:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})(?:[/?#].*)?$/i },
  { platform: 'youtube', re: /^https:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[/?#].*)?$/i },
  { platform: 'twitch', re: /^https:\/\/clips\.twitch\.tv\/([A-Za-z0-9_-]{3,100})(?:[/?#].*)?$/i },
  { platform: 'twitch', re: /^https:\/\/(?:www\.|m\.)?twitch\.tv\/[A-Za-z0-9_]{1,25}\/clip\/([A-Za-z0-9_-]{3,100})(?:[/?#].*)?$/i },
  { platform: 'twitch', re: /^https:\/\/(?:www\.|m\.)?twitch\.tv\/videos\/([0-9]{1,15})(?:[/?#].*)?$/i },
  { platform: 'medal', re: /^https:\/\/(?:www\.)?medal\.tv\/(?:[^?#]*\/)?clips\/([A-Za-z0-9_-]{3,100})(?:[/?#].*)?$/i },
];
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export const CLIP_URL_MAX = 500;

/**
 * Platform + video id for a clip link, or null when the server would refuse it.
 * https only. YouTube: youtube.com/watch?v=, m.youtube.com, youtube.com/shorts/<id>, youtu.be/<id>.
 * Twitch: clips.twitch.tv/<slug>, twitch.tv/<channel>/clip/<slug>, twitch.tv/videos/<id>.
 * Medal: medal.tv/…/clips/<id>.
 */
export function parseClipUrl(raw: string | null | undefined): ParsedClipUrl | null {
  const u = (raw ?? '').trim();
  if (!u || u.length > CLIP_URL_MAX || /\s/.test(u) || !/^https:\/\//i.test(u)) return null;
  for (const { platform, re } of CLIP_PATTERNS) {
    const m = re.exec(u);
    if (m) return { platform, videoId: m[1] };
  }
  return null;
}

/** YouTube's real thumbnail; other platforms have no public thumbnail URL (show game art). */
export function thumbnailFor(clip: Pick<Clip, 'platform' | 'video_id'>): string | null {
  if (clip.platform !== 'youtube' || !YOUTUBE_ID.test(clip.video_id)) return null;
  return `https://i.ytimg.com/vi/${clip.video_id}/hqdefault.jpg`;
}

export const PLATFORM_LABELS: Record<ClipPlatform, string> = { youtube: 'YouTube', twitch: 'Twitch', medal: 'Medal' };

export function watchLabel(platform: ClipPlatform): string {
  return `Watch on ${PLATFORM_LABELS[platform] ?? 'the web'}`;
}

// ── Feeds ───────────────────────────────────────────────────────────────────

export const CLIP_FEEDS: readonly { value: ClipFeed; label: string }[] = [
  { value: 'squad', label: 'Squad' },
  { value: 'for_you', label: 'For you' },
  { value: 'cups', label: 'Cups' },
];

export const DEFAULT_FEED: ClipFeed = 'for_you';

export function feedLabel(feed: ClipFeed): string {
  return CLIP_FEEDS.find((f) => f.value === feed)?.label ?? 'Clips';
}

export function isClipFeed(v: unknown): v is ClipFeed {
  return v === 'squad' || v === 'for_you' || v === 'cups';
}

/** Copy for an empty feed. */
export function emptyFeedCopy(feed: ClipFeed): { title: string; message: string } {
  switch (feed) {
    case 'squad':
      return { title: 'No squad clips yet', message: 'Clips from your friends and teammates land here. Add friends or share one yourself.' };
    case 'cups':
      return { title: 'No cup clips yet', message: 'Clips from tournaments show up here once players share them.' };
    default:
      return { title: 'No clips yet', message: 'Be the first: paste a YouTube, Twitch or Medal link to your best play.' };
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** 999 → "999", 1200 → "1.2k", 12 400 → "12k", 1 250 000 → "1.3M". */
export function formatCount(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  if (v < 1000) return String(v);
  if (v < 10_000) return `${(Math.floor(v / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
  if (v < 1_000_000) return `${Math.floor(v / 1000)}k`;
  if (v < 10_000_000) return `${(Math.floor(v / 100_000) / 10).toFixed(1).replace(/\.0$/, '')}M`;
  return `${Math.floor(v / 1_000_000)}M`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12m", "3h", "2d", "5w", then a short date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, now - then);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  if (diff < 5 * 7 * DAY) return `${Math.floor(diff / (7 * DAY))}w`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** First word of a display name, for "Squad up with Riya". Never empty. */
export function firstName(displayName: string | null | undefined, max = 14): string {
  const word = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
  if (!word) return 'them';
  return word.length > max ? `${word.slice(0, max - 1)}…` : word;
}

// ── Validation (matches the server limits) ──────────────────────────────────

export const CLIP_LIMITS = { titleMin: 3, titleMax: 80, captionMax: 300, commentMax: 500 } as const;

export function validateClipUrl(raw: string): string | null {
  if (!raw.trim()) return 'Paste a link to your clip';
  if (!/^https:\/\//i.test(raw.trim())) return 'Use a secure link (https://)';
  if (raw.trim().length > CLIP_URL_MAX) return 'That link is too long';
  return parseClipUrl(raw) ? null : 'Use a YouTube, Twitch or Medal clip link';
}

export function validateClipTitle(raw: string): string | null {
  const n = raw.trim().length;
  if (n < CLIP_LIMITS.titleMin) return `Title needs at least ${CLIP_LIMITS.titleMin} characters`;
  if (n > CLIP_LIMITS.titleMax) return `Keep the title under ${CLIP_LIMITS.titleMax} characters`;
  return null;
}

export function validateClipCaption(raw: string): string | null {
  return raw.trim().length > CLIP_LIMITS.captionMax ? `Keep the caption under ${CLIP_LIMITS.captionMax} characters` : null;
}

export function validateComment(raw: string): string | null {
  const n = raw.trim().length;
  if (n === 0) return 'Write something';
  if (n > CLIP_LIMITS.commentMax) return `Keep it under ${CLIP_LIMITS.commentMax} characters`;
  return null;
}

export interface ClipDraft {
  url: string;
  gameId: string | null;
  title: string;
  caption: string;
}

export function validateClipDraft(d: ClipDraft): Partial<Record<'url' | 'game' | 'title' | 'caption', string>> {
  const errors: Partial<Record<'url' | 'game' | 'title' | 'caption', string>> = {};
  const url = validateClipUrl(d.url);
  if (url) errors.url = url;
  if (!d.gameId) errors.game = 'Pick the game';
  const title = validateClipTitle(d.title);
  if (title) errors.title = title;
  const caption = validateClipCaption(d.caption);
  if (caption) errors.caption = caption;
  return errors;
}

/**
 * Friendlier copy for raw database errors; null = show the server's message as is
 * (0017's RPCs already raise player-facing messages).
 */
export function friendlyClipError(message: string | null | undefined): string | null {
  const m = (message ?? '').toLowerCase();
  if (!m) return null;
  if (/duplicate key.*clips/.test(m)) return "You've already shared this clip";
  if (/duplicate key.*party/.test(m)) return 'You already invited them. The invite is waiting.';
  if (/could not find the function|does not exist/.test(m)) return 'Clips are not available yet. Please update the app or try again later.';
  return null;
}

// ── Media colours ───────────────────────────────────────────────────────────
// The clip area is video, so it stays dark in every theme (also light Protocol).

/** The theme's panel colour, darkened until white text reads ≥ 12:1 on it. */
export function mediaBase(panel: string): string {
  let c = panel;
  for (let i = 0; i < 20 && contrast('#FFFFFF', c) < 12; i++) c = mixHex(c, '#000000', 0.15);
  return contrast('#FFFFFF', c) >= 12 ? c : '#0A0A0C';
}

/** Stable small hash so a game always gets the same art colour. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Game-art gradient for clips without a thumbnail: one of the theme's accent colours (picked by
 * game id) washed into the dark media base. Both stops keep white text ≥ 4.5:1.
 */
export function artGradient(base: string, accents: readonly string[], key: string): { from: string; to: string } {
  const accent = accents.length ? accents[hashString(key || 'clip') % accents.length] : base;
  let amount = 0.6;
  let from = mixHex(base, accent, amount);
  while (amount > 0 && contrast('#FFFFFF', from) < 4.5) {
    amount = Math.max(0, amount - 0.05);
    from = mixHex(base, accent, amount);
  }
  return { from, to: mixHex(base, '#000000', 0.35) };
}
