import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['node_modules/', 'dist/', 'out/', 'release/', 'coverage/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    languageOptions: { globals: globals.node },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/renderer/**'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    // Code shared by every process must stay free of Node and Electron APIs.
    files: ['src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*', 'electron'], message: 'Shared code must stay pure.' }] },
      ],
    },
  },
  {
    // Command-line scripts report to the terminal on purpose.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
