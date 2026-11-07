import { StyleSheet, View } from 'react-native';
import { Crest, Text } from '../../components/ui';
import { makeStyles, spacing, useTheme } from '../../theme';

export const AUTH_TAGLINE = 'Find teammates who play like you. Leave the rage at the door.';

/** Giant themed "GG" for the auth screens. Ronin adds the clan crest above it. */
export function AuthHero({ size = 116 }: { size?: number }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={s.wrap} accessible accessibilityRole="header" accessibilityLabel={`GG. ${AUTH_TAGLINE}`}>
      {t.id === 'ronin' ? <Crest size={Math.round(size * 0.5)} /> : null}
      <Text variant="display" style={[s.word, { fontSize: size, lineHeight: size * 1.02 }]}>GG</Text>
      <Text muted style={s.tagline}>{AUTH_TAGLINE}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    wrap: { alignItems: 'flex-start', marginBottom: spacing.xxl, gap: spacing.xs },
    word: { color: t.colors.text, letterSpacing: t.id === 'ronin' ? 4 : 2, includeFontPadding: false },
    tagline: { maxWidth: 300 },
  }),
);
