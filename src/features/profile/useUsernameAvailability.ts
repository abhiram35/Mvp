import { useEffect, useState } from 'react';
import { checkUsernameAvailable } from './api';
import { USERNAME_RE } from './form';

export type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

/**
 * Debounced `is_username_available` check.
 * `current` is the user's existing username (edit profile) which always counts as available.
 */
export function useUsernameAvailability(username: string, current?: string | null, delayMs = 450): UsernameStatus {
  const [status, setStatus] = useState<UsernameStatus>('idle');

  useEffect(() => {
    if (!username) {
      setStatus('idle');
      return;
    }
    if (!USERNAME_RE.test(username)) {
      setStatus('invalid');
      return;
    }
    if (current && username === current) {
      setStatus('available');
      return;
    }
    setStatus('checking');
    let active = true;
    const t = setTimeout(() => {
      checkUsernameAvailable(username)
        .then((ok) => active && setStatus(ok ? 'available' : 'taken'))
        .catch(() => active && setStatus('error'));
    }, delayMs);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [username, current, delayMs]);

  return status;
}
