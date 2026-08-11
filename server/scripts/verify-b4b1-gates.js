// server/scripts/verify-b4b1-gates.js
'use strict';
/**
 * §C36 B4b-1 acceptance gate (spec §7.4) — the corpus properties no unit test
 * can express, measured on a real corpus.
 *
 * ONE COMMAND, re-runnable by anyone holding the raw fetch:
 *
 *   node server/scripts/verify-b4b1-gates.js [--corpus ~/idordabanki-raw-2026-08-07] [--self-test]
 *
 * It builds its OWN scratch database via server/scripts/lib/scratchCorpus.js —
 * every migration against an empty file, then the 20-collection Íðorðabankinn
 * import. It never opens `pipeline-output/sessions.db`, never touches
 * production, and reads the raw fetch read-only.
 *
 * ⚠️ THREE CAVEATS TRAVEL WITH EVERY NUMBER THIS PRINTS. They are printed by the
 * script too, so they cannot be separated from the evidence:
 *
 *  1. THIS IS A RECONSTRUCTION, NOT PRODUCTION'S DATABASE. Gate 1 is what turns
 *     that from a disclaimer into a measurement: the rebuild reproduces §C36 B2's
 *     recorded totals exactly, or the run STOPS before any other gate.
 *  2. `efnafraedi-2e` IS REGISTERED BY seedBooks, not by the admin route
 *     (register §C35).
 *  3. 🔴 NO OLD-MODEL ARM EXISTS LOCALLY, AND IT CANNOT BE CONJURED. The concept
 *     import writes nothing to `terminology_headwords` (measured: 0 rows in the
 *     scratch corpus), the dev DB holds 6, and Task 4 DELETED the old matcher —
 *     so "old vs new" cannot be run, only compared against a recorded capture.
 *     Gates 2 and 3 are therefore FIXTURE-SCALE and say so in their own labels.
 *
 * ── WHY EVERY DERIVED COUNT BELOW IS PINNED EXACTLY ──────────────────────────
 *
 * Gate 1 pins the corpus. A pinned corpus makes every count derived from it
 * DETERMINISTIC, so each one is pinned exactly rather than compared against a
 * hand-picked threshold: a threshold answers "is it roughly right?", a pin
 * answers "did anything move?", and only the second is a finding. If the corpus
 * ever changes, gate 1 stops the run before any of these can mislead.
 *
 * ⚠️ PINNING IS NOT "ASSERTING THE FOLDS AGREE" — see gate 4. Register §C47 is
 * explicit that a gate written as "assert the three folds agree" FAILS ON REAL
 * DATA on day one (157 EN strings genuinely collide, semantically: AC/Ac/ac is
 * actinium / alternating current). Gate 4 pins the MEASURED reality, including
 * the collisions, and reports them. It does not normalise, and it must not be
 * "fixed" by making `nocaseKey` Unicode-aware — that re-opens §C18.
 *
 * Exit codes: 0 every gate passed · 1 a gate failed · 2 usage or environment.
 * An INCONCLUSIVE gate (gate 3) does NOT affect the exit code, by design.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const { buildCorpusDb, seedBooks } = require('./lib/scratchCorpus');
const { foldString } = require('../lib/caseFold');
const { PLACEHOLDER_TEXT } = require('../lib/conceptMatcher');

const SERVER_DIR = path.join(__dirname, '..');
const FIXTURES = path.join(SERVER_DIR, '__tests__', 'fixtures');
const DEFAULT_CORPUS = path.join(os.homedir(), 'idordabanki-raw-2026-08-07');
const BOOK = 'efnafraedi-2e';

/**
 * Recorded figures from §C36 B2 — numbers to REPRODUCE, not constants to update.
 * → test-results/b2-prod-population-2026-08.md
 */
const RECORDED = { concepts: 70187, terms: 192189 };

/**
 * Gate 2 — the c24 fixture against the corpus. FIXTURE SCALE (§7.4 note 3).
 *
 * ⚠️ 316 headwords, 304 DISTINCT. The 12 repeats all carry `pos = NULL` on BOTH
 * copies — measured, not assumed — and `UNIQUE(english, pos)` does not stop them
 * because SQLite treats NULLs as distinct inside a UNIQUE index (there is a
 * comment saying exactly that above terminologyService.upsertHeadword). The
 * concept model's `GROUP BY text` has no `pos` at all, so the cut-over COLLAPSES
 * those 12 — a real, non-tier-contaminated EN-coverage consequence.
 */
const C24 = { headwords: 316, distinctEnglish: 304, presentInCorpus: 254 };

/**
 * Gate 4 — the three EN/IS identities, pinned as measured.
 *
 * `groups`/`merged`: distinct binary strings that share ONE folded keyword, so
 * the automaton merges them. `disagree`: strings that collide under one fold but
 * NOT the other — the D4.1 property. It is 0 on BOTH sides today, which is what
 * makes the planted Ångström pair a clean detector.
 *
 * ⚠️ `toLowerDiffers` — strings where JS `toLowerCase()` differs from an
 * ASCII-only fold — is 0 on the EN side and 28 on the IS side. SAY BOTH IN THE
 * SAME BREATH: the ASCII-vs-Unicode rule stands, but this corpus offers NO
 * counter-example on the EN side, so an EN-only measurement would imply a
 * coverage it does not have. The 28 IS strings are live evidence FOR keeping
 * `nocaseKey` ASCII-only, not against it.
 */
const FOLD_EN = { distinct: 61042, groups: 157, merged: 318, disagree: 0, toLowerDiffers: 0 };
const FOLD_IS = { distinct: 70118, groups: 15, merged: 30, disagree: 0, toLowerDiffers: 28 };

/** Gate 6 — D7. All 201 placeholder concepts are `biology`, i.e. IN efnafraedi-2e's chain. */
const VANTAR_CONCEPTS = 201;
const G6 = {
  placeholder: 'ectomesenchyme', // carried by exactly ONE concept, and it is a [vantar] concept
  control: 'acid anhydride', // chemistry, single concept — the positive control
  controlIs: 'sýruanhýdríð',
};

/**
 * Gate 7 — a SYNTHETIC concept, planted at runtime.
 *
 * 🔴 NO BÍN BYTES ARE COMMITTED BY THIS FILE. `zzqxfrumefnum` is an invented
 * string, not a BÍN-derived inflected form; the corpus's own paradigms are all
 * NULL on a fresh scratch build (measured: `inflections IS NOT NULL` = 0), so a
 * paradigm HAS to be planted for this path to be reachable at all.
 *
 * ⚠️ EXACTLY ONE ICELANDIC TERM, DELIBERATELY. After `matchesForm(winner)` fails,
 * findTermsInSegments tries `alts` (cross-concept) and then the concept's OWN
 * other Icelandic terms; with a second term present the paradigm-removed control
 * would emit `alternative` instead of `missing` and the gate would fail for the
 * wrong reason.
 *
 * ⚠️ The declined form is NOT a superstring of the base form. A genitive `-s`
 * would also exercise wholeWordRegex's boundary handling, mixing a second
 * property into a gate that is about the paradigm path alone.
 */
const G7 = {
  domain: 'chemistry', // position 1 in efnafraedi-2e's chain, so never a fallback
  english: 'zzqx gate term', // 0 rows in the corpus — verified before planting
  base: 'zzqxfrumefni',
  declined: 'zzqxfrumefnum',
  enContent: 'Here the zzqx gate term appears in the text.',
  get isContent() {
    return `Hér birtist ${this.declined} í textanum.`;
  },
};

/**
 * Gate 8 — D4.2, and the case that DISCRIMINATES.
 *
 * ⚠️ `absolute zero` was the obvious candidate and is USELESS here: all four of
 * its concepts carry the Icelandic head form `alkul`, so the winner's TEXT is the
 * same whichever concept wins and the assertion could not fail. `adiabatic`'s
 * lowest-id concept is physics (`óverminn`) while domain priority picks chemistry
 * (`jafnvarma`) — so arrival order and resolve() give VISIBLY different answers.
 */
