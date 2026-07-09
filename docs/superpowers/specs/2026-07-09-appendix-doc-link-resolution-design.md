# Resolve `<link document="<appendix>">text</link>` to the appendix landing page (roadmap #10, piece 2)

**Date:** 2026-07-09 · **Branch:** `fix/chem-appendix-doc-links` · efni-only.

## What this is

Piece 2 of roadmap #10, greenlit by the lead (incl. cross-repo work). The leak-fix
PR (#254, merged) made paired document-only appendix links `<link document="D">text</link>`
render as **non-clickable text** instead of raw markup. This makes them **clickable**,
resolving to the appendix landing page `/{bookSlug}/vidauki/{letter}`.

## Cross-repo verification result: efni-only, vefur needs NO change

Verified against real files (not just source), per the cross-repo rule (read vefur
`CLAUDE.md` + memory first):

- **vefur already serves it.** `src/routes/[bookSlug]/vidauki/[appendixLetter]/+page.ts`
  `entries()` prerenders every non-interactive appendix (`.filter(a => !a.isInteractive)`)
  and its `load()` renders the prose content; interactive appendices (periodic table = A)
  307-redirect to their component. `findAppendixByLetter` is case-insensitive
  (`contentLoader.ts:327`).
- **The chain holds:** efni renders all prose appendices (B–M) to `05-publication`;
  vefur `toc.appendices` lists A–M; efni section→letter (`m68865` §7→G) matches vefur's
  toc letters exactly.
- **URL byte-match:** the one A1-shipped working link is `href="/efnafraedi-2e/vidauki/A"`
  (uppercase, no trailing slash); A1 emits `/${bookSlug}/vidauki/${letter}` with an
  uppercase letter; vefur prerenders uppercase paths. So emitting the same shape lands
  on a real page.

**Therefore: no vefur code change. Record this on the PR.**

## Link population (verified — scopes the design)

67 appendix-targeting `document=` links book-wide, **all document-only (0 have a
`target-id`)** → every one resolves to a *landing page* (no fragment). Distribution by
letter: B:3, E:2, G:35, H:4, I:2, J:10, K:2, L:7, M:1, A:1. The 1 pointing to the
interactive appendix A self-heals (`/vidauki/A` → 307 to the periodic-table component).
**Because 0 links carry a `target-id`, the A1-deferred per-id fragment-scroll mechanism
stays unbuilt (YAGNI).**

## Design (efni)

### 1. Shared href construction — `appendixLandingHref(bookSlug, letter)`

Extract the landing-URL construction (currently inline in the A1 target-id branch,
`cnxml-elements.js:104`) into one exported helper so the A1 branch and the new
document branch cannot drift (the #9 no-fork lesson):

```js
/** The reader URL for an appendix landing page. Shared by the target-id (A1)
 *  and document= (piece 2) appendix branches so the shape can't drift. */
export function appendixLandingHref(bookSlug, letter) {
  return `/${bookSlug}/vidauki/${letter}`;
}
```

Update the A1 branch (`resolveCrossModuleHref`, ~line 104) to
`href: appendixLandingHref(context.bookSlug, appx.letter)` — byte-identical output.

### 2. New resolver branch — `document=`→appendix

In `resolveCrossModuleHref` (`cnxml-elements.js`), after the relocated-ids block and
before the target-id appendix block (~line 92), add:

```js
  // document="<appendix module>" → the appendix landing page. Fires for any arm
  // that passes documentId (the 67 document-only appendix links). Must run before
  // the lookupModuleFilename() path, which cannot resolve appendix modules (they
  // render in a separate pass) and would return href:null → text-only.
  if (documentId && context.bookSlug && context.appendixModuleLetters?.has(documentId)) {
    return {
      href: appendixLandingHref(context.bookSlug, context.appendixModuleLetters.get(documentId)),
      ownerModule: documentId,
      sameModule: false,
    };
  }
```

No fragment is emitted (all 67 links are document-only). For the interactive appendix A,
this yields `/vidauki/A`, which vefur 307-redirects — correct.

### 3. Build the `moduleId → letter` map — `buildAppendixIdMap` returns both

`buildAppendixIdMap` (`cnxml-render.js:288`) already loops appendix modules with
`moduleId` and `letter` in scope. Change it to return `{ idMap, moduleLetters }`
(DRY — one loop, one letter derivation) instead of just the id map:

- In the loop, also `moduleLetters.set(moduleId, letter)`.
- Return `{ idMap: map, moduleLetters }`.
- **Caller** (`cnxml-render.js:3227`): destructure —
  ```js
  const { idMap: appendixIdMap, moduleLetters: appendixModuleLetters } =
    args.chapter === 'appendices'
      ? { idMap: new Map(), moduleLetters: new Map() }
      : buildAppendixIdMap(BOOK_SLUG, args.track);
  ```
- Add `appendixModuleLetters` to the render context (next to `appendixIdMap` at both
  the options default ~line 511 and the per-module context ~line 3430).
- **Existing tests** (`cnxml-render.test.js:517-527`) assert `buildAppendixIdMap` returns
  a Map — update them to destructure `{ idMap }` (and add a `moduleLetters` assertion,
  see below). This is the only contract change; there are no other callers.

### 4. Tests

- **`appendixLandingHref`** (`cnxml-link-resolution.test.js`): `appendixLandingHref('efnafraedi-2e','G')` === `/efnafraedi-2e/vidauki/G`.
- **resolver branch** (`cnxml-link-resolution.test.js`): `resolveCrossModuleHref('m68865', null, ctx)` with `ctx.appendixModuleLetters = new Map([['m68865','G']])` and `ctx.bookSlug='efnafraedi-2e'` → `href: '/efnafraedi-2e/vidauki/G'`.
- **processInlineContent** (`cnxml-link-resolution.test.js`): on `'<link document="m68865">viðauka G</link>'` with that context → `<a href="/efnafraedi-2e/vidauki/G">viðauka G</a>` (proves the end-user output; supersedes the leak-fix arc's text-only behavior when the map is present).
- **A1 parity** (`cnxml-link-resolution.test.js`): the existing target-id→appendix test still yields `/efnafraedi-2e/vidauki/A` (proves the shared-helper refactor is byte-identical).
- **`buildAppendixIdMap`** (`cnxml-render.test.js`): the returned `moduleLetters` maps `m68865`→`G` and `m68859`→`A`; `idMap` still resolves an appendix element id (existing assertion, via `idMap`).

## Scope / delivery

- **No `05-publication/` re-render** in this PR (lead-confirmed). Code + tests only; the
  lead's next full re-render + Phase-6 sync delivers piece 2 together with the pending
  leak-fix (#254) and the F2/F1b/#14 backlog in one operation.
- **No vefur change** (verified above).
- Run `npm test` from repo ROOT.

## Success criteria

- `appendixLandingHref` is the single source of the landing URL; both the A1 target-id
  branch and the new document branch use it (A1 output byte-identical, proven by test).
- A `<link document="<appendix>">text</link>` renders as `<a href="/{book}/vidauki/{letter}">text</a>`;
  the interactive-A case yields `/vidauki/A` (vefur redirects).
- `buildAppendixIdMap` returns `{ idMap, moduleLetters }`; the render context carries
  `appendixModuleLetters`; existing appendix-id-map behavior unchanged.
- `npm test` green from repo root; zero `05-publication/` changes; no vefur change.
