/**
 * Figure-text review: workflow state in the DB, content in a committed sidecar.
 *
 * ⚠️ Staleness is DERIVED, never stored. An approved figure whose blocks have
 * since changed reports mt-preview automatically — there is no second row to
 * keep in sync and nothing to remember to clear.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const segmentParser = require('./segmentParser');
const {
  computeRenderHash,
  effectiveState,
  readSidecar,
  writeSidecar,
  sidecarPath,
  SIDECAR_VERSION,
  COMPOSER_VERSION,
} = require(path.join(__dirname, '..', '..', 'tools', 'lib', 'figure-text-sidecar.cjs'));
// server/ (AGPL) -> tools/lib (MIT) is the PERMITTED import direction; the
// reverse would not be. Same edge the sidecar require above already crosses.
const { decimalSeparatorWarnings, captionDivergence } = require(
  path.join(__dirname, '..', '..', 'tools', 'lib', 'figure-consistency.cjs')
);
const { loadImageBasenameMap } = require(
  path.join(__dirname, '..', '..', 'tools', 'lib', 'image-basename-map.cjs')
);

/**
 * Every function below takes `db` explicitly so a test can inject a temp
 * database. Routes have no such handle, so one lazy shared connection lives
 * here — the same shape segmentEditorService and routes/my-work use.
 * resolveDbPath() is called lazily, not at module load, so requiring this
 * service has no side effect and a test can still set SESSIONS_DB_PATH.
 */
