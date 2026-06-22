# A1 — Appendix cross-reference resolution (cross-repo design spec)

**Status:** Draft for review. Implementation deferred to a coordinated
efni + namsbokasafn-vefur session.
**Date:** 2026-06-22
**Relates to:** [`docs/plans/2026-06-17-deferred-fixlist-items.md`](2026-06-17-deferred-fixlist-items.md) item A1.
**Companion (done):** A2 footnote-relocation fix — landed this session in
`renderCompiledExercises` (`tools/cnxml-render.js`), tests in
`tools/__tests__/cnxml-render.test.js`.

## Problem

One dead anchor remains in the published corpus after the A2 fix
(dead-anchor audit total = 1):

| Target id | Referenced on | Real location | Kind |
|-----------|---------------|---------------|------|
| `fs-idm379479808` | efnafraedi-2e `2-3-bygging-atoms-og-taknmal` (chapter 2) | Appendix A — periodic table (`appendices-1-lotukerfid`, module m68859) | cross-chapter → appendix |

The chapter-2 page renders the reference as a dead same-page anchor:

```html
<a href="#fs-idm379479808">viðauka A</a>
```

The target id **does exist** as an anchor on the appendix page
(`<span id="fs-idm379479808" class="preserved-anchor">` — emitted by the
periodic-table special-case in `cnxml-render.js`). The link is dead only
because the chapter-2 render cannot see it.

## Root cause

Rendering is **per-chapter** (`node tools/cnxml-render.js --book … --chapter N`).
`chapterIdToModule` — the id→module registry that `resolveCrossModuleHref`
consults — is rebuilt fresh from only the current chapter's modules
(`tools/cnxml-render.js` ~line 3227). Appendices render in a separate pass and
in a separate chapter scope, so a chapter-2 link to an Appendix-A id has no
owner module to resolve against and falls through to the same-page `#anchor`
fallback (`tools/lib/cnxml-elements.js` `resolveCrossModuleHref`, line 96–102).

This is **cross-chapter** knowledge that must survive across independent render
invocations — the chapter-2 render and the appendix render never share memory.

## Two checked facts that shape the design

1. **No working appendix cross-page link exists anywhere in the published
   corpus today.** (`grep -rho 'href="[^"]*appendices[^"]*"'` over
   `05-publication` returns nothing.) So the relative-href path the renderer
   keeps for `appendices-*` (`buildCrossModuleHref`, `cnxml-elements.js`
   line 152) has never actually produced a navigable link — the reader's
   ability to route to an appendix anchor is **unproven**, not merely untested.

2. **The specific target is a bespoke _interactive_ appendix.** vefur routes
   appendices at `/{bookSlug}/vidauki/{letter}`
   (`src/routes/[bookSlug]/vidauki/[appendixLetter]/`), but the periodic-table
   appendix is `isInteractive` in `toc.json`, so the route **307-redirects to a
   component** (`appendix.componentPath`) and **drops any `#fragment`**
   (`+page.ts` ~line 43–44).

   Confirmed by the lead (2026-06-22): Appendix A is **not** OpenStax content at
   all — OpenStax ships the periodic table as a static English image, and the
   lead replaced it with a custom interactive Icelandic periodic-table
   component. So there is no per-id anchor to deep-link to, and there never will
   be. For `fs-idm379479808` the correct and final behavior is a **plain link to
   the interactive component landing** (drop the fragment). This is not a
   compromise — it is the right target. The general appendix-anchor mechanism
   below matters only for *prose* (non-interactive) appendices in this or other
   books.

This makes A1 **inherently cross-repo**: efni must emit a resolvable appendix
URL, and vefur must (a) route that URL and (b) decide fragment behavior,
especially for interactive appendices.

## Non-goals (YAGNI)

- **No persisted `id-index.json` artifact / no new `build-id-index.js` tool.**
  The deferred doc sketched a book-wide id index; it is over-built for the one
  remaining anchor. The appendix target already exists as an anchor — the only
  missing knowledge is *which appendix page a referenced id lives on*, which is
  one small map (appendix-id → letter/basename), not a full book index.
