// GG Edge Function: send-push
// Called by the database (pg_net) right after a notification row is inserted.
// POST { notification_id } with header x-gg-push-secret: <PUSH_SHARED_SECRET>
// → loads the notification and the recipient's push_tokens with the service role,
//   sends them through the Expo Push API (batches of ≤ 100) and deletes tokens
//   Expo reports as DeviceNotRegistered.
//
// Deploy with:  supabase functions deploy send-push --no-verify-jwt
// (the database has no user JWT; the shared secret protects the function instead).
//
// Responses (JSON): 200 { sent, removed } | 400 bad_request | 401 unauthorized
//                   405 method_not_allowed | 500 not_configured / internal
//
// Secrets: PUSH_SHARED_SECRET (required), EXPO_ACCESS_TOKEN (optional, only if you
// turned on "Enhanced push security" in Expo). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
// Push tokens are never logged.

// deno-lint-ignore no-import-prefix -- Supabase's documented style for Edge Functions
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { json } from '../_shared/cors.ts';
import {
  buildExpoMessages,
  chunk,
  deadTokens,
  EXPO_BATCH_SIZE,
  EXPO_PUSH_URL,
  isExpoPushToken,
  type NotificationRow,
  safeEqual,
} from '../_shared/push.ts';

const EXPO_TIMEOUT_MS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = Deno.env.get('PUSH_SHARED_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !supabaseUrl || !serviceKey) {
    console.error('send-push: missing PUSH_SHARED_SECRET or Supabase env');
    return json(500, { error: 'not_configured' });
  }
  if (!safeEqual(req.headers.get('x-gg-push-secret') ?? '', secret)) {
    return json(401, { error: 'unauthorized' });
  }

  let id: unknown;
  try {
    id = ((await req.json()) as { notification_id?: unknown } | null)?.notification_id;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof id !== 'string' || !UUID_RE.test(id)) return json(400, { error: 'bad_request' });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: n, error: nErr } = await admin
      .from('notifications')
      .select('id, recipient_id, title, body, data, read_at')
      .eq('id', id)
      .maybeSingle();
    if (nErr) throw new Error(`load notification: ${nErr.message}`);
    // Gone, or already read (e.g. the chat was opened before the push went out).
    if (!n || n.read_at) return json(200, { sent: 0, removed: 0 });

    const { data: rows, error: tErr } = await admin
      .from('push_tokens')
      .select('token')
      .eq('profile_id', n.recipient_id);
    if (tErr) throw new Error(`load tokens: ${tErr.message}`);
    const tokens = (rows ?? []).map((r: { token: string }) => r.token).filter(isExpoPushToken);
    if (tokens.length === 0) return json(200, { sent: 0, removed: 0 });

    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', n.recipient_id)
      .is('read_at', null);

    const messages = buildExpoMessages(n as NotificationRow, tokens, count ?? undefined);
    const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    let sent = 0;
    const dead: string[] = [];

    for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), EXPO_TIMEOUT_MS);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok) {
          await res.body?.cancel();
          console.error('send-push: expo status', res.status, 'batch', batch.length);
          continue;
        }
        const payload = (await res.json().catch(() => null)) as { data?: unknown } | null;
        const tickets = Array.isArray(payload?.data) ? payload.data : [];
        sent += tickets.filter((t: { status?: string }) => t?.status === 'ok').length;
        dead.push(...deadTokens(batch, tickets));
      } catch (e) {
        console.error('send-push: expo request failed', e instanceof Error ? e.name : 'unknown');
      } finally {
        clearTimeout(timer);
      }
    }

    if (dead.length > 0) {
      const { error: dErr } = await admin.from('push_tokens').delete().in('token', dead);
      if (dErr) console.error('send-push: token cleanup failed', dErr.message);
    }
    return json(200, { sent, removed: dead.length });
  } catch (e) {
    console.error('send-push: unexpected', e instanceof Error ? e.message : 'unknown');
    return json(500, { error: 'internal' });
  }
});
