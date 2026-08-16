import { describe, it, expect } from 'vitest';
import { RUN_RECORD_VERSION, glossaryContentHash, buildRunRecord } from '../lib/run-record.js';

describe('glossaryContentHash', () => {
  it('returns null when no glossary was sent', () => {
    expect(glossaryContentHash(null)).toBeNull();
    expect(glossaryContentHash({})).toBeNull();
    expect(glossaryContentHash({ terms: [] })).toBeNull();
  });

  it('is independent of term order', () => {
    const a = {
      terms: [
        { sourceWord: 'atom', targetWord: 'frumeind' },
        { sourceWord: 'bond', targetWord: 'efnatengi' },
      ],
    };
    const b = {
      terms: [
        { sourceWord: 'bond', targetWord: 'efnatengi' },
        { sourceWord: 'atom', targetWord: 'frumeind' },
      ],
    };
    expect(glossaryContentHash(a)).toBe(glossaryContentHash(b));
  });

  it('changes when a target word changes', () => {
    const good = { terms: [{ sourceWord: 'magnesium', targetWord: 'magnesíum' }] };
    const bad = { terms: [{ sourceWord: 'magnesium', targetWord: 'magnesín' }] };
    expect(glossaryContentHash(good)).not.toBe(glossaryContentHash(bad));
  });

  it('changes when a term is added', () => {
    const one = { terms: [{ sourceWord: 'atom', targetWord: 'frumeind' }] };
    const two = { terms: [...one.terms, { sourceWord: 'bond', targetWord: 'efnatengi' }] };
    expect(glossaryContentHash(one)).not.toBe(glossaryContentHash(two));
  });
});

describe('buildRunRecord', () => {
  const base = {
    chars: 1200,
    usage: 1200,
    estimatedIsk: 12,
    markersNormalized: 2,
    mismatches: [{ segId: 'a' }],
    bracketDelta: { i: -1 },
    unwrapped: [{ type: 'i' }, { type: 'i' }, { type: 'sub' }],
    glossaryArm: 'glossary',
    glossaryHash: 'deadbeef',
    glossaryTermCount: 2097,
  };

  it('stamps its own version', () => {
    expect(buildRunRecord(base).runRecordVersion).toBe(RUN_RECORD_VERSION);
  });

  it('records counts, never the raw arrays', () => {
    const r = buildRunRecord(base);
    expect(r.mismatchCount).toBe(1);
    expect(r.unwrappedCount).toBe(3);
    expect(r.mismatches).toBeUndefined();
    expect(r.unwrapped).toBeUndefined();
  });

  it('tallies unwrapped markers by type', () => {
    expect(buildRunRecord(base).unwrappedByType).toEqual({ i: 2, sub: 1 });
  });

  it('carries the bracket delta through unchanged', () => {
    expect(buildRunRecord(base).bracketDelta).toEqual({ i: -1 });
  });

  it('records the glossary arm and hash together', () => {
    expect(buildRunRecord(base).glossary).toEqual({
      arm: 'glossary',
      contentHash: 'deadbeef',
      termCount: 2097,
    });
  });

  it('is stable when the optional arrays are absent', () => {
    const r = buildRunRecord({
      ...base,
      mismatches: undefined,
      unwrapped: undefined,
      bracketDelta: undefined,
    });
    expect(r.mismatchCount).toBe(0);
    expect(r.unwrappedCount).toBe(0);
    expect(r.unwrappedByType).toEqual({});
    expect(r.bracketDelta).toEqual({});
  });

  it('is JSON round-trippable', () => {
    const r = buildRunRecord(base);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
