import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Button } from '../../components/ui';
import { useNow } from '../../lib/hooks';
import { useTheme } from '../../theme';
import { isRatingWindowOpen } from './api';
import { RateSquadSheet } from './RateSquadSheet';

/**
 * "Rate your squad" button that opens the rating sheet for a lobby. Hidden once the server's
 * rating window (7 days after the lobby was created) has closed.
 */
export function RateSquadButton({
  lfgPostId,
  lobbyCreatedAt,
  style,
}: {
  lfgPostId: string;
  lobbyCreatedAt: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const now = useNow();
  const [open, setOpen] = useState(false);
  if (!isRatingWindowOpen(lobbyCreatedAt, now) && !open) return null;
  return (
    <>
      <Button title={`Rate your ${t.words.squad}`} icon="star-outline" variant="secondary" onPress={() => setOpen(true)} style={style} />
      <RateSquadSheet visible={open} lfgPostId={lfgPostId} onClose={() => setOpen(false)} />
    </>
  );
}
