import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button, Screen, Text, TextField } from '../../components/ui';
import { Wordmark } from '../../features/profile/Wordmark';
import { errorMessage, supabase } from '../../lib/supabase';
import { colors, font, spacing } from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const signIn = async () => {
    const e: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email';
    if (!password) e.password = 'Enter your password';
    setErrors(e);
    if (e.email || e.password) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    // On success the root layout guard moves us to onboarding or the app.
    if (error) setErrors({ form: errorMessage(error) });
  };

  const forgotPassword = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setErrors({ email: 'Enter your email above, then tap "Forgot password?"' });
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
    setResetting(false);
    if (error) Alert.alert("Couldn't send reset email", errorMessage(error));
    else Alert.alert('Check your email', `If an account exists for ${trimmed}, we sent a link to reset your password.`);
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.hero}>
          <Wordmark />
        </View>

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
          autoComplete="current-password"
          textContentType="password"
          placeholder="Your password"
          error={errors.password}
          onSubmitEditing={signIn}
          returnKeyType="go"
        />

        <Pressable
          onPress={forgotPassword}
          disabled={resetting}
          accessibilityRole="button"
          accessibilityLabel="Forgot password? Send a reset email"
          style={styles.forgot}
          hitSlop={8}
        >
          <Text style={{ color: colors.primary }}>{resetting ? 'Sending…' : 'Forgot password?'}</Text>
        </Pressable>

        {errors.form ? (
          <Text style={styles.formError} accessibilityLiveRegion="polite">{errors.form}</Text>
        ) : null}

        <Button title="Sign in" icon="log-in-outline" onPress={signIn} loading={loading} />

        <View style={styles.footer}>
          <Text muted>New to GG? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable accessibilityRole="link" accessibilityLabel="Create an account" hitSlop={12} style={styles.linkTarget}>
              <Text style={{ color: colors.primary, fontWeight: font.weight.semibold }}>Create an account</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: spacing.xxl * 2 },
  forgot: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: -spacing.sm, marginBottom: spacing.md },
  formError: { color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl },
  linkTarget: { minHeight: 44, justifyContent: 'center' },
});
