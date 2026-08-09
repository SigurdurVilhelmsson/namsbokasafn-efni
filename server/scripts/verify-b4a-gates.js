// server/scripts/verify-b4a-gates.js
'use strict';
/**
 * §C36 B4a acceptance gate (spec §9) — five gates, measured on a real corpus.
 *
 * ONE COMMAND, re-runnable by anyone holding the raw fetch:
 *
 *   node server/scripts/verify-b4a-gates.js [--corpus ~/idordabanki-raw-2026-08-07]
 *
 * It builds its OWN scratch database — every migration against an empty file,
 * then the 20-collection Íðorðabankinn import — and deletes it on exit. It never
 * opens `pipeline-output/sessions.db`, never touches production, and reads the
 * raw fetch directory read-only.
 *
 * ⚠️ TWO CAVEATS TRAVEL WITH EVERY NUMBER THIS PRINTS. They are printed by the
 * script too, so they cannot be separated from the evidence:
 *
 *  1. THIS IS A RECONSTRUCTION, NOT PRODUCTION'S DATABASE. The local
 *     `pipeline-output/sessions.db` predates migration 045 and has no concept
 *     tables at all, so the corpus is rebuilt from the raw fetch. If a number
 *     diverges from a recorded figure, that is AMBIGUOUS — it could be the code
 *     or it could be the reconstruction — and is therefore not by itself a
 *     diagnosis. The fidelity control below (verify-resolve-gates.js, B1's own
 *     gate script) is what converts that from a disclaimer into a measurement:
 *     it reproduces B1's scope sizes and census on THIS database or it does not.
 *  2. `efnafraedi-2e` IS REGISTERED BY THIS SCRIPT, not by the admin route as on
 *     production. Register §C35: migration 019's INSERT OR IGNORE omits the
 *     NOT NULL `title_is`, so SQLite silently discards the row and a
 *     locally-migrated database has no chemistry book. Chemistry is the book
 *     every gate targets, so the registration is an explicit, logged setup step.
 *
 * ⚠️ THREE TRAPS, each of which made an earlier draft of this gate unrunnable or
 * meaningless:
 *
 *  - `createResolvedExportFn` opens the database `{ readonly: true }`. Gates 3
 *    and 4 write preference rows, so this script holds its OWN WRITABLE
 *    connection and calls `buildResolvedGlossary(db, …)` directly.
 *  - `scope.preference` is a SNAPSHOT taken at `buildScope` time. A row inserted
 *    after the scope exists is invisible to `resolve()`. EVERY re-check here
 *    rebuilds the scope — and gate 3 demonstrates the trap deliberately, by
 *    resolving through the stale scope once and showing it does not move.
 *  - Literal byte-identity is NOT the gate 1 assertion and must never be:
 *    `generated: new Date().toISOString()` differs on every build. Gate 1 uses
 *    the export's own equality over `terms`, plus the payload's key shape.
 *
 * Exit codes: 0 every gate passed · 1 a gate failed · 2 usage or environment.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
// The MODULE, not only its two functions: gate 5b runs this one and the
// branch-point one side by side, so it needs both as objects.
const resolveModule = require('../lib/conceptResolver');
const { buildScope, resolve } = resolveModule;
const { collectSourceEnglish } = require('../lib/sourceEnglish');
const { buildResolvedGlossary } = require('../lib/resolvedGlossary');
// ⚠️ A TEST HELPER ON PURPOSE. `freshMigratedDb` is the ONE place that builds a
// schema by running the real migrations in order; verify-resolve-gates.js's
// review finding 5 deleted a hand-written `CREATE TABLE` from that script for
// exactly this reason — "this script must never invent the schema". Importing
// the helper keeps one owner rather than making this a second hand-copied DDL.
const freshMigratedDb = require('../__tests__/helpers/freshMigratedDb');
const { runImport, formatImportReport } = require('./run-concept-import');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_CORPUS = path.join(os.homedir(), 'idordabanki-raw-2026-08-07');
const BOOK = 'efnafraedi-2e';
const BENCH_BOOK = 'liffraedi-2e';

/**
 * Recorded figures. ⚠️ Every one is a number to REPRODUCE, not a constant to
 * update: a divergence is a finding to explain (see caveat 1 — on a
 * reconstruction it is an ambiguous one).
 */
const RECORDED = {
  // test-results/b3-export-cutover-2026-08.md §1, and its census table.
  terms: 2119,
  outright: 1999,
  nominal: 120,
  realTies: 299,
  // test-results/b1-resolve-gates-2026-08.md — the `cold:` line, liffraedi-2e.
  msPerResolveCold: 0.044,
};

/**
 * ⚠️ A DEV-BOX RATIO, not a production budget, and DELIBERATELY COARSE — the
 * width is set from measurement, not taste, and the measurement is recorded here
 * so it does not look like a goalpost moved after the fact.
 *
 * Gate 5a compares today's cold figure against one recorded on ANOTHER DAY. Two
 * consecutive runs of this script measured **1.43×** and **1.64×** against B1's
 * 0.044 — while gate 5b, interleaving the two code versions in one process
 * minutes later, put them at **0.95×**. So the cross-day metric carries ±60% of
 * box noise and a 2× threshold would eventually fail spuriously; a gate that
 * cries wolf gets ignored, which is worse than a coarse one. 3× still catches
 * the failure shape that matters (a per-resolve database round trip is orders of
 * magnitude, not tens of percent), and **5b is the discriminating half** — it is
 * tight because it compares like with like.
 */
