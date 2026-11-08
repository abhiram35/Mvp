import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import type { Game } from '../../lib/types';
import { makeStyles } from '../../theme';
import { gameArtUrl } from './art';

/** Steam header art is 460×215. */
const ASPECT = 460 / 215;

/**
 * Game artwork as a small wide capsule. Falls back to the game's emoji when there is
 * no artwork or it fails to load.
 */
export function GameLogo({ game, height = 28 }: { game: Game | undefined; height?: number }) {
  const s = useStyles();
  const url = gameArtUrl(game);
  const [failed, setFailed] = useState<string | null>(null);
  const box = { height, width: Math.round(height * ASPECT) };

  if (!url || failed === url) {
    return (
      <View style={[s.box, box]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={{ fontSize: height * 0.6, lineHeight: height * 0.9 }}>{game?.emoji ?? '🎮'}</Text>
      </View>
    );
  }
  return (
    <Image
      source={url}
      style={[s.box, box]}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      recyclingKey={url}
      onError={() => setFailed(url)}
      accessible={false}
    />
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    box: {
      borderRadius: Math.min(t.radius.sm, 6),
      backgroundColor: t.colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
  }),
);
