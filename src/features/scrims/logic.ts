// Pure scrim rules shared by the screens (no React, no network) — unit-tested.
// The server enforces the same rules (0015_scrims.sql); these only drive the UI.

import type { Scrim, ScrimFormat, ScrimStatus, TeamRole } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const SCRIM_RULES = {
  minRoster: 5,
  maxRoster: 7,
  checkInOpensMin: 30,
  checkInClosesMin: 15,
  noShowAfterMin: 15,
  lateCancelHours: 2,
  minLeadMin: 15,
  maxAheadDays: 14,
  notesMax: 200,
  messageMax: 140,
  lobbyMax: 300,
  escalateAfterHours: 2,
} as const;

export const FORMAT_LABELS: Record<ScrimFormat, string> = { bo1: 'Best of 1', bo3: 'Best of 3', bo5: 'Best of 5' };
export const FORMATS: readonly ScrimFormat[] = ['bo1', 'bo3', 'bo5'];

export const ROLE_LABELS: Record<TeamRole, string> = { captain: 'Captain', player: 'Player', sub: 'Sub' };

/** Maps needed to win a series. */
export function winsNeeded(format: ScrimFormat): number {
  return format === 'bo1' ? 1 : format === 'bo3' ? 2 : 3;
}

/** A finished series score: exactly one side reached the target, the other is below it. */
export function isValidScore(format: ScrimFormat, host: number, opp: number): boolean {
  const w = winsNeeded(format);
  if (!Number.isInteger(host) || !Number.isInteger(opp) || host < 0 || opp < 0) return false;
  return (host === w && opp < w) || (opp === w && host < w);
}

/** Every valid final score for a format, host first: bo3 → [2-0, 2-1, 1-2, 0-2]. */
export function scoreOptions(format: ScrimFormat): [number, number][] {
  const w = winsNeeded(format);
  const out: [number, number][] = [];
  for (let l = 0; l < w; l++) out.push([w, l]);
  for (let l = w - 1; l >= 0; l--) out.push([l, w]);
  return out;
}

export type CheckInWindow = 'early' | 'open' | 'closed';

export function checkInWindow(scheduledAt: string, now: number = Date.now()): CheckInWindow {
  const t = new Date(scheduledAt).getTime();
  if (now < t - SCRIM_RULES.checkInOpensMin * MIN) return 'early';
  if (now <= t + SCRIM_RULES.checkInClosesMin * MIN) return 'open';
  return 'closed';
}

export function hasStarted(scrim: Pick<Scrim, 'scheduled_at'>, now: number = Date.now()): boolean {
  return now >= new Date(scrim.scheduled_at).getTime();
}

/** Cancelling a booked scrim this close to the start counts against the team's reliability. */
export function isLateCancel(scrim: Pick<Scrim, 'status' | 'scheduled_at'>, now: number = Date.now()): boolean {
  return scrim.status === 'booked' && new Date(scrim.scheduled_at).getTime() - now < SCRIM_RULES.lateCancelHours * HOUR;
}

/** My side: did I check in, did they? null when I'm not in the scrim. */
export function sides(scrim: Pick<Scrim, 'host_team_id' | 'opponent_team_id' | 'host_checked_in_at' | 'opp_checked_in_at'>, myTeamId: string | null) {
  if (!myTeamId) return null;
  if (myTeamId === scrim.host_team_id) return { side: 'host' as const, mine: scrim.host_checked_in_at, theirs: scrim.opp_checked_in_at };
  if (myTeamId === scrim.opponent_team_id) return { side: 'opp' as const, mine: scrim.opp_checked_in_at, theirs: scrim.host_checked_in_at };
  return null;
}

/** I checked in, they didn't, and it's ≥ 15 min past the start. */
export function canClaimNoShow(scrim: Scrim, myTeamId: string | null, now: number = Date.now()): boolean {
  if (scrim.status !== 'booked') return false;
  const s = sides(scrim, myTeamId);
  if (!s || !s.mine || s.theirs) return false;
  return now >= new Date(scrim.scheduled_at).getTime() + SCRIM_RULES.noShowAfterMin * MIN;
}

export type DisplayStatus = ScrimStatus | 'expired' | 'live';

/** Status as players should see it: open scrims in the past are "expired"; booked ones that started are "live". */
export function displayStatus(scrim: Pick<Scrim, 'status' | 'scheduled_at'>, now: number = Date.now()): DisplayStatus {
  if (scrim.status === 'open' && hasStarted(scrim, now)) return 'expired';
  if (scrim.status === 'booked' && hasStarted(scrim, now)) return 'live';
  return scrim.status;
}

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  open: 'Open',
  booked: 'Booked',
  live: 'Live',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  expired: 'Expired',
};

