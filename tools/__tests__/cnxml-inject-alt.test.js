import { describe, it, expect } from 'vitest';
import { buildFigure, buildMedia, buildMediaElement, buildCnxml } from '../cnxml-inject.js';

const getSeg = (id) => (id === 'm1:alt:fig-1-alt' ? 'Íslensk lýsing' : undefined);

describe('buildFigure alt (§C81)', () => {
  it('emits the translated alt for the new shape', () => {
    const out = buildFigure(
      {
        id: 'fig-1',
        media: {
          id: 'med-1',
          alt: { segmentId: 'm1:alt:fig-1-alt', text: 'English alt' },
          src: 'a.png',
        },
      },
      getSeg,
      '',
      null
    );
    expect(out).toContain('alt="Íslensk lýsing"');
    expect(out).not.toContain('[object Object]');
  });

  it('falls back to the English text when the segment is missing', () => {
    const out = buildFigure(
      {
        id: 'fig-1',
        media: { id: 'med-1', alt: { segmentId: 'nope', text: 'English alt' }, src: 'a.png' },
      },
      getSeg,
      '',
      null
    );
    expect(out).toContain('alt="English alt"');
  });

  // CONTROL: the legacy shape §C82 guarantees will coexist must be untouched
  it('emits a legacy string alt unchanged', () => {
    const out = buildFigure(
      { id: 'fig-1', media: { id: 'med-1', alt: 'Legacy English alt', src: 'a.png' } },
      getSeg,
      '',
      null
    );
    expect(out).toContain('alt="Legacy English alt"');
  });

  it('emits no alt attribute when there is no alt', () => {
    const out = buildFigure(
      { id: 'fig-1', media: { id: 'med-1', src: 'a.png' } },
      getSeg,
      '',
      null
    );
    expect(out).not.toContain('alt=');
  });
});

describe('buildMedia alt (§C81)', () => {
  const g = (id) => (id === 'm1:alt:med-9-alt' ? 'Íslensk staðalmynd' : undefined);

  it('emits the translated alt for the new shape', () => {
    const out = buildMedia(
      { id: 'med-9', alt: { segmentId: 'm1:alt:med-9-alt', text: 'English' }, src: 'c.png' },
      g
    );
    expect(out).toContain('alt="Íslensk staðalmynd"');
    expect(out).not.toContain('[object Object]');
  });

  // CONTROL: legacy string, and no getSeg supplied at all
  it('emits a legacy string alt unchanged even with no getSeg', () => {
    const out = buildMedia({ id: 'med-9', alt: 'Legacy alt', src: 'c.png' });
    expect(out).toContain('alt="Legacy alt"');
  });
});

describe('buildMediaElement alt (§C81)', () => {
  it('emits a pre-resolved string alt', () => {
    const out = buildMediaElement({ id: 'mi-1', alt: 'Þýdd lýsing', src: 'e.png' });
    expect(out).toContain('alt="Þýdd lýsing"');
  });

  // CONTROL: an unresolved object must never reach the page as [object Object]
  it('never emits [object Object] if handed an unresolved object', () => {
    const out = buildMediaElement({
      id: 'mi-1',
      alt: { segmentId: 'x', text: 'English' },
      src: 'e.png',
    });
    expect(out).not.toContain('[object Object]');
    expect(out).toContain('alt="English"');
  });
});

describe('reverseInlineMarkup boundary resolution for para-inline media (§C81)', () => {
  // PROBE: this exercises the real getSeg closure inside buildCnxml, not a hand-rolled
  // stand-in — buildMediaElement alone can't catch a missed/mis-wired call site, and a
  // naive "recompute the resolved array on every getSeg call" placement recurses forever
  // the moment an inline-media alt segment is actually present in the segments map (an
  // absent alt segment can't discriminate: getSeg's missing-segment branch returns before
  // ever reaching reverseInlineMarkup, so it can't tell a correct fix from a broken one).
  it('resolves an object alt on para-inline media to its Icelandic segment text', () => {
    const structure = {
      moduleId: 'test',
      title: { segmentId: 'test:title:auto-1', text: 'Test' },
      content: [{ type: 'para', id: 'p1', segmentId: 'test:para:p1' }],
      inlineMedia: [
        {
          placeholder: '[[MEDIA:1]]',
          id: 'mi-1',
          alt: { segmentId: 'test:alt:mi-1-alt', text: 'English alt' },
          src: 'e.png',
        },
      ],
    };
    const segments = new Map([
      ['test:title:auto-1', 'Titill'],
      ['test:para:p1', 'Sjá mynd: [[MEDIA:1]] hér.'],
      ['test:alt:mi-1-alt', 'Íslensk lýsing'],
    ]);
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<para id="p1">Original para content.</para>
</content>
</document>`;

    const result = buildCnxml(structure, segments, {}, originalCnxml);
    expect(result.cnxml).toContain('alt="Íslensk lýsing"');
    expect(result.cnxml).not.toContain('[object Object]');
    expect(result.cnxml).not.toContain('alt="English alt"');
  });
});

describe('alt escaping round-trip (§C81)', () => {
  // No alt in the corpus contains an entity (1 of 1,149 in chemistry, 0 of 2,163
  // in organic — and that one is probably regex over-match), so this MUST be
  // synthetic. Translated alt crosses escapeXml at inject and escapeAttr at
  // render, on two different render paths.
  it('escapes an ampersand exactly once at inject', () => {
    const out = buildMedia({ id: 'm', alt: 'sýrur & basar', src: 'f.png' });
    expect(out).toContain('alt="sýrur &amp; basar"');
    expect(out).not.toContain('&amp;amp;');
  });

  it('leaves plain ASCII alt byte-identical to the pre-§C81 form', () => {
    const out = buildMedia({ id: 'm', alt: 'A plain description', src: 'f.png' });
    expect(out).toContain('alt="A plain description"');
  });
});
