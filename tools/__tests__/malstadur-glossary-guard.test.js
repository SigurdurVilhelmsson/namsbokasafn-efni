/**
 * formatGlossary must never send Málstaður a glossary entry with a blank
 * side (register C14).
 *
 * WHY: a blank `targetWord` 400s the WHOLE request, so one malformed row
 * kills an entire paid translation chunk. Dropping it costs one term of MT
 * priming; sending it costs the batch.
 *
 * Blank sides are reachable in practice, two ways:
 *   - tools/merge-glossary.js:347 writes `icelandic: ''` for needs_review
 *     terms straight into glossary-unified.json, bypassing the DB entirely.
 *   - terminologyService.js:1501 validates with `!icelandic`, and `!' '` is
 *     false — so a whitespace-only Icelandic side passes and can be approved.
 *
 * ⚠️ The returned object IS the outbound request body (malstadur-api.js:242
 * assigns it to body.glossaries, via filterGlossaryForText's spread). The
 * wire-shape test below is what stops a future "just add a count field"
 * from shipping data to a third party.
 */

import { describe, it, expect } from 'vitest';
import { formatGlossary } from '../lib/malstadur-api.js';

const ok = (english, icelandic) => ({ english, icelandic, status: 'approved' });

describe('formatGlossary blank-side guard', () => {
  it('keeps a well-formed approved term', () => {
    const g = formatGlossary([ok('water', 'vatn')]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('drops a term whose Icelandic side is an empty string', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok('ether', '')]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('drops a term whose Icelandic side is whitespace only', () => {
    // The exact hole terminologyService's `!icelandic` check leaves open.
    const g = formatGlossary([ok('water', 'vatn'), ok('ether', '   ')]);
    expect(g.terms).toHaveLength(1);
  });

  it('drops a term whose Icelandic side is null', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok('ether', null)]);
    expect(g.terms).toHaveLength(1);
  });

  it('drops a term whose English side is blank', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok('  ', 'eter')]);
    expect(g.terms).toHaveLength(1);
  });

  it('drops a term whose English side is null', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok(null, 'eter')]);
    expect(g.terms).toHaveLength(1);
  });

  it('drops a term whose side is a non-string, rather than coercing it', () => {
    // String({}) is '[object Object]' and String(['a']) is 'a' — both survive
    // a trim check and would be sent to Málstaður as plausible-looking words.
    // Blankness is not the only malformation; wrong type must drop too.
    const g = formatGlossary([
      ok('water', 'vatn'),
      ok('ether', {}),
      ok('acid', ['syra']),
      ok(42, 'fjörutíu og tveir'),
    ]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('trims surviving entries on both sides', () => {
    const g = formatGlossary([ok('  water  ', '  vatn  ')]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('calls onSkipped once with exactly the dropped entries', () => {
    const bad = ok('ether', '');
    const calls = [];
    formatGlossary([ok('water', 'vatn'), bad], { onSkipped: (d) => calls.push(d) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([bad]);
  });

  it('does not call onSkipped when nothing was dropped', () => {
    let called = false;
    formatGlossary([ok('water', 'vatn')], { onSkipped: () => (called = true) });
    expect(called).toBe(false);
  });

  it('works without an onSkipped callback', () => {
    expect(() => formatGlossary([ok('ether', '')])).not.toThrow();
  });

  it('still filters by approved status, and blank-drops within that', () => {
    const g = formatGlossary([
      ok('water', 'vatn'),
      { english: 'ether', icelandic: 'eter', status: 'needs_review' },
      ok('acid', ''),
    ]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('honours approvedOnly:false and still drops blanks', () => {
    const g = formatGlossary(
      [
        { english: 'ether', icelandic: 'eter', status: 'needs_review' },
        { english: 'acid', icelandic: '', status: 'needs_review' },
      ],
      { approvedOnly: false }
    );
    expect(g.terms).toEqual([{ sourceWord: 'ether', targetWord: 'eter' }]);
  });

  it('WIRE SHAPE: the returned object has exactly the four API keys', () => {
    // This object is assigned verbatim to body.glossaries. Any extra key is
    // sent to Málstaður and counts against the char budget that triggers
    // truncation-retries. The skip count must ride on onSkipped instead.
    const g = formatGlossary([ok('water', 'vatn'), ok('ether', '')], { onSkipped: () => {} });
    expect(Object.keys(g).sort()).toEqual(['domain', 'sourceLanguage', 'targetLanguage', 'terms']);
  });

  it('preserves the domain label', () => {
    const g = formatGlossary([ok('cell', 'fruma')], { domain: 'biology' });
    expect(g.domain).toBe('biology');
  });
});
