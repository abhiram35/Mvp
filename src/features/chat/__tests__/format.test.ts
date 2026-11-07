import { formatDayLabel, formatMessageTime, formatRelativeTime, isSameDay, minutesBetween } from '../format';

// Built with local-time constructors so the tests pass in any timezone.
const NOW = new Date(2026, 10, 7, 15, 0, 0); // Sat 7 Nov 2026, 3 PM local
const local = (...args: [number, number, number, number?, number?]) => new Date(...(args as [number, number, number, number, number])).toISOString();

describe('formatRelativeTime', () => {
  it('returns an empty string for missing or invalid input', () => {
    expect(formatRelativeTime(null, NOW)).toBe('');
    expect(formatRelativeTime(undefined, NOW)).toBe('');
    expect(formatRelativeTime('nope', NOW)).toBe('');
  });

  it('formats today as now / minutes / hours', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe('now');
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe('5m');
    expect(formatRelativeTime(local(2026, 10, 7, 12, 0), NOW)).toBe('3h');
  });

  it('says Yesterday for the previous calendar day, even under 24 hours ago', () => {
    expect(formatRelativeTime(local(2026, 10, 6, 23, 0), NOW)).toBe('Yesterday');
  });

  it('uses a date for older messages, with the year only for other years', () => {
    const weekday = formatRelativeTime(local(2026, 10, 3, 12, 0), NOW);
    expect(weekday).not.toBe('');
    expect(weekday).not.toBe('Yesterday');
    expect(formatRelativeTime(local(2026, 2, 12, 12, 0), NOW)).not.toMatch(/2026/);
    expect(formatRelativeTime(local(2024, 2, 12, 12, 0), NOW)).toMatch(/2024/);
  });
});

describe('formatDayLabel', () => {
  it('labels today and yesterday', () => {
    expect(formatDayLabel(local(2026, 10, 7, 0, 5), NOW)).toBe('Today');
    expect(formatDayLabel(local(2026, 10, 6, 23, 59), NOW)).toBe('Yesterday');
  });

  it('includes the year only for other years', () => {
    expect(formatDayLabel(local(2026, 10, 3, 12), NOW)).not.toMatch(/2026/);
    expect(formatDayLabel(local(2025, 10, 3, 12), NOW)).toMatch(/2025/);
    expect(formatDayLabel('nope', NOW)).toBe('');
  });
});

describe('formatMessageTime', () => {
  it('returns a clock time, or empty for invalid input', () => {
    expect(formatMessageTime(local(2026, 10, 7, 21, 41))).toMatch(/41/);
    expect(formatMessageTime('nope')).toBe('');
  });
});

describe('isSameDay / minutesBetween', () => {
  it('compares local calendar days', () => {
    expect(isSameDay(local(2026, 10, 7, 0, 1), local(2026, 10, 7, 23, 59))).toBe(true);
    expect(isSameDay(local(2026, 10, 6, 23, 59), local(2026, 10, 7, 0, 1))).toBe(false);
  });

  it('is absolute', () => {
    expect(minutesBetween('2026-11-07T10:00:00Z', '2026-11-07T10:07:30Z')).toBe(7.5);
    expect(minutesBetween('2026-11-07T10:07:30Z', '2026-11-07T10:00:00Z')).toBe(7.5);
  });
});
