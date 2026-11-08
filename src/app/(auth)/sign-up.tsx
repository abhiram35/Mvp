import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button, Screen, Text, TextField } from '../../components/ui';
import { Checkbox } from '../../features/profile/Checkbox';
import { AuthHero } from '../../features/profile/AuthHero';
import { showCommunityGuidelines, showTerms } from '../../features/safety/guidelines';
import { errorMessage, supabase } from '../../lib/supabase';
import { makeStyles, spacing, useTheme } from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
/** Supabase sends 6 digits by default; projects can configure up to 10. */
const CODE_RE = /^\d{6,10}$/;
const RESEND_COOLDOWN_S = 60;

/** Supabase auth errors → short, friendly copy. */
function friendlyAuthError(err: unknown): string {
  const raw = errorMessage(err);
  const msg = raw.toLowerCase();
  if (msg.includes('token') || msg.includes('expired') || msg.includes('otp')) {
    return 'That code is wrong or has expired. Check the latest email, or send a new code.';
  }
  if (msg.includes('rate limit') || msg.includes('security purposes') || msg.includes('too many')) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (msg.includes('network') || msg.includes('fetch')) return 'Check your connection and try again.';
  return raw;
}

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
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

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
    if (!data.session) {
      setSentTo(email.trim());
      setCooldown(RESEND_COOLDOWN_S);
    }
  };

  const verifyCode = async () => {
    if (!sentTo) return;
    const token = code.replace(/\s/g, '');
    if (!CODE_RE.test(token)) {
      setCodeError('Enter the 6-digit code from the email');
      return;
    }
    setCodeError(null);
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token, type: 'email' });
    setVerifying(false);
    // On success we're signed in and the root layout guard moves us to onboarding.
    if (error) setCodeError(friendlyAuthError(error));
  };

  const resendCode = async () => {
    if (!sentTo || cooldown > 0) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: sentTo });
    setResending(false);
    if (error) {
      setCodeError(friendlyAuthError(error));
      return;
    }
    setCooldown(RESEND_COOLDOWN_S);
    Alert.alert('Code sent', `We sent a new code to ${sentTo}.`);
  };

  if (sentTo) {
    const resendDisabled = cooldown > 0 || resending;
    return (
      <Screen scroll>
        <View>
          <View style={styles.codeTop}>
            <Ionicons name="mail-unread-outline" size={44} color={t.colors.textFaint} />
          </View>
          <Text variant="heading" accessibilityRole="header" style={{ marginBottom: spacing.sm }}>Enter the 6-digit code we emailed you</Text>
          <Text muted style={{ marginBottom: spacing.xl }}>Sent to {sentTo}. It can take a minute to arrive; check spam too.</Text>
          <TextField
            label="6-digit code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={10}
            placeholder="123456"
            error={codeError}
            onSubmitEditing={verifyCode}
            returnKeyType="go"
          />
          <Button title="Verify" icon="checkmark-circle-outline" onPress={verifyCode} loading={verifying} />
          <Pressable
            onPress={resendCode}
            disabled={resendDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: resendDisabled }}
            accessibilityLabel={cooldown > 0 ? `Resend code available in ${cooldown} seconds` : 'Resend code'}
            hitSlop={8}
            style={[styles.linkTarget, { alignSelf: 'center', marginTop: spacing.lg }]}
          >
            <Text variant="strong" style={{ color: resendDisabled ? t.colors.textFaint : t.colors.primary }}>
              {resending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </Pressable>
          <Text muted style={{ textAlign: 'center', marginTop: spacing.md }}>Or tap the link in the email, then sign in.</Text>
          <Button
            title="Back to sign in"
            variant="secondary"
            onPress={() => router.replace('/(auth)/sign-in')}
            style={{ marginTop: spacing.xl }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View>
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
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    codeTop: { paddingTop: spacing.xxl, marginBottom: spacing.md },
    back: { width: 44, height: 44, justifyContent: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
    link: { color: t.colors.primary, fontFamily: t.fonts.bodyBold },
    formError: { color: t.colors.danger, marginVertical: spacing.md, textAlign: 'center' },
    footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl },
    linkTarget: { minHeight: 44, justifyContent: 'center' },
  }),
);