const G8 = {
  english: 'adiabatic',
  expectWinner: 'jafnvarma',
  expectDomain: 'chemistry',
  arrivalOrderWinner: 'óverminn', // what a one-entry-per-ROW design would emit
};

/** Gate 5 — the sentinel the EN mutation writes. Fixed, so --self-test can pre-plant it. */
const G5_SENTINEL = 'zzqx fingerprint sentinel';

const results = [];
function record(id, verdict, measured) {
  results.push({ id, verdict, measured });
  console.log(`\n${verdict}  ${id} — ${measured}`);
  return verdict === 'PASS';
}

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    `Usage: node server/scripts/verify-b4b1-gates.js [--corpus <dir>] [--self-test]

  --corpus <dir>  raw-<COLLECTION>.json files from the Íðorðabankinn fetch
                  (default: ${DEFAULT_CORPUS}). READ ONLY.
  --self-test     plant each defect in the DATA on a COPY of the scratch DB and
                  assert THE GATE ITSELF goes red. A gate never seen failing is
                  an untested assertion.
  -h, --help      this message`
  );
  process.exit(2);
}

/**
 * ⚠️ HAND-ROLLED ON PURPOSE — NOT tools/lib/parseArgs.js, which SILENTLY DROPS
 * UNKNOWN FLAGS (CLAUDE.md § Commands). A misremembered flag there is a no-op,
 * not an error, so a "safe rehearsal" runs at full strength with the defaults.
 */
