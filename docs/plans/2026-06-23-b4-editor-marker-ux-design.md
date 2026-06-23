# B-4 — Editor marker clarity & recovery (design)

**Date:** 2026-06-23
**Item:** B-4 from [`2026-06-23-live-qa-followup-efni.md`](2026-06-23-live-qa-followup-efni.md)
(tracker: [`2026-06-17-deferred-fixlist-items.md`](2026-06-17-deferred-fixlist-items.md)).
**Scope:** `server/public/js/segment-editor.js` (+ its CSS and UI strings). No
server, save-contract, or validation-contract changes.

## Problem (from live QA)

In the side-by-side segment editor:

1. **Pane mismatch.** The English pane shows **raw** inline markers
   (`**bold**`, `__term__`, `[[MEDIA:2]]`, links, xref) while the IS/MT pane
   shows the same things **rendered** (bold, camera icon, chips). Same data,
   two appearances → confusing at a glance.
   - Root cause: `enHtml = highlightMath(escapeHtml(seg.en))`
     (`segment-editor.js:714`) vs `isHtml = renderMarkdownPreview(displayIs)`
     (`:715`).

2. **Markers are corruptible with no obvious recovery.** Editing happens in a
   plain `<textarea>` holding raw markdown (`:866`). A structural marker such as
   `[[MATH:1]]` can be edited character-by-character; `validateSegmentEdit`
   (`:964+`) then **hard-blocks** the save (correct), but the only escape the
   user notices is "Hætta við" (cancel), which discards **all** edits in that
   segment. A revert-to-last-saved already exists on the **Escape** key
   (`:2261–2296`) but it is invisible — no button, and nothing points to it
   after a block.

## Decisions

- **Keep the textarea.** No `contenteditable`/chip rewrite (3–6 days, real
  caret/serialization/IME risk in a daily-use workflow; poor ROI for a
  5-editor tool). Markers stay technically editable — the goal is *unmistakable
  + trivially recoverable*, not *uneditable*.
- **Read mode: both panes fully rendered.** EN renders through the same
  `renderMarkdownPreview` as IS. Edit mode is the *reveal*: opening the editor
  swaps rendered IS for raw-but-highlighted markers in the overlay — markers
  appear exactly when they are editable.

## Components

### 1 — Consistent pane rendering (read mode)

Render the EN pane through `renderMarkdownPreview(seg.en)` instead of
`highlightMath(escapeHtml(seg.en))`, so EN and IS render markers identically.

- **Term highlighting** (`highlightTermsInHtml`, applied to `enHtml` at `:727`)
  now runs on the rendered HTML. `highlightTermsInHtml` matches escaped English
  term text on word boundaries and wraps the first occurrence; the renderer
  injects Icelandic `title="…"` strings, so English-term regexes are very
  unlikely to collide — but this ordering is the one integration point and gets
  an explicit test.
- `highlightMath` becomes redundant for EN (its `[[MATH:N]]` handling already
  lives in `renderMarkdownPreview`); leave the helper in place (still used
  elsewhere) but stop calling it on EN.

### 2 — Highlight overlay on the edit textarea

Standard "highlighted textarea" technique:

- A backdrop `<div class="marker-backdrop" id="backdrop-<segId>">` is rendered
  **behind** each edit `<textarea>`, both wrapped in a positioned container.
  The two share identical `font`, `padding`, `line-height`, `white-space`,
  `word-wrap`, and width so glyphs line up exactly.
- The textarea text is made transparent (`color: transparent;
  caret-color: <normal>;` with `background: transparent`) so only the caret and
  native selection show on top; the visible text comes from the backdrop.
- On `input` and `scroll`, regenerate the backdrop and sync
  `backdrop.scrollTop/scrollLeft` to the textarea.
