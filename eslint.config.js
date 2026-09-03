import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Global ignores
  {
    ignores: [
      'node_modules/',
      'server/node_modules/',
      // 🔴 THE PYTHON VIRTUALENV FOR greynir-sidecar, AND IT IS 8,262 OF THE 8,263
      // ESLINT ERRORS UNDER server/. It is gitignored (.gitignore:6), 151 MB, and full
      // of vendored third-party JavaScript shipped inside pip packages — 5,230 `no-var`
      // alone, the fingerprint of old vendor code rather than of a tree every commit
      // runs prettier over. Measured 2026-09-03: with this ignored, server/ has ONE
      // eslint error in our own code. ⚠️ Without it, widening `lint` to cover server/
      // turns the Lint job red on a directory that is not even in git.
      'server/.venv/',
      'tools/archived/',
      '**/_archived/',
      '*.bak',
      '*.backup',
      'pipeline-output/',
      'books/*/01-source/',
      'books/*/02-mt-output/',
    ],
  },

  // Base config for ES module files (tools/, scripts/)
  {
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'multi-line'],
      'no-throw-literal': 'error',
    },
  },

  // Server files (CommonJS)
  {
    files: ['server/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
  },

  // Server browser-side scripts
  {
    files: ['server/public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
  },

  // Test files
  {
    files: ['**/*.test.js', '**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Server tests (ESM)
  {
    files: ['server/__tests__/**/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },

  // Prettier must be last
  prettierConfig,
];
