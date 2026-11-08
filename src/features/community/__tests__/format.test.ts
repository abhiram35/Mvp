import { compactCount, plural, spoilerForGame, timeAgo } from '../format';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('community timeAgo', () => {
  it('formats recent times', () => {
    expect(timeAgo(at(-5_000), NOW)).toBe('just now');
    expect(timeAgo(at(-12 * MIN), NOW)).toBe('12m ago');
    expect(timeAgo(at(-3 * 60 * MIN), NOW)).toBe('3h ago');
    expect(timeAgo(at(-29 * DAY), NOW)).toBe('29d ago');
  });

  it('switches to a date after 30 days', () => {
    const out = timeAgo(at(-40 * DAY), NOW);
    expect(out).not.toMatch(/ago$/);
    expect(out).toMatch(/2026/);
  });

  it('returns an empty string for an invalid date', () => {
    expect(timeAgo('not a date', NOW)).toBe('');
  });
});

describe('compactCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1k'],
    [1200, '1.2k'],
    [9949, '9.9k'],
    [12_345, '12k'],
    [150_600, '151k'],
  ])('%d → %s', (n, expected) => {
    expect(compactCount(n)).toBe(expected);
  });
});

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'reply', 'replies')).toBe('1 reply');
    expect(plural(0, 'reply', 'replies')).toBe('0 replies');
    expect(plural(2, 'GG', 'GGs')).toBe('2 GGs');
  });
});

describe('spoilerForGame (composer auto-toggle)', () => {
  const story = { category: 'story' };
  const casual = { category: 'casual' };
  const auto = { editing: false, touched: false };

  it('turns on for story games and off again for non-story / General', () => {
    expect(spoilerForGame(false, story, auto)).toBe(true);
    expect(spoilerForGame(true, casual, auto)).toBe(false);
    expect(spoilerForGame(true, null, auto)).toBe(false);
    expect(spoilerForGame(true, {}, auto)).toBe(false); // missing category = competitive
  });

  it('leaves a box the author set themselves, and never changes it while editing', () => {
    expect(spoilerForGame(true, casual, { editing: false, touched: true })).toBe(true);
    expect(spoilerForGame(false, story, { editing: false, touched: true })).toBe(false);
    expect(spoilerForGame(false, story, { editing: true, touched: false })).toBe(false);
  });
});
