import {logger} from '@shared/logging/logger';

/**
 * Crash reporting hook (Sentry-compatible shape).
 * Wire a real Sentry SDK here when ENABLE_CRASH_REPORTING=true — never send PHI/PII.
 */
export function initCrashReporting(enabled: boolean): void {
  if (!enabled) {
    return;
  }
  logger.setCrashReportingHook((error, context) => {
    // Placeholder integration point — replace with Sentry.captureException(error, {extra: context})
    logger.warn('Crash reporting hook invoked', {
      errorName: error.name,
      ...context,
    });
  });
}
