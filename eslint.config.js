// ESLint flat config. https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'web-build/**',
      '.expo/**',
      'assets/**',
      'android/**',
      'ios/**',
      'coverage/**',
      // Deno code (Supabase Edge Functions): different runtime, own deno.json.
      'supabase/functions/**',
      'expo-env.d.ts',
    ],
  },
  {
    // Jest test files: describe/it/expect/jest globals.
    files: ['src/**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
  },
]);
