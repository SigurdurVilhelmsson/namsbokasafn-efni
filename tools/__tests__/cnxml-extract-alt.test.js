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

  // CONTROL: the two counters must not collide, and inline placeholders must not move
  //
  // §C81 DEVIATION FROM BRIEF, DOCUMENTED FINDING: the brief's printed version of
  // this test asserted `ids).toContain('m00001:alt:media-1-alt')` too, i.e. that
  // the para-nested <media> ALSO gets an alt segment via the inline path. That
  // cannot happen yet regardless — `media-N-alt` is only emitted by
  // drainInlineMediaAlts(), which is Task 4 (para-inline media), not this task.
  //
  // But running this exact fixture surfaced something bigger: 🔴 PRE-EXISTING
  // DEFECT, predates Task 3 (reproduced on 5cdfca70, before any of this task's
  // changes) — `processTopLevelContent` strips lists/figures/tables/examples/
  // exercises/notes before scanning for standalone <media>
  // (cnxml-extract.js:793-819), but never strips <para>. A <media> that is a
  // DIRECT child of a top-level <para> (not itself wrapped in one of those
  // stripped containers) is therefore extracted TWICE: once inline via
  // extractInlineText → inlineMediaMap, and again here as "standalone". The
  // design spec defines standalone as "in no figure and no paragraph"
  // (specs/2026-08-15-figure-alt-into-pipeline-design.md:22) and treats the two
  // buckets as disjoint (214 in-para vs 340 standalone, :47) — the code does not
  // implement its own spec. Confirmed below: with this task's change, that
  // second extraction now also emits a real, duplicate, translatable alt
  // segment (`standalone-2-alt`, same text as the inline one).
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
  it('does not disturb [[MEDIA:N]] numbering for inline media, and documents a pre-existing double-extraction defect', () => {
    const { segments } = extractSegments(
      wrap(`<media alt="Standalone first"><image src="s.png"/></media>
            <para id="p1">Text <media alt="Inline second"><image src="i.png"/></media> end.</para>`)
    );
    const para = segments.find((s) => s.type === 'para');
    // The inline media is the FIRST inline one, so it must still be [[MEDIA:1]]
    expect(para.text).toContain('[[MEDIA:1]]');
    const alts = segments.filter((s) => s.type === 'alt');
    // §C81 real property this task owns: distinct ids even when the pre-existing
    // defect double-fires — the 'standalone' counter still assigns unique ids.
    expect(new Set(alts.map((a) => a.id)).size).toBe(alts.length);
    expect(alts.map((a) => a.id)).toEqual([
      'm00001:alt:standalone-1-alt',
      'm00001:alt:standalone-2-alt',
    ]);
    // Pinning the defect's actual shape: both segments carry the SAME text,
    // because they are two extractions of the one physical <media alt="Inline
    // second">. This is the wrong-but-today's-real-output this test exists to
    // make visible, not an endorsement.
    expect(alts.map((a) => a.text)).toEqual(['Standalone first', 'Inline second']);
  });
});
