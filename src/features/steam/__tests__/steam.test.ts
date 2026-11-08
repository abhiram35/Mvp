// Pure helpers for Steam linking: the Edge Function's OpenID/library helpers and the app's matching.
import {
  buildSteamLoginUrl,
  callbackReturnTo,
  cleanPersonaName,
  isAllowedRedirect,
  isUuid,
  isValidAssertion,
  parseAssertion,
  safeAvatarUrl,
  safeProfileUrl,
  singleParam,
  steamIdFromClaimedId,
  topGames,
  withQuery,
} from '../../../../supabase/functions/_shared/steam';
import { formatHours, matchCatalog, parseSteamReturn } from '../api';
import type { Game } from '../../../lib/types';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-web-browser', () => ({}));
jest.mock('expo-linking', () => ({
  parse: (url: string) => ({ queryParams: Object.fromEntries(new URL(url.replace(/^[a-z]+:\/\//, 'https://x/')).searchParams) }),
  createURL: (p: string) => `gg://${p}`,
}));

describe('Steam OpenID helpers', () => {
  it('only allows our own app schemes as redirect targets', () => {
    expect(isAllowedRedirect('gg://steam-linked')).toBe(true);
    expect(isAllowedRedirect('exp://10.0.0.2:8081/--/steam-linked')).toBe(true);
    expect(isAllowedRedirect('https://evil.example/steal')).toBe(false);
    expect(isAllowedRedirect('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirect(42)).toBe(false);
  });

  it('builds a Steam login URL with identifier_select and our return_to', () => {
    const url = new URL(buildSteamLoginUrl('https://ref.supabase.co/functions/v1/steam-link?nonce=abc', 'https://ref.supabase.co'));
    expect(url.origin + url.pathname).toBe('https://steamcommunity.com/openid/login');
    expect(url.searchParams.get('openid.mode')).toBe('checkid_setup');
    expect(url.searchParams.get('openid.return_to')).toBe('https://ref.supabase.co/functions/v1/steam-link?nonce=abc');
    expect(url.searchParams.get('openid.claimed_id')).toBe('http://specs.openid.net/auth/2.0/identifier_select');
  });

  it('extracts a SteamID64 only from a real Steam claimed_id', () => {
    expect(steamIdFromClaimedId('https://steamcommunity.com/openid/id/76561197960435530')).toBe('76561197960435530');
    expect(steamIdFromClaimedId('https://evil.example/openid/id/76561197960435530')).toBeNull();
    expect(steamIdFromClaimedId('https://steamcommunity.com/openid/id/123')).toBeNull();
    expect(steamIdFromClaimedId(null)).toBeNull();
  });

  it('accepts only exactly one is_valid:true line (LF or CRLF)', () => {
    expect(isValidAssertion('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')).toBe(true);
    expect(isValidAssertion('ns:http://specs.openid.net/auth/2.0\r\nis_valid:true\r\n')).toBe(true);
    expect(isValidAssertion('is_valid:true')).toBe(true);
    expect(isValidAssertion('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n')).toBe(false);
    expect(isValidAssertion('is_valid:false\r\nis_valid:true\r\n')).toBe(false);
    expect(isValidAssertion('is_valid:true\nis_valid:true\n')).toBe(false);
    expect(isValidAssertion('x_is_valid:true\n')).toBe(false);
    expect(isValidAssertion('is_valid:truex\n')).toBe(false);
    expect(isValidAssertion('is_valid: true\n')).toBe(false);
    expect(isValidAssertion('')).toBe(false);
  });

  it('appends query params to app URLs', () => {
    expect(withQuery('gg://steam-linked', { steam: 'linked' })).toBe('gg://steam-linked?steam=linked');
    expect(withQuery('exp://h/--/steam-linked?a=1', { steam: 'error', reason: 'invalid' })).toBe(
      'exp://h/--/steam-linked?a=1&steam=error&reason=invalid',
    );
  });

  it('keeps the most-played games and drops junk rows', () => {
    const games = topGames([
      { appid: 730, name: 'Counter-Strike 2', playtime_forever: 600 },
      { appid: 570, name: 'Dota 2', playtime_forever: 6000 },
      { appid: 'bad' },
      null,
      { appid: 10, playtime_forever: 0 },
    ]);
    expect(games.map((g) => g.appid)).toEqual([570, 730, 10]);
    expect(games[0].playtime_hours).toBe(100);
    expect(games[2].name).toBe('App 10');
    expect(topGames(undefined)).toEqual([]);
  });
});

describe('Steam OpenID assertion (parseAssertion)', () => {
  const BASE = 'https://ref.supabase.co/functions/v1/steam-link';
  const NONCE = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
  const RETURN_TO = callbackReturnTo(BASE, NONCE);
  const VICTIM = '76561197960435530';
  const ATTACKER = '76561198000000001';
  const idUrl = (id: string) => `https://steamcommunity.com/openid/id/${id}`;

  const good = (): [string, string][] => [
    ['nonce', NONCE],
    ['openid.ns', 'http://specs.openid.net/auth/2.0'],
    ['openid.mode', 'id_res'],
    ['openid.op_endpoint', 'https://steamcommunity.com/openid/login'],
    ['openid.claimed_id', idUrl(ATTACKER)],
    ['openid.identity', idUrl(ATTACKER)],
    ['openid.return_to', RETURN_TO],
    ['openid.response_nonce', '2026-11-08T12:00:00ZaBcD'],
    ['openid.assoc_handle', '1234567890'],
    ['openid.signed', 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'],
    ['openid.sig', 'W0SDBGkJp1jR5bAc+/=='],
  ];
  const urlOf = (pairs: [string, string][]) => `${BASE}?${new URLSearchParams(pairs).toString()}`;
  const withField = (key: string, value: string | null) => {
    const pairs = good().filter(([k]) => k !== key);
    return value === null ? pairs : [...pairs, [key, value] as [string, string]];
  };
  const parse = (pairs: [string, string][], expected = RETURN_TO) => parseAssertion(urlOf(pairs), expected);

  it('accepts a well-formed assertion and builds the check body from the same values', () => {
    const r = parse(good());
    expect(r).toEqual(expect.objectContaining({ ok: true, steamId: ATTACKER }));
    if (!r.ok) throw new Error('expected ok');
    const body = new URLSearchParams(r.body);
    expect(body.get('openid.mode')).toBe('check_authentication');
    expect(body.get('openid.claimed_id')).toBe(idUrl(ATTACKER));
    expect(body.get('openid.sig')).toBe('W0SDBGkJp1jR5bAc+/==');
    expect(body.has('nonce')).toBe(false);
    // Every openid.* value is sent exactly once.
    for (const k of new Set(body.keys())) expect(body.getAll(k)).toHaveLength(1);
  });

  it.each(['openid.claimed_id', 'openid.identity', 'openid.return_to', 'openid.op_endpoint', 'openid.mode', 'openid.sig', 'openid.signed', 'openid.ns'])(
    'rejects a duplicated %s (first-vs-last value confusion)',
    (key) => {
      const pairs = good();
      const original = pairs.find(([k]) => k === key)![1];
      const evil = key.endsWith('_id') || key === 'openid.identity' ? idUrl(VICTIM) : original;
      // Attacker's value first (what a naive .get() would read), real one last, and vice versa.
      expect(parse([[key, evil], ...pairs])).toEqual({ ok: false, reason: 'invalid' });
      expect(parse([...pairs, [key, evil]])).toEqual({ ok: false, reason: 'invalid' });
    },
  );

  it('rejects the original exploit: victim claimed_id/identity first, attacker signed values last', () => {
    const pairs = good();
    const url = urlOf([
      ['openid.claimed_id', idUrl(VICTIM)],
      ['openid.identity', idUrl(VICTIM)],
      ...pairs,
    ]);
    expect(parseAssertion(url, RETURN_TO).ok).toBe(false);
  });

  it.each(['openid.claimed id', 'openid_claimed_id', 'OPENID.claimed_id', 'openid.Claimed_id', 'openid.claimed[id', 'openid.claimed.id'])(
    'rejects key %s that another form parser could alias to openid.claimed_id',
    (key) => {
      expect(parse([...good(), [key, idUrl(VICTIM)]])).toEqual({ ok: false, reason: 'invalid' });
      expect(parse([[key, idUrl(VICTIM)], ...good()])).toEqual({ ok: false, reason: 'invalid' });
    },
  );

  it('rejects a duplicated nonce', () => {
    expect(parse([...good(), ['nonce', NONCE]])).toEqual({ ok: false, reason: 'invalid' });
    expect(singleParam(new URLSearchParams('nonce=a&nonce=b'), 'nonce')).toBeNull();
    expect(singleParam(new URLSearchParams('nonce=a'), 'nonce')).toBe('a');
    expect(singleParam(new URLSearchParams(''), 'nonce')).toBeNull();
  });

  it('rejects claimed_id !== identity', () => {
    expect(parse(withField('openid.identity', idUrl(VICTIM))).ok).toBe(false);
    expect(parse(withField('openid.identity', null)).ok).toBe(false);
    expect(parse(withField('openid.claimed_id', null)).ok).toBe(false);
  });

  it.each([
    'https://steamcommunity.com/openid/id/123',
    'http://steamcommunity.com/openid/id/76561197960435530',
    'https://steamcommunity.com.evil.io/openid/id/76561197960435530',
    'https://evilsteamcommunity.com/openid/id/76561197960435530',
    'https://steamcommunity.com/openid/id/76561197960435530/',
    'https://steamcommunity.com/openid/id/76561197960435530?x=1',
    'https://steamcommunity.com/openid/id/76561197960435530\n',
    'https://user@steamcommunity.com/openid/id/76561197960435530',
  ])('rejects a non-Steam or malformed identity %s', (id) => {
    const pairs = good().filter(([k]) => k !== 'openid.claimed_id' && k !== 'openid.identity');
    expect(parse([...pairs, ['openid.claimed_id', id], ['openid.identity', id]]).ok).toBe(false);
  });

  it.each([
    'https://evil.example/openid/login',
    'http://steamcommunity.com/openid/login',
    'https://steamcommunity.com.evil.io/openid/login',
    'https://steamcommunity.com/openid/login/',
    'https://steamcommunity.com/openid/login?x=1',
    '',
  ])('rejects op_endpoint %s', (ep) => {
    expect(parse(withField('openid.op_endpoint', ep)).ok).toBe(false);
  });

  it('rejects a wrong mode or namespace, and reports cancel separately', () => {
    expect(parse(withField('openid.mode', 'check_authentication')).ok).toBe(false);
    expect(parse(withField('openid.mode', 'checkid_setup')).ok).toBe(false);
    expect(parse(withField('openid.mode', 'ID_RES')).ok).toBe(false);
    expect(parse(withField('openid.mode', null)).ok).toBe(false);
    expect(parse(withField('openid.ns', 'http://openid.net/signon/1.1')).ok).toBe(false);
    expect(parse(withField('openid.ns', null)).ok).toBe(false);
    expect(parse([['nonce', NONCE], ['openid.ns', 'http://specs.openid.net/auth/2.0'], ['openid.mode', 'cancel']])).toEqual({
      ok: false,
      reason: 'cancel',
    });
    // A duplicated mode is never read as cancel either.
    expect(parse([['openid.mode', 'cancel'], ['openid.mode', 'id_res']])).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each(['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'])(
    'rejects when openid.signed does not cover %s',
    (field) => {
      const signed = 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'
        .split(',')
        .filter((f) => f !== field)
        .join(',');
      expect(parse(withField('openid.signed', signed)).ok).toBe(false);
    },
  );

  it('rejects signed lists naming absent or repeated fields, and missing signature parts', () => {
    expect(parse(withField('openid.signed', 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle,invalidate_handle')).ok).toBe(false);
    expect(parse(withField('openid.signed', 'op_endpoint,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle')).ok).toBe(false);
    expect(parse(withField('openid.signed', 'op_endpoint,,claimed_id,identity,return_to,response_nonce,assoc_handle')).ok).toBe(false);
    expect(parse(withField('openid.sig', null)).ok).toBe(false);
    expect(parse(withField('openid.sig', '')).ok).toBe(false);
    expect(parse(withField('openid.response_nonce', null)).ok).toBe(false);
    expect(parse(withField('openid.assoc_handle', null)).ok).toBe(false);
  });

  it.each([
    `${RETURN_TO}&x=1`,
    `${RETURN_TO}#frag`,
    `${RETURN_TO}0`,
    RETURN_TO.slice(0, -1),
    `${BASE}?nonce=00000000-0000-4000-8000-000000000000`,
    `${BASE}/?nonce=${NONCE}`,
    `${BASE}?x=1&nonce=${NONCE}`,
    RETURN_TO.replace('https://', 'http://'),
    RETURN_TO.replace('ref.supabase.co', 'ref.supabase.co.evil.io'),
    RETURN_TO.replace('ref.supabase.co', 'evil.io/ref.supabase.co'),
    RETURN_TO.toUpperCase(),
    ` ${RETURN_TO}`,
    '',
  ])('rejects return_to that is not exactly ours: %s', (rt) => {
    expect(parse(withField('openid.return_to', rt)).ok).toBe(false);
  });

  it('rejects junk input and oversized URLs', () => {
    expect(parseAssertion('not a url', RETURN_TO).ok).toBe(false);
    expect(parseAssertion(`${urlOf(good())}&pad=${'a'.repeat(9000)}`, RETURN_TO).ok).toBe(false);
    const many: [string, string][] = [...good()];
    for (let i = 0; i < 40; i++) many.push([`openid.x${i}`, 'y']);
    expect(parse(many).ok).toBe(false);
  });

  it('builds the exact return_to and validates uuids', () => {
    expect(RETURN_TO).toBe(`${BASE}?nonce=${NONCE}`);
    expect(isUuid(NONCE)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(`${NONCE}x`)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe('Steam profile data sanitizing', () => {
  it('stores only https://steamcommunity.com/ profile links', () => {
    expect(safeProfileUrl('https://steamcommunity.com/id/neo/')).toBe('https://steamcommunity.com/id/neo/');
    expect(safeProfileUrl('https://steamcommunity.com/profiles/76561197960435530/')).toBe(
      'https://steamcommunity.com/profiles/76561197960435530/',
    );
    expect(safeProfileUrl('http://steamcommunity.com/id/neo/')).toBeNull();
    expect(safeProfileUrl('https://steamcommunity.com.evil.io/id/neo')).toBeNull();
    expect(safeProfileUrl('https://steamcommunity.com@evil.io/')).toBeNull();
    expect(safeProfileUrl('https://evil.io/?https://steamcommunity.com/')).toBeNull();
    expect(safeProfileUrl('javascript:alert(1)//https://steamcommunity.com/')).toBeNull();
    expect(safeProfileUrl('https://steamcommunity.com/id/a b')).toBeNull();
    expect(safeProfileUrl('https://steamcommunity.com/id/a\nb')).toBeNull();
    expect(safeProfileUrl(`https://steamcommunity.com/${'a'.repeat(1000)}`)).toBeNull();
    expect(safeProfileUrl(null)).toBeNull();
    expect(safeProfileUrl(42)).toBeNull();
  });

  it('stores only https avatar URLs', () => {
    expect(safeAvatarUrl('https://avatars.steamstatic.com/abc_full.jpg')).toBe('https://avatars.steamstatic.com/abc_full.jpg');
    expect(safeAvatarUrl('http://avatars.steamstatic.com/abc_full.jpg')).toBeNull();
    expect(safeAvatarUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(safeAvatarUrl('javascript:alert(1)')).toBeNull();
    expect(safeAvatarUrl('HTTPS://x/y.jpg')).toBeNull();
    expect(safeAvatarUrl('https://x/"onerror="y')).toBeNull();
    expect(safeAvatarUrl(undefined)).toBeNull();
  });

  it('cleans persona names', () => {
    expect(cleanPersonaName('Neo')).toBe('Neo');
    expect(cleanPersonaName('  Ne\u0000o\u0007\n ')).toBe('Neo');
    expect(cleanPersonaName('x'.repeat(100))).toHaveLength(64);
    expect(Array.from(cleanPersonaName('🎮'.repeat(70)) ?? '')).toHaveLength(64);
    expect(cleanPersonaName('\u0001\u0002')).toBeNull();
    expect(cleanPersonaName('')).toBeNull();
    expect(cleanPersonaName(7)).toBeNull();
  });
});

describe('Steam app helpers', () => {
  const game = (id: string, steam_appid: number | null): Game => ({
    id, name: id, platforms: ['pc'], ranks: [], emoji: '🎮', category: 'competitive',
    is_coop: false, steam_appid, logo_url: null, squadable: true,
  });

  it('matches Steam games to catalog games by app id', () => {
    const matched = matchCatalog(
      [{ appid: 730, name: 'CS2', playtime_hours: 10 }, { appid: 999, name: 'Other', playtime_hours: 5 }],
      [game('cs2', 730), game('valorant', null)],
    );
    expect(matched.map((m) => m.game.id)).toEqual(['cs2']);
  });

  it('formats playtime', () => {
    expect(formatHours(0.4)).toBe('<1 h');
    expect(formatHours(35.6)).toBe('36 h');
    expect(formatHours(1200)).toBe('1.2k h');
    expect(formatHours(2000)).toBe('2k h');
  });

  it('reads the result Steam sign-in returned with', () => {
    expect(parseSteamReturn('gg://steam-linked?steam=linked')).toEqual({ status: 'linked' });
    expect(parseSteamReturn('gg://steam-linked?steam=cancel')).toEqual({ status: 'cancelled' });
    const err = parseSteamReturn('gg://steam-linked?steam=error&reason=already_linked');
    expect(err.status).toBe('error');
    expect(err.status === 'error' && err.message).toMatch(/already linked/);
  });
});
