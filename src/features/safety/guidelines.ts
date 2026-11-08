import { Alert } from 'react-native';

export const COMMUNITY_GUIDELINES = [
  '• Respect every player. No harassment, bullying, threats or slurs.',
  '• No hate speech about race, religion, caste, gender, sexuality, region or disability.',
  '• No cheating, hacks, account selling or scams.',
  '• No spam, sexual content or sharing anyone’s personal info.',
  '• Keep it about the game. Losing is fine — raging at teammates isn’t.',
  '',
  'Report anything that breaks these rules. Block anyone you don’t want to hear from. Accounts that break the rules can be suspended or removed.',
].join('\n');

export const TERMS_SUMMARY =
  'Placeholder Terms of Service. You must be 18+, or 13–17 with a parent’s permission, to use Vinq. You are responsible for what you post. We may remove content or accounts that break the Community Guidelines.';

export function showCommunityGuidelines() {
  Alert.alert('Community guidelines', COMMUNITY_GUIDELINES);
}

export function showTerms() {
  Alert.alert('Terms of Service', TERMS_SUMMARY);
}
