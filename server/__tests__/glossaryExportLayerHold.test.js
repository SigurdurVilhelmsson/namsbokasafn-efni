/**
 * The book-layer export hold (spec 2026-11-20-book-glossary-stage2-design §5.6).
 *
 * A book whose glossary layer has history carries a stamp in its committed
 * glossary-unified.json: `bookLayer: { lastChangeId: N }`, the layer's last change id when
 * the export was built. When the layer has moved since (the committed stamp differs from
 * the current id) and the terms differ, the export is HELD: the committed file stays as it
 * is, the would-be export goes to pipeline-output/glossary-held/<slug>.json, and the outcome
 * is `refused-layer-change`. When the terms are the same, the file is only restamped.
 *
 * `layerChangeIdFn` is injected throughout, so none of this opens a sessions.db. The default
 * reader is pinned in glossaryExportDefaultWiring.test.js.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runGlossaryExport, parseArgs } = require('../scripts/export-terminology');
const { termsSha256 } = require('../../tools/lib/glossary-terms-hash.cjs');

let root;

const approved = (n) =>
  Array.from({ length: n }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: 'approved',
  }));

const payload = (terms, generated = '2026-07-27T09:00:00.000Z') => ({
  generated,
  book: 'prufubok',
  stats: {},
  terms,
});

/** A committed file carrying a stamp. */
const stamped = (terms, lastChangeId, generated) => ({
  ...payload(terms, generated),
  bookLayer: { lastChangeId },
});

/** Create books/<slug>/glossary/, optionally with a committed export (an object). */
function seedBook(slug, committed) {
  const dir = path.join(root, 'books', slug, 'glossary');
  mkdirSync(dir, { recursive: true });
  if (committed !== undefined) {
    writeFileSync(
      path.join(dir, 'glossary-unified.json'),
      JSON.stringify(committed, null, 2) + '\n'
    );
  }
}

const glossaryFile = (slug) => path.join(root, 'books', slug, 'glossary', 'glossary-unified.json');
const heldFile = (slug) => path.join(root, 'pipeline-output', 'glossary-held', `${slug}.json`);
const readBytes = (slug) => readFileSync(glossaryFile(slug), 'utf8');
const readExport = (slug) => JSON.parse(readBytes(slug));
const readHeld = (slug) => JSON.parse(readFileSync(heldFile(slug), 'utf8'));
const readStatus = () =>
  JSON.parse(
    readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
  );

