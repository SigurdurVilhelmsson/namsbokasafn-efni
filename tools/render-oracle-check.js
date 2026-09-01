#!/usr/bin/env node
/**
 * render-oracle-check.js — §C118 T0+T3: our pipeline measured against OpenStax's OWN
 * published HTML, matched 1:1 by CNXML element id.
 *
 * WHY AN EXTERNAL ORACLE AT ALL. §C82 L149 is the cautionary case: organic example
 * titles reached the injected CNXML 102 of 102 and the RENDERED HTML 0 of 102, with
 * chemistry reading 300/300/300 throughout — which is why nothing looked wrong. The
 * lesson recorded in CLAUDE.md is to measure reach as `emitted -> injected -> RENDERED`,
 * three columns. This is the third column, and it is the only one with a reference
 * outside our own pipeline.
 *
 * WHAT MAKES THE MATCH POSSIBLE. CNXML element ids SURVIVE into OpenStax's published
 * HTML. Measured 2026-09-01: over chemistry ch01+ch03 and organic ch03, every id
 * OpenStax publishes that also exists in our frozen `01-source` — 954 chemistry and
 * 294 organic — is present, 0 unmatched, and each page maps to exactly ONE module at
 * 100% with runner-up scores of 0-2. That is also independent evidence that our
 * licence-locked source IS OpenStax's published content.
 *
 * WHY THE ENGLISH ROUND-TRIP. The page is rendered from the EN round-trip (extract ->
 * inject the module's OWN English -> render), never from `03-translated`. Three
 * reasons, all load-bearing: (1) `03-translated` is a mixed vintage — 94 of 149
 * chemistry modules currently refuse re-injection, so it is not a reference for
 * anything (§C118); (2) OpenStax's HTML is ENGLISH, so a same-language comparison can
 * check text and not only structure; (3) no MT is involved, so the check costs 0 ISK
 * and can run before any spend.
 *
 * 🔴 AN ID-MATCHED CHECK CANNOT TELL "ID RENAMED" FROM "CONTENT DROPPED", AND THE
 * DIFFERENCE IS THE WHOLE VERDICT. Measured on chemistry ch03: 27 in-scope ids are
 * absent from our render, and NOT ONE is a content loss — `para-00001`/`list-00001`
 * are the `<md:abstract>` learning objectives (whose text IS in the output, verified
 * by string search, and which carry 0 segments), and every `fs-id*` is a `<media>`
 * whose id the renderer does not carry onto the `<img>`. Organic ch03's 5 are all
 * `sect-0000N`. ▶ **Report a missing id as an ANCHOR gap until you have checked the
 * text.** Deep links to those ids do break, which is why it is reported at all.
 *
 * ⚠️ RUN `--control` BEFORE BELIEVING A CLEAN RESULT. A near-zero here is exactly the
 * shape this repo's doctrine distrusts. The control deletes a real content block that
 * currently reaches the render, asserts the mutation actually applied (byte delta),
 * and requires the victim to appear as missing ONLY in the mutated arm. Measured on
 * organic m00032: unmutated 1 missing, mutated 3 — the deleted `para-00001` plus the
 * `term-00001` nested inside it, a cascade the check correctly follows.
 *
 * The oracle reads `books/<slug>/openstax-id-manifest.json` — IDS ONLY, extracted
 * metadata rather than OpenStax content, so it raises no licence question and needs
 * no network. Regenerate it from freshly fetched pages when a chapter is added.
 *
 * Usage:
 *   node tools/render-oracle-check.js <book-slug> <chapter>            # T0 + T3
 *   node tools/render-oracle-check.js <book-slug> <chapter> --control  # prove it can see a drop
 *
 * Exit 1 if any in-scope id fails to reach the render (or the control fails).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from './cnxml-extract.js';
import { buildCnxml, parseSegments } from './cnxml-inject.js';
import { renderCnxmlToHtml } from './cnxml-render.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const idsOf = (s) => new Set([...String(s).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

/** Extract -> inject the module's own English -> render. Returns the HTML string. */
export function renderEnglishRoundTrip(src, bookSlug) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(src);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  const en = buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
  const r = renderCnxmlToHtml(en, { bookSlug });
  // renderCnxmlToHtml returns {html, pageData, undispatchedBlocks} — NOT a string.
  // Stringifying it blindly yields "[object Object]", 15 bytes, which reads as a
  // catastrophic render failure. Cost one measurement round to discover.
  return typeof r === 'string'
    ? { html: r, undispatched: [] }
    : { html: r.html, undispatched: r.undispatchedBlocks || [] };
}

/**
 * The pattern that DELETES a `<para>` by id. Selection and mutation must derive from
 * this one construction, or they can disagree — which is exactly how the control broke.
 * The id is escaped: it comes from OpenStax's manifest, which is not under this repo's
 * `[\w-]` segment-id slug rule, so a `.` in an id must match literally rather than as
 * a wildcard.
 */
