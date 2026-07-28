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
 * SAFE TO RUN UNATTENDED because of three rules in lib/glossaryExportDecision.js
 * plus a book/subject guard here: write-if-changed (the `generated` stamp alone
 * must not dirty the file every 2h); a shrink guard on BOTH approved-term and
 * total-term counts (the committed exports came from merge-glossary.js, so this
 * exporter SWAPS producers; a catastrophic drop is refused rather than
 * committed — approved-only would miss a book like liffraedi-2e whose export
 * has zero approved terms); and a book-subject-mapping guard (a book with no
 * `book_subject_mapping` row would otherwise export an unscoped, all-subjects
 * glossary — refused instead, counted as a failure).
 *
 * Exit code 0 means every requested book resolved healthily (written, or
 * legitimately unchanged) — it is NOT equivalent to "the heartbeat was
 * written". The heartbeat is written only on an UNFILTERED (no --book),
 * non-dry-run pass with zero failures: a `--book <slug>` run and a `--dry-run`
 * can each legitimately return 0 while leaving the heartbeat untouched.
 *
 *   node server/scripts/export-terminology.js              # all glossary-bearing books
 *   node server/scripts/export-terminology.js --book efnafraedi-2e
 *   node server/scripts/export-terminology.js --dry-run
 *   node server/scripts/export-terminology.js --force      # accept a shrink
 */

const fs = require('fs');
const path = require('path');
const terminologyService = require('../services/terminologyService');
const {
  countApproved,
  countTerms,
  sameTerms,
  shrinkVerdict,
} = require('../lib/glossaryExportDecision');

const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

/** Heartbeat consumed by GET /api/health — see server/lib/glossaryExportHealth.js. */
const HEARTBEAT_REL = path.join('pipeline-output', '.last-glossary-export');

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
 * Existing export, or null when there is genuinely no baseline to protect.
 *
 * ⚠️ Only ENOENT and a parse failure may return null. Every other read error —
 * EACCES above all — MUST propagate. A null baseline tells shrinkVerdict there
 * is nothing to lose, so it permits the write: swallowing a permissions fault
 * here would stand the shrink guard down on exactly the file it exists to
 * protect, overwrite it, and still write the heartbeat, leaving /api/health
 * green. That is the catastrophe the guard was built for, arriving through the
 * one door it was not watching.
 */
function readExisting(outPath) {
  let raw;
  try {
    raw = fs.readFileSync(outPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null; // no file yet — writing is correct
    throw err; // caught per-book by the caller, counted as a failure
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null; // corrupt file — no usable baseline, and replacing it is an improvement
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
 * @param {boolean} [options.dryRun] - write neither export nor heartbeat
 * @returns {number} exit code: 0 iff every book resolved healthily
 */
function runGlossaryExport({
  booksDir = BOOKS_DIR,
  projectRoot = PROJECT_ROOT,
  exportFn = terminologyService.exportBookGlossary,
  subjectFn = terminologyService.getBookSubject,
  book = null,
  force = false,
  dryRun = false,
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

  let failures = 0;

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
      failures++;
      continue;
    }
    if (!subject) {
      logError(
        `${b}: no book_subject_mapping row — refusing to export an unscoped, ` +
          `all-subjects glossary. Add a book_subject_mapping row for this book ` +
          `(see migration 032) before exporting.`
      );
      failures++;
      continue;
    }

    const outDir = path.join(booksDir, b, 'glossary');
    const outPath = path.join(outDir, 'glossary-unified.json');

    let next;
    try {
      next = exportFn(b);
    } catch (err) {
      logError(`${b}: export failed — ${err.message}`);
      failures++;
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
      failures++;
      continue;
    }

    let prev;
    try {
      prev = readExisting(outPath);
    } catch (err) {
      logError(`${b}: could not read existing export — ${err.message}`);
      failures++;
      continue;
    }

    if (sameTerms(prev, next)) {
      log(`${b}: unchanged (${countApproved(next)} approved) — not rewritten`);
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
      failures++;
      continue;
    }

    if (dryRun) {
      log(
        `[dry-run] ${b}: would write terms ${verdict.prevTotal} → ${countTerms(next)} ` +
          `(approved ${verdict.prevApproved} → ${verdict.nextApproved})`
      );
      continue;
    }

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
    log(
      `${b}: wrote terms ${verdict.prevTotal} → ${countTerms(next)} ` +
        `(approved ${verdict.prevApproved} → ${verdict.nextApproved}) → ${outPath}`
    );
  }

  if (failures > 0) return 1;
  // Heartbeat is the GLOBAL "the exporter is healthy" signal /api/health
  // reads — write it only for an unfiltered (no --book) run. A `--book
  // <slug>` run resolving healthily says nothing about the OTHER books, so
  // writing the global heartbeat here would let a lead hand-running one book
  // (e.g. while investigating a broken cron) stamp six hours of false green
  // on /api/health for everything else.
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
 * @param {string[]} argv
 * @returns {{book: string|null, dryRun: boolean, force: boolean, help: boolean, error: string|null}}
 */
function parseArgs(argv) {
  let book = null;
  let dryRun = false;
  let force = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--book') {
      const raw = argv[i + 1];
      if (raw === undefined) {
        return { book: null, dryRun, force, help, error: '--book requires a value (a book slug)' };
      }
      const value = raw.trim();
      if (value === '') {
        return {
          book: null,
          dryRun,
          force,
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
    } else if (argv[i] === '-h' || argv[i] === '--help') {
      help = true;
    } else {
      return {
        book: null,
        dryRun,
        force,
        help,
        error:
          `unrecognised argument '${argv[i]}' — accepted: --book <slug>, --dry-run, ` +
          `--force, -h/--help (note: --book takes its value as the NEXT argument, not ` +
          `--book=<slug>)`,
      };
    }
  }
  return { book, dryRun, force, help, error: null };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  if (parsed.help) {
    console.log(
      'Usage: node server/scripts/export-terminology.js [--book <slug>] [--dry-run] [--force]'
    );
    process.exit(0);
  }

  process.exit(
    runGlossaryExport({ book: parsed.book, dryRun: parsed.dryRun, force: parsed.force })
  );
}

if (require.main === module) {
  main();
}

module.exports = { listBooks, runGlossaryExport, parseArgs };
