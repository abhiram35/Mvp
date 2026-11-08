// Deno tests for the steam-link handler (docs/REVIEW_FIXES.md §1, §2).
// Run: cd supabase/functions && deno test steam-link/
// Not picked up by Jest (testMatch is src/**/__tests__) or tsc (supabase/functions is excluded).
//
// The Supabase admin client is an in-memory fake of the query builder calls the handler makes.
// The fake Steam checks a signature over the values it is SENT, like the real one, so a server
// that trusts a different value than it forwards (the original bug) would be caught here.

// deno-lint-ignore no-import-prefix -- Supabase's documented style for Edge Functions
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { handle } from './handler.ts';

type Row = Record<string, unknown>;

// ── tiny assert helpers (no remote imports) ──────────────────────────────────
function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}
function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// ── fake database ────────────────────────────────────────────────────────────
class FakeDb {
  tables: Record<string, Row[]> = { profiles: [], steam_accounts: [], steam_link_requests: [] };
  constructor(readonly clock: { now: number }) {}
  from(table: string) {
    return new Query(this, table);
  }
}

type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

class Query implements PromiseLike<{ data: Row[] | null; error: Row | null }> {
  private op: Op | null = null;
  private payload: Row = {};
  private filters: ((r: Row) => boolean)[] = [];
  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string) {
    if (!this.op) this.op = 'select';
    return this;
  }
  insert(v: Row) {
    this.op = 'insert';
    this.payload = v;
    return this;
  }
  update(v: Row) {
    this.op = 'update';
    this.payload = v;
    return this;
  }
  upsert(v: Row, _opts?: unknown) {
    this.op = 'upsert';
    this.payload = v;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  is(c: string, v: null) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  lt(c: string, v: string) {
    this.filters.push((r) => r[c] != null && String(r[c]) < v);
    return this;
  }
  gt(c: string, v: string) {
    this.filters.push((r) => r[c] != null && String(r[c]) > v);
    return this;
  }
  not(c: string, op: string, v: null) {
    if (op !== 'is' || v !== null) throw new Error('fake: unsupported not()');
    this.filters.push((r) => r[c] != null);
    return this;
  }

  private unique(rows: Row[], row: Row, cols: string[]): Row | null {
    for (const c of cols) {
      if (row[c] == null) continue;
      if (rows.some((r) => r !== row && r[c] === row[c])) return { code: '23505', message: `duplicate ${c}` };
    }
    return null;
  }

  private run(): { data: Row[] | null; error: Row | null } {
    const rows = this.db.tables[this.table];
    const match = (r: Row) => this.filters.every((f) => f(r));
    const uniq = this.table === 'steam_accounts' ? ['profile_id', 'steam_id'] : ['nonce', 'completion_code'];
    switch (this.op) {
      case 'select':
        return { data: rows.filter(match).map((r) => ({ ...r })), error: null };
      case 'insert': {
        const row: Row = {
          nonce: crypto.randomUUID(),
          created_at: new Date(this.db.clock.now).toISOString(),
          verified_at: null,
          steam_id: null,
          completion_code: null,
          ...this.payload,
        };
        const err = this.unique(rows, row, uniq);
        if (err) return { data: null, error: err };
        rows.push(row);
        return { data: [{ ...row }], error: null };
      }
      case 'update': {
        const hit = rows.filter(match);
        for (const r of hit) {
          const next = { ...r, ...this.payload };
          const err = this.unique(rows.filter((x) => x !== r), next, uniq);
          if (err) return { data: null, error: err };
          Object.assign(r, this.payload);
        }
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      case 'delete': {
        const hit = rows.filter(match);
        this.db.tables[this.table] = rows.filter((r) => !match(r));
        return { data: hit, error: null };
      }
      case 'upsert': {
        const existing = rows.find((r) => r.profile_id === this.payload.profile_id);
        const next = { ...(existing ?? {}), ...this.payload };
        const err = this.unique(rows.filter((r) => r !== existing), next, uniq);
        if (err) return { data: null, error: err };
        if (existing) Object.assign(existing, this.payload);
        else rows.push(next);
        return { data: [{ ...next }], error: null };
      }
      default:
        throw new Error('fake: no operation');
    }
  }

  single() {
    const { data, error } = this.run();
    if (error) return Promise.resolve({ data: null, error });
    if (!data || data.length !== 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
    return Promise.resolve({ data: data[0], error: null });
  }
  maybeSingle() {
    const { data, error } = this.run();
    if (error) return Promise.resolve({ data: null, error });
    if (data && data.length > 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
    return Promise.resolve({ data: data?.[0] ?? null, error: null });
  }
  then<A = { data: Row[] | null; error: Row | null }, B = never>(
    onOk?: ((v: { data: Row[] | null; error: Row | null }) => A | PromiseLike<A>) | null,
    onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onOk, onErr);
  }
}

// ── fake Steam ───────────────────────────────────────────────────────────────
const STEAM_KEY = 'SECRETKEY0123456789ABCDEF';
const BASE = 'https://ref.supabase.co/functions/v1/steam-link';
const ATTACKER = '76561198000000001';
const VICTIM = '76561197960435530';
const idUrl = (id: string) => `https://steamcommunity.com/openid/id/${id}`;

/** Stand-in for Steam's HMAC: depends on every signed field's value. */
function fakeSign(fields: Record<string, string>, signed: string): string {
  return btoa(signed.split(',').map((f) => `${f}:${fields[`openid.${f}`] ?? ''}`).join('\n'));
}

interface SteamOpts {
  profileurl?: string;
  avatarfull?: string;
  failOwnedGames?: boolean;
  onSummaries?: () => void;
  isValidOverride?: string;
}

function installSteam(opts: SteamOpts = {}) {
  const calls: { url: string; body?: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url === 'https://steamcommunity.com/openid/login') {
      // Like Steam: verify the signature over the values in the body it received.
      const p = new URLSearchParams(String(init?.body ?? ''));
      const fields: Record<string, string> = {};
      for (const [k, v] of p) fields[k] ??= v;
      const valid = fields['openid.mode'] === 'check_authentication' &&
        fields['openid.sig'] === fakeSign(fields, fields['openid.signed'] ?? '');
      const text = opts.isValidOverride ?? `ns:http://specs.openid.net/auth/2.0\r\nis_valid:${valid}\r\n`;
      return Promise.resolve(new Response(text));
    }
    if (url.startsWith('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/')) {
      opts.onSummaries?.();
      const steamid = new URL(url).searchParams.get('steamids');
      return Promise.resolve(Response.json({
        response: {
          players: [{
            steamid,
            personaname: 'Player\u0007One',
            profileurl: opts.profileurl ?? `https://steamcommunity.com/profiles/${steamid}/`,
            avatarfull: opts.avatarfull ?? 'https://avatars.steamstatic.com/abc_full.jpg',
          }],
        },
      }));
    }
    if (url.startsWith('https://api.steampowered.com/IPlayerService/GetOwnedGames/')) {
      // A real fetch error message can contain the URL (and so the key).
      if (opts.failOwnedGames) return Promise.reject(new TypeError(`error sending request for url (${url})`));
      return Promise.resolve(Response.json({
        response: { game_count: 2, games: [{ appid: 570, name: 'Dota 2', playtime_forever: 600 }, { appid: 730, name: 'CS2', playtime_forever: 60 }] },
      }));
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

// ── harness ──────────────────────────────────────────────────────────────────
const USERS: Record<string, string> = {
  'jwt-attacker': '00000000-0000-4000-8000-00000000000a',
  'jwt-victim': '00000000-0000-4000-8000-00000000000b',
  'jwt-other': '00000000-0000-4000-8000-00000000000c',
};
const A = USERS['jwt-attacker'];
const V = USERS['jwt-victim'];

function setup(steam: SteamOpts = {}) {
  const clock = { now: Date.parse('2026-11-08T12:00:00Z') };
  const db = new FakeDb(clock);
  for (const id of Object.values(USERS)) db.tables.profiles.push({ id });
  const fake = installSteam(steam);
  const logs: string[] = [];
  const origError = console.error;
  console.error = (...a: unknown[]) => logs.push(a.map(String).join(' '));
  const deps = {
    admin: db as unknown as SupabaseClient,
    steamKey: STEAM_KEY,
    callbackBase: BASE,
    realm: 'https://ref.supabase.co',
    getUserId: (t: string) => Promise.resolve(USERS[t] ?? null),
    now: () => clock.now,
  };
  const post = async (jwt: string | null, body: unknown) => {
    const res = await handle(
      new Request(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      deps,
    );
    return { status: res.status, body: await res.json() as Row };
  };
  const get = async (url: string) => {
    const res = await handle(new Request(url), deps);
    const loc = res.headers.get('Location');
    await res.body?.cancel();
    return { status: res.status, location: loc, params: loc ? new URL(loc.replace(/^gg:\/\//, 'https://app/')).searchParams : null };
  };
  /** `start` as `jwt`; returns the return_to Steam would send the browser back to. */
  const start = async (jwt: string) => {
    const r = await post(jwt, { action: 'start', redirect_to: 'gg://steam-linked' });
    eq(r.status, 200, 'start');
    return new URL(String(r.body.url)).searchParams.get('openid.return_to')!;
  };
  const steamCheckCalls = () => fake.calls.filter((c) => c.url === 'https://steamcommunity.com/openid/login').length;
  const done = () => {
    fake.restore();
    console.error = origError;
    for (const l of logs) ok(!l.includes(STEAM_KEY) && !l.includes('key='), `secret in log: ${l}`);
  };
  return { db, clock, post, get, start, done, logs, calls: fake.calls, steamCheckCalls };
}

/** A genuine Steam positive assertion for `steamId`, signed for `returnTo`. */
function assertion(steamId: string, returnTo: string, tweak: (f: Record<string, string>) => void = () => {}) {
  const f: Record<string, string> = {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': idUrl(steamId),
    'openid.identity': idUrl(steamId),
    'openid.return_to': returnTo,
    'openid.response_nonce': '2026-11-08T12:00:00Zabc123',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
  };
  tweak(f);
  f['openid.sig'] = fakeSign(f, f['openid.signed']);
  return Object.entries(f);
}
const callbackUrl = (returnTo: string, pairs: [string, string][]) => `${returnTo}&${new URLSearchParams(pairs).toString()}`;

function expectRejected(t: ReturnType<typeof setup>, r: { status: number; params: URLSearchParams | null }, reason = 'invalid') {
  eq(r.status, 302, 'status');
  eq(r.params?.get('steam'), 'error', 'steam param');
  eq(r.params?.get('reason'), reason, 'reason');
  eq(r.params?.get('code'), null, 'no code');
  eq(t.db.tables.steam_accounts.length, 0, 'nothing linked');
  eq(t.db.tables.steam_link_requests.filter((x) => x.completion_code != null).length, 0, 'no completion code stored');
}

// ── the original exploit ─────────────────────────────────────────────────────
for (const where of ['first', 'last'] as const) {
  Deno.test(`exploit: duplicated claimed_id/identity for the victim (${where}) is rejected, nothing stored`, async () => {
    const t = setup();
    try {
      const rt = await t.start('jwt-attacker');
      const genuine = assertion(ATTACKER, rt); // attacker's own valid, signed assertion
      const victim: [string, string][] = [['openid.claimed_id', idUrl(VICTIM)], ['openid.identity', idUrl(VICTIM)]];
      const r = await t.get(callbackUrl(rt, where === 'first' ? [...victim, ...genuine] : [...genuine, ...victim]));
      expectRejected(t, r);
      eq(t.steamCheckCalls(), 0, 'never forwarded to Steam');
      eq(t.db.tables.steam_link_requests.length, 0, 'attempt burned');
    } finally {
      t.done();
    }
  });
}

Deno.test('exploit: aliased key names (openid.claimed id / openid_claimed_id / case) are rejected', async () => {
  for (const key of ['openid.claimed id', 'openid_claimed_id', 'OPENID.claimed_id', 'openid.claimed[id']) {
    const t = setup();
    try {
      const rt = await t.start('jwt-attacker');
      const r = await t.get(callbackUrl(rt, [...assertion(ATTACKER, rt), [key, idUrl(VICTIM)]]));
      expectRejected(t, r);
      eq(t.steamCheckCalls(), 0, key);
    } finally {
      t.done();
    }
  }
});

// ── happy path + forwarded link ──────────────────────────────────────────────
Deno.test('own sign-in: callback only issues a code; complete by the owner links once', async () => {
  const t = setup({ profileurl: 'javascript:alert(1)', avatarfull: 'http://evil/a.jpg' });
  try {
    const rt = await t.start('jwt-attacker');
    const r = await t.get(callbackUrl(rt, assertion(ATTACKER, rt)));
    eq(r.status, 302);
    eq(r.params?.get('steam'), 'verified');
    const code = r.params?.get('code')!;
    ok(/^[0-9a-f-]{36}$/.test(code), 'uuid code');
    eq(t.db.tables.steam_accounts.length, 0, 'callback never links');
    // The body sent to Steam: single-valued, check_authentication.
    const sent = new URLSearchParams(t.calls.find((c) => c.url === 'https://steamcommunity.com/openid/login')!.body!);
    eq(sent.getAll('openid.claimed_id'), [idUrl(ATTACKER)]);
    eq(sent.get('openid.mode'), 'check_authentication');

    const c = await t.post('jwt-attacker', { action: 'complete', code });
    eq(c.status, 200, 'complete');
    const acct = t.db.tables.steam_accounts[0];
    eq([acct.profile_id, acct.steam_id], [A, ATTACKER]);
    eq(acct.profile_url, null, 'javascript: profile_url dropped');
    eq(acct.avatar_url, null, 'http avatar dropped');
    eq(acct.persona_name, 'PlayerOne', 'control chars stripped');
    eq(t.db.tables.steam_link_requests.length, 0, 'consumed');

    const replay = await t.post('jwt-attacker', { action: 'complete', code });
    eq([replay.status, replay.body.error], [400, 'invalid_code'], 'replayed code');
    const replayCb = await t.get(callbackUrl(rt, assertion(ATTACKER, rt)));
    eq(replayCb.status, 400, 'replayed callback (nonce single-use)');
    eq(t.steamCheckCalls(), 1, 'replay never reaches Steam');
  } finally {
    t.done();
  }
});

Deno.test("forwarded link: victim's browser finishes the callback, only the starter's JWT can complete", async () => {
  const t = setup();
  try {
    const rt = await t.start('jwt-attacker'); // attacker sends this Steam link to the victim
    const r = await t.get(callbackUrl(rt, assertion(VICTIM, rt))); // victim signs in on Steam
    eq(r.params?.get('steam'), 'verified');
    const code = r.params?.get('code')!; // lands on the VICTIM's device, not the attacker's
    eq(t.db.tables.steam_accounts.length, 0, 'not linked by the callback');

    const byVictim = await t.post('jwt-victim', { action: 'complete', code });
    eq([byVictim.status, byVictim.body.error], [400, 'invalid_code'], 'other user');
    const byOther = await t.post('jwt-other', { action: 'complete', code });
    eq([byOther.status, byOther.body.error], [400, 'invalid_code'], 'third user');
    eq(t.db.tables.steam_accounts.length, 0);
    // Only the profile that started the attempt (holding the code) can finish it.
    const byOwner = await t.post('jwt-attacker', { action: 'complete', code });
    eq(byOwner.status, 200, 'owner');
  } finally {
    t.done();
  }
});

Deno.test('expired code (> 5 min after verification) is invalid_code', async () => {
  const t = setup();
  try {
    const rt = await t.start('jwt-attacker');
    const code = (await t.get(callbackUrl(rt, assertion(ATTACKER, rt)))).params?.get('code')!;
    t.clock.now += 5 * 60 * 1000 + 1000;
    const c = await t.post('jwt-attacker', { action: 'complete', code });
    eq([c.status, c.body.error], [400, 'invalid_code']);
    eq(t.db.tables.steam_accounts.length, 0);
  } finally {
    t.done();
  }
});

Deno.test('expired nonce (> 10 min after start) redirects reason=expired', async () => {
  const t = setup();
  try {
    const rt = await t.start('jwt-attacker');
    t.clock.now += 10 * 60 * 1000 + 1000;
    expectRejected(t, await t.get(callbackUrl(rt, assertion(ATTACKER, rt))), 'expired');
    eq(t.steamCheckCalls(), 0);
  } finally {
    t.done();
  }
});

Deno.test('already linked elsewhere → reason=already_linked; complete re-checks with 409', async () => {
  const t = setup();
  try {
    t.db.tables.steam_accounts.push({ profile_id: V, steam_id: ATTACKER, synced_at: '2026-11-08T00:00:00.000Z' });
    const rt = await t.start('jwt-attacker');
    const r = await t.get(callbackUrl(rt, assertion(ATTACKER, rt)));
    eq([r.params?.get('steam'), r.params?.get('reason')], ['error', 'already_linked']);

    // Linked by someone else between callback and complete.
    t.db.tables.steam_accounts = [];
    const rt2 = await t.start('jwt-attacker');
    const code = (await t.get(callbackUrl(rt2, assertion(ATTACKER, rt2)))).params?.get('code')!;
    t.db.tables.steam_accounts.push({ profile_id: V, steam_id: ATTACKER, synced_at: '2026-11-08T00:00:00.000Z' });
    const c = await t.post('jwt-attacker', { action: 'complete', code });
    eq([c.status, c.body.error], [409, 'already_linked']);
  } finally {
    t.done();
  }
});

// ── strict assertion checks, end to end ──────────────────────────────────────
Deno.test('return_to with a different nonce or extra params is rejected', async () => {
  for (const mk of [
    (rt: string) => rt.replace(/nonce=[^&]+/, `nonce=${crypto.randomUUID()}`),
    (rt: string) => `${rt}&x=1`,
    (rt: string) => rt.replace('https://ref.supabase.co', 'https://evil.example'),
  ]) {
    const t = setup();
    try {
      const rt = await t.start('jwt-attacker');
      // Signed by Steam for a return_to that isn't this attempt's exact return_to.
      expectRejected(t, await t.get(callbackUrl(rt, assertion(ATTACKER, mk(rt)))));
      eq(t.steamCheckCalls(), 0);
    } finally {
      t.done();
    }
  }
});

Deno.test('op_endpoint lookalike, missing return_to in signed, bad ns are rejected before Steam', async () => {
  const tweaks: ((f: Record<string, string>) => void)[] = [
    (f) => (f['openid.op_endpoint'] = 'https://steamcommunity.com.evil.io/openid/login'),
    (f) => (f['openid.op_endpoint'] = 'https://steamcommunity.com/openid/login/'),
    (f) => (f['openid.signed'] = 'signed,op_endpoint,claimed_id,identity,response_nonce,assoc_handle'),
    (f) => (f['openid.ns'] = 'http://openid.net/signon/1.1'),
  ];
  for (const tw of tweaks) {
    const t = setup();
    try {
      const rt = await t.start('jwt-attacker');
      expectRejected(t, await t.get(callbackUrl(rt, assertion(ATTACKER, rt, tw))));
      eq(t.steamCheckCalls(), 0);
    } finally {
      t.done();
    }
  }
});

Deno.test('Steam says is_valid:false (forged sig) → invalid', async () => {
  const t = setup();
  try {
    const rt = await t.start('jwt-attacker');
    const pairs = assertion(ATTACKER, rt).map(([k, v]): [string, string] => [k, k === 'openid.sig' ? 'forged' : v]);
    expectRejected(t, await t.get(callbackUrl(rt, pairs)));
    eq(t.steamCheckCalls(), 1);
  } finally {
    t.done();
  }
});

Deno.test('mode=cancel → steam=cancel and the attempt is deleted', async () => {
  const t = setup();
  try {
    const rt = await t.start('jwt-attacker');
    const r = await t.get(callbackUrl(rt, [['openid.ns', 'http://specs.openid.net/auth/2.0'], ['openid.mode', 'cancel']]));
    eq([r.status, r.params?.get('steam'), r.params?.get('code')], [302, 'cancel', null]);
    eq(t.db.tables.steam_link_requests.length, 0);
    eq(t.steamCheckCalls(), 0);
  } finally {
    t.done();
  }
});

// ── limits ───────────────────────────────────────────────────────────────────
Deno.test('start twice → only 1 pending attempt; the old nonce no longer works', async () => {
  const t = setup();
  try {
    const rt1 = await t.start('jwt-attacker');
    const rt2 = await t.start('jwt-attacker');
    eq(t.db.tables.steam_link_requests.filter((r) => r.profile_id === A).length, 1);
    eq((await t.get(callbackUrl(rt1, assertion(ATTACKER, rt1)))).status, 400, 'old nonce');
    eq((await t.get(callbackUrl(rt2, assertion(ATTACKER, rt2)))).params?.get('steam'), 'verified');
  } finally {
    t.done();
  }
});

Deno.test('sync within 5 minutes → 429 too_soon with retry_after_seconds; later → 200', async () => {
  const t = setup();
  try {
    const rt = await t.start('jwt-attacker');
    const code = (await t.get(callbackUrl(rt, assertion(ATTACKER, rt)))).params?.get('code')!;
    eq((await t.post('jwt-attacker', { action: 'complete', code })).status, 200);
    t.clock.now += 60_000;
    const s = await t.post('jwt-attacker', { action: 'sync' });
    eq([s.status, s.body.error, s.body.retry_after_seconds], [429, 'too_soon', 240]);
    t.clock.now += 4 * 60_000 + 1000;
    eq((await t.post('jwt-attacker', { action: 'sync' })).status, 200);
    eq((await t.post('jwt-victim', { action: 'sync' })).body.error, 'not_linked');
  } finally {
    t.done();
  }
});

Deno.test('unlink while a refresh is fetching Steam → 404 not_linked, the row is not re-created', async () => {
  let db: FakeDb | null = null;
  const t = setup({ onSummaries: () => db && (db.tables.steam_accounts = []) });
  try {
    t.db.tables.steam_accounts.push({ profile_id: A, steam_id: ATTACKER, synced_at: '2026-11-08T00:00:00.000Z' });
    db = t.db;
    const s = await t.post('jwt-attacker', { action: 'sync' });
    eq([s.status, s.body.error], [404, 'not_linked']);
    eq(t.db.tables.steam_accounts.length, 0);
  } finally {
    t.done();
  }
});

Deno.test('Steam API failure: 502 steam_unavailable, key never logged, cooldown reopened', async () => {
  const t = setup({ failOwnedGames: true });
  try {
    t.db.tables.steam_accounts.push({ profile_id: A, steam_id: ATTACKER, synced_at: '2026-11-08T00:00:00.000Z' });
    const s = await t.post('jwt-attacker', { action: 'sync' });
    eq([s.status, s.body], [502, { error: 'steam_unavailable' }]);
    ok(t.logs.length > 0, 'the failure is logged');
    ok(String(t.db.tables.steam_accounts[0].synced_at) < new Date(t.clock.now - 5 * 60_000).toISOString(), 'reopened');
  } finally {
    t.done(); // asserts no log line contains the key or "key="
  }
});

Deno.test('methods, auth and bodies', async () => {
  const t = setup();
  try {
    const put = await handle(new Request(BASE, { method: 'PUT' }), {
      admin: t.db as unknown as SupabaseClient,
      steamKey: STEAM_KEY,
      callbackBase: BASE,
      realm: 'x',
      getUserId: () => Promise.resolve(null),
    });
    eq([put.status, await put.json()], [405, { error: 'method_not_allowed' }]);
    eq((await t.post(null, { action: 'sync' })).body.error, 'unauthorized');
    eq((await t.post('jwt-bogus', { action: 'sync' })).status, 401);
    eq((await t.post('jwt-attacker', '{not json')).body.error, 'invalid_request');
    eq((await t.post('jwt-attacker', [1])).body.error, 'invalid_request');
    eq((await t.post('jwt-attacker', { action: 'nope' })).body.error, 'invalid_request');
    eq((await t.post('jwt-attacker', { action: 'complete', code: 'x' })).body.error, 'invalid_request');
    eq((await t.post('jwt-attacker', { action: 'start', redirect_to: 'https://evil.example' })).body.error, 'invalid_request');
    eq((await t.post('jwt-attacker', { action: 'start', redirect_to: 'gg://x', pad: 'a'.repeat(5000) })).body.error, 'invalid_request');
    t.db.tables.profiles = [];
    eq((await t.post('jwt-attacker', { action: 'start', redirect_to: 'gg://steam-linked' })).body.error, 'no_profile');
    eq((await t.get(`${BASE}?nonce=not-a-uuid`)).status, 400);
    const nonce = crypto.randomUUID();
    eq((await t.get(`${BASE}?nonce=${nonce}&nonce=${nonce}`)).status, 400, 'duplicated nonce');
  } finally {
    t.done();
  }
});