let _db;
function getDb() {
  if (!_db) {
    const dbPath = resolveDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

/**
 * The two enums migration 050 declares as CHECK constraints. Kept beside the
 * code that writes those columns so a route can answer 400 instead of letting
 * SQLite throw a 500 — and pinned against the LIVE table definition by
 * figureReviewRoutes.test.js, so this is a checked property rather than a
 * second enumeration free to drift.
 */
const FIGURE_STATES = ['mt-preview', 'approved', 'flagged'];
const FIGURE_FLAG_KINDS = ['text', 'terminology', 'layout', 'other'];

/**
 * `books/<slug>` — the shape sidecarPath() and applyApprovedFigureEdits() want.
 * Read through segmentParser so a test's _setTestBooksDir() redirects this too,
 * and so the root is resolved from __dirname rather than process.cwd() (the
 * server runs with cwd=server/).
 */
function bookDirFor(bookSlug) {
  return path.join(segmentParser.BOOKS_DIR, bookSlug);
}

/**
 * The translated image for an ENGLISH figure basename, or null.
 *
 * 🔴 Resolved FORWARD through books/<slug>/media/image-mapping.json, never by
 * string-building a suffix. `_IS` is an enforceable value owned by
 * tools/generate-image-mapping.js's DEFAULT_SUFFIX and pinned against the
 * committed corpus by its own test; per CLAUDE.md it is read from its owner and
 * never restated. This is the exact inverse of cnxml-render's
 * sidecarBasenameForSrc, which walks the same map the other way.
 *
 * ⚠️ Returns {root, name} rather than a joined path so the caller can hand it
 * to res.sendFile(name, {root}) — send() applies its dotfiles policy to the
 * WHOLE path it is given, so an absolute path re-opens the trap that bit
 * views.js twice (dd6c366b, dc94fc52). The confinement is a side effect worth
 * having: `root` is derived here from the book dir, never from user input.
 *
 * ⚠️ NOT cached. cnxml-render caches this map per book dir, which is right for
 * a one-shot CLI and wrong for a process that outlives a re-run of
 * generate-image-mapping.js. The cost is bounded by the caller: only figures
 * that already have a sidecar ever reach it, and there are three in the whole
 * corpus today against ~1,500 plain OpenStax figures.
 *
 * @returns {{root:string, name:string}|null} null when the figure is unmapped
 *   OR the mapped file is not on disk — a figure whose image has not been
 *   composed yet legitimately has no image to show.
 */
function translatedImageFor(bookDir, basename) {
  const entry = loadImageBasenameMap(bookDir).find((e) => e.originalImage === basename);
  if (!entry) return null;
  const root = path.join(bookDir, 'media');
  if (!fs.existsSync(path.join(root, entry.outputName))) return null;
  return { root, name: entry.outputName };
}

/** The numeric id the figure tables key on. null when the book is unregistered. */
function lookupBookId(db, bookSlug) {
  const row = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
  return row ? row.id : null;
}

/**
 * MT text overlaid with any editor corrections. Editor wins — but only for a
 * block_key that still exists in mtBlocks. If the English changed, the
 * content-addressed block_key changed with it, and an edit keyed on the old
 * one is orphaned: it must not be merged into blocks (it would ride into the
 * render hash and the committed sidecar as a phantom block), but the row
 * stays in the database and is reported so it can be surfaced to an editor.
 */
function resolveBlocks(db, bookId, basename, mtBlocks) {
  const blocks = { ...mtBlocks };
  const rows = db
    .prepare(`SELECT block_key, is_text FROM figure_block_edit WHERE book_id=? AND basename=?`)
    .all(bookId, basename);
  const orphans = [];
  for (const r of rows) {
    if (Object.prototype.hasOwnProperty.call(mtBlocks, r.block_key)) {
      blocks[r.block_key] = r.is_text;
    } else {
      orphans.push(r.block_key);
    }
  }
  return { blocks, orphans };
}

function getFigure(db, bookId, basename, mtBlocks = {}) {
  const row = db
    .prepare(
      `SELECT state, render_hash, flag_kind, note, reviewed_by, reviewed_at
       FROM figure_review WHERE book_id=? AND basename=?`
    )
    .get(bookId, basename);
  if (!row) return null;
  const { blocks, orphans } = resolveBlocks(db, bookId, basename, mtBlocks);
  return {
    state: row.state,
    renderHash: row.render_hash,
    flagKind: row.flag_kind,
    note: row.note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    blocks,
    orphans,
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

/**
 * Every figure basename in a module, in document order, deduplicated.
 *
 * ⚠️ Figures nest arbitrarily (section > example > figure), so this walks the
 * whole structure tree rather than scanning one level. The basename idiom is a
 * plain `path.basename(src, extname(src))`, so
 * `../../media/CNX_Chem_01_01_ChemWeb.jpg` -> `CNX_Chem_01_01_ChemWeb`.
 *
 * 🔴 DO NOT "UNIFY" THIS WITH THE RENDERER'S DERIVATION. This comment used to
 * say the idiom was identical to the renderer's, and that WAS true — which is
 * precisely why the review badge fired on zero production figures. The two
 * sides read different vintages of the same figure and must derive the key
 * differently:
 *   - HERE the input is 02-structure/, extracted from 01-source, so the src
 *     basename already IS the English one and a plain basename is correct.
 *   - the RENDERER's input is 03-translated/, cnxml-inject's OUTPUT, where a
 *     mapped `<image src>` has been swapped to the translated variant; it must
 *     invert books/<slug>/media/image-mapping.json first (see
 *     sidecarBasenameForSrc in cnxml-render.js).
 * Both then agree on the ENGLISH basename, which is the join key the sidecar
 * and applyApprovedFigureEdits are written against. Copying either derivation
 * onto the other side reintroduces the defect.
 *
 * Returns the caption/alt segment ids alongside, because the caller needs the
 * module's own prose as captionDivergence's reference text.
 *
 * @returns {Array<{basename:string, captionSegmentId:string|null, altSegmentId:string|null}>}
 *   Empty when the module has no structure file or no figures — never throws.
 */
function listModuleFigures(bookSlug, chapter, moduleId) {
  const paths = segmentParser.getModulePaths(bookSlug, chapter, moduleId);
  let structure;
  try {
    structure = JSON.parse(fs.readFileSync(paths.structure, 'utf-8'));
  } catch {
    return []; // absent or malformed: a module with no structure has no figures
  }
  const out = [];
  const seen = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'figure') {
      const src = node.media && node.media.src;
      if (typeof src === 'string' && src) {
        const basename = path.basename(src, path.extname(src));
        if (basename && !seen.has(basename)) {
          seen.add(basename);
          out.push({
            basename,
            captionSegmentId: (node.caption && node.caption.segmentId) || null,
            altSegmentId: (node.media.alt && node.media.alt.segmentId) || null,
          });
        }
      }
      // deliberately no early return: a figure may nest another figure
    }
    for (const v of Object.values(node)) visit(v);
  };
  visit(structure.content);
  return out;
}

/**
 * A figure's reviewable state, sidecar and DB row reconciled.
 *
 * ⚠️ Two different "nothings" here and they mean opposite things:
 *  - NO SIDECAR -> returns null, and the caller must SKIP the figure. It is the
 *    plain English OpenStax figure; there are ~1,500 of them and listing them as
 *    pending review would bury the handful that are real work. Same decision
 *    renderFigure makes in cnxml-render.js (the `if (sidecar)` guard).
 *  - NO figure_review ROW -> the NORMAL day-one state of a translated figure.
 *    getFigure() returns null for it, so fall back to the sidecar-derived state,
 *    which is the identical effectiveState() call renderFigure makes.
 *    Returning getFigure()'s null straight to the client would blank every
 *    never-reviewed figure.
 */
function resolveFigure(db, bookId, bookSlug, basename) {
  const sidecar = readSidecar(bookDirFor(bookSlug), basename);
  if (!sidecar) return null;
  const mtBlocks = sidecar.blocks || {};
  let fig = getFigure(db, bookId, basename, mtBlocks);
  if (!fig) {
    // ⚠️ The editor's corrections still apply here. figure_block_edit is keyed
    // on (book_id, basename) ALONE and needs no figure_review row, so an edit
    // saved before anyone has ever approved the figure — the ordinary order of
    // events — must overlay in this branch too. Handing back the raw sidecar
    // blocks would store the edit correctly and never show it, and no count
    // could see the difference: the block is present either way.
    const { blocks, orphans } = resolveBlocks(db, bookId, basename, mtBlocks);
    fig = {
      effectiveState: effectiveState(sidecar, blocks, COMPOSER_VERSION),
      blocks,
      orphans,
      note: null,
    };
  }
  return { sidecar, mtBlocks, fig };
}

/**
 * Mint the figure_review row if it is not there yet. setState() is an UPDATE and
 * deliberately stays one: it cannot create the row, because chapter/module_id are
 * NOT NULL on the table and the service is never told which module a basename
 * belongs to. The ROUTE is, so the row is minted from the route's own params.
 *
 * ⚠️ ON CONFLICT DO NOTHING, never an upsert. chapter/module_id record where the
 * figure was first reviewed, and idx_figure_review_module indexes them; a second
 * module reusing the same image must not silently rewrite that provenance.
 *
 * ⚠️ book_id is a LIVE foreign key (better-sqlite3 is compiled with
 * SQLITE_DEFAULT_FOREIGN_KEYS=1, so every REFERENCES in migration 050 is
 * enforced) and ON CONFLICT does not suppress an FK violation. An unregistered
 * book THROWS here — callers resolve the slug with lookupBookId() and 404 first.
 */
function ensureFigureRow(db, { bookId, chapter, moduleId, basename }) {
  db.prepare(
    `INSERT INTO figure_review (book_id, chapter, module_id, basename)
     VALUES (?,?,?,?)
     ON CONFLICT(book_id, basename) DO NOTHING`
  ).run(bookId, chapter, moduleId, basename);
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
    // effectiveState, never the raw fig.state: if the blocks changed since
    // the last real approval, this must write 'mt-preview' — writing the raw
    // DB column would stamp 'approved' over content nobody reviewed, with a
    // self-consistent hash, and the renderer would show it unbadged.
    state: fig.effectiveState,
    renderHash: computeRenderHash(fig.blocks, COMPOSER_VERSION),
    composerVersion: COMPOSER_VERSION,
    blocks: fig.blocks,
  };
  writeSidecar(bookDir, basename, data);
  return { written: true, path: sidecarPath(bookDir, basename) };
}

/**
 * The shape the client depends on. Exposes effectiveState ONLY — a client that
 * could see the stored `state` would show "approved" on a figure whose text has
 * since changed, which is exactly the staleness this design derives rather than
 * stores.
 *
 * @param {string} basename e.g. 'CNX_Chem_01_01_ChemWeb'
 * @param {{effectiveState:string, blocks:object, note?:string|null}} fig
 * @param {string} referenceText the module's own caption/alt prose that
 *   captionDivergence compares figure labels against. '' means "no reference
 *   available", for which captionDivergence returns [] — designed silence, NOT
 *   a false all-clear.
 */
function buildFigurePayload(basename, fig, referenceText, imageUrl = null) {
  return {
    basename,
    effectiveState: fig.effectiveState,
    blocks: fig.blocks,
    note: fig.note || null,
    // ⚠️ `?? null`, never a bare passthrough: JSON.stringify DROPS an undefined
    // value, so the client would see no key at all rather than an explicit
    // "this figure has no picture". Same falsy behaviour today; a silently
    // different contract the first time someone reads the payload as a schema.
    //
    // The URL is BUILT BY THE ROUTE, which owns req.baseUrl and the params. The
    // client must never assemble it — doing so would put DEFAULT_SUFFIX ('_IS')
    // and this app's mount path into browser JS, which is the ruling this field
    // exists to satisfy.
    imageUrl: imageUrl ?? null,
    warnings: {
      decimal: decimalSeparatorWarnings(fig.blocks),
      caption: captionDivergence(fig.blocks, referenceText || ''),
    },
  };
}

module.exports = {
  FIGURE_STATES,
  FIGURE_FLAG_KINDS,
  getDb,
  bookDirFor,
  translatedImageFor,
  lookupBookId,
  listModuleFigures,
  resolveFigure,
  getFigure,
  ensureFigureRow,
  saveBlockEdit,
  setState,
  applyApprovedFigureEdits,
  buildFigurePayload,
};
