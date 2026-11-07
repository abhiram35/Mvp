import type { LfgPost, Region } from '../../lib/types';
import { REGION_LABELS } from '../../lib/types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12m ago", "3h ago", "2d ago" */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

/** "expires in 3h", "expires in 25m", "expired" */
export function expiresIn(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return 'expired';
  if (diff < MINUTE) return 'expires in <1m';
  if (diff < HOUR) return `expires in ${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `expires in ${Math.floor(diff / HOUR)}h`;
  return `expires in ${Math.floor(diff / DAY)}d`;
}

export function isExpired(post: Pick<LfgPost, 'expires_at'>, now: number = Date.now()): boolean {
  return new Date(post.expires_at).getTime() <= now;
}

/** True when new join requests can still be sent. */
export function isJoinable(post: Pick<LfgPost, 'status' | 'expires_at'>): boolean {
  return post.status === 'open' && !isExpired(post);
}

export const REGIONS = Object.keys(REGION_LABELS) as Region[];

/** Short region labels for compact chips. */
export function regionLabel(region: Region): string {
  return REGION_LABELS[region] ?? region;
}

export const DURATION_OPTIONS = [
  { hours: 1, label: '1h' },
  { hours: 3, label: '3h' },
  { hours: 6, label: '6h' },
  { hours: 12, label: '12h' },
] as const;

export const LFG_LIMITS = {
  title: 80,
  description: 500,
  requestMessage: 200,
  minSlots: 1,
  maxSlots: 9,
} as const;

/** Compact time left for the board's right column: "<1m", "25m", "3h", "2d", or null when expired. */
export function timeLeftShort(iso: string, now: number = Date.now()): string | null {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return null;
  if (diff < MINUTE) return '<1m';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  return `${Math.floor(diff / DAY)}d`;
}

/** True when an unexpired post closes within the next 30 minutes. */
export function expiresSoon(post: Pick<LfgPost, 'expires_at'>, now: number = Date.now()): boolean {
  const diff = new Date(post.expires_at).getTime() - now;
  return diff > 0 && diff < 30 * MINUTE;
}

/** Submit / host copy that reads well in every theme: "Host lobby" (Protocol, Defuse) / "Open in the Dojo" (Ronin). */
export function hostCta(words: { lobbies: string }): string {
  return words.lobbies.toLowerCase() === 'lobbies' ? 'Host lobby' : `Open in the ${words.lobbies}`;
}
