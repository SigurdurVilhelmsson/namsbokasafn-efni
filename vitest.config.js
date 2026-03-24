import { defineConfig } from 'vitest/config';

/**
 * Root vitest config — used for shared settings.
 * Test discovery is handled by vitest.workspace.js which splits
 * server tests (sequential) from tools tests (parallel).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/_archived/**',
      '**/archived/**',
      '**/dist/**',
      '**/books/**',
      '**/.worktrees/**',
      '**/.claude/**',
      '**/e2e/**',
      '**/*.spec.js',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        '**/node_modules/**',
        '**/_archived/**',
        '**/archived/**',
        '**/books/**',
        '**/*.test.js',
        '**/__tests__/**',
        'vitest.config.js',
        'vitest.workspace.js',
      ],
      reportsDirectory: './coverage',
    },
    testTimeout: 30000,
    fileParallelism: false,
  },
});
