import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Divider, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import { updateProfile } from '../../features/profile/api';
import {
  formFromProfile,
  hasErrors,
  validateAbout,
  validateGames,
  validateIdentity,
  validatePrefs,
  type FieldErrors,
  type ProfileFormValues,
} from '../../features/profile/form';
import { AboutFields, GamesFields, IdentityFields, PrefsFields } from '../../features/profile/ProfileFormFields';
import { useProfile } from '../../features/profile/useProfile';
import { useUsernameAvailability } from '../../features/profile/useUsernameAvailability';
import { errorMessage } from '../../lib/supabase';
import { useAuth, useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing } from '../../theme';

export default function EditProfileScreen() {
  const styles = useStyles();
  const userId = useUserId();
  const { refreshProfile } = useAuth();
  const { profile, games, loading, error, reload } = useProfile(userId);
  const [values, setValues] = useState<ProfileFormValues | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const usernameStatus = useUsernameAvailability(values?.username ?? '', profile?.username);

  // Seed the form once the profile has loaded (state adjusted during render, not in an effect).
  if (profile && !values) setValues(formFromProfile(profile, games));

  if (loading && !values) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  if (error && !values) {
    return (
      <Screen edges={[]}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }
  if (!values) {
    return (
      <Screen edges={[]}>
        <ErrorState message="We couldn't find your profile." onRetry={reload} />
      </Screen>
    );
  }

  const patch = (p: Partial<ProfileFormValues>) => setValues((v) => (v ? { ...v, ...p } : v));

  const save = async () => {
    const e: FieldErrors = {
      ...validateIdentity(values),
      ...validatePrefs(values),
      ...validateGames(values.games),
      ...validateAbout(values),
    };
    if (!e.username) {
      if (usernameStatus === 'taken') e.username = 'That username is taken';
      else if (usernameStatus === 'checking') e.username = 'Still checking username…';
      else if (usernameStatus === 'error') e.username = "Couldn't check username. Try again.";
    }
    setErrors(e);
    if (hasErrors(e)) {
      setSubmitError('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      await updateProfile(userId, values);
      await refreshProfile();
      router.back();
    } catch (err) {
      setSubmitError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <Text variant="heading" style={styles.section}>Gamer tag</Text>
      <IdentityFields values={values} onChange={patch} errors={errors} usernameStatus={usernameStatus} />
      <Divider />
      <Text variant="heading" style={styles.section}>How you play</Text>
      <PrefsFields values={values} onChange={patch} errors={errors} />
      <Divider />
      <Text variant="heading" style={styles.section}>Games</Text>
      <GamesFields games={values.games} onChange={(g) => patch({ games: g })} errors={errors} />
      <Divider />
      <Text variant="heading" style={styles.section}>About you</Text>
      <AboutFields values={values} onChange={patch} errors={errors} displayName={values.display_name} />

      {submitError ? <Text style={styles.submitError} accessibilityLiveRegion="polite">{submitError}</Text> : null}
      <Button title="Save changes" icon="checkmark" onPress={save} loading={saving} />
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    section: { marginTop: spacing.lg, marginBottom: spacing.md },
    submitError: { color: t.colors.danger, textAlign: 'center', marginBottom: spacing.md },
  }),
);
