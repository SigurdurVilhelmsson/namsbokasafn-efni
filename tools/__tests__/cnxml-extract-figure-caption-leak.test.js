import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';
import { renderCompiledExercises, _loadBookConfigForTest } from '../cnxml-render.js';

/**
 * §C149 ② — the EXTRACT half. A `<figure>` nested inside a `<para>` had its
 * caption prose FLATTENED into the paragraph's own segment.
 *
 * `extractInlineText` swapped `<media>…</media>` for `[[MEDIA:N]]` and then let
 * `stripTags()` remove every remaining tag while KEEPING its text — so the
 * `<figure>` wrapper vanished and the `<caption>`'s words stayed behind:
 *
 *     Although steel is denser than water … possible.[[BR]] [[MEDIA:1]] (credit: Cory Zanker)
 *
 * `processFigure` had ALREADY emitted that same text as the figure's own
 * `caption:` segment, so the credit existed twice. Once translated, readers of
 * chemistry `10-exercises.html` got it twice IN TWO LANGUAGES. ① fixed the raw
 * markup and the `<figcaption>`; the duplicate is this half.
 *
 * 🔴 WHY NO COUNT COULD SEE IT, AND WHAT DOES. Both copies are legitimately
 * present, so every tally is right: 1 caption element in, 1 out; the segment
 * count does not move. What separates the halves is a CONTROLLED PAIR on the
 * page readers actually receive — render `01-source` directly, then render an
 * extract→inject round-trip of the same module, and count the credit on each.
 * Measured before this fix: **1 and 2**. The renderer is innocent; the second
 * copy is minted at extraction. That pair is the last test in this file.
 *
 * 🔴 THE SECTION PATH WAS ALREADY CORRECT, AND IT IS WHAT NAMED THE BUG.
 * `processTopLevelContent` strips every `<figure>` out of `contentForSimpleElements`
 * before extracting a top-level `<para>`, so a section para never saw the figure
 * at all. The leak fires only where NO such strip runs — `<exercise>`, `<note>`,
 * `<example>`. Measured by RUNNING the extractor over all six books (a DOM census
 * of "figure nested in para" over-counts by 2.5×, because it cannot see the strip):
 * chemistry **1**, physics (withheld) **23**, biology (withheld) **62**, organic
 * **0**, microbiology **0**, astronomy **0**.
 *
 * 🔴 DROPPING TEXT IS CONTENT LOSS UNLESS SOMETHING ELSE OWNS IT — so the fix
 * removes EXACTLY what `processFigure` takes and not one character more: the
 * figure's FIRST `<caption>`, matched the way `processFigure` matches it. A
 * `<title>` is deliberately LEFT IN PLACE: **75 figures corpus-wide carry a
 * direct-child `<title>` and `processFigure` extracts none of them**, so
 * stripping titles would turn this duplicate into a silent loss. A duplicate is
 * recoverable; a loss is not. Both halves are asserted below.
 *
 * ⚠️ EXPOSURE IS NOT THE LEAK COUNT. `cnxml-inject.js`'s C13 pre-scan
 * (`paraContainsOnlyFigures`) already injects nothing for a figure-ONLY para, so
 * a leak in one of those was inert. Only a para holding prose AS WELL reaches a
 * reader — chemistry 1 (m68764), physics 4, everything else 0.
 *
 * ⚠️ THE FIX ALSO ENDS A DOUBLE MATH COUNT, which is a numbering change, not a
 * cosmetic one. `counters` is ONE object shared by the para pass and
 * `processFigure`, so math inside a nested caption consumed two `[[MATH:N]]`
 * slots. Measured: **25 such paras, all in withheld physics, 0 in either kept
 * book** — so no kept-book placeholder moves. Asserted for m68764 below.
 */

_loadBookConfigForTest('efnafraedi-2e');

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/**
 * Wrap module content in the minimum a CNXML document needs to extract.
 * The para lives inside an `<exercise><problem>` because that is the live shape:
 * a top-level section para has its figure stripped before extraction and never
 * leaked (see the header), so a section fixture would test the wrong path.
 */
const doc = (
  body
) => `<document xmlns="http://cnx.org/ns/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML" id="mFIX" module-id="mFIX">
<title>Leak fixture</title>
<metadata xmlns:md="http://cnx.org/ns/mdml">
<md:content-id>mFIX</md:content-id>
<md:title>Leak fixture</md:title>
</metadata>
<content>
<section id="sec-1">
<title>A section</title>
<exercise id="ex-1">
<problem id="prob-1">
${body}
</problem>
</exercise>
</section>
</content>
</document>`;

