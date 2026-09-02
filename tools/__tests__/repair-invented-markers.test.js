/**
 * Repairing model-INVENTED markers of a KNOWN type (§C118 ⑳).
 *
 * 🔴 THE DEFECT. The Málstaður model fuses the structured `glossaries` API field
 * with the bracket syntax it sees and EMPHASISES glossary target words —
 * `[[i:basa]]`, `[[i:rafeinda]]`, `[[i:hvarfganginn]]` where the English had no
 * marker at all. That is §C67 class 3, except the model reaches for a KNOWN type
 * (`i`, `b`) rather than inventing a type name, so `unwrapInventedMarkers` —
 * which unwraps only types ABSENT from `KNOWN_BRACKET_TYPES` — structurally
 * cannot see it, correctly, since a real `[[i:β]]` must never be stripped.
 * Measured payload-level enrichment toward glossary terms the run actually SENT,
 * normalised by population size: 15x (ch23 `[[i:]]`) and 107x (m00038 `[[b:]]`).
 *
 * 🔴 THE OBVIOUS DISCRIMINATOR IS REFUTED, AND THAT IS WHY THIS IS A PRECONDITION
 * AND NOT A HEURISTIC. "A marker whose payload is absent from the English is
 * invented" looked exact on the first file inspected (19 of 19 real ones survived
 * verbatim). Over all 61 same-vintage corpus pairs it is FALSE: `[[i:]]` payloads
 * survive verbatim 91.2% of the time and `[[b:]]` only 75.5% — because a real
 * `[[b:Chemistry in Everyday Life]]` is PROSE and gets translated. Applying the
 * rule blind would delete 181 real italics and 125 real bolds.
 *
 * ▶ SO THE RULE IS NOT APPLIED BLIND. It is applied only where the document
 * ITSELF proves it separable, PER TYPE:
 *     (a) every source marker of that type still has a payload present in the
 *         output — nothing real was translated away, so nothing real is at risk;
 *     (b) no surplus payload also occurs in the source — so no occurrence is
 *         ambiguous between real and invented.
 * When either fails the type is REFUSED and its text is returned untouched.
 * Measured: the precondition holds for ch23's `[[i:]]` and FAILS for m00038's
 * `[[b:]]` — 44 of 61 same-vintage files fail it somewhere. **Refusing most of
 * the corpus is the feature.**
 *
 * ⚠️ DEPTH-AWARE, NOT `[^\]]*`. Real payloads nest (`C[[i:[[sub:n]]]]H` is in the
 * corpus), and a character class used to find the end of a structured token is
 * this repo's §C115 defect three times over.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { planMarkerRepair, sameVintage } from '../repair-invented-markers.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEG = (id, body) => `<!-- SEG:${id} -->\n${body}\n`;

describe('planMarkerRepair — the precondition', () => {
  it('unwraps a surplus marker and keeps the real one', () => {
    const en = SEG('m1:p:a', 'A [[i:β]]-keto ester reacts with base.');
    const is = SEG('m1:p:a', '[[i:β]]-ketóester hvarfast við [[i:basa]].');
    const plan = planMarkerRepair(en, is);
    expect(plan.perType.i.ok).toBe(true);
    expect(plan.perType.i.surplus).toBe(1);
    expect(plan.text).toContain('[[i:β]]-ketóester'); // real one survives
    expect(plan.text).toContain('við basa.'); // invented one unwrapped, text kept
    expect(plan.text).not.toContain('[[i:basa]]');
  });

  it('REFUSES when a real marker was translated away — nothing is separable', () => {
    // m00038's shape: `[[b:Alkanes]]` -> `[[b:Alkanar]]`, so the source payload
    // is absent from the output and a "not in the source" rule would delete the
    // real marker along with the invented ones.
    const en = SEG('m1:p:b', 'The [[b:Alkanes]] are saturated.');
    const is = SEG('m1:p:b', '[[b:Alkanar]] eru [[b:mettaðir]].');
    const plan = planMarkerRepair(en, is);
    expect(plan.perType.b.ok).toBe(false);
    expect(plan.perType.b.reason).toMatch(/translated away|not present/i);
    expect(plan.text).toBe(is); // byte-identical — nothing touched
  });

  it('REFUSES when a surplus payload also occurs in the source — ambiguous', () => {
    // Two occurrences of the same payload, one real and one invented: the counts
    // say "one too many" but nothing says WHICH.
    const en = SEG('m1:p:c', 'The [[i:alpha]] value.');
    const is = SEG('m1:p:c', 'Gildið [[i:alpha]] og [[i:alpha]].');
    const plan = planMarkerRepair(en, is);
    expect(plan.perType.i.ok).toBe(false);
    expect(plan.perType.i.reason).toMatch(/ambiguous/i);
    expect(plan.text).toBe(is);
  });

  it('is a no-op when there is no surplus, and returns the text byte-identical', () => {
    const en = SEG('m1:p:d', 'A [[i:β]] value.');
    const is = SEG('m1:p:d', 'Gildi [[i:β]].');
    const plan = planMarkerRepair(en, is);
    expect(plan.removals).toHaveLength(0);
    expect(plan.text).toBe(is);
  });

  it('scans depth-aware — a nested real payload is neither mangled nor miscounted', () => {
    const en = SEG('m1:p:e', 'Formula C[[i:[[sub:n]]]]H and a base.');
    const is = SEG('m1:p:e', 'Formúla C[[i:[[sub:n]]]]H og [[i:basi]].');
    const plan = planMarkerRepair(en, is);
    expect(plan.perType.i.ok).toBe(true);
    expect(plan.text).toContain('C[[i:[[sub:n]]]]H'); // nested real marker intact
    expect(plan.text).toContain('og basi.');
  });

  it('UNWRAPS a nested surplus payload whole — a truncating scan leaves a stray `]]`', () => {
    // ⚠️ The test above does NOT discriminate: a `[^\]]*` scan truncates both
    // sides identically, so the precondition and the result come out the same
    // and the mutation survives. Mutation-testing caught that. THIS is the case
    // where truncation actually corrupts — the surplus marker's own payload
    // contains a marker, so a truncated `end` splices at the INNER `]]` and
    // leaves the outer one behind as literal text in a reader-facing segment.
    const en = SEG('m1:p:e2', 'The group is CH3-substituted.');
    const is = SEG('m1:p:e2', 'Hópurinn er [[i:CH[[sub:3]]-hópur]] tengdur.');
    const plan = planMarkerRepair(en, is);
    expect(plan.perType.i.ok).toBe(true);
    expect(plan.perType.i.surplus).toBe(1);
    expect(plan.text).toContain('er CH[[sub:3]]-hópur tengdur.'); // inner marker kept
    expect(plan.text).not.toContain('[[i:'); // outer unwrapped
    expect(plan.text).not.toMatch(/\]\]\s*tengdur/); // and NO stray closer left behind
  });

  it('decides PER TYPE — one type repairs while another is refused', () => {
    const en = SEG('m1:p:f', 'The [[b:Alkanes]] and a [[i:β]] value.');
    const is = SEG('m1:p:f', '[[b:Alkanar]] og [[i:β]] gildi og [[i:basa]].');
    const plan = planMarkerRepair(en, is);
    expect(plan.perType.b.ok).toBe(false); // b: real payload translated away
    expect(plan.perType.i.ok).toBe(true); // i: separable
    expect(plan.text).toContain('[[b:Alkanar]]'); // refused type untouched
    expect(plan.text).not.toContain('[[i:basa]]'); // repaired type unwrapped
  });

  it('is SEGMENT-scoped — the same payload can be real in one segment and invented in another', () => {
    const en = SEG('m1:p:g', 'A [[i:base]] here.') + SEG('m1:p:h', 'Nothing marked here.');
    const is = SEG('m1:p:g', 'Hér [[i:base]].') + SEG('m1:p:h', 'Ekkert [[i:base]] hér.');
    const plan = planMarkerRepair(en, is);
    expect(plan.perType.i.ok).toBe(true);
    expect(plan.perType.i.surplus).toBe(1);
    expect(plan.text).toContain('Hér [[i:base]].'); // real, kept
    expect(plan.text).toContain('Ekkert base hér.'); // invented, unwrapped
  });

  it('is idempotent — a second pass finds nothing left to do', () => {
    const en = SEG('m1:p:i', 'A [[i:β]] value.');
    const is = SEG('m1:p:i', 'Gildi [[i:β]] og [[i:basa]].');
    const once = planMarkerRepair(en, is);
    const twice = planMarkerRepair(en, once.text);
    expect(once.removals.length).toBe(1);
    expect(twice.removals).toHaveLength(0);
    expect(twice.text).toBe(once.text);
  });
});

describe('sameVintage — a stale pair must never be compared', () => {
  // 68.2% of committed pairs are stale (the EN was re-extracted after the MT
  // ran), and there a "surplus" is just different source text. Kept pure over
  // two timestamps: a git-based test would be vacuous in CI, which clones at
  // depth 1 and stamps every mtime with the checkout instant.
  it('accepts an EN committed before the MT ran', () => {
    expect(sameVintage('2026-07-17T09:53:58Z', '2026-07-17T10:08:47.307Z')).toBe(true);
  });
  it('rejects an EN re-extracted after the MT ran', () => {
    expect(sameVintage('2026-09-01T12:00:00Z', '2026-07-17T10:08:47.307Z')).toBe(false);
  });
  it('rejects a missing timestamp rather than guessing', () => {
    expect(sameVintage(null, '2026-07-17T10:08:47.307Z')).toBe(false);
    expect(sameVintage('2026-07-17T09:53:58Z', undefined)).toBe(false);
  });
});

describe('CORPUS ANCHOR — the two real files, and one of them must be REFUSED', () => {
  const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

  // 🔴 THE FIRE-EVIDENCE IS PLANTED, BECAUSE APPLYING THE REPAIR DESTROYED IT.
  // This anchor originally read the live ch23 file and asserted 33 removals.
  // Repairing that file took the surplus to 0 and the assertion went red — the
  // §C118 ⑱ shape exactly: repairing the corpus strips a check of its only proof
  // that it works. The two fixtures below are VERBATIM pre-repair segments from
  // `books/lifraen-efnafraedi/02-mt-output/ch23/exercises-segments.is.md`
  // (commit 0c2bd270, before the ⑳ repair). ⚠️ Do not "tidy" them into synthetic
  // text: they are the only remaining record of what the model actually did.
  const PLANTED = [
    {
      segId: '23-07-OC-P12:stem:359727-b0',
      en: 'As shown in Figure 23.5, the Claisen reaction is reversible. That is, a [[i:β]]-keto ester can be cleaved by base into two fragments. Using curved arrows to indicate electron flow, show the mechanism by which this cleavage occurs.',
      is: 'Eins og sýnt er á mynd 23.5 er Claisen-efnahvarfið [[i:afturkræft]]. Það er að segja, [[i:β]]-ketóester er hægt að kljúfa með [[i:basa]] í tvö brot. Notaðu sveigðar örvar til að sýna flæði [[i:rafeinda]] og sýndu [[i:hvarfganginn]] sem þessi klofningur verður fyrir.',
      invented: ['afturkræft', 'basa', 'rafeinda', 'hvarfganginn'],
      real: ['β'],
    },
    {
      segId: '23-10-OC-P17:stimulus:b0',
      en: 'What product would you obtain from a base-catalyzed Michael reaction of 3-buten-2-one with each of the following nucleophilic donors?',
      is: 'Hvaða [[i:myndefni]] myndir þú fá úr Michael-[[i:efnahvarfi]] með [[i:basa]] sem hvata af 3-búten-2-óni með hvorum eftirfarandi [[i:kjarnsæknum]] gjöfum?',
      invented: ['myndefni', 'efnahvarfi', 'basa', 'kjarnsæknum'],
      real: [],
    },
  ];

  it('PLANTED: the real ch23 segments repair correctly — invented unwrapped, real kept', () => {
    for (const f of PLANTED) {
      const plan = planMarkerRepair(SEG(f.segId, f.en), SEG(f.segId, f.is));
      expect(plan.perType.i.ok).toBe(true);
      expect(plan.perType.i.surplus).toBe(f.invented.length);
      for (const w of f.invented) {
        expect(plan.text).not.toContain(`[[i:${w}]]`); // marker gone
        expect(plan.text).toContain(w); // word kept
      }
      for (const w of f.real) expect(plan.text).toContain(`[[i:${w}]]`);
    }
    // Non-vacuity: the fixtures must actually carry invented markers, or the
    // loop above asserts nothing.
    expect(PLANTED.reduce((n, f) => n + f.invented.length, 0)).toBe(8);
  });

  it('ch23 exercises is now CLEAN, and the tool is a no-op on it (idempotence on real data)', () => {
    const en = read('books/lifraen-efnafraedi/02-for-mt/ch23/exercises-segments.en.md');
    const is = read('books/lifraen-efnafraedi/02-mt-output/ch23/exercises-segments.is.md');
    const plan = planMarkerRepair(en, is);
    expect(plan.perType.i.ok).toBe(true);
    expect(plan.removals).toHaveLength(0);
    expect(plan.text).toBe(is); // byte-identical
    // Non-vacuity: the file must still CARRY italics, or "0 removals" is trivial.
    expect((is.match(/\[\[i:/g) || []).length).toBe(19);
    for (const real of ['[[i:β]]', '[[i:α]]']) expect(is).toContain(real);
  });

  it('ch03 m00038: [[b:]] is NOT separable and is REFUSED — the control', () => {
    // Without this, a tool that repaired everything would satisfy the case above.
    // All 21 real bolds in this module are translated prose, so none survives
    // verbatim and nothing distinguishes them from the 29 invented ones.
    const en = read('books/lifraen-efnafraedi/02-for-mt/ch03/m00038-segments.en.md');
    const is = read('books/lifraen-efnafraedi/02-mt-output/ch03/m00038-segments.is.md');
    const plan = planMarkerRepair(en, is);
    expect(plan.perType.b.ok).toBe(false);
    expect(plan.text).toBe(is); // byte-identical: the b surplus is left alone
  });
});
