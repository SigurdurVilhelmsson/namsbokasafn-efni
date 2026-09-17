import { describe, it, expect } from 'vitest';
import {
  findMarkerResidue,
  describeMarkerResidue,
  countPlaceholderMarkers,
  markerResidueRegex,
  MARKER_RESIDUE_OPENER_SOURCE,
} from '../lib/marker-residue.js';

/**
 * §C145 ① — the marker-residue predicate.
 *
 * 🔴 THE REGRESSION THIS PINS IS AN ABSENCE, SO THE SUPERSEDED PATTERN IS
 * CARRIED HERE AS A CONTROL. The old gate matched a whole `[[type:…]]` token;
 * ⑰'s corruption eats the closing `]]`, so it scored 0 on the committed corrupt
 * chemistry m68700 while the literal `[[term:` sat in the file and later reached
 * a prepared reader page. A test that only asserted "the new pattern finds it"
 * would pass against the OLD code too if the fixture happened to be intact —
 * `oldGateFinds` below is what proves the fixture is the blind shape.
 *
 * `TRUNCATED_REAL` is a verbatim excerpt of that committed module
 * (`66612e43d:books/efnafraedi-2e/03-translated/mt-preview/ch03/m68700.cnxml`),
 * inlined rather than read from git: CI clones at depth 1, so a test that
 * reached into history would be vacuous there.
 */

/** The pattern this item supersedes — whole-token, requires a closing `]]`. */
const OLD_CLOSED_FORM = /\[\[(?!MATH:|MEDIA:)[A-Za-z][\w]*:[^\]]*\]\]/g;
const oldGateFinds = (s) => (s.match(OLD_CLOSED_FORM) || []).length;

const TRUNCATED_REAL =
  'Þessi stóra tala er grundvallarfasti þekktur sem [[term:tala Avogadros ' +
  '(<emphasis effect="italics">N<sub>A</sub> (e. avogadro’s number ' +
  '(<emphasis effect="italics">na)</emphasis>)|term-00003</emphasis> eða ' +
  'Avogadros-fastinn til heiðurs ítalska vísindamanninum.';

/** A closed residue, the shape both the old and new gates see. Verbatim from
 * committed microbiology m58805 — an EMPTY marker body, which is why the
 * predicate must not require content between the colon and the `]]`. */
const CLOSED_REAL = 'Skaðlegur <term id="term-00006">þörungablómi</term>[[b:]], sem verður þegar';

describe('§C145 ① — the corruption the old gate could not see', () => {
  it('the superseded whole-token pattern scores 0 on the real truncated marker', () => {
    expect(oldGateFinds(TRUNCATED_REAL)).toBe(0);
  });

  it('the opener-only predicate finds it', () => {
    expect(findMarkerResidue(TRUNCATED_REAL)).toHaveLength(1);
  });

  it('and reports it as truncated, with no whole token to show', () => {
    const [hit] = findMarkerResidue(TRUNCATED_REAL);
    expect(hit.token).toBeNull();
    expect(hit.opener).toBe('[[term:');
  });

  it('carries a context window, which is the only diagnosable part of a truncated hit', () => {
    const [hit] = findMarkerResidue(TRUNCATED_REAL);
    expect(hit.context).toContain('grundvallarfasti');
  });

  it('names the truncation in the human-readable report', () => {
    expect(describeMarkerResidue(findMarkerResidue(TRUNCATED_REAL))).toContain('TRUNCATED');
  });
});

describe('§C145 ① — intact residue is still caught, and reported in full', () => {
  it('both the old and the new pattern see a closed marker (the control)', () => {
    expect(oldGateFinds(CLOSED_REAL)).toBe(1);
    expect(findMarkerResidue(CLOSED_REAL)).toHaveLength(1);
  });

  it('an empty marker body counts — the predicate must not require content', () => {
    expect(findMarkerResidue('x[[b:]]y')[0].token).toBe('[[b:]]');
  });

  it('shows the whole token when it survives', () => {
    expect(describeMarkerResidue(findMarkerResidue(CLOSED_REAL))).toContain('[[b:]]');
  });

  it('does not label an intact marker as truncated', () => {
    expect(describeMarkerResidue(findMarkerResidue(CLOSED_REAL))).not.toContain('TRUNCATED');
  });
});

