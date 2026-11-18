/**
 * prescreen-population — what the c19 glossary pre-screen asks the model to judge.
 *
 * Spec: docs/superpowers/specs/2026-11-17-c19-glossary-prescreen-design.md (§5 controls, §7 sampling).
 * Turns a census of the glossary rows the segment editor shows (`c19-census/1`) into
 * uniformly shaped items: population rows, kept-aside physics and biology rows, and the named
 * controls, mixed so that nothing marks a control. Pure except `loadUnits`, which reads
 * `02-for-mt/`. Imports nothing from `server/` (the MIT to AGPL boundary).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseLayerFile } from '../lib/mt-layers.js';

export const CENSUS_SCHEMA = 'c19-census/1';

const DECIDED_REASONS = new Set(['book-preference', 'chapter-preference', 'house-style']);
const WITHHOLD_CLASSES = ['ruled', 'fallback', 'tie', 'decided', 'physicsBiology', 'notInExport'];
const MAX_SENTENCE = 400;

const sha = (...parts) => crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
const pairKey = (english, icelandic) => `${english}\0${icelandic ?? ''}`;
const nonEmpty = (v) => typeof v === 'string' && v !== '';
const emptyCounts = () => ({
  ruled: 0,
  fallback: 0,
  tie: 0,
  decided: 0,
  physicsBiology: 0,
  notInExport: 0,
});

/** Set of (english, icelandic) pair keys of an export's `terms`. */
const exportPairSet = (exportTerms) =>
  new Set(
    exportTerms
      .filter((t) => nonEmpty(t.english) && nonEmpty(t.icelandic))
      .map((t) => pairKey(t.english, t.icelandic))
  );

const ruledForms = (rulingSet) => {
  if (!Array.isArray(rulingSet?.rulings)) throw new Error('the ruling set has no rulings array');
  return new Set(
    rulingSet.rulings.flatMap((r) => (r.en ?? []).map((e) => String(e).toLowerCase()))
  );
};

/**
 * Classify a census row; first match wins.
 *
 * @param {object} row a CensusRow
 * @param {{rulingSet: object, exportPairs: Set<string>}} ctx `exportPairs` holds `english NUL icelandic`
 * @returns {'ruled'|'fallback'|'tie'|'decided'|'physicsBiology'|'notInExport'|'keep'}
 */
export function classifyRow(row, { rulingSet, exportPairs }) {
  if (ruledForms(rulingSet).has(String(row.english).toLowerCase())) return 'ruled';
  if (row.isFallback) return 'fallback';
  if (row.isTied || row.icelandic == null || row.icelandic === '') return 'tie';
  if (DECIDED_REASONS.has(row.reason)) return 'decided';
  if (!exportPairs.has(pairKey(row.english, row.icelandic))) return 'notInExport';
  if (row.domain === 'physics' || row.domain === 'biology') return 'physicsBiology';
  return 'keep';
}

/** The census's top-level keys the committed census keeps (`rows` is rebuilt; no `dbPath`). */
const PUBLISHED_TOP_KEYS = Object.freeze(['schema', 'book', 'head', 'readAt']);
/**
 * A published row's keys: from the concept model only `english`, `icelandic`, `domain` and
 * `conceptId`, plus the census's own flags, counts and segment ids (spec §8). Never
 * `alternatives` or `ifRemoved`.
 */
const PUBLISHED_ROW_KEYS = Object.freeze([
  'english',
  'icelandic',
  'domain',
  'conceptId',
  'isFallback',
  'isTied',
  'reason',
  'chapters',
  'matchCount',
  'issueCount',
  'matches',
]);
const PUBLISHED_MATCH_KEYS = Object.freeze(['chapter', 'moduleId', 'segmentId']);

/** Only the named keys of `obj` that it has, in the order named. */
const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => Object.hasOwn(obj, k)).map((k) => [k, obj[k]]));

/**
 * The committed form of a census: rows the export already publishes, each holding only the
 * allowed keys (an allowlist, so a field the census script gains later is never published by
 * default); every other row is dropped and counted by class in `withheld`.
 *
 * @param {object} full a `c19-census/1` document
 * @param {Array<{english: string, icelandic: string}>} exportTerms
 * @param {object} rulingSet
 * @returns {object}
 */
