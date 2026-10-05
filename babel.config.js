module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
          '@app': './src/app',
          '@domain': './src/domain',
          '@data': './src/data',
          '@presentation': './src/presentation',
          '@native': './src/native',
          '@shared': './src/shared',
          '@di': './src/di',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
