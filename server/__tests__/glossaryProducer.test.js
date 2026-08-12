/**
 * Producer detection for the unattended glossary export (register C14 ② step 4).
 *
 * Every fingerprint is asserted against the REAL committed glossaries, and the
 * export fingerprint against REAL exportBookGlossary output shape — not
 * hand-authored fixtures. A fixture written from prose is how ten
 * `<!-- SEG: -->` fixtures acquired a shape the real parser returns [] for; a
 * hand-written "merge-glossary-shaped" object would pass while proving nothing
 * about the rows actually on disk.
 *
 * ⚠️ AMENDED 2026-08-12 (§C71). This header said "the LEGACY fingerprint is
 * asserted against the real committed glossaries … the 4,496 rows actually on
 * disk". Both halves aged out with §C62's adoption: the corpus is now MIXED
 * (three books resolved, one still merge-glossary), so the resolved
 * fingerprint is measured here too — and the row count is deliberately gone,
 * because a total in prose is exactly what CLAUDE.md § One source of truth
 * forbids. Count them from the files if you need the number.
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

describe('fingerprints, against the REAL committed files', () => {
  // ⚠️ AMENDED 2026-08-12. These two assertions used to read "EVERY committed
  // file is merge-glossary" with the merge fingerprint. §C62's adoption made
  // that false by design: three books were deliberately adopted to
  // `export-terminology-resolved` (it requires --adopt, which the cron cannot
  // reach, so a human did it). The corpus is now legitimately MIXED.
  //
  // The measurement is what mattered and it is preserved: the fingerprint claim
  // in glossaryProducer.js's header is still checked against real bytes rather
  // than trusted as prose. What changed is that each file is now checked
  // against ITS OWN producer's fingerprint, with an explicit failure for a
  // producer this test does not model — so adding a fourth producer, or a file
  // drifting to `unknown`, goes red instead of quietly finding nothing to do.
  const files = committedGlossaries();

  it('found at least one committed glossary to assert against', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slug, f.file]))(
    '%s: is detected as a KNOWN producer, never `unknown`',
    (slug, file) => {
      // `unknown` is the dangerous state: it means the detector no longer
      // models what is on disk, and §C21 showed a payload can reach it in ways
      // nobody predicted (four bytes of `null` parsed and walked past all three
      // gates). Naming the slug in the assertion makes a failure legible.
      const detected = detectProducer(JSON.parse(readFileSync(file, 'utf8')));
      expect(`${slug}=${detected}`).not.toBe(`${slug}=${PRODUCER_UNKNOWN}`);
    }
  );

  it.each(files.map((f) => [f.slug, f.file]))(
    '%s: its term shape matches the fingerprint of the producer detected for it',
    (slug, file) => {
      const payload = JSON.parse(readFileSync(file, 'utf8'));
      const detected = detectProducer(payload);
      const terms = payload.terms;
      const count = (key) => terms.filter((t) => t && typeof t === 'object' && key in t).length;
      const shape = {
        legacy: terms.filter((t) => t && 'category' in t && 'chapter' in t).length,
        subjects: count('subjects'),
        domain: count('domain'),
      };

      if (detected === PRODUCER_MERGE) {
        // The original measurement, unchanged, for the books still on it.
        expect(`${slug} legacy`).toBe(
          `${slug} ${shape.legacy === terms.length ? 'legacy' : 'MIXED'}`
        );
        expect(shape.subjects).toBe(0);
      } else if (detected === PRODUCER_RESOLVED) {
        // The resolved fingerprint, now pinned against real bytes for the first
        // time. This is load-bearing beyond bookkeeping: detectProducer's
        // UNSTAMPED path falls through to `unknown` unless the shape is exactly
        // this, so an export that stopped emitting `domain` would only be
        // caught here.
        expect(`${slug} domain`).toBe(
          `${slug} ${shape.domain === terms.length ? 'domain' : 'MISSING'}`
        );
        expect(shape.subjects).toBe(0);
        expect(shape.legacy).toBe(0);
      } else {
        throw new Error(
          `${slug}: detected producer '${detected}' has no fingerprint assertion in this test. ` +
            `A new producer must be modelled here deliberately, not silently skipped.`
        );
      }
    }
  );

  it('the three fingerprints are still DISJOINT across the whole corpus', () => {
    // CLAUDE.md states this as a durable rule; detectProducer's shape inference
    // depends on it, and a hybrid is deliberately `unknown`. Measured, not assumed.
    const hybrids = [];
    for (const { slug, file } of files) {
      for (const t of JSON.parse(readFileSync(file, 'utf8')).terms) {
        if (!t || typeof t !== 'object') continue;
        const marks = ['category' in t || 'chapter' in t, 'subjects' in t, 'domain' in t].filter(
          Boolean
        ).length;
        if (marks > 1) hybrids.push(`${slug}:${t.english}`);
      }
    }
    expect(hybrids).toEqual([]);
  });
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
    // inserted directly BELOW the PRODUCER_EXPORT check in detectProducer
    // (:47 vs :68 — an earlier version of this comment said "above"),
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