function parseArgs(argv) {
  const out = { corpus: DEFAULT_CORPUS, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--corpus') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) usage(`${a} expects a value`);
      out.corpus = v;
    } else if (a === '--self-test') out.selfTest = true;
    else if (a === '-h' || a === '--help') usage();
    else usage(`unrecognised argument '${a}'`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Child-process probes
//
// ⚠️ COLD CHILD PROCESSES, NOT IN-PROCESS CALLS. B4b-0b's recorded hazard (b):
// findTermsInSegments memoises the automaton in a module-level `_automatonCache`
// keyed on a fingerprint, so a second in-process call after a DB write can
// re-read NOTHING and byte-identity then holds whatever the run did.
// `SESSIONS_DB_PATH` needs no test injection because terminologyService resolves
// DB_PATH via resolveDbPath() at module load — so a child also exercises the
// PRODUCTION path rather than a test seam.
// ─────────────────────────────────────────────────────────────────────────────

function runChild(dbPath, code) {
  const r = spawnSync(process.execPath, ['-e', code], {
    cwd: SERVER_DIR,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SESSIONS_DB_PATH: dbPath },
  });
  if (r.status !== 0) {
    throw new Error(`child failed (${r.status}): ${(r.stderr || '').trim().slice(0, 800)}`);
  }
  return JSON.parse(r.stdout);
}

/** findTermsInSegments over `segments`, in a cold child, against `dbPath`. */
function childMatcher(dbPath, segments) {
  const segFile = path.join(os.tmpdir(), `b4b1-segs-${process.pid}-${segments.length}.json`);
  fs.writeFileSync(segFile, JSON.stringify(segments));
  try {
    return runChild(
      dbPath,
      `const fs=require('fs');const path=require('path');
       const svc=require(path.join(${JSON.stringify(SERVER_DIR)},'services','terminologyService'));
       const segs=JSON.parse(fs.readFileSync(${JSON.stringify(segFile)},'utf-8'));
       process.stdout.write(JSON.stringify(svc.findTermsInSegments(segs,${JSON.stringify(BOOK)})));`
    );
  } finally {
    fs.rmSync(segFile, { force: true });
  }
}

/**
 * The automaton's SOURCE, observed directly — gate 5's observable.
 *
 * ⚠️ NOT the matcher's output. B4b-0b MEASURED the hole: planting a value that
 * occurs nowhere in the probe segments leaves findTermsInSegments byte-identical,
 * so an output comparison would silently miss most mutations. The fingerprint and
 * the keyword count are what the cache keys on, so they are what gate 5 reads.
 */
function childAutomaton(dbPath) {
  return runChild(
    dbPath,
    `const path=require('path');
     const Database=require(path.join(${JSON.stringify(SERVER_DIR)},'node_modules','better-sqlite3'));
     const {loadEnglishEntries}=require(path.join(${JSON.stringify(SERVER_DIR)},'lib','conceptMatcher'));
     const {buildTermAutomaton}=require(path.join(${JSON.stringify(SERVER_DIR)},'lib','termAutomaton'));
     const db=new Database(${JSON.stringify(dbPath)},{readonly:true});
     const e=loadEnglishEntries(db);
     const a=buildTermAutomaton(e.entries);
     process.stdout.write(JSON.stringify({fingerprint:e.fingerprint,entries:e.entries.length,keywordCount:a.keywordCount}));`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scratch directories this run created, removed by finish().
 *
 * ⚠️ `freshMigratedDb()` builds each database inside its own `/tmp/fresh-clone-*`
 * directory and never removes it. 1,338 of them were already on this box when
 * this script was written, so the leak is PRE-EXISTING and shared with every
 * caller of that helper (including verify-b4b0-gates.js, whose header claims it
 * "deletes it on exit"). Logged to the register rather than fixed here — but this
 * script cleans up after ITSELF, so it does not add two more per run.
 */
const scratchDirs = [];
function trackScratch(dbFile) {
  scratchDirs.push(path.dirname(dbFile));
  return dbFile;
}

let copyCounter = 0;
/**
 * Run `fn(db, copyPath)` against a COPY of `dbPath`, then delete the copy.
 *
 * ⚠️ EVERY MUTATING GATE WORKS ON A COPY. A gate that mutated the shared scratch
 * DB would silently move the numbers every LATER gate measures — and gate 1's
 * fidelity assertion has already run by then, so nothing would catch it.
 */
function withCopy(dbPath, tag, fn) {
  const copy = path.join(os.tmpdir(), `b4b1-${tag}-${process.pid}-${copyCounter++}.db`);
  fs.copyFileSync(dbPath, copy);
  const db = new Database(copy);
  try {
    return fn(db, copy);
  } finally {
    db.close();
    fs.rmSync(copy, { force: true });
  }
}

function openRead(dbPath) {
  return new Database(dbPath, { readonly: true });
}

/** Every string value anywhere in a payload — for the D7 deep scan. */
function stringsDeep(v, acc = []) {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringsDeep(x, acc));
  else if (v && typeof v === 'object') for (const x of Object.values(v)) stringsDeep(x, acc);
  return acc;
}

const nocaseKey = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * The three identities over one language's distinct strings.
 *
 * Returns the MERGE groups (distinct binary strings sharing a folded keyword)
 * and, separately, the DISAGREEMENTS — groups seen by one fold and not the
 * other. Those are different properties and conflating them is how "the folds
 * agree" gets asserted against a corpus where 157 strings genuinely collide.
 */
function foldCensus(db, lang) {
  const texts = db
    .prepare('SELECT DISTINCT text FROM concept_term WHERE lang = ?')
    .all(lang)
    .map((r) => r.text);
  const group = (fn) => {
    const m = new Map();
    for (const t of texts) {
      const k = fn(t);
      const g = m.get(k);
      if (g) g.push(t);
      else m.set(k, [t]);
    }
    return m;
  };
  const signature = (m) =>
    new Set([...m.values()].filter((v) => v.length > 1).map((v) => [...v].sort().join('')));
  const foldGroups = group(foldString);
  const nocGroups = group(nocaseKey);
  const fSig = signature(foldGroups);
  const nSig = signature(nocGroups);
  const disagree = [
    ...[...fSig].filter((x) => !nSig.has(x)),
    ...[...nSig].filter((x) => !fSig.has(x)),
  ];
  const merged = [...foldGroups.values()].filter((v) => v.length > 1);
  return {
    distinct: texts.length,
    groups: merged.length,
    merged: merged.reduce((n, v) => n + v.length, 0),
    disagree: disagree.length,
    disagreeSamples: disagree.slice(0, 5).map((x) => x.split('').join(' / ')),
    samples: merged.slice(0, 5).map((v) => v.join(',')),
    toLowerDiffers: texts.filter((t) => nocaseKey(t) !== t.toLowerCase()).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE GATES
//
// ⚠️ EVERY GATE IS A FUNCTION TAKING A DB PATH AND RETURNING {ok, measured}, SO
// --self-test CAN INVOKE THE REAL ONE. B4b-0b's first self-test hand-wrote a
// predicate beside each planted defect; that instrument could not observe a
// BLIND gate — deleting a gate's assertion left it reporting PASS while the
// self-test still printed DETECTED, and one case was a flat tautology. Sharing
// the function is what makes a weakened assertion fail in both places.
// ─────────────────────────────────────────────────────────────────────────────

/** GATE 1 — corpus fidelity. Every gate below measures THIS database. */
function checkGate1(dbPath, log = () => {}) {
  const db = openRead(dbPath);
  try {
    const concepts = db.prepare('SELECT COUNT(*) c FROM concept').get().c;
    const terms = db.prepare('SELECT COUNT(*) c FROM concept_term').get().c;
    log(`  concept ${concepts} · concept_term ${terms}`);
    const ok = concepts === RECORDED.concepts && terms === RECORDED.terms;
    return {
      ok,
      measured: ok
        ? `rebuild reproduces §C36 B2 exactly: ${concepts} concepts / ${terms} terms`
        : `rebuild is ${concepts}/${terms}, recorded ${RECORDED.concepts}/${RECORDED.terms} — ` +
          'the corpus differs, so NOTHING measured below is attributable to the code',
    };
  } finally {
    db.close();
  }
}

/**
 * GATE 2 — EN coverage, old headwords → `concept_term` EN rows. FIXTURE SCALE.
 *
 * ⚠️ THE PRODUCTION FIGURE IS 20,272/20,272 = 100.00% WITH A 32.15% REVERSE
 * CONTROL, and it is NOT reproducible here: it was measured read-only on prod
 * (spec §3), where the old model has 20,272 headwords. The scratch corpus's
 * `terminology_headwords` is EMPTY, so the only old-model population available
 * locally is the 316-headword c24 fixture. That is 1/64th of the real one and
 * the label says so.
 *
 * The forward/reverse PAIR is what makes this non-vacuous: forward 83.55% against
 * reverse 0.42% means the two sets are genuinely different, so containment is a
 * claim rather than an identity. A broken loadEnglishEntries sends forward to 0.
 */
function checkGate2(dbPath, log = () => {}) {
  const db = openRead(dbPath);
  try {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'c24-terms.json'), 'utf-8'));
    const byEnglish = new Map();
    for (const h of fixture.headwords) {
      const seen = byEnglish.get(h.english);
      if (seen) seen.push(h.pos);
      else byEnglish.set(h.english, [h.pos]);
    }
    const enRows = new Set(
      db
        .prepare("SELECT DISTINCT text FROM concept_term WHERE lang = 'en'")
        .all()
        .map((r) => r.text)
    );
    const distinct = [...byEnglish.keys()];
    const present = distinct.filter((e) => enRows.has(e));
    const missing = distinct.filter((e) => !enRows.has(e));
    const reverse = [...enRows].filter((t) => byEnglish.has(t)).length;
    const dupes = [...byEnglish.entries()].filter(([, p]) => p.length > 1);
    const dupesAllNullPos = dupes.every(([, p]) => p.every((x) => x === null || x === undefined));

    log(
      `  c24 fixture: ${fixture.headwords.length} headwords, ${distinct.length} distinct English`
    );
    log(
      `  forward (fixture → corpus): ${present.length}/${distinct.length} = ` +
        `${((100 * present.length) / distinct.length).toFixed(2)}%`
    );
    log(
      `  reverse (corpus → fixture): ${reverse}/${enRows.size} = ` +
        `${((100 * reverse) / enRows.size).toFixed(4)}%  ← the non-vacuity control`
    );
    log(
      `  duplicated English in the OLD fixture: ${dupes.length}, all pos=NULL: ${dupesAllNullPos}`
    );
    log(`  ALL ${missing.length} miss(es), so a NEW one shows in a diff:`);
    for (const m of missing) log(`     · ${m}`);

    const bad = [];
    if (fixture.headwords.length !== C24.headwords)
      bad.push(`fixture has ${fixture.headwords.length} headwords, pinned ${C24.headwords}`);
    if (distinct.length !== C24.distinctEnglish)
      bad.push(`fixture has ${distinct.length} distinct English, pinned ${C24.distinctEnglish}`);
    if (present.length !== C24.presentInCorpus)
      bad.push(
        `coverage is ${present.length}/${distinct.length}, pinned ${C24.presentInCorpus} — ` +
          'a MOVEMENT, which is a finding either way'
      );
    if (reverse === enRows.size) bad.push('the reverse direction is 100% — the join is vacuous');
    return {
      ok: bad.length === 0,
      measured: bad.length
        ? bad.join('; ')
        : `${present.length}/${distinct.length} (${((100 * present.length) / distinct.length).toFixed(2)}%) ` +
          `of the c24 fixture's distinct English is carried by a concept_term EN row, against a ` +
          `reverse of ${((100 * reverse) / enRows.size).toFixed(2)}% — different sets, so containment is a claim. ` +
          `The cut-over also COLLAPSES ${dupes.length} duplicate old headwords (pos=NULL on both copies, ` +
          `which UNIQUE(english,pos) does not stop); GROUP BY text has no pos`,
    };
  } finally {
    db.close();
  }
}

/**
 * GATE 4 — the three EN identities (D4.1), REPORTED not normalised.
 *
 * ⚠️ REGISTER §C47 BINDS THIS GATE. Written as "assert the three folds agree" it
 * FAILS ON REAL DATA on day one: 157 EN strings collide under a case fold and the
 * collisions are SEMANTIC, not typographic — AC/Ac/ac is actinium vs alternating
 * current, AM/Am is amplitude modulation vs americium. So the collisions are
 * PINNED AND PRINTED, and what is asserted at zero is the narrower D4.1 property:
 * strings that collide under ONE fold and not the other.
 *
 * 🔴 DO NOT CLOSE A FAILURE HERE BY MAKING `nocaseKey` UNICODE-AWARE. Its
 * ASCII-only behaviour must match SQLite's `COLLATE NOCASE` on
 * book_term_preference.english; changing it re-opens §C18. Equally, do NOT make
 * loadEnglishEntries group case-insensitively — that hands
 * conceptResolver.lookupCandidates a string its `text = ?` lookup cannot find.
 */
function checkGate4(dbPath, log = () => {}) {
  const db = openRead(dbPath);
  try {
    const en = foldCensus(db, 'en');
    const is = foldCensus(db, 'is');
    for (const [lang, c, pin] of [
      ['EN', en, FOLD_EN],
      ['IS', is, FOLD_IS],
    ]) {
      log(
        `  ${lang}: ${c.distinct} distinct · ${c.groups} merge group(s) covering ${c.merged} string(s) · ` +
          `${c.disagree} fold-identity disagreement(s) [pinned ${pin.disagree}]`
      );
      log(`     merge samples: ${c.samples.join(' · ')}`);
      log(`     toLowerCase() != ASCII-only fold: ${c.toLowerDiffers} string(s)`);
      if (c.disagree) log(`     🔴 DISAGREEMENTS: ${c.disagreeSamples.join(' · ')}`);
    }
    log(
      '  ⚠️ SCOPE OF THE ASCII-vs-UNICODE NUMBER: 0 on the EN side, 28 on the IS side. The rule\n' +
        '     stands, but THIS CORPUS OFFERS NO EN COUNTER-EXAMPLE — the IS 28 are the live\n' +
        '     evidence for keeping nocaseKey ASCII-only, and an EN-only reading would imply a\n' +
        '     coverage it does not have.'
    );

    const bad = [];
    for (const [lang, c, pin] of [
      ['EN', en, FOLD_EN],
      ['IS', is, FOLD_IS],
    ]) {
      if (c.distinct !== pin.distinct)
        bad.push(`${lang} distinct ${c.distinct} != pinned ${pin.distinct}`);
      if (c.groups !== pin.groups)
        bad.push(`${lang} merge groups ${c.groups} != pinned ${pin.groups}`);
      if (c.merged !== pin.merged)
        bad.push(`${lang} merged strings ${c.merged} != pinned ${pin.merged}`);
      if (c.toLowerDiffers !== pin.toLowerDiffers)
        bad.push(`${lang} toLowerCase-differs ${c.toLowerDiffers} != pinned ${pin.toLowerDiffers}`);
      if (c.disagree !== pin.disagree) {
        bad.push(
          `${lang} FOLD-IDENTITY DISAGREEMENT ${c.disagree} != pinned ${pin.disagree}: ` +
            `${c.disagreeSamples.join(' · ')} — foldString and nocaseKey now answer differently. ` +
            'Do NOT fix by making nocaseKey Unicode-aware (§C18/§C47)'
        );
      }
    }
    return {
      ok: bad.length === 0,
      measured: bad.length
        ? bad.join('; ')
        : `EN ${en.distinct} distinct: ${en.groups} case-merge group(s) over ${en.merged} string(s) ` +
          `REPORTED (semantic, per §C47 — AC/Ac/ac), 0 fold-identity disagreements. ` +
          `IS ${is.distinct} distinct: ${is.groups} group(s), 0 disagreements. ` +
          `toLowerCase-vs-ASCII differs on 0 EN / 28 IS strings`,
    };
  } finally {
    db.close();
  }
}

/**
 * GATE 5 — the fingerprint TRACKS the automaton's source (spec §7.3).
 *
 * The defect this exists to catch: the fingerprint hashing one table while the
 * automaton is built from another. That was the pre-B4b-1 shape — it hashed
 * `terminology_headwords` while the automaton came from the same EN array — and
 * because the coupling was structural rather than asserted, editorial changes
 * would NEVER invalidate the cache and all four existing cache tests still passed.
 *
 * Three arms, each a COLD CHILD:
 *   A  mutate a `concept_term` EN row  → the fingerprint MUST change
 *   B  insert a `terminology_headwords` row → it MUST NOT (that is the table the
 *      OLD fingerprint hashed, so a revert lights this up)
 *   C  mutate a `concept_term` IS row  → it MUST NOT (an IS change moves match
 *      OUTPUT but is not automaton source; an output-based gate would confuse them)
 */
function checkGate5(dbPath, log = () => {}) {
  const base = childAutomaton(dbPath);
  log(
    `  baseline: fingerprint ${base.fingerprint} · ${base.entries} entries · ${base.keywordCount} keywords`
  );

  const armEn = withCopy(dbPath, 'g5-en', (db, copy) => {
    const target = db
      .prepare("SELECT id, text FROM concept_term WHERE lang='en' ORDER BY id LIMIT 1")
      .get();
    const changed = db
      .prepare('UPDATE concept_term SET text = ? WHERE id = ?')
      .run(G5_SENTINEL, target.id).changes;
    return { ...childAutomaton(copy), target, changed, was: target.text };
  });
  log(
    `  A: EN row #${armEn.target.id} "${armEn.was}" → "${G5_SENTINEL}" (${armEn.changed} row) ` +
      `⇒ fingerprint ${armEn.fingerprint}`
  );

  const armOld = withCopy(dbPath, 'g5-old', (db, copy) => {
    db.prepare('INSERT INTO terminology_headwords (english, pos) VALUES (?, ?)').run(
      'zzqx old table probe',
      null
    );
    return childAutomaton(copy);
  });
  log(`  B: inserted a terminology_headwords row ⇒ fingerprint ${armOld.fingerprint}`);

  const armIs = withCopy(dbPath, 'g5-is', (db, copy) => {
    const t = db.prepare("SELECT id FROM concept_term WHERE lang='is' ORDER BY id LIMIT 1").get();
    db.prepare('UPDATE concept_term SET text = ? WHERE id = ?').run('zzqxbreytt', t.id);
    return childAutomaton(copy);
  });
  log(`  C: mutated an IS row ⇒ fingerprint ${armIs.fingerprint}`);

  const bad = [];
  if (armEn.changed !== 1) bad.push('arm A mutated no row — the probe is vacuous');
  if (armEn.fingerprint === base.fingerprint)
    bad.push(
      'an EN-row mutation did NOT change the fingerprint — the cache would serve stale matches'
    );
  if (armOld.fingerprint !== base.fingerprint)
    bad.push(
      'a terminology_headwords insert CHANGED the fingerprint — it is hashing the OLD table'
    );
  if (armIs.fingerprint !== base.fingerprint)
    bad.push('an IS-row mutation changed the fingerprint — it is not keyed on the EN source alone');
  return {
    ok: bad.length === 0,
    measured: bad.length
      ? bad.join('; ')
      : `EN mutation moved the fingerprint ${base.fingerprint} → ${armEn.fingerprint}, while a ` +
        'terminology_headwords insert and an IS-row edit BOTH left it unchanged — measured in cold ' +
        'child processes via SESSIONS_DB_PATH, so no warm cache can hold the answer',
  };
}

/**
 * GATE 6 — D7: `[vantar]` reaches no match and no issue.
 *
 * ⚠️ THE POSITIVE CONTROL IS THE WHOLE GATE. "No match emitted" is trivially true
 * if nothing matched at all — B4b-0b's hazard (c), two identical empty results
 * comparing equal. So the probe segment carries a REAL in-scope term alongside
 * the placeholder one: the real term must match, the placeholder must not, and
 * a deep scan must find `[vantar]` nowhere in the payload under ANY key.
 */
function checkGate6(dbPath, log = () => {}) {
  const db = openRead(dbPath);
  let vantar;
  let placeholderIsPresent;
  try {
    vantar = db
      .prepare(
        "SELECT COUNT(*) c FROM (SELECT concept_id FROM concept_term WHERE lang='is' AND text = ? GROUP BY concept_id)"
      )
      .get(PLACEHOLDER_TEXT).c;
    // The positive observation: the placeholder concept's EN string IS in the
    // corpus, so it IS an automaton keyword. Without this, "no match" could just
    // mean "no such term".
    placeholderIsPresent = db
      .prepare("SELECT COUNT(*) c FROM concept_term WHERE lang='en' AND text = ?")
      .get(G6.placeholder).c;
  } finally {
    db.close();
  }

  const segments = [
    {
      segmentId: 'g6:probe',
      enContent: `The ${G6.placeholder} and the ${G6.control} are both discussed here.`,
      isContent: `Hér er fjallað um ${G6.controlIs}.`,
    },
  ];
  const out = childMatcher(dbPath, segments);
  const seg = out['g6:probe'] || { matches: [], issues: [] };
  const english = seg.matches.map((m) => m.english);
  const placeholderMatch = seg.matches.filter((m) => m.english === G6.placeholder);
  const placeholderIssue = seg.issues.filter((i) => i.english === G6.placeholder);
  const controlMatch = seg.matches.filter((m) => m.english === G6.control);
  const leaked = stringsDeep(seg).filter((s) => s === PLACEHOLDER_TEXT);

  log(
    `  placeholder concepts: ${vantar} · "${G6.placeholder}" EN rows in corpus: ${placeholderIsPresent}`
  );
  log(`  matches: ${english.length ? english.join(', ') : '(none)'}`);
  log(`  control "${G6.control}" matched: ${controlMatch.length} ⇐ THE POSITIVE CONTROL`);
  log(`  placeholder matches: ${placeholderMatch.length} · issues: ${placeholderIssue.length}`);
  log(`  "${PLACEHOLDER_TEXT}" anywhere in the payload: ${leaked.length}`);

  const bad = [];
  if (vantar !== VANTAR_CONCEPTS)
    bad.push(`${vantar} placeholder concepts, pinned ${VANTAR_CONCEPTS}`);
  if (placeholderIsPresent === 0)
    bad.push(`"${G6.placeholder}" is not in the corpus — the probe cannot test anything`);
  if (controlMatch.length === 0)
    bad.push(
      `THE POSITIVE CONTROL FAILED: "${G6.control}" produced no match, so "no placeholder match" ` +
        'is vacuous — this segment matches nothing at all'
    );
  if (placeholderMatch.length)
    bad.push(`the placeholder concept produced ${placeholderMatch.length} match(es)`);
  if (placeholderIssue.length)
    bad.push(`the placeholder concept produced ${placeholderIssue.length} issue(s)`);
  if (leaked.length)
    bad.push(`"${PLACEHOLDER_TEXT}" appears ${leaked.length} time(s) in the payload`);
  return {
    ok: bad.length === 0,
    measured: bad.length
      ? bad.join('; ')
      : `${vantar} placeholder concepts; "${G6.placeholder}" is a real automaton keyword yet yields ` +
        `0 matches and 0 issues, while "${G6.control}" in the SAME segment matches — so the absence ` +
        `is the D7 filter, not an empty probe. "${PLACEHOLDER_TEXT}" appears nowhere in the payload`,
  };
}

/**
 * GATE 7 — 🔴 the paradigm path is actually REACHED.
 *
 * Spec §7.1: the committed suite provably lacks this discrimination. A segment
 * whose Icelandic carries a DECLINED form must MISS under base-form matching and
 * be CAUGHT once a paradigm is stored.
 *
 * ⚠️ THE CONCEPT IS PLANTED ONLY IF ABSENT. That is what lets --self-test
 * pre-plant the same concept carrying a WRONG paradigm: the gate then finds it
 * existing, does not overwrite, and its "paradigm catches" arm fails. A gate that
 * unconditionally re-planted would overwrite the defect and could never go red.
 */
function plantG7(db, inflections) {
  const existing = db
    .prepare("SELECT concept_id FROM concept_term WHERE lang='en' AND text = ?")
    .get(G7.english);
  if (existing) return { conceptId: existing.concept_id, planted: false };
  const conceptId = Number(
    db.prepare('INSERT INTO concept (domain) VALUES (?)').run(G7.domain).lastInsertRowid
  );
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source, inflections) VALUES (?, 'en', ?, 1, 'b4b1-gate', NULL)"
  ).run(conceptId, G7.english);
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source, inflections) VALUES (?, 'is', ?, 1, 'b4b1-gate', ?)"
  ).run(conceptId, G7.base, inflections === null ? null : JSON.stringify(inflections));
  return { conceptId, planted: true };
}

