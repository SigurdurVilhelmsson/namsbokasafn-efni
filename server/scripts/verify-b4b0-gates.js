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
 * ⚠️ GATE 3 WAS HALF-RETIRED 2026-08-11 (§C36 B4b-1 Task 7). Its matcher-identity
 * half became a TAUTOLOGY when B4b-1 cut findTermsInSegments over to the concept
 * model, and it is GONE rather than left green. What remains — the old-table
 * inflections digest — is the half that still measures D1, and it now has a
 * --self-test case, which it never had. See the gate for the full rationale.
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
const NOUN_CLASSES = ['kk', 'kvk', 'hk'];

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
 * Every object KEY anywhere in a payload — NOT its values.
 *
 * ⚠️ The name and an earlier docstring ("every string value anywhere") both
 * overstated this, which mattered: a reviewer auditing the D6 control would
 * conclude the payload's VALUES had been scanned for BÍN forms and skip the one
 * check that actually does that. Gate 4 pairs this with an explicit value scan;
 * neither half covers the other.
 */
function valuesDeep(v, acc = new Set()) {
  if (typeof v === 'string') acc.add(v);
  else if (Array.isArray(v)) v.forEach((x) => valuesDeep(x, acc));
  else if (v && typeof v === 'object') for (const x of Object.values(v)) valuesDeep(x, acc);
  return acc;
}

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

/**
 * A digest of `terminology_translations.inflections` — the D1 half of gate 3.
 *
 * ⚠️ THIS EXISTS BECAUSE THE MATCHER COMPARISON ALONE HAS A MEASURED HOLE, and
 * the hole is exactly this project's commonest error: a measurement generalised
 * one step past its coverage.
 *
 * Probed 2026-08-10, both directions, on a seeded scratch DB:
 *  - Planting an inflection that OCCURS in a fixture segment's Icelandic text
 *    cleared a `missing` issue (7 → 6). So the matcher genuinely does read this
 *    column, and the comparison is NOT vacuous.
 *  - But planting `["gervibeyging"]` on 324 old-table rows — a form occurring
 *    nowhere in the 24 fixture segments — left the matcher output BYTE-IDENTICAL.
 *
 * So a D1 violation (the run writing to the old table instead of concept_term)
 * is caught by the matcher comparison ONLY IF a written form happens to appear in
 * those 24 segments. This digest closes that gap completely and cheaply: the
 * column is asserted unchanged whatever the forms are.
 */
function oldInflectionsDigest(db) {
  const rows = db.prepare('SELECT id, inflections FROM terminology_translations ORDER BY id').all();
  const h = crypto.createHash('sha256');
  let nonNull = 0;
  for (const r of rows) {
    if (r.inflections !== null) nonNull++;
    h.update(`${r.id} ${r.inflections === null ? '' : r.inflections} `);
  }
  return { digest: h.digest('hex').slice(0, 16), nonNull, rows: rows.length };
}

/**
 * GATE 3, the surviving half — D1: the BÍN population must not write the OLD table.
 *
 * ⚠️ HALF OF THIS GATE WAS RETIRED, NOT REPAIRED, AND THAT WAS A DELIBERATE CALL
 * (§C36 B4b-1 Task 7, 2026-08-11). It used to ALSO compare findTermsInSegments
 * output byte-for-byte across the population. B4b-1 cut that function over to the
 * concept model — it reads `concept_term` exclusively and never touches
 * `terminology_headwords`/`terminology_translations` — so the comparison became a
 * TAUTOLOGY: the gate seeds the OLD tables, and the matcher no longer depends on
 * what it seeds, making the two captures trivially identical whatever the
 * population did. Rebuilding it against the concept model would duplicate
 * verify-b4b1-gates.js gates 5 and 7, which measure that properly. A tautology
 * left running is worse than no gate: it reports PASS and reads as evidence.
 *
 * ⚠️ THE DIGEST IS THE COMPLETE D1 CHECK, and it always was the load-bearing
 * half. Measured 2026-08-10: planting `["gervibeyging"]` on 324 old-table rows —
 * a form occurring in none of the 24 fixture segments — left the matcher output
 * BYTE-IDENTICAL, so the retired half could only ever catch a violation whose
 * written form happened to land in those segments. The digest asserts the column
 * unchanged whatever the forms are.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{digest:string, nonNull:number, rows:number}} before pre-population capture
 */
