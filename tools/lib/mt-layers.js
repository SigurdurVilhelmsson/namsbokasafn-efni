/**
 * mt-layers.js — the reader/writer for the MT text layers (spec
 * docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit A).
 *
 * Three layers, one directory each under `books/<slug>/` (CLAUDE.md § Purpose, [USER]
 * 2026-10-10):
 *   - layer 1  `02-mt-output`   pure MT as received (plus its committed hand repairs and
 *                               top-ups). READ ONLY: nothing in this module can write there.
 *   - layer 1s `02-mt-selected` a sparse overlay of whole segment bodies chosen from API runs,
 *                               each entry pinned to the layer-1 body it replaces.
 *   - layer 2  `02-mt-revised`  the AI-reviewed text, COMPLETE PER CHAPTER, because
 *                               `cnxml-inject` reads one literal path per module and
 *                               enumerates modules from `02-structure`.
 *
 * 🔴 THE INVARIANT: A ZERO-CHANGE READ → WRITE IS BYTE-IDENTICAL. Layer 1 files have no
 * trailing newline and 6 chemistry files have irregular whitespace between segments, so a
 * re-serialisation from trimmed records reproduces 0 of 170. This module keeps each segment
 * as a RAW BLOCK (marker text + the exact whitespace before and after the body) and PROVES
 * every write: the unedited serialisation equals the input bytes, and re-parsing the edited
 * serialisation yields exactly the intended records. Prior art: `mt-top-up.js` `spliceTopUp`.
 *
 * 🔴 DESTINATIONS ARE CHECKED AGAINST A LIST OF SAFE SHAPES, never against a list of dangerous
 * ones: `<bookDir>/(02-mt-revised|02-mt-selected)/<chdir>/<stem>-<kind>`, then once more on
 * the real (symlink-resolved) path. A layer-2 directory never holds `*-provenance.json`
 * (inject's restore policy and several tools glob that name) or `*.log` (gitignored).
 *
 * 🔴 AN OVERLAY ENTRY NEVER UNDOES A LATER CHANGE TO LAYER 1. Each layer-1s entry carries
 * `beforeSha256`, the sha256 of the layer-1 body it replaces at that exact occurrence, and
 * `readBase` refuses (`bad-overlay`) an entry without it, with a malformed value, or whose value
 * differs from the layer-1 body there now. So an overlay written before a later HAND REPAIR of
 * layer 1 refuses instead of silently putting the repaired text back.
 *
 * Occurrence keys come from the shared helper in `seg-markers.cjs` (MIT). No import from
 * `server/` (that would be a new MIT → AGPL edge).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import segMarkers from './seg-markers.cjs';

const { SEG_MARKER, occurrenceKey, withOccurrences } = segMarkers;

/** The three layer directories, relative to a book directory. */
export const LAYER_DIRS = Object.freeze({
  pure: '02-mt-output',
  selected: '02-mt-selected',
  revised: '02-mt-revised',
});

/** The layer directories this module may write into. Layer 1 is not one of them. */
const WRITABLE_LAYERS = new Set([LAYER_DIRS.revised, LAYER_DIRS.selected]);

export const CHAPTER_DIR_RE = /^(ch\d\d|appendices)$/;
export const STEM_RE = /^(m\d+|chapter-metadata)$/;
export const SAFE_FILENAME_RE =
  /^(m\d+|chapter-metadata)-(segments\.is\.md|revision\.json|changes\.jsonl|segments-links\.json|selected\.json)$/;
/** A segment id: exactly three `[\w-]` parts (the id-charset rule, CLAUDE.md § SEG marker). */
export const SEGMENT_ID_RE = /^[\w-]+:[\w-]+:[\w-]+$/;

export const SELECTED_SCHEMA = 'mt-selected/1';
export const REVISED_SCHEMA = 'mt-revised/1';

const BOOK_SLUG_RE = /^[a-z][a-z0-9-]*$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

/** An Error carrying a machine-readable refusal code. */
const refusal = (code, message) => Object.assign(new Error(`[${code}] ${message}`), { code });

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v !== '';
const hasExactKeys = (obj, keys) =>
  Object.keys(obj).length === keys.length && keys.every((k) => Object.hasOwn(obj, k));
const isNullOrNonEmptyString = (v) => v === null || isNonEmptyString(v);
const isDistinctStrings = (v) =>
  Array.isArray(v) && v.every(isNonEmptyString) && new Set(v).size === v.length;
/** `null` or `{path, sha256}` — a ruling-set or prompt reference. */
const isFileRef = (v) =>
  v === null ||
  (isPlainObject(v) &&
    hasExactKeys(v, ['path', 'sha256']) &&
    isNonEmptyString(v.path) &&
    SHA256_RE.test(String(v.sha256)));
/** `null` or `{name, version}`. */
const isSdkRef = (v) =>
  v === null ||
  (isPlainObject(v) &&
    hasExactKeys(v, ['name', 'version']) &&
    isNonEmptyString(v.name) &&
    isNonEmptyString(v.version));
const lstatOrNull = (p) => {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
};

// ───────────────────────────────────────────────────────────────────────────────────────────
// Parsing and serialising one layer file
// ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} LayerRecord
 * @property {string} segmentId   full `module:type:element` id
 * @property {string} moduleId
 * @property {string} segmentType
 * @property {string} elementId
 * @property {number} occurrence  0-based ordinal among markers with the same full id
 * @property {string} key         `segmentId` for occurrence 0, `segmentId#k` for k ≥ 1
 * @property {string} markerText  the marker exactly as written
 * @property {string} lead        whitespace between the marker and the body
 * @property {string} body        the segment text, trimmed (= `parseSegmentRecords` content)
 * @property {string} trail       whitespace between the body and the next marker (or EOF)
 */

/**
 * @typedef {object} ParsedLayer
 * @property {string} prefix                 text before the first marker
 * @property {ReadonlyArray<LayerRecord>} records
 * @property {string} text                   the bytes this parse stands for; always equal to
 *   `serializeLayerFile(parsed)` (an addition to the spec's `{prefix, records}`: the zero-change
 *   proof in `applyBodyEdits` needs the input bytes to travel with the parse)
 */

/** Freeze a parse so nothing can edit it in place behind the proofs. */
const freezeParsed = (prefix, records, text) =>
  Object.freeze({ prefix, records: Object.freeze(records.map((r) => Object.freeze(r))), text });

