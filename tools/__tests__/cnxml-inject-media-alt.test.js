import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
// cnxml-inject.js has NO `__testables` object — it exposes module-locals through
// a named `export { … }` block at the bottom of the file (tools/cnxml-inject.js:4795),
// which already carries buildFigure, buildMediaElement, collectTableNodes and others
// "exported for comparison testing". Step 3 adds the three new names to it.
import {
  collectMediaAlts,
  applyMediaAltDom,
  applyMediaAltString,
  buildCnxml,
} from '../cnxml-inject.js';

function parse(fragment) {
  const doc = new DOMParser().parseFromString(
    `<root xmlns="http://cnx.rice.edu/cnxml">${fragment}</root>`,
    'text/xml'
  );
  return doc.documentElement;
}

describe('§C88 — bare-media alt write-back', () => {
  it('collects a bare media alt segment keyed on the media id', () => {
    const map = {};
    collectMediaAlts(
      [
        {
          type: 'example',
          id: 'ex1',
          content: [
            {
              type: 'media',
              id: 'm-bare',
              alt: { segmentId: 'mod:alt:m-bare-alt', text: 'A flask' },
            },
          ],
        },
      ],
      map
    );
    expect(map).toEqual({ 'm-bare': { segmentId: 'mod:alt:m-bare-alt' } });
  });

  it('descends into an exercise via .problem.content/.solution.content (§C88 Task 4 fix-round-1)', () => {
    // An `exercise` structure node has NO `.content` of its own — the real shape
    // from `processExercise` (tools/cnxml-extract.js:1794-1799) is
    // {type:'exercise', id, problem:{content:[...]}|null, solution:{content:[...]}|null}.
    // A fixture shaped like `{type:'exercise', content:[...]}` would pass against the
    // BROKEN collectMediaAlts too (it would just hit the pre-existing generic
    // `el.content` walk) without ever exercising the fix — this fixture matches the
    // real producer shape exactly, so it can only pass with the two explicit
    // `.problem.content`/`.solution.content` descent paths in place.
    const map = {};
    collectMediaAlts(
      [
        {
          type: 'exercise',
          id: 'ex1',
          problem: {
            content: [
              {
                type: 'media',
                id: 'm-prob',
                alt: { segmentId: 'mod:alt:m-prob-alt', text: 'A titration setup' },
              },
            ],
          },
          solution: {
            content: [
              {
                type: 'media',
                id: 'm-sol',
                alt: { segmentId: 'mod:alt:m-sol-alt', text: 'A graph' },
              },
            ],
          },
        },
      ],
      map
    );
    expect(map).toEqual({
      'm-prob': { segmentId: 'mod:alt:m-prob-alt' },
      'm-sol': { segmentId: 'mod:alt:m-sol-alt' },
    });
  });

  it('rewrites the alt attribute in place on a bare media inside a container', () => {
    const el = parse(
      '<example id="ex1"><media id="m-bare" alt="A flask"><image src="a.png"/></media></example>'
    );
    const ctx = {
      mediaAlts: { 'm-bare': { segmentId: 'mod:alt:m-bare-alt' } },
      peekSeg: (id) => (id === 'mod:alt:m-bare-alt' ? 'Kolba' : null),
    };
    expect(applyMediaAltDom(el, ctx)).toBe(1);
    expect(el.getElementsByTagName('media')[0].getAttribute('alt')).toBe('Kolba');
  });

  it('falls back to a child <image> alt when the media carries none', () => {
    const el = parse(
      '<note id="n1"><media id="m2"><image src="a.png" alt="A flask"/></media></note>'
    );
    const ctx = {
      mediaAlts: { m2: { segmentId: 's' } },
      peekSeg: () => 'Kolba',
    };
    expect(applyMediaAltDom(el, ctx)).toBe(1);
    expect(el.getElementsByTagName('image')[0].getAttribute('alt')).toBe('Kolba');
  });

  it('IS BEST-EFFORT: no translation leaves the English alt untouched and reports 0', () => {
    const el = parse(
      '<example id="ex1"><media id="m-bare" alt="A flask"><image src="a.png"/></media></example>'
    );
    const ctx = { mediaAlts: { 'm-bare': { segmentId: 's' } }, peekSeg: () => null };
    expect(applyMediaAltDom(el, ctx)).toBe(0);
    expect(el.getElementsByTagName('media')[0].getAttribute('alt')).toBe('A flask');
  });

  it('NEVER constructs a media element — the node count is unchanged', () => {
    const el = parse(
      '<example id="ex1"><media id="m-bare" alt="A flask"><image src="a.png"/></media></example>'
    );
    const before = el.getElementsByTagName('media').length;
    applyMediaAltDom(el, { mediaAlts: { 'm-bare': { segmentId: 's' } }, peekSeg: () => 'Kolba' });
    expect(el.getElementsByTagName('media').length).toBe(before);
  });

  it('does not touch a media whose id is absent from the map', () => {
    const el = parse(
      '<example id="ex1"><media id="other" alt="A flask"><image src="a.png"/></media></example>'
    );
    expect(
      applyMediaAltDom(el, { mediaAlts: { 'm-bare': { segmentId: 's' } }, peekSeg: () => 'Kolba' })
    ).toBe(0);
    expect(el.getElementsByTagName('media')[0].getAttribute('alt')).toBe('A flask');
  });
});

