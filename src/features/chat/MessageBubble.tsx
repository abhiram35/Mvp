import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';
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
  const time = formatMessageTime(message.created_at);
  const senderName = message.sender?.display_name ?? 'Player';
  return (
    <View>
      {layout.showDay ? (
        <View style={styles.dayRow} accessibilityRole="header">
          <Text variant="caption" style={styles.dayText}>{formatDayLabel(message.created_at)}</Text>
        </View>
      ) : null}
      <View style={[styles.wrap, mine ? styles.wrapMine : styles.wrapTheirs, layout.showTime ? styles.runEnd : null]}>
        {layout.showSender && !mine ? (
          <Text variant="caption" style={styles.sender} numberOfLines={1}>{senderName}</Text>
        ) : null}
        <Pressable
          onLongPress={onLongPress ? () => onLongPress(message) : undefined}
          delayLongPress={350}
          accessibilityRole="text"
          accessibilityLabel={`${mine ? 'You' : senderName}: ${message.body}. ${time}${message.pending ? '. Sending' : ''}`}
          accessibilityHint={onLongPress ? 'Long press for options' : undefined}
          style={({ pressed }) => [
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            pressed && !mine && { backgroundColor: colors.surfaceRaised },
            message.pending && { opacity: 0.6 },
          ]}
        >
          <Text style={{ color: mine ? colors.onPrimary : colors.text, fontSize: font.size.md }} selectable={false}>
            {message.body}
          </Text>
        </Pressable>
        {layout.showTime ? (
          <Text variant="caption" style={[styles.time, mine && { textAlign: 'right' }]}>
            {message.pending ? 'Sending…' : time}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  dayRow: { alignItems: 'center', marginVertical: spacing.md },
  dayText: {
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  wrap: { maxWidth: '80%', marginTop: 2 },
  wrapMine: { alignSelf: 'flex-end' },
  wrapTheirs: { alignSelf: 'flex-start' },
  runEnd: { marginBottom: spacing.sm },
  sender: { color: colors.textMuted, marginBottom: 2, marginLeft: spacing.sm, fontWeight: font.weight.semibold },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm / 2 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: radius.sm / 2, borderWidth: 1, borderColor: colors.border },
  time: { marginTop: 2, marginHorizontal: spacing.sm },
});