const CAPTIONED = doc(`<para id="para-1">Prose that belongs to the paragraph.<newline/>
<figure id="fig-1">
<media id="media-1" alt="An alt description of the picture.">
<image mime-type="image/jpeg" src="../../media/fixture.jpg"/>
</media>
<caption>(credit: Fixture Photographer)</caption>
</figure>
</para>`);

const TITLED = doc(`<para id="para-1">Prose that belongs to the paragraph.<newline/>
<figure id="fig-1">
<title>A figure title nothing else extracts</title>
<media id="media-1" alt="An alt description of the picture.">
<image mime-type="image/jpeg" src="../../media/fixture.jpg"/>
</media>
<caption>(credit: Fixture Photographer)</caption>
</figure>
</para>`);

const BARE_FIGURE = doc(`<para id="para-1">Prose that belongs to the paragraph.<newline/>
<figure id="fig-1">
<media id="media-1" alt="An alt description of the picture.">
<image mime-type="image/jpeg" src="../../media/fixture.jpg"/>
</media>
</figure>
</para>`);

const BARE_MEDIA = doc(`<para id="para-1">Prose that belongs to the paragraph.<newline/>
<media id="media-1" alt="An alt description of the picture.">
<image mime-type="image/jpeg" src="../../media/fixture.jpg"/>
</media>
</para>`);

const segs = (cnxml) => extractSegments(cnxml).segments;
const byType = (cnxml, type) => segs(cnxml).filter((s) => s.type === type);
const readSource = (rel) => readFileSync(join(REPO_ROOT, 'books', rel), 'utf8');

describe('§C149 ② — a para-nested <figure> must not flatten its caption into the para', () => {
  it("drops the caption prose from the paragraph's own segment", () => {
    const [problem] = byType(CAPTIONED, 'problem');
    expect(problem, 'the fixture must still produce a problem segment').toBeTruthy();
    expect(problem.text).not.toContain('Fixture Photographer');
  });

  it("still emits that caption as the figure's own segment (coverage control)", () => {
    // Paired with the assertion above: together they prove the text MOVED rather
    // than VANISHED. Neither assertion is worth anything alone.
    const [caption] = byType(CAPTIONED, 'caption');
    expect(caption, 'the figure must still own a caption segment').toBeTruthy();
    expect(caption.text).toContain('(credit: Fixture Photographer)');
  });

  it('keeps the [[MEDIA:N]] placeholder the injector anchors on', () => {
    const [problem] = byType(CAPTIONED, 'problem');
    expect(problem.text).toContain('[[MEDIA:1]]');
  });

  it("keeps the paragraph's own prose and its <newline/>", () => {
    const [problem] = byType(CAPTIONED, 'problem');
    expect(problem.text).toContain('Prose that belongs to the paragraph.');
    expect(problem.text).toContain('[[BR]]');
  });

  it("still emits the nested media's alt segment", () => {
    const alts = byType(CAPTIONED, 'alt');
    expect(alts.some((a) => a.text.includes('An alt description of the picture.'))).toBe(true);
  });
});

describe('§C149 ② — the cut removes EXACTLY what processFigure owns', () => {
  it('leaves a figure <title> alone — 75 exist corpus-wide and NOTHING extracts them', () => {
    // Over-reach guard. processFigure reads only <caption>, so removing a <title>
    // here would delete the only copy of that text. Leaking it is the lesser
    // failure and stays until a title owner exists. If this test ever goes red
    // because titles ARE extracted now, delete the leak instead of this assertion.
    const [problem] = byType(TITLED, 'problem');
    expect(problem.text).toContain('A figure title nothing else extracts');
    // …and the caption is still removed in the same para, so this is not the fix
    // simply failing to fire.
    expect(problem.text).not.toContain('Fixture Photographer');
  });

  it('touches nothing when the nested figure has no caption', () => {
    // Negative control: a BARE figure must extract exactly as a bare <media> in the
    // same paragraph does. This is organic's shape — all 10 of its para-nested
    // figures are bare — so it is the invariant that keeps the fix from over-reaching.
    const [fromFigure] = byType(BARE_FIGURE, 'problem');
    const [fromMedia] = byType(BARE_MEDIA, 'problem');
    expect(fromFigure.text).toBe(fromMedia.text);
  });
});

