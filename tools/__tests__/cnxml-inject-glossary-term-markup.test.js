import { describe, it, expect } from 'vitest';
import { restoreGlossaryTermMarkup } from '../cnxml-inject.js';

// RC1: the glossary key-terms <term> headword must not mis-anchor or drop <sub>/<emphasis>.
// Real (translatedTerm, originalRawTerm) pairs captured from efnafraedi-2e mt-output + 01-source.
// Restore correctly when the notation content survives translation; skip (leave plain,
// NEVER mis-anchor) when the content was translated away.
describe('restoreGlossaryTermMarkup (RC1)', () => {
  it('m68700: restores emphasis+sub on the parenthesized (NA), not the leading A', () => {
    expect(
      restoreGlossaryTermMarkup(
        'Avogadrosartala (NA)',
        'Avogadro’s number (<emphasis effect="italics">N<sub>A</sub></emphasis>)'
      )
    ).toBe('Avogadrosartala (<emphasis effect="italics">N<sub>A</sub></emphasis>)');
  });

  it('m68700: NEVER mis-anchors <sub>A</sub> onto the leading A of the word', () => {
    const out = restoreGlossaryTermMarkup(
      'Avogadrosartala (NA)',
      'Avogadro’s number (<emphasis effect="italics">N<sub>A</sub></emphasis>)'
    );
    expect(out.startsWith('<sub>')).toBe(false);
    expect(out).not.toContain('<sub>A</sub>vogadros');
  });

  it('m68733 magnetic: restores (ml) as m<sub>l</sub>, not the l inside segulskammtatala', () => {
    expect(
      restoreGlossaryTermMarkup(
        'segulskammtatala (ml)',
        'magnetic quantum number (<emphasis effect="italics">m<sub>l</sub></emphasis>)'
      )
    ).toBe('segulskammtatala (<emphasis effect="italics">m<sub>l</sub></emphasis>)');
  });

  it('m68733 spin: restores (ms), not the leading s of spunaskammtatala', () => {
    expect(
      restoreGlossaryTermMarkup(
        'spunaskammtatala (ms)',
        'spin quantum number (<emphasis effect="italics">m<sub>s</sub></emphasis>)'
      )
    ).toBe('spunaskammtatala (<emphasis effect="italics">m<sub>s</sub></emphasis>)');
  });

  it('m68733 secondary: restores single-letter (l) via the parenthesized anchor, not a l in the word', () => {
    expect(
      restoreGlossaryTermMarkup(
        'hliðarskammtatala (l)',
        'secondary (angular momentum) quantum number (<emphasis effect="italics">l</emphasis>)'
      )
    ).toBe('hliðarskammtatala (<emphasis effect="italics">l</emphasis>)');
  });

  it('m68844: restores (Δoct) as Δ<sub>oct</sub>', () => {
    expect(
      restoreGlossaryTermMarkup(
        'kristallsviðsklofnun (Δoct)',
        'crystal field splitting (Δ<sub>oct</sub>)'
      )
    ).toBe('kristallsviðsklofnun (Δ<sub>oct</sub>)');
  });

  it('m68844: restores a non-parenthesized leading emphasis+sub run (eg)', () => {
    expect(
      restoreGlossaryTermMarkup(
        'eg svigrúm',
        '<emphasis effect="italics">e<sub>g</sub></emphasis> orbitals'
      )
    ).toBe('<emphasis effect="italics">e<sub>g</sub></emphasis> svigrúm');
  });

  it('m68844: restores a contiguous emphasis+nested-sub run (t2g)', () => {
    expect(
      restoreGlossaryTermMarkup(
        't2g-svigrúm',
        '<emphasis effect="italics">t</emphasis><sub>2<emphasis effect="italics">g</emphasis></sub> orbitals'
      )
    ).toBe(
      '<emphasis effect="italics">t</emphasis><sub>2<emphasis effect="italics">g</emphasis></sub>-svigrúm'
    );
  });

  it('m68741: skips (leaves plain) when the notation content was translated (lattice→grind)', () => {
    expect(
      restoreGlossaryTermMarkup(
        'grindarorka (ΔHgrind)',
        'lattice energy (Δ<emphasis effect="italics">H</emphasis><sub>lattice</sub>)'
      )
    ).toBe('grindarorka (ΔHgrind)');
  });

  it('m68822: skips when the subscript content was translated (cell→ker)', () => {
    expect(
      restoreGlossaryTermMarkup(
        'kerspenna (Eker)',
        'cell potential (<emphasis effect="italics">E</emphasis><sub>cell</sub>)'
      )
    ).toBe('kerspenna (Eker)');
  });

  it('m68791: skips when the subscript content changed (l/2→1/2)', () => {
    expect(
      restoreGlossaryTermMarkup(
        'helmingunartími efnahvarfs (t1/2)',
        'half-life of a reaction (<emphasis effect="italics">t</emphasis><sub>l/2</sub>)'
      )
    ).toBe('helmingunartími efnahvarfs (t1/2)');
  });

  it('leaves a markup-free term unchanged', () => {
    expect(restoreGlossaryTermMarkup('mól', 'mole')).toBe('mól');
  });

  it('does not double-wrap already-restored markup', () => {
    const already = 'foo (<emphasis effect="italics">N<sub>A</sub></emphasis>)';
    expect(
      restoreGlossaryTermMarkup(already, 'x (<emphasis effect="italics">N<sub>A</sub></emphasis>)')
    ).toBe(already);
  });
});
