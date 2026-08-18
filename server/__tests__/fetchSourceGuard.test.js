import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('F2 server source guard', () => {
  it('isSourcePopulated is true for a book with CNXML, false otherwise', () => {
    const pipeline = require('../services/pipelineService');
    // efnafraedi-2e has a populated 01-source/ in the repo
    expect(pipeline.isSourcePopulated('efnafraedi-2e')).toBe(true);
    expect(pipeline.isSourcePopulated('__nonexistent_book__')).toBe(false);
  });

  it('runFetchSource spawns node with the exact known argv — no escape hatch', async () => {
    // An absence check (grep the source for a flag string) says whether you
    // observed the flag, never whether it's there — it passes vacuously the
    // moment the escape hatch is renamed. Assert the actual spawned argv
    // equals the exact known list instead: a positive, closed assertion that
    // a renamed or newly-added flag cannot slip past silently.
    const path = require('path');
    const pipeline = require('../services/pipelineService');

    let captured = null;
    const fakeSpawn = (command, args) => {
      captured = { command, args };
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(event, cb) {
          if (event === 'close') setImmediate(() => cb(0));
        },
      };
    };

    pipeline._setTestSpawn(fakeSpawn);
    try {
      const { promise } = pipeline.runFetchSource({
        slug: '__c93_fetch_argv_fixture__', // no 01-source on disk: no DB side effect
        repo: 'openstax/osbooks-chemistry-bundle',
        collection: 'chemistry-2e',
        userId: 'test-user',
      });
      await promise;
    } finally {
      pipeline._setTestSpawn(null);
    }

    expect(captured).not.toBeNull();
    expect(captured.command).toBe('node');
    expect(captured.args).toEqual([
      path.join(import.meta.dirname, '..', '..', 'tools', 'download-source.js'),
      '--repo',
      'openstax/osbooks-chemistry-bundle',
      '--collection',
      'chemistry-2e',
      '--book',
      '__c93_fetch_argv_fixture__',
      '--verbose',
    ]);
  });

  it('the fetch-source route guards on a populated 01-source/ and returns 409', () => {
    // A full route test needs admin auth + a registered book with populated source in
    // the throwaway DB; this source-assertion is the cheap regression guard so the
    // security-critical 409 block cannot be silently deleted (mirrors the argv guard).
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'routes', 'admin.js'), 'utf8');
    expect(src.includes('pipeline.isSourcePopulated(slug)')).toBe(true);
    expect(src.includes('status(409)')).toBe(true);
    expect(src.includes('Source already present')).toBe(true);
  });
});
