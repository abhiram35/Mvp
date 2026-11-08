import { saveProfileGames } from '../api';
import { newGameEntry } from '../form';

const mockRpc = jest.fn();
jest.mock('../../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

describe('saveProfileGames', () => {
  beforeEach(() => mockRpc.mockReset());

  it('calls save_profile_games once with set / remove rows', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await saveProfileGames({
      games: [
        { ...newGameEntry('bgmi'), in_game_id: '5123' },
        { ...newGameEntry('cs2'), in_game_id: '' },
      ],
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('save_profile_games', {
      p_games: [
        { game_id: 'bgmi', rank: null, role: null, play_status: null, in_game_id: '5123' },
        { game_id: 'cs2', rank: null, role: null, play_status: null, in_game_id: '' },
      ],
    });
  });

  it('sends null (keep) IDs when asked, and surfaces RPC errors', async () => {
    mockRpc.mockResolvedValue({ error: new Error('too_many_games') });
    await expect(saveProfileGames({ games: [{ ...newGameEntry('bgmi'), in_game_id: 'x' }] }, { keepInGameIds: true })).rejects.toThrow(
      'too_many_games',
    );
    expect(mockRpc.mock.calls[0][1].p_games[0].in_game_id).toBeNull();
  });
});
