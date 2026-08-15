import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';

// NOTE: the brief's fixture set `module-id="m00001"` as a bare <document>
// attribute, but extractModuleId() only ever reads <md:content-id> (see every
// other fixture in this repo, e.g. cnxml-extract.test.js:366-371) — a bare
// attribute resolves moduleId to null -> 'unknown'. Added the <metadata>
// block so the fixture actually exercises the id-anchored assertions below;
// no assertion value was changed.
const wrap = (body) => `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml" module-id="m00001">
<title>T</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml">
<md:content-id>m00001</md:content-id>
<md:title>T</md:title>
</metadata>
<content>${body}</content>
</document>`;

describe('figure media alt (§C81)', () => {
  const cnxml = wrap(`
    <figure id="fig-01">
      <media id="med-01" alt="A blue flask on a bench">
        <image mime-type="image/png" src="a.png"/>
      </media>
      <caption>Figure one caption</caption>
    </figure>`);

  it('emits an alt segment with the figure-anchored id', () => {
    const { segments } = extractSegments(cnxml);
    const alt = segments.filter((s) => s.type === 'alt');
    expect(alt).toHaveLength(1);
    expect(alt[0].id).toBe('m00001:alt:med-01-alt');
    expect(alt[0].text).toBe('A blue flask on a bench');
  });

  it('places the alt segment immediately after the caption', () => {
    const { segments } = extractSegments(cnxml);
    const ids = segments.map((s) => s.type);
    expect(ids.indexOf('alt')).toBe(ids.indexOf('caption') + 1);
  });

  it('records the segment reference on the structure, not a bare string', () => {
    const { structure } = extractSegments(cnxml);
    const fig = structure.content.find((c) => c.type === 'figure');
    expect(fig.media.alt).toEqual({
      segmentId: 'm00001:alt:med-01-alt',
      text: 'A blue flask on a bench',
    });
  });

  // CONTROL: must not fire when there is no alt to segment
  it('emits no alt segment when the media has no alt attribute', () => {
    const { segments } = extractSegments(
      wrap(
        `<figure id="fig-02"><media id="m2"><image src="b.png"/></media><caption>C</caption></figure>`
      )
    );
    expect(segments.filter((s) => s.type === 'alt')).toHaveLength(0);
  });
});

