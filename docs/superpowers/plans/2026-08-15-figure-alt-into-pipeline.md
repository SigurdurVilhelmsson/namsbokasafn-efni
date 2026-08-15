# Figure `alt` into the Translation Pipeline — Implementation Plan (§C81)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make figure/media `alt` text a translatable segment so Icelandic pages stop shipping English alt text to screen-reader users.

**Architecture:** `alt` currently travels as a bare string through three capture sites in the extractor and three emission sites in the injector. This change makes it travel as `{ segmentId, text }` — the same shape `title` and `caption` already use — while every emission site accepts **both** the old string and the new object, because §C82's loop re-extracts one module at a time and both shapes coexist for the whole run.

**Tech Stack:** Node 22 · Vitest · ES modules at repo root (`tools/`, `scripts/`); CommonJS under `server/`.

**Spec:** [`docs/superpowers/specs/2026-08-15-figure-alt-into-pipeline-design.md`](../specs/2026-08-15-figure-alt-into-pipeline-design.md)

## Global Constraints

- **Root `npm test` is the authoritative gate.** Run it from the repo root, not from `tools/`.
- **`tools/` is ESM.** Use `import`/`export`. A `require` in `tools/*.js` cannot load.
- **Never edit files under `books/*/01-source/`.** Read-only by project rule.
- **Do not run `cnxml-extract.js` against the real tree during development.** `--output-dir` is advertised in `--help` and **silently ignored** (§C83) — it writes to `books/` and exits 0. Use in-memory `extractSegments()` calls in tests instead.
- **Backups:** the extractor writes its own `.bak` files; do not add a second mechanism.
- **Every new check gets a control that fails.** A test that has never gone red on known-bad input is not a test.
- **Segment id format** is fixed by `generateSegmentId(moduleId, type, elementId, counter)`: `${moduleId}:${type}:${elementId}`, or `${moduleId}:${type}:auto-${counter}` when `elementId` is falsy.
- **Do not unify `cnxml-render.js:1087` and `:1149`.** They are correct for different inputs (re-serialized node vs regex parse). Render needs **no change** in this plan.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `tools/cnxml-extract.js` | emit `alt` segments at three capture sites | modify |
| `tools/cnxml-inject.js` | resolve `alt` at three emission sites, dual-shape | modify |
| `tools/lib/alt-segments.js` | **new** — the two pure helpers both files need: build an alt segment id, and read an alt value out of either shape | create |
| `tools/__tests__/alt-segments.test.js` | unit tests for the shared helpers | create |
| `tools/__tests__/cnxml-extract-alt.test.js` | extraction: three positions, ids, ordering | create |
| `tools/__tests__/cnxml-inject-alt.test.js` | injection: three sites, dual-shape, escaping | create |

**Why a shared `tools/lib/alt-segments.js`:** `readAlt()` is needed at three sites in the injector and the id rule at three sites in the extractor. Inlining either would put the same two rules in six places, which is how the three bare-dir conventions and the three `alt:` captures drifted in the first place. Both files are ESM, so a plain `.js` in `tools/lib/` works — **do not reach for `.cjs`**, which exists only for modules the `server/` tree also consumes.

---

### Task 1: Shared alt helpers

**Files:**
- Create: `tools/lib/alt-segments.js`
- Test: `tools/__tests__/alt-segments.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `altElementId(mediaId, placeholderIndex)` → `string` — the `elementId` to hand `generateSegmentId`. Returns `` `${mediaId}-alt` `` when `mediaId` is a non-empty string, else `` `media-${placeholderIndex}-alt` ``.
  - `readAlt(alt, getSeg)` → `string` — resolves either shape. `alt` is `string | {segmentId?, text?} | null | undefined`; `getSeg` is `(id) => string | undefined | null`, optional.

- [ ] **Step 1: Write the failing test**

```javascript
// tools/__tests__/alt-segments.test.js
import { describe, it, expect } from 'vitest';
import { altElementId, readAlt } from '../lib/alt-segments.js';

describe('altElementId', () => {
  it('uses the media id when present', () => {
    expect(altElementId('CNX_Chem_01_02_Fig', 7)).toBe('CNX_Chem_01_02_Fig-alt');
  });

  it('falls back to the placeholder index when the media has no id', () => {
    expect(altElementId(null, 7)).toBe('media-7-alt');
  });

  it('treats an empty-string id as absent', () => {
    expect(altElementId('', 3)).toBe('media-3-alt');
  });
});

