import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, SegmentBar, Text } from '../components/ui';
import { createProfile } from '../features/profile/api';
import { logOnboardingCompleted } from '../features/telemetry';
import {
  emptyForm,
  hasErrors,
  validateAbout,
  validateGames,
  validateIdentity,
  validatePrefs,
  type FieldErrors,
  type ProfileFormValues,
} from '../features/profile/form';
import { AboutFields, GamesFields, IdentityFields, PrefsFields } from '../features/profile/ProfileFormFields';
import { ThemePickerList } from '../features/profile/ThemeOptionCard';
import { useUsernameAvailability } from '../features/profile/useUsernameAvailability';
import { errorMessage } from '../lib/supabase';
import { useAuth, useUserId } from '../providers/AuthProvider';
import { makeStyles, spacing, useTheme, useThemeSwitcher } from '../theme';

const stepsFor = (squad: string) =>
  [
    { title: 'Pick your gamer tag', subtitle: `This is how ${squad}mates find you.` },
    { title: 'How do you play?', subtitle: `We use this to match you with the right ${squad}.` },
    { title: 'Your games', subtitle: 'Pick what you play. Rank and role are optional.' },
    { title: 'Finishing touches', subtitle: 'A photo and a short bio help people say yes.' },
    { title: 'Pick your look', subtitle: 'Optional. Change it any time in Profile → Theme.' },
  ] as const;
const STEP_COUNT = 5;
/** Index of the optional theme step (no validation; it never blocks sign-up). */
const THEME_STEP = 4;

export default function OnboardingScreen() {
  const t = useTheme();
  const styles = useStyles();
  const { themeId, setThemeId } = useThemeSwitcher();
  const STEPS = stepsFor(t.words.squad);
  const userId = useUserId();
  const { refreshProfile, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<ProfileFormValues>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const usernameStatus = useUsernameAvailability(values.username);

  const patch = (p: Partial<ProfileFormValues>) => setValues((v) => ({ ...v, ...p }));

  const validateStep = (i: number): FieldErrors => {
    switch (i) {
      case 0: {
        const e = validateIdentity(values);
        if (!e.username) {
          if (usernameStatus === 'taken') e.username = 'That username is taken';
          else if (usernameStatus === 'checking') e.username = 'Still checking username…';
          else if (usernameStatus === 'error') e.username = "Couldn't check username. Try again.";
        }
        return e;
      }
      case 1:
        return validatePrefs(values);
      case 2:
        return validateGames(values.games);
      case 3:
        return validateAbout(values);
      default:
        return {};
    }
  };

  const next = async () => {
    const e = validateStep(step);
    setErrors(e);
    if (hasErrors(e)) return;
    if (step === STEP_COUNT - 1) {
      // Re-check every data step before creating the profile (the theme step has no data).
      for (let i = 0; i < THEME_STEP; i++) {
        const stepErrors = validateStep(i);
        if (hasErrors(stepErrors)) {
          setErrors(stepErrors);
          setStep(i);
          return;
        }
      }
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      await createProfile(userId, values);
      logOnboardingCompleted();
      await refreshProfile(); // root layout guard now moves us into the app
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      // If the profile refresh failed we stay here; let the user tap again
      // (createProfile falls back to an update when the row already exists).
      setSaving(false);
    }
  };

  const back = () => {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text variant="caption" accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
          Step {step + 1} / {STEPS.length}
        </Text>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: STEPS.length, now: step + 1 }}
        >
          <SegmentBar filled={step + 1} total={STEPS.length} height={6} />
        </View>
        <Text variant="title" style={{ marginTop: spacing.lg }}>{current.title}</Text>
        <Text muted style={{ marginTop: spacing.xs }}>{current.subtitle}</Text>
      </View>

      {step === 0 ? (
        <IdentityFields values={values} onChange={patch} errors={errors} usernameStatus={usernameStatus} />
      ) : step === 1 ? (
        <PrefsFields values={values} onChange={patch} errors={errors} />
      ) : step === 2 ? (
        <GamesFields games={values.games} onChange={(games) => patch({ games })} errors={errors} />
      ) : step === 3 ? (
        <AboutFields values={values} onChange={patch} errors={errors} displayName={values.display_name} />
      ) : (
        <ThemePickerList themeId={themeId} onSelect={setThemeId} />
      )}

      {submitError ? (
        <Text style={styles.submitError} accessibilityLiveRegion="polite">{submitError}</Text>
      ) : null}

      <View style={styles.actions}>
        {step > 0 ? (
          <Button title="Back" variant="secondary" onPress={back} disabled={saving} style={{ flex: 1 }} />
        ) : null}
        <Button
          title={isLast ? "Let's go" : 'Next'}
          icon={isLast ? 'rocket-outline' : undefined}
          onPress={next}
          loading={saving}
          style={{ flex: 2 }}
        />
      </View>

      {step === 0 ? (
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} style={{ marginTop: spacing.md }} />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    header: { paddingTop: spacing.xl, marginBottom: spacing.xl },
    track: { marginTop: spacing.sm },
    submitError: { color: t.colors.danger, textAlign: 'center', marginBottom: spacing.md },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  }),
);
