import { StyleSheet, View } from 'react-native';
import { Text, VinqMark } from '../../components/ui';
import { makeStyles, spacing } from '../../theme';

export const AUTH_TAGLINE = 'Find teammates who play like you. Leave the rage at the door.';

/** The Vinq crest plus a giant themed "VINQ" wordmark for the auth screens. */
export function AuthHero({ size = 96 }: { size?: number }) {
  const s = useStyles();
  return (
    <View style={s.wrap} accessible accessibilityRole="header" accessibilityLabel={`Vinq. ${AUTH_TAGLINE}`}>
      <VinqMark size={Math.round(size * 0.8)} />
      <Text variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[s.word, { fontSize: size, lineHeight: size * 1.02 }]}>
        VINQ
      </Text>
      <Text muted style={s.tagline}>{AUTH_TAGLINE}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    wrap: { alignItems: 'flex-start', marginBottom: spacing.xxl, gap: spacing.xs },
    word: { alignSelf: 'stretch', color: t.colors.text, letterSpacing: t.id === 'ronin' ? 4 : 2, includeFontPadding: false },
    tagline: { maxWidth: 300 },
  }),
);
