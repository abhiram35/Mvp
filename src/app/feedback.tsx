import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, ChipRow, Screen, Text, TextField } from '../components/ui';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX,
  sendFeedback,
  validateFeedback,
  type FeedbackCategory,
} from '../features/feedback/api';
import { openDiscord } from '../lib/links';
import { useUserId } from '../providers/AuthProvider';
import { makeStyles, spacing } from '../theme';

export default function FeedbackScreen() {
  const s = useStyles();
  const userId = useUserId();
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const current = FEEDBACK_CATEGORIES.find((c) => c.value === category) ?? FEEDBACK_CATEGORIES[0];
  const fieldError = touched ? validateFeedback(message) : null;

  const submit = async () => {
    setTouched(true);
    if (validateFeedback(message)) return;
    setSending(true);
    setError(null);
    try {
      await sendFeedback(userId, category, message);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your feedback. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Screen scroll edges={[]}>
        <View style={s.done}>
          <Text variant="title" accessibilityRole="header">Thanks!</Text>
          <Text muted style={s.doneBody}>
            We read every message. Want to chat about it, or see what others are suggesting? Join the Vinq Discord.
          </Text>
          <Button title="Join our Discord" icon="logo-discord" onPress={() => void openDiscord()} />
          <Button
            title="Send more feedback"
            variant="secondary"
            onPress={() => {
              setMessage('');
              setTouched(false);
              setSent(false);
            }}
          />
          <Button title="Done" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll edges={[]}>
      <Text muted style={s.intro}>
        Ideas, bugs, anything. It goes straight to the Vinq team. We also add your app version and phone type so we can
        fix bugs faster.
      </Text>

      <Text variant="label" style={s.label}>What is it about?</Text>
      <ChipRow>
        {FEEDBACK_CATEGORIES.map((c) => (
          <Chip key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />
        ))}
      </ChipRow>

      <View style={s.field}>
        <TextField
          label="Your message"
          value={message}
          onChangeText={setMessage}
          onBlur={() => setTouched(true)}
          placeholder={current.placeholder}
          multiline
          maxLength={FEEDBACK_MAX}
          error={fieldError}
          hint={`${message.length} / ${FEEDBACK_MAX}`}
        />
      </View>

      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button title="Send feedback" icon="send" loading={sending} onPress={() => void submit()} />

      <View style={s.discord}>
        <Text muted>Prefer to talk it through?</Text>
        <Button title="Join our Discord" icon="logo-discord" variant="secondary" size="sm" onPress={() => void openDiscord()} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    intro: { marginTop: spacing.lg, marginBottom: spacing.xl },
    label: { marginBottom: spacing.sm },
    field: { marginTop: spacing.lg },
    error: { color: t.colors.danger, marginBottom: spacing.md },
    discord: { marginTop: spacing.xxl, gap: spacing.sm, alignItems: 'flex-start' },
    done: { marginTop: spacing.xxl, gap: spacing.md },
    doneBody: { marginBottom: spacing.md },
  }),
);