describe('§C149 ② — the real corpus', () => {
  const M68764 = 'efnafraedi-2e/01-source/ch10/m68764.cnxml';

  it('chemistry m68764: the credit is gone from the problem segment', () => {
    const segments = segs(readSource(M68764));
    const problem = segments.find((s) => s.id === 'm68764:problem:fs-idm164104512');
    expect(problem, 'the exercise-23 problem segment must still exist').toBeTruthy();
    expect(problem.text).not.toContain('Cory Zanker');
    // Positive control: this is the right segment and it still carries its question.
    expect(problem.text).toContain('a steel needle or paper clip');
    expect(problem.text).toContain('[[MEDIA:1]]');
  });

  it('chemistry m68764: the caption segment still carries the credit', () => {
    const segments = segs(readSource(M68764));
    const caption = segments.find(
      (s) => s.id === 'm68764:caption:CNX_Chem_10_02_Needlefloa-caption'
    );
    expect(caption, 'the figure must still own its caption segment').toBeTruthy();
    expect(caption.text).toContain('(credit: Cory Zanker)');
  });

  it('chemistry m68764: [[MATH:N]] numbering stays gap-free', () => {
    // `counters` is shared with processFigure, so removing the para's copy of a
    // caption also removes a math slot when that caption holds math. Chemistry's
    // one leaking caption holds none, so this module's numbering must not move —
    // a renumber would show as a hole in the sequence.
    const numbers = new Set(
      segs(readSource(M68764))
        .flatMap((s) => s.text.match(/\[\[MATH:\d+\]\]/g) || [])
        .map((m) => Number(m.match(/\d+/)[0]))
    );
    expect(
      numbers.size,
      'the module must contain math at all, or this proves nothing'
    ).toBeGreaterThan(0);
    for (let n = 1; n <= numbers.size; n++) {
      expect(numbers.has(n), `[[MATH:${n}]] must exist — numbering is gap-free`).toBe(true);
    }
  });

  it.each([
    'ch02/m00028.cnxml',
    'ch03/m00033.cnxml',
    'ch03/m00035.cnxml',
    'ch03/m00038.cnxml',
    'ch04/m00045.cnxml',
    'ch05/m00051.cnxml',
    'ch05/m00054.cnxml',
    'ch07/m00070.cnxml',
  ])('organic %s: its para-nested figures are bare, so nothing can leak', (rel) => {
    // These 8 modules carry organic's 10 para-nested figures. The measured claim is
    // that every one is BARE — so the fix is inert across the whole of the second
    // kept book, and the byte-identity of its extraction is not at risk.
    // (The before/after byte diff itself is a corpus harness, not a unit test: it
    // needs both sides of the change and lives in test-results/.)
    const source = readSource(join('lifraen-efnafraedi/01-source', rel));
    // Positive control: these modules really do contain the figures in question…
    expect(source).toContain('<figure');
    // …and the extraction really produced segments.
    const segments = segs(source);
    expect(segments.length).toBeGreaterThan(0);
    // The property: no caption text reaches a non-caption segment.
    const captions = segments.filter((s) => s.type === 'caption').map((s) => s.text);
    for (const capText of captions) {
      const probe = capText.slice(0, 60);
      const leaked = segments.filter((s) => s.type !== 'caption' && s.text.includes(probe));
      expect(
        leaked.map((s) => s.id),
        `caption text leaked: "${probe}"`
      ).toEqual([]);
    }
  });
});

describe('§C149 ② — the page readers receive', () => {
  it('the chapter exercises ROLLUP carries the credit exactly ONCE', () => {
    // The controlled pair that separated ② from ①. Arm 1 renders 01-source directly
    // and has always read 1; arm 2 goes through extract → inject and read 2. This is
    // the third column of `emitted → injected → RENDERED`, and the only one a reader
    // is served: renderCnxmlToHtml never builds an exercises rollup.
    const src = readSource('efnafraedi-2e/01-source/ch10/m68764.cnxml');
    const SECTION = /<section\s+[^>]*class="exercises"[^>]*>[\s\S]*?<\/section>/;
    const nums = new Map([['m68764:fs-idm82765632', 23]]);
    const rollup = (cnxml) => {
      const section = SECTION.exec(cnxml);
      expect(section, 'the exercises section must be present').toBeTruthy();
      return renderCompiledExercises(
        10,
        {
          exercises: [
            {
              moduleId: 'm68764',
              sectionNumber: '10.2',
              sectionTitle: 'Properties of Liquids',
              exercisesContent: section[0],
              exerciseClass: 'exercises',
            },
          ],
        },
        nums,
        { lang: 'is', chapter: 10, moduleId: '10-exercises', moduleSections: {}, equations: {} }
      );
    };

    const arm1 = rollup(src);
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const parsed = parseSegments(formatSegmentsMarkdown(segments));
    const arm2 = rollup(buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml);

    const credits = (html) => (html.match(/Cory Zanker/g) || []).length;
    // Arm 1 is the reference AND the positive control: it proves the harness renders
    // the credit at all, so a `1` from arm 2 cannot be a page that rendered nothing.
    expect(credits(arm1)).toBe(1);
    expect(credits(arm2)).toBe(1);
    // And the round-trip page is still a real page.
    expect(arm2).toContain('a steel needle or paper clip');
    expect(arm2).toContain('<figcaption>');
  });
});
