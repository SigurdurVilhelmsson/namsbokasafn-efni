/**
 * ruling-set — the scoped ruling set the AI-reviewed layer's gate reads.
 *
 * Spec: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, "Unit B".
 * The artifact is compiled by `compile-ruling-set.js`; this module owns its schema, the
 * three scope shapes, the chapter tokens, and `loadRulingSet`, which refuses anything that
 * is not exactly that shape. Nothing here writes.
 *
 * Scope has exactly three shapes:
 *   {kind:'book'} · {kind:'chapters', chapters} · {kind:'exclude', chapters}
 * and a chapter is the STRING `chNN` or `appendices`, never an integer: in older data `0`
 * meant both ch00 and "the whole book". Legacy integers convert on read in the compiler's
 * inputs only (`0` → book, `-1` → appendices, `N` → chNN); the artifact holds strings.
 *
 * A ruling may also carry a SENSE (added 2026-10-26, after [USER] pointed out that the AI
 * layer exists to use the surrounding text): `null`, or
 *   { id, gloss, otherSenses: [{ id, gloss }, …], status: 'proposed'|'ruled' }
 * The model names the sense it judged from the closed list — `id`, an id in `otherSenses`, or
 * UNCLEAR_SENSE — and the gate refuses an edit whose declared sense is not `id`. A homograph
 * such as `cell` is restricted by sense, not by a chapter list, because a chapter list cannot
 * separate the senses (the electrochemical cell occurs in six chapter directories).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const RULING_SET_SCHEMA = 'ai-review-ruling-set/1';

/** The repository root, from this file's own location (never the cwd). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A chapter token as the artifact stores it. */
export const CHAPTER_TOKEN_RE = /^(ch\d\d|appendices)$/;

/** The id shape: lowercase ASCII words joined by single hyphens. */
export const RULING_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const SCOPE_STATUSES = Object.freeze(['default', 'proposed', 'ruled']);

/** A sense id: the same slug shape as a ruling id. */
export const SENSE_ID_RE = RULING_ID_RE;

/** What the model declares when the context does not settle the sense. Never a sense id. */
export const UNCLEAR_SENSE = 'unclear';

/** 'ruled' admits edits that declare the sense; 'proposed' holds the ruling (the gate refuses). */
export const SENSE_STATUSES = Object.freeze(['proposed', 'ruled']);

const BOOK = 'book';

/**
 * Convert one chapter value from older data to a token.
 * `0` → 'book' (the whole book, NOT ch00), `-1` → 'appendices', an integer 1–99 → 'chNN';
 * the strings 'chNN' and 'appendices' pass through. Anything else throws.
 * @param {unknown} value
 * @returns {string} 'book' | 'appendices' | 'chNN'
 */
export function convertLegacyChapter(value) {
  if (typeof value === 'string') {
    if (CHAPTER_TOKEN_RE.test(value)) return value;
    throw new Error(`ruling-set: unknown chapter string ${JSON.stringify(value)}`);
  }
  if (Number.isInteger(value)) {
    if (value === 0) return BOOK;
    if (value === -1) return 'appendices';
    if (value >= 1 && value <= 99) return `ch${String(value).padStart(2, '0')}`;
  }
  throw new Error(`ruling-set: cannot read chapter ${JSON.stringify(value) ?? String(value)}`);
}

/** Book order: ch00 … ch99, then appendices. */
function chapterOrder(a, b) {
  const rank = (t) => (t === 'appendices' ? 1000 : Number(t.slice(2)));
  return rank(a) - rank(b);
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function onlyKeys(obj, allowed, what) {
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length)
    throw new Error(`ruling-set: ${what} has unexpected key(s) ${extra.join(', ')}`);
}

/**
 * Normalise a scope read from an INPUT (base rows, exceptions file), converting legacy
 * integer chapters. A `[0]` chapter list reads as book-wide; `0` beside other chapters, or
 * in an exclude list, is ambiguous and refuses. The chapter list comes back in book order.
 * @param {unknown} scope
 * @returns {{kind:'book'}|{kind:'chapters'|'exclude', chapters:string[]}}
 */
export function normalizeScope(scope) {
  if (!isPlainObject(scope))
    throw new Error(`ruling-set: scope must be an object, got ${JSON.stringify(scope)}`);
  if (scope.kind === 'book') {
    onlyKeys(scope, ['kind'], 'a book scope');
    return { kind: 'book' };
  }
  if (scope.kind !== 'chapters' && scope.kind !== 'exclude') {
    throw new Error(`ruling-set: unknown scope kind ${JSON.stringify(scope.kind)}`);
  }
  onlyKeys(scope, ['kind', 'chapters'], `a ${scope.kind} scope`);
  if (!Array.isArray(scope.chapters) || scope.chapters.length === 0) {
    throw new Error(`ruling-set: a ${scope.kind} scope needs a non-empty chapters array`);
  }
  const tokens = scope.chapters.map(convertLegacyChapter);
  if (tokens.includes(BOOK)) {
    if (scope.kind === 'chapters' && tokens.length === 1) return { kind: 'book' };
    throw new Error(
      `ruling-set: chapter 0 in a ${scope.kind} scope ${JSON.stringify(scope.chapters)} is ambiguous (book or ch00?)`
    );
  }
  if (new Set(tokens).size !== tokens.length) {
    throw new Error(`ruling-set: duplicate chapter in scope ${JSON.stringify(scope.chapters)}`);
  }
  return { kind: scope.kind, chapters: [...tokens].sort(chapterOrder) };
}

