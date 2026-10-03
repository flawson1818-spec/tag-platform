import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  {
    // Runs in the Service Worker global scope, not the browser `window` scope the rest
    // of this package lints against — `self` there is the SW's own global, not the
    // DOM's restricted one, and `clients` is a real SW-only global.
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        clients: 'readonly',
      },
    },
    rules: {
      'no-restricted-globals': 'off',
    },
  },
];
