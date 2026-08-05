#!/usr/bin/env node

/**
 * Export each book's glossary from the terminology DB to
 * books/<book>/glossary/glossary-unified.json.
 *
 * ⚠️ NOT an MT-only file: tools/api-translate.js's loadGlossary feeds it to
 * Málstaður as the MT glossary (Unit 6.1), but tools/lib/math-label-substitute.js
 * ALSO reads it (buildGlossaryMap → cnxml-inject.js's substituteMathLabels) to
 * substitute approved terms into published CNXML/HTML — reader-visible — and
 * tools/translate-chapter-titles.js reads it for chapter-title translation. A
 * silent shrink here is not only an MT-quality regression. Full consumer
 * accounting: register C14.
 *
 * WIRING (register C14, 2026-07-27). This script had ZERO callers, and its
 * previous header claimed "the 2h git-backup already stages books/, so the
 * refreshed export reaches git for free". That was FALSE — git-backup.sh's
 * PATHSPECS had no books/*\/glossary/ entry — so even a scheduled run would
 * have written to production's disk and never reached the dev checkout where
 * api-translate.js actually primes MT.
 *
 * ⚠️ So this script's output reaches a reader ONLY if scripts/git-backup.sh
 * both invokes it AND stages books/*\/glossary/. Making this script correct is
 * half the job; check that file for the other half. (Stated as the standing
 * requirement rather than as "already done" on purpose — the sentence this
 * replaces was a status claim that went stale and hid the gap for months.)
 *
 * SAFE TO RUN UNATTENDED because of FOUR rules — three in
 * lib/glossaryExportDecision.js, one here:
 *
 *   1. WRITE-IF-CHANGED — the `generated` stamp alone must not dirty the file
 *      every 2h (~4,380 timestamp-only commits a year).
 *   2. PRODUCER GATE — categorical, and evaluated FIRST. The committed files
 *      were written by tools/merge-glossary.js, so writing over one SWAPS
 *      PRODUCERS rather than refreshing. Refused until a human passes --adopt.
 *   3. SHRINK GUARD — quantitative, on BOTH approved-term and total-term
 *      counts (approved-only would be inert for a book like liffraedi-2e,
 *      whose export has zero approved terms). Overridden by --force.
 *   4. BOOK/SUBJECT GUARD — a book with no `book_subject_mapping` row would
 *      export an unscoped, all-subjects glossary; refused instead.
 *
 * ⚠️ RULES 2 AND 3 ARE NOT REDUNDANT, AND THEIR OVERRIDES ARE SEPARATE ON
 * PURPOSE. --adopt does not imply --force and --force does not imply --adopt:
 * two distinct risks, two distinct acknowledgements. The 2026-08-03 production
 * run is why rule 2 exists at all — a wholesale producer swap passed the shrink
 * guard because chemistry fell only 36.5% (under the 0.5 halving threshold) and
 * biology GREW, which a shrink ratio is structurally blind to.
 *
 * ⚠️ THE CRON PASSES NO FLAGS (scripts/git-backup.sh invokes this script bare),
 * so neither --adopt nor --force is reachable unattended. That is the
 * structural answer to "a guard that only gates the manual path is not a
 * gate": the overrides exist only on a path where a human is typing.
 *
 * Exit code 0 means no book ERRORED. It does NOT mean every book was written:
 * a book that refuses for a correct reason (un-adopted producer swap, no
 * subject mapping, catastrophic shrink) is a healthy outcome and keeps the exit
 * code at 0. Only a genuine error — the exporter threw, or a malformed payload
 * — returns 1. Before 2026-08-05 a refusal counted as a failure, which let ONE
 * book's correct refusal mark the whole exporter unhealthy for every other book
 * (register C14 ②, decision D2).
 *
 * ⚠️ "AN UNREADABLE EXISTING FILE" USED TO APPEAR IN THAT EXIT-1 LIST AND IS
 * TWO DIFFERENT OUTCOMES (deferred minor #3, corrected 2026-08-05). Split them
 * when triaging, because the remedy differs:
 *
 *   COULD NOT BE READ AT ALL (EACCES, EIO, …) → readExisting RETHROWS →
 *     `error`, exit 1, no heartbeat. A permissions/disk fault. Fix the box.
 *   READ FINE, DID NOT PARSE (unparseable JSON) → `{kind:'corrupt'}` →
 *     `refused-producer`, exit 0, heartbeat still written. The file is intact
 *     enough to read and too damaged to identify; a human decides with --adopt.
 *
 * Only the first is a failure of this script's environment; the second is this
 * script working correctly and declining to destroy something it cannot read.
 *
 * Exit code 0 is likewise NOT equivalent to "the heartbeat was written". The
 * heartbeat is written only on an UNFILTERED (no --book), non-dry-run pass with
 * zero errors: a `--book <slug>` run and a `--dry-run` can each legitimately
 * return 0 while leaving the heartbeat untouched.
 *
 * TWO ARTIFACTS, ONE FILTERING RULE (decision D6/(c), 2026-08-05):
 *
 *   pipeline-output/.last-glossary-export        liveness — !dryRun && no --book && errors === 0
 *   pipeline-output/.glossary-export-status.json detail   — !dryRun && no --book
 *
 * Both are WHOLE-CORPUS, so a `--book <slug>` run writes NEITHER: a single-book
 * run says nothing about the other books. They differ in exactly one clause —
 * the status file is written even when a book errored, because that is when its
 * per-book breakdown is most useful. Neither is a substitute for the other:
 * see server/lib/glossaryExportHealth.js for why liveness must come from the
 * heartbeat's absence and never from a file written on every outcome.
 *
 *   node server/scripts/export-terminology.js              # all glossary-bearing books
 *   node server/scripts/export-terminology.js --book efnafraedi-2e
 *   node server/scripts/export-terminology.js --dry-run
 *   node server/scripts/export-terminology.js --book <slug> --force   # accept a shrink
 *   node server/scripts/export-terminology.js --book <slug> --adopt   # accept a producer swap
 *
 * ⚠️ BOTH OVERRIDE EXAMPLES ARE BOOK-SCOPED ON PURPOSE (corrected 2026-08-05).
 * They read `--force` / `--adopt` alone until then, which is the
 * OVERRIDE-EVERY-BOOK form: run bare against production's committed state,
 * `--adopt` reproduces the 2026-08-03 incident's writes — the same books, the
 * same numbers — in a single command. `--adopt` is still ALLOWED without
 * `--book` (whether it should be is logged as a follow-up in register §C14 ③,
 * deliberately not decided here), so the only thing standing between a
 * copy-pasted example and a corpus-wide producer swap is which example is
 * written down. Adoption is a per-book decision; type it one book at a time.
 */

