#!/usr/bin/env node
/**
 * compile-ruling-set — compile the scoped term-ruling set for the AI-reviewed layer.
 *
 * Spec: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, "Unit B".
 *
 *   node tools/ai-review/compile-ruling-set.js --base <path> --exceptions <path>
 *       [--amendments <path>] --out <path>
 *
 * Inputs: the FROZEN 2026-10-11 ruling set (read, never changed), a scope-exceptions file,
 * which holds chapter widths (`exceptions`) and sense restrictions (`senses`), and optionally
 * an amendments file, which carries out a dated decision record by retargeting, adding or
 * removing rulings (readAmendments). Without it the output is byte-identical to before.
 * Output: one effective ruling per enNorm, with an id, a scope, a scope status, a sense (or
 * null) and a matchability verdict. `compileRulingSet` is pure and deterministic — no clock, no git HEAD,
 * fixed key order, sorted arrays — so a test can recompile the committed inputs and require
 * byte equality with the committed artifact.
 *
 * Refusals (exit 1, nothing written): two rows of one enNorm with different targets
 * (case-insensitive); a headword both held and ruled; an exception or a sense naming no row,
 * or a held one; a malformed sense (ruling-set.js checkSense); a supersession that matches nothing; a base row whose scope is not book-wide (a width
 * enters only through the exceptions file, with a status); two enNorms minting one id; an
 * unknown CLI flag; an --out that is not a dated ruling-set name, or that reaches one of the
 * inputs by any route (same path, symlinked directory, symlink, hard link).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { greekLetters } from '../lib/mt-output-guards.js';
import {
  RULING_SET_SCHEMA,
  REPO_ROOT,
  normalizeScope,
  validateRulingSet,
  checkSense,
} from './ruling-set.js';

export const RULING_SET_ABOUT =
  "The scoped term-ruling set the AI-reviewed layer's gate reads (spec " +
  'docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit B). Compiled by ' +
  'tools/ai-review/compile-ruling-set.js from `base` (the frozen 2026-10-11 set: its stage1 and ' +
  "before rows) and `exceptions` (scope exceptions to D2's book-wide default). Deterministic: a " +
  'test recompiles it and requires byte equality, so never edit it by hand. One ruling per ' +
  "enNorm, after the base's supersededInBefore is applied (a superseded target survives only as " +
  'a competitor). `id` is a slug of enNorm minted here. `en` lists every English form the rows ' +
  'carry, plus each form with its parentheticals removed (case kept). `is` is the recorded ' +
  "target, unchanged. `competitors` are the other renderings the rows name: a before row's " +
  "competitor; a stage1 row's stored word, tied words, stored alternatives and superseded page " +
  'answer; any superseded target; never the target itself (compared with every parenthetical ' +
  'removed, case ignored). `kinds` are the before kinds plus ' +
  "'stage1'; `sources` cite each row. `scope` is {kind:'book'} with scopeStatus 'default' unless " +
  "the exceptions file names the headword; a 'proposed' width is not ruled, and the gate admits " +
  'no operation for it. `sense` is null unless the exceptions file restricts the ruling to one ' +
  'sense of a homograph: then {id, gloss, otherSenses, status}, the model names the sense it ' +
  "judged from that closed list or 'unclear', and the gate refuses an edit that does not declare " +
  "`id` (a 'proposed' sense admits nothing). `matchable` is false, with codes in " +
  'unmatchableReason, when the target ' +
  'holds a digit, a Greek letter, an uppercase letter after the first letter of a run of ' +
  'letters, an operator or bracket character, an underscore, or a non-ASCII space or control ' +
  'character, or when the enNorm holds a bracketed placeholder such as [formula]. Held rows and ' +
  'rows without a target are listed under `excluded`, never ruled.';

/**
 * Appended to `about` only when an amendments file is given (so RULING_SET_ABOUT, which an
 * unamended artifact carries byte for byte, never changes).
 */
export const AMENDMENTS_ABOUT =
  '`amendments` is a dated input that carries out a decision record: it retargets, adds or ' +
  'removes a ruling, each entry citing the record and the decision. A retarget or a remove ' +
  "names the current target, so an amendment written against another set refuses; a retarget's " +
  "old target survives as a competitor and the ruling gains kind 'amendment' and a source; an " +
  "add mints a book-wide ruling of kind 'amendment'; a removed headword is listed under " +
  "`excluded` with reason 'removed'. Each amendment also leaves a note.";

/**
 * Appended after AMENDMENTS_ABOUT only when a set uses more than one amendments file, a `forms`
 * amendment, or an add listing its forms (so a set that uses none keeps its bytes).
 */
export const CHAINED_FORMS_ABOUT =
  'Several amendments files may be given, oldest first and one per date, each applied on top of ' +
  "the last and each source keeping its own file's date; `amendments` then lists them in that " +
  "order. A 'forms' amendment adds English forms to an existing ruling, naming its current " +
  'target, and an add may list several English forms; each new form becomes one of the ' +
  "ruling's `en` forms and may not belong to another headword.";

/** The --out basename the CLI will write (a dated ruling set, never a frozen input). */
export const OUT_NAME_RE = /^ruling-set-\d{4}-\d{2}-\d{2}\.json$/;

const PRINT_WIDTH = 100; // .prettierrc printWidth, so the artifact passes `prettier --check`

// ─── Small pure helpers ──────────────────────────────────────────────────

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniqueSorted = (xs) => [...new Set(xs)].sort(byCodePoint);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const sha256Of = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function onlyKeys(obj, allowed, what) {
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length)
    throw new Error(`ruling-set: ${what} has unexpected key(s) ${extra.join(', ')}`);
}

/**
 * The enNorm of an English key term — the rule both Python compilers use
 * (`compile_ruling_set.py` / `compile_stage1_rulings.py` `norm`): parentheticals removed,
 * whitespace collapsed, lowercased.
 * @param {string} en
 */
export function normEn(en) {
  return bareForm(en).toLowerCase();
}

