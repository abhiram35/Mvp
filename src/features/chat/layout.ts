import { isSameDay, minutesBetween } from './format';
import type { BubbleLayout } from './MessageBubble';
import type { ChatMessage } from './useMessages';

/** Messages closer than this (same sender) are grouped into one run with a single timestamp. */
const RUN_GAP_MINUTES = 5;

/**
 * Bubble layout for index `i` of a newest-first list (as rendered by an inverted FlatList):
 * the chronologically previous message is at i + 1, the next one at i - 1.
 */
export function bubbleLayout(list: ChatMessage[], i: number, isGroup: boolean): BubbleLayout {
  const msg = list[i];
  if (!msg) return { showDay: false, showSender: false, showTime: false };
  const prev = list[i + 1];
  const next = list[i - 1];
  const showDay = !prev || !isSameDay(prev.created_at, msg.created_at);
  const startsRun =
    showDay || !prev || prev.sender_id !== msg.sender_id || minutesBetween(prev.created_at, msg.created_at) > RUN_GAP_MINUTES;
  const endsRun =
    !next ||
    next.sender_id !== msg.sender_id ||
    !isSameDay(next.created_at, msg.created_at) ||
    minutesBetween(next.created_at, msg.created_at) > RUN_GAP_MINUTES;
  return { showDay, showSender: isGroup && startsRun, showTime: endsRun };
}
