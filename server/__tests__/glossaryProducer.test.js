/**
 * Producer detection for the unattended glossary export (register C14 ② step 4).
 *
 * The legacy fingerprint is asserted against the REAL committed glossaries and
 * the export fingerprint against REAL exportBookGlossary output shape — not
 * hand-authored fixtures. A fixture written from prose is how ten
 * `<!-- SEG: -->` fixtures acquired a shape the real parser returns [] for; a
 * hand-written "merge-glossary-shaped" object would pass while proving nothing
 * about the 4,496 rows actually on disk.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  detectProducer,
  PRODUCER_EXPORT,
  PRODUCER_MERGE,
  PRODUCER_RESOLVED,
  PRODUCER_UNKNOWN,
} = require('../lib/glossaryProducer');

// Resolve against import.meta.url, never cwd (CLAUDE.md durable rule).
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BOOKS_DIR = path.join(REPO_ROOT, 'books');

function committedGlossaries() {
  if (!existsSync(BOOKS_DIR)) return [];
  return readdirSync(BOOKS_DIR)
    .map((slug) => ({
      slug,
      file: path.join(BOOKS_DIR, slug, 'glossary', 'glossary-unified.json'),
    }))
    .filter((b) => existsSync(b.file));
}

describe('detectProducer — stamp', () => {
  it('returns export-terminology for a stamped payload, whatever the term shape', () => {
    const p = { producer: PRODUCER_EXPORT, terms: [{ english: 'a', category: 'other' }] };
    expect(detectProducer(p)).toBe(PRODUCER_EXPORT);
  });
});

describe('detectProducer — legacy fingerprint, against the REAL committed files', () => {
  const files = committedGlossaries();

  it('found at least one committed glossary to assert against', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slug, f.file]))(
    '%s: the committed file is detected as merge-glossary',
    (_slug, file) => {
      const payload = JSON.parse(readFileSync(file, 'utf8'));
      expect(detectProducer(payload)).toBe(PRODUCER_MERGE);
    }
  );

  it.each(files.map((f) => [f.slug, f.file]))(
    '%s: the partition holds — every term has category+chapter, none has subjects',
    (_slug, file) => {
      const terms = JSON.parse(readFileSync(file, 'utf8')).terms;
      const withCategory = terms.filter((t) => 'category' in t && 'chapter' in t).length;
      const withSubjects = terms.filter((t) => 'subjects' in t).length;
      expect(withCategory).toBe(terms.length);
      expect(withSubjects).toBe(0);
    }
  );
});

describe('detectProducer — export fingerprint on a pre-stamp payload', () => {
  it('detects an unstamped export by its subjects field', () => {
    const p = { terms: [{ english: 'atom', icelandic: 'frumeind', subjects: ['chemistry'] }] };
    expect(detectProducer(p)).toBe(PRODUCER_EXPORT);
  });

  it('an empty subjects array still counts — presence, not truthiness', () => {
    const p = { terms: [{ english: 'atom', icelandic: 'frumeind', subjects: [] }] };
    expect(detectProducer(p)).toBe(PRODUCER_EXPORT);
  });
});

describe('detectProducer — unknown', () => {
  it('a hybrid carrying BOTH fingerprints is unknown, not a guess', () => {
    const p = { terms: [{ english: 'a', category: 'other', chapter: 1, subjects: ['chemistry'] }] };
    expect(detectProducer(p)).toBe(PRODUCER_UNKNOWN);
  });

  it.each([
    ['null', null],
    ['a non-object', 'nope'],
    ['an array', []],
    ['no terms property', { book: 'x' }],
    ['terms not an array', { terms: {} }],
    ['empty terms', { terms: [] }],
    ['terms with neither fingerprint', { terms: [{ english: 'a', icelandic: 'b' }] }],
  ])('%s is unknown', (_label, value) => {
    expect(detectProducer(value)).toBe(PRODUCER_UNKNOWN);
  });
});

describe('the resolved export is a distinct producer', () => {
  const resolved = {
    producer: 'export-terminology-resolved',
    terms: [{ english: 'pH', icelandic: 'sýrustig', status: 'approved', domain: 'biology' }],
  };

  it('detects the stamp', () => {
    expect(detectProducer(resolved)).toBe(PRODUCER_RESOLVED);
  });

  it('inserting the resolved branch did not break old-export detection', () => {
    // The first assertion is deliberately non-discriminating: it holds with
    // or without the PRODUCER_RESOLVED branch, because an unstamped or
    // unrecognised payload also fails to be PRODUCER_EXPORT (it falls
    // through to `unknown`, not to PRODUCER_EXPORT). It cannot be made to
    // fail on a removed branch without duplicating 'detects the stamp'.
    // The load-bearing check is the second assertion: the new branch was
    // inserted directly above the PRODUCER_EXPORT check in detectProducer,
    // and this pins that the insertion did not break detection of the old,
    // unrelated 'export-terminology' stamp.
    expect(detectProducer(resolved)).not.toBe(PRODUCER_EXPORT);
    expect(detectProducer({ producer: 'export-terminology', terms: [] })).toBe(PRODUCER_EXPORT);
  });

  // This guards the "don't teach shape inference about `domain`" constraint,
  // not the new PRODUCER_RESOLVED branch itself — it passes with or without
  // that branch, because an unstamped, `domain`-only payload already fell
  // through to `unknown` before this task existed. Kept anyway: it pins the
  // brief's explicit prohibition against widening the subjects/legacy
  // fingerprint filters to also recognize `domain`.
  it('an UNSTAMPED payload with only a `domain` field is unknown — shape inference must not learn `domain`', () => {
    // eslint-disable-next-line no-unused-vars
    const { producer, ...unstamped } = resolved;
    expect(detectProducer(unstamped)).toBe(PRODUCER_UNKNOWN);
  });

  // Pins the masking property this branch inherits from PRODUCER_EXPORT: a
  // matching top-level stamp short-circuits before any term is read, so a
  // stamped-but-contradictory payload is trusted, not refused — the one case
  // the header's "A HYBRID IS unknown, DELIBERATELY" note does NOT cover.
  // Exists so a future change to this precedence is a deliberate decision,
  // not an accident.
  it('a resolved stamp is trusted over a contradictory term shape — inherited from PRODUCER_EXPORT, pinned so a change is deliberate', () => {
    const stampedButLegacyShaped = {
      producer: 'export-terminology-resolved',
      terms: [{ english: 'atom', icelandic: 'frumeind', category: 'chemistry', chapter: 3 }],
    };
    expect(detectProducer(stampedButLegacyShaped)).toBe(PRODUCER_RESOLVED);
  });
});
