/**
 * C2 — the E2E segment picker (`server/e2e/helpers/segments.js`).
 *
 * WHY THIS LIVES IN THE VITEST GATE, NOT IN PLAYWRIGHT:
 * `editor-workflow.spec.js` and `ux-phase2.spec.js` sat red on `main` from
 * 2026-07-12 to 2026-07-25 because they POSTed invented segment ids that the
 * SR-OOS-2 backstop (routes/segment-editor.js) correctly 404s. Nothing caught
 * it: Playwright runs outside `npm test`, the authoritative gate, and CI was
 * billing-blocked for eight of those days. Pinning the picker HERE puts the
 * regression guard inside the gate that actually runs on every change.
 *
 * The contract under test: whatever the picker returns must be a segment the
 * server will accept for an append-style edit — proven by feeding the picker's
 * own output back through the REAL `validateStructure`, the same function the
 * route's backstop calls.
 */

const fs = require('fs');
const path = require('path');
const segmentParser = require('../services/segmentParser');
const segmentValidation = require('../public/js/segment-validation');
const { chooseSegment, pickEditableSegment } = require('../e2e/helpers/segments');

/** Minimal segment in the shape `loadModuleForEditing` (and the module GET) emits. */
const seg = (id, en, is) => ({ segmentId: id, en, is });

/** Plain prose, five segments — indices 0 and 4 are the sibling-spec claims. */
const PLAIN = [
  seg('m:title:0', 'Chemistry in Context', 'Efnafræði í samhengi'),
  seg('m:abstract:1', 'By the end of this section…', 'Þegar þú hefur lokið…'),
  seg('m:item:2', 'Outline the historical development', 'Lýst sögulegri þróun'),
  seg('m:item:3', 'Describe the scientific method', 'Lýst vísindalegri aðferð'),
  seg('m:para:4', 'Last paragraph', 'Síðasta málsgrein'),
];

describe('chooseSegment — the returned edit must survive the real backstop', () => {
  it('returns content that validateStructure accepts', () => {
    const picked = chooseSegment(PLAIN, { suffix: ' [e2e-1]' });

    const result = segmentValidation.validateStructure(
      picked.en,
      picked.originalContent,
      picked.editedContent
    );

    expect(result.blocked).toBeNull();
  });

  it('derives editedContent by appending the suffix to the live baseline', () => {
    const picked = chooseSegment(PLAIN, { suffix: ' [e2e-1]' });

    expect(picked.editedContent).toBe(`${picked.originalContent} [e2e-1]`);
  });

  it('skips a segment whose EN marker the MT baseline dropped', () => {
    // Appending can never restore a [[MATH:1]] that is absent from the IS
    // baseline, so such a segment is unusable for an append edit — the route
    // would 400 it with `math-missing`.
    const withDroppedMarker = [
      seg('m:a:0', 'first', 'fyrsti'),
      seg('m:math:1', 'Value is [[MATH:1]] units', 'Gildið er einingar'),
      seg('m:b:2', 'safe segment', 'öruggt segment'),
      seg('m:c:3', 'last', 'síðasti'),
    ];

    const picked = chooseSegment(withDroppedMarker, { suffix: ' [e2e-1]' });

    expect(picked.segmentId).toBe('m:b:2');
  });
});

describe('chooseSegment — sibling-spec ownership on the shared fixture module', () => {
  it('never returns the first segment (claimed by concurrent-editing and editor-lifecycle)', () => {
    const picked = chooseSegment(PLAIN, { suffix: ' [e2e-1]' });

    expect(picked.segmentId).not.toBe('m:title:0');
  });

  it('refuses to fall through to the last segment even when it is the only one left', () => {
    // Deliberately constructed so the guard is the ONLY thing standing between
    // the picker and the last segment: everything between first and last is
    // unusable. Asserting `not.toBe(last)` against a fixture with several valid
    // middle candidates would pass with the guard deleted — it has to be the
    // last segment or nothing.
    const lastIsTheOnlyCandidate = [
      seg('m:a:0', 'first', 'fyrsti'),
      seg('m:none:1', 'untranslated', ''),
      seg('m:none:2', 'also untranslated', ''),
      seg('m:z:3', 'last', 'síðasti'),
    ];

    expect(() => chooseSegment(lastIsTheOnlyCandidate, { suffix: ' [e2e-1]' })).toThrow(
      /no append-safe segment/i
    );
  });

  it('honours an explicit exclude list', () => {
    const picked = chooseSegment(PLAIN, {
      suffix: ' [e2e-1]',
      exclude: ['m:abstract:1', 'm:item:2'],
    });

    expect(picked.segmentId).toBe('m:item:3');
  });

  it('ignores a segment with no Icelandic baseline', () => {
    const untranslated = [
      seg('m:a:0', 'first', 'fyrsti'),
      seg('m:none:1', 'not translated yet', ''),
      seg('m:b:2', 'safe', 'öruggt'),
      seg('m:c:3', 'last', 'síðasti'),
    ];

    const picked = chooseSegment(untranslated, { suffix: ' [e2e-1]' });

    expect(picked.segmentId).toBe('m:b:2');
  });
});

