import { bubbleLayout } from '../layout';
import type { ChatMessage } from '../useMessages';

let seq = 0;
function msg(sender: string, created: Date): ChatMessage {
  seq += 1;
  return {
    id: `m${seq}`,
    sender_id: sender,
    created_at: created.toISOString(),
  } as unknown as ChatMessage;
}

const t = (h: number, m: number, day = 7) => new Date(2026, 10, day, h, m);

/** bubbleLayout expects newest-first (inverted FlatList); build oldest-first for readability. */
const newestFirst = (...oldestFirst: ChatMessage[]) => [...oldestFirst].reverse();

describe('bubbleLayout', () => {
  it('returns all false for an out-of-range index', () => {
    expect(bubbleLayout([], 0, true)).toEqual({ showDay: false, showSender: false, showTime: false });
  });

  it('shows the day, sender and time for a single message', () => {
    const list = newestFirst(msg('a', t(10, 0)));
    expect(bubbleLayout(list, 0, true)).toEqual({ showDay: true, showSender: true, showTime: true });
    expect(bubbleLayout(list, 0, false).showSender).toBe(false);
  });

  it('groups close messages from one sender into a run', () => {
    // oldest → newest: a 10:00, a 10:02, a 10:04
    const list = newestFirst(msg('a', t(10, 0)), msg('a', t(10, 2)), msg('a', t(10, 4)));
    const [newest, middle, oldest] = [0, 1, 2].map((i) => bubbleLayout(list, i, true));
    expect(oldest).toEqual({ showDay: true, showSender: true, showTime: false });
    expect(middle).toEqual({ showDay: false, showSender: false, showTime: false });
    expect(newest).toEqual({ showDay: false, showSender: false, showTime: true });
  });

  it('starts a new run after a gap of more than 5 minutes', () => {
    const list = newestFirst(msg('a', t(10, 0)), msg('a', t(10, 6)));
    expect(bubbleLayout(list, 1, true).showTime).toBe(true); // older one ends its run
    expect(bubbleLayout(list, 0, true).showSender).toBe(true); // newer one starts a run
  });

  it('starts a new run when the sender changes', () => {
    const list = newestFirst(msg('a', t(10, 0)), msg('b', t(10, 1)));
    expect(bubbleLayout(list, 1, true)).toMatchObject({ showSender: true, showTime: true });
    expect(bubbleLayout(list, 0, true)).toMatchObject({ showDay: false, showSender: true, showTime: true });
  });

  it('shows a day separator when the calendar day changes', () => {
    const list = newestFirst(msg('a', t(23, 58, 6)), msg('a', t(0, 1, 7)));
    expect(bubbleLayout(list, 0, true)).toEqual({ showDay: true, showSender: true, showTime: true });
    expect(bubbleLayout(list, 1, true).showTime).toBe(true);
  });
});
