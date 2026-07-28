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
 * unfiltered run, so absence is the alarm. A status file written on every
 * outcome would read "success" forever once the exporter stopped working.
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

/** Create books/<slug>/glossary/, optionally with an existing export. */
function seedBook(slug, existing) {
  const dir = path.join(root, 'books', slug, 'glossary');
  mkdirSync(dir, { recursive: true });
  if (existing !== undefined) {
    writeFileSync(path.join(dir, 'glossary-unified.json'), existing);
  }
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

describe('runGlossaryExport — writing', () => {
  it('writes a first export when no file exists, and returns 0', () => {
    seedBook('prufubok');
    const code = run({ exportFn: () => payload(approved(5)) });
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

  it('treats an unparseable existing file as no baseline and writes', () => {
    // Refusing here would wedge the exporter forever on a corrupt file it is
    // perfectly capable of replacing.
    seedBook('prufubok', 'not json {{{');
    expect(run({ exportFn: () => payload(approved(5)) })).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(5);
  });

  it('ROUND TRIP: a second identical run writes nothing and leaves the bytes alone', () => {
    // The synthetic write-if-changed test compares two in-memory payloads.
    // This exercises the real path — write, JSON.parse back off disk, compare
    // — because that is the run that must produce no commit. If the round
    // trip perturbs key order or number formatting, the file is dirty every
    // 2h and nobody finds out until prod has thousands of empty commits.
    seedBook('prufubok');
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

describe('runGlossaryExport — shrink guard', () => {
  it('refuses a catastrophic shrink, writes nothing, and returns 1', () => {
    const before = JSON.stringify(payload(approved(617)));
    seedBook('prufubok', before);
    const code = run({ exportFn: () => payload(approved(3)) });
    expect(code).toBe(1);
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
    seedBook('bok-b');
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
      seedBook('bok-b');
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
  it('skips a book with no book_subject_mapping row, counts it as a failure, and writes nothing', () => {
    seedBook('bok-a');
    const code = run({
      subjectFn: () => null,
      exportFn: () => payload(approved(5)),
    });
    expect(code).toBe(1);
    expect(existsSync(path.join(root, 'books', 'bok-a', 'glossary', 'glossary-unified.json'))).toBe(
      false
    );
    expect(heartbeatExists()).toBe(false);
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
    seedBook('bok-b');
    const seen = [];
    const code = run({
      subjectFn: (slug) => (slug === 'bok-a' ? null : 'chemistry'),
      exportFn: (slug) => {
        seen.push(slug);
        return payload(approved(9));
      },
    });
    expect(code).toBe(1); // bok-a failed
    expect(seen).toEqual(['bok-b']);
    expect(readExport('bok-b').terms).toHaveLength(9);
  });

  it('a book WITH a subject mapping exports normally', () => {
    seedBook('bok-a');
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
    seedBook('prufubok');
    run({ exportFn: () => payload(approved(5)) });
    expect(heartbeatExists()).toBe(true);
  });

  it('writes the heartbeat when every book was legitimately unchanged', () => {
    // "Nothing changed" is a working exporter, not a stalled one — same
    // semantics as git-backup.sh's no_changes healthy path.
    seedBook('prufubok', JSON.stringify(payload(approved(5))));
    run({ exportFn: () => payload(approved(5)) });
    expect(heartbeatExists()).toBe(true);
  });

  it('does NOT write the heartbeat when a book was refused', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    run({ exportFn: () => payload(approved(3)) });
    expect(heartbeatExists()).toBe(false);
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

  it('processes remaining books after one is refused', () => {
    // Parked minor from the Task 4 per-task review, resolved 2026-07-28: this
    // test asserted the exit code and bok-b's content but not the heartbeat —
    // the mechanism was covered only in ISOLATION, by the single-book-refusal
    // test above. The combined case (one book refused, one succeeded) is
    // exactly where a naive implementation might write the heartbeat because
    // "something succeeded"; it must not, since the heartbeat is the GLOBAL
    // "every requested book resolved healthily" signal.
    seedBook('bok-a', JSON.stringify(payload(approved(617))));
    seedBook('bok-b');
    const code = run({
      exportFn: (slug) => (slug === 'bok-a' ? payload(approved(3)) : payload(approved(9))),
    });
    expect(code).toBe(1); // bok-a failed
    expect(readExport('bok-b').terms).toHaveLength(9); // bok-b still ran
    expect(heartbeatExists()).toBe(false);
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
    seedBook('prufubok');
    expect(run({ exportFn: () => payload(approved(5)), dryRun: true })).toBe(0);
    expect(
      existsSync(path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'))
    ).toBe(false);
    expect(heartbeatExists()).toBe(false);
  });

  it('still reports what the shrink guard would do (refusal fires even under --dry-run)', () => {
    // NOTE: a catastrophic shrink hits the REFUSAL branch (logError) even
    // with dryRun:true — the shrink-guard check runs before the dryRun
    // check in runGlossaryExport, so this exercises the refusal message,
    // not the "[dry-run] would write" message pinned below.
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    const errors = [];
    const code = run({
      exportFn: () => payload(approved(3)),
      dryRun: true,
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(1);
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
      help: false,
      error: null,
    });
  });

  it('parses --dry-run and --force in any order, with no --book', () => {
    expect(parseArgs(['--dry-run', '--force'])).toEqual({
      book: null,
      dryRun: true,
      force: true,
      help: false,
      error: null,
    });
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

  it("treats a following flag as --book's value — callers must not transpose", () => {
    // `--book --force` (the intended `--force --book <slug>`, transposed).
    // The next token IS present, so parseArgs takes it as the slug: this is
    // NOT a guard against transposed flags, and no parse error is raised.
    // The observable hazard: `--force` was never reached as its own token,
    // so it stays at its default (false) — a caller who transposes these two
    // flags silently loses --force AND gets a bogus book slug, with nothing
    // in `error` to catch it. (Documented current behaviour: a value is
    // anything that follows, including another flag spelling.) The sibling
    // at "does NOT silently fall back..." above pins `force` for the reverse
    // order (`--force --book`, where force IS seen before the trailing
    // `--book` errors) — this test closes that asymmetry for this order.
    const result = parseArgs(['--book', '--force']);
    expect(result.book).toBe('--force');
    expect(result.force).toBe(false);
    expect(result.error).toBe(null);
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
});
