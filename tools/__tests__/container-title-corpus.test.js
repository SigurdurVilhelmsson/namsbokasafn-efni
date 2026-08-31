import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractSegments } from '../cnxml-extract.js';
import { buildCnxml } from '../cnxml-inject.js';
import { extractElements, firstDirectChildTitle } from '../lib/cnxml-parser.js';

/**
 * §C82 L143/L144 — CORPUS ANCHORS FOR THE CONTAINER-TITLE RULE.
 *
 * These are premise pins, not logic tests. Each one records a number measured
 * on 2026-08-31 over the two kept books' `01-source`, and exists so that a
 * change which silently moves it goes red instead of shipping.
 *
 * 🔴 THE MOST IMPORTANT ANCHOR IS A ZERO, AND IT MUST BE ASSERTED RATHER THAN
 * ASSUMED. Chemistry has NO <title> parented by <example>/<table>/<figure>,
 * which is what makes the direct-child branch structurally unreachable there —
 * the reason chemistry could be proven byte-identical. If OpenStax ever ships a
 * chemistry example with a direct-child title, that guarantee evaporates
 * silently, and this is the only thing that would say so.
 *
 * ⚠️ Chemistry's 301 no-slot <para><title> is a BENIGN donor artefact — those
 * titles ARE extracted, keyed on the example's id rather than the para's. A
 * change that "improves" that number is a regression, not a fix, so it is
 * pinned as an exact value in both directions.
 */

const BOOKS = join(process.cwd(), 'books');
const CHEM = join(BOOKS, 'efnafraedi-2e', '01-source');
const ORG = join(BOOKS, 'lifraen-efnafraedi', '01-source');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.cnxml')) out.push(p);
  }
  return out;
}

const chemFiles = walk(CHEM);
const orgFiles = walk(ORG);

function countDirectChildTitles(files, tag) {
  let n = 0;
  for (const f of files) {
    for (const el of extractElements(readFileSync(f, 'utf8'), tag)) {
      if (firstDirectChildTitle(el.content)) n++;
    }
  }
  return n;
}

function segmentsOf(files) {
  const all = [];
  for (const f of files) all.push(...(extractSegments(readFileSync(f, 'utf8')).segments || []));
  return all;
}

describe('§C82 L144 — corpus shape anchors', () => {
  it('the corpus is the two kept books: 149 chemistry + 342 organic = 491 modules', () => {
    expect(chemFiles.length).toBe(149);
    expect(orgFiles.length).toBe(342);
  });

  it('🔴 chemistry has ZERO direct-child titles on example/table/figure', () => {
    // The structural guarantee. Not luck — and not assumed.
    expect(countDirectChildTitles(chemFiles, 'example')).toBe(0);
    expect(countDirectChildTitles(chemFiles, 'table')).toBe(0);
    expect(countDirectChildTitles(chemFiles, 'figure')).toBe(0);
  });

  it('control: chemistry DOES have direct-child note titles, so the detector fires', () => {
    // Pairs the three zeros above with a positive control in the same book.
    // Without this, a detector that returned 0 for everything would pass.
    expect(countDirectChildTitles(chemFiles, 'note')).toBe(364);
  });

  it('organic has 102 example, 70 table and 66 figure direct-child titles', () => {
    expect(countDirectChildTitles(orgFiles, 'example')).toBe(102);
    expect(countDirectChildTitles(orgFiles, 'table')).toBe(70);
    expect(countDirectChildTitles(orgFiles, 'figure')).toBe(66);
  });
});

describe('§C82 L143 — what extraction emits', () => {
  const orgSegs = segmentsOf(orgFiles);
  const chemSegs = segmentsOf(chemFiles);

  it('every organic example title is the example’s OWN title, not a para sub-heading', () => {
    // Before the fix all 102 carried just two values, "Strategy" (101) and
    // "Solution" (1) — a saturated rate, i.e. a category rather than a result.
    // Asserting DISTINCTNESS is what discriminates: a regression that re-donated
    // para headings would collapse this back to a handful of values while the
    // COUNT stayed at 102 and no tally could see it.
    const titles = orgSegs.filter((s) => s.type === 'example-title');
    expect(titles.length).toBe(102);
    expect(new Set(titles.map((s) => s.text)).size).toBeGreaterThan(90);
  });

  it('the 102 donor paras keep their own titles (organic para-title 101 → 203)', () => {
    expect(orgSegs.filter((s) => s.type === 'para-title').length).toBe(203);
  });

  it('organic emits 70 table-title segments; chemistry emits none', () => {
    expect(orgSegs.filter((s) => s.type === 'table-title').length).toBe(70);
    expect(chemSegs.filter((s) => s.type === 'table-title').length).toBe(0);
  });

  it('chemistry keeps exactly 301 no-slot <para><title> — a BENIGN donor artefact', () => {
    // Those titles are extracted and keyed on the EXAMPLE's id. Pinned in both
    // directions: moving this number either way is a behaviour change.
    let noSlot = 0;
    for (const f of chemFiles) {
      const raw = readFileSync(f, 'utf8');
      const { segments } = extractSegments(raw);
      const ids = new Set(segments.map((s) => s.id));
      for (const para of extractElements(raw, 'para')) {
        if (!para.id || !firstDirectChildTitle(para.content)) continue;
        if (![...ids].some((id) => id.endsWith(`:${para.id}-title`))) noSlot++;
      }
    }
    expect(noSlot).toBe(301);
  });
});

