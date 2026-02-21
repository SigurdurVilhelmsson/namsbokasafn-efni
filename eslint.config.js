import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Global ignores
  {
    ignores: [
      'node_modules/',
      'server/node_modules/',
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
