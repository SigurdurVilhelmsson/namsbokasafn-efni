import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';

// ⚠️ The <metadata>/<md:content-id> block is REQUIRED, not decoration.
// extractModuleId() reads ONLY <md:content-id>; a bare `id=`/`module-id=`
// attribute on <document> resolves moduleId to null -> 'unknown', and every
// id-anchored assertion below would silently compare against
// 'unknown:alt:…'. This is the same trap documented at the top of
// tools/__tests__/cnxml-extract-alt.test.js — copy that idiom, do not invent one.
const wrap = (body) => `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml" module-id="m00001">
<title>T</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml">
<md:content-id>m00001</md:content-id>
<md:title>T</md:title>
</metadata>
<content>${body}</content>
</document>`;

const altSegs = (r) => r.segments.filter((s) => s.type === 'alt');

describe('§C88 — bare media alt in <problem>/<solution>', () => {
  it('emits an alt segment for a bare media directly inside <problem>', () => {
    const r = extractSegments(
      wrap(`<exercise id="ex1"><problem id="p1">
             <para id="p1a">Question.</para>
             <media id="m-prob" alt="A titration setup"><image src="a.png"/></media>
           </problem></exercise>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['A titration setup']);
  });

  it('emits an alt segment for a bare media directly inside <solution>', () => {
    const r = extractSegments(
      wrap(`<exercise id="ex1"><solution id="s1">
             <para id="s1a">Answer.</para>
             <media id="m-sol" alt="A graph"><image src="b.png"/></media>
           </solution></exercise>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['A graph']);
  });

  it('anchors the seg-id on the media id', () => {
    const r = extractSegments(
      wrap(`<exercise id="ex1"><problem id="p1">
             <media id="m-prob" alt="A titration setup"/>
           </problem></exercise>`)
    );
    expect(altSegs(r)[0].id).toBe('m00001:alt:m-prob-alt');
  });

  it('pushes a structure entry so the translation has somewhere to land', () => {
    const r = extractSegments(
      wrap(`<exercise id="ex1"><problem id="p1">
             <media id="m-prob" alt="A titration setup"/>
           </problem></exercise>`)
    );
    const ex = r.structure.content.find((e) => e.type === 'exercise');
    const media = ex.problem.content.find((e) => e.type === 'media');
    expect(media).toBeDefined();
    expect(media.id).toBe('m-prob');
    expect(media.alt).toEqual({ segmentId: 'm00001:alt:m-prob-alt', text: 'A titration setup' });
  });

  it('pushes a structure entry on the <solution> side too (not just <problem>)', () => {
    const r = extractSegments(
      wrap(`<exercise id="ex1"><solution id="s1">
             <media id="m-sol" alt="A graph"/>
           </solution></exercise>`)
    );
    const ex = r.structure.content.find((e) => e.type === 'exercise');
    const media = ex.solution.content.find((e) => e.type === 'media');
    expect(media).toBeDefined();
    expect(media.id).toBe('m-sol');
    expect(media.alt).toEqual({ segmentId: 'm00001:alt:m-sol-alt', text: 'A graph' });
  });

  it('preserves document order — media between two paras stays in the middle', () => {
    const r = extractSegments(
      wrap(`<exercise id="ex1"><problem id="p1">
             <para id="pA">First.</para>
             <media id="m-mid" alt="Middle"/>
             <para id="pB">Second.</para>
           </problem></exercise>`)
    );
    const ex = r.structure.content.find((e) => e.type === 'exercise');
    expect(ex.problem.content.map((e) => e.id)).toEqual(['pA', 'm-mid', 'pB']);
  });

  it('emits nothing for a media with no alt (POSITIVE CONTROL for the negative)', () => {
    const r = extractSegments(
      wrap(`<exercise id="ex1"><problem id="p1">
             <media id="m-noalt"><image src="a.png"/></media>
             <media id="m-yesalt" alt="Has one"/>
           </problem></exercise>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['Has one']);
  });

  it('drops a bare media with no id — no segment, no structure entry (Controller Ruling 1 guard)', () => {
    // Without an id, altElementId's positional fallback would mint a segment id
    // that collectMediaAlts (inject-side, id-keyed only) can never resolve — the
    // segment would be extracted, translated, paid for, and silently discarded
    // at inject: the exact §C89 defect class this guard exists to prevent. The
    // `if (!mediaEl.id) continue;` line at cnxml-extract.js:1734 is the only thing
    // preventing that. Assert BOTH emissions it suppresses — the alt segment and
    // the structure entry are separate pushes, and a future bug could drop only
    // one of them.
    const r = extractSegments(
      wrap(`<exercise id="ex1"><problem id="p1">
             <media alt="No id here"/>
           </problem></exercise>`)
    );
    expect(altSegs(r)).toEqual([]);
    const ex = r.structure.content.find((e) => e.type === 'exercise');
    const media = ex.problem.content.find((e) => e.type === 'media');
    expect(media).toBeUndefined();
  });

  it('does not disturb a media nested inside a <para> (already reachable)', () => {
    // §C88 finding (out of scope for this task): extractInlineText's inline-media
    // capture (cnxml-extract.js:246) matches only the PAIRED `<media>...</media>`
    // form; a self-closing `<media .../>` nested in a <para> is not reachable
    // either before or after this task's change — confirmed empirically, and
    // moot in practice: 0 occurrences of self-closing <media/> anywhere in the
    // chemistry corpus (`grep -rlaP '<media\\b[^>]*/>' books/efnafraedi-2e/01-source`).
    // Paired form is what's "already reachable" here, so that's what this
    // boundary test exercises — logged to the active register, not silently
    // fixed, since it would mean touching extractInlineText, outside this
    // task's declared files.
    const r = extractSegments(
      wrap(`<exercise id="ex1"><problem id="p1">
             <para id="pA">Text <media id="m-inline" alt="Inline"><image src="x.png"/></media> more.</para>
           </problem></exercise>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['Inline']);
  });
});

describe('§C88 — bare media alt in <example>', () => {
  it('emits an alt segment for a bare media directly inside <example>', () => {
    const r = extractSegments(
      wrap(`<example id="ex1">
             <para id="p1">Worked example.</para>
             <media id="m-ex" alt="A reaction diagram"><image src="a.png"/></media>
           </example>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['A reaction diagram']);
    expect(altSegs(r)[0].id).toBe('m00001:alt:m-ex-alt');
  });

  it('pushes a structure entry into the example content', () => {
    const r = extractSegments(
      wrap(`<example id="ex1"><media id="m-ex" alt="A reaction diagram"/></example>`)
    );
    const ex = r.structure.content.find((e) => e.type === 'example');
    const media = ex.content.find((e) => e.type === 'media');
    expect(media.alt).toEqual({ segmentId: 'm00001:alt:m-ex-alt', text: 'A reaction diagram' });
  });

  it('drops a bare media with no id — no segment, no structure entry (Controller Ruling 9 guard)', () => {
    // Same guard as the <problem>/<solution> pin above, applied to <example>'s
    // own emit point. Without an id, altElementId's positional fallback would
    // mint a segment id that collectMediaAlts (inject-side, id-keyed only) can
    // never resolve — extracted, translated, paid for, and silently discarded
    // at inject: the exact §C89 defect class this guard exists to prevent.
    // Assert BOTH emissions it suppresses.
    const r = extractSegments(wrap(`<example id="ex1"><media alt="No id here"/></example>`));
    expect(altSegs(r)).toEqual([]);
    const ex = r.structure.content.find((e) => e.type === 'example');
    const media = ex.content.find((e) => e.type === 'media');
    expect(media).toBeUndefined();
  });

  it('does not double-emit a media that is inside a nested <list> (processList owns it)', () => {
    // ⚠️ DEVIATION FROM BRIEF, MEASURED: processList's item handling routes
    // through extractInlineText, whose media capture (cnxml-extract.js:246,
    // `/<media([^>]*)>([\s\S]*?)<\/media>/g`) matches only the PAIRED form —
    // exactly the same limitation the pre-existing "does not disturb a media
    // nested inside a <para> (already reachable)" test above documents for
    // paras. A self-closing `<media id=".." alt=".."/>` as the SOLE content of
    // a list <item> is not reachable by processList at all (confirmed empirically:
    // it produces `items: []`, not a dropped-alt item) — a pre-existing gap
    // outside processExample/processList scope, not something this task's strip
    // idiom creates or fixes. Using the PAIRED form here tests the real hazard
    // this guard exists for (does the new example-level pass over-reach into a
    // list processList already owns), against a fixture processList actually
    // handles.
    const r = extractSegments(
      wrap(`<example id="ex1">
             <list id="l1"><item id="i1"><media id="m-in-list" alt="In a list"><image src="a.png"/></media></item></list>
           </example>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['In a list']);
  });

  it('does not double-emit a media inside a nested <note> (Task 6 owns it)', () => {
    const r = extractSegments(
      wrap(`<example id="ex1">
             <note id="n1"><media id="m-in-note" alt="In a note"/></note>
           </example>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['In a note']);
  });

  it('🔴 STRIP-ORDER GUARD — a para, a SIBLING list and a bare media in one example', () => {
    // The fixture the two tests above cannot catch: `paras` is shallow and
    // `lists` is nested, so a list-before-para strip leaves the para in the
    // residue and double-emits its inline media. Exactly three alts, in order.
    //
    // ⚠️ DEVIATION FROM BRIEF, MEASURED: m-x and m-y use the PAIRED <media>
    // form, not the brief's self-closing one — see the PAIRED-form note on the
    // "does not double-emit … <list>" test above; the identical limitation
    // applies to a para's own inline media (extractInlineText's capture is
    // paired-only, already documented by the pre-existing "already reachable"
    // test). m-z (the bare/direct case this task actually targets) stays
    // self-closing — extractElements handles both forms for that path.
    const r = extractSegments(
      wrap(`<example id="ex1">
             <para id="p1">Text <media id="m-x" alt="A"><image src="x.png"/></media> more.</para>
             <list id="l1"><item id="i1"><media id="m-y" alt="B"><image src="y.png"/></media></item></list>
             <media id="m-z" alt="C"/>
           </example>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['A', 'B', 'C']);
    expect(altSegs(r).map((s) => s.id)).toEqual([
      'm00001:alt:m-x-alt',
      'm00001:alt:m-y-alt',
      'm00001:alt:m-z-alt',
    ]);
  });

  it('🔴 STRIP-ORDER GUARD — a list NESTED INSIDE the para, the worst case', () => {
    // Here the list's fullMatch is a substring of the para's. Strip the list
    // first and the para never matches, survives, and m-x is emitted twice.
    // ⚠️ m-x uses the PAIRED form — see the deviation note above.
    const r = extractSegments(
      wrap(`<example id="ex1">
             <para id="p1">Text <media id="m-x" alt="A"><image src="x.png"/></media>
               <list id="l1"><item id="i1">inner</item></list>
             </para>
             <media id="m-z" alt="C"/>
           </example>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['A', 'C']);
  });
});

describe('§C88 — bare media alt in <note>', () => {
  it('emits an alt segment for a bare media in a TOP-LEVEL note', () => {
    const r = extractSegments(
      wrap(`<note id="n1" class="note"><media id="m-note" alt="A caution icon"/></note>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['A caution icon']);
  });

  it('🔴 emits for a note NESTED IN AN EXAMPLE — the 9-of-10 majority case', () => {
    const r = extractSegments(
      wrap(`<example id="ex1">
             <para id="p1">Body.</para>
             <note id="n1" class="answer"><media id="m-nested" alt="An answer diagram"/></note>
           </example>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['An answer diagram']);
    expect(altSegs(r)[0].id).toBe('m00001:alt:m-nested-alt');
  });

  it('pushes a structure entry into the note content', () => {
    const r = extractSegments(
      wrap(`<note id="n1"><media id="m-note" alt="A caution icon"/></note>`)
    );
    const note = r.structure.content.find((e) => e.type === 'note');
    expect(note.content.find((e) => e.type === 'media').alt.text).toBe('A caution icon');
  });

  it('drops a bare media with no id — no segment, no structure entry (Controller Ruling 9 guard)', () => {
    // Same guard as the <example> and <problem>/<solution> pins, applied to
    // <note>'s own emit point. See the <example> guard test above for the
    // full §C89 rationale.
    const r = extractSegments(wrap(`<note id="n1"><media alt="No id here"/></note>`));
    expect(altSegs(r)).toEqual([]);
    const note = r.structure.content.find((e) => e.type === 'note');
    const media = note.content.find((e) => e.type === 'media');
    expect(media).toBeUndefined();
  });

  it('🔴 STRIP-ORDER GUARD — a para with inline media, a sibling list, and a bare media', () => {
    // processNote has the same shallow-paras / nested-lists asymmetry as
    // processExample. Strip the list before the para and the para survives the
    // strip, double-emitting m-x. Exactly three alts.
    //
    // ⚠️ DEVIATION FROM BRIEF, MEASURED: m-x and m-y use the PAIRED <media>
    // form — see the identical deviation note on processExample's STRIP-ORDER
    // tests. A self-closing media as a para's inline content or as a list
    // item's sole content is not reachable by extractInlineText/processList
    // (pre-existing, out-of-scope gap); with the brief's self-closing form
    // this fixture also trips `assertNoDroppedListBlocks` (m-y is top-level
    // here, not inside an example/exercise subtree the guard excludes).
    const r = extractSegments(
      wrap(`<note id="n1">
             <para id="p1">Text <media id="m-x" alt="A"><image src="x.png"/></media> more.</para>
             <list id="l1"><item id="i1"><media id="m-y" alt="B"><image src="y.png"/></media></item></list>
             <media id="m-z" alt="C"/>
           </note>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['A', 'B', 'C']);
  });
});