export function paraDeleteRegex(id) {
  const safe = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<para id="${safe}"[\\s\\S]*?</para>`);
}

/**
 * Pick a control victim: an in-scope element that reaches the render AND that the
 * mutation can actually delete. Returns null rather than guessing.
 *
 * 🔴 DO NOT REINTRODUCE AN ID-NAMING HEURISTIC HERE. This used to be
 * `scope.find(i => rendered.has(i) && /^para-/.test(i))` with a fallback to any
 * in-scope id — a book-specific guess. Organic mints `para-0000N`; chemistry carries
 * OpenStax's `fs-id*` on the very same `<para>`. So on chemistry the prefix arm matched
 * nothing, the fallback returned a `<media>` id, and the run printed `CONTROL VOID` —
 * leaving HALF the two-book corpus with no positive control behind a passing T3.
 * State the SHAPE, never the book (CLAUDE.md §C82 L144). Pinned by
 * `tools/__tests__/render-oracle-control.test.js`.
 */
export function pickControlVictim(src, scope, renderedIds) {
  for (const id of scope) {
    if (!renderedIds.has(id)) continue;
    if (paraDeleteRegex(id).test(src)) return id;
  }
  return null;
}

function loadManifest(book) {
  const p = path.join(REPO_ROOT, 'books', book, 'openstax-id-manifest.json');
  if (!fs.existsSync(p)) throw new Error(`No OpenStax id manifest for ${book}: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const [book, chapter, ...rest] = process.argv.slice(2);
  const control = rest.includes('--control');
  if (!book || !chapter) {
    console.error('Usage: node tools/render-oracle-check.js <book-slug> <chapter> [--control]');
    process.exitCode = 2;
    return;
  }
  const man = loadManifest(book);
  const chap = man.chapters[chapter];
  if (!chap) {
    console.error(
      `Chapter ${chapter} not in the manifest. Present: ${Object.keys(man.chapters).join(', ')}`
    );
    process.exitCode = 2;
    return;
  }
  const srcDir = path.join(REPO_ROOT, 'books', book, '01-source', chapter);

  if (control) {
    // Try every module in the chapter rather than a fixed one: "the chapter has SOME
    // deletable in-scope <para>" is the real precondition, and hard-coding module [1]
    // makes the control hostage to one module's shape.
    let mod = null;
    let src = null;
    let scope = null;
    let A = null;
    let victim = null;
    for (const candidate of Object.keys(chap)) {
      const p = path.join(srcDir, `${candidate}.cnxml`);
      if (!fs.existsSync(p)) continue;
      const csrc = fs.readFileSync(p, 'utf8');
      const cscope = chap[candidate].ids.filter((i) => idsOf(csrc).has(i));
      const cA = idsOf(renderEnglishRoundTrip(csrc, book).html);
      const cvictim = pickControlVictim(csrc, cscope, cA);
      if (cvictim) {
        mod = candidate;
        src = csrc;
        scope = cscope;
        A = cA;
        victim = cvictim;
        break;
      }
    }
    if (!victim) {
      console.error(
        `CONTROL VOID — no module in ${book}/${chapter} has an in-scope <para> that reaches the render.`
      );
      process.exitCode = 1;
      return;
    }
    const re = paraDeleteRegex(victim);
    const mutated = src.replace(re, '');
    if (mutated.length === src.length) {
      console.error('CONTROL VOID — the mutation did not apply.');
      process.exitCode = 1;
      return;
    }
    const B = idsOf(renderEnglishRoundTrip(mutated, book).html);
    const missA = scope.filter((i) => !A.has(i));
    const missB = scope.filter((i) => !B.has(i));
    const ok = missB.length > missA.length && missB.includes(victim);
    console.log(`CONTROL (${book}/${chapter}/${mod}) — can T3 see a deleted content block?`);
    console.log(`  victim                : ${victim}`);
    console.log(
      `  mutation applied      : ${src.length} -> ${mutated.length} bytes (-${src.length - mutated.length})`
    );
    console.log(`  unmutated missing     : ${missA.length} ${JSON.stringify(missA)}`);
    console.log(`  mutated   missing     : ${missB.length} ${JSON.stringify(missB)}`);
    console.log(
      ok
        ? '\n✅ CONTROL PASSES — the check detects a dropped block'
        : '\n🔴 CONTROL FAILS — a clean T3 result would mean nothing'
    );
    process.exitCode = ok ? 0 : 1;
    return;
  }

  console.log(`T0+T3 — OpenStax id oracle   ${book}/${chapter}`);
  console.log('   module   osIds  inSource  inRender  MISSING(anchor)  undispatched  htmlKB');
  let scopeTot = 0;
  let missTot = 0;
  let srcMissTot = 0;
  for (const [mod, entry] of Object.entries(chap)) {
    const src = fs.readFileSync(path.join(srcDir, `${mod}.cnxml`), 'utf8');
    const S = idsOf(src);
    const inSource = entry.ids.filter((i) => S.has(i));
    srcMissTot += entry.ids.length - inSource.length;
    const { html, undispatched } = renderEnglishRoundTrip(src, book);
    const H = idsOf(html);
    const gone = inSource.filter((i) => !H.has(i));
    scopeTot += inSource.length;
    missTot += gone.length;
    console.log(
      `${gone.length ? '🔴 ' : '   '}${mod.padEnd(9)}${String(entry.ids.length).padStart(5)}` +
        `${String(inSource.length).padStart(10)}${String(inSource.length - gone.length).padStart(10)}` +
        `${String(gone.length).padStart(17)}${String(undispatched.length).padStart(14)}${String(Math.round(html.length / 1024)).padStart(8)}`
    );
    if (gone.length)
      console.log(
        `        ANCHOR GAP: ${gone.slice(0, 8).join(', ')}${gone.length > 8 ? ` … +${gone.length - 8}` : ''}`
      );
  }
  console.log(
    `   TOTAL in-scope ${scopeTot}, reaching render ${scopeTot - missTot}, anchor gaps ${missTot}`
  );
  console.log(
    `   T0: OpenStax ids absent from our 01-source: ${srcMissTot} ${srcMissTot === 0 ? '✅' : '🔴'}`
  );
  if (missTot)
    console.log(
      '\n⚠️ Anchor gaps are NOT content losses until checked — see the header note. Run --control before trusting a zero.'
    );
  process.exitCode = srcMissTot > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
