import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/ui';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { useEntrance } from './motion';
import { RollingText } from './RollingText';

export interface LoadoutOption<T> {
  value: T | null;
  label: string;
}

/** One tappable, underlined word in the loadout sentence. Opens a bottom sheet of options. */
function Slot<T>({
  name,
  value,
  options,
  onChange,
  reduced,
}: {
  name: string;
  value: T | null;
  options: LoadoutOption<T>[];
  onChange: (v: T | null) => void;
  reduced: boolean;
}) {
  const t = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // The scrim fades (Modal), while the sheet itself slides up.
  const slide = useEntrance(open, { duration: 320, reduced });
  const current = options.find((o) => o.value === value) ?? options[0];
  // Primary text fails AA on light backgrounds, so light themes use body text with a primary underline.
  const wordColor = t.dark ? t.colors.primary : t.colors.text;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${name}: ${current.label}`}
        accessibilityHint="Opens a list to change it"
        hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
        style={[s.word, { borderBottomColor: t.colors.primary }]}
      >
        <RollingText value={current.label} reduced={reduced} style={[s.wordText, { color: wordColor }]} />
        <Ionicons name="chevron-down" size={14} color={wordColor} style={{ marginLeft: 2, marginTop: 4 }} />
      </Pressable>

      <Modal visible={open} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={s.sheetWrap}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.overlay }]} onPress={() => setOpen(false)} accessibilityLabel="Close" accessibilityRole="button" />
          <Animated.View
            style={[
              s.sheet,
              { paddingBottom: insets.bottom + spacing.lg, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] },
            ]}
          >
            <View style={s.grabber} />
            <Text variant="heading" accessibilityRole="header" style={{ marginBottom: spacing.sm }}>
              {name}
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((o) => {
                const selected = o.value === value;
                return (
                  <Pressable
                    key={String(o.value)}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    style={({ pressed }) => [s.option, (pressed || selected) && { backgroundColor: t.colors.surfaceRaised }]}
                  >
                    <RNText style={[s.optionText, selected && { fontFamily: t.fonts.bodyBold }]}>{o.label}</RNText>
                    {selected ? <Ionicons name="checkmark" size={20} color={t.colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

/** "Duo from [any region] who speaks [any language]." — the filters as one readable sentence. */
export function LoadoutLine<R extends string>({
  region,
  regionOptions,
  onRegion,
  language,
  languageOptions,
  onLanguage,
  reduced,
}: {
  region: R | null;
  regionOptions: LoadoutOption<R>[];
  onRegion: (r: R | null) => void;
  language: string | null;
  languageOptions: LoadoutOption<string>[];
  onLanguage: (l: string | null) => void;
  reduced: boolean;
}) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text variant="label" style={s.kicker}>
          Loadout
        </Text>
        <Text variant="caption">Tap a word to change it</Text>
      </View>
      <View style={s.sentence}>
        <RNText style={s.plain}>Duo from </RNText>
        <Slot name="Region" value={region} options={regionOptions} onChange={onRegion} reduced={reduced} />
        <RNText style={s.plain}> who speaks </RNText>
        <Slot name="Language" value={language} options={languageOptions} onChange={onLanguage} reduced={reduced} />
        <RNText style={[s.plain, { color: t.colors.text }]}>.</RNText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.colors.surface,
      borderColor: t.colors.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: t.radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    kicker: { fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase' },
    sentence: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', rowGap: spacing.sm },
    plain: { fontFamily: t.fonts.bodyMedium, fontSize: fontSize.lg + 1, color: t.colors.text, lineHeight: 28 },
    word: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, minHeight: 28 },
    wordText: { fontFamily: t.fonts.bodyBold, fontSize: fontSize.lg + 1, lineHeight: 26 },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: t.colors.surface,
      borderTopLeftRadius: t.radius.lg * 2,
      borderTopRightRadius: t.radius.lg * 2,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.border, marginBottom: spacing.md },
    option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, borderRadius: t.radius.md },
    optionText: { fontFamily: t.fonts.body, fontSize: fontSize.md, color: t.colors.text },
  }),
);