describe('chooseSegment — fails loud rather than returning undefined', () => {
  it('throws when every candidate is excluded', () => {
    expect(() =>
      chooseSegment(PLAIN, {
        suffix: ' [e2e-1]',
        exclude: ['m:abstract:1', 'm:item:2', 'm:item:3'],
      })
    ).toThrow(/no append-safe segment/i);
  });

  it('throws when the module is too short to have a middle', () => {
    expect(() =>
      chooseSegment([seg('m:a:0', 'a', 'á'), seg('m:b:1', 'b', 'bé')], { suffix: ' x' })
    ).toThrow(/no append-safe segment/i);
  });

  it('throws when handed something that is not a segment array', () => {
    expect(() => chooseSegment(undefined, { suffix: ' x' })).toThrow(/segments/i);
  });

  it('throws when no suffix is supplied, rather than appending "undefined"', () => {
    expect(() => chooseSegment(PLAIN, {})).toThrow(/suffix/i);
  });
});

describe('the committed fixtures still offer a usable segment (rot detector)', () => {
  // These are the exact (book, chapter, module) triples the two repaired specs
  // target. If a fixture is ever regenerated into something the backstop
  // rejects, this goes red in `npm test` instead of in the e2e job nobody reads.
  const TARGETS = [
    ['__e2e-fixture__', 1, 'm68664'],
    ['efnafraedi-2e', 1, 'm68664'],
  ];

  /**
   * Segment ids straight off disk, parsed from the committed EN segment file.
   *
   * Deliberately an INDEPENDENT path: asserting that the picked id is a member
   * of the very array it was selected from is unconditionally true and would
   * not notice a picker that synthesised ids — which is precisely the C2 bug.
   */
  function segmentIdsOnDisk(book, chapter, moduleId) {
    const file = path.join(
      __dirname,
      '..',
      '..',
      'books',
      book,
      '02-for-mt',
      `ch${String(chapter).padStart(2, '0')}`,
      `${moduleId}-segments.en.md`
    );
    const markers = fs.readFileSync(file, 'utf8').match(/<!--\s*SEG:(.+?)\s*-->/g) || [];
    return markers.map((m) => m.replace(/<!--\s*SEG:/, '').replace(/\s*-->$/, ''));
  }

  for (const [book, chapter, moduleId] of TARGETS) {
    it(`${book}/ch${chapter}/${moduleId} yields an append-safe segment the route would accept`, () => {
      const data = segmentParser.loadModuleForEditing(book, chapter, moduleId);

      const picked = chooseSegment(data.segments, {
        suffix: ' [rot-detector]',
        exclude: ['m68664:abstract:auto-2'],
      });

      // Independent-source membership: the id must exist in the committed
      // fixture on disk, not merely in the array the picker was handed. This is
      // what the route's backstop resolves before it 404s.
      const onDisk = segmentIdsOnDisk(book, chapter, moduleId);
      expect(onDisk.length).toBeGreaterThan(0);
      expect(onDisk).toContain(picked.segmentId);

      expect(
        segmentValidation.validateStructure(picked.en, picked.originalContent, picked.editedContent)
          .blocked
      ).toBeNull();
    });
  }

  it('still contains the literal id segment-editor.spec.js hardcodes', () => {
    // segment-editor.spec.js:355 pins `m68664:abstract:auto-2` by literal for its
    // propagation tests. If the fixture ever loses that id, that spec is the next
    // one to go red the way C2 did — and this is the gate that would say so.
    expect(segmentIdsOnDisk('efnafraedi-2e', 1, 'm68664')).toContain('m68664:abstract:auto-2');
  });
});

describe('pickEditableSegment — a failed load must be diagnosable from CI logs alone', () => {
  /**
   * Stand-in for Playwright's APIRequestContext. Records the URL it was asked
   * for — without that, a mutation reordering the path segments would leave
   * every vitest test green and surface only in the e2e job nobody watches.
   */
  const fakeRequest = (status, body) => {
    const calls = [];
    return {
      calls,
      get: async (url) => {
        calls.push(url);
        return {
          ok: () => status >= 200 && status < 300,
          status: () => status,
          text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
          json: async () => body,
        };
      },
    };
  };

  it('requests the module at /api/segment-editor/:book/:chapter/:moduleId', async () => {
    const request = fakeRequest(200, { segments: PLAIN });

    await pickEditableSegment(request, {
      book: '__e2e-fixture__',
      chapter: '1',
      moduleId: 'm68664',
      suffix: ' [e2e-1]',
    });

    expect(request.calls).toEqual(['/api/segment-editor/__e2e-fixture__/1/m68664']);
  });

  it('throws with the status code and the response body when the module GET fails', async () => {
    const request = fakeRequest(404, { error: 'module not found' });

    await expect(
      pickEditableSegment(request, {
        book: '__e2e-fixture__',
        chapter: 1,
        moduleId: 'm99999',
        suffix: ' [e2e-1]',
      })
    ).rejects.toThrow(/404.*module not found/s);
  });

  it('returns a picked segment when the module loads', async () => {
    const request = fakeRequest(200, { segments: PLAIN });

    const picked = await pickEditableSegment(request, {
      book: '__e2e-fixture__',
      chapter: 1,
      moduleId: 'm68664',
      suffix: ' [e2e-1]',
    });

    expect(picked.editedContent).toBe(`${picked.originalContent} [e2e-1]`);
  });
});

// (A "helper location" test asserting require.resolve() equals the same path
// spelled with path.join was deleted: the module is already required at the top
// of this file, so resolution cannot fail by the time such a test would run.)
