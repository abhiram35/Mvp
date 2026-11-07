import { Stack } from 'expo-router';
import { useTheme } from '../../theme';

// The (auth) group has no index route, so pin sign-in as its first screen
// (otherwise sign-in vs sign-up is decided by route sort order).
export const unstable_settings = { anchor: 'sign-in' };

export default function AuthLayout() {
  const t = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }} />;
}
