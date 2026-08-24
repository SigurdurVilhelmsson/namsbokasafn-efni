import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * §C85-alt — a table `<entry>` holding BOTH a `<media>` and a `<para>` must emit an
 * alt segment for that media, and the translation must REACH the output.
 *
 * THE GAP, and it is a gap BETWEEN two sibling branches that each work. `processTable`
 * routes a cell on `cellParas.length >= 1`:
 *
 *   else branch (no para)     §C88 keys the alt on `altElementIdFromSrc(src)`, records
 *                             `cell.alt = {segmentId, text, mediaId, src}`, and
 *                             `buildTable` writes it back via `applyMediaAltString`.
 *                             244 of organic's 245 entry-media arrive here.
 *   cellParas >= 1 branch     extracts the paras and NOTHING ELSE. It never looks at a
 *                             sibling `<media>`, so no alt segment is emitted — and
 *                             `buildTable`'s matching branch has no write-back either.
 *                             Exactly ONE entry corpus-wide arrives here: m00032's.
 *
 * §C85 already fixed the MEDIA loss for this entry (the `>= 1` predicate) and is pinned
 * by `table-entry-media-preserved.test.js`. The image survives; only its alt does not.
 * The consequence is reader-visible: OpenStax publishes that image, so Icelandic readers
 * get an English description of a figure that is on the page.
 *
 * 🔴 BOTH HALVES ARE ASSERTED SEPARATELY AND THAT IS NOT REDUNDANT (CLAUDE.md §C89): a
 * segment can be emitted, sent to the paid MT, and then DISCARDED at inject, leaving the
 * English alt in place — which moves no count. Emission is a tally; reaching the output
 * needs a sentinel that compares VALUES.
 *
 * SCOPE, measured with a parser over all five books (1,192 modules): entries holding
 * both a `<media>` and a `<para>` = 1. Chemistry 29 entries-with-media / 0 with a para;
 * organic 245 / 1; biology, micro and physics 0 entries-with-media at all.
 */

const ALT = 'The general structure of halide where X represents any halogen element.';
const IMG = '../../media/OChem_03_01_003c.jpg';

function moduleSource(slug, module) {
  const base = path.join(REPO_ROOT, 'books', slug, '01-source');
  for (const dir of fs.readdirSync(base)) {
    const p = path.join(base, dir, `${module}.cnxml`);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error(`fixture missing: ${slug}/${module}`);
}

/** Round-trip with every alt replaced by a token the source cannot contain (§C89). */
function sentinelRoundTrip(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  const sent = new Map();
  let n = 0;
  for (const [key] of parsed) {
    if (String(key).split(':')[1] !== 'alt') continue;
    const token = `ZQXALT${n++}ZQX`;
    parsed.set(key, token);
    sent.set(key, token);
  }
  const out = buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
  let reached = 0;
  for (const token of sent.values()) if (out.includes(token)) reached++;
  return { out, emitted: sent.size, reached, segments };
}

describe('§C85-alt — a media sharing an entry with a para still gets its alt translated', () => {
  it('emits an alt segment for the media in a para-bearing entry', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00032');
    expect(src).toContain(ALT); // control: the fixture really carries this alt
    const { segments } = extractSegments(src);
    const alts = segments.filter((s) => s.type === 'alt');
    expect(alts.map((s) => s.text)).toContain(ALT);
  });

  it('emits one alt segment per alt-bearing media in the module — 36, not 35', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00032');
    const sourceAlts = (src.match(/<media alt="/g) || []).length;
    expect(sourceAlts).toBe(36); // control: pins what the source holds
    const { segments } = extractSegments(src);
    expect(segments.filter((s) => s.type === 'alt')).toHaveLength(sourceAlts);
  });

  it('🔴 the translated alt REACHES the injected output — a sentinel, not a count', () => {
    // Emission is not delivery. §C89: 627 of 951 chemistry alts were extracted, paid
    // for and discarded at inject while every count stayed green, because the English
    // alt is still PRESENT when a translation is dropped.
    const src = moduleSource('lifraen-efnafraedi', 'm00032');
    const { out, emitted, reached } = sentinelRoundTrip(src);
    expect({ emitted, reached }).toEqual({ emitted: 36, reached: 36 });
    // And the specific one: no English alt text may survive in the output.
    expect(out).not.toContain(ALT);
  });

  it('CONTROL — the media itself is still preserved (§C85 must not regress)', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00032');
    const { out } = sentinelRoundTrip(src);
    expect(out).toContain(IMG);
    const entries = [...out.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    const holder = entries.find((e) => e.includes(IMG));
    expect(holder, 'the image must still be inside an <entry>').toBeTruthy();
    expect(holder).toMatch(/<para\b/); // beside its para, cell intact
  });
});
