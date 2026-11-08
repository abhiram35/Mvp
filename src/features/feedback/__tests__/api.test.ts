import { supabase } from '../../../lib/supabase';
import { FEEDBACK_MAX, sendFeedback, validateFeedback } from '../api';

// jest hoists these mocks above the imports.
jest.mock('../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../telemetry', () => ({ appVersion: () => '1.1.0 (1)' }));

describe('validateFeedback', () => {
  it('needs at least 3 real characters', () => {
    expect(validateFeedback('  hi ')).not.toBeNull();
    expect(validateFeedback('Add voice')).toBeNull();
  });
  it('caps the length', () => {
    expect(validateFeedback('x'.repeat(FEEDBACK_MAX + 1))).not.toBeNull();
  });
});

describe('sendFeedback', () => {
  const insert = jest.fn();
  beforeEach(() => {
    insert.mockReset();
    (supabase.from as jest.Mock).mockReturnValue({ insert });
  });
  it('inserts a trimmed message with version and platform for the player', async () => {
    insert.mockResolvedValue({ error: null });
    await sendFeedback('user-1', 'bug', '  Lobby list is empty  ');
    expect(supabase.from).toHaveBeenCalledWith('feedback');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: 'user-1', category: 'bug', message: 'Lobby list is empty', app_version: '1.1.0 (1)' }),
    );
  });
  it('passes the daily-limit message through and hides other errors', async () => {
    insert.mockResolvedValue({ error: { code: 'P0001', message: 'You have sent a lot of feedback today. Thanks! Try again tomorrow.' } });
    await expect(sendFeedback('u', 'idea', 'Another idea')).rejects.toThrow('Try again tomorrow');
    insert.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    await expect(sendFeedback('u', 'idea', 'Another idea')).rejects.toThrow("Couldn't send your feedback");
  });
  it('does not call the server for invalid input', async () => {
    await expect(sendFeedback('u', 'idea', 'no')).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});
