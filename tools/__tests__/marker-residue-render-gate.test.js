import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  renderCnxmlToHtml,
  assertNoMarkerResidueHtml,
  assertNoMarkerResidueInInputs,
  writeHtmlPage,
  _setBooksDirForTest,
} from '../cnxml-render.js';

/**
 * §C145 ② — the render-side gate on emitted HTML.
 *
 * 🔴 WHAT WENT WRONG, AND WHY THE INJECT GATE IS NOT ENOUGH. ⑰'s corruption was
 * written into chemistry m68700 by an ordinary inject on 2026-09-06, committed
 * past a `green: false` fidelity manifest, and RENDERED onto a prepared reader
 * page. Nothing between inject and the reader could see it: `cnxml-render.js`
 * contained zero occurrences of `[[`, and the render's own
 * `terms: 3/3 <dfn id> carry data-en` line reported success in the same run,
 * because its denominator is the rendered `<dfn>` count — which SHRINKS with the
 * loss. Verification caught it eleven days later.
 *
 * The first test below is the red-on-broken proof and it is deliberately shaped
 * as a PAIR: the corrupt module must render to HTML that still carries the
 * marker (otherwise the gate has nothing to catch and every later assertion is
 * vacuous), and the gate must then refuse that exact HTML.
 *
 * The fixture is a minimal module carrying the corruption VERBATIM from the
 * committed corrupt copy (`66612e43d:…/ch03/m68700.cnxml`) — inlined, not read
 * from git, because CI clones at depth 1 and a history read would be vacuous
 * there. The real module was measured the same way while this was written:
 * rendered 213,137 bytes, 1 opener hit, `[[term:tala Avogadros …` in the body.
 */

/** Verbatim from the committed corrupt m68700 — the `]]` is genuinely missing. */
const CORRUPT_PARA =
  'Þessi stóra tala er grundvallarfasti þekktur sem [[term:tala Avogadros ' +
  '(<emphasis effect="italics">N<sub>A</sub> (e. avogadro’s number ' +
  '(<emphasis effect="italics">na)</emphasis>)|term-00003</emphasis> eða ' +
  'Avogadros-fastinn til heiðurs ítalska vísindamanninum Amedeo Avogadro.';

const CLEAN_PARA =
  'Þessi stóra tala er grundvallarfasti þekktur sem tala Avogadros, ' +
  'eða Avogadros-fastinn til heiðurs ítalska vísindamanninum Amedeo Avogadro.';

const doc = (inner) => `<document xmlns="http://cnx.rice.edu/cnxml">
  <title>Mól</title>
  <content><para id="para-1">${inner}</para></content>
</document>`;

const render = (inner) =>
  renderCnxmlToHtml(doc(inner), { moduleId: 'm68700', chapter: 3, lang: 'is' }).html;

describe('§C145 ② — the corruption that reached a reader page', () => {
  it('RED: the corrupt module still renders the literal marker into HTML', () => {
    expect(render(CORRUPT_PARA)).toContain('[[term:');
  });

  it('GREEN: the gate refuses that page', () => {
    expect(() => assertNoMarkerResidueHtml(render(CORRUPT_PARA), '3-1-mol.html')).toThrow(
      /Marker residue in rendered HTML/
    );
  });

  it('names the page, so the refusal is actionable', () => {
    expect(() => assertNoMarkerResidueHtml(render(CORRUPT_PARA), '/a/b/3-1-mol.html')).toThrow(
      /3-1-mol\.html/
    );
  });

  it('reports it as truncated — the shape the inject gate could not see', () => {
    expect(() => assertNoMarkerResidueHtml(render(CORRUPT_PARA), 'p.html')).toThrow(/TRUNCATED/);
  });

  it('CONTROL: the same page without the corruption passes', () => {
    expect(() => assertNoMarkerResidueHtml(render(CLEAN_PARA), 'p.html')).not.toThrow();
  });

  it('CONTROL: the clean render is a real page, not an empty string', () => {
    expect(render(CLEAN_PARA).length).toBeGreaterThan(500);
  });
});

