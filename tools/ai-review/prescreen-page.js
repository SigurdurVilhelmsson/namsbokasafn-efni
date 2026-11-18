/**
 * prescreen-page.js — the data behind the PRIVATE review page for the c19 glossary pre-screen
 * (spec §8). It joins the committed verdicts' flagged rows to the private census (which holds
 * what the repository must not: the concept's other terms and what the editor would show if the
 * row were removed) and counts, in the pure MT layer, how often the current and each proposed
 * Icelandic word actually appears. The output is written OUTSIDE the repository. A later step
 * renders the HTML. No import from server/ (the MIT to AGPL boundary).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './config.js';
import { landingPath, isInside, refusal } from './term-pass.js';
import { icelandicStem, stemPattern } from '../compute-glossary-subset.js';
import { parseLayerFile } from '../lib/mt-layers.js';

const BOOK = 'efnafraedi-2e';
const VERDICTS_DIR = 'experiments/terminology-consistency/results';

export const INSTRUMENT_NOTE =
  'An MT count is the number of the row’s matching segments whose pure MT text contains the ' +
  'word’s stem (the first word, with its ending cut off). It is a stem match: it misses ' +
  'compounds and other forms that do not contain the stem, and it can over-count a word that ' +
  'merely shares the stem.';

/** Ruling P1: 1 -> ch01, 0 -> ch00, -1 -> appendices. */
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
 * @param {{ verdicts: object, privateCensus: {rows: object[]},
 *   mtTextFor: (chapter: number, moduleId: string, segmentId: string) => string|null }} args
 */
export function buildPageData({ verdicts, privateCensus, mtTextFor }) {
  const byPair = new Map(privateCensus.rows.map((r) => [`${r.english}\0${r.icelandic}`, r]));
  const rows = verdicts.population
    .filter((r) => r.verdict === 'flag')
    .map((v) => {
      const c = byPair.get(`${v.english}\0${v.icelandic}`);
      if (!c) {
        throw new Error(`flagged row ${v.id} (${v.english} / ${v.icelandic}) is not in the census`);
      }
      const texts = c.matches
        .map((m) => mtTextFor(m.chapter, m.moduleId, m.segmentId))
        .filter((t) => typeof t === 'string');
      const proposed = {};
      for (const w of v.proposed ?? []) proposed[w] = countStem(w, texts);
      return {
        id: v.id,
        english: v.english,
        icelandic: v.icelandic,
        kind: v.kind,
        reason: v.reason,
        proposed: v.proposed ?? [],
        rightSenses: v.rightSenses,
        sentences: v.sentences,
        alternatives: c.alternatives,
        ifRemoved: c.ifRemoved,
        matchCount: c.matchCount,
        mt: { current: countStem(v.icelandic, texts), proposed },
      };
    });
  return { generated: new Date().toISOString(), instrumentNote: INSTRUMENT_NOTE, rows };
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
    const verdicts = JSON.parse(fs.readFileSync(verdictsAbs, 'utf8'));
    const privateCensus = JSON.parse(fs.readFileSync(values['census-private'], 'utf8'));
    const mtTextFor = deps.mtTextFor ?? makeMtTextFor(repoRoot);
    const data = buildPageData({ verdicts, privateCensus, mtTextFor });
    fs.mkdirSync(path.dirname(values.out), { recursive: true });
    fs.writeFileSync(values.out, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`wrote ${data.rows.length} flagged rows to ${values.out}`);
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
