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
import { planMarkerRepair, planMarkerRestore, sameVintage } from '../repair-invented-markers.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEG = (id, body) => `<!-- SEG:${id} -->\n${body}\n`;
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

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

describe('planMarkerRestore — putting back a DROPPED marker', () => {
  // 🔴 A DROP IS NOT THE MIRROR OF AN INVENTION, AND IT IS NOT MECHANICALLY
  // DECIDABLE. Unwrapping a surplus needs only "which markers are not in the
  // source"; restoring a drop needs "which WORD in the translation is the one
  // that was emphasised" — a correspondence across a translation. Measured over
  // all 61 same-vintage pairs: of 308 dropped markers only **4 (1.3%)** have
  // their source payload sitting unambiguously in the output, so an automatic
  // rule reaches essentially none of them. ch14's `[[i:enamine]]` is in the
  // 98.7% — it became `enamíns`.
  //
  // ▶ SO THE JUDGEMENT IS THE OPERATOR'S AND THE MECHANICS ARE THE TOOL'S. The
  // caller names the target text; the tool refuses unless that text occurs
  // EXACTLY ONCE, is not already inside a marker, and the restore makes the
  // segment's count match the source exactly.
  it('restores a named target and brings the count back to the source', () => {
    const en = SEG('s1', 'An [[i:enamine]] (alk[[i:ene]] + [[i:amine]]) is nucleophilic.');
    const is = SEG('s1', 'Enamíns (alk[[i:en]] + [[i:amín]]) er kjarnsækið.');
    const r = planMarkerRestore(en, is, { segId: 's1', type: 'i', target: 'Enamíns' });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('[[i:Enamíns]]');
    expect((r.text.match(/\[\[i:/g) || []).length).toBe(3); // matches the source
  });

  it('REFUSES when the segment has no drop — nothing to put back', () => {
    const en = SEG('s2', 'An [[i:enamine]] here.');
    const is = SEG('s2', 'Eitt [[i:enamín]] hér.');
    const r = planMarkerRestore(en, is, { segId: 's2', type: 'i', target: 'hér' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no dropped/i);
    expect(r.text).toBe(is);
  });

  it('REFUSES an ambiguous target — more than one occurrence', () => {
    // ⚠️ Two occurrences in the SAME case. An earlier fixture used
    // 'Basi og basi.' — the capitalised one does not match a lowercase target,
    // so the count was 1 and the test failed for a fixture bug, not a code bug.
    const en = SEG('s3', 'The [[i:base]] and the [[i:base]].');
    const is = SEG('s3', 'Sýra: basi og basi.');
    const r = planMarkerRestore(en, is, { segId: 's3', type: 'i', target: 'basi' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/2 time|ambiguous|exactly once/i);
    expect(r.text).toBe(is);
  });

  it('REFUSES a target that does not occur at all', () => {
    const en = SEG('s4', 'The [[i:base]] here.');
    const is = SEG('s4', 'Eitthvað annað hér.');
    const r = planMarkerRestore(en, is, { segId: 's4', type: 'i', target: 'basi' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not found|0 time/i);
  });

  it('REFUSES a target already inside a marker — no nesting a marker in itself', () => {
    const en = SEG('s5', 'The [[i:base]] and [[i:acid]].');
    const is = SEG('s5', 'Sýra og [[i:basi]].');
    const r = planMarkerRestore(en, is, { segId: 's5', type: 'i', target: 'basi' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/already inside|within a marker/i);
    expect(r.text).toBe(is);
  });

  it('reports the REMAINING gap when a segment lost more than one marker', () => {
    // Real shape: orverufraedi m58781 drops two `[[b:]]` from one segment.
    // Refusing would make such a segment permanently unrepairable; the operator
    // needs to know one call did not finish the job. `remaining` is that signal,
    // and it is 0 on a single-drop restore.
    const en = SEG('s7', 'A [[i:one]], a [[i:two]] and a [[i:three]].');
    const is = SEG('s7', 'Einn, tveir og [[i:þrír]].');
    const r = planMarkerRestore(en, is, { segId: 's7', type: 'i', target: 'Einn' });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(1); // still one short — say so rather than pretend
    expect(r.text).toContain('[[i:Einn]]');
    const single = planMarkerRestore(SEG('s8', 'A [[i:one]] here.'), SEG('s8', 'Einn hér.'), {
      segId: 's8',
      type: 'i',
      target: 'Einn',
    });
    expect(single.remaining).toBe(0); // control: a complete restore reports 0
  });

  it('REFUSES an unknown segment id rather than silently doing nothing', () => {
    const en = SEG('s6', 'The [[i:base]].');
    const is = SEG('s6', 'Basi.');
    const r = planMarkerRestore(en, is, { segId: 'nope', type: 'i', target: 'Basi' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/segment/i);
  });

  // 🔴 PLANTED, FOR THE SECOND TIME THIS SESSION — and that repetition is the
  // lesson. An anchor that reads live data and asserts the DEFECT is still there
  // dies the moment the defect is repaired. It happened with ch23's surplus, was
  // written down, and then happened again here with ch14's drop within the hour.
  // ▶ WHEN A CHECK'S EVIDENCE IS THE THING YOU ARE ABOUT TO FIX, PLANT IT FIRST.
  // These two lines are verbatim from
  // `books/lifraen-efnafraedi/02-mt-output/ch14/exercises-segments.is.md` at
  // commit 0c2bd270, before the ⑳ restore.
  const CH14_SEG = '14-99-OC-AP41:stem:358557-b0';
  const CH14_EN =
    'The double bond of an [[i:enamine]] (alk[[i:ene]] + [[i:amine]]) is much more nucleophilic than a typical alkene double bond. Assuming that the nitrogen atom in an enamine is [[i:sp]][[sup:2]]-hybridized, draw an orbital picture of an enamine, and explain why the double bond is electron-rich.';
  const CH14_IS_BEFORE =
    'Tvítengi enamíns (alk[[i:en]] + [[i:amín]]) er mun kjarnsæknara en dæmigert tvítengi alkens. Gerðu ráð fyrir að niturfrumeindin í enamíni sé [[i:sp]][[sup:2]]-blendinguð, teiknaðu svigrúmsmynd af enamíni og útskýrðu hvers vegna tvítengið er rafeindaríkt.';

  it('PLANTED: ch14 lost [[i:enamine]] and it restores onto the right word', () => {
    // The defect: the source marks `enamine` where it is DEFINED; the model
    // translated it to `enamíns` and dropped the marker. Note the two later
    // `enamíni` forms — the source leaves those unmarked too, so the target is
    // unambiguous only because the inflection differs.
    expect((CH14_EN.match(/\[\[i:/g) || []).length).toBe(4);
    expect((CH14_IS_BEFORE.match(/\[\[i:/g) || []).length).toBe(3); // one short
    const r = planMarkerRestore(SEG(CH14_SEG, CH14_EN), SEG(CH14_SEG, CH14_IS_BEFORE), {
      segId: CH14_SEG,
      type: 'i',
      target: 'enamíns',
    });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(0);
    expect(r.text).toContain('Tvítengi [[i:enamíns]] (alk[[i:en]]');
    expect((r.text.match(/\[\[i:/g) || []).length).toBe(4); // matches the source
  });

  it('ch14 exercises is now CLEAN, and a further restore is REFUSED', () => {
    const en = read('books/lifraen-efnafraedi/02-for-mt/ch14/exercises-segments.en.md');
    const is = read('books/lifraen-efnafraedi/02-mt-output/ch14/exercises-segments.is.md');
    expect(is).toContain('Tvítengi [[i:enamíns]] (alk[[i:en]]'); // the repair, by value
    const count = (s) => (s.match(/\[\[i:/g) || []).length;
    expect(count(is)).toBe(count(en));
    // Non-vacuity: the file must still carry italics, or the equality is trivial.
    expect(count(is)).toBeGreaterThan(30);
    // And the tool must now decline to add another — the segment is complete.
    const again = planMarkerRestore(en, is, { segId: CH14_SEG, type: 'i', target: 'enamíni' });
    expect(again.ok).toBe(false);
    expect(again.reason).toMatch(/no dropped/i);
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