const fs = require('fs');
const path = require('path');
const terminologyService = require('../services/terminologyService');
const {
  countApproved,
  countTerms,
  sameTerms,
  shrinkVerdict,
  producerVerdict,
} = require('../lib/glossaryExportDecision');

const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

/** Heartbeat consumed by GET /api/health — see server/lib/glossaryExportHealth.js. */
const HEARTBEAT_REL = path.join('pipeline-output', '.last-glossary-export');

/** Per-book breakdown consumed by GET /api/health and printed by scripts/deploy.sh. */
const STATUS_REL = path.join('pipeline-output', '.glossary-export-status.json');

function listBooks(booksDir = BOOKS_DIR) {
  try {
    return fs
      .readdirSync(booksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * The existing export, classified: absent, corrupt, or parsed.
 *
 * ⚠️ Only ENOENT and a parse failure may be reported as a kind. Every other
 * read error — EACCES above all — MUST propagate. An absent baseline tells
 * shrinkVerdict there is nothing to lose, so it permits the write: swallowing a
 * permissions fault here would stand the shrink guard down on exactly the file
 * it exists to protect, overwrite it, and still write the heartbeat, leaving
 * /api/health green. That is the catastrophe the guard was built for, arriving
 * through the one door it was not watching.
 *
 * ⚠️ RETURNS A DISCRIMINATED RESULT since C14 ② step 4. It used to return
 * `null` for BOTH "no file" and "corrupt file", which made those two
 * indistinguishable to the caller — and a corrupt merge-glossary file was
 * therefore silently replaced by an export, the one remaining ungated path to
 * a producer swap (decision D5). "Absent" still means writing is correct;
 * "corrupt" now means refuse and wait for --adopt.
 *
 * @param {string} outPath
 * @returns {{kind: 'absent'}|{kind: 'corrupt'}|{kind: 'ok', payload: object}}
 */
function readExisting(outPath) {
  let raw;
  try {
    raw = fs.readFileSync(outPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return { kind: 'absent' }; // no file yet — writing is correct
    throw err; // caught per-book by the caller, counted as an error
  }
  try {
    return { kind: 'ok', payload: JSON.parse(raw) };
  } catch {
    return { kind: 'corrupt' };
  }
}

/**
 * Describe why an exportFn return failed the shape guard, for the log line
 * only. Deliberately NOT `JSON.stringify(next)`: that can itself throw (a
 * circular reference, a BigInt) on exactly the kind of malformed value this
 * function exists to describe, which would propagate out of
 * runGlossaryExport uncaught — reinstating the abort-the-loop failure mode
 * the shape guard exists to prevent.
 *
 * ⚠️ Narrower guarantee than an earlier version of this comment claimed.
 * "Can't throw" is true only in the sense that matters for the hazard above:
 * no branch here SERIALIZES its argument, so a circular reference or a
 * BigInt cannot throw here. But `'terms' in value`, `value.terms` and
 * `Object.keys(value)` are still property reads, and a throwing getter on a
 * sufficiently hostile object would throw at any of them — exactly like the
 * `!Array.isArray(next.terms)` shape check one line above this function's
 * call site, which does the same kind of read outside any try/catch. Both
 * would abort the per-book loop the same way exportFn's own throw used to,
 * before the round-3 fix. Deliberately left un-hardened rather than wrapping
 * every read in a try: `next` only ever comes from
 * terminologyService.exportBookGlossary (a plain object literal built by
 * this codebase) or a test-injected fake — nothing in this codebase can
 * hand it a throwing getter — so defending against one here would be
 * complexity against a threat this call site cannot actually receive.
 * Revisit if `exportFn` is ever allowed to be a third-party/untrusted value.
 *
 * Round 4 also fixed what this described: `{terms: null}` and `{terms: {}}`
 * used to produce the IDENTICAL message ("an object whose 'terms' is
 * object" — the classic `typeof null === 'object'` wart), and a renamed key
 * (e.g. `{glossary: [...]}`) produced "...'terms' is undefined" with no
 * hint what the payload DOES contain — exactly the information an operator
 * needs to spot a refactor that renamed the field. `null` is now named
 * explicitly, and every branch reports the payload's own keys.
 *
 * ⚠️ THIS GUARD IS ABOUT A MALFORMED **EXPORT** (exportFn's return). A
 * malformed **existing file** is a different path with a different outcome:
 * readExisting reports `{kind:'corrupt'}` and the caller REFUSES, waiting for
 * --adopt (register C14 ② step 4, decision D5), rather than erroring. The two
 * guards look redundant and are not — one protects what we are about to
 * write, the other protects what we are about to destroy.
 */
function describeMalformedPayload(value) {
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return 'an array, not an object with a terms property';
  const keys = Object.keys(value);
  const shape = keys.length > 0 ? `keys [${keys.join(', ')}]` : 'no own keys';
  if (!('terms' in value)) return `an object with no 'terms' property (has ${shape})`;
  if (value.terms === null) return `an object whose 'terms' is null, not an array (has ${shape})`;
  return `an object whose 'terms' is ${typeof value.terms}, not an array (has ${shape})`;
}

function writeHeartbeat(projectRoot) {
  const p = path.join(projectRoot, HEARTBEAT_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, new Date().toISOString() + '\n', 'utf-8');
}

/**
 * The PREVIOUS run's per-book outcomes, for `since` carry-forward. Returns
 * `{}` for every failure mode — absent, unreadable, unparseable, or parseable
 * but the wrong shape.
 *
 * ⚠️ MUST NOT THROW, for the same reason writeStatus must not: reporting is
 * not allowed to take down the signal it reports on. A corrupt status file
 * that wedged the exporter would convert a cosmetic problem (a lost `since`
 * clock) into a total outage of the export itself.
 *
 * Degrading to `{}` costs only accuracy, and only in the safe direction: every
 * book's `since` restarts at now, so a long-standing refusal has to age
 * through the threshold again before health flags it. That is a delayed alarm,
 * never a suppressed one.
 *
 * Since decision D6/(c) only UNFILTERED runs write this file, so what it holds
 * is always whole-corpus. A book missing from it therefore means the book is
 * new or was not discovered last run — never "last run happened to be
 * filtered", which is the ambiguity that made the filtered-write design unsafe.
 */
function readPreviousBookOutcomes(projectRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectRoot, STATUS_REL), 'utf-8'));
    return parsed && typeof parsed.books === 'object' && parsed.books !== null ? parsed.books : {};
  } catch {
    return {};
  }
}