const BENCH_TOLERANCE = 3.0;

/**
 * ⚠️ TIGHTER, because gate 5b compares like with like — the same box, the same
 * process, the same database, interleaved rounds — so box noise is largely
 * cancelled and a real per-resolve cost cannot hide behind it. Measured spread
 * on the first run: 0.73× – 1.02×.
 */
const AB_TOLERANCE = 1.5;

const USAGE = `Usage: node server/scripts/verify-b4a-gates.js [--corpus <dir>]

  --corpus <dir>   directory of raw-<COLLECTION>.json files from the Íðorðabankinn
                   fetch (default: ${DEFAULT_CORPUS}). READ ONLY — it is a
                   rate-limited ~1.5 h asset and this script never writes to it.
  -h, --help       this message

Builds a throwaway migrated + imported database in the system temp directory and
removes it on exit. Never opens pipeline-output/sessions.db.`;

/**
 * ⚠️ Deliberately NOT tools/lib/parseArgs.js, which SILENTLY DROPS unknown flags
 * (CLAUDE.md, durable) — a misremembered flag would become a no-op and this
 * script would quietly measure the wrong corpus.
 */
function parseArgs(argv) {
  let corpus = DEFAULT_CORPUS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--corpus') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        return { error: '--corpus needs a directory as the next argument' };
      }
      corpus = argv[++i].trim();
    } else if (a === '-h' || a === '--help') {
      return { help: true };
    } else {
      return { error: `unrecognised argument '${a}' — accepted: --corpus <dir>, -h/--help` };
    }
  }
  return { corpus };
}

/* ─────────────────────────── reporting ─────────────────────────── */

const results = [];
function record(id, verdict, measured) {
  results.push({ id, verdict, measured });
  console.log(`\n${verdict}  ${id} — ${measured}`);
}
const fmt = (n) => n.toLocaleString('en-US');

/* ─────────────────────────── setup ─────────────────────────── */

/**
 * Register the six books and seed their priorities INTO THE SCRATCH DATABASE.
 *
 * ⚠️ `title_is` IS NOT OPTIONAL, and omitting it fails SILENTLY. Migration 003
 * declares `title_is TEXT NOT NULL` with no default, and SQLite's `OR IGNORE`
 * conflict resolution swallows a NOT NULL violation: no exception, no row. That
 * is register §C35's defect — the same one that leaves `efnafraedi-2e`
 * unregistered on any locally-migrated database — and it is why caveat 2 exists.
 * `registered_by = 'gate'` marks these rows as synthetic; the slug stands in for
 * a title deliberately, since inventing an Icelandic one would be misleading.
 */
function seedBooks(db) {
  if (
    !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get('registered_books')
  ) {
    throw new Error('registered_books is missing — the migrations did not run');
  }
  const insBook = db.prepare(
    "INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by) VALUES (?, ?, 'gate')"
  );
  const insPrio = db.prepare(
    'INSERT OR REPLACE INTO book_domain_priority (book_id, domain, position) VALUES (?, ?, ?)'
  );
  const registered = [];
  for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
    const before = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
    insBook.run(slug, slug);
    const row = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
    if (!row) {
      throw new Error(
        `${slug} could not be registered — INSERT OR IGNORE swallowed it (§C35 shape). ` +
          'Check registered_books’ NOT NULL columns.'
      );
    }
    domains.forEach((d, i) => insPrio.run(row.id, d, i + 1));
    registered.push(`${slug}${before ? ' (already registered)' : ' (registered by this script)'}`);
  }
  console.log('  ' + registered.join('\n  '));
}

/**
 * Build the scratch corpus, capturing anything migration 048 warns about.
 *
 * ⚠️ The capture is gate 2's positive observation. 048 logs `[048] …` ONLY when
 * `book_concept_preference` held rows; silence is therefore the measurement that
 * nothing was expanded, dropped or collided. Reading the row count afterwards
 * cannot tell you that — the table is gone by then, by design.
 */
function buildCorpusDb(corpusDir) {
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...a) => {
    warnings.push(a.join(' '));
    realWarn(...a);
  };
  let built;
  try {
    built = freshMigratedDb();
  } finally {
    console.warn = realWarn;
  }
  if (built.errors.length) {
    throw new Error(`migrations failed:\n  ${built.errors.join('\n  ')}`);
  }
  console.log(`  migrations applied: ${built.applied}, errors: 0`);
  console.log(`  scratch database:   ${built.path}`);

  const t0 = Date.now();
  const stats = runImport(built.db, corpusDir);
  console.log(formatImportReport(stats));
  console.log(`  import wall time: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { ...built, warnings };
}

/** Run a sibling script as a child process and return `{ status, stdout }`. */
function runScript(rel, args) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, rel), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: (r.stdout || '') + (r.stderr || '') };
}

/**
 * The pre-B4a `buildResolvedGlossary`, extracted from the branch point.
 *
 * ⚠️ THIS IS WHAT MAKES GATE 1 A BEFORE/AFTER RATHER THAN A SELF-COMPARISON.
 * Running today's code with zero preference rows and finding it agrees with
 * itself proves nothing; the question is whether the code CHANGED the answer.
 * Four files are enough because the base module graph is pure — resolvedGlossary
 * requires ./conceptResolver, ./sourceEnglish and ./glossaryProducer and nothing
 * else, and none of them requires better-sqlite3 (the `new Database` call lives
 * in createResolvedExportFn, which this gate never uses). So the extraction
 * needs no node_modules and no worktree.
 */
function extractBaseLibs(baseRef) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4a-base-'));
  if (!baseRef) throw new Error('no branch point — `git merge-base main HEAD` did not resolve');
  for (const f of [
    'resolvedGlossary.js',
    'conceptResolver.js',
    'sourceEnglish.js',
    'glossaryProducer.js',
  ]) {
    const r = spawnSync('git', ['show', `${baseRef}:server/lib/${f}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (r.status !== 0) {
      throw new Error(`git show ${baseRef}:server/lib/${f} failed — ${(r.stderr || '').trim()}`);
    }
    fs.writeFileSync(path.join(dir, f), r.stdout);
  }
  return dir;
}

