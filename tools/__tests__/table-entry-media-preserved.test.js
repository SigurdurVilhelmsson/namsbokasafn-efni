import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * §C85 (drop) — a table `<entry>` holding BOTH a `<media>` and a `<para>` must not
 * lose the media.
 *
 * THE MECHANISM, traced end to end rather than inferred. `processTable` routes a
 * cell on `cellParas.length > 1`, and the two inject-side branches are NOT
 * equivalent in what they preserve:
 *
 *   cell.paras      -> starts from the ORIGINAL entryContent and replaces each
 *                      `<para id=…>` body in place. Everything else in the entry —
 *                      the `<media>` included — survives verbatim.
 *   cell.segmentId  -> returns `<entry attrs>${cellText}</entry>`, replacing the
 *                      WHOLE entry body with one flat translated string. Any
 *                      sibling `<media>` is destroyed, and the `<para>` wrapper
 *                      with it.
 *
 * `lifraen-efnafraedi` ch03/m00032 has an entry with one media and ONE para:
 *
 *     <entry>
 *       <media alt="…"><image src="…/OChem_03_01_003c.jpg"/></media>
 *       <para id="para-00004">(X=F, Cl, Br, I)</para>
 *     </entry>
 *
 * One para is not `> 1`, so it took the destroying branch. The §C88 rescue below
 * it could not help: that fires only when `extractInlineText` returns EMPTY, and
 * here the para's own text is non-empty, so the entry looked handled while its
 * image was silently discarded (36 media -> 35).
 *
 * SCOPE, measured with a control. Entries holding exactly one `<para>` number
 * **2 in lifraen-efnafraedi and 1 in efnafraedi-2e** (against 2,724 and 5,852
 * with none), and of those, entries that ALSO hold a `<media>` number exactly
 * **1 corpus-wide** — this one. So the predicate change reaches at most three
 * entries, which is why the corpus byte-diff below is the honest check on it.
 */

const DROPPED = '../../media/OChem_03_01_003c.jpg';

function moduleSource(slug, module) {
  const base = path.join(REPO_ROOT, 'books', slug, '01-source');
  for (const dir of fs.readdirSync(base)) {
    const p = path.join(base, dir, `${module}.cnxml`);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error(`fixture missing: ${slug}/${module}`);
}

function roundTrip(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

const live = (xml) => String(xml).replace(/<!--[\s\S]*?-->/g, '');
const countMedia = (xml) => (live(xml).match(/<media\b/g) || []).length;
const countImage = (xml) => (live(xml).match(/<image\b/g) || []).length;

describe('§C85-drop — a table entry keeps its media alongside its para', () => {
  it('m00032 loses no media, and the specific image survives', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00032');
    expect(src).toContain(DROPPED); // fixture really contains it
    const out = roundTrip(src);
    expect(countMedia(out)).toBe(countMedia(src));
    expect(countImage(out)).toBe(countImage(src));
    // 🔴 The VALUE assertion. A count alone would be satisfied by any media
    // surviving; this names the one that was being dropped.
    expect(out).toContain(DROPPED);
  });

  it('the surviving media is still INSIDE its own <entry>, beside its para', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00032');
    const out = roundTrip(src);
    const entries = [...out.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    const holder = entries.find((e) => e.includes(DROPPED));
    expect(holder, 'the image must still be inside an <entry>').toBeTruthy();
    // ...and the para that shares the cell is still there with it, so the fix
    // preserved the cell rather than replacing one loss with another.
    expect(holder).toMatch(/<para\b/);
  });

  it('CONTROL m00069 does not move', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00069');
    const out = roundTrip(src);
    expect(countMedia(out)).toBe(countMedia(src));
    expect(countImage(out)).toBe(countImage(src));
  });

  it('CONTROL scope — single-para entries are rare, and only one holds media', () => {
    const census = (slug) => {
      const base = path.join(REPO_ROOT, 'books', slug, '01-source');
      let onePara = 0;
      let oneParaWithMedia = 0;
      let entriesSeen = 0;
      for (const dir of fs.readdirSync(base)) {
        const d = path.join(base, dir);
        if (!fs.statSync(d).isDirectory()) continue;
        for (const f of fs.readdirSync(d)) {
          if (!f.endsWith('.cnxml')) continue;
          const t = fs.readFileSync(path.join(d, f), 'utf8');
          for (const e of t.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
            entriesSeen += 1;
            const paras = (e[1].match(/<para\b/g) || []).length;
            if (paras !== 1) continue;
            onePara += 1;
            if (/<media\b/.test(e[1])) oneParaWithMedia += 1;
          }
        }
      }
      return { onePara, oneParaWithMedia, entriesSeen };
    };
    const organic = census('lifraen-efnafraedi');
    const chem = census('efnafraedi-2e');
    // Positive control: the sweep really walked entries, so the small numbers
    // below mean "rare", not "the sweep found nothing".
    expect(organic.entriesSeen).toBeGreaterThan(1000);
    expect(chem.entriesSeen).toBeGreaterThan(1000);
    // Exactly one entry in the whole two-book corpus has the defect's shape.
    expect(organic.oneParaWithMedia + chem.oneParaWithMedia).toBe(1);
  });
});