function checkGate7(dbPath, log = () => {}) {
  const segments = [{ segmentId: 'g7:probe', enContent: G7.enContent, isContent: G7.isContent }];

  const withParadigm = withCopy(dbPath, 'g7-yes', (db, copy) => {
    const p = plantG7(db, [G7.declined]);
    return { p, out: childMatcher(copy, segments) };
  });
  const withoutParadigm = withCopy(dbPath, 'g7-no', (db, copy) => {
    const p = plantG7(db, null);
    return { p, out: childMatcher(copy, segments) };
  });

  const pick = (r) => {
    const seg = r.out['g7:probe'] || { matches: [], issues: [] };
    return {
      match: seg.matches.find((m) => m.english === G7.english),
      issue: seg.issues.find((i) => i.english === G7.english),
    };
  };
  const a = pick(withParadigm);
  const b = pick(withoutParadigm);

  log(
    `  planted concept (paradigm arm): ${withParadigm.p.conceptId}, freshly planted: ${withParadigm.p.planted}`
  );
  log(`  segment IS text carries "${G7.declined}", NOT the base form "${G7.base}"`);
  log(
    `  WITH    paradigm ["${G7.declined}"]: match=${Boolean(a.match)} issue=${a.issue ? a.issue.type : 'none'}`
  );
  log(
    `  WITHOUT paradigm (NULL)           : match=${Boolean(b.match)} issue=${b.issue ? b.issue.type : 'none'}`
  );

  const bad = [];
  if (!a.match) bad.push('the planted term produced no match at all — the probe is vacuous');
  if (!b.match)
    bad.push('the paradigm-removed arm produced no match at all — the control is vacuous');
  if (a.issue)
    bad.push(
      `WITH a paradigm the declined form still reported "${a.issue.type}" — the paradigm was NOT reached`
    );
  if (!b.issue)
    bad.push(
      'WITHOUT a paradigm the declined form was still accepted — base-form matching cannot do that, so the arms are not independent'
    );
  else if (b.issue.type !== 'missing')
    bad.push(
      `WITHOUT a paradigm the issue is "${b.issue.type}", expected "missing" — an "alternative" here ` +
        'means the planted concept has more than one Icelandic term and the softer tier absorbed it'
    );
  return {
    ok: bad.length === 0,
    measured: bad.length
      ? bad.join('; ')
      : `a declined form ("${G7.declined}") that base-form matching MISSES — the paradigm-removed arm ` +
        `reports "missing" — is CAUGHT once the paradigm is stored (no issue). Both arms match the term, ` +
        'so the difference is the paradigm lookup and nothing else',
  };
}