/**
 * Run `fn` with the pre-048 schema temporarily in place.
 *
 * ⚠️ The base `buildPreferenceMap` SELECTs from `book_concept_preference`, which
 * migration 048 dropped — without the table it throws "no such table" and the
 * base code cannot be run at all. 045's `up()` restores it: it is pure
 * `CREATE … IF NOT EXISTS`, migrationRunner already calls it on every server
 * start, so re-running it is idempotent AND it is the real DDL. Never hand-copy
 * the schema here (verify-resolve-gates.js review finding 5). The table is
 * asserted empty on BOTH sides and dropped again, so the database the other
 * gates see is exactly the one gate 2 measured.
 */
function withBaseSchema(db, fn) {
  require('../migrations/045-concept-model').up(db);
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM book_concept_preference').get().n;
  try {
    if (count() !== 0)
      throw new Error(`restored book_concept_preference is not empty (${count()})`);
    const out = fn();
    if (count() !== 0) throw new Error(`book_concept_preference gained ${count()} row(s)`);
    return out;
  } finally {
    db.exec('DROP TABLE IF EXISTS book_concept_preference');
  }
}

/* ─────────────────────────── gates ─────────────────────────── */

/**
 * Gate 2 — the zero-preference control. RUN FIRST, because gate 1 is only
 * meaningful if nothing in the preference model is live: a non-zero row count
 * means gate 1 is comparing two different questions and its agreement is worth
 * nothing. It also has to run before gate 1, which temporarily restores
 * `book_concept_preference` to give the base code a table to read.
 */
function gate2(db, warnings) {
  console.log('\n══ Gate 2 — the zero-preference control ══');
  const prefRows = db.prepare('SELECT COUNT(*) AS n FROM book_term_preference').get().n;
  const oldTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='book_concept_preference'")
    .get();
  const m048 = warnings.filter((w) => w.startsWith('[048]'));

  console.log(`  book_term_preference rows:            ${prefRows}`);
  console.log(
    `  book_concept_preference still exists: ${oldTable ? 'YES' : 'no (dropped by 048)'}`
  );
  console.log(`  migration 048 [048] log lines:        ${m048.length}`);
  for (const w of m048) console.log(`    ${w}`);
  console.log(
    '  ⚠️ On THIS database the 048 expansion is 0 STRUCTURALLY — nothing ever inserted into\n' +
      '     book_concept_preference, so the table was empty when 048 ran. That is NOT the same\n' +
      "     statement as production's measured 0 rows (§C36 B4a, 2026-08-09); it is a weaker one,\n" +
      '     and the two are recorded separately in the evidence doc.'
  );

  const bad = [];
  if (prefRows !== 0) bad.push(`book_term_preference holds ${prefRows} row(s), expected 0`);
  if (oldTable) bad.push('book_concept_preference still exists — 048 did not drop it');
  if (m048.length) bad.push(`migration 048 reported ${m048.length} finding(s); expected silence`);
  record(
    'GATE 2 (zero-preference control)',
    bad.length ? 'FAIL' : 'PASS',
    bad.length ? bad.join('; ') : `0 preference rows · 0 expanded · old table dropped`
  );
  return bad.length === 0;
}

/**
 * Gate 1 — the export is unchanged, gated on `terms`, never on bytes.
 *
 * The SAME census object is passed to both builds, so the only variable is the
 * code. Returns the freshly-built payload, which gates 3 and 4 mine for their
 * subjects (it carries `english` + `conceptId` for every winner).
 */
