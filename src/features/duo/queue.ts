// Pure logic for the Duo "matchmaking lobby": the queue state machine, the play-style
// slider stops, match reasons and small colour helpers. No React here, so it is unit-tested.

import { REGION_LABELS, type PlayStyle, type Region, type SquadmateMatch } from '../../lib/types';

// ── Queue state machine ─────────────────────────────────────────────────────
export type QueuePhase = 'idle' | 'searching' | 'found' | 'empty' | 'error';

export interface QueueState {
  phase: QueuePhase;
  /** Index of the player shown in the reveal (wraps around the results). */
  index: number;
  /** Bumped on every reveal / next so the player card re-animates. */
  revealKey: number;
  error: string | null;
}

export type QueueAction =
  | { type: 'queue' }
  | { type: 'results'; count: number }
  | { type: 'error'; message: string }
  | { type: 'next'; count: number }
  | { type: 'cancel' }
  | { type: 'back' };

export const initialQueue: QueueState = { phase: 'idle', index: 0, revealKey: 0, error: null };

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'queue':
      return { ...state, phase: 'searching', index: 0, error: null };
    case 'results':
      // A late result after Cancel / Back is ignored.
      if (state.phase !== 'searching') return state;
      return action.count > 0
        ? { ...state, phase: 'found', index: 0, revealKey: state.revealKey + 1 }
        : { ...state, phase: 'empty' };
    case 'error':
      if (state.phase !== 'searching') return state;
      return { ...state, phase: 'error', error: action.message };
    case 'next':
      if (state.phase !== 'found' || action.count <= 0) return state;
      return { ...state, index: (state.index + 1) % action.count, revealKey: state.revealKey + 1 };
    case 'cancel':
    case 'back':
      return { ...state, phase: 'idle', error: null };
  }
}

// ── Play-style slider ───────────────────────────────────────────────────────
/** Three stops on the Chill ↔ Sweaty bar. The middle stop means "any style" (no filter). */
export const STYLE_STOPS: readonly { value: PlayStyle | null; label: string; a11y: string }[] = [
  { value: 'casual', label: 'Chill', a11y: 'Chill (casual)' },
  { value: null, label: 'Any style', a11y: 'Any play style' },
  { value: 'competitive', label: 'Sweaty', a11y: 'Sweaty (competitive)' },
];

export function styleStopIndex(style: PlayStyle | null): number {
  const i = STYLE_STOPS.findIndex((s) => s.value === style);
  return i < 0 ? 1 : i;
}

// ── Timer ───────────────────────────────────────────────────────────────────
/** 7 → "00:07", 75 → "01:15" (caps at 99:59). */
export function formatQueueTime(seconds: number): string {
  const s = Math.max(0, Math.min(99 * 60 + 59, Math.floor(seconds)));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// ── Match reasons ───────────────────────────────────────────────────────────
export interface ReasonContext {
  gameName: string;
  myRegion?: Region | null;
}

/** Up to four short, true reasons why this player was matched (shown under the match ring). */
export function matchReasons(match: SquadmateMatch, ctx: ReasonContext): string[] {
  const out: string[] = [`Both play ${ctx.gameName}`];
  const p = match.profile;
  if (match.shared_languages.length > 0) out.push(`Speaks ${match.shared_languages.slice(0, 2).join(' & ')}`);
  if (ctx.myRegion && p.region === ctx.myRegion) out.push(`Same region: ${REGION_LABELS[p.region] ?? p.region}`);
  const rank = [match.game.rank, match.game.role].filter(Boolean).join(' · ');
  if (rank) out.push(rank);
  if (p.has_mic) out.push('Has a mic');
  if (match.reputation && match.reputation.level > 1) out.push(`Rep level ${match.reputation.level}`);
  return out.slice(0, 4);
}

// ── Colour helpers ──────────────────────────────────────────────────────────
/**
 * `#RGB` / `#RRGGBB` → `rgba(r,g,b,a)`. Anything else (already rgba, named colours) is returned
 * unchanged, so callers should not rely on the alpha for non-hex input.
 */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
