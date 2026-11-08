import { useEffect, useRef, useState } from 'react';

/** Current time in ms, re-read every `intervalMs` so "12m ago" style labels stay accurate. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * A ref that always holds the latest `value`, for callbacks that must not change identity
 * (focus listeners, timers). Updated after commit; read it only inside callbacks/effects.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
