import {
  buildScheduledAt,
  canClaimNoShow,
  canEscalate,
  defaultSlot,
  sideTeamLabel,
  checkInWindow,
  cleanTag,
  dayOptions,
  displayStatus,
  formatScrimTime,
  isLateCancel,
  isScrimGame,
  isValidScore,
  reliabilityLabel,
  scheduleProblem,
  scoreOptions,
  sides,
  startsIn,
  teamFormProblem,
  winsNeeded,
} from '../logic';
import type { Scrim } from '../types';

const MIN = 60_000;
const T0 = new Date(2026, 10, 9, 20, 0, 0).getTime(); // 9 Nov 2026 20:00 local

function scrim(over: Partial<Scrim> = {}): Scrim {
  return {
    id: 's1', game_id: 'valorant', host_team_id: 'A', opponent_team_id: 'B', region: 'europe',
    scheduled_at: new Date(T0).toISOString(), format: 'bo3', rank_min: null, rank_max: null, notes: null,
    status: 'booked', host_checked_in_at: null, opp_checked_in_at: null, host_score: null, opp_score: null,
    no_show_team_id: null, cancelled_by_team_id: null, late_cancel: false, conversation_id: null,
    created_by: 'u', created_at: '', updated_at: '', host: null, opponent: null, ...over,
  };
}

describe('scores', () => {
  it('wins needed per format', () => {
    expect([winsNeeded('bo1'), winsNeeded('bo3'), winsNeeded('bo5')]).toEqual([1, 2, 3]);
  });
  it('validates final series scores', () => {
    expect(isValidScore('bo1', 1, 0)).toBe(true);
    expect(isValidScore('bo1', 1, 1)).toBe(false);
    expect(isValidScore('bo3', 2, 1)).toBe(true);
    expect(isValidScore('bo3', 1, 2)).toBe(true);
    expect(isValidScore('bo3', 2, 2)).toBe(false);
    expect(isValidScore('bo3', 3, 0)).toBe(false);
    expect(isValidScore('bo5', 3, 2)).toBe(true);
    expect(isValidScore('bo5', -1, 3)).toBe(false);
    expect(isValidScore('bo3', 1.5, 2)).toBe(false);
  });
  it('lists every valid score, all of which validate', () => {
    expect(scoreOptions('bo3')).toEqual([[2, 0], [2, 1], [1, 2], [0, 2]]);
    expect(scoreOptions('bo5')).toHaveLength(6);
    for (const f of ['bo1', 'bo3', 'bo5'] as const) for (const [h, o] of scoreOptions(f)) expect(isValidScore(f, h, o)).toBe(true);
  });
});

describe('check-in and no-show', () => {
  const iso = new Date(T0).toISOString();
  it('opens 30 min before and closes 15 min after the start', () => {
    expect(checkInWindow(iso, T0 - 31 * MIN)).toBe('early');
    expect(checkInWindow(iso, T0 - 30 * MIN)).toBe('open');
    expect(checkInWindow(iso, T0 + 15 * MIN)).toBe('open');
    expect(checkInWindow(iso, T0 + 16 * MIN)).toBe('closed');
  });
  it('works out my side', () => {
    const sc = scrim({ host_checked_in_at: 'x' });
    expect(sides(sc, 'A')).toEqual({ side: 'host', mine: 'x', theirs: null });
    expect(sides(sc, 'B')).toEqual({ side: 'opp', mine: null, theirs: 'x' });
    expect(sides(sc, 'C')).toBeNull();
    expect(sides(sc, null)).toBeNull();
  });
  it('allows a no-show claim only after 15 min, when I checked in and they did not', () => {
    const sc = scrim({ host_checked_in_at: 'x' });
    expect(canClaimNoShow(sc, 'A', T0 + 14 * MIN)).toBe(false);
    expect(canClaimNoShow(sc, 'A', T0 + 15 * MIN)).toBe(true);
    expect(canClaimNoShow(sc, 'B', T0 + 20 * MIN)).toBe(false);
    expect(canClaimNoShow(scrim({ host_checked_in_at: 'x', opp_checked_in_at: 'y' }), 'A', T0 + 20 * MIN)).toBe(false);
    expect(canClaimNoShow(scrim({ status: 'completed', host_checked_in_at: 'x' }), 'A', T0 + 20 * MIN)).toBe(false);
  });
  it('flags late cancels within 2 hours of a booked scrim', () => {
    expect(isLateCancel(scrim(), T0 - 119 * MIN)).toBe(true);
    expect(isLateCancel(scrim(), T0 - 121 * MIN)).toBe(false);
    expect(isLateCancel(scrim({ status: 'open' }), T0 - 10 * MIN)).toBe(false);
  });
});

