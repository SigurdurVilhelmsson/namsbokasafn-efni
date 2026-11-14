/**
 * lib.mjs — the pure parts of the Fable editor trial: requests, answers, marker checks, metrics,
 * the blind sample and its scoring.
 *
 * Plan: docs/plans/2026-11-14-fable-editor-trial-plan.md. Nothing here writes into `books/`; the
 * runner and the comparison only READ the project's layers.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readChapterInputs, unitFingerprints } from '../../tools/ai-review/term-pass-apply.js';
import { buildWorkList } from '../../tools/ai-review/worklist.js';
import { parseLayerFile, LAYER_DIRS } from '../../tools/lib/mt-layers.js';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TRIAL_DIR = 'experiments/fable-editor-trial';
export const BOOK = 'efnafraedi-2e';
export const BOOK_DIR = path.join(REPO_ROOT, 'books', BOOK);

export const MODEL = 'claude-fable-5-2';
export const USE = 'fable-editor';
export const USER_FORMAT = 'fable-editor-user/1';
export const PROMPT_PATH = `${TRIAL_DIR}/prompt-v1.md`;
/** The ruling set the term pass's full run and the ch10 re-buy used (their run.json names it). */
export const RULING_SET_PATH =
  'experiments/terminology-consistency/results/2026-11-02/ruling-set-2026-11-02.json';
/**
 * The term-pass run whose inputs a trial run must match, per chapter. The trial refuses a chapter
 * whose layer-1, overlay or English bytes differ from what that run recorded, so MT, TP and FE are
 * always compared on one input.
 */
export const TP_RUNS = Object.freeze({ ch10: '20261108T193214Z-76357476' });
export const TP_RUNS_DIR = path.join(BOOK_DIR, 'ai-review', 'runs');

export const TRIAL_RECORD = 'fable-editor.json';
export const TRIAL_SCHEMA = 'fable-editor-trial/1';
export const TAGS = Object.freeze([
  'terminology',
  'grammar',
  'fluency',
  'meaning',
  'register',
  'punctuation',
]);
export const DEFAULT_EFFORT = 'high';
export const DEFAULT_MAX_TOKENS = 64000;
/** Icelandic characters of segment text per request; a module above it is split. */
export const DEFAULT_CHAR_BUDGET = 30000;
export const DEFAULT_CAP_USD = 40;
/** A rough planning ratio only; the harness counts real tokens before any spend. */
export const CHARS_PER_TOKEN_ESTIMATE = 3;

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const fileSha256 = (repoRel) => sha256(fs.readFileSync(path.join(REPO_ROOT, repoRel)));

// ── Inputs ───────────────────────────────────────────────────────────────────────────────────

