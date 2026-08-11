// server/scripts/bench-c24.js
'use strict';
/**
 * §C36 B4b-1 Task 8 — what the concept-model matcher costs, in four arms.
 *
 *   node --expose-gc server/scripts/bench-c24.js [--corpus <dir>] [--db <scratch.db>]
 *                                                [--book <slug>] [--modules <ch:id,…>]
 *
 * ⚠️ THE CLI CHANGED. This script used to take `<book> <chapter> <moduleId>`
 * positionally and measure ONE call against whatever database
 * `resolveDbPath()` returned — on a dev box, the 6-headword `sessions.db`. That
 * shape cannot answer Task 8's questions: it has no corpus, no isolated trie
 * arm, and no way to vary segment count. Flags now, and it builds its OWN
 * scratch corpus by default.
 *
 * ⚠️ `--expose-gc` IS MANDATORY, and the reason is a recorded defect rather than
 * a preference. A bare RSS delta between two arms in one process understates the
 * second arm — RSS does not shrink when the first arm's garbage is collected —
 * and `bench-prepare-arms.js` prints a ratio computed from exactly that. Every
 * memory figure here is `heapUsed` after a forced `gc()`; the RSS delta is
 * printed BESIDE it for the same arm, so the two instruments disagreeing is
 * shown rather than asserted.
 *
 * ⚠️ NO CEILING EXISTS, AND NONE MAY BE DERIVED FROM C24's. The register's
 * 264–269 MB was measured on a synthetic 20k-headword corpus, its own code
 * comment says the figure is not the trie's, and the split was never measured —
 * so "the trie is most of it" and "the trie is negligible" are equally
 * unfounded. Arm 1 exists to replace both guesses with a number.
 *
 * ⚠️ SCALE IS PART OF EVERY NUMBER. The automaton is GLOBAL — one entry per
 * distinct English string in the whole corpus, book-independent — while the
 * resolve cost is scoped to ONE book's domain chain. Arm 1's input is therefore
 * the corpus total and arm 2's is the book's in-scope total; they are different
 * numbers on purpose and each line says which it used.
 *
 * 🔴 NEVER POINTS AT `pipeline-output/sessions.db` OR PRODUCTION. It builds a
 * throwaway corpus from the raw Íðorðabankinn fetch (read-only) and refuses a
 * `--db` that resolves to the canonical database. The register's older warning —
 * "do not run bench-c24.js on prod during editing hours" — is now structural.
 *
 * Exit codes: 0 measured · 1 a control failed (the numbers are void) · 2 usage.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { buildCorpusDb, seedBooks } = require('./lib/scratchCorpus');
const { loadEnglishEntries } = require('../lib/conceptMatcher');
const { buildTermAutomaton, findFirstOccurrences } = require('../lib/termAutomaton');
// ⚠️ REQUIRED HERE, BEFORE terminologyService (which is required LAZILY, below).
// terminologyService destructures `{ buildScope, resolve }` at ITS require time,
// so the counting wrapper installed on this export object is only picked up if
// it is installed FIRST. `assertServicesNotLoaded()` is the control that says so
// out loud instead of leaving a silent 0 to read as a perfect memo.
const conceptResolver = require('../lib/conceptResolver');
const segmentParser = require('../services/segmentParser');
const resolveDbPath = require('../lib/dbPath');

const DEFAULT_CORPUS = path.join(os.homedir(), 'idordabanki-raw-2026-08-07');

/**
 * Recorded figures from §C36 B2 — numbers to REPRODUCE, not constants to update.
 * The same admissibility control verify-b4b1-gates.js gate 1 applies: a
 * reconstruction that does not reproduce them makes every number below
 * ambiguous between "the code moved" and "the corpus moved".
 */
const RECORDED = { concepts: 70187, terms: 192189 };

const DEFAULT_BOOK = 'liffraedi-2e';

/**
 * Real modules on disk, largest first. The segment-axis curve concatenates
 * PREFIXES of this list, so every point is real extracted text and no segment is
 * ever duplicated to reach a size. `liffraedi-2e` ch03+ch05 are the only
 * biology modules extracted locally; 878 segments is the whole of them.
 */
