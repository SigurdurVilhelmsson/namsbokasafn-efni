/**
 * Shared Constants
 *
 * Single source of truth for values used across multiple files.
 * Import from here instead of defining locally to prevent drift.
 */

// ─── Roles ───────────────────────────────────────────────────────────

const ROLES = {
  ADMIN: 'admin',
  HEAD_EDITOR: 'head-editor',
  EDITOR: 'editor',
  VIEWER: 'viewer',
};

const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 4,
  [ROLES.HEAD_EDITOR]: 3,
  [ROLES.EDITOR]: 2,
  [ROLES.VIEWER]: 1,
};

// ─── Pipeline Stages ─────────────────────────────────────────────────

/**
 * Pipeline stages with metadata.
 *
 * syncType controls how bookRegistration.js scans status:
 *   'simple'     — one-to-one directory check per chapter
 *   'per-section'— scanned per section within the chapter
 *   'sub-tracks' — has mtPreview/faithful/localized sub-tracks
 */
const PIPELINE_STAGES = [
  { name: 'extraction', syncType: 'simple' },
  { name: 'mtReady', syncType: 'simple' },
  { name: 'mtOutput', syncType: 'simple' },
  { name: 'linguisticReview', syncType: 'simple' },
  { name: 'tmCreated', syncType: 'per-section' },
  { name: 'injection', syncType: 'simple' },
  { name: 'rendering', syncType: 'simple' },
  { name: 'publication', syncType: 'sub-tracks' },
];

/** All stage names in pipeline order. */
const PIPELINE_STAGE_NAMES = PIPELINE_STAGES.map((s) => s.name);

/** Stages with simple (one-to-one) directory sync. */
const SIMPLE_STAGES = PIPELINE_STAGES.filter((s) => s.syncType === 'simple').map((s) => s.name);

/**
 * Stages that are REPORTED but do not participate in SEQUENCING (C10-R2).
 *
 * `tmCreated` is a side deliverable, not a gate: `tools/cnxml-inject.js` never
 * reads `tm/`, so TM generation is not causally a prerequisite for injection.
 * Nothing advances it either — the producer (`tmService` → `generate-tm.js
 * --book <book>`) is book-level, debounced and fire-and-forget, so there is no
 * per-chapter completion event, and a missing licence row makes the regen
 * silently warn-only stale (I21-R2).
 *
 * There are TWO independent status read models — the DB one
 * (`services/pipelineStatusService.js`) and the status.json one
 * (`routes/status.js` `formatChapterStatus`/`getNextActions`) — and BOTH must
 * skip these stages or they contradict each other: one would report a chapter
 * fully published while the other still proposed "create the TM" as its next
 * step, with progress permanently capped below 100%.
 *
 * `extraction`, `mtReady` and `mtOutput` are here for a different reason
 * (register §C224, option ③): only the CLI performs them, and the CLI reports
 * nothing to the server. The server jobs that used to complete them are started
 * by no route, so as gates they refused every stage the server does record
 * (linguistic review, injection, rendering, publication) for a chapter that was
 * extracted and translated from the command line.
 *
 * `linguisticReview` is here by a separate ruling ([USER] 2026-11-15, option A):
 * review is reported, not required. As a gate it refused `injection` for an
 * mt-preview publish of an unreviewed chapter, and with it `rendering` and
 * `publication.mtPreview`, although that track is unreviewed machine translation
 * by definition. Faithful publishing is guarded elsewhere: its readiness check
 * needs reviewed segment files, and inject fails each unreviewed module.
 *
 * These stages stay in PIPELINE_STAGES / STAGE_ORDER / the schema / status.json
 * and remain explicitly settable. Only sequencing skips them.
 */
const NON_SEQUENTIAL_STAGES = [
  'extraction',
  'mtReady',
  'mtOutput',
  'linguisticReview',
  'tmCreated',
];

/**
 * Non-sequential stages that nothing on the server performs or advances: the
 * CLI-side stages and `tmCreated`. Two consumers:
 *
 *  - the status view (`routes/status.js`) leaves them out of its progress figure
 *    and its next stage;
 *  - `revertStage` (`services/pipelineStatusService.js`) never lands on one,
 *    because nothing on the server would set it again.
 *
 * `linguisticReview` is non-sequential but is NOT in this list. It gates nothing
 * ([USER] 2026-11-15, option A), yet it is real work the server records. So
 * `GET /api/status` still counts it and names it as the next stage until it is
 * done (otherwise a chapter under review reports 0% and proposes injection), and
 * a completed review can still be reverted.
 */
const STAGES_NOT_PERFORMED_BY_SERVER = NON_SEQUENTIAL_STAGES.filter(
  (s) => s !== 'linguisticReview'
);

/** Stage names that DO form the sequential chain, in pipeline order. */
const SEQUENTIAL_STAGE_NAMES = PIPELINE_STAGE_NAMES.filter(
  (s) => !NON_SEQUENTIAL_STAGES.includes(s)
);

// ─── Tracks ──────────────────────────────────────────────────────────

/** Valid translation tracks for inject/render pipeline. */
const VALID_TRACKS = ['mt-preview', 'faithful', 'localized'];

/** Publication sub-tracks (within the 'publication' stage). camelCase keys match DB storage. */
const PUBLICATION_TRACKS = ['mtPreview', 'faithful', 'localized'];

/** Maps publication track names to filesystem directory names (kebab-case). */
const PUBLICATION_TRACK_DIRS = {
  mtPreview: 'mt-preview',
  faithful: 'faithful',
  localized: 'localized',
};

// ─── Edit Categories ─────────────────────────────────────────────────

/**
 * Pass 1 (linguistic review) edit categories.
 * Used in the segment editor for faithful translation work.
 */
const PASS1_CATEGORIES = ['terminology', 'accuracy', 'readability', 'style', 'omission'];

/**
 * Pass 2 (localization) edit categories.
 * Different from Pass 1 because localization focuses on cultural adaptation,
 * not linguistic accuracy. A segment may be "unchanged" if the faithful
 * translation already works for Icelandic students.
 */
const PASS2_CATEGORIES = [
  'unit-conversion',
  'cultural-adaptation',
  'example-replacement',
  'formatting',
  'unchanged',
];

// ─── Chapter Limits ──────────────────────────────────────────────────

/**
 * Maximum chapter number accepted by route validation.
 * Individual books may have fewer chapters; this is the upper bound.
 */
const MAX_CHAPTERS = 99;

module.exports = {
  // Roles
  ROLES,
  ROLE_HIERARCHY,

  // Pipeline
  PIPELINE_STAGES,
  PIPELINE_STAGE_NAMES,
  SIMPLE_STAGES,
  NON_SEQUENTIAL_STAGES,
  STAGES_NOT_PERFORMED_BY_SERVER,
  SEQUENTIAL_STAGE_NAMES,

  // Tracks
  VALID_TRACKS,
  PUBLICATION_TRACKS,
  PUBLICATION_TRACK_DIRS,

  // Edit categories
  PASS1_CATEGORIES,
  PASS2_CATEGORIES,

  // Limits
  MAX_CHAPTERS,
};
