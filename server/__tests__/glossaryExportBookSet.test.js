/**
 * Which books the glossary exporter actually SEES — a real-tree assertion.
 *
 * `runGlossaryExport` enumerates with `listBooks(booksDir).filter(hasGlossaryDir)`,
 * so a book's presence in the export loop is decided by one thing: whether
 * `books/<slug>/glossary/` exists on disk. That makes an empty directory
 * load-bearing, which is an unusual and easily-destroyed kind of state:
 *
 *   - A book WITHOUT the directory is skipped **silently** — no refusal, no
 *     `/api/health` entry, no deploy-readout line, and no D6 staleness clock.
 *     It is the one glossary state that emits nothing at all.
 *   - `edlisfraedi-2e` was in exactly that state until 2026-08-07 despite
 *     carrying 5,496 tagged translations, the second-largest corpus. It is in
 *     the loop now only because `books/edlisfraedi-2e/glossary/.gitkeep` exists.
 *
 * ⚠️ Nothing else covers this. `hasGlossaryDir` is a closure inside
 * export-terminology.js and is not exported; the other real-tree glossary
 * suites filter on `glossary/glossary-unified.json`, i.e. the FILE, so a book
 * with a directory and no file is invisible to them — which is precisely
 * `edlisfraedi-2e`'s state. Deleting the keepfile as "an empty directory with a
 * stray dotfile" would remove physics from the export with every check green.
 *
 * This test is the guard that deletion would trip. It asserts the exact set, so
 * it fails on an unintended REMOVAL and equally on an unintended ADDITION — a
 * new book scaffolded with an empty `glossary/` by `createBookDirectories()`
 * enters the loop the same way, and should be a deliberate, reviewed change.
 *
 * Register: §C14 ② "LEAD DECISIONS TAKEN 2026-08-07", decision 4.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Resolve against the module, never process.cwd(): the server runs with
// cwd=server/, so a books/-relative path resolved against cwd points at the
// wrong tree (CLAUDE.md, durable rule).
const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = join(__dirname, '..', '..', 'books');

// server/ is CommonJS; this test file is ESM vitest — bridge via createRequire,
// matching glossaryExportRun.test.js.
const require = createRequire(import.meta.url);
const { runGlossaryExport } = require('../scripts/export-terminology');

/** Mirrors runGlossaryExport's enumeration: listBooks(...).filter(hasGlossaryDir). */
function booksInExportLoop() {
  return readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('__'))
    .map((e) => e.name)
    .filter((slug) => existsSync(join(BOOKS_DIR, slug, 'glossary')))
    .sort();
}

describe('glossary export book set (real tree)', () => {
  it('is exactly the four books the register expects', () => {
    expect(booksInExportLoop()).toEqual([
      'edlisfraedi-2e',
      'efnafraedi-2e',
      'liffraedi-2e',
      'lifraen-efnafraedi',
    ]);
  });

  it('includes edlisfraedi-2e, which is in the loop only because of its keepfile', () => {
    expect(booksInExportLoop()).toContain('edlisfraedi-2e');
  });

  it('keeps the keepfile that puts edlisfraedi-2e in the loop', () => {
    // Named separately from the set assertion: this is the file whose deletion
    // is the silent failure, so the failure message should say so.
    expect(existsSync(join(BOOKS_DIR, 'edlisfraedi-2e', 'glossary', '.gitkeep'))).toBe(true);
  });

  it('excludes orverufraedi, which has no glossary directory', () => {
    // The control: a book deliberately OUT of the loop. Without it the set
    // assertion could pass while silently admitting every book on disk.
    expect(booksInExportLoop()).not.toContain('orverufraedi');
  });
});

describe('B3 changes no book outcome (spec D6)', () => {
  /**
   * The payload only has to be STAMPED RESOLVED — that is all the producer gate
   * reads. The builder's own correctness is Task 4's business, and using a stub
   * here keeps this pin independent of it: if Task 4 regresses, this test still
   * answers the question it was written to answer.
   */
  const resolvedStub = (slug) => ({
    producer: 'export-terminology-resolved',
    generated: 'x',
    book: slug,
    stats: {},
    terms: [{ english: 'atom', icelandic: 'frumeind', status: 'approved', domain: 'chemistry' }],
  });

  it('every glossary-bearing book still refuses, for the same reason as before', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-pin-'));
    const code = runGlossaryExport({
      booksDir: BOOKS_DIR, // the REAL tree — this file's existing constant
      projectRoot: root,
      exportFn: resolvedStub,
      // A truthy subject, so the run reaches the producer/absent gates rather
      // than stopping at refused-no-mapping. The real subjectFn needs a DB.
      subjectFn: () => 'chemistry',
      log: () => {},
      logError: () => {},
    });

    // A refusal is a correct outcome, not an error (C14 decision D2).
    expect(code).toBe(0);

    const status = JSON.parse(
      fs.readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    const outcomeOf = (slug) => status.books[slug] && status.books[slug].outcome;

    expect(outcomeOf('efnafraedi-2e')).toBe('refused-producer');
    expect(outcomeOf('liffraedi-2e')).toBe('refused-producer');
    expect(outcomeOf('lifraen-efnafraedi')).toBe('refused-producer');
    // No committed glossary — §C21's gate, live on this book since 2026-08-08.
    expect(outcomeOf('edlisfraedi-2e')).toBe('refused-absent-baseline');

    fs.rmSync(root, { recursive: true, force: true });
  });
});
