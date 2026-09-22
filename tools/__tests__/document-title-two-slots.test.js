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
import { extractSegments } from '../cnxml-extract.js';
import { slugify } from '../lib/module-sections.js';
import { stripMarkupToText } from '../lib/alt-segments.js';

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

  it('CONTROL — the markup survives into <title> for EVERY marked-up title', () => {
    // Without this control, a change that flattened BOTH slots would satisfy the
    // md:title test above by stripping everything — a passing suite and a book
    // with no italics in any heading.
    //
    // ✅ DISCHARGED 2026-09-22 BY §C178, AND THE DISCHARGE IS THE POINT. This
    // assertion was written as `toEqual(['ch25/m00301'])` — that module's title is
    // `<emphasis effect="smallcaps">D</emphasis>,<emphasis effect="smallcaps">L</emphasis>
    // Sugars` and `smallcaps` had no bracket-marker type, so it round-tripped as
    // plain `D,L Sugars`. The exception was NAMED rather than tolerated precisely
    // so that fixing ① would turn this test red and say so. It did, in the same
    // full-suite run that proved §C178 green. ▶ A known defect pinned as a
    // checker's control is a defect with a scheduled notification.
    const lost = marked
      .filter((m) => !/<[a-zA-Z]/.test(firstTitle(roundTrip(m.src)) ?? ''))
      .map((m) => `${m.unit}/${m.moduleId}`);
    expect(lost).toEqual([]);
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

describe('§C177 — the THIRD consumer: the title becomes the page FILENAME', () => {
  const organic = modules('lifraen-efnafraedi');
  const marked = organic.filter((m) => /<[a-zA-Z]/.test(parseCnxmlDocument(m.src).titleRaw || ''));

  // What extraction now emits as the module title — MARKER-FORM by design, so the
  // paid wire and the injector can carry the markup. `buildModuleSections` reads
  // exactly this string out of `02-structure` and hands it to `slugify`, which
  // keeps only [a-z0-9-] — so a marker does not vanish, its TYPE NAME survives.
  const titles = marked.map((m) => ({
    id: `${m.unit}/${m.moduleId}`,
    raw: extractSegments(m.src).structure.title.text,
    plain: parseCnxmlDocument(m.src).title,
  }));

  it('POSITIVE CONTROL — the raw title really would poison the URL, or this guards nothing', () => {
    // Compared by VALUE against the plain title, not by pattern: a "does it look
    // like a marker name" regex fires on `Integration of…` and `Isomerism…` alike.
    const poisoned = titles.filter((t) => slugify(t.raw) !== slugify(t.plain));
    expect(poisoned.length).toBeGreaterThan(0);
  });

  it('THE GUARD — a stripped title slugs to exactly what the plain title slugs to', () => {
    const wrong = titles
      .filter((t) => slugify(stripMarkupToText(t.raw)) !== slugify(t.plain))
      .map((t) => t.id);
    expect(wrong).toEqual([]);
  });

  it('two worked examples, by VALUE — and the damage is not only the marker name', () => {
    const m163 = titles.find((t) => t.id === 'ch01/m00163');
    expect(slugify(m163.raw)).toBe('ispsup3-hybrid-orbitals-and-the-structure-of');
    expect(slugify(stripMarkupToText(m163.raw))).toBe(
      'sp3-hybrid-orbitals-and-the-structure-of-methane'
    );

    // ⚠️ THE SECOND FAILURE MODE, WHICH A "no marker name in the slug" TEST MISSES
    // ENTIRELY: the marker text spends the 50-character budget, so the slug is cut
    // in a different place and a real WORD is lost. `…-proton` against
    // `…-proton-counting`. A URL can be wrong without looking wrong.
    const m148 = titles.find((t) => t.id === 'ch13/m00148');
    expect(slugify(m148.raw)).toBe('integration-of-sup1h-nmr-absorptions-proton');
    expect(slugify(stripMarkupToText(m148.raw))).toBe(
      'integration-of-1h-nmr-absorptions-proton-counting'
    );
  });

  it('STRUCTURAL PIN — buildModuleSections applies the strip, stated as the weak test it is', () => {
    // ⚠️ THIS IS A SOURCE PIN, NOT A BEHAVIOURAL TEST, AND THE REASON IS WORTH
    // WRITING DOWN. `buildModuleSections` reads `title.text` out of committed
    // `02-structure/*-structure.json`, and **0 of 491 committed structures carry a
    // marker** — they were all written before extraction could see a marked-up
    // title. So the production path has no input that would expose the defect, and
    // a test calling it today would pass whether or not the strip is there: the
    // vacuous green this repo keeps measuring.
    //
    // ▶ WHAT WOULD RETIRE THIS: re-extracting organic (free — `02-structure` and
    // `02-for-mt` are GENERATED). The moment any committed structure carries a
    // marker-form title, replace this with a call to `buildModuleSections` and
    // assert the slug by value.
    //
    // The tokens pinned are the CALL SITES, not the identifier — the identifier
    // also appears in the comment above them, and a pin that trips on its own
    // documentation is a known failure here.
    const src = readFileSync(join(import.meta.dirname, '..', 'lib', 'module-sections.js'), 'utf8');
    expect(src).toContain("stripMarkupToText(structure.title.text || '')");
    expect(src).toContain("stripMarkupToText(segments.get(titleSegId) || '')");
  });
});