/**
 * Is this outcome one a human still has to resolve?
 *
 * `error` and every `refused-*` are both "not successfully exported", and for
 * the D6 clock that is the only distinction that matters — see `withSince`.
 * Deliberately keyed on the `refused-` PREFIX rather than an enumerated list,
 * matching `glossaryExportHealth.js`: a future refusal string is then covered
 * here automatically, and one named outside the convention is caught by the
 * existing "every refusal string starts with `refused-`" test rather than
 * silently dropping out of the clock.
 */
function isUnresolved(outcome) {
  return outcome === 'error' || (typeof outcome === 'string' && outcome.indexOf('refused-') === 0);
}

/**
 * Stamp each outcome with `since` — when its CURRENT outcome was FIRST seen.
 *
 * ⚠️ THIS IS WHAT MAKES A REFUSAL RESOLVABLE. Under decision D2 a refusal is a
 * correct outcome: it exits 0, writes the heartbeat, and reads ok on
 * /api/health. That is right — a check permanently red for expected reasons
 * gets tuned out, which is how a live incident hid inside a steady ok=false on
 * 2026-08-03. But a refusal with no age is indistinguishable from health
 * forever. `since` is the difference between "refused this morning" and
 * "refused since June" (decision D6).
 *
 * ⚠️ CORRECTED 2026-08-05 — this used to say "every committed glossary is a
 * merge-glossary file today, so the first cron run after this ships refuses
 * EVERY book". That holds only for a book WITH a committed glossary file.
 * A book that has a `glossary/` directory but no committed file makes
 * readExisting return `{kind:'absent'}` → `prev === null` → `producerVerdict`
 * returns `refuse:false` AND `shrinkVerdict`'s `prevTotal > 0` clause is
 * false: BOTH GATES ARE STRUCTURALLY INERT, and the bare cron writes, exits 0,
 * writes the heartbeat, and git-backup.sh commits and pushes it. That is the
 * `orverufraedi` third of the 2026-08-03 incident and this branch does not
 * change it. Register §C14 ③ carries the per-book positions.
 *
 * Carried forward under EITHER of two conditions:
 *
 *   (a) the outcome string is identical; or
 *   (b) the previous and current outcomes are BOTH UNRESOLVED — `error` or any
 *       `refused-*`.
 *
 * `detail` may differ freely in both cases — a shrink refusal whose counts
 * moved 1117→900 then 1117→890 is the same unresolved refusal, and restarting
 * its clock on that would make the threshold unreachable for any book whose
 * numbers drift.
 *
 * ⚠️ (b) EXISTS BECAUSE A TRANSIENT ERROR USED TO RESET THE CLOCK, which
 * silently disarmed D6 (whole-branch adversarial review, 2026-08-05; both
 * reviewers found it independently, human-ruled fix). All five `fail()` sites
 * record `outcome: 'error'`, so under (a) alone ONE erroring run in the middle
 * of a refusal streak restarted the seven days. At the real 2-hourly cadence
 * that is not a corner case: `git-backup.sh`'s own comment predicts the error
 * class ("opens sessions.db as a SECOND process while the live editorial
 * server holds it, so lock contention is a real possibility"), and ANY error
 * recurring more often than weekly suppresses the alarm INDEFINITELY — a book
 * refusing for months would never appear in `stale_refusals`, which is the
 * only durable trace a refusal leaves.
 *
 * An error interlude now neither MANUFACTURES a streak nor RESETS one: the
 * alarm's meaning becomes "not successfully exported since X", which is what
 * it was always for. A book alternating error/refused is exactly as unattended
 * as one refusing steadily, and should age at the same rate.
 *
 * ⚠️ A RESOLVED outcome (`wrote`, `adopted`, `unchanged`, `dry-run`) must
 * still RESET the clock — that is the event the operator acted on, and
 * carrying `since` through it would report a book as refusing since long
 * before it was fixed.
 *
 * A previous entry with no usable `since` (missing, or not a string) restarts
 * the clock rather than propagating an undefined field into the new file.
 */
