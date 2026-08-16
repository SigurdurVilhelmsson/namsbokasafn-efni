import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

/**
 * §C89 corpus gate — do translated alts actually REACH the injected output?
 *
 * 🔴 THIS EXISTS BECAUSE NO COUNT-BASED CHECK CAN ANSWER THAT QUESTION. When the
 * injector discards a translation it leaves the ENGLISH alt in place, so the
 * attribute count is unchanged and every counting check reconciles. On 2026-08-16,
 * with §C82 Plan A's round-trip check, `cnxml-extract-alt-corpus` and E5's coverage
 * check all green corpus-wide, **627 of 951 chemistry alt translations (65.9%,
 * across 130 of 149 modules) were being thrown away** by `buildFigure`'s
 * verbatim-copy path and by the note/example/exercise container builders.
 *
 * The method is a sentinel: every alt segment's text is replaced with a token that
 * could not have come from the source, then counted in the output. Comparing values
 * is the only thing that separates "translated" from "copied through in English".
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function sourceModules(book) {
  const root = path.join(REPO_ROOT, 'books', book, '01-source');
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.cnxml')) out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

/** Sentinel-sweep one book: how many alt translations survive injection? */
function sweep(book) {
  let emitted = 0;
  let reached = 0;
  const dropped = [];
  for (const f of sourceModules(book)) {
    const src = fs.readFileSync(f, 'utf8');
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const parsed = parseSegments(formatSegmentsMarkdown(segments));
    const sent = new Map();
    let n = 0;
    for (const [key] of parsed) {
      if (String(key).split(':')[1] !== 'alt') continue;
      const token = `ZQXALT${n}ZQX`;
      parsed.set(key, token);
      sent.set(key, token);
      n++;
    }
    if (!n) continue;
    emitted += n;
    const out = buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
    let hit = 0;
    for (const token of sent.values()) if (out.includes(token)) hit++;
    reached += hit;
    if (hit < n) dropped.push(path.basename(f, '.cnxml'));
  }
  return { emitted, reached, dropped };
}

describe('§C89 — translated alt reaches the injected output', () => {
  it('chemistry: 950 of 951 alt translations survive; only m68801 does not', () => {
    // 🔴 THE BEFORE/AFTER IS THE POINT, and it is what makes this pin meaningful:
    //   before §C89   324 / 951   (65.9% discarded, 130 modules affected)
    //   after  §C89   950 / 951   (0.1% discarded, 1 module)
    // A bare `expect(reached).toBeGreaterThan(0)` would have passed at BOTH, which
    // is exactly how the original defect survived every gate.
    const r = sweep('efnafraedi-2e');

    expect(r.emitted).toBe(951);
    expect(r.reached).toBe(950);

    // ⚠️ m68801 is a KNOWN, LOGGED RESIDUAL, not an accepted failure. Its holdout is
    // a BARE <media> (no <figure> wrapper) at `media < item < list < example`: the
    // container preserves that subtree verbatim, so the inline-media placeholder
    // never expands, and the figure-id-keyed lookup §C89 added cannot reach a media
    // that belongs to no figure. Closing it needs a media-id-keyed lookup — the same
    // mechanism §C88 must build anyway. Pinned by NAME so that if the count ever
    // improves or a DIFFERENT module starts dropping, this test says which.
    expect(r.dropped).toEqual(['m68801']);
  }, 300_000);

  it('organic: all 1,918 alt translations survive', () => {
    // 🔴 THE SECOND BOOK IS NOT A REPEAT — IT CAUGHT A DEFECT CHEMISTRY COULD NOT.
    //   before §C89   1675 / 1918   (87.3%)
    //   after  §C89   1918 / 1918   (100%)
    // §C89's first cut keyed its lookup on the media's id and still dropped 243 here
    // (12.7%, 110 modules) — because organic's media are overwhelmingly ID-LESS,
    // while chemistry's are not. Chemistry alone reported 950/951 and looked done.
    // ▶ One corpus is one corpus. A book whose shapes differ is the cheapest way to
    // find out which of your assumptions were really about the data.
    const r = sweep('lifraen-efnafraedi');

    expect(r.emitted).toBe(1918);
    expect(r.reached).toBe(1918);
    expect(r.dropped).toEqual([]);
  }, 600_000);
});
