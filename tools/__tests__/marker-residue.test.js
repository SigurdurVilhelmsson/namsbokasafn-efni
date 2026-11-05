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
 * `TRUNCATED_REAL` is an excerpt of that committed module
 * (`66612e43d:books/efnafraedi-2e/03-translated/mt-preview/ch03/m68700.cnxml`) —
 * verbatim from `Þessi` through `</emphasis> eða`, then cut short at a sentence
 * end, since the fixture needs the damaged marker and not the rest of the
 * paragraph. It is inlined rather than read from git because CI clones at depth
 * 1, so a test that reached into history would be vacuous there.
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

describe('§C145 ① — the end-scan is depth-aware, because `[^\\]]*\\]\\]` is the bug', () => {
  // An adversarial review (2026-09-17) measured both of these against the first
  // implementation, which used `[^\]]*\]\]` anchored at the opener — i.e. the
  // very idiom §C115 and this item exist to correct.
  it('does not borrow a LATER marker’s close to call a truncated marker intact', () => {
    // `[[term:broken` never closes; the `]]` belongs to the [[b:ok]] after it.
    const [hit] = findMarkerResidue('x [[term:broken and then [[b:ok]] more');
    expect(hit.token).toBeNull();
  });

  it('reports a NESTED marker’s whole token, not the prefix up to the inner close', () => {
    expect(findMarkerResidue('[[term:a [[i:b]] c|id-1]]')[0].token).toBe(
      '[[term:a [[i:b]] c|id-1]]'
    );
  });

  it('treats a literal ] in the payload as payload, not as the end', () => {
    // organic m00061's shape after inner-marker resolution: an INTACT but
    // unresolved docref whose body carries a literal bracket.
    const t =
      '<item>[[docref:specific rotation, [<em>α</em>]<sub>D</sub>|m00052#term-00004]]</item>';
    expect(findMarkerResidue(t)[0].token).toBe(
      '[[docref:specific rotation, [<em>α</em>]<sub>D</sub>|m00052#term-00004]]'
    );
  });

  it('gives up rather than scanning the whole document for a close', () => {
    expect(findMarkerResidue(`[[term:${'x'.repeat(4000)}]]`)[0].token).toBeNull();
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

/**
 * §C205 — a multi-word type. The opener stopped at `\w*`, so a space or a hyphen
 * in the type hid the marker from inject's gate and both render gates.
 * `SPACED_REAL` is verbatim from committed chemistry ch18 m68832 (the figure
 * alt that reached the prepared 18-4 page). `OLD_OPENER` is the superseded
 * predicate, kept as the control that proves the fixture is the blind shape.
 */
const OLD_OPENER = /\[\[(?!MATH:|MEDIA:)[A-Za-z]\w*:/g;
const oldOpenerFinds = (s) => (s.match(OLD_OPENER) || []).length;
const SPACED_REAL = '„c“ og „d“. Ljósmynd a sýnir [[test tube:tilraunaglas]] sem inniheldur';

describe('§C205 — multi-word marker types', () => {
  it('control: the old opener cannot see the spaced or hyphenated shape', () => {
    expect(oldOpenerFinds(SPACED_REAL)).toBe(0);
    expect(oldOpenerFinds('[[test-tube:x]]')).toBe(0);
  });

  it('finds the committed spaced marker, whole', () => {
    const hits = findMarkerResidue(SPACED_REAL);
    expect(hits).toHaveLength(1);
    expect(hits[0].token).toBe('[[test tube:tilraunaglas]]');
  });

  it('finds a hyphenated type and an Icelandic multi-word type', () => {
    expect(findMarkerResidue('[[test-tube:x]]')).toHaveLength(1);
    expect(findMarkerResidue('[[tala Avogadros:x]]')).toHaveLength(1);
  });

  it('finds a truncated spaced marker', () => {
    const hits = findMarkerResidue('sýnir [[test tube:tilraunaglas sem');
    expect(hits).toHaveLength(1);
    expect(hits[0].token).toBeNull();
  });

  it('still finds one-letter and ASCII types', () => {
    expect(findMarkerResidue('[[i:b]] [[term:a]]')).toHaveLength(2);
  });

  it('keeps the MATH and MEDIA placeholders exempt', () => {
    expect(findMarkerResidue('[[MATH:12]] [[MEDIA:3]]')).toHaveLength(0);
  });

  it('leaves bracketed prose alone: digits, a space before the colon, parentheses', () => {
    expect(findMarkerResidue('[[sjá mynd 3.2: gildi]]')).toHaveLength(0);
    expect(findMarkerResidue('[[word :x]]')).toHaveLength(0);
    expect(findMarkerResidue('[[hvarf A (aq): x]]')).toHaveLength(0);
  });
});