/** The term-pass run record a chapter's trial is pinned to. */
export function loadTpRecord(chapterDir) {
  const runId = TP_RUNS[chapterDir];
  if (!runId) {
    throw new Error(
      `fable-trial: no term-pass run is pinned for ${chapterDir}; known: ${Object.keys(TP_RUNS).join(', ')}`
    );
  }
  const file = path.join(TP_RUNS_DIR, runId, 'term-pass.json');
  return { runId, record: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

/**
 * Differences between the chapter's inputs now and the inputs the pinned term-pass run recorded
 * (empty = the same bytes, unit for unit).
 */
export function inputDriftProblems(fingerprints, tpUnits) {
  const problems = [];
  const now = new Map(fingerprints.map((u) => [u.stem, u]));
  const then = new Map(tpUnits.map((u) => [u.stem, u]));
  for (const stem of new Set([...now.keys(), ...then.keys()])) {
    const a = now.get(stem);
    const b = then.get(stem);
    if (!a) problems.push(`${stem}: in the term-pass run, missing now`);
    else if (!b) problems.push(`${stem}: present now, not in the term-pass run`);
    else
      for (const k of ['layer1Sha256', 'overlaySha256', 'enSha256']) {
        if (a[k] !== b[k]) problems.push(`${stem}: ${k} differs from the term-pass run`);
      }
  }
  return problems;
}

/**
 * Whether `now` is `then` with every later occurrence of a repeated segment id removed, bodies
 * unchanged: what the G1.12 re-extraction of 2026-11-12 did to 83 chemistry modules' English
 * (commit c5444929), after the term pass's full run had read them.
 */
export function isLaterRepeatsRemoved(thenText, nowText) {
  const then = parseLayerFile(thenText).records.filter((r) => r.occurrence === 0);
  const now = parseLayerFile(nowText).records;
  return (
    then.length === now.length &&
    then.every((r, i) => r.key === now[i].key && r.body === now[i].body)
  );
}

const defaultGitShow = (commit, repoRel) =>
  execFileSync('git', ['show', `${commit}:${repoRel}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/**
 * Read a chapter's inputs and refuse any drift from the pinned term-pass run. Layer 1 and the
 * overlay must be the same bytes. The English may differ only by the G1.12 cut (later repeats of
 * an id removed), checked against the English at the run's layer-1 commit; each such unit is
 * returned in `enDrift`. The repeats it removed have no English now, so the trial does not send
 * them, and the comparison leaves them out for all three conditions alike.
 */
export function readPinnedInputs(
  chapterDir,
  { bookDir = BOOK_DIR, gitShow = defaultGitShow } = {}
) {
  const inputs = readChapterInputs({ bookDir, chapterDir });
  const tp = loadTpRecord(chapterDir);
  const fingerprints = unitFingerprints(inputs);
  const enDrift = [];
  const problems = inputDriftProblems(fingerprints, tp.record.units).filter((p) => {
    const m = /^(\S+): enSha256 differs/.exec(p);
    if (!m) return true;
    const stem = m[1];
    const rel = `books/${BOOK}/02-for-mt/${chapterDir}/${stem}-segments.en.md`;
    const thenText = gitShow(tp.record.layer1Commit, rel);
    const nowText = fs.readFileSync(
      path.join(bookDir, '02-for-mt', chapterDir, `${stem}-segments.en.md`),
      'utf8'
    );
    if (!isLaterRepeatsRemoved(thenText, nowText)) return true;
    enDrift.push({
      stem,
      tpEnSha256: tp.record.units.find((u) => u.stem === stem).enSha256,
      nowEnSha256: fingerprints.find((u) => u.stem === stem).enSha256,
      rule: 'later-repeats-removed (G1.12)',
    });
    return false;
  });
  if (problems.length) {
    throw new Error(
      `fable-trial: ${chapterDir}'s inputs differ from term-pass run ${tp.runId}:\n  ` +
        problems.join('\n  ')
    );
  }
  return { inputs, tp, fingerprints, enDrift };
}

/** One unit's segments in pairUnit's order: every IS occurrence that has an English partner. */
export function unitSegments(unit) {
  return unit.pair.items.flatMap((item) =>
    item.occurrences.map((o) => ({ key: o.key, segmentId: item.segmentId, en: o.en, is: o.is }))
  );
}

/** The house terms the term pass offered for a unit, in the trial's shape. */
export function unitTerms({ chapterDir, unit, rulings, rulingsById }) {
  const wl = buildWorkList({
    chapterDir,
    units: [{ stem: unit.stem, en: unit.en, is: unit.base.parsed }],
    rulings,
  });
  const ids = new Set();
  for (const item of wl.units[0].items) for (const id of item.rulingIds) ids.add(id);
  return [...ids].sort().map((id) => {
    const r = rulingsById.get(id);
    const term = { en: [...r.en], is: r.is };
    if (r.competitors?.length) term.avoid = [...r.competitors];
    if (r.sense?.gloss) term.sense = r.sense.gloss;
    return term;
  });
}

/** Split a unit's segments into requests of at most `charBudget` Icelandic characters. */
export function chunkSegments(segments, charBudget) {
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const s of segments) {
    if (cur.length && size + s.is.length > charBudget) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(s);
    size += s.is.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** The JSON schema of an answer (structured output). */
export function outputSchema() {
  return {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            text: { type: 'string' },
            tags: { type: 'array', items: { type: 'string', enum: [...TAGS] } },
          },
          required: ['key', 'text', 'tags'],
          additionalProperties: false,
        },
      },
    },
    required: ['edits'],
    additionalProperties: false,
  };
}

/**
 * The trial's requests for a chapter: one per unit, or several when a unit is above the budget.
 * @returns {Array<{ key: string, stem: string, keys: string[], isChars: number, body: object }>}
 */