/** An English form with its parentheticals removed and whitespace collapsed; case kept. */
export function bareForm(en) {
  return String(en)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A rendering with every parenthetical removed, nested ones included, whitespace collapsed
 * and lowercased: the key on which a competitor counts as the target itself. So
 * `staðalraftroðsspenna ((EX°))` is the target `staðalraftroðsspenna` plus a symbol, not a
 * competitor, while `troðspenna (EX)` against `raftroðsspenna` stays one.
 * @param {string} s
 */
export function glossFreeKey(s) {
  let out = String(s);
  for (let prev = ''; prev !== out;) {
    prev = out;
    out = out.replace(/\([^()]*\)/g, ' ');
  }
  return out.replace(/\s+/g, ' ').trim().toLowerCase();
}

// ─── Ids ─────────────────────────────────────────────────────────────────

const GREEK_NAMES = Object.freeze({
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ε: 'epsilon',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  ι: 'iota',
  κ: 'kappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  ο: 'omicron',
  π: 'pi',
  ρ: 'rho',
  σ: 'sigma',
  ς: 'sigma',
  τ: 'tau',
  υ: 'upsilon',
  φ: 'phi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'omega',
});
const LATIN_EXTRA = Object.freeze({
  ø: 'o',
  æ: 'ae',
  ð: 'd',
  þ: 'th',
  ß: 'ss',
  œ: 'oe',
  ł: 'l',
  đ: 'd',
  ı: 'i',
});

/**
 * Mint a ruling id from an enNorm: lowercase ASCII words joined by `-`. Greek letters become
 * their names and `*` becomes `star`, so `σ bonding orbital` and `σ* bonding orbital` stay
 * apart; apostrophes vanish; every other run of non-alphanumerics is one hyphen. A letter or
 * digit with no transliteration refuses rather than vanishing.
 * @param {string} enNorm
 */
export function slugOf(enNorm) {
  const folded = String(enNorm)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[’'ʼ‘]/g, '')
    .replace(/\*/g, ' star ');
  const mapped = [...folded]
    .map((c) => (GREEK_NAMES[c] ? ` ${GREEK_NAMES[c]} ` : (LATIN_EXTRA[c] ?? c)))
    .join('');
  const stray = mapped.match(/[^\x00-\x7f]/gu)?.filter((c) => /[\p{L}\p{N}]/u.test(c)) ?? [];
  if (stray.length) {
    throw new Error(
      `ruling-set: no transliteration for ${stray.join(' ')} in ${JSON.stringify(enNorm)}`
    );
  }
  const slug = mapped.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Error(`ruling-set: ${JSON.stringify(enNorm)} mints an empty id`);
  return slug;
}

// ─── Matchability ────────────────────────────────────────────────────────

// The gate's operator set, `& < >`, brackets of every kind, `|`, and the underscore of the
// legacy `__` marker.
const OPERATOR_OR_BRACKET_RE = /[[\]{}()|=+−–×÷±/%‰°⇌→⟶←↔≤≥≈*^~$&<>_]/u;

// NBSP and the other non-ASCII spaces, soft hyphen, zero-width and bidi format characters,
// C0 controls and DEL. Built from code points on purpose: most of these are invisible, so a
// literal character class reads as nothing at all (and an editor may rewrite it).
const SPACE_OR_CONTROL_RANGES = Object.freeze([
  [0x00, 0x1f], // C0 controls
  [0x7f, 0x7f], // DEL
  [0xa0, 0xa0], // NO-BREAK SPACE
  [0xad, 0xad], // SOFT HYPHEN
  [0x1680, 0x1680], // OGHAM SPACE MARK
  [0x180e, 0x180e], // MONGOLIAN VOWEL SEPARATOR
  [0x2000, 0x200f], // EN QUAD … HAIR SPACE, ZERO WIDTH SPACE/(NON-)JOINER, LRM, RLM
  [0x2028, 0x202f], // LINE/PARAGRAPH SEPARATOR, bidi embeddings, NARROW NO-BREAK SPACE
  [0x205f, 0x2064], // MEDIUM MATHEMATICAL SPACE, WORD JOINER, invisible operators
  [0x3000, 0x3000], // IDEOGRAPHIC SPACE
  [0xfeff, 0xfeff], // ZERO WIDTH NO-BREAK SPACE (BOM)
]);
const hasSpaceOrControl = (s) =>
  [...s].some((c) => {
    const cp = c.codePointAt(0);
    return SPACE_OR_CONTROL_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
  });

/**
 * Can the gate's token rules ever pass an operation that writes `target`? Checks the
 * target's characters and the enNorm's placeholders only — not element-symbol words (the
 * gate's lexicon owns that list) and not whether the English forms occur in prose.
 * @param {string} target
 * @param {string} enNorm
 * @returns {{matchable: true} | {matchable: false, reason: string}}
 */
export function matchability(target, enNorm) {
  const codes = [];
  if (/\p{N}/u.test(target)) codes.push('target-digit');
  if (greekLetters(target).length) codes.push('target-greek');
  const runs = target.match(/\p{L}+/gu) || [];
  if (runs.some((run) => [...run].slice(1).some((c) => /[\p{Lu}\p{Lt}]/u.test(c)))) {
    codes.push('target-inner-capital');
  }
  if (OPERATOR_OR_BRACKET_RE.test(target)) codes.push('target-operator-or-bracket');
  if (hasSpaceOrControl(target)) codes.push('target-space-or-control');
  if (/[[\]]/.test(enNorm)) codes.push('enNorm-placeholder');
  return codes.length ? { matchable: false, reason: codes.join(', ') } : { matchable: true };
}

// ─── Inputs ──────────────────────────────────────────────────────────────

/** Resolve a CLI/library path against the repository root (never the cwd). */
function resolveRepoPath(p) {
  return path.isAbsolute(p) ? path.normalize(p) : path.join(REPO_ROOT, p);
}

function repoRelative(abs) {
  const rel = path.relative(REPO_ROOT, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`ruling-set: ${abs} is not inside the repository`);
  }
  return rel.split(path.sep).join('/');
}

/**
 * Read the inputs as the compiler takes them. Relative paths resolve against the
 * repository root; the recorded path is repo-relative and POSIX, so the artifact does not
 * depend on where the repository is checked out. `amendments` is in the result only when
 * `amendmentsPath` is given: one input for one path, a list (in the same order) for a list.
 * @param {string} basePath
 * @param {string} exceptionsPath
 * @param {string|string[]} [amendmentsPath]
 * @returns {{ base: {path: string, text: Buffer}, exceptions: {path: string, text: Buffer},
 *   amendments?: {path: string, text: Buffer} | Array<{path: string, text: Buffer}> }}
 */
export function readInputs(basePath, exceptionsPath, amendmentsPath) {
  const read = (p) => {
    const abs = resolveRepoPath(p);
    return { path: repoRelative(abs), text: fs.readFileSync(abs) };
  };
  return {
    base: read(basePath),
    exceptions: read(exceptionsPath),
    ...(amendmentsPath === undefined
      ? {}
      : {
          amendments: Array.isArray(amendmentsPath)
            ? amendmentsPath.map(read)
            : read(amendmentsPath),
        }),
  };
}

function fileRef(input, what) {
  if (!isPlainObject(input)) throw new Error(`ruling-set: ${what} input must be {path, text}`);
  const p = input.path;
  if (
    !isNonEmptyString(p) ||
    path.posix.isAbsolute(p) ||
    path.win32.isAbsolute(p) ||
    p.includes('\\') ||
    path.posix.normalize(p) !== p ||
    p.startsWith('..')
  ) {
    throw new Error(`ruling-set: ${what} path ${JSON.stringify(p)} must be repo-relative`);
  }
  const bytes = Buffer.isBuffer(input.text) ? input.text : Buffer.from(String(input.text), 'utf8');
  let json;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch (e) {
    throw new Error(`ruling-set: ${what} is not JSON: ${e.message}`);
  }
  return { ref: { path: p, sha256: sha256Of(bytes) }, json };
}

function checkRow(row, where) {
  if (!isPlainObject(row)) throw new Error(`ruling-set: ${where} is not an object`);
  if (typeof row.en !== 'string' || !isNonEmptyString(row.enNorm)) {
    throw new Error(`ruling-set: ${where} needs en and enNorm`);
  }
  if (normEn(row.en) !== row.enNorm) {
    throw new Error(
      `ruling-set: ${where}: enNorm ${JSON.stringify(row.enNorm)} is not the normalised en ${JSON.stringify(row.en)}`
    );
  }
  if (row.is !== null && (!isNonEmptyString(row.is) || row.is !== row.is.trim())) {
    throw new Error(`ruling-set: ${where}: target must be null or a trimmed, non-empty string`);
  }
  if (normalizeScope(row.scope).kind !== 'book') {
    throw new Error(
      `ruling-set: ${where} (${row.enNorm}) has a non-book scope; a width enters only through the exceptions file, with a status`
    );
  }
}

const optStrings = (v) => (Array.isArray(v) ? v.filter(isNonEmptyString) : []);

/** The base's rows, stage1 first then before, each in base order. */
function readBase(base) {
  if (!isPlainObject(base)) throw new Error('ruling-set: base is not an object');
  for (const k of ['stage1', 'before', 'supersededInBefore']) {
    if (!Array.isArray(base[k])) throw new Error(`ruling-set: base.${k} must be an array`);
  }
  if (base.inflectionNotes !== undefined && !Array.isArray(base.inflectionNotes)) {
    throw new Error('ruling-set: base.inflectionNotes must be an array');
  }
  const ids = new Set();
  const stage1 = base.stage1.map((row, i) => {
    checkRow(row, `stage1[${i}]`);
    if (!isNonEmptyString(row.id) || ids.has(row.id)) {
      throw new Error(`ruling-set: stage1[${i}] needs a unique id`);
    }
    ids.add(row.id);
    return {
      enNorm: row.enNorm,
      en: row.en,
      is: row.is,
      kind: 'stage1',
      held: false,
      competitors: [
        row.stored,
        ...optStrings(row.storedTied),
        ...optStrings(row.storedAlternatives),
        row.pageAnswer,
      ],
      source: `stage1 ${row.id} (${row.origin ?? 'origin not recorded'}; ${row.ruled ?? 'not ruled'})`,
    };
  });
  const before = base.before.map((row, i) => {
    checkRow(row, `before[${i}]`);
    if (!isNonEmptyString(row.kind)) throw new Error(`ruling-set: before[${i}] needs a kind`);
    return {
      enNorm: row.enNorm,
      en: row.en,
      is: row.is,
      kind: row.kind,
      held: row.kind === 'held',
      competitors: [row.competitor],
      source: `before ${row.kind}: ${row.source ?? 'source not recorded'} (${row.ruled ?? 'not ruled'})`,
    };
  });
  return { stage1, before };
}

// ─── Amendments ──────────────────────────────────────────────────────────

/** The keys each amendment op carries, `op` first. */
const AMENDMENT_KEYS = Object.freeze({
  retarget: ['op', 'enNorm', 'from', 'to', 'decision'],
  add: ['op', 'en', 'is', 'decision'],
  remove: ['op', 'enNorm', 'from', 'decision'],
  forms: ['op', 'enNorm', 'is', 'forms', 'decision'],
});

/** The keys whose value is a list of English forms (`en` may also be one string). */
const FORM_LIST_KEYS = new Set(['en', 'forms']);

/** A list of English forms: non-empty, each trimmed and non-empty, none listed twice. */
function readFormList(v, where, key) {
  const list = key === 'en' && typeof v === 'string' ? [v] : v;
  if (!Array.isArray(list) || list.length === 0 || !list.every(isNonEmptyString)) {
    throw new Error(`ruling-set: ${where} needs ${key} as a non-empty list of non-empty forms`);
  }
  for (const f of list) {
    if (f !== f.trim())
      throw new Error(`ruling-set: ${where}: ${key} ${JSON.stringify(f)} must be trimmed`);
  }
  const dup = list.find((f, i) => list.indexOf(f) !== i);
  if (dup !== undefined) throw new Error(`ruling-set: ${where} lists ${JSON.stringify(dup)} twice`);
  return list;
}

/**
 * Read an amendments file:
 *   { about, recordedAt: 'YYYY-MM-DD', record: <path of the decision record>, amendments: [
 *       { op: 'retarget', enNorm, from, to, decision }
 *     | { op: 'add', en, is, decision }
 *     | { op: 'remove', enNorm, from, decision }
 *     | { op: 'forms', enNorm, is, forms: [<English form>, …], decision } ] }
 * An add's `en` is one English form or a list of them, keyed on the first. A `forms` amendment
 * adds English forms to an existing ruling and names its current target as `is`. `decision`
 * names which of the record's decisions the amendment carries out; an amendment may carry its own
 * `record` when it carries out a different record from the file's. At most one amendment per
 * enNorm, so the order of the list cannot change the result.
 */
function readAmendments(file) {
  if (!isPlainObject(file)) throw new Error('ruling-set: amendments file is not an object');
  onlyKeys(file, ['about', 'recordedAt', 'record', 'amendments'], 'the amendments file');
  if (!isNonEmptyString(file.about)) throw new Error('ruling-set: amendments file needs about');
  if (typeof file.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(file.recordedAt)) {
    throw new Error('ruling-set: amendments file needs recordedAt as YYYY-MM-DD');
  }
  if (!isNonEmptyString(file.record)) throw new Error('ruling-set: amendments file needs a record');
  if (!Array.isArray(file.amendments)) throw new Error('ruling-set: amendments must be an array');
  const seen = new Set();
  const list = file.amendments.map((a, i) => {
    const where = `amendments[${i}]`;
    if (!isPlainObject(a)) throw new Error(`ruling-set: ${where} is not an object`);
    const keys = AMENDMENT_KEYS[a.op];
    if (!keys) throw new Error(`ruling-set: ${where}: op must be retarget, add, remove or forms`);
    onlyKeys(a, [...keys, 'record'], where);
    const lists = {};
    for (const k of keys.slice(1)) {
      if (FORM_LIST_KEYS.has(k)) {
        lists[k] = readFormList(a[k], `${where} (${a.op})`, k);
        continue;
      }
      if (!isNonEmptyString(a[k])) throw new Error(`ruling-set: ${where} (${a.op}) needs ${k}`);
      if (a[k] !== a[k].trim()) throw new Error(`ruling-set: ${where}: ${k} must be trimmed`);
    }
    // Optional: the record this amendment carries out, when it is not the file's `record`.
    if ('record' in a && (!isNonEmptyString(a.record) || a.record !== a.record.trim())) {
      throw new Error(`ruling-set: ${where}: record must be a trimmed, non-empty path`);
    }
    const enNorm = a.op === 'add' ? normEn(lists.en[0]) : a.enNorm;
    if (a.op !== 'add' && normEn(enNorm) !== enNorm) {
      throw new Error(`ruling-set: ${where}: enNorm ${JSON.stringify(enNorm)} is not normalised`);
    }
    if (seen.has(enNorm)) throw new Error(`ruling-set: two amendments of ${enNorm}`);
    seen.add(enNorm);
    if (a.op === 'retarget' && a.to.toLowerCase() === a.from.toLowerCase()) {
      throw new Error(`ruling-set: ${where}: retargeting ${enNorm} to ${a.to} changes nothing`);
    }
    return {
      op: a.op,
      enNorm,
      // add: every English form; forms: the forms added. `listed` is false only for an add
      // written with one string, whose note keeps the shape it had before lists existed.
      forms: a.op === 'add' ? lists.en : (lists.forms ?? null),
      listed: a.op === 'forms' || (a.op === 'add' && Array.isArray(a.en)),
      from: a.op === 'forms' ? a.is : (a.from ?? null),
      to: a.to ?? a.is ?? null,
      decision: a.decision,
      record: a.record ?? file.record,
    };
  });
  return { recordedAt: file.recordedAt, record: file.record, list };
}

/** Which headword each English key already belongs to: every row's enNorm and normalised form. */
function formOwners(rows) {
  const owners = new Map();
  for (const r of rows) {
    owners.set(r.enNorm, r.enNorm);
    if (isNonEmptyString(r.en)) owners.set(normEn(r.en), r.enNorm);
  }
  return owners;
}

/**
 * Apply one amendments file to the rows, on top of what earlier files did (`prior`). A
 * retarget, a remove or a forms must name the CURRENT target (case-insensitive, as a
 * supersession compares), so an amendment written against another set refuses instead of
 * applying blind. A retarget's old target survives as a competitor; a remove leaves the headword
 * listed under `excluded`; an add refuses a headword that already has rows (retarget it
 * instead); a forms adds one row per new English form, and refuses a form the ruling already has
 * or one that belongs to another headword (an add's forms are checked the same way). An earlier
 * file's remove is final: a later amendment of that headword refuses.
 */
function applyAmendments(prior, amd) {
  const sourceOf = (a) => `amendment ${amd.recordedAt} ${a.op}: ${a.record} (${a.decision})`;
  let rows = prior.rows;
  const removed = new Set(prior.removed);
  const oldTargets = new Map(prior.oldTargets); // enNorm → [targets a retarget replaced]
  const sources = new Map(prior.sources); // enNorm → [the sources a retarget adds]
  const push = (map, k, vs) => map.set(k, [...(map.get(k) || []), ...vs]);
  const checkForms = (a) => {
    const owners = formOwners(rows);
    for (const f of a.forms) {
      const owner = owners.get(normEn(f));
      if (owner === undefined || (a.op === 'add' && normEn(f) === a.enNorm)) continue;
      throw new Error(
        owner === a.enNorm
          ? `ruling-set: ${a.op} ${a.enNorm}: the ruling already has the form ${JSON.stringify(f)}`
          : `ruling-set: ${a.op} ${a.enNorm}: ${JSON.stringify(f)} is a form of another headword, ${owner}`
      );
    }
  };
  for (const a of amd.list) {
    if (removed.has(a.enNorm)) {
      throw new Error(`ruling-set: ${a.op} ${a.enNorm} names a headword an earlier file removed`);
    }
    const mine = rows.filter((r) => r.enNorm === a.enNorm);
    if (a.op === 'add') {
      if (mine.length) {
        throw new Error(
          `ruling-set: add ${a.enNorm}: the headword already has rows (retarget it instead)`
        );
      }
      checkForms(a);
      const row = (en) => ({
        enNorm: a.enNorm,
        en,
        is: a.to,
        kind: 'amendment',
        held: false,
        competitors: [],
        source: sourceOf(a),
      });
      rows = [...rows, ...a.forms.map(row)];
      continue;
    }
    if (!mine.length) throw new Error(`ruling-set: ${a.op} ${a.enNorm} matches no row`);
    if (mine.some((r) => r.held || r.is === null)) {
      throw new Error(`ruling-set: ${a.op} ${a.enNorm} names a held (excluded) headword`);
    }
    if (!mine.every((r) => r.is.toLowerCase() === a.from.toLowerCase())) {
      throw new Error(
        `ruling-set: ${a.op} ${a.enNorm}: ${a.from} is not the target (${uniqueSorted(mine.map((r) => r.is)).join(' | ')})`
      );
    }
    if (a.op === 'remove') {
      removed.add(a.enNorm);
      continue;
    }
    if (a.op === 'forms') {
      checkForms(a);
      const row = (en) => ({
        enNorm: a.enNorm,
        en,
        is: mine[0].is,
        kind: 'amendment',
        held: false,
        competitors: [],
        source: sourceOf(a),
      });
      rows = [...rows, ...a.forms.map(row)];
      continue;
    }
    push(oldTargets, a.enNorm, uniqueSorted(mine.map((r) => r.is)));
    push(sources, a.enNorm, [sourceOf(a)]);
    rows = rows.map((r) => (r.enNorm === a.enNorm ? { ...r, is: a.to } : r));
  }
  const notes = amd.list.map((a) => ({
    kind: 'amendment',
    op: a.op,
    enNorm: a.enNorm,
    from: a.from,
    to: a.op === 'remove' ? null : a.to,
    ...(a.listed ? { forms: a.forms } : {}),
    record: a.record,
    decision: a.decision,
  }));
  const count = (op) => amd.list.filter((a) => a.op === op).length;
  const c = prior.counts;
  return {
    rows,
    removed,
    oldTargets,
    sources,
    notes: [...prior.notes, ...notes],
    counts: {
      retargeted: c.retargeted + count('retarget'),
      added: c.added + count('add'),
      removed: c.removed + count('remove'),
      forms: c.forms + count('forms'),
    },
    usesNewShapes: prior.usesNewShapes || amd.list.some((a) => a.listed),
  };
}

/**
 * Apply amendments files in order, each strictly later (`recordedAt`) than the one before, so the
 * order is checked rather than trusted. Each file's sources keep its own date.
 */
function applyAmendmentFiles(rows, files) {
  let state = {
    rows,
    removed: new Set(),
    oldTargets: new Map(),
    sources: new Map(),
    notes: [],
    counts: { retargeted: 0, added: 0, removed: 0, forms: 0 },
    usesNewShapes: files.length > 1,
  };
  // Checked before anything is applied, so a misordered list refuses on its order and not on
  // whatever its first misapplied amendment happens to trip over.
  files.forEach((amd, i) => {
    const last = i > 0 ? files[i - 1].recordedAt : null;
    if (last !== null && !(amd.recordedAt > last)) {
      throw new Error(
        `ruling-set: amendments files are out of date order (${amd.recordedAt} after ${last}); give them oldest first, one per date`
      );
    }
  });
  for (const amd of files) state = applyAmendments(state, amd);
  // A `forms` count only when there is one, so a set that uses none keeps its bytes.
  const { forms, ...counts } = state.counts;
  return { ...state, counts: forms > 0 ? { ...counts, forms } : counts };
}

const NO_AMENDMENTS = Object.freeze({
  removed: new Set(),
  oldTargets: new Map(),
  sources: new Map(),
  notes: [],
});

/** Drop the before rows each supersession names; refuse one that matches nothing. */
function applySupersession(rows, supersessions) {
  const dropped = new Set();
  const notes = [];
  const supersededTargets = new Map(); // enNorm → [old targets]
  for (const [i, s] of supersessions.entries()) {
    if (!isPlainObject(s) || ![s.enNorm, s.from, s.to].every(isNonEmptyString)) {
      throw new Error(`ruling-set: supersededInBefore[${i}] needs enNorm, from and to`);
    }
    const hits = rows.before.filter(
      (r) => r.enNorm === s.enNorm && r.is !== null && r.is.toLowerCase() === s.from.toLowerCase()
    );
    if (!hits.length) {
      throw new Error(
        `ruling-set: supersession of ${s.enNorm} (${s.from} → ${s.to}) matches no before row`
      );
    }
    hits.forEach((r) => dropped.add(r));
    supersededTargets.set(s.enNorm, [
      ...(supersededTargets.get(s.enNorm) || []),
      ...hits.map((r) => r.is),
    ]);
    notes.push({
      kind: 'superseded',
      enNorm: s.enNorm,
      from: s.from,
      to: s.to,
      record: isNonEmptyString(s.record) ? s.record : 'not recorded',
    });
  }
  const kept = [...rows.stage1, ...rows.before.filter((r) => !dropped.has(r))];
  for (const s of supersessions) {
    const ruled = kept.some(
      (r) => r.enNorm === s.enNorm && r.is !== null && r.is.toLowerCase() === s.to.toLowerCase()
    );
    if (!ruled)
      throw new Error(`ruling-set: supersession of ${s.enNorm} leaves no row ruling ${s.to}`);
  }
  return { kept, notes, supersededTargets, droppedCount: dropped.size };
}

/**
 * The `senses` of the exceptions file, by enNorm. Each entry is
 *   { enNorm, sense, gloss, otherSenses: [{id, gloss}], status, source, glossBy }
 * and becomes the ruling's `sense` { id, gloss, otherSenses, status } (checked by the
 * loader's own checkSense, so the compiler and the loader cannot disagree on the shape) plus
 * a 'sense' note carrying `source` and `glossBy`.
 */
function readSenses(entries) {
  if (!Array.isArray(entries)) throw new Error('ruling-set: senses must be an array');
  const byEnNorm = new Map();
  entries.forEach((e, i) => {
    const where = `senses[${i}]`;
    if (!isPlainObject(e)) throw new Error(`ruling-set: ${where} is not an object`);
    onlyKeys(e, ['enNorm', 'sense', 'gloss', 'otherSenses', 'status', 'source', 'glossBy'], where);
    if (!isNonEmptyString(e.enNorm)) throw new Error(`ruling-set: ${where} needs an enNorm`);
    if (!isNonEmptyString(e.source)) throw new Error(`ruling-set: ${where} needs a source`);
    if (!isNonEmptyString(e.glossBy)) throw new Error(`ruling-set: ${where} needs glossBy`);
    if (byEnNorm.has(e.enNorm)) throw new Error(`ruling-set: duplicate sense for ${e.enNorm}`);
    const otherSenses = Array.isArray(e.otherSenses)
      ? // id and gloss first for a fixed key order; extra keys ride along so checkSense refuses them
        e.otherSenses.map((o) => (isPlainObject(o) ? { id: o.id, gloss: o.gloss, ...o } : o))
      : e.otherSenses;
    const sense = { id: e.sense, gloss: e.gloss, otherSenses, status: e.status };
    checkSense(sense, `${where} (${e.enNorm})`);
    byEnNorm.set(e.enNorm, { enNorm: e.enNorm, sense, source: e.source, glossBy: e.glossBy });
  });
  return byEnNorm;
}

function readExceptions(file) {
  if (!isPlainObject(file)) throw new Error('ruling-set: exceptions file is not an object');
  onlyKeys(file, ['about', 'recordedAt', 'exceptions', 'senses'], 'the exceptions file');
  if (!isNonEmptyString(file.about)) throw new Error('ruling-set: exceptions file needs about');
  if (typeof file.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(file.recordedAt)) {
    throw new Error('ruling-set: exceptions file needs recordedAt as YYYY-MM-DD');
  }
  if (!Array.isArray(file.exceptions)) throw new Error('ruling-set: exceptions must be an array');
  const byEnNorm = new Map();
  file.exceptions.forEach((e, i) => {
    if (!isPlainObject(e)) throw new Error(`ruling-set: exceptions[${i}] is not an object`);
    onlyKeys(e, ['enNorm', 'scope', 'status', 'source', 'note'], `exceptions[${i}]`);
    if (!isNonEmptyString(e.enNorm))
      throw new Error(`ruling-set: exceptions[${i}] needs an enNorm`);
    if (e.status !== 'proposed' && e.status !== 'ruled') {
      throw new Error(
        `ruling-set: exceptions[${i}] (${e.enNorm}) status must be proposed or ruled`
      );
    }
    if (!isNonEmptyString(e.source)) throw new Error(`ruling-set: exceptions[${i}] needs a source`);
    if (typeof e.note !== 'string') throw new Error(`ruling-set: exceptions[${i}] needs a note`);
    if (byEnNorm.has(e.enNorm)) throw new Error(`ruling-set: duplicate exception for ${e.enNorm}`);
    byEnNorm.set(e.enNorm, {
      enNorm: e.enNorm,
      scope: normalizeScope(e.scope),
      status: e.status,
      source: e.source,
      note: e.note,
    });
  });
  return { exceptions: byEnNorm, senses: readSenses(file.senses) };
}

// ─── The compiler ────────────────────────────────────────────────────────

const NOTE_ORDER = [
  'limitation',
  'scope-exception',
  'sense',
  'superseded',
  'amendment',
  'trailing-gloss',
  'inflection-note',
];
const TRAILING_GLOSS_RE = /\s*\([^()]*\)\s*$/;

/**
 * Compile the scoped ruling set. Pure: no I/O, no clock, no git.
 * @param {{path: string, text: string|Buffer}} baseInput the frozen 2026-10-11 ruling set
 * @param {{path: string, text: string|Buffer}} exceptionsInput the scope-exceptions file
 * @param {{path: string, text: string|Buffer} | Array<{path: string, text: string|Buffer}>}
 *   [amendmentsInput] an amendments file, or several oldest first (optional: without it the
 *   artifact carries no `amendments` key and is what it was before amendments existed)
 * @returns {object} the artifact (serialise with serializeRulingSet)
 */
export function compileRulingSet(baseInput, exceptionsInput, amendmentsInput) {
  const { ref: baseRef, json: base } = fileRef(baseInput, 'base');
  const { ref: excRef, json: excFile } = fileRef(exceptionsInput, 'exceptions');
  const amdList =
    amendmentsInput === undefined
      ? []
      : (Array.isArray(amendmentsInput) ? amendmentsInput : [amendmentsInput]).map((input, i) =>
          fileRef(input, Array.isArray(amendmentsInput) ? `amendments[${i}]` : 'amendments')
        );
  if (Array.isArray(amendmentsInput) && amendmentsInput.length === 0) {
    throw new Error('ruling-set: an amendments list must name at least one file');
  }
  const rows = readBase(base);
  const { exceptions, senses } = readExceptions(excFile);
  const {
    kept: superseded,
    notes: supersededNotes,
    supersededTargets,
    droppedCount,
  } = applySupersession(rows, base.supersededInBefore);
  const amended = amdList.length
    ? applyAmendmentFiles(
        superseded,
        amdList.map((a) => readAmendments(a.json))
      )
    : null;
  const kept = amended ? amended.rows : superseded;
  const amd = amended ?? NO_AMENDMENTS;

  const groups = new Map();
  for (const r of kept) groups.set(r.enNorm, [...(groups.get(r.enNorm) || []), r]);

  const rulings = [];
  const excluded = [];
  const trailingGloss = [];
  for (const [enNorm, rs] of groups) {
    if (amd.removed.has(enNorm)) {
      excluded.push({ enNorm, reason: 'removed' });
      continue;
    }
    const targeted = rs.filter((r) => r.is !== null);
    const held = rs.some((r) => r.held);
    if (targeted.length && targeted.length !== rs.length) {
      throw new Error(`ruling-set: ${enNorm} is both held (or without a target) and ruled`);
    }
    if (!targeted.length) {
      excluded.push({ enNorm, reason: held ? 'held' : 'no-target' });
      continue;
    }
    const targets = uniqueSorted(targeted.map((r) => r.is));
    if (new Set(targets.map((t) => t.toLowerCase())).size > 1) {
      throw new Error(`ruling-set: ${enNorm} has different targets: ${targets.join(' | ')}`);
    }
    const is = targeted[0].is;
    const exc = exceptions.get(enNorm);
    const m = matchability(is, enNorm);
    const isKey = glossFreeKey(is);
    const competitors = uniqueSorted(
      [
        ...rs.flatMap((r) => r.competitors),
        ...(supersededTargets.get(enNorm) || []),
        ...(amd.oldTargets.get(enNorm) || []),
      ].filter((c) => isNonEmptyString(c) && glossFreeKey(c) !== isKey)
    );
    const amendSources = amd.sources.get(enNorm) || [];
    const ruling = {
      id: slugOf(enNorm),
      enNorm,
      en: uniqueSorted(rs.flatMap((r) => [r.en, bareForm(r.en)]).filter(isNonEmptyString)),
      is,
      competitors,
      scope: exc ? exc.scope : { kind: 'book' },
      scopeStatus: exc ? exc.status : 'default',
      sense: senses.has(enNorm) ? senses.get(enNorm).sense : null,
      kinds: uniqueSorted([
        ...rs.map((r) => r.kind),
        ...(amendSources.length ? ['amendment'] : []),
      ]),
      sources: uniqueSorted([...rs.map((r) => r.source), ...amendSources]),
      matchable: m.matchable,
    };
    if (!m.matchable) {
      ruling.unmatchableReason = m.reason;
      const withoutGloss = is.replace(TRAILING_GLOSS_RE, '');
      if (withoutGloss && withoutGloss !== is && matchability(withoutGloss, enNorm).matchable) {
        trailingGloss.push({ kind: 'trailing-gloss', enNorm, is, withoutGloss });
      }
    }
    rulings.push(ruling);
  }

  const excludedNorms = new Map(excluded.map((e) => [e.enNorm, e.reason]));
  // A removed headword says so; held and no-target keep the wording they always had.
  const excludedAs = (enNorm) =>
    excludedNorms.get(enNorm) === 'removed' ? 'removed (excluded)' : 'held (excluded)';
  for (const enNorm of exceptions.keys()) {
    if (excludedNorms.has(enNorm)) {
      throw new Error(
        `ruling-set: the exception for ${enNorm} names a ${excludedAs(enNorm)} headword`
      );
    }
    if (!groups.has(enNorm))
      throw new Error(`ruling-set: the exception for ${enNorm} matches no row`);
  }
  for (const enNorm of senses.keys()) {
    if (excludedNorms.has(enNorm)) {
      throw new Error(`ruling-set: the sense for ${enNorm} names a ${excludedAs(enNorm)} headword`);
    }
    if (!groups.has(enNorm)) throw new Error(`ruling-set: the sense for ${enNorm} matches no row`);
  }

  const seenIds = new Map();
  for (const r of rulings) {
    if (seenIds.has(r.id)) {
      throw new Error(
        `ruling-set: ${JSON.stringify(seenIds.get(r.id))} and ${JSON.stringify(r.enNorm)} mint the same id ${r.id}`
      );
    }
    seenIds.set(r.id, r.enNorm);
  }
  rulings.sort((a, b) => byCodePoint(a.id, b.id));
  excluded.sort((a, b) => byCodePoint(a.enNorm, b.enNorm));

  const notes = [
    {
      kind: 'limitation',
      text:
        "matchable checks the target's characters and the enNorm's placeholders only. It does not " +
        "check element-symbol words (the gate's lexicon owns ELEMENT_SYMBOLS) or whether an English " +
        'form occurs in visible prose; the gate checks both per operation.',
    },
    ...[...exceptions.values()].map((e) => ({
      kind: 'scope-exception',
      enNorm: e.enNorm,
      status: e.status,
      scope: e.scope,
      source: e.source,
      note: e.note,
    })),
    ...[...senses.values()].map((s) => ({
      kind: 'sense',
      enNorm: s.enNorm,
      sense: s.sense.id,
      status: s.sense.status,
      source: s.source,
      glossBy: s.glossBy,
    })),
    ...supersededNotes,
    ...amd.notes,
    ...trailingGloss,
    ...(base.inflectionNotes || []).map((n, i) => {
      if (!isPlainObject(n) || !isNonEmptyString(n.id) || typeof n.en !== 'string') {
        throw new Error(`ruling-set: base.inflectionNotes[${i}] needs id and en`);
      }
      return {
        kind: 'inflection-note',
        id: n.id,
        en: n.en,
        ch: n.ch ?? null,
        note: n.note ?? '',
        why: n.why ?? null,
      };
    }),
  ];
  const noteKey = (n) => n.enNorm ?? n.id ?? '';
  notes.sort(
    (a, b) =>
      NOTE_ORDER.indexOf(a.kind) - NOTE_ORDER.indexOf(b.kind) || byCodePoint(noteKey(a), noteKey(b))
  );

  const count = (pred) => rulings.filter(pred).length;
  // Key order is part of the bytes: `amendments` sits after `exceptions` and is absent, not
  // null, when no amendments file was given, so an unamended set is byte-identical to one
  // compiled before amendments existed.
  return {
    schema: RULING_SET_SCHEMA,
    about: !amended
      ? RULING_SET_ABOUT
      : amended.usesNewShapes
        ? `${RULING_SET_ABOUT} ${AMENDMENTS_ABOUT} ${CHAINED_FORMS_ABOUT}`
        : `${RULING_SET_ABOUT} ${AMENDMENTS_ABOUT}`,
    base: baseRef,
    exceptions: excRef,
    ...(amended
      ? { amendments: amdList.length === 1 ? amdList[0].ref : amdList.map((a) => a.ref) }
      : {}),
    counts: {
      baseRows: { stage1: rows.stage1.length, before: rows.before.length },
      superseded: droppedCount,
      enNorms: groups.size,
      rulings: rulings.length,
      excluded: excluded.length,
      matchable: count((r) => r.matchable),
      unmatchable: count((r) => !r.matchable),
      scopeStatus: {
        default: count((r) => r.scopeStatus === 'default'),
        proposed: count((r) => r.scopeStatus === 'proposed'),
        ruled: count((r) => r.scopeStatus === 'ruled'),
      },
      exceptions: exceptions.size,
      senses: {
        proposed: count((r) => r.sense !== null && r.sense.status === 'proposed'),
        ruled: count((r) => r.sense !== null && r.sense.status === 'ruled'),
      },
      ...(amended ? { amendments: amended.counts } : {}),
    },
    rulings,
    excluded,
    notes,
  };
}

// ─── Serialisation ───────────────────────────────────────────────────────

const textWidth = (s) => [...s].length;

/**
 * JSON with 2-space indentation, objects always expanded, and an array of scalars kept on
 * one line when that line fits PRINT_WIDTH (prettier's JSON layout, so `prettier --check`
 * passes on the artifact). The byte-equality test pins this serialiser, not prettier.
 */
function render(value, level, lead, comma) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const pad = '  '.repeat(level + 1);
  const close = '  '.repeat(level);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object')) {
      const inline = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      if (lead + textWidth(inline) + (comma ? 1 : 0) <= PRINT_WIDTH) return inline;
    }
    const items = value.map((v, i) => pad + render(v, level + 1, pad.length, i < value.length - 1));
    return `[\n${items.join(',\n')}\n${close}]`;
  }
  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  const items = keys.map((k, i) => {
    const head = `${pad}${JSON.stringify(k)}: `;
    return head + render(value[k], level + 1, textWidth(head), i < keys.length - 1);
  });
  return `{\n${items.join(',\n')}\n${close}}`;
}

