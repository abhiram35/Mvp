import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, Screen } from '../components/ui';
import { isSupabaseConfigured } from '../lib/supabase';
import { NotificationsBridge } from '../features/notifications/NotificationsBridge';
import { GGErrorBoundary, installGlobalErrorHandlers, useAppOpenTracking } from '../features/telemetry';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { ThemeProvider, useTheme, useThemeSwitcher } from '../theme';

// Capture crashes and unhandled errors into Supabase (app_errors) from the very start.
installGlobalErrorHandlers();

/** Logs app_open for beta metrics (at most every 30 minutes, only when signed in). */
function AppOpenTracker() {
  useAppOpenTracking();
  return null;
}

function RootNavigator() {
  const { initializing, session, profile } = useAuth();
  const t = useTheme();
  const { ready: themeReady } = useThemeSwitcher();

  if (!isSupabaseConfigured) {
    return (
      <Screen>
        <EmptyState
          icon="construct-outline"
          title="Connect Supabase"
          message="Copy .env.example to .env, add your Supabase URL and anon key, then restart the app."
        />
      </Screen>
    );
  }

  if (initializing || !themeReady) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const signedIn = !!session;
  const onboarded = signedIn && !!profile;
  // Explicit redirect targets for guarded routes. Without these, Expo Router falls back
  // to the first unguarded route group (e.g. "/(auth)"), which has no index screen.
  const home = !signedIn ? '/sign-in' : !onboarded ? '/onboarding' : '/';

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.colors.bg },
        headerTintColor: t.colors.text,
        headerTitleStyle: { fontFamily: t.fonts.heading, fontSize: 20 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: t.colors.bg },
      }}
    >
      {/* Signed out: sign in / sign up (owned by the Auth & Profile agent) */}
      <Stack.Protected guard={!signedIn} redirectTo={home}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Signed in but no profile yet: onboarding (owned by the Auth & Profile agent) */}
      <Stack.Protected guard={signedIn && !onboarded} redirectTo={home}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Fully set up: the main app */}
      <Stack.Protected guard={onboarded} redirectTo={home}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* LFG agent */}
        <Stack.Screen name="lfg/new" options={{ title: 'Host lobby', presentation: 'modal' }} />
        <Stack.Screen name="lfg/[id]" options={{ title: 'Lobby' }} />
        {/* Auth & Profile agent */}
        <Stack.Screen name="user/[id]" options={{ title: 'Player' }} />
        <Stack.Screen name="settings/edit-profile" options={{ title: 'Edit profile' }} />
        <Stack.Screen name="settings/blocked" options={{ title: 'Blocked players' }} />
        <Stack.Screen name="report" options={{ title: 'Report', presentation: 'modal' }} />
        {/* Theme picker */}
        <Stack.Screen name="settings/theme" options={{ title: 'Theme' }} />
        {/* Chat & Friends agent */}
        <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="friends" options={{ title: 'Friends' }} />
        {/* Engagement agent */}
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        {/* Safety agent: moderators only (screen checks get_my_status) */}
        <Stack.Screen name="moderation" options={{ title: 'Moderation' }} />
        {/* Community agent */}
        <Stack.Screen name="community/new" options={{ title: 'New post', presentation: 'modal' }} />
        <Stack.Screen name="community/[id]" options={{ title: 'Post' }} />
      </Stack.Protected>
    </Stack>
  );
}

function ThemedStatusBar() {
  const t = useTheme();
  return <StatusBar style={t.dark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppOpenTracker />
      <ThemeProvider>
        <GGErrorBoundary name="root">
          <AuthProvider>
            <ThemedStatusBar />
            <NotificationsBridge />
            <RootNavigator />
          </AuthProvider>
        </GGErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
