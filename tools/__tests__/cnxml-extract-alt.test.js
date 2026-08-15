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