function checkGate3(db, before, log = () => {}) {
  const after = oldInflectionsDigest(db);
  log(
    `  old-table digest: ${before.digest} → ${after.digest} ` +
      `(${before.nonNull} → ${after.nonNull} non-null of ${after.rows})`
  );
  const bad = [];
  // ⚠️ Non-vacuity: a digest over ZERO rows is stable for the wrong reason.
  if (after.rows === 0) {
    bad.push('the old table holds 0 rows — the digest is vacuous, seedC24 did not run');
  }
  if (after.digest !== before.digest) {
    bad.push(
      'D1 VIOLATION: terminology_translations.inflections changed ' +
        `(${before.digest} -> ${after.digest}) — the run wrote to the OLD table`
    );
  }
  return {
    ok: bad.length === 0,
    measured: bad.length
      ? bad.join('; ')
      : `the old table's inflections column is unchanged across the population ` +
        `(digest ${after.digest}, ${after.nonNull}/${after.rows} non-null) — the complete D1 ` +
        'check, and the only half of this gate that still measures anything',
  };
}

function isOf(db, text) {
  return db
    .prepare("SELECT id, text, inflections FROM concept_term WHERE lang='is' AND LOWER(text)=?")
    .all(text);
}

/**
 * ⚠️ GATES 1, 1b AND 2 ARE FUNCTIONS SO THAT --self-test CAN INVOKE THE REAL
 * ONE. The first version of this script inlined them in main() and gave
 * --self-test its own hand-written `detect` predicate alongside each planted
 * defect. That instrument could not observe a blind gate: deleting gate 1's
 * assertion left it reporting PASS on a D4 violation while the self-test still
 * printed "DETECTED", because the self-test was checking its own predicate, not
 * the gate. Its GATE 2 case was worse — a tautology (`plant inflections=NULL`,
 * then `assert nothing is populated`) that holds on every input, including a
 * corpus where the population had never run at all.
 *
 * That is exactly the failure this script exists to prevent, committed inside
 * the mechanism written to prevent it: a check that passes for the wrong reason.
 * Each takes (db, report) and returns {ok, measured}, so main() and --self-test
 * exercise the SAME code and a weakened assertion is caught in both.
 * (Whole-branch review, 2026-08-10.)
 */
function checkGate1(db, report, log = () => {}) {
  const aflRows = isOf(db, 'afl');
  const aflRefusal = report.refusals.find((r) => r.text === 'afl');
  const written = aflRows.filter((r) => r.inflections !== null);
  log(`  afl: ${aflRows.length} concept_term row(s), ${written.length} populated`);
  if (aflRefusal) {
    log(
      `  reported as ${aflRefusal.outcome}: ` +
        aflRefusal.entries.map((e) => `${e.wordClass}#${e.binId}`).join(' ')
    );
  }
  const bad = [];
  if (written.length) bad.push(`${written.length} afl row(s) were written`);
  if (!aflRefusal) bad.push('afl is not in the refusal report');
  else if (aflRefusal.entries.length < 2) bad.push('afl’s refusal names fewer than 2 entries');
  return {
    ok: bad.length === 0,
    measured: bad.length
      ? bad.join('; ')
      : `afl unwritten across ${aflRows.length} row(s), named with ` +
        `${aflRefusal.entries.length} contending entries ` +
        `(${aflRefusal.entries.map((e) => e.wordClass).join('+')})`,
  };
}

