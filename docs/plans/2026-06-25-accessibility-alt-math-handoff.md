# Handoff — figure alt-text translation + math accessibility (assistive MathML)

**Date:** 2026-06-25
**Origin:** vefur-side accessibility audit (see vefur `docs/plans/2026-04-22-screen-vs-paper-reader-plan.md` § P2.5). Both root causes are in **this** repo's render pipeline, not the reader — hence this handoff.
**Status:** Not started. Verified findings + locus below; no code written yet.

## Why this exists

A review of the rendered content on namsbokasafn.is (prompted by an external platform report citing OpenStax's WCAG-AA accessibility guidance) audited the live HTML and found two accessibility gaps that originate in `cnxml-render.js` / the translation flow:

1. **Figure alt text is present and descriptive — but English.** A blind Icelandic student hears English figure descriptions in an otherwise-Icelandic book.
2. **Math is rendered but nameless to assistive tech.** Screen readers announce nothing for any equation.

These exclude exactly the assistive-technology users accessibility is meant to serve, and a science textbook is unusually sensitive to inaccessible figures and math.

## Verified findings (2026-06-25, against synced `static/content/` in vefur)

| Concern | Measured | Root cause in efni |
| ------- | -------- | ------------------ |
| Alt coverage | 1581 `<img>`, **100%** have non-empty `alt`, median 372 chars (substantive, not label-only) | Good — `cnxml-render.js` emits `<media alt>` faithfully (`cnxml-render.js:1197, 1235`) |
| Alt **language** | **~100% English** — only 3 / 1581 contain any Icelandic | **Alt never enters the translation flow** (see below) |
| Math accessible name | MathJax **SVG** output, `role="img" focusable="false"`, **no `aria-label`, no `<title>`, no assistive MathML** (0 `mjx-assistive-mml`, 0 `<math>` in output) | `tools/lib/mathjax-render.js` converts MathML→SVG but attaches no accessible name |
| Long descriptions | 0 `aria-describedby` / `longdesc` | Mitigated by long alt; matters only for a few complex multi-panel diagrams |

## Item 1 — Translate figure alt text to Icelandic

**Diagnosis (confirmed in code):** `cnxml-extract.js` reads the `<media>`/`<image>` `alt` attribute into the structure JSON as metadata (`cnxml-extract.js:194, 1005, 1045` — `alt: mediaAttrs.alt || imageAttrs.alt`), but it is **never emitted as a translatable EN segment** into `02-for-mt/`. `cnxml-inject.js` re-injects it verbatim (`cnxml-inject.js:974, 1824, 2930`), and `cnxml-render.js` emits it verbatim. So the original OpenStax English alt survives the entire pipeline untouched.

**The fix is a pipeline change, not a content edit:** route the `alt` string through the same extract → MT → faithful-review flow that body segments use, so it accumulates a reviewed Icelandic translation that inject/render then emit.

**Hard constraint:** alt translations must go through the **Málstaður API**, never AI-generated — same rule as all other translations ([[feedback-translations-api-only]]). They are also editorial assets and should be human-reviewable in the segment editor like any other segment, not silently auto-applied.

**Open design questions for the implementing session:**
- Emit `alt` as its own segment type in `02-for-mt` (so it shows in the editor with an "alt text" badge), vs. a lighter-weight side-channel. Segment-type is more consistent with the existing flow and gets four-eyes review for free.
- Marker safety: alt strings are plain prose (no `[[i:]]`/`[[xref:]]` markers expected), so API survival should be a non-issue — verify on a sample.
- Backfill: ~1581 existing alts across all books need a first translation pass once the pipeline emits them. Scope this as content work after the pipeline change lands.

## Item 2 — Give math an accessible name (assistive MathML)

**Diagnosis:** `tools/lib/mathjax-render.js` does `doc.convert(cleanMml, { display })` with **SVG output** and returns a self-contained SVG. The source is already MathML (`MathML → SVG`, per the file header) — so the MathML needed for accessibility **already exists at convert time** and is simply discarded.

**Recommended fix — assistive MathML, not native-MathML rendering.** Keep the SVG for visual display; additionally emit a visually-hidden MathML block beside it so MathML-capable AT (VoiceOver, NVDA, JAWS, Orca) can read and navigate the expression. This is MathJax's standard `assistiveMml` pattern (a visually-hidden `<mjx-assistive-mml>` sibling of the SVG). Do **not** switch display to browser-native MathML — support is still uneven and it would regress visual quality.

**Why this is cheap and high-value:**
- The MathML is the **input** to `mathjax-render.js`, so emitting it costs little — wrap the existing convert with the assistive-MathML option, or append the cleaned MathML as a hidden sibling node.
- **Math notation is language-neutral** — unlike alt text, no translation pass is needed. Lowest-effort, highest-impact item in the audit.
- The change is localized to `tools/lib/mathjax-render.js` (+ its `__tests__/cnxml-render.test.js` math assertions), and triggers a re-render of affected modules.

**Fallback if assistive-MathML DOM weight is a concern** on equation-dense pages: at minimum add an `aria-label` (or SVG `<title>`) to each container from the source. Flat string, no sub-expression navigation — prefer assistive MathML.

**Re-render caution:** any math-output change will renumber MathJax SVG `MJX-NN` ids across re-rendered files — cosmetically noisy diffs even where visuals are unchanged (same `data-latex`). This is the known pattern from the objectives re-render ([[objectives-page-data-pending]]); expect it and don't mistake it for a content change.

## Scope boundary

- **efni (this repo):** both items above — alt-translation pipeline + assistive MathML. These are the substantive fixes.
- **vefur (sister repo):** the app-shell WCAG-AA pass and validating paginated reading order with a real screen reader — tracked there as P2.5; not part of this handoff.
- **Sync reminder:** after re-rendering, content reaches namsbokasafn.is via the 2h backup cron + Sync Action, or manual `node scripts/sync-content.js --source ../namsbokasafn-efni` from vefur ([[content-sync-vefur-broken]]).

## Suggested sequencing

Item 2 (math) first — it's smaller, self-contained in `mathjax-render.js`, needs no translation, and delivers the more severe accessibility win. Item 1 (alt) is a larger pipeline + backfill effort gated on Málstaður API translation of ~1581 strings.
