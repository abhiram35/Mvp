import { buildTicker, levelProgress, modeSubtitles, pickMainGame, reputationLine, sheetSlotsLeft, tickerA11yLabel, type TickerInput } from '../logic';

const now = Date.parse('2026-11-13T18:00:00Z');
const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString();
const team = (id: string, tag: string) => ({ id, game_id: 'valorant', name: `Team ${tag}`, tag, region: 'india_south' as const, captain_id: 'x', created_at: '' });

const base: TickerInput = { liveTournaments: [], myScrims: [], readyMatches: [], myTeamIds: ['mine'], gameName: (id) => (id === 'valorant' ? 'VALORANT' : undefined) };

describe('buildTicker', () => {
  it('is empty when nothing is live or soon', () => {
    expect(buildTicker(base, now)).toEqual([]);
    expect(tickerA11yLabel([])).toBe('');
  });

  it('includes live tournaments, ready matches and booked scrims in the window', () => {
    const items = buildTicker(
      {
        ...base,
        liveTournaments: [
          { id: 't1', name: 'Friday Cup', game_id: 'valorant', status: 'live', starts_at: iso(-30) },
          { id: 't2', name: 'Not live', game_id: 'cs2', status: 'registration', starts_at: iso(30) },
        ],
        readyMatches: [{ id: 'm1', status: 'ready', tournament_id: 't1', round: 1, tournament_name: 'Friday Cup' }],
        myScrims: [
          { id: 's-soon', status: 'booked', scheduled_at: iso(90), host_team_id: 'mine', host: team('mine', 'ME'), opponent: team('o', 'OPP') },
          { id: 's-live', status: 'booked', scheduled_at: iso(-20), host_team_id: 'o2', host: team('o2', 'HOST'), opponent: team('mine', 'ME') },
          { id: 's-open', status: 'open', scheduled_at: iso(60), host_team_id: 'mine', host: team('mine', 'ME'), opponent: null },
          { id: 's-far', status: 'booked', scheduled_at: iso(60 * 30), host_team_id: 'mine', host: team('mine', 'ME'), opponent: team('o', 'OPP') },
          { id: 's-old', status: 'booked', scheduled_at: iso(-60 * 4), host_team_id: 'mine', host: team('mine', 'ME'), opponent: team('o', 'OPP') },
        ],
      },
      now,
    );
    expect(items.map((i) => i.key)).toEqual(['t:t1', 's:s-live', 'm:m1', 's:s-soon']);
    expect(items[0].text).toBe('Friday Cup · VALORANT');
    expect(items.find((i) => i.key === 's:s-live')?.text).toBe('Scrim vs HOST · live');
    expect(items.find((i) => i.key === 's:s-soon')).toMatchObject({ tone: 'soon', text: 'Scrim vs OPP · in 2h' });
    expect(items.find((i) => i.key === 'm:m1')?.route).toEqual({ pathname: '/tournaments/match/[id]', params: { id: 'm1' } });
    expect(tickerA11yLabel(items)).toMatch(/^Live now: Friday Cup/);
  });
});

describe('modeSubtitles', () => {
  it('falls back to static copy without counts', () => {
    expect(modeSubtitles(null)).toEqual({ scrims: 'Team practice', cups: 'Tournaments', lobbies: 'Join a group' });
    expect(modeSubtitles({ scrims: null, cups: 2, lobbies: 0 })).toEqual({ scrims: 'Team practice', cups: '2 live', lobbies: 'Host one' });
    expect(modeSubtitles({ scrims: 7, cups: 0, lobbies: 12 })).toEqual({ scrims: '7 open', cups: 'Upcoming cups', lobbies: '12 open' });
  });
});

describe('reputation', () => {
  const stats = { level: 4, xp_into_level: 30, xp_for_next: 120, ratings_received: 0, positive_ratings: 0 };
  it('shows level until enough ratings exist', () => {
    expect(reputationLine(null)).toBeNull();
    expect(reputationLine(stats)).toBe('Level 4');
    expect(reputationLine({ ...stats, ratings_received: 2, positive_ratings: 2 })).toBe('Level 4');
    expect(reputationLine({ ...stats, ratings_received: 12, positive_ratings: 11 })).toBe('92% reliable · Lv 4');
  });
  it('clamps level progress', () => {
    expect(levelProgress(null)).toBe(0);
    expect(levelProgress(stats)).toBeCloseTo(0.25);
    expect(levelProgress({ xp_into_level: 500, xp_for_next: 100 })).toBe(1);
    expect(levelProgress({ xp_into_level: 5, xp_for_next: 0 })).toBe(1);
  });
});

describe('pickMainGame', () => {
  const games: Record<string, { id: string; squadable: boolean }> = { story: { id: 'story', squadable: false }, val: { id: 'val', squadable: true } };
  it('prefers the first squadable profile game', () => {
    const byId = (id: string) => games[id];
    expect(pickMainGame(['story', 'val'], byId, (g) => g.squadable)?.id).toBe('val');
    expect(pickMainGame(['story', 'missing'], byId, (g) => g.squadable)?.id).toBe('story');
    expect(pickMainGame([], byId, (g) => g.squadable)).toBeUndefined();
  });
});

describe('sheetSlotsLeft', () => {
  it('lets a solo player invite 4 even though the party reloads after each invite', () => {
    const sent = new Set<string>();
    let invited = new Set<string>();
    let server = 4; // solo: 5 - 1
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(sheetSlotsLeft(server, sent, invited)).toBeGreaterThan(0);
      sent.add(id); // invite succeeded
      expect(sheetSlotsLeft(server, sent, invited)).toBe(server - 1); // before the reload
      invited = new Set([...invited, id]); // reload shows it…
      server -= 1; // …and the server count includes it
      expect(sheetSlotsLeft(server, sent, invited)).toBe(server); // counted once
    }
    expect(sheetSlotsLeft(server, sent, invited)).toBe(0);
  });

  it('ignores ids the server already counts and never goes below 0', () => {
    expect(sheetSlotsLeft(2, ['b'], new Set(['b']))).toBe(2);
    expect(sheetSlotsLeft(0, ['x'], new Set())).toBe(0);
  });
});
