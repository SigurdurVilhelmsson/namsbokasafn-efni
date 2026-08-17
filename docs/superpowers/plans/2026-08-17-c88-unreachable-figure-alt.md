# §C88 — Unreachable Figure Alt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 197 chemistry figure-`alt` attributes the extractor never visits translatable end-to-end — extracted as segments **and** written back into injected output — so `altReachability`'s `unreachable` for `efnafraedi-2e` goes 197 → 0 with no translation discarded.

**Architecture:** Spec approach **A**. Two halves, and **the order is load-bearing**: first give the injector a media-id-keyed alt write-back for bare `<media>` inside preserved-verbatim containers (mirroring §C89's figure-id-keyed `applyFigureAltDom`), then add the four extractor emit points that produce those segments. Emitters first would produce 197 more segments that are extracted, translated, paid for and discarded — §C89's defect, recreated deliberately.

**Tech Stack:** Node 22.x · ESM (`tools/` is `"type": "module"`) · Vitest · `@xmldom/xmldom` for DOM work · no new dependencies.

**Spec:** [`docs/superpowers/specs/2026-08-16-c88-unreachable-figure-alt-design.md`](../specs/2026-08-16-c88-unreachable-figure-alt-design.md) — **read its `⚠️ AMENDED 2026-08-17` blocks; §6's table had two wrong cells and the amendments are what this plan implements.**

**Verification evidence:** [`test-results/c88-spec-verification-2026-08-17.md`](../../../test-results/c88-spec-verification-2026-08-17.md)

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node 22.x.** `.nvmrc` is the single source of truth. Run `nvm use` before any `npm install`.
- **`tools/` is ESM.** Root `package.json` is `"type": "module"`. A `tools/*.js` using `require`/`module.exports` cannot load. Test files use `import` for vitest.
- **🔴 `books/*/01-source/` is READ-ONLY and legally load-bearing.** Never write to it. Never re-download it.
- **🔴 NEVER run `node tools/cnxml-extract.js` against the real tree to "try something".** `--output-dir` is documented in `--help`, accepted silently, and **ignored** — the run writes into `books/` and exits 0 (§C83). Import the pure functions, or copy a module to a scratch dir first.
- **🔴 Alt substitution must be BEST-EFFORT.** Read translations through **`ctx.peekSeg`**, never `getSeg`. `getSeg` pushes misses onto `stats.segmentsMissing` and enough misses make inject **refuse the module**. §C82 keeps pre-§C81 vintages (which carry no alt segments at all) live for weeks — an absent alt translation is normal, not a defect. This is the exact bug §C89's first cut shipped.
- **🔴 NEVER construct a `<media>` element.** `deduplicateMedia` (`tools/cnxml-inject.js:4259`) keeps the **first** `<media>` by id, so a newly-built translated copy appended after a preserved English one is silently deleted — byte-for-byte §C81's Critical. **Rewrite attributes in place**, as `applyFigureAltDom` does.
- **Use `grep -a` for every census.** Committed source and doc files in this repo contain raw NUL bytes; plain `grep` reports nothing and exits 1 for a string the file demonstrably contains.
- **Pair every null/zero with a positive control in the same command.** An absence is not an answer.
- **Compare the id→TEXT mapping, never the id set** when checking seg-id stability. A set comparison reports "2 changed" where the true answer is 1,404.
- **Root `npm test` (run from the repo root) is the authoritative gate.** `npm test` is `vitest run` and does **not** run Playwright. CI also runs `npm run lint` **and** `npm run format:check`.
- **`docs-check` CI fires on `tools/**` changes.** This plan modifies `tools/`, so `npm run docs:generate` must be run and its output committed (Task 11).
- **Scope: chemistry's 197. Nothing else.** Organic is explicitly out ([LEAD] ruling, spec §2) — but see Task 10, because two code paths are book-agnostic and will move organic's pins anyway.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `tools/cnxml-inject.js` | `collectMediaAlts` (new, mirrors `collectFigureAlts`), `applyMediaAltDom` (new, mirrors `applyFigureAltDom`), `applyMediaAltString` (new, for `buildTable`'s string path), `ctx.mediaAlts` wiring, three DOM container call sites, one table call site | modify |
| `tools/cnxml-extract.js` | Four emit points: `orderedExerciseBlocks` + `emitExerciseSection`, `processExample`, `processNote`, `processTable` | modify |
| `tools/lib/extraction-coverage.js` | `altReachability`'s reachability model — `ALT_BLIND_DIRECT_PARENTS` and the `entry-not-in-figure` branch | modify |
| `tools/__tests__/cnxml-inject-media-alt.test.js` | Unit tests for the new write-back helpers | **create** |
| `tools/__tests__/cnxml-extract-bare-media-alt.test.js` | Unit tests for the four emit points | **create** |
| `tools/__tests__/alt-coverage-corpus.test.js` | Corpus pins: `reachable`/`unreachable`/reason codes | modify |
| `tools/__tests__/alt-writeback-corpus.test.js` | Sentinel pins: `emitted`/`reached`/`dropped` | modify |
| `tools/__tests__/extraction-coverage.test.js` | Five unit fixtures whose `unreachable: 1` inverts | modify |
| `tools/__tests__/cnxml-extract-alt-corpus.test.js` | Guard pins that **must not move** (`positional`, duplicate-ID, duplicate-TEXT) | verify only |

**Why the write-back helpers live in `cnxml-inject.js` and not `tools/lib/`:** `applyFigureAltDom` — the function they mirror — is module-local there, and both need `ctx`. Splitting them out would create a two-file contract for one mechanism. Follow the established pattern.

---

## Task 1: Preflight — re-confirm the extraction-vintage precondition

The spec's §8 check 3 is a **precondition**, not something to make pass: *no chemistry module may have been extracted at the §C81/§C88 vintage yet.* It measured true on 2026-08-17. **It can be falsified by anyone running an extraction**, so re-measure now rather than trusting the date.

**Files:**
- Create: `test-results/c88-preflight-vintage-<TODAY>.txt` (evidence, committed)

**Interfaces:**
- Produces: a go/no-go for the whole plan. If this fails, **STOP** — the emitters would shear `auto-N` seg-ids on already-purchased MT, and the correct response is a [LEAD] decision, not a workaround.

- [ ] **Step 1: Measure the vintage three ways, each with a positive control in the same command**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
{
for book in efnafraedi-2e lifraen-efnafraedi; do
  echo "=== $book ==="
  echo -n "  02-for-mt files with ':alt:'      (expect 0): "
  grep -rla ':alt:' books/$book/02-for-mt/ 2>/dev/null | grep -v backup | wc -l
  echo -n "  02-for-mt files with ':para:'   (CONTROL >0): "
  grep -rla ':para:' books/$book/02-for-mt/ 2>/dev/null | grep -v backup | wc -l
  echo -n "  02-mt-output files with ':alt:'   (expect 0): "
  grep -rla ':alt:' books/$book/02-mt-output/ 2>/dev/null | grep -v backup | wc -l
  echo -n "  02-mt-output files with ':para:'(CONTROL >0): "
  grep -rla ':para:' books/$book/02-mt-output/ 2>/dev/null | grep -v backup | wc -l
  echo -n '  02-structure with "alt":{  (NEW, expect 0): '
  grep -rla '"alt":[[:space:]]*{' --include='*.json' books/$book/02-structure/ 2>/dev/null | grep -v backup | wc -l
  echo -n '  02-structure with "alt":"  (CONTROL >0):    '
  grep -rla '"alt":[[:space:]]*"' --include='*.json' books/$book/02-structure/ 2>/dev/null | grep -v backup | wc -l
done
} | tee test-results/c88-preflight-vintage-$(date +%Y-%m-%d).txt
```

Expected: every "expect 0" row is **0** and every CONTROL row is **> 0**.

- [ ] **Step 2: Interpret and gate**

If any "expect 0" row is non-zero: **STOP and escalate.** Extraction has already run at the new vintage; adding emitters now shears `auto-N` ids in modules whose MT has been purchased. Record the finding in the active register and ask the lead.

If any CONTROL row is 0: **STOP** — the instrument is pointed at the wrong place (wrong path, wrong book slug, an empty tree). A clean result from a blind sweep is worthless.

- [ ] **Step 3: Commit the evidence**

```bash
git add test-results/c88-preflight-vintage-*.txt
git commit -m "chore(C88): preflight — confirm nothing is extracted at the C88 vintage"
```

---

## Task 2: Inject — bare-media alt write-back in DOM containers

**The §C89 mirror.** `collectFigureAlts` keys on **figure id**; the 197 are bare `<media>` with **no `<figure>` ancestor** (verified: 0 of 197), so a figure-keyed lookup cannot reach any of them. Add a **media-id-keyed** lookup and apply it in the three preserved-verbatim DOM containers.

**This task has a live acceptance criterion before any emitter exists:** §C89's single residual `m68801` (a bare media at `media < item < list < example`) is *already extracted* — it is inside the 952 reachable — and is currently dropped at inject. This task should make it stop being dropped.

**Files:**
- Modify: `tools/cnxml-inject.js` — new `collectMediaAlts` (beside `collectFigureAlts:1799`), new `applyMediaAltDom` (beside `applyFigureAltDom:2453`), `ctx` wiring at `:2082-2104`, call sites at `:3305`, `:3636`, `:3971`
- Create: `tools/__tests__/cnxml-inject-media-alt.test.js`
- Modify: `tools/__tests__/alt-writeback-corpus.test.js` (chemistry `dropped` pin)

**Interfaces:**
- Consumes: `ctx.peekSeg(segmentId) → string|null` (existing, `cnxml-inject.js:2099`)
- Produces:
  - `collectMediaAlts(elements: Array<object>, map: Record<string,{segmentId: string}>) → void` — mutates `map`, keyed on **media id**
  - `applyMediaAltDom(containerEl: Element, ctx: object) → number` — returns the count of alts rewritten
  - `ctx.mediaAlts: Record<string,{segmentId: string}>`

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-inject-media-alt.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
// cnxml-inject.js has NO `__testables` object — it exposes module-locals through
// a named `export { … }` block at the bottom of the file (tools/cnxml-inject.js:4795),
// which already carries buildFigure, buildMediaElement, collectTableNodes and others
// "exported for comparison testing". Step 3 adds the three new names to it.
// Task 3 extends this import with `applyMediaAltString`. Do NOT import it now —
// the binding does not exist yet and an ESM import of a missing export is a
// load-time error that fails the whole FILE, masking Task 2's real assertions.
import { collectMediaAlts, applyMediaAltDom } from '../cnxml-inject.js';

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
            { type: 'media', id: 'm-bare', alt: { segmentId: 'mod:alt:m-bare-alt', text: 'A flask' } },
          ],
        },
      ],
      map
    );
    expect(map).toEqual({ 'm-bare': { segmentId: 'mod:alt:m-bare-alt' } });
  });

  it('rewrites the alt attribute in place on a bare media inside a container', () => {
    const el = parse('<example id="ex1"><media id="m-bare" alt="A flask"><image src="a.png"/></media></example>');
    const ctx = {
      mediaAlts: { 'm-bare': { segmentId: 'mod:alt:m-bare-alt' } },
      peekSeg: (id) => (id === 'mod:alt:m-bare-alt' ? 'Kolba' : null),
    };
    expect(applyMediaAltDom(el, ctx)).toBe(1);
    expect(el.getElementsByTagName('media')[0].getAttribute('alt')).toBe('Kolba');
  });

  it('falls back to a child <image> alt when the media carries none', () => {
    const el = parse('<note id="n1"><media id="m2"><image src="a.png" alt="A flask"/></media></note>');
    const ctx = {
      mediaAlts: { m2: { segmentId: 's' } },
      peekSeg: () => 'Kolba',
    };
    expect(applyMediaAltDom(el, ctx)).toBe(1);
    expect(el.getElementsByTagName('image')[0].getAttribute('alt')).toBe('Kolba');
  });

  it('IS BEST-EFFORT: no translation leaves the English alt untouched and reports 0', () => {
    const el = parse('<example id="ex1"><media id="m-bare" alt="A flask"><image src="a.png"/></media></example>');
    const ctx = { mediaAlts: { 'm-bare': { segmentId: 's' } }, peekSeg: () => null };
    expect(applyMediaAltDom(el, ctx)).toBe(0);
    expect(el.getElementsByTagName('media')[0].getAttribute('alt')).toBe('A flask');
  });

  it('NEVER constructs a media element — the node count is unchanged', () => {
    const el = parse('<example id="ex1"><media id="m-bare" alt="A flask"><image src="a.png"/></media></example>');
    const before = el.getElementsByTagName('media').length;
    applyMediaAltDom(el, { mediaAlts: { 'm-bare': { segmentId: 's' } }, peekSeg: () => 'Kolba' });
    expect(el.getElementsByTagName('media').length).toBe(before);
  });

  it('does not touch a media whose id is absent from the map', () => {
    const el = parse('<example id="ex1"><media id="other" alt="A flask"><image src="a.png"/></media></example>');
    expect(applyMediaAltDom(el, { mediaAlts: { 'm-bare': { segmentId: 's' } }, peekSeg: () => 'Kolba' })).toBe(0);
    expect(el.getElementsByTagName('media')[0].getAttribute('alt')).toBe('A flask');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject-media-alt.test.js`
Expected: FAIL — `SyntaxError: The requested module '../cnxml-inject.js' does not provide an export named 'collectMediaAlts'`.

> That is the correct first failure. It becomes an assertion failure once Step 4a adds the names to the export block, and passes once the implementations land.

- [ ] **Step 3: Implement `collectMediaAlts`**

Add immediately after `collectFigureAlts` (ends `tools/cnxml-inject.js:1812`):

```javascript
/**
 * §C88 — recursively map every BARE `<media>` structure node's id to its alt
 * segment. The §C89 companion, `collectFigureAlts`, keys on FIGURE id and so
 * cannot reach these: all 197 chemistry instances are bare `<media>` with no
 * `<figure>` ancestor (measured 0 of 197).
 *
 * ⚠️ Keyed on the MEDIA's own id, and an id is REQUIRED here — unlike
 * collectFigureAlts, where a null mediaId legitimately means "the figure's
 * first media". A bare media has no enclosing element to anchor on, so an
 * id-less one cannot be addressed at inject and is skipped rather than guessed.
 * All 197 in scope carry an id (measured).
 *
 * @param {Array} elements structure nodes
 * @param {Record<string,{segmentId: string}>} map out-param
 */
function collectMediaAlts(elements, map) {
  for (const el of elements) {
    if (el.type === 'media' && el.id && el.alt?.segmentId) {
      map[el.id] = { segmentId: el.alt.segmentId };
    }
    if (el.content) {
      collectMediaAlts(el.content, map);
    }
  }
}
```

- [ ] **Step 4: Implement `applyMediaAltDom`**

Add immediately after `applyFigureAltDom` (ends `tools/cnxml-inject.js:2479`):

```javascript
/**
 * §C88 — write translated alt onto every BARE `<media>` inside a
 * preserved-verbatim container, before it is serialized.
 *
 * The §C89 mirror of applyFigureAltDom, keyed on MEDIA id instead of figure id.
 * Runs over the whole container subtree: a media that IS inside a `<figure>`
 * has already been handled by applyFigureAltDom, and re-writing the same value
 * is idempotent, so no ancestor test is needed.
 *
 * 🔴 Reads through ctx.peekSeg, NOT getSeg. An absent alt translation is normal
 * (§C82 keeps pre-§C81 vintages live), and getSeg would record a miss and make
 * inject REFUSE the module — §C89's first-cut defect.
 *
 * 🔴 Rewrites attributes IN PLACE and never constructs a `<media>`:
 * deduplicateMedia keeps the FIRST media by id, so an appended translated copy
 * would be silently deleted (§C81's Critical).
 *
 * @param {Element} containerEl a preserved container element (example/exercise/note)
 * @param {object} ctx build context carrying `mediaAlts` and `peekSeg`
 * @returns {number} how many alt attributes were actually rewritten
 */
function applyMediaAltDom(containerEl, ctx) {
  if (!containerEl || !ctx || !ctx.mediaAlts) return 0;
  let written = 0;
  const medias = Array.from(containerEl.getElementsByTagName('media'));
  for (const media of medias) {
    const mediaId = media.getAttribute('id');
    if (!mediaId) continue;
    const entry = ctx.mediaAlts[mediaId];
    if (!entry) continue;
    const translated = ctx.peekSeg ? ctx.peekSeg(entry.segmentId) : null;
    if (!translated) continue;

    if (media.getAttribute('alt')) {
      media.setAttribute('alt', translated);
      written++;
      continue;
    }
    const images = Array.from(media.getElementsByTagName('image'));
    for (const image of images) {
      if (image.getAttribute('alt')) {
        image.setAttribute('alt', translated);
        written++;
        break;
      }
    }
  }
  return written;
}
```

- [ ] **Step 4a: Export the new functions for testing**

`cnxml-inject.js` exposes module-locals through the named `export { … }` block at `tools/cnxml-inject.js:4795`. Add the three new names there, beside the existing `collectTableNodes` and the `// Exported for comparison testing` group:

```javascript
  collectMediaAlts, // §C88: exported for bare-media alt write-back tests
  applyMediaAltDom, // §C88
  applyMediaAltString, // §C88 (added in Task 3 — include it then, not now)
```

> Add only `collectMediaAlts` and `applyMediaAltDom` in this task; `applyMediaAltString` does not exist until Task 3, and exporting an undefined binding is a load-time error.

- [ ] **Step 5: Wire `ctx.mediaAlts`**

In `buildCnxml`, immediately after the `collectFigureAlts` pair at `tools/cnxml-inject.js:2082-2083`:

```javascript
  const mediaAlts = {};
  collectMediaAlts(structure.content, mediaAlts);
```

and add `mediaAlts,` to the `ctx` object literal (currently `figureCaptions, figureAlts, peekSeg, …` at `:2101-2104`), immediately after `figureAlts,`.

- [ ] **Step 6: Wire the three container call sites**

`buildExampleDom` — replace the block at `tools/cnxml-inject.js:3305-3310`:

```javascript
  if (ctx && ctx.figureAlts) {
    for (const fig of Array.from(exampleEl.getElementsByTagName('figure'))) {
      applyFigureAltDom(fig, ctx);
    }
  }
  // §C88 — bare <media> in this container have no <figure> to key on.
  applyMediaAltDom(exampleEl, ctx);
```

`buildExerciseDom` — the same, at `:3636-3641`, using `exerciseEl`:

```javascript
  if (ctx && ctx.figureAlts) {
    for (const fig of Array.from(exerciseEl.getElementsByTagName('figure'))) {
      applyFigureAltDom(fig, ctx);
    }
  }
  // §C88 — bare <media> in this container have no <figure> to key on.
  applyMediaAltDom(exerciseEl, ctx);
```

`buildNoteDom` — the figure loop there is inside a larger `for` over figures (`:3962-3974`). Do **not** put the media call inside that loop; add it immediately **after** the loop closes, so it runs once per note and runs even when the note has no figures:

```javascript
  // §C88 — bare <media> in this note have no <figure> to key on, so the loop
  // above never reaches them; and a note with zero figures skips that loop
  // entirely. Runs once, on the whole note subtree.
  applyMediaAltDom(noteEl, ctx);
```

- [ ] **Step 7: Run the unit test and verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-inject-media-alt.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 8: Verify the m68801 residual is gone — the corpus-level proof**

Run: `npx vitest run tools/__tests__/alt-writeback-corpus.test.js`
Expected: the chemistry test now **FAILS** on `expect(r.dropped).toEqual(['m68801'])`, reporting `dropped: []`.

> ▶ **That failure is the deliverable.** It is the only corpus-level evidence this task worked, and it exists before any emitter is written.

- [ ] **Step 9: Move the m68801 pin**

In `tools/__tests__/alt-writeback-corpus.test.js`, update the chemistry case:
- `expect(r.dropped).toEqual(['m68801'])` → `expect(r.dropped).toEqual([])`
- Update the `it(...)` title from `'chemistry: 950 of 951 alt translations survive; only m68801 does not'` to `'chemistry: all 951 alt translations survive (m68801 resolved by §C88 write-back)'`
- Update `reached` 950 → 951
- **Rewrite the comment above the pin** (it explains m68801 as a known residual) to record that §C88's bare-media write-back closed it. Do not delete the comment — it is the record of why the residual existed.

- [ ] **Step 10: Run the full suite from the repo root**

Run: `npm test`
Expected: PASS. If `alt-writeback-corpus`'s **organic** case also moved, **stop and read Task 10** — do not re-baseline it here.

- [ ] **Step 11: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-media-alt.test.js tools/__tests__/alt-writeback-corpus.test.js
git commit -m "fix(C88): media-id-keyed alt write-back for bare media in preserved containers

The §C89 mirror. collectFigureAlts keys on figure id; the 197 are bare
<media> with no <figure> ancestor (0 of 197 have one), so a figure-keyed
lookup cannot reach them.

Reads through peekSeg, never getSeg — an absent alt translation is normal
while §C82 keeps pre-§C81 vintages live, and getSeg would make inject
refuse the module. Rewrites attributes in place and never constructs a
<media>, because deduplicateMedia keeps the first by id.

Closes §C89's single residual: chemistry dropped ['m68801'] -> []."
```

---

## Task 3: Inject — table-entry alt write-back

`buildTable` is a **string/regex** path, not DOM. An empty-text entry (`cell.segmentId === null`) falls through to `return entryMatch` at `tools/cnxml-inject.js:2706` — the **verbatim source entry**, English alt and all. The 29 entry alts live there.

**Files:**
- Modify: `tools/cnxml-inject.js` — new `applyMediaAltString`, `buildTable` signature + the `entryMatch` return path
- Modify: `tools/__tests__/cnxml-inject-media-alt.test.js`

**Interfaces:**
- Consumes: `ctx.mediaAlts`, `ctx.peekSeg` (from Task 2)
- Produces: `applyMediaAltString(entryCnxml: string, ctx: object) → string`

- [ ] **Step 1: Write the failing test**

First extend the import at the top of `tools/__tests__/cnxml-inject-media-alt.test.js`:

```javascript
import { collectMediaAlts, applyMediaAltDom, applyMediaAltString } from '../cnxml-inject.js';
```

Then append:

```javascript
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
    const ctx = { mediaAlts: { 'm-cell': { segmentId: 's' } }, peekSeg: () => 'A "big" flask & more' };
    const out = applyMediaAltString(entry, ctx);
    expect(out).toContain('alt="A &quot;big&quot; flask &amp; more"');
    expect(out).not.toContain('alt="A "big"');
  });

  it('IS BEST-EFFORT: no translation returns the string byte-for-byte unchanged', () => {
    const entry = '<entry><media id="m-cell" alt="A flask"/></entry>';
    expect(applyMediaAltString(entry, { mediaAlts: { 'm-cell': { segmentId: 's' } }, peekSeg: () => null })).toBe(entry);
  });

  it('leaves an unmapped media alone', () => {
    const entry = '<entry><media id="other" alt="A flask"/></entry>';
    expect(applyMediaAltString(entry, { mediaAlts: { 'm-cell': { segmentId: 's' } }, peekSeg: () => 'Kolba' })).toBe(entry);
  });

  it('rewrites only the matching media when an entry holds two', () => {
    const entry =
      '<entry><media id="a" alt="One"/><media id="b" alt="Two"/></entry>';
    const ctx = { mediaAlts: { b: { segmentId: 's' } }, peekSeg: () => 'Tveir' };
    expect(applyMediaAltString(entry, ctx)).toBe(
      '<entry><media id="a" alt="One"/><media id="b" alt="Tveir"/></entry>'
    );
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject-media-alt.test.js -t 'table-entry'`
Expected: FAIL — `applyMediaAltString is not a function`.

- [ ] **Step 3: Implement `applyMediaAltString`**

Add immediately after `applyMediaAltDom`:

```javascript
/**
 * §C88 — the string-path twin of applyMediaAltDom, for buildTable.
 *
 * buildTable is regex/string based, and an empty-text entry falls through to
 * `return entryMatch` — the VERBATIM source entry, English alt included. The 29
 * chemistry `entry-not-in-figure` alts live exactly there.
 *
 * ⚠️ Rewrites ONLY the value of an existing alt attribute on a media whose id is
 * in the map. It never adds an attribute and never builds an element, so it
 * cannot trip deduplicateMedia and cannot change the entry's structure.
 *
 * 🔴 peekSeg, not getSeg — best-effort, see applyMediaAltDom.
 *
 * @param {string} entryCnxml verbatim `<entry>…</entry>` source
 * @param {object} ctx build context carrying `mediaAlts` and `peekSeg`
 * @returns {string} the entry with translated alt values, or the input unchanged
 */
function applyMediaAltString(entryCnxml, ctx) {
  if (!entryCnxml || !ctx || !ctx.mediaAlts) return entryCnxml;
  return entryCnxml.replace(/<media\b[^>]*>/g, (openTag) => {
    const idMatch = openTag.match(/\bid="([^"]*)"/);
    if (!idMatch) return openTag;
    const entry = ctx.mediaAlts[idMatch[1]];
    if (!entry) return openTag;
    const translated = ctx.peekSeg ? ctx.peekSeg(entry.segmentId) : null;
    if (!translated) return openTag;
    if (!/\balt="/.test(openTag)) return openTag;
    const escaped = String(translated)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return openTag.replace(/\balt="[^"]*"/, `alt="${escaped}"`);
  });
}
```

> **Why the `&` replacement runs first:** replacing `"` before `&` would then re-escape the `&` in `&quot;`, producing `&amp;quot;`. The order above is the only correct one.

Then add `applyMediaAltString,` to the named `export { … }` block at `tools/cnxml-inject.js:4795`, beside the two added in Task 2 Step 4a.

- [ ] **Step 4: Route `buildTable`'s verbatim return through it**

`buildTable`'s signature is `buildTable(element, getSeg, originalCnxml, tableCellGaps)` and it has three call sites. Rather than thread a fifth parameter through all of them, pass `ctx` and read `tableCellGaps` from it — **no**: that changes three call sites' semantics. **Add a fifth optional parameter instead**, which is additive and cannot break an existing caller:

Change the signature at `tools/cnxml-inject.js:2623`:

```javascript
function buildTable(element, getSeg, originalCnxml, tableCellGaps, ctx = null) {
```

Change the fall-through return at `:2705-2706`:

```javascript
                cellIdx++;
                // §C88 — this is the VERBATIM source entry (empty-text cell, or a
                // cell whose translation is missing). Any bare <media> in it still
                // carries its English alt; rewrite it in place before returning.
                return applyMediaAltString(entryMatch, ctx);
```

Then update the three `buildTable(...)` call sites to pass `ctx`:

```bash
grep -an "buildTable(" tools/cnxml-inject.js
```

- `buildElement`'s `case 'table':` (~`:2296`) → `buildTable(element, getSeg, originalCnxml, ctx && ctx.tableCellGaps, ctx)`
- `expandInlineTables` (~`:2790`) → `buildTable(tableData.structure, getSeg, originalCnxml, ctx.tableCellGaps, ctx)`
- the third site → same pattern; read it and pass whatever `ctx` is in scope, or `null` if none is.

- [ ] **Step 5: Run the unit test and verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-inject-media-alt.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-media-alt.test.js
git commit -m "fix(C88): alt write-back for bare media in verbatim table entries

buildTable is a string path; an empty-text entry falls through to
'return entryMatch' — the verbatim source entry, English alt included.
The 29 entry-not-in-figure alts live there. Rewrites only an existing
alt value on an id-matched media; never adds an attribute, never builds
an element, best-effort via peekSeg."
```

---

## Task 4: Extract — bare media in `<problem>`/`<solution>` (53 alts)

🔴 **The finding the verification gate exists for.** The spec's original table named `processExercise → orderedExerciseBlocks`; the real chain is `processExercise → **emitExerciseSection** → orderedExerciseBlocks`. Patching only `orderedExerciseBlocks` is a **corpus-wide no-op** (measured: alt delta 0, 0 modules changed) that fails silently with every count-based gate green.

**Files:**
- Modify: `tools/cnxml-extract.js` — `orderedExerciseBlocks:1650`, `emitExerciseSection:1688`
- Create: `tools/__tests__/cnxml-extract-bare-media-alt.test.js`

**Interfaces:**
- Consumes: `addSegment(type, text, elementId) → string|null`, `altElementId(mediaId, index, kind)` (from `tools/lib/alt-segments.js`, already imported at `cnxml-extract.js:42`)
- Produces: an `orderedExerciseBlocks` return whose entries may be `{kind: 'media', el, start}`; a structure `content` entry `{type: 'media', id, alt: {segmentId, text}}`

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-extract-bare-media-alt.test.js`:

```javascript
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
    const r = extractSegments(
      wrap(`<exercise id="ex1"><problem id="p1">
             <para id="pA">Text <media id="m-inline" alt="Inline"/> more.</para>
           </problem></exercise>`)
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['Inline']);
  });
});
```

> ⚠️ **Check `extractSegments`'s real signature and return shape before running** (`sed -n '677,700p' tools/cnxml-extract.js`). If it takes `(cnxml, options)` with a different option key than `moduleId`, or returns `{segments, structure}` under different names, fix the harness — **not the assertions**.

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-bare-media-alt.test.js -t 'problem'`
Expected: FAIL — `altSegs(r)` is `[]`, expected `['A titration setup']`.

> 🔴 **This failure is what proves the test discriminates.** A regression test is not verified until it has been run against the broken code.

- [ ] **Step 3: Add the `media` kind to `orderedExerciseBlocks`**

In `tools/cnxml-extract.js:1650-1674`, after the `for (const el of lists)` loop and before `blocks.sort(...)`:

```javascript
  // §C88 — a bare <media> that is a SIBLING of the paras. Same nesting rule as
  // lists: a media inside a para belongs to that para (extractInlineText already
  // captures it via the [[MEDIA:N]] placeholder), so only top-level ones become
  // their own block.
  let mcur = 0;
  for (const el of extractElements(inner, 'media')) {
    const start = inner.indexOf(el.fullMatch, mcur);
    mcur = start + el.fullMatch.length;
    const nested = paraSpans.some((p) => start > p.start && start < p.end);
    if (!nested) blocks.push({ kind: 'media', el, start });
  }
```

Also update the JSDoc `@returns` at `:1648` from
`{Array<{kind:'para'|'list', el:object}>}` to
`{Array<{kind:'para'|'list'|'media', el:object}>}`.

> ⚠️ Use `extractElements` (shallow), not `extractNestedElements` — a media inside a sibling `<list>`'s `<item>` is `processList`'s to capture, and taking it here would double-emit.

- [ ] **Step 4: Add the consumer branch in `emitExerciseSection` — the half the spec omitted**

In `tools/cnxml-extract.js`, inside the `for (const block of orderedExerciseBlocks(inner))` loop at `:1704`, immediately after the existing `if (block.kind === 'list')` branch:

```javascript
    if (block.kind === 'media') {
      // §C88 — a bare <media> here is reached by NO other walk: the para branch
      // below passes `.content`, so a media block would fall through it, toText
      // would return '' and it would be dropped silently. Emit directly.
      //
      // 🔴 The structure entry is NOT optional. Emitting the alt segment without
      // one recreates §C89: extracted, translated, paid for, nowhere to land.
      const mediaEl = block.el;
      const altText = mediaEl.attributes.alt || (mediaEl.content.match(/<image[^>]*\balt="([^"]*)"/) || [])[1] || '';
      counters.exerciseMedia = (counters.exerciseMedia || 0) + 1;
      const altSegId = altText
        ? addSegment('alt', altText, altElementId(mediaEl.id, counters.exerciseMedia, 'exercise-media'))
        : null;
      content.push({
        type: 'media',
        id: mediaEl.id,
        alt: altSegId ? { segmentId: altSegId, text: altText } : undefined,
      });
      continue;
    }
```

> **Why its own counter (`counters.exerciseMedia`) and its own `kind`:** `counters.media` belongs to `extractInlineText` and also builds the `[[MEDIA:N]]` placeholder embedded in paragraph text — incrementing it here would renumber every later inline placeholder and break the placeholder↔structure join at inject. The distinct `kind` keeps the two id namespaces from colliding at the same index. This mirrors the `'standalone'` precedent at `:1339-1343`.

- [ ] **Step 5: Run the unit test and verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract-bare-media-alt.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 6: Prove the corpus effect is 53 across 24 modules**

Create `/tmp/claude-1000/.../scratchpad/c88-t4-count.mjs` (scratch, not committed):

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { extractSegments } from './tools/cnxml-extract.js';

const root = 'books/efnafraedi-2e/01-source';
let total = 0;
const mods = new Set();
for (const dir of fs.readdirSync(root)) {
  const d = path.join(root, dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.cnxml')) continue;
    const id = f.replace(/\.cnxml$/, '');
    const r = extractSegments(fs.readFileSync(path.join(d, f), 'utf8'), { moduleId: id });
    const n = r.segments.filter((s) => s.type === 'alt' && /:alt:/.test(s.id)).length;
    if (n) { total += n; mods.add(id); }
  }
}
console.log('alt segments:', total, 'modules:', mods.size);
```

Run it **before** and **after** this task's change (via `git stash`) and diff the two numbers.
Expected: the delta is **+53 alt segments across 24 modules**.

> ⚠️ If the delta is **0**, you patched only `orderedExerciseBlocks` — Step 4 did not land. That is precisely the silent no-op this task exists to avoid.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: the corpus alt pins in `alt-coverage-corpus.test.js` / `alt-writeback-corpus.test.js` now fail with **higher** numbers. **Do not move them yet** — Task 9 moves all pins at once, after every emitter is in, so the pins are set from one measurement rather than four.

- [ ] **Step 8: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-bare-media-alt.test.js
git commit -m "feat(C88): emit alt for bare media in <problem>/<solution> (53 alts, 24 modules)

The emit point spans TWO functions. Patching orderedExerciseBlocks alone
is a corpus-wide no-op: the media block reaches the consumer, falls
through the para branch, toText returns '' and it is dropped silently
with every count-based gate green.

The consumer branch in emitExerciseSection also pushes a structure entry
— without one the translation has nowhere to land at inject, which is
§C89 recreated. Own counter + own id kind so counters.media (which builds
the [[MEDIA:N]] placeholder) is untouched.

Corpus pins deliberately left red; Task 9 moves them from one measurement."
```

---

## Task 5: Extract — bare media in `<example>` (105 alts)

The largest single population. `processExample` extracts paras, lists, equations and notes; `processTopLevelContent` strips `example.fullMatch` before the standalone-media scan, so nothing else reaches these.

**Files:**
- Modify: `tools/cnxml-extract.js` — `processExample:1485`
- Modify: `tools/__tests__/cnxml-extract-bare-media-alt.test.js`

**Interfaces:**
- Consumes: `addSegment`, `altElementId`, `extractElements`
- Produces: `{type: 'media', id, alt: {segmentId, text}}` entries in `exampleStructure.content`

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/cnxml-extract-bare-media-alt.test.js`:

```javascript
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

  it('does not double-emit a media that is inside a nested <list> (processList owns it)', () => {
    const r = extractSegments(
      wrap(`<example id="ex1">
             <list id="l1"><item id="i1"><media id="m-in-list" alt="In a list"/></item></list>
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
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-bare-media-alt.test.js -t 'in <example>'`
Expected: FAIL — first two tests return `[]`.

> The two "does not double-emit" tests are expected to **pass already**. That is deliberate: they are the guard that Step 3 does not over-reach.

- [ ] **Step 3: Add the media pass to `processExample`**

In `tools/cnxml-extract.js`, immediately after the lists loop (ends `:1613`) and **before** the equations loop at `:1615`:

```javascript
  // §C88 — bare <media> that is a DIRECT child of this example. Reached by no
  // other walk: processTopLevelContent strips example.fullMatch before its
  // standalone-media scan, and the para loop above only sees media INSIDE a
  // <para> (via extractInlineText's [[MEDIA:N]] placeholder).
  //
  // Uses the STRIP IDIOM so a media nested in a <list>/<note>/<para> is not
  // taken twice — those walks own their own copies.
  let exampleBareContent = example.content;
  for (const list of lists) exampleBareContent = exampleBareContent.replace(list.fullMatch, '');
  for (const para of paras) exampleBareContent = exampleBareContent.replace(para.fullMatch, '');
  for (const note of extractNestedElements(example.content, 'note')) {
    exampleBareContent = exampleBareContent.replace(note.fullMatch, '');
  }
  for (const media of extractElements(exampleBareContent, 'media')) {
    const altText =
      media.attributes.alt || (media.content.match(/<image[^>]*\balt="([^"]*)"/) || [])[1] || '';
    if (!altText) continue;
    counters.exampleMedia = (counters.exampleMedia || 0) + 1;
    const altSegId = addSegment(
      'alt',
      altText,
      altElementId(media.id, counters.exampleMedia, 'example-media')
    );
    exampleStructure.content.push({
      type: 'media',
      id: media.id,
      alt: altSegId ? { segmentId: altSegId, text: altText } : undefined,
    });
  }
```

> ⚠️ The strip must remove **notes too**, and it must run before the notes loop at `:1625` mutates nothing — stripping from a *local copy* (`exampleBareContent`) leaves `example.content` intact for the loops that follow. Do not strip from `example.content` itself.

- [ ] **Step 4: Run the unit test and verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract-bare-media-alt.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Measure the corpus delta**

Re-run the counting script from Task 4 Step 6, comparing against the post-Task-4 baseline.
Expected: **+105 alt segments across 33 modules**.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-bare-media-alt.test.js
git commit -m "feat(C88): emit alt for bare media directly inside <example> (105 alts, 33 modules)

processTopLevelContent strips example.fullMatch before its standalone-media
scan, so nothing else reaches these. Uses the strip idiom against a LOCAL
copy so media owned by a nested list/note/para are not taken twice."
```

---

## Task 6: Extract — bare media in `<note>` (10 alts)

**⚠️ 9 of the 10 are notes nested inside `<example>`**, reached through the **5-argument** `processNote` call at `tools/cnxml-extract.js:1627` — which passes no `inlineMediaMap`. Anything routed through `inlineMediaMap` therefore misses 9 of 10. A direct `addSegment` works at both call sites.

**Files:**
- Modify: `tools/cnxml-extract.js` — `processNote:1806`
- Modify: `tools/__tests__/cnxml-extract-bare-media-alt.test.js`

**Interfaces:**
- Consumes: `addSegment`, `altElementId`, `extractElements`
- Produces: `{type: 'media', id, alt: {segmentId, text}}` entries in `noteStructure.content`

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/cnxml-extract-bare-media-alt.test.js`:

```javascript
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
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-bare-media-alt.test.js -t 'in <note>'`
Expected: FAIL, all three, returning `[]`.

> The second test is the one that matters. If it passes while the others fail, the implementation was routed through `inlineMediaMap` and covers only 1 of 10 in the real corpus.

- [ ] **Step 3: Add the media scan to `processNote`**

In `tools/cnxml-extract.js`, immediately after the lists loop (ends `:1865`) and before `return noteStructure;` at `:1867`:

```javascript
  // §C88 — bare <media> that is a direct child of this note.
  //
  // 🔴 A DIRECT addSegment, deliberately NOT routed through inlineMediaMap:
  // 9 of the 10 corpus instances are notes nested inside <example>, reached
  // through the 5-ARG processNote call at the example's notes loop, which
  // passes no inlineMediaMap at all. Routing through it would silently cover
  // 1 of 10.
  let noteBareContent = note.content;
  for (const para of paras) noteBareContent = noteBareContent.replace(para.fullMatch, '');
  for (const list of lists) noteBareContent = noteBareContent.replace(list.fullMatch, '');
  for (const media of extractElements(noteBareContent, 'media')) {
    const altText =
      media.attributes.alt || (media.content.match(/<image[^>]*\balt="([^"]*)"/) || [])[1] || '';
    if (!altText) continue;
    counters.noteMedia = (counters.noteMedia || 0) + 1;
    const altSegId = addSegment(
      'alt',
      altText,
      altElementId(media.id, counters.noteMedia, 'note-media')
    );
    noteStructure.content.push({
      type: 'media',
      id: media.id,
      alt: altSegId ? { segmentId: altSegId, text: altText } : undefined,
    });
  }
```

- [ ] **Step 4: Run the unit test and verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract-bare-media-alt.test.js`
Expected: PASS, 14 tests.

- [ ] **Step 5: Measure the corpus delta**

Re-run the Task 4 Step 6 script.
Expected: **+10 alt segments across 7 modules**.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract-bare-media-alt.test.js
git commit -m "feat(C88): emit alt for bare media inside <note> (10 alts, 7 modules)

Direct addSegment, deliberately not routed through inlineMediaMap: 9 of
the 10 are notes nested inside <example>, reached through the 5-arg
processNote call that passes no inlineMediaMap — routing through it would
cover 1 of 10."
```

---

## Task 7: Extract — bare media in table `<entry>` (29 alts)

`processTable` **does** walk these — but it calls `extractInlineText` without `inlineMediaMap`, so the media is stripped and `text` is `''`. Control then reaches the **else** branch at `tools/cnxml-extract.js:1465-1467`, which pushes `{segmentId: null}` **without ever calling `addSegment`**.

⚠️ **There is an `addSegment('entry', …)` at `:1447`, in the multi-para branch. It is 0/29 for this population.** Do not wire the emit there.

**Files:**
- Modify: `tools/cnxml-extract.js` — `processTable:1422`, the single-content else branch at `:1465-1467`
- Modify: `tools/__tests__/cnxml-extract-bare-media-alt.test.js`

**Interfaces:**
- Consumes: `addSegment`, `altElementId`, `extractElements`
- Produces: an `alt` key on the cell object: `{segmentId: null, attributes, alt: {segmentId, text}}`

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/cnxml-extract-bare-media-alt.test.js`:

```javascript
describe('§C88 — bare media alt in a table <entry>', () => {
  const table = (cell) =>
    wrap(`<table id="t1" summary="s"><tgroup cols="1"><tbody>
           <row>${cell}</row>
         </tbody></tgroup></table>`);

  it('emits an alt segment for a media in an otherwise-empty entry', () => {
    const r = extractSegments(
      table('<entry><media id="m-cell" alt="A structural formula"/></entry>')
    );
    expect(altSegs(r).map((s) => s.text)).toEqual(['A structural formula']);
    expect(altSegs(r)[0].id).toBe('m00001:alt:m-cell-alt');
  });

  it('records the alt on the cell so inject can find it', () => {
    const r = extractSegments(
      table('<entry><media id="m-cell" alt="A structural formula"/></entry>')
    );
    const t = r.structure.content.find((e) => e.type === 'table');
    const cell = t.rows[0].cells[0];
    expect(cell.segmentId).toBeNull();
    expect(cell.alt).toEqual({ segmentId: 'm00001:alt:m-cell-alt', text: 'A structural formula' });
  });

  it('POSITIVE CONTROL — a text cell still emits its entry segment and no alt', () => {
    const r = extractSegments(table('<entry>Melting point</entry>'));
    expect(altSegs(r)).toEqual([]);
    expect(r.segments.filter((s) => s.type === 'entry').map((s) => s.text)).toEqual(['Melting point']);
  });

  it('a genuinely blank entry still produces no alt and no crash', () => {
    const r = extractSegments(table('<entry></entry>'));
    expect(altSegs(r)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract-bare-media-alt.test.js -t 'table <entry>'`
Expected: FAIL on the first two; the two controls PASS.

- [ ] **Step 3: Emit in the else branch**

In `tools/cnxml-extract.js`, replace the else branch at `:1465-1467`:

```javascript
        } else {
          // §C88 — text is '' because extractInlineText stripped a <media> (this
          // call passes no inlineMediaMap). The entry is discarded here, and with
          // it the media's alt — 29 chemistry instances.
          //
          // ⚠️ NOT wired to the addSegment at the multi-para branch above: that
          // branch is 0/29 for this population. Emit here, where the empty text
          // is discarded.
          const cell = { segmentId: null, attributes: entry.attributes };
          for (const media of extractElements(entry.content, 'media')) {
            const altText =
              media.attributes.alt ||
              (media.content.match(/<image[^>]*\balt="([^"]*)"/) || [])[1] ||
              '';
            if (!altText) continue;
            counters.entryMedia = (counters.entryMedia || 0) + 1;
            const altSegId = addSegment(
              'alt',
              altText,
              altElementId(media.id, counters.entryMedia, 'entry-media')
            );
            if (altSegId) cell.alt = { segmentId: altSegId, text: altText };
          }
          rowStructure.cells.push(cell);
        }
```

> **Only the FIRST alt-bearing media in a cell is recorded on `cell.alt`.** The inject-side `applyMediaAltString` keys on media id from `ctx.mediaAlts`, which `collectMediaAlts` builds from `{type:'media'}` structure nodes — and a cell is not one. **If a chemistry entry ever holds two alt-bearing media, the second's translation is emitted but unreachable at inject.** Measure before assuming it cannot: `grep -ac` is not enough — parse. If the count is 0, add a comment saying so and move on; if it is non-zero, promote `cell.alt` to `cell.alts[]` and have `collectMediaAlts` walk table cells.

- [ ] **Step 4: Teach `collectMediaAlts` about table cells**

`collectMediaAlts` (Task 2) walks `el.content`; a table's media alts live on `el.rows[].cells[].alt`. Extend it in `tools/cnxml-inject.js`:

```javascript
    if (el.type === 'table' && Array.isArray(el.rows)) {
      for (const row of el.rows) {
        for (const cell of row.cells || []) {
          // §C88 — a table cell is not a {type:'media'} node, so the branch above
          // never sees it. The cell records the media's OWN id via the seg-id, so
          // recover the key from the segment id's element part.
          if (cell && cell.alt?.segmentId && cell.alt.mediaId) {
            map[cell.alt.mediaId] = { segmentId: cell.alt.segmentId };
          }
        }
      }
    }
```

and add `mediaId: media.id` to the `cell.alt` object written in Step 3:

```javascript
            if (altSegId) cell.alt = { segmentId: altSegId, text: altText, mediaId: media.id };
```

> **Why carry `mediaId` explicitly rather than parse it out of the seg-id:** the seg-id is `${moduleId}:alt:${mediaId}-alt` only when the media has an id; the id-less fallback is `entry-media-N-alt`, from which no media id can be recovered. Parsing would work for chemistry and silently produce a wrong key for organic. Carry the value.

- [ ] **Step 5: Add the inject-side test for the table path**

Append to `tools/__tests__/cnxml-inject-media-alt.test.js`:

```javascript
  it('§C88 — collects a table cell media alt keyed on the media id', () => {
    const map = {};
    collectMediaAlts(
      [
        {
          type: 'table',
          id: 't1',
          rows: [{ cells: [{ segmentId: null, alt: { segmentId: 'mod:alt:m-cell-alt', text: 'X', mediaId: 'm-cell' } }] }],
        },
      ],
      map
    );
    expect(map).toEqual({ 'm-cell': { segmentId: 'mod:alt:m-cell-alt' } });
  });
```

- [ ] **Step 6: Run both unit files and verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-extract-bare-media-alt.test.js tools/__tests__/cnxml-inject-media-alt.test.js`
Expected: PASS.

- [ ] **Step 7: Measure the corpus delta**

Re-run the Task 4 Step 6 script.
Expected: **+29 alt segments across 2 modules**, and the cumulative delta from the Task 1 baseline is now **+197**.

- [ ] **Step 8: Commit**

```bash
git add tools/cnxml-extract.js tools/cnxml-inject.js tools/__tests__/cnxml-extract-bare-media-alt.test.js tools/__tests__/cnxml-inject-media-alt.test.js
git commit -m "feat(C88): emit alt for bare media in table entries (29 alts, 2 modules)

Emitted in the single-content ELSE branch, where the empty text is
discarded — NOT at the addSegment in the multi-para branch, which is
0/29 for this population. The cell carries mediaId explicitly so
collectMediaAlts can key on it without parsing a seg-id whose id-less
fallback form carries no media id.

Cumulative: all 197 now emit."
```

---

## Task 8: Update the reachability model

`altReachability` is what E5 gates on. C88 makes all five reason codes reachable, so the model must change **in the same branch** or E5 goes red corpus-wide.

**Files:**
- Modify: `tools/lib/extraction-coverage.js` — `ALT_BLIND_DIRECT_PARENTS:181`, `altReachability:236`, and the comment above `:178`
- Modify: `tools/__tests__/extraction-coverage.test.js`

**Interfaces:**
- Produces: `altReachability(content) → {reachable, unreachable, unreachableByReason}` where chemistry's `unreachable` is now 0

- [ ] **Step 1: Update the five unit fixtures first (they define the new contract)**

In `tools/__tests__/extraction-coverage.test.js`, the fixtures at `:207-208`, `:219-234` and `:279` each assert `unreachable: 1` for one of the five positions. Invert each to `unreachable: 0` and `reachable: 1`, and change `{reached: 2, expected: 2, unreached: 1}` at `:279` to `{reached: 3, expected: 3, unreached: 0}`. Update the `describe` title at `:194` so it no longer claims these positions are blind.

- [ ] **Step 2: Run and verify they fail**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: FAIL — the fixtures expect `unreachable: 0`, the code still returns 1.

- [ ] **Step 3: Empty the blind set and drop the entry branch**

In `tools/lib/extraction-coverage.js`, replace `:181`:

```javascript
/**
 * §C88 — EMPTY as of 2026-08-17. These four were the positions `cnxml-extract`
 * never visited for a bare `<media>`; §C88 added an emitter for each, so a bare
 * media in an <example>/<problem>/<solution>/<note> is now captured.
 *
 * Kept as an (empty) named set rather than deleted, because the reachability
 * model still needs a place to name a NEW blind parent if a future intake
 * introduces one — and because deleting it would silently drop the concept from
 * the file that owns it.
 */
const ALT_BLIND_DIRECT_PARENTS = new Set([]);
```

and in `altReachability` at `:246-252`, remove the `entry-not-in-figure` branch (§C88 emits those too), leaving:

```javascript
    const inFigure = hasAncestor(el, 'figure');
    let reason = null;
    if (!inFigure) {
      const parent = el.parentNode;
      const pName = parent && parent.nodeType === 1 ? parent.localName : null;
      if (pName && ALT_BLIND_DIRECT_PARENTS.has(pName)) reason = `bare-media-in-${pName}`;
    }
```

- [ ] **Step 4: Re-derive the 🔴 `'exercise'` comment above `:178`**

That comment warns **not** to add `'exercise'` to the set, reasoning from `1149 = 952 + 197` reconciling exactly with no slack. **That reconciliation no longer holds** — it is now `1149 = 1149 + 0`. Read the comment, and rewrite it to state the post-C88 reasoning, or delete it and say in the commit message why. **Do not carry it forward unexamined** — the spec explicitly instructs re-deriving it.

- [ ] **Step 5: Run and verify the fixtures pass**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/extraction-coverage.js tools/__tests__/extraction-coverage.test.js
git commit -m "feat(C88): the reachability model — all five positions are now reachable

ALT_BLIND_DIRECT_PARENTS is empty and the entry-not-in-figure branch is
gone: §C88 emits for all five. Kept as an empty named set so a future
blind parent has a home. The 'exercise' warning comment reasoned from
1149 = 952 + 197 with no slack; that reconciliation is now 1149 = 1149 + 0
and the comment is re-derived, not carried forward."
```

---

## Task 9: Move the corpus pins, from one measurement

All emitters are in. Set every moved pin from a single corpus run so the numbers are mutually consistent, rather than four times from four partial states.

**Files:**
- Modify: `tools/__tests__/alt-coverage-corpus.test.js` (`:45,46,51-57,91-93`)
- Modify: `tools/__tests__/alt-writeback-corpus.test.js` (`:77,78,87`)
- Verify only (must NOT move): `tools/__tests__/cnxml-extract-alt-corpus.test.js:94,124,143,167`; `tools/__tests__/inject-roundtrip-corpus.test.js:134-139`

- [ ] **Step 1: Run the corpus tests and capture the actual numbers**

Run: `npx vitest run tools/__tests__/alt-coverage-corpus.test.js tools/__tests__/alt-writeback-corpus.test.js 2>&1 | tee /tmp/c88-pins.txt`
Read the reported actuals. **Do not guess** — the spec's `~1,148` is approximate because `m68727`'s regex-truncation drop sits between reachable and emitted.

- [ ] **Step 2: Set the pins to the measured values**

`alt-coverage-corpus.test.js`:
- `:45` `reachable` 952 → **1,149**
- `:46` `unreachable` 197 → **0**
- `:51-57` the five-key reason `toEqual` → `{}`
- `:91-93` `reachableTotal` → 1,149 · `emittedTotal` → the measured value · shortfall stays `[{module: 'm68727', …}]` with its pair updated
- `:40,47` (149 modules, 1,149 total) — **must NOT change.** If either moved, stop: something other than C88 shifted.

`alt-writeback-corpus.test.js`:
- `:77,78` chemistry `emitted` / `reached` → the measured values (they should be equal)
- `:87` `dropped` — already `[]` from Task 2

- [ ] **Step 3: Verify the must-not-move pins are still green**

Run: `npx vitest run tools/__tests__/cnxml-extract-alt-corpus.test.js tools/__tests__/inject-roundtrip-corpus.test.js`
Expected: PASS, untouched.

- If `:94` (`positional` must stay `[]`) went red: an emitter is minting positional ids for **chemistry**, which should be impossible — all 197 carry ids. Find which.
- If `:167` (organic duplicate-alt-**TEXT**) went red: that is hazard ⓑ. **Go to Task 10; do not re-baseline it here.**

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, except possibly organic pins → Task 10.

- [ ] **Step 5: Commit**

```bash
git add tools/__tests__/alt-coverage-corpus.test.js tools/__tests__/alt-writeback-corpus.test.js
git commit -m "test(C88): move the corpus alt pins from one measurement

chemistry reachable 952 -> 1,149, unreachable 197 -> 0, reason codes -> {}.
Set from a single corpus run so the numbers are mutually consistent."
```

---

## Task 10: The organic scope decision (hazards ⓐ and ⓑ)

**§2 scopes C88 to chemistry, but two of the four emit points are book-agnostic.** `processTable` and `processExample` run over whatever module they are handed, and the corpus sweeps run the live extractor over all **342** organic source modules — not just the 17 with committed segments. This is a decision, not a bug: **make it explicitly, and say so in the PR.**

**Files:**
- Modify: `tools/__tests__/alt-writeback-corpus.test.js:101-103` (organic pin) — *or* `tools/cnxml-extract.js`, depending on the decision
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (log the outcome)

- [ ] **Step 1: Measure what actually moved for organic**

Run: `npx vitest run tools/__tests__/alt-writeback-corpus.test.js tools/__tests__/cnxml-extract-alt-corpus.test.js 2>&1 | tee /tmp/c88-organic.txt`
Record: organic `emitted`, `reached`, `dropped`, and whether the duplicate-alt-**TEXT** pin at `:167` moved.

- [ ] **Step 2: Take the decision**

Two options. **Both are defensible; pick one and record why.**

**(a) Let organic move.** The emitters are generic, organic gets the same fix for free, and the write-back covers it. Cost: organic's 245 entry alts are **0-of-245 id-bearing**, so the entry emitter mints **id-less** `entry-media-N-alt` segments there — which `collectMediaAlts` **cannot key on** (it requires an id). Those segments would be extracted and then unreachable at inject: **§C89's shape again, for organic.** If you choose (a), you must also handle id-less bare media at inject, which is a real extension, not a pin move.

**(b) Scope the entry emitter.** Emit only when the media has an id, so id-less organic entries produce nothing. This keeps C88 to its ruled scope and avoids minting unreachable segments. Add to the Task 7 code:

```javascript
            if (!media.id) continue; // §C88 scope: an id-less bare media cannot be
            // addressed at inject (collectMediaAlts keys on media id), so emitting
            // its alt would extract and pay for a translation with nowhere to land.
            // Organic's 245 entry alts are 0-of-245 id-bearing — see spec §7 hazard ⓑ.
```

> **Recommendation: (b).** It is the smaller diff, it honours the [LEAD] scope ruling, and it refuses to create the exact defect §C89 was opened for. (a) can be taken later as its own item with its own decision.

- [ ] **Step 3: Implement the decision and re-run**

Run: `npm test`
Expected: PASS with the organic pins either deliberately moved (a) or unmoved (b).

- [ ] **Step 4: Log it to the active register**

Add to `docs/plans/2026-07-21-post-item17-followup-campaign.md`'s §C88 entry: the decision taken, the measured organic numbers, and — if (b) — that organic's 245 entry alts remain unreached and why that is deliberate. **Do not put this only in a commit message.**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(C88): scope decision for organic's id-less entry media

<state (a) or (b), the measured numbers, and the reason>"
```

---

## Task 11: Acceptance gate, generated docs, and final verification

**Files:**
- Create: `test-results/c88-acceptance-<TODAY>.txt`
- Modify: `docs/_generated/**` (via `npm run docs:generate`)
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md`

- [ ] **Step 1: Gate check 1 — coverage rose, stated as a delta**

Run the corpus coverage test and record: chemistry `unreachable` **197 → 0**, `reachable` **952 → 1,149**.

⚠️ **State it as a delta, not "1,149 of 1,149 emitted".** One pre-existing shortfall sits between reachable and emitted — `m68727`'s regex-truncation drop (6→5) — and it is not C88's to close. (§C87 ①, the *other* shortfall the spec named, contributes **zero** and is structurally unable to fire on this corpus.)

- [ ] **Step 2: Gate check 2 — the translations SURVIVE**

Run: `npx vitest run tools/__tests__/alt-writeback-corpus.test.js`
Confirm: chemistry `reached` rose by the number of newly-emitted alt segments; `dropped` is `[]`; **no module newly appears** in `dropped`.

> ▶ **Check 1 without check 2 is precisely the §C89 defect** — more segments extracted, more discarded, more money spent, no reader benefit.

- [ ] **Step 3: Positive control for both**

Confirm the in-`<para>` (214) and standalone (110) positions are still at ~100%. A sweep that examined nothing reports clean.

- [ ] **Step 4: Re-run the preflight — the precondition must STILL hold**

Re-run Task 1 Step 1's command. Every "expect 0" must still be 0.

> If someone extracted a module while this branch was in progress, the `auto-N` ids they froze are now sheared by these emitters. That is a [LEAD] escalation, not something to fix here.

- [ ] **Step 5: Regenerate docs — `docs-check` CI fires on `tools/**`**

Run: `npm run docs:generate`
Then: `git status --porcelain docs/_generated/` — commit anything it produced. A dirty `docs/_generated/` fails the `check-docs` job.

- [ ] **Step 6: Run the real gates, all of them**

```bash
npm test          # vitest — the authoritative gate; run from the repo root
npm run lint      # eslint tools/ scripts/
npm run format:check   # prettier — CI runs this too, and `lint` alone does not
```

Expected: all three clean. **A green `npm test` is not evidence about lint or format** — CI runs both.

- [ ] **Step 7: Write the acceptance evidence**

```bash
{
  echo "§C88 acceptance — $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "check 1 (coverage delta): unreachable 197 -> 0 ; reachable 952 -> 1,149"
  echo "check 2 (survival):       reached <before> -> <after> ; dropped []"
  echo "positive control:         in-para 214 and standalone 110 unchanged at ~100%"
  echo "precondition re-check:    <paste the preflight output>"
} > test-results/c88-acceptance-$(date +%Y-%m-%d).txt
```

- [ ] **Step 8: Update the active register**

In `docs/plans/2026-07-21-post-item17-followup-campaign.md`: mark §C88 done in its ⏩ RESUME block, name the successor, and record the two spec defects the verification gate caught. **The register is the one owner of open work** — no status verbs go anywhere else.

- [ ] **Step 9: Commit and open the PR**

```bash
git add -A
git commit -m "docs(C88): acceptance evidence, generated docs, register update"
git push -u origin feat/c88-unreachable-figure-alt
gh pr create --title "§C88 — reach the 197 unreachable chemistry figure-alt attributes" --body "<summary>"
```

> ⚠️ **Before pushing:** `git fetch origin` first. A stale ref after a previous `gh pr merge --delete-branch` has produced a 2 GiB remote-reject masked behind a pipe to `tail`.
>
> ⚠️ **After merging to `main`:** either deploy, or expect prod's next content tick to be rejected. A `main` push strands prod's content backup until the next `./scripts/deploy.sh`.

- [ ] **Step 10: Whole-branch adversarial review before merge**

The campaign's standing rule. Use `superpowers:requesting-code-review`. Give the reviewer the spec's amendment blocks and the verification artifact, and ask specifically:
- Does any emitter mint a segment the injector cannot reach? (§C89's shape)
- Does any new lookup use `getSeg` instead of `peekSeg`?
- Is any `<media>` constructed rather than rewritten in place?
- Does any check compare id **sets** where it should compare the id→**text** mapping?

---

## Self-Review

**Spec coverage.** §1 population → Tasks 4–7 (105+53+10+29 = 197). §2 scope → Task 10. §3.1 id-stability → Tasks 1 and 11 Step 4. §5 write-back-before-emitters → Tasks 2–3 precede 4–7. §6's four rows → Tasks 4, 5, 6, 7, each with its amended mechanism. §6 counter safety → own counter + own `kind` per emit point. §6 `deduplicateMedia` hazard → Task 2 Step 4 (in-place rewrite, plus an explicit node-count test). §7 what-moves → Tasks 8 and 9. §8 checks 1/2/3 → Task 11 Steps 1, 2, 4. §9's four named failures → the Global Constraints, and Task 11 Step 10's four review questions map to them one-for-one.

**Gaps deliberately left, with the reason stated in-place:** Task 7 Step 3 flags the two-alt-media-in-one-cell case as unmeasured and says how to settle it. Task 10 is a decision, not an implementation, and names both options with a recommendation.

**Type consistency.** `collectMediaAlts(elements, map)` and `applyMediaAltDom(containerEl, ctx) → number` and `applyMediaAltString(entryCnxml, ctx) → string` are used with those exact signatures in Tasks 2, 3 and 7. `ctx.mediaAlts` values are `{segmentId}` everywhere. The structure node is `{type: 'media', id, alt: {segmentId, text}}` in Tasks 4, 5 and 6; the table cell is `{segmentId: null, attributes, alt: {segmentId, text, mediaId}}` in Task 7, and Task 7 Step 4 is the only reader of `mediaId` — consistent.