/**
 * GATE 8 — D4.2: one automaton entry per DISTINCT EN string, and a homograph's
 * winner comes from `resolve()`, not from arrival order.
 *
 * ⚠️ THE CHOICE OF STRING IS THE GATE. `adiabatic` is carried by 5 concepts; its
 * LOWEST-id concept is physics (head form `óverminn`) while efnafraedi-2e's
 * domain priority picks chemistry (`jafnvarma`). So arrival order and resolve()
 * give VISIBLY DIFFERENT answers, and asserting the winner discriminates between
 * them. (`absolute zero` — the obvious candidate — cannot: all four of its
 * concepts carry the same Icelandic head form, so no assertion on it could fail.)
 *
 * ⚠️ AND THE STRING MUST NOT BE ONE OF THE 157 CASE-COLLIDERS. For a case
 * homograph (`AC`/`Ac`/`ac` — three DISTINCT EN strings folding to one keyword)
 * register §C47 records that the winner IS decided by the lowest concept_term.id.
 * That is a different, pre-existing mechanism; mixing it in here would make the
 * gate fail correctly and read as a cut-over defect.
 *
 * The control is a DATA-LEVEL arrival-order reversal: the EN rows for the string
 * are deleted and re-inserted in reverse concept order, so MIN(id) — the handle
 * loadEnglishEntries groups on, and the final tie-break in findTermsInSegments's
 * hits.sort — lands on a DIFFERENT concept. The winner must not move, because
 * resolve() is called with the STRING, not the id.
 */