export function buildRequests({
  chapterDir,
  inputs,
  rulingSet,
  prompt,
  effort = DEFAULT_EFFORT,
  maxTokens = DEFAULT_MAX_TOKENS,
  charBudget = DEFAULT_CHAR_BUDGET,
  modules = null,
}) {
  const out = [];
  for (const unit of inputs) {
    if (modules && !modules.includes(unit.stem)) continue;
    const segments = unitSegments(unit);
    if (segments.length === 0) continue;
    const terms = unitTerms({
      chapterDir,
      unit,
      rulings: rulingSet.rulings,
      rulingsById: rulingSet.byId,
    });
    const englishContext = unit.en.records.map((r) => r.body).join('\n\n');
    chunkSegments(segments, charBudget).forEach((chunk, i) => {
      const doc = {
        format: USER_FORMAT,
        chapter: chapterDir,
        module: unit.stem,
        englishContext,
        terms,
        segments: chunk.map((s) => ({ key: s.key, en: s.en, is: s.is })),
      };
      out.push({
        key: `${chapterDir}/${unit.stem}/${String(i + 1).padStart(3, '0')}`,
        stem: unit.stem,
        keys: chunk.map((s) => s.key),
        isChars: chunk.reduce((n, s) => n + s.is.length, 0),
        body: {
          model: MODEL,
          max_tokens: maxTokens,
          system: [{ type: 'text', text: prompt }],
          messages: [{ role: 'user', content: JSON.stringify(doc) }],
          output_config: { effort, format: { type: 'json_schema', schema: outputSchema() } },
        },
      });
    });
  }
  if (modules) {
    const known = new Set(inputs.map((u) => u.stem));
    const unknown = modules.filter((m) => !known.has(m));
    if (unknown.length) throw new Error(`fable-trial: no such unit in ${chapterDir}: ${unknown}`);
  }
  return out;
}

/** A planning estimate of a request's input tokens (the harness counts the real number). */
export function estimateInputTokens(body) {
  const chars = JSON.stringify(body.system).length + JSON.stringify(body.messages).length;
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
}

// ── Markers ──────────────────────────────────────────────────────────────────────────────────

/** Marker types whose whole body is fixed (formulas, references, placeholders). */
const FROZEN_BODY = new Set(['MATH', 'MEDIA', 'TABLE', 'xref', 'docref', 'sub', 'sup']);
/** Marker types whose part after the last `|` is fixed (a term id, a URL). */
const FROZEN_TAIL = new Set(['term', 'link', 'fn']);
const INNERMOST = /\[\[([A-Za-z]+)(?::([^[\]]*))?\]\]/;

/**
 * The fixed part of every marker in a text, as a sorted list: type, plus the body for frozen
 * types, plus the tail after `|` for term/link/fn. Editable words inside a marker are left out.
 * Nested markers are read innermost first. Stray `[[` / `]]` are counted as `residue`.
 */
export function markerSignature(text) {
  let s = String(text);
  const sig = [];
  for (;;) {
    const m = INNERMOST.exec(s);
    if (!m) break;
    const [whole, type, body = ''] = m;
    let fixed = type;
    if (FROZEN_BODY.has(type)) fixed += `:${body}`;
    else if (FROZEN_TAIL.has(type))
      fixed += `|${body.includes('|') ? body.slice(body.lastIndexOf('|') + 1) : ''}`;
    sig.push(fixed);
    s = s.slice(0, m.index) + '\u0001' + s.slice(m.index + whole.length);
  }
  const residue = (s.match(/\[\[|\]\]/g) || []).length;
  if (residue) sig.push(`residue×${residue}`);
  return sig.sort();
}

/** Null when an edit keeps every marker's fixed part, else a short description. */
export function markerProblem(before, after) {
  const a = markerSignature(before);
  const b = markerSignature(after);
  if (a.length === b.length && a.every((x, i) => x === b[i])) return null;
  const count = (list) => list.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a);
  const cb = count(b);
  const diff = [];
  for (const k of new Set([...ca.keys(), ...cb.keys()])) {
    const d = (cb.get(k) || 0) - (ca.get(k) || 0);
    if (d) diff.push(`${k} ${d > 0 ? '+' : ''}${d}`);
  }
  return diff.join(', ');
}

// ── Answers ──────────────────────────────────────────────────────────────────────────────────

/** The text of a recorded response's message, or null. */
export function responseText(responseRecord) {
  const content = responseRecord?.response?.content;
  if (!Array.isArray(content)) return null;
  const texts = content.filter((b) => b?.type === 'text').map((b) => b.text);
  return texts.length ? texts.join('') : null;
}

/**
 * Parse and check one answer against its request.
 * @returns {{ usable: boolean, edits: Array<{key,text,tags}>, problems: string[] }}
 */