/**
 * Parse a layer file into raw blocks.
 *
 * Refuses: a text holding the legacy `{{SEG:` form (invisible to `SEG_MARKER`); a marker not
 * at a line start (index 0 or right after `\n`); a segment id that is not three `[\w-]` parts.
 * An all-whitespace body is kept whole in `lead`, with `body` and `trail` empty.
 *
 * @param {string} text
 * @returns {ParsedLayer}
 */
export function parseLayerFile(text) {
  if (typeof text !== 'string') throw refusal('not-a-string', 'a layer file must be a string');
  if (text.includes('{{SEG:')) {
    throw refusal(
      'mustache-marker',
      'the text holds the legacy {{SEG:…}} form; refusing to read it'
    );
  }
  const matches = [...text.matchAll(new RegExp(SEG_MARKER.source, 'g'))];
  for (const m of matches) {
    if (m.index !== 0 && text[m.index - 1] !== '\n') {
      throw refusal(
        'marker-not-at-line-start',
        `marker ${m[0]} at offset ${m.index} is not at a line start`
      );
    }
    if (!SEGMENT_ID_RE.test(m[1])) {
      throw refusal('bad-segment-id', `segment id ${m[1]} is not three [\\w-] parts`);
    }
  }
  const prefix = text.slice(0, matches.length > 0 ? matches[0].index : text.length);
  const blocks = matches.map((m, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const rest = text.slice(m.index + m[0].length, end);
    const lead = rest.slice(0, rest.length - rest.trimStart().length);
    const body = rest.trim();
    return {
      segmentId: m[1],
      markerText: m[0],
      lead,
      body,
      trail: rest.slice(lead.length + body.length),
    };
  });
  const records = withOccurrences(blocks).map((b) => {
    const [moduleId, segmentType, elementId] = b.segmentId.split(':');
    return {
      segmentId: b.segmentId,
      moduleId,
      segmentType,
      elementId,
      occurrence: b.occurrence,
      key: b.key,
      markerText: b.markerText,
      lead: b.lead,
      body: b.body,
      trail: b.trail,
    };
  });
  const parsed = freezeParsed(prefix, records, text);
  if (serializeLayerFile(parsed) !== text) {
    throw refusal('roundtrip', 'parse → serialise is not byte-identical (a bug in mt-layers)');
  }
  return parsed;
}

/**
 * `prefix + Σ(markerText + lead + body + trail)`.
 * @param {{prefix: string, records: ReadonlyArray<LayerRecord>}} parsed
 * @returns {string}
 */
export function serializeLayerFile(parsed) {
  return (
    parsed.prefix + parsed.records.map((r) => r.markerText + r.lead + r.body + r.trail).join('')
  );
}

/**
 * The problems with a would-be segment body (empty array = valid).
 *
 * Codes: `not-a-string`, `empty`, `untrimmed` (≠ its own `.trim()`), `line-break` (`\n` or
 * `\r`), `seg-marker` (a SEG marker, the legacy `{{SEG` form, or any `<!--` — a spaced
 * `<!-- SEG: …` parses to nothing today and would be a landmine for a later tool).
 *
 * @param {unknown} body
 * @returns {string[]}
 */
export function validateBody(body) {
  if (typeof body !== 'string') return ['not-a-string'];
  const problems = [];
  if (body === '') problems.push('empty');
  if (body !== body.trim()) problems.push('untrimmed');
  if (/[\r\n]/.test(body)) problems.push('line-break');
  if (new RegExp(SEG_MARKER.source).test(body) || body.includes('{{SEG') || body.includes('<!--')) {
    problems.push('seg-marker');
  }
  return problems;
}

const RECORD_FIELDS = [
  'segmentId',
  'moduleId',
  'segmentType',
  'elementId',
  'occurrence',
  'key',
  'markerText',
  'lead',
  'body',
  'trail',
];

/**
 * Replace whole segment bodies.
 *
 * Each edit `{segmentId, occurrence, before, after}` names one occurrence. Refuses (before any
 * change): an unknown occurrence; two edits of the same occurrence (no chaining inside one call);
 * `before` ≠ the current body — so a change record replayed onto a changed base refuses; an
 * invalid `after` (`validateBody`); `after === before`. Then proves both: the unedited
 * serialisation equals `parsed.text`, and re-parsing the edited serialisation yields exactly the
 * intended records (marker text, lead and trail untouched).
 *
 * @param {ParsedLayer} parsed
 * @param {Array<{segmentId: string, occurrence: number, before: string, after: string}>} edits
 * @returns {ParsedLayer} a new, frozen parse; the input is not changed
 */
