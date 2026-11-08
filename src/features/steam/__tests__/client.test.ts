// Client side of the 2-step Steam link flow (docs/REVIEW_FIXES.md §1): error copy, the browser
// result handling and the deep-link route helpers. Supabase and expo-web-browser are mocked.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import {
  claimSteamOutcome,
  completeSteamLink,
  ERROR_MESSAGES,
  linkSteam,
  steamErrorMessage,
  subscribeSteamChanges,
  syncSteam,
  toSteamError,
} from '../api';
import { createAttemptClaim, createOnce, minutesLeft, readSteamParams } from '../linkFlow';
import { safeSteamProfileUrl } from '../SteamCard';

const mockInvoke = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  errorMessage: (e: { message?: string }) => e?.message ?? 'err',
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({
  parse: (url: string) => ({ queryParams: Object.fromEntries(new URL(url.replace(/^[a-z]+:\/\//, 'https://x/')).searchParams) }),
  createURL: (p: string) => `gg://${p}`,
}));
// SteamCard (imported only for its pure URL helper) pulls in UI modules we don't need here.
jest.mock('../../../components/ui', () => ({}));
jest.mock('../../games/useGames', () => ({ useGames: () => ({ games: [] }) }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../theme', () => ({ makeStyles: () => () => ({}), spacing: {}, useTheme: () => ({}) }));

const openAuth = WebBrowser.openAuthSessionAsync as jest.Mock;

const httpError = (body: unknown, asText = false) =>
  new FunctionsHttpError({
    json: async () => {
      if (asText) throw new SyntaxError('Unexpected token <');
      return body;
    },
  });

const CODE_A = '11111111-2222-4333-8444-555555555555';
const CODE_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CODE_C = 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CODE_D = 'dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee';

beforeEach(() => {
  mockInvoke.mockReset();
  openAuth.mockReset();
});

describe('Steam error copy', () => {
  it('maps every server error code to friendly copy', () => {
    for (const code of [
      'unauthorized',
      'no_profile',
      'not_linked',
      'invalid_request',
      'invalid_code',
      'already_linked',
      'steam_unavailable',
      'not_configured',
      'internal',
      'method_not_allowed',
    ]) {
      expect(ERROR_MESSAGES[code]).toBeTruthy();
      expect(steamErrorMessage(code)).not.toMatch(/connection/i);
    }
  });

  it('shows the minutes left for too_soon', () => {
    expect(steamErrorMessage('too_soon', { retry_after_seconds: 130 })).toMatch(/3 minutes/);
    expect(steamErrorMessage('too_soon', { retry_after_seconds: 20 })).toMatch(/1 minute\./);
    expect(minutesLeft(undefined)).toBe(5);
    expect(minutesLeft(0)).toBe(1);
  });

  it('reads the code from a FunctionsHttpError JSON body', async () => {
    const e = await toSteamError(httpError({ error: 'already_linked' }));
    expect(e.code).toBe('already_linked');
    expect(e.message).toMatch(/already linked/);
  });

  it('uses generic server copy (not "check your connection") for unknown codes and non-JSON bodies', async () => {
    const unknown = await toSteamError(httpError({ error: 'weird_new_code' }));
    expect(unknown.message).toMatch(/on our side/);
    const html = await toSteamError(httpError(null, true));
    expect(html.message).toMatch(/on our side/);
    const relay = await toSteamError(new FunctionsRelayError({}));
    expect(relay.message).not.toMatch(/connection/i);
  });

  it('says "check your connection" only for network failures', async () => {
    const e = await toSteamError(new FunctionsFetchError(new TypeError('Network request failed')));
    expect(e.message).toMatch(/connection/i);
  });

  it('syncSteam throws the mapped message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError({ error: 'too_soon', retry_after_seconds: 240 }) });
    await expect(syncSteam()).rejects.toThrow(/4 minutes/);
  });

  it('a thrown invoke (fetch failure) is mapped too', async () => {
    mockInvoke.mockRejectedValue(new FunctionsFetchError({}));
    await expect(syncSteam()).rejects.toThrow(/connection/i);
  });
});

describe('linkSteam', () => {
  const started = () => mockInvoke.mockResolvedValueOnce({ data: { url: 'https://steamcommunity.com/openid/login?x' }, error: null });

  it('completes a verified sign-in with its code', async () => {
    started();
    mockInvoke.mockResolvedValueOnce({ data: { account: {} }, error: null });
    openAuth.mockResolvedValue({ type: 'success', url: `gg://steam-linked?steam=verified&code=${CODE_A}` });
    await expect(linkSteam()).resolves.toEqual({ status: 'linked' });
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'steam-link', { body: { action: 'start', redirect_to: 'gg://steam-linked' } });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'steam-link', { body: { action: 'complete', code: CODE_A } });
  });

  it('reports a failed completion with friendly copy', async () => {
    started();
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'invalid_code' }) });
    openAuth.mockResolvedValue({ type: 'success', url: `gg://steam-linked?steam=verified&code=${CODE_B}` });
    const res = await linkSteam();
    expect(res.status).toBe('error');
    expect(res.status === 'error' && res.message).toMatch(/expired or was already used/);
  });

  it('treats dismiss and cancel as cancelled without completing', async () => {
    started();
    openAuth.mockResolvedValue({ type: 'dismiss' });
    await expect(linkSteam()).resolves.toEqual({ status: 'cancelled' });
    started();
    openAuth.mockResolvedValue({ type: 'success', url: 'gg://steam-linked?steam=cancel' });
    await expect(linkSteam()).resolves.toEqual({ status: 'cancelled' });
    expect(mockInvoke.mock.calls.filter((c) => (c[1] as { body: { action: string } }).body.action === 'complete')).toHaveLength(0);
  });

  it('maps redirect error reasons', async () => {
    for (const [reason, re] of [
      ['expired', /too long/],
      ['invalid', /couldn't confirm/],
      ['already_linked', /already linked/],
      ['steam_unavailable', /not responding/],
      ['internal', /on our side/],
    ] as const) {
      started();
      openAuth.mockResolvedValue({ type: 'success', url: `gg://steam-linked?steam=error&reason=${reason}` });
      const res = await linkSteam();
      expect(res.status === 'error' && res.message).toMatch(re);
    }
  });

  it('a bad code in the redirect is rejected without calling complete', async () => {
    started();
    openAuth.mockResolvedValue({ type: 'success', url: 'gg://steam-linked?steam=verified&code=not-a-uuid' });
    const res = await linkSteam();
    expect(res.status).toBe('error');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('lets only one path report the outcome of an attempt', async () => {
    started();
    openAuth.mockResolvedValue({ type: 'dismiss' });
    await linkSteam();
    expect(claimSteamOutcome()).toBe(true); // e.g. the /steam-linked route
    expect(claimSteamOutcome()).toBe(false); // the other path stays quiet
  });
});

describe('completeSteamLink dedupe', () => {
  it('sends a code once even when both paths complete it, and notifies listeners', async () => {
    mockInvoke.mockResolvedValue({ data: { account: {} }, error: null });
    const changed = jest.fn();
    const unsubscribe = subscribeSteamChanges(changed);
    const [a, b] = await Promise.all([completeSteamLink(CODE_C), completeSteamLink(CODE_C)]);
    expect(a).toEqual({ status: 'linked' });
    expect(b).toBe(a);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    await completeSteamLink(CODE_D);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe('route helpers', () => {
  it('reads steam / code / reason params', () => {
    expect(readSteamParams({ steam: 'verified', code: CODE_A.toUpperCase() })).toEqual({ kind: 'verified', code: CODE_A });
    expect(readSteamParams({ steam: ['verified'], code: [CODE_A] })).toEqual({ kind: 'verified', code: CODE_A });
    expect(readSteamParams({ steam: 'verified' })).toEqual({ kind: 'error', reason: 'invalid' });
    expect(readSteamParams({ steam: 'error', reason: 'expired' })).toEqual({ kind: 'error', reason: 'expired' });
    expect(readSteamParams({ steam: 'cancel' })).toEqual({ kind: 'cancel' });
    expect(readSteamParams({ steam: 'linked' })).toEqual({ kind: 'linked' });
    expect(readSteamParams({})).toEqual({ kind: 'none' });
    expect(readSteamParams(undefined)).toEqual({ kind: 'none' });
  });

  it('createOnce runs each key once', async () => {
    const once = createOnce<number>();
    const fn = jest.fn(async () => 1);
    await Promise.all([once('a', fn), once('a', fn), once('b', fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('createAttemptClaim gives one claim per attempt', () => {
    const c = createAttemptClaim();
    expect(c.claim()).toBe(true); // cold start, no attempt begun in this session
    expect(c.claim()).toBe(false);
    c.begin();
    expect(c.claim()).toBe(true);
    expect(c.claim()).toBe(false);
  });

  it('only opens real Steam Community profile URLs', () => {
    expect(safeSteamProfileUrl('https://steamcommunity.com/id/gaben/')).toBe('https://steamcommunity.com/id/gaben/');
    expect(safeSteamProfileUrl('https://steamcommunity.com.evil.example/id/x')).toBeNull();
    expect(safeSteamProfileUrl('javascript:alert(1)')).toBeNull();
    expect(safeSteamProfileUrl(null)).toBeNull();
  });
});