describe('§C145 ② — a closed marker is caught too (the microbiology legacy shape)', () => {
  // Verbatim shape from committed microbiology m58805 / 5-4-thorungar.html,
  // written 2026-03-23 — 101 days BEFORE the inject gate existed, which is why
  // it is on disk and published. An empty marker body, so the gate must not
  // require content between the colon and the `]]`.
  it('refuses a page carrying [[b:]]', () => {
    expect(() =>
      assertNoMarkerResidueHtml(render('Skaðlegur þörungablómi[[b:]], sem verður'), 'p.html')
    ).toThrow(/Marker residue/);
  });

  it('shows the whole token when it survived intact', () => {
    expect(() =>
      assertNoMarkerResidueHtml(render('Skaðlegur þörungablómi[[b:]], sem'), 'p.html')
    ).toThrow(/\[\[b:\]\]/);
  });
});

describe('§C145 ② — the gate is actually CALLED, not merely present', () => {
  /**
   * 🔴 THE FIRST VERSION OF THIS FILE PINNED THE GATE FUNCTION AND NOT ITS CALL
   * SITE, AND AN ADVERSARIAL REVIEW MEASURED THE COST: four separate mutations
   * that make the gate do nothing — deleting the call from `writeHtmlPage`
   * among them — left all 38 tests green. A gate nobody calls is a gate that
   * does nothing, and testing the function alone cannot see that.
   *
   * So this drives the real `writeHtmlPage` against a real temp directory and
   * asserts BOTH halves: it refuses, AND no bytes land. The negative control
   * (clean HTML really does get written) is what stops a wholesale breakage
   * from reading as a pass.
   */
  const tmp = mkdtempSync(join(tmpdir(), 'c145-'));

  it('refuses residue-bearing HTML at the write choke point', () => {
    const p = join(tmp, 'refused.html');
    expect(() => writeHtmlPage(p, render(CORRUPT_PARA), 3)).toThrow(/Marker residue/);
  });

  it('and writes NOTHING when it refuses', () => {
    const p = join(tmp, 'refused2.html');
    try {
      writeHtmlPage(p, render(CORRUPT_PARA), 3);
    } catch {
      /* expected */
    }
    expect(existsSync(p)).toBe(false);
  });

  it('CONTROL: a clean page IS written through the same path', () => {
    const p = join(tmp, 'written.html');
    writeHtmlPage(p, render(CLEAN_PARA), 3);
    expect(existsSync(p)).toBe(true);
  });

  it('CONTROL: and what it wrote is the page, not an empty file', () => {
    const p = join(tmp, 'written2.html');
    writeHtmlPage(p, render(CLEAN_PARA), 3);
    expect(readFileSync(p, 'utf8')).toContain('Avogadros');
  });
});

describe('§C145 ② — the pre-flight, which is what makes the gate affordable', () => {
  /**
   * 🔴 ORDERING, NOT STRENGTH. A full-chapter render unlinks every `.html` AND
   * every `.backup.*` in the chapter directory before rendering. So a gate that
   * fired only at write time would delete a chapter's pages in order to refuse
   * one module. MEASURED, counterfactually, on microbiology ch05 (which carries
   * a real committed `[[b:]]`): with the pre-flight call removed, the render
   * swept all 12 pages, refused m58805 at write time, and left 11 — the
   * published `5-4-thorungar.html` was GONE. With the pre-flight, exit 1, 12
   * pages intact, 0 changes in the tree.
   */
  const books = mkdtempSync(join(tmpdir(), 'c145-books-'));
  const chDir = join(books, '03-translated', 'mt-preview', 'ch01');
  mkdirSync(chDir, { recursive: true });
  writeFileSync(join(chDir, 'mGOOD.cnxml'), '<document><content>hreint</content></document>');
  writeFileSync(
    join(chDir, 'mBAD.cnxml'),
    '<document><content>brotið [[term:eyðilagt</content></document>'
  );

  beforeEach(() => _setBooksDirForTest(books));
  afterEach(() => _setBooksDirForTest(null));

  it('refuses before anything is swept when an input carries residue', () => {
    expect(() => assertNoMarkerResidueInInputs(['mGOOD', 'mBAD'], 'mt-preview', 'ch01')).toThrow(
      /Marker residue in the CNXML this render would publish/
    );
  });

  it('names the offending module', () => {
    expect(() => assertNoMarkerResidueInInputs(['mBAD'], 'mt-preview', 'ch01')).toThrow(/mBAD/);
  });

  it('says plainly that nothing was destroyed', () => {
    expect(() => assertNoMarkerResidueInInputs(['mBAD'], 'mt-preview', 'ch01')).toThrow(
      /NOTHING was deleted or written/
    );
  });

  it('CONTROL: a clean chapter passes', () => {
    expect(() => assertNoMarkerResidueInInputs(['mGOOD'], 'mt-preview', 'ch01')).not.toThrow();
  });

  it('CONTROL: a missing input is not this gate’s error to raise', () => {
    expect(() => assertNoMarkerResidueInInputs(['mABSENT'], 'mt-preview', 'ch01')).not.toThrow();
  });
});