export function reduceCensus(full, exportTerms, rulingSet) {
  if (full?.schema !== CENSUS_SCHEMA) throw new Error(`census schema is not ${CENSUS_SCHEMA}`);
  if (full.reduced === true) throw new Error('the census is already reduced');
  const exportPairs = exportPairSet(exportTerms);
  const withheld = emptyCounts();
  const rows = [];
  for (const row of full.rows) {
    if (nonEmpty(row.icelandic) && exportPairs.has(pairKey(row.english, row.icelandic))) {
      const kept = pick(row, PUBLISHED_ROW_KEYS);
      if (Array.isArray(kept.matches))
        kept.matches = kept.matches.map((m) => pick(m, PUBLISHED_MATCH_KEYS));
      rows.push(kept);
    } else {
      withheld[classifyRow(row, { rulingSet, exportPairs })] += 1;
    }
  }
  return { ...pick(full, PUBLISHED_TOP_KEYS), rows, withheld, reduced: true };
}

/**
 * A census document as committed text: valid JSON with one row per line (the other keys on the
 * first line, `rows` last), so the file stays reviewable at tens of thousands of matches.
 * @param {object} doc
 * @returns {string}
 */
export function formatCensus(doc) {
  const { rows, ...rest } = doc;
  const head = JSON.stringify(rest);
  const open = head === '{}' ? '{"rows":[' : `${head.slice(0, -1)},"rows":[`;
  return `${open}\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
}

/**
 * Every `*-segments.en.md` under `02-for-mt/`, one unit per module. Chapters are numbered as
 * `segmentParser.listChapters` does: `chNN` is N, `appendices` is -1.
 *
 * @param {string} bookDir absolute path of `books/<slug>`
 * @returns {Array<{chapter: number, moduleId: string, segments: Array<{segmentId: string, en: string}>}>}
 */
export function loadUnits(bookDir) {
  const root = path.join(bookDir, '02-for-mt');
  const units = [];
  for (const dir of fs.readdirSync(root)) {
    const chapter = dir === 'appendices' ? -1 : /^ch\d+$/.test(dir) ? Number(dir.slice(2)) : null;
    if (chapter === null) continue;
    for (const file of fs.readdirSync(path.join(root, dir)).sort()) {
      const m = /^(.+)-segments\.en\.md$/.exec(file);
      if (!m) continue;
      const parsed = parseLayerFile(fs.readFileSync(path.join(root, dir, file), 'utf8'));
      units.push({
        chapter,
        moduleId: m[1],
        segments: parsed.records.map((r) => ({ segmentId: r.segmentId, en: r.body })),
      });
    }
  }
  const order = (c) => (c === -1 ? Infinity : c);
  return units.sort(
    (a, b) => order(a.chapter) - order(b.chapter) || (a.moduleId < b.moduleId ? -1 : 1)
  );
}

const WORD_CHAR = '[\\p{L}\\p{N}_]';
const wholeWord = (english) =>
  new RegExp(
    `(?<!${WORD_CHAR})${english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!${WORD_CHAR})`,
    'iu'
  );

/** The HTML escapes the English segments carry, and what a reader sees for each. */
const ESCAPES = Object.freeze({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'" });

/**
 * Segment text as a reader sees it: markers replaced by their content, the HTML escapes decoded
 * (in one pass, so `&amp;lt;` reads `&lt;`), whitespace collapsed.
 */
function plainText(text) {
  let out = text.replace(/\[\[(?:MATH|MEDIA|TABLE):[^\]]*\]\]/g, '…');
  const marker = /\[\[([A-Za-z]+):((?:(?!\[\[|\]\]).)*?)(\|[^\]]*)?\]\]/g;
  // A marker with no visible text (`xref` without a pipe, any `docref`) is an ellipsis.
  const visible = (_m, type, body, pipe) =>
    type === 'docref' || (type === 'xref' && pipe === undefined) ? '…' : body;
  for (let prev = null; prev !== out;) {
    prev = out;
    out = out.replace(marker, visible);
  }
  return out
    .replace(/&(lt|gt|amp|quot|#39);/g, (_m, name) => ESCAPES[name])
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The sentence holding the first whole-word match of `english`, markers resolved, cut to at
 * most 400 characters centred on the match. Empty string when there is no match.
 *
 * @param {string} text
 * @param {string} english
 * @returns {string}
 */
export function extractSentence(text, english) {
  const re = wholeWord(english);
  // A bare uppercase token (`[[BR]]`, `[[SPACE]]`) has no colon, so plainText leaves it; it is a
  // layout marker, read as a space. Done before the split so a sentence break still lands on it.
  const sentence = plainText(text.replace(/\[\[[A-Z]+\]\]/g, ' '))
    .split(/(?<=[.!?])\s+/)
    .find((s) => re.test(s));
  if (sentence === undefined) return '';
  if (sentence.length <= MAX_SENTENCE) return sentence;
  const at = re.exec(sentence).index + Math.floor(english.length / 2);
  const start = Math.max(0, Math.min(sentence.length - MAX_SENTENCE, at - MAX_SENTENCE / 2));
  return sentence.slice(start, start + MAX_SENTENCE);
}

/**
 * Every segment whose reader-visible text holds `english` as a whole word, case-folded.
 *
 * @param {string} english
 * @param {ReturnType<typeof loadUnits>} units
 * @returns {Array<{chapter: number, moduleId: string, segmentId: string, en: string}>}
 */
export function findOccurrences(english, units) {
  const re = wholeWord(english);
  const found = [];
  for (const u of units) {
    for (const s of u.segments) {
      if (re.test(plainText(s.en))) {
        found.push({ chapter: u.chapter, moduleId: u.moduleId, segmentId: s.segmentId, en: s.en });
      }
    }
  }
  return found;
}

/**
 * Up to `n` sentences, spread over chapters: group by chapter in chapter order, order each
 * group by sha256(seed NUL segmentId), take one per chapter round-robin. An occurrence
 * carries its `sentence` (an extracted one); occurrences without one, and repeats, are skipped.
 *
 * @param {Array<{chapter: number, segmentId: string, sentence?: string}>} occurrences
 * @param {{n?: number, seed: string}} opts
 * @returns {string[]}
 */
export function sampleSentences(occurrences, { n = 5, seed }) {
  const byChapter = new Map();
  for (const o of occurrences) {
    if (!o.sentence) continue;
    if (!byChapter.has(o.chapter)) byChapter.set(o.chapter, []);
    byChapter.get(o.chapter).push(o);
  }
  const order = (c) => (c === -1 ? Infinity : c);
  const queues = [...byChapter.entries()]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([, list]) =>
      list.sort((x, y) => (sha(seed, x.segmentId) < sha(seed, y.segmentId) ? -1 : 1))
    );
  const out = [];
  const seen = new Set();
  for (let round = 0; out.length < n && queues.some((q) => q.length > round); round += 1) {
    for (const q of queues) {
      if (out.length >= n) break;
      const o = q[round];
      if (o && !seen.has(o.sentence)) {
        seen.add(o.sentence);
        out.push(o.sentence);
      }
    }
  }
  return out;
}

const sentencesFor = (english, units, seed, n = 5) =>
  sampleSentences(
    findOccurrences(english, units).map((o) => ({
      ...o,
      sentence: extractSentence(o.en, english),
    })),
    { n, seed }
  );

/**
 * `n` rows spread evenly over the rows sorted by `matchCount`, then English.
 *
 * @template {{matchCount: number, english: string}} T
 * @param {T[]} rows
 * @param {number} n
 * @returns {T[]}
 */
export function pickEvenly(rows, n) {
  const sorted = [...rows].sort(
    (a, b) =>
      a.matchCount - b.matchCount || (a.english < b.english ? -1 : a.english > b.english ? 1 : 0)
  );
  if (n >= sorted.length) return sorted;
  return Array.from({ length: n }, (_, k) => sorted[Math.floor((k * sorted.length) / n)]);
}

/**
 * The census as items to judge. `rows` is the chemistry population; `physicsBiology` is kept
 * aside for the pilot and a possible full run. Each `excluded` count adds the census's
 * `withheld` count of the same class, so a reduced census gives the counts of the full one.
 * `noSentence` counts kept chemistry rows with no match that yields a
 * sentence locally, `physicsBiologyNoSentence` the same for physics and biology rows; such a
 * row is left out, so the counts partition the rows.
 *
 * `localMatches` counts, per group (chemistry; physics and biology), the census matches of those
 * rows: in all, those whose segment is not in the local `02-for-mt` (production's English and
 * this checkout's differ), and those whose segment is there but holds no whole-word match
 * locally. Both kinds give no sentence; the counts make such a drift visible before a row loses
 * every sentence.
 *
 * @param {{census: object, rulingSet: object, exportTerms: object[], units: object[], seed: string}} args
 */
export function buildPopulation({ census, rulingSet, exportTerms, units, seed }) {
  const exportPairs = exportPairSet(exportTerms);
  const bySegment = new Map();
  for (const u of units) for (const s of u.segments) bySegment.set(s.segmentId, { u, s });
  const excluded = { ...emptyCounts(), noSentence: 0, physicsBiologyNoSentence: 0 };
  for (const c of WITHHOLD_CLASSES) excluded[c] += census.withheld?.[c] ?? 0;
  const noMatches = () => ({ total: 0, noLocalSegment: 0, noLocalSentence: 0 });
  const localMatches = { chemistry: noMatches(), physicsBiology: noMatches() };
  const rows = [];
  const physicsBiology = [];
  for (const row of census.rows) {
    const cls = classifyRow(row, { rulingSet, exportPairs });
    if (cls !== 'keep' && cls !== 'physicsBiology') {
      excluded[cls] += 1;
      continue;
    }
    const tally = localMatches[cls === 'keep' ? 'chemistry' : 'physicsBiology'];
    const occurrences = [];
    for (const m of row.matches) {
      tally.total += 1;
      const hit = bySegment.get(m.segmentId);
      if (!hit) {
        tally.noLocalSegment += 1;
        continue;
      }
      const sentence = extractSentence(hit.s.en, row.english);
      if (!sentence) tally.noLocalSentence += 1;
      occurrences.push({
        chapter: hit.u.chapter,
        moduleId: hit.u.moduleId,
        segmentId: m.segmentId,
        sentence,
      });
    }
    const sentences = sampleSentences(occurrences, { n: 5, seed });
    if (sentences.length === 0) {
      excluded[cls === 'keep' ? 'noSentence' : 'physicsBiologyNoSentence'] += 1;
      continue;
    }
    if (cls === 'physicsBiology') excluded.physicsBiology += 1;
    (cls === 'keep' ? rows : physicsBiology).push({
      english: row.english,
      icelandic: row.icelandic,
      matchCount: row.matchCount,
      sentences,
    });
  }
  return { rows, physicsBiology, excluded, localMatches };
}

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

/** The named controls (spec §5). Every value is the spec's. */
export const CONTROLS = deepFreeze({
  positives: [
    ['balanced', 'í jafnvægi'],
    ['reduce', 'einfalda'],
    ['depression', 'þunglyndi'],
    ['vessel', 'æð'],
    ['phases', 'kvartilaskipti'],
    ['terms', 'tíðir'],
    ['rays', 'skötur'],
    ['moles', 'moldvörpur'],
  ].map(([english, icelandic]) => ({ name: english, english, icelandic, expected: 'flag' })),
  homograph: [
    {
      name: 'addition-adding',
      expected: 'flag',
      flagKinds: ['wrong-sense', 'some-senses-only'],
      segmentIds: [
        'm68667:para:fs-idm107801696',
        'm68703:para:fs-idm134700400',
        'm68735:para:fs-idm145149808',
        'm68808:para:fs-idm115041904',
        'm68811:para:fs-idp15157136',
      ],
    },
    {
      name: 'addition-reaction',
      expected: 'fine',
      segmentIds: [
        'm68846:para:fs-idp51580832',
        'm68846:para:fs-idp33513136',
        'm68846:para:fs-idp10607328',
        'm68847:para:fs-idm8648512',
        'm68846:glossary-term:fs-id1170893631592-term',
      ],
    },
  ],
  negatives: [
    ['atom', 'atóm'],
    ['anode', 'anóða'],
    ['calorimeter', 'varmamælir'],
    ['bond length', 'tengilengd'],
    ['carbonate', 'karbónat'],
    ['crystalline', 'kristalkenndur'],
  ].map(([english, icelandic]) => ({ name: english, english, icelandic, expected: 'fine' })),
});

const HOMOGRAPH_ROW = { english: 'addition', icelandic: 'álagning' };

/**
 * The controls as items. Positives and negatives are sampled like population rows; each
 * homograph half takes its sentences from its named segments. Throws when a homograph
 * segment is missing from `units`, or a control yields no sentence.
 *
 * @param {{units: object[], seed: string}} args
 * @returns {Array<{english: string, icelandic: string, sentences: string[], name: string, expected: string}>}
 */
export function buildControls({ units, seed }) {
  const bySegment = new Map();
  for (const u of units) for (const s of u.segments) bySegment.set(s.segmentId, s);
  const withSentences = (c, sentences) => {
    if (sentences.length === 0)
      throw new Error(`control ${c.name}: no sentence found in the units`);
    return {
      english: c.english,
      icelandic: c.icelandic,
      sentences,
      name: c.name,
      expected: c.expected,
      ...(c.flagKinds ? { flagKinds: [...c.flagKinds] } : {}),
    };
  };
  const sampled = [...CONTROLS.positives, ...CONTROLS.negatives].map((c) =>
    withSentences(c, sentencesFor(c.english, units, seed))
  );
  const halves = CONTROLS.homograph.map((h) =>
    withSentences(
      { ...HOMOGRAPH_ROW, name: h.name, expected: h.expected, flagKinds: h.flagKinds },
      h.segmentIds.map((id) => {
        const seg = bySegment.get(id);
        if (!seg) throw new Error(`control ${h.name}: segment ${id} is missing from the units`);
        const sentence = extractSentence(seg.en, HOMOGRAPH_ROW.english);
        if (!sentence) throw new Error(`control ${h.name}: segment ${id} does not hold "addition"`);
        return sentence;
      })
    )
  );
  return [...sampled, ...halves];
}

/**
 * Mix population and control rows into items of one shape. Ids `r001`… follow a sha256 order,
 * so nothing marks a control. Two items with the same (English, Icelandic) pair (the homograph
 * halves) end at least `minGap` positions apart, or this throws.
 *
 * @param {{population: {rows: object[], physicsBiology?: object[]}, controls: object[], seed: string, minGap?: number}} args
 * @returns {{items: Array<{id: string, english: string, icelandic: string, sentences: string[]}>,
 *   key: Record<string, {kind: 'population'|'physicsBiology'|'control', name?: string, expected?: string}>}}
 */
export function assembleItems({ population, controls, seed, minGap = 8 }) {
  const all = [
    ...population.rows.map((r) => ({ r, meta: { kind: 'population' } })),
    ...(population.physicsBiology ?? []).map((r) => ({ r, meta: { kind: 'physicsBiology' } })),
    ...controls.map((r) => ({
      r,
      meta: {
        kind: 'control',
        name: r.name,
        expected: r.expected,
        ...(r.flagKinds ? { flagKinds: r.flagKinds } : {}),
      },
    })),
  ].map((e) => ({ ...e, sort: sha(seed, e.r.english, e.r.icelandic, e.r.name ?? '') }));
  const list = all.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
  const pk = (e) => pairKey(e.r.english, e.r.icelandic);
  const moved = new Set(); // each item moves at most once; the check below catches a failure
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (moved.has(item)) continue;
    if (!list.some((e, j) => j < i && pk(e) === pk(item) && i - j < minGap)) continue;
    moved.add(item);
    list.splice(i, 1);
    list.splice((i + Math.floor((list.length + 1) / 2)) % (list.length + 1), 0, item);
    i -= 1; // the next item now sits at position i
  }
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length && j - i < minGap; j += 1) {
      if (pk(list[i]) === pk(list[j])) {
        throw new Error(`items sharing a pair are ${j - i} apart, under minGap ${minGap}`);
      }
    }
  }
  const items = [];
  const key = {};
  list.forEach((e, i) => {
    const id = `r${String(i + 1).padStart(3, '0')}`;
    items.push({
      id,
      english: e.r.english,
      icelandic: e.r.icelandic,
      sentences: e.r.sentences,
    });
    key[id] = e.meta;
  });
  return { items, key };
}