function checkGate8(dbPath, log = () => {}) {
  const db = openRead(dbPath);
  let multi;
  let distinctEn;
  let rows;
  try {
    multi = db
      .prepare(
        "SELECT COUNT(*) c FROM (SELECT text FROM concept_term WHERE lang='en' GROUP BY text HAVING COUNT(DISTINCT concept_id) > 1)"
      )
      .get().c;
    distinctEn = db
      .prepare("SELECT COUNT(DISTINCT text) c FROM concept_term WHERE lang='en'")
      .get().c;
    rows = db
      .prepare(
        `SELECT t.id, t.concept_id, c.domain,
                (SELECT text FROM concept_term WHERE concept_id = c.id AND lang='is' ORDER BY rank, id LIMIT 1) AS head
           FROM concept_term t JOIN concept c ON c.id = t.concept_id
          WHERE t.lang='en' AND t.text = ? ORDER BY t.id`
      )
      .all(G8.english);
  } finally {
    db.close();
  }

  const auto = childAutomaton(dbPath);
  const segments = [
    {
      segmentId: 'g8:probe',
      enContent: `An ${G8.english} process is described here.`,
      isContent: 'Hér er ferlinu lýst.',
    },
  ];
  const before = childMatcher(dbPath, segments);

  // The control: reverse arrival order for this English string ONLY, at the data
  // level. Safe — book_term_preference (the one FK onto concept_term.id) is empty
  // on this corpus, and the (concept_id, lang, text) tuples are preserved exactly.
  const after = withCopy(dbPath, 'g8-rev', (db, copy) => {
    const ins = db.prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source, inflections) VALUES (?, 'en', ?, ?, ?, ?)"
    );
    const originals = db
      .prepare(
        "SELECT id, concept_id, rank, source, inflections FROM concept_term WHERE lang='en' AND text = ? ORDER BY id"
      )
      .all(G8.english);
    db.prepare("DELETE FROM concept_term WHERE lang='en' AND text = ?").run(G8.english);
    for (const r of [...originals].reverse())
      ins.run(r.concept_id, G8.english, r.rank, r.source, r.inflections);
    const newMin = db
      .prepare(
        "SELECT MIN(id) id, (SELECT concept_id FROM concept_term WHERE lang='en' AND text=? ORDER BY id LIMIT 1) cid FROM concept_term WHERE lang='en' AND text = ?"
      )
      .get(G8.english, G8.english);
    return { out: childMatcher(copy, segments), newMin, originals };
  });

  const winnerOf = (out) => {
    const seg = out['g8:probe'] || { matches: [] };
    return seg.matches.find((m) => m.english === G8.english) || null;
  };
  const w0 = winnerOf(before);
  const w1 = winnerOf(after.out);
  const lowest = rows[0];

  log(
    `  distinct EN ${distinctEn} · automaton entries ${auto.entries} · keywords ${auto.keywordCount}`
  );
  log(`  multi-concept EN strings: ${multi}`);
  log(`  "${G8.english}" is carried by ${rows.length} concepts:`);
  for (const r of rows)
    log(`     · EN row #${r.id} concept ${r.concept_id} (${r.domain}) head="${r.head}"`);
  log(
    `  lowest-id concept = ${lowest.concept_id} (${lowest.domain}, head "${lowest.head}") ⇐ what arrival order would pick`
  );
  log(`  emitted winner BEFORE: "${w0 && w0.icelandic}" ${w0 ? JSON.stringify(w0.subjects) : ''}`);
  log(`  arrival order REVERSED (MIN(id) now #${after.newMin.id}, concept ${after.newMin.cid})`);
  log(`  emitted winner AFTER : "${w1 && w1.icelandic}" ${w1 ? JSON.stringify(w1.subjects) : ''}`);

  const bad = [];
  if (auto.entries !== distinctEn)
    bad.push(
      `${auto.entries} automaton entries for ${distinctEn} distinct EN strings — D4.2 says one per string`
    );
  if (multi !== 11553) bad.push(`multi-concept EN strings ${multi}, pinned 11553`);
  if (!w0) bad.push(`"${G8.english}" produced no match — the probe is vacuous`);
  else {
    if (w0.icelandic !== G8.expectWinner)
      bad.push(`winner is "${w0.icelandic}", expected "${G8.expectWinner}"`);
    if (w0.subjects[0] !== G8.expectDomain)
      bad.push(`winner's domain is "${w0.subjects[0]}", expected "${G8.expectDomain}"`);
    if (w0.icelandic === G8.arrivalOrderWinner)
      bad.push(
        `winner is "${G8.arrivalOrderWinner}" — the LOWEST-ID concept's head form, i.e. arrival order decided it`
      );
  }
  if (!w1) bad.push('the reversed-order arm produced no match — the control is vacuous');
  else if (w0 && (w1.icelandic !== w0.icelandic || w1.subjects[0] !== w0.subjects[0]))
    bad.push(
      `THE WINNER MOVED under a pure arrival-order change: "${w0.icelandic}" → "${w1.icelandic}"`
    );
  if (after.newMin.cid === lowest.concept_id)
    bad.push('the reversal did not move MIN(id) to a different concept — the control did nothing');
  return {
    ok: bad.length === 0,
    measured: bad.length
      ? bad.join('; ')
      : `${auto.entries} automaton entries for ${distinctEn} distinct EN strings (exactly one each, ` +
        `folding to ${auto.keywordCount} keywords). "${G8.english}" resolves to "${G8.expectWinner}" ` +
        `(${G8.expectDomain}, position 1) and NOT to the lowest-id concept's "${G8.arrivalOrderWinner}" ` +
        `(${lowest.domain}); reversing arrival order moved MIN(id) to another concept and the winner ` +
        'did not move — resolve() decides, not row order',
  };
}

/**
 * GATE 3 — 🔶 INCONCLUSIVE BY DELIBERATE JUDGEMENT, and it does not gate the exit code.
 *
 * 🔴 REGISTER §C48 NAMES THIS GATE. Its ruling: "any gate, benchmark or test that
 * reads a TIER, an `isFallback` badge, or an ISSUE COUNT off c24-terms.json is
 * reading synthesised tags, not corpus truth." Gate 3 as specified reads an issue
 * count off exactly that fixture.
 *
 * Two independent reasons a number here would be a fiction:
 *
 *  1. THERE IS NO OLD ARM TO RUN. Task 4 deleted the old matcher; the only "old"
 *     figure available is the COMMITTED GOLDEN's recorded 5 `missing` issues,
 *     captured before the cut-over. Comparing a live run against a frozen capture
 *     is not an A/B.
 *  2. THE DELTA IS SUBSTANTIALLY A TAG ARTEFACT. B4a replaced single-subject
 *     scoping with a domain chain, so the fixture's synthesised subject tags were
 *     promoted from decoration to TIER SELECTORS — and several are chemically
 *     implausible (`bomb calorimeter` → mathematics, `absolute zero` → biology).
 *     More terms in scope ⇒ more Icelandic-side checks ⇒ more issues. §C48
 *     measured the rise as 5 → 22 for that reason.
 *
 * So both numbers are PRINTED, with their provenance, and NOTHING is asserted.
 * Manufacturing a threshold over synthesised tags would produce a confident
 * figure about a fiction — the precise failure this plan is written to avoid.
 * A corpus-scale answer is a read-only production query, not this gate.
 */
function reportGate3(log = () => {}) {
  const golden = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'c24-golden.json'), 'utf-8'));
  const segments = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'c24-segments.json'), 'utf-8'));
  let goldenMatches = 0;
  let goldenIssues = 0;
  for (const r of Object.values(golden)) {
    goldenMatches += (r.matches || []).length;
    goldenIssues += (r.issues || []).length;
  }

  // ⚠️ A FRESH, FIXTURE-ONLY DATABASE — NOT THE CORPUS. The golden was captured
  // against a database holding the c24 fixture and NOTHING ELSE, so that is the
  // only configuration in which the two numbers are comparable at all. Seeding
  // the fixture INTO the 61,042-string corpus was measured first and answers a
  // different question entirely (108 matches, because the corpus's own terms
  // match the same segments) — printing that beside a 40-match golden would
  // invite exactly the false reading this gate is being careful to avoid.
  const freshMigratedDb = require('../__tests__/helpers/freshMigratedDb');
  const { seedC24Concepts } = require('../__tests__/helpers/seedC24Concepts');
  const fixtureDb = freshMigratedDb();
  trackScratch(fixtureDb.path);
  let live;
  try {
    seedBooks(fixtureDb.db);
    seedC24Concepts(fixtureDb.db);
    fixtureDb.db.close();
    live = childMatcher(fixtureDb.path, segments);
  } finally {
    try {
      fixtureDb.db.close();
    } catch {
      /* already closed */
    }
  }
  let liveMatches = 0;
  const liveTypes = {};
  for (const r of Object.values(live)) {
    liveMatches += r.matches.length;
    for (const i of r.issues) liveTypes[i.type] = (liveTypes[i.type] || 0) + 1;
  }
  const liveIssues = Object.values(liveTypes).reduce((a, b) => a + b, 0);
  log(`  OLD ARM  — the COMMITTED GOLDEN, captured pre-cut-over against the old model:`);
  log(
    `             ${Object.keys(golden).length} segments · ${goldenMatches} matches · ${goldenIssues} issues (all "missing")`
  );
  log(`  NEW ARM  — the SAME segments on a fresh fixture-only DB, cold child:`);
  log(`             ${liveMatches} matches · ${liveIssues} issues ${JSON.stringify(liveTypes)}`);
  log(`  ⚠️ THE ISSUE DELTA IS NOT A CODE MEASUREMENT. §C48: the fixture's subject tags became`);
  log(`     TIER SELECTORS under B4a's domain chain, so more terms fall in scope and more`);
  log(`     Icelandic-side checks run. Several tags are chemically implausible. The MATCH count`);
  log(`     (${goldenMatches} → ${liveMatches}) is the part not contaminated by tiering.`);
  return { goldenMatches, goldenIssues, liveMatches, liveIssues, liveTypes };
}