describe('§C145 ② — the choke point, pinned structurally', () => {
  /**
   * An enumeration ("all seven writers call the gate") is the thing this repo
   * has watched go stale twice, so the property is checked instead: exactly ONE
   * executable `safeWrite(` call in the file, and exactly one raw
   * `fs.writeFileSync(`. A new page writer that bypasses `writeHtmlPage` must
   * use one of those two, so it cannot land silently.
   *
   * ⚠️ The pin is on `= safeWrite(`, the ASSIGNMENT form. An earlier version
   * stripped comments with a regex first and a review measured it damaging
   * executable code; the assignment form needs no stripping, because the file's
   * prose mentions are written `safeWrite()` with no `=`. Measured: `safeWrite(`
   * 3 occurrences, `= safeWrite(` exactly 1.
   */
  const SRC = readFileSync(join(import.meta.dirname, '..', 'cnxml-render.js'), 'utf8');

  it('has exactly one executable safeWrite call', () => {
    expect((SRC.match(/= safeWrite\(/g) || []).length).toBe(1);
  });

  it('and it is inside writeHtmlPage', () => {
    const body = SRC.slice(SRC.indexOf('function writeHtmlPage'));
    expect(body.slice(0, body.indexOf('\n}')).includes('= safeWrite(')).toBe(true);
  });

  it('CONTROL: the prose mentions the assignment form deliberately excludes exist', () => {
    expect((SRC.match(/safeWrite\(/g) || []).length).toBeGreaterThan(1);
  });

  it('has exactly one raw fs.writeFileSync — the plain-text rollups-complete marker', () => {
    // Not an HTML page. If this count moves, a new writer appeared and someone
    // must decide whether it emits a page and therefore needs the gate.
    expect((SRC.match(/fs\.writeFileSync\(/g) || []).length).toBe(1);
  });

  it('the pre-flight is CALLED, and called BEFORE the sweep that deletes pages', () => {
    // The ordering IS the fix (see the counterfactual above), and a unit test on
    // the function cannot see the call site. Both halves are asserted: the call
    // exists in main(), and it precedes the unlink loop that empties the
    // chapter directory.
    // ⚠️ Anchored on `args.track`, which only the CALL passes — the declaration
    // reads `(modules, track, chapterDir)`. A first version of this assertion
    // searched for `assertNoMarkerResidueInInputs(modules`, which matches the
    // DECLARATION too, so it passed with the call deleted. Mutation-tested.
    const call = SRC.indexOf('assertNoMarkerResidueInInputs(modules, args.track');
    const sweep = SRC.indexOf('Clean stale HTML files before rendering');
    expect(call).toBeGreaterThan(-1);
    expect(sweep).toBeGreaterThan(-1);
    expect(call).toBeLessThan(sweep);
  });

  it('every page writer funnels through the choke point', () => {
    // A FLOOR, not an enumeration: a legitimate eighth writer raises it and
    // stays green, while a writer that bypasses the choke point trips the two
    // pins above.
    expect((SRC.match(/writeHtmlPage\(/g) || []).length).toBeGreaterThanOrEqual(8);
  });
});
