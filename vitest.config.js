import { defineConfig } from 'vitest/config';

/**
 * Root vitest config — and, in practice, the ONLY discovery config.
 *
 * ⚠️ `vitest.workspace.js` CANNOT LOAD under the installed vitest (it throws
 * `SyntaxError: … does not provide an export named 'defineWorkspace'`), so
 * discovery falls through to this file and `fileParallelism: false` below
 * applies globally — nothing runs in parallel. This docstring used to claim
 * workspace.js split server tests from tools tests; CLAUDE.md records that as
 * false, and it is corrected here rather than left for the next reader.
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
      // 🔴 GITIGNORED SCRATCH MUST NOT BE ABLE TO REDDEN THE SUITE. `pipeline-output/`
      // is where the autorun driver writes its logs and where probes and review agents
      // write throwaway files — and vitest discovery does NOT consult `.gitignore`.
      // Measured 2026-09-22: five agent-written `*.test.js` files under
      // `pipeline-output/scratch-lens/` added 21 failures and 534 tests to a full run,
      // in a directory git does not track. A red that no clone can reproduce is worse
      // than a red: it sends the next reader hunting a defect that is not in the repo.
      '**/pipeline-output/**',
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
