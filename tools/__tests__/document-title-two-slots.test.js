// tools/__tests__/document-title-two-slots.test.js
//
// §C126 ② — THE DOCUMENT `<title>` AND `<md:title>` ARE WRITTEN FROM ONE STRING
// AND MUST NOT BE WRITTEN THE SAME WAY.
//
// OpenStax's own source is the specification, both slots in one file (m00163):
//     <title><emphasis effect="italics">sp</emphasis><sup>3</sup> Hybrid …</title>
//     <md:title>sp3 Hybrid …</md:title>
// Same words. One slot carries inline markup; the mdml metadata slot is text.
//
// 🔴 WHY THIS IS A TEST AND NOT A COMMENT: the defect it guards flipped SIGN
// rather than appearing. `source-roundtrip-check lifraen-efnafraedi ch01` scored
// m00163 `{"emphasis":"32->31","sup":"11->10"}` while extraction could not see a
// marked-up title (the markup was LOST); the extract-side fix alone turned that
// into `32->33 / 11->12` (the markup DUPLICATED into metadata). Both are wrong
// and both are non-zero. Only writing the two slots differently reaches 0.
//
// ⚠️ THE `[[` ASSERTION IS NOT DECORATION. `structure.title.text` is marker-form
// English, and it became marker-BEARING under §C126 ② — so the fallback path
// publishes a literal `[[i:sp]]` unless it is stripped (§C140 ㉟'s damage shape).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { roundTrip } from '../source-roundtrip-check.js';
import { parseCnxmlDocument } from '../lib/cnxml-parser.js';

const SRC = (book) => join(import.meta.dirname, '..', '..', 'books', book, '01-source');

/** Every module of a book, as {unit, moduleId, src}. */
function modules(book) {
  const root = SRC(book);
  const out = [];
  for (const unit of readdirSync(root)) {
    const dir = join(root, unit);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.cnxml'))) {
      out.push({
        unit,
        moduleId: f.replace('.cnxml', ''),
        src: readFileSync(join(dir, f), 'utf8'),
      });
    }
  }
  return out;
}

const firstTitle = (cnxml) => cnxml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? null;
const mdTitle = (cnxml) => cnxml.match(/<md:title>([\s\S]*?)<\/md:title>/)?.[1] ?? null;

describe('§C126 ② — a module title carrying markup fills two slots, two ways', () => {
  const organic = modules('lifraen-efnafraedi');
  const marked = organic.filter((m) => /<[a-zA-Z]/.test(parseCnxmlDocument(m.src).titleRaw || ''));

  it('PREMISE PIN — the guarded population is non-empty, or everything below is vacuous', () => {
    // A corpus with no marked-up title would pass every assertion here by having
    // nothing to check. 32 of 342 organic modules, 0 of 149 chemistry — which is
    // why 149 modules of chemistry campaign work could not have caught this.
    expect(marked.length).toBeGreaterThan(0);
  });

  it('m00163 — the worked example, both slots asserted by VALUE', () => {
    const m = organic.find((x) => x.moduleId === 'm00163');
    const out = roundTrip(m.src);
    // The document <title> keeps the markup the source put there.
    expect(firstTitle(out)).toBe(
      '<emphasis effect="italics">sp</emphasis><sup>3</sup> Hybrid Orbitals and the Structure of Methane'
    );
    // <md:title> is TEXT — and it matches what OpenStax itself wrote there.
    expect(mdTitle(out)).toBe('sp3 Hybrid Orbitals and the Structure of Methane');
    expect(mdTitle(out)).toBe(mdTitle(m.src));
  });

  it('no <md:title> in the corpus acquires markup, and none acquires a raw marker', () => {
    const withTags = [];
    const withMarkers = [];
    for (const m of marked) {
      const out = roundTrip(m.src);
      const md = mdTitle(out);
      if (md === null) continue; // a module with no mdml title has nothing to damage
      if (/<[a-zA-Z]/.test(md)) withTags.push(`${m.unit}/${m.moduleId}: ${md}`);
      if (md.includes('[[')) withMarkers.push(`${m.unit}/${m.moduleId}: ${md}`);
    }
    expect(withTags).toEqual([]);
    expect(withMarkers).toEqual([]);
  });

  it('CONTROL — the markup survives into <title>, bar the ONE title the smallcaps gap owns', () => {
    // Without this control, a change that flattened BOTH slots would satisfy the
    // md:title test above by stripping everything — a passing suite and a book
    // with no italics in any heading.
    //
    // 🔴 THE EXCEPTION IS NAMED, NOT TOLERATED. ch25/m00301's title is
    // `<emphasis effect="smallcaps">D</emphasis>,<emphasis effect="smallcaps">L</emphasis>
    // Sugars`, and `smallcaps` HAS NO BRACKET-MARKER TYPE — so extract drops it and
    // the title round-trips as plain `D,L Sugars`. That is organic blocker ① (116
    // occurrences across 12 modules), not a defect in this one; the same module is
    // still red in the round-trip check at `{"emphasis":"29->10"}`, i.e. its BODY
    // loses 19 more.
    //
    // ▶ WHEN ① LANDS THIS LIST GOES EMPTY AND THIS TEST GOES RED. That is the
    // point: it is the notification, not an obstacle. Empty the array then.
    const lost = marked
      .filter((m) => !/<[a-zA-Z]/.test(firstTitle(roundTrip(m.src)) ?? ''))
      .map((m) => `${m.unit}/${m.moduleId}`);
    expect(lost).toEqual(['ch25/m00301']);
  });

  it('CONTROL — chemistry has no marked-up title, and round-trips unchanged in both slots', () => {
    const chem = modules('efnafraedi-2e');
    expect(
      chem.filter((m) => /<[a-zA-Z]/.test(parseCnxmlDocument(m.src).titleRaw || '')).length
    ).toBe(0);
    const changed = chem.filter((m) => {
      const out = roundTrip(m.src);
      return mdTitle(out) !== mdTitle(m.src);
    });
    expect(changed).toEqual([]);
  });
});
