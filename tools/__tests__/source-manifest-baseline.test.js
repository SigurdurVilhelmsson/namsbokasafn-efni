import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifySourceManifest, listCnxmlFiles } = require('../lib/source-manifest.cjs');

const BOOKS_DIR = join(import.meta.dirname, '..', '..', 'books');

function populatedBooks() {
  if (!existsSync(BOOKS_DIR)) return [];
  return readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => listCnxmlFiles(join(BOOKS_DIR, slug, '01-source')).length > 0);
}

describe('F2 source-manifest baseline (real tree)', () => {
  const books = populatedBooks();

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