function run(opts) {
  return runGlossaryExport({
    booksDir: path.join(root, 'books'),
    projectRoot: root,
    subjectFn: () => 'chemistry',
    recordFn: () => null,
    layerChangeIdFn: () => null,
    log: () => {},
    logError: () => {},
    ...opts,
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'layer-hold-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('termsSha256', () => {
  it('termsSha256 is the sha256 of JSON.stringify(terms)', () => {
    const terms = approved(3);
    const expected = createHash('sha256').update(JSON.stringify(terms)).digest('hex');
    expect(termsSha256({ terms })).toBe(expected);
  });

  it('termsSha256 throws on a payload without a terms array', () => {
    expect(() => termsSha256({ glossary: [] })).toThrow(TypeError);
  });
});

describe('runGlossaryExport — the stamp', () => {
  it('a book without layer history is written exactly as before', () => {
    seedBook('prufubok', payload(approved(1)));
    run({ layerChangeIdFn: () => null, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('wrote');
    expect(readExport('prufubok')).not.toHaveProperty('bookLayer');
    expect(readBytes('prufubok')).toBe(JSON.stringify(payload(approved(3)), null, 2) + '\n');
  });

  it('a write stamps the current change id', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    run({ layerChangeIdFn: () => 7, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('wrote');
    expect(readExport('prufubok').bookLayer).toEqual({ lastChangeId: 7 });
  });
});

describe('runGlossaryExport — the hold', () => {
  it('a layer change holds the export', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    const before = readBytes('prufubok');
    const code = run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('refused-layer-change');
    expect(readBytes('prufubok')).toBe(before);
    expect(code).toBe(0);
    expect(existsSync(path.join(root, 'pipeline-output', '.last-glossary-export'))).toBe(true);
  });

  it('a committed file without a stamp is held when the terms differ', () => {
    seedBook('prufubok', payload(approved(1)));
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('refused-layer-change');
  });

  it('the held file is the would-be export', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    const held = readHeld('prufubok');
    expect(held.terms).toEqual(approved(3));
    expect(held.bookLayer.lastChangeId).toBe(9);
  });

  it('the held file holds exactly the bytes a write would produce', () => {
    // Two books, one export: prufubok's stamp is behind (held), annarbok's is current (written).
    seedBook('prufubok', stamped(approved(1), 7));
    seedBook('annarbok', stamped(approved(1), 9));
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.annarbok.outcome).toBe('wrote');
    expect(readFileSync(heldFile('prufubok'), 'utf8')).toBe(readBytes('annarbok'));
  });

  it('the held file carries no integrity report, and the status does', () => {
    const integrity = { 'merge-cycle': 2 };
    seedBook('prufubok', stamped(approved(1), 7));
    run({ layerChangeIdFn: () => 9, exportFn: () => ({ ...payload(approved(3)), integrity }) });
    expect(readHeld('prufubok')).not.toHaveProperty('integrity');
    expect(readStatus().books.prufubok.integrity).toEqual(integrity);
  });

  it("the status carries the held export's terms hash and path", () => {
    seedBook('prufubok', stamped(approved(1), 7));
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok).toMatchObject({
      outcome: 'refused-layer-change',
      detail: 'layer moved: stamp 7 → 9',
      termsSha256: termsSha256(readHeld('prufubok')),
      held: 'pipeline-output/glossary-held/prufubok.json',
    });
  });

  it('a hold on a committed file without a stamp names the stamp as none', () => {
    seedBook('prufubok', payload(approved(1)));
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.detail).toBe('layer moved: stamp none → 9');
  });

  it('a hold logs the slug, the stamp, the id and the held path', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    const lines = [];
    run({
      layerChangeIdFn: () => 9,
      exportFn: () => payload(approved(3)),
      log: (m) => lines.push(m),
      logError: (m) => lines.push(m),
    });
    const named = lines.filter(
      (m) => m.includes('prufubok') && m.includes('7 → 9') && m.includes(heldFile('prufubok'))
    );
    expect(named).toHaveLength(1);
  });

  it('the record is still written when the export is held', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    const record = {
      schema: 'book-glossary/1',
      book: 'prufubok',
      generated: 'x',
      exclusions: [],
      entries: [],
      history: [],
      dangling: [],
    };
    run({
      layerChangeIdFn: () => 9,
      recordFn: () => record,
      exportFn: () => payload(approved(3)),
    });
    expect(readStatus().books.prufubok.outcome).toBe('refused-layer-change');
    expect(existsSync(path.join(root, 'books', 'prufubok', 'glossary', 'book-glossary.json'))).toBe(
      true
    );
  });

  it('an adopted first export of a book with layer history is held', () => {
    seedBook('prufubok');
    run({ adopt: true, layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('refused-layer-change');
    expect(existsSync(glossaryFile('prufubok'))).toBe(false);
  });

  it('an unreadable layer change id fails the book closed', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    const before = readBytes('prufubok');
    const code = run({
      layerChangeIdFn: () => {
        throw new Error('boom');
      },
      exportFn: () => payload(approved(3)),
    });
    expect(code).toBe(1);
    expect(readStatus().books.prufubok.outcome).toBe('error');
    expect(readStatus().books.prufubok.detail).toMatch(/book layer change id unreadable — boom/);
    expect(readBytes('prufubok')).toBe(before);
    expect(existsSync(heldFile('prufubok'))).toBe(false);
  });

  it('a held file that cannot be written fails that book, not the run', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    seedBook('annarbok', stamped(approved(1), 9));
    // A regular file where the held directory should be: mkdir fails.
    mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
    writeFileSync(path.join(root, 'pipeline-output', 'glossary-held'), 'not a directory');
    const before = readBytes('prufubok');
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    const books = readStatus().books;
    expect(books.prufubok.outcome).toBe('error');
    expect(books.prufubok.detail).toMatch(/could not write held export/);
    expect(readBytes('prufubok')).toBe(before);
    // Control: the loop went on to the next book.
    expect(books.annarbok.outcome).toBe('wrote');
  });

  it('a second held run replaces the held file and keeps since', () => {
    const T1 = 1_800_000_000_000;
    const T2 = 1_800_007_200_000;
    seedBook('prufubok', stamped(approved(1), 7));
    run({ nowMs: T1, layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    run({ nowMs: T2, layerChangeIdFn: () => 10, exportFn: () => payload(approved(4)) });
    const entry = readStatus().books.prufubok;
    expect(readHeld('prufubok').bookLayer.lastChangeId).toBe(10);
    expect(entry.termsSha256).toBe(termsSha256(payload(approved(4))));
    expect(entry.since).toBe(new Date(T1).toISOString());
  });

  it('a dry run reports a hold and writes no held file', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    const before = readBytes('prufubok');
    const lines = [];
    run({
      dryRun: true,
      layerChangeIdFn: () => 9,
      exportFn: () => payload(approved(3)),
      log: (m) => lines.push(m),
      logError: (m) => lines.push(m),
    });
    expect(
      lines.some((m) => m.includes('prufubok') && /hold/i.test(m) && m.includes('7 → 9'))
    ).toBe(true);
    expect(existsSync(heldFile('prufubok'))).toBe(false);
    expect(readBytes('prufubok')).toBe(before);
  });
});

