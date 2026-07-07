// tools/__tests__/verify-reextract-equivalence.test.js
import { describe, it, expect } from 'vitest';
import { normalizeVisibleText, compareModule } from '../verify-reextract-equivalence.js';

describe('normalizeVisibleText — marker-format agnostic (every modernization pattern)', () => {
  it('legacy and bracket emphasis are equal', () => {
    expect(normalizeVisibleText('Molarity {{i}}M{{/i}} is')).toBe(
      normalizeVisibleText('Molarity [[i:M]] is')
    );
  });
  it('plain text and newly-captured sub/sup are equal (re-extract captures inline math)', () => {
    // March left "me"/"Ei" as plain text; July captures m[[sub:e]]/E[[sub:i]] → must normalize equal
    expect(normalizeVisibleText('ratio (e/me)')).toBe(normalizeVisibleText('ratio (e/m[[sub:e]])'));
    expect(normalizeVisibleText('Ei and Ef')).toBe(
      normalizeVisibleText('E[[sub:i]] and E[[sub:f]]')
    );
  });
  it('handles NESTED bracket markers (loop-until-stable)', () => {
    // m68844: "eg orbitals" → "[[i:e[[sub:g]]]] orbitals"
    expect(normalizeVisibleText('eg orbitals')).toBe(
      normalizeVisibleText('[[i:e[[sub:g]]]] orbitals')
    );
  });
  it('labeled xref/docref/link keep the VISIBLE label (before pipe), not the id', () => {
    // regression guard for the before-vs-after-pipe capture bug
    expect(normalizeVisibleText('see [[xref:Figure 5.2|CNX_X]] now')).toBe('see Figure 5.2 now');
    expect(normalizeVisibleText('in [[docref:Appendix B|m68860]]')).toBe('in Appendix B');
    expect(normalizeVisibleText('watch [[link:video|http://x/y]] clip')).toBe('watch video clip');
  });
  it('markdown [text](url) / [text](doc:m…) and its bracket form are equal', () => {
    expect(normalizeVisibleText('see [Appendix B](doc:m68860)')).toBe(
      normalizeVisibleText('see [[docref:Appendix B|m68860]]')
    );
  });
  it('legacy raw refs left as visible text normalize to nothing (re-extract fixes them)', () => {
    // m68690: March shipped literal "[m68674#fs-id…]" text; July converts to an invisible docref
    expect(normalizeVisibleText('From [m68674#fs-idm45639696], density is')).toBe(
      normalizeVisibleText('From [[docref:m68674#fs-idm45639696]], density is')
    );
  });
  it('unlabeled xref has no visible text', () => {
    expect(normalizeVisibleText('see [#CNX_X] here')).toBe(
      normalizeVisibleText('see [[xref:CNX_X]] here')
    );
  });
  it('flags a REAL visible-text change (math capture drops literal notation — the m68852 class)', () => {
    expect(normalizeVisibleText('positron (+10β)')).not.toBe(
      normalizeVisibleText('positron ([[MATH:51]])')
    );
  });
});

describe('compareModule — 5-part equivalence (adds equation key-set)', () => {
  const base = {
    segIds: new Set(['a']),
    segText: new Map([['a', 'x [[i:M]]']]),
    equations: new Map([['math-1', '<mi>k</mi>']]),
    inlineAttrs: '{"terms":[]}',
  };
  it('passes when only marker format differs', () => {
    const fresh = { ...base, segText: new Map([['a', 'x {{i}}M{{/i}}']]) };
    expect(compareModule(base, fresh).ok).toBe(true);
  });
  it('fails on segment-id-set change', () => {
    const fresh = { ...base, segIds: new Set(['a', 'b']) };
    expect(compareModule(base, fresh).ok).toBe(false);
  });
  it('fails on equations shared-key MathML change', () => {
    const fresh = { ...base, equations: new Map([['math-1', '<mi>DIFFERENT</mi>']]) };
    expect(compareModule(base, fresh).ok).toBe(false);
  });
  it('fails on equation key ADDED (math newly captured → [[MATH:N]] renumber risk)', () => {
    const fresh = {
      ...base,
      equations: new Map([
        ['math-1', '<mi>k</mi>'],
        ['math-2', '<mi>q</mi>'],
      ]),
    };
    const r = compareModule(base, fresh);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /equation.*key/i.test(f))).toBe(true);
  });
  it('fails on equation key REMOVED', () => {
    const fresh = { ...base, equations: new Map() };
    expect(compareModule(base, fresh).ok).toBe(false);
  });
  it('fails on inline-attrs byte change', () => {
    const fresh = { ...base, inlineAttrs: '{"terms":[{"id":"t1"}]}' };
    expect(compareModule(base, fresh).ok).toBe(false);
  });
});
