import type { CommunityPostKind } from '../../lib/types';
import { gameCategory } from '../games/art';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12m ago", "3h ago", "2d ago", then a short date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, now - then);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 999 → "999", 1200 → "1.2k" */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n / 1000)}k`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const COMMUNITY_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  bodyMin: 1,
  bodyMax: 5000,
  replyMax: 3000,
} as const;

export const KIND_FILTER_OPTIONS: readonly { value: CommunityPostKind; label: string }[] = [
  { value: 'take', label: 'Takes' },
  { value: 'question', label: 'Questions' },
];

/**
 * Spoiler box value after the author picks a game in the composer: story games are tagged by
 * default and un-tagged again when switching away, unless the author set the box themselves
 * (or is editing an existing post), in which case it is left alone.
 */
export function spoilerForGame(
  current: boolean,
  game: { category?: unknown } | null | undefined,
  opts: { editing: boolean; touched: boolean },
): boolean {
  if (opts.editing || opts.touched) return current;
  return !!game && gameCategory(game) === 'story';
}
