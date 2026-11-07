import { expiresIn, expiresSoon, hostCta, isExpired, isJoinable, regionLabel, REGIONS, timeAgo, timeLeftShort } from '../format';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const MIN = 60_000;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('timeAgo', () => {
  it('formats past times', () => {
    expect(timeAgo(at(-10_000), NOW)).toBe('just now');
    expect(timeAgo(at(-12 * MIN), NOW)).toBe('12m ago');
    expect(timeAgo(at(-3 * 60 * MIN - 59 * MIN), NOW)).toBe('3h ago');
    expect(timeAgo(at(-2 * 24 * 60 * MIN), NOW)).toBe('2d ago');
  });

  it('treats future times as just now', () => {
    expect(timeAgo(at(5 * MIN), NOW)).toBe('just now');
  });
});

describe('expiresIn / timeLeftShort', () => {
  it('formats remaining time', () => {
    expect(expiresIn(at(30_000), NOW)).toBe('expires in <1m');
    expect(expiresIn(at(25 * MIN), NOW)).toBe('expires in 25m');
    expect(expiresIn(at(3 * 60 * MIN), NOW)).toBe('expires in 3h');
    expect(expiresIn(at(50 * 60 * MIN), NOW)).toBe('expires in 2d');
    expect(timeLeftShort(at(30_000), NOW)).toBe('<1m');
    expect(timeLeftShort(at(25 * MIN), NOW)).toBe('25m');
    expect(timeLeftShort(at(3 * 60 * MIN), NOW)).toBe('3h');
  });

  it('reports expiry at and after the deadline', () => {
    expect(expiresIn(at(0), NOW)).toBe('expired');
    expect(expiresIn(at(-MIN), NOW)).toBe('expired');
    expect(timeLeftShort(at(0), NOW)).toBeNull();
  });
});

describe('isExpired / expiresSoon / isJoinable', () => {
  it('isExpired is true at or after expires_at', () => {
    expect(isExpired({ expires_at: at(0) }, NOW)).toBe(true);
    expect(isExpired({ expires_at: at(1) }, NOW)).toBe(false);
  });

  it('expiresSoon only within the next 30 minutes', () => {
    expect(expiresSoon({ expires_at: at(29 * MIN) }, NOW)).toBe(true);
    expect(expiresSoon({ expires_at: at(31 * MIN) }, NOW)).toBe(false);
    expect(expiresSoon({ expires_at: at(-MIN) }, NOW)).toBe(false);
  });

  it('isJoinable needs an open, unexpired post', () => {
    const future = new Date(Date.now() + 60 * MIN).toISOString();
    const past = new Date(Date.now() - MIN).toISOString();
    expect(isJoinable({ status: 'open', expires_at: future })).toBe(true);
    expect(isJoinable({ status: 'full', expires_at: future })).toBe(false);
    expect(isJoinable({ status: 'closed', expires_at: future })).toBe(false);
    expect(isJoinable({ status: 'open', expires_at: past })).toBe(false);
  });
});

describe('regions', () => {
  it('has a label for every region', () => {
    expect(REGIONS.length).toBeGreaterThan(0);
    for (const r of REGIONS) expect(regionLabel(r)).toBeTruthy();
    expect(regionLabel('europe')).toBe('Europe');
  });
});

describe('hostCta', () => {
  it('reads well for the default word and for themed words', () => {
    expect(hostCta({ lobbies: 'Lobbies' })).toBe('Host lobby');
    expect(hostCta({ lobbies: 'Dojo' })).toBe('Open in the Dojo');
  });
});
