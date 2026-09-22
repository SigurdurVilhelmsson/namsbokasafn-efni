// tools/__tests__/smallcaps-marker.test.js
//
// §C178 — `<emphasis effect="smallcaps">` is the D/L carbohydrate notation and it
// is NOT italics. Teaching the pipeline a new bracket type touches four
// enumerations and two converters, and the failure mode differs at each one, so
// the columns are asserted separately rather than as one end-to-end number.
//
// 🔴 THE REASON THIS IS NOT A "FORMATTING NICETY": the renderer's fallback maps an
// UNMAPPED effect to `<em>`. So the half-fix — letting smallcaps survive
// extraction without giving the renderer a case — publishes an ITALIC D, and in
// chemical nomenclature α/β ARE italic while D/L are not. That is a confident
// wrong statement replacing a silent omission, and no count can see either.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { extractSegments } from '../cnxml-extract.js';
import { roundTrip } from '../source-roundtrip-check.js';
import { processInlineContent } from '../lib/cnxml-elements.js';
import {
  unwrapInventedMarkers,
  KNOWN_BRACKET_TYPES,
  countBracketMarkersAll,
} from '../api-translate.js';
import { BODY_SOURCE_ELEMENTS } from '../lib/bracket-body-check.js';

const SRC = (book) => join(import.meta.dirname, '..', '..', 'books', book, '01-source');

function modulesWithSmallcaps(book) {
  const out = [];
  const root = SRC(book);
  for (const unit of readdirSync(root)) {
    const dir = join(root, unit);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.cnxml'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      const n = (src.match(/effect="smallcaps"/g) || []).length;
      if (n) out.push({ unit, moduleId: f.replace('.cnxml', ''), src, n });
    }
  }
  return out;
}

const count = (s, re) => (s.match(re) || []).length;

describe('§C178 — smallcaps reaches the reader as small-caps, not as italics', () => {
  const organic = modulesWithSmallcaps('lifraen-efnafraedi');

  it('PREMISE PIN — the guarded population is non-empty, and chemistry is the negative control', () => {
    // Everything below is vacuous on a corpus with no smallcaps. Chemistry has
    // none, which is why 149 modules of campaign work could not have caught this
    // and why chemistry is the right neutrality control for the shared renderer.
    expect(organic.length).toBeGreaterThan(0);
    expect(modulesWithSmallcaps('efnafraedi-2e')).toEqual([]);
  });

  it('EMITTED → INJECTED: every source element survives both legs, by count and per module', () => {
    const rows = organic.map((m) => {
      const { segments } = extractSegments(m.src);
      return {
        id: `${m.unit}/${m.moduleId}`,
        source: m.n,
        emitted: segments.reduce((a, s) => a + count(s.text, /\[\[sc:/g), 0),
        injected: count(roundTrip(m.src), /effect="smallcaps"/g),
      };
    });
    // Per module, not just in aggregate: a total can be right while two modules
    // are wrong in opposite directions.
    expect(rows.filter((r) => r.emitted !== r.source || r.injected !== r.source)).toEqual([]);
  });

  it('🔴 NESTED INSIDE ANOTHER <emphasis> — the case two cancelling bugs made INVISIBLE', () => {
    // `<emphasis effect="bold"><emphasis effect="smallcaps">D</emphasis> Sugars</emphasis>`
    // The effect-bearing handler is a lazy regex with no innermost-first loop, so it
    // truncated at the first `</emphasis>`; the class-handler then matched the
    // wreckage and, having no class, returned `[[i:…]]`. The two errors composed
    // into WELL-FORMED nesting with the WRONG TYPE — `[[b:[[i:D]] Sugars]]`.
    //
    // ▶ An <emphasis> went in and an <emphasis> came out, so the round-trip tag
    // census read `{}` for this module BEFORE and AFTER. No count could see it.
    const m = organic.find((x) => x.moduleId === 'm00226');
    const { segments } = extractSegments(m.src);
    const sugars = segments.filter((s) => /\[\[b:\[\[sc:/.test(s.text));
    expect(sugars.length).toBe(2);
    expect(sugars[0].text.startsWith('[[b:[[sc:D]] Sugars]]')).toBe(true);
    // The regression this guards: NOT [[b:[[i:D]] …]].
    expect(segments.some((s) => /\[\[b:\[\[i:[DL]\]\] Sugars?\]\]/.test(s.text))).toBe(false);
  });

  it('RENDERED — smallcaps becomes a class, and an unmapped effect still falls back to <em>', () => {
    const ctx = { equations: {} };
    expect(processInlineContent('<emphasis effect="smallcaps">D</emphasis>-glúkósi', ctx)).toBe(
      '<span class="smallcaps">D</span>-glúkósi'
    );
    // Nested, innermost-first — the shape the corpus actually holds.
    expect(
      processInlineContent(
        '<emphasis effect="bold"><emphasis effect="smallcaps">D</emphasis> sykrur</emphasis>',
        ctx
      )
    ).toBe('<strong><span class="smallcaps">D</span> sykrur</strong>');
    // 🔴 THE CONTROL THAT MAKES THE ABOVE MEAN SOMETHING. Without a smallcaps case
    // the renderer maps it here instead — an italic D. This asserts the fallback
    // is still reachable, so the first assertion is testing a real branch.
    expect(processInlineContent('<emphasis effect="nosuchthing">D</emphasis>', ctx)).toBe(
      '<em>D</em>'
    );
    expect(processInlineContent('<emphasis effect="italics">x</emphasis>', ctx)).toBe('<em>x</em>');
  });

  it('🔴 THE PAID WIRE — an unknown type is DESTROYED there, so membership is the whole guard', () => {
    // unwrapInventedMarkers strips markers the MT invented around glossary words,
    // deciding purely by membership in KNOWN_BRACKET_TYPES. A real marker whose
    // type is absent is indistinguishable from an invented one — that is §C118's
    // measured damage, on the leg that costs money.
    expect(KNOWN_BRACKET_TYPES.has('sc')).toBe(true);
    const real = 'Tveir [[sc:D]],[[sc:L]] og [[b:[[sc:D]] sykrur]].';
    expect(unwrapInventedMarkers(real).text).toBe(real);
    expect(unwrapInventedMarkers(real).unwrapped).toEqual([]);
    // POSITIVE CONTROL — the stripper is live, and this is exactly what `sc` would
    // suffer without membership: the payload written into the Icelandic as prose.
    const invented = 'Tveir [[zz:D]],[[zz:L]] og [[b:[[zz:D]] sykrur]].';
    const out = unwrapInventedMarkers(invented);
    expect(out.text).toBe('Tveir D,L og [[b:D sykrur]].');
    expect(out.unwrapped.length).toBe(3);
  });

  it('the conservation check has an `sc` column, and the body check knows its source element', () => {
    // Without a column, bracketMarkerDelta is blind to the very loss it exists to
    // catch — the second half of §C118's two-enumeration defect.
    expect(countBracketMarkersAll('[[sc:D]] [[sc:L]]').sc).toBe(2);
    expect(BODY_SOURCE_ELEMENTS.sc).toEqual(['emphasis']);
  });
});
