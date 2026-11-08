// Pure helpers for Steam linking: the Edge Function's OpenID/library helpers and the app's matching.
import {
  buildSteamLoginUrl,
  checkAuthenticationBody,
  isAllowedRedirect,
  isValidAssertion,
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

  it('turns the callback into a check_authentication request', () => {
    const body = checkAuthenticationBody(
      new URLSearchParams({ nonce: 'x', 'openid.mode': 'id_res', 'openid.sig': 'abc', 'openid.signed': 'a,b' }),
    );
    expect(body.get('openid.mode')).toBe('check_authentication');
    expect(body.get('openid.sig')).toBe('abc');
    expect(body.has('nonce')).toBe(false);
  });

  it('accepts only an explicit is_valid:true', () => {
    expect(isValidAssertion('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')).toBe(true);
    expect(isValidAssertion('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n')).toBe(false);
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