/**
 * Check a scope as the ARTIFACT stores it: canonical tokens only, no legacy integers,
 * no duplicates, in book order.
 */
function checkCanonicalScope(scope, where) {
  if (!isPlainObject(scope)) throw new Error(`ruling-set: ${where}: scope must be an object`);
  if (scope.kind === 'book') return onlyKeys(scope, ['kind'], `${where}: book scope`);
  if (scope.kind !== 'chapters' && scope.kind !== 'exclude') {
    throw new Error(`ruling-set: ${where}: unknown scope kind ${JSON.stringify(scope.kind)}`);
  }
  onlyKeys(scope, ['kind', 'chapters'], `${where}: scope`);
  const ch = scope.chapters;
  if (!Array.isArray(ch) || ch.length === 0)
    throw new Error(`ruling-set: ${where}: empty chapters`);
  for (const t of ch) {
    if (typeof t !== 'string' || !CHAPTER_TOKEN_RE.test(t)) {
      throw new Error(`ruling-set: ${where}: bad chapter token ${JSON.stringify(t)}`);
    }
  }
  const sorted = [...new Set(ch)].sort(chapterOrder);
  if (JSON.stringify(sorted) !== JSON.stringify(ch)) {
    throw new Error(`ruling-set: ${where}: chapters must be unique and in book order`);
  }
}

const RULING_KEYS = [
  'id',
  'enNorm',
  'en',
  'is',
  'competitors',
  'scope',
  'scopeStatus',
  'sense',
  'kinds',
  'sources',
  'matchable',
  'unmatchableReason',
];

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const isStringArray = (v, nonEmpty) =>
  Array.isArray(v) && (!nonEmpty || v.length > 0) && v.every(isNonEmptyString);

/**
 * Check a sense as the artifact stores it (`null` is the caller's business: it means "no
 * sense restriction"). Every id is a slug, none is UNCLEAR_SENSE, all are distinct; every
 * gloss is non-empty and trimmed; at least one other sense is listed, because a closed list
 * with one member gives the model nothing to judge. Throws on the first problem.
 * @param {unknown} sense
 * @param {string} where
 */
