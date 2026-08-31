import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractSegments } from '../cnxml-extract.js';
import { buildCnxml } from '../cnxml-inject.js';
import { renderCnxmlToHtml } from '../cnxml-render.js';
import { extractElements, firstDirectChildTitle } from '../lib/cnxml-parser.js';
import { directChildTitle as domDirectChildTitle } from '../lib/cnxml-dom.js';
import { DOMParser } from '@xmldom/xmldom';

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

  it('organic has 102 example, 72 table and 69 figure direct-child title ELEMENTS', () => {
    // ⚠️ ELEMENTS, not segments — the two differ and the gap is load-bearing.
    // Organic source carries 20 literal `<title/>`, and 2 of the 72 tables have
    // an EMPTY direct-child title. An empty title is still a direct-child title
    // element (the raw and DOM primitives must agree that it is, or they are
    // worthless as a pair) but it produces NO segment, because addSegment
    // returns null for empty text. The segment count is pinned separately
    // below at 70; a change that collapses these two numbers into one is a
    // regression in whichever direction it moves. Figures split the same way:
    // 69 elements, 66 of them carrying text. The 5 empty titles (2 table +
    // 3 figure) reconcile exactly with the raw/DOM disagreement this pair of
    // primitives used to have.
    expect(countDirectChildTitles(orgFiles, 'example')).toBe(102);
    expect(countDirectChildTitles(orgFiles, 'table')).toBe(72);
    expect(countDirectChildTitles(orgFiles, 'figure')).toBe(69);
  });

  it('the raw and DOM primitives AGREE on every corpus container', () => {
    // Two primitives documented as answering the same question are worth
    // nothing as a pair unless something cross-checks them. They DISAGREED on
    // 5 real organic containers until 2026-08-31: the raw scanner skipped a
    // self-closing `<title/>` while the DOM returned the element. Chemistry has
    // none, so chemistry was safe by luck rather than by construction.
    for (const [files, label] of [
      [chemFiles, 'chemistry'],
      [orgFiles, 'organic'],
    ]) {
      let raw = 0;
      let dom = 0;
      for (const f of files) {
        const src = readFileSync(f, 'utf8');
        const doc = new DOMParser({ onError: () => {} }).parseFromString(src, 'text/xml');
        for (const tag of ['example', 'table', 'figure', 'note']) {
          for (const el of extractElements(src, tag)) if (firstDirectChildTitle(el.content)) raw++;
          const els = doc.getElementsByTagName(tag);
          for (let i = 0; i < els.length; i++) if (domDirectChildTitle(els[i])) dom++;
        }
      }
      expect(dom).toBeGreaterThan(0); // control: the DOM side actually found things
      expect({ label, raw }).toEqual({ label, raw: dom });
    }
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

describe('§C82 L149 — the exercise leg, pinned as it actually is', () => {
  it('a titled <note> inside an <exercise> emits NO note-title segment at all', () => {
    // Measured, and it corrects a plausible-looking assumption: the inject-side
    // walker was given an <exercise> call on the theory that the enclosing
    // builder preserves such notes. It cannot help — EXTRACTION never emits the
    // segment. processExercise routes the note's paras into `solution` segments
    // and drops the <title> entirely, so there is nothing for inject to write.
    //
    // Corpus exposure is ZERO and measured in both books: chemistry's 292
    // nested titled notes are ALL inside <example>, organic has 3 and none is
    // nested. That zero is why this stayed invisible, and why it is pinned here
    // rather than fixed — a fix would be extraction-side, needs its own
    // verification, and has no instance to verify against.
    const src = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<exercise id="ex1">
<problem id="pr1"><para id="p1">Question text.</para></problem>
<solution id="so1"><para id="p2">Answer text.</para>
<note id="n1"><title>Answer:</title><para id="p3">Note body.</para></note>
</solution>
</exercise>
</section>
</content>
</document>`;
    const { segments } = extractSegments(src);
    // The absence, paired with a control proving the fixture IS being extracted.
    expect(segments.filter((s) => s.type === 'note-title')).toEqual([]);
    expect(segments.some((s) => s.text === 'Note body.')).toBe(true);
  });
});

describe('§C82 — the same $-expansion class in buildTable’s multi-para cell', () => {
  it('a translated table cell containing $& survives injection intact', () => {
    // PRE-EXISTING, not introduced by the title work, and fixed here because it
    // is the same class in the same file (CLAUDE.md: fix the class, not the
    // line). The replacement at that site legitimately uses `$1`/`$2` capture
    // references, which is exactly why the string form looked correct — the
    // groups are now function ARGUMENTS, so they still work while the
    // translated payload becomes inert.
    const src = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<table id="t2" summary="s"><tgroup cols="1"><tbody>
<row><entry><para id="c1">Cell one.</para><para id="c2">Cell two.</para></entry></row>
</tbody></tgroup></table>
</section>
</content>
</document>`;
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const cell = segments.find((s) => s.text === 'Cell one.');
    expect(cell).toBeDefined(); // the fixture reaches the multi-para branch

    const map = new Map(segments.map((s) => [s.id, s.text]));
    map.set(cell.id, 'kostar $& krónur');
    const out = buildCnxml(structure, map, equations, src, {}, inlineAttrs).cnxml;
    expect(out).toContain('kostar $&amp; krónur');
    // The corruption signature: the matched span re-inserted inside itself.
    expect(out).not.toContain('Cell one.');
  });
});

describe('§C82 — an EMPTY direct-child title is an element, not an owned title', () => {
  // Making `firstDirectChildTitle` report a self-closing `<title/>` (so it
  // agrees with its DOM counterpart) made it TRUTHY, and truthiness leaked
  // straight into the render leg. Measured before the guard: organic's two
  // empty-titled tables (m00124, m00126) rendered an empty
  // `<span class="table-title"></span>` AND — because a truthy title forces the
  // caption — two <caption> elements carrying no `Tafla N` label at all, where
  // there had been no caption. A fix creating its own defect.
  const wrap = (
    inner
  ) => `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
${inner}
</section>
</content>
</document>`;
  const pipeline = (inner) => {
    const src = wrap(inner);
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const cn = buildCnxml(
      structure,
      new Map(segments.map((s) => [s.id, s.text])),
      equations,
      src,
      {},
      inlineAttrs
    ).cnxml;
    const r = renderCnxmlToHtml(cn, { moduleId: structure.moduleId });
    return { segments, html: typeof r === 'string' ? r : r.html || '' };
  };

  it('an empty table title emits no span, and no title-only caption', () => {
    const { html } = pipeline(
      `<table id="t3" summary="s"><title/><tgroup cols="1"><tbody><row><entry>cell</entry></row></tbody></tgroup></table>`
    );
    expect(html).toContain('cell'); // control: the table rendered at all
    expect(html).not.toContain('class="table-title"');
    // The label-only caption is correct and pre-existing. What must not happen
    // is a caption that exists ONLY because an empty title forced it.
    for (const cap of html.match(/<caption>[\s\S]*?<\/caption>/g) || []) {
      expect(cap).toContain('table-label');
    }
  });

  it('extract and render AGREE on the example title when the direct one is empty', () => {
    // Agreement between the two is the invariant; which one they pick (here the
    // donated "Strategy", because an empty title owns nothing) is pre-existing.
    //
    // ⚠️ STATED PLAINLY SO NOBODY READS THIS AS COVERAGE IT IS NOT: this
    // assertion does NOT currently discriminate renderExample's `.trim()`
    // ownership guard. Mutation-checked both ways, on a self-closing `<title/>`
    // AND an empty paired `<title></title>`: with the guard removed the output
    // is identical, because renderExample's standalone fallback skips the empty
    // title and recovers the same paragraph heading. The guard is kept because
    // it makes render's predicate match buildExampleDom's — a real consistency
    // win — not because anything here proves it. The TABLE guard beside it does
    // discriminate (mutation: 1 failing test), and that is the one that had a
    // measured defect behind it.
    const { segments, html } = pipeline(
      `<example id="e9"><title/><para id="q1"><title>Strategy</title> Work it out.</para></example>`
    );
    expect(html).toContain('Work it out.'); // control: the example rendered
    const fromExtract = segments.find((s) => s.type === 'example-title');
    const fromRender = html.match(/<h4>([\s\S]*?)<\/h4>/);
    expect(Boolean(fromExtract)).toBe(Boolean(fromRender));
    if (fromExtract) expect(fromRender[1].trim()).toBe(fromExtract.text);
  });
});
