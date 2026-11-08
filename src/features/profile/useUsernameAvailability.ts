import { useEffect, useState } from 'react';
import { checkUsernameAvailable } from './api';
import { USERNAME_RE } from './form';

export type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

/**
 * Debounced `is_username_available` check.
 * `current` is the user's existing username (edit profile) which always counts as available.
 */
export function useUsernameAvailability(username: string, current?: string | null, delayMs = 450): UsernameStatus {
  // Result of the last server check, remembered with the name it was for.
  const [checked, setChecked] = useState<{ username: string; status: 'available' | 'taken' | 'error' } | null>(null);
  const needsCheck = !!username && USERNAME_RE.test(username) && !(current && username === current);

  useEffect(() => {
    if (!needsCheck) return;
    let active = true;
    const t = setTimeout(() => {
      checkUsernameAvailable(username)
        .then((ok) => {
          if (active) setChecked({ username, status: ok ? 'available' : 'taken' });
        })
        .catch(() => {
          if (active) setChecked({ username, status: 'error' });
        });
    }, delayMs);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [username, needsCheck, delayMs]);

  if (!username) return 'idle';
  if (!USERNAME_RE.test(username)) return 'invalid';
  if (current && username === current) return 'available';
  return checked && checked.username === username ? checked.status : 'checking';
}