// ─────────────────────────────────────────────────────────────────────────────

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  console.log('══════════════════════════════════════════════════════════════');
  console.log(' §C36 B4b-1 acceptance gate — the concept-model matcher cut-over');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('⚠️ CAVEAT 1 — a RECONSTRUCTION, not production. Gate 1 is what makes its');
  console.log('   numbers admissible; every gate below measures that database.');
  console.log('⚠️ CAVEAT 2 — efnafraedi-2e is registered by this script (§C35).');
  console.log('⚠️ CAVEAT 3 — NO old-model arm exists locally: the import writes 0 rows to');
  console.log('   terminology_headwords and Task 4 deleted the old matcher. Gates 2 and 3');
  console.log('   are FIXTURE SCALE and their labels say so.');

  if (!fs.existsSync(args.corpus)) usage(`corpus directory not found: ${args.corpus}`);

  console.log(`\n── Setup: build the scratch corpus from ${args.corpus} ──`);
  const built = buildCorpusDb(args.corpus);
  seedBooks(built.db);
  // ⚠️ Close the builder's handle. Every gate opens the path itself (read-only, or
  // on a copy), so leaving a writable connection open here would let a gate's
  // measurement depend on this process's connection state rather than the file.
  built.db.close();
  const dbPath = trackScratch(built.path);

  const ok = [];

  console.log('\n══ Gate 1 — corpus fidelity, and STOP on divergence ══');
  const g1 = checkGate1(dbPath, console.log);
  ok.push(record('GATE 1 (corpus fidelity)', g1.ok ? 'PASS' : 'FAIL', g1.measured));
  if (!g1.ok) {
    // ⚠️ STOP. scratchCorpus.js's header mandates this and b4b0 enforces it: if the
    // reconstruction is not B2's corpus, no divergence below is attributable to code.
    console.log('\n🔴 The corpus is not the recorded one — refusing to measure anything else.');
    return finish();
  }

  console.log('\n══ Gate 2 — EN coverage, old headwords → concept_term (FIXTURE SCALE) ══');
  console.log(
    '  ⚠️ Production measured 20,272/20,272 = 100.00% with a 32.15% reverse control\n' +
      '     (spec §3, read-only on prod). THAT IS NOT REPRODUCED HERE — the scratch corpus\n' +
      '     has 0 old headwords, so the c24 fixture is the only old-model population\n' +
      '     available, at 1/64th the scale.'
  );
  const g2 = checkGate2(dbPath, console.log);
  ok.push(
    record(
      'GATE 2 (EN coverage — FIXTURE SCALE, 316 headwords / 304 distinct)',
      g2.ok ? 'PASS' : 'FAIL',
      g2.measured
    )
  );

  console.log('\n══ Gate 3 — 🔶 issue volume old vs new (REPORT ONLY — see §C48) ══');
  const g3 = reportGate3(console.log);
  record(
    'GATE 3 (INCONCLUSIVE — fixture scale, 316 headwords, TIER-CONTAMINATED per §C48)',
    'INCONCLUSIVE',
    `golden ${g3.goldenMatches} matches / ${g3.goldenIssues} issues (frozen pre-cut-over capture) vs ` +
      `${g3.liveMatches} matches / ${g3.liveIssues} issues ${JSON.stringify(g3.liveTypes)} now. ` +
      'NOT ASSERTED: there is no runnable old arm (Task 4 deleted it), and §C48 rules that an issue ' +
      'count read off c24-terms.json reads synthesised subject tags — promoted to TIER SELECTORS by ' +
      'B4a — not corpus truth. Does not affect the exit code'
  );

  console.log('\n══ Gate 4 — the three EN/IS identities (D4.1), REPORTED not normalised ══');
  const g4 = checkGate4(dbPath, console.log);
  ok.push(
    record(
      'GATE 4 (fold identities — collisions REPORTED per §C47)',
      g4.ok ? 'PASS' : 'FAIL',
      g4.measured
    )
  );

  console.log('\n══ Gate 5 — the fingerprint tracks the automaton’s source (COLD CHILDREN) ══');
  const g5 = checkGate5(dbPath, console.log);
  ok.push(record('GATE 5 (fingerprint ⇄ automaton source)', g5.ok ? 'PASS' : 'FAIL', g5.measured));

  console.log('\n══ Gate 6 — D7: [vantar] reaches no match and no issue ══');
  const g6 = checkGate6(dbPath, console.log);
  ok.push(record('GATE 6 (D7 placeholder containment)', g6.ok ? 'PASS' : 'FAIL', g6.measured));

  console.log('\n══ Gate 7 — 🔴 the paradigm path is actually reached ══');
  const g7 = checkGate7(dbPath, console.log);
  ok.push(record('GATE 7 (paradigm discrimination)', g7.ok ? 'PASS' : 'FAIL', g7.measured));

  console.log('\n══ Gate 8 — D4.2: one entry per EN string; resolve() picks the winner ══');
  const g8 = checkGate8(dbPath, console.log);
  ok.push(record('GATE 8 (D4.2 homograph winner)', g8.ok ? 'PASS' : 'FAIL', g8.measured));

  if (args.selfTest) selfTest(dbPath);
  return finish();
}

/**
 * ⚠️ A GATE NEVER SEEN RED IS AN UNTESTED ASSERTION.
 *
 * ⚠️ THE SELF-TEST MUST CALL THE GATE, NOT RE-IMPLEMENT ITS ASSERTION.
 * B4b-0b's first self-test hand-wrote the predicate beside the planted defect, so
 * a gate whose assertion had been DELETED still reported DETECTED, and its GATE 2
 * case was a tautology. Plant in the DATA on a copy — never by sabotaging the
 * source, which leaks if the revert is partial.
 *
 * Each case copies the scratch DB, plants ONE defect, and calls the REAL gate
 * function on the planted copy.
 *
 * ⚠️ EVERY CASE ALSO CARRIES AN `expect` SUBSTRING, AND THAT IS NOT DECORATION.
 * `verdict.ok === false` alone would let a gate pass this self-test for the WRONG
 * REASON — gate 4 is the worked example: planting an EN row moves FIVE pinned
 * counts, so the gate goes red on the distinct-string count whether or not its
 * fold-identity check works at all. Requiring the failure message to name the
 * assertion under test is what distinguishes "the gate noticed something" from
 * "the gate noticed THIS". Same failure class as B4b-0b's blind self-test, one
 * level in.
 */
