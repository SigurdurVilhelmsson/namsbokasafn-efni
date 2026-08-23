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
  it('chemistry: all 1,149 alt translations survive (m68801 resolved by §C88 write-back)', () => {
    // 🔴 THE BEFORE/AFTER IS THE POINT, and it is what makes this pin meaningful:
    //   before §C89        324 / 951    (65.9% discarded, 130 modules affected)
    //   after  §C89        950 / 951    (0.1% discarded, 1 module — m68801)
    //   after  §C88 (T1-8) 951 / 951    (0% discarded)
    //   after  §C88 (T9)  1148 / 1148   (0% discarded; the reachability-model
    //     change — all five positions now reachable — raised the emitted count
    //     itself from 951 to 1148, +197, matching the closed blind positions)
    //   after  §C115      1149 / 1149   (m68727's raw-`>` alt, +1 — see below)
    // A bare `expect(reached).toBeGreaterThan(0)` would have passed at ALL FIVE,
    // which is exactly how the original defect survived every gate.
    //
    // 🔴 §C115 MOVED **BOTH** NUMBERS, AND THAT IS THE INTERESTING PART. The raw
    // `>` inside m68727's 485-character alt truncated an open-tag match on BOTH
    // SIDES of the pipeline, independently:
    //   - extract (`processFigure`'s `<media[^>]*>`) never emitted the segment
    //     → emitted was 1148, not 1149;
    //   - inject (`replaceMediaAlt`'s `indexOf('>')`) could not find the alt to
    //     rewrite and returned the block unchanged.
    // Fixing extraction ALONE moved emitted to 1149 while reached stayed at 1148 —
    // i.e. it manufactured a fresh §C89 drop: extracted, sent to the paid MT, and
    // discarded. ▶ That intermediate state is why this file asserts BOTH numbers.
    const r = sweep('efnafraedi-2e');

    expect(r.emitted).toBe(1149);
    expect(r.reached).toBe(1149);

    // ⚠️ m68801 WAS a KNOWN, LOGGED RESIDUAL (kept here as the record of why it
    // existed — do not delete on resolution). Its holdout was a BARE <media> (no
    // <figure> wrapper) at `media < item < list < example`: the container preserves
    // that subtree verbatim, so the figure-id-keyed lookup §C89 added could never
    // reach a media that belongs to no figure.
    //
    // ✅ RESOLVED by §C88's media-id-keyed lookup (`collectMediaAlts` +
    // `applyMediaAltDom`) — but that alone was NOT sufficient: m68801's alt segment
    // is not a `.content`-level `type:'media'` node (the shape `collectMediaAlts`
    // scans, and what later §C88 emitter tasks mint for the 197 reachable chemistry
    // instances). It lives ONLY in `structure.inlineMedia` — the pre-existing
    // [[MEDIA:N]] placeholder mechanism from §C81/§C89 — because its media is a
    // list-item block child, recorded as a bare `{type:'media', id}` with no `.alt`
    // of its own. Closing it required a SECOND source at the ctx-wiring site in
    // `buildCnxml`, folding `structure.inlineMedia` entries into `ctx.mediaAlts`
    // alongside `collectMediaAlts`'s output. Pinned by NAME so that if the count
    // ever regresses or a DIFFERENT module starts dropping, this test says which.
    expect(r.dropped).toEqual([]);
  }, 300_000);

  it('organic: all 2,162 alt translations survive (1,918 + §C88 Unit A’s 244)', () => {
    // 🔴 THE SECOND BOOK IS NOT A REPEAT — IT CAUGHT A DEFECT CHEMISTRY COULD NOT.
    //   before §C89        1675 / 1918   (87.3%)
    //   after  §C89        1918 / 1918   (100%)
    //   after  §C88 Unit A 2162 / 2162   (+244 id-less table-cell media)
    // §C89's first cut keyed its lookup on the media's id and still dropped 243 here
    // (12.7%, 110 modules) — because organic's media are overwhelmingly ID-LESS,
    // while chemistry's are not. Chemistry alone reported 950/951 and looked done.
    // ▶ One corpus is one corpus. A book whose shapes differ is the cheapest way to
    // find out which of your assumptions were really about the data.
    //
    // §C88 UNIT A — THE +244, AND WHY IT IS 244 AND NOT 245. Organic has 245
    // alt-bearing `<media>` sitting DIRECTLY in a table `<entry>` with no id and no
    // `<figure>` ancestor; `if (!media.id) continue` meant none was ever extracted.
    // 244 arrive in the empty-text branch and are keyed on the image `src`. The
    // 245th (m00032, the `cellParas` branch) is [LEAD]-DEFERRED to a hand fix —
    // ledger M1, runbook 4.5 — because wiring it in means touching a branch whose
    // sibling destroys non-para content, against a fresh §C85 pin.
    //
    // ⚠️ 245 WOULD ALSO HAVE BEEN A PLAUSIBLE-LOOKING NUMBER HERE, and briefly was:
    // `extractElements` is depth-blind, so relaxing the guard first made m00046
    // emit a figure-wrapped media's alt a SECOND time under a src key while the
    // figure path still emitted it under `fig-00004-alt`. The tell was +245 against
    // a predicted +244 — one too many, not one too few. A per-module diff named the
    // module in seconds; the book total alone would have looked close enough to
    // wave through. ▶ The population is 245 by direct-parent and 246 by any-depth,
    // and this test sits on the difference.
    const r = sweep('lifraen-efnafraedi');

    expect(r.emitted).toBe(2162);
    expect(r.reached).toBe(2162);
    expect(r.dropped).toEqual([]);
  }, 600_000);
});
