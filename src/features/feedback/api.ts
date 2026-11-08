import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { appVersion } from '../telemetry';

export type FeedbackCategory = 'idea' | 'bug' | 'other';

export const FEEDBACK_MIN = 3;
export const FEEDBACK_MAX = 2000;

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string; placeholder: string }[] = [
  { value: 'idea', label: 'Idea', placeholder: 'What would make Vinq better for you?' },
  { value: 'bug', label: 'Bug', placeholder: 'What happened, and what did you expect? Which screen were you on?' },
  { value: 'other', label: 'Other', placeholder: 'Tell us anything.' },
];

/** null when valid, else a short message to show under the field. */
export function validateFeedback(message: string): string | null {
  const len = message.trim().length;
  if (len < FEEDBACK_MIN) return 'Write a little more so we know what you mean.';
  if (message.length > FEEDBACK_MAX) return `Keep it under ${FEEDBACK_MAX} characters.`;
  return null;
}

/** Sends feedback for the signed-in player. Throws an Error with friendly copy on failure. */
export async function sendFeedback(userId: string, category: FeedbackCategory, message: string): Promise<void> {
  const invalid = validateFeedback(message);
  if (invalid) throw new Error(invalid);
  const { error } = await supabase.from('feedback').insert({
    profile_id: userId,
    category,
    message: message.trim(),
    app_version: appVersion(),
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
  });
  if (error) {
    if (error.code === 'P0001') throw new Error(error.message); // daily limit, already friendly
    throw new Error("Couldn't send your feedback. Check your connection and try again.");
  }
}
