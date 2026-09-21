/**
 * §C169 — a bracket marker inside an `alt` is INVENTED BY CONSTRUCTION.
 *
 * `alt` is an XML ATTRIBUTE VALUE. Markup cannot live there, so extraction can
 * never emit a marker into an alt segment — measured 2026-09-20 over the whole
 * committed corpus: **0 of 3,312 EN alt segments carry one**. Any marker found
 * on the IS side is therefore something the MT added, and unwrapping it to its
 * content cannot destroy anything legitimate.
 *
 * 🔴 THIS IS ORTHOGONAL TO `unwrapInventedMarkers`, WHICH CANNOT SEE IT.
 * That function decides by TYPE — it strips only types absent from
 * `KNOWN_BRACKET_TYPES`. The corpus instance was `[[sub:]]`, a wholly
 * legitimate type, invented in a position where no type is legitimate. One rule
 * is keyed on type, the other on position; neither subsumes the other.
 *
 * The live instance (ch12 m68791): OpenStax spells subscripts out in words in
 * alt text because screen readers read it aloud — "C subscript 4 H subscript 6"
 * — and the model rendered them as real markup, `C[[sub:4]]H[[sub:6]]`. Inject
 * then REFUSED the module, correctly, rather than writing a raw `[[sub:4]]`
 * onto a published page.
 *
 * 🔴 WHERE THE RULE LIVES IS THE HARD-WON PART, AND IT WAS GOT WRONG TWICE.
 *   1. `readAlt` alone does nothing — both figure-alt callers deliberately
 *      bypass it via `ctx.peekSeg`, and say so in a comment, because readAlt
 *      records a lookup MISS that makes inject refuse a pre-§C81 vintage.
 *   2. `replaceMediaAlt` alone does nothing either — it is one of SEVEN sites
 *      writing an `alt="…"`, and this figure is served by `rewriteOpenTag`.
 * ▶ So the rule sits at the single LOOKUP both routes share (`peekSeg`, keyed on
 * `:alt:`) plus `readAlt` for the getSeg route. Patching writers would mean
 * maintaining an enumeration; patching the lookup does not.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAlt, stripAltMarkers } from '../lib/alt-segments.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MARKER = /\[\[[A-Za-z][A-Za-z0-9_]*[:|]/g;

describe('stripAltMarkers — a marker in an alt is invented by construction', () => {
  it('unwraps the corpus instance to its content', () => {
    expect(stripAltMarkers('ln [C[[sub:4]]H[[sub:6]]]')).toBe('ln [C4H6]');
  });

  it('leaves alt text with no markers byte-identical', () => {
    const s = 'Sýnd eru tvö gröf, bæði með merkingunni „Tími (s)“ á x-ásnum.';
    expect(stripAltMarkers(s)).toBe(s);
  });

  it('unwraps a legitimate TYPE too — position is the rule, not type', () => {
    // `i` is in KNOWN_BRACKET_TYPES, so unwrapInventedMarkers would keep it.
    expect(stripAltMarkers('a [[i:kursíf]] b')).toBe('a kursíf b');
  });

  it('keeps the visible label of a piped marker, not the target', () => {
    expect(stripAltMarkers('sjá [[xref:kafla|1]]')).toBe('sjá kafla');
  });

  it('drops a closing token rather than emitting it as prose', () => {
    expect(stripAltMarkers('a [[/i]] b')).toBe('a  b');
  });

  it('leaves a literal square bracket that is not a marker alone', () => {
    expect(stripAltMarkers('[C4H6] er 1 [[ 2')).toBe('[C4H6] er 1 [[ 2');
  });

  it('is applied by readAlt to the TRANSLATED value', () => {
    const alt = { segmentId: 'm1:alt:x-alt', text: 'C subscript 4' };
    expect(readAlt(alt, () => 'C[[sub:4]]')).toBe('C4');
  });

  it('is applied by readAlt to the fallback text too', () => {
    const alt = { segmentId: 'm1:alt:x-alt', text: 'C[[sub:4]]' };
    expect(readAlt(alt, () => null)).toBe('C4');
  });

  it('leaves a legacy plain-string alt untouched (pre-§C81 shape)', () => {
    expect(readAlt('a plain legacy alt', () => null)).toBe('a plain legacy alt');
  });
});

describe('THE BASE RATE THAT LICENSES THIS — 0 of every EN alt segment', () => {
  // 🔴 This is the whole safety argument, so it is ASSERTED, not described. If
  // extraction ever starts emitting a marker into an alt, this goes red and the
  // unwrap above becomes destructive — which is exactly when you want to know.
  it('no EN alt segment in the committed corpus carries a bracket marker', () => {
    const parse = (p) => {
      const t = fs.readFileSync(p, 'utf8');
      const out = new Map();
      const re = /<!--\s*SEG:([^\s]+?)\s*-->/g;
      let m,
        last = null,
        lastIdx = 0;
      while ((m = re.exec(t))) {
        if (last !== null) out.set(last, t.slice(lastIdx, m.index));
        last = m[1];
        lastIdx = re.lastIndex;
      }
      if (last !== null) out.set(last, t.slice(lastIdx));
      return out;
    };
    let altSegments = 0;
    const offenders = [];
    for (const b of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
      const root = path.join(ROOT, 'books', b, '02-for-mt');
      if (!fs.existsSync(root)) continue;
      for (const ch of fs.readdirSync(root)) {
        const d = path.join(root, ch);
        if (!fs.statSync(d).isDirectory()) continue;
        for (const f of fs.readdirSync(d)) {
          if (!f.endsWith('-segments.en.md')) continue;
          for (const [k, v] of parse(path.join(d, f))) {
            if (!/:alt:/.test(k)) continue;
            altSegments++;
            if ((v.match(MARKER) || []).length) offenders.push(`${b}/${ch}/${k}`);
          }
        }
      }
    }
    // The COUNT beside the predicate: an empty walk must not read as clean.
    expect(altSegments).toBeGreaterThan(3000);
    expect(offenders).toEqual([]);
  });
});

describe('REACH — no marker survives into a published alt (the property, not the mechanism)', () => {
  // 🔴 The unit tests above prove the FUNCTION works. This proves the PIPELINE
  // applies it, which is a different claim — a correct function wired into the
  // wrong place is exactly how this defect survived two attempted fixes.
  // Scanned over the injected tree rather than a fixture, because the two failed
  // attempts each passed their own unit tests.
  it('no alt="" in any injected CNXML carries a bracket marker', () => {
    const roots = ['efnafraedi-2e', 'lifraen-efnafraedi']
      .map((b) => path.join(ROOT, 'books', b, '03-translated'))
      .filter((p) => fs.existsSync(p));
    const files = [];
    const walk = (p) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name);
        if (e.isDirectory()) walk(f);
        else if (e.name.endsWith('.cnxml')) files.push(f);
      }
    };
    roots.forEach(walk);
    const offenders = [];
    let altAttrs = 0;
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.match(/alt="[^"]*"/g) || []) {
        altAttrs++;
        if (MARKER.test(m)) offenders.push(`${path.basename(f)} :: ${m.slice(0, 80)}`);
        MARKER.lastIndex = 0;
      }
    }
    // The COUNT beside the predicate — an empty walk must not read as clean.
    expect(files.length).toBeGreaterThan(50);
    expect(altAttrs).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