// §C88 — `structure.inlineMedia` second source (buildCnxml, not exported as its own
// function — this is the seam: the fold lives inline at the ctx-wiring site in
// buildCnxml, so it is exercised through buildCnxml's public contract rather than
// asserted on an intermediate value). Neither test's media is reachable by
// collectMediaAlts's `.content` walk (both examples' `content` arrays are empty) —
// isolating the fold from the mechanism task-2-brief.md Step 3 already covers.
//
// This mirrors m68801's actual defect: its media is a list-item block child whose
// alt lives ONLY in structure.inlineMedia (never as a `.content`-level `type:'media'`
// node with `.alt`), and its own [[MEDIA:N]] placeholder never reaches this bare
// media because nothing in the fixture's segment text references it — the write-back
// has to come from applyMediaAltDom via ctx.mediaAlts, exactly like the real case.
describe('§C88 — structure.inlineMedia folds into ctx.mediaAlts (buildCnxml)', () => {
  it('an inlineMedia entry WITH an id reaches the container write-back', () => {
    const structure = {
      moduleId: 'test1',
      content: [{ type: 'example', id: 'ex1', content: [] }],
      inlineMedia: [
        {
          placeholder: '[[MEDIA:1]]',
          id: 'm-bare',
          alt: { segmentId: 'test1:alt:m-bare-alt', text: 'English alt' },
          src: 'a.png',
        },
      ],
    };
    const segments = new Map([['test1:alt:m-bare-alt', 'Þýtt alt']]);
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<content>
<example id="ex1"><media id="m-bare" alt="English alt"><image mime-type="image/png" src="a.png"/></media></example>
</content>
</document>`;

    const { cnxml } = buildCnxml(structure, segments, {}, originalCnxml, {}, {});
    expect(cnxml).toContain('alt="Þýtt alt"');
    expect(cnxml).not.toContain('alt="English alt"');
  });

  it('an inlineMedia entry with NO id never enters the map — the id guard holds', () => {
    // Without the `m.id &&` guard, `mediaAlts[m.id] = …` would key on `undefined`,
    // which JS coerces to the property key "undefined" — a real collision hazard
    // if any DOM media happens to carry the literal `id="undefined"` (a legal
    // CNXML id token). A fixture using two arbitrary, non-colliding ids (e.g.
    // "m-other") would pass whether or not the guard exists — `mediaAlts.undefined`
    // never matches `mediaAlts['m-other']` regardless — so it would not actually
    // catch a dropped guard. This fixture forces the collision the guard exists
    // to prevent: confirmed to FAIL without the guard (`m.id &&` removed) and PASS
    // with it, before committing.
    const structure = {
      moduleId: 'test1',
      content: [{ type: 'example', id: 'ex1', content: [] }],
      inlineMedia: [
        {
          placeholder: '[[MEDIA:1]]',
          id: undefined,
          alt: { segmentId: 'test1:alt:no-id-alt', text: 'English alt' },
          src: 'a.png',
        },
      ],
    };
    const segments = new Map([['test1:alt:no-id-alt', 'Þýtt alt']]);
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<content>
<example id="ex1"><media id="undefined" alt="English alt"><image mime-type="image/png" src="a.png"/></media></example>
</content>
</document>`;

    const { cnxml } = buildCnxml(structure, segments, {}, originalCnxml, {}, {});
    expect(cnxml).toContain('alt="English alt"');
    expect(cnxml).not.toContain('alt="Þýtt alt"');
  });
});

