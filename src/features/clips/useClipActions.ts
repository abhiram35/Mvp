// Shared actions for clip pages (feed + single clip): play, GG, share, squad up, delete.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useLatestRef } from '../../lib/hooks';
import { PAUSED_MESSAGE } from '../../lib/supabase';
import { useMyStatus } from '../moderation/useMyStatus';
import { fetchMyParty } from '../party/api';
import { nextSentExpiry, reconcileSentInvites } from '../party/logic';
import { INVITE_TTL_MS } from '../party/types';
import { useTheme } from '../../theme';
import { clipErrorMessage, deleteClip, inviteToParty, shareClip, toggleClipGg } from './api';
import { firstName, PLATFORM_LABELS } from './logic';
import type { ToastMessage } from './Toast';
import type { Clip } from './types';

export type SquadUpState = 'sending' | 'sent';

export function useClipActions(toast: (m: ToastMessage) => void, opts: { onDeleted?: (clip: Clip) => void } = {}) {
  const t = useTheme();
  const { banned } = useMyStatus();
  /** Invites in flight, per author id. */
  const [sending, setSending] = useState<ReadonlySet<string>>(() => new Set());
  /** Sent invites: author id → expiry (ms). "Invite sent" shows until then, or until it's gone. */
  const [sent, setSent] = useState<Readonly<Record<string, number>>>({});
  /** Invite state per author id (so every clip by the same player shows "Invite sent"). */
  const squad = useMemo(() => {
    const out: Record<string, SquadUpState> = {};
    for (const id of Object.keys(sent)) out[id] = 'sent';
    for (const id of sending) out[id] = 'sending';
    return out;
  }, [sent, sending]);
  const squadRef = useLatestRef(squad);
  const { onDeleted } = opts;

  // Clear "Invite sent" when the invite expires (1 h after sending).
  const nextExpiry = nextSentExpiry(sent);
  useEffect(() => {
    if (nextExpiry == null) return;
    const timer = setTimeout(() => setSent((s) => reconcileSentInvites(s, undefined, Date.now())), Math.max(0, nextExpiry - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [nextExpiry]);

  // …or when it no longer appears in my party (accepted, declined, cancelled): check on focus.
  const hasSent = nextExpiry != null;
  useFocusEffect(
    useCallback(() => {
      if (!hasSent) return;
      let live = true;
      fetchMyParty().then(
        (party) => {
          if (live) setSent((s) => reconcileSentInvites(s, party, Date.now()));
        },
        () => {
          // Offline: keep the badges until they expire.
        },
      );
      return () => {
        live = false;
      };
    }, [hasSent]),
  );

  const play = useCallback(
    async (clip: Clip) => {
      try {
        await Linking.openURL(clip.url);
      } catch {
        toast({ text: `Couldn't open ${PLATFORM_LABELS[clip.platform]}. Check that the link still works.`, tone: 'error' });
      }
    },
    [toast],
  );

  const gg = useCallback(
    async (clip: Clip) => {
      if (banned) {
        toast({ text: PAUSED_MESSAGE, tone: 'error' });
        return;
      }
      try {
        await toggleClipGg(clip);
      } catch (e) {
        toast({ text: `Couldn't update ${t.words.gg}: ${clipErrorMessage(e)}`, tone: 'error' });
      }
    },
    [banned, toast, t.words.gg],
  );

  const share = useCallback(
    async (clip: Clip) => {
      try {
        await shareClip(clip);
      } catch {
        toast({ text: "Couldn't open the share sheet.", tone: 'error' });
      }
    },
    [toast],
  );

  const squadUp = useCallback(
    async (clip: Clip) => {
      const authorId = clip.author_id;
      if (squadRef.current[authorId]) return;
      if (banned) {
        toast({ text: PAUSED_MESSAGE, tone: 'error' });
        return;
      }
      const setSendingFor = (on: boolean) =>
        setSending((prev) => {
          const next = new Set(prev);
          if (on) next.add(authorId);
          else next.delete(authorId);
          return next;
        });
      setSendingFor(true);
      try {
        await inviteToParty(authorId);
        setSent((s) => ({ ...s, [authorId]: Date.now() + INVITE_TTL_MS }));
        setSendingFor(false);
        toast({ text: `Invite sent to ${firstName(clip.author.display_name, 24)}. They'll find it in their Lobby.`, icon: 'people' });
      } catch (e) {
        setSendingFor(false);
        toast({ text: clipErrorMessage(e), tone: 'error' });
      }
    },
    [squadRef, banned, toast],
  );

  const more = useCallback(
    (clip: Clip) => {
      Alert.alert('Delete this clip?', 'It disappears from every feed. Comments and GGs go with it.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteClip(clip.id).then(
              () => {
                toast({ text: 'Clip deleted', icon: 'trash-outline' });
                onDeleted?.(clip);
              },
              (e: unknown) => toast({ text: clipErrorMessage(e), tone: 'error' }),
            );
          },
        },
      ]);
    },
    [toast, onDeleted],
  );

  const openAuthor = useCallback((clip: Clip) => router.push({ pathname: '/user/[id]', params: { id: clip.author_id } }), []);

  return { play, gg, share, squadUp, more, openAuthor, squad, banned };
}