const DEFAULT_MODULES = [
  '3:m66442',
  '3:m66443',
  '3:m66440',
  '3:m66441',
  '5:m66374',
  '5:m66373',
  '5:m66376',
  '5:m66375',
  '3:m66438',
  '3:m66437',
  '5:m66372',
];
const DEFAULT_CURVE = [1, 2, 4, 8, 11];

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const ms = (n) => `${n.toFixed(1)} ms`;

/** heapUsed after a forced collection. Two passes: one often does not finish. */
function heap() {
  global.gc();
  global.gc();
  return process.memoryUsage().heapUsed;
}

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    `Usage: node --expose-gc server/scripts/bench-c24.js [options]

  --corpus <dir>     raw-<COLLECTION>.json files from the Íðorðabankinn fetch
                     (default: ${DEFAULT_CORPUS}). READ ONLY.
  --db <path>        reuse a prebuilt SCRATCH database instead of building one.
                     Refused if it resolves to the canonical sessions.db. Must
                     ALREADY be seeded (a gate script's seedBooks) — this path
                     skips seeding, and arm 2 then fails its unscoped control.
  --book <slug>      the book whose domain chain scopes resolve() (default:
                     ${DEFAULT_BOOK} — biology, the widest chain).
  --modules <list>   comma-separated ch:moduleId, largest first
                     (default: the 11 extracted liffraedi-2e modules).
  --curve <list>     comma-separated module counts for the segment axis
                     (default: ${DEFAULT_CURVE.join(',')}).
  -h, --help         this message`
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = {
    corpus: DEFAULT_CORPUS,
    db: null,
    book: DEFAULT_BOOK,
    modules: DEFAULT_MODULES,
    curve: DEFAULT_CURVE,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') usage();
    else if (['--corpus', '--db', '--book', '--modules', '--curve'].includes(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) usage(`${a} expects a value`);
      if (a === '--corpus') out.corpus = v;
      else if (a === '--db') out.db = v;
      else if (a === '--book') out.book = v;
      else if (a === '--modules') out.modules = v.split(',').filter(Boolean);
      else out.curve = v.split(',').map(Number).filter(Boolean);
    } else usage(`unrecognised argument '${a}'`);
  }
  return out;
}

/**
 * The env-ordering control, stated rather than assumed.
 *
 * Every service resolves `DB_PATH = resolveDbPath()` at REQUIRE time, so
 * SESSIONS_DB_PATH must be set before the first `require` of one — otherwise the
 * service quietly opens a SECOND connection to the dev database while
 * `_setTestDb` makes only the terminology reads follow the scratch one. That
 * failure is silent and it biases every number here.
 */
function assertServicesNotLoaded() {
  const loaded = Object.keys(require.cache).filter(
    (k) => k.includes(`${path.sep}services${path.sep}`) && !k.endsWith('segmentParser.js')
  );
  if (loaded.length) {
    throw new Error(
      'a service module was require()d before SESSIONS_DB_PATH was set, so it is pointed at ' +
        `the wrong database:\n  ${loaded.join('\n  ')}`
    );
  }
}

/** Segments in `buildEffectiveSegments`'s shape, minus the edit overlay. */
function loadSegments(book, spec) {
  const [chapter, moduleId] = spec.split(':');
  const data = segmentParser.loadModuleForEditing(book, Number(chapter), moduleId);
  return data.segments.map((s) => ({
    segmentId: s.segmentId,
    enContent: s.en,
    isContent: s.is,
  }));
}

