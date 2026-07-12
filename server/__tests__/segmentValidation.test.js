/**
 * Shared structural-marker rules (SR-OOS-2, design D1/D2).
 * Table-driven: one violating and one passing case per hard block,
 * warning cases, and the identity case. These rules are the single
 * source of truth for both client panes AND the server backstop.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateStructure } = require('../public/js/segment-validation');

function codes(result) {
  return (result.blocked || []).map((v) => v.code);
}

describe('hard blocks', () => {
  const HARD_CASES = [
    {
      name: 'math-missing: [[MATH:N]] in EN must appear in edited IS',
      en: 'Energy [[MATH:1]] equals',
      orig: 'Orka [[MATH:1]] jafngildir',
      bad: 'Orka jafngildir',
      good: 'Orka jafngildir [[MATH:1]]',
      code: 'math-missing',
    },
    {
      name: 'br-removed: [[BR]] count must not decrease vs original IS',
      en: 'Line one',
      orig: 'Lína eitt[[BR]]lína tvö',
      bad: 'Lína eitt lína tvö',
      good: 'Lína eitt[[BR]]lína tvö breytt',
      code: 'br-removed',
    },
    {
      name: 'xref-missing: [#CNX_...] in EN must appear in edited IS',
      en: 'See [#CNX_Chem_05_02]',
      orig: 'Sjá [#CNX_Chem_05_02]',
      bad: 'Sjá myndina',
      good: 'Sjá [#CNX_Chem_05_02] hér',
      code: 'xref-missing',
    },
    {
      name: 'link-removed: [text](url) in original IS must be kept',
      en: 'plain',
      orig: 'Sjá [hlekkinn](#anchor) hér',
      bad: 'Sjá hlekkinn hér',
      good: 'Hér er [hlekkinn](#anchor)',
      code: 'link-removed',
    },
    {
      name: 'docref-missing: [doc#target] in EN must appear in edited IS',
      en: 'See [m68674#fs-id123]',
      orig: 'Sjá [m68674#fs-id123]',
      bad: 'Sjá tilvísunina',
      good: 'Tilvísun: [m68674#fs-id123]',
      code: 'docref-missing',
    },
    {
      name: 'media-missing: [[MEDIA:N]] in EN must appear in edited IS',
      en: 'Figure [[MEDIA:2]]',
      orig: 'Mynd [[MEDIA:2]]',
      bad: 'Mynd',
      good: '[[MEDIA:2]] Mynd',
      code: 'media-missing',
    },
    {
      name: 'space-removed: [[SPACE]] count must not decrease vs original IS',
      en: 'a b',
      orig: 'a[[SPACE]]b',
      bad: 'a b',
      good: 'a[[SPACE]]b og c',
      code: 'space-removed',
    },
  ];

  for (const c of HARD_CASES) {
    it(`${c.name} — violating edit is blocked`, () => {
      const result = validateStructure(c.en, c.orig, c.bad);
      expect(codes(result)).toContain(c.code);
    });
    it(`${c.name} — conforming edit passes`, () => {
      const result = validateStructure(c.en, c.orig, c.good);
      expect(codes(result)).not.toContain(c.code);
    });
  }

  it('identity edit passes every original-IS rule', () => {
    const orig = 'a[[SPACE]]b[[BR]][hlekkur](#x)';
    const result = validateStructure('a b', orig, orig);
    expect(result.blocked).toBeNull();
  });

  it('params carry the offending marker (math)', () => {
    const result = validateStructure('x [[MATH:7]]', 'y', 'y');
    const v = result.blocked.find((b) => b.code === 'math-missing');
    expect(v.params.marker).toBe('[[MATH:7]]');
  });

  it('br-removed params carry from/to counts', () => {
    const result = validateStructure('', 'a[[BR]]b[[BR]]c', 'a[[BR]]bc');
    const v = result.blocked.find((b) => b.code === 'br-removed');
    expect(v.params).toEqual({ from: 2, to: 1 });
  });
});

describe('warnings (advisory — never enforced server-side)', () => {
  it('odd ** count → unmatched-pair (bold)', () => {
    const result = validateStructure('', 'a', 'feitletrað ** stakt');
    const w = (result.warnings || []).find((x) => x.code === 'unmatched-pair');
    expect(w).toBeTruthy();
    expect(w.params.marker).toBe('**');
  });

  it('{= without =} → unmatched-emphasis', () => {
    const result = validateStructure('', 'a', '{= áhersla');
    expect((result.warnings || []).map((w) => w.code)).toContain('unmatched-emphasis');
  });

  it('odd tilde → unmatched-subscript; ~~ ignored', () => {
    const odd = validateStructure('', 'a', 'H~2O');
    expect((odd.warnings || []).map((w) => w.code)).toContain('unmatched-subscript');
    const strike = validateStructure('', 'a', 'texti ~~yfirstrikað~~ texti');
    expect((strike.warnings || []).map((w) => w.code)).not.toContain('unmatched-subscript');
  });

  it('odd caret → unmatched-superscript', () => {
    const result = validateStructure('', 'a', 'Ca^2+');
    expect((result.warnings || []).map((w) => w.code)).toContain('unmatched-superscript');
  });

  it('cleared segment → segment-cleared', () => {
    const result = validateStructure('', 'innihald', '   ');
    expect((result.warnings || []).map((w) => w.code)).toContain('segment-cleared');
  });

  it('clean edit → both null', () => {
    const result = validateStructure('plain', 'hreint', 'hreint breytt');
    expect(result.blocked).toBeNull();
    expect(result.warnings).toBeNull();
  });
});
