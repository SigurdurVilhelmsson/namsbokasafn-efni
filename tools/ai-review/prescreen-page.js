/**
 * prescreen-page.js — the data behind the PRIVATE review page for the c19 glossary pre-screen
 * (spec §8). It joins the committed verdicts' flagged and unjudged rows to the private full
 * census (which holds what the repository must not: the concept's other terms and what the editor
 * would show if the row were removed), carries the control gate with each miss, and counts, in
 * the pure MT layer, how often the current and each proposed Icelandic word of a flagged row
 * actually appears. The output is written OUTSIDE the repository. A later step renders the HTML.
 * No import from server/ (the MIT to AGPL boundary).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './config.js';
import { landingPath, isInside, refusal } from './term-pass.js';
import { icelandicStem, stemPattern } from '../compute-glossary-subset.js';
import { parseLayerFile } from '../lib/mt-layers.js';
import { VERDICTS_SCHEMA } from './prescreen-collect.js';
import { CENSUS_SCHEMA } from './prescreen-population.js';

const BOOK = 'efnafraedi-2e';
const VERDICTS_DIR = 'experiments/terminology-consistency/results';

export const INSTRUMENT_NOTE =
  'An MT count is the number of the row’s matching segments WITH MT TEXT (a segment with no MT ' +
  'text is not in the denominator; each row says how many it had) whose pure MT text contains the ' +
  'word’s stem (the first word, with its ending cut off). It is a stem match: it misses ' +
  'compounds and other forms that do not contain the stem, and it can over-count a word that ' +
  'merely shares the stem.';

/**
 * The chapter directory of a census chapter number, numbered as segmentParser.listChapters
 * numbers them: 1 -> ch01, 0 -> ch00, -1 -> appendices.
 */
export const chapterDirOf = (chapter) =>
  chapter === -1 ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;

/** How many of the texts contain the stem of `word`; 0 when the word has no stem. */
function countStem(word, texts) {
  const pat = stemPattern(icelandicStem(word));
  if (!pat) return 0;
  const re = new RegExp(pat.source, '');
  return texts.filter((t) => re.test(t)).length;
}

/**
 * Refuse inputs the page cannot be built from honestly: verdicts or a census of another schema,
 * or a REDUCED census (its rows carry no `alternatives` or `ifRemoved`, so the page would
 * silently lose what the person ruling needs to see).
 */
function checkInputs(verdicts, privateCensus) {
  if (verdicts?.schema !== VERDICTS_SCHEMA)
    throw new Error(
      `the verdicts' schema is ${JSON.stringify(verdicts?.schema)}, not ${VERDICTS_SCHEMA}`
    );
  if (!Array.isArray(verdicts.population) || !Array.isArray(verdicts.controls?.results))
    throw new Error('the verdicts hold no population or no control results');
  if (privateCensus?.schema !== CENSUS_SCHEMA)
    throw new Error(
      `the census's schema is ${JSON.stringify(privateCensus?.schema)}, not ${CENSUS_SCHEMA}`
    );
  if (privateCensus.reduced === true)
    throw new Error(
      'the census is the reduced (committed) one: it has no alternatives or ifRemoved; pass the ' +
        'private full census'
    );
  if (!Array.isArray(privateCensus.rows)) throw new Error('the census has no rows array');
}

/**
 * The page's data (spec §8): the flagged rows with their evidence, the unjudged rows as open
 * (never fine), and the control gate with each miss, a control that got no answer marked
 * `not judged` apart from one answered wrongly.
 * @param {{ verdicts: object, privateCensus: {schema: string, rows: object[]},
 *   mtTextFor: (chapter: number, moduleId: string, segmentId: string) => string|null }} args
 */
