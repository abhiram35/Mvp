import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button, Screen, Text, TextField } from '../../components/ui';
import { AuthHero } from '../../features/profile/AuthHero';
import { errorMessage, supabase } from '../../lib/supabase';
import { makeStyles, spacing, useTheme } from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const t = useTheme();
  const styles = useStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

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

  // Reset by 6-digit code (no deep links needed). Pre-fills the email if one is typed.
  const forgotPassword = () => {
    const trimmed = email.trim();
    router.push({ pathname: '/(auth)/reset-password', params: EMAIL_RE.test(trimmed) ? { email: trimmed } : {} });
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.hero}>
          <AuthHero />
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
          accessibilityRole="button"
          accessibilityLabel="Forgot password? Reset it with a code"
          style={styles.forgot}
          hitSlop={8}
        >
          <Text variant="strong" style={{ color: t.colors.primary }}>Forgot password?</Text>
        </Pressable>

        {errors.form ? (
          <Text style={styles.formError} accessibilityLiveRegion="polite">{errors.form}</Text>
        ) : null}

        <Button title="Sign in" icon="log-in-outline" onPress={signIn} loading={loading} />

        <View style={styles.footer}>
          <Text muted>New to GG? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable accessibilityRole="link" accessibilityLabel="New to GG? Create your player card" hitSlop={12} style={styles.linkTarget}>
              <Text variant="strong" style={{ color: t.colors.primary }}>Create your player card</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
  hero: { paddingTop: spacing.xxl * 1.5 },
  forgot: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: -spacing.sm, marginBottom: spacing.md },
  formError: { color: t.colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl },
  linkTarget: { minHeight: 44, justifyContent: 'center' },
  }),
);