function gate1(db, census, baseDir, baseRef) {
  console.log('\n══ Gate 1 — the export is unchanged (terms, not bytes) ══');
  console.log(`  census: ${fmt(census.strings.length)} strings from ${census.filesRead} .md files`);
  console.log(`          ${census.root}`);

  const tNext = Date.now();
  const next = buildResolvedGlossary(db, BOOK, { census });
  console.log(`  next (this branch):  ${fmt(next.terms.length)} terms, ${Date.now() - tNext} ms`);

  let prev = null;
  let prevError = baseDir ? null : 'the branch-point libraries were not extracted (see above)';
  if (baseDir) {
    try {
      const tPrev = Date.now();
      prev = withBaseSchema(db, () =>
        require(path.join(baseDir, 'resolvedGlossary.js')).buildResolvedGlossary(db, BOOK, {
          census,
        })
      );
      console.log(
        `  prev (${baseRef.slice(0, 8)}):     ${fmt(prev.terms.length)} terms, ${Date.now() - tPrev} ms`
      );
    } catch (e) {
      prevError = e.message;
    }
  }

  // The recorded census, reproduced. `outright` is derived: the export emits a
  // term for every outright win AND every nominal tie, and omits the real ties.
  const outright = next.stats.total - next.stats.nominalTies;
  console.log(
    `  census reproduced: outright ${fmt(outright)} · nominal ${next.stats.nominalTies} · ` +
      `real ties ${next.stats.ties} (recorded ${fmt(RECORDED.outright)} · ${RECORDED.nominal} · ${RECORDED.realTies})`
  );

  const bad = [];
  if (next.terms.length !== RECORDED.terms)
    bad.push(`terms ${next.terms.length}, recorded ${RECORDED.terms}`);
  if (outright !== RECORDED.outright)
    bad.push(`outright ${outright}, recorded ${RECORDED.outright}`);
  if (next.stats.nominalTies !== RECORDED.nominal)
    bad.push(`nominal ${next.stats.nominalTies}, recorded ${RECORDED.nominal}`);
  if (next.stats.ties !== RECORDED.realTies)
    bad.push(`real ties ${next.stats.ties}, recorded ${RECORDED.realTies}`);

  if (prevError) {
    // ⚠️ NOT downgraded to "2,119 matched, close enough". A term COUNT is not
    // this gate — two payloads can agree on 2,119 and differ in which 2,119 —
    // and gate 1 is required, so an un-runnable comparison fails the run.
    record(
      'GATE 1 (export unchanged)',
      'FAIL',
      `NOT RUN: the pre-change build could not be produced — ${prevError}. ` +
        `Measured on this branch alone: ${fmt(next.terms.length)} terms.`
    );
    return { ok: false, next };
  }

  // THE gate: the export's own equality, over `terms` only.
  const sameTerms = JSON.stringify(prev.terms) === JSON.stringify(next.terms);
  if (!sameTerms) {
    const firstDiff = next.terms.findIndex(
      (t, i) => JSON.stringify(t) !== JSON.stringify(prev.terms[i])
    );
    bad.push(
      `JSON.stringify(prev.terms) !== JSON.stringify(next.terms) — first difference at index ` +
        `${firstDiff}: prev ${JSON.stringify(prev.terms[firstDiff])} vs next ${JSON.stringify(next.terms[firstDiff])}`
    );
  }

  // `stats` gains no key, and no value moves.
  const statsKeys = (p) => Object.keys(p.stats).sort();
  if (JSON.stringify(statsKeys(prev)) !== JSON.stringify(statsKeys(next))) {
    bad.push(`stats keys prev [${statsKeys(prev)}] vs next [${statsKeys(next)}]`);
  } else if (JSON.stringify(prev.stats) !== JSON.stringify(next.stats)) {
    bad.push(
      `stats values moved: prev ${JSON.stringify(prev.stats)} vs ${JSON.stringify(next.stats)}`
    );
  }

  // The PERSISTED payload gains no top-level key. `integrity` is the one key
  // B4a adds to the returned object, and it is caller-only (spec D5):
  // export-terminology.js strips it via NON_PAYLOAD_KEYS before writing, pinned
  // by server/__tests__/glossaryExportRun.test.js. Anything else is a leak into
  // glossary-unified.json.
  const prevKeys = Object.keys(prev).sort();
  const nextKeys = Object.keys(next).sort();
  const added = nextKeys.filter((k) => !prevKeys.includes(k));
  const removed = prevKeys.filter((k) => !nextKeys.includes(k));
  console.log(`  payload keys: prev [${prevKeys}] · next [${nextKeys}]`);
  console.log(`  added: [${added}] · removed: [${removed}]`);
  if (removed.length) bad.push(`payload lost top-level key(s): ${removed}`);
  if (added.length !== 1 || added[0] !== 'integrity') {
    bad.push(
      `payload gained ${JSON.stringify(added)}; only 'integrity' is permitted, and only because ` +
        `export-terminology.js strips it before the write (NON_PAYLOAD_KEYS)`
    );
  }
  console.log(
    `  sameTerms (the export's own equality): ${sameTerms} over ${fmt(next.terms.length)} terms`
  );

  record(
    'GATE 1 (export unchanged)',
    bad.length ? 'FAIL' : 'PASS',
    bad.length
      ? bad.join('; ')
      : `prev.terms === next.terms over ${fmt(next.terms.length)} terms; stats identical; ` +
          `only caller-only 'integrity' added; census ${fmt(outright)}/${next.stats.nominalTies}/${next.stats.ties}`
  );
  return { ok: bad.length === 0, next };
}

/** The Icelandic terms of a concept, in the resolver's own order. */
function isTermsOf(db, conceptId) {
  return db
    .prepare(
      "SELECT id, text, rank FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank ASC, id ASC"
    )
    .all(conceptId);
}

const winnerOf = (r) =>
  r.winner
    ? {
        conceptId: r.winner.conceptId,
        termId: r.winner.termId,
        text: r.winner.text,
        domain: r.winner.domain,
        position: r.winner.position,
      }
    : null;

