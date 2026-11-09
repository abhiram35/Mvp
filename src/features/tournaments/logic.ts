// Pure tournament rules for the UI (the server enforces the same in 0016_tournaments.sql).
import type { EntryStatus, Tournament, TournamentEntry, TournamentMatch, TournamentStatus } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const TOURNAMENT_RULES = {
  minRoster: 5,
  maxTeamsOptions: [4, 8, 16, 32] as const,
  checkInOpensMin: 30,
  checkInGraceMin: 10,
  minLeadHours: 1,
  maxAheadDays: 60,
  nameMin: 3,
  nameMax: 60,
  descriptionMax: 2000,
  prizeMax: 200,
  lobbyMax: 300,
  orgNameMax: 60,
  aboutMin: 10,
  aboutMax: 500,
} as const;

/** Entries that still hold a slot (count towards max_teams). */
export const ACTIVE_ENTRY: readonly EntryStatus[] = ['registered', 'playing', 'eliminated', 'champion'];

export function activeEntries(entries: TournamentEntry[]): TournamentEntry[] {
  return entries.filter((e) => ACTIVE_ENTRY.includes(e.status));
}

export type Phase = 'registration' | 'closed' | 'checkin' | 'starting' | 'live' | 'completed' | 'cancelled';

/**
 * What players should see right now:
 * registration (open) → closed (registration over, check-in not yet) → checkin (30 min before) →
 * starting (start time passed, organiser hasn't started) → live → completed / cancelled.
 */
export function tournamentPhase(t: Pick<Tournament, 'status' | 'registration_closes_at' | 'starts_at'>, now: number = Date.now()): Phase {
  if (t.status === 'live') return 'live';
  if (t.status === 'completed') return 'completed';
  if (t.status === 'cancelled') return 'cancelled';
  const closes = new Date(t.registration_closes_at).getTime();
  const starts = new Date(t.starts_at).getTime();
  if (now >= starts) return 'starting';
  if (now >= starts - TOURNAMENT_RULES.checkInOpensMin * MIN) return 'checkin';
  if (now >= closes) return 'closed';
  return 'registration';
}

export const PHASE_LABELS: Record<Phase, string> = {
  registration: 'Registration open',
  closed: 'Registration closed',
  checkin: 'Check-in open',
  starting: 'Starting soon',
  live: 'Live',
  completed: 'Finished',
  cancelled: 'Cancelled',
};

export const STATUS_ORDER: Record<TournamentStatus, number> = { live: 0, registration: 1, completed: 2, cancelled: 3 };

export function canCheckIn(t: Pick<Tournament, 'status' | 'starts_at'>, now: number = Date.now()): boolean {
  if (t.status !== 'registration') return false;
  const s = new Date(t.starts_at).getTime();
  return now >= s - TOURNAMENT_RULES.checkInOpensMin * MIN && now <= s + TOURNAMENT_RULES.checkInGraceMin * MIN;
}

export function canStart(t: Pick<Tournament, 'status' | 'starts_at'>, checkedIn: number, now: number = Date.now()): boolean {
  return t.status === 'registration' && checkedIn >= 2 && now >= new Date(t.starts_at).getTime() - TOURNAMENT_RULES.checkInOpensMin * MIN;
}

// ── Bracket ─────────────────────────────────────────────────────────────────
/** Number of rounds for a bracket of `size` (power of two). */
export function roundCount(size: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, size))));
}

/** "Final", "Semi-finals", "Quarter-finals", "Round of 16", … for round `r` of `total`. */
export function roundName(r: number, total: number): string {
  const fromEnd = total - r;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  return `Round of ${2 ** (fromEnd + 1)}`;
}

/** Matches grouped by round (ascending), each round sorted by slot. */
export function groupRounds(matches: TournamentMatch[]): TournamentMatch[][] {
  const byRound = new Map<number, TournamentMatch[]>();
  for (const m of matches) {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }
  return [...byRound.keys()].sort((a, b) => a - b).map((r) => (byRound.get(r) ?? []).sort((a, b) => a.slot - b.slot));
}

