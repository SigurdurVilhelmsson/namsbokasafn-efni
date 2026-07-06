# WS5 residual reader-visible corruption — root-cause diagnosis (2026-07-06)

**Trigger:** vefur→efni handoff (`efni-ws5-handoff-2026-07-06`) update block. User QA of
published ch12 found reader-visible corruption **still present after WS5** (PR #237). The
handoff asked efni to diagnose; this doc is that diagnosis. All corruption is **pre-existing
and already LIVE** on namsbokasafn.is — WS5/sync did not introduce it. No emergency; deploy of
WS5 is still net-positive per the handoff.

Diagnosed on branch `chore/efnafraedi-ws5-reinject-rerender-v2` (b1541400), following
`systematic-debugging`. Root causes verified against source, injected CNXML, structure.json,
and render code — not inferred.

## Two independent bugs, three mechanisms, in TWO different pipeline stages

The reader QA lumped everything as "corruption," but it is **two unrelated defects**:

### Signature (b) — RENDER stage (`tools/cnxml-render.js`, `renderExample`) — 15 modules

Symptom (worked-example, e.g. 12-5 m68793 "Dæmi 12.13"):
- The example's real title leaks into the body as a **literal `<title>…</title>`** inside the
  first `<p>`.
- A generic **`<h4>Lausn</h4>`** ("Solution") appears where the example heading should be, and
  the "Lausn" content is separated from its (mis-hoisted) heading.
- The example's **data-tables render OUTSIDE** the `<aside class="example">`.

Two distinct mechanisms, both in `renderExample`:

1. **Title regex can't handle inline markup.** Lines ~1487 / 1496 / 1517 / 1524 / 1529 use
   `/<title>([^<]+)<\/title>/`. `[^<]+` stops at the first `<`, so a title containing child
   elements — `<title>Ákvörðun á <emphasis>E</emphasis><sub>a</sub></title>` — **never
   matches**. Consequences: (i) the title-extraction loop skips the real first-para title and
   falls through to the next para whose title is *plain text* (`Lausn`), so `Lausn` wrongly
   becomes the `<h4>`; (ii) `paraHandler` also fails to match, so the real title is never
   stripped and leaks as literal text.
   **Evidence:** all 15 leaked body-`<title>`s contain `<em>`/`<sub>`/`<sup>`/math markup; zero
   plain-text counter-examples. 15 modules match the handoff list exactly:
   `5-3, 9-5, 12-1, 12-5, 13-2, 14-1/2/3/4, 15-1, 16-2/3/4, 7-6, appendices-2`.

2. **No `table` handler in the example dispatch map.** `renderExample` calls
   `renderBlockChildrenInOrder` with handlers for `para, note, list, equation, figure, media`
   — no `table`. In both source and injected CNXML the tables sit **inside** the `<example>`,
   but with no dispatcher they hit the "loud seam" (L1368–1378): recorded to
   `undispatchedBlocks`, **not emitted in place**. The section-level table pass then renders
   them *after* the aside closes.
   **Fix note:** adding a `table` handler must also register the table ids so the section pass
   skips them (mirror the existing `renderedFigureIds` mechanism) to avoid double-render.

**Delivery cost:** render-only — code fix + re-render (no re-inject) + golden/baseline regen +
gate verification.

### Signature (a) — EXTRACTION stage (`tools/cnxml-extract.js`) — ~5 modules

Symptom (12-5 m68793): the 3 collision-theory postulates render **twice** — once as the
numbered `<ol>` and again as flattened `<p>` + `<div class="equation">`.

**Root cause:** the OpenStax source uses block-level content inside list items:
`<item><para id="fs-idm136564352">…</para><equation/></item>`. Extraction **double-records**
this: `structure.json` stores the item text in `list.items[]` (as synthetic item segments) AND
emits the same inner `<para>`/`<equation>` as **standalone top-level `content[]` blocks**
(`content[3]/[5]/[6]` for m68793). Injection and render faithfully reproduce both copies.
**Verified:** injected `03-translated/mt-preview/ch12/m68793.cnxml` shows list-with-flat-items
then the 3 duplicate paras+equation; `structure.json` shows the list plus the 3 top-level paras.
This is the known "nested para/list still partial" limitation (memory `nested-list-limitation`).

**At-risk population (source `<item>` with a block child):** 5 modules — `m68710` (ch04),
`m68727` (ch05), `m68789` (ch12), `m68793` (ch12), `m68801` (ch13). Per-module confirmation of
actual duplication still needed for the other 4.

**Delivery cost:** extraction-only fix, but re-extract → re-inject → re-render for the affected
modules + gate verification (more delicate than (b); touches the generated 02-structure and
03-translated stages).

## NON-issues (do not chase)
- The **double `</aside>`** in rendered 12-5 is *correct* nesting (check-knowledge note-aside
  closes, then the example aside closes). Not a defect.
- Signature (a) is **not** an injection bug (injection is faithful) and **not** the same bug as
  (b). Different stages, different modules (15 for (b) vs ~5 for (a)), different fixes.

## Recommended sequencing
1. **(b) render fix first** — higher impact (15 modules), lower risk (render-only), one PR.
2. **(a) extraction fix second** — separate PR; needs re-extract/re-inject/re-render.
Each as its own brainstorm → plan → PR per the chemistry-clean-slate workflow; both fold into a
WS5-style re-render (b) / re-inject+re-render (a) with golden regen + gate verification, then the
lead's sync+deploy.