export function parseAnswer(responseRecord, requestKeys) {
  const problems = [];
  if (!responseRecord) return { usable: false, edits: [], problems: ['no response'] };
  if (responseRecord.outcome !== 'succeeded') {
    return { usable: false, edits: [], problems: [`outcome ${responseRecord.outcome}`] };
  }
  const text = responseText(responseRecord);
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { usable: false, edits: [], problems: ['answer is not JSON'] };
  }
  if (!doc || !Array.isArray(doc.edits)) {
    return { usable: false, edits: [], problems: ['answer has no edits array'] };
  }
  const allowed = new Set(requestKeys);
  const seen = new Set();
  const edits = [];
  for (const e of doc.edits) {
    if (!e || typeof e.key !== 'string' || typeof e.text !== 'string') {
      problems.push('an edit is malformed');
      continue;
    }
    if (!allowed.has(e.key)) {
      problems.push(`${e.key}: not a segment of this request`);
      continue;
    }
    if (seen.has(e.key)) {
      problems.push(`${e.key}: repeated; the first is kept`);
      continue;
    }
    seen.add(e.key);
    if (e.text.trim() === '') {
      problems.push(`${e.key}: empty text`);
      continue;
    }
    const tags = [...new Set(Array.isArray(e.tags) ? e.tags : [])].filter((t) => TAGS.includes(t));
    edits.push({ key: e.key, text: e.text.trim(), tags });
  }
  return { usable: true, edits, problems };
}

// ── Metrics ──────────────────────────────────────────────────────────────────────────────────

