import { Stack } from 'expo-router';
import { colors } from '../../theme';

// The (auth) group has no index route, so pin sign-in as its first screen
// (otherwise sign-in vs sign-up is decided by route sort order).
export const unstable_settings = { anchor: 'sign-in' };

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
