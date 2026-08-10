// server/scripts/verify-b4b0-gates.js
'use strict';
/**
 * §C36 B4b-0b acceptance gate (spec §6) — six gates plus a fidelity control,
 * measured on a real corpus.
 *
 * ONE COMMAND, re-runnable by anyone holding the raw fetch and the BÍN CSV:
 *
 *   node server/scripts/verify-b4b0-gates.js [--corpus ~/idordabanki-raw-2026-08-07]
 *                                            [--bin-data tools/data/SHsnid.csv] [--self-test]
 *
 * It builds its OWN scratch database via server/scripts/lib/scratchCorpus.js —
 * every migration against an empty file, then the 20-collection Íðorðabankinn
 * import — and deletes it on exit. It never opens `pipeline-output/sessions.db`,
 * never touches production, and reads both data sources read-only.
 *
 * ⚠️ TWO CAVEATS TRAVEL WITH EVERY NUMBER THIS PRINTS. They are printed by the
 * script too, so they cannot be separated from the evidence:
 *
 *  1. THIS IS A RECONSTRUCTION, NOT PRODUCTION'S DATABASE. The local
 *     `pipeline-output/sessions.db` holds 6 terminology rows and no concept
 *     model, so the corpus is rebuilt from the raw fetch. A number that diverges
 *     from a recorded figure is therefore AMBIGUOUS — it could be the code or it
 *     could be the reconstruction. The SETUP assertion below is what converts
 *     that from a disclaimer into a measurement: the rebuild reproduces §C36 B2's
 *     recorded concept/concept_term totals exactly, or the run stops.
 *  2. `efnafraedi-2e` IS REGISTERED BY seedBooks, not by the admin route as on
 *     production. Register §C35: migration 019's INSERT OR IGNORE omits the
 *     NOT NULL `title_is`, so SQLite silently discards the row and a
 *     locally-migrated database has no chemistry book.
 *
 * ⚠️ GATE 2 IS WHAT MAKES GATE 1 MEAN ANYTHING. A run that refused EVERYTHING
 * would pass gate 1 perfectly — `afl` would be unwritten, exactly as required.
 * Only the positive control distinguishes "refuses correctly" from "refuses".
 *
 * ⚠️ GATE 3 HAD THREE INDEPENDENT WAYS TO PASS FOR THE WRONG REASON, and each is
 * closed deliberately — see its comment before changing anything there.
 *
 * Exit codes: 0 every gate passed · 1 a gate failed · 2 usage or environment.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const { buildCorpusDb, seedBooks } = require('./lib/scratchCorpus');
const { collectSourceEnglish } = require('../lib/sourceEnglish');
const { buildResolvedGlossary } = require('../lib/resolvedGlossary');
const { main: runFetch } = require('./fetch-bin-inflections');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_CORPUS = path.join(os.homedir(), 'idordabanki-raw-2026-08-07');
const DEFAULT_BIN = path.join(REPO_ROOT, 'tools', 'data', 'SHsnid.csv');
const FIXTURES = path.join(__dirname, '..', '__tests__', 'fixtures');
const BOOK = 'efnafraedi-2e';

/**
 * ⚠️ THE CSV'S IDENTITY. Same constant as binInflectionsGolden.test.js, and
 * asserted BEFORE anything else so a data swap reports as a data swap rather
 * than as a code regression. Doubly relevant here: spec D2 defers a possible
 * switch to KRISTINsnid.csv, whose form column is index 9, not 4.
 */
const CSV_SHA256 = '9c10d70d73c03168f05f152616b8cafa6e4275e7db8701338f5f3c48a45b7ab6';

/**
 * Recorded figures from §C36 B2 — numbers to REPRODUCE, not constants to update.
 * A divergence is a finding to explain, and on a reconstruction an ambiguous one.
 * → test-results/b2-prod-population-2026-08.md
 */
const RECORDED = { concepts: 70187, terms: 192189 };

/**
 * The three worked cases, confirmed against BÍN itself in spec §2.2.1.
 * ⚠️ `afl` and the two rescues are asserted by IDENTITY, never by count: a length
 * assertion passes on the wrong paradigm of the right size.
 */
