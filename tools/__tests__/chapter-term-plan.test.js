/**
 * chapter-term-plan — the PRE-BUY scan ([USER] ruling 2026-09-19: a 2–3,000 ISK re-MT
 * for a few term replacements is not sustainable, so a chapter's subset must be settled
 * BEFORE it is bought).
 *
 * 🔴 THE DEFECT THIS EXISTS FOR, AND THE CONTROL THAT MAKES IT A FINDING. `chapter-term-check`
 * scores only terms that already have a glossary row, so in chemistry ch07 it could not see
 * `resonance` (collapsed onto COVALENCE in 15 of 24 segments, including a section title) or
 * `Lewis structure` (four renderings over 194 segments) — neither had a row. Both cost a paid
 * re-buy. The anchor below reproduces that state: the REAL ch07 English, with those two rows
 * REMOVED from the glossary, must surface both as no-row candidates. The control is the same
 * corpus WITH the rows: they must then be reported as having one, not as missing.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chapterTermCandidates } from '../lib/chapter-term-plan.js';
import { parseSegmentsMap } from '../lib/seg-markers.cjs';
import { loadGlossary } from '../api-translate.js';
import { bookToDomain } from '../lib/book-rendering-config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHEM = path.join(ROOT, 'books/efnafraedi-2e');

/** The chapter's English segments, exactly as the CLI reads them. */
function chapterEnglish(chapterDir) {
  const en = new Map();
  for (const f of fs.readdirSync(chapterDir).filter((f) => /^m\d+-segments\.en\.md$/.test(f))) {
    for (const [id, text] of parseSegmentsMap(fs.readFileSync(path.join(chapterDir, f), 'utf8'))) {
      en.set(id, text);
    }
  }
  return en;
}

const CH07 = path.join(CHEM, '02-for-mt/ch07');
const terms = loadGlossary(path.join(CHEM, 'glossary'), bookToDomain('efnafraedi-2e'))?.terms ?? [];
const without = (...english) => {
  const drop = new Set(english.map((e) => e.toLowerCase()));
  return terms.filter((t) => !drop.has((t.sourceWord ?? t.english ?? '').toLowerCase()));
};

describe('chapterTermCandidates — the §C164 blind spot, on the real ch07 corpus', () => {
  const en = chapterEnglish(CH07);

  it('reads a non-trivial corpus (the denominator, stated)', () => {
    // An empty read would make every assertion below vacuous.
    expect(en.size).toBeGreaterThan(1000);
  });

  it('surfaces resonance and Lewis structure when they have NO glossary row', () => {
    const rows = chapterTermCandidates({
      en,
      terms: without('resonance', 'resonance structure', 'resonance form', 'Lewis structure'),
    });
    const noRow = rows.filter((r) => !r.hasRow).map((r) => r.term);
    expect(noRow).toContain('resonance');
    expect(noRow).toContain('Lewis structure');
  });

  it('CONTROL: with their rows present, both are reported as HAVING one', () => {
    const rows = chapterTermCandidates({ en, terms });
    const byTerm = new Map(rows.map((r) => [r.term, r]));
    expect(byTerm.get('resonance')?.hasRow).toBe(true);
    expect(byTerm.get('resonance')?.icelandic).toBe('vok');
    expect(byTerm.get('Lewis structure')?.hasRow).toBe(true);
  });

  it('counts SEGMENTS, not occurrences, and ranks by that count', () => {
    const rows = chapterTermCandidates({ en, terms });
    const lewis = rows.find((r) => r.term === 'Lewis structure');
    // 194 segments carry it; a per-occurrence count would be larger still.
    expect(lewis.segments).toBeGreaterThan(150);
    expect(lewis.segments).toBeLessThanOrEqual(en.size);
    const counts = rows.map((r) => r.segments);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('honours minSegments, so a one-off phrase is not a candidate', () => {
    const rows = chapterTermCandidates({ en, terms, minSegments: 5 });
    expect(rows.every((r) => r.segments >= 5)).toBe(true);
  });

  it('marks a one-word candidate that is only a PIECE of a longer one as subsumed', () => {
    // Without this the list is topped by `structure` (341) and `Lewis` (231), which are
    // fragments of `Lewis structure` and tell a reader nothing they can rule on.
    const rows = chapterTermCandidates({
      en,
      terms: without('resonance', 'resonance structure', 'resonance form', 'Lewis structure'),
    });
    const byTerm = new Map(rows.map((r) => [r.term, r]));
    expect(byTerm.get('Lewis structure').subsumed).toBe(false);
    expect(byTerm.get('structure').subsumed).toBe(true);
    expect(byTerm.get('Lewis').subsumed).toBe(true);
    // ⚠️ A term the book marks up stays, even as one word: `resonance` is the whole point.
    expect(byTerm.get('resonance').subsumed).toBe(false);
  });

  it("keeps the book's own key terms and drops bare function words", () => {
    const rows = chapterTermCandidates({ en, terms });
    const byTerm = new Map(rows.map((r) => [r.term, r]));
    // `[[term:…]]` marks what the book itself defines — the best candidate source.
    expect(byTerm.get('resonance')?.fromKeyTerm).toBe(true);
    for (const junk of ['the', 'of', 'is', 'in the', 'we can']) {
      expect(byTerm.has(junk), `${junk} must not be a candidate`).toBe(false);
    }
  });
});

describe('chapterTermCandidates — another chapter, as a second anchor', () => {
  it('ch05 surfaces enthalpy, the term that started the subset practice', () => {
    const en = chapterEnglish(path.join(CHEM, '02-for-mt/ch05'));
    const rows = chapterTermCandidates({ en, terms });
    const enthalpy = rows.find((r) => r.term === 'enthalpy');
    expect(enthalpy).toBeTruthy();
    expect(enthalpy.hasRow).toBe(true);
    expect(enthalpy.icelandic).toBe('vermi');
  });
});
