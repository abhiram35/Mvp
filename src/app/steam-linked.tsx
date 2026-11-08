import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { LoadingState, Screen } from '../components/ui';
import { claimSteamOutcome, finishSteamResult, notifySteamChanged, steamReturnToResult } from '../features/steam/api';
import { readSteamParams } from '../features/steam/linkFlow';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/profile');
}

/**
 * Landing route for the "Sign in through Steam" redirect (gg://steam-linked?steam=…&code=…).
 * The in-app browser usually hands the URL to features/steam/api.ts, but Android can report
 * "dismiss" first and a cold start only gets the deep link — so this route completes the link
 * itself. completeSteamLink() sends each code once, and only one of the two paths shows a message.
 */
export default function SteamLinkedScreen() {
  const params = useLocalSearchParams<{ steam?: string; code?: string; reason?: string }>();
  const ret = readSteamParams(params);
  const key = ret.kind === 'verified' ? ret.code : ret.kind === 'error' ? `error:${ret.reason}` : ret.kind;
  const handled = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Once per redirect, even if the effect re-runs (React strict mode, re-render with the same params).
    if (handled.current === key) return;
    handled.current = key;
    void (async () => {
      const result = await finishSteamResult(steamReturnToResult(ret));
      // Whatever happened, make the Steam card re-read the account.
      notifySteamChanged();
      if (mounted.current) leave();
      if (result.status === 'error' && claimSteamOutcome()) Alert.alert("Couldn't link Steam", result.message);
    })();
    // `ret` is derived from the params that make up `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <Screen>
      <LoadingState label="Linking Steam…" />
    </Screen>
  );
}
