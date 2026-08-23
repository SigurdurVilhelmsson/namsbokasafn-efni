import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * §C85 (duplication A) — a `<figure>` kept in place inside a table entry must be
 * marked handled AND receive its translated alt.
 *
 * THE DEFECT. `lifraen-efnafraedi` ch04/m00046 holds a `<figure id="fig-00004">`
 * inside a table `<entry>`. The table keeps it in place, and `buildFigure` ALSO
 * emits it standalone — the reader saw the image twice (4 media -> 5). This is
 * the §C89 container×figure matrix with the `table` cell left unfilled;
 * `buildExampleDom` and `buildNoteDom` already fill theirs.
 *
 * 🔴 WHY REGISTERING ALONE IS A REGRESSION, NOT A FIX — and this is the whole
 * reason the test asserts what it does. Marking the figure handled suppresses the
 * STANDALONE copy, which is the one carrying the TRANSLATED alt; the kept
 * in-table copy still carries the source ENGLISH. The count then reads a clean
 * 4 -> 4 while the content gets WORSE. An adversarial verifier measured all four
 * arms: off -> 5 media (English + sentinel), register-only -> 4 (English),
 * string-apply -> 4 (English), register + DOM-apply -> 4 (SENTINEL). Only the
 * last is correct, and only a VALUE assertion can tell them apart.
 *
 * So the assertions below are: (1) the count is right, and (2) the surviving
 * media carries the sentinel — i.e. it is the translated one.
 *
 * ⚠️ `buildTable` is string-based while `buildExampleDom` is DOM-based, so the
 * §C89 idiom does not transfer verbatim: there is no string twin of
 * `applyFigureAltDom`. The fix parses the table fragment, applies the alt through
 * the DOM, and serializes back.
 *
 * ⚠️ `buildTable` is also reached from `translateKeptContainerTables`, so the
 * registration must live INSIDE buildTable, not at one call site.
 */

const DUP_FILE = 'OChem_04_07_004.jpg';

function moduleSource(slug, module) {
  const base = path.join(REPO_ROOT, 'books', slug, '01-source');
  for (const dir of fs.readdirSync(base)) {
    const p = path.join(base, dir, `${module}.cnxml`);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error(`fixture missing: ${slug}/${module}`);
}

/** Round-trip, replacing every alt segment with a unique sentinel token. */
function roundTripWithAltSentinels(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  let n = 0;
  const tokens = [];
  for (const [key] of parsed) {
    if (String(key).split(':')[1] !== 'alt') continue;
    const token = `ZQXALT${n}ZQX`;
    parsed.set(key, token);
    tokens.push(token);
    n += 1;
  }
  const out = buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
  return { out, tokens };
}

const live = (xml) => String(xml).replace(/<!--[\s\S]*?-->/g, '');
const countMedia = (xml) => (live(xml).match(/<media\b/g) || []).length;

describe('§C85-A — a table-kept figure is registered AND gets its translated alt', () => {
  it('m00046 emits the image once', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00046');
    const { out } = roundTripWithAltSentinels(src);
    expect(countMedia(out)).toBe(countMedia(src));
    expect((out.match(new RegExp(DUP_FILE.replace('.', '\\.'), 'g')) || []).length).toBe(1);
  });

  it('🔴 the SURVIVING copy carries the TRANSLATED alt, not the source English', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00046');
    const { out, tokens } = roundTripWithAltSentinels(src);
    expect(tokens.length, 'the module must emit alt segments at all').toBeGreaterThan(0);

    // Find the <media> wrapping the duplicated image and read its alt.
    const m = out.match(
      new RegExp(`<media\\b([^>]*)>(?:(?!</media>)[\\s\\S])*?${DUP_FILE.replace('.', '\\.')}`)
    );
    expect(m, 'the media wrapping the image must be present').not.toBeNull();
    const alt = (m[1].match(/alt="([^"]*)"/) || [])[1];
    expect(alt, 'the surviving media must carry an alt').toBeTruthy();
    // This is the assertion the register-only fix fails: it would leave the
    // English source text here while the count looked clean.
    expect(alt).toMatch(/^ZQXALT\d+ZQX$/);
  });

  it('CONTROL m00069 — §C89 already fills its cell; it must not move', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00069');
    const { out, tokens } = roundTripWithAltSentinels(src);
    expect(countMedia(out)).toBe(countMedia(src));
    // The validated instrument: every one of its kept figures carries a sentinel,
    // so if this module regressed to English alts the test would catch it.
    const reached = tokens.filter((t) => out.includes(t)).length;
    expect(reached).toBe(tokens.length);
  });

  it('CONTROL m00023 — the other duplication, fixed separately, stays fixed', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00023');
    const { out } = roundTripWithAltSentinels(src);
    expect(countMedia(out)).toBe(countMedia(src));
  });
});
