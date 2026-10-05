const {resolver} = require('../metro.config');

function isBlocked(path) {
  const patterns = Array.isArray(resolver.blockList) ? resolver.blockList : [resolver.blockList];
  return patterns.some(pattern => pattern.test(path));
}

describe('Metro native build exclusions', () => {
  it.each([
    'C:\\hs aed app\\IR dongle app\\node_modules\\react-native-reanimated\\android\\.cxx',
    'C:\\hs aed app\\IR dongle app\\node_modules\\react-native-reanimated\\android\\.cxx\\RelWithDebInfo\\6p101a43\\armeabi-v7a\\CMakeFiles\\CMakeTmp\\CMakeFiles\\cmTC_4ea0b.dir',
    'C:\\hs aed app\\IR dongle app\\android\\.gradle\\8.10.2',
    'C:\\hs aed app\\IR dongle app\\android\\app\\build\\generated',
    'C:\\hs aed app\\IR dongle app\\node_modules\\react-native-reanimated\\android\\build',
    '/project/node_modules/react-native-reanimated/android/.cxx/CMakeFiles/CMakeTmp',
    '/project/android/app/build/generated',
  ])('excludes generated directory %s', path => {
    expect(isBlocked(path)).toBe(true);
  });

  it.each([
    'C:\\hs aed app\\IR dongle app\\src\\presentation\\screens\\RemoteTest\\RemoteTestScreen.tsx',
    'C:\\hs aed app\\IR dongle app\\node_modules\\react-native-reanimated\\src\\index.ts',
    'C:\\hs aed app\\IR dongle app\\node_modules\\react-native-reanimated\\android\\src\\main',
    'C:\\hs aed app\\IR dongle app\\android\\app\\src\\main',
    'C:\\hs aed app\\IR dongle app\\src\\buildHelpers.ts',
    'C:\\hs aed app\\IR dongle app\\android\\build.gradle',
    '/project/node_modules/react-native-reanimated/src/index.ts',
  ])('keeps source path %s', path => {
    expect(isBlocked(path)).toBe(false);
  });
});