/** The artifact's exact bytes: see render; one trailing newline. */
export function serializeRulingSet(artifact) {
  return `${render(artifact, 0, 0, false)}\n`;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

const USAGE = [
  'Usage: node tools/ai-review/compile-ruling-set.js --base <path> --exceptions <path>',
  '         [--amendments <path> ...] --out <path>',
  'Relative paths resolve against the repository root. --out must be named',
  'ruling-set-YYYY-MM-DD.json and must not be one of the inputs. --amendments may be',
  'given more than once, oldest first, one file per date.',
].join('\n');

const FLAGS = ['base', 'exceptions', 'amendments', 'out'];
const REQUIRED_FLAGS = ['base', 'exceptions', 'out'];
/** Flags that may be given more than once; their value is the list, in the order given. */
const REPEATABLE_FLAGS = ['amendments'];

/** `dev:ino` of the file a path reaches (symlinks followed), or null when nothing is there. */
function fileIdentity(abs) {
  try {
    const s = fs.statSync(abs, { bigint: true });
    return `${s.dev}:${s.ino}`;
  } catch {
    return null;
  }
}

/**
 * Is `outAbs` one of the inputs? By path, and by device and inode, so that a symlinked
 * directory, a symlink or a hard link cannot pass an input off as a new --out. An --out
 * that does not exist yet cannot be an input (every input must exist to be read).
 * @param {string} outAbs
 * @param {string[]} inputAbs
 */
function sameFileAsAnInput(outAbs, inputAbs) {
  if (inputAbs.includes(outAbs)) return true;
  const out = fileIdentity(outAbs);
  return out !== null && inputAbs.some((p) => fileIdentity(p) === out);
}

/** The real path of an existing file, or the resolved path when it cannot be realpathed. */
function realpathOrSelf(p) {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

/** Strict: an unknown or repeated flag refuses (tools/lib/parseArgs.js drops them silently). */
function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return { help: true };
    const eq = a.indexOf('=');
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const name = flag.startsWith('--') ? flag.slice(2) : null;
    if (!name || !FLAGS.includes(name)) throw new Error(`unknown argument ${a}`);
    if (name in args && !REPEATABLE_FLAGS.includes(name)) throw new Error(`--${name} given twice`);
    const value = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (!isNonEmptyString(value) || value.startsWith('--'))
      throw new Error(`--${name} needs a value`);
    args[name] = REPEATABLE_FLAGS.includes(name) ? [...(args[name] || []), value] : value;
  }
  for (const name of REQUIRED_FLAGS) if (!args[name]) throw new Error(`--${name} is required`);
  return args;
}

