const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// When bundling for web, swap native-only packages for minimal stubs.
// Expo Router v4 bundles all route files eagerly even when .web.jsx alternates
// exist, so packages like react-native-maps end up in the web bundle.
// The stub components never render on web — the .web.jsx routes take over at runtime.
const WEB_STUBS = {
  'react-native-maps': path.resolve(__dirname, 'lib/stubs/react-native-maps.js'),
  'react-native-vision-camera': path.resolve(__dirname, 'lib/stubs/react-native-vision-camera.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_STUBS[moduleName]) {
    return { type: 'sourceFile', filePath: WEB_STUBS[moduleName] };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
