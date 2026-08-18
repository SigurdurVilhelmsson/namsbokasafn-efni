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
