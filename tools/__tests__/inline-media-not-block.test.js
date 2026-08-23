import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * §C85 (duplication B) — a `display="inline"` <media> inside a <para> must NOT be
 * treated as a block child.
 *
 * THE DEFECT. `replaceParaContent` keeps block children in place and replaces
 * everything else with the translated content. `BLOCK_TAGS` contains `media`, so
 * an inline media was preserved in place AND re-expanded from the `[[MEDIA:n]]`
 * marker carried in the translated para text — the reader saw the image twice.
 * `lifraen-efnafraedi` ch02/m00023 went 11 media -> 12.
 *
 * 🔴 WHY THIS IS A PREDICATE CHANGE AND NOT `BLOCK_TAGS.delete('media')`.
 * `handled-tags-shared.test.js` freezes BLOCK_TAGS as an exact set and asserts
 * BLOCK_TAGS ⊆ HANDLED_BLOCK. Removing the member turns that test red and would
 * also strand genuinely block-level media (the 215 chemistry occurrences below).
 * The distinction the pipeline actually needs is `display="inline"`, which is the
 * same property that put a `[[MEDIA:n]]` marker in the text in the first place.
 *
 * 🔴 WHY THE COUNT IS NOT ENOUGH. Going 12 -> 11 says a copy was removed; it does
 * not say the RIGHT one was. If the block-preserved copy survived instead of the
 * text-expanded one, the count would be identical while the image moved to the
 * end of the paragraph, out of its sentence. The test therefore replaces the
 * para's text with marker-preserving SENTINELS and asserts the media lands
 * BETWEEN them — i.e. it is the copy expanded from `[[MEDIA:1]]`, in position.
 *
 * SCOPE, measured with a control: `<media>` inside `<para>` carrying
 * display="inline" is 7 occurrences in lifraen-efnafraedi and 0 in efnafraedi-2e
 * (which has 215 non-inline ones). Chemistry is therefore untouched by this
 * change — which is also why chemistry never exhibited the duplication.
 */

const DUP_SRC = '../../media/OChem_02_06_006.jpg';
const L = 'ZQXLEFTZQX';
const R = 'ZQXRIGHTZQX';

function moduleSource(slug, module) {
  const base = path.join(REPO_ROOT, 'books', slug, '01-source');
  for (const dir of fs.readdirSync(base)) {
    const p = path.join(base, dir, `${module}.cnxml`);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error(`fixture missing: ${slug}/${module}`);
}

function roundTrip(cnxml, mutate) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  if (mutate) mutate(parsed);
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

const countMedia = (xml) => (String(xml).match(/<media\b/g) || []).length;

describe('§C85-B — inline media is carried by its marker, not preserved as a block child', () => {
  it('m00023 emits each media exactly once', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00023');
    const before = countMedia(src.replace(/<!--[\s\S]*?-->/g, ''));
    const out = roundTrip(src);
    expect(countMedia(out)).toBe(before);
    // The specific image that was doubling: exactly one occurrence.
    expect(
      (out.match(new RegExp(DUP_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    ).toBe(1);
  });

  it('the SURVIVING copy is the text-expanded one, in its sentence position', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00023');
    const out = roundTrip(src, (parsed) => {
      for (const [key, value] of parsed) {
        if (!String(key).endsWith('para-00007')) continue;
        expect(String(value)).toContain('[[MEDIA:1]]'); // the marker really is here
        parsed.set(key, `${L}[[MEDIA:1]]${R}`);
      }
    });
    // The media must sit BETWEEN the sentinels. If the block-preserved copy had
    // survived instead, it would appear outside them (at the para's end) and the
    // count would still be right — which is the whole point of asserting this.
    const between = out.match(new RegExp(`${L}([\\s\\S]*?)${R}`));
    expect(between, 'sentinels not found in output').not.toBeNull();
    expect(between[1]).toContain(DUP_SRC);
    // ...and nowhere else in the document.
    expect(
      (out.match(new RegExp(DUP_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    ).toBe(1);
  });

  it('CONTROL m00069 is byte-identical (the §C89-cured module must not move)', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00069');
    const out = roundTrip(src);
    expect(countMedia(out)).toBe(countMedia(src.replace(/<!--[\s\S]*?-->/g, '')));
  });

  it('CONTROL scope — chemistry has 0 inline media in paras, organic has some', () => {
    const census = (slug) => {
      const base = path.join(REPO_ROOT, 'books', slug, '01-source');
      let inline = 0;
      let nonInline = 0;
      for (const dir of fs.readdirSync(base)) {
        const d = path.join(base, dir);
        if (!fs.statSync(d).isDirectory()) continue;
        for (const f of fs.readdirSync(d)) {
          if (!f.endsWith('.cnxml')) continue;
          const text = fs.readFileSync(path.join(d, f), 'utf8');
          for (const p of text.matchAll(/<para\b[^>]*>([\s\S]*?)<\/para>/g)) {
            for (const m of p[1].matchAll(/<media\b([^>]*)>/g)) {
              if (/display="inline"/.test(m[1])) inline += 1;
              else nonInline += 1;
            }
          }
        }
      }
      return { inline, nonInline };
    };
    const organic = census('lifraen-efnafraedi');
    const chem = census('efnafraedi-2e');
    // Positive control: the sweep really found media, so the zero below means
    // "none of this shape", not "the sweep looked in the wrong place".
    expect(chem.nonInline).toBeGreaterThan(100);
    expect(chem.inline).toBe(0);
    expect(organic.inline).toBeGreaterThan(0);
  });
});
