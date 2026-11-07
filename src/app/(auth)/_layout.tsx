import { Stack } from 'expo-router';
import { useTheme } from '../../theme';

// The (auth) group has no index route, so pin sign-in as its first screen
// (otherwise sign-in vs sign-up is decided by route sort order).
export const unstable_settings = { anchor: 'sign-in' };

export default function AuthLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen
        name="reset-password"
        options={{
          headerShown: true,
          title: 'Reset password',
          headerBackTitle: 'Sign in',
          headerStyle: { backgroundColor: t.colors.bg },
          headerTintColor: t.colors.text,
          headerTitleStyle: { fontFamily: t.fonts.heading, fontSize: 20 },
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
