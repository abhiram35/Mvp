// Date/time helpers for chat lists and message bubbles.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Short relative time for lists: "now", "5m", "3h", "Yesterday", "Mon", "12 Mar", "12 Mar 2024". */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  const t = date.getTime();
  if (Number.isNaN(t)) return '';
  const diff = now.getTime() - t;
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (dayDiff <= 0) return `${Math.floor(diff / HOUR)}h`;
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Clock time for a message bubble, e.g. "9:41 PM". */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Day separator label: "Today", "Yesterday", "Monday, 3 Nov". */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** Minutes between two ISO timestamps (absolute). */
export function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / MINUTE;
}