/** Gate 3 — §C38 closes on the real corpus, with its own control. */
function gate3(db, bookId) {
  console.log('\n══ Gate 3 — §C38 closes on the real corpus ══');
  const concepts = db
    .prepare(
      `SELECT DISTINCT c.id, c.domain, c.collection
         FROM concept c JOIN concept_term t ON t.concept_id = c.id
        WHERE t.lang = 'en' AND t.text = 'accuracy' ORDER BY c.id`
    )
    .all();
  console.log(`  concepts carrying the English 'accuracy': ${concepts.length}`);
  for (const c of concepts) {
    const terms = isTermsOf(db, c.id);
    console.log(
      `    #${c.id} ${c.domain.padEnd(20)} ${c.collection || ''} -> ` +
        terms.map((t) => `${t.text}(r${t.rank})`).join(', ')
    );
  }

  const bad = [];
  const baselineScope = buildScope(db, BOOK, 0);
  const baseline = winnerOf(resolve(baselineScope, 'accuracy'));
  console.log(
    `  baseline: accuracy -> ${baseline ? `${baseline.text} [${baseline.domain} @${baseline.position}]` : 'UNRESOLVED'}`
  );
  if (!baseline || baseline.text !== 'nákvæmni') {
    bad.push(`baseline is not §C38's defect — expected nákvæmni, got ${baseline && baseline.text}`);
  }

  // The biology concept whose HEAD FORM is hittni — the answer §C38 says an
  // editor had no way to ask for.
  const target = concepts
    .map((c) => ({ c, terms: isTermsOf(db, c.id) }))
    .find((x) => x.c.domain === 'biology' && x.terms.length && x.terms[0].text === 'hittni');
  if (!target) {
    record(
      'GATE 3 (§C38 closes)',
      'FAIL',
      'no biology concept whose head form is hittni — §C38’s subject is not in this corpus'
    );
    return false;
  }
  const hittniTermId = target.terms[0].id;
  console.log(`  target: concept #${target.c.id} (biology) term #${hittniTermId} 'hittni'`);

  db.prepare(
    "INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, 'accuracy', ?)"
  ).run(bookId, hittniTermId);

  // ⚠️ THE SNAPSHOT TRAP, demonstrated rather than described: the scope built
  // BEFORE the insert cannot see it. This is not a gate, it is the reason every
  // re-check below rebuilds.
  const stale = winnerOf(resolve(baselineScope, 'accuracy'));
  console.log(
    `  stale scope (built before the insert): ${stale && stale.text} — unchanged, as designed`
  );

  const afterScope = buildScope(db, BOOK, 0);
  const afterR = resolve(afterScope, 'accuracy');
  const after = winnerOf(afterR);
  console.log(
    `  with the preference: accuracy -> ${after && after.text} [${after && after.domain} @${after && after.position}] reason=${afterR.reason}`
  );
  if (!after || after.text !== 'hittni')
    bad.push(`preference did not win — got ${after && after.text}`);
  if (after && after.domain !== 'biology') bad.push(`expected biology, got ${after.domain}`);
  if (afterR.reason !== 'book-preference')
    bad.push(`reason ${afterR.reason}, expected book-preference`);

  // THE CONTROL. Without this, all that has been shown is that something changed.
  db.prepare(
    "DELETE FROM book_term_preference WHERE book_id = ? AND chapter = 0 AND english = 'accuracy'"
  ).run(bookId);
  const restoredR = resolve(buildScope(db, BOOK, 0), 'accuracy');
  const restored = winnerOf(restoredR);
  console.log(
    `  control, preference deleted: accuracy -> ${restored && restored.text} ` +
      `[${restored && restored.domain} @${restored && restored.position}] reason=${restoredR.reason}`
  );
  if (JSON.stringify(restored) !== JSON.stringify(baseline)) {
    bad.push(
      `control failed — after deleting the row the answer is ${JSON.stringify(restored)}, ` +
        `not the baseline ${JSON.stringify(baseline)}`
    );
  }

  record(
    'GATE 3 (§C38 closes)',
    bad.length ? 'FAIL' : 'PASS',
    bad.length
      ? bad.join('; ')
      : `nákvæmni [physics @2] -> hittni [biology @3] (book-preference), and nákvæmni returns on delete`
  );
  return bad.length === 0;
}

/**
 * Gate 4 — THE LEAK IS CLOSED, on the real corpus.
 *
 * ⚠️ No unit fixture in the suite can express this: every one inserts exactly
 * ONE 'en' term per concept, so a concept-keyed preference and a string-keyed
 * one are indistinguishable there. This is the regression test for the defect
 * that forced the whole spec to be rewritten, and it exists only here.
 */
