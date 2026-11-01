// Expo's default Metro config already handles pnpm workspaces; NativeWind adds Tailwind.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css', configPath: './tailwind.config.ts' });