function withSince(outcomes, previous, nowMs) {
  const now = new Date(nowMs).toISOString();
  const stamped = {};
  for (const [slug, entry] of Object.entries(outcomes)) {
    const prev = previous[slug];
    const carry =
      prev &&
      typeof prev === 'object' &&
      (prev.outcome === entry.outcome ||
        (isUnresolved(prev.outcome) && isUnresolved(entry.outcome))) &&
      typeof prev.since === 'string' &&
      prev.since !== '';
    stamped[slug] = { ...entry, since: carry ? prev.since : now };
  }
  return stamped;
}

/**
 * ⚠️ NOT a liveness signal. The heartbeat remains the alarm — absence is the
 * alarm, per the C11(b) doctrine — precisely because a status file written on
 * every outcome would read "success" forever once the exporter stopped
 * running. This file carries DETAIL ONLY: which book got which outcome, and
 * how long it has held it. It is written even on a run that ended in an error,
 * because the breakdown is most valuable exactly then.
 *
 * ⚠️ Nothing may consult this file to decide whether the exporter is ALIVE.
 * readGlossaryExportHealth reads it only for `errors`, `books` and the
 * stale-refusal list; liveness comes from the heartbeat's mtime alone.
 *
 * ⚠️ WHOLE-CORPUS, like the heartbeat: written only on an UNFILTERED run. See
 * the call site for why the two artifacts share that rule.
 */
function writeStatus(projectRoot, status) {
  const p = path.join(projectRoot, STATUS_REL);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(status, null, 2) + '\n', 'utf-8');
  } catch {
    // Reporting must never take down the signal it reports on.
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.booksDir]
 * @param {string} [options.projectRoot]
 * @param {(bookSlug: string) => object} [options.exportFn] - injected in tests
 * @param {(bookSlug: string) => string|null} [options.subjectFn] - injected in tests;
 *   defaults to terminologyService.getBookSubject. Returns null when the book has
 *   no `book_subject_mapping` row.
 * @param {string|null} [options.book] - a single book, or `null` for all
 *   glossary-bearing ones. Selected by `=== null`, not truthiness — an empty
 *   string is a (rejected) single-book request, never "all books" (register
 *   C14, round 4).
 * @param {boolean} [options.force] - write even when the shrink guard objects
 * @param {boolean} [options.adopt] - write even when the PRODUCER gate objects,
 *   i.e. migrate a book whose committed glossary another program wrote.
 *   Deliberately independent of `force`: neither implies the other, because a
 *   producer swap and a catastrophic shrink are different risks and each
 *   deserves its own explicit acknowledgement.
 * @param {boolean} [options.dryRun] - write neither export nor heartbeat
 * @param {number} [options.nowMs] - injectable clock, used for the status
 *   file's `ran` stamp and every `since`. Injectable because carry-forward is
 *   a property ACROSS runs, so a test cannot exercise it without controlling
 *   time. ⚠️ Nothing else in the status path may call Date.now()/new Date() —
 *   a second, uninjected clock there would make `since` untestable again.
 *   (writeHeartbeat still stamps its own wall clock: only its MTIME is ever
 *   read, so its contents are informational and need no injection.)
 * @returns {number} exit code: 0 unless some book ERRORED. A refusal is not an
 *   error (decision D2) — see the header.
 */