describe('standalone top-level media alt (§C81)', () => {
  it('emits an alt segment at the media position, with the media-anchored id', () => {
    const { segments, structure } = extractSegments(
      wrap(`<para id="p1">Before.</para>
            <media id="med-09" alt="A standalone diagram"><image src="c.png"/></media>
            <para id="p2">After.</para>`)
    );
    const alt = segments.filter((s) => s.type === 'alt');
    expect(alt).toHaveLength(1);
    expect(alt[0].id).toBe('m00001:alt:med-09-alt');

    const media = structure.content.find((c) => c.type === 'media');
    expect(media.alt).toEqual({ segmentId: 'm00001:alt:med-09-alt', text: 'A standalone diagram' });
  });

  it('uses a standalone-namespaced positional id when it has no id', () => {
    const { segments } = extractSegments(
      wrap(`<media alt="An unidentified diagram"><image src="d.png"/></media>`)
    );
    const alt = segments.filter((s) => s.type === 'alt');
    expect(alt).toHaveLength(1);
    expect(alt[0].id).toMatch(/^m00001:alt:standalone-\d+-alt$/);
  });

  // CONTROL: the two counters must not collide, and inline placeholders must not move.
  //
  // §C81 DEVIATION FROM BRIEF: the brief's printed version of this test also asserted
  // `ids).toContain('m00001:alt:media-1-alt')`, i.e. that the para-nested <media> ALSO
  // gets an alt segment via the inline path. That cannot happen yet regardless —
  // `media-N-alt` is only emitted by drainInlineMediaAlts(), which is Task 4 (para-inline
  // media), not this task.
  //
  // This assertion set is deliberately DEFECT-AGNOSTIC: it does not hardcode how many alt
  // segments this fixture produces or what their ids are, only (a) that the standalone
  // branch's own counter never disturbs extractInlineText's [[MEDIA:N]] numbering, and
  // (b) that no two alt seg-ids collide. Both properties hold whether or not the
  // pre-existing double-extraction defect below is firing on this fixture — so this test
  // keeps discriminating (it still fails if a future change reads/increments
  // counters.media from the standalone branch, which would bump the placeholder to
  // [[MEDIA:2]]) and keeps passing unmodified if that defect is ever fixed. See the
  // separately named regression test below for the defect itself.
  it('does not disturb [[MEDIA:N]] numbering for inline media, and keeps alt seg-ids unique', () => {
    const { segments } = extractSegments(
      wrap(`<media alt="Standalone first"><image src="s.png"/></media>
            <para id="p1">Text <media alt="Inline second"><image src="i.png"/></media> end.</para>`)
    );
    const para = segments.find((s) => s.type === 'para');
    // The inline media is the FIRST inline one, so it must still be [[MEDIA:1]] —
    // this fails if the standalone-media branch above it ever reads/increments
    // extractInlineText's counters.media.
    expect(para.text).toContain('[[MEDIA:1]]');
    const alts = segments.filter((s) => s.type === 'alt');
    expect(alts.length).toBeGreaterThan(0);
    expect(new Set(alts.map((a) => a.id)).size).toBe(alts.length);
  });

  // REGRESSION — pins a PRE-EXISTING double-extraction defect (see ledger; fires on 0 of
  // 491 real modules). NOT a spec of desired behaviour — this test exists to make a known
  // bug's current output visible, not to endorse it.
  //
  // 🔴 PRE-EXISTING DEFECT, predates Task 3 (reproduced on 5cdfca70, before any of this
  // task's changes) — `processTopLevelContent` strips lists/figures/tables/examples/
  // exercises/notes before scanning for standalone <media>
  // (cnxml-extract.js:793-819), but never strips <para>. A <media> that is a
  // DIRECT child of a top-level <para> (not itself wrapped in one of those
  // stripped containers) is therefore extracted TWICE: once inline via
  // extractInlineText → inlineMediaMap, and again here as "standalone". The
  // design spec defines standalone as "in no figure and no paragraph"
  // (specs/2026-08-15-figure-alt-into-pipeline-design.md:22) and treats the two
  // buckets as disjoint (214 in-para vs 340 standalone, :47) — the code does not
  // implement its own spec. With this task's change, that second extraction now
  // also emits a real, duplicate, translatable alt segment (`standalone-2-alt`,
  // same text as the inline one).
  //
  // MEASURED SCOPE, not hypothesized: a corpus sweep with the real extractor
  // over every .cnxml under both in-scope books' 01-source (491 modules: 149
  // efnafraedi-2e + 342 lifraen-efnafraedi) found ZERO modules producing two alt
  // segments with identical text. Root cause, checked directly against source:
  // every real in-para <media> found by an @xmldom/xmldom ancestor-based census
  // (which reproduces the spec's 214/308 chemistry split exactly) sits inside a
  // <para> that is itself inside a stripped container — see
  // books/efnafraedi-2e/01-source/ch06/m68732.cnxml:146, a <media> inside a
  // <para> inside <problem><exercise>, so processExercise's own paragraph
  // handling reaches it first and processTopLevelContent's top-level scan never
  // sees it. So the defect is real and reachable (this fixture proves it) but,
  // as measured, NOT currently firing on either in-scope book — it does not
  // block this task or Task 4. It should still be fixed (strip <para> before
  // the standalone-media scan) before §C80's corpus re-extract, in case a
  // future module puts a bare top-level <para><media>.
  //
  // ⚠️ THIS TEST IS EXPECTED TO FAIL once the <para>-stripping fix lands — at that
  // point the second (buggy) extraction disappears and this fixture should produce
  // only `standalone-1-alt`. UPDATE this test to assert the corrected output then;
  // do not delete it outright without replacing its coverage, since it is the only
  // thing that currently proves the fix actually changed this fixture's behaviour.
  it('pins a PRE-EXISTING double-extraction defect (see ledger; fires on 0 of 491 real modules)', () => {
    const { segments } = extractSegments(
      wrap(`<media alt="Standalone first"><image src="s.png"/></media>
            <para id="p1">Text <media alt="Inline second"><image src="i.png"/></media> end.</para>`)
    );
    const alts = segments.filter((s) => s.type === 'alt');
    // Pinning the defect's actual shape: standalone-1-alt (the genuine standalone
    // media), then media-1-alt (§C81 Task 4: the SAME <media> also gets segmented
    // via the inline path, since it sits inside a <para>'s inline text), then
    // standalone-2-alt (the pre-existing double-extraction: processTopLevelContent's
    // media scan finds the same element again because <para> is never stripped).
    // The last one is the tracked defect; the first two are correct, independent
    // extractions of two different <media> elements.
    expect(alts.map((a) => a.id)).toEqual([
      'm00001:alt:standalone-1-alt',
      'm00001:alt:media-1-alt',
      'm00001:alt:standalone-2-alt',
    ]);
    expect(alts.map((a) => a.text)).toEqual(['Standalone first', 'Inline second', 'Inline second']);
  });
});