describe('readAlt', () => {
  it('returns a legacy string unchanged', () => {
    expect(readAlt('A flask of blue liquid', () => 'NEVER')).toBe('A flask of blue liquid');
  });

  it('resolves the segment when the new shape is given', () => {
    const alt = { segmentId: 'm1:alt:fig-1-alt', text: 'English' };
    expect(readAlt(alt, (id) => (id === 'm1:alt:fig-1-alt' ? 'Íslenska' : undefined))).toBe('Íslenska');
  });

  it('falls back to the English text when the segment is missing', () => {
    const alt = { segmentId: 'm1:alt:fig-1-alt', text: 'English' };
    expect(readAlt(alt, () => undefined)).toBe('English');
  });

  it('falls back to the English text when no getSeg is supplied at all', () => {
    expect(readAlt({ segmentId: 'x', text: 'English' })).toBe('English');
  });

  it('returns empty string for null/undefined', () => {
    expect(readAlt(null, () => 'x')).toBe('');
    expect(readAlt(undefined, () => 'x')).toBe('');
  });

  it('returns empty string when the segment resolves to empty and there is no text', () => {
    expect(readAlt({ segmentId: 'x' }, () => '')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/alt-segments.test.js`
Expected: FAIL — `Failed to load ../lib/alt-segments.js`

- [ ] **Step 3: Write minimal implementation**

```javascript
// tools/lib/alt-segments.js
/**
 * Shared rules for figure/media `alt` segments (§C81).
 *
 * Both the extractor and the injector need these, at three sites each. They live
 * here so the id rule and the dual-shape read exist once rather than six times.
 */

/**
 * The `elementId` to hand generateSegmentId for a media's alt segment.
 *
 * Media with an id get a stable, content-anchored id. The 32 id-less media in
 * scope (all standalone, all in lifraen-efnafraedi) fall back to the
 * [[MEDIA:N]] placeholder index, which is positional and therefore only safe
 * because §C80 re-extracts both books wholesale.
 *
 * @param {string|null|undefined} mediaId
 * @param {number} placeholderIndex - the N in [[MEDIA:N]]
 * @returns {string}
 */
export function altElementId(mediaId, placeholderIndex) {
  if (typeof mediaId === 'string' && mediaId.length > 0) return `${mediaId}-alt`;
  return `media-${placeholderIndex}-alt`;
}

/**
 * Read an alt value out of EITHER shape.
 *
 * Legacy structures (pre-§C81) carry `alt` as a plain string; new ones carry
 * `{ segmentId, text }`. §C82 re-extracts one module at a time, so both shapes
 * are live simultaneously for the whole run — this is required, not defensive.
 * Passing the new shape to code that expects a string yields "[object Object]"
 * in a published page.
 *
 * @param {string|{segmentId?: string, text?: string}|null|undefined} alt
 * @param {(id: string) => (string|null|undefined)} [getSeg]
 * @returns {string} '' when there is nothing to emit
 */
export function readAlt(alt, getSeg) {
  if (!alt) return '';
  if (typeof alt === 'string') return alt;
  const translated = alt.segmentId && getSeg ? getSeg(alt.segmentId) : null;
  return translated || alt.text || '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/alt-segments.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/alt-segments.js tools/__tests__/alt-segments.test.js
git commit -m "feat(C81): shared alt segment id + dual-shape read helpers"
```

---

### Task 2: Extract alt for figure media

**Files:**
- Modify: `tools/cnxml-extract.js:1086-1118` (`processFigure`)
- Test: `tools/__tests__/cnxml-extract-alt.test.js`

**Interfaces:**
- Consumes: `altElementId` from Task 1.
- Produces: `figStructure.media.alt` is now `{ segmentId, text }` instead of a string. Consumed by `buildFigure` in Task 5.

- [ ] **Step 1: Write the failing test**

```javascript
// tools/__tests__/cnxml-extract-alt.test.js
import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';

const wrap = (body) => `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml" module-id="m00001">
<title>T</title>
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
      wrap(`<figure id="fig-02"><media id="m2"><image src="b.png"/></media><caption>C</caption></figure>`)
    );
    expect(segments.filter((s) => s.type === 'alt')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-alt.test.js`
Expected: FAIL — `expected [] to have length 1` (no `alt` segments emitted yet).

`extractSegments` is **already exported** from `tools/cnxml-extract.js` (verified in its
`export { … }` block at :2129), so no export change is needed for this task.

- [ ] **Step 3: Write minimal implementation**

At the top of `tools/cnxml-extract.js`, beside the other imports:

```javascript
import { altElementId } from './lib/alt-segments.js';
```

Then in `processFigure`, replace the media block (currently ending `figStructure.media = { id, alt, src, mimeType }`) with:

```javascript
  // Extract media info
  const mediaMatch = figure.content.match(/<media[^>]*>([\s\S]*?)<\/media>/);
  if (mediaMatch) {
    const mediaAttrs = parseAttributes(mediaMatch[0].match(/<media([^>]*)>/)[1]);
    const imageMatch = mediaMatch[1].match(/<image[^>]*>/);
    if (imageMatch) {
      const imageAttrs = parseAttributes(imageMatch[0]);
      const altText = mediaAttrs.alt || imageAttrs.alt || '';
      // §C81: alt is a translatable segment, emitted AFTER the caption so a
      // reviewer has the figure's context before judging the description.
      // Anchor on the media id, else the FIGURE's id — a figure always has one,
      // so the positional fallback never fires here. (Passing a media counter
      // would be meaningless: processFigure does not increment counters.media.)
      const altSegId = altText
        ? addSegment('alt', altText, altElementId(mediaAttrs.id || figure.id, 0))
        : null;
      figStructure.media = {
        id: mediaAttrs.id,
        alt: altSegId ? { segmentId: altSegId, text: altText } : undefined,
        src: imageAttrs.src,
        mimeType: imageAttrs['mime-type'],
      };
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract-alt.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole suite — this renumbers seg-ids and other tests will notice**

Run: `npm test`
Expected: PASS. **If extraction snapshot or golden tests fail because `auto-N` ids shifted, that is the expected consequence recorded in the spec — update those goldens in this commit and say so in the message.** Do **not** update a golden whose diff shows anything other than an added `alt` segment or a shifted `auto-N`.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-alt.test.js
git commit -m "feat(C81): emit an alt segment for figure media, after the caption"
```

---

### Task 3: Extract alt for standalone top-level media

**Files:**
- Modify: `tools/cnxml-extract.js:1057-1075` (`processTopLevelContent`, `case 'media'`)
- Test: `tools/__tests__/cnxml-extract-alt.test.js` (extend)

**Interfaces:**
- Consumes: `altElementId` from Task 1.
- Produces: the `{type:'media'}` element in `structure.content[]` carries `alt: { segmentId, text }`. Consumed by `buildMedia` in Task 6.

This is 340 of the 1,281 in-scope alts — the largest non-figure group, and the one an earlier count missed entirely.

- [ ] **Step 1: Write the failing test**

```javascript
// append to tools/__tests__/cnxml-extract-alt.test.js
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

  it('uses a positional id when the standalone media has no id', () => {
    const { segments } = extractSegments(
      wrap(`<media alt="An unidentified diagram"><image src="d.png"/></media>`)
    );
    const alt = segments.filter((s) => s.type === 'alt');
    expect(alt).toHaveLength(1);
    expect(alt[0].id).toMatch(/^m00001:alt:media-\d+-alt$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-alt.test.js -t "standalone"`
Expected: FAIL — `expected [] to have length 1`.

- [ ] **Step 3: Write minimal implementation**

In `processTopLevelContent`'s `case 'media':`, replace the `elements.push({...})` object's `alt` line:

```javascript
      case 'media': {
        const mediaAttrs = item.attributes;
        const imageMatch = item.content.match(/<image[^>]*>/);
        const imageAttrs = imageMatch
          ? parseAttributes(imageMatch[0].match(/<image([^>]*)>/)[1])
          : {};
        const iframeMatch = item.content.match(/<iframe([^>]*)\/?>/);
        const iframeAttrs = iframeMatch ? parseAttributes(iframeMatch[1]) : {};
        // §C81: standalone media has neither caption nor containing paragraph,
        // so its alt segment is emitted at the media's own position — which is
        // where processTopLevelContent already is, in document order.
        const altText = mediaAttrs.alt || imageAttrs.alt || '';
        counters.media = (counters.media || 0) + 1;
        const altSegId = altText
          ? addSegment('alt', altText, altElementId(item.id, counters.media))
          : null;
        elements.push({
          type: 'media',
          id: item.id,
          class: mediaAttrs.class || null,
          alt: altSegId ? { segmentId: altSegId, text: altText } : undefined,
          src: imageAttrs.src || '',
          embedSrc: iframeAttrs.src || '',
          width: iframeAttrs.width || '',
```

Leave the remainder of the pushed object unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract-alt.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, with the same golden-update rule as Task 2 Step 5.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-alt.test.js
git commit -m "feat(C81): emit an alt segment for standalone top-level media"
```

---

### Task 4: Extract alt for para-inline media

**Files:**
- Modify: `tools/cnxml-extract.js:206-232` (`extractInlineText`, inline media branch) and its callers
- Test: `tools/__tests__/cnxml-extract-alt.test.js` (extend)

**Interfaces:**
- Consumes: `altElementId` from Task 1.
- Produces: entries in `structure.inlineMedia[]` carry `alt: { segmentId, text }`. Consumed by Task 7.

⚠️ **`extractInlineText` must stay pure.** It has no access to `addSegment` — that lives in `extractSegments`'s closure. The alt segment is emitted by the **caller**, right after the paragraph's own segment, by draining what the paragraph just added to `inlineMediaMap`.

- [ ] **Step 1: Write the failing test**

```javascript
// append to tools/__tests__/cnxml-extract-alt.test.js
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-alt.test.js -t "para-inline"`
Expected: FAIL — `structure.inlineMedia[0].alt` is the string `'An inline chart'`, not an object.

- [ ] **Step 3: Write minimal implementation**

`extractInlineText` keeps storing the raw string plus the index it will need:

```javascript
      inlineMediaMap.set(placeholder, {
        id: parsedAttrs.id || null,
        class: parsedAttrs.class || null,
        altText: parsedAttrs.alt || imageAttrs.alt || '',   // §C81: raw; the caller segments it
        mediaIndex: counters.media,                          // §C81: N in [[MEDIA:N]]
        src: imageAttrs.src || '',
        mimeType: imageAttrs['mime-type'] || null,
        embedSrc: iframeAttrs.src || '',
        width: iframeAttrs.width || '',
        height: iframeAttrs.height || '',
      });
```

Add this helper inside `extractSegments`, next to `addSegment`:

```javascript
  // §C81: emit alt segments for any inline media the last extractInlineText()
  // call collected. Called by paragraph handlers immediately AFTER the
  // paragraph's own segment, so the alt follows the text that gives it context.
  function drainInlineMediaAlts() {
    for (const [, media] of inlineMediaMap) {
      if (media.alt !== undefined || !media.altText) continue; // already drained, or nothing to emit
      const segId = addSegment('alt', media.altText, altElementId(media.id, media.mediaIndex));
      media.alt = segId ? { segmentId: segId, text: media.altText } : undefined;
    }
  }
```

Call `drainInlineMediaAlts()` immediately after each `addSegment('para', ...)` in
`processTopLevelContent`, `processSection`, `processExample`, `processNote`, `processList` and
`emitExerciseSection`. **Find them with `grep -an "addSegment('para'" tools/cnxml-extract.js` —
do not work from this list, which is a prose enumeration of exactly the kind this repo has
watched drift.**

Finally, where `structure.inlineMedia` is built, drop the working fields:

```javascript
  if (inlineMediaMap.size > 0) {
    structure.inlineMedia = Array.from(inlineMediaMap.entries()).map(([placeholder, data]) => {
      const { altText, mediaIndex, ...rest } = data;
      return { placeholder, ...rest };
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract-alt.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, same golden-update rule as Task 2 Step 5.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-alt.test.js
git commit -m "feat(C81): emit an alt segment for para-inline media, after the paragraph"
```

---

### Task 5: Inject — figure media, dual-shape

**Files:**
- Modify: `tools/cnxml-inject.js:2375` (`buildFigure`)
- Test: `tools/__tests__/cnxml-inject-alt.test.js`

**Interfaces:**
- Consumes: `readAlt` from Task 1; the structure shape from Task 2.
- Produces: nothing new.

`buildFigure(element, getSeg, originalCnxml, ctx)` already has `getSeg`, so this site needs no signature change.

- [ ] **Step 1: Write the failing test**

```javascript
// tools/__tests__/cnxml-inject-alt.test.js
import { describe, it, expect } from 'vitest';
import { buildFigure, buildMedia, buildMediaElement } from '../cnxml-inject.js';

const getSeg = (id) => (id === 'm1:alt:fig-1-alt' ? 'Íslensk lýsing' : undefined);

describe('buildFigure alt (§C81)', () => {
  it('emits the translated alt for the new shape', () => {
    const out = buildFigure(
      { id: 'fig-1', media: { id: 'med-1', alt: { segmentId: 'm1:alt:fig-1-alt', text: 'English alt' }, src: 'a.png' } },
      getSeg, '', null
    );
    expect(out).toContain('alt="Íslensk lýsing"');
    expect(out).not.toContain('[object Object]');
  });

  it('falls back to the English text when the segment is missing', () => {
    const out = buildFigure(
      { id: 'fig-1', media: { id: 'med-1', alt: { segmentId: 'nope', text: 'English alt' }, src: 'a.png' } },
      getSeg, '', null
    );
    expect(out).toContain('alt="English alt"');
  });

  // CONTROL: the legacy shape §C82 guarantees will coexist must be untouched
  it('emits a legacy string alt unchanged', () => {
    const out = buildFigure(
      { id: 'fig-1', media: { id: 'med-1', alt: 'Legacy English alt', src: 'a.png' } },
      getSeg, '', null
    );
    expect(out).toContain('alt="Legacy English alt"');
  });

  it('emits no alt attribute when there is no alt', () => {
    const out = buildFigure({ id: 'fig-1', media: { id: 'med-1', src: 'a.png' } }, getSeg, '', null);
    expect(out).not.toContain('alt=');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject-alt.test.js -t "buildFigure"`
Expected: FAIL — but **first** it will fail to import. Verified against the `export { … }` block
at `tools/cnxml-inject.js:4536`: **`buildMedia` and `buildMediaElement` are already exported;
`buildFigure` is NOT.** Add it to that block as part of Step 3:

```javascript
export {
  // …existing entries unchanged…
  buildFigure,   // §C81: exported for alt dual-shape tests
};
```

Once it imports, the first test fails with `alt="[object Object]"` — that is the real red.

- [ ] **Step 3: Write minimal implementation**

Import at the top of `tools/cnxml-inject.js`:

```javascript
import { readAlt } from './lib/alt-segments.js';
```

Replace line 2375:

```javascript
    const altText = readAlt(element.media.alt, getSeg);
    const alt = altText ? ` alt="${escapeXml(altText)}"` : '';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-inject-alt.test.js -t "buildFigure"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-alt.test.js
git commit -m "feat(C81): resolve figure media alt through getSeg, dual-shape"
```

---

### Task 6: Inject — standalone media, dual-shape

**Files:**
- Modify: `tools/cnxml-inject.js:3887-3891` (`buildMedia`) and its two callers at `:2233`, `:3835`
- Test: `tools/__tests__/cnxml-inject-alt.test.js` (extend)

**Interfaces:**
- Consumes: `readAlt` from Task 1; the structure shape from Task 3.
- Produces: **`buildMedia(element)` becomes `buildMedia(element, getSeg)`.** Both callers already have `getSeg` in scope.

- [ ] **Step 1: Write the failing test**

```javascript
// append to tools/__tests__/cnxml-inject-alt.test.js
describe('buildMedia alt (§C81)', () => {
  const g = (id) => (id === 'm1:alt:med-9-alt' ? 'Íslensk staðalmynd' : undefined);

  it('emits the translated alt for the new shape', () => {
    const out = buildMedia(
      { id: 'med-9', alt: { segmentId: 'm1:alt:med-9-alt', text: 'English' }, src: 'c.png' }, g
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject-alt.test.js -t "buildMedia"`
Expected: FAIL — `alt="[object Object]"`.

- [ ] **Step 3: Write minimal implementation**

```javascript
function buildMedia(element, getSeg) {
  const idAttr = element.id ? ` id="${element.id}"` : '';
  const classAttr = element.class ? ` class="${element.class}"` : '';
  const altText = readAlt(element.alt, getSeg);
  const alt = altText ? ` alt="${escapeXml(altText)}"` : '';
```

Leave the rest of `buildMedia` unchanged. Then update both callers:

```javascript
// tools/cnxml-inject.js:2233, inside buildElement(element, getSeg, ...)
      return buildMedia(element, getSeg);

// tools/cnxml-inject.js:3835, inside buildList(element, getSeg, ...)
          return m ? buildMedia({ ...m }, getSeg) : '';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-inject-alt.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole suite — this is a signature change**

Run: `npm test`
Expected: PASS. Any failure here means a third caller of `buildMedia` exists that this task missed; find it with `grep -an "buildMedia(" tools/cnxml-inject.js` and thread `getSeg` through it too.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-alt.test.js
git commit -m "feat(C81): thread getSeg into buildMedia, resolve alt dual-shape"
```

---

### Task 7: Inject — para-inline media, resolved at the boundary

**Files:**
- Modify: `tools/cnxml-inject.js:1241-1245` (`buildMediaElement`) and the caller of `reverseInlineMarkup`
- Test: `tools/__tests__/cnxml-inject-alt.test.js` (extend)

**Interfaces:**
- Consumes: `readAlt` from Task 1; the structure shape from Task 4.
- Produces: nothing new. `buildMediaElement(media)` keeps its signature.

⚠️ **`reverseInlineMarkup(text, equations, inlineMedia = [], …)` receives no `getSeg` and must not gain one** — it is a pure text transformer, the mirror of `extractInlineText`. Its **caller** resolves each entry's alt to a plain string before passing the array in.

- [ ] **Step 1: Write the failing test**

```javascript
// append to tools/__tests__/cnxml-inject-alt.test.js
describe('buildMediaElement alt (§C81)', () => {
  it('emits a pre-resolved string alt', () => {
    const out = buildMediaElement({ id: 'mi-1', alt: 'Þýdd lýsing', src: 'e.png' });
    expect(out).toContain('alt="Þýdd lýsing"');
  });

  // CONTROL: an unresolved object must never reach the page as [object Object]
  it('never emits [object Object] if handed an unresolved object', () => {
    const out = buildMediaElement({ id: 'mi-1', alt: { segmentId: 'x', text: 'English' }, src: 'e.png' });
    expect(out).not.toContain('[object Object]');
    expect(out).toContain('alt="English"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject-alt.test.js -t "buildMediaElement"`
Expected: FAIL on the second test — `alt="[object Object]"`.

- [ ] **Step 3: Write minimal implementation**

Make `buildMediaElement` defensive as a backstop (it should always receive a resolved string, but must never emit `[object Object]`):

```javascript
function buildMediaElement(media) {
  const idAttr = media.id ? ` id="${media.id}"` : '';
  const classAttr = media.class ? ` class="${media.class}"` : '';
  const altValue = readAlt(media.alt);            // §C81: string passthrough; object → its English
  const altAttr = altValue ? ` alt="${escapeXml(altValue)}"` : '';
```

Then resolve at the boundary. Find the `reverseInlineMarkup(` call sites with
`grep -an "reverseInlineMarkup(" tools/cnxml-inject.js`, and at each one where `getSeg` is in
scope, map the inline-media array before passing it:

```javascript
  // §C81: resolve alt segments here so reverseInlineMarkup stays a pure text
  // transformer — the mirror of extractInlineText on the extract side.
  const resolvedInlineMedia = (structure.inlineMedia || []).map((m) => ({
    ...m,
    alt: readAlt(m.alt, getSeg),
  }));
```

and pass `resolvedInlineMedia` where `structure.inlineMedia` was passed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-inject-alt.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-alt.test.js
git commit -m "feat(C81): resolve para-inline alt at the boundary, keep the transformer pure"
```

---

### Task 8: Escaping round-trip, and the corpus control

**Files:**
- Test: `tools/__tests__/cnxml-inject-alt.test.js` (extend)
- Create: `tools/__tests__/cnxml-extract-alt-corpus.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

Two checks the unit tests above cannot make: that translated alt survives **both** render paths, and that the change does what it claims **on the real corpus** rather than on fixtures.

- [ ] **Step 1: Write the failing escaping test**

```javascript
// append to tools/__tests__/cnxml-inject-alt.test.js
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
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tools/__tests__/cnxml-inject-alt.test.js -t "escaping"`
Expected: PASS (the behaviour already holds — this pins it against future change).

- [ ] **Step 2b: All three positions in one module, in document order**

The spec requires this and no earlier task covers it — each of Tasks 2–4 exercises one position
in isolation, which would not catch two handlers fighting over ordering.

```javascript
// append to tools/__tests__/cnxml-extract-alt.test.js
import { extractSegments as extractForOrder } from '../cnxml-extract.js';

describe('all three alt positions in one module (§C81)', () => {
  it('emits three alt segments in document order', () => {
    const cnxml = `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml" module-id="m00002">
<title>T</title>
<content>
  <figure id="fig-a">
    <media id="mf" alt="Figure alt"><image src="1.png"/></media>
    <caption>Cap</caption>
  </figure>
  <para id="p1">Text <media id="mp" alt="Para alt"><image src="2.png"/></media> more.</para>
  <media id="ms" alt="Standalone alt"><image src="3.png"/></media>
</content>
</document>`;
    const { segments } = extractForOrder(cnxml);
    const alts = segments.filter((s) => s.type === 'alt');
    expect(alts.map((a) => a.text)).toEqual(['Figure alt', 'Para alt', 'Standalone alt']);
    expect(alts.map((a) => a.id)).toEqual([
      'm00002:alt:mf-alt',
      'm00002:alt:mp-alt',
      'm00002:alt:ms-alt',
    ]);
  });
});
```

Run: `npx vitest run tools/__tests__/cnxml-extract-alt.test.js -t "all three"`
Expected: PASS. **A failure here is an ordering bug between handlers, not a fixture problem.**

- [ ] **Step 2c: Render round-trip — the spec requires BOTH render paths**

Inject escaping alone does not discharge the spec's requirement; render re-escapes on two
different paths (`cnxml-render.js:1087` depth-walk, `:1149` `renderMedia`).

```javascript
// tools/__tests__/cnxml-render-alt-escaping.test.js
import { describe, it, expect } from 'vitest';
import { escapeAttr, decodeEntities } from '../cnxml-render.js';

// The two render paths take differently-provenanced input and are BOTH correct:
// :1087 receives a re-serialized node (already entity-encoded) so it decodes
// first; :1149 receives a regex parse (raw) so it must not. This pins that
// asymmetry so a future "cleanup" cannot unify them silently.
describe('§C81 alt escaping, both render paths', () => {
  it('depth-walk path: decode-then-escape yields exactly one level of encoding', () => {
    const fromSerializer = 'sýrur &amp; basar';        // already encoded
    expect(escapeAttr(decodeEntities(fromSerializer))).toBe('sýrur &amp; basar');
  });

  it('renderMedia path: escape-only yields exactly one level of encoding', () => {
    const fromRegexParse = 'sýrur & basar';            // raw
    expect(escapeAttr(fromRegexParse)).toBe('sýrur &amp; basar');
  });

  // CONTROL: applying the wrong treatment double-encodes — proves the test can fail
  it('double-encodes if the depth-walk path skips decodeEntities', () => {
    expect(escapeAttr('sýrur &amp; basar')).toBe('sýrur &amp;amp; basar');
  });
});
```

Verified against the `export { … }` block at `tools/cnxml-render.js:4111`: **neither `escapeAttr`
nor `decodeEntities` is exported today.** Add both — they are pure helpers and this is the only
way to pin the asymmetry:

```javascript
export {
  // …existing entries unchanged…
  escapeAttr,       // §C81: exported to pin the two-path escaping asymmetry
  decodeEntities,
};
```

Run: `npx vitest run tools/__tests__/cnxml-render-alt-escaping.test.js`
Expected: PASS, 3 tests — including the control, which proves the test can go red.

- [ ] **Step 3: Write the corpus control**

```javascript
// tools/__tests__/cnxml-extract-alt-corpus.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractSegments } from '../cnxml-extract.js';

// The corpus control the spec requires: on real source, alt segments must appear
// where none exist today. A green unit suite proves the fixtures work; this
// proves the change does what it claims on bytes we did not write.
const CHEM = path.join(process.cwd(), 'books/efnafraedi-2e/01-source');

describe('§C81 corpus control', () => {
  it('emits alt segments across a real chemistry chapter', () => {
    const dir = path.join(CHEM, 'ch01');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml'));
    expect(files.length).toBeGreaterThan(0); // control: the glob found something

    let altCount = 0;
    let mediaWithAlt = 0;
    for (const f of files) {
      const cnxml = fs.readFileSync(path.join(dir, f), 'utf-8');
      mediaWithAlt += (cnxml.match(/\balt="[^"]+"/g) || []).length;
      altCount += extractSegments(cnxml).segments.filter((s) => s.type === 'alt').length;
    }

    expect(mediaWithAlt).toBeGreaterThan(0);  // control: the chapter really has alt text
    expect(altCount).toBeGreaterThan(0);      // the change fires on real input
  });

  // The spec's other corpus assertion: chemistry has ZERO id-less media, so the
  // positional fallback must never fire there. If it does, either the census was
  // wrong or altElementId is being called with a missing id it should have had.
  it('produces no positional alt ids anywhere in chemistry', () => {
    const dir = path.join(CHEM, 'ch01');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml'));
    const positional = [];
    for (const f of files) {
      const cnxml = fs.readFileSync(path.join(dir, f), 'utf-8');
      for (const s of extractSegments(cnxml).segments) {
        if (s.type === 'alt' && /:alt:media-\d+-alt$/.test(s.id)) positional.push(s.id);
      }
    }
    expect(positional).toEqual([]);
  });
});
```

⚠️ **Do not weaken the second test if it fails.** A positional id in chemistry contradicts the
spec's parsed census (0 id-less), so the right response is to find out which is wrong — not to
relax the assertion.

- [ ] **Step 4: Run it**

Run: `npx vitest run tools/__tests__/cnxml-extract-alt-corpus.test.js`
Expected: PASS. **If `altCount` is 0 while `mediaWithAlt` is not, a capture site was missed — re-derive them with `grep -an "alt:" tools/cnxml-extract.js`.**

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/__tests__/cnxml-inject-alt.test.js tools/__tests__/cnxml-extract-alt-corpus.test.js
git commit -m "test(C81): escaping round-trip and a real-corpus control"
```

---

### Task 9: Verify against the whole in-scope corpus, and record the counts

**Files:**
- Create: `test-results/c81-alt-extraction-2026-08-15.json`

**Interfaces:**
- Consumes: everything above.
- Produces: the artifact §C82's fingerprint transition is measured against.

- [ ] **Step 1: Count alt segments produced across both in-scope books**

```bash
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const { extractSegments } = await import("./tools/cnxml-extract.js");
const organicIds = execSync("ls books/lifraen-efnafraedi/02-for-mt/*/m*-segments.en.md")
  .toString().trim().split("\n").map(p => p.split("/").pop().split("-segments")[0]);
const out = { generatedAt: new Date().toISOString(), books: {} };
for (const [book, ids] of [["efnafraedi-2e", null], ["lifraen-efnafraedi", organicIds]]) {
  let files = execSync(`find books/${book}/01-source -name "*.cnxml"`).toString().trim().split("\n");
  if (ids) files = files.filter(f => ids.includes(f.split("/").pop().slice(0, -6)));
  let alt = 0, modules = 0;
  for (const f of files) { alt += extractSegments(readFileSync(f, "utf8")).segments.filter(s => s.type === "alt").length; modules++; }
  out.books[book] = { modules, altSegments: alt };
  console.log(`${book}: ${modules} modules, ${alt} alt segments`);
}
writeFileSync("test-results/c81-alt-extraction-2026-08-15.json", JSON.stringify(out, null, 2) + "\n");
'
```

Expected, from the spec's parsed census: **`efnafraedi-2e` ≈ 1,149** and **`lifraen-efnafraedi` ≈ 132**.

- [ ] **Step 2: Reconcile against the spec, and treat a mismatch as a finding**

If either number differs by more than a handful, **stop and investigate rather than adjusting the expectation.** The spec's census counted `<media>` elements with a non-empty alt by parsing; a materially different count means a capture site is missing or double-firing. Record whichever is right.

- [ ] **Step 3: Run the whole suite one final time**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add test-results/c81-alt-extraction-2026-08-15.json
git commit -m "data(C81): alt-segment counts across both in-scope books"
```

---

## What this plan does NOT do

- **It does not re-extract the corpus.** §C81 ships the capability; §C80's re-extract is a separate, deliberate step batched with every other extraction-side change so there is exactly **one** fingerprint transition before the run (§C82 ①).
- **It does not touch `tools/cnxml-render.js`.** Both of its alt paths are already correct for their own inputs.
- **It does not translate anything.** No API call, no ISK.
