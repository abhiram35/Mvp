import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Notch, PanelFrame, ScreenTexture, Text } from '../../components/ui';
import { THEMES, THEME_ORDER, fontSize, makeStyles, spacing, useTheme, type AppTheme, type ThemeId } from '../../theme';

/**
 * A mini rendering of ANY theme (built-in or custom) drawn from that theme's own values,
 * so players see a look before switching. Hard-coded theme values here are intentional:
 * they are the previewed theme's, not the active one's.
 * `size="lg"` is the bigger version used for a freshly generated theme.
 */
export function ThemePreview({ theme: p, size = 'sm' }: { theme: AppTheme; size?: 'sm' | 'lg' }) {
  const s = useStyles();
  const lg = size === 'lg';
  const tt = p.shape.headingUppercase ? 'uppercase' : 'none';
  const dotRadius = p.shape.round ? 5 : 0;
  return (
    <View
      style={[s.preview, lg && s.previewLg, { backgroundColor: p.colors.bg, borderRadius: p.radius.md }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <ScreenTexture theme={p} opacity={0.06} />
      <View style={[s.panel, lg && s.panelLg, { backgroundColor: p.colors.panel, borderRadius: p.radius.lg }]}>
        <RNText
          style={{
            fontFamily: p.fonts.display,
            fontSize: lg ? 56 : 40,
            lineHeight: lg ? 62 : 44,
            color: p.colors.onPanel,
            letterSpacing: p.shape.headingLetterSpacing,
            textTransform: tt,
          }}
        >
          Ace
        </RNText>
        <RNText style={{ fontFamily: p.fonts.body, fontSize: fontSize.xs, color: p.colors.onPanel, opacity: 0.75 }}>
          5 {p.words.gg} · {p.words.squad}
        </RNText>
        <PanelFrame theme={p} />
      </View>
      {lg ? (
        <View style={{ gap: 2 }}>
          <RNText
            style={{
              fontFamily: p.fonts.heading,
              fontSize: fontSize.lg,
              color: p.colors.text,
              letterSpacing: p.shape.headingLetterSpacing,
              textTransform: tt,
            }}
          >
            {p.words.lobbies} · {p.words.community}
          </RNText>
          <RNText style={{ fontFamily: p.fonts.body, fontSize: fontSize.sm, lineHeight: 20, color: p.colors.text }}>
            Need two for ranked tonight. Chill comms, no rage.
          </RNText>
          <RNText style={{ fontFamily: p.fonts.body, fontSize: fontSize.xs, color: p.colors.textMuted }}>
            Posted 5 min ago
          </RNText>
        </View>
      ) : null}
      <View style={s.previewRow}>
        <View style={[s.sampleBtn, lg && s.sampleBtnLg, { backgroundColor: p.colors.primary, borderRadius: p.radius.md }]}>
          <RNText
            style={{
              fontFamily: p.fonts.heading,
              fontSize: lg ? fontSize.md : fontSize.sm,
              color: p.colors.onPrimary,
              letterSpacing: p.shape.headingLetterSpacing,
              textTransform: tt,
            }}
          >
            {p.words.squadUp}
          </RNText>
          {p.shape.cut ? <Notch corner="topRight" color={p.colors.bg} size={Math.max(4, Math.round(p.shape.cut * (lg ? 0.8 : 0.6)))} /> : null}
        </View>
        <View style={[s.dot, { backgroundColor: p.colors.accent, borderRadius: dotRadius }]} />
        <View style={[s.dot, { backgroundColor: p.colors.info, borderRadius: dotRadius }]} />
        <View style={[s.dot, { backgroundColor: p.colors.warning, borderRadius: dotRadius }]} />
      </View>
    </View>
  );
}

/**
 * A large tappable theme card: the previewed theme's mini preview, its name and vibe.
 * The card chrome (border, checkmark, "…" button) follows the ACTIVE theme.
 */
export function ThemeOptionCard({
  theme,
  id,
  selected,
  onPress,
  onMore,
}: {
  /** The theme to preview. Either this or a built-in `id`. */
  theme?: AppTheme;
  id?: ThemeId;
  selected: boolean;
  onPress: () => void;
  /** Shows a "…" button (and enables long-press) for rename / delete. */
  onMore?: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const p = theme ?? (id && id in THEMES ? THEMES[id as keyof typeof THEMES] : THEMES.protocol);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${p.name} theme.${p.vibe ? ` ${p.vibe}` : ''}`}
      accessibilityHint={onMore ? 'Long press for rename and delete.' : undefined}
      style={({ pressed }) => [s.card, selected && { borderColor: t.colors.primary, borderWidth: 2 }, pressed && s.pressed]}
    >
      <ThemePreview theme={p} />

      <View style={s.info}>
        <View style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={1}>{p.name}</Text>
          {p.vibe ? <Text variant="label" style={{ marginTop: 2 }}>{p.vibe}</Text> : null}
        </View>
        {onMore ? (
          <Pressable
            onPress={onMore}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Options for ${p.name}`}
            style={({ pressed }) => [s.more, pressed && s.pressed]}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={t.colors.textMuted} />
          </Pressable>
        ) : null}
        {selected ? (
          <View style={s.check}>
            <Ionicons name="checkmark" size={18} color={t.colors.onPrimary} />
          </View>
        ) : (
          <View style={s.checkEmpty} />
        )}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.lg,
      padding: spacing.md,
      gap: spacing.md,
    },
    pressed: { backgroundColor: t.colors.surfaceRaised },
    preview: { padding: spacing.md, gap: spacing.sm, overflow: 'hidden' },
    previewLg: { padding: spacing.lg, gap: spacing.md },
    panel: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, overflow: 'hidden' },
    panelLg: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    sampleBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, overflow: 'hidden' },
    sampleBtnLg: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
    dot: { width: 10, height: 10 },
    info: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    more: {
      width: 36,
      height: 36,
      borderRadius: t.shape.round ? 18 : t.radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    check: {
      width: 28,
      height: 28,
      borderRadius: t.shape.round ? 14 : t.radius.sm,
      backgroundColor: t.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkEmpty: {
      width: 28,
      height: 28,
      borderRadius: t.shape.round ? 14 : t.radius.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
  }),
);

/** The three built-in themes, stacked (onboarding and the "Built-in" section). Tapping one re-themes the app instantly. */
export function ThemePickerList({ themeId, onSelect }: { themeId: ThemeId; onSelect: (id: ThemeId) => void }) {
  return (
    <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
      {THEME_ORDER.map((id) => (
        <ThemeOptionCard key={id} theme={THEMES[id]} selected={themeId === id} onPress={() => onSelect(id)} />
      ))}
    </View>
  );
}