function runGlossaryExport({
  booksDir = BOOKS_DIR,
  projectRoot = PROJECT_ROOT,
  exportFn = terminologyService.exportBookGlossary,
  subjectFn = terminologyService.getBookSubject,
  book = null,
  force = false,
  adopt = false,
  dryRun = false,
  nowMs = Date.now(),
  log = console.log,
  logError = console.error,
} = {}) {
  // Only export books that already have a glossary directory — i.e. registered,
  // glossary-bearing books.
  //
  // The named-book path is filtered TOO, not exempted: the write path below
  // mkdirSync's recursively, so a typo'd slug would otherwise CREATE
  // books/<typo>/glossary/ and write an empty export into it, with the shrink
  // guard powerless because a brand new path has no baseline to compare
  // against.
  const hasGlossaryDir = (b) => fs.existsSync(path.join(booksDir, b, 'glossary'));
  // Explicit `book === null`, never truthiness. `book: ''` is a real value,
  // distinct from `book: null` — the whole-branch adversarial review's
  // ROUND 4 finding: `'' ? [x] : listBooks(...)` took the ALL-BOOKS branch
  // for an empty string, so `--book ''` combined with `--force` bypassed the
  // shrink guard on every glossary-bearing book at once. parseArgs now
  // refuses an empty/whitespace-only `--book` value before it ever reaches
  // here (see parseArgs below), but this function must not depend on that —
  // it is called directly by tests today and could be called directly by a
  // future caller that builds `options` without going through parseArgs at
  // all, so the guard belongs here too, not only at the CLI boundary.
  const books =
    book === null ? listBooks(booksDir).filter(hasGlossaryDir) : [book].filter(hasGlossaryDir);

  if (book !== null && books.length === 0) {
    logError(
      `${book}: no glossary directory at ${path.join(booksDir, book, 'glossary')} — refusing`
    );
    return 1;
  }

  if (books.length === 0) {
    // Not vacuously healthy: an empty set means book discovery is broken.
    // Reporting success here would let a mis-resolved booksDir read green
    // forever, which is precisely what the health check exists to catch.
    logError(
      'No glossary-bearing books found — book discovery is broken, refusing to report healthy'
    );
    return 1;
  }

  // Per-book outcome, not one counter. A book that refuses for a CORRECT
  // reason (producer swap not yet adopted, no subject mapping, catastrophic
  // shrink) must not suppress the health signal for every other book: on
  // 2026-08-03 that is exactly why /api/health read glossary_export:
  // ok=false across the run that wrote and pushed reader-visible content,
  // and why nobody learned the first prod export had happened.
  const outcomes = {};
  let errors = 0;
  const fail = (b, detail) => {
    outcomes[b] = { outcome: 'error', detail };
    errors++;
  };

  for (const b of books) {
    // A book with no book_subject_mapping row makes exportBookGlossary's
    // subject filter a no-op (terminologyService.js: `if (bookSubject && ...)
    // continue` — no bookSubject means no filtering at all), so it would
    // export EVERY non-rejected translation across every subject: the exact
    // opposite of the "DELIBERATELY STRICT" (item 18) intent. Only migration
    // 032 has ever inserted these rows, once, for five hardcoded slugs — a
    // book registered since then has no row until a human adds one. Refuse
    // loudly rather than silently prime MT (and the render path) from a
    // cross-subject corpus.
    let subject;
    try {
      subject = subjectFn(b);
    } catch (err) {
      logError(`${b}: could not resolve book subject — ${err.message}`);
      fail(b, `could not resolve book subject — ${err.message}`);
      continue;
    }
    if (!subject) {
      logError(
        `${b}: no book_subject_mapping row — refusing to export an unscoped, ` +
          `all-subjects glossary. Add a book_subject_mapping row for this book ` +
          `(see migration 032) before exporting.`
      );
      // A refusal, not an error: the exporter is working correctly and
      // declining to do the wrong thing. Only a human adding the missing row
      // can resolve it, and until then this book must not mark the whole run
      // unhealthy (decision D2).
      outcomes[b] = { outcome: 'refused-no-mapping' };
      continue;
    }

    const outDir = path.join(booksDir, b, 'glossary');
    const outPath = path.join(outDir, 'glossary-unified.json');

    let next;
    try {
      next = exportFn(b);
    } catch (err) {
      logError(`${b}: export failed — ${err.message}`);
      fail(b, `export failed — ${err.message}`);
      continue;
    }

    // A non-throwing but malformed return (missing `.terms`, or `terms` not
    // an array) must not reach sameTerms/shrinkVerdict. Those two are
    // deliberately tolerant of a malformed argument — that tolerance is
    // correct for `prev` (a corrupt *existing* file must not wedge the
    // exporter forever, see readExisting above) but is the wrong behaviour
    // for `next`: shrinkVerdict's `refuse` stays false whenever there is no
    // baseline to compare against (`prev === null`, e.g. a book's first
    // export), so a malformed `next` used to be written to disk exactly as
    // received — exit 0, zero errors logged, and glossary-unified.json
    // reduced to a file with no terms at all (whole-branch adversarial
    // review, round 3, 2026-07-28 — this REPLACED an earlier crash at the log
    // lines below with a silent bad write, which is worse). Validate the
    // shape here, before any comparison or write, so a malformed exportFn
    // return is a loud per-book failure instead.
    if (next === null || typeof next !== 'object' || !Array.isArray(next.terms)) {
      logError(
        `${b}: exportFn returned a malformed payload — expected an object with an ` +
          `array 'terms' property, got ${describeMalformedPayload(next)} — refusing to write`
      );
      fail(b, 'exportFn returned a malformed payload');
      continue;
    }

    let existing;
    try {
      existing = readExisting(outPath);
    } catch (err) {
      logError(`${b}: could not read existing export — ${err.message}`);
      fail(b, `could not read existing export — ${err.message}`);
      continue;
    }

    // D5: unreadable means we cannot tell what we would destroy.
    //
    // ⚠️ The message must say that --adopt here also stands the SHRINK gate
    // down (deferred minor #2, whole-branch adversarial review 2026-08-05).
    // That is structurally unavoidable rather than a bug — a shrink is
    // measured against the previous term counts, and an unparseable file has
    // none to measure — but an operator reading "pass --adopt" reasonably
    // expects to have overridden ONE gate, as they would on the producer path
    // below, where --force remains a separate second acknowledgement. On this
    // path there is no second acknowledgement to give.
    if (existing.kind === 'corrupt' && !adopt) {
      logError(
        `${b}: REFUSING to write — cannot read the existing file at ${outPath} ` +
          `(unparseable JSON), so its producer cannot be established. ` +
          `Investigate, then pass --adopt to replace it. NOTE: on this path --adopt ` +
          `also bypasses the SHRINK check — an unreadable file provides no term ` +
          `counts to measure against — so the replacement is unmeasured in both ` +
          `respects. Keep a copy of the unreadable file first.`
      );
      outcomes[b] = { outcome: 'refused-producer', detail: 'cannot read existing file' };
      continue;
    }
    const prev = existing.kind === 'ok' ? existing.payload : null;

    // Producer first, shrink second. A producer swap is categorical; a shrink
    // is quantitative. Reporting "1117 → 709, a 36.5% shrink" about a file
    // another program wrote invites the operator to reason about two numbers
    // that count different things.
    const pv = producerVerdict(prev, next);
    if (pv.refuse && !adopt) {
      logError(
        `${b}: REFUSING to write — the committed file was written by ` +
          `${pv.prevProducer}, not by this exporter (${pv.nextProducer}). Writing would ` +
          `SWAP PRODUCERS, not refresh. Review what this book's glossary should be, ` +
          `then pass --adopt to migrate it.`
      );
      outcomes[b] = {
        outcome: 'refused-producer',
        detail: `committed file written by ${pv.prevProducer}`,
      };
      continue;
    }

    if (sameTerms(prev, next)) {
      log(`${b}: unchanged (${countApproved(next)} approved) — not rewritten`);
      outcomes[b] = { outcome: 'unchanged' };
      continue;
    }

    const verdict = shrinkVerdict(prev, next);
    // Always report BOTH counts — total and approved. A book like
    // liffraedi-2e has 0 approved terms throughout, so an approved-only
    // message would read "0 approved (0 approved)" and hide a 2262 -> 0
    // destruction entirely; the lead is instructed to read these numbers
    // before deciding whether to --force (register C14).
    if (verdict.refuse && !force) {
      logError(
        `${b}: REFUSING to write — terms would fall ${verdict.prevTotal} → ${verdict.nextTotal} ` +
          `(approved ${verdict.prevApproved} → ${verdict.nextApproved}). The committed file may ` +
          `come from a different producer (tools/merge-glossary.js). Investigate, then pass ` +
          `--force if the shrink is intended.`
      );
      outcomes[b] = {
        outcome: 'refused-shrink',
        detail: `${verdict.prevTotal} → ${verdict.nextTotal}`,
      };
      continue;
    }

    if (dryRun) {
      log(
        `[dry-run] ${b}: would write terms ${verdict.prevTotal} → ${countTerms(next)} ` +
          `(approved ${verdict.prevApproved} → ${verdict.nextApproved})`
      );
      outcomes[b] = { outcome: 'dry-run' };
      continue;
    }

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
    log(
      `${b}: wrote terms ${verdict.prevTotal} → ${countTerms(next)} ` +
        `(approved ${verdict.prevApproved} → ${verdict.nextApproved}) → ${outPath}`
    );
    // 'adopted' is reachable only via --adopt: reaching this line with either
    // clause true means a gate objected and a human overrode it. A one-off
    // migration is worth distinguishing from a routine refresh in the record.
    //
    // ⚠️ THE `corrupt` CLAUSE IS NOT REDUNDANT (Task 4+5 review finding). An
    // unreadable existing file makes readExisting return {kind:'corrupt'}, so
    // `prev` is null, so producerVerdict has no previous producer to compare
    // and `pv.refuse` is FALSE — the pv-only expression therefore recorded the
    // single most consequential write this exporter can perform (replacing a
    // file whose contents nobody could read) under the label for its most
    // routine one.
    outcomes[b] = { outcome: existing.kind === 'corrupt' || pv.refuse ? 'adopted' : 'wrote' };
  }

  // ⚠️ THE STATUS FILE AND THE HEARTBEAT DELIBERATELY SHARE ONE RULE —
  // `!dryRun && book === null` — and the two writes are kept adjacent so that
  // is visible. BOTH are WHOLE-CORPUS artifacts, and both are meaningless
  // when only one book ran: a `--book <slug>` run says nothing about the
  // OTHER books. The heartbeat has always withheld for that reason (a lead
  // hand-running one book while investigating must not stamp six hours of
  // false green over everything else); a status file that a filtered run
  // OVERWROTE would be the identical mistake in a different medium.
  //
  // ⚠️ Concretely, and this is why the rule is shared rather than merely
  // similar: `withSince` stamps only THIS run's books, so a filtered run
  // would write a single-book file, and the next unfiltered run would find no
  // previous entry for the others and reset their stale-refusal clocks to
  // now. That reset is not a rare edge case — it is CORRELATED with the
  // alarm's firing window, because the moment a lead hand-runs `--book <slug>
  // --adopt` is precisely while working through adoption, i.e. exactly while
  // the other books are still refusing and their clocks are running.
  // (Decision D6/(c), 2026-08-05. The plan text specified a `filtered: book
  // !== null` field on a status file written for every non-dry-run pass; that
  // was superseded, and the field DELETED rather than left permanently false,
  // since a dead field implying filtered runs write is worse than no field.)
  //
  // ⚠️ ONE deliberate difference from the heartbeat, do not "unify" it away:
  // this write is NOT gated on `errors === 0`. A run that ended in an error is
  // exactly when an operator most needs to know WHICH book broke and which
  // others were fine — hence its position BEFORE the error return below.
  // Detail only; the heartbeat remains the liveness signal and is still
  // withheld on an error.
  if (!dryRun && book === null) {
    writeStatus(projectRoot, {
      ran: new Date(nowMs).toISOString(),
      errors,
      books: withSince(outcomes, readPreviousBookOutcomes(projectRoot), nowMs),
    });
  }

  if (errors > 0) return 1;
  if (!dryRun && book === null) writeHeartbeat(projectRoot);
  return 0;
}

