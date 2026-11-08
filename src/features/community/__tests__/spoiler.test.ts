import { normalisePostSummaries } from '../api';

jest.mock('../../../lib/supabase', () => ({ supabase: {}, pausedMessageFor: () => null }));
jest.mock('../../safety/blocks', () => ({ useBlockedIds: () => new Set() }));

const base = {
  id: 'p1',
  author_id: 'u1',
  kind: 'take',
  game_id: 'elden_ring',
  title: 'That ending',
  body: 'The final boss is…',
  gg_count: 0,
  reply_count: 0,
  created_at: '2026-11-01T10:00:00Z',
};

describe('normalisePost is_spoiler', () => {
  it('is true only for an explicit true', () => {
    const rows = [true, false, undefined, 'true', 1, null].map((v, i) => ({
      post: { ...base, id: `p${i}`, is_spoiler: v },
      author: { id: 'u1', username: 'ace' },
    }));
    expect(normalisePostSummaries(rows).map((s) => s.post.is_spoiler)).toEqual([true, false, false, false, false, false]);
  });

  it('defaults to false for rows from before the spoiler column existed', () => {
    const [s] = normalisePostSummaries([{ post: base, author: { id: 'u1' } }]);
    expect(s.post.is_spoiler).toBe(false);
  });
});
