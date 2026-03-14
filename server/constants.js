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
  CONTRIBUTOR: 'contributor',
  VIEWER: 'viewer',
};

const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 5,
  [ROLES.HEAD_EDITOR]: 4,
  [ROLES.EDITOR]: 3,
  [ROLES.CONTRIBUTOR]: 2,
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