/**
 * Parse argv into options. Exported and pure (no process.exit) so the trap
 * below is unit-testable without spawning a process.
 *
 * ⚠️ `--book` reading past the end of argv is not a cosmetic bug. The old
 * inline parser did `book = argv[++i]`, which for a trailing/transposed
 * `--book` (e.g. `--force --book`, flags swapped) sets `book` to `undefined`.
 * `runGlossaryExport`'s destructuring default (`book = null`) then treats an
 * explicit `undefined` exactly like a missing key, so `book` silently becomes
 * `null` — "all books" — turning a typo into a `--force` write across every
 * glossary in the repo. A missing value for a flag that requires one must be
 * a loud parse error, never a silent fallback to the broadest scope.
 *
 * ⚠️ Whole-branch adversarial review (2026-07-28), CRITICAL: the same failure
 * mode existed one level up. This function used to be an `if`/`else if` chain
 * with no final `else`, so ANY unrecognised token — `--book=<slug>` (an
 * accepted-looking spelling this script has never supported), a bare
 * positional slug, or a typo like `--books` — was silently discarded and
 * `book` stayed at its `null` default: "every book". `--force` is still
 * honoured on that same command line, so the one moment a lead types a
 * `--book`-bearing token (per the register's "decide per book whether to
 * --force" instruction) is exactly the moment a misspelling silently widens
 * scope to all of them, bypassing the shrink guard on every book at once.
 * The fix rejects the CLASS, not the one instance already caught above: any
 * token that isn't one of the four recognised spellings is now itself a loud
 * parse error, naming the offending token and what is accepted. Deliberately
 * NOT adding `--book=<slug>` support — that would accept one more spelling
 * while leaving the next typo free to fail open the same way. One accepted
 * spelling (`--book <slug>`, space-separated), everything else a loud error,
 * is the property this guards.
 *
 * ⚠️ An unrecognised token returns immediately, so a `-h`/`--help` that
 * appears LATER in argv is never reached and never overrides the error —
 * `main()` checks `error` before `help`. Deliberate, not an oversight: the
 * error message already names every accepted spelling, so a lead who typos a
 * flag gets the same "here is the correct usage" information either way, and
 * a parse error silently downgrading to a help screen would blur exactly the
 * fail-loud/fail-open line this function exists to hold. Both orderings are
 * pinned by dedicated tests in glossaryExportRun.test.js's `parseArgs`
 * describe block — see that block for the exact cases, not this comment
 * (a prior version of this paragraph quoted the test titles verbatim, which
 * would silently orphan the cross-reference on a rename): one test has
 * `--help` appearing before the bad token (`help` ends up `true`, but
 * `error` still wins in `main()`), and a sibling has `--help` appearing
 * after it (the loop returns before ever reaching `--help`, so `help` stays
 * `false`).
 *
 * ⚠️ Whole-branch adversarial review (2026-07-28), ROUND 4, IMPORTANT: a
 * `--book` value was checked for PRESENCE here (`!== undefined`) while
 * `runGlossaryExport` selected books by TRUTHINESS (`book ? [book] :
 * listBooks(...)`) — the same class of bug as finding 1 above, one level
 * removed. `--book ''` and `--book '   '` both parsed successfully (a
 * present, non-undefined value), then read as falsy by the consumer and
 * silently widened to "every book" — with `--force` on the same command
 * line bypassing the shrink guard on all of them. An empty or
 * whitespace-only value is now a parse error here, AND `runGlossaryExport`
 * itself now tests `book === null` explicitly rather than truthiness (see
 * below), so neither half of the seam can silently disagree again. The
 * accepted value is also trimmed, so `--book ' liffraedi-2e '` cannot
 * become a slug carrying leading/trailing spaces that would never match a
 * real `books/<slug>/` directory.
 *
 * ⚠️ EVERY FLAG MUST APPEAR IN ALL FOUR RETURN SITES — the three early error
 * returns as well as the healthy one. A flag omitted from one of them reads
 * `undefined` there, and `runGlossaryExport`'s destructuring defaults turn an
 * explicit `undefined` into the documented default, so the omission produces
 * no error and no wrong value until a caller actually depends on the flag
 * having been seen. That is the same fail-open shape as findings 1 and 3
 * above, one field removed. Pinned by "reports adopt on EVERY return path" in
 * glossaryExportRun.test.js.
 *
 * @param {string[]} argv
 * @returns {{book: string|null, dryRun: boolean, force: boolean, adopt: boolean, help: boolean, error: string|null}}
 */