function gate4(db, bookId, payload) {
  console.log('\n══ Gate 4 — the §2.2 leak is closed on the real corpus ══');

  // Every winner the export emitted, grouped by the concept that answered.
  const byConcept = new Map();
  for (const t of payload.terms) {
    if (!byConcept.has(t.conceptId)) byConcept.set(t.conceptId, []);
    byConcept.get(t.conceptId).push(t);
  }

  const candidates = [];
  for (const [conceptId, entries] of byConcept) {
    // ⚠️ CASE VARIANTS ARE NOT A LEAK. The census carries atom/Atom/ATOM as
    // three strings, `book_term_preference.english` is COLLATE NOCASE and
    // `buildPreferenceMap` lowercases its key, so preferring 'Atom' moving
    // 'atom' is §5.1's documented collation contract working correctly. A pair
    // that differs only by case would produce a FALSE FAILURE here.
    const distinct = new Map();
    for (const e of entries)
      if (!distinct.has(e.english.toLowerCase())) distinct.set(e.english.toLowerCase(), e);
    if (distinct.size < 2) continue;
    // The concept needs a SECOND Icelandic term, or a preference cannot move
    // anything and the gate would be vacuous in the other direction.
    const terms = isTermsOf(db, conceptId);
    if (terms.length < 2) continue;
    candidates.push({ conceptId, entries: [...distinct.values()], terms });
  }
  candidates.sort((a, b) => a.conceptId - b.conceptId);
  console.log(
    `  concepts answering ≥2 case-distinct census strings AND carrying ≥2 Icelandic terms: ${candidates.length}`
  );

  if (candidates.length === 0) {
    // ⚠️ NOT a pass. An absence is not an answer.
    record(
      'GATE 4 (the leak is closed)',
      'NOT RUN',
      'no concept in chemistry’s census answers two case-distinct English strings while ' +
        'carrying a second Icelandic term, so the multi-string case cannot be constructed here'
    );
    return { ok: true, ran: false };
  }

  const pick = candidates[0];
  const [A, B] = pick.entries;
  const preferred = pick.terms[1]; // rank 2 — a real alternative on the same concept
  console.log(
    `  subject: concept #${pick.conceptId} carries '${A.english}' and '${B.english}' ` +
      `(and ${pick.entries.length - 2} more), Icelandic terms ${pick.terms.map((t) => t.text).join(' / ')}`
  );

  const bad = [];
  const beforeScope = buildScope(db, BOOK, 0);
  const beforeA = winnerOf(resolve(beforeScope, A.english));
  const beforeB = winnerOf(resolve(beforeScope, B.english));
  console.log(
    `  before: '${A.english}' -> ${beforeA && beforeA.text} · '${B.english}' -> ${beforeB && beforeB.text}`
  );

  db.prepare(
    'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
  ).run(bookId, A.english, preferred.id);

  const afterScope = buildScope(db, BOOK, 0);
  const afterAR = resolve(afterScope, A.english);
  const afterA = winnerOf(afterAR);
  const afterB = winnerOf(resolve(afterScope, B.english));
  console.log(
    `  after preferring '${A.english}' -> term #${preferred.id} '${preferred.text}': ` +
      `'${A.english}' -> ${afterA && afterA.text} (reason=${afterAR.reason}) · '${B.english}' -> ${afterB && afterB.text}`
  );

  // ⚠️ "A MOVED" IS THE CONTROL FOR "B DID NOT". A preference that silently
  // never fired would leave B unchanged too, and that pass would mean nothing.
  if (!afterA || afterA.text !== preferred.text) {
    bad.push(`the preference did not fire — '${A.english}' resolved to ${afterA && afterA.text}`);
  }
  if (afterAR.reason !== 'book-preference') {
    bad.push(`'${A.english}' reason ${afterAR.reason}, expected book-preference`);
  }
  // THE GATE: the OTHER English string on the same concept must not move — the
  // whole winner object, not merely its text.
  if (JSON.stringify(afterB) !== JSON.stringify(beforeB)) {
    bad.push(
      `THE LEAK IS OPEN — '${B.english}' moved from ${JSON.stringify(beforeB)} to ${JSON.stringify(afterB)}`
    );
  }

  db.prepare(
    'DELETE FROM book_term_preference WHERE book_id = ? AND chapter = 0 AND english = ?'
  ).run(bookId, A.english);
  const restoredA = winnerOf(resolve(buildScope(db, BOOK, 0), A.english));
  if (JSON.stringify(restoredA) !== JSON.stringify(beforeA)) {
    bad.push(`control failed — '${A.english}' did not return to ${JSON.stringify(beforeA)}`);
  }

  record(
    'GATE 4 (the leak is closed)',
    bad.length ? 'FAIL' : 'PASS',
    bad.length
      ? bad.join('; ')
      : `concept #${pick.conceptId}: '${A.english}' -> '${preferred.text}' (book-preference) while ` +
          `'${B.english}' stayed '${beforeB.text}' [${beforeB.domain} @${beforeB.position}]`
  );
  return { ok: bad.length === 0, ran: true };
}

/**
 * Gate 5b — the DISCRIMINATING half: prev vs next, same box, same process, same
 * database, interleaved.
 *
 * ⚠️ WHY THIS EXISTS. Gate 5a compares today's `cold:` figure against a number
 * recorded on ANOTHER DAY, and a dev box does not repeat itself: the first run of
 * this gate measured 1.43× against B1's 0.044 and the A/B below, on the same
 * corpus minutes later, put prev and next within noise of each other (0.80×,
 * 1.02×, 0.73× — next FASTER in two of three rounds). A cross-day ratio cannot
 * tell "the override costs 43%" from "the box was busy"; interleaving can.
 *
 * ⚠️ IT IS ALSO A CORRECTNESS CONTROL, and a free one: with zero preference rows
 * prev and next must find the SAME number of winners over biology's 47,568-term
 * scope — a second, larger book than gate 1's chemistry, and a hard failure if
 * they disagree.
 */
