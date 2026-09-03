/**
 * Figure-text review: workflow state in the DB, content in a committed sidecar.
 *
 * ⚠️ Staleness is DERIVED, never stored. An approved figure whose blocks have
 * since changed reports mt-preview automatically — there is no second row to
 * keep in sync and nothing to remember to clear.
 */
const path = require('path');
const {
  computeRenderHash,
  effectiveState,
  writeSidecar,
  sidecarPath,
  SIDECAR_VERSION,
  COMPOSER_VERSION,
} = require(path.join(__dirname, '..', '..', 'tools', 'lib', 'figure-text-sidecar.cjs'));

/** MT text overlaid with any editor corrections. Editor wins. */
function resolveBlocks(db, bookId, basename, mtBlocks) {
  const blocks = { ...mtBlocks };
  const rows = db
    .prepare(`SELECT block_key, is_text FROM figure_block_edit WHERE book_id=? AND basename=?`)
    .all(bookId, basename);
  for (const r of rows) blocks[r.block_key] = r.is_text;
  return blocks;
}

function getFigure(db, bookId, basename, mtBlocks = {}) {
  const row = db
    .prepare(
      `SELECT state, render_hash, flag_kind, note, reviewed_by, reviewed_at
       FROM figure_review WHERE book_id=? AND basename=?`
    )
    .get(bookId, basename);
  if (!row) return null;
  const blocks = resolveBlocks(db, bookId, basename, mtBlocks);
  return {
    state: row.state,
    renderHash: row.render_hash,
    flagKind: row.flag_kind,
    note: row.note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    blocks,
    effectiveState: effectiveState(
      { state: row.state, renderHash: row.render_hash },
      blocks,
      COMPOSER_VERSION
    ),
  };
}

function saveBlockEdit(db, { bookId, basename, blockKey, isText, editedBy }) {
  db.prepare(
    `INSERT INTO figure_block_edit (book_id, basename, block_key, is_text, edited_by, edited_at)
     VALUES (?,?,?,?,?,datetime('now'))
     ON CONFLICT(book_id, basename, block_key)
     DO UPDATE SET is_text=excluded.is_text, edited_by=excluded.edited_by,
                   edited_at=excluded.edited_at`
  ).run(bookId, basename, blockKey, isText, editedBy || null);
}

function setState(db, { bookId, basename, state, flagKind, note, reviewedBy, blocks }) {
  const hash = state === 'approved' ? computeRenderHash(blocks || {}, COMPOSER_VERSION) : null;
  db.prepare(
    `UPDATE figure_review
        SET state=?, render_hash=?, flag_kind=?, note=?, reviewed_by=?, reviewed_at=datetime('now')
      WHERE book_id=? AND basename=?`
  ).run(state, hash, flagKind || null, note || null, reviewedBy || null, bookId, basename);
}

/**
 * Write the committed sidecar. Mirrors applyApprovedEdits() -> 03-faithful-translation:
 * the DB holds workflow, the repo holds content.
 */
function applyApprovedFigureEdits(db, { bookDir, bookId, basename, mtBlocks }) {
  const fig = getFigure(db, bookId, basename, mtBlocks);
  if (!fig) return { written: false, path: null };
  const data = {
    version: SIDECAR_VERSION,
    basename,
    state: fig.state,
    renderHash: computeRenderHash(fig.blocks, COMPOSER_VERSION),
    composerVersion: COMPOSER_VERSION,
    blocks: fig.blocks,
  };
  writeSidecar(bookDir, basename, data);
  return { written: true, path: sidecarPath(bookDir, basename) };
}

module.exports = { getFigure, saveBlockEdit, setState, applyApprovedFigureEdits };