function parseArgs(argv) {
  let book = null;
  let dryRun = false;
  let force = false;
  let adopt = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--book') {
      const raw = argv[i + 1];
      if (raw === undefined) {
        return {
          book: null,
          dryRun,
          force,
          adopt,
          help,
          error: '--book requires a value (a book slug)',
        };
      }
      const value = raw.trim();
      if (value === '') {
        return {
          book: null,
          dryRun,
          force,
          adopt,
          help,
          error: `--book requires a non-empty value (a book slug) — got ${JSON.stringify(raw)}`,
        };
      }
      book = value;
      i++;
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    } else if (argv[i] === '--force') {
      force = true;
    } else if (argv[i] === '--adopt') {
      adopt = true;
    } else if (argv[i] === '-h' || argv[i] === '--help') {
      help = true;
    } else {
      return {
        book: null,
        dryRun,
        force,
        adopt,
        help,
        error:
          `unrecognised argument '${argv[i]}' — accepted: --book <slug>, --dry-run, ` +
          `--force, --adopt, -h/--help (note: --book takes its value as the NEXT ` +
          `argument, not --book=<slug>)`,
      };
    }
  }
  return { book, dryRun, force, adopt, help, error: null };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  if (parsed.help) {
    console.log(
      'Usage: node server/scripts/export-terminology.js [--book <slug>] [--dry-run] ' +
        '[--force] [--adopt]\n' +
        '  --force  accept a catastrophic shrink\n' +
        '  --adopt  accept a producer swap (migrate a book whose committed\n' +
        '           glossary another program wrote, or replace an unreadable one)\n' +
        '  Neither implies the other, and the 2h cron passes neither.\n' +
        '  Scope an override with --book: without it, --force/--adopt apply to\n' +
        '  EVERY glossary-bearing book at once. Adoption is a per-book decision.'
    );
    process.exit(0);
  }

  process.exit(
    runGlossaryExport({
      book: parsed.book,
      dryRun: parsed.dryRun,
      force: parsed.force,
      adopt: parsed.adopt,
    })
  );
}

if (require.main === module) {
  main();
}

module.exports = { listBooks, runGlossaryExport, parseArgs };
