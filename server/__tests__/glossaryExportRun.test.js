/**
 * Orchestration of the unattended glossary export (register C14).
 *
 * The real exporter is injected as `exportFn`, so none of this touches a
 * sessions.db. What is under test is the contract scripts/git-backup.sh and
 * /api/health depend on:
 *
 *   exit 0  <=>  every REQUESTED book resolved healthily
 *   heartbeat written  <=>  exit 0  AND  unfiltered (no --book)  AND  !dryRun
 *
 * These are NOT the same condition — a `--book <slug>` run or a `--dry-run`
 * can each legitimately exit 0 while leaving the heartbeat untouched
 * (whole-branch adversarial review finding 5/6: an earlier version of this
 * comment claimed a three-way equivalence, which a --book run breaks).
 *
 * The heartbeat follows the C11(b) doctrine: written ONLY on a healthy,
 * unfiltered run, so absence is the alarm.
 *
 * ⚠️ AMENDED 2026-08-05 (C14 ② step 5). This paragraph used to end "A status
 * file written on every outcome would read 'success' forever once the exporter
 * stopped working" — an argument against having one at all. A status file DOES
 * arrive in the next step, and that argument survives as a CONSTRAINT on it
 * rather than as a veto: the HEARTBEAT remains the liveness alarm (absence is
 * the alarm, exactly as above), and the status file carries per-book DETAIL
 * only. Nothing may consult the status file to decide whether the exporter is
 * alive — a file written on every outcome cannot answer that question, which
 * is precisely why the heartbeat is not being replaced by it.
 *
 * ⚠️ "Healthy" NARROWED 2026-08-05 (decision D2): a book that REFUSES for a
 * correct reason — an un-adopted producer swap, no subject mapping, a
 * catastrophic shrink — is a correct outcome, not a failure. Refusals now exit
 * 0 and keep the heartbeat; only a genuine ERROR (the exporter threw, the
 * payload was malformed, the existing file was unreadable) exits 1 and
 * withholds it. On 2026-08-03 the old all-or-nothing counter let ONE book's
 * legitimate refusal hold /api/health at ok=false straight through the run
 * that wrote and pushed reader-visible content for every other book — so the
 * alarm was already ringing for the wrong reason when the real event happened,
 * and nobody learned of it. Several tests below were revised for this; each
 * carries the reason inline.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runGlossaryExport, parseArgs } = require('../scripts/export-terminology');
// Read back through the REAL health lib, not a re-implementation of its rules:
// the `since` carry-forward only matters because /api/health turns it into a
// stale-refusal alarm, and that is the end this file asserts against.
const { readGlossaryExportHealth } = require('../lib/glossaryExportHealth');

let root;

const approved = (n) =>
  Array.from({ length: n }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: 'approved',
  }));

const payload = (terms, generated = '2026-07-27T09:00:00.000Z') => ({
  generated,
  book: 'prufubok',
  stats: {},
  terms,
});

/**
 * `total` terms, `approvedCount` of them approved — the shape every real
 * committed glossary actually has (efnafraedi-2e / lifraen-efnafraedi are
 * both 1117 total / 617 approved). Mirrors glossaryExportDecision.test.js's
 * `mixed()`. `approved(n)` above always has total === approved, so a message
 * built from it can't distinguish "reports both counts" from "reports one
 * count twice" — whole-branch adversarial review (2026-07-28), ROUND 4:
 * verified that deleting the total-count pair from the refusal, dry-run and
 * success messages left every then-existing test green, precisely because
 * every fixture in this file was `approved()`-shaped. Use `mixed()` whenever
 * a test needs to prove BOTH counts are actually reported.
 */
const mixed = (total, approvedCount) =>
  Array.from({ length: total }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: i < approvedCount ? 'approved' : 'needs_review',
  }));

/**
 * ⚠️ THE EXISTING FIXTURES CANNOT EXERCISE THE PRODUCER GATE. payload()/approved()
 * build terms as {english, icelandic, status} — no `subjects`, no
 * `category`/`chapter` — so detectProducer returns 'unknown' for BOTH prev and
 * next, they compare equal, and the gate silently never fires. Any test that
 * means to exercise the gate MUST use these.
 */
const legacyTerms = (n) =>
  Array.from({ length: n }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: 'approved',
    category: 'other',
    chapter: 1,
  }));

const exportPayload = (terms, generated = '2026-07-27T09:00:00.000Z') => ({
  producer: 'export-terminology',
  generated,
  book: 'prufubok',
  stats: {},
  terms: terms.map((t) => ({ ...t, subjects: ['chemistry'] })),
});

/** Create books/<slug>/glossary/, optionally with an existing export. */
function seedBook(slug, existing) {
  const dir = path.join(root, 'books', slug, 'glossary');
  mkdirSync(dir, { recursive: true });
  if (existing !== undefined) {
    writeFileSync(path.join(dir, 'glossary-unified.json'), existing);
  }
}

/**
 * Seed a book that ALREADY holds a committed export, so a subsequent run is a
 * routine refresh rather than a §C21 first write.
 *
 * Use this wherever a test needs a write to HAPPEN but is not about the
 * absent-baseline gate. The one-term baseline is deliberately smaller than
 * every export these tests produce, so the write is a growth: no shrink
 * verdict fires. `payload()` carries no `producer` and its terms carry no
 * `subjects`, so detectProducer returns 'unknown' on both sides and the
 * producer gate stays quiet too — see the legacyTerms note above.
 */
function seedRefreshable(slug) {
  seedBook(slug, JSON.stringify(payload(approved(1))));
}

function readExport(slug) {
  return JSON.parse(
    readFileSync(path.join(root, 'books', slug, 'glossary', 'glossary-unified.json'), 'utf8')
  );
}

function heartbeatExists() {
  return existsSync(path.join(root, 'pipeline-output', '.last-glossary-export'));
}

function run(opts) {
  return runGlossaryExport({
    booksDir: path.join(root, 'books'),
    projectRoot: root,
    // Every book has a subject by default so the pre-existing tests (which
    // predate the subject-mapping guard) don't have to know about it; tests
    // for the guard itself override subjectFn explicitly.
    subjectFn: () => 'chemistry',
    log: () => {},
    logError: () => {},
    ...opts,
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'c14-export-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * The absent-baseline gate (register §C21).
 *
 * A book with a `glossary/` directory and NO committed file makes readExisting
 * return `{kind:'absent'}` → `prev === null` → `producerVerdict` has no previous
 * producer to compare and `shrinkVerdict` has no baseline to measure. BOTH gates
 * are structurally inert, so the bare 2-hourly cron used to write, commit and
 * push a brand-new glossary unattended — reaching readers via
 * `substituteMathLabels`. That is the third of the 2026-08-03 incident.
 *
 * The state is not exotic: `createBookDirectories()` scaffolds an empty
 * `glossary/` for every book registered through the admin route, so ordinary
 * onboarding manufactures it.
 *
 * A first write is therefore a DECISION, not a default: it requires `--adopt`,
 * which the cron cannot reach.
 */
describe('runGlossaryExport — absent baseline (§C21)', () => {
  const glossaryFile = (slug) =>
    path.join(root, 'books', slug, 'glossary', 'glossary-unified.json');

  it('refuses to write a first export when no committed file exists', () => {
    seedBook('prufubok');
    run({ exportFn: () => payload(approved(5)) });
    expect(existsSync(glossaryFile('prufubok'))).toBe(false);
  });

  it('records the refusal as refused-absent-baseline, so the D6 clock covers it', () => {
    seedBook('prufubok');
    run({ exportFn: () => payload(approved(5)) });
    const status = JSON.parse(
      readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    expect(status.books.prufubok.outcome).toBe('refused-absent-baseline');
  });

  it('exits 0 — a refusal is a correct outcome (D2), not an error', () => {
    seedBook('prufubok');
    expect(run({ exportFn: () => payload(approved(5)) })).toBe(0);
  });

  it('writes that first export when --adopt is passed', () => {
    seedBook('prufubok');
    expect(run({ exportFn: () => payload(approved(5)), adopt: true })).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(5);
  });

  it('records an adopted first export as "adopted", not as a routine "wrote"', () => {
    // Same rule the corrupt and producer paths already follow: reaching the
    // write with a gate overridden is a one-off migration, and the record must
    // not label it a routine refresh. Without this, the single most
    // consequential write for a new book — its entirely unreviewed first one —
    // is indistinguishable in the status file from a two-term refresh.
    seedBook('prufubok');
    run({ exportFn: () => payload(approved(5)), adopt: true });
    const status = JSON.parse(
      readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    expect(status.books.prufubok.outcome).toBe('adopted');
  });

  it('does not let --force stand in for --adopt (two risks, two acknowledgements)', () => {
    seedBook('prufubok');
    run({ exportFn: () => payload(approved(5)), force: true });
    expect(existsSync(glossaryFile('prufubok'))).toBe(false);
  });
});

describe('runGlossaryExport — writing', () => {
  it('writes a first export when --adopt is passed and no file exists, and returns 0', () => {
    // ⚠️ This test used to read "writes a first export when no file exists" and
    // asserted exactly the ungated write §C21 describes — a test pinning the
    // defect. It now pins the gate instead; `adopt` is what changed, not the
    // write path.
    seedBook('prufubok');
    const code = run({ exportFn: () => payload(approved(5)), adopt: true });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(5);
  });

  it('writes when the term content changed', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(5))));
    expect(run({ exportFn: () => payload(approved(6)) })).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(6);
  });

  it('the "wrote terms" success message states BOTH the total and approved counts', () => {
    // Whole-branch adversarial review (2026-07-28), ROUND 4, IMPORTANT: like
    // the dry-run message above, this `log()` line had NO test at all before
    // this round. mixed() holds total and approved independent so all four
    // numbers in the pinned string are distinct, proving both pairs are
    // really reported.
    seedBook('prufubok', JSON.stringify(payload(mixed(1117, 617))));
    const logs = [];
    const code = run({ exportFn: () => payload(mixed(1000, 560)), log: (m) => logs.push(m) });
    expect(code).toBe(0);
    const outPath = path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json');
    expect(logs.join('\n')).toBe(
      `prufubok: wrote terms 1117 → 1000 (approved 617 → 560) → ${outPath}`
    );
  });

  it('does NOT rewrite when only the generated stamp differs', () => {
    const before = JSON.stringify(payload(approved(5), '2026-01-01T00:00:00.000Z'));
    seedBook('prufubok', before);
    const code = run({ exportFn: () => payload(approved(5), '2026-07-27T09:00:00.000Z') });
    expect(code).toBe(0);
    const after = readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    );
    expect(after).toBe(before);
  });

  // REVISED 2026-08-04 (C14 ② step 4, decision D5). This asserted the
  // opposite: a corrupt file was replaced, on the reasoning that a corrupt
  // file has no value so overwriting it is an improvement. That reasoning
  // holds for the CONTENT and fails for the PRODUCER — an unreadable
  // merge-glossary file was the one remaining path by which a producer swap
  // could happen with no gate at all. We cannot tell what we would destroy,
  // which is exactly when a human decides. Kept rather than deleted so the
  // change is visible to the next reader.
  it('refuses an unparseable existing file rather than replacing it (needs --adopt)', () => {
    seedBook('prufubok', '{ not json');
    const errors = [];
    const code = run({
      exportFn: () => payload(approved(10)),
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(0); // a refusal is not an error (D2)
    expect(
      readFileSync(
        path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
        'utf8'
      )
    ).toBe('{ not json'); // untouched
    expect(errors.join('\n')).toMatch(/cannot read the existing file/i);
  });

  it('--adopt replaces an unparseable existing file', () => {
    seedBook('prufubok', '{ not json');
    const code = run({ exportFn: () => payload(approved(10)), adopt: true });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(10);
  });

  it('ROUND TRIP: a second identical run writes nothing and leaves the bytes alone', () => {
    // The synthetic write-if-changed test compares two in-memory payloads.
    // This exercises the real path — write, JSON.parse back off disk, compare
    // — because that is the run that must produce no commit. If the round
    // trip perturbs key order or number formatting, the file is dirty every
    // 2h and nobody finds out until prod has thousands of empty commits.
    seedRefreshable('prufubok');
    const exportFn = () => payload(approved(5));
    expect(run({ exportFn })).toBe(0);
    const afterFirst = readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    );

    expect(run({ exportFn })).toBe(0);
    const afterSecond = readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    );
    expect(afterSecond).toBe(afterFirst);
  });
});