export function buildPageData({ verdicts, privateCensus, mtTextFor }) {
  checkInputs(verdicts, privateCensus);
  const byPair = new Map(privateCensus.rows.map((r) => [`${r.english}\0${r.icelandic}`, r]));
  const censusRow = (v, what) => {
    const c = byPair.get(`${v.english}\0${v.icelandic}`);
    if (!c)
      throw new Error(`${what} row ${v.id} (${v.english} / ${v.icelandic}) is not in the census`);
    return c;
  };
  const unjudged = verdicts.population
    .filter((r) => r.verdict === 'unjudged')
    .map((v) => {
      const c = censusRow(v, 'unjudged');
      return {
        id: v.id,
        english: v.english,
        icelandic: v.icelandic,
        domain: c.domain,
        sentences: v.sentences,
        alternatives: c.alternatives,
        ifRemoved: c.ifRemoved,
        matchCount: c.matchCount,
      };
    });
  const { results } = verdicts.controls;
  const controls = {
    pass: verdicts.controls.pass === true,
    total: results.length,
    misses: results
      .filter((c) => !c.ok)
      .map((c) => ({
        id: c.id,
        name: c.name,
        expected: c.expected,
        got: c.got,
        outcome: c.got === 'unjudged' ? 'not judged' : 'missed',
      })),
  };
  const rows = verdicts.population
    .filter((r) => r.verdict === 'flag')
    .map((v) => {
      const c = censusRow(v, 'flagged');
      const texts = c.matches
        .map((m) => mtTextFor(m.chapter, m.moduleId, m.segmentId))
        .filter((t) => typeof t === 'string');
      const words = [...new Set(v.proposed ?? [])]; // duplicates collapse to one key
      const proposed = {};
      for (const w of words) proposed[w] = countStem(w, texts);
      const multiword = words.filter((w) => /\s/.test(w.trim()));
      return {
        id: v.id,
        english: v.english,
        icelandic: v.icelandic,
        domain: c.domain,
        kind: v.kind,
        reason: v.reason,
        proposed: words,
        rightSenses: v.rightSenses,
        sentences: v.sentences,
        alternatives: c.alternatives,
        ifRemoved: c.ifRemoved,
        matchCount: c.matchCount,
        mt: {
          segmentsWithMt: texts.length,
          current: countStem(v.icelandic, texts),
          proposed,
          ...(multiword.length
            ? {
                note: `counted by its first word only: ${multiword.join('; ')}`,
                firstWordOnly: multiword,
              }
            : {}),
        },
      };
    });
  return {
    generated: new Date().toISOString(),
    instrumentNote: INSTRUMENT_NOTE,
    controls,
    rows,
    unjudged,
  };
}

/** The real reader: one segment's body from the pure MT layer, or null when absent. */
export function makeMtTextFor(repoRoot) {
  const cache = new Map();
  return (chapter, moduleId, segmentId) => {
    const file = path.join(
      repoRoot,
      'books',
      BOOK,
      '02-mt-output',
      chapterDirOf(chapter),
      `${moduleId}-segments.is.md`
    );
    if (!cache.has(file)) {
      let parsed = null;
      if (fs.existsSync(file)) parsed = parseLayerFile(fs.readFileSync(file, 'utf8'));
      cache.set(file, parsed);
    }
    // A segmentId repeated within one file resolves to the first record.
    const rec = cache.get(file)?.records?.find((r) => r.segmentId === segmentId);
    return rec ? rec.body : null;
  };
}

/** @returns {number} the exit code */
export function main(argv, deps = {}) {
  const repoRoot = deps.repoRoot ?? REPO_ROOT;
  try {
    const { values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        verdicts: { type: 'string' },
        'census-private': { type: 'string' },
        out: { type: 'string' },
      },
    });
    for (const f of ['verdicts', 'census-private', 'out']) {
      if (!values[f]) throw refusal('bad-flag', `--${f} is required`);
    }
    const verdictsAbs = path.resolve(repoRoot, values.verdicts);
    const allowed = path.join(repoRoot, VERDICTS_DIR);
    if (!isInside(landingPath(verdictsAbs, 'verdicts'), landingPath(allowed, 'verdicts'))) {
      throw refusal('bad-flag', `--verdicts must be inside ${VERDICTS_DIR}/`);
    }
    for (const f of ['census-private', 'out']) {
      if (!path.isAbsolute(values[f])) throw refusal('bad-flag', `--${f} must be an absolute path`);
      if (isInside(landingPath(values[f], f), landingPath(repoRoot, f))) {
        throw refusal('bad-flag', `--${f} must be outside the repository`);
      }
    }
    if (path.resolve(values.out) === path.resolve(values['census-private'])) {
      throw refusal('bad-flag', '--out must not be the --census-private file');
    }
    if (fs.existsSync(values.out)) throw refusal('bad-flag', '--out already exists; refusing');
    const verdicts = JSON.parse(fs.readFileSync(verdictsAbs, 'utf8'));
    const privateCensus = JSON.parse(fs.readFileSync(values['census-private'], 'utf8'));
    const mtTextFor = deps.mtTextFor ?? makeMtTextFor(repoRoot);
    const data = buildPageData({ verdicts, privateCensus, mtTextFor });
    fs.mkdirSync(path.dirname(values.out), { recursive: true });
    fs.writeFileSync(values.out, `${JSON.stringify(data, null, 2)}\n`);
    console.log(
      `wrote ${data.rows.length} flagged rows and ${data.unjudged.length} unjudged rows (open) ` +
        `to ${values.out}; controls ${data.controls.pass ? 'PASS' : 'FAIL'}` +
        `${data.controls.misses.length ? ` (${data.controls.misses.length} not as expected)` : ''}`
    );
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

/** Started as a script? Both sides resolved (a symlinked tree must still run); never throws. */
const isEntry = (() => {
  try {
    return (
      process.argv[1] !== undefined &&
      fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();

if (isEntry) {
  process.exitCode = 1; // failure default: only a finished main sets another code
  process.exitCode = main(process.argv.slice(2));
}
