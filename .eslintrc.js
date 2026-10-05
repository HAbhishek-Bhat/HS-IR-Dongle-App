module.exports = {
  root: true,
  extends: ['@react-native', 'plugin:prettier/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
    'no-console': ['warn', {allow: ['warn', 'error']}],
    'react-hooks/exhaustive-deps': 'warn',
  },
  ignorePatterns: ['node_modules/', 'android/', 'ios/', 'coverage/', 'e2e/'],
};
