import { View, StyleSheet } from 'react-native';
import { Avatar, Chip, ChipRow, Text } from '../../components/ui';
import { PLAY_STYLE_LABELS, PLAY_TIME_LABELS, REGION_LABELS, type Profile } from '../../lib/types';
import { spacing } from '../../theme';

export function ProfileHeader({ profile }: { profile: Profile }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Avatar uri={profile.avatar_url} name={profile.display_name} size={84} />
        <View style={styles.names}>
          <Text variant="title" numberOfLines={1}>{profile.display_name}</Text>
          <Text muted>@{profile.username}</Text>
        </View>
      </View>

      {profile.bio ? <Text style={{ marginTop: spacing.lg }}>{profile.bio}</Text> : null}

      <View style={{ marginTop: spacing.lg }}>
        <ChipRow>
          <Chip icon="location-outline" label={REGION_LABELS[profile.region]} />
          <Chip icon="trophy-outline" label={PLAY_STYLE_LABELS[profile.play_style]} />
          <Chip icon={profile.has_mic ? 'mic-outline' : 'mic-off-outline'} label={profile.has_mic ? 'Mic on' : 'No mic'} />
          {profile.languages.map((l) => (
            <Chip key={l} icon="language-outline" label={l} />
          ))}
          {profile.play_times.map((t) => (
            <Chip key={t} icon="time-outline" label={PLAY_TIME_LABELS[t]} />
          ))}
        </ChipRow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center' },
  names: { marginLeft: spacing.lg, flex: 1 },
});