/**
 * D5 (§C36 B4a spec). `buildResolvedGlossary` reports
 * a preference that cannot be honoured via a top-level `integrity` field on
 * its return value — read here as `next.integrity`. That field must reach an
 * operator (the log line, outcomes[b] in the status file) and must NEVER
 * reach the persisted export: `next` is otherwise written to disk VERBATIM
 * (`fs.writeFileSync(outPath, JSON.stringify(next, ...))`), so without an
 * explicit strip at that one call site, `integrity` would leak into
 * glossary-unified.json on the very first write following a preference fault
 * — exactly the "producer-fingerprint adjacent" risk this slice was warned
 * about. These tests measure the write, not just the return value.
 */
describe('runGlossaryExport — D5: integrity report reaches an operator, never the payload', () => {
  it('does not add `integrity` to the persisted export, but logs it and records it in outcomes[b]', () => {
    seedRefreshable('prufubok');
    const logs = [];
    const code = run({
      exportFn: () => ({ ...payload(approved(2)), integrity: { 'preference-term-missing': 3 } }),
      log: (m) => logs.push(m),
    });
    expect(code).toBe(0);

    // The write itself: the payload gains no key.
    const written = readExport('prufubok');
    expect(written).not.toHaveProperty('integrity');
    expect(written.terms).toHaveLength(2);

    // The per-book log line: names the counting unit, not a bare integer.
    expect(logs.join('\n')).toContain(
      'integrity faults (census strings): {"preference-term-missing":3}'
    );

    // outcomes[b] in the status file.
    const status = JSON.parse(
      readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    expect(status.books.prufubok.integrity).toEqual({ 'preference-term-missing': 3 });
  });

  it('omits `integrity` from outcomes[b] entirely when there is nothing to report', () => {
    seedRefreshable('prufubok');
    run({ exportFn: () => payload(approved(2)) });
    const status = JSON.parse(
      readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    expect(status.books.prufubok).not.toHaveProperty('integrity');
  });

  it('reports integrity faults on a REFUSAL path too — today all four production books refuse before ever reaching a write', () => {
    // No baseline at all -> refused-absent-baseline (§C21), the state most of
    // production is in right now. The report must still surface here, or an
    // operator watching only the books that currently refuse would never see
    // it.
    seedBook('prufubok');
    const errors = [];
    const code = run({
      exportFn: () => ({ ...payload(approved(2)), integrity: { 'preference-out-of-scope': 1 } }),
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(0);
    expect(errors.join('\n')).toContain(
      'integrity faults (census strings): {"preference-out-of-scope":1}'
    );
    const status = JSON.parse(
      readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    expect(status.books.prufubok.outcome).toBe('refused-absent-baseline');
    expect(status.books.prufubok.integrity).toEqual({ 'preference-out-of-scope': 1 });
  });

  // Pins the `extra` parameter threaded through `fail()`: of the four
  // `fail()` call sites, this is the only one reached AFTER `next` (and so
  // `integrityNote`/`integrityField`) exists — an EACCES on the EXISTING
  // file is a genuine environment error, unrelated to `next`'s content, but
  // the report is already in hand by then and there is no reason to
  // withhold it just because this outcome is 'error' rather than a refusal.
  it('reports integrity faults on the readExisting-throws ERROR path too', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(1))));
    const outPath = path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json');
    chmodSync(outPath, 0o000);
    const errors = [];
    try {
      const code = run({
        exportFn: () => ({ ...payload(approved(2)), integrity: { 'dangling-merge': 2 } }),
        logError: (m) => errors.push(m),
      });
      expect(code).toBe(1);
      expect(errors.join('\n')).toContain(
        'integrity faults (census strings): {"dangling-merge":2}'
      );
      const status = JSON.parse(
        readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
      );
      expect(status.books.prufubok.outcome).toBe('error');
      expect(status.books.prufubok.integrity).toEqual({ 'dangling-merge': 2 });
    } finally {
      chmodSync(outPath, 0o644);
    }
  });
});

/**
 * ⚠️ THE D5 CHANNEL WAS PINNED ON BOTH SIDES WITH A STUB IN THE MIDDLE
 * (whole-branch review, 2026-08-09). Every test in the block above injects
 * `integrity: {...}` as a LITERAL from a hand-written `exportFn`, and
 * resolvedGlossary.test.js asserts `out.integrity` but never reaches
 * `export-terminology.js`. So both halves were green while nothing measured
 * that a code produced by the RESOLVER survives the whole way to an operator.
 * That is this repo's named failure mode — two checks that pass for the right
 * reason individually and leave the join untested.
 *
 * This test removes the stub: a real migrated database, a real preference
 * fault, the real `buildResolvedGlossary` as `exportFn`, and the assertion is
 * on `runGlossaryExport`'s own operator-facing output.
 *
 * ⚠️ The fault is `preference-not-a-candidate` — a real `concept_term` row on
 * the WRONG concept — chosen because it needs no `foreign_keys = OFF` trickery:
 * `book_term_preference.term_id` REFERENCES `concept_term(id)`, and this fixture
 * satisfies that constraint honestly.
 */
describe('runGlossaryExport — D5 END TO END: a resolver fault reaches the operator, no stub', () => {
  const require2 = createRequire(import.meta.url);
  const freshMigratedDb = require2('./helpers/freshMigratedDb');
  const { buildResolvedGlossary } = require2('../lib/resolvedGlossary');

  /** A book whose 'atom' preference names a term belonging to another concept. */
  function realDbWithPreferenceFault({ withPreference }) {
    const { db } = freshMigratedDb();
    db.prepare(
      "INSERT INTO registered_books (slug, title_is, registered_by) VALUES ('prufubok', 'Prufubók', 'test')"
    ).run();
    const bookId = db.prepare("SELECT id FROM registered_books WHERE slug = 'prufubok'").get().id;
    db.prepare(
      "INSERT INTO book_domain_priority (book_id, domain, position) VALUES (?, 'chemistry', 1)"
    ).run(bookId);

    const mk = (en, is) => {
      const cid = db
        .prepare("INSERT INTO concept (domain, collection) VALUES ('chemistry', 'TEST')")
        .run().lastInsertRowid;
      db.prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
      ).run(cid, en);
      return Number(
        db
          .prepare(
            "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, 1, 'test')"
          )
          .run(cid, is).lastInsertRowid
      );
    };
    mk('atom', 'frumeind');
    const otherTermId = mk('bond', 'tengi'); // a REAL term row — on the wrong concept

    if (withPreference) {
      db.prepare(
        'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
      ).run(bookId, 'atom', otherTermId);
    }
    return db;
  }

  const realExportFn = (db) => (slug) =>
    buildResolvedGlossary(db, slug, { census: { strings: ['atom'], filesRead: 1, root: '/fake' } });

  it('a preference fault from resolve() reaches the log line and outcomes[b] — real resolver, real DB', () => {
    const db = realDbWithPreferenceFault({ withPreference: true });
    // No committed file -> refused-absent-baseline (§C21), which is the state
    // every production book is in right now, and it reports via logError.
    seedBook('prufubok');
    const errors = [];
    const code = run({ exportFn: realExportFn(db), logError: (m) => errors.push(m) });

    expect(code).toBe(0);
    // THE JOIN: this string was produced by conceptResolver.resolve(), counted
    // by buildResolvedGlossary, and formatted by export-terminology.js.
    expect(errors.join('\n')).toContain(
      'integrity faults (census strings): {"preference-not-a-candidate":1}'
    );
    const status = JSON.parse(
      readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    expect(status.books.prufubok.integrity).toEqual({ 'preference-not-a-candidate': 1 });
    db.close();
  });

  // ⚠️ THE CONTROL. Without it, a run that reported this note for ANY payload —
  // or a fixture that was broken for some unrelated reason — would look like a
  // pass. Same database, same census, same book: only the preference row is
  // gone, and the note must vanish with it.
  it('CONTROL: the identical run with NO preference row reports no integrity note at all', () => {
    const db = realDbWithPreferenceFault({ withPreference: false });
    seedBook('prufubok');
    const errors = [];
    const code = run({ exportFn: realExportFn(db), logError: (m) => errors.push(m) });

    expect(code).toBe(0);
    expect(errors.join('\n')).not.toContain('integrity faults');
    const status = JSON.parse(
      readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
    );
    // Still the same refusal — so the run really did happen and really did
    // reach the same code path as the test above.
    expect(status.books.prufubok.outcome).toBe('refused-absent-baseline');
    expect(status.books.prufubok).not.toHaveProperty('integrity');
    db.close();
  });
});

describe('runGlossaryExport — shrink guard', () => {
  // REVISED 2026-08-05 (C14 ② step 5, decision D2): the exit code was 1 —
  // a refusal was counted as a failure. It is now 0. The refusal itself is
  // unchanged and still pinned below ("writes nothing"); what changed is only
  // how the RUN reports it, because an all-or-nothing failure counter let one
  // book's correct refusal suppress the health signal for every other book.
  it('refuses a catastrophic shrink, writes nothing, and returns 0 (a refusal is not an error, D2)', () => {
    const before = JSON.stringify(payload(approved(617)));
    seedBook('prufubok', before);
    const code = run({ exportFn: () => payload(approved(3)) });
    expect(code).toBe(0);
    const after = readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    );
    expect(after).toBe(before);
  });

  it('states BOTH the total-term count and the approved-term count, not one pair reported twice', () => {
    // Whole-branch adversarial review (2026-07-28), ROUND 4, IMPORTANT: this
    // test used to be named "logs both counts when it refuses" and used
    // approved(617) -> approved(3), where total === approved on BOTH sides
    // by construction — so `toMatch(/617/)` and `toMatch(/3/)` were each
    // satisfied by the SAME single pair of numbers, not by two distinct
    // pairs. Verified: rewriting the source message to emit only the
    // approved pair (dropping the total pair entirely) left the old
    // assertions green. mixed() holds total and approved independent, so
    // this pins the actual, exact message shape — both pairs, not a
    // coincidental match.
    seedBook('prufubok', JSON.stringify(payload(mixed(1117, 617))));
    const errors = [];
    run({
      exportFn: () => payload(mixed(900, 300)),
      logError: (m) => errors.push(m),
    });
    expect(errors.join('\n')).toBe(
      'prufubok: REFUSING to write — terms would fall 1117 → 900 (approved 617 → 300). ' +
        'The committed file may come from a different producer (tools/merge-glossary.js). ' +
        'Investigate, then pass --force if the shrink is intended.'
    );
  });

  it('--force overrides the refusal and writes', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    expect(run({ exportFn: () => payload(approved(3)), force: true })).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(3);
  });

  it('does NOT treat an unreadable existing export as "no baseline"', () => {
    // EACCES must never read as "nothing to lose". If it did, the shrink
    // guard would stand down on precisely the file it exists to protect.
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    const outPath = path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json');
    chmodSync(outPath, 0o000);
    try {
      const code = run({ exportFn: () => payload(approved(3)) });
      expect(code).toBe(1);
      expect(heartbeatExists()).toBe(false);
    } finally {
      chmodSync(outPath, 0o644);
    }
  });

  it('an unreadable book does not skip the books after it', () => {
    seedBook('bok-a', JSON.stringify(payload(approved(10))));
    seedRefreshable('bok-b');
    const aPath = path.join(root, 'books', 'bok-a', 'glossary', 'glossary-unified.json');
    chmodSync(aPath, 0o000);
    try {
      const code = run({ exportFn: () => payload(approved(9)) });
      expect(code).toBe(1);
      expect(readExport('bok-b').terms).toHaveLength(9);
    } finally {
      chmodSync(aPath, 0o644);
    }
  });
});