describe('§C145 ① — carve-outs, kept identical to the superseded gate', () => {
  it('ignores the [[MATH:n]] placeholder, which term-text.js keeps on purpose', () => {
    expect(findMarkerResidue('a [[MATH:3]] b')).toHaveLength(0);
  });

  it('ignores the [[MEDIA:n]] placeholder', () => {
    expect(findMarkerResidue('a [[MEDIA:11]] b')).toHaveLength(0);
  });

  it('counts the carved-out placeholders separately, for non-gating report', () => {
    expect(countPlaceholderMarkers('[[MATH:3]] x [[MEDIA:1]] y [[MATH:4]]')).toEqual({
      math: 2,
      media: 1,
    });
  });

  it('does NOT carve out a lowercase [[math:n]] — that form exists only mid-pipeline', () => {
    expect(findMarkerResidue('stray [[math:3]]')).toHaveLength(1);
  });

  it('does not fire on a type that merely starts with MATH', () => {
    expect(findMarkerResidue('[[MATHS:1]]')).toHaveLength(1);
  });
});

describe('§C145 ① — negative controls: shapes that must never fire', () => {
  it('leaves nested chemistry brackets alone (no word:colon after the openers)', () => {
    expect(findMarkerResidue('the complex [[Ag(NH3)2]+] and [[Co(NH3)6]Cl3]')).toHaveLength(0);
  });

  it('leaves an OpenStax editorial comment alone ([[Insert UNF p. 149-1 here]])', () => {
    expect(findMarkerResidue('<!--[[Insert UNF p. 149-1 here]]-->')).toHaveLength(0);
  });

  it('leaves a single bracket alone', () => {
    expect(findMarkerResidue('see [term:x] and [ [b:y] ]')).toHaveLength(0);
  });

  it('returns nothing for empty and nullish input', () => {
    expect(findMarkerResidue('')).toHaveLength(0);
    expect(findMarkerResidue(null)).toHaveLength(0);
    expect(findMarkerResidue(undefined)).toHaveLength(0);
  });
});

describe('§C145 ① — the shared-state trap the string export exists to prevent', () => {
  it('mints a fresh regex each call, so a second scan is not silently truncated', () => {
    const a = markerResidueRegex();
    a.exec('[[b:1]] [[i:2]]'); // leaves lastIndex set on THIS instance
    expect(markerResidueRegex().lastIndex).toBe(0);
  });

  it('gives the same answer twice in a row on the same input', () => {
    const text = '[[b:1]] and [[i:2]] and [[term:3';
    expect(findMarkerResidue(text)).toHaveLength(3);
    expect(findMarkerResidue(text)).toHaveLength(3);
  });

  it('exports the predicate as a string, not as a shared RegExp object', () => {
    expect(typeof MARKER_RESIDUE_OPENER_SOURCE).toBe('string');
  });
});

describe('§C145 ① — reporting stays bounded', () => {
  const many = Array.from({ length: 25 }, (_, i) => `<p>[[x${i}:v]]</p>`).join('');

  it('finds every hit', () => {
    expect(findMarkerResidue(many)).toHaveLength(25);
  });

  it('shows at most `max` of them', () => {
    expect(describeMarkerResidue(findMarkerResidue(many), { max: 10 }).split('\n')).toHaveLength(
      11
    );
  });

  it('says how many it withheld', () => {
    expect(describeMarkerResidue(findMarkerResidue(many), { max: 10 })).toContain('and 15 more');
  });

  it('dedupes identical hits before counting', () => {
    const dup = '[[b:same]] [[b:same]] [[b:same]]';
    expect(describeMarkerResidue(findMarkerResidue(dup)).split('\n')).toHaveLength(1);
  });
});
