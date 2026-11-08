import type { Profile, ProfileGame } from '../../../lib/types';
import { buildSaveGamesInput, formFromProfile, IN_GAME_ID_MAX, newGameEntry, validateGames, withGameIds } from '../form';

const profile: Profile = {
  id: 'u1',
  username: 'clutch_king',
  display_name: 'Clutch',
  avatar_url: null,
  bio: null,
  region: 'india_north',
  languages: ['English'],
  play_style: 'competitive',
  has_mic: true,
  play_times: ['evening'],
  created_at: '2026-01-01T00:00:00Z',
};

const games: ProfileGame[] = [
  { profile_id: 'u1', game_id: 'bgmi', rank: 'Ace', role: 'IGL', play_status: null },
  { profile_id: 'u1', game_id: 'genshin', rank: null, role: null, play_status: 'playing' },
];

describe('profile form helpers', () => {
  it('formFromProfile fills in-game IDs from gameIds', () => {
    const v = formFromProfile(profile, games, { bgmi: '5123456789' });
    expect(v.games).toEqual([
      { game_id: 'bgmi', rank: 'Ace', role: 'IGL', play_status: null, in_game_id: '5123456789' },
      { game_id: 'genshin', rank: null, role: '', play_status: 'playing', in_game_id: '' },
    ]);
  });

  it('withGameIds fills IDs loaded later', () => {
    const v = formFromProfile(profile, games);
    expect(withGameIds(v.games, { genshin: '800123456' }).map((g) => g.in_game_id)).toEqual(['', '800123456']);
  });

  it('validateGames limits in-game IDs to 64 characters (trimmed)', () => {
    const ok = { ...newGameEntry('bgmi'), in_game_id: `  ${'x'.repeat(IN_GAME_ID_MAX)}  ` };
    const long = { ...newGameEntry('valorant'), in_game_id: 'x'.repeat(IN_GAME_ID_MAX + 1) };
    const e = validateGames([ok, long]);
    expect(e.igid_bgmi).toBeUndefined();
    expect(e.igid_valorant).toMatch(/64/);
    expect(validateGames([]).games).toBeTruthy();
  });

  it('builds save_profile_games rows: value = set, empty = remove', () => {
    const rows = buildSaveGamesInput([
      { game_id: 'bgmi', rank: 'Ace', role: '  IGL ', play_status: null, in_game_id: ' 5123 ' },
      { game_id: 'genshin', rank: null, role: '   ', play_status: 'finished', in_game_id: '' },
    ]);
    expect(rows).toEqual([
      { game_id: 'bgmi', rank: 'Ace', role: 'IGL', play_status: null, in_game_id: '5123' },
      { game_id: 'genshin', rank: null, role: null, play_status: 'finished', in_game_id: '' },
    ]);
  });

  it('sends null (keep) for every in-game ID when they could not be loaded', () => {
    const rows = buildSaveGamesInput([{ ...newGameEntry('bgmi'), in_game_id: 'typed' }, newGameEntry('cs2')], { keepInGameIds: true });
    expect(rows.map((r) => r.in_game_id)).toEqual([null, null]);
  });
});
