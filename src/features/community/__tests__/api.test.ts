// api.ts imports the Supabase client and the blocks module; neither is needed for the
// pure helpers tested here, so both are replaced with stubs (jest.mock is hoisted above imports).
import {
  communityErrorMessage,
  isNotFoundError,
  isOwnGgError,
  normalisePostSummaries,
  normaliseReplyItems,
  wasEdited,
} from '../api';

jest.mock('../../../lib/supabase', () => ({ supabase: {}, pausedMessageFor: () => null }));
jest.mock('../../safety/blocks', () => ({ useBlockedIds: () => new Set() }));

describe('community error helpers', () => {
  it('detects not-found and own-GG errors by Postgres code', () => {
    expect(isNotFoundError({ code: 'P0002', message: 'Post not found' })).toBe(true);
    expect(isNotFoundError({ code: '22023' })).toBe(false);
    expect(isOwnGgError({ code: '22023', message: 'You cannot GG your own post' })).toBe(true);
    expect(isOwnGgError(null)).toBe(false);
    expect(isOwnGgError(new Error('boom'))).toBe(false);
  });

  it('maps deleted / missing content to a friendly message', () => {
    expect(communityErrorMessage({ code: 'P0002', message: 'Post not found' })).toBe('This was deleted or is no longer available.');
    expect(communityErrorMessage({ code: '23503', message: 'violates foreign key' })).toBe('This was deleted or is no longer available.');
  });

  it('hides raw RLS errors but keeps other 42501 messages', () => {
    expect(communityErrorMessage({ code: '42501', message: 'new row violates row-level security policy' })).toBe(
      "You can't do that on this post.",
    );
    expect(communityErrorMessage({ code: '42501', message: 'Only the author can pick the answer' })).toBe(
      'Only the author can pick the answer',
    );
  });

  it('falls back to the error message, or a generic one', () => {
    expect(communityErrorMessage({ code: 'XX000', message: 'Title too short' })).toBe('Title too short');
    expect(communityErrorMessage(new Error('Network request failed'))).toBe('Network request failed');
    expect(communityErrorMessage({})).toBe('Something went wrong. Please try again.');
  });
});

describe('wasEdited', () => {
  it('is true only when updated_at is more than a second after created_at', () => {
    expect(wasEdited({ created_at: '2026-11-07T10:00:00Z', updated_at: '2026-11-07T10:00:00.500Z' })).toBe(false);
    expect(wasEdited({ created_at: '2026-11-07T10:00:00Z', updated_at: '2026-11-07T10:05:00Z' })).toBe(true);
    expect(wasEdited({ created_at: 'bad', updated_at: '2026-11-07T10:05:00Z' })).toBe(false);
  });
});

const post = {
  id: 'p1',
  author_id: 'u1',
  kind: 'question',
  game_id: '',
  title: 'Best sens settings?',
  body: 'Help',
  solved_reply_id: 'r9',
  gg_count: '3',
  reply_count: -2,
  last_activity_at: null,
  created_at: '2026-11-07T10:00:00Z',
  updated_at: null,
};

describe('normalisePostSummaries', () => {
  it('normalises plain rows, JSON strings and single-column wrapped rows', () => {
    const row = { post, author: { id: 'u1', username: 'ace' }, has_gg: true };
    const out = normalisePostSummaries([row, JSON.stringify(row), { list_community_posts: row }]);
    expect(out).toHaveLength(3);
    for (const s of out) {
      expect(s.post.id).toBe('p1');
      expect(s.post.game_id).toBeNull();
      expect(s.post.gg_count).toBe(3);
      expect(s.post.reply_count).toBe(0);
      expect(s.post.last_activity_at).toBe(post.created_at);
      expect(s.post.updated_at).toBe(post.created_at);
      expect(s.author.display_name).toBe('ace');
      expect(s.has_gg).toBe(true);
      expect(s.is_solved).toBe(true); // question with solved_reply_id
    }
  });

  it('drops rows without a post id and handles null / single objects', () => {
    expect(normalisePostSummaries([{ post: { title: 'x' } }, 'not json', 42])).toEqual([]);
    expect(normalisePostSummaries(null)).toEqual([]);
    expect(normalisePostSummaries({ post, author: null })).toHaveLength(1);
  });

  it('defaults unknown kinds to take and missing authors to "Player"', () => {
    const [s] = normalisePostSummaries([{ post: { ...post, kind: 'rant', solved_reply_id: null }, author: null }]);
    expect(s.post.kind).toBe('take');
    expect(s.is_solved).toBe(false);
    expect(s.author).toEqual({ id: 'u1', username: '', display_name: 'Player', avatar_url: null });
  });
});

describe('normaliseReplyItems', () => {
  it('normalises reply rows', () => {
    const [r] = normaliseReplyItems([
      {
        reply: { id: 'r1', post_id: 'p1', author_id: 'u2', body: 'Use 0.4', gg_count: 1.6, created_at: '2026-11-07T10:00:00Z' },
        author: { id: 'u2', username: 'bee', display_name: 'Bee' },
        is_solution: true,
      },
    ]);
    expect(r.reply.gg_count).toBe(2);
    expect(r.reply.updated_at).toBe('2026-11-07T10:00:00Z');
    expect(r.author.display_name).toBe('Bee');
    expect(r.is_solution).toBe(true);
    expect(r.has_gg).toBe(false);
  });
});
