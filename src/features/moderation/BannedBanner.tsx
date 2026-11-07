import { Ionicons } from '@expo/vector-icons';
import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/ui';
import { makeStyles, spacing, useTheme } from '../../theme';
import { useMyStatus } from './useMyStatus';

/** "12 Dec" (adds the year if not this year; adds the time when the ban ends within 2 days). */
export function formatBanEnd(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'later';
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  if (d.getTime() - now < 2 * 24 * 60 * 60 * 1000) {
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    return `${date}, ${time}`;
  }
  return date;
}

/** Set by a layout that already shows the banner, so nested screens don't show it twice. */
const BannerHostContext = createContext(false);

/** Wrap a navigator in this when it renders <BannedBanner safeArea /> above it. */
export function BannedBannerHost({ children }: { children: ReactNode }) {
  return <BannerHostContext.Provider value>{children}</BannerHostContext.Provider>;
}

/**
 * "Your account is paused until {date}. You can still read and browse." Renders nothing when
 * the player isn't banned, or when an outer BannedBannerHost already shows it.
 * `safeArea` pads the top inset (use when it sits above a navigator, outside any Screen).
 */
export function BannedBanner({ safeArea, force }: { safeArea?: boolean; /** render even inside a host */ force?: boolean }) {
  const t = useTheme();
  const s = useStyles();
  const hosted = useContext(BannerHostContext);
  const { banned, bannedUntil } = useMyStatus();
  if (!banned || !bannedUntil || (hosted && !force)) return null;

  const content = (
    <View style={s.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={s.accent} />
      <Ionicons name="pause-circle" size={20} color={t.colors.danger} style={s.icon} />
      <Text variant="label" style={s.text}>
        Your account is paused until {formatBanEnd(bannedUntil)}. You can still read and browse.
      </Text>
    </View>
  );

  if (!safeArea) return content;
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: t.colors.surface }}>
      {content}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
      paddingVertical: spacing.sm,
      paddingRight: spacing.lg,
      minHeight: 44,
    },
    accent: { alignSelf: 'stretch', width: 4, backgroundColor: t.colors.danger, marginRight: spacing.md },
    icon: { marginRight: spacing.sm },
    text: { flex: 1, color: t.colors.text },
  }),
);