function checkGate1b(db, report, log = () => {}) {
  const bad = [];
  const seen = [];
  for (const w of ['hverfa', 'vinna']) {
    const rows = isOf(db, w);
    const rescue = report.rescues.find((r) => r.text === w);
    const vals = rows.filter((r) => r.inflections !== null).map((r) => JSON.parse(r.inflections));
    if (!vals.length) {
      bad.push(`${w} was not written at all`);
      continue;
    }
    const dirty = vals.flat().filter((f) => CONTAMINANTS.includes(f));
    log(
      `  ${w}: ${rows.length} row(s), ${vals.length} written, ${vals[0].length} forms · ` +
        (rescue
          ? `chose ${rescue.chosen.wordClass}#${rescue.chosen.binId}`
          : 'NOT reported as a rescue')
    );
    if (dirty.length) bad.push(`${w} carries verb participle(s): ${dirty.join(', ')}`);
    if (!rescue) bad.push(`${w} is not in the rescue report`);
    else if (!NOUN_CLASSES.includes(rescue.chosen.wordClass)) {
      bad.push(`${w} was rescued to a non-noun (${rescue.chosen.wordClass})`);
    } else seen.push(`${w} → ${rescue.chosen.wordClass}, ${vals[0].length} forms, 0 participles`);
  }
  return { ok: bad.length === 0, measured: bad.length ? bad.join('; ') : seen.join(' · ') };
}

