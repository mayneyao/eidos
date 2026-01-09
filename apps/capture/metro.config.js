const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Include .so files as assets
config.resolver.assetExts.push('so', 'dylib');

// Ensure native extensions are treated as assets
config.resolver.sourceExts = config.resolver.sourceExts.filter(
  (ext) => !['so', 'dylib'].includes(ext)
);

module.exports = config;

