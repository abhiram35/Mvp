import type { SquadmateMatch } from '../../../lib/types';
import { formatQueueTime, initialQueue, matchReasons, queueReducer, STYLE_STOPS, styleStopIndex, withAlpha, type QueueState } from '../queue';

const searching: QueueState = { ...initialQueue, phase: 'searching' };

describe('queueReducer', () => {
  it('queues from idle and resets the index', () => {
    const s = queueReducer({ ...initialQueue, index: 3 }, { type: 'queue' });
    expect(s.phase).toBe('searching');
    expect(s.index).toBe(0);
  });

  it('goes to found with results and bumps the reveal key', () => {
    const s = queueReducer(searching, { type: 'results', count: 4 });
    expect(s.phase).toBe('found');
    expect(s.revealKey).toBe(initialQueue.revealKey + 1);
  });

  it('goes to empty with no results', () => {
    expect(queueReducer(searching, { type: 'results', count: 0 }).phase).toBe('empty');
  });

  it('stores the error message', () => {
    const s = queueReducer(searching, { type: 'error', message: 'offline' });
    expect(s).toMatchObject({ phase: 'error', error: 'offline' });
  });

  it('ignores late results and errors after cancel', () => {
    const cancelled = queueReducer(searching, { type: 'cancel' });
    expect(cancelled.phase).toBe('idle');
    expect(queueReducer(cancelled, { type: 'results', count: 2 })).toBe(cancelled);
    expect(queueReducer(cancelled, { type: 'error', message: 'x' })).toBe(cancelled);
  });

  it('cycles through players with next and wraps', () => {
    let s = queueReducer(searching, { type: 'results', count: 2 });
    s = queueReducer(s, { type: 'next', count: 2 });
    expect(s.index).toBe(1);
    s = queueReducer(s, { type: 'next', count: 2 });
    expect(s.index).toBe(0);
    expect(s.revealKey).toBe(initialQueue.revealKey + 3);
  });

  it('ignores next outside the reveal', () => {
    expect(queueReducer(initialQueue, { type: 'next', count: 3 })).toBe(initialQueue);
  });

  it('back returns to idle and clears the error', () => {
    const err = queueReducer(searching, { type: 'error', message: 'x' });
    expect(queueReducer(err, { type: 'back' })).toMatchObject({ phase: 'idle', error: null });
  });
});

describe('style stops', () => {
  it('maps play styles to stops, with null in the middle', () => {
    expect(styleStopIndex('casual')).toBe(0);
    expect(styleStopIndex(null)).toBe(1);
    expect(styleStopIndex('competitive')).toBe(2);
    expect(styleStopIndex('both')).toBe(1);
    expect(STYLE_STOPS.map((s) => s.value)).toEqual(['casual', null, 'competitive']);
  });
});

describe('formatQueueTime', () => {
  it('pads minutes and seconds', () => {
    expect(formatQueueTime(0)).toBe('00:00');
    expect(formatQueueTime(7)).toBe('00:07');
    expect(formatQueueTime(75)).toBe('01:15');
  });
  it('clamps negatives and huge values', () => {
    expect(formatQueueTime(-3)).toBe('00:00');
    expect(formatQueueTime(10_000)).toBe('99:59');
  });
});

function match(over: Omit<Partial<SquadmateMatch>, 'profile'> & { profile?: Partial<SquadmateMatch['profile']> } = {}): SquadmateMatch {
  return {
    profile: {
      id: 'p1', username: 'kestrel', display_name: 'Kestrel', avatar_url: null, bio: null, region: 'europe',
      languages: ['English'], play_style: 'casual', has_mic: false, play_times: [], created_at: '2026-01-01T00:00:00Z',
      ...(over.profile ?? {}),
    },
    game: { profile_id: 'p1', game_id: 'valorant', rank: null, role: null, play_status: null, ...(over.game ?? {}) },
    match_score: over.match_score ?? 80,
    shared_languages: over.shared_languages ?? [],
    reputation: over.reputation,
  };
}

describe('matchReasons', () => {
  it('always leads with the shared game', () => {
    expect(matchReasons(match(), { gameName: 'Valorant' })).toEqual(['Both play Valorant']);
  });

  it('adds languages, region, rank, mic and reputation, capped at four', () => {
    const r = matchReasons(
      match({
        shared_languages: ['English', 'Hindi', 'Tamil'],
        profile: { region: 'europe', has_mic: true },
        game: { profile_id: 'p1', game_id: 'valorant', rank: 'Gold', role: 'Duelist', play_status: null },
        reputation: { level: 4 } as SquadmateMatch['reputation'],
      }),
      { gameName: 'Valorant', myRegion: 'europe' },
    );
    expect(r).toEqual(['Both play Valorant', 'Speaks English & Hindi', 'Same region: Europe', 'Gold · Duelist']);
  });

  it('skips region when it differs', () => {
    const r = matchReasons(match({ profile: { region: 'europe', has_mic: true } }), { gameName: 'CS2', myRegion: 'north_america' });
    expect(r).toEqual(['Both play CS2', 'Has a mic']);
  });
});

describe('withAlpha', () => {
  it('converts 6- and 3-digit hex', () => {
    expect(withAlpha('#D9A23A', 0.5)).toBe('rgba(217,162,58,0.5)');
    expect(withAlpha('#fff', 1)).toBe('rgba(255,255,255,1)');
  });
  it('returns non-hex colours unchanged and clamps alpha', () => {
    expect(withAlpha('rgba(1,2,3,0.4)', 0.1)).toBe('rgba(1,2,3,0.4)');
    expect(withAlpha('#000000', 3)).toBe('rgba(0,0,0,1)');
  });
});
