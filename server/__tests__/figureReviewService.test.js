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
  writeSidecar,
  editorialState,
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

/**
 * ⚠️ These assert `editorialState`, not `effectiveState`, and the change is
 * deliberate rather than a weakening. Their subject is the EDITORIAL fact — did
 * an editor approve these exact blocks, and does an edit undo that — which is
 * exactly what editorialState answers and what applyApprovedFigureEdits writes.
 * Whether the published SVG was then composed is a separate question, gated
 * separately, and covered by its own describe below.
 */
describe('approval and staleness (the editorial layer)', () => {
  it('an approved figure reports approved', () => {
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).editorialState).toBe('approved');
  });

  it('EDITING AFTER APPROVAL sends the figure back to mt-preview', () => {
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).editorialState).toBe('approved'); // control
    svc.saveBlockEdit(db, {
      bookId,
      basename: 'CNX_T',
      blockKey: 'Celsius',
      isText: 'Celsíus',
      editedBy: 'ed',
    });
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).editorialState).toBe('mt-preview');
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
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).editorialState).toBe('approved');
  });
});

/**
 * [USER] ruling C, 2026-09-04. "Approved" must mean the PUBLISHED IMAGE carries
 * approved text. Nothing in the server invokes the composer — compose.py is run
 * by hand — so an approval alone leaves the SVG on disk unchanged.
 *
 * composedHash reaches getFigure from the SIDECAR (the composer's channel); the
 * DB owns state and render_hash (the editor's). Merging them at the point of
 * derivation is what lets one function answer "is what readers see approved?".
 */
