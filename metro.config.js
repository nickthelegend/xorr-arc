// Metro: Expo's defaults, plus the repo's shared/ folder (Arc addresses and ABIs shared with the executor).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, 'shared')];
config.resolver.unstable_enablePackageExports = true;
config.resolver.blockList = [/[\\/]contracts[\\/].*/, /[\\/]server[\\/]node_modules[\\/].*/, /[\\/]\.fork[\\/].*/];
module.exports = config;
