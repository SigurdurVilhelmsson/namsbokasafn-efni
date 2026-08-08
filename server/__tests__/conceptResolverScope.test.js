// server/__tests__/conceptResolverScope.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildScope } = require('../lib/conceptResolver');

/** A registered book with no priority rows — the 'no-priorities' case. */
function registerBare(db, slug) {
  // ⚠️ registered_books has THREE NOT NULL, no-default columns: slug, title_is,
  // registered_by (migration 003). Supply all three. This is the same class of
  // bug as §C35, where migration 019 registers two books WITHOUT registered_by
  // and its INSERT OR IGNORE silently discards them — which is why only
  // lifraen-efnafraedi and edlisfraedi-2e exist on a fresh migrated DB.
  db.prepare(
    "INSERT INTO registered_books (slug, title_is, registered_by) VALUES (?, ?, 'test')"
  ).run(slug, slug);
  const { id } = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
  db.prepare('DELETE FROM book_domain_priority WHERE book_id = ?').run(id);
  return id;
}

describe('buildScope — D3, an unscoped book names WHICH fault', () => {
  it('returns unscoped:"unregistered" when the slug has no registered_books row', () => {
    const { db } = freshMigratedDb();
    expect(buildScope(db, 'no-such-book')).toEqual({ unscoped: 'unregistered' });
    db.close();
  });

  it('returns unscoped:"no-priorities" when registered with zero priority rows', () => {
    const { db } = freshMigratedDb();
    registerBare(db, 'bok-an-forgangs');
    expect(buildScope(db, 'bok-an-forgangs')).toEqual({ unscoped: 'no-priorities' });
    db.close();
  });

  it('CONTROL: the two causes are distinguishable, not one boolean', () => {
    const { db } = freshMigratedDb();
    registerBare(db, 'bok-an-forgangs');
    const a = buildScope(db, 'no-such-book').unscoped;
    const b = buildScope(db, 'bok-an-forgangs').unscoped;
    expect(a).not.toBe(b);
    db.close();
  });

  it('a book WITH priority rows is not unscoped', () => {
    const { db } = freshMigratedDb();
    // edlisfraedi-2e is one of the two books a fresh clone actually registers (§C35).
    const scope = buildScope(db, 'edlisfraedi-2e');
    expect(scope.unscoped).toBe(false);
    expect(scope.positionOf.get('physics')).toBe(1);
    db.close();
  });
});
