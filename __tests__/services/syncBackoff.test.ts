import {AppError} from '@shared/errors/AppError';

describe('AppError mapping', () => {
  it('marks sync failures as retryable', () => {
    const error = new AppError('SYNC_FAILED', 'fail', 'Cloud sync failed. Will retry automatically.', true);
    expect(error.retryable).toBe(true);
    expect(error.code).toBe('SYNC_FAILED');
  });

  it('marks permission denial as non-retryable', () => {
    const error = new AppError(
      'PERMISSION_DENIED',
      'denied',
      'USB permission was denied. Grant access to use the IR dongle.',
      false,
    );
    expect(error.retryable).toBe(false);
  });
});
