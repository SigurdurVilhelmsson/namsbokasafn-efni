# Resolve `<link document="<appendix>">text</link>` → `/vidauki/{letter}` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 67 document-only appendix links (`<link document="D">text</link>`) render as clickable `<a href="/{bookSlug}/vidauki/{letter}">text</a>` instead of non-clickable text (their state after the #254 leak fix).

**Architecture:** efni-only (cross-repo verified: vefur's `/vidauki/[letter]` route already serves prose appendices; URL byte-matches A1's shipped link). `buildAppendixIdMap` gains a `moduleId→letter` map; `resolveCrossModuleHref` gains one branch (documentId is an appendix module → landing URL), sharing A1's href construction via a new `appendixLandingHref` helper.

**Tech Stack:** Node.js 22 (ESM), Vitest.

## Global Constraints

- **Run `npm test` from the repo ROOT** — the authoritative gate (no branch protection).
- **Zero `books/` changes** — no `05-publication/` re-render (lead does one combined re-render delivering this + the merged #254 leak fix + the F2/F1b/#14 backlog); never touch `books/*/01-source/`.
- **No vefur change** (cross-repo verified — record it on the PR).
- **No fragment logic** — all 67 links are document-only (0 have a `target-id`); the A1-deferred per-id scroll mechanism stays unbuilt.
- Emit the URL exactly as A1 does: `/{bookSlug}/vidauki/{UPPERCASE-letter}` (byte-matches the shipped `/efnafraedi-2e/vidauki/A`).
- Branch: `fix/chem-appendix-doc-links` (already created off `main`; the design doc is already committed on it).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `buildAppendixIdMap` returns `{ idMap, moduleLetters }` + wire into render context

The resolver needs a `moduleId→letter` map. `buildAppendixIdMap` already derives `letter` per appendix module in its loop, so return it there (DRY — one loop, one letter derivation; do NOT fork a second builder).

**Files:**
- Modify: `tools/cnxml-render.js` (`buildAppendixIdMap` ~288-329; caller ~3227; context default ~511; per-module context ~3430)
- Test: `tools/__tests__/cnxml-render.test.js` (existing `buildAppendixIdMap` describe ~517)

**Interfaces:**
- Produces: `buildAppendixIdMap(book, track) → { idMap: Map<elementId,{letter,basename}>, moduleLetters: Map<moduleId, letter> }` (previously returned just the `Map`).
- Produces: render context field `appendixModuleLetters: Map<moduleId, letter>`.

- [ ] **Step 1: Update the existing tests to the new return shape (RED)**

In `tools/__tests__/cnxml-render.test.js`, change the `buildAppendixIdMap` describe block to destructure `idMap` and add a `moduleLetters` assertion:

```js
describe('buildAppendixIdMap', () => {
  // Integration test against the real efnafraedi-2e appendix CNXML/structure.
  it('maps an appendix element id to its letter (periodic table = A)', () => {
    const { idMap } = buildAppendixIdMap('efnafraedi-2e', 'mt-preview');
    const entry = idMap.get('fs-idm379479808');
    expect(entry).toBeTruthy();
    expect(entry.letter).toBe('A');
  });

  it('maps appendix module ids to their letters', () => {
    const { moduleLetters } = buildAppendixIdMap('efnafraedi-2e', 'mt-preview');
    expect(moduleLetters.get('m68859')).toBe('A'); // periodic table
    expect(moduleLetters.get('m68865')).toBe('G'); // standard thermodynamic properties
  });

  it('returns empty maps for a book with no appendices', () => {
    const { idMap, moduleLetters } = buildAppendixIdMap('does-not-exist', 'mt-preview');
    expect(idMap.size).toBe(0);
    expect(moduleLetters.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js -t "buildAppendixIdMap"`
Expected: FAIL — `buildAppendixIdMap(...).idMap` is undefined (still returns a bare Map).

- [ ] **Step 3: Change `buildAppendixIdMap` to return both maps**

In `tools/cnxml-render.js`, in `buildAppendixIdMap`:
- The early `catch { return map; }` → `catch { return { idMap: map, moduleLetters }; }`.
- Add `const moduleLetters = new Map();` next to `const map = new Map();` at the top.
- Inside the loop, right after `const letter = String.fromCharCode(64 + n);`, add `moduleLetters.set(moduleId, letter);`.
- The final `return map;` → `return { idMap: map, moduleLetters };`.

So the top becomes:

```js
function buildAppendixIdMap(book, track) {
  const map = new Map();
  const moduleLetters = new Map();
  let appendixSections;
  try {
    appendixSections = buildModuleSections(book, 'appendices');
  } catch {
    return { idMap: map, moduleLetters }; // book has no appendices
  }
  for (const [moduleId, info] of Object.entries(appendixSections)) {
    if (moduleId.startsWith('_') || !info || info.section == null) continue;
    const n = parseInt(info.section, 10);
    if (!Number.isFinite(n) || n < 1 || n > 26) continue;
    const letter = String.fromCharCode(64 + n); // 1→A — matches vefur generate-toc.js
    moduleLetters.set(moduleId, letter);
    const basename = `appendices-${info.section}-${info.slug}`;
    // …unchanged id-scan loop…
```

and the function ends `return { idMap: map, moduleLetters };`.

- [ ] **Step 4: Update the caller + context wiring**

Caller (`tools/cnxml-render.js` ~3227):

```js
    const { idMap: appendixIdMap, moduleLetters: appendixModuleLetters } =
      args.chapter === 'appendices'
        ? { idMap: new Map(), moduleLetters: new Map() }
        : buildAppendixIdMap(BOOK_SLUG, args.track);
```

Context default (~511, after the `appendixIdMap:` line):

```js
    appendixModuleLetters: options.appendixModuleLetters || new Map(), // appendix moduleId -> letter (piece 2)
```

Per-module context object (~3430, after `appendixIdMap,`):

```js
          appendixModuleLetters,
```

- [ ] **Step 5: Run to verify GREEN**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js`
Expected: PASS — the updated `buildAppendixIdMap` tests green AND every other `cnxml-render.test.js` test still green (no other caller of `buildAppendixIdMap` exists; verified).

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.test.js
git commit -m "feat(cnxml-render): buildAppendixIdMap returns moduleId→letter map too [#10 piece 2]

resolveCrossModuleHref needs to map an appendix document= to its /vidauki/
letter. buildAppendixIdMap already derives the letter per module, so return
{ idMap, moduleLetters } (one loop, no forked builder) and thread
appendixModuleLetters through the render context.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `appendixLandingHref` helper + document→appendix resolver branch

**Files:**
- Modify: `tools/lib/cnxml-elements.js` (new exported helper; A1 branch ~104; new branch ~92 in `resolveCrossModuleHref`)
- Test: `tools/__tests__/cnxml-link-resolution.test.js` (existing; has `makeContext`, imports `resolveCrossModuleHref`/`processInlineContent`)

**Interfaces:**
- Consumes: `context.appendixModuleLetters` (Task 1), `context.bookSlug`.
- Produces: `appendixLandingHref(bookSlug, letter) → string` (exported).

- [ ] **Step 1: Write the failing tests**

Add to `tools/__tests__/cnxml-link-resolution.test.js` (extend the import from `../lib/cnxml-elements.js` to include `appendixLandingHref`):

```js
describe('document= appendix links resolve to the appendix landing page', () => {
  function apxCtx(overrides = {}) {
    return makeContext({
      bookSlug: 'efnafraedi-2e',
      appendixModuleLetters: new Map([['m68865', 'G'], ['m68859', 'A']]),
      ...overrides,
    });
  }

  it('appendixLandingHref builds the /vidauki/{letter} URL', () => {
    expect(appendixLandingHref('efnafraedi-2e', 'G')).toBe('/efnafraedi-2e/vidauki/G');
  });

  it('resolveCrossModuleHref resolves a document= appendix module to its landing page', () => {
    const r = resolveCrossModuleHref('m68865', null, apxCtx());
    expect(r.href).toBe('/efnafraedi-2e/vidauki/G');
  });

  it('processInlineContent renders a document-only appendix link as a real anchor', () => {
    const out = processInlineContent('Gögn úr <link document="m68865">viðauka G</link> sýna.', apxCtx());
    expect(out).toContain('<a href="/efnafraedi-2e/vidauki/G">viðauka G</a>');
    expect(out).not.toContain('<link');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-link-resolution.test.js -t "appendix landing"`
Expected: FAIL — `appendixLandingHref is not a function`, and the resolver returns `href:null` (document= appendix currently falls to `lookupModuleFilename`→null).

- [ ] **Step 3: Add the helper and the branch**

In `tools/lib/cnxml-elements.js`, add the exported helper (near the top with the other exports, above `resolveCrossModuleHref`):

```js
/**
 * The reader URL for an appendix landing page. Shared by the target-id (A1) and
 * document= (piece 2) appendix branches so the URL shape cannot drift.
 * @param {string} bookSlug
 * @param {string} letter  uppercase appendix letter (A, B, …)
 * @returns {string}
 */
export function appendixLandingHref(bookSlug, letter) {
  return `/${bookSlug}/vidauki/${letter}`;
}
```

In `resolveCrossModuleHref`, after the relocated-ids block and before the target-id appendix block (~line 92), add the document→appendix branch:

```js
  // document="<appendix module>" → the appendix landing page. Fires for any arm
  // that passes documentId. Must run before the lookupModuleFilename() path, which
  // cannot resolve appendix modules (they render in a separate pass) → href:null.
  // All such links are document-only (no target-id), so no fragment is emitted.
  if (documentId && context.bookSlug && context.appendixModuleLetters?.has(documentId)) {
    return {
      href: appendixLandingHref(context.bookSlug, context.appendixModuleLetters.get(documentId)),
      ownerModule: documentId,
      sameModule: false,
    };
  }
```

Update the existing A1 target-id branch (~line 104) to use the helper:

```js
        href: appendixLandingHref(context.bookSlug, appx.letter),
```

- [ ] **Step 4: Run to verify GREEN + A1 parity**

Run: `npx vitest run tools/__tests__/cnxml-link-resolution.test.js`
Expected: PASS — the new tests green AND every existing test still green, especially any existing target-id→appendix (A1) test still yielding `/efnafraedi-2e/vidauki/A` (proves the shared-helper refactor is byte-identical).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/cnxml-elements.js tools/__tests__/cnxml-link-resolution.test.js
git commit -m "fix(cnxml-render): resolve document= appendix links to /vidauki/letter [#10 piece 2]

The 67 document-only appendix links rendered as non-clickable text after the
#254 leak fix. Add a resolveCrossModuleHref branch: documentId that is an
appendix module → /{book}/vidauki/{letter} (landing page, no fragment — 0 such
links carry a target-id). Share A1's URL construction via appendixLandingHref
so the two appendix branches can't drift. efni-only; vefur route unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Full-suite gate + roadmap update + PR

- [ ] **Step 1: Run the whole suite from repo root**

Run: `npm test`
Expected: PASS — full Vitest workspace green.

- [ ] **Step 2: Confirm zero `books/` changes**

Run: `git status --porcelain books/` (expect empty) and `git diff --stat main..HEAD -- books/` (expect empty).

- [ ] **Step 3: Update the roadmap #10 row**

In `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md`, update the #10 row: piece 2 (appendix `document=` resolution) is now **DELIVERED** (efni-only; vefur verified unchanged; 67 links → `/vidauki/{letter}`; no fragment). The "25 leaking pages clear on re-render" note stays — the lead's combined re-render now also makes these 67 links clickable. Commit:

```bash
git add docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md
git commit -m "docs(roadmap): #10 piece 2 (appendix document= link resolution) delivered

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Whole-branch review, then PR**

Use the project's whole-branch review flow (most-capable model); address findings; open the PR against `main`. The PR body must state: efni-only, **vefur verified to need no change**, code+tests only (no `05-publication` re-render — lead's combined re-render delivers it), 67 document-only links, no fragment.

## Success criteria (definition of done)

- `buildAppendixIdMap` returns `{ idMap, moduleLetters }`; render context carries `appendixModuleLetters`; existing appendix-id behavior unchanged.
- `appendixLandingHref` is the single source of the landing URL; both the A1 target-id branch and the new document branch use it (A1 output byte-identical, proven by test).
- `<link document="<appendix>">text</link>` renders as `<a href="/{book}/vidauki/{letter}">text</a>`; interactive-A yields `/vidauki/A` (vefur redirects).
- `npm test` green from repo root; zero `05-publication/` changes; no vefur change.
- Roadmap #10 piece 2 marked delivered.