export function applyBodyEdits(parsed, edits) {
  if (
    !isPlainObject(parsed) ||
    typeof parsed.prefix !== 'string' ||
    !Array.isArray(parsed.records) ||
    typeof parsed.text !== 'string'
  ) {
    throw refusal('bad-parsed', 'applyBodyEdits needs a parse from parseLayerFile');
  }
  if (serializeLayerFile(parsed) !== parsed.text) {
    throw refusal('zero-change-proof', 'the unedited serialisation does not equal the input bytes');
  }
  if (!Array.isArray(edits)) throw refusal('bad-edit', 'edits must be an array');

  const indexByKey = new Map(parsed.records.map((r, i) => [r.key, i]));
  const planned = new Map();
  for (const edit of edits) {
    if (
      !isPlainObject(edit) ||
      !isNonEmptyString(edit.segmentId) ||
      edit.segmentId.includes('#') ||
      !Number.isInteger(edit.occurrence) ||
      edit.occurrence < 0 ||
      typeof edit.before !== 'string' ||
      typeof edit.after !== 'string'
    ) {
      throw refusal('bad-edit', `malformed edit ${JSON.stringify(edit)}`);
    }
    const key = occurrenceKey(edit.segmentId, edit.occurrence);
    if (!indexByKey.has(key)) throw refusal('unknown-target', `no occurrence ${key} in this file`);
    const i = indexByKey.get(key);
    if (planned.has(i)) throw refusal('duplicate-edit', `two edits name ${key}`);
    if (edit.before !== parsed.records[i].body) {
      throw refusal('base-changed', `${key}: \`before\` differs from the current body`);
    }
    const problems = validateBody(edit.after);
    if (problems.length > 0) throw refusal('invalid-body', `${key}: ${problems.join(', ')}`);
    if (edit.after === edit.before) throw refusal('no-op', `${key}: \`after\` equals \`before\``);
    planned.set(i, edit.after);
  }

  const intended = parsed.records.map((r, i) =>
    planned.has(i) ? { ...r, body: planned.get(i) } : r
  );
  const text = serializeLayerFile({ prefix: parsed.prefix, records: intended });
  let reparsed;
  try {
    reparsed = parseLayerFile(text);
  } catch (err) {
    throw refusal('reparse-proof', `the edited text does not parse: ${err.message}`);
  }
  const same =
    reparsed.prefix === parsed.prefix &&
    reparsed.records.length === intended.length &&
    reparsed.records.every((r, i) => RECORD_FIELDS.every((f) => r[f] === intended[i][f]));
  if (!same)
    throw refusal('reparse-proof', 'the edited text does not re-parse to the intended records');
  return reparsed;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Shape checks
// ───────────────────────────────────────────────────────────────────────────────────────────

/** A book directory is an absolute `…/books/<slug>`; returns it resolved. */
function assertBookDir(bookDir) {
  if (typeof bookDir !== 'string' || !path.isAbsolute(bookDir)) {
    throw refusal('bad-book-dir', `bookDir must be an absolute path, got ${bookDir}`);
  }
  const resolved = path.resolve(bookDir);
  if (
    !BOOK_SLUG_RE.test(path.basename(resolved)) ||
    path.basename(path.dirname(resolved)) !== 'books'
  ) {
    throw refusal('bad-book-dir', `${bookDir} is not a books/<slug> directory`);
  }
  return resolved;
}

function assertChapterDir(chapterDir) {
  if (typeof chapterDir !== 'string' || !CHAPTER_DIR_RE.test(chapterDir)) {
    throw refusal('bad-chapter-dir', `chapter dir must match ${CHAPTER_DIR_RE}, got ${chapterDir}`);
  }
}

function assertStem(stem) {
  if (typeof stem !== 'string' || !STEM_RE.test(stem)) {
    throw refusal('bad-stem', `unit stem must match ${STEM_RE}, got ${stem}`);
  }
}

/**
 * The resolved destination, if `filePath` has one of the SAFE SHAPES:
 * `<bookDir>/(02-mt-revised|02-mt-selected)/<chapterDir>/<SAFE_FILENAME_RE>`, written as an
 * absolute path exactly equal to its own `path.resolve` form. Anything else refuses with
 * `unsafe-destination` — including any path under `02-mt-output/` or `01-source/`, a path that
 * escapes or re-enters via `..`, a trailing slash, a wrong filename, a malformed chapter
 * directory and another chapter than `chapterDir`.
 * This is a string check; the writer re-checks the real (symlink-resolved) directory.
 *
 * @param {{bookDir: string, chapterDir: string, filePath: string}} args
 * @returns {string}
 */
export function resolveSafeDestination({ bookDir, chapterDir, filePath }) {
  const book = assertBookDir(bookDir);
  assertChapterDir(chapterDir);
  const unsafe = (why) => refusal('unsafe-destination', `${filePath}: ${why}`);
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath))
    throw unsafe('not an absolute path');
  const resolved = path.resolve(filePath);
  // Exactly the resolved form: no `..`, no `.`, no doubled separator, no trailing slash.
  if (resolved !== filePath) throw unsafe('not a normalised absolute path');
  const parts = path.relative(book, resolved).split(path.sep);
  if (parts.length !== 3) throw unsafe('not <layer>/<chapter>/<file> inside the book');
  const [layer, chdir, name] = parts;
  if (!WRITABLE_LAYERS.has(layer)) throw unsafe(`not inside ${[...WRITABLE_LAYERS].join(' or ')}`);
  if (!CHAPTER_DIR_RE.test(chdir) || chdir !== chapterDir) {
    throw unsafe(`chapter directory is not ${chapterDir}`);
  }
  if (!SAFE_FILENAME_RE.test(name)) throw unsafe('not a layer filename');
  return resolved;
}

/**
 * Refuse unless `<book>/<layer>` and `<book>/<layer>/<chapterDir>`, where they exist, are real
 * directories at exactly those real paths (no symlink redirecting a write elsewhere).
 */
function assertNoRedirect(book, layer, chapterDir) {
  const realBook = fs.realpathSync(book);
  assertBookDir(realBook);
  for (const rel of [layer, path.join(layer, chapterDir)]) {
    const p = path.join(book, rel);
    if (lstatOrNull(p) === null) continue;
    let real;
    try {
      real = fs.realpathSync(p);
    } catch (err) {
      throw refusal('unsafe-destination', `${p} cannot be resolved (${err.code})`);
    }
    if (real !== path.join(realBook, rel) || !fs.statSync(real).isDirectory()) {
      throw refusal('unsafe-destination', `${p} resolves to ${real}, not to its own directory`);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Reading
// ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * The units of one chapter, in a fixed order: the module stems named by
 * `02-structure/<chapterDir>/m<N>-structure.json` (numeric order), then `chapter-metadata`
 * when layer 1 has the literal `chapter-metadata-segments.is.md`. Names are built, never
 * globbed from a segment directory (`02-mt-output` holds untracked junk and legacy splits).
 * Refuses a missing structure directory, a `*-structure.json` that names no module, and a
 * chapter with no modules.
 *
 * @param {{bookDir: string, chapterDir: string}} args
 * @returns {string[]}
 */
export function listChapterUnits({ bookDir, chapterDir }) {
  const book = assertBookDir(bookDir);
  assertChapterDir(chapterDir);
  const structDir = path.join(book, '02-structure', chapterDir);
  if (!lstatOrNull(structDir)?.isDirectory()) {
    throw refusal('no-structure', `${structDir} is not a directory`);
  }
  const stems = fs
    .readdirSync(structDir)
    .filter((name) => name.endsWith('-structure.json'))
    .map((name) => {
      const m = /^(m\d+)-structure\.json$/.exec(name);
      if (!m) throw refusal('stray-structure-file', `${chapterDir}/${name} names no module`);
      return m[1];
    })
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)) || a.localeCompare(b));
  if (stems.length === 0) throw refusal('no-units', `${structDir} lists no modules`);
  const meta = path.join(book, LAYER_DIRS.pure, chapterDir, 'chapter-metadata-segments.is.md');
  return lstatOrNull(meta)?.isFile() ? [...stems, 'chapter-metadata'] : stems;
}

/** Decode UTF-8, refusing bytes that would not survive a decode → encode round trip. */
function decodeUtf8Exact(buf, file) {
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf))
    throw refusal('not-utf8', `${file} is not valid UTF-8`);
  return text;
}

const OVERLAY_KEYS = ['schema', 'module', 'entries'];
const OVERLAY_ENTRY_KEYS = [
  'segmentId',
  'occurrence',
  'text',
  'beforeSha256',
  'run',
  'commit',
  'rule',
  'gate',
];

