import { router } from 'expo-router';
import { useEffect } from 'react';
import { LoadingState, Screen } from '../components/ui';

/**
 * Landing route for the "Sign in through Steam" redirect (gg://steam-linked?steam=…).
 * The in-app browser session in features/steam/api.ts reads the result; this screen
 * only makes sure the router doesn't show "page not found" if it handles the link too.
 */
export default function SteamLinkedScreen() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  }, []);
  return (
    <Screen>
      <LoadingState label="Linking Steam…" />
    </Screen>
  );
}
