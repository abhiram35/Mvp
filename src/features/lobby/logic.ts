// Pure helpers for the Lobby tab: the live ticker, mode tile subtitles, the player bar line and
// the reputation ring. Tested in __tests__/logic.test.ts.
import type { PlayerStats } from '../../lib/types';
import { startsIn } from '../scrims/logic';
import type { Scrim } from '../scrims/types';
import type { Tournament, TournamentMatch } from '../tournaments/types';

const HOUR = 3600_000;
/** A booked scrim reads as "live" for this long after its start time. */
export const SCRIM_LIVE_WINDOW_MS = 3 * HOUR;
/** Upcoming scrims enter the ticker this long before they start. */
export const SCRIM_SOON_WINDOW_MS = 24 * HOUR;
/** Ratings needed before "N% reliable" is shown (same rule as the player card). */
export const MIN_RATINGS_FOR_RELIABLE = 3;

export type TickerRoute =
  | { pathname: '/tournaments/[id]'; params: { id: string } }
  | { pathname: '/tournaments/match/[id]'; params: { id: string } }
  | { pathname: '/scrims/[id]'; params: { id: string } };

export interface TickerItem {
  key: string;
  /** 'live' items get the live dot; 'soon' ones a clock. */
  tone: 'live' | 'soon';
  text: string;
  route: TickerRoute;
  /** Sort key: live first, then by start time. */
  at: number;
}

export interface TickerInput {
  liveTournaments: Pick<Tournament, 'id' | 'name' | 'game_id' | 'status' | 'starts_at'>[];
  myScrims: Pick<Scrim, 'id' | 'status' | 'scheduled_at' | 'host_team_id' | 'host' | 'opponent'>[];
  readyMatches: (Pick<TournamentMatch, 'id' | 'status' | 'tournament_id' | 'round'> & { tournament_name?: string | null })[];
  /** My team ids, to name the opponent in "vs <TAG>". */
  myTeamIds: readonly string[];
  gameName: (id: string) => string | undefined;
}

function teamLabel(team: { tag?: string | null; name?: string | null } | null | undefined): string {
  return (team?.tag || team?.name || 'TBD').toString();
}

/** Ticker entries, live first, then soonest first. Empty when nothing is happening. */
export function buildTicker(input: TickerInput, now: number): TickerItem[] {
  const items: TickerItem[] = [];
  for (const t of input.liveTournaments) {
    if (t.status !== 'live') continue;
    const game = input.gameName(t.game_id);
    items.push({
      key: `t:${t.id}`,
      tone: 'live',
      text: `${t.name}${game ? ` · ${game}` : ''}`,
      route: { pathname: '/tournaments/[id]', params: { id: t.id } },
      at: Date.parse(t.starts_at) || now,
    });
  }
  for (const m of input.readyMatches) {
    if (m.status !== 'ready') continue;
    items.push({
      key: `m:${m.id}`,
      tone: 'live',
      text: `Your match is ready${m.tournament_name ? ` · ${m.tournament_name}` : ''}`,
      route: { pathname: '/tournaments/match/[id]', params: { id: m.id } },
      at: now - 1, // matches I must play go before the other live items
    });
  }
  const mine = new Set(input.myTeamIds);
  for (const s of input.myScrims) {
    if (s.status !== 'booked') continue;
    const at = Date.parse(s.scheduled_at);
    if (!Number.isFinite(at)) continue;
    const diff = at - now;
    const live = diff <= 0 && -diff < SCRIM_LIVE_WINDOW_MS;
    const soon = diff > 0 && diff <= SCRIM_SOON_WINDOW_MS;
    if (!live && !soon) continue;
    const opponent = s.host_team_id && mine.has(s.host_team_id) ? s.opponent : s.host;
    items.push({
      key: `s:${s.id}`,
      tone: live ? 'live' : 'soon',
      text: live ? `Scrim vs ${teamLabel(opponent)} · live` : `Scrim vs ${teamLabel(opponent)} · ${startsIn(s.scheduled_at, now)}`,
      route: { pathname: '/scrims/[id]', params: { id: s.id } },
      at,
    });
  }
  return items.sort((a, b) => (a.tone === b.tone ? a.at - b.at : a.tone === 'live' ? -1 : 1));
}

/** Screen-reader summary of the ticker. */
export function tickerA11yLabel(items: readonly TickerItem[]): string {
  if (items.length === 0) return '';
  return `Live now: ${items.map((i) => i.text).join('; ')}`;
}

export interface ModeCounts {
  scrims: number | null;
  cups: number | null;
  lobbies: number | null;
}

/** Subtitles for the three mode tiles; static copy when a count isn't known. */
export function modeSubtitles(c: ModeCounts | null): { scrims: string; cups: string; lobbies: string } {
  const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const scrims = n(c?.scrims);
  const cups = n(c?.cups);
  const lobbies = n(c?.lobbies);
  return {
    scrims: scrims == null ? 'Team practice' : scrims === 0 ? 'Post the first' : `${scrims} open`,
    cups: cups == null ? 'Tournaments' : cups === 0 ? 'Upcoming cups' : `${cups} live`,
    lobbies: lobbies == null ? 'Join a group' : lobbies === 0 ? 'Host one' : `${lobbies} open`,
  };
}

/** XP progress into the current level, 0..1. */
export function levelProgress(stats: Pick<PlayerStats, 'xp_into_level' | 'xp_for_next'> | null | undefined): number {
  if (!stats) return 0;
  const need = Math.max(1, stats.xp_for_next);
  return Math.max(0, Math.min(1, stats.xp_into_level / need));
}

/** "92% reliable" once enough teammates rated the player; else "Level 4" (or null while loading). */
export function reputationLine(stats: Pick<PlayerStats, 'level' | 'ratings_received' | 'positive_ratings'> | null | undefined): string | null {
  if (!stats) return null;
  if (stats.ratings_received >= MIN_RATINGS_FOR_RELIABLE) {
    const pct = Math.round((stats.positive_ratings / stats.ratings_received) * 100);
    return `${Math.max(0, Math.min(100, pct))}% reliable · Lv ${stats.level}`;
  }
  return `Level ${stats.level}`;
}

/** The player's main game: the first of their profile games that can be squadded, else the first. */
export function pickMainGame<G extends { id: string }>(profileGameIds: readonly string[], byId: (id: string) => G | undefined, squadable: (g: G) => boolean): G | undefined {
  const games = profileGameIds.map(byId).filter((g): g is G => !!g);
  return games.find(squadable) ?? games[0];
}