describe('runGlossaryExport — malformed exportFn payload', () => {
  // Round 1 (register C14 follow-up 5, see glossaryExportDecision.test.js's
  // "clause isolation" note) replaced direct `next.terms.length` reads with
  // `countTerms(next)`, which is deliberately tolerant of a missing/malformed
  // `terms` array. That tolerance is correct for `prev` — a corrupt EXISTING
  // file must not wedge the exporter, see readExisting above — but wrong for
  // `next`: shrinkVerdict.refuse stays false whenever there is no baseline to
  // protect (`prev === null`, e.g. a book's first export), so a malformed
  // exportFn return used to be written to disk as-is: exit 0, zero errors
  // logged, glossary-unified.json reduced to a file with no terms at all.
  // These pin the shape guard that turns that into a loud per-book failure
  // instead (whole-branch adversarial review, round 3, 2026-07-28).
  const malformedPayloads = [
    ['no terms property at all', { generated: 'x', book: 'bok-a', stats: {} }],
    [
      'terms is a string, not an array',
      { generated: 'x', book: 'bok-a', stats: {}, terms: 'not an array' },
    ],
    ['the whole payload is null', null],
  ];

  it.each(malformedPayloads)(
    '%s: refuses, writes nothing, withholds the heartbeat, and still processes later books',
    (_label, badPayload) => {
      seedBook('bok-a');
      seedRefreshable('bok-b');
      const errors = [];
      const seen = [];
      const code = run({
        exportFn: (slug) => {
          seen.push(slug);
          return slug === 'bok-a' ? badPayload : payload(approved(9));
        },
        logError: (m) => errors.push(m),
      });
      expect(code).toBe(1);
      // Not toEqual(['bok-a', 'bok-b']): listBooks does no sort, so book
      // discovery order is a readdirSync artifact, not a contract. The
      // property being pinned is "bok-b ran too", not "bok-b ran second".
      expect(seen).toHaveLength(2);
      expect(seen).toContain('bok-a');
      expect(seen).toContain('bok-b');
      expect(
        existsSync(path.join(root, 'books', 'bok-a', 'glossary', 'glossary-unified.json'))
      ).toBe(false);
      expect(readExport('bok-b').terms).toHaveLength(9);
      expect(heartbeatExists()).toBe(false);
      expect(errors.join('\n')).toMatch(/bok-a/);
    }
  );

  it('does not overwrite an existing export, and the error names the malformation (not just "shrink")', () => {
    // With an existing baseline, the pre-existing shrink guard would ALSO
    // refuse this payload (countApproved(next) === 0 < 5 * 0.5) — so a bare
    // exit-code/no-write assertion here would pass even without the shape
    // guard added in this round. Asserting the error text distinguishes
    // "the new shape guard fired first" from "the old shrink guard happened
    // to catch it too".
    const before = JSON.stringify(payload(approved(5)));
    seedBook('bok-a', before);
    const errors = [];
    const code = run({
      exportFn: () => ({ generated: 'x', book: 'bok-a', stats: {} }),
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(1);
    expect(errors.join('\n')).toMatch(/malformed/i);
    const after = readFileSync(
      path.join(root, 'books', 'bok-a', 'glossary', 'glossary-unified.json'),
      'utf8'
    );
    expect(after).toBe(before);
  });
});

describe('describeMalformedPayload branches, via the malformed-payload error message', () => {
  // Whole-branch adversarial review (2026-07-28), ROUND 4, MINOR: verified
  // that replacing describeMalformedPayload's whole body with `return '?'`
  // left the pre-existing malformed-payload suite green — none of it pinned
  // this function's actual output. It was also worse than the
  // JSON.stringify it replaced: {terms: null} and {terms: {}} produced the
  // IDENTICAL message (the classic `typeof null === 'object'` wart), and a
  // renamed key (e.g. {glossary: [...]}) gave no hint what the payload
  // actually contained — exactly the clue an operator needs to spot a
  // refactor that renamed the field. These pin the DISTINCT fragment for
  // each shape, including the array and primitive branches, which were
  // never exercised at all before this round.
  const cases = [
    ['an array', [1, 2, 3], 'got an array, not an object with a terms property'],
    ['a bare string', 'oops', 'got string'],
    ['a bare number', 42, 'got number'],
    [
      'terms: null (no longer collides with terms: {})',
      { terms: null },
      "got an object whose 'terms' is null, not an array",
    ],
    [
      'terms: {} — a non-array object (no longer collides with terms: null)',
      { terms: {} },
      "got an object whose 'terms' is object, not an array",
    ],
    [
      "a renamed key (glossary instead of terms) reveals the payload's own keys",
      { glossary: ['x'] },
      "got an object with no 'terms' property (has keys [glossary])",
    ],
  ];

  it.each(cases)('%s', (_label, badPayload, expectedFragment) => {
    seedBook('bok-a');
    const errors = [];
    const code = run({
      exportFn: () => badPayload,
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain(expectedFragment);
  });
});

describe('runGlossaryExport — book parameter selects by `=== null`, not truthiness', () => {
  // Whole-branch adversarial review (2026-07-28), ROUND 4, IMPORTANT: the
  // consumer-side half of the same finding pinned in the `parseArgs`
  // describe block above. parseArgs is not the only way to reach
  // runGlossaryExport — it is called directly here in every test in this
  // file, and could be called directly by a future caller that builds
  // `options` itself — so the widen-to-"all books" hazard must be closed
  // here too, independent of whatever parseArgs now rejects.
  it('book: "" does not widen to every book — it is treated as one (missing) book, not "all books"', () => {
    seedBook('bok-a');
    seedBook('bok-b');
    const seen = [];
    const errors = [];
    const code = run({
      book: '',
      exportFn: (slug) => {
        seen.push(slug);
        return payload(approved(1));
      },
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(1);
    expect(seen).toHaveLength(0); // neither bok-a nor bok-b was ever exported
    expect(errors.join('\n')).toMatch(/no glossary directory/);
  });

  it('book: "   " (whitespace-only) does not widen to every book either', () => {
    seedBook('bok-a');
    seedBook('bok-b');
    const seen = [];
    const code = run({
      book: '   ',
      exportFn: (slug) => {
        seen.push(slug);
        return payload(approved(1));
      },
    });
    expect(code).toBe(1);
    expect(seen).toHaveLength(0);
  });

  it('book: null (the documented "all books" sentinel) still exports every book', () => {
    // Companion positive case: proves the fix didn't also break the
    // legitimate all-books path by, say, requiring truthiness AND null.
    seedBook('bok-a');
    seedBook('bok-b');
    const seen = [];
    const code = run({
      book: null,
      exportFn: (slug) => {
        seen.push(slug);
        return payload(approved(1));
      },
    });
    expect(code).toBe(0);
    expect(seen.sort()).toEqual(['bok-a', 'bok-b']);
  });
});

describe('runGlossaryExport — book-subject-mapping guard', () => {
  // Only migration 032 has ever inserted book_subject_mapping rows, once, for
  // five hardcoded slugs. A book registered since then has no row, and
  // exportBookGlossary's subject filter is a no-op when bookSubject is null —
  // it would export every non-rejected translation across every subject. This
  // guard refuses that instead of silently priming MT (and the render path)
  // from a cross-subject corpus.
  // REVISED 2026-08-05 (C14 ② step 5, decision D2). Was "counts it as a
  // failure": exit 1 and no heartbeat. A missing subject mapping is a book
  // this exporter correctly declines to touch, not a broken exporter — the
  // run is healthy, and the two assertions that matter (nothing written, the
  // book named in the log) are unchanged. The heartbeat expectation INVERTED
  // for the same reason as the sibling in the heartbeat-contract block below.
  it('skips a book with no book_subject_mapping row, records it as refused-no-mapping, and writes nothing', () => {
    seedBook('bok-a');
    const code = run({
      subjectFn: () => null,
      exportFn: () => payload(approved(5)),
    });
    expect(code).toBe(0);
    expect(existsSync(path.join(root, 'books', 'bok-a', 'glossary', 'glossary-unified.json'))).toBe(
      false
    );
    expect(heartbeatExists()).toBe(true);
  });

  it('logs the book slug when refusing for lack of a subject mapping', () => {
    seedBook('bok-a');
    const errors = [];
    run({
      subjectFn: () => null,
      exportFn: () => payload(approved(5)),
      logError: (m) => errors.push(m),
    });
    expect(errors.join('\n')).toMatch(/bok-a/);
    expect(errors.join('\n')).toMatch(/book_subject_mapping/);
  });

  it('still processes later books after skipping an unmapped one', () => {
    seedBook('bok-a');
    seedRefreshable('bok-b');
    const seen = [];
    const code = run({
      subjectFn: (slug) => (slug === 'bok-a' ? null : 'chemistry'),
      exportFn: (slug) => {
        seen.push(slug);
        return payload(approved(9));
      },
    });
    // REVISED 2026-08-05 (C14 ② step 5, decision D2): was `toBe(1)` with the
    // comment "bok-a failed". bok-a is REFUSED, not failed, so the run exits
    // 0. The property this test actually exists to pin — the loop does not
    // abort at the unmapped book — is untouched and is what `seen` asserts.
    expect(code).toBe(0); // bok-a refused (not an error); bok-b succeeded
    expect(seen).toEqual(['bok-b']);
    expect(readExport('bok-b').terms).toHaveLength(9);
  });

  it('a book WITH a subject mapping exports normally', () => {
    seedRefreshable('bok-a');
    const code = run({
      subjectFn: () => 'chemistry',
      exportFn: () => payload(approved(5)),
    });
    expect(code).toBe(0);
    expect(readExport('bok-a').terms).toHaveLength(5);
  });
});

describe('runGlossaryExport — exit code and heartbeat contract', () => {
  it('writes the heartbeat on a fully healthy run', () => {
    // ⚠️ seedRefreshable, NOT seedBook. With a bare seed the run is a §C21
    // refusal, which ALSO writes the heartbeat (decision D2) — so this passed
    // while testing the opposite of its name. "Fully healthy" must mean a
    // successful write, so the write is now asserted alongside the heartbeat.
    seedRefreshable('prufubok');
    run({ exportFn: () => payload(approved(5)) });
    expect(readExport('prufubok').terms).toHaveLength(5);
    expect(heartbeatExists()).toBe(true);
  });

  it('writes the heartbeat when every book was legitimately unchanged', () => {
    // "Nothing changed" is a working exporter, not a stalled one — same
    // semantics as git-backup.sh's no_changes healthy path.
    seedBook('prufubok', JSON.stringify(payload(approved(5))));
    run({ exportFn: () => payload(approved(5)) });
    expect(heartbeatExists()).toBe(true);
  });

  // ⚠️ INVERTED 2026-08-05 (C14 ② step 5, decision D2). This asserted
  // `toBe(false)` — a refused book withheld the global heartbeat. That is the
  // defect being fixed, not a property being preserved: a refusal is a
  // CORRECT outcome (the guard did its job), and treating it as a failure
  // meant one book's correct refusal marked the exporter unhealthy for every
  // other book. Measured in production on 2026-08-03: /api/health read
  // glossary_export ok=false continuously — because liffraedi-2e was
  // legitimately refusing — straight through the run that wrote and pushed
  // new reader-visible glossaries for the other two books. The alarm was
  // already ringing, for a reason nobody was acting on, at the moment the
  // real event happened. Kept rather than deleted so the reversal is visible.
  // Liveness is still pinned in the opposite direction by its sibling below:
  // an ERROR does withhold the heartbeat.
  it('DOES write the heartbeat when a book was refused — a refusal is a correct outcome (D2)', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    run({ exportFn: () => payload(approved(3)) });
    expect(heartbeatExists()).toBe(true);
  });

  it('does NOT write the heartbeat when the exporter threw', () => {
    seedBook('prufubok');
    const code = run({
      exportFn: () => {
        throw new Error('DB is locked');
      },
    });
    expect(code).toBe(1);
    expect(heartbeatExists()).toBe(false);
  });

  it('does NOT write the heartbeat on a --book run, even when fully healthy', () => {
    // The heartbeat is the GLOBAL "the exporter is healthy" signal read by
    // GET /api/health. A single-book run resolving healthily says nothing
    // about the other books, so it must not stamp the global heartbeat — a
    // lead hand-running one book (e.g. investigating a broken cron) would
    // otherwise flip /api/health green for six hours mid-investigation.
    seedBook('bok-a');
    const code = run({ book: 'bok-a', exportFn: () => payload(approved(5)) });
    expect(code).toBe(0);
    expect(heartbeatExists()).toBe(false);
  });

  it('processes remaining books after one is refused, and the run stays healthy', () => {
    // Parked minor from the Task 4 per-task review, resolved 2026-07-28: this
    // test asserted the exit code and bok-b's content but not the heartbeat —
    // the mechanism was covered only in ISOLATION, by the single-book-refusal
    // test above.
    //
    // REVISED 2026-08-05 (C14 ② step 5, decision D2). It used to read: "the
    // combined case (one book refused, one succeeded) is exactly where a
    // naive implementation might write the heartbeat because 'something
    // succeeded'; it must not". Under D2 that is backwards for a REFUSAL —
    // one book correctly declining says nothing bad about the exporter, so
    // the heartbeat is now expected. The original property is NOT lost: it
    // was really about a bad book not being papered over by a good one, and
    // that is still pinned for genuine errors by the malformed-payload
    // it.each above (bok-a malformed + bok-b written => heartbeat false) and
    // by 'does NOT write the heartbeat when the exporter threw'.
    seedBook('bok-a', JSON.stringify(payload(approved(617))));
    seedRefreshable('bok-b');
    const code = run({
      exportFn: (slug) => (slug === 'bok-a' ? payload(approved(3)) : payload(approved(9))),
    });
    expect(code).toBe(0); // bok-a refused (not an error)
    expect(readExport('bok-b').terms).toHaveLength(9); // bok-b still ran
    expect(heartbeatExists()).toBe(true);
  });

  it('returns 1 and writes no heartbeat when NO books are discovered', () => {
    // An empty set means book discovery is broken, not that there is no
    // work. Reporting healthy here would hide a mis-resolved booksDir
    // forever — the exact shape of failure the health check exists to catch.
    mkdirSync(path.join(root, 'books'), { recursive: true });
    expect(run({ exportFn: () => payload(approved(5)) })).toBe(1);
    expect(heartbeatExists()).toBe(false);
  });

  it('only exports books that have a glossary directory', () => {
    seedBook('med-glossary');
    mkdirSync(path.join(root, 'books', 'an-glossary'), { recursive: true });
    const seen = [];
    run({
      exportFn: (slug) => {
        seen.push(slug);
        return payload(approved(1));
      },
    });
    expect(seen).toEqual(['med-glossary']);
  });

  it('--book targets a single book', () => {
    seedBook('bok-a');
    seedBook('bok-b');
    const seen = [];
    run({
      book: 'bok-a',
      exportFn: (slug) => {
        seen.push(slug);
        return payload(approved(1));
      },
    });
    expect(seen).toEqual(['bok-a']);
  });

  it('--book on a slug with no glossary directory fails instead of creating one', () => {
    // The write path mkdirSync's recursively, so without this check a typo'd
    // slug would CREATE books/<typo>/glossary/ and write an empty export
    // there — and the shrink guard could not stop it, because a brand new
    // path has no baseline to compare against. This is the same dev-box
    // foot-gun the shrink guard exists to prevent, arriving through the one
    // door the guard does not cover.
    mkdirSync(path.join(root, 'books'), { recursive: true });
    let called = false;
    const code = run({
      book: 'innslattarvilla',
      exportFn: () => {
        called = true;
        return payload(approved(5));
      },
    });
    expect(code).toBe(1);
    expect(called).toBe(false);
    expect(existsSync(path.join(root, 'books', 'innslattarvilla'))).toBe(false);
    expect(heartbeatExists()).toBe(false);
  });
});

describe('runGlossaryExport — dry run', () => {
  it('writes neither the export nor the heartbeat', () => {
    // ⚠️ seedRefreshable, NOT seedBook. With a bare seed this test passed
    // WITHOUT EVER REACHING THE DRY-RUN BRANCH: the §C21 absent-baseline gate
    // sits before `if (dryRun)`, so the run short-circuited at
    // refused-absent-baseline and "no file was written" was true for a reason
    // that has nothing to do with --dry-run. Caught by the C21 whole-branch
    // review — the exact defect class this file exists to prevent.
    seedRefreshable('prufubok');
    const before = readExport('prufubok').terms.length;
    expect(run({ exportFn: () => payload(approved(5)), dryRun: true })).toBe(0);
    // Reaching the dry-run branch is now ASSERTED, not assumed: the baseline
    // is still on disk unchanged, so nothing was written over it.
    expect(readExport('prufubok').terms).toHaveLength(before);
    expect(heartbeatExists()).toBe(false);
  });

  it('still reports what the shrink guard would do (refusal fires even under --dry-run)', () => {
    // NOTE: a catastrophic shrink hits the REFUSAL branch (logError) even
    // with dryRun:true — the shrink-guard check runs before the dryRun
    // check in runGlossaryExport, so this exercises the refusal message,
    // not the "[dry-run] would write" message pinned below.
    //
    // REVISED 2026-08-05 (C14 ② step 5, decision D2): was `toBe(1)`. The
    // refusal still fires under --dry-run — which is the whole point of this
    // test, and is what the message assertion pins — but a refusal is no
    // longer an error, so the run exits 0.
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    const errors = [];
    const code = run({
      exportFn: () => payload(approved(3)),
      dryRun: true,
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(0);
    expect(errors.join('\n')).toMatch(/617/);
  });

  it('the healthy "[dry-run] would write" message states BOTH the total and approved counts', () => {
    // Whole-branch adversarial review (2026-07-28), ROUND 4, IMPORTANT: this
    // message had NO test at all before this round — not even a `toMatch`.
    // The sibling test above only exercises the REFUSAL message (logError);
    // this is the actually-distinct `log()` line printed for a legitimate,
    // non-refused change under --dry-run. mixed() holds total and approved
    // independent so all four numbers in the pinned string are distinct,
    // proving both pairs are really reported (not one pair twice).
    seedBook('prufubok', JSON.stringify(payload(mixed(1117, 617))));
    const logs = [];
    const code = run({
      exportFn: () => payload(mixed(1000, 560)),
      dryRun: true,
      log: (m) => logs.push(m),
    });
    expect(code).toBe(0);
    expect(logs.join('\n')).toBe(
      '[dry-run] prufubok: would write terms 1117 → 1000 (approved 617 → 560)'
    );
  });
});

describe('parseArgs', () => {
  it('parses --book with a value', () => {
    expect(parseArgs(['--book', 'efnafraedi-2e'])).toEqual({
      book: 'efnafraedi-2e',
      dryRun: false,
      force: false,
      adopt: false,
      help: false,
      error: null,
    });
  });

  it('parses --dry-run with no --book', () => {
    expect(parseArgs(['--dry-run'])).toEqual({
      book: null,
      dryRun: true,
      force: false,
      adopt: false,
      help: false,
      error: null,
    });
  });

  // ── Override scoping (register §C14 ② decision 5, 2026-08-07) ────────────
  //
  // Bare `--adopt` / `--force` are the act-on-EVERY-book forms. Against prod's
  // committed state a bare `--adopt` reproduces the 2026-08-03 incident's
  // writes — same books, same numbers — in one command, and migration 044
  // WIDENED that blast radius: remapping lifraen-efnafraedi onto `chemistry`
  // makes its export payload byte-equivalent to chemistry's, which clears the
  // shrink gate it used to fail with certainty (1117 → 0). The system also
  // PRINTS the unscoped form in its own producer-refusal remedy. Requiring
  // `--book` is what keeps a copy-paste from becoming a corpus-wide swap.
  it('rejects --adopt without --book', () => {
    expect(parseArgs(['--adopt']).error).toMatch(/--adopt.*--book/s);
  });

  it('rejects --force without --book', () => {
    expect(parseArgs(['--force']).error).toMatch(/--force.*--book/s);
  });

  it('rejects --adopt without --book even when --dry-run is present', () => {
    expect(parseArgs(['--dry-run', '--adopt']).error).toBeTruthy();
  });

  it('names both overrides when both are passed unscoped', () => {
    expect(parseArgs(['--adopt', '--force']).error).toMatch(/--adopt.*--force|--force.*--adopt/s);
  });

  it('accepts --adopt when scoped with --book', () => {
    expect(parseArgs(['--book', 'efnafraedi-2e', '--adopt']).error).toBeNull();
  });

  it('accepts --force when scoped with --book', () => {
    expect(parseArgs(['--book', 'efnafraedi-2e', '--force']).error).toBeNull();
  });

  it('returns a null book when an override is rejected, so no wide run can proceed', () => {
    expect(parseArgs(['--adopt']).book).toBeNull();
  });

  it('recognizes -h and --help', () => {
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('errors when --book is the last argument (no value follows)', () => {
    const result = parseArgs(['--force', '--book']);
    expect(result.error).toMatch(/--book/);
  });

  it('does NOT silently fall back to "all books" when --book has no value', () => {
    // Regression for the exact defect: `--force --book` (flags transposed,
    // slug missing) used to leave `book` as `undefined`, and
    // runGlossaryExport's `book = null` destructuring default treats an
    // explicit undefined the same as an absent key — so the typo silently
    // meant "force-write every glossary in the repo" instead of failing.
    const result = parseArgs(['--force', '--book']);
    expect(result.error).toBeTruthy();
    expect(result.book).toBe(null);
    expect(result.force).toBe(true);
  });

  // Whole-branch adversarial review (2026-07-28), ROUND 4, IMPORTANT: this is
  // the THIRD recurrence of the same class of bug (finding 1 and the
  // unrecognised-token fix above are the first two) — a value is checked for
  // PRESENCE in one place and TRUTHINESS in another. Measured before this
  // fix: `parseArgs(['--book', '', '--force'])` returned `book: '', force:
  // true, error: null` — a clean parse — and `runGlossaryExport`'s `book ?
  // [book] : listBooks(...)` then read that empty string as falsy and
  // widened to every glossary-bearing book, with `--force` bypassing the
  // shrink guard on all of them at once. These three pin the producer side
  // (parseArgs itself); the sibling group in the "runGlossaryExport — book
  // parameter" describe block below pins the consumer side. `--force` is
  // placed BEFORE the bad `--book` token (matching the "does NOT silently
  // fall back..." test above) so it is seen and recorded before the loop
  // returns on the error — an unrecognised/erroring token still returns
  // immediately, so anything AFTER it in argv is never reached (same
  // property as the unrecognised-token tests below).
  it('errors on an empty --book value instead of silently exporting every book', () => {
    const result = parseArgs(['--force', '--book', '']);
    expect(result.error).toBeTruthy();
    expect(result.error).toMatch(/--book/);
    expect(result.book).toBe(null);
    expect(result.force).toBe(true);
  });

  it('errors on a whitespace-only --book value instead of silently exporting every book', () => {
    const result = parseArgs(['--force', '--book', '   ']);
    expect(result.error).toBeTruthy();
    expect(result.book).toBe(null);
    expect(result.force).toBe(true);
  });

  it('trims surrounding whitespace from an otherwise-valid --book value', () => {
    // So `--book ' liffraedi-2e '` cannot become a slug carrying spaces that
    // would never match a real books/<slug>/ directory.
    const result = parseArgs(['--book', '  liffraedi-2e  ']);
    expect(result.book).toBe('liffraedi-2e');
    expect(result.error).toBe(null);
  });

  it('refuses --book followed by a flag, even when transposed', () => {
    // `--book --force` (the intended `--force --book <slug>`, transposed).
    // Before B0 finding 5, parseArgs would accept the flag as the slug value,
    // so `--force` was never reached and stayed at its default (false) — a
    // caller who transposes silently loses --force AND gets a bogus slug.
    // Now the parser rejects it with an error. The sibling test
    // "does NOT silently fall back..." above pins the reverse order
    // (`--force --book`, where force IS seen before the trailing `--book`
    // errors) — this test pins the asymmetry AFTER the fix, where both orders
    // now correctly error.
    const result = parseArgs(['--book', '--force']);
    expect(result.error).toBeTruthy();
    expect(result.book).toBe(null);
    expect(result.error).toMatch(/next argument is the flag/);
  });

  // Whole-branch adversarial review (2026-07-28), CRITICAL: the trailing
  // `--book` case above closed ONE spelling. The `if`/`else if` chain had no
  // final `else`, so ANY other unrecognised token — `--book=<slug>`, a bare
  // positional slug, a typo'd flag — was silently discarded, leaving `book`
  // at its `null` default with `error: null`: an apparently-successful
  // "export every book" parse. `--force` on the same command line then
  // bypasses the shrink guard for all of them. These three pin the class of
  // fix (reject any unrecognised token), not just the one instance.

  it('errors on --book=<slug> instead of silently exporting every book', () => {
    // This script has never supported `=`-joined flags; a lead reasonably
    // guessing at the syntax must get a loud error, not "all books".
    const result = parseArgs(['--book=liffraedi-2e', '--force']);
    expect(result.error).toBeTruthy();
    expect(result.error).toMatch(/--book=liffraedi-2e/);
    expect(result.book).not.toBe('liffraedi-2e');
  });

  it('errors on a bare positional slug instead of silently exporting every book', () => {
    const result = parseArgs(['liffraedi-2e', '--force']);
    expect(result.error).toBeTruthy();
    expect(result.error).toMatch(/liffraedi-2e/);
    expect(result.book).not.toBe('liffraedi-2e');
  });

  it('errors on a misspelled flag (--books) instead of silently exporting every book', () => {
    const result = parseArgs(['--books', 'liffraedi-2e', '--force']);
    expect(result.error).toBeTruthy();
    expect(result.error).toMatch(/--books/);
  });

  it('the error message on an unrecognised token names the accepted spellings', () => {
    // The bad token here must NOT itself contain "--book" — the original
    // version of this test used `--books`, which DOES contain that
    // substring, so `toMatch(/--book/)` was satisfied by the echoed
    // offending token alone and never actually exercised whether the usage
    // text lists the accepted spelling (whole-branch adversarial review,
    // round 3, 2026-07-28).
    const result = parseArgs(['--frobnicate', 'liffraedi-2e']);
    expect(result.error).toMatch(/--book <slug>/);
    expect(result.error).toMatch(/--dry-run/);
    expect(result.error).toMatch(/--force/);
  });

  it('an unrecognised token still wins over --help, even when --help appeared FIRST and was recorded as seen', () => {
    // Corrected 2026-07-28 (whole-branch adversarial review, round 3): this
    // test used to be named "...wins over a LATER --help", but its argv has
    // `--help` FIRST, not later — the name and the body disagreed. Fixed by
    // rewriting the name/comment to match the argv, not by reordering the
    // argv, because this ordering is the more informative case: `--help` is
    // processed and recorded as seen (`help: true`) BEFORE the loop ever
    // reaches the unrecognised `--book=liffraedi-2e` token and returns with
    // `error` set. So `help` really was seen, not merely theoretically
    // reachable — and main() still checks `error` before `help`, so the
    // process exits on the error message alone and never reaches the usage
    // screen. (The reverse order — a bad token BEFORE --help — is the
    // simpler case, pinned separately below: the loop returns as soon as it
    // hits the bad token, so --help is never reached at all and `help`
    // stays at its false default.) Not a bug: the error message already
    // names every accepted spelling.
    const result = parseArgs(['--help', '--book=liffraedi-2e']);
    expect(result.error).toBeTruthy();
    expect(result.help).toBe(true);
  });

  it('an unrecognised token BEFORE --help means --help is never reached, so help stays false', () => {
    // The companion case to the one above, added per whole-branch
    // adversarial review round 3, 2026-07-28: the function's own docstring
    // (export-terminology.js, above parseArgs) asserts this ordering too —
    // "a `-h`/`--help` that appears LATER in argv is never reached" — but
    // nothing pinned it before this test. The loop hits the unrecognised
    // `--frobnicate` token first and returns immediately, so it never
    // processes the `--help` that follows: `help` stays at its `false`
    // default, unlike the FIRST-ordering case above where `help` does end
    // up `true`.
    const result = parseArgs(['--frobnicate', '--help']);
    expect(result.error).toBeTruthy();
    expect(result.help).toBe(false);
  });

  describe('parseArgs does not swallow the next flag as a value', () => {
    it.each([['--dry-run'], ['--force'], ['--adopt'], ['--help'], ['-h']])(
      'refuses --book followed by %s',
      (flag) => {
        const r = parseArgs(['--book', flag]);
        expect(r.book).toBeNull();
        expect(r.error).toMatch(/next argument is the flag/);
      }
    );

    it('names the flag it refused, so the message is actionable', () => {
      expect(parseArgs(['--book', '--adopt']).error).toContain('"--adopt"');
    });

    it('still accepts a legitimate slug', () => {
      expect(parseArgs(['--book', 'efnafraedi-2e'])).toMatchObject({
        book: 'efnafraedi-2e',
        error: null,
      });
    });

    it('allows a real path-like value beginning with -- via the ./ escape', () => {
      expect(parseArgs(['--book', './--odd'])).toMatchObject({ book: './--odd', error: null });
    });

    // ── Task 1 review findings (both confirmed by the controller) ──────────
    //
    // The brief's Step 3 snippet tested `raw.startsWith('--')` — the
    // UNTRIMMED value, and only the long-form `--` spelling. Both narrownesses
    // let the exact defect this task exists to close back in, for two
    // real spellings the brief's own test list didn't cover.

    it('Finding 1 (Important): refuses the short flag spelling -h, which this same function recognises', () => {
      // startsWith('--') is false for '-h', so the pre-fix guard fell through
      // to `value = raw.trim()` -> book='-h', help left false, error null —
      // the run then goes looking for books/-h/glossary.
      const r = parseArgs(['--book', '-h']);
      expect(r.book).toBeNull();
      expect(r.error).toMatch(/next argument is the flag/);
      expect(r.help).toBe(false);
    });

    it('Finding 2 (Minor): refuses a whitespace-padded flag-like value, not just an exact one', () => {
      // '--book " --adopt"' (leading space) fails startsWith('--') on the
      // untrimmed raw, then trim() turns it into '--adopt' and it slips
      // through as the book slug -- reproducing the exact pre-fix behaviour
      // for the flag that authorises overwriting a committed glossary.
      const r = parseArgs(['--book', ' --adopt']);
      expect(r.book).toBeNull();
      expect(r.error).toMatch(/next argument is the flag/);
      expect(r.adopt).toBe(false);
    });

    it('generalises the escape-hatch wording from -- to -, since any leading dash is now rejected', () => {
      expect(parseArgs(['--book', '-h']).error).toMatch(/beginning with '-'/);
    });

    // ── Regression guards: the generalised check must not disturb these ────

    it('regression: --book "   " (whitespace-only) is still refused as empty, not as a flag', () => {
      const r = parseArgs(['--book', '   ']);
      expect(r.book).toBeNull();
      expect(r.error).toMatch(/non-empty value/);
      expect(r.error).not.toMatch(/next argument is the flag/);
    });

    it('regression: the ./ escape hatch still parses a real leading-dash slug', () => {
      expect(parseArgs(['--book', './--odd'])).toMatchObject({ book: './--odd', error: null });
    });
  });
});

describe('runGlossaryExport — producer gate (C14 ② step 4)', () => {
  const legacyFile = () =>
    JSON.stringify({ generated: 'x', book: 'prufubok', stats: {}, terms: legacyTerms(1117) });

  it('refuses to overwrite a merge-glossary file, writes nothing, and returns 0', () => {
    seedBook('prufubok', legacyFile());
    const errors = [];
    const code = run({
      exportFn: () => exportPayload(approved(709)),
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(0); // a refusal is correct, not an error (D2)
    expect(readExport('prufubok').terms).toHaveLength(1117); // untouched
    expect(errors.join('\n')).toMatch(/merge-glossary/);
  });

  it('the refusal message does NOT lead with a shrink ratio — the counts measure different things', () => {
    // ⚠️ TWO deliberate strengthenings over the drafted version of this test,
    // which used exportPayload(approved(709)) and asserted only /producer/i.
    //
    // 1. 709 does NOT trip the shrink gate (709 > 1117 * 0.5), so only ONE
    //    gate could ever fire and the producer message would be emitted
    //    whichever order the two gates ran in — the ordering this test exists
    //    to pin would have gone untested. 100 trips BOTH.
    // 2. /producer/i alone cannot tell the two messages apart: the SHRINK
    //    refusal also says "may come from a different producer
    //    (tools/merge-glossary.js)". The negative assertions are what
    //    actually distinguish them.
    seedBook('prufubok', legacyFile());
    const errors = [];
    run({ exportFn: () => exportPayload(approved(100)), logError: (m) => errors.push(m) });
    expect(errors.join('\n')).toMatch(/producer/i);
    expect(errors.join('\n')).not.toMatch(/would fall/); // the shrink message's wording
    expect(errors.join('\n')).not.toMatch(/1117 → 100/); // no ratio between unlike counts
  });

  // Register §C14 ② decision 5. The absent-baseline refusal already prints
  // `--adopt --book <slug>`; this one printed a bare `--adopt`, i.e. the
  // act-on-EVERY-book form. That is the same shape §C21(c) recorded for
  // `stjornufraedi`: THE REMEDY THE SYSTEM PRINTS IS THE TRIGGER. It matters
  // more since migration 044 — remapping lifraen-efnafraedi onto `chemistry`
  // cleared the shrink gate that used to refuse it with certainty, so the
  // unscoped command the message invited became destructive for that book.
  it('the producer refusal names --book in its remedy, not a bare --adopt', () => {
    seedBook('prufubok', legacyFile());
    const errors = [];
    run({ exportFn: () => exportPayload(approved(709)), logError: (m) => errors.push(m) });
    expect(errors.join('\n')).toMatch(/--adopt --book prufubok/);
  });

  it('--adopt migrates the book and writes', () => {
    seedBook('prufubok', legacyFile());
    const code = run({ exportFn: () => exportPayload(approved(709)), adopt: true });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(709);
    expect(readExport('prufubok').producer).toBe('export-terminology');
  });

  it('--adopt does NOT bypass the shrink gate — two risks, two acknowledgements', () => {
    // Same producer on both sides, so only the shrink gate can fire.
    seedBook('prufubok', JSON.stringify(exportPayload(approved(1000))));
    const code = run({ exportFn: () => exportPayload(approved(10)), adopt: true });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(1000); // refused, untouched
  });

  it('--force does NOT bypass the producer gate either', () => {
    seedBook('prufubok', legacyFile());
    const code = run({ exportFn: () => exportPayload(approved(709)), force: true });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(1117); // refused, untouched
  });

  it('an already-adopted book exports normally with no flags', () => {
    seedBook('prufubok', JSON.stringify(exportPayload(approved(10))));
    const code = run({ exportFn: () => exportPayload(approved(12)) });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(12);
  });

  it('a PRE-STAMP export file vs a freshly stamped one with identical terms is UNCHANGED, not rewritten', () => {
    // ⚠️ THE PATH EVERY ALREADY-ADOPTED BOOK TAKES ON THE FIRST CRON RUN AFTER
    // THIS SHIPS. The committed file was written by an export that predates
    // the top-level `producer` stamp (Task 3), so its terms carry `subjects`
    // but the payload has no `producer` key; the fresh export has both. Both
    // sides must still fingerprint as export-terminology — the stamp is a
    // shortcut, the term shape is the fallback — or the gate would refuse
    // every book at once. And sameTerms must still see them as equal, or
    // every book would be rewritten and re-committed every 2h forever.
    //
    // Task 3 covered this at the unit level (detectProducer/producerVerdict);
    // this is the runner-level version, where a wrong answer reaches git.
    //
    // The log assertion is load-bearing, not decoration: a REFUSAL would also
    // leave the file untouched and also return 0, so exit-code-plus-bytes
    // alone cannot tell "unchanged" from "refused-producer". Only the message
    // distinguishes them.
    const terms = approved(10);
    // eslint-disable-next-line no-unused-vars
    const { producer, ...preStamp } = exportPayload(terms, '2026-01-01T00:00:00.000Z');
    const before = JSON.stringify(preStamp, null, 2) + '\n';
    seedBook('prufubok', before);

    const logs = [];
    const errors = [];
    const code = run({
      exportFn: () => exportPayload(terms, '2026-08-05T09:00:00.000Z'),
      log: (m) => logs.push(m),
      logError: (m) => errors.push(m),
    });

    expect(code).toBe(0);
    expect(errors.join('\n')).toBe(''); // the producer gate did NOT fire
    expect(logs.join('\n')).toMatch(/unchanged/);
    const after = readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    );
    expect(after).toBe(before); // byte-identical: not rewritten, so no commit
  });
});

describe('runGlossaryExport — refusals are not errors (D2)', () => {
  it('writes the heartbeat across a run where every book refused', () => {
    seedBook('prufubok', JSON.stringify({ terms: legacyTerms(100) }));
    const code = run({ exportFn: () => exportPayload(approved(50)) });
    expect(code).toBe(0);
    // ⚠️ The untouched-file assertion is what makes this test mean anything.
    // 50 is not < 100 * 0.5, so the SHRINK gate does not fire here — without
    // this line the export would simply succeed and the heartbeat would be
    // written for the ordinary reason, and the test would pass while proving
    // nothing about refusals. Verified: it passed on the pre-gate code.
    expect(readExport('prufubok').terms).toHaveLength(100); // refused, untouched
    expect(heartbeatExists()).toBe(true);
  });

  it('still withholds the heartbeat when a book ERRORED', () => {
    seedBook('prufubok');
    const code = run({
      exportFn: () => {
        throw new Error('db is on fire');
      },
    });
    expect(code).toBe(1);
    expect(heartbeatExists()).toBe(false);
  });
});

describe('runGlossaryExport — status file', () => {
  // ⚠️ NOT a liveness signal, and these tests must never be read as making it
  // one. The heartbeat stays the alarm (absence is the alarm); this file
  // carries per-book DETAIL only. It is deliberately written even on a run
  // that ended in an error, because the breakdown matters most exactly then —
  // which is also precisely why it cannot answer "is the exporter alive".
  const statusPath = () => path.join(root, 'pipeline-output', '.glossary-export-status.json');
  const readStatus = () => JSON.parse(readFileSync(statusPath(), 'utf8'));

  it('records a per-book outcome', () => {
    seedRefreshable('prufubok');
    run({ exportFn: () => payload(approved(10)) });
    expect(readStatus().books.prufubok.outcome).toBe('wrote');
    expect(readStatus().errors).toBe(0);
  });

  it('is written even when a book errored — the breakdown matters most then', () => {
    seedBook('prufubok');
    run({
      exportFn: () => {
        throw new Error('boom');
      },
    });
    expect(readStatus().books.prufubok.outcome).toBe('error');
    expect(readStatus().errors).toBe(1);
  });

  // ⚠️ REPLACED the plan's 'marks a --book run as filtered' test (and the
  // companion negative case) 2026-08-05, decision D6/(c) — a DECISION, not an
  // omission, so the superseded plan text does not read as something that was
  // simply missed. The plan had a filtered run write a status file carrying
  // `filtered: true`; it now writes NO status file, and the field is deleted.
  //
  // WHY: `withSince` stamps only THIS run's books, so a filtered run wrote a
  // single-book file, and the next unfiltered run found no previous entry for
  // the other books and reset their stale-refusal clocks to now. That reset is
  // CORRELATED with the alarm's firing window rather than random — a lead
  // hand-runs `--book <slug> --adopt` precisely while working through
  // adoption, i.e. exactly while the other books are still refusing and their
  // clocks are running. Withholding makes the status file exactly parallel to
  // the heartbeat: two whole-corpus artifacts, ONE rule, rather than two rules
  // a future reader has to hold apart.
  //
  // Deliberately mirrors 'does NOT write the heartbeat on a --book run, even
  // when fully healthy' above — same scenario, same shape, the other artifact.
  it('does NOT write the status file on a --book run, even when fully healthy', () => {
    seedBook('bok-a');
    const code = run({ book: 'bok-a', exportFn: () => payload(approved(5)) });
    expect(code).toBe(0);
    expect(existsSync(statusPath())).toBe(false);
  });

  it('a --book run does not CLOBBER a status file an unfiltered run left', () => {
    // The failure the withholding actually prevents. Without it the filtered
    // run overwrites bok-b's entry out of existence, and the next unfiltered
    // run restarts bok-b's stale-refusal clock — silently postponing the alarm
    // for a book nobody touched.
    seedBook('bok-a');
    seedBook('bok-b', JSON.stringify(payload(approved(617))));
    run({
      exportFn: (slug) => (slug === 'bok-a' ? payload(approved(5)) : payload(approved(3))),
      nowMs: 1_800_000_000_000,
    });
    const before = readFileSync(statusPath(), 'utf8');
    expect(JSON.parse(before).books['bok-b'].outcome).toBe('refused-shrink');

    run({ book: 'bok-a', exportFn: () => payload(approved(6)), nowMs: 1_900_000_000_000 });
    expect(readFileSync(statusPath(), 'utf8')).toBe(before); // byte-identical
  });

  it('is NOT written on a dry run', () => {
    seedBook('prufubok');
    run({ dryRun: true, exportFn: () => payload(approved(10)) });
    expect(existsSync(statusPath())).toBe(false);
  });

  // ⚠️ PINS writeStatus's try/catch, which was load-bearing and untested
  // (fix round 2, finding I2 — verified: DELETING the catch left both suites
  // 115/115 green). The design rule is "reporting must never take down the
  // signal it reports on", and without the catch an unwritable DETAIL file
  // becomes an uncaught EACCES that escapes runGlossaryExport — losing the
  // exit code AND skipping writeHeartbeat, which runs after this write. The
  // observable result would be /api/health reporting the exporter DEAD within
  // 6 hours when in truth only its status file was unwritable: a reporting
  // fault promoted into a liveness alarm, which is exactly backwards.
  //
  // The export itself must still land, too — that is the actual work, and it
  // must not be hostage to the reporting file either.
  //
  // ⚠️ Constructed so it CANNOT pass vacuously: the status file is created and
  // chmod'ed directly rather than by a prior run, so no heartbeat exists yet
  // when the run starts. Asserting heartbeatExists() therefore proves this run
  // wrote it. (A prior run would have left one, and the assertion would hold
  // no matter what this run did.)
  //
  // ⚠️ chmod 000 does not restrict root, so this would pass vacuously as root.
  // Skipped explicitly rather than silently. NOTE: the two pre-existing chmod
  // tests in this file ('does NOT treat an unreadable existing export as "no
  // baseline"' and 'an unreadable book does not skip the books after it') have
  // NO such guard and would go vacuous as root — a pre-existing gap, not
  // introduced here.
  it.skipIf(process.getuid?.() === 0)(
    'an UNWRITABLE status file does not take down the heartbeat it reports on',
    () => {
      seedRefreshable('prufubok');
      mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
      writeFileSync(statusPath(), '{}');
      chmodSync(statusPath(), 0o000);
      try {
        expect(heartbeatExists()).toBe(false); // precondition: nothing to inherit
        const code = run({ exportFn: () => payload(approved(5)) });
        expect(code).toBe(0);
        expect(heartbeatExists()).toBe(true);
        expect(readExport('prufubok').terms).toHaveLength(5); // the real work landed
      } finally {
        chmodSync(statusPath(), 0o644);
      }
    }
  );

  it('stamps `ran` from the injected clock, not the wall clock', () => {
    // The clock is injectable so the carry-forward tests below can control
    // time. Pinning `ran` too keeps a stray `new Date()` from creeping back
    // into the status path.
    seedBook('prufubok');
    run({ exportFn: () => payload(approved(10)), nowMs: 1_800_000_000_000 });
    expect(readStatus().ran).toBe(new Date(1_800_000_000_000).toISOString());
  });
});

describe('runGlossaryExport — the EXACT outcome strings (C14 ② amendment D6)', () => {
  // ⚠️ Until this block existed, the outcome strings (eight then, NINE since
  // §C21 added refused-absent-baseline) were pinned by
  // NOTHING: every test asserted exit codes, bytes on disk or log text, so a
  // typo in an outcome name ('refused-shrink' -> 'refused-shrunk') would have
  // been completely invisible while /api/health quietly stopped recognising it
  // as a refusal. Assert the literal strings, never merely that a key exists.
  const statusPath = () => path.join(root, 'pipeline-output', '.glossary-export-status.json');
  const readStatus = () => JSON.parse(readFileSync(statusPath(), 'utf8'));
  const outcomeOf = (slug) => readStatus().books[slug].outcome;

  const legacyFile = () =>
    JSON.stringify({ generated: 'x', book: 'prufubok', stats: {}, terms: legacyTerms(1117) });

  it("'wrote' — a routine refresh", () => {
    seedRefreshable('prufubok');
    run({ exportFn: () => payload(approved(10)) });
    expect(outcomeOf('prufubok')).toBe('wrote');
  });

  it("'unchanged' — same terms, not rewritten", () => {
    seedBook('prufubok', JSON.stringify(payload(approved(5))));
    run({ exportFn: () => payload(approved(5)) });
    expect(outcomeOf('prufubok')).toBe('unchanged');
  });

  it("'adopted' — a producer swap a human authorised with --adopt", () => {
    seedBook('prufubok', legacyFile());
    run({ exportFn: () => exportPayload(approved(709)), adopt: true });
    expect(outcomeOf('prufubok')).toBe('adopted');
  });

  it("'adopted' — an ADOPTED CORRUPT file is a migration too, not a routine write", () => {
    // Task 4+5 review finding: this path recorded 'wrote'. readExisting
    // returns {kind:'corrupt'}, so `prev` is null, so producerVerdict has
    // nothing to compare and `pv.refuse` is false — and the outcome
    // expression keyed on pv.refuse alone. Replacing an unreadable committed
    // file is exactly the one-off migration 'adopted' exists to distinguish;
    // recording it as 'wrote' hides the single most consequential class of
    // write this exporter can perform inside the label for its most routine
    // one.
    seedBook('prufubok', '{ not json');
    run({ exportFn: () => payload(approved(10)), adopt: true });
    expect(outcomeOf('prufubok')).toBe('adopted');
  });

  it("'refused-empty-census' — an un-extracted book is REFUSED, not an error", () => {
    // Whole-branch adversarial review, 2026-08-09. An empty census threw, the
    // caller counted it as an error, and `errors > 0` returns 1 BEFORE
    // writeHeartbeat — so one book nobody extracted made checks.glossary_export
    // not-ok for EVERY book. That is the coupling decision D2 removed from the
    // refusal channel, reappearing in the error channel; this file says so in
    // its own words above ("A book that refuses for a CORRECT reason must not
    // suppress the health signal for every other book").
    //
    // `stjornufraedi` has 0 .md files under 02-for-mt and is one
    // book_subject_mapping row away from exactly this state.
    seedBook('prufubok', legacyFile());
    const err = new Error('prufubok: census is empty (0 .md file(s)) — extract the book first.');
    err.code = 'EMPTY_CENSUS';
    const code = run({
      exportFn: () => {
        throw err;
      },
    });
    expect(outcomeOf('prufubok')).toBe('refused-empty-census');
    // A refusal is a correct outcome (D2): exit 0, and the heartbeat is written
    // so the rest of the corpus keeps its health signal.
    expect(code).toBe(0);
    expect(heartbeatExists()).toBe(true);
  });

  it("'refused-unscoped' — a book with no priority rows is REFUSED, and names which fault", () => {
    // Whole-branch adversarial review B, 2026-08-09: the SAME channel as
    // refused-empty-census, reached by following this exporter's own advice.
    // `refused-no-mapping` tells the operator to add a book_subject_mapping
    // row; doing so moves the book past that gate and onto the unscoped throw,
    // which was an error — withholding the heartbeat and degrading
    // checks.glossary_export for the whole corpus until a migration ships.
    // The remedy the system printed made things worse.
    //
    // The two unscoped faults have DIFFERENT remedies (admin route vs a
    // migration), so the detail must name which — collapsing them is what
    // B1's D3 exists to prevent.
    seedBook('prufubok', legacyFile());
    const err = new Error('prufubok: the book is unscoped (no-priorities).');
    err.code = 'UNSCOPED';
    err.unscoped = 'no-priorities';
    const code = run({
      exportFn: () => {
        throw err;
      },
    });
    expect(outcomeOf('prufubok')).toBe('refused-unscoped');
    expect(readStatus().books.prufubok.detail).toContain('no-priorities');
    expect(code).toBe(0);
    expect(heartbeatExists()).toBe(true);
  });

  it("'error' — a genuine export failure is still an error, not a refusal", () => {
    // The control for the test above: only EMPTY_CENSUS is reclassified.
    seedBook('prufubok', legacyFile());
    const code = run({
      exportFn: () => {
        throw new Error('something actually broke');
      },
    });
    expect(outcomeOf('prufubok')).toBe('error');
    expect(code).toBe(1);
  });

  it("'refused-producer' — a committed file holding JSON literal `null` is UNREADABLE, not absent", () => {
    // Whole-branch adversarial review, 2026-08-09. `readExisting` parsed this
    // to {kind:'ok', payload:null}, and null is the exact sentinel
    // producerVerdict uses for "no previous producer" — so the §C21 absent gate
    // did not fire (kind is not 'absent'), producerVerdict.refuse was false,
    // sameTerms was false and shrinkVerdict.refuse was false. All three gates
    // stood down and the 2-hourly cron WROTE, unattended.
    //
    // ⚠️ It was a counter-example to this project's durable claim that "there
    // is no longer any state in which an unattended glossary write is ungated".
    // Only `null` slipped through: [], numbers and strings all parse non-null,
    // detect as `unknown`, and refuse against a committed producer.
    seedBook('prufubok', 'null');
    run({ exportFn: () => payload(approved(10)) });
    expect(outcomeOf('prufubok')).toBe('refused-producer');
  });

  it("'refused-producer' — an un-adopted producer swap", () => {
    seedBook('prufubok', legacyFile());
    run({ exportFn: () => exportPayload(approved(709)) });
    expect(outcomeOf('prufubok')).toBe('refused-producer');
  });

  it("'refused-producer' — an unreadable existing file, whose producer cannot be established", () => {
    seedBook('prufubok', '{ not json');
    run({ exportFn: () => payload(approved(10)) });
    expect(outcomeOf('prufubok')).toBe('refused-producer');
    expect(readStatus().books.prufubok.detail).toBe('cannot read existing file');
  });

  it("'refused-shrink' — a catastrophic shrink", () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    run({ exportFn: () => payload(approved(3)) });
    expect(outcomeOf('prufubok')).toBe('refused-shrink');
  });

  it("'refused-no-mapping' — no book_subject_mapping row", () => {
    seedBook('prufubok');
    run({ subjectFn: () => null, exportFn: () => payload(approved(5)) });
    expect(outcomeOf('prufubok')).toBe('refused-no-mapping');
  });

  it("'error' — the exporter threw", () => {
    seedBook('prufubok');
    run({
      exportFn: () => {
        throw new Error('db is on fire');
      },
    });
    expect(outcomeOf('prufubok')).toBe('error');
  });

  it('every refusal string starts with `refused-`, which is the prefix health filters on', () => {
    // readGlossaryExportHealth classifies a refusal by the `refused-` prefix,
    // not by an enumerated list. A future outcome named e.g. 'declined-x'
    // would therefore be invisible to the stale-refusal check. This pins the
    // naming convention that makes the prefix test sound.
    seedBook('a', legacyFile());
    seedBook('b', JSON.stringify(payload(approved(617))));
    seedBook('c');
    run({
      subjectFn: (slug) => (slug === 'c' ? null : 'chemistry'),
      exportFn: (slug) => (slug === 'a' ? exportPayload(approved(709)) : payload(approved(3))),
    });
    const books = readStatus().books;
    expect(books.a.outcome).toBe('refused-producer');
    expect(books.b.outcome).toBe('refused-shrink');
    expect(books.c.outcome).toBe('refused-no-mapping');
  });
});

describe('runGlossaryExport — `since`: how long an outcome has persisted (D6)', () => {
  // WHY THIS EXISTS: under D2 a refusal exits 0, writes the heartbeat and
  // reads ok on /api/health. Correct — a check permanently red for expected
  // reasons gets tuned out. But all three committed glossaries are
  // merge-glossary today, so the FIRST cron run after this ships refuses every
  // book, and under plain D2 that steady state is indistinguishable from
  // health, forever, until a human runs --adopt per book. `since` is what lets
  // health tell "refused this morning" from "refused since June".
  const statusPath = () => path.join(root, 'pipeline-output', '.glossary-export-status.json');
  const readStatus = () => JSON.parse(readFileSync(statusPath(), 'utf8'));
  const T1 = 1_800_000_000_000;
  const T2 = T1 + 3 * 24 * 3600 * 1000; // three days later

  it('carries `since` FORWARD when the outcome is unchanged across two runs', () => {
    // The load-bearing case: a book that has been refusing for weeks must
    // report the date it STARTED refusing, not the date of the latest run —
    // otherwise every 2-hourly cron resets the clock and no refusal is ever
    // old enough to trip the threshold, which would make the whole D6
    // mechanism silently inert.
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    run({ exportFn: () => payload(approved(3)), nowMs: T1 });
    const first = readStatus().books.prufubok.since;
    expect(first).toBe(new Date(T1).toISOString());

    run({ exportFn: () => payload(approved(3)), nowMs: T2 });
    const second = readStatus();
    expect(second.books.prufubok.outcome).toBe('refused-shrink'); // same outcome
    expect(second.ran).toBe(new Date(T2).toISOString()); // the run DID happen at T2
    expect(second.books.prufubok.since).toBe(first); // ...but `since` did not move
  });

  // ⚠️ THE MOST LOAD-BEARING GAP IN THIS TASK, and it was pinned by nothing
  // (fix round 2, finding I1 — verified: tightening the carry-forward test to
  // `prev.outcome === entry.outcome && prev.detail === entry.detail` left both
  // suites 115/115 green, because every other fixture holds `detail` constant
  // and 'wrote'/'unchanged' carry no `detail` at all).
  //
  // WHY IT MATTERS: refused-shrink's detail is `${prevTotal} → ${nextTotal}`,
  // rebuilt from the DB on every run. Any book whose counts move between runs
  // — i.e. any book under active editing — would reset `since` every 2 hours
  // under a detail-inclusive comparison, so no refusal could ever reach 7 days
  // and the D6 alarm WOULD NEVER FIRE. That is the identical failure shape as
  // Mutation 1 (silently inert D6), one clause over, and it would be invisible
  // to every other test here.
  //
  // The carry-forward key is the outcome STRING alone: a shrink refusal whose
  // counts drift 617→3 then 617→4 is the SAME unresolved refusal, and the
  // clock must keep running through it.
  it('carries `since` forward when the outcome holds but its `detail` DRIFTS', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    run({ exportFn: () => payload(approved(3)), nowMs: T1 });
    const first = readStatus().books.prufubok;
    expect(first.outcome).toBe('refused-shrink');
    expect(first.since).toBe(new Date(T1).toISOString());

    run({ exportFn: () => payload(approved(4)), nowMs: T2 });
    const second = readStatus().books.prufubok;

    expect(second.outcome).toBe('refused-shrink'); // outcome unchanged...
    // ...but the detail really did move. Without this assertion the test could
    // pass while exercising nothing — if both runs produced the same detail,
    // a detail-inclusive comparison would carry `since` forward too and the
    // mutation would survive.
    expect(second.detail).not.toBe(first.detail);
    expect(first.detail).toBe('617 → 3');
    expect(second.detail).toBe('617 → 4');

    expect(second.since).toBe(new Date(T1).toISOString()); // clock still running
  });

  it('RESETS `since` when the outcome changes between runs', () => {
    seedRefreshable('prufubok');
    run({ exportFn: () => payload(approved(5)), nowMs: T1 });
    expect(readStatus().books.prufubok.outcome).toBe('wrote');
    expect(readStatus().books.prufubok.since).toBe(new Date(T1).toISOString());

    run({ exportFn: () => payload(approved(5)), nowMs: T2 });
    expect(readStatus().books.prufubok.outcome).toBe('unchanged'); // outcome moved
    expect(readStatus().books.prufubok.since).toBe(new Date(T2).toISOString());
  });

  // ═══════════════════════════════════════════════════════════════════════
  // UNRESOLVED-to-UNRESOLVED carry-forward (whole-branch adversarial review,
  // 2026-08-05 — both reviewers found this independently; human-ruled fix).
  //
  // ⚠️ THE DEFECT: carrying `since` only on an IDENTICAL outcome string meant
  // a single erroring run restarted a refusing book's seven-day clock. All
  // five `fail()` sites yield `outcome: 'error'`, and at the real 2-hourly
  // cadence one transient SQLITE_BUSY is not a corner case — git-backup.sh's
  // own comment predicts it, because the export opens sessions.db as a SECOND
  // process while the live editorial server holds it. ANY error class
  // recurring more often than weekly suppressed D6 INDEFINITELY.
  //
  // THE RULE: carry when the previous and current outcomes are BOTH
  // unresolved (`error` or any `refused-*`). An error interlude then neither
  // MANUFACTURES a streak nor RESETS one, and the alarm means what it was
  // always for — "not successfully exported since X".
  // ═══════════════════════════════════════════════════════════════════════
  const legacyFile = () =>
    JSON.stringify({ generated: 'x', book: 'prufubok', stats: {}, terms: legacyTerms(1117) });

  it('an ERROR INTERLUDE does not reset a refusal clock — and the day-8 alarm still fires', () => {
    // The reviewers' scenario, at the real cadence: refusing since day 0, one
    // SQLITE_BUSY on day 6, refusing again on day 8. Under the old
    // identical-outcome-only rule the day-6 error reset `since` to day 6, so
    // on day 8 the book was "2 days old" and findStaleRefusals returned []
    // — the alarm never fired, for a book that had not exported in 8 days.
    const DAY = 24 * 3600 * 1000;
    const T_ERR = T1 + 6 * DAY;
    const T_DAY8 = T1 + 8 * DAY;

    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    run({ exportFn: () => payload(approved(3)), nowMs: T1 });
    const started = readStatus().books.prufubok.since;
    expect(readStatus().books.prufubok.outcome).toBe('refused-shrink');
    expect(started).toBe(new Date(T1).toISOString());

    // Day 6 — a transient lock. Note the status file IS written on an error
    // run (deliberately: that is when the per-book breakdown matters most),
    // so this really does overwrite the entry rather than leaving it be.
    expect(
      run({
        exportFn: () => {
          throw new Error('SQLITE_BUSY: database is locked');
        },
        nowMs: T_ERR,
      })
    ).toBe(1);
    expect(readStatus().books.prufubok.outcome).toBe('error');
    expect(readStatus().books.prufubok.since).toBe(started); // clock NOT restarted

    // Day 8 — back to refusing, and still "since day 0".
    run({ exportFn: () => payload(approved(3)), nowMs: T_DAY8 });
    expect(readStatus().books.prufubok.outcome).toBe('refused-shrink');
    expect(readStatus().books.prufubok.since).toBe(started);

    // ⚠️ THE CONSEQUENCE, asserted end-to-end rather than inferred from
    // `since`. This is the assertion that would have caught the defect: it
    // reads the same status file /api/health does, through the real health
    // lib, and demands the alarm actually fire.
    const health = readGlossaryExportHealth({ projectRoot: root, nowMs: T_DAY8 });
    expect(health.stale_refusals).toContain('prufubok');
  });

  it('carries `since` across TWO DIFFERENT refusals — both are unresolved', () => {
    // refused-producer -> refused-shrink. A book whose refusal REASON changes
    // has still not been exported; restarting its clock would reward churn.
    seedBook('prufubok', legacyFile());
    run({ exportFn: () => exportPayload(approved(709)), nowMs: T1 });
    expect(readStatus().books.prufubok.outcome).toBe('refused-producer');
    const started = readStatus().books.prufubok.since;

    // A merge-glossary-shaped payload now, so the producer gate passes and
    // the SHRINK gate is what refuses instead.
    run({ exportFn: () => payload(legacyTerms(3)), nowMs: T2 });
    expect(readStatus().books.prufubok.outcome).toBe('refused-shrink'); // reason moved...
    expect(readStatus().books.prufubok.since).toBe(started); // ...clock did not
  });

  it('carries `since` from refused-no-mapping to refused-producer — the real prod path', () => {
    // stjornufraedi's actual trajectory: it refuses for want of a
    // book_subject_mapping row, a human adds the row, and it then refuses on
    // the producer gate instead. Two refusals, one unresolved book.
    seedBook('prufubok', legacyFile());
    run({ subjectFn: () => null, exportFn: () => exportPayload(approved(709)), nowMs: T1 });
    expect(readStatus().books.prufubok.outcome).toBe('refused-no-mapping');
    const started = readStatus().books.prufubok.since;

    run({ exportFn: () => exportPayload(approved(709)), nowMs: T2 });
    expect(readStatus().books.prufubok.outcome).toBe('refused-producer');
    expect(readStatus().books.prufubok.since).toBe(started);
  });

  it('a RESOLVED outcome still RESETS the clock — refused -> wrote', () => {
    // The other half of the rule, and the one a too-broad carry would break:
    // `wrote` is the event the operator acted on. Reporting a book as
    // "refusing since T1" after it exported cleanly at T2 would be a false
    // alarm, which is worse than a late one.
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    run({ exportFn: () => payload(approved(3)), nowMs: T1 });
    expect(readStatus().books.prufubok.outcome).toBe('refused-shrink');

    run({ exportFn: () => payload(approved(700)), nowMs: T2 });
    expect(readStatus().books.prufubok.outcome).toBe('wrote');
    expect(readStatus().books.prufubok.since).toBe(new Date(T2).toISOString());
  });

  it('an ADOPTED book resets the clock too — adoption is the remediation', () => {
    seedBook('prufubok', legacyFile());
    run({ exportFn: () => exportPayload(approved(709)), nowMs: T1 });
    expect(readStatus().books.prufubok.outcome).toBe('refused-producer');

    run({ exportFn: () => exportPayload(approved(709)), adopt: true, nowMs: T2 });
    expect(readStatus().books.prufubok.outcome).toBe('adopted');
    expect(readStatus().books.prufubok.since).toBe(new Date(T2).toISOString());
  });

  it('an error does not MANUFACTURE a streak either — wrote -> error resets', () => {
    // The carry is symmetric and must stay that way. `wrote` is resolved, so
    // the first error after a healthy run starts a NEW clock rather than
    // inheriting the healthy run's timestamp — otherwise a book that exported
    // fine for months would look like it had been broken for months the
    // instant it first errored.
    seedRefreshable('prufubok');
    run({ exportFn: () => payload(approved(5)), nowMs: T1 });
    expect(readStatus().books.prufubok.outcome).toBe('wrote');

    expect(
      run({
        exportFn: () => {
          throw new Error('db is on fire');
        },
        nowMs: T2,
      })
    ).toBe(1);
    expect(readStatus().books.prufubok.outcome).toBe('error');
    expect(readStatus().books.prufubok.since).toBe(new Date(T2).toISOString());
  });

  it('a MISSING previous status file does not throw, and `since` is now', () => {
    seedBook('prufubok');
    expect(run({ exportFn: () => payload(approved(5)), nowMs: T1 })).toBe(0);
    expect(readStatus().books.prufubok.since).toBe(new Date(T1).toISOString());
  });

  it('a CORRUPT previous status file does not throw either — reporting cannot take down the run', () => {
    seedBook('prufubok');
    mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
    writeFileSync(statusPath(), '{ not json');
    expect(run({ exportFn: () => payload(approved(5)), nowMs: T1 })).toBe(0);
    expect(readStatus().books.prufubok.since).toBe(new Date(T1).toISOString());
  });

  it('a previous status file with a non-object `books` does not throw', () => {
    seedBook('prufubok');
    mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
    writeFileSync(statusPath(), JSON.stringify({ ran: 'x', books: 'not an object' }));
    expect(run({ exportFn: () => payload(approved(5)), nowMs: T1 })).toBe(0);
    expect(readStatus().books.prufubok.since).toBe(new Date(T1).toISOString());
  });

  it('tracks `since` per book independently', () => {
    // One book's outcome changing must not reset the other's clock.
    seedBook('stodug', JSON.stringify(payload(approved(617))));
    seedRefreshable('breytileg');
    run({
      exportFn: (slug) => (slug === 'stodug' ? payload(approved(3)) : payload(approved(5))),
      nowMs: T1,
    });
    run({
      exportFn: (slug) => (slug === 'stodug' ? payload(approved(3)) : payload(approved(5))),
      nowMs: T2,
    });
    const books = readStatus().books;
    expect(books.stodug.outcome).toBe('refused-shrink');
    expect(books.stodug.since).toBe(new Date(T1).toISOString()); // still refusing since T1
    expect(books.breytileg.outcome).toBe('unchanged'); // was 'wrote' at T1
    expect(books.breytileg.since).toBe(new Date(T2).toISOString());
  });
});

describe('parseArgs — --adopt', () => {
  it('parses --adopt', () => {
    expect(parseArgs(['--adopt']).adopt).toBe(true);
  });

  it('defaults adopt to false', () => {
    expect(parseArgs([]).adopt).toBe(false);
  });

  it('--adopt does not swallow --book’s value and silently widen to every book', () => {
    // The round-4 trap: a boolean flag positioned before --book must not leave
    // book at its null default ("every book").
    const r = parseArgs(['--adopt', '--book', 'efnafraedi-2e']);
    expect(r.adopt).toBe(true);
    expect(r.book).toBe('efnafraedi-2e');
  });

  it('--book with --adopt in the other order still binds the slug', () => {
    const r = parseArgs(['--book', 'efnafraedi-2e', '--adopt']);
    expect(r.book).toBe('efnafraedi-2e');
    expect(r.adopt).toBe(true);
  });

  it('reports adopt on EVERY return path, including the early parse errors', () => {
    // ⚠️ parseArgs has four return sites, three of them early error returns.
    // A flag omitted from one of them reads `undefined` at the call site,
    // which is not merely "not true": `runGlossaryExport`'s destructuring
    // default turns an explicit undefined into the documented default, so the
    // omission is invisible until someone relies on the value. Pin all four.
    expect(parseArgs(['--adopt', '--book']).adopt).toBe(true); // --book with no value
    expect(parseArgs(['--adopt', '--book', '']).adopt).toBe(true); // empty --book value
    expect(parseArgs(['--adopt', '--frobnicate']).adopt).toBe(true); // unrecognised token
    expect(parseArgs(['--adopt']).adopt).toBe(true); // the healthy path
  });
});