/**
 * Validate a layer-1s overlay and apply it (whole bodies); an entry equal to the base is a no-op.
 *
 * Format: `{ schema: 'mt-selected/1', module, entries: [{ segmentId, occurrence, text,
 * beforeSha256, run, commit, rule, gate }] }`, exactly those keys. `beforeSha256` is the sha256
 * (64 lowercase hex characters) of the layer-1 body the entry replaces, at that exact occurrence.
 * An entry whose `beforeSha256` differs from the layer-1 body there now refuses (`bad-overlay`,
 * naming the occurrence key): layer 1 changed after the entry was written (a later HAND REPAIR),
 * and applying the entry would undo that change silently.
 */
function applyOverlay(parsed, overlay, stem, file) {
  const bad = (why) => refusal('bad-overlay', `${file}: ${why}`);
  if (!isPlainObject(overlay) || !hasExactKeys(overlay, OVERLAY_KEYS)) {
    throw bad(`top level must have exactly ${OVERLAY_KEYS.join(', ')}`);
  }
  if (overlay.schema !== SELECTED_SCHEMA) throw bad(`schema is not ${SELECTED_SCHEMA}`);
  if (overlay.module !== stem) throw bad(`module is ${overlay.module}, not ${stem}`);
  if (!Array.isArray(overlay.entries)) throw bad('entries is not an array');
  const bodies = new Map(parsed.records.map((r) => [r.key, r.body]));
  const seen = new Set();
  const edits = overlay.entries.map((e) => {
    if (!isPlainObject(e) || !hasExactKeys(e, OVERLAY_ENTRY_KEYS)) {
      throw bad(`an entry must have exactly ${OVERLAY_ENTRY_KEYS.join(', ')}`);
    }
    if (
      !SEGMENT_ID_RE.test(String(e.segmentId)) ||
      !Number.isInteger(e.occurrence) ||
      e.occurrence < 0
    ) {
      throw bad(`malformed entry target ${e.segmentId} / ${e.occurrence}`);
    }
    // Provenance of the choice: the run it came from, the commit, the selection rule. `gate` is
    // left to the re-request mode that writes it (not designed yet).
    if (
      !isNonEmptyString(e.run) ||
      !COMMIT_RE.test(String(e.commit)) ||
      !isNonEmptyString(e.rule)
    ) {
      throw bad(
        `entry ${e.segmentId} / ${e.occurrence}: run and rule must be non-empty strings and commit a full sha`
      );
    }
    // A typeof check, not String(): String([hash]) would pass the pattern.
    if (typeof e.beforeSha256 !== 'string' || !SHA256_RE.test(e.beforeSha256)) {
      throw bad(
        `entry ${e.segmentId} / ${e.occurrence}: beforeSha256 must be 64 lowercase hex characters`
      );
    }
    const key = occurrenceKey(e.segmentId, e.occurrence);
    if (!bodies.has(key)) throw bad(`layer 1 has no occurrence ${key}`);
    if (seen.has(key)) throw bad(`two entries name ${key}`);
    seen.add(key);
    if (e.beforeSha256 !== sha256(bodies.get(key))) {
      throw bad(
        `${key}: beforeSha256 is not the sha256 of the layer-1 body there now. Layer 1 changed ` +
          'after this entry was written (a later HAND REPAIR?), and applying it would undo that ' +
          'change; refusing'
      );
    }
    const problems = validateBody(e.text);
    if (problems.length > 0) throw bad(`${key}: ${problems.join(', ')}`);
    return {
      segmentId: e.segmentId,
      occurrence: e.occurrence,
      before: bodies.get(key),
      after: e.text,
    };
  });
  return applyBodyEdits(
    parsed,
    edits.filter((e) => e.after !== e.before)
  );
}

/**
 * One unit's base text: layer 1 (`02-mt-output/<chapterDir>/<stem>-segments.is.md`) parsed,
 * with the layer-1s overlay (`02-mt-selected/<chapterDir>/<stem>-selected.json`) applied when it
 * exists. `parsed.text` is the post-overlay serialisation; `layer1Sha256` is always the raw
 * layer-1 file's. Refuses a file whose markers name another module (`chapter` for
 * `chapter-metadata`), a file with no segments, and a malformed or non-matching overlay.
 * The overlay is `{ schema: 'mt-selected/1', module, entries: [{ segmentId, occurrence, text,
 * beforeSha256, run, commit, rule, gate }] }`; an entry whose `beforeSha256` is not the sha256 of
 * the layer-1 body at its occurrence refuses (`bad-overlay`), as `applyOverlay` describes.
 *
 * @param {{bookDir: string, chapterDir: string, stem: string}} args
 * @returns {{parsed: ParsedLayer, layer1Sha256: string, overlaySha256: string|null}}
 */
