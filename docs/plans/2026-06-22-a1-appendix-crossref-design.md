# A1 — Appendix cross-reference resolution (cross-repo design spec)

**Status:** Scope decided 2026-06-22 — **minimal fix only** (see Scope decision
below). Implementation deferred to an efni-rooted session.
**Date:** 2026-06-22
**Relates to:** [`docs/plans/2026-06-17-deferred-fixlist-items.md`](2026-06-17-deferred-fixlist-items.md) item A1.
**Companion (done):** A2 footnote-relocation fix — landed this session in
`renderCompiledExercises` (`tools/cnxml-render.js`), tests in
`tools/__tests__/cnxml-render.test.js`.

## Scope decision (2026-06-22)

**Chosen: minimal fix only. The general prose-appendix mechanism is deferred
(no current use).**

Decided by the lead in a namsbokasafn-vefur session after the two vefur-side
claims below were verified against the code:

- Interactive appendix → 307-redirect to `componentPath`, `#fragment` dropped
  (`vefur src/routes/[bookSlug]/vidauki/[appendixLetter]/+page.ts:43-44`). ✓
- That route's `entries()` **only prerenders non-interactive appendices**
  (`+page.ts:20`, `.filter(a => !a.isInteractive)`), so the periodic-table
  appendix has no content page to deep-link into at all. ✓
- Checked fact #1 in this doc still holds: **zero working appendix cross-page
  links exist in the published corpus today**, so the general id-map +
  `buildCrossModuleHref` branch + fragment-scroll contract would be
  infrastructure for a case that does not currently occur → YAGNI.

**What "minimal fix" means:**

- **Build only enough to resolve the single anchor `fs-idm379479808`.** A small
  last-resort lookup (appendix-id → `{ letter, isInteractive }`, appendices
  only) consulted in `resolveCrossModuleHref` after the chapter-local miss; on a
  hit emit the **absolute landing URL `/{bookSlug}/vidauki/{letter}` with the
  `#fragment` dropped** (because the target appendix is interactive). No
  persisted book-wide index, no general prose-appendix anchor scrolling.
- Then re-render efnafraedi-2e, assert the diff is **href-only**, `sync-content`
  to vefur.
- **vefur needs no code change.** The `/{bookSlug}/vidauki/{letter}` route and
  the interactive 307-redirect already produce the correct final behavior. The
  only vefur-side step is post-sync verification: confirm the chapter-2
  "viðauka A" link navigates to the periodic-table component instead of
  dead-anchoring.

The general mechanism (resolving *non-interactive* prose-appendix anchors to
`/{bookSlug}/vidauki/{letter}#<id>` with browser-native fragment scroll, plus
the shared `appendices-(\d+)-` → letter contract) is preserved below as the
documented design to revive **if and when a prose appendix actually gains a
cross-page reference.** Until then it stays unbuilt.

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

**Net (per the Scope decision above):** vefur's `/{bookSlug}/vidauki/{letter}`
route and its interactive-appendix 307-redirect already produce the correct
final behavior, so the fix is **efni-only** — emit the landing URL with the
fragment dropped. vefur needs no code change.

## Non-goals (YAGNI)

- **No persisted `id-index.json` artifact / no new `build-id-index.js` tool.**
  The deferred doc sketched a book-wide id index; it is over-built for the one
  remaining anchor. The appendix target already exists as an anchor — the only
  missing knowledge is *which appendix page a referenced id lives on*, which is
  one small map (appendix-id → letter/basename), not a full book index.
- No change to chapter-internal or relocated-exercise resolution (working).

## Approach (minimal fix — efni only)

### efni — emit a resolvable cross-page appendix href

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
3. **URL shape (decided).** Emit the **absolute reader URL**
   `/{bookSlug}/vidauki/{letter}` (mirroring the section-link clean-break of
   PR #135/#146). `fs-idm379479808`'s appendix is interactive, so emit the bare
   landing URL with **no `#fragment`** (vefur 307-redirects and drops it). A
   fragment would be appended only for a *non-interactive* prose appendix — see
   Deferred general mechanism.

4. **Letter-mapping contract.** The resolver bakes a *final* href into static
   HTML; vefur never post-processes rendered content. So efni must produce the
   navigable URL at render time, which means efni derives the appendix letter
   itself (`appendices-(\d+)-` → letter — the same regex vefur's
   `generate-toc.js` uses). This duplicates the mapping in two repos. Accept the
   duplication (one trivial, stable regex) but record it as a shared contract
   here and in vefur's docs so the two cannot silently drift. The alternative —
   efni emits a basename-relative href and vefur rewrites it client-side —
   reintroduces exactly the relative-link fragility that PR #135/#146 removed
   for sections, so it is rejected.

### vefur — no code change required

The `/{bookSlug}/vidauki/{letter}` route and the interactive 307-redirect
already produce the correct behavior for the minimal fix. The only vefur-side
step is **post-sync verification**: confirm the chapter-2 "viðauka A" link
navigates to the periodic-table component instead of dead-anchoring.

## Acceptance criteria (minimal fix)

- `fs-idm379479808` on chapter 2 resolves to the Appendix-A periodic-table
  landing (no dead `#` anchor); dead-anchor audit total → **0**.
- No regression to chapter-internal or relocated-exercise link resolution
  (existing render tests stay green).
- Re-render efnafraedi-2e; assert the diff is **href-only**; `sync-content` to
  vefur, then run the post-sync verification above.

## Risk

Low–medium, and **efni-only**. Touches the core link resolver
(`resolveCrossModuleHref` / `buildCrossModuleHref`) and adds a small
appendix-id lookup. Re-render efnafraedi-2e afterward and assert the diff is
href-only. No vefur code change, so no cross-repo build coordination — only the
post-sync link check.

## Sequencing note

Single efni-rooted session: build the appendix-id lookup → extend
`resolveCrossModuleHref` → re-render → sync → verify the link in vefur. There is
no vefur-first step (the route and redirect already exist). Until shipped, the
lone dead anchor is cosmetic — the link text "viðauka A" reads correctly; it
just doesn't navigate.

## Deferred general mechanism (non-interactive prose appendices)

Not built — revive only if a *prose* (non-interactive) appendix ever gains a
cross-page reference (none exists today). The minimal fix above already builds
the appendix-id lookup and the resolver branch; extending it to prose appendices
means appending the `#<id>` fragment instead of dropping it, and confirming the
reader scrolls to it:

- **Fragment scroll:** `/{bookSlug}/vidauki/{letter}#<id>` relies on the
  rendered prose-appendix HTML preserving source ids as anchors and on
  browser-native scroll under vefur's `trailingSlash` setting — verify when a
  real case appears.
- **Interactive appendices stay landing-only:** the `componentPath` redirect
  drops fragments by design; teaching a component to honor a fragment is out of
  scope unless a specific interactive appendix needs it.