describe('runGlossaryExport — restamp', () => {
  it('unchanged terms with a stale stamp are restamped', () => {
    seedBook('prufubok', stamped(approved(3), 7));
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('restamped');
    expect(readExport('prufubok').terms).toEqual(approved(3));
    expect(readExport('prufubok').bookLayer).toEqual({ lastChangeId: 9 });
  });

  it('a restamp changes only the stamp', () => {
    // Spec §5.6 item 4: "rewritten with the current stamp only". The export's own `generated`
    // differs; the committed file's is kept, so the commit's diff is the stamp alone.
    const committed = stamped(approved(3), 7, '2026-01-01T00:00:00.000Z');
    seedBook('prufubok', committed);
    run({
      layerChangeIdFn: () => 9,
      exportFn: () => payload(approved(3), '2026-11-20T08:00:00.000Z'),
    });
    expect(readBytes('prufubok')).toBe(
      JSON.stringify({ ...committed, bookLayer: { lastChangeId: 9 } }, null, 2) + '\n'
    );
  });

  it('a committed file without a stamp is restamped when the terms are the same', () => {
    seedBook('prufubok', payload(approved(3)));
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readExport('prufubok').bookLayer).toEqual({ lastChangeId: 9 });
  });

  it('unchanged terms with a current stamp are not rewritten', () => {
    seedBook('prufubok', stamped(approved(3), 9));
    const past = new Date('2020-01-01T00:00:00.000Z');
    utimesSync(glossaryFile('prufubok'), past, past);
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('unchanged');
    expect(statSync(glossaryFile('prufubok')).mtimeMs).toBe(past.getTime());
  });

  it('a dry run reports a restamp and writes nothing', () => {
    seedBook('prufubok', stamped(approved(3), 7));
    const before = readBytes('prufubok');
    const lines = [];
    run({
      dryRun: true,
      layerChangeIdFn: () => 9,
      exportFn: () => payload(approved(3)),
      log: (m) => lines.push(m),
      logError: (m) => lines.push(m),
    });
    expect(lines.some((m) => m.includes('prufubok') && /restamp/i.test(m))).toBe(true);
    expect(readBytes('prufubok')).toBe(before);
  });
});

