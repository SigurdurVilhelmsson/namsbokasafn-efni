import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { listChapterDirsForBook } from '../validate-status.js';

// scripts/validate-status.js is ESM (root package.json "type": "module") and
// is a plain CLI script (no main()/exports originally) that reads real disk
// state and calls process.exit() at top level. It was refactored to export
// `listChapterDirsForBook` and guard its script body behind an
// `import.meta.url === entrypoint` check so importing it here for the helper
// does not also run the full validator against process.exit().
describe('validate-status includes appendices', () => {
  it('discovers the appendices chapter dir alongside chNN, excluding non-chapter dirs', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'valstatus-'));
    for (const c of ['ch01', 'appendices', 'tm']) mkdirSync(path.join(dir, c));

    const found = listChapterDirsForBook(dir);

    expect(found).toContain('appendices');
    expect(found).toContain('ch01');
    expect(found).not.toContain('tm');
  });
});