function benchAB(db, baseDir) {
  const prevMod = require(path.join(baseDir, 'conceptResolver.js'));
  const strings = db
    .prepare(
      `SELECT DISTINCT t.text FROM concept_term t
         JOIN concept c ON c.id = t.concept_id
         JOIN book_domain_priority p ON p.domain = c.domain
         JOIN registered_books b ON b.id = p.book_id
        WHERE t.lang = 'en' AND b.slug = ?`
    )
    .all(BENCH_BOOK)
    .map((r) => r.text);

  const time = (mod) => {
    const scope = mod.buildScope(db, BENCH_BOOK, 0);
    const t = process.hrtime.bigint();
    let winners = 0;
    for (const s of strings) if (mod.resolve(scope, s).winner) winners++;
    return { ms: Number(process.hrtime.bigint() - t) / 1e6, winners };
  };

  const rounds = [];
  withBaseSchema(db, () => {
    for (let i = 0; i < 3; i++) {
      const p = time(prevMod);
      const n = time(resolveModule);
      rounds.push({ prev: p, next: n, ratio: n.ms / p.ms });
      console.log(
        `    round ${i + 1}: prev ${(p.ms / strings.length).toFixed(3)} ms/resolve (${p.winners} winners) · ` +
          `next ${(n.ms / strings.length).toFixed(3)} ms/resolve (${n.winners} winners) · ` +
          `ratio ${(n.ms / p.ms).toFixed(2)}×`
      );
    }
  });
  const ratios = rounds.map((r) => r.ratio).sort((a, b) => a - b);
  return {
    strings: strings.length,
    rounds,
    median: ratios[1],
    winnersAgree: rounds.every((r) => r.prev.winners === r.next.winners),
    winners: rounds[0].next.winners,
  };
}

/** Gate 5 — no performance regression, against B1's own `cold:` figure. */
function gate5(dbPath, db, baseDir) {
  console.log('\n══ Gate 5 — no performance regression ══');
  const { status, stdout } = runScript('server/scripts/bench-resolve.js', [
    '--db',
    dbPath,
    '--book',
    BENCH_BOOK,
  ]);
  console.log(
    stdout
      .trimEnd()
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n')
  );
  if (status !== 0) {
    record('GATE 5 (performance)', 'FAIL', `bench-resolve.js exited ${status}`);
    return false;
  }
  const read = (label) => {
    const m = stdout.match(new RegExp(`${label}:.*\\(([\\d.]+) ms each\\)`));
    return m ? Number(m[1]) : null;
  };
  const cold = read('cold');
  const warm = read('warm');
  if (cold === null) {
    record(
      'GATE 5 (performance)',
      'FAIL',
      'could not parse the `cold:` line from bench-resolve.js'
    );
    return false;
  }
  // ⚠️ COLD against COLD. B1's recorded 0.044 is its `cold:` line; comparing a
  // warm run against a cold baseline would let a real regression hide.
  const ratio = cold / RECORDED.msPerResolveCold;
  const bad = [];
  if (ratio > BENCH_TOLERANCE) {
    bad.push(
      `cold ${cold.toFixed(3)} ms/resolve is ${ratio.toFixed(2)}× B1's recorded ` +
        `${RECORDED.msPerResolveCold}, past the ${BENCH_TOLERANCE}× tolerance`
    );
  }

  // 5b — the same-box A/B, which is what makes 5a's cross-day ratio readable.
  let ab = null;
  if (!baseDir) {
    console.log('  ⚠️ 5b NOT RUN — the branch-point libraries were not extracted, so the ');
    console.log('     prev-vs-next comparison cannot be made and 5a stands alone.');
  } else {
    console.log(`  prev vs next, interleaved on this box (${BENCH_BOOK}):`);
    try {
      ab = benchAB(db, baseDir);
      console.log(
        `    median ratio ${ab.median.toFixed(2)}× over ${fmt(ab.strings)} resolves · ` +
          `winners agree: ${ab.winnersAgree} (${fmt(ab.winners)})`
      );
      if (!ab.winnersAgree) {
        bad.push('prev and next disagree on the winner count with zero preference rows');
      }
      if (ab.median > AB_TOLERANCE) {
        bad.push(
          `same-box median ratio ${ab.median.toFixed(2)}× exceeds ${AB_TOLERANCE}× — ` +
            'the override itself is slower, not the box'
        );
      }
    } catch (e) {
      bad.push(`5b could not run — ${e.message}`);
    }
  }

  record(
    'GATE 5 (performance)',
    bad.length ? 'FAIL' : 'PASS',
    bad.length
      ? bad.join('; ')
      : `5a: cold ${cold.toFixed(3)} ms/resolve vs B1's recorded ${RECORDED.msPerResolveCold} ` +
          `(${ratio.toFixed(2)}×, tolerance ${BENCH_TOLERANCE}×), warm ${warm === null ? 'n/a' : warm.toFixed(3)} · ` +
          `5b: prev-vs-next median ${ab ? ab.median.toFixed(2) : 'n/a'}× on the same box, ` +
          `${ab ? fmt(ab.winners) : 'n/a'} winners on both — DEV BOX, a regression check against ` +
          `itself, never a production budget`
  );
  return bad.length === 0;
}

