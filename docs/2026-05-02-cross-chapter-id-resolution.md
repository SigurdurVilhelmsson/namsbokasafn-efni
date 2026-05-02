# Cross-chapter id resolution in CNXML renderer

**Status:** Open follow-up. Surfaced 2026-05-02 while fixing other broken-link classes (see commit on main for the partial fixes already landed in `tools/cnxml-render.js` and `tools/lib/cnxml-elements.js`).

## Problem

The renderer maintains a `chapterIdToModule` map (`tools/cnxml-render.js:3047`) that lists every id-bearing element in the **current chapter**. `resolveCrossModuleHref()` in `tools/lib/cnxml-elements.js:54-65` uses this to locate the owning module for a `<link target-id="X"/>` reference. When the target id lives in a different chapter — most commonly a chapter-text link to an appendix figure (e.g. ch 2-3's `<a href="#fs-idm379479808">viðauka A</a>` resolving into `appendices/m68859.cnxml`) — the lookup misses and the renderer falls through to a same-module anchor `#${targetId}`.

Net effect: chapter HTML contains in-page anchors that point at ids only present elsewhere. The reader's prerenderer flags these (`handleMissingId`); we currently suppress with `handleMissingId: 'warn'` in `namsbokasafn-vefur/svelte.config.js`.

## What's needed

1. Build a **book-wide** id-to-(chapter, module) index alongside the existing per-chapter map. Most natural place: alongside `findChapterModules` discovery during the top-level book pass, scanning all chapters' source CNXML once.
2. Pass the index to `resolveCrossModuleHref` via `context` (e.g. `context.bookIdToModule`).
3. When `chapterIdToModule` misses, fall through to `bookIdToModule` to get the owner chapter + module, then build an absolute reader URL using the same `buildCrossModuleHref` shape we already use for cross-section links — but covering the additional case of cross-chapter and **appendix** targets.
4. For appendix targets, the URL scheme differs (`/{slug}/vidauki/{letter}` rather than `/{slug}/kafli/...`). Mapping requires the appendix-number → letter correspondence. Either (a) read it from `toc.json`, (b) derive from filename (`appendices-1-…` → letter `A`), or (c) emit `/{slug}/kafli/appendices/{basename}` and let the reader handle redirection.

## How to verify

1. Re-render efnafræði 2e with the change.
2. In the reader (`namsbokasafn-vefur`), revert `svelte.config.js` to remove `handleMissingId: 'warn'`.
3. Run `npm run build:no-validate` — should pass cleanly.
4. Spot-check that ch 2-3's "viðauka A" link now points at the periodic-table appendix page (or its preserved-anchor span if we keep the in-page form).

## Already in place (no rework needed)

- `appendices-1-lotukerfid.html` already contains `<span id="fs-idm379479808" class="preserved-anchor">` and similar preserved anchors for every original element id (see `tools/cnxml-render.js:3193-3211`). So absolute URLs to the appendix page **with** the original anchor will land correctly once we emit them.

## Bigger scope ideas (defer)

- Surface unresolved ids during render with a hard error gated on `--strict`, so content authors see them at translation time rather than build time.
- Add a `tools/audit-render-output.js` rule for "unresolved cross-chapter anchors".
