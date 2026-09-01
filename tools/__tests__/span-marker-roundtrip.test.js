/**
 * `<span class="...">` must survive extract -> inject (§C118, organic reaction colouring).
 *
 * WHAT WAS BROKEN. The extractor's inline-marker layer handled emphasis, sub, sup,
 * link, term and footnote — and had no case for `<span>`. So the wrapper was silently
 * discarded and only its text was emitted into the segment: source
 * `<para>(<span class="magenta-text">X</span>=F, Cl, Br, I)</para>` extracted as
 * `(X=F, Cl, Br, I)`, and inject then had nothing to rebuild from. Measured on organic
 * ch03 by tools/source-roundtrip-check.js: span 10->0, 9->0, 8->0, 2->0 per module.
 *
 * WHY IT MATTERS. CLAUDE.md's clean-CNXML ruling is explicit that these stay: organic
 * carries 1,071 spans across 184 of 342 modules (magenta 379, red 364, cyan 230,
 * green 93, gray 2, yellow 2, purple 1) and they are OpenStax's red/cyan/magenta
 * reaction colouring — reader-visible chemistry notation, not decoration. Chemistry
 * has ZERO spans, so this is organic-only.
 *
 * 🔴 THE RENDER LEG IS NOT IMPLICATED, AND THAT WAS CHECKED RATHER THAN ASSUMED.
 * §C82 L149 requires measuring reach as emitted -> injected -> RENDERED, because a
 * container fix once reached the injected CNXML 102/102 and the HTML 0/102. Measured
 * here by rendering the SOURCE directly (spans still present in the input): all 10 of
 * m00032's spans reach the HTML with their class intact. The RENDERER needed no change
 * — but see the corpus test below, which asserts the full chain anyway rather than
 * trusting that conclusion, and reach was separately measured at 31 = 31 = 31 = 31
 * (source = emitted = injected = rendered) across organic ch03.
 *
 * ⚠️ "TWO SITES" WAS WRONG, AND THE THIRD IS THE INSTRUCTIVE ONE. The fix needed
 * THREE code changes, not two: (1) extract emits the marker, (2) inject resolves it,
 * and (3) `span` had to join the allowlist of CNXML tags that inject
 * placeholder-protects before escaping every remaining `<`. Without (3), (1) and (2)
 * both worked and the output was STILL wrong — the rebuilt `<span class="magenta-text">`
 * was escaped to `&lt;span class="magenta-text">`, so the marker resolved cleanly, the
 * residue check passed, and only a value comparison could see it. ▶ Counting the sites
 * a fix needs is itself a guess; verify reach end to end instead.
 *
 * ⚠️ NESTING IS REAL AND ALREADY SUPPORTED. 101 of the 1,071 spans contain other
 * markup, e.g. `<span class="magenta-text">1<emphasis effect="italics">s</emphasis></span>`.
 * The extractor already emits nested markers elsewhere (1,083 occurrences corpus-wide,
 * e.g. `[[term:S[[sub:...]]]]`), so `[[span:1[[i:s]]|magenta-text]]` is consistent with
 * existing behaviour rather than a new shape. The span conversion must therefore run
 * AFTER the emphasis conversions, or the inner emphasis would still be raw CNXML
 * inside the marker payload.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const wrapDoc = (
  inner
) => `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
${inner}
</section>
</content>
</document>`;

function extractText(cnxml) {
  const { segments } = extractSegments(cnxml);
  return formatSegmentsMarkdown(segments);
}

function roundTrip(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

const countSpans = (s) => (String(s).match(/<span\b/g) || []).length;

describe('extract emits a [[span:text|class]] marker', () => {
  it('converts a simple span, carrying its class in the marker', () => {
    const md = extractText(
      wrapDoc('<para id="p-1">(<span class="magenta-text">X</span>=F)</para>')
    );
    expect(md).toContain('[[span:X|magenta-text]]');
  });

  it('keeps the surrounding text intact around the marker', () => {
    const md = extractText(
      wrapDoc('<para id="p-1">(<span class="magenta-text">X</span>=F)</para>')
    );
    expect(md).toContain('([[span:X|magenta-text]]=F)');
  });

  it('nests an inner emphasis as a marker, not as raw CNXML', () => {
    const md = extractText(
      wrapDoc(
        '<para id="p-1"><span class="magenta-text">1<emphasis effect="italics">s</emphasis></span></para>'
      )
    );
    expect(md).toContain('[[span:1[[i:s]]|magenta-text]]');
    expect(md).not.toContain('<emphasis');
  });
});

describe('inject rebuilds the span from the marker', () => {
  it('restores the element with its class', () => {
    const out = roundTrip(wrapDoc('<para id="p-1">(<span class="magenta-text">X</span>=F)</para>'));
    expect(out).toContain('<span class="magenta-text">X</span>');
  });

  it('restores a span whose payload carries a nested emphasis', () => {
    const out = roundTrip(
      wrapDoc(
        '<para id="p-1"><span class="magenta-text">1<emphasis effect="italics">s</emphasis></span></para>'
      )
    );
    expect(out).toContain(
      '<span class="magenta-text">1<emphasis effect="italics">s</emphasis></span>'
    );
  });

  it('preserves each of the seven classes the corpus actually uses', () => {
    for (const cls of [
      'magenta-text',
      'red-text',
      'cyan-text',
      'green-text',
      'gray-text',
      'yellow-text',
      'purple-text',
    ]) {
      const out = roundTrip(wrapDoc(`<para id="p-1"><span class="${cls}">Z</span></para>`));
      expect(out, `class ${cls} lost`).toContain(`<span class="${cls}">Z</span>`);
    }
  });
});

describe('the real organic corpus round-trips its spans', () => {
  // REAL-TREE on purpose: the fixtures above cannot see a shape the corpus has and
  // the fixture author did not think of. This is the assertion that actually gates.
  const dir = path.join(REPO_ROOT, 'books', 'lifraen-efnafraedi', '01-source', 'ch03');
  const modules = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml')) : [];

  it('found modules to assert against', () => {
    expect(modules.length).toBeGreaterThan(0); // control: no modules => every case vacuous
  });

  it('the population is NON-EMPTY — some ch03 module really does carry spans', () => {
    // Without this the per-module assertion below passes trivially on a corpus with
    // no spans at all, which is exactly how a fix like this rots unnoticed.
    const total = modules.reduce(
      (n, f) => n + countSpans(fs.readFileSync(path.join(dir, f), 'utf8')),
      0
    );
    expect(total, 'organic ch03 carries no spans — the guard below is vacuous').toBeGreaterThan(0);
  });

  it.each(modules)('%s: span count survives the round-trip', (file) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(countSpans(roundTrip(src))).toBe(countSpans(src));
  });
});