/** "Today 21:30", "Tomorrow 09:00", "Tue 18 Nov, 21:30" in the device's time zone. */
export function formatScrimTime(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date(now))) / DAY);
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === -1) return `Yesterday ${time}`;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}, ${time}`;
}

/** "in 45m", "in 3h", "in 2d", "started" */
export function startsIn(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return 'started';
  if (diff < HOUR) return `in ${Math.max(1, Math.round(diff / MIN))}m`;
  if (diff < DAY) return `in ${Math.round(diff / HOUR)}h`;
  return `in ${Math.round(diff / DAY)}d`;
}

// ── Scheduling picker ───────────────────────────────────────────────────────
export interface DayOption {
  offset: number;
  label: string;
}

/** Today … +13 days (matches the 14-day limit). */
export function dayOptions(now: number = Date.now()): DayOption[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const base = new Date(now);
  return Array.from({ length: SCRIM_RULES.maxAheadDays }, (_, offset) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : `${days[d.getDay()]} ${d.getDate()}`;
    return { offset, label };
  });
}


/** The next full hour at least an hour away, as a day offset from `now` plus an hour. */
export function defaultSlot(now: number): { offset: number; hour: number } {
  const d = new Date(now + 60 * 60_000);
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) d.setHours(d.getHours() + 1, 0, 0, 0);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const offset = Math.round((startOfDay(d) - startOfDay(new Date(now))) / (24 * 3600_000));
  return { offset, hour: d.getHours() };
}

/** Local date `offset` days from now at hh:mm, as an ISO string. */
export function buildScheduledAt(offset: number, hour: number, minute: number, now: number = Date.now()): string {
  const b = new Date(now);
  return new Date(b.getFullYear(), b.getMonth(), b.getDate() + offset, hour, minute, 0, 0).toISOString();
}

/** null when the time is acceptable, otherwise a message for the player. */
export function scheduleProblem(iso: string, now: number = Date.now()): string | null {
  const t = new Date(iso).getTime();
  if (t < now + SCRIM_RULES.minLeadMin * MIN) return `Pick a time at least ${SCRIM_RULES.minLeadMin} minutes from now.`;
  if (t > now + SCRIM_RULES.maxAheadDays * DAY) return `Scrims can be booked up to ${SCRIM_RULES.maxAheadDays} days ahead.`;
  return null;
}

// ── Teams ───────────────────────────────────────────────────────────────────
/** Upper-cases and strips anything but A–Z / 0–9. */
export function cleanTag(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export function teamFormProblem(name: string, tag: string): string | null {
  const n = name.trim();
  if (n.length < 3 || n.length > 32) return 'Team name must be 3–32 characters.';
  if (!/^[A-Z0-9]{2,5}$/.test(tag)) return 'Tag must be 2–5 letters or numbers.';
  return null;
}

/** "92% reliable", "New team" */
export function reliabilityLabel(reliability: number | null | undefined): string {
  return reliability === null || reliability === undefined ? 'New team' : `${reliability}% reliable`;
}

/** Games with scrims. Falls back to VALORANT + CS2 on databases without the 0015 column. */
export function isScrimGame(game: { id: string; scrims_enabled?: boolean | null }): boolean {
  return typeof game.scrims_enabled === 'boolean' ? game.scrims_enabled : game.id === 'valorant' || game.id === 'cs2';
}

/** A booked scrim nobody finished: 2 h after the start a captain can hand it to a moderator. */
export function canEscalate(scrim: Pick<Scrim, 'status' | 'scheduled_at'>, now: number = Date.now()): boolean {
  return scrim.status === 'booked' && now >= new Date(scrim.scheduled_at).getTime() + SCRIM_RULES.escalateAfterHours * HOUR;
}

/** Label for the team behind an id on a finished scrim (null id = the team was disbanded). */
export function sideTeamLabel(
  id: string | null,
  scrim: Pick<Scrim, 'host_team_id' | 'host' | 'opponent'>,
): string {
  if (!id) return 'A disbanded team';
  const team = id === scrim.host_team_id ? scrim.host : scrim.opponent;
  return team ? `${team.name} [${team.tag}]` : 'A disbanded team';
}

// ── Streaming (0016) ────────────────────────────────────────────────────────
const STREAM_URL = /^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be|twitch\.tv)\/\S+$/i;

/** Trims the link and checks it's a YouTube / Twitch https URL (same rule as the server). null = invalid. */
export function cleanStreamUrl(raw: string): string | null {
  const url = raw.trim();
  return url.length <= 200 && STREAM_URL.test(url) ? url : null;
}

/** Hours after the start during which a scrim with a stream link counts as "live". */
const LIVE_WINDOW_HOURS = 4;

/** A booked scrim with a stream link that has started (and isn't hours old): show LIVE. */
export function isStreamingNow(scrim: Pick<Scrim, 'status' | 'scheduled_at' | 'stream_url'>, now: number = Date.now()): boolean {
  if (!scrim.stream_url || scrim.status !== 'booked') return false;
  const t = new Date(scrim.scheduled_at).getTime();
  return now >= t && now < t + LIVE_WINDOW_HOURS * HOUR;
}

/** "YouTube" / "Twitch" for button labels. */
export function streamPlatform(url: string): 'YouTube' | 'Twitch' {
  return /twitch\.tv/i.test(url) ? 'Twitch' : 'YouTube';
}
