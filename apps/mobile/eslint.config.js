// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*', 'ios/*', 'android/*'] },
  {
    rules: {
      // Colors come from @hold/design-tokens (Tailwind classes), never hex literals.
      'no-restricted-syntax': ['error', { selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]', message: 'Use a design token, not a hex color.' }],
    },
  },
]);
