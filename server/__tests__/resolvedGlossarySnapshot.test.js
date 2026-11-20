// server/__tests__/resolvedGlossarySnapshot.test.js
//
// The resolved-glossary build must read one snapshot: buildScope loads the global book-owned map
// once, while each resolve() runs live candidate queries, so another book's commit mid-build
// could otherwise leak into this book's export (register §C241 F3).
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildResolvedGlossary } = require('../lib/resolvedGlossary');
const { addEntry } = require('../lib/bookGlossaryLayer');

const handles = [];
afterEach(() => {
  while (handles.length) handles.pop().close();
});

function seedConcept(db, domain, en, is) {
  const id = db
    .prepare("INSERT INTO concept (domain, collection) VALUES (?, 'TEST')")
    .run(domain).lastInsertRowid;
  const term = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, ?, ?, 1, 'test')"
  );
  term.run(id, 'en', en);
  term.run(id, 'is', is);
}

describe('buildResolvedGlossary snapshot', () => {
  it("a commit by another book during the build does not reach this book's export", () => {
    const { db: writer, path: dbPath } = freshMigratedDb();
    handles.push(writer);
    writer.pragma('journal_mode = WAL');
    const slugs = writer
      .prepare('SELECT slug FROM registered_books')
      .all()
      .map((r) => r.slug);
    expect(slugs).toContain('edlisfraedi-2e');
    expect(slugs).toContain('efnafraedi-2e');
    seedConcept(writer, 'biology', 'zcell', 'zlif');

    const reader = new Database(dbPath, { readonly: true });
    handles.push(reader);

    const strings = ['zcell'];
    strings[Symbol.iterator] = function* () {
      addEntry(writer, {
        book: 'edlisfraedi-2e',
        english: ['zcell'],
        icelandic: 'zphys',
        reason: 'r',
        source: '',
        by: 't',
      });
      yield* Array.prototype.values.call(this);
    };

    const { terms } = buildResolvedGlossary(reader, 'efnafraedi-2e', {
      census: { strings, filesRead: 1, root: 'x' },
    });

    // Control: the other book's commit really happened during the build.
    expect(writer.prepare('SELECT COUNT(*) n FROM book_glossary_entry').get().n).toBe(1);
    expect(terms.find((t) => t.english === 'zcell').icelandic).toBe('zlif');
  });

  it('UNSCOPED and EMPTY_CENSUS still throw with their codes through the transaction', () => {
    const { db } = freshMigratedDb();
    handles.push(db);
    expect(() =>
      buildResolvedGlossary(db, 'no-such-book', {
        census: { strings: ['a'], filesRead: 1, root: 'x' },
      })
    ).toThrow(expect.objectContaining({ code: 'UNSCOPED', unscoped: 'unregistered' }));
    expect(() =>
      buildResolvedGlossary(db, 'efnafraedi-2e', {
        census: { strings: [], filesRead: 0, root: 'x' },
      })
    ).toThrow(expect.objectContaining({ code: 'EMPTY_CENSUS' }));
  });
});