export function checkSense(sense, where) {
  if (!isPlainObject(sense))
    throw new Error(`ruling-set: ${where}: sense must be an object or null`);
  onlyKeys(sense, ['id', 'gloss', 'otherSenses', 'status'], `${where}: sense`);
  const ids = [];
  const checkOne = (s, w) => {
    if (typeof s.id !== 'string' || !SENSE_ID_RE.test(s.id)) {
      throw new Error(`ruling-set: ${w}: bad sense id ${JSON.stringify(s.id)}`);
    }
    if (s.id === UNCLEAR_SENSE) {
      throw new Error(`ruling-set: ${w}: '${UNCLEAR_SENSE}' is reserved for the model's answer`);
    }
    if (!isNonEmptyString(s.gloss) || s.gloss !== s.gloss.trim()) {
      throw new Error(`ruling-set: ${w}: a sense needs a trimmed, non-empty gloss`);
    }
    ids.push(s.id);
  };
  checkOne(sense, `${where}: sense`);
  if (!Array.isArray(sense.otherSenses) || sense.otherSenses.length === 0) {
    throw new Error(`ruling-set: ${where}: sense.otherSenses must list at least one other sense`);
  }
  sense.otherSenses.forEach((o, i) => {
    const w = `${where}: sense.otherSenses[${i}]`;
    if (!isPlainObject(o)) throw new Error(`ruling-set: ${w} is not an object`);
    onlyKeys(o, ['id', 'gloss'], w);
    checkOne(o, w);
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error(`ruling-set: ${where}: sense ids must be distinct`);
  }
  if (!SENSE_STATUSES.includes(sense.status)) {
    throw new Error(`ruling-set: ${where}: bad sense status ${JSON.stringify(sense.status)}`);
  }
}

function checkRuling(r, where) {
  if (!isPlainObject(r)) throw new Error(`ruling-set: ${where} is not an object`);
  onlyKeys(r, RULING_KEYS, where);
  if (typeof r.id !== 'string' || !RULING_ID_RE.test(r.id)) {
    throw new Error(`ruling-set: ${where}: bad id ${JSON.stringify(r.id)}`);
  }
  if (!isNonEmptyString(r.enNorm)) throw new Error(`ruling-set: ${where}: bad enNorm`);
  if (!isStringArray(r.en, true)) throw new Error(`ruling-set: ${where}: en must list forms`);
  if (!isNonEmptyString(r.is) || r.is !== r.is.trim()) {
    throw new Error(`ruling-set: ${where}: bad target`);
  }
  if (!isStringArray(r.competitors, false))
    throw new Error(`ruling-set: ${where}: bad competitors`);
  checkCanonicalScope(r.scope, where);
  if (!SCOPE_STATUSES.includes(r.scopeStatus)) {
    throw new Error(`ruling-set: ${where}: bad scopeStatus ${JSON.stringify(r.scopeStatus)}`);
  }
  if (r.scopeStatus === 'default' && r.scope.kind !== 'book') {
    throw new Error(`ruling-set: ${where}: scopeStatus default needs a book scope`);
  }
  // Present on every ruling: null for none. An absent key is refused, never read as null.
  if (r.sense !== null) checkSense(r.sense, where);
  if (!isStringArray(r.kinds, true)) throw new Error(`ruling-set: ${where}: bad kinds`);
  if (!isStringArray(r.sources, true)) throw new Error(`ruling-set: ${where}: bad sources`);
  if (typeof r.matchable !== 'boolean')
    throw new Error(`ruling-set: ${where}: matchable must be boolean`);
  if (r.matchable === 'unmatchableReason' in r) {
    throw new Error(
      `ruling-set: ${where}: unmatchableReason must be present exactly when matchable is false`
    );
  }
  if (!r.matchable && !isNonEmptyString(r.unmatchableReason)) {
    throw new Error(`ruling-set: ${where}: empty unmatchableReason`);
  }
}

function checkFileRef(ref, what) {
  if (!isPlainObject(ref)) throw new Error(`ruling-set: ${what} must be an object`);
  onlyKeys(ref, ['path', 'sha256'], what);
  if (!isNonEmptyString(ref.path) || path.isAbsolute(ref.path)) {
    throw new Error(`ruling-set: ${what}.path must be repo-relative`);
  }
  if (typeof ref.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(ref.sha256)) {
    throw new Error(`ruling-set: ${what}.sha256 must be 64 hex characters`);
  }
}

/**
 * Validate a parsed ruling-set artifact. Throws on the first problem; returns the input.
 * @param {any} set
 */
export function validateRulingSet(set) {
  if (!isPlainObject(set)) throw new Error('ruling-set: artifact is not an object');
  if (set.schema !== RULING_SET_SCHEMA) {
    throw new Error(`ruling-set: schema ${JSON.stringify(set.schema)} is not ${RULING_SET_SCHEMA}`);
  }
  onlyKeys(
    set,
    ['schema', 'about', 'base', 'exceptions', 'counts', 'rulings', 'excluded', 'notes'],
    'the artifact'
  );
  if (!isNonEmptyString(set.about)) throw new Error('ruling-set: about is missing');
  checkFileRef(set.base, 'base');
  checkFileRef(set.exceptions, 'exceptions');
  if (!isPlainObject(set.counts)) throw new Error('ruling-set: counts must be an object');
  if (!Array.isArray(set.rulings)) throw new Error('ruling-set: rulings must be an array');
  if (!Array.isArray(set.excluded)) throw new Error('ruling-set: excluded must be an array');
  if (!Array.isArray(set.notes)) throw new Error('ruling-set: notes must be an array');

  set.rulings.forEach((r, i) => checkRuling(r, `rulings[${i}]`));
  const ids = set.rulings.map((r) => r.id);
  if (new Set(ids).size !== ids.length) throw new Error('ruling-set: duplicate ruling id');
  for (let i = 1; i < ids.length; i++) {
    if (!(ids[i - 1] < ids[i]))
      throw new Error(`ruling-set: rulings are not sorted by id at ${ids[i]}`);
  }
  const enNorms = new Set(set.rulings.map((r) => r.enNorm));
  if (enNorms.size !== set.rulings.length)
    throw new Error('ruling-set: two rulings share an enNorm');
  set.excluded.forEach((e, i) => {
    if (!isPlainObject(e)) throw new Error(`ruling-set: excluded[${i}] is not an object`);
    onlyKeys(e, ['enNorm', 'reason'], `excluded[${i}]`);
    if (!isNonEmptyString(e.enNorm) || !isNonEmptyString(e.reason)) {
      throw new Error(`ruling-set: excluded[${i}] needs enNorm and reason`);
    }
    if (enNorms.has(e.enNorm))
      throw new Error(`ruling-set: ${e.enNorm} is both ruled and excluded`);
  });
  return set;
}

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

/**
 * Read and validate a compiled ruling set. A relative path resolves against the repository
 * root (not the cwd).
 * @param {string} file
 * @returns {{ rulings: readonly object[], byId: Map<string, object>, sha256: string }}
 *   `byId` is a Map (so an id such as `constructor` cannot collide with an object key).
 */
export function loadRulingSet(file) {
  const abs = path.isAbsolute(file) ? file : path.join(REPO_ROOT, file);
  const bytes = fs.readFileSync(abs);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const set = deepFreeze(validateRulingSet(JSON.parse(bytes.toString('utf8'))));
  const byId = new Map(set.rulings.map((r) => [r.id, r]));
  return Object.freeze({ rulings: set.rulings, byId, sha256 });
}
