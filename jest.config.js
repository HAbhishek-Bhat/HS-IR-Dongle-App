module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-reanimated|react-native-gesture-handler|react-native-svg|react-native-uuid|react-native-quick-sqlite)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@data/(.*)$': '<rootDir>/src/data/$1',
    '^@presentation/(.*)$': '<rootDir>/src/presentation/$1',
    '^@native/(.*)$': '<rootDir>/src/native/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@di/(.*)$': '<rootDir>/src/di/$1',
  },
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    'src/data/**/*.{ts,tsx}',
    'src/shared/**/*.{ts,tsx}',
    '!**/index.ts',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/e2e/'],
};