describe('§C82 L143/L149 — titles REACH the injected output (values, not counts)', () => {
  // Sentinel: overwrite each title with a token that cannot have come from the
  // source, inject, and look for the token. A count is structurally blind here —
  // when a translation is dropped the ENGLISH title is still present, so the
  // element tally never moves (§C89).
  function sweep(files, type) {
    let emitted = 0;
    let reached = 0;
    let ctlEmitted = 0;
    let ctlReached = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const { segments, structure, equations, inlineAttrs } = extractSegments(src);
      const targets = segments.filter((s) => s.type === type);
      if (!targets.length) continue;
      // In-file positive control: a position that already worked before this
      // change. A harness that broke everything equally cannot read as a pass.
      const control = segments.filter((s) => s.type === 'title').slice(0, 2);
      const map = new Map(segments.map((s) => [s.id, s.text]));
      targets.forEach((s, i) => map.set(s.id, `ZZTITLE${i}ZZ`));
      control.forEach((s, i) => map.set(s.id, `ZZCTL${i}ZZ`));
      const out = buildCnxml(structure, map, equations, src, {}, inlineAttrs).cnxml;
      targets.forEach((s, i) => {
        emitted++;
        if (out.includes(`ZZTITLE${i}ZZ`)) reached++;
      });
      control.forEach((s, i) => {
        ctlEmitted++;
        if (out.includes(`ZZCTL${i}ZZ`)) ctlReached++;
      });
    }
    return { emitted, reached, ctlEmitted, ctlReached };
  }

  it('organic table titles: every one emitted also reaches the output', () => {
    const r = sweep(orgFiles, 'table-title');
    expect(r.emitted).toBe(70);
    expect(r.reached).toBe(70);
    expect(r.ctlReached).toBe(r.ctlEmitted); // the control fired
    expect(r.ctlEmitted).toBeGreaterThan(0); // ...and was not vacuous
  });

  it('chemistry note titles reach 364 of 365 (was 72 of 365 before §C82 L149)', () => {
    // The single residual is m68826 fs-idp45256160, whose title is donated from
    // a nested <para> — there is no direct-child <title> ELEMENT to write into,
    // and inventing one is forbidden by the clean-break rule. Pinned exactly so
    // it stays 1 and is not quietly allowed to grow.
    const r = sweep(chemFiles, 'note-title');
    expect(r.emitted).toBe(365);
    expect(r.reached).toBe(364);
    expect(r.ctlReached).toBe(r.ctlEmitted);
  });
});

describe('§C82 — a translated title is DATA, not a replacement pattern', () => {
  it('a table title containing $& survives injection intact', () => {
    // `String.replace` expands `$&`, `` $` ``, `$'`, `$$` and `$n` in the
    // REPLACEMENT string. The replacement here is translated text, authored by
    // an editor or the MT, so its content is not ours to predict. With a string
    // replacer, `A $& B` rewrote to `<title>A <title>Old</title> B</title>` —
    // corrupt nested markup produced by a value that merely passed through.
    const src = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<table id="t1" summary="s"><title>Original Title</title>
<tgroup cols="1"><tbody><row><entry>cell</entry></row></tbody></tgroup>
</table>
</section>
</content>
</document>`;
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const title = segments.find((s) => s.type === 'table-title');
    expect(title).toBeDefined(); // the fixture actually exercises the path

    const map = new Map(segments.map((s) => [s.id, s.text]));
    map.set(title.id, 'Verð $& kostnaður');
    const out = buildCnxml(structure, map, equations, src, {}, inlineAttrs).cnxml;

    // `&` is XML-escaped downstream, which is correct and not what is under
    // test — so assert the ESCAPED form, and separately assert the corruption
    // signature is absent. Verified to go red against a string replacer.
    expect(out).toContain('<title>Verð $&amp; kostnaður</title>');
    // The corruption signature: the matched span re-inserted inside itself.
    expect(out).not.toContain('Original Title');
  });
});
