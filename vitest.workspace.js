import { defineWorkspace } from 'vitest/config';

/**
 * Vitest workspace — separates server tests (need sequential execution
 * due to shared SQLite singletons) from tools tests (safe to parallelize).
 */
export default defineWorkspace([
  {
    // Tools tests — safe to run in parallel (no shared DB state)
    test: {
      name: 'tools',
      include: ['tools/__tests__/**/*.test.js'],
      exclude: [
        '**/node_modules/**',
        '**/_archived/**',
        '**/books/**',
        '**/.worktrees/**',
        '**/.claude/**',
      ],
      environment: 'node',
      testTimeout: 30000,
    },
  },
  {
    // Server tests — run sequentially to avoid SQLite singleton conflicts
    test: {
      name: 'server',
      include: ['server/__tests__/**/*.test.js'],
      exclude: [
        '**/node_modules/**',
        '**/_archived/**',
        '**/books/**',
        '**/.worktrees/**',
        '**/.claude/**',
        '**/e2e/**',
        '**/*.spec.js',
      ],
      environment: 'node',
      testTimeout: 30000,
      fileParallelism: false,
    },
  },
]);
