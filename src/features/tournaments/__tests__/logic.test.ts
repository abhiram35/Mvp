import {
  activeEntries,
  applicationProblem,
  canCheckIn,
  canStart,
  closesAtFor,
  createProblem,
  groupRounds,
  nextMatchFor,
  roundCount,
  roundName,
  sideOf,
  slotsLabel,
  tournamentPhase,
} from '../logic';
import type { TournamentEntry, TournamentMatch } from '../types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date(2026, 10, 20, 20, 0).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const tour = (over: Partial<{ status: 'registration' | 'live' | 'completed' | 'cancelled'; registration_closes_at: string; starts_at: string }> = {}) => ({
  status: 'registration' as const,
  registration_closes_at: iso(T0 - 3 * HOUR),
  starts_at: iso(T0),
  ...over,
});

function m(over: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm', tournament_id: 't', round: 1, slot: 0, team_a_id: null, team_b_id: null, format: 'bo1', status: 'pending',
    a_score: null, b_score: null, winner_team_id: null, next_match_id: null, next_slot: null, conversation_id: null,
    started_at: null, completed_at: null, created_at: '', updated_at: '', ...over,
  };
}

describe('phase', () => {
  it('walks registration → closed → check-in → starting', () => {
    expect(tournamentPhase(tour(), T0 - 4 * HOUR)).toBe('registration');
    expect(tournamentPhase(tour(), T0 - 2 * HOUR)).toBe('closed');
    expect(tournamentPhase(tour(), T0 - 30 * MIN)).toBe('checkin');
    expect(tournamentPhase(tour(), T0 + MIN)).toBe('starting');
  });
  it('uses the stored status once live / finished / cancelled', () => {
    expect(tournamentPhase(tour({ status: 'live' }), T0 - 4 * HOUR)).toBe('live');
    expect(tournamentPhase(tour({ status: 'completed' }), T0)).toBe('completed');
    expect(tournamentPhase(tour({ status: 'cancelled' }), T0)).toBe('cancelled');
  });
  it('check-in from 30 min before to 10 min after', () => {
    expect(canCheckIn(tour(), T0 - 31 * MIN)).toBe(false);
    expect(canCheckIn(tour(), T0 - 30 * MIN)).toBe(true);
    expect(canCheckIn(tour(), T0 + 10 * MIN)).toBe(true);
    expect(canCheckIn(tour(), T0 + 11 * MIN)).toBe(false);
    expect(canCheckIn(tour({ status: 'live' }), T0)).toBe(false);
  });
  it('start needs 2 checked-in teams and never drops teams while check-in is open', () => {
    expect(canStart(tour(), 2, 2, T0 - 31 * MIN)).toBe(false);
    expect(canStart(tour(), 1, 3, T0)).toBe(false);
    expect(canStart(tour(), 2, 2, T0 - 30 * MIN)).toBe(true); // everyone checked in: early start OK
    expect(canStart(tour(), 2, 5, T0 - 10 * MIN)).toBe(false); // 3 teams could still check in
    expect(canStart(tour(), 2, 5, T0)).toBe(true);
  });
});

describe('bracket helpers', () => {
  it('counts and names rounds', () => {
    expect([roundCount(2), roundCount(4), roundCount(8), roundCount(32)]).toEqual([1, 2, 3, 5]);
    expect(roundName(3, 3)).toBe('Final');
    expect(roundName(2, 3)).toBe('Semi-finals');
    expect(roundName(1, 3)).toBe('Quarter-finals');
    expect(roundName(1, 5)).toBe('Round of 32');
    expect(roundName(2, 5)).toBe('Round of 16');
  });
  it('groups by round and sorts by slot', () => {
    const g = groupRounds([m({ id: 'c', round: 2, slot: 0 }), m({ id: 'b', round: 1, slot: 1 }), m({ id: 'a', round: 1, slot: 0 })]);
    expect(g.map((r) => r.map((x) => x.id))).toEqual([['a', 'b'], ['c']]);
  });
  it('finds my side and my next match', () => {
    const list = [
      m({ id: 'done', round: 1, team_a_id: 'X', team_b_id: 'Y', status: 'completed' }),
      m({ id: 'next', round: 2, team_a_id: 'X', team_b_id: 'Z', status: 'ready' }),
    ];
    expect(sideOf(list[1], 'Z')).toBe('b');
    expect(sideOf(list[1], 'Q')).toBeNull();
    expect(nextMatchFor(list, 'X')?.id).toBe('next');
    expect(nextMatchFor(list, 'Y')).toBeNull();
    expect(nextMatchFor(list, null)).toBeNull();
  });
});

describe('forms', () => {
  const ok = {
    name: 'Friday Clash',
    description: '',
    prize: '',
    streamUrl: 'https://youtube.com/@vinq',
    startsAt: iso(T0),
    registrationClosesAt: closesAtFor(iso(T0), 3),
  };
  it('accepts a valid tournament', () => {
    expect(createProblem(ok, T0 - 24 * HOUR)).toBeNull();
  });
  it('rejects bad input', () => {
    expect(createProblem({ ...ok, name: 'ab' }, T0 - 24 * HOUR)).toMatch(/Name/);
    expect(createProblem({ ...ok, streamUrl: null }, T0 - 24 * HOUR)).toMatch(/stream/);
    expect(createProblem(ok, T0 - 30 * MIN)).toMatch(/1 hour/);
    expect(createProblem({ ...ok, registrationClosesAt: closesAtFor(iso(T0), 0.25) }, T0 - 24 * HOUR)).toMatch(/30 minutes/);
    expect(createProblem({ ...ok, startsAt: iso(T0 + 61 * 24 * HOUR), registrationClosesAt: iso(T0) }, T0)).toMatch(/60 days/);
  });
  it('validates organiser applications', () => {
    expect(applicationProblem('Vinq Club', 'We run weekly cafe LANs', true)).toBeNull();
    expect(applicationProblem('V', 'We run weekly cafe LANs', true)).toMatch(/name/);
    expect(applicationProblem('Vinq Club', 'short', true)).toMatch(/more/);
    expect(applicationProblem('Vinq Club', 'We run weekly cafe LANs', false)).toMatch(/rules/);
  });
});

describe('entries', () => {
  it('counts teams holding a slot', () => {
    const e = (status: TournamentEntry['status']) => ({ status }) as TournamentEntry;
    expect(activeEntries([e('registered'), e('withdrawn'), e('no_show'), e('playing'), e('champion')])).toHaveLength(3);
    expect(slotsLabel(3, 8)).toBe('3/8 teams');
  });
});
