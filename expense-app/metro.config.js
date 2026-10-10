const fs = require('node:fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = fs.realpathSync(__dirname);
const config = {
  projectRoot,
  watchFolders: [projectRoot],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
