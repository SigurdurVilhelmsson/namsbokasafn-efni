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

// ─────────────────────────────────────────────────────────────────────────────
describe('§C176 — the SAME invention, arriving as TAGS because getSeg converted it first', () => {
  /**
   * 🔴 §C169's UNWRAP WAS CORRECT AND STILL LET THE DEFECT REACH A READER, BECAUSE
   * IT RAN TOO LATE ON ONE PATH. Measured 2026-09-22 on `appendices-5-eiginleikar-
   * vatns.html`, which the §C174 re-buy had just repaired:
   *
   *   02-mt-output    pK[[sub:w]]                      ← the MT's invention
   *   03-translated   pK&lt;sub&gt;w&lt;/sub&gt;       ← CONVERTED, not stripped
   *   05-publication  pK&amp;lt;sub&amp;gt;w…          ← double-escaped
   *
   * A screen reader then reads the literal characters `&lt;sub&gt;`. The value it
   * replaced was `pK með lágvísi W` — correct Icelandic — so the repair made that
   * alt WORSE than the English it was fixing elsewhere on the same page.
   *
   * ▶ THE MECHANISM, AND IT IS AN ORDERING BUG RATHER THAN A MISSING CALL.
   * `getSeg` ends in `reverseInlineMarkup(...)`, which turns `[[sub:w]]` into
   * `<sub>w</sub>`. `readAlt(alt, getSeg)` therefore resolves THROUGH that
   * conversion, and `stripAltMarkers` — whose fast path is `if (!s.includes('[['))`
   * — then finds no brackets and returns the markup untouched. `ctx.peekSeg` reads
   * `segments.get()` RAW and so is unaffected, which is exactly why it exists.
   *
   * ⚠️ SO "PATCH THE SHARED LOOKUP, NOT THE WRITERS" IS NECESSARY AND WAS NOT
   * SUFFICIENT. §C169 landed in `peekSeg` on the reasoning that a single shared
   * point cannot rot — true, but `readAlt(…, getSeg)` is a SECOND shared point,
   * and a fix at one says nothing about the other. `cnxml-inject.js` carries 13
   * `alt="` sites; enumerate the RESOLUTION paths, not just the writers.
   *
   * The fix widens the invariant instead of adding a caller: **an `alt` may not
   * contain markup, in whatever form it arrived.**
   */
  it('unwraps a tag-form subscript — the live m68863 value', () => {
    expect(stripAltMarkers('Línurit með titlinum „pK<sub>w</sub> vatns“.')).toBe(
      'Línurit með titlinum „pKw vatns“.'
    );
  });

  it('unwraps the §C169 corpus case in its converted form', () => {
    expect(stripAltMarkers('C<sub>4</sub>H<sub>6</sub>')).toBe('C4H6');
  });

  it('unwraps a tag carrying ATTRIBUTES, quote-aware', () => {
    // 🔴 `<tag[^>]*>` IS THE WRONG SPAN AND THIS REPO HAS MEASURED WHY: a bare `>`
    // is legal inside an attribute value, so `[^>]*` truncates mid-attribute and
    // leaves half a tag in a published alt. The unwrap uses `TAG_ATTR_SPAN`.
    expect(stripAltMarkers('<emphasis effect="italics">cis</emphasis>-bútan')).toBe('cis-bútan');
    expect(stripAltMarkers('<emphasis effect="a>b">x</emphasis>')).toBe('x');
  });

  it('leaves ordinary prose alone — the control that keeps this honest', () => {
    // If the unwrap were a blanket delete of anything angle-bracketed, a legitimate
    // mathematical `<` in a description would vanish with it.
    const prose = 'Línurit þar sem x < y og gildið er 5 > 3.';
    expect(stripAltMarkers(prose)).toBe(prose);
    expect(stripAltMarkers('pK með lágvísi W')).toBe('pK með lágvísi W');
  });

  it('still unwraps BRACKET markers — §C169 behaviour is unchanged', () => {
    expect(stripAltMarkers('C[[sub:4]]H[[sub:6]]')).toBe('C4H6');
    expect(stripAltMarkers('pK[[sub:w]] vatns')).toBe('pKw vatns');
  });

  it('handles BOTH forms in one value', () => {
    expect(stripAltMarkers('C[[sub:4]]H<sub>6</sub>')).toBe('C4H6');
  });
});