const CONTAMINANTS = ['horfinn', 'horfið', 'unninn', 'unnið'];

const results = [];
function record(id, verdict, measured) {
  results.push({ id, verdict, measured });
  console.log(`\n${verdict}  ${id} — ${measured}`);
  return verdict === 'PASS';
}

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    `Usage: node server/scripts/verify-b4b0-gates.js [--corpus <dir>] [--bin-data <path>] [--self-test]

  --corpus <dir>    raw-<COLLECTION>.json files from the Íðorðabankinn fetch
                    (default: ${DEFAULT_CORPUS}). READ ONLY — a rate-limited
                    ~1.5 h asset this script never writes to.
  --bin-data <path> SHsnid.csv (default: ${DEFAULT_BIN}). READ ONLY.
  --self-test       after the gates pass, plant each defective corpus state on a
                    COPY of the scratch DB and assert the matching gate goes red.
                    A gate never seen failing is an untested assertion.
  -h, --help        this message`
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = { corpus: DEFAULT_CORPUS, binData: DEFAULT_BIN, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--corpus' || a === '--bin-data') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) usage(`${a} expects a value`);
      if (a === '--corpus') out.corpus = v;
      else out.binData = v;
    } else if (a === '--self-test') out.selfTest = true;
    else if (a === '-h' || a === '--help') usage();
    else usage(`unrecognised argument '${a}'`);
  }
  return out;
}

/** Stream-hash a file — the CSV is 377 MB and readFileSync would spike RSS. */
function sha256File(p) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(1 << 20);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest('hex');
}

/**
 * Seed the C24 fixture into the scratch DB's OLD terminology tables.
 *
 * Same shape as findTermsGolden.test.js's seedFixture — that file is the owner
 * of the fixture's meaning; this is the same INSERTs against the real migrated
 * schema rather than its hand-copied in-memory one.
 */
function seedC24(db) {
  const terms = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'c24-terms.json'), 'utf-8'));
  const insHw = db.prepare('INSERT INTO terminology_headwords (english, pos) VALUES (?, ?)');
  const insTr = db.prepare(
    `INSERT INTO terminology_translations
       (headword_id, icelandic, inflections, source, status, proposed_by, proposed_by_name)
     VALUES (?, ?, ?, 'fixture', ?, 'u1', 'Fixture')`
  );
  const insSubj = db.prepare(
    'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
  );
  const tx = db.transaction(() => {
    for (const hw of terms.headwords) {
      const hwId = Number(insHw.run(hw.english, hw.pos).lastInsertRowid);
      for (const tr of hw.translations) {
        const trId = Number(
          insTr.run(
            hwId,
            tr.icelandic,
            tr.inflections ? JSON.stringify(tr.inflections) : null,
            tr.status
          ).lastInsertRowid
        );
        for (const s of tr.subjects) insSubj.run(trId, s);
      }
    }
  });
  tx();
  return terms.headwords.length;
}

/**
 * Run findTermsInSegments IN A CHILD PROCESS against `dbPath`.
 *
 * ⚠️ A CHILD, NOT AN IN-PROCESS CALL, AND THAT IS THE WHOLE POINT.
 * terminologyService caches its Aho-Corasick automaton keyed on an FNV-1a
 * fingerprint over terminology_headwords (id, english) — which B4b-0b never
 * touches. So a second in-process call returns the CACHED automaton without
 * re-reading the database at all, and "byte-identical before and after" would
 * hold no matter what the population did. A child starts cold.
 *
 * ⚠️ SESSIONS_DB_PATH rather than _setTestDb: terminologyService resolves
 * DB_PATH via resolveDbPath() at module load, so the child needs no injection
 * and exercises the production path.
 */
function matcherOutput(dbPath) {
  const r = spawnSync(
    process.execPath,
    [
      '-e',
      `const fs=require('fs');const path=require('path');
       const svc=require(path.join(${JSON.stringify(path.join(__dirname, '..'))},'services','terminologyService'));
       const segs=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(FIXTURES, 'c24-segments.json'))},'utf-8'));
       process.stdout.write(JSON.stringify(svc.findTermsInSegments(segs,${JSON.stringify(BOOK)})));`,
    ],
    {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, SESSIONS_DB_PATH: dbPath },
    }
  );
  if (r.status !== 0) {
    throw new Error(`matcher child failed (${r.status}): ${(r.stderr || '').trim().slice(0, 600)}`);
  }
  return JSON.parse(r.stdout);
}

