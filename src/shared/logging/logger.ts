type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Structured logger — never accept free-form payloads that may contain PII/PHI.
 * Callers must pass redacted context only (ids, codes, counts).
 */
class Logger {
  private crashHook: ((error: Error, context?: LogContext) => void) | null = null;

  setCrashReportingHook(hook: (error: Error, context?: LogContext) => void): void {
    this.crashHook = hook;
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    const err =
      error instanceof Error ? error : error != null ? new Error(String(error)) : undefined;
    this.write('error', message, {
      ...context,
      errorName: err?.name,
      errorMessage: err?.message,
    });
    if (err && this.crashHook) {
      this.crashHook(err, context);
    }
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    const entry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    }
  }
}

export const logger = new Logger();
