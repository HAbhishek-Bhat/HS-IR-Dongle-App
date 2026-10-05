const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 * @type {import('metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);
const defaultBlockList = defaultConfig.resolver.blockList;
const config = {
  resolver: {
    blockList: [
      ...(Array.isArray(defaultBlockList) ? defaultBlockList : [defaultBlockList]),
      // CMake/Gradle delete temporary directories while Metro is crawling them.
      /[/\\](?:\.cxx|\.gradle)(?:[/\\]|$)/,
      /[/\\]android[/\\](?:app[/\\])?build(?:[/\\]|$)/,
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