describe('display status', () => {
  it('marks past open scrims expired and started booked ones live', () => {
    expect(displayStatus(scrim({ status: 'open' }), T0 + 1)).toBe('expired');
    expect(displayStatus(scrim({ status: 'open' }), T0 - 1)).toBe('open');
    expect(displayStatus(scrim(), T0)).toBe('live');
    expect(displayStatus(scrim({ status: 'completed' }), T0 + 1)).toBe('completed');
  });
});

describe('time formatting and picking', () => {
  it('formats relative days', () => {
    expect(formatScrimTime(new Date(T0).toISOString(), T0 - 3 * 3600_000)).toBe('Today 20:00');
    expect(formatScrimTime(new Date(T0 + 24 * 3600_000).toISOString(), T0)).toBe('Tomorrow 20:00');
    expect(formatScrimTime(new Date(2026, 10, 12, 9, 5).toISOString(), T0)).toBe('Thu 12 Nov, 09:05');
  });
  it('says how soon it starts', () => {
    expect(startsIn(new Date(T0 + 45 * MIN).toISOString(), T0)).toBe('in 45m');
    expect(startsIn(new Date(T0 + 3 * 3600_000).toISOString(), T0)).toBe('in 3h');
    expect(startsIn(new Date(T0 - 1).toISOString(), T0)).toBe('started');
  });
  it('offers 14 days starting today', () => {
    const d = dayOptions(T0);
    expect(d).toHaveLength(14);
    expect(d[0]).toEqual({ offset: 0, label: 'Today' });
    expect(d[1].label).toBe('Tomorrow');
    expect(d[2].label).toBe('Wed 11');
  });
  it('builds a local time and checks the window', () => {
    const iso = buildScheduledAt(1, 21, 30, T0);
    expect(new Date(iso).getHours()).toBe(21);
    expect(new Date(iso).getDate()).toBe(10);
    expect(scheduleProblem(iso, T0)).toBeNull();
    expect(scheduleProblem(new Date(T0 + 5 * MIN).toISOString(), T0)).toMatch(/15 minutes/);
    expect(scheduleProblem(new Date(T0 + 15 * 24 * 3600_000).toISOString(), T0)).toMatch(/14 days/);
  });
});

describe('teams', () => {
  it('cleans tags', () => {
    expect(cleanTag('n-owl!')).toBe('NOWL');
    expect(cleanTag('abcdefg')).toBe('ABCDE');
  });
  it('validates the team form', () => {
    expect(teamFormProblem('Night Owls', 'NOWL')).toBeNull();
    expect(teamFormProblem('NO', 'NOWL')).toMatch(/name/);
    expect(teamFormProblem('Night Owls', 'N')).toMatch(/Tag/);
  });
  it('labels reliability', () => {
    expect(reliabilityLabel(null)).toBe('New team');
    expect(reliabilityLabel(94)).toBe('94% reliable');
  });
  it('knows which games have scrims', () => {
    expect(isScrimGame({ id: 'valorant' })).toBe(true);
    expect(isScrimGame({ id: 'bgmi' })).toBe(false);
    expect(isScrimGame({ id: 'bgmi', scrims_enabled: true })).toBe(true);
    expect(isScrimGame({ id: 'cs2', scrims_enabled: false })).toBe(false);
  });
});

describe('review fixes', () => {
  it('default slot is never in the past, even late at night', () => {
    const late = new Date(2026, 10, 9, 22, 30).getTime();
    expect(defaultSlot(late)).toEqual({ offset: 1, hour: 0 }); // tomorrow 00:00
    const iso = buildScheduledAt(1, 0, 0, late);
    expect(scheduleProblem(iso, late)).toBeNull();
    expect(defaultSlot(new Date(2026, 10, 9, 18, 0).getTime())).toEqual({ offset: 0, hour: 19 });
    expect(defaultSlot(new Date(2026, 10, 9, 18, 10).getTime())).toEqual({ offset: 0, hour: 20 });
  });
  it('escalation opens 2 hours after the start of a booked scrim', () => {
    expect(canEscalate(scrim(), T0 + 119 * MIN)).toBe(false);
    expect(canEscalate(scrim(), T0 + 120 * MIN)).toBe(true);
    expect(canEscalate(scrim({ status: 'disputed' }), T0 + 300 * MIN)).toBe(false);
  });
  it('labels disbanded teams instead of "Open slot"', () => {
    const sc = scrim({ host: { id: 'A', game_id: 'valorant', name: 'Night Owls', tag: 'NOWL', region: 'europe', captain_id: 'u', created_at: '' } });
    expect(sideTeamLabel(null, sc)).toBe('A disbanded team');
    expect(sideTeamLabel('A', sc)).toBe('Night Owls [NOWL]');
    expect(sideTeamLabel('B', sc)).toBe('A disbanded team');
  });
});