function checkGate2(db, report, log = () => {}) {
  const populated = db
    .prepare("SELECT COUNT(*) c FROM concept_term WHERE lang='is' AND inflections IS NOT NULL")
    .get().c;
  const sample = db
    .prepare(
      "SELECT text, inflections FROM concept_term WHERE lang='is' AND inflections IS NOT NULL " +
        'ORDER BY LENGTH(inflections) DESC LIMIT 1'
    )
    .get();
  log(`  rows written: ${report.rows.written} · populated now: ${populated}`);
  log(
    `  strings: unambiguous ${report.strings.unambiguous} · rescued ${report.strings.rescuedNominal} · ` +
      `refused ${report.strings.refusedAmbiguous + report.strings.refusedNoNoun} · ` +
      `base-form-only ${report.strings.baseFormOnly} · not in BÍN ${report.strings.notInBin}`
  );
  if (sample)
    log(`  largest paradigm: ${sample.text} → ${JSON.parse(sample.inflections).length} forms`);
  const bad = [];
  if (report.rows.written === 0) bad.push('nothing was written at all');
  if (report.strings.unambiguous === 0) bad.push('no string resolved unambiguously');
  if (populated !== report.rows.written)
    bad.push(`populated ${populated} != written ${report.rows.written}`);
  return {
    ok: bad.length === 0,
    measured: bad.length
      ? bad.join('; ')
      : `${report.rows.written} row(s) written over ${report.strings.unambiguous} unambiguous + ` +
        `${report.strings.rescuedNominal} rescued string(s); yield ${report.strings.notInBin} not in BÍN`,
  };
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
  const oldTableBefore = oldInflectionsDigest(db);
  console.log(
    `  old-table inflections digest: ${oldTableBefore.digest} (${oldTableBefore.nonNull} non-null)`
  );

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
      const g1 = checkGate1(db, report, console.log);
      ok.push(record('GATE 1 (D4 refuses the ambiguous)', g1.ok ? 'PASS' : 'FAIL', g1.measured));

      // ── Gate 1b: hverfa and vinna are rescued, asserted by IDENTITY ────────
      console.log('\n══ Gate 1b — D4.2 rescues, and the paradigm is CLEAN ══');
      console.log(
        '  ⚠️ This gate did not exist until D4.2 was adopted, and the spec table asserted the\n' +
          '     OPPOSITE — that all three were refused. A gate written against a superseded\n' +
          '     decision passes or fails for reasons unconnected to the code.'
      );
      const g1b = checkGate1b(db, report, console.log);
      ok.push(record('GATE 1b (D4.2 rescues cleanly)', g1b.ok ? 'PASS' : 'FAIL', g1b.measured));

      // ── Gate 2: THE CONTROL ───────────────────────────────────────────────
      console.log('\n══ Gate 2 — the positive control ══');
      console.log(
        '  ⚠️ WITHOUT THIS, GATE 1 IS WORTHLESS: a run that refused EVERYTHING would pass it\n' +
          '     perfectly. This is what distinguishes "refuses correctly" from "refuses".'
      );
      const g2 = checkGate2(db, report, console.log);
      ok.push(record('GATE 2 (the positive control)', g2.ok ? 'PASS' : 'FAIL', g2.measured));

      // ── Gate 3: D1 — the population does not write the OLD tables ──────────
      console.log('\n══ Gate 3 — D1: the population does NOT write the old tables ══');
      console.log(
        '  ⚠️ HALF-RETIRED 2026-08-11 (B4b-1 Task 7). This gate used to also compare\n' +
          '     findTermsInSegments output across the population. That half is DELETED, not\n' +
          '     left green: the matcher now reads concept_term exclusively, so comparing it\n' +
          '     either side of a write to the OLD tables was a tautology. The digest below is\n' +
          '     what still measures D1 — and it is the half that was always load-bearing.'
      );
      const g3 = checkGate3(db, oldTableBefore, console.log);
      ok.push(
        record(
          'GATE 3 (D1: the population does not write the old tables)',
          g3.ok ? 'PASS' : 'FAIL',
          g3.measured
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
      // ── ⚠️ THE VALUE HALF WAS REDESIGNED 2026-08-10, BECAUSE THE FIRST TWO
      //    VERSIONS BOTH TESTED THE WRONG PROPERTY.
      //
      //    v1 sampled `LIMIT 200` ROWS, flat-mapped them to thousands of FORMS,
      //    then silently dropped everything <=6 chars — and reported "0 of 200
      //    sampled forms", a number describing none of that.
      //
      //    v2 fixed the unit and compared every written form against every
      //    payload string value. It FAILED with 61 hits — and every one was a
      //    FALSE POSITIVE: `afstæði` is an inflected form of one word AND a
      //    legitimate Icelandic term in its own right, so it appears in the
      //    payload as a TERM TEXT. String coincidence is not leakage.
      //
      //    The leak D6 actually forbids is a PARADIGM TRAVELLING. So test
      //    provenance and shape, not coincidence:
      //      (a) every term object's key set is EXACTLY the expected one — this
      //          catches a leak under ANY new key, which the /inflect/i regex
      //          alone would miss;
      //      (b) no stored paradigm's raw JSON appears in the serialised payload;
      //      (c) every `alternatives` entry is a real concept_term text — the one
      //          array in the payload, and the only place a widened field could
      //          smuggle forms in.
      const TERM_KEYS = [
        'alternatives',
        'conceptId',
        'domain',
        'english',
        'icelandic',
        'position',
        'reason',
        'status',
      ].join(',');
      const badShape = glossaryAfter.terms.filter(
        (t) => Object.keys(t).sort().join(',') !== TERM_KEYS
      );
      const blob = JSON.stringify(glossaryAfter);
      const paradigmRows = db
        .prepare(
          "SELECT inflections FROM concept_term WHERE lang='is' AND inflections IS NOT NULL LIMIT 5000"
        )
        .all();
      const rawParadigmLeak = paradigmRows.filter((r) => blob.includes(r.inflections));
      const knownTexts = new Set(
        db
          .prepare("SELECT text FROM concept_term WHERE lang='is'")
          .all()
          .map((r) => r.text)
      );
      const altLeak = glossaryAfter.terms
        .flatMap((t) => t.alternatives || [])
        .filter((a) => !knownTexts.has(a));
      console.log(
        `  payload terms: ${glossaryAfter.terms.length} (before: ${glossaryBefore.terms.length}) · ` +
          `${valuesDeep(glossaryAfter).size} distinct string values`
      );
      console.log(
        `  keys matching /inflect/i: ${leaked.length}\n` +
          `  term objects whose key set differs from the expected ${TERM_KEYS.split(',').length}: ${badShape.length}\n` +
          `  stored paradigms (of ${paradigmRows.length} checked) appearing verbatim: ${rawParadigmLeak.length}\n` +
          `  'alternatives' entries that are NOT a real concept_term text: ${altLeak.length}`
      );
      const g4bad = [];
      if (glossaryAfter.terms.length === 0) {
        g4bad.push('the payload is EMPTY — an empty payload trivially has no inflections key');
      }
      if (leaked.length) g4bad.push(`payload gained key(s): ${leaked.join(', ')}`);
      if (badShape.length)
        g4bad.push(
          `${badShape.length} term object(s) have an unexpected key set — e.g. ` +
            Object.keys(badShape[0]).sort().join(',')
        );
      if (rawParadigmLeak.length)
        g4bad.push(`${rawParadigmLeak.length} stored paradigm(s) appear verbatim in the payload`);
      if (altLeak.length)
        g4bad.push(
          `${altLeak.length} 'alternatives' entr(ies) are not a concept_term text: ` +
            altLeak.slice(0, 3).join(', ')
        );
      ok.push(
        record(
          'GATE 4 (🔴 D6 licence control)',
          g4bad.length ? 'FAIL' : 'PASS',
          g4bad.length
            ? g4bad.join('; ')
            : `${glossaryAfter.terms.length} terms · every term object's key set is exactly ` +
                `the expected ${TERM_KEYS.split(',').length} (so a leak under ANY new name fails) · ` +
                `0 of ${paradigmRows.length} stored paradigms appear verbatim · all ` +
                `'alternatives' entries are real concept_term texts — provenance and shape, ` +
                'not string coincidence'
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

          if (args.selfTest)
            return selfTest(built.path, report, oldTableBefore).then(() => finish());
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
function selfTest(dbPath, report, oldTableBefore) {
  console.log('\n══ SELF-TEST — plant each defect, assert THE GATE ITSELF goes red ══');
  console.log(
    '  ⚠️ THIS CALLS THE REAL GATE FUNCTIONS. The first version evaluated a\n' +
      '     hand-written predicate written beside each plant, which could not observe a\n' +
      '     BLIND gate: deleting gate 1’s assertion left it reporting PASS on a D4\n' +
      '     violation while the self-test still printed DETECTED. And its GATE 2 case was\n' +
      '     a tautology — plant "nothing is populated", assert "nothing is populated" —\n' +
      '     true on every input, including a corpus where the population never ran.\n' +
      '     A check that passes for the wrong reason, inside the instrument built to\n' +
      '     catch exactly that. (Whole-branch review, 2026-08-10.)'
  );
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
      check: checkGate1,
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
      check: checkGate1b,
    },
    {
      // ⚠️ NOT a tautology any more: gate 2 is handed the REAL report from the
      // real run (written > 0) against a wiped database, so it fails on
      // `populated != written` — the discrepancy a run that refused everything
      // would produce. The old version asserted only that the plant took effect.
      gate: 'GATE 2',
      what: 'nothing is populated (a run that refused everything)',
      plant: (d) =>
        d.prepare("UPDATE concept_term SET inflections = NULL WHERE lang='is'").run().changes,
      check: checkGate2,
    },
    {
      // ⚠️ THIS CASE DID NOT EXIST BEFORE 2026-08-11. Gate 3 shipped, was later
      // found half-tautological, and had NEVER been seen red — relabelling it
      // without a failing control would have left exactly that gap in place.
      gate: 'GATE 3',
      what: 'terminology_translations.inflections is written (a D1 violation)',
      plant: (d) =>
        d
          .prepare(
            'UPDATE terminology_translations SET inflections = \'["gervibeyging"]\' WHERE id IN (SELECT id FROM terminology_translations LIMIT 5)'
          )
          .run().changes,
      check: (d) => checkGate3(d, oldTableBefore, () => {}),
    },
  ];
  let allOk = true;
  for (const c of cases) {
    const copy = path.join(os.tmpdir(), `b4b0b-selftest-${c.gate.replace(/\W/g, '')}.db`);
    fs.copyFileSync(dbPath, copy);
    const d = new Database(copy);
    const changed = c.plant(d);
    // THE REAL GATE, on the planted database, with the real run's report.
    const verdict = c.check(d, report);
    d.close();
    fs.rmSync(copy, { force: true });
    const detected = verdict.ok === false;
    console.log(
      `  ${detected ? '✅' : '🔴'} ${c.gate}: planted "${c.what}" (${changed} row(s)) → ` +
        (detected
          ? `the gate FAILED as required — ${verdict.measured}`
          : 'THE GATE STILL PASSED — it is blind to this')
    );
    if (!detected) allOk = false;
  }
  record(
    'SELF-TEST (the gates can fail)',
    allOk ? 'PASS' : 'FAIL',
    allOk
      ? `${cases.length} planted defect(s), each caught by THE GATE'S OWN assertion — no source mutated`
      : 'a planted defect left its gate passing — that gate is blind'
  );
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