describe('the composed gate (what the card and the renderer show)', () => {
  const approve = () =>
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });

  it('approved but NEVER COMPOSED is mt-preview — while the editorial layer still says approved', () => {
    approve();
    const fig = svc.getFigure(db, bookId, 'CNX_T', MT);
    expect(fig.editorialState).toBe('approved'); // the approval is real and recorded
    expect(fig.effectiveState).toBe('mt-preview'); // ...but no reader can see it yet
  });

  it('approved AND composed from the same blocks is approved', () => {
    approve();
    const composed = svc.getFigure(db, bookId, 'CNX_T', MT).renderHash;
    expect(composed).toBeTruthy(); // control: a null hash would make the next line vacuous
    expect(svc.getFigure(db, bookId, 'CNX_T', MT, composed).effectiveState).toBe('approved');
  });

  it('a STALE composedHash is mt-preview — the SVG came from older blocks', () => {
    approve();
    expect(svc.getFigure(db, bookId, 'CNX_T', MT, 'from-an-older-compose').effectiveState).toBe(
      'mt-preview'
    );
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
    // The APPROVAL reaches the renderer's only channel...
    expect(side.state).toBe('approved');
    expect(editorialState(side, side.blocks, COMPOSER_VERSION)).toBe('approved');
    // ...but the published SVG has not been recomposed, so no reader sees
    // approved text yet. [USER] ruling C: approve → mt-preview → compose →
    // approved. This assertion is the inversion, and it must not be "fixed".
    expect(side.composedHash).toBeUndefined();
    expect(effectiveState(side, side.blocks, COMPOSER_VERSION)).toBe('mt-preview');
  });

  it('CARRIES composedHash FORWARD — a re-approval must not un-compose the figure', () => {
    // 🔴 The silent failure this pins: applyApprovedFigureEdits rebuilds the
    // whole sidecar, and composedHash is written by compose.py and by nothing
    // on this side. Dropping it would send every composed figure back to
    // mt-preview on the next approval, with no error and no failing count —
    // the only symptom a badge that never turns green.
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });
    svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'CNX_T', mtBlocks: MT });

    // Stand in for the composer: stamp the sidecar the way figtext does.
    const first = readSidecar(bookDir, 'CNX_T');
    writeSidecar(bookDir, 'CNX_T', { ...first, composedHash: first.renderHash });
    expect(effectiveState(readSidecar(bookDir, 'CNX_T'), first.blocks, COMPOSER_VERSION)).toBe(
      'approved'
    ); // control: the gate really opened

    // Re-approve the SAME blocks — the ordinary "editor clicks approve again".
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });
    svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'CNX_T', mtBlocks: MT });

    const after = readSidecar(bookDir, 'CNX_T');
    expect(after.composedHash).toBe(first.renderHash);
    expect(effectiveState(after, after.blocks, COMPOSER_VERSION)).toBe('approved');
  });

  it('SURVIVES A FLAG IN BETWEEN — flag, then re-approve, and the figure is still composed', () => {
    // The realistic sequence, and the one the approve→approve test above cannot
    // see: an editor flags a figure, someone looks at it, the flag is lifted.
    // setState writes render_hash=NULL for a flag, so if applyApprovedFigureEdits
    // took its composedHash from anywhere but the sidecar, the stamp would be
    // lost here and the figure would need a pointless recompose.
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });
    svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'CNX_T', mtBlocks: MT });
    const first = readSidecar(bookDir, 'CNX_T');
    writeSidecar(bookDir, 'CNX_T', { ...first, composedHash: first.renderHash });

    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'flagged',
      flagKind: 'text',
      reviewedBy: 'ed',
      blocks: MT,
    });
    svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'CNX_T', mtBlocks: MT });
    const flagged = readSidecar(bookDir, 'CNX_T');
    expect(flagged.state).toBe('flagged'); // control: the flag really reached the sidecar
    expect(flagged.composedHash).toBe(first.renderHash); // ...and did not eat the stamp

    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });
    svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'CNX_T', mtBlocks: MT });
    const after = readSidecar(bookDir, 'CNX_T');
    expect(effectiveState(after, after.blocks, COMPOSER_VERSION)).toBe('approved');
  });

  it('a carried-forward composedHash still DEMOTES when the blocks changed', () => {
    // The mirror of the test above, and it is not symmetric by luck: carrying
    // the value forward is safe precisely because renderHash moves with the
    // blocks, so a stale composedHash stops matching on its own.
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });
    svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'CNX_T', mtBlocks: MT });
    const first = readSidecar(bookDir, 'CNX_T');
    writeSidecar(bookDir, 'CNX_T', { ...first, composedHash: first.renderHash });

    const changedMT = { ...MT, Celsius: 'NÝ ÞÝÐING' };
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: changedMT,
    });
    svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'CNX_T', mtBlocks: changedMT });

    const after = readSidecar(bookDir, 'CNX_T');
    expect(after.composedHash).toBe(first.renderHash); // carried forward...
    expect(after.renderHash).not.toBe(first.renderHash); // ...but no longer current
    expect(effectiveState(after, after.blocks, COMPOSER_VERSION)).toBe('mt-preview');
  });

  // FINDING 2: applyApprovedFigureEdits must write a DERIVED state, never the
  // raw fig.state — otherwise a figure whose blocks changed since its last real
  // approval gets stamped 'approved' over never-reviewed content, with a
  // self-consistent hash, and the renderer shows it unbadged.
  // ⚠️ The derived value is fig.editorialState (2026-09-04, ruling C). It was
  // fig.effectiveState, and effectiveState is now gated on composedHash — using
  // it here would write 'mt-preview' on every approval and make 'approved'
  // unreachable forever.
  it('does not launder stale content as approved when blocks changed since approval', () => {
    // No figure_block_edit rows at all in this test — Finding 1's orphan
    // handling must not be able to interfere with this assertion.
    svc.setState(db, {
      bookId,
      basename: 'CNX_T',
      state: 'approved',
      reviewedBy: 'ed',
      blocks: MT,
    });

    // Control: approved over the SAME (unchanged) blocks reads approved.
    expect(svc.getFigure(db, bookId, 'CNX_T', MT).editorialState).toBe('approved');

    // The English/MT block content changed since approval (e.g. re-translated
    // upstream) — same block_key, new text. Derived staleness must catch this.
    const changedMT = { ...MT, Celsius: 'ÖNNUR ÞÝÐING SEM ALDREI VAR SAMÞYKKT' };
    expect(svc.getFigure(db, bookId, 'CNX_T', changedMT).editorialState).toBe('mt-preview');

    const { written } = svc.applyApprovedFigureEdits(db, {
      bookDir,
      bookId,
      basename: 'CNX_T',
      mtBlocks: changedMT,
    });
    expect(written).toBe(true);
    const side = readSidecar(bookDir, 'CNX_T');
    // The unreviewed text is written (best-effort, per project rule) — but it
    // must NOT be stamped approved.
    expect(side.blocks.Celsius).toBe('ÖNNUR ÞÝÐING SEM ALDREI VAR SAMÞYKKT');
    expect(side.state).toBe('mt-preview');
    expect(effectiveState(side, side.blocks, COMPOSER_VERSION)).toBe('mt-preview');
  });
});

// FINDING 1: resolveBlocks must not inject an edit whose block_key no longer
// exists in mtBlocks (the English changed, so the content-addressed key
// changed) — such an edit is an orphan and must be reported, not merged in.
describe('orphaned block edits', () => {
  it('drops an orphaned edit from blocks and reports it, while a non-orphaned edit still overlays and a plain MT block survives', () => {
    svc.saveBlockEdit(db, {
      bookId,
      basename: 'CNX_T',
      blockKey: 'Celsius',
      isText: 'Celsíus',
      editedBy: 'ed',
    });
    svc.saveBlockEdit(db, {
      bookId,
      basename: 'CNX_T',
      blockKey: 'GoneKey',
      isText: 'Horfið',
      editedBy: 'ed',
    });

    const f = svc.getFigure(db, bookId, 'CNX_T', MT);

    expect(f.blocks.Celsius).toBe('Celsíus'); // non-orphaned edit still overlays
    expect(f.blocks['Boiling|point|of water']).toBe('Suðumark vatns'); // plain MT block survives
    expect(f.blocks.GoneKey).toBeUndefined(); // orphan must not leak into blocks
    expect(Object.keys(f.blocks).sort()).toEqual(['Boiling|point|of water', 'Celsius']);
    expect(f.orphans).toEqual(['GoneKey']);
  });
});