describe('② — the three invented shapes HEAD did not unwrap (legacy sub/sup, whitespace-typed brackets)', () => {
  /**
   * Measured 2026-10-09 over every attribute-value segment in chemistry's
   * committed MT (1,340 alts + table summaries): after HEAD's strip, 9 still
   * carried markup — 8 legacy `~x~`/`^x^` pairs (5 alts, 3 table summaries) and
   * one `[[test tube:tilraunaglas]]`, a glossary-wrap whose TYPE holds a space,
   * which the scanner's type grammar stopped reading at. The same 0-base-rate
   * argument licenses all three: none occurs in ANY English segment (asserted
   * below), so on the Icelandic side each is invented by construction.
   */
  it('unwraps a legacy tilde subscript — the live m68843 value', () => {
    expect(stripAltMarkers('tengd CH~3~-hópum')).toBe('tengd CH3-hópum');
  });

  it('unwraps several tilde pairs in one value', () => {
    expect(stripAltMarkers('Co(OH)~3~ og Co(OH)~2~')).toBe('Co(OH)3 og Co(OH)2');
  });

  it('unwraps a legacy caret superscript — the live m68870 value', () => {
    expect(stripAltMarkers('Co(OH)~3~ + e^-^ → Co(OH)~2~')).toBe('Co(OH)3 + e- → Co(OH)2');
  });

  it('unwraps a whitespace-typed glossary wrap to its Icelandic side — the live m68832 value', () => {
    expect(stripAltMarkers('Ljósmynd a sýnir [[test tube:tilraunaglas]] sem inniheldur')).toBe(
      'Ljósmynd a sýnir tilraunaglas sem inniheldur'
    );
  });

  it('leaves a lone approximately-tilde alone — the control for the tilde rule', () => {
    const prose = 'um ~5 nm og ~10 nm á breidd';
    expect(stripAltMarkers(prose)).toBe(prose);
  });

  it('leaves a lone caret and spaced carets alone — the control for the caret rule', () => {
    expect(stripAltMarkers('x^2')).toBe('x^2');
    expect(stripAltMarkers('x^2 + y^2')).toBe('x^2 + y^2');
  });

  it('a pair closes only on its OWN delimiter — `~` never pairs with `^`', () => {
    expect(stripAltMarkers('a~1^b')).toBe('a~1^b');
  });

  it('a pair is anchored to formula shape — prose tildes and exponents stay (review, 2026-10-09)', () => {
    expect(stripAltMarkers('(~5,~10)')).toBe('(~5,~10)');
    expect(stripAltMarkers('x^2·y^2')).toBe('x^2·y^2');
    expect(stripAltMarkers('stendur ~2~ ein')).toBe('stendur ~2~ ein');
    expect(stripAltMarkers('„IE~1~“')).toBe('„IE1“');
    expect(stripAltMarkers('[Cu(CN)2]^-^ + e-')).toBe('[Cu(CN)2]- + e-');
    expect(stripAltMarkers('CrO~4~^2-^ og Hg~2~^2+^')).toBe('CrO42- og Hg22+');
  });

  it('leaves coordination-chemistry square brackets alone — the control for the bracket rule', () => {
    const prose = 'flétturnar [[Co(NH3)6]Cl3] og [Pt Cl4]: tvær gerðir';
    expect(stripAltMarkers(prose)).toBe(prose);
  });

  it('does not treat a spaced run as a marker unless it ends in a colon', () => {
    // Narrow on purpose: the invented shape is `[[english term:íslenska]]`.
    expect(stripAltMarkers('a [[two words]] b')).toBe('a [[two words]] b');
    expect(stripAltMarkers('a [[two words|x]] b')).toBe('a [[two words|x]] b');
  });

  it('only a WORD may run past a space — a numeric or symbolic run stays literal', () => {
    expect(stripAltMarkers('[[0.5 M lausn: x]]')).toBe('[[0.5 M lausn: x]]');
    expect(stripAltMarkers('[[ x: y]]')).toBe('[[ x: y]]');
  });

  it('a spaced type must be words THROUGHOUT and end on a letter (review, 2026-10-09)', () => {
    // Each of these was measured to lose its prose before the whole-type check.
    expect(stripAltMarkers('a [[sjá mynd 3.2: gildi]] b')).toBe('a [[sjá mynd 3.2: gildi]] b');
    expect(stripAltMarkers('[[hvarf A (aq): x]]')).toBe('[[hvarf A (aq): x]]');
    expect(stripAltMarkers('[[word :x]]')).toBe('[[word :x]]');
  });
});

