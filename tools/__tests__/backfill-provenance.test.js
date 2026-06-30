import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readProvenance } from '../lib/provenance.js';
import { backfillBook } from '../backfill-provenance.js';

let bookDir;
function seg(dir, mod) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${mod}-segments.is.md`), `<!-- SEG:${mod}:para:a --> x\n`);
}
beforeEach(() => {
  bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-'));
});
afterEach(() => {
  fs.rmSync(bookDir, { recursive: true, force: true });
});

describe('backfillBook', () => {
  it('stamps api-translate for a chapter with no import-report', () => {
    seg(path.join(bookDir, '02-mt-output', 'ch05'), 'm66372');
    const r = backfillBook(bookDir);
    expect(r.stamped).toBe(1);
    expect(readProvenance(path.join(bookDir, '02-mt-output', 'ch05'), 'm66372').tool).toBe(
      'api-translate'
    );
  });

  it('stamps docx-import for a chapter that has import-report.json', () => {
    const ch = path.join(bookDir, '02-mt-output', 'ch03');
    seg(ch, 'm66437');
    fs.writeFileSync(path.join(ch, 'import-report.json'), '{}');
    backfillBook(bookDir);
    expect(readProvenance(ch, 'm66437').tool).toBe('docx-import');
  });

  it('is idempotent — a second run stamps nothing new', () => {
    seg(path.join(bookDir, '02-mt-output', 'ch05'), 'm66372');
    backfillBook(bookDir);
    const r2 = backfillBook(bookDir);
    expect(r2.stamped).toBe(0);
    expect(r2.skipped).toBe(1);
  });
});
