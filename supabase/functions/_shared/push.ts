// Pure helpers for the send-push Edge Function (no imports, no I/O, easy to test).

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_BATCH_SIZE = 100;

/** Constant-time string comparison (does not leak where the strings differ). */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  data: { route?: unknown } & Record<string, unknown>;
}

export interface ExpoMessage {
  to: string;
  title: string;
  body?: string;
  sound: 'default';
  data: { route: unknown; notification_id: string };
  channelId: 'default';
  priority: 'high';
  badge?: number;
}

/** One Expo message per token, in the same order as `tokens`. */
export function buildExpoMessages(n: NotificationRow, tokens: readonly string[], badge?: number): ExpoMessage[] {
  const route = n.data?.route ?? { pathname: '/notifications' };
  return tokens.map((to) => ({
    to,
    title: n.title,
    ...(n.body ? { body: n.body } : {}),
    sound: 'default',
    data: { route, notification_id: n.id },
    channelId: 'default',
    priority: 'high',
    ...(typeof badge === 'number' ? { badge } : {}),
  }));
}

export interface ExpoTicket {
  status?: 'ok' | 'error';
  details?: { error?: string };
}

/** Tokens whose ticket says DeviceNotRegistered (tickets come back in message order). */
export function deadTokens(batch: readonly ExpoMessage[], tickets: unknown): string[] {
  if (!Array.isArray(tickets)) return [];
  const dead: string[] = [];
  tickets.forEach((t: ExpoTicket, i) => {
    if (t?.status === 'error' && t.details?.error === 'DeviceNotRegistered' && batch[i]) dead.push(batch[i].to);
  });
  return dead;
}