/** The RegExp-construction counter from findTermsGolden.test.js, same instrument. */
function countingRegExp(fn) {
  const Native = global.RegExp;
  let compiles = 0;
  global.RegExp = new Proxy(Native, {
    construct(target, args) {
      compiles++;
      return new target(...args);
    },
  });
  try {
    return { value: fn(), compiles };
  } finally {
    global.RegExp = Native;
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (typeof global.gc !== 'function') {
    console.error(
      'Error: run with --expose-gc. Every memory figure here is heapUsed after a forced\n' +
        'collection; a bare RSS delta understates the second of two arms in one process\n' +
        '(the defect bench-prepare-arms.js prints a ratio from).'
    );
    return 2;
  }

  // ── SETUP: a scratch corpus, asserted against §C36 B2's recorded totals ────
  let db;
  let dbPath;
  if (args.db) {
    const canonical = path.resolve(
      path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db')
    );
    if (
      path.resolve(args.db) === canonical ||
      path.resolve(args.db) === path.resolve(resolveDbPath())
    ) {
      console.error(`Error: ${args.db} is the canonical database. This bench never opens it.`);
      return 2;
    }
    if (!fs.existsSync(args.db)) {
      console.error(`Error: no such database ${args.db}`);
      return 2;
    }
    db = new Database(args.db);
    dbPath = args.db;
    console.log(`scratch database (reused): ${dbPath}`);
  } else {
    console.log(`Building a scratch corpus from ${args.corpus} …`);
    const built = buildCorpusDb(args.corpus);
    db = built.db;
    dbPath = built.path;
    seedBooks(db);
  }

  const corpus = {
    concepts: db.prepare('SELECT COUNT(*) AS n FROM concept').get().n,
    terms: db.prepare('SELECT COUNT(*) AS n FROM concept_term').get().n,
  };
  if (corpus.concepts !== RECORDED.concepts || corpus.terms !== RECORDED.terms) {
    console.error(
      `CONTROL FAILED: the corpus is ${corpus.concepts} concepts / ${corpus.terms} terms, ` +
        `not the recorded ${RECORDED.concepts} / ${RECORDED.terms}. Every number below would be ` +
        'ambiguous between a code change and a corpus change — refusing to measure.'
    );
    return 1;
  }
  console.log(
    `\ncontrol: corpus reproduces §C36 B2 exactly — ${corpus.concepts} concepts, ` +
      `${corpus.terms} concept_term rows`
  );

  assertServicesNotLoaded();

  // ⚠️ THE WRAPPER GOES ON BEFORE THE REQUIRE, and the order is the whole
  // instrument. terminologyService destructures `{ buildScope, resolve }` at
  // require time; a wrapper installed afterwards binds to nothing, the counter
  // reads 0, and 0 is EXACTLY what a perfectly-memoised call looks like. Arm 3's
  // `resolveCalls === 0` control is what refuses to let that read as a result.
  let counting = false;
  let resolveCalls = 0;
  let resolveArgs = new Set();
  const nativeResolve = conceptResolver.resolve;
  conceptResolver.resolve = function countedResolve(sc, english) {
    if (counting) {
      resolveCalls++;
      resolveArgs.add(english);
    }
    return nativeResolve(sc, english);
  };

  process.env.SESSIONS_DB_PATH = dbPath;
  const terminologyService = require('../services/terminologyService');
  // The SAME connection the totals above were asserted on — not a second one
  // that merely points at the same file.
  terminologyService._setTestDb(db);

  // ── ARM 1: the trie ALONE, corpus scale, book-independent ─────────────────
  console.log('\n── ARM 1 · the automaton alone (corpus scale, book-INDEPENDENT) ──');
  const hLoad0 = heap();
  const rLoad0 = process.memoryUsage().rss;
  const tLoad = process.hrtime.bigint();
  const { entries, englishById } = loadEnglishEntries(db);
  const loadMs = Number(process.hrtime.bigint() - tLoad) / 1e6;
  const hLoad1 = heap();
  const rLoad1 = process.memoryUsage().rss;

  const tBuild = process.hrtime.bigint();
  let automaton = buildTermAutomaton(entries);
  const buildMs = Number(process.hrtime.bigint() - tBuild) / 1e6;
  const hBuild1 = heap();
  const rBuild1 = process.memoryUsage().rss;

  console.log(
    `  loadEnglishEntries: ${entries.length} distinct EN strings (WHOLE corpus, every domain)\n` +
      `    ${ms(loadMs)} · heapUsed +${mb(hLoad1 - hLoad0)} · rss +${mb(rLoad1 - rLoad0)}`
  );
  console.log(
    `  buildTermAutomaton(${entries.length} entries):\n` +
      `    ${ms(buildMs)} · heapUsed +${mb(hBuild1 - hLoad1)}  ← THE TRIE'S OWN NUMBER\n` +
      `    rss +${mb(rBuild1 - rLoad1)}  ← the same arm, the OTHER instrument`
  );
  console.log(
    `  resident after both: heapUsed ${mb(hBuild1)} · rss ${mb(process.memoryUsage().rss)}`
  );

  // ── ARM 1b: is that ONE number, or a curve? ───────────────────────────────
  // A single heap delta can be an artefact. Building the same automaton over
  // evenly-strided samples of the SAME entry list says whether the cost is
  // linear in entry count and gives a per-1,000-entries figure that survives a
  // corpus that grows. ⚠️ STRIDE, not a prefix: loadEnglishEntries returns
  // LENGTH(text) DESC, so a prefix is the longest strings and would overstate.
  //
  // ⚠️ THIS LOOP IS ALSO THE EVIDENCE FOR THE RSS WARNING IN THIS FILE'S HEADER,
  // which would otherwise be an assertion. Four automata are built and dropped
  // in ONE process: heapUsed reports each one's real size, while the RSS delta
  // collapses toward zero from the second build onward — the process has already
  // grown, and it does not give the pages back. That is precisely the shape
  // bench-prepare-arms.js computes its ratio from.
  //
  // ⚠️ THE SAMPLER IS `Math.round(i * len / n)`, AND THE OBVIOUS FORM IS WRONG IN
  // A WAY THAT HIDES INSIDE A CORRECT-LOOKING CAPTION. This loop first read
  // `filter((_, i) => i % Math.floor(len / n) === 0).slice(0, n)` — stride, THEN
  // truncate. At n = 40,000 the integer stride collapses to 1, so the filter is
  // a no-op and `.slice()` keeps the first 40,000 of a `LENGTH(text) DESC` list:
  // a PREFIX OF THE 40,000 LONGEST STRINGS, dropping the entire 34.5% short
  // tail — the exact construction the caption disavows and the comment warns
  // against. It was right for 2 of 4 rows and the row it was wrong for read
  // *lower* than the full set, so nothing looked out of place. Found by review,
  // 2026-08-11. Sampling every n without truncating removes the failure mode
  // rather than the symptom.
  console.log('  scaling (evenly spaced samples of the same entries, each built alone):');
  for (const n of [10000, 20000, 40000, entries.length]) {
    const sample = Array.from(
      { length: n },
      (_, i) => entries[Math.round((i * entries.length) / n)]
    );
    // A duplicate index would make `n entries` a lie and quietly shrink the
    // structure being weighed. Cheap, so it is asserted rather than reasoned about.
    if (new Set(sample).size !== n) {
      throw new Error(`sampler produced ${new Set(sample).size} distinct entries for n=${n}`);
    }
    const h0 = heap();
    const r0 = process.memoryUsage().rss;
    let built = buildTermAutomaton(sample);
    const h1 = heap();
    const r1 = process.memoryUsage().rss;
    const delta = h1 - h0;
    // The reference must survive the sample above or the delta measures a
    // structure already collectable — and a falsy return would make every row
    // of this table a plausible-looking zero.
    if (!built) throw new Error('buildTermAutomaton returned nothing — this row measured air');
    built = null;
    console.log(
      `    ${String(sample.length).padStart(6)} entries: heapUsed +${mb(delta)} ` +
        `(${(((delta / sample.length) * 1000) / 1024 / 1024).toFixed(2)} MB per 1,000) · ` +
        `rss ${r1 - r0 >= 0 ? '+' : ''}${mb(r1 - r0)}`
    );
  }

  // ── ARM 1c: the PER-CALL FIXED FLOOR ─────────────────────────────────────
  // findTermsInSegments re-reads every EN row on EVERY call — deliberately, so
  // the automaton cache cannot go stale (the comment above `_automatonCache`
  // says exactly this). That makes loadEnglishEntries a fixed cost paid per
  // call regardless of how many segments the call carries, and it is the reason
  // the one-segment save path is not cheap.
  let floorMs = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = process.hrtime.bigint();
    loadEnglishEntries(db);
    floorMs = Math.min(floorMs, Number(process.hrtime.bigint() - t) / 1e6);
  }
  console.log(
    `  per-call FIXED floor — loadEnglishEntries re-read, best of 3: ${ms(floorMs)} ` +
      '(paid on every call, 1 segment or 878)'
  );

  // ── The counterfactual, computed while the bench's own automaton is live ──
  // Σ over segments of the number of DISTINCT headwords the automaton finds =
  // exactly the number of resolve() calls findTermsInSegments would make with
  // Task 4's memo removed. Measured with the shipped automaton, not modelled.
  const moduleSegments = args.modules.map((spec) => ({
    spec,
    segments: loadSegments(args.book, spec),
  }));
  const points = args.curve
    .filter((n) => n <= moduleSegments.length)
    .map((n) => {
      const chosen = moduleSegments.slice(0, n);
      const segments = chosen.flatMap((m) => m.segments);
      let hits = 0;
      const distinct = new Set();
      for (const seg of segments) {
        if (!seg.enContent) continue;
        const found = findFirstOccurrences(automaton, seg.enContent);
        hits += found.size;
        for (const id of found.keys()) distinct.add(englishById.get(id));
      }
      return {
        modules: n,
        label: chosen.map((m) => m.spec).join('+'),
        segments,
        hits,
        distinct: distinct.size,
      };
    });

  const withEn = points[points.length - 1].segments.filter(
    (s) => s.enContent && s.enContent.trim()
  );
  const withIs = points[points.length - 1].segments.filter(
    (s) => s.isContent && s.isContent.trim()
  );
  console.log(
    `\nvacuousness guard: largest point = ${points[points.length - 1].segments.length} segments, ` +
      `${withEn.length} with EN content, ${withIs.length} with IS content`
  );
  if (!withEn.length || !withIs.length) {
    console.error(
      'CONTROL FAILED: no EN or no IS content — every arm below would measure nothing.'
    );
    return 1;
  }

  // Drop the bench's own automaton so the e2e arms hold ONE, not two.
  automaton = null;
  entries.length = 0;
  const hAfterDrop = heap();
  console.log(`  bench automaton dropped: heapUsed back to ${mb(hAfterDrop)}`);

  // ── ARM 2: the resolve reference, re-measured on THIS box in THIS run ─────
  console.log(`\n── ARM 2 · resolve() reference (${args.book} scope) ──`);
  const scoped = db
    .prepare(
      `SELECT DISTINCT t.text FROM concept_term t
         JOIN concept c ON c.id = t.concept_id
         JOIN book_domain_priority p ON p.domain = c.domain
         JOIN registered_books b ON b.id = p.book_id
        WHERE t.lang = 'en' AND b.slug = ?`
    )
    .all(args.book)
    .map((r) => r.text);
  const tScope = process.hrtime.bigint();
  const scope = conceptResolver.buildScope(db, args.book, 0);
  const scopeMs = Number(process.hrtime.bigint() - tScope) / 1e6;
  if (scope.unscoped) {
    console.error(`CONTROL FAILED: ${args.book} is ${scope.unscoped} — nothing to measure.`);
    return 1;
  }
  console.log(
    `  ${scoped.length} in-scope distinct EN strings (${args.book}'s domain chain)\n` +
      `  buildScope: ${ms(scopeMs)} (also part of every findTermsInSegments call)`
  );
  for (const label of ['cold', 'warm']) {
    const t = process.hrtime.bigint();
    let winners = 0;
    for (const en of scoped) if (conceptResolver.resolve(scope, en).winner) winners++;
    const took = Number(process.hrtime.bigint() - t) / 1e6;
    console.log(
      `  ${label}: ${ms(took)} for ${scoped.length} resolves ` +
        `(${(took / scoped.length).toFixed(4)} ms each), ${winners} winners`
    );
  }

  /** One instrumented call: counts, not timings (the counters perturb both). */
  function instrumented(segments) {
    counting = true;
    resolveCalls = 0;
    resolveArgs = new Set();
    const { value, compiles } = countingRegExp(() =>
      terminologyService.findTermsInSegments(segments, args.book)
    );
    counting = false;
    const matches = Object.values(value).reduce((n, r) => n + r.matches.length, 0);
    const issues = Object.values(value).reduce((n, r) => n + r.issues.length, 0);
    return { matches, issues, compiles, resolveCalls, resolveDistinct: resolveArgs.size };
  }

  /** One timed call, counters off. Returns the best of `n` runs. */
  function timed(segments, n) {
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const t = process.hrtime.bigint();
      terminologyService.findTermsInSegments(segments, args.book);
      best = Math.min(best, Number(process.hrtime.bigint() - t) / 1e6);
    }
    return best;
  }

  // ── ARM 3: end to end on ONE REAL MODULE ──────────────────────────────────
  const first = points[0];
  console.log(
    `\n── ARM 3 · end to end, ${first.label} (${first.segments.length} real segments, ` +
      `${args.book} scope, ${corpus.terms}-row corpus) ──`
  );
  const hCold0 = heap();
  const tCold = process.hrtime.bigint();
  terminologyService.findTermsInSegments(first.segments, args.book);
  const coldMs = Number(process.hrtime.bigint() - tCold) / 1e6;
  const hCold1 = heap();
  console.log(
    `  cold (builds + caches the automaton): ${ms(coldMs)} · ` +
      `heapUsed +${mb(hCold1 - hCold0)} · rss ${mb(process.memoryUsage().rss)}`
  );
  console.log(`  warm (best of 5): ${ms(timed(first.segments, 5))}`);
  console.log(`  save path, 1 segment (best of 5): ${ms(timed([first.segments[0]], 5))}`);
  const armThree = instrumented(first.segments);
  console.log(
    `  matches ${armThree.matches} · issues ${armThree.issues} · ` +
      `regex compiles ${armThree.compiles} · resolve() calls ${armThree.resolveCalls}`
  );
  if (armThree.matches === 0 || armThree.resolveCalls === 0) {
    console.error(
      'CONTROL FAILED: 0 matches or 0 resolve() calls — either the corpus does not reach this ' +
        'text, or the counting wrapper never bound. Both read as "fast".'
    );
    return 1;
  }

  // ── ARM 4: the SEGMENT axis — does Task 4's memo bound it? ────────────────
  console.log(`\n── ARM 4 · the segment axis (${args.book} scope, same corpus throughout) ──`);
  console.log(
    '  segs   Σhits  resolve()  distinct  ratio   matches  issues  compiles  cmp/match   warm'
  );
  const curve = [];
  for (const p of points) {
    const counts = instrumented(p.segments);
    const warmMs = timed(p.segments, 3);
    curve.push({ ...p, ...counts, warmMs });
    console.log(
      `  ${String(p.segments.length).padStart(4)}  ${String(p.hits).padStart(6)}  ` +
        `${String(counts.resolveCalls).padStart(9)}  ${String(p.distinct).padStart(8)}  ` +
        `${(p.hits / counts.resolveCalls).toFixed(2).padStart(5)}  ` +
        `${String(counts.matches).padStart(7)}  ${String(counts.issues).padStart(6)}  ` +
        `${String(counts.compiles).padStart(8)}  ` +
        `${(counts.compiles / Math.max(counts.matches, 1)).toFixed(2).padStart(9)}  ` +
        `${ms(warmMs).padStart(9)}`
    );
  }

  // ── THE VERDICT on the memo, from the numbers above ───────────────────────
  console.log('\n── VERDICT · does the per-call `resolved` memo bound the segment axis? ──');
  const bounded = curve.every((p) => p.resolveCalls === p.distinct);
  const biggest = curve[curve.length - 1];
  const ratio = biggest.hits / biggest.resolveCalls;
  console.log(
    `  resolve() calls == distinct EN strings hit at every point: ${bounded ? 'YES' : 'NO'}\n` +
      `  at ${biggest.segments.length} segments the un-memoised call count would be ` +
      `${biggest.hits}; measured ${biggest.resolveCalls} (${ratio.toFixed(2)}x saved)`
  );
  if (ratio < 1.05) {
    console.log(
      '  ⚠️ AMBIGUOUS: Σhits ≈ resolve() calls. "No duplicate hits in this sample" and\n' +
        '     "the wrapper never bound" produce the same number — this run cannot tell them apart.'
    );
  }
  console.log(
    `\nprocess peak: rss ${mb(process.memoryUsage().rss)} · heapUsed ${mb(heap())}\n` +
      "  ⚠️ THAT RSS IS NOT THE SERVER'S. This process also IMPORTED the corpus and built a\n" +
      '     second automaton for the counterfactual; only the per-arm deltas above are the\n' +
      "     matcher's own cost.\n" +
      'scale, in one breath: every figure above is the scratch reconstruction of the ' +
      `${RECORDED.concepts}-concept corpus, ${args.book}'s domain chain, and real extracted ` +
      'segments — NOT production, and NOT the c24 fixture (whose subject tags are synthesised, ' +
      'register §C48).'
  );

  conceptResolver.resolve = nativeResolve;
  db.close();
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parseArgs };
