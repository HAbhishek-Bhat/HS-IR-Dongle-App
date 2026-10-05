export type AppErrorCode =
  | 'PERMISSION_DENIED'
  | 'DONGLE_REMOVED'
  | 'UNSUPPORTED_DONGLE'
  | 'READ_TIMEOUT'
  | 'CORRUPTED_FRAME'
  | 'STORAGE_FULL'
  | 'STORAGE_ERROR'
  | 'NO_NETWORK'
  | 'AUTH_EXPIRED'
  | 'SYNC_FAILED'
  | 'NOT_CONNECTED'
  | 'RECEIVE_PROTOCOL_UNVERIFIED'
  | 'USB_OPERATION_FAILED'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(code: AppErrorCode, message: string, userMessage: string, retryable = false) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = retryable;
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }
  if (error instanceof Error && error.message) {
    return 'Something went wrong. Please try again.';
  }
  return 'Unexpected error. Please try again.';
}

export const ErrorMessages: Record<AppErrorCode, string> = {
  PERMISSION_DENIED: 'USB permission was denied. Grant access to use the IR dongle.',
  DONGLE_REMOVED: 'IR dongle was disconnected. Partial data has been saved.',
  UNSUPPORTED_DONGLE: 'This USB device is not a supported IR dongle.',
  READ_TIMEOUT: 'No IR data received. Check alignment and try again.',
  CORRUPTED_FRAME: 'A corrupted IR frame was skipped. Capture continues.',
  STORAGE_FULL: 'Device storage is full. Free space or export and delete old sessions.',
  STORAGE_ERROR:
    'Capture could not be stored. Reception is paused. Check device storage, then reconnect.',
  NO_NETWORK: 'No network connection. Changes will sync when you are online.',
  AUTH_EXPIRED: 'Your session expired. Please sign in again.',
  SYNC_FAILED: 'Cloud sync failed. Will retry automatically.',
  NOT_CONNECTED: 'Connect an IR dongle to start capture.',
  RECEIVE_PROTOCOL_UNVERIFIED:
    'Dongle identified, but IR reception is unverified. Supply its receive/learning protocol or use a documented IR receiver.',
  USB_OPERATION_FAILED: 'USB operation failed. Reconnect the dongle and retry.',
  UNKNOWN: 'Something went wrong. Please try again.',
};
