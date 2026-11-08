import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button, Screen, Text, TextField } from '../../components/ui';
import { errorMessage, supabase } from '../../lib/supabase';
import { makeStyles, spacing, useTheme } from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Supabase sends 6 digits by default; projects can configure up to 10. */
const CODE_RE = /^\d{6,10}$/;
const MIN_PASSWORD = 8;
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
  if (msg.includes('different from the old password')) return 'Pick a password you haven\'t used on Vinq before.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Check your connection and try again.';
  return raw;
}

type Errors = Partial<Record<'email' | 'code' | 'password' | 'confirm' | 'form', string>>;

export default function ResetPasswordScreen() {
  const t = useTheme();
  const s = useStyles();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const sendCode = async (to: string) => {
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(to);
    setSending(false);
    if (error) {
      setErrors({ form: friendlyAuthError(error) });
      return false;
    }
    setErrors({});
    setCooldown(RESEND_COOLDOWN_S);
    return true;
  };

  const submitEmail = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setErrors({ email: 'Enter a valid email' });
      return;
    }
    if (await sendCode(trimmed)) setSentTo(trimmed);
  };

  const resend = async () => {
    if (!sentTo || cooldown > 0) return;
    if (await sendCode(sentTo)) Alert.alert('Code sent', `We sent a new code to ${sentTo}.`);
  };

  const submitNewPassword = async () => {
    if (!sentTo) return;
    const token = code.replace(/\s/g, '');
    const e: Errors = {};
    if (!CODE_RE.test(token)) e.code = 'Enter the 6-digit code from the email';
    if (password.length < MIN_PASSWORD) e.password = `At least ${MIN_PASSWORD} characters`;
    if (confirm !== password) e.confirm = "Passwords don't match";
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    // verifyOtp signs the player in (the root guard will then leave this screen), so set the
    // new password straight after, before anything navigates.
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: sentTo, token, type: 'recovery' });
    if (verifyError) {
      setSaving(false);
      setErrors({ code: friendlyAuthError(verifyError) });
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      // We may already have left this screen (signed in), so use an alert.
      Alert.alert(
        "Couldn't set your new password",
        `${friendlyAuthError(updateError)} You're signed in with the code; use "Forgot password?" again later to set a new one.`,
      );
      return;
    }
    Alert.alert('Password updated', "You're signed in. Use your new password next time.");
  };

  return (
    <Screen scroll edges={['bottom']}>
      <View style={s.wrap}>
        {!sentTo ? (
          <>
            <Text variant="heading" style={s.title}>Forgot your password?</Text>
            <Text muted style={s.lead}>{"Enter the email you signed up with. We'll send you a 6-digit code."}</Text>
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
              onSubmitEditing={submitEmail}
              returnKeyType="send"
            />
            {errors.form ? <Text style={s.formError} accessibilityLiveRegion="polite">{errors.form}</Text> : null}
            <Button title="Send code" icon="mail-outline" onPress={submitEmail} loading={sending} />
          </>
        ) : (
          <>
            <Text variant="heading" style={s.title}>Enter your code</Text>
            <Text muted style={s.lead}>
              If an account exists for {sentTo}, we emailed a 6-digit code. Enter it with your new password.
            </Text>
            <TextField
              label="6-digit code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={10}
              placeholder="123456"
              error={errors.code}
            />
            <TextField
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder={`At least ${MIN_PASSWORD} characters`}
              error={errors.password}
            />
            <TextField
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="Type it again"
              error={errors.confirm}
              onSubmitEditing={submitNewPassword}
              returnKeyType="go"
            />
            {errors.form ? <Text style={s.formError} accessibilityLiveRegion="polite">{errors.form}</Text> : null}
            <Button title="Set new password" icon="key-outline" onPress={submitNewPassword} loading={saving} />

            <View style={s.row}>
              <Pressable
                onPress={resend}
                disabled={cooldown > 0 || sending}
                accessibilityRole="button"
                accessibilityState={{ disabled: cooldown > 0 || sending }}
                accessibilityLabel={cooldown > 0 ? `Resend code available in ${cooldown} seconds` : 'Resend code'}
                hitSlop={8}
                style={s.linkTarget}
              >
                <Text variant="strong" style={{ color: cooldown > 0 || sending ? t.colors.textFaint : t.colors.primary }}>
                  {sending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSentTo(null);
                  setCode('');
                  setErrors({});
                }}
                accessibilityRole="button"
                accessibilityLabel="Use a different email"
                hitSlop={8}
                style={s.linkTarget}
              >
                <Text variant="strong" style={{ color: t.colors.primary }}>Different email</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    wrap: { paddingTop: spacing.lg },
    title: { marginBottom: spacing.sm },
    lead: { marginBottom: spacing.xl },
    formError: { color: t.colors.danger, marginBottom: spacing.md, textAlign: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: spacing.lg },
    linkTarget: { minHeight: 44, justifyContent: 'center' },
  }),
);
