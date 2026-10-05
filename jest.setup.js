jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock('react-native-haptic-feedback', () => ({
  trigger: jest.fn(),
}));

jest.mock('react-native-keychain', () => {
  const store = new Map();
  return {
    setGenericPassword: jest.fn(async (username, password, opts) => {
      store.set(opts?.service ?? 'default', {username, password});
      return true;
    }),
    getGenericPassword: jest.fn(async opts => {
      const value = store.get(opts?.service ?? 'default');
      return value ?? false;
    }),
    resetGenericPassword: jest.fn(async opts => {
      store.delete(opts?.service ?? 'default');
      return true;
    }),
    ACCESSIBLE: {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly'},
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-quick-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(() => ({rows: {length: 0, item: () => null, _array: []}})),
    executeAsync: jest.fn(async () => ({rows: {length: 0, item: () => null, _array: []}})),
    close: jest.fn(),
  })),
}));

jest.mock('react-native-share', () => ({
  open: jest.fn(() => Promise.resolve({success: true})),
}));

jest.mock('react-native-get-random-values', () => ({}));
