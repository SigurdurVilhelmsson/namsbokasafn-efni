/**
 * T3's `--control` must be able to pick a victim in EITHER book (§C118).
 *
 * WHAT WAS BROKEN. `render-oracle-check.js --control` proves the oracle can see a
 * dropped content block: it deletes a real `<para>` that currently reaches the render
 * and requires that para to appear as missing ONLY in the mutated arm. The victim was
 * selected by an id-NAMING heuristic — `scope.find(i => A.has(i) && /^para-/.test(i))`
 * with a fallback to *any* in-scope id — and that is a book-specific guess.
 *
 *   organic  `books/lifraen-efnafraedi/01-source/ch03/m00032.cnxml`  <para id="para-00001">
 *   chemistry `books/efnafraedi-2e/01-source/ch03/m68700.cnxml`      <para id="fs-idp...">
 *
 * Same construct, two id conventions. On chemistry the `/^para-/` arm matched nothing,
 * the fallback selected `CNX_Chem_03_01_aspirin` — a `<media>` id — and the run died
 * with `CONTROL VOID — victim CNX_Chem_03_01_aspirin is not a <para>`. So HALF the
 * two-book corpus, and half the ch03 paid scope, had no working positive control while
 * its T3 result read exit 0 with 27 anchor gaps.
 *
 * 🔴 WHY THIS IS THE EXPENSIVE KIND OF BUG. The check whose job is to prove a clean
 * result means something was ITSELF unable to run on the book we were about to spend
 * money validating — and it said so in one line, at the end, after a passing T3. CLAUDE.md
 * §C82 L144 states the rule this violates: a `<title>`/container shape must be stated as a
 * SHAPE, never as a BOOK, because chemistry and organic disagree about id style while
 * agreeing about structure. An id prefix is exactly such a book-specific tell.
 *
 * THE INVARIANT, WHICH NEEDS NO ENUMERATION OF CONVENTIONS: a control victim must be an
 * element the mutation can actually DELETE. Select it by that predicate — the deletion
 * regex matching the source — not by what its id happens to be called. Selection and
 * deletion then derive from one construction and cannot disagree.
 *
 * ⚠️ The last test below is not decoration. It pins that chemistry's valid victim id does
 * NOT start with `para-`, i.e. it binds the thing that DISTINGUISHES the fix. Without it,
 * a future refactor could reinstate the naming heuristic and every other assertion here
 * would still pass on organic.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  paraDeleteRegex,
  pickControlVictim,
  renderEnglishRoundTrip,
} from '../render-oracle-check.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const idsOf = (s) => new Set([...String(s).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

const readSrc = (book, ch, mod) =>
  fs.readFileSync(path.join(REPO_ROOT, 'books', book, '01-source', ch, `${mod}.cnxml`), 'utf8');
const manifestScope = (book, ch, mod, src) => {
  const man = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'books', book, 'openstax-id-manifest.json'), 'utf8')
  );
  return man.chapters[ch][mod].ids.filter((i) => idsOf(src).has(i));
};

/** The victim selection as it stood before the fix — kept as a witness of the defect. */
const legacyPick = (scope, rendered) =>
  scope.find((i) => rendered.has(i) && /^para-/.test(i)) || scope.find((i) => rendered.has(i));

describe('T3 --control victim selection is keyed on the SHAPE, not on an id naming convention', () => {
  // Both books' second ch03 module — the same one `--control` itself picks.
  const CASES = [
    { book: 'efnafraedi-2e', ch: 'ch03', mod: 'm68700', idStyle: 'OpenStax fs-id*' },
    { book: 'lifraen-efnafraedi', ch: 'ch03', mod: 'm00032', idStyle: 'minted para-0000N' },
  ];

  for (const c of CASES) {
    it(`${c.book} (${c.idStyle}): picks a victim the mutation can actually delete`, () => {
      const src = readSrc(c.book, c.ch, c.mod);
      const rendered = idsOf(renderEnglishRoundTrip(src, c.book).html);
      const scope = manifestScope(c.book, c.ch, c.mod, src);

      // Guard against a vacuous pass: the scope must be non-empty and some of it must
      // actually reach the render, or "found a victim" would mean nothing.
      expect(scope.length).toBeGreaterThan(0);
      expect(scope.filter((i) => rendered.has(i)).length).toBeGreaterThan(0);

      const victim = pickControlVictim(src, scope, rendered);
      expect(victim).toBeTruthy();
      expect(paraDeleteRegex(victim).test(src)).toBe(true);
      expect(rendered.has(victim)).toBe(true);

      // And the mutation must genuinely shrink the document.
      const mutated = src.replace(paraDeleteRegex(victim), '');
      expect(mutated.length).toBeLessThan(src.length);
    });
  }

  it('🔴 THE REGRESSION WITNESS — the old naming heuristic picks a NON-para on chemistry', () => {
    const c = CASES[0];
    const src = readSrc(c.book, c.ch, c.mod);
    const rendered = idsOf(renderEnglishRoundTrip(src, c.book).html);
    const scope = manifestScope(c.book, c.ch, c.mod, src);

    const legacy = legacyPick(scope, rendered);
    expect(legacy).toBeTruthy();
    // This is the exact failure that produced `CONTROL VOID` on chemistry.
    expect(paraDeleteRegex(legacy).test(src)).toBe(false);

    // ...while on organic the same heuristic happened to work, which is why the defect
    // was invisible until the check was pointed at the second book.
    const o = CASES[1];
    const osrc = readSrc(o.book, o.ch, o.mod);
    const orendered = idsOf(renderEnglishRoundTrip(osrc, o.book).html);
    const oscope = manifestScope(o.book, o.ch, o.mod, osrc);
    expect(paraDeleteRegex(legacyPick(oscope, orendered)).test(osrc)).toBe(true);
  });

  it('🔴 BINDS WHAT DISTINGUISHES THE FIX — chemistry’s victim id does not start with "para-"', () => {
    const c = CASES[0];
    const src = readSrc(c.book, c.ch, c.mod);
    const rendered = idsOf(renderEnglishRoundTrip(src, c.book).html);
    const victim = pickControlVictim(src, manifestScope(c.book, c.ch, c.mod, src), rendered);
    expect(victim).toBeTruthy();
    expect(victim.startsWith('para-')).toBe(false);
  });

  it('refuses rather than guessing when no in-scope element is a deletable <para>', () => {
    const src = '<document><media id="only-media"><image src="x.png"/></media></document>';
    expect(pickControlVictim(src, ['only-media'], new Set(['only-media']))).toBeNull();
  });

  it('escapes regex metacharacters in an id rather than building a broken pattern', () => {
    // Segment ids are slugged to [\w-], but the control reads ids from OpenStax's
    // manifest, which is not under that rule. A `.` in an id must match literally.
    const src = '<document><para id="a.b">text</para><para id="axb">other</para></document>';
    expect(paraDeleteRegex('a.b').test(src)).toBe(true);
    expect(src.replace(paraDeleteRegex('a.b'), '')).toContain('axb');
    expect(src.replace(paraDeleteRegex('a.b'), '')).not.toContain('>text<');
  });
});