/** Character Levenshtein distance (code points). */
export function editDistance(a, b) {
  const x = [...a];
  const y = [...b];
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  let cur = new Array(y.length + 1);
  for (let i = 1; i <= x.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[y.length];
}

/** chrF (character n-grams 1–6, beta 2, spaces removed), 0–100. */
export function chrF(hyp, ref, { n = 6, beta = 2 } = {}) {
  const h = [...hyp.replace(/\s+/g, '')];
  const r = [...ref.replace(/\s+/g, '')];
  let pSum = 0;
  let rSum = 0;
  let orders = 0;
  for (let k = 1; k <= n; k++) {
    const grams = (cs) => {
      const m = new Map();
      for (let i = 0; i + k <= cs.length; i++) {
        const g = cs.slice(i, i + k).join('');
        m.set(g, (m.get(g) || 0) + 1);
      }
      return m;
    };
    const gh = grams(h);
    const gr = grams(r);
    const th = h.length - k + 1;
    const tr = r.length - k + 1;
    if (th <= 0 || tr <= 0) continue;
    let match = 0;
    for (const [g, c] of gh) match += Math.min(c, gr.get(g) || 0);
    pSum += match / th;
    rSum += match / tr;
    orders++;
  }
  if (orders === 0) return hyp === ref ? 100 : 0;
  const p = pSum / orders;
  const rc = rSum / orders;
  if (p + rc === 0) return 0;
  const b2 = beta * beta;
  return (100 * (1 + b2) * p * rc) / (b2 * p + rc);
}

// ── Layers as key → text maps ────────────────────────────────────────────────────────────────

/** A layer file parsed into key → body, or null when the file does not exist. */
export function readLayerMap(file) {
  if (!fs.existsSync(file)) return null;
  const parsed = parseLayerFile(fs.readFileSync(file, 'utf8'));
  return new Map(parsed.records.map((r) => [r.key, r.body]));
}

export const tpFile = (chapterDir, stem, bookDir = BOOK_DIR) =>
  path.join(bookDir, LAYER_DIRS.revised, chapterDir, `${stem}-segments.is.md`);
export const huFile = (chapterDir, stem, bookDir = BOOK_DIR) =>
  path.join(bookDir, '03-faithful-translation', chapterDir, `${stem}-segments.is.md`);

// ── Blind sample ─────────────────────────────────────────────────────────────────────────────

/** A seeded PRNG (mulberry32) from a string seed. */
export function seededRandom(seed) {
  let a = parseInt(sha256(String(seed)).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rnd) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Choose the blind sample: segments where FE differs from MT, half (when there are enough)
 * where TP differs from MT too, spread over segment types by round robin.
 * @param {Array<{ key, segmentId, en, mt, tp, fe }>} rows
 */
export function chooseSample(rows, { size = 60, seed }) {
  const rnd = seededRandom(seed);
  const eligible = rows.filter((r) => r.fe !== r.mt);
  const typeOf = (r) => r.segmentId.split(':')[1] || 'other';
  const pick = (pool, n) => {
    const byType = new Map();
    for (const r of shuffle(pool, rnd)) {
      if (!byType.has(typeOf(r))) byType.set(typeOf(r), []);
      byType.get(typeOf(r)).push(r);
    }
    const queues = [...byType.keys()].sort().map((t) => byType.get(t));
    const out = [];
    while (out.length < n && queues.some((q) => q.length)) {
      for (const q of queues) if (q.length && out.length < n) out.push(q.shift());
    }
    return out;
  };
  const threeWay = eligible.filter((r) => r.tp !== r.mt);
  const twoWay = eligible.filter((r) => r.tp === r.mt);
  const first = pick(threeWay, Math.min(threeWay.length, Math.ceil(size / 2)));
  const second = pick(twoWay, size - first.length);
  return shuffle([...first, ...second], rnd);
}

/**
 * Build the blind items: each sample row's distinct versions in random order under letters.
 * @returns {{ items: Array<{ item, key, en, versions: Array<{letter,text}> }>,
 *   key: Array<{ item, key, letters: Record<string, string[]> }> }}
 */
export function blindItems(sample, { seed }) {
  const rnd = seededRandom(`${seed}/letters`);
  const items = [];
  const key = [];
  sample.forEach((r, i) => {
    const byText = new Map();
    for (const [cond, text] of [
      ['MT', r.mt],
      ['TP', r.tp],
      ['FE', r.fe],
    ]) {
      if (!byText.has(text)) byText.set(text, []);
      byText.get(text).push(cond);
    }
    const versions = shuffle([...byText.entries()], rnd);
    const letters = {};
    const shown = versions.map(([text, conds], j) => {
      const letter = 'ABC'[j];
      letters[letter] = conds;
      return { letter, text };
    });
    items.push({ item: i + 1, key: r.key, en: r.en, versions: shown });
    key.push({ item: i + 1, key: r.key, letters });
  });
  return { items, key };
}

/** Marker text made readable for a person (markdown with HTML sub/sup). */
export function readable(text) {
  let s = String(text);
  for (let guard = 0; guard < 50; guard++) {
    const next = s.replace(/\[\[([A-Za-z]+)(?::([^[\]]*))?\]\]/g, (_, type, body = '') => {
      const word = body.includes('|') ? body.slice(0, body.lastIndexOf('|')) : body;
      switch (type) {
        case 'sub':
          return `<sub>${body}</sub>`;
        case 'sup':
          return `<sup>${body}</sup>`;
        case 'i':
        case 'em':
          return `*${body}*`;
        case 'b':
          return `**${body}**`;
        case 'term':
          return `**${word}**`;
        case 'link':
          return word;
        case 'BR':
          return ' / ';
        case 'MATH':
          return `[formúla ${body}]`;
        case 'MEDIA':
          return '[mynd]';
        case 'TABLE':
          return '[tafla]';
        case 'xref':
        case 'docref':
          return '[tilvísun]';
        default:
          return word;
      }
    });
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * Score filled-in blind answers against the key.
 * CSV columns: item,rank_A,rank_B,rank_C,accept_A,accept_B,accept_C (rank 1 = best; accept y/n).
 */
export function scoreBlind(csvText, key) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split(',').map((h) => h.trim());
  const col = (name) => header.indexOf(name);
  const byItem = new Map(key.map((k) => [k.item, k]));
  const stats = Object.fromEntries(
    ['MT', 'TP', 'FE'].map((c) => [
      c,
      { rated: 0, rankSum: 0, first: 0, accepted: 0, acceptRated: 0 },
    ])
  );
  let answered = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim());
    const item = Number(cells[col('item')]);
    const k = byItem.get(item);
    if (!k) continue;
    let any = false;
    for (const [letter, conds] of Object.entries(k.letters)) {
      const rank = Number(cells[col(`rank_${letter}`)]);
      const acc = (cells[col(`accept_${letter}`)] || '').toLowerCase();
      for (const c of conds) {
        if (Number.isFinite(rank) && rank > 0) {
          stats[c].rated++;
          stats[c].rankSum += rank;
          if (rank === 1) stats[c].first++;
          any = true;
        }
        if (acc === 'y' || acc === 'n' || acc === 'j') {
          stats[c].acceptRated++;
          if (acc === 'y' || acc === 'j') stats[c].accepted++;
        }
      }
    }
    if (any) answered++;
  }
  const summary = {};
  for (const [c, s] of Object.entries(stats)) {
    summary[c] = {
      rated: s.rated,
      meanRank: s.rated ? s.rankSum / s.rated : null,
      rankedFirst: s.first,
      acceptRate: s.acceptRated ? s.accepted / s.acceptRated : null,
    };
  }
  return { answered, items: key.length, summary };
}