/* ─────────────────────────── main ─────────────────────────── */

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.error) {
    console.error(`error: ${args.error}\n\n${USAGE}`);
    return 2;
  }
  if (!fs.existsSync(args.corpus)) {
    console.error(
      `error: no corpus directory at ${args.corpus}\n` +
        'It is the 20-collection Íðorðabankinn raw fetch (see its PROVENANCE.md). ' +
        'Re-fetching costs ~1.5 h at the mandated 1 req/s — look for the directory before rebuilding it.'
    );
    return 2;
  }

  console.log('§C36 B4a acceptance gate — five gates on a RECONSTRUCTED corpus\n');
  console.log(
    '⚠️ CAVEAT 1: this is a reconstruction from the raw fetch, NOT production’s database.'
  );
  console.log(
    '   A divergence from a recorded figure is AMBIGUOUS — code or reconstruction — and is'
  );
  console.log('   not by itself a diagnosis. The fidelity control below is what narrows that.');
  console.log(
    '⚠️ CAVEAT 2: efnafraedi-2e is registered BY THIS SCRIPT, not by the admin route as on'
  );
  console.log(
    '   production — a locally-migrated database has no chemistry book (register §C35).\n'
  );

  console.log(`── Setup: build the scratch corpus from ${args.corpus} ──`);
  let built;
  try {
    built = buildCorpusDb(args.corpus);
  } catch (e) {
    console.error(`error: could not build the corpus — ${e.message}`);
    return 2;
  }
  const db = built.db;

  console.log('\n── Setup: register the books (§C35 — see caveat 2) ──');
  try {
    seedBooks(db);
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 2;
  }
  const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(BOOK);

  // ── Reconstruction-fidelity control ────────────────────────────────────────
  // B1's own gate script, re-run against THIS database. It pins the scope sizes
  // (47,568 / 19,749) and the 1,999/120/299 census that B1 measured on the real
  // corpus, so its verdict is a MEASUREMENT of how faithful the reconstruction
  // is — the difference between caveat 1 as a disclaimer and caveat 1 as a
  // bounded, stated fact.
  console.log('\n── Reconstruction fidelity: B1’s verify-resolve-gates.js on this database ──');
  const fidelity = runScript('server/scripts/verify-resolve-gates.js', ['--db', built.path]);
  console.log(
    fidelity.stdout
      .trimEnd()
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n')
  );
  console.log(`  verify-resolve-gates.js exit code: ${fidelity.status}`);
  const fidelityOk = fidelity.status === 0;
  results.push({
    id: 'FIDELITY CONTROL (B1 gates on this reconstruction)',
    verdict: fidelityOk ? 'PASS' : 'FAIL',
    measured: `verify-resolve-gates.js exit ${fidelity.status}`,
  });

  const ok = [];
  ok.push(gate2(db, built.warnings));

  const mb = spawnSync('git', ['merge-base', 'main', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const base = mb.status === 0 ? mb.stdout.trim() : null;
  console.log(`\n  branch point (git merge-base main HEAD): ${base || 'UNRESOLVED'}`);

  // Extracted ONCE and shared by gates 1 and 5b — both need the pre-B4a code.
  let baseDir = null;
  try {
    baseDir = extractBaseLibs(base);
    console.log(`  branch-point libraries extracted to ${baseDir}`);
  } catch (e) {
    console.error(`  ⚠️ could not extract the branch-point libraries — ${e.message}`);
  }

  const census = collectSourceEnglish(BOOK);
  if (!census.strings.length) {
    console.error(
      `error: empty census for ${BOOK} under ${census.root} — gates 1 and 4 cannot run`
    );
    return 2;
  }
  const g1 = gate1(db, census, baseDir, base || '');
  ok.push(g1.ok);
  ok.push(gate3(db, book.id));
  const g4 = gate4(db, book.id, g1.next);
  ok.push(g4.ok);
  ok.push(gate5(built.path, db, baseDir));
  if (baseDir) fs.rmSync(baseDir, { recursive: true, force: true });

  // The preference table must be exactly as gate 2 found it.
  const leftover = db.prepare('SELECT COUNT(*) AS n FROM book_term_preference').get().n;
  console.log(`\n── Cleanup: book_term_preference rows left behind: ${leftover} ──`);
  if (leftover !== 0) {
    results.push({
      id: 'CLEANUP',
      verdict: 'FAIL',
      measured: `${leftover} preference row(s) left behind`,
    });
    ok.push(false);
  }

  console.log('\n══ SUMMARY ══');
  for (const r of results)
    console.log(`  ${r.verdict.padEnd(8)} ${r.id}\n           ${r.measured}`);
  if (!fidelityOk) {
    console.log(
      '\n  ⚠️ The fidelity control did not pass. Every gate above is measured on a corpus that ' +
        'does not reproduce B1’s figures, so caveat 1 is live: read nothing here as a diagnosis.'
    );
  }
  if (!g4.ran) {
    console.log('\n  ⚠️ GATE 4 DID NOT RUN. See its line above for why — it is not a pass.');
  }

  db.close();
  const failed = ok.filter((x) => !x).length + (fidelityOk ? 0 : 1);
  console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll checks passed.');
  return failed ? 1 : 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parseArgs };