- No change to chapter-internal or relocated-exercise resolution (working).

## Approach

### efni half — emit a resolvable cross-page appendix href

1. **Build an appendix-id map once per book render**, before chapters render.
   Scan each appendix module's translated CNXML
   (`03-translated/<track>/appendices*/…` or wherever appendix sources live)
   for id-bearing elements and the `appendices-N-` basename, producing
   `appendixIdToPage: Map<elementId, { basename, letter }>`. Keep it small and
   in-memory if a full-book render driver exists; otherwise persist a minimal
   `appendix-ids.json` next to `05-publication/<track>/` (far lighter than the
   rejected book-wide index — appendices only).
2. **Consult it as the last resort in `resolveCrossModuleHref`**, after the
   chapter-local `chapterIdToModule` lookup misses and before the dead
   same-page fallback. On a hit, emit a cross-page href via a new
   appendix-aware branch of `buildCrossModuleHref`.
3. **URL shape — decide with vefur (see contract below).** Default
   recommendation: emit the **absolute reader URL**
   `/{bookSlug}/vidauki/{letter}` (mirroring the section-link clean-break of
   PR #135/#146), with the `#fragment` appended **only for non-interactive
   appendices**; for interactive appendices, emit the bare landing URL (no
   fragment), since vefur will redirect and drop it anyway.

### vefur half — route + fragment contract

1. **Confirm `/{bookSlug}/vidauki/{letter}` accepts and scrolls to a
   `#fragment`** for non-interactive appendices (content pages). If the
   rendered appendix HTML preserves the source ids as anchors (it does for the
   periodic table; verify for prose appendices), browser-native fragment scroll
   should work — confirm under `trailingSlash` settings.
2. **Interactive-appendix policy:** the redirect to `componentPath` drops the
   fragment. Either (a) accept landing-page navigation for interactive
   appendices (recommended — the periodic table has no meaningful per-id
   anchor), or (b) teach the component to read and honor a fragment. (a) is the
   low-effort, correct choice for `fs-idm379479808`.
3. **Letter-mapping contract.** The resolver bakes a *final* href into static
   HTML; vefur never post-processes rendered content. So efni must produce the
   navigable URL at render time, which means efni must derive the appendix
   letter itself (`appendices-(\d+)-` → letter — the same regex vefur's
   `generate-toc.js` uses). This duplicates the mapping in two repos. Accept the
   duplication (it is one trivial, stable regex) but record it as a shared
   contract in this doc and in vefur's so the two cannot silently drift. The
   alternative — efni emits a basename-relative href and vefur rewrites it
   client-side — reintroduces exactly the relative-link fragility that
   PR #135/#146 removed for sections, so it is rejected.

## Acceptance criteria

- `fs-idm379479808` on chapter 2 resolves to the Appendix-A periodic-table
  landing (no dead `#` anchor); dead-anchor audit total → **0**.
- The general mechanism resolves a *non-interactive* appendix anchor to
  `/{bookSlug}/vidauki/{letter}#<id>` and scrolls correctly (add a prose-
  appendix test case if one exists; otherwise document as unverified).
- No regression to chapter-internal or relocated-exercise link resolution
  (existing render tests stay green).

## Risk

Medium. Touches the core link resolver (`resolveCrossModuleHref` /
`buildCrossModuleHref`) and adds a pre-pass + possibly one build artifact.
Re-render all books afterward and assert the diff is href-only. Cross-repo
coordination required — per the repo relaunch heuristic, the vefur half should
be done in a session rooted in namsbokasafn-vefur.

## Sequencing note

Recommend doing the **vefur half first** (prove `/vidauki/{letter}#frag`
routing + settle the interactive-appendix policy), then the efni emit half,
because the URL contract decides what efni emits. Until then, the single dead
anchor is cosmetic (the link text "viðauka A" still reads correctly; it just
doesn't navigate).