- New **pure function** `highlightMarkersInPlace(text)`:
  - Input: raw segment text. Output: HTML where **every original character is
    preserved** (so the backdrop overlaps the textarea 1:1) and each marker is
    wrapped in a highlight span:
    - atoms: `[[MATH:N]]`, `[[MEDIA:N]]`, `[[BR]]`, `[[SPACE]]`/`[[SPACE:N]]`,
      `[#xref]`, `[doc#target]`, `[text](url)`, `[footnote: …]`
    - paired delimiters: `**`, `__`, `~`, `^`, `++`, `{= =}` (highlight the
      delimiters; inner text stays normal)
  - **Invariant:** `stripTags(highlightMarkersInPlace(t)) === escapeHtml(t)`
    (overlay must not add or drop characters). This is the core unit test.
- **Editing logic is untouched** — selection, `wrapSelection`,
  `insertTermFromLookup`, all keyboard shortcuts, dirty tracking, save, and
  Escape-revert keep operating on `textarea.value` exactly as today. The
  overlay is render-only; it just needs a refresh hook wherever `.value`
  changes programmatically (revert, term insert, wrapSelection, open).

### 3 — In-place "Endurstilla" (revert) button

- Add a button to `.edit-controls` (`:867–879`) between "Vista" and
  "Hætta við": `<button class="btn btn-sm btn-secondary" onclick="revertEdit('<segId>')">↩ Endurstilla</button>`.
- `revertEdit(segmentId)` factors out the existing Escape-revert body
  (`:2261–2296`): set `textarea.value` to the latest edit's `edited_content`
  (if pending/approved) else `seg.is`; clear the dirty flag; refresh preview,
  **backdrop overlay**, and the per-segment indicator (reuse
  `UI.segmentEditor.reverted`). Does **not** close the panel.
- The Escape handler calls the same extracted function (no duplicated logic).
- Disabled (greyed) when the segment is not dirty.

### 4 — Clearer save-block message

- Blocked save currently shows `alert(UI.confirm.validationBlocked + reasons)`
  (`:1085–1088`). Ensure each `blocked` string in `validateSegmentEdit` names
  the specific marker (most already do, e.g. `[[MATH:1]]`), and append a final
  line from a new UI string, e.g.
  `UI.confirm.validationRevertHint = "\n\nÝttu á „Endurstilla“ til að ná aftur upprunalega textanum."`
- No change to *what* is blocked — only the message.

## New / changed surface

| Area | Change |
|------|--------|
| `renderSegmentRow` (`:714`, `:856–880`) | EN via `renderMarkdownPreview`; add backdrop container + Endurstilla button |
| `highlightMarkersInPlace(text)` | **new** pure fn (overlay HTML) — exposed on `window` for tests |
| `refreshBackdrop(segmentId)` | **new** helper; called on input/scroll/open/revert/wrapSelection/term-insert |
| `revertEdit(segmentId)` | **new**; Escape handler delegates to it; exposed on `window` |
| `openEditPanel` (`:890–938`) | render initial backdrop; wire input+scroll listeners alongside the existing preview listener |
| `wrapSelection` / `insertTermFromLookup` (`:2221`, `:2175`) | call `refreshBackdrop` after mutating `.value` |
| Keyboard Escape (`:2261–2296`) | delegate to `revertEdit` |
| `saveEdit` block path (`:1085–1088`) | append revert hint |
| CSS | `.editor-overlay-wrap`, `.marker-backdrop`, `.marker-hl*` classes; transparent-text textarea |
| UI strings | `validationRevertHint`, Endurstilla button label/tooltip |

## Testing

- **Unit (Vitest, via window-exposed fn or extracted module):**
  - `highlightMarkersInPlace` character-preservation invariant
    (`stripTags(out) === escapeHtml(in)`) across a table of marker cases.
  - each marker type produces exactly one highlight span; plain text produces
    none.
- **E2E (Playwright, `segment-editor.spec.js`):**
  - EN pane renders a marker (a `<strong>` or chip appears in `.col-en`),
    matching IS.
  - opening the editor creates a `.marker-backdrop`; typing updates it.
  - **Endurstilla** reverts dirty text to last-saved/MT, re-enables save, panel
    stays open.
  - corrupting `[[MATH:1]]` then saving shows a block message naming the marker
    (block path unchanged; message text asserted).

## Out of scope (YAGNI)

contenteditable / chip editor; multi-step undo stack; any change to the save or
validation contract; server changes; Pass-2 (localization) editor (separate
file — revisit only if the lead wants parity).