describe('para-inline media alt (§C81)', () => {
  const cnxml = wrap(
    `<para id="p1">Text with <media id="med-inline" alt="An inline chart"><image src="e.png"/></media> inside.</para>`
  );

  it('emits the alt segment immediately after the paragraph segment', () => {
    const { segments } = extractSegments(cnxml);
    const types = segments.map((s) => s.type);
    expect(types.indexOf('alt')).toBe(types.indexOf('para') + 1);
  });

  it('records the segment reference on structure.inlineMedia', () => {
    const { structure } = extractSegments(cnxml);
    expect(structure.inlineMedia).toHaveLength(1);
    expect(structure.inlineMedia[0].alt).toEqual({
      segmentId: 'm00001:alt:med-inline-alt',
      text: 'An inline chart',
    });
  });

  // CONTROL: extractInlineText stays pure — calling it directly must not emit segments
  it('does not emit segments from extractInlineText itself', () => {
    const { segments } = extractSegments(wrap(`<para id="p9">No media here.</para>`));
    expect(segments.filter((s) => s.type === 'alt')).toHaveLength(0);
  });

  // CONTROL: no working fields (altText, mediaIndex) leak into the committed structure
  it('strips altText and mediaIndex working fields from structure.inlineMedia', () => {
    const { structure } = extractSegments(cnxml);
    expect(structure.inlineMedia[0]).not.toHaveProperty('altText');
    expect(structure.inlineMedia[0]).not.toHaveProperty('mediaIndex');
  });

  // 🔴 RECURSION HAZARD (carried forward from Task 7): resolving an inline-media alt
  // whose segmentId is present in `segments` must not recurse through getSeg. This
  // drives the object-shaped alt through the injector end-to-end, the exact shape
  // that reproduced RangeError: Maximum call stack size exceeded before Task 7's fix.
  it('does not recurse when the inline-media alt segment id is present in segments (Task 7 hazard)', async () => {
    const { buildCnxml } = await import('../cnxml-inject.js');
    const { segments, structure, equations } = extractSegments(cnxml);
    const segMap = new Map(segments.map((s) => [s.id, s.text]));
    expect(segMap.has('m00001:alt:med-inline-alt')).toBe(true);
    // Positive control: overwrite the alt segment's text with a distinct translated value so
    // the assertion below can only pass if getSeg's resolution actually ran (not just the
    // English `alt.text` fallback) — same recursion exercise, now discriminating.
    segMap.set('m00001:alt:med-inline-alt', 'Íslensk lýsing');
    expect(() => buildCnxml(structure, segMap, equations, cnxml)).not.toThrow();
    const result = buildCnxml(structure, segMap, equations, cnxml);
    expect(result.cnxml).toContain('Íslensk lýsing');
    expect(result.cnxml).not.toContain('An inline chart');
  });

  // No alt attribute at all — must not emit an alt segment.
  it('emits no alt segment when the inline media has no alt attribute', () => {
    const { segments, structure } = extractSegments(
      wrap(`<para id="p1">Text <media id="med-noalt"><image src="e.png"/></media> inside.</para>`)
    );
    expect(segments.filter((s) => s.type === 'alt')).toHaveLength(0);
    expect(structure.inlineMedia[0].alt).toBeUndefined();
  });
});

