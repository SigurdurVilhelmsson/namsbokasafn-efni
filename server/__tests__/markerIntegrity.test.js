/**
 * §C248 + G1.11: server/public/js/marker-integrity.js — dialect classification, toolbar pairs, and the save-gate
 * marker rules (spec docs/superpowers/specs/2026-11-21-c248-g111-toolbar-dialect-and-marker-gate-design.md §4).
 *
 * The strings marked "chemistry's own" are copied from books/efnafraedi-2e/02-mt-output; they are the inputs the
 * rules must stay silent on.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mi = require('../public/js/marker-integrity');

describe('isBracketDialect (inject’s hasApiMarkers, verbatim)', () => {
  it('a segment with [[sub:]] is new-format', () => {
    expect(mi.isBracketDialect('H[[sub:2]]O')).toBe(true);
  });
  it('a segment with no marker is not', () => {
    expect(mi.isBracketDialect('Engin merki.')).toBe(false);
  });
  it('a segment with only legacy markup is not', () => {
    expect(mi.isBracketDialect('NO~3~^-^')).toBe(false);
  });
});

describe('hasLegacyMarkup (the forms that depend on the dialect)', () => {
  it('legacy sub/sup markup counts (chemistry’s own alt text)', () => {
    expect(mi.hasLegacyMarkup('NO~3~^-^')).toBe(true);
  });
  it('legacy bold counts', () => {
    expect(mi.hasLegacyMarkup('**feitt**')).toBe(true);
  });
  it('literal asterisks do not (chemistry’s own)', () => {
    expect(mi.hasLegacyMarkup('(σ, σ*, π, π*)')).toBe(false);
  });
  it('an "approximately" tilde does not (chemistry’s own)', () => {
    expect(mi.hasLegacyMarkup('~10[[sup:−3]]) úr móli og því ætti (~')).toBe(false);
  });
  it('legacy underline does not (inject converts it in both dialects)', () => {
    expect(mi.hasLegacyMarkup('++undirstrikað++')).toBe(false);
  });
});

describe('wrapFor (the toolbar writes the segment’s dialect)', () => {
  it('bold in a new-format segment is the bracket pair', () => {
    expect(mi.wrapFor('bold', 'H[[sub:2]]O')).toEqual({ open: '[[b:', close: ']]' });
  });
  it('bold in a plain segment is the bracket pair', () => {
    expect(mi.wrapFor('bold', 'Engin merki.')).toEqual({ open: '[[b:', close: ']]' });
  });
  it('bold in a legacy segment is the legacy pair', () => {
    expect(mi.wrapFor('bold', 'NO~3~^-^')).toEqual({ open: '**', close: '**' });
  });
  it('italic beside literal asterisks is the bracket pair (chemistry’s own)', () => {
    expect(mi.wrapFor('italic', '(σ, σ*, π, π*)')).toEqual({ open: '[[i:', close: ']]' });
  });
  it('all six kinds in a plain segment open with their bracket markers', () => {
    const kinds = ['bold', 'italic', 'term', 'underline', 'sub', 'sup'];
    expect(kinds.map((k) => mi.wrapFor(k, 'x').open)).toEqual([
      '[[b:',
      '[[i:',
      '[[term:',
      '[[u:',
      '[[sub:',
      '[[sup:',
    ]);
  });
  it('all six kinds in a legacy segment use the legacy markers', () => {
    const kinds = ['bold', 'italic', 'term', 'underline', 'sub', 'sup'];
    expect(kinds.map((k) => mi.wrapFor(k, 'NO~3~').open)).toEqual([
      '**',
      '*',
      '__',
      '++',
      '~',
      '^',
    ]);
  });
  it('an unknown kind throws', () => {
    expect(() => mi.wrapFor('strike', '')).toThrow(TypeError);
  });
});

describe('edgeSplit (edge spaces stay outside the pair)', () => {
  it('splits leading and trailing whitespace off', () => {
    expect(mi.edgeSplit('  orð ')).toEqual({ lead: '  ', core: 'orð', trail: ' ' });
  });
  it('an empty selection is all empty', () => {
    expect(mi.edgeSplit('')).toEqual({ lead: '', core: '', trail: '' });
  });
});

// The save-gate rules (spec §4.3). checkMarkers(enText, originalIs, editedIs); the baseline is originalIs.
const check = (en, orig, edited) => mi.checkMarkers(en, orig, edited);
const codes = (list) => list.map((v) => v.code);

describe('scanMarkers counts by [[type prefix (nesting-safe)', () => {
  const NESTED = '[[b:Some representations of butane, C[[sub:4]]H[[sub:10]].]]';
  it('counts both subscripts inside a bold marker', () => {
    expect(mi.scanMarkers(NESTED).counts.sub).toBe(2);
  });
  it('sees the brackets of a nested construct as balanced', () => {
    const s = mi.scanMarkers(NESTED);
    expect([s.open, s.close]).toEqual([3, 3]);
  });
});

describe('rule 1a: an ADDED space after the colon blocks', () => {
  it('[[i:x]] -> [[i: x]] blocks marker-spaced', () => {
    expect(check('[[i:x]]', '[[i:x]]', '[[i: x]]').blocked).toEqual([
      { code: 'marker-spaced', params: { type: 'i' } },
    ]);
  });
  it("control: chemistry's own source space saved unchanged is silent", () => {
    const t = 'Ag (úr[[i: argentum]])';
    expect(check(' Ag (from[[i: argentum]]) ', t, t)).toEqual({ blocked: [], warnings: [] });
  });
});

describe('rule 1b: unbalanced brackets block', () => {
  it('H[[sub:2]]O -> H[[sub:2O blocks marker-unbalanced', () => {
    expect(codes(check('H[[sub:2]]O', 'H[[sub:2]]O', 'H[[sub:2O').blocked)).toContain(
      'marker-unbalanced'
    );
  });
  it('control: the nested construct saved unchanged is silent', () => {
    const t = '[[b:Some representations of butane, C[[sub:4]]H[[sub:10]].]]';
    expect(check(t, t, t)).toEqual({ blocked: [], warnings: [] });
  });
});

describe('rule 1c: an ADDED empty marker blocks', () => {
  it('adding [[b:]] blocks marker-empty', () => {
    expect(check('x', 'x', 'x [[b:]]').blocked).toEqual([
      { code: 'marker-empty', params: { type: 'b' } },
    ]);
  });
  it('control: an existing [[b:]] kept is silent', () => {
    expect(check('x', 'x [[b:]]', 'y [[b:]]').blocked).toEqual([]);
  });
  it('control: adding [[lb:]] (empty by nature) is not marker-empty', () => {
    expect(codes(check('x', 'x', 'x [[lb:]]').blocked)).not.toContain('marker-empty');
  });
});

describe('rule 2s: a structural marker below min(baseline, English) blocks', () => {
  it('H[[sub:2]]O -> H2O blocks marker-dropped', () => {
    expect(check('H[[sub:2]]O', 'H[[sub:2]]O', 'H2O').blocked).toEqual([
      { code: 'marker-dropped', params: { type: 'sub', from: 1, to: 0 } },
    ]);
  });
  it('the English floor: deleting a marker the MT invented is silent', () => {
    expect(check('alt text', '[[sub:2]] x', '2 x')).toEqual({ blocked: [], warnings: [] });
  });
  it('control: a marker the MT already lost is not demanded back', () => {
    expect(check('H[[sub:2]]O', 'H2O', 'H 2 O').blocked).toEqual([]);
  });
});

// [USER] 2026-11-22 (§C248's open question): in localization a unit conversion can rightly remove a sub/sup the
// English carries, so there a dropped [[sub: or [[sup: warns. Every other structural type still blocks there, and
// the segment editor keeps rule 2s whole.
describe('rule 2s in localization: a dropped [[sub: or [[sup: warns, never blocks', () => {
  const LOC = { localization: true };
  it('14,7 lb/in[[sup:2]] -> 101 kPa warns formatting-dropped', () => {
    expect(mi.checkMarkers('14.7 lb/in[[sup:2]]', '14,7 lb/in[[sup:2]]', '101 kPa', LOC)).toEqual({
      blocked: [],
      warnings: [{ code: 'formatting-dropped', params: { type: 'sup', from: 1, to: 0 } }],
    });
  });
  it('a dropped [[sub: warns the same way', () => {
    expect(mi.checkMarkers('H[[sub:2]]O', 'H[[sub:2]]O', 'vatn', LOC)).toEqual({
      blocked: [],
      warnings: [{ code: 'formatting-dropped', params: { type: 'sub', from: 1, to: 0 } }],
    });
  });
  it('control: the same drop outside localization still blocks marker-dropped', () => {
    expect(check('14.7 lb/in[[sup:2]]', '14,7 lb/in[[sup:2]]', '101 kPa').blocked).toEqual([
      { code: 'marker-dropped', params: { type: 'sup', from: 1, to: 0 } },
    ]);
  });
  it('another structural type still blocks in localization ([[term:)', () => {
    expect(mi.checkMarkers('[[term:mole]]', '[[term:mól]]', 'mól', LOC).blocked).toEqual([
      { code: 'marker-dropped', params: { type: 'term', from: 1, to: 0 } },
    ]);
  });
});

describe('rule 2a: an exact TABLE/lb/rb string in baseline and English blocks when missing', () => {
  it('dropping [[TABLE:fs-1]] blocks marker-dropped with the marker', () => {
    expect(check('a [[TABLE:fs-1]]', 'a [[TABLE:fs-1]]', 'a').blocked).toEqual([
      { code: 'marker-dropped', params: { marker: '[[TABLE:fs-1]]' } },
    ]);
  });
});

describe('rule 2p: a presentational marker below the floor warns, never blocks', () => {
  it('[[i:orð]] -> orð warns formatting-dropped', () => {
    expect(check('[[i:word]]', '[[i:orð]]', 'orð')).toEqual({
      blocked: [],
      warnings: [{ code: 'formatting-dropped', params: { type: 'i', from: 1, to: 0 } }],
    });
  });
});

describe('rule 3: an unknown type warns', () => {
  it('[[zz:x]] warns marker-unknown', () => {
    expect(check('x', 'x', 'x [[zz:y]]').warnings).toEqual([
      { code: 'marker-unknown', params: { type: 'zz' } },
    ]);
  });
});

describe('rule 4: unpaired lb/rb warns', () => {
  it('[[lb:]]x warns marker-lb-rb', () => {
    expect(codes(check('x', 'x', '[[lb:]]x').warnings)).toContain('marker-lb-rb');
  });
});

describe('rule 5: legacy markup that would reach readers raw warns', () => {
  it('(a) **x** added to a new-format segment warns legacy-wrap added', () => {
    expect(check('H[[sub:2]]O', 'H[[sub:2]]O', 'H[[sub:2]]O **feitt**').warnings).toEqual([
      { code: 'legacy-wrap', params: { direction: 'added', marker: '**' } },
    ]);
  });
  it("control: chemistry's own approximately-tildes kept are silent", () => {
    const t = '~10[[sup:−3]]) úr móli og því ætti samsvarandi massi að vera (~';
    expect(check(t, t, t).warnings).toEqual([]);
  });
  it('control: **x** added to a plain segment is silent (inject converts it there)', () => {
    expect(check('plain', 'Engin merki.', 'Engin **feit** merki.').warnings).toEqual([]);
  });
  it('(b) a bracket marker added to a legacy segment warns legacy-wrap flip', () => {
    expect(check('NO3-', 'NO~3~^-^', 'NO~3~^-^ [[b:x]]').warnings).toEqual([
      { code: 'legacy-wrap', params: { direction: 'flip' } },
    ]);
  });
  it.each([
    ['*', ' *skáletrað*'],
    ['__', ' __lykilorð__'],
    ['~', ' CO~2~'],
    ['^', ' Na^+^'],
  ])('(a) a %s wrap added to a new-format segment warns with that marker', (marker, added) => {
    const base = 'H[[sub:2]]O';
    expect(check(base, base, base + added).warnings).toEqual([
      { code: 'legacy-wrap', params: { direction: 'added', marker } },
    ]);
  });
  // Final review, Important 2: `\w` is ASCII, so a Greek or Icelandic letter did not stop an asterisk opening an
  // italic. These are the reviewer's measured false positives.
  it("control: Greek letters' literal asterisks added to a new-format segment are silent", () => {
    const base = 'H[[sub:2]]O';
    expect(check(base, base, base + ' og (σ*, π*)').warnings).toEqual([]);
  });
  it('control: an asterisk after an Icelandic letter opens no italic', () => {
    const base = 'H[[sub:2]]O';
    expect(check(base, base, base + ' þ*a b*').warnings).toEqual([]);
  });
  // Final review, Important 3: `*x*` is not legacy markup for the dialect test (a literal asterisk would make a
  // segment legacy), so a segment whose only legacy markup is an italic flipped without a warning, and inject
  // then leaves the asterisks raw.
  it('(b) a bracket marker added to a segment whose only legacy markup is *italic* warns flip', () => {
    expect(check('E. coli is', '*E. coli* er', '*E. coli* er [[b:x]]').warnings).toEqual([
      { code: 'legacy-wrap', params: { direction: 'flip' } },
    ]);
  });
  it("control: chemistry's (σ, σ*, π, π*) in a plain segment that gains a bracket marker is silent", () => {
    const t = 'sameindasvigrúm (σ, σ*, π, π*)';
    expect(check(t, t, t + ' [[b:x]]').warnings).toEqual([]);
  });
});

describe('additions do not block', () => {
  it('a bracket wrap added to a plain segment is silent', () => {
    expect(check('No markers.', 'Engin merki.', '[[b:Engin]] merki.')).toEqual({
      blocked: [],
      warnings: [],
    });
  });
});
