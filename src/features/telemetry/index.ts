// Telemetry: crash reports (app_errors) and product events (app_events). No third-party services.
export { reportError, appVersion, type ReportErrorOptions } from './reportError';
export { installGlobalErrorHandlers } from './globalHandlers';
export { GGErrorBoundary } from './GGErrorBoundary';
export { logEvent, logOnboardingCompleted, logThemeChanged, useAppOpenTracking } from './events';
