import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  verifySourceManifest,
  listCnxmlFiles,
  MANIFEST_NAME,
} = require('../lib/source-manifest.cjs');

const BOOKS_DIR = join(import.meta.dirname, '..', '..', 'books');

/**
 * §C93 finding ②: books to guard are the UNION of "has a manifest" and "has
 * CNXML" — not CNXML alone. A CNXML-only enumeration silently drops a book
 * whose 01-source CNXML was emptied: the manifest is still there, expecting
 * files that no longer exist, but the book never gets iterated to compare
 * against it. Do NOT key this on licence — `__e2e-fixture__` (CC BY, 0 CNXML,
 * no manifest) must stay out of both sets regardless.
 *
 * Deleting BOTH sides drops a book out of the guard, and that is declared out
 * of model: a tracked-file deletion is visible in the diff (the same carve-out
 * F2's own threat model gives a holder of repo write access).
 */
function guardedBooks(booksDir) {
  if (!existsSync(booksDir)) return [];
  return readdirSync(booksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => {
      const sourceDir = join(booksDir, slug, '01-source');
      return listCnxmlFiles(sourceDir).length > 0 || existsSync(join(sourceDir, MANIFEST_NAME));
    });
}

describe('F2 source-manifest baseline (real tree)', () => {
  const books = guardedBooks(BOOKS_DIR);

  it('there is at least one populated book to guard', () => {
    expect(books.length).toBeGreaterThan(0);
  });

  it.each(books)('%s 01-source matches its committed manifest', (slug) => {
    const r = verifySourceManifest(join(BOOKS_DIR, slug, '01-source'));
    expect(
      r,
      `drift in ${slug}: ${JSON.stringify({
        changed: r.changed,
        missing: r.missing,
        added: r.added,
        manifestMissing: r.manifestMissing,
      })}`
    ).toMatchObject({ ok: true });
  });
});

describe('F2 enumeration does not drop a book when only one side survives', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'source-manifest-baseline-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('CNXML deleted, manifest remains: still enumerated, verify goes red', () => {
    const slug = 'book-cnxml-deleted';
    const sourceDir = join(tmp, slug, '01-source');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(
      join(sourceDir, MANIFEST_NAME),
      JSON.stringify({
        version: 1,
        book: slug,
        algorithm: 'sha256',
        files: { 'ch01/m001.cnxml': 'a'.repeat(64) },
      })
    );
    // No CNXML on disk — simulates an emptied 01-source.

    expect(guardedBooks(tmp)).toContain(slug);

    const r = verifySourceManifest(sourceDir);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('ch01/m001.cnxml');
  });

  it('manifest deleted, CNXML remains: still enumerated, verify goes red', () => {
    const slug = 'book-manifest-deleted';
    const chDir = join(tmp, slug, '01-source', 'ch01');
    mkdirSync(chDir, { recursive: true });
    writeFileSync(join(chDir, 'm001.cnxml'), '<document id="m001"/>');
    // No .source-manifest.json.

    expect(guardedBooks(tmp)).toContain(slug);

    const r = verifySourceManifest(join(tmp, slug, '01-source'));
    expect(r.ok).toBe(false);
    expect(r.manifestMissing).toBe(true);
  });

  it('both deleted: drops out of enumeration (declared out of model)', () => {
    const slug = 'book-both-gone';
    mkdirSync(join(tmp, slug, '01-source'), { recursive: true });
    expect(guardedBooks(tmp)).not.toContain(slug);
  });

  it('a book with neither side (the __e2e-fixture__ shape) stays excluded', () => {
    mkdirSync(join(tmp, '__e2e-fixture__'), { recursive: true }); // no 01-source at all
    expect(guardedBooks(tmp)).not.toContain('__e2e-fixture__');
  });
});
