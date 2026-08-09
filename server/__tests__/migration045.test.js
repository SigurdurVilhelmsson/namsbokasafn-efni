// server/__tests__/migration045.test.js
//
// ⚠️ This file tests migration 045 IN ISOLATION — beforeEach runs only
// `migration045.up(db)`, never 048. That is deliberate: it is the only way to
// pin what 045 itself does. But 045's `book_concept_preference` does NOT
// survive into a real migrated database: migration 048 runs immediately
// after it and replaces it with `book_term_preference`, keyed on the English
// string instead of `concept_id` (register §C36 B4a, §C38). The two
// `book_concept_preference` cases below ("allows one preference per book,
// chapter and concept" / "allows a chapter override alongside the book
// default") are true of 045 in isolation and stay for that reason — do not
// read them as describing production. For the live schema, see
// `book_term_preference`'s coverage in migration048.test.js and
// importConcepts.test.js.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const __dirname = dirname(fileURLToPath(import.meta.url));

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);
           INSERT INTO registered_books (id, slug) VALUES (1, 'efnafraedi-2e');`);
  migration045.up(db);
});
afterEach(() => db.close());

const insertConcept = (domain = 'chemistry', oid = 111) =>
  db
    .prepare('INSERT INTO concept (domain, idordabanki_id, collection) VALUES (?,?,?)')
    .run(domain, oid, 'EFNAFR').lastInsertRowid;

describe('migration 045 concept model', () => {
  it('creates a concept row', () => {
    const id = insertConcept();
    expect(db.prepare('SELECT domain FROM concept WHERE id=?').get(id).domain).toBe('chemistry');
  });

  it('rejects a second concept claiming the same Íðorðabankinn entry', () => {
    insertConcept('chemistry', 999);
    expect(() => insertConcept('biology', 999)).toThrow();
  });

  it('allows many concepts with no Íðorðabankinn id (project-originated)', () => {
    db.prepare('INSERT INTO concept (domain) VALUES (?)').run('chemistry');
    expect(() =>
      db.prepare('INSERT INTO concept (domain) VALUES (?)').run('biology')
    ).not.toThrow();
  });

  it('accepts a Latin term — PODDUR has no English side', () => {
    const c = insertConcept();
    expect(() =>
      db
        .prepare(
          'INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)'
        )
        .run(c, 'la', 'Drosophila melanogaster', 1, 'idordabankinn')
    ).not.toThrow();
  });

  it('rejects a language outside en/is/la', () => {
    const c = insertConcept();
    expect(() =>
      db
        .prepare(
          'INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)'
        )
        .run(c, 'de', 'Ensete', 1, 'idordabankinn')
    ).toThrow();
  });

  it('rejects a duplicate term within one concept and language', () => {
    const c = insertConcept();
    const ins = db.prepare(
      'INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)'
    );
    ins.run(c, 'is', 'frumeind', 1, 'idordabankinn');
    expect(() => ins.run(c, 'is', 'frumeind', 2, 'idordabankinn')).toThrow();
  });

  it('deletes a concept’s terms with it', () => {
    const c = insertConcept();
    db.prepare(
      'INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)'
    ).run(c, 'is', 'frumeind', 1, 'idordabankinn');
    db.prepare('DELETE FROM concept WHERE id=?').run(c);
    expect(db.prepare('SELECT COUNT(*) n FROM concept_term').get().n).toBe(0);
  });

  // 045 creates book_concept_preference; 048 replaces it with
  // book_term_preference before any real boot reaches production code. True
  // of 045 in isolation only — see the file-header note above.
  it('allows one preference per book, chapter and concept', () => {
    const c = insertConcept();
    const t = db
      .prepare('INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)')
      .run(c, 'is', 'frumeind', 1, 'idordabankinn').lastInsertRowid;
    const ins = db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?,?,?,?)'
    );
    ins.run(1, 0, c, t);
    expect(() => ins.run(1, 0, c, t)).toThrow();
  });

  it('allows a chapter override alongside the book default', () => {
    const c = insertConcept();
    const t = db
      .prepare('INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)')
      .run(c, 'is', 'frumeind', 1, 'idordabankinn').lastInsertRowid;
    const ins = db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?,?,?,?)'
    );
    ins.run(1, 0, c, t);
    expect(() => ins.run(1, 17, c, t)).not.toThrow();
  });

  it('orders domains per book', () => {
    const ins = db.prepare(
      'INSERT INTO book_domain_priority (book_id, domain, position) VALUES (?,?,?)'
    );
    ins.run(1, 'chemistry', 1);
    ins.run(1, 'physics', 2);
    const rows = db
      .prepare('SELECT domain FROM book_domain_priority WHERE book_id=1 ORDER BY position')
      .all();
    expect(rows.map((r) => r.domain)).toEqual(['chemistry', 'physics']);
  });

  it('is idempotent across a re-run', () => {
    expect(() => migration045.up(db)).not.toThrow();
  });

  it('does not touch the existing terminology tables', () => {
    // Part A adds beside; it removes nothing. This is the guard on that promise.
    const src = readFileSync(join(__dirname, '..', 'migrations', '045-concept-model.js'), 'utf-8');
    expect(src).not.toMatch(/DROP\s+TABLE/i);
  });

  it('is registered in migrationRunner, by its full module path', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain("require('../migrations/045-concept-model')");
  });
});