// 🔴 REVIEW FIX (Critical): drainInlineMediaAlts originally walked the WHOLE shared
// inlineMediaMap, so an entry left undrained by an unwired call site (list items,
// exercise problem/solution paras) sat there until whatever LATER literal-'para' site
// fired anywhere else in the module — attaching that item's/exercise-para's alt to an
// unrelated paragraph. Fixed by scoping the drain to a side channel
// (lastInlineMediaPlaceholders) that only ever holds the MOST RECENT extractInlineText()
// call's own placeholders, and wiring the drain at every addSegment site whose preceding
// extractInlineText() call threads inlineMediaMap — not just the three literal 'para'
// sites. This block pins the misattribution reproduction and the (now-closed) exercise
// gap.
describe('§C81 review fix — drain scoped to the owning segment only', () => {
  // Exact reproduction of the finding: a <list><item> with inline media, followed by an
  // unrelated top-level <para> with no media of its own. Before the fix, segment order
  // came out `title, item, para, alt` — the alt landed after the unrelated para. After
  // the fix, it must land immediately after its own item.
  it('a <list><item> alt lands immediately after its own item, not after a later unrelated <para>', () => {
    const cnxml = wrap(
      `<list id="L1"><item id="it1">Step <media id="med-item" alt="A list item diagram"><image src="li.png"/></media> shown.</item></list>
       <para id="p1">Unrelated paragraph with no media of its own.</para>`
    );
    const { segments } = extractSegments(cnxml);
    const types = segments.map((s) => s.type);

    // Precise pin: the whole segment-type sequence, not just an adjacency check.
    expect(types).toEqual(['title', 'item', 'alt', 'para']);

    // The two properties that matter, stated explicitly (belt + suspenders on the
    // array-equality pin above): correctly attached to its own item...
    expect(types.indexOf('alt')).toBe(types.indexOf('item') + 1);
    // ...and NOT the old bug's signature (attached after the later, unrelated para).
    expect(types.indexOf('alt')).not.toBe(types.indexOf('para') + 1);

    const alt = segments.find((s) => s.type === 'alt');
    expect(alt.id).toBe('m00001:alt:med-item-alt');
    expect(alt.text).toBe('A list item diagram');
  });

  // A second <list><item> further down the SAME module, to prove the fix isn't just
  // "the first one happens to work" — each item's alt must land after its OWN item,
  // not the other item's, even though both entries pass through the one shared
  // inlineMediaMap.
  it('two separate <item>s each get their own alt, in their own position, with two unrelated paras between', () => {
    const cnxml = wrap(
      `<list id="L1"><item id="it1">First <media id="med-a" alt="Diagram A"><image src="a.png"/></media>.</item></list>
       <para id="p1">Unrelated.</para>
       <list id="L2"><item id="it2">Second <media id="med-b" alt="Diagram B"><image src="b.png"/></media>.</item></list>
       <para id="p2">Also unrelated.</para>`
    );
    const { segments } = extractSegments(cnxml);
    const types = segments.map((s) => s.type);
    expect(types).toEqual(['title', 'item', 'alt', 'para', 'item', 'alt', 'para']);

    const alts = segments.filter((s) => s.type === 'alt');
    expect(alts.map((a) => a.id)).toEqual(['m00001:alt:med-a-alt', 'm00001:alt:med-b-alt']);
    expect(alts.map((a) => a.text)).toEqual(['Diagram A', 'Diagram B']);
  });

  // The exercise gap this fix closes: emitExerciseSection's addSegment(segType, ...)
  // calls use the variable 'problem'/'solution', never the literal 'para', so a bare
  // literal-'para' grep would never have found them — but the scoped drain wires by
  // "any addSegment whose preceding extractInlineText threaded inlineMediaMap", which
  // covers them too. Before this fix, a corpus sweep found 258/258 (100%) of real
  // exercise-context <media alt> elements silently dropped (never segmented at all).
  it('emits alt segments for inline media inside <problem> AND <solution>, each after its own segment', () => {
    const cnxml = wrap(
      `<exercise id="ex1">
         <problem id="prob1"><para id="q1">Question with <media id="med-q" alt="Question diagram"><image src="q.png"/></media> shown.</para></problem>
         <solution id="sol1"><para id="a1">Answer with <media id="med-a" alt="Answer diagram"><image src="a.png"/></media> shown.</para></solution>
       </exercise>`
    );
    const { segments } = extractSegments(cnxml);
    const types = segments.map((s) => s.type);
    expect(types).toEqual(['title', 'problem', 'alt', 'solution', 'alt']);

    const alts = segments.filter((s) => s.type === 'alt');
    expect(alts.map((a) => a.id)).toEqual(['m00001:alt:med-q-alt', 'm00001:alt:med-a-alt']);
    expect(alts.map((a) => a.text)).toEqual(['Question diagram', 'Answer diagram']);
  });

  // The nested-list-split branch of emitExerciseSection (a <para> immediately followed,
  // inside the SAME <problem>, by a sibling <list> split out of it) is the other of the
  // two segType call sites; drainInlineMediaAlts must fire BEFORE the toList(nl)
  // recursion runs (that recursion calls extractInlineText again for each list item and
  // would otherwise reset the scoped side channel before the para's own media drained).
  it('drains a problem para’s own alt before recursing into its sibling nested <list>', () => {
    const cnxml = wrap(
      `<exercise id="ex2">
         <problem id="prob2"><para id="q2">Pick one, see <media id="med-p2" alt="Setup diagram"><image src="p2.png"/></media>:
           <list id="opts-1" list-type="enumerated"><item>alpha</item><item>beta</item></list>
         </para></problem>
       </exercise>`
    );
    const { segments } = extractSegments(cnxml);
    const types = segments.map((s) => s.type);
    expect(types).toEqual(['title', 'problem', 'alt', 'item', 'item']);
    const alt = segments.find((s) => s.type === 'alt');
    expect(alt.id).toBe('m00001:alt:med-p2-alt');
  });

  // Confirms the three literal-'para' sites (Task 4's original scope) still behave
  // correctly under the new scoped mechanism — a regression guard for the fix itself,
  // not a re-test of Task 4 (that coverage lives in the describe blocks above). Split
  // into three `it`s so each site's result is independently visible.
  it("processTopLevelContent's top-level <para> still emits alt immediately after it", () => {
    // NOT asserted as an exact type array here: a bare top-level <para><media> also
    // triggers the SEPARATE, pre-existing, out-of-scope double-extraction defect
    // documented above ('pins a PRE-EXISTING double-extraction defect') —
    // processTopLevelContent's standalone-<media> scan never strips <para>, so this
    // exact media additionally gets found and segmented a second time as "standalone".
    // That defect is real but irrelevant to THIS fix (it existed before Task 4 and
    // before this review fix, and is unrelated to drain scoping) — measured at 0/491
    // real modules. Assert only what this fix is responsible for: adjacency of the
    // (first) alt segment to its own para.
    const { segments } = extractSegments(
      wrap(`<para id="p1">Text <media id="m1" alt="Top-level"><image src="a.png"/></media>.</para>`)
    );
    const types = segments.map((s) => s.type);
    expect(types.indexOf('alt')).toBe(types.indexOf('para') + 1);
    expect(segments.filter((s) => s.type === 'alt')[0].text).toBe('Top-level');
  });

  it("processExample's <para> still emits alt immediately after it", () => {
    // <example> IS stripped before the standalone-media scan, so this fixture does
    // not hit the double-extraction defect above — a precise array pin is safe here.
    const types = extractSegments(
      wrap(
        `<example id="ex-1"><para id="ep1">Text <media id="m2" alt="Example"><image src="b.png"/></media>.</para></example>`
      )
    ).segments.map((s) => s.type);
    expect(types).toEqual(['title', 'para', 'alt']);
  });

  it("processNote's <para> still emits alt immediately after it", () => {
    // <note> IS stripped before the standalone-media scan — same reasoning as above.
    const types = extractSegments(
      wrap(
        `<note id="note-1"><para id="np1">Text <media id="m3" alt="Note"><image src="c.png"/></media>.</para></note>`
      )
    ).segments.map((s) => s.type);
    expect(types).toEqual(['title', 'para', 'alt']);
  });
});
