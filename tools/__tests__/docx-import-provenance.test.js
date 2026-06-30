import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readProvenance } from '../lib/provenance.js';
import { writeSegmentFiles } from '../docx-import.js';

let booksDir;
beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docxprov-'));
});
afterEach(() => {
  fs.rmSync(booksDir, { recursive: true, force: true });
});

describe('writeSegmentFiles provenance', () => {
  const alignments = [{ segmentId: 'm12345:para:a', docxText: 'halló heimur' }];
  const moduleMetadata = new Map([['m12345', { title: 'X' }]]);

  it('stamps docx-import next to each written module (book=__t__, chapter=3)', () => {
    fs.mkdirSync(path.join(booksDir, '__t__'), { recursive: true });
    writeSegmentFiles(alignments, path.join(booksDir, '__t__'), 3, moduleMetadata, false);
    const chDir = path.join(booksDir, '__t__', '02-mt-output', 'ch03');
    expect(fs.existsSync(path.join(chDir, 'm12345-segments.is.md'))).toBe(true);
    expect(readProvenance(chDir, 'm12345').tool).toBe('docx-import');
  });

  it('does not stamp under dry-run', () => {
    fs.mkdirSync(path.join(booksDir, '__t__'), { recursive: true });
    writeSegmentFiles(alignments, path.join(booksDir, '__t__'), 3, moduleMetadata, true);
    const chDir = path.join(booksDir, '__t__', '02-mt-output', 'ch03');
    expect(readProvenance(chDir, 'm12345')).toBeNull();
  });
});
