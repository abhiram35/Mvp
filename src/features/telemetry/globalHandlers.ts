// Global JS error + unhandled promise rejection capture → reportError().
import { Platform } from 'react-native';
import { reportError } from './reportError';

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  setGlobalHandler: (cb: GlobalHandler) => void;
  getGlobalHandler: () => GlobalHandler;
}
/** Hermes exposes this at runtime; RN's types only declare `HermesInternal: null | {}` (see
 *  react-native/Libraries/Core/polyfillPromise.js, which calls it the same way in dev). */
interface HermesRejectionTracker {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
}

let installed = false;

/**
 * Wraps ErrorUtils' global handler (the previous handler still runs, so red box / native crash
 * behaviour is unchanged) and captures unhandled promise rejections where the runtime supports it:
 * Hermes `HermesInternal.enablePromiseRejectionTracker`, or `unhandledrejection` on web.
 * Idempotent: safe to call more than once. Call it once at module load of the root layout.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as {
    ErrorUtils?: ErrorUtilsLike;
    HermesInternal?: (HermesRejectionTracker & object) | null;
    addEventListener?: (type: string, listener: (event: { reason?: unknown }) => void) => void;
  };

  // 1. Uncaught JS errors.
  try {
    const eu = g.ErrorUtils;
    if (eu && typeof eu.setGlobalHandler === 'function') {
      const previous = typeof eu.getGlobalHandler === 'function' ? eu.getGlobalHandler() : undefined;
      eu.setGlobalHandler((error, isFatal) => {
        reportError(error, { context: { source: 'global_handler' }, isFatal: !!isFatal });
        if (previous) previous(error, isFatal);
      });
    }
  } catch {
    // ignore: never break startup over telemetry
  }

  // 2. Unhandled promise rejections.
  try {
    const hermes = g.HermesInternal;
    if (hermes && typeof hermes.enablePromiseRejectionTracker === 'function') {
      // Note: in __DEV__ this replaces React Native's own tracker (which shows a LogBox entry);
      // we keep a console.warn so developers still see the rejection.
      hermes.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: (id, rejection) => {
          reportError(rejection ?? `Unhandled promise rejection (id: ${id})`, {
            context: { source: 'unhandled_rejection' },
            isFatal: false,
          });
          if (__DEV__) console.warn(`Possible unhandled promise rejection (id: ${id}):`, rejection);
        },
        onHandled: () => undefined,
      });
    } else if (Platform.OS === 'web' && typeof g.addEventListener === 'function') {
      g.addEventListener('unhandledrejection', (event) => {
        reportError(event?.reason ?? 'Unhandled promise rejection', { context: { source: 'unhandled_rejection' }, isFatal: false });
      });
    }
  } catch {
    // ignore
  }
}