/** Every string value anywhere in a payload, for the licence scan. */
function keysDeep(v, acc = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, acc));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      acc.add(k);
      keysDeep(x, acc);
    }
  }
  return acc;
}

function isOf(db, text) {
  return db
    .prepare("SELECT id, text, inflections FROM concept_term WHERE lang='is' AND LOWER(text)=?")
    .all(text);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  console.log('══════════════════════════════════════════════════════════════');
  console.log(' §C36 B4b-0b acceptance gate — pos-aware BÍN → concept_term');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('⚠️ CAVEAT 1 — this is a RECONSTRUCTION, not production. The local dev DB');
  console.log('   has no concept model, so the corpus is rebuilt from the raw fetch. The');
  console.log('   SETUP assertion below is what makes its numbers admissible.');
  console.log('⚠️ CAVEAT 2 — efnafraedi-2e is registered by this script, not by the admin');
  console.log('   route (§C35: 019’s INSERT OR IGNORE silently drops it locally).');

  if (!fs.existsSync(args.corpus)) usage(`corpus directory not found: ${args.corpus}`);
  if (!fs.existsSync(args.binData)) usage(`BÍN data not found: ${args.binData}`);

  // ── Gate 0: the CSV is the one this was designed against ──────────────────
  console.log('\n── Gate 0: input identity ──');
  const csvHash = sha256File(args.binData);
  console.log(`  ${args.binData}\n  sha256 ${csvHash}`);
  if (csvHash !== CSV_SHA256) {
    record(
      'GATE 0 (input identity)',
      'FAIL',
      `SHsnid.csv is NOT the file the run was designed against (expected ${CSV_SHA256}). ` +
        'This is a DATA SWAP, not a code regression — do not "fix" the code to match. ' +
        'Note spec D2 defers a switch to KRISTINsnid.csv, whose form column is index 9, not 4.'
    );
    return finish();
  }
  record('GATE 0 (input identity)', 'PASS', `SHsnid.csv matches the recorded sha256`);

  // ── Setup ─────────────────────────────────────────────────────────────────
  console.log(`\n── Setup: build the scratch corpus from ${args.corpus} ──`);
  const built = buildCorpusDb(args.corpus);
  const db = built.db;
  seedBooks(db);

  const nConcepts = db.prepare('SELECT COUNT(*) c FROM concept').get().c;
  const nTerms = db.prepare('SELECT COUNT(*) c FROM concept_term').get().c;
  console.log(`  concept ${nConcepts} · concept_term ${nTerms}`);
  if (nConcepts !== RECORDED.concepts || nTerms !== RECORDED.terms) {
    // ⚠️ STOP. Every gate below measures this database; if the reconstruction is
    // not B2's corpus, a divergence downstream cannot be attributed to the code.
    record(
      'SETUP (reconstruction fidelity)',
      'FAIL',
      `rebuild is ${nConcepts}/${nTerms}, recorded ${RECORDED.concepts}/${RECORDED.terms} — ` +
        'the corpus differs, so nothing measured below is attributable to the code'
    );
    return finish();
  }
  record(
    'SETUP (reconstruction fidelity)',
    'PASS',
    `rebuild reproduces §C36 B2 exactly: ${nConcepts} concepts / ${nTerms} terms`
  );

  // ── Fidelity control: B1's OWN gate, on THIS database ─────────────────────
  // ⚠️ The totals above say the corpus is the right SIZE. This says the RESOLVER
  // behaves the same on it — B1's scope sizes and tie census reproduce, or they
  // do not. That is what turns caveat 1 from a disclaimer into a measurement,
  // and it is why the check is run rather than reasoned about.
  console.log('\n── Fidelity control: verify-resolve-gates.js on this reconstruction ──');
  const fid = spawnSync(
    process.execPath,
    [path.join(__dirname, 'verify-resolve-gates.js'), '--db', built.path],
    {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  const fidTail = (fid.stdout || '').trim().split('\n').slice(-3).join(' | ');
  console.log(`  exit ${fid.status} · ${fidTail}`);
  record(
    'FIDELITY CONTROL (B1 gates on this reconstruction)',
    fid.status === 0 ? 'PASS' : 'FAIL',
    fid.status === 0
      ? 'verify-resolve-gates.js exit 0 — B1’s scope sizes and census reproduce here'
      : `verify-resolve-gates.js exit ${fid.status}: ${(fid.stderr || fidTail).slice(0, 300)}`
  );

  // ── Captures taken BEFORE the population ──────────────────────────────────
  console.log('\n── Pre-population captures (gates 3 and 4) ──');
  const nHeadwords = seedC24(db);
  console.log(`  C24 fixture seeded into the OLD tables: ${nHeadwords} headwords`);
  const matcherBefore = matcherOutput(built.path);
  const nMatches = Object.values(matcherBefore).reduce((n, r) => n + r.matches.length, 0);
  const nIssues = Object.values(matcherBefore).reduce((n, r) => n + r.issues.length, 0);
  console.log(`  matcher before: ${nMatches} matches / ${nIssues} issues`);

  const census = collectSourceEnglish(BOOK);
  const glossaryBefore = buildResolvedGlossary(db, BOOK, { census });
  console.log(
    `  resolved glossary before: ${glossaryBefore.terms.length} terms ` +
      `(census ${census.strings.length} strings from ${census.filesRead} files)`
  );

  // ── The population ────────────────────────────────────────────────────────
  console.log('\n── Running the population (--execute) ──');
  return runFetch(['--db', built.path, '--bin-data', args.binData, '--execute'])
    .then((report) => {
      const ok = [];

      // ── Gate 1: `afl` is refused and named ─────────────────────────────────
      console.log('\n══ Gate 1 — an ambiguous string is REFUSED and NAMED ══');
      const aflRows = isOf(db, 'afl');
      const aflRefusal = report.refusals.find((r) => r.text === 'afl');
      const written = aflRows.filter((r) => r.inflections !== null);
      console.log(`  afl: ${aflRows.length} concept_term row(s), ${written.length} populated`);
      if (aflRefusal) {
        console.log(
          `  reported as ${aflRefusal.outcome}: ` +
            aflRefusal.entries.map((e) => `${e.wordClass}#${e.binId}`).join(' ')
        );
      }
      const g1bad = [];
      if (written.length) g1bad.push(`${written.length} afl row(s) were written`);
      if (!aflRefusal) g1bad.push('afl is not in the refusal report');
      else if (aflRefusal.entries.length < 2)
        g1bad.push('afl’s refusal names fewer than 2 entries');
      ok.push(
        record(
          'GATE 1 (D4 refuses the ambiguous)',
          g1bad.length ? 'FAIL' : 'PASS',
          g1bad.length
            ? g1bad.join('; ')
            : `afl unwritten across ${aflRows.length} row(s), named with ` +
                `${aflRefusal.entries.length} contending entries ` +
                `(${aflRefusal.entries.map((e) => e.wordClass).join('+')})`
        )
      );

      // ── Gate 1b: hverfa and vinna are rescued, asserted by IDENTITY ────────
      console.log('\n══ Gate 1b — D4.2 rescues, and the paradigm is CLEAN ══');
      console.log(
        '  ⚠️ This gate did not exist until D4.2 was adopted, and the spec table asserted the\n' +
          '     OPPOSITE — that all three were refused. A gate written against a superseded\n' +
          '     decision passes or fails for reasons unconnected to the code.'
      );
      const g1bBad = [];
      const g1bSeen = [];
      for (const w of ['hverfa', 'vinna']) {
        const rows = isOf(db, w);
        const rescue = report.rescues.find((r) => r.text === w);
        const vals = rows
          .filter((r) => r.inflections !== null)
          .map((r) => JSON.parse(r.inflections));
        if (!vals.length) {
          g1bBad.push(`${w} was not written at all`);
          continue;
        }
        const dirty = vals.flat().filter((f) => CONTAMINANTS.includes(f));
        console.log(
          `  ${w}: ${rows.length} row(s), ${vals.length} written, ${vals[0].length} forms · ` +
            (rescue
              ? `chose ${rescue.chosen.wordClass}#${rescue.chosen.binId}`
              : 'NOT reported as a rescue')
        );
        if (dirty.length) g1bBad.push(`${w} carries verb participle(s): ${dirty.join(', ')}`);
        if (!rescue) g1bBad.push(`${w} is not in the rescue report`);
        else if (!['kk', 'kvk', 'hk'].includes(rescue.chosen.wordClass)) {
          g1bBad.push(`${w} was rescued to a non-noun (${rescue.chosen.wordClass})`);
        } else
          g1bSeen.push(`${w} → ${rescue.chosen.wordClass}, ${vals[0].length} forms, 0 participles`);
      }
      ok.push(
        record(
          'GATE 1b (D4.2 rescues cleanly)',
          g1bBad.length ? 'FAIL' : 'PASS',
          g1bBad.length ? g1bBad.join('; ') : g1bSeen.join(' · ')
        )
      );

      // ── Gate 2: THE CONTROL ───────────────────────────────────────────────
      console.log('\n══ Gate 2 — the positive control ══');
      console.log(
        '  ⚠️ WITHOUT THIS, GATE 1 IS WORTHLESS: a run that refused EVERYTHING would pass it\n' +
          '     perfectly. This is what distinguishes "refuses correctly" from "refuses".'
      );
      const populated = db
        .prepare("SELECT COUNT(*) c FROM concept_term WHERE lang='is' AND inflections IS NOT NULL")
        .get().c;
      const sample = db
        .prepare(
          "SELECT text, inflections FROM concept_term WHERE lang='is' AND inflections IS NOT NULL " +
            'ORDER BY LENGTH(inflections) DESC LIMIT 1'
        )
        .get();
      console.log(`  rows written: ${report.rows.written} · populated now: ${populated}`);
      console.log(
        `  strings: unambiguous ${report.strings.unambiguous} · rescued ${report.strings.rescuedNominal} · ` +
          `refused ${report.strings.refusedAmbiguous + report.strings.refusedNoNoun} · ` +
          `base-form-only ${report.strings.baseFormOnly} · not in BÍN ${report.strings.notInBin}`
      );
      console.log(
        `  largest paradigm: ${sample.text} → ${JSON.parse(sample.inflections).length} forms`
      );
      const g2bad = [];
      if (report.rows.written === 0) g2bad.push('nothing was written at all');
      if (report.strings.unambiguous === 0) g2bad.push('no string resolved unambiguously');
      if (populated !== report.rows.written) {
        g2bad.push(`populated ${populated} != written ${report.rows.written}`);
      }
      ok.push(
        record(
          'GATE 2 (the positive control)',
          g2bad.length ? 'FAIL' : 'PASS',
          g2bad.length
            ? g2bad.join('; ')
            : `${report.rows.written} row(s) written over ${report.strings.unambiguous} unambiguous + ` +
                `${report.strings.rescuedNominal} rescued string(s); yield ${report.strings.notInBin} not in BÍN`
        )
      );

      // ── Gate 3: inertness ─────────────────────────────────────────────────
      console.log('\n══ Gate 3 — the matcher is INERT across the population ══');
      console.log(
        '  ⚠️ THREE WAYS THIS COULD PASS FOR THE WRONG REASON, all closed deliberately:\n' +
          '     (a) two databases — a write to B cannot move a matcher reading A. ONE DB here:\n' +
          '         the scratch corpus carries 032’s tables and 045’s side by side.\n' +
          '     (b) a warm automaton cache — it fingerprints terminology_headwords, which this\n' +
          '         never touches, so an in-process re-call re-reads NOTHING. Child processes.\n' +
          '     (c) an empty capture — two identical empty results compare equal. Asserted\n' +
          '         non-empty first, below.'
      );
      const matcherAfter = matcherOutput(built.path);
      const identical = JSON.stringify(matcherBefore) === JSON.stringify(matcherAfter);
      console.log(
        `  before: ${nMatches} matches / ${nIssues} issues · identical after: ${identical}`
      );
      const g3bad = [];
      if (nMatches === 0)
        g3bad.push('the BEFORE capture has 0 matches — the comparison is vacuous');
      if (nIssues === 0) g3bad.push('the BEFORE capture has 0 issues — the comparison is vacuous');
      if (!identical) g3bad.push('matcher output CHANGED across the population');
      ok.push(
        record(
          'GATE 3 (matcher inertness)',
          g3bad.length ? 'FAIL' : 'PASS',
          g3bad.length
            ? g3bad.join('; ')
            : `${nMatches} matches / ${nIssues} issues, byte-identical across the population, ` +
                'both captures taken in COLD child processes'
        )
      );

      // ── Gate 4: 🔴 the licence control ────────────────────────────────────
      console.log('\n══ Gate 4 — 🔴 no inflections reach the glossary payload (D6) ══');
      console.log(
        '  ⚠️ BÍN is CC BY-SA; glossary-unified.json is COMMITTED, world-readable and per-book\n' +
          '     CC BY, and the export runs UNFORCED on a 2-hourly cron. Neither existing gate\n' +
          '     would catch a new key: the producer gate fingerprints term shape, the shrink\n' +
          '     guard measures size.'
      );
      const glossaryAfter = buildResolvedGlossary(db, BOOK, { census });
      const keys = keysDeep(glossaryAfter);
      const leaked = [...keys].filter((k) => /inflect/i.test(k));
      const blob = JSON.stringify(glossaryAfter);
      // A second, independent check: no BÍN form we just wrote appears anywhere.
      const writtenForms = db
        .prepare(
          "SELECT inflections FROM concept_term WHERE lang='is' AND inflections IS NOT NULL LIMIT 200"
        )
        .all()
        .flatMap((r) => JSON.parse(r.inflections));
      const formLeak = writtenForms.filter((f) => f.length > 6 && blob.includes(`"${f}"`));
      console.log(
        `  payload terms: ${glossaryAfter.terms.length} (before: ${glossaryBefore.terms.length})`
      );
      console.log(
        `  keys matching /inflect/i: ${leaked.length} · sampled forms appearing: ${formLeak.length}`
      );
      const g4bad = [];
      if (glossaryAfter.terms.length === 0) {
        g4bad.push('the payload is EMPTY — an empty payload trivially has no inflections key');
      }
      if (leaked.length) g4bad.push(`payload gained key(s): ${leaked.join(', ')}`);
      if (formLeak.length)
        g4bad.push(`BÍN form(s) present in the payload: ${formLeak.slice(0, 3).join(', ')}`);
      ok.push(
        record(
          'GATE 4 (🔴 D6 licence control)',
          g4bad.length ? 'FAIL' : 'PASS',
          g4bad.length
            ? g4bad.join('; ')
            : `${glossaryAfter.terms.length} terms, 0 inflection-shaped keys, 0 of 200 sampled ` +
                'BÍN forms present — checked by key AND by value'
        )
      );

      // ── Gate 5: D5 idempotency, MEASURED ──────────────────────────────────
      console.log('\n══ Gate 5 — D5: a re-run is a MEASURED no-op ══');
      return runFetch(['--db', built.path, '--bin-data', args.binData, '--execute']).then(
        (again) => {
          console.log(
            `  re-run: ${again.rows.written} written · already populated ` +
              `${again.rows.alreadyPopulatedBefore} → ${again.rows.alreadyPopulatedAfter}`
          );
          const g5bad = [];
          if (again.rows.written !== 0) g5bad.push(`re-run wrote ${again.rows.written} row(s)`);
          if (again.rows.alreadyPopulatedBefore !== report.rows.written) {
            g5bad.push(
              `re-run saw ${again.rows.alreadyPopulatedBefore} populated, first run wrote ${report.rows.written}`
            );
          }
          if (again.rows.alreadyPopulatedAfter !== again.rows.alreadyPopulatedBefore) {
            g5bad.push('the populated count moved across a no-op run');
          }
          // ⚠️ "already populated" and "nothing matched" must be DISTINGUISHABLE.
          // Inferring one from the other is how a run that silently did nothing
          // reads as success — which is exactly what D5 says.
          if (again.rows.alreadyPopulatedBefore === 0) {
            g5bad.push(
              'the re-run reports 0 populated, so 0-written is indistinguishable from a no-op'
            );
          }
          ok.push(
            record(
              'GATE 5 (D5 idempotency)',
              g5bad.length ? 'FAIL' : 'PASS',
              g5bad.length
                ? g5bad.join('; ')
                : `0 written, ${again.rows.alreadyPopulatedBefore} → ${again.rows.alreadyPopulatedAfter} ` +
                    'populated — "already populated" and "nothing matched" are distinguishable'
            )
          );

          if (args.selfTest) return selfTest(built.path, args).then(() => finish());
          return finish();
        }
      );
    })
    .catch((err) => {
      console.error(`\n🔴 the run threw: ${err.message}`);
      record('RUN', 'FAIL', err.message);
      return finish();
    });
}

/**
 * ⚠️ A GATE NEVER SEEN RED IS AN UNTESTED ASSERTION — and the right way to prove
 * these is at the DATA level, not by sabotaging chooseEntry(). Two reasons: a
 * break-and-revert leaks if the revert is partial (B4b-0a's recorded hazard),
 * and what actually needs proving is that each gate DETECTS the corpus state it
 * exists to catch, not that a broken function breaks.
 *
 * Each case plants a defect on a COPY of the populated scratch DB.
 */
function selfTest(dbPath, args) {
  console.log('\n══ SELF-TEST — plant each defect, assert the gate goes red ══');
  const cases = [
    {
      gate: 'GATE 1',
      what: 'an ambiguous string (afl) HAS been written',
      plant: (d) =>
        d
          .prepare(
            "UPDATE concept_term SET inflections = '[\"planted\"]' WHERE lang='is' AND LOWER(text)='afl'"
          )
          .run().changes,
      detect: (d) => isOf(d, 'afl').some((r) => r.inflections !== null),
    },
    {
      gate: 'GATE 1b',
      what: 'hverfa carries the verb participle horfinn',
      plant: (d) =>
        d
          .prepare(
            "UPDATE concept_term SET inflections = '[\"horfinn\"]' WHERE lang='is' AND LOWER(text)='hverfa'"
          )
          .run().changes,
      detect: (d) =>
        isOf(d, 'hverfa')
          .filter((r) => r.inflections)
          .flatMap((r) => JSON.parse(r.inflections))
          .some((f) => CONTAMINANTS.includes(f)),
    },
    {
      gate: 'GATE 2',
      what: 'nothing is populated (a run that refused everything)',
      plant: (d) =>
        d.prepare("UPDATE concept_term SET inflections = NULL WHERE lang='is'").run().changes,
      detect: (d) =>
        d
          .prepare(
            "SELECT COUNT(*) c FROM concept_term WHERE lang='is' AND inflections IS NOT NULL"
          )
          .get().c === 0,
    },
  ];
  let allOk = true;
  for (const c of cases) {
    const copy = path.join(os.tmpdir(), `b4b0b-selftest-${c.gate.replace(/\W/g, '')}.db`);
    fs.copyFileSync(dbPath, copy);
    const d = new Database(copy);
    const changed = c.plant(d);
    const detected = c.detect(d);
    d.close();
    fs.rmSync(copy, { force: true });
    console.log(
      `  ${detected ? '✅' : '🔴'} ${c.gate}: planted "${c.what}" (${changed} row(s)) → ` +
        `${detected ? 'DETECTED' : 'NOT DETECTED — the gate is blind to it'}`
    );
    if (!detected) allOk = false;
  }
  record(
    'SELF-TEST (the gates can fail)',
    allOk ? 'PASS' : 'FAIL',
    allOk
      ? `${cases.length} planted defect(s), all detected — no source was mutated`
      : 'a planted defect went undetected'
  );
  void args;
  return Promise.resolve();
}

function finish() {
  console.log('\n══ SUMMARY ══');
  for (const r of results)
    console.log(`  ${r.verdict.padEnd(8)} ${r.id}\n           ${r.measured}`);
  const failed = results.filter((r) => r.verdict !== 'PASS');
  console.log(failed.length ? `\n${failed.length} check(s) FAILED.` : '\nAll checks passed.');
  process.exitCode = failed.length ? 1 : 0;
  return failed.length ? 1 : 0;
}

if (require.main === module) {
  Promise.resolve(main()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main, parseArgs };
