import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';
import { extractSegments as extractForOrder } from '../cnxml-extract.js';

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

  // REGRESSION GUARD (§C81 Task 10) — this test USED TO pin a real defect ("pins a
  // PRE-EXISTING double-extraction defect (see ledger; fires on 0 of 491 real
  // modules)"); FIXED 2026-08-15, kept here so the double-extraction cannot come
  // back unnoticed. Do not delete: it is the only thing that proves the fix
  // actually changed this fixture's behaviour.
  //
  // What was wrong: `processTopLevelContent` stripped lists/figures/tables/
  // examples/exercises/notes before scanning for standalone <media>, but never
  // stripped <para>. A <media> that is a DIRECT child of a top-level <para> (not
  // itself wrapped in one of those stripped containers) was therefore extracted
  // TWICE: once inline via extractInlineText → inlineMediaMap, and again by the
  // standalone-media scan finding the identical element a second time because
  // <para> was never stripped from the string it read.
  //
  // The fix: `processTopLevelContent` now strips <para> before the standalone-
  // media scan too — same idiom as the container strips it already applied to
  // example/exercise/note/figure/table/list (cnxml-extract.js, around the
  // `contentWithoutParas` computation). This exact shape (a bare top-level
  // <media> that is a DIRECT child of a top-level <para>, no figure/list
  // wrapper) measured 0/491 real modules at the time it was found — kept as a
  // synthetic regression guard, since a future module could still trip it.
  it('does not double-extract a bare top-level <media> nested directly in a <para> (fixed defect, regression guard)', () => {
    const { segments } = extractSegments(
      wrap(`<media alt="Standalone first"><image src="s.png"/></media>
            <para id="p1">Text <media alt="Inline second"><image src="i.png"/></media> end.</para>`)
    );
    const alts = segments.filter((s) => s.type === 'alt');
    // Exactly two alt segments now: standalone-1-alt (the genuine standalone
    // media) and media-1-alt (the para-inline media, via the inline path). The
    // second, duplicate standalone extraction of the para-inline media no longer
    // happens.
    expect(alts.map((a) => a.id)).toEqual([
      'm00001:alt:standalone-1-alt',
      'm00001:alt:media-1-alt',
    ]);
    expect(alts.map((a) => a.text)).toEqual(['Standalone first', 'Inline second']);
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

describe('all three alt positions in one module (§C81)', () => {
  // NOTE: the brief's fixture set module-id="m00002" as a bare <document>
  // attribute, but extractModuleId() only ever reads <md:content-id> (same
  // gap already documented at the top of this file for the m00001 fixture)
  // — a bare attribute resolves moduleId to null -> 'unknown'. Added the
  // <metadata> block so the fixture actually exercises the id-anchored
  // assertions below; no assertion value was changed from the brief.
  const cnxml = `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml" module-id="m00002">
<title>T</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml">
<md:content-id>m00002</md:content-id>
<md:title>T</md:title>
</metadata>
<content>
  <figure id="fig-a">
    <media id="mf" alt="Figure alt"><image src="1.png"/></media>
    <caption>Cap</caption>
  </figure>
  <para id="p1">Text <media id="mp" alt="Para alt"><image src="2.png"/></media> more.</para>
  <media id="ms" alt="Standalone alt"><image src="3.png"/></media>
</content>
</document>`;

  // REGRESSION GUARD (§C81 Task 10) — this test USED TO pin a real defect
  // ('emits alt segments in document order (pins the pre-existing double-
  // extraction defect, now with a colliding id)'); FIXED 2026-08-15. Kept as a
  // regression guard for both the ordering AND the id-collision hazard it
  // previously exposed.
  //
  // What was wrong: this fixture's <para id="p1"> is a bare top-level para (a
  // direct child of <content>, not nested inside a figure/list/table/example/
  // exercise/note) holding a DIRECT-child <media id="mp">, no figure/list
  // wrapper — exactly the shape the sibling regression guard above fixes.
  // processTopLevelContent's standalone-media scan used to find this SAME
  // media a second time because <para> was never stripped from the string it
  // read, and because this media has an explicit id (unlike the id-less sibling
  // fixture above), both extractions resolved to the identical `altElementId`
  // result — a literal segment-id collision (`m00002:alt:mp-alt` emitted
  // twice), not just duplicate text. That was a silent-overwrite hazard for any
  // consumer that does `new Map(segments.map(s => [s.id, s.text]))` (e.g. the
  // injector's own getSeg).
  //
  // The fix (same as the sibling guard): processTopLevelContent now strips
  // <para> before the standalone-media scan, so the standalone scan no longer
  // finds media nested inside a para. The three OTHER positions (figure /
  // para-inline / genuinely-standalone) are unaffected — this test still
  // guards their relative ORDER, now with the duplicate gone.
  it('emits alt segments in document order, one per position, no id collision (fixed defect, regression guard)', () => {
    const { segments } = extractForOrder(cnxml);
    const alts = segments.filter((s) => s.type === 'alt');
    expect(alts.map((a) => a.text)).toEqual(['Figure alt', 'Para alt', 'Standalone alt']);
    expect(alts.map((a) => a.id)).toEqual([
      'm00002:alt:mf-alt',
      'm00002:alt:mp-alt',
      'm00002:alt:ms-alt',
    ]);
    // Regression guard for the id-collision hazard specifically: three distinct
    // alt segments, three distinct ids.
    expect(new Set(alts.map((a) => a.id)).size).toBe(3);
  });
});

// 🔴 CRITICAL REGRESSION, review round 2 (2026-08-15). An EARLIER version of
// the duplicate-alt fix suppressed the DATA (altText → '') on whichever copy
// looked "structurally redundant" (nested inside a <figure>/<list>) at
// CAPTURE time. That guess is wrong for real shapes: cnxml-inject.js's
// exercise/note builders FLATTEN a nested list into the enclosing para and
// render THAT copy — exactly the one being suppressed — while the
// separately-built processList segment sits on a path the injector never
// reaches. Suppressing the wrong copy's data turned "duplicate, safe English
// fallback" into "no alt attribute at all" on 14 attributes across 5 real
// physics/biology modules the branch's own 14-module check never covered
// (edlisfraedi-2e m42296/m42714/m42359/m42493, liffraedi-2e m66590) — a
// regression worse than the defect this task exists to fix. Fixed by
// dedupeAltSegments(): let BOTH copies create their segment normally, then
// merge duplicates AFTER both exist and repoint every reference to the
// survivor — so it never has to guess which copy renders.
describe('§C81 Task 10 review round 2 — duplicate alt data is never lost, only merged', () => {
  // 🔴 REPLACES an earlier version of this test that did NOT discriminate:
  // its fixture put the <media> BEFORE the <list> (siblings inside one
  // <para>), so the old suppression's span check never fired and
  // `toHaveLength(1)` passed even against the reverted 07167ac7 code —
  // review round 3 caught this ("confirmed to discriminate by reasoning"
  // was wrong for this one; verified empirically instead, see below).
  //
  // Reproduces m42296's REAL corpus shape instead: a <figure><media alt=…>
  // nested inside a <list><item>, inside <exercise>'s <problem> (physics
  // multiple-choice-with-image options). processTopLevelContent's top-level
  // figure scan runs over the WHOLE document content (see the comment at
  // assertNoDroppedListBlocks: "Figures are hoisted to top-level content
  // regardless of list nesting") and finds this figure too, so processFigure
  // emits an alt segment for it — AND emitExerciseSection→processList's
  // per-item extractInlineText call ALSO captures the same <media> inline
  // (its regex doesn't care that the <media> sits inside a <figure>). Two
  // emissions for one physical media element, exactly like the other shapes
  // in this file — but here the loss wasn't "which segment survives", it was
  // that structure.inlineMedia[]'s `alt` KEY went missing while the alt
  // SEGMENT still existed (processFigure's copy). Verified this fixture
  // fails against 07167ac7 before accepting it:
  //   node -e "…extractSegments(cnxml) at HEAD vs 07167ac7…"
  //   HEAD:     inlineMedia [{id:'med-a',hasAlt:true},{id:'med-b',hasAlt:true}]
  //   07167ac7: inlineMedia [{id:'med-a',hasAlt:false},{id:'med-b',hasAlt:false}]
  // — segments carried the real text at BOTH vintages; only inlineMedia[].alt
  // (what buildMediaElement's readAlt() actually reads for this shape)
  // differed, which is exactly why the prior test — which asserted only on
  // segments — didn't catch it.
  it('a <figure><media> nested inside a <list><item> (m42296 real shape): inlineMedia[].alt is never lost', () => {
    const cnxml = wrap(
      `<exercise id="ex1"><problem id="prob1">
         <para id="q1">Which shows it correctly?</para>
         <list id="opts-1" list-type="enumerated"><item id="it1">
           <figure id="fig-a"><media id="med-a" alt="Option A description"><image src="a.png"/></media></figure>
         </item><item id="it2">
           <figure id="fig-b"><media id="med-b" alt="Option B description"><image src="b.png"/></media></figure>
         </item></list>
       </problem></exercise>`
    );
    const { segments, structure } = extractSegments(cnxml);
    const alts = segments.filter((s) => s.type === 'alt');

    // Both alts present with real, distinct text — no merge fires here
    // (distinct literal ids, distinct text: neither Rule 1 nor Rule 2
    // matches), so this is purely a loss check, not a dedup check.
    expect(alts).toHaveLength(2);
    expect(alts.map((a) => a.text).sort()).toEqual([
      'Option A description',
      'Option B description',
    ]);

    // The actual regression shape: assert on structure.inlineMedia, not just
    // on segments — a segment can survive (processFigure's own copy) while
    // the inlineMedia entry the injector reads for THIS shape has no `alt`
    // key at all.
    for (const id of ['med-a', 'med-b']) {
      const entry = structure.inlineMedia.find((m) => m.id === id);
      expect(entry.alt).toBeDefined();
      expect(entry.alt.segmentId).toBeDefined();
      const resolvedText = segments.find((s) => s.id === entry.alt.segmentId)?.text;
      expect(resolvedText).toBeTruthy();
    }
  });

  // Reproduces m66449's exact shape: a <figure> with TWO <subfigure>-wrapped
  // <media> children, processed by processFigure — whose OWN media-matching
  // regex is non-global and only ever reaches the FIRST <media>. Before this
  // rework, BOTH subfigures' inline captures were suppressed as
  // "figure-owned", but only the first ever had an owner — the second lost
  // its alt entirely, corpus-measured as exactly one real instance across
  // 1,192 modules. Fixed for free by the merge-after design: an entry with no
  // duplicate anywhere in the module is never touched by either merge rule.
  it('a <figure> with two <subfigure> media (only the first reachable by processFigure): BOTH alts survive', () => {
    const cnxml = wrap(
      `<note id="note-1"><para id="p1">
         <figure id="fig-1"><subfigure id="sub-a">
           <media id="med-a" alt="Part a description"><image src="a.png"/></media>
         </subfigure><subfigure id="sub-b">
           <media id="med-b" alt="Part b description"><image src="b.png"/></media>
         </subfigure><caption>Two-part figure</caption></figure>
       </para></note>`
    );
    const { segments } = extractSegments(cnxml);
    const alts = segments.filter((s) => s.type === 'alt');
    const texts = alts.map((a) => a.text).sort();

    // Both descriptions present — neither subfigure's alt was dropped.
    expect(texts).toEqual(['Part a description', 'Part b description']);
    // Exactly two: processFigure's own emission for subfigure 'a' merges with
    // its inline-capture duplicate (both share the literal id `med-a-alt`);
    // subfigure 'b' has no processFigure emission to merge with (the regex
    // never reaches it), so its own inline capture survives untouched.
    expect(alts).toHaveLength(2);
  });
});
