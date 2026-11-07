import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, Screen } from '../components/ui';
import { isSupabaseConfigured } from '../lib/supabase';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { colors } from '../theme';

function RootNavigator() {
  const { initializing, session, profile } = useAuth();

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

  if (initializing) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const signedIn = !!session;
  const onboarded = signedIn && !!profile;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* Signed out: sign in / sign up (owned by the Auth & Profile agent) */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Signed in but no profile yet: onboarding (owned by the Auth & Profile agent) */}
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Fully set up: the main app */}
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* LFG agent */}
        <Stack.Screen name="lfg/new" options={{ title: 'New squad post', presentation: 'modal' }} />
        <Stack.Screen name="lfg/[id]" options={{ title: 'Squad post' }} />
        {/* Auth & Profile agent */}
        <Stack.Screen name="user/[id]" options={{ title: 'Player' }} />
        <Stack.Screen name="settings/edit-profile" options={{ title: 'Edit profile' }} />
        <Stack.Screen name="settings/blocked" options={{ title: 'Blocked players' }} />
        <Stack.Screen name="report" options={{ title: 'Report', presentation: 'modal' }} />
        {/* Chat & Friends agent */}
        <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="friends" options={{ title: 'Friends' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