function selfTest(dbPath) {
  console.log('\n══ SELF-TEST — plant each defect, assert THE GATE ITSELF goes red ══');
  console.log(
    '  Gate 3 has no case because it ASSERTS NOTHING (INCONCLUSIVE by judgement, §C48).\n' +
      '  A self-test case for it would be theatre.'
  );
  const cases = [
    {
      gate: 'GATE 1',
      what: 'a concept row is deleted, so the corpus is no longer B2’s',
      expect: 'the corpus differs',
      plant: (d) =>
        d.prepare('DELETE FROM concept WHERE id = (SELECT MAX(id) FROM concept)').run().changes,
      check: checkGate1,
    },
    {
      gate: 'GATE 2',
      what: 'the EN rows of the fixture’s first 60 headwords are deleted, dropping coverage below the pin',
      expect: 'coverage is',
      plant: (d) => {
        const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'c24-terms.json'), 'utf-8'));
        const del = d.prepare("DELETE FROM concept_term WHERE lang='en' AND text = ?");
        let n = 0;
        for (const h of fixture.headwords.slice(0, 60)) n += del.run(h.english).changes;
        return n;
      },
      check: checkGate2,
    },
    {
      // The brief's own control: a pair that collides under foldString but NOT
      // under nocaseKey, because Å is outside A–Z. That is a fold-identity
      // DISAGREEMENT — pinned at 0 — not merely another case collision.
      gate: 'GATE 4',
      what: 'an Ångström/ångström pair, which the two folds answer differently on',
      // ⚠️ THE POINT OF `expect` — this plant also moves four COUNT pins, so
      // `ok === false` alone would be satisfied by a gate whose fold-identity
      // check had been deleted outright.
      expect: 'FOLD-IDENTITY DISAGREEMENT',
      plant: (d) => {
        const cid = Number(
          d.prepare('INSERT INTO concept (domain) VALUES (?)').run('physics').lastInsertRowid
        );
        return d
          .prepare(
            "INSERT INTO concept_term (concept_id, lang, text, rank, source, inflections) VALUES (?, 'en', 'Ångström', 1, 'b4b1-selftest', NULL)"
          )
          .run(cid).changes;
      },
      check: checkGate4,
    },
    {
      // ⚠️ NOT a tautology: the plant pre-writes the exact value gate 5's own
      // mutation would write, so that mutation becomes a NO-OP and the
      // fingerprint cannot move. The gate then fails on its real assertion —
      // "an EN-row mutation MUST change the fingerprint" — which is only
      // observable if the gate genuinely reads the fingerprint.
      gate: 'GATE 5',
      what: 'the EN row gate 5 mutates already holds the sentinel, making its mutation a no-op',
      expect: 'did NOT change the fingerprint',
      plant: (d) =>
        d
          .prepare(
            "UPDATE concept_term SET text = ? WHERE id = (SELECT MIN(id) FROM concept_term WHERE lang='en')"
          )
          .run(G5_SENTINEL).changes,
      check: checkGate5,
    },
    {
      // Attacks the POSITIVE CONTROL, which is the half that makes gate 6 mean
      // anything: with the control term gone the segment matches nothing, and
      // "no placeholder match" becomes vacuously true.
      gate: 'GATE 6',
      what: 'the positive-control term is removed, making "no placeholder match" vacuous',
      expect: 'THE POSITIVE CONTROL FAILED',
      plant: (d) =>
        d.prepare("DELETE FROM concept_term WHERE lang='en' AND text = ?").run(G6.control).changes,
      check: checkGate6,
    },
    {
      // plantG7 only plants when ABSENT, so pre-planting with a paradigm that
      // does not contain the segment's declined form survives into the gate.
      gate: 'GATE 7',
      what: 'the synthetic concept already exists carrying a WRONG paradigm',
      expect: 'the paradigm was NOT reached',
      plant: (d) => {
        const cid = Number(
          d.prepare('INSERT INTO concept (domain) VALUES (?)').run(G7.domain).lastInsertRowid
        );
        d.prepare(
          "INSERT INTO concept_term (concept_id, lang, text, rank, source, inflections) VALUES (?, 'en', ?, 1, 'b4b1-selftest', NULL)"
        ).run(cid, G7.english);
        return d
          .prepare(
            "INSERT INTO concept_term (concept_id, lang, text, rank, source, inflections) VALUES (?, 'is', ?, 1, 'b4b1-selftest', ?)"
          )
          .run(cid, G7.base, JSON.stringify(['zzqxrangbeyging'])).changes;
      },
      check: checkGate7,
    },
    {
      // Moves the chemistry concept out of efnafraedi-2e's chain, so domain
      // priority now picks the physics concept and the winner moves to exactly
      // the arrival-order answer the gate exists to rule out.
      gate: 'GATE 8',
      what: 'the winning concept’s domain is moved out of the book’s chain',
      expect: 'arrival order decided it',
      plant: (d) =>
        d
          .prepare(
            `UPDATE concept SET domain = 'mathematics'
              WHERE id = (SELECT t.concept_id FROM concept_term t JOIN concept c ON c.id = t.concept_id
                           WHERE t.lang='en' AND t.text = ? AND c.domain = ?)`
          )
          .run(G8.english, G8.expectDomain).changes,
      check: checkGate8,
    },
  ];

  let allOk = true;
  for (const c of cases) {
    const copy = path.join(
      os.tmpdir(),
      `b4b1-selftest-${c.gate.replace(/\W/g, '')}-${process.pid}.db`
    );
    fs.copyFileSync(dbPath, copy);
    const d = new Database(copy);
    let changed;
    let verdict;
    try {
      changed = c.plant(d);
      d.close();
      // THE REAL GATE, on the planted database.
      verdict = c.check(copy);
    } catch (err) {
      // A gate that THROWS on the planted state has still detected it, but say so
      // rather than silently counting it as a pass.
      verdict = { ok: false, measured: `the gate threw: ${err.message.slice(0, 200)}` };
    } finally {
      try {
        d.close();
      } catch {
        /* already closed */
      }
      fs.rmSync(copy, { force: true });
    }
    const wentRed = verdict.ok === false;
    // ⚠️ RED IS NOT ENOUGH — the message must name the assertion under test.
    const rightReason = wentRed && verdict.measured.includes(c.expect);
    console.log(
      `  ${rightReason ? '✅' : '🔴'} ${c.gate}: planted "${c.what}" (${changed} row(s)) → ` +
        (rightReason
          ? `the gate FAILED on "${c.expect}" as required — ${verdict.measured.slice(0, 200)}`
          : wentRed
            ? `THE GATE FAILED FOR THE WRONG REASON — expected a failure naming "${c.expect}", got: ${verdict.measured.slice(0, 200)}`
            : 'THE GATE STILL PASSED — it is blind to this')
    );
    if (!rightReason) allOk = false;
  }
  record(
    'SELF-TEST (the gates can fail)',
    allOk ? 'PASS' : 'FAIL',
    allOk
      ? `${cases.length} planted defect(s), each caught by THE GATE'S OWN assertion AND on the ` +
          'expected grounds — no source mutated'
      : 'a planted defect left its gate passing, or failing for a different reason than the one under test'
  );
}

function finish() {
  console.log('\n══ SUMMARY ══');
  for (const r of results)
    console.log(`  ${r.verdict.padEnd(13)} ${r.id}\n${' '.repeat(16)}${r.measured}`);
  // ⚠️ Only FAIL gates the exit code. INCONCLUSIVE is a deliberate verdict (gate 3),
  // not a soft failure — treating it as one would pressure a future author into
  // manufacturing a number to turn the build green.
  const failed = results.filter((r) => r.verdict === 'FAIL');
  const inconclusive = results.filter((r) => r.verdict === 'INCONCLUSIVE');
  console.log(
    failed.length
      ? `\n${failed.length} check(s) FAILED.`
      : `\nAll asserting checks passed${inconclusive.length ? ` (${inconclusive.length} INCONCLUSIVE by design)` : ''}.`
  );
  for (const d of scratchDirs) fs.rmSync(d, { recursive: true, force: true });
  process.exitCode = failed.length ? 1 : 0;
  return failed.length ? 1 : 0;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

module.exports = { main, parseArgs };