describe('② BASE RATE — none of the three shapes occurs in ANY English segment', () => {
  // 🔴 The safety argument for the rules above, ASSERTED. Wider than the §C169
  // base rate on purpose: `stripMarkupToText` (an alias) also runs over TITLES,
  // which are prose — and section SLUGS are derived from those titles, so a
  // change here would rename published pages. Over EVERY book, not a named pair,
  // so the licence survives §C190 removing organic. The shapes are deliberately
  // LOOSER than the rules they license: a loose zero is the stronger statement.
  it('0 legacy sub/sup pairs and 0 whitespace-typed brackets across the EN corpus', () => {
    const SHAPES = /~[^~\s]{1,20}~|\^[^^\s]{1,20}\^|\[\[[^\][:|]*\s[^\][:|]*:/;
    let segments = 0;
    const offenders = [];
    for (const b of fs.readdirSync(path.join(ROOT, 'books'))) {
      const root = path.join(ROOT, 'books', b, '02-for-mt');
      if (!fs.existsSync(root)) continue;
      for (const ch of fs.readdirSync(root)) {
        const d = path.join(root, ch);
        if (!fs.statSync(d).isDirectory()) continue;
        for (const f of fs.readdirSync(d)) {
          if (!f.endsWith('-segments.en.md')) continue;
          const parts = fs.readFileSync(path.join(d, f), 'utf8').split(/<!--\s*SEG:(\S+?)\s*-->/);
          for (let i = 1; i < parts.length; i += 2) {
            segments++;
            if (SHAPES.test(parts[i + 1])) offenders.push(`${b}/${parts[i]}`);
          }
        }
      }
    }
    // The COUNT beside the predicate: an empty walk must not read as clean.
    expect(segments).toBeGreaterThan(20000);
    expect(offenders).toEqual([]);
  });
});

describe('② REACH — the real committed MT, injected in memory, writes no markup into an attribute', () => {
  // The unit tests prove the function; this proves the inject path applies it to
  // the six modules where the residue actually lives, with the INPUT residue
  // counted as the positive control — so a harness that read nothing, or modules
  // that stopped carrying residue, cannot read as a pass. No tree is written.
  const SHAPES = {
    bracket: /\[\[/,
    tilde: /~[^~\s]{1,20}~/,
    caret: /\^[^^\s]{1,20}\^/,
  };
  // Output side also catches §C176's tag shape, raw or escaped once/twice, so a
  // reordering inside stripAltMarkers cannot pass here silently.
  const OUT_RESIDUE = /\[\[|~[^~\s]{1,20}~|\^[^^\s]{1,20}\^|&(?:amp;)*lt;[a-zA-Z/]/;
  const MODULES = {
    m68832: 'ch18',
    m68843: 'ch19',
    m68849: 'ch20',
    m68735: 'ch06',
    m68865: 'appendices',
    m68870: 'appendices',
  };

  it('0 residue-bearing alt/summary attributes in the output, from residue-bearing inputs of every class', async () => {
    const { extractSegments } = await import('../cnxml-extract.js');
    const { buildCnxml, parseSegments } = await import('../cnxml-inject.js');
    const { isAttributeValueSegmentId } = await import('../lib/alt-segments.js');
    const book = path.join(ROOT, 'books', 'efnafraedi-2e');
    const inputs = { bracket: 0, tilde: 0, caret: 0 };
    let attrs = 0;
    const offenders = [];
    for (const [m, ch] of Object.entries(MODULES)) {
      const src = fs.readFileSync(path.join(book, '01-source', ch, `${m}.cnxml`), 'utf8');
      const isPath = path.join(book, '02-mt-output', ch, `${m}-segments.is.md`);
      const is = parseSegments(fs.readFileSync(isPath, 'utf8'));
      for (const [id, text] of is) {
        if (!isAttributeValueSegmentId(id)) continue;
        for (const [k, re] of Object.entries(SHAPES)) if (re.test(text)) inputs[k]++;
      }
      const { structure, equations, inlineAttrs } = extractSegments(src);
      const out = buildCnxml(structure, is, equations, src, {}, inlineAttrs).cnxml;
      for (const a of out.match(/\s(?:alt|summary)="[^"]*"/g) || []) {
        attrs++;
        if (OUT_RESIDUE.test(a)) offenders.push(`${m} ${a.trim().slice(0, 60)}`);
      }
    }
    // The positive control, per class (measured 2026-10-09: bracket 6 — the
    // whitespace-typed wrap + 5 `[[sub:N]]` §C169 already cleared — tilde 8,
    // caret 1). ⚠️ Read from READ-ONLY `02-mt-output`: if a sanctioned hand repair
    // or re-buy ever empties a class, re-plant its shape into the repaired segment
    // (cf. mt-output-guards-corpus) — never delete the control.
    expect(inputs.bracket).toBeGreaterThan(0);
    expect(inputs.tilde).toBeGreaterThan(0);
    expect(inputs.caret).toBeGreaterThan(0);
    expect(attrs).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  }, 60000);
});