/** Which side the team is on in a match, or null. */
export function sideOf(m: Pick<TournamentMatch, 'team_a_id' | 'team_b_id'>, teamId: string | null): 'a' | 'b' | null {
  if (!teamId) return null;
  if (m.team_a_id === teamId) return 'a';
  if (m.team_b_id === teamId) return 'b';
  return null;
}

/** The match this team should play next (ready or disputed), if any. */
export function nextMatchFor(matches: TournamentMatch[], teamId: string | null): TournamentMatch | null {
  if (!teamId) return null;
  return (
    matches
      .filter((m) => (m.status === 'ready' || m.status === 'disputed') && sideOf(m, teamId))
      .sort((a, b) => a.round - b.round)[0] ?? null
  );
}

// ── Create form ─────────────────────────────────────────────────────────────
export interface CreateInput {
  name: string;
  description: string;
  prize: string;
  streamUrl: string | null;
  registrationClosesAt: string;
  startsAt: string;
}

/** null when OK, else a message for the organiser. */
export function createProblem(i: CreateInput, now: number = Date.now()): string | null {
  const name = i.name.trim();
  if (name.length < TOURNAMENT_RULES.nameMin || name.length > TOURNAMENT_RULES.nameMax) return `Name must be ${TOURNAMENT_RULES.nameMin}–${TOURNAMENT_RULES.nameMax} characters.`;
  if (i.description.length > TOURNAMENT_RULES.descriptionMax) return `Rules can be at most ${TOURNAMENT_RULES.descriptionMax} characters.`;
  if (i.prize.length > TOURNAMENT_RULES.prizeMax) return `Prize can be at most ${TOURNAMENT_RULES.prizeMax} characters.`;
  if (!i.streamUrl) return 'Add the YouTube or Twitch channel where you will stream it (https://…).';
  const starts = new Date(i.startsAt).getTime();
  const closes = new Date(i.registrationClosesAt).getTime();
  if (starts < now + TOURNAMENT_RULES.minLeadHours * HOUR) return 'Start at least 1 hour from now.';
  if (starts > now + TOURNAMENT_RULES.maxAheadDays * DAY) return `Start within ${TOURNAMENT_RULES.maxAheadDays} days.`;
  if (closes <= now) return 'Registration must close in the future.';
  if (closes > starts - TOURNAMENT_RULES.checkInOpensMin * MIN) return 'Close registration at least 30 minutes before the start.';
  return null;
}

/** Hours-before-start choices for when registration closes. */
export const CLOSE_OPTIONS: readonly { hours: number; label: string }[] = [
  { hours: 1, label: '1 h before' },
  { hours: 3, label: '3 h before' },
  { hours: 12, label: '12 h before' },
  { hours: 24, label: '1 day before' },
  { hours: 72, label: '3 days before' },
];

export function closesAtFor(startsAt: string, hoursBefore: number): string {
  return new Date(new Date(startsAt).getTime() - hoursBefore * HOUR).toISOString();
}

export function applicationProblem(orgName: string, about: string, acceptTerms: boolean): string | null {
  const n = orgName.trim();
  if (n.length < 2 || n.length > TOURNAMENT_RULES.orgNameMax) return 'Organiser name must be 2–60 characters.';
  const a = about.trim();
  if (a.length < TOURNAMENT_RULES.aboutMin) return 'Tell us a little more about you (at least 10 characters).';
  if (a.length > TOURNAMENT_RULES.aboutMax) return 'Keep it under 500 characters.';
  if (!acceptTerms) return 'Accept the organiser rules to apply.';
  return null;
}

/** "3/8 teams" */
export function slotsLabel(registered: number, max: number): string {
  return `${registered}/${max} teams`;
}
