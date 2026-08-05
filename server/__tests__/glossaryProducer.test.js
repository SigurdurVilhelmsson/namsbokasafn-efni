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
