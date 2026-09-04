import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');

let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
});
afterEach(() => db.close());

const bookId = () =>
  db
    .prepare(
      `INSERT INTO registered_books (slug, title_is, registered_by) VALUES (?,?,?) RETURNING id`
    )
    .get(`b-${Math.random()}`, 'T', 'tester').id;

describe('050 figure_review', () => {
  it('creates both tables', () => {
    const names = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('figure_review','figure_block_edit')`
      )
      .all()
      .map((r) => r.name)
      .sort();
    expect(names).toEqual(['figure_block_edit', 'figure_review']);
  });

  it('defaults a new figure to mt-preview', () => {
    const b = bookId();
    db.prepare(
      `INSERT INTO figure_review (book_id, chapter, module_id, basename) VALUES (?,?,?,?)`
    ).run(b, 1, 'm68683', 'CNX_A');
    expect(db.prepare(`SELECT state FROM figure_review WHERE basename='CNX_A'`).get().state).toBe(
      'mt-preview'
    );
  });

  it('cascades both tables when a book is deleted', () => {
    const b = bookId();
    db.prepare(
      `INSERT INTO figure_review (book_id, chapter, module_id, basename) VALUES (?,?,?,?)`
    ).run(b, 1, 'm1', 'CNX_B');
    db.prepare(
      `INSERT INTO figure_block_edit (book_id, basename, block_key, is_text) VALUES (?,?,?,?)`
    ).run(b, 'CNX_B', 'Celsius', 'Celsíus');
    // non-vacuity: the rows must exist before we prove they go away
    expect(db.prepare(`SELECT COUNT(*) c FROM figure_review`).get().c).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) c FROM figure_block_edit`).get().c).toBe(1);
    db.prepare(`DELETE FROM registered_books WHERE id=?`).run(b);
    expect(db.prepare(`SELECT COUNT(*) c FROM figure_review`).get().c).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) c FROM figure_block_edit`).get().c).toBe(0);
  });

  it('rejects a row for a book that does not exist', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO figure_review (book_id, chapter, module_id, basename) VALUES (?,?,?,?)`
        )
        .run(999999, 1, 'm1', 'CNX_C')
    ).toThrow(/FOREIGN KEY/);
  });

  it('is idempotent — running up() twice does not throw', () => {
    const m = require('../migrations/050-figure-review.js');
    expect(() => {
      m.up(db);
      m.up(db);
    }).not.toThrow();
  });
});
