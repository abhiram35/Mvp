import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, type IconName } from '../../components/ui';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

export interface MenuAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
}

/**
 * Themed bottom sheet of actions (the "…" menu). Used instead of Alert because Android
 * alerts cap at three buttons and don't follow the theme.
 */
export function ActionMenu({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  // iOS can't present an Alert or a modal screen while this Modal is still animating
  // out (the new one silently never appears). Run the chosen action once the sheet
  // has gone: on iOS from onDismiss (with a fallback timer), elsewhere straight away.
  const pending = useRef<(() => void) | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runPending = useCallback(() => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);
  useEffect(() => () => {
    if (fallback.current) clearTimeout(fallback.current);
  }, []);
  const choose = (action: () => void) => {
    onClose();
    if (Platform.OS === 'ios') {
      pending.current = action;
      fallback.current = setTimeout(runPending, 700);
    } else {
      action();
    }
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={runPending}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={s.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} accessibilityViewIsModal>
          {title ? (
            <Text variant="caption" style={s.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => choose(a.onPress)}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: t.colors.surfaceRaised }]}
            >
              <Ionicons name={a.icon} size={20} color={a.destructive ? t.colors.danger : t.colors.text} />
              <Text style={[s.rowText, a.destructive && { color: t.colors.danger }]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            style={({ pressed }) => [s.row, s.cancel, pressed && { backgroundColor: t.colors.surfaceRaised }]}
          >
            <Text style={[s.rowText, { color: t.colors.textMuted }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.colors.overlay },
    sheet: {
      backgroundColor: t.colors.surface,
      borderTopLeftRadius: t.radius.lg,
      borderTopRightRadius: t.radius.lg,
      borderTopWidth: 1,
      borderColor: t.colors.border,
      paddingTop: spacing.sm,
    },
    title: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 52,
      paddingHorizontal: spacing.lg,
    },
    rowText: { fontFamily: t.fonts.bodyMedium, fontSize: fontSize.md, color: t.colors.text },
    cancel: { justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border, marginTop: spacing.xs },
  }),
);
