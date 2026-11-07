import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { formatDayLabel, formatMessageTime } from './format';
import type { ChatMessage } from './useMessages';

export interface BubbleLayout {
  /** First message of a new calendar day → show a day separator above it. */
  showDay: boolean;
  /** Show the sender's name above the bubble (group chats, start of a run). */
  showSender: boolean;
  /** Last message of a run → show the time below the bubble. */
  showTime: boolean;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
  layout,
  onLongPress,
}: {
  message: ChatMessage;
  mine: boolean;
  layout: BubbleLayout;
  onLongPress?: (message: ChatMessage) => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const time = formatMessageTime(message.created_at);
  const senderName = message.sender?.display_name ?? 'Player';
  return (
    <View>
      {layout.showDay ? (
        <View style={s.dayRow} accessibilityRole="header">
          <View style={s.dayRule} />
          <Text style={s.dayText}>{formatDayLabel(message.created_at)}</Text>
          <View style={s.dayRule} />
        </View>
      ) : null}
      <View style={[s.wrap, mine ? s.wrapMine : s.wrapTheirs, layout.showTime ? s.runEnd : null]}>
        {layout.showSender && !mine ? (
          <Text style={s.sender} numberOfLines={1}>{senderName}</Text>
        ) : null}
        <Pressable
          onLongPress={onLongPress ? () => onLongPress(message) : undefined}
          delayLongPress={350}
          accessibilityRole="text"
          accessibilityLabel={`${mine ? 'You' : senderName}: ${message.body}. ${time}${message.pending ? '. Sending' : ''}`}
          accessibilityHint={onLongPress ? 'Long press for options' : undefined}
          style={({ pressed }) => [
            s.bubble,
            mine ? s.bubbleMine : s.bubbleTheirs,
            pressed && (mine ? { backgroundColor: t.colors.primaryPressed } : { backgroundColor: t.colors.surfaceRaised }),
            message.pending && { opacity: 0.6 },
          ]}
        >
          <Text style={mine ? s.bodyMine : s.bodyTheirs} selectable={false}>
            {message.body}
          </Text>
        </Pressable>
        {layout.showTime ? (
          <Text variant="caption" style={[s.time, mine && { textAlign: 'right' }]}>
            {message.pending ? 'Sending…' : time}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const useStyles = makeStyles((t) => {
  // The "tail" corner is a step sharper than the rest; in Protocol/Defuse everything is already crisp.
  const tail = Math.min(t.radius.sm, t.radius.lg) / 2;
  return StyleSheet.create({
    dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
    dayRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border },
    dayText: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.sm,
      color: t.colors.textMuted,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    wrap: { maxWidth: '80%', marginTop: 2 },
    wrapMine: { alignSelf: 'flex-end' },
    wrapTheirs: { alignSelf: 'flex-start' },
    runEnd: { marginBottom: spacing.sm },
    sender: {
      fontFamily: t.fonts.bodyBold,
      fontSize: fontSize.xs,
      color: t.colors.textMuted,
      marginBottom: 2,
      marginLeft: spacing.xs,
    },
    bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: t.radius.lg },
    bubbleMine: { backgroundColor: t.colors.primary, borderBottomRightRadius: tail },
    bubbleTheirs: {
      backgroundColor: t.colors.surface,
      borderBottomLeftRadius: tail,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    bodyMine: { fontFamily: t.fonts.body, fontSize: fontSize.md, lineHeight: 22, color: t.colors.onPrimary },
    bodyTheirs: { fontFamily: t.fonts.body, fontSize: fontSize.md, lineHeight: 22, color: t.colors.text },
    time: { marginTop: 2, marginHorizontal: spacing.xs },
  });
});
