import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const svc = require('../services/figureReviewService');
const {
  readSidecar,
  effectiveState,
  COMPOSER_VERSION,
} = require('../../tools/lib/figure-text-sidecar.cjs');

let db, bookId, bookDir;
const MT = { Celsius: 'Selsíus', 'Boiling|point|of water': 'Suðumark vatns' };

beforeEach(() => {
  ({ db } = freshMigratedDb());
  // ⚠️ NOT 'efnafraedi-2e' verbatim: migration 049 pre-seeds that slug into
  // registered_books on every freshMigratedDb(), so a hardcoded literal here
  // collides on the UNIQUE constraint. Same fix figureReviewMigration.test.js
  // (task 4, same table family) already uses for the identical collision.
  bookId = db
    .prepare(
      `INSERT INTO registered_books (slug, title_is, registered_by) VALUES (?,?,?) RETURNING id`
    )
    .get(`efnafraedi-2e-${Math.random()}`, 'Efnafræði', 't').id;
  db.prepare(
    `INSERT INTO figure_review (book_id, chapter, module_id, basename) VALUES (?,?,?,?)`
  ).run(bookId, 1, 'm68683', 'CNX_T');
  bookDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'figsvc-')), 'efnafraedi-2e');
  fs.mkdirSync(bookDir, { recursive: true });
});
afterEach(() => {
  db.close();
  fs.rmSync(path.dirname(bookDir), { recursive: true, force: true });
});

describe('saveBlockEdit', () => {
  it('overlays the editor text on the MT text', () => {
    svc.saveBlockEdit(db, {
      bookId,
      basename: 'CNX_T',
      blockKey: 'Celsius',
      isText: 'Celsíus',
      editedBy: 'ed',
    });
    const f = svc.getFigure(db, bookId, 'CNX_T', MT);
    expect(f.blocks.Celsius).toBe('Celsíus');
    expect(f.blocks['Boiling|point|of water']).toBe('Suðumark vatns'); // untouched MT survives
  });
});

describe('approval and staleness', () => {
  it('an approved figure reports approved', () => {
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).effectiveState).toBe('approved');
  });

  it('EDITING AFTER APPROVAL sends the figure back to mt-preview', () => {
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).effectiveState).toBe('approved'); // control
    svc.saveBlockEdit(db, {
      bookId,
      basename: 'CNX_T',
      blockKey: 'Celsius',
      isText: 'Celsíus',
      editedBy: 'ed',
    });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).effectiveState).toBe('mt-preview');
  });

  it('re-approving after the edit restores approved', () => {
    svc.saveBlockEdit(db, {
      bookId,
      basename: 'CNX_T',
      blockKey: 'Celsius',
      isText: 'Celsíus',
      editedBy: 'ed',
    });
    const blocks = svc.getFigure(db, bookId, 'CNX_T', MT).blocks;
    svc.setState(db, { bookId, basename: 'CNX_T', state: 'approved', reviewedBy: 'ed', blocks });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).effectiveState).toBe('approved');
  });
});

describe('applyApprovedFigureEdits', () => {
  it('writes a committed sidecar the renderer can read', () => {
    svc.saveBlockEdit(db, {
      bookId,
      basename: 'CNX_T',
      blockKey: 'Celsius',
      isText: 'Celsíus',
      editedBy: 'ed',
    });
    const blocks = svc.getFigure(db, bookId, 'CNX_T', MT).blocks;
    svc.setState(db, { bookId, basename: 'CNX_T', state: 'approved', reviewedBy: 'ed', blocks });
    const { written } = svc.applyApprovedFigureEdits(db, {
      bookDir,
      bookId,
      basename: 'CNX_T',
      mtBlocks: MT,
    });
    expect(written).toBe(true);
    const side = readSidecar(bookDir, 'CNX_T');
    expect(side.blocks.Celsius).toBe('Celsíus');
    expect(effectiveState(side, side.blocks, COMPOSER_VERSION)).toBe('approved');
  });
});
