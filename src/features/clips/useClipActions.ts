// Shared actions for clip pages (feed + single clip): play, GG, share, squad up, delete.
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useLatestRef } from '../../lib/hooks';
import { PAUSED_MESSAGE } from '../../lib/supabase';
import { useMyStatus } from '../moderation/useMyStatus';
import { useTheme } from '../../theme';
import { clipErrorMessage, deleteClip, inviteToParty, shareClip, toggleClipGg } from './api';
import { firstName, PLATFORM_LABELS } from './logic';
import type { ToastMessage } from './Toast';
import type { Clip } from './types';

export type SquadUpState = 'sending' | 'sent';

export function useClipActions(toast: (m: ToastMessage) => void, opts: { onDeleted?: (clip: Clip) => void } = {}) {
  const t = useTheme();
  const { banned } = useMyStatus();
  /** Invite state per author id (so every clip by the same player shows "Invite sent"). */
  const [squad, setSquad] = useState<Record<string, SquadUpState>>({});
  const squadRef = useLatestRef(squad);
  const { onDeleted } = opts;

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
      setSquad((s) => ({ ...s, [authorId]: 'sending' }));
      try {
        await inviteToParty(authorId);
        setSquad((s) => ({ ...s, [authorId]: 'sent' }));
        toast({ text: `Invite sent to ${firstName(clip.author.display_name, 24)}. They'll find it in their Lobby.`, icon: 'people' });
      } catch (e) {
        setSquad((s) => {
          const next = { ...s };
          delete next[authorId];
          return next;
        });
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
