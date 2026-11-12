/**
 * No committed English segment file in any book holds a repeated SEG id (G1.12; design §7 item 5).
 *
 * Until G1.12, `processExample` emitted each paragraph of a `<note>` nested in an `<example>` twice
 * under one id: once from its depth-blind paragraph walk, once from `processNote`. The committed
 * chemistry tree held 285 such ids in 83 modules. The readers disagreed about which copy counted
 * (inject: the first; the editor loader: the last), so the corpus itself is the anchor here, not a
 * fixture: any future extraction that repeats an id in a committed file turns this red.
 *
 * Population: every `books/<book>/02-for-mt/<dir>/*.en.md`, chapter metadata included. The legacy
 * web-UI artifacts named `…-segments(b).en.md` (and `(c)`, `(d)`) are skipped, as the tools skip
 * them. Parsed with `parseSegmentRecords`, the recognizer the editor loader uses, which keeps every
 * occurrence.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSegmentRecords } = require('../lib/seg-markers.cjs');

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOKS = join(REPO_ROOT, 'books');
const LEGACY = /\([a-z]\)\.en\.md$/;

/** The ids occurring more than once in one file's text, each listed once, in first-seen order. */
function repeatedIds(text) {
  const counts = new Map();
  for (const r of parseSegmentRecords(text)) {
    counts.set(r.segmentId, (counts.get(r.segmentId) || 0) + 1);
  }
  return [...counts].filter(([, n]) => n > 1).map(([id]) => id);
}

/** Every English segment file under books/<book>/02-for-mt/<dir>/, legacy artifacts skipped. */
function segmentFiles() {
  const files = [];
  for (const book of readdirSync(BOOKS).sort()) {
    const forMt = join(BOOKS, book, '02-for-mt');
    let dirs;
    try {
      dirs = readdirSync(forMt).sort();
    } catch {
      continue; // a book with no 02-for-mt
    }
    for (const dir of dirs) {
      const full = join(forMt, dir);
      if (!statSync(full).isDirectory()) continue;
      for (const f of readdirSync(full).sort()) {
        if (f.endsWith('.en.md') && !LEGACY.test(f)) files.push(join(full, f));
      }
    }
  }
  return files;
}

describe('segment ids are unique within each committed English segment file (G1.12)', () => {
  const files = segmentFiles();

  it('the walk finds the corpus (empty-walk control)', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('control: the helper reports a planted repeated id', () => {
    const planted = [
      '<!-- SEG:m00001:para:fs-id001 -->',
      'First copy.',
      '',
      '<!-- SEG:m00001:para:fs-id002 -->',
      'Another paragraph.',
      '',
      '<!-- SEG:m00001:para:fs-id001 -->',
      'First copy.',
      '',
    ].join('\n');
    expect(repeatedIds(planted)).toEqual(['m00001:para:fs-id001']);
  });

  it('no file holds an id more than once', () => {
    const offenders = [];
    for (const file of files) {
      for (const id of repeatedIds(readFileSync(file, 'utf8'))) {
        offenders.push({ file: relative(REPO_ROOT, file), id });
      }
    }
    const fileCount = new Set(offenders.map((o) => o.file)).size;
    const first = offenders[0];
    expect(
      offenders,
      first
        ? `${offenders.length} repeated id(s) in ${fileCount} file(s); first: ${first.id} in ${first.file}`
        : undefined
    ).toEqual([]);
  });
});