describe('§C88 — table-entry alt write-back (string path)', () => {
  it('rewrites a media alt inside a verbatim entry string', () => {
    const entry = '<entry><media id="m-cell" alt="A flask"><image src="a.png"/></media></entry>';
    const ctx = { mediaAlts: { 'm-cell': { segmentId: 's' } }, peekSeg: () => 'Kolba' };
    expect(applyMediaAltString(entry, ctx)).toBe(
      '<entry><media id="m-cell" alt="Kolba"><image src="a.png"/></media></entry>'
    );
  });

  it('escapes the translation so a quote cannot break the attribute', () => {
    const entry = '<entry><media id="m-cell" alt="A flask"/></entry>';
    const ctx = {
      mediaAlts: { 'm-cell': { segmentId: 's' } },
      peekSeg: () => 'A "big" flask & more',
    };
    const out = applyMediaAltString(entry, ctx);
    expect(out).toContain('alt="A &quot;big&quot; flask &amp; more"');
    expect(out).not.toContain('alt="A "big"');
  });

  it('IS BEST-EFFORT: no translation returns the string byte-for-byte unchanged', () => {
    const entry = '<entry><media id="m-cell" alt="A flask"/></entry>';
    expect(
      applyMediaAltString(entry, {
        mediaAlts: { 'm-cell': { segmentId: 's' } },
        peekSeg: () => null,
      })
    ).toBe(entry);
  });

  it('leaves an unmapped media alone', () => {
    const entry = '<entry><media id="other" alt="A flask"/></entry>';
    expect(
      applyMediaAltString(entry, {
        mediaAlts: { 'm-cell': { segmentId: 's' } },
        peekSeg: () => 'Kolba',
      })
    ).toBe(entry);
  });

  it('rewrites only the matching media when an entry holds two', () => {
    const entry = '<entry><media id="a" alt="One"/><media id="b" alt="Two"/></entry>';
    const ctx = { mediaAlts: { b: { segmentId: 's' } }, peekSeg: () => 'Tveir' };
    expect(applyMediaAltString(entry, ctx)).toBe(
      '<entry><media id="a" alt="One"/><media id="b" alt="Tveir"/></entry>'
    );
  });

  // The five tests above pin applyMediaAltString in isolation; none of them exercise
  // buildTable's actual wiring (its new 5th `ctx` param, and the fall-through return
  // routed through applyMediaAltString). buildTable has FOUR call sites and the task-3
  // brief warns explicitly: "Miss one and table-entry alts are silently never written
  // back on that path — no error, no failing test, just an uncovered path." This
  // end-to-end test goes through buildCnxml → buildElement's `case 'table':` (the
  // primary content-table call site) with an empty-text cell (`segmentId: null`,
  // the exact shape from the "Fix B" self-closing-entry fixture above) whose source
  // entry carries a bare <media>, so it can only pass if the wiring is real.
  it('an empty-text table cell still gets its bare-media alt translated (buildCnxml, end-to-end)', () => {
    const structure = {
      moduleId: 'test2',
      content: [
        {
          type: 'table',
          id: 'tbl-alt',
          class: null,
          summary: null,
          rows: [{ cells: [{ segmentId: null, attributes: {} }] }],
        },
      ],
      inlineMedia: [
        {
          placeholder: '[[MEDIA:1]]',
          id: 'm-cell',
          alt: { segmentId: 'test2:alt:m-cell-alt', text: 'A flask' },
          src: 'a.png',
        },
      ],
    };
    const segments = new Map([['test2:alt:m-cell-alt', 'Kolba']]);
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<content>
<table id="tbl-alt" summary="">
<tgroup cols="1">
<tbody>
<row><entry><media id="m-cell" alt="A flask"><image mime-type="image/png" src="a.png"/></media></entry></row>
</tbody>
</tgroup>
</table>
</content>
</document>`;

    const { cnxml } = buildCnxml(structure, segments, {}, originalCnxml, {}, {});
    expect(cnxml).toContain('alt="Kolba"');
    expect(cnxml).not.toContain('alt="A flask"');
  });
});
