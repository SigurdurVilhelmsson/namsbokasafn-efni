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

  it('runFetchSource never passes the --allow-overwrite-source escape hatch to the CLI', () => {
    // The server must not know this flag: assert the string appears nowhere in pipelineService.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(import.meta.dirname, '..', 'services', 'pipelineService.js'),
      'utf8'
    );
    expect(src.includes('--allow-overwrite-source')).toBe(false);
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
