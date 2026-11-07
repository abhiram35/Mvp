import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button, EmptyState, Screen, Text, TextField } from '../../components/ui';
import { Checkbox } from '../../features/profile/Checkbox';
import { AuthHero } from '../../features/profile/AuthHero';
import { showCommunityGuidelines, showTerms } from '../../features/safety/guidelines';
import { errorMessage, supabase } from '../../lib/supabase';
import { makeStyles, spacing, useTheme } from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

type Errors = Partial<Record<'email' | 'password' | 'confirm' | 'age' | 'terms' | 'form', string>>;

export default function SignUpScreen() {
  const t = useTheme();
  const styles = useStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const signUp = async () => {
    const e: Errors = {};
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email';
    if (password.length < MIN_PASSWORD) e.password = `At least ${MIN_PASSWORD} characters`;
    if (confirm !== password) e.confirm = "Passwords don't match";
    if (!ageOk) e.age = 'Please confirm your age';
    if (!termsOk) e.terms = 'You need to accept to continue';
    setErrors(e);
    if (Object.keys(e).length) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setErrors({ form: errorMessage(error) });
      return;
    }
    // With email confirmation enabled Supabase returns a user but no session.
    // With a session the root layout guard moves us to onboarding automatically.
    if (!data.session) setSentTo(email.trim());
  };

  if (sentTo) {
    return (
      <Screen>
        <EmptyState
          icon="mail-unread-outline"
          title="Check your email"
          message={`We sent a confirmation link to ${sentTo}. Tap it, then come back and sign in.`}
          action={<Button title="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/sign-in'))}
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={24} color={t.colors.text} />
        </Pressable>

        <AuthHero />
        <Text variant="heading" style={{ marginBottom: spacing.lg }}>Create your player card</Text>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
          error={errors.email}
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder={`At least ${MIN_PASSWORD} characters`}
          error={errors.password}
        />
        <TextField
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="Type it again"
          error={errors.confirm}
        />

        <Checkbox
          checked={ageOk}
          onChange={setAgeOk}
          label="I am 18+, or 13–17 with a parent's permission"
          accessibilityLabel="I am 18 or older, or 13 to 17 with a parent's permission"
          error={errors.age}
        />
        <Checkbox
          checked={termsOk}
          onChange={setTermsOk}
          accessibilityLabel="I accept the Terms and Community Guidelines"
          error={errors.terms}
          label={
            <Text>
              I accept the{' '}
              <Text style={styles.link} onPress={showTerms} accessibilityRole="link">Terms</Text> and{' '}
              <Text style={styles.link} onPress={showCommunityGuidelines} accessibilityRole="link">Community Guidelines</Text>
            </Text>
          }
        />

        {errors.form ? <Text style={styles.formError} accessibilityLiveRegion="polite">{errors.form}</Text> : null}

        <Button title="Create account" icon="rocket-outline" onPress={signUp} loading={loading} style={{ marginTop: spacing.md }} />

        <View style={styles.footer}>
          <Text muted>Already have a player card? </Text>
          <Pressable
            onPress={() => router.replace('/(auth)/sign-in')}
            accessibilityRole="link"
            accessibilityLabel="Already have a player card? Sign in"
            hitSlop={12}
            style={styles.linkTarget}
          >
            <Text variant="strong" style={{ color: t.colors.primary }}>Sign in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    back: { width: 44, height: 44, justifyContent: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
    link: { color: t.colors.primary, fontFamily: t.fonts.bodyBold },
    formError: { color: t.colors.danger, marginVertical: spacing.md, textAlign: 'center' },
    footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl },
    linkTarget: { minHeight: 44, justifyContent: 'center' },
  }),
);
