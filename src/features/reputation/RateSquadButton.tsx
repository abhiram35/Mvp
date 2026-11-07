import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Button } from '../../components/ui';
import { useTheme } from '../../theme';
import { RateSquadSheet } from './RateSquadSheet';

/** "Rate your squad" button that opens the rating sheet for a lobby. */
export function RateSquadButton({ lfgPostId, style }: { lfgPostId: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button title={`Rate your ${t.words.squad}`} icon="star-outline" variant="secondary" onPress={() => setOpen(true)} style={style} />
      <RateSquadSheet visible={open} lfgPostId={lfgPostId} onClose={() => setOpen(false)} />
    </>
  );
}