describe('runGlossaryExport — R8: a stamp the database cannot confirm', () => {
  it('a stamped file whose layer history is gone is held when the terms change', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    const before = readBytes('prufubok');
    run({ layerChangeIdFn: () => null, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('refused-layer-change');
    expect(readBytes('prufubok')).toBe(before);
    expect(existsSync(heldFile('prufubok'))).toBe(true);
  });

  it('a stamped file whose layer history is gone is left alone when the terms match', () => {
    seedBook('prufubok', stamped(approved(3), 7));
    const before = readBytes('prufubok');
    run({ layerChangeIdFn: () => null, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('unchanged');
    expect(readBytes('prufubok')).toBe(before);
  });

  it('a stamp ahead of the database is held', () => {
    seedBook('prufubok', stamped(approved(1), 10));
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('refused-layer-change');
  });

  it('a stamp ahead of the database is restamped when the terms match', () => {
    seedBook('prufubok', stamped(approved(3), 10));
    run({ layerChangeIdFn: () => 9, exportFn: () => payload(approved(3)) });
    expect(readStatus().books.prufubok.outcome).toBe('restamped');
    expect(readExport('prufubok').bookLayer).toEqual({ lastChangeId: 9 });
  });

  it('a matching release lets a gone-history hold write, without a stamp', () => {
    seedBook('prufubok', stamped(approved(1), 7));
    const exportFn = () => payload(approved(3));
    run({ layerChangeIdFn: () => null, exportFn });
    const hash = readStatus().books.prufubok.termsSha256;
    run({ layerChangeIdFn: () => null, exportFn, releaseLayer: hash });
    expect(readStatus().books.prufubok.outcome).toBe('released');
    expect(readExport('prufubok')).not.toHaveProperty('bookLayer');
  });
});

describe('runGlossaryExport — release', () => {
  const exportFn = () => payload(approved(3));

  function hold() {
    seedBook('prufubok', stamped(approved(1), 7));
    run({ layerChangeIdFn: () => 9, exportFn });
    return readStatus().books.prufubok.termsSha256;
  }

  it('release with the held hash writes the export, stamped', () => {
    const hash = hold();
    run({ layerChangeIdFn: () => 9, exportFn, releaseLayer: hash });
    expect(readStatus().books.prufubok.outcome).toBe('released');
    expect(readExport('prufubok').terms).toEqual(approved(3));
    expect(readExport('prufubok').bookLayer).toEqual({ lastChangeId: 9 });
  });

  it('release with a stale hash refuses and names both hashes', () => {
    const held = hold();
    const before = readBytes('prufubok');
    const stale = 'a'.repeat(64);
    const lines = [];
    run({
      layerChangeIdFn: () => 9,
      exportFn,
      releaseLayer: stale,
      logError: (m) => lines.push(m),
    });
    expect(readStatus().books.prufubok.outcome).toBe('refused-layer-change');
    expect(readBytes('prufubok')).toBe(before);
    expect(lines.some((m) => m.includes(stale) && m.includes(held) && /test again/.test(m))).toBe(
      true
    );
  });

  it('release does not stand down the shrink gate', () => {
    seedBook('prufubok', stamped(approved(10), 7));
    const small = () => payload(approved(3));
    run({ layerChangeIdFn: () => 9, exportFn: small });
    const hash = readStatus().books.prufubok.termsSha256;
    const before = readBytes('prufubok');
    run({ layerChangeIdFn: () => 9, exportFn: small, releaseLayer: hash });
    expect(readStatus().books.prufubok.outcome).toBe('refused-shrink');
    expect(readBytes('prufubok')).toBe(before);
  });

  it('release with nothing held has no effect', () => {
    seedBook('prufubok', stamped(approved(1), 9));
    const lines = [];
    run({
      layerChangeIdFn: () => 9,
      exportFn,
      releaseLayer: 'b'.repeat(64),
      log: (m) => lines.push(m),
      logError: (m) => lines.push(m),
    });
    expect(readStatus().books.prufubok.outcome).toBe('wrote');
    expect(lines.some((m) => m.includes('prufubok') && /no effect/.test(m))).toBe(true);
  });

  it('after a release the next bare run reads unchanged', () => {
    const hash = hold();
    run({ layerChangeIdFn: () => 9, exportFn, releaseLayer: hash });
    run({ layerChangeIdFn: () => 9, exportFn });
    const entry = readStatus().books.prufubok;
    expect(entry.outcome).toBe('unchanged');
    expect(entry).not.toHaveProperty('held');
    expect(entry).not.toHaveProperty('termsSha256');
  });
});

describe('parseArgs — --release-layer', () => {
  const hex = 'ab12'.repeat(16);

  it('parses --release-layer trimmed and lowercased', () => {
    const r = parseArgs(['--book', 'x', '--release-layer', ` ${hex.toUpperCase()} `]);
    expect(r.releaseLayer).toBe(hex);
    expect(r.error).toBe(null);
  });

  it('rejects a value that is not 64 hex characters', () => {
    expect(parseArgs(['--book', 'x', '--release-layer', hex.slice(1)]).error).toMatch(
      /--release-layer/
    );
    expect(parseArgs(['--book', 'x', '--release-layer', 'xyz']).error).toMatch(/--release-layer/);
  });

  it('requires --book', () => {
    const r = parseArgs(['--release-layer', hex]);
    expect(r.error).toMatch(/--release-layer/);
    expect(r.error).toMatch(/requires? --book/);
  });

  it('does not swallow the next flag as its value', () => {
    expect(parseArgs(['--release-layer', '--book', 'x']).error).toMatch(/--release-layer/);
  });

  it('reports releaseLayer on every return path', () => {
    expect(parseArgs(['--release-layer', hex, '--book']).releaseLayer).toBe(hex);
    expect(parseArgs(['--release-layer', hex, '--book', '']).releaseLayer).toBe(hex);
    expect(parseArgs(['--release-layer', hex, '--frobnicate']).releaseLayer).toBe(hex);
    expect(parseArgs(['--release-layer', hex, '--book', 'x']).releaseLayer).toBe(hex);
    expect(parseArgs(['--release-layer', hex]).releaseLayer).toBe(hex); // override-scoping return
    expect(parseArgs([]).releaseLayer).toBe(null);
  });
});