function main(argv) {
  process.exitCode = 1; // failure default: only a reached verdict clears it
  try {
    const args = parseCliArgs(argv);
    if (args.help) {
      process.stdout.write(`${USAGE}\n`);
      process.exitCode = 0;
      return;
    }
    const outAbs = resolveRepoPath(args.out);
    if (!OUT_NAME_RE.test(path.basename(outAbs))) {
      throw new Error(`--out ${args.out} is not named ruling-set-YYYY-MM-DD.json`);
    }
    const inputAbs = [args.base, args.exceptions, ...(args.amendments || [])].map(resolveRepoPath);
    if (sameFileAsAnInput(outAbs, inputAbs)) throw new Error('--out must not be one of the inputs');
    // One --amendments stays one input, so a set compiled with one file is what it always was.
    const amdArg = args.amendments?.length === 1 ? args.amendments[0] : args.amendments;
    const { base, exceptions, amendments } = readInputs(args.base, args.exceptions, amdArg);
    const artifact =
      amendments === undefined
        ? compileRulingSet(base, exceptions)
        : compileRulingSet(base, exceptions, amendments);
    const text = serializeRulingSet(artifact);
    validateRulingSet(JSON.parse(text));
    const tmp = `${outAbs}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, outAbs);
    const c = artifact.counts;
    process.stdout.write(
      `wrote ${args.out}: ${c.rulings} rulings (${c.unmatchable} unmatchable), ${c.excluded} excluded, ` +
        `${c.scopeStatus.proposed} proposed and ${c.scopeStatus.ruled} ruled scopes, ` +
        `${c.senses.ruled} ruled and ${c.senses.proposed} proposed senses\n`
    );
    process.exitCode = 0;
  } catch (e) {
    process.stderr.write(`compile-ruling-set: ${e.message}\n${USAGE}\n`);
    process.exitCode = 1;
  }
}

// Node realpaths the entry module but not argv[1], so both sides are realpathed: run through
// a symlink, a bare path comparison is false, main() never runs, and the process exits 0
// having done nothing (its failure default is set inside main()).
if (
  process.argv[1] &&
  realpathOrSelf(process.argv[1]) === realpathOrSelf(fileURLToPath(import.meta.url))
) {
  main(process.argv.slice(2));
}
