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

  it('logs both counts when it refuses', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    const errors = [];
    run({ exportFn: () => payload(approved(3)), logError: (m) => errors.push(m) });
    expect(errors.join('\n')).toMatch(/617/);
    expect(errors.join('\n')).toMatch(/3/);
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
    seedBook('bok-a', JSON.stringify(payload(approved(617))));
    seedBook('bok-b');
    const code = run({
      exportFn: (slug) => (slug === 'bok-a' ? payload(approved(3)) : payload(approved(9))),
    });
    expect(code).toBe(1); // bok-a failed
    expect(readExport('bok-b').terms).toHaveLength(9); // bok-b still ran
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

  it('still reports what the shrink guard would do', () => {
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

  it("does not consume a following flag as --book's value", () => {
    // `--book --force` — the next token IS present, but as a parse-error
    // case this still must not silently treat `--force` as the slug.
    // (Documented current behaviour: a value is anything that follows,
    // including another flag spelling — callers must not transpose.)
    const result = parseArgs(['--book', '--force']);
    expect(result.book).toBe('--force');
    expect(result.error).toBe(null);
  });
});