export function readBase({ bookDir, chapterDir, stem }) {
  const book = assertBookDir(bookDir);
  assertChapterDir(chapterDir);
  assertStem(stem);
  const file = path.join(book, LAYER_DIRS.pure, chapterDir, `${stem}-segments.is.md`);
  if (!lstatOrNull(file)?.isFile()) throw refusal('missing-layer1', `${file} does not exist`);
  const buf = fs.readFileSync(file);
  let parsed = parseLayerFile(decodeUtf8Exact(buf, file));
  if (parsed.records.length === 0) throw refusal('empty-unit', `${file} has no segments`);
  const moduleId = stem === 'chapter-metadata' ? 'chapter' : stem;
  const foreign = parsed.records.find((r) => r.moduleId !== moduleId);
  if (foreign) {
    throw refusal(
      'module-mismatch',
      `${file} holds ${foreign.segmentId}, not a ${moduleId} segment`
    );
  }

  const overlayFile = path.join(book, LAYER_DIRS.selected, chapterDir, `${stem}-selected.json`);
  if (lstatOrNull(overlayFile) === null) {
    return { parsed, layer1Sha256: sha256(buf), overlaySha256: null };
  }
  const overlayBuf = fs.readFileSync(overlayFile);
  let overlay;
  try {
    overlay = JSON.parse(decodeUtf8Exact(overlayBuf, overlayFile));
  } catch (err) {
    throw refusal('bad-overlay', `${overlayFile}: ${err.message}`);
  }
  parsed = applyOverlay(parsed, overlay, stem, overlayFile);
  return { parsed, layer1Sha256: sha256(buf), overlaySha256: sha256(overlayBuf) };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Change records
// ───────────────────────────────────────────────────────────────────────────────────────────

const CHANGE_FIELDS_HEAD = ['module', 'segmentId', 'occurrence', 'key', 'opId', 'source'];
const CHANGE_FIELDS_TAIL = [
  'category',
  'find',
  'replace',
  'before',
  'after',
  'beforeSha256',
  'afterSha256',
  'runId',
];
const changeFields = (source) => [
  ...CHANGE_FIELDS_HEAD,
  source === 'rule' ? 'ruleId' : 'rulingId',
  ...CHANGE_FIELDS_TAIL,
];

/**
 * The problems with a change record on its own (no chapter context). The record must have
 * exactly the spec's fields, `key` must be `occurrenceKey(segmentId, occurrence)`, both sha256
 * values must hash their texts, and `after` must be `before` with its single occurrence of
 * `find` replaced by `replace`.
 */
function changeProblems(c) {
  if (!isPlainObject(c)) return ['not an object'];
  const fields = changeFields(c.source);
  const problems = [];
  if (!['rule', 'ai'].includes(c.source)) problems.push(`source ${c.source} is not rule or ai`);
  if (!hasExactKeys(c, fields)) problems.push(`fields must be exactly ${fields.join(', ')}`);
  if (!STEM_RE.test(String(c.module))) problems.push(`module ${c.module} is not a unit stem`);
  if (!SEGMENT_ID_RE.test(String(c.segmentId)))
    problems.push(`segmentId ${c.segmentId} is malformed`);
  if (!Number.isInteger(c.occurrence) || c.occurrence < 0) problems.push('occurrence is not ≥ 0');
  if (problems.length === 0 && c.key !== occurrenceKey(c.segmentId, c.occurrence)) {
    problems.push(`key ${c.key} is not ${occurrenceKey(c.segmentId, c.occurrence)}`);
  }
  for (const f of ['opId', 'category', c.source === 'rule' ? 'ruleId' : 'rulingId']) {
    if (!isNonEmptyString(c[f])) problems.push(`${f} is not a non-empty string`);
  }
  if (!(c.runId === null || isNonEmptyString(c.runId)))
    problems.push('runId is not a string or null');
  if (c.source === 'ai' && c.runId === null) problems.push('an ai change needs a runId');
  const texts = ['find', 'replace', 'before', 'after'];
  if (texts.some((f) => typeof c[f] !== 'string'))
    return [...problems, 'find/replace/before/after are not strings'];
  if (c.beforeSha256 !== sha256(c.before)) problems.push('beforeSha256 does not hash before');
  if (c.afterSha256 !== sha256(c.after)) problems.push('afterSha256 does not hash after');
  const at = c.find === '' ? -1 : c.before.indexOf(c.find);
  if (at < 0 || c.before.indexOf(c.find, at + 1) !== -1) {
    problems.push('find does not occur exactly once in before');
  } else if (c.after !== c.before.slice(0, at) + c.replace + c.before.slice(at + c.find.length)) {
    problems.push('after is not before with find replaced by replace');
  }
  return problems;
}

/**
 * The problems with change `c` as part of unit `stem` under the chapter provenance `rev` (the
 * writer's `revision` input or a recorded `revision.json`; both carry `runIds`, `model`, `prompt`
 * and `rulingSet`). An `ai` change needs all three of model, prompt and ruling set: its `rulingId`
 * must point into a recorded ruling set.
 */
function changeInUnitProblems(c, stem, rev) {
  const problems = changeProblems(c);
  if (problems.length > 0) return problems;
  if (c.module !== stem) return [`module ${c.module} is not ${stem}`];
  if (c.runId !== null && !rev.runIds.includes(c.runId)) {
    return [`runId ${c.runId} is not in the revision's runIds`];
  }
  if (c.source === 'ai' && (rev.model === null || rev.prompt === null || rev.rulingSet === null)) {
    return ['an ai change needs a model, a prompt and a ruling set in the revision'];
  }
  return [];
}

/** The record with its fields in the spec's order. */
const canonicalChange = (c) => Object.fromEntries(changeFields(c.source).map((f) => [f, c[f]]));

/** One `<stem>-changes.jsonl`: one canonical JSON object per line, each line ending in `\n`. */
const serializeChangeLog = (records) => records.map((c) => `${JSON.stringify(c)}\n`).join('');

/** Replay a change log onto a parse, one change at a time: each must find its own `before`. */
const replayChanges = (parsed, records) =>
  records.reduce(
    (p, c) =>
      applyBodyEdits(p, [
        { segmentId: c.segmentId, occurrence: c.occurrence, before: c.before, after: c.after },
      ]),
    parsed
  );

/**
 * Accepted changes per category, keys sorted. Counted in a Map and emitted with
 * `Object.fromEntries`, which defines OWN properties — so a category named `constructor`,
 * `toString` or `__proto__` counts as itself instead of colliding with an `Object.prototype` member.
 */
function tallyCategories(records) {
  const counts = new Map();
  for (const c of records) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  return Object.fromEntries(
    [...counts].sort(([a], [b]) => {
      if (a < b) return -1;
      return a > b ? 1 : 0;
    })
  );
}

/**
 * Build one change record (one line of `<stem>-changes.jsonl`), minting `key`,
 * `beforeSha256` and `afterSha256`, and refusing (`bad-change`) a record that does not hold up.
 *
 * @param {{module: string, segmentId: string, occurrence: number, opId: string,
 *   source: 'rule'|'ai', ruleId?: string, rulingId?: string, category: string, find: string,
 *   replace: string, before: string, after: string, runId: string|null}} fields
 * @returns {object}
 */
export function buildChangeRecord(fields) {
  if (!isPlainObject(fields)) throw refusal('bad-change', 'fields must be an object');
  const record = {
    ...fields,
    key:
      SEGMENT_ID_RE.test(String(fields.segmentId)) &&
      Number.isInteger(fields.occurrence) &&
      fields.occurrence >= 0
        ? occurrenceKey(fields.segmentId, fields.occurrence)
        : undefined,
    beforeSha256: typeof fields.before === 'string' ? sha256(fields.before) : undefined,
    afterSha256: typeof fields.after === 'string' ? sha256(fields.after) : undefined,
  };
  const problems = changeProblems(record);
  if (problems.length > 0) throw refusal('bad-change', problems.join('; '));
  return canonicalChange(record);
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Writing layer 2
// ───────────────────────────────────────────────────────────────────────────────────────────

const REVISION_KEYS = [
  'layer1Commit',
  'rulingSet',
  'prompt',
  'model',
  'sdk',
  'anthropicVersion',
  'harnessCommit',
  'runIds',
];

/** Validate the chapter-level provenance a caller supplies; returns a frozen copy. */
function checkRevisionInput(revision) {
  const bad = (why) => refusal('bad-revision', why);
  if (!isPlainObject(revision) || !hasExactKeys(revision, REVISION_KEYS)) {
    throw bad(`revision must have exactly ${REVISION_KEYS.join(', ')}`);
  }
  const { layer1Commit, rulingSet, prompt, model, sdk, anthropicVersion, harnessCommit, runIds } =
    revision;
  if (!COMMIT_RE.test(String(layer1Commit))) throw bad('layer1Commit is not a full commit sha');
  if (!COMMIT_RE.test(String(harnessCommit))) throw bad('harnessCommit is not a full commit sha');
  if (!isFileRef(rulingSet)) throw bad('rulingSet must be null or {path, sha256}');
  if (!isFileRef(prompt)) throw bad('prompt must be null or {path, sha256}');
  if (!isNullOrNonEmptyString(model)) throw bad('model must be null or a string');
  if (!isSdkRef(sdk)) throw bad('sdk must be null or {name, version}');
  if (!isNullOrNonEmptyString(anthropicVersion)) {
    throw bad('anthropicVersion must be null or a string');
  }
  if (!isDistinctStrings(runIds)) {
    throw bad('runIds must be an array of distinct non-empty strings');
  }
  return structuredClone(revision);
}

/** A file reference rebuilt in its canonical key order, so the bytes written do not depend on
 * the key order a caller happened to use. */
const canonicalFileRef = (ref) => (ref === null ? null : { path: ref.path, sha256: ref.sha256 });
const canonicalSdkRef = (ref) => (ref === null ? null : { name: ref.name, version: ref.version });

/** Validate one unit and build the files it writes. Reads only; writes nothing. */
function planUnit({ book, chapterDir, unit, rev }) {
  const { stem } = unit;
  const unitKeys = Object.keys(unit);
  if (unitKeys.some((k) => !['stem', 'text', 'changes', 'rejected'].includes(k))) {
    throw refusal('bad-unit', `${stem}: a unit has only stem, text, changes and rejected`);
  }
  const { text, changes = [], rejected = 0 } = unit;
  if (typeof text !== 'string') throw refusal('bad-unit', `${stem}: text is not a string`);
  if (!Array.isArray(changes)) throw refusal('bad-unit', `${stem}: changes is not an array`);
  if (!Number.isInteger(rejected) || rejected < 0) {
    throw refusal('bad-unit', `${stem}: rejected is not a non-negative integer`);
  }

  const base = readBase({ bookDir: book, chapterDir, stem });
  const records = changes.map((c, i) => {
    const problems = changeInUnitProblems(c, stem, rev);
    if (problems.length > 0)
      throw refusal('bad-change', `${stem} change ${i}: ${problems.join('; ')}`);
    return canonicalChange(c);
  });
  if (replayChanges(base.parsed, records).text !== text) {
    throw refusal('text-not-derived', `${stem}: the text is not the base plus its change log`);
  }

  const revisionJson = {
    schema: REVISED_SCHEMA,
    module: stem,
    chapterDir,
    layer1: { dir: LAYER_DIRS.pure, commit: rev.layer1Commit, sha256: base.layer1Sha256 },
    overlay: base.overlaySha256 === null ? null : { sha256: base.overlaySha256 },
    rulingSet: canonicalFileRef(rev.rulingSet),
    prompt: canonicalFileRef(rev.prompt),
    model: rev.model,
    sdk: canonicalSdkRef(rev.sdk),
    anthropicVersion: rev.anthropicVersion,
    harnessCommit: rev.harnessCommit,
    runIds: rev.runIds,
    counts: { accepted: records.length, rejected, byCategory: tallyCategories(records) },
  };

  const dir = path.join(book, LAYER_DIRS.revised, chapterDir);
  const files = [
    { filePath: path.join(dir, `${stem}-segments.is.md`), data: text },
    {
      filePath: path.join(dir, `${stem}-revision.json`),
      data: `${JSON.stringify(revisionJson, null, 2)}\n`,
    },
    { filePath: path.join(dir, `${stem}-changes.jsonl`), data: serializeChangeLog(records) },
  ];
  const links = path.join(book, LAYER_DIRS.pure, chapterDir, `${stem}-segments-links.json`);
  if (lstatOrNull(links)?.isFile()) {
    files.push({
      filePath: path.join(dir, `${stem}-segments-links.json`),
      data: fs.readFileSync(links),
    });
  }
  return files;
}

/** Write a file via a temporary sibling and a rename. */
function writeAtomic(filePath, data) {
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
  );
  fs.writeFileSync(tmp, data, { flag: 'wx' });
  try {
    fs.renameSync(tmp, filePath);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Write one chapter of layer 2 (`02-mt-revised/<chapterDir>/`).
 *
 * `units` must cover every unit `listChapterUnits` returns, each once:
 * `{ stem, text, changes = [], rejected = 0 }`, where `text` is the full revised module text and
 * `changes` the change records (`buildChangeRecord`) applied, in order. The text must be exactly
 * the base (`readBase`) with the changes replayed. `revision` is the chapter-level provenance:
 * `{ layer1Commit, rulingSet, prompt, model, sdk, anthropicVersion, harnessCommit, runIds }`
 * (every key present; `null` where not applicable).
 *
 * Every unit gets `<stem>-segments.is.md`, `<stem>-revision.json` and `<stem>-changes.jsonl`
 * (empty when nothing changed), plus a byte copy of `<stem>-segments-links.json` where layer 1
 * has one. Everything is validated before the first write; each file is written atomically.
 * Refuses to replace an existing file unless `overwrite` is true (layer 2 is tool-written data,
 * never regenerated); `overwrite` replaces only the files this call writes. Refuses
 * (`stale-destination`) when layer 2 already holds a `<stem>-segments-links.json` for a unit
 * whose layer 1 has none, overwrite or not: that copy would survive the write and contradict it,
 * and this module never deletes a layer file. Every record `changes` holds is checked as
 * `verifyRevision` checks the written log (an `ai` change needs a model, a prompt and a ruling set
 * in `revision`), and `counts.byCategory` is written with sorted keys.
 *
 * @param {{bookDir: string, chapterDir: string,
 *   units: Array<{stem: string, text: string, changes?: object[], rejected?: number}>,
 *   revision: object, overwrite?: boolean}} args
 * @returns {{chapterDir: string, written: string[]}} written paths, relative to `bookDir`
 */
export function writeRevisedChapter({ bookDir, chapterDir, units, revision, overwrite = false }) {
  const book = assertBookDir(bookDir);
  assertChapterDir(chapterDir);
  const rev = checkRevisionInput(revision);
  if (!Array.isArray(units)) throw refusal('bad-unit', 'units must be an array');

  const expected = listChapterUnits({ bookDir: book, chapterDir });
  const byStem = new Map();
  for (const unit of units) {
    if (!isPlainObject(unit)) throw refusal('bad-unit', 'a unit must be an object');
    assertStem(unit.stem);
    if (byStem.has(unit.stem)) throw refusal('duplicate-unit', `${unit.stem} is listed twice`);
    if (!expected.includes(unit.stem)) {
      throw refusal('unknown-unit', `${chapterDir} has no unit ${unit.stem}`);
    }
    byStem.set(unit.stem, unit);
  }
  const missing = expected.filter((stem) => !byStem.has(stem));
  if (missing.length > 0) {
    throw refusal('incomplete-chapter', `${chapterDir} is missing ${missing.join(', ')}`);
  }

  const files = expected.flatMap((stem) =>
    planUnit({ book, chapterDir, unit: byStem.get(stem), rev })
  );
  for (const f of files)
    resolveSafeDestination({ bookDir: book, chapterDir, filePath: f.filePath });
  assertNoRedirect(book, LAYER_DIRS.revised, chapterDir);
  // A links copy for a unit whose layer 1 has none would survive this write and contradict it.
  // Refuse rather than delete: this module never removes a layer file.
  const planned = new Set(files.map((f) => f.filePath));
  const stale = expected
    .map((stem) => path.join(book, LAYER_DIRS.revised, chapterDir, `${stem}-segments-links.json`))
    .filter((p) => !planned.has(p) && lstatOrNull(p) !== null);
  if (stale.length > 0) {
    throw refusal(
      'stale-destination',
      `${stale.map((p) => path.relative(book, p)).join(', ')} exist but layer 1 has no links file`
    );
  }
  if (!overwrite) {
    const existing = files.filter((f) => lstatOrNull(f.filePath) !== null);
    if (existing.length > 0) {
      throw refusal(
        'destination-exists',
        `${existing.map((f) => path.relative(book, f.filePath)).join(', ')} already exist`
      );
    }
  }
  fs.mkdirSync(path.join(book, LAYER_DIRS.revised, chapterDir), { recursive: true });
  assertNoRedirect(book, LAYER_DIRS.revised, chapterDir);
  for (const f of files) writeAtomic(f.filePath, f.data);
  return { chapterDir, written: files.map((f) => path.relative(book, f.filePath)) };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Verifying a revision against current inputs
// ───────────────────────────────────────────────────────────────────────────────────────────

const CURRENT_KEYS = ['rulingSetSha256', 'promptSha256', 'model'];
const readOrNull = (file) => (lstatOrNull(file) === null ? null : fs.readFileSync(file));
const shaOfFileOrNull = (file) => {
  const buf = readOrNull(file);
  return buf === null ? null : sha256(buf);
};

const REVISION_RECORD_KEYS = [
  'schema',
  'module',
  'chapterDir',
  'layer1',
  'overlay',
  'rulingSet',
  'prompt',
  'model',
  'sdk',
  'anthropicVersion',
  'harnessCommit',
  'runIds',
  'counts',
];
const isCount = (n) => Number.isInteger(n) && n >= 0;

/**
 * The problems with a recorded `revision.json` (empty = it has the shape the writer writes).
 * The same field checks `checkRevisionInput` applies on write, applied on read — so a malformed
 * or missing field is a problem, never silently read as `null`.
 */
function revisionRecordProblems(rec, stem, chapterDir) {
  if (!isPlainObject(rec)) return ['not a JSON object'];
  const problems = [];
  const need = (ok, what) => {
    if (!ok) problems.push(what);
  };
  need(hasExactKeys(rec, REVISION_RECORD_KEYS), `keys must be exactly ${REVISION_RECORD_KEYS}`);
  need(rec.schema === REVISED_SCHEMA, `schema is not ${REVISED_SCHEMA}`);
  need(rec.module === stem, `module is not ${stem}`);
  need(rec.chapterDir === chapterDir, `chapterDir is not ${chapterDir}`);
  const { layer1, overlay, counts } = rec;
  need(
    isPlainObject(layer1) &&
      hasExactKeys(layer1, ['dir', 'commit', 'sha256']) &&
      layer1.dir === LAYER_DIRS.pure &&
      COMMIT_RE.test(String(layer1.commit)) &&
      SHA256_RE.test(String(layer1.sha256)),
    `layer1 is not {dir: ${LAYER_DIRS.pure}, commit, sha256}`
  );
  need(
    overlay === null ||
      (isPlainObject(overlay) &&
        hasExactKeys(overlay, ['sha256']) &&
        SHA256_RE.test(String(overlay.sha256))),
    'overlay is not null or {sha256}'
  );
  need(isFileRef(rec.rulingSet), 'rulingSet is not null or {path, sha256}');
  need(isFileRef(rec.prompt), 'prompt is not null or {path, sha256}');
  need(isNullOrNonEmptyString(rec.model), 'model is not null or a string');
  need(isSdkRef(rec.sdk), 'sdk is not null or {name, version}');
  need(isNullOrNonEmptyString(rec.anthropicVersion), 'anthropicVersion is not null or a string');
  need(COMMIT_RE.test(String(rec.harnessCommit)), 'harnessCommit is not a full commit sha');
  need(isDistinctStrings(rec.runIds), 'runIds is not an array of distinct non-empty strings');
  need(
    isPlainObject(counts) &&
      hasExactKeys(counts, ['accepted', 'rejected', 'byCategory']) &&
      isCount(counts.accepted) &&
      isCount(counts.rejected) &&
      isPlainObject(counts.byCategory) &&
      Object.values(counts.byCategory).every((n) => Number.isInteger(n) && n >= 1),
    'counts is not {accepted, rejected, byCategory} with integer counts'
  );
  return problems;
}

/** Parse a `<stem>-changes.jsonl` and validate every record in its unit; throws on any problem. */
function readChangeLog(text, stem, rec) {
  if (text !== '' && !text.endsWith('\n')) throw new Error('the last line has no newline');
  const lines = text === '' ? [] : text.slice(0, -1).split('\n');
  const records = lines.map((line, i) => {
    let c;
    try {
      c = JSON.parse(line);
    } catch (err) {
      throw new Error(`line ${i + 1} does not parse: ${err.message}`);
    }
    const problems = changeInUnitProblems(c, stem, rec);
    if (problems.length > 0) throw new Error(`line ${i + 1}: ${problems.join('; ')}`);
    return canonicalChange(c);
  });
  if (serializeChangeLog(records) !== text) {
    throw new Error('the log is not in the form the writer writes (canonical JSON lines)');
  }
  return records;
}

const sortedEntries = (obj) =>
  JSON.stringify(
    Object.entries(obj).sort(([a], [b]) => {
      if (a < b) return -1;
      return a > b ? 1 : 0;
    })
  );

/**
 * The mismatches between what a unit's layer-2 files say and what they are: the links copy
 * against the current layer-1 links file, the change log (parse, validation, canonical form),
 * `counts` against the log, and the revised text against the base with the log replayed onto it.
 * Called only when the layer-1 and overlay sha256 still match, so a mismatch here is the layer-2
 * files' own (a hand edit, a damaged or replaced file), not a changed base.
 */
function writtenUnitMismatches({ book, chapterDir, stem, rec }) {
  const dir = path.join(book, LAYER_DIRS.revised, chapterDir);
  const out = [];
  const links = {
    copy: shaOfFileOrNull(path.join(dir, `${stem}-segments-links.json`)),
    layer1: shaOfFileOrNull(
      path.join(book, LAYER_DIRS.pure, chapterDir, `${stem}-segments-links.json`)
    ),
  };
  if (links.copy !== links.layer1) {
    out.push({ field: 'links', recorded: links.copy, current: links.layer1 });
  }

  const logFile = path.join(dir, `${stem}-changes.jsonl`);
  let records;
  try {
    const buf = readOrNull(logFile);
    if (buf === null) throw new Error('it does not exist');
    records = readChangeLog(decodeUtf8Exact(buf, logFile), stem, rec);
  } catch (err) {
    return [...out, { field: 'changes', recorded: null, current: null, reason: err.message }];
  }

  const tally = tallyCategories(records);
  if (
    rec.counts.accepted !== records.length ||
    sortedEntries(rec.counts.byCategory) !== sortedEntries(tally)
  ) {
    out.push({
      field: 'counts',
      recorded: { accepted: rec.counts.accepted, byCategory: rec.counts.byCategory },
      current: { accepted: records.length, byCategory: tally },
    });
  }

  let expected;
  try {
    expected = Buffer.from(
      replayChanges(readBase({ bookDir: book, chapterDir, stem }).parsed, records).text,
      'utf8'
    );
  } catch (err) {
    return [
      ...out,
      {
        field: 'changes',
        recorded: null,
        current: null,
        reason: `does not replay: ${err.message}`,
      },
    ];
  }
  const written = readOrNull(path.join(dir, `${stem}-segments.is.md`));
  if (written === null || !written.equals(expected)) {
    out.push({
      field: 'text',
      recorded: sha256(expected),
      current: written === null ? null : sha256(written),
    });
  }
  return out;
}

/**
 * Compare a unit's `revision.json` with the current inputs and return the mismatches (empty =
 * the revision still stands). A mismatch on any field refuses the module (10-10 §4).
 *
 * - `revision`: the revision file is missing, does not parse, or does not have exactly the shape
 *   the writer writes (a malformed field is never read as `null`).
 * - `layer1.sha256`, `overlay.sha256`: read from disk here. `rulingSet.sha256`, `prompt.sha256`,
 *   `model`: against `current` (every key present, `null` where not applicable).
 * - Only when layer 1 and the overlay still match (otherwise the module is refused already, and a
 *   replay onto a changed base would only add noise): `links` (the copy ≠ the current layer-1
 *   links file, or one exists without the other), `changes` (`<stem>-changes.jsonl` is missing,
 *   does not parse, holds a record that would not be accepted on write, or does not replay onto
 *   the base), `counts` (≠ the log), `text` (`<stem>-segments.is.md` is missing or ≠ the base with
 *   the log replayed). For `text`, `recorded` is the sha256 the log implies and `current` the
 *   file's.
 *
 * @param {{bookDir: string, chapterDir: string, stem: string,
 *   current: {rulingSetSha256: string|null, promptSha256: string|null, model: string|null}}} args
 * @returns {Array<{field: string, recorded: unknown, current: unknown, reason?: string}>}
 */
export function verifyRevision({ bookDir, chapterDir, stem, current }) {
  const book = assertBookDir(bookDir);
  assertChapterDir(chapterDir);
  assertStem(stem);
  if (
    !isPlainObject(current) ||
    !hasExactKeys(current, CURRENT_KEYS) ||
    !CURRENT_KEYS.every((k) => current[k] === null || isNonEmptyString(current[k]))
  ) {
    throw refusal(
      'bad-current',
      `current must have exactly ${CURRENT_KEYS.join(', ')} (string or null)`
    );
  }

  const revFile = path.join(book, LAYER_DIRS.revised, chapterDir, `${stem}-revision.json`);
  const broken = (reason) => [{ field: 'revision', recorded: null, current: null, reason }];
  if (lstatOrNull(revFile) === null) return broken(`${revFile} does not exist`);
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(revFile, 'utf8'));
  } catch (err) {
    return broken(`${revFile} does not parse: ${err.message}`);
  }
  const problems = revisionRecordProblems(rec, stem, chapterDir);
  if (problems.length > 0) {
    return broken(
      `${revFile} is not a ${REVISED_SCHEMA} revision of ${chapterDir}/${stem}: ${problems.join('; ')}`
    );
  }

  const now = {
    layer1: shaOfFileOrNull(path.join(book, LAYER_DIRS.pure, chapterDir, `${stem}-segments.is.md`)),
    overlay: shaOfFileOrNull(
      path.join(book, LAYER_DIRS.selected, chapterDir, `${stem}-selected.json`)
    ),
  };
  // Every field below has been shape-checked, so `null` here means a recorded `null`.
  const pairs = [
    ['layer1.sha256', rec.layer1.sha256, now.layer1],
    ['overlay.sha256', rec.overlay === null ? null : rec.overlay.sha256, now.overlay],
    [
      'rulingSet.sha256',
      rec.rulingSet === null ? null : rec.rulingSet.sha256,
      current.rulingSetSha256,
    ],
    ['prompt.sha256', rec.prompt === null ? null : rec.prompt.sha256, current.promptSha256],
    ['model', rec.model, current.model],
  ];
  const mismatches = pairs
    .filter(([, recorded, cur]) => recorded !== cur)
    .map(([field, recorded, cur]) => ({ field, recorded, current: cur }));
  const baseChanged = mismatches.some(
    (m) => m.field === 'layer1.sha256' || m.field === 'overlay.sha256'
  );
  return baseChanged
    ? mismatches
    : [...mismatches, ...writtenUnitMismatches({ book, chapterDir, stem, rec })];
}
