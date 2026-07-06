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

#### (b3) — SAME bug class in `renderSection` + `renderNote` (found during fix, advisor-flagged)

The identical `[^<]+` title regex also lived in `renderSection` (~935/941), `renderNote`
(~1439/1448), and a non-reader-facing end-of-chapter extractor (~2342). These are the *same
root cause* with a **different symptom**: because these matchers are *unanchored* (first
`<title>` anywhere in the block), a markup section/note title didn't leak — it was **dropped or
mis-captured**:
- `renderSection`: a section whose own title had markup (`K<sub>sp</sub> og leysni`,
  `<em>sp</em><sup>2</sup>-blending`) failed `[^<]+`, so the regex matched the *next plain
  title deeper in the section* — a nested example's "Lausn" — and rendered **"Lausn" as the
  section `<h2>"**, or dropped the heading entirely (8-2 lost 4 hybridization headings).
- `renderNote`: a markup note title (`Koffínlosun … CO<sub>2</sub>`) rendered no `<h4>`.

The count>1 leak-scan was blind to this (no leaked `<title>` element). Fixed by the minimal
`[^<]`→`[\s\S]` swap (preserving the unanchored first-title semantics; NOT the anchored
`matchLeadingTitle`). Reader-facing improvement across **6 additional files** (8-2, 10-4, 15-1,
16-2, 16-4, appendices-2). Regression test: `cnxml-render-note-dom.test.js` markup-title case.
This makes fix (b) a real bug-*class* fix, matching the plan's "consolidate the title regexes"
intent.

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
`m68727` (ch05), `m68789` (ch12), `m68793` (ch12), `m68801` (ch13). All mt-preview (pure MT, no
human review at risk).

**UPDATE — the extraction code is ALREADY FIXED; this is stale data, and the resolution is
DEFERRED to Track B4 (lead decision 2026-07-06).** `cnxml-extract.js` lines ~797–804 (the **OC-E
fix, #227, merged 2026-07-04**) strip lists before extracting standalone paras precisely to stop
this double-hoist — the code comment names the exact "re-emitted AFTER the list" bug. m68793's
committed `structure.json` is from a **March** backup, predating OC-E; WS5 re-*injected* from that
stale structure but never re-*extracted*, so the duplication persisted into published HTML.
**Proven:** re-extracting m68793 with current code removes the double-record from `structure.json`
entirely (0 duplicated top-level paras).

So there is **no code fix** — resolution is a re-extract. But re-extraction changes the MT
**segment boundaries** substantially (probe on m68793: 51 insertions / 108 deletions in
`m68793-segments.en.md`) → the existing MT output goes stale → the module needs **re-MT**. That
collides with the standing rule *"full re-MT only after Track B4"* (the same rule that deferred
RC3/RC4). **Lead decision: DEFER signature (a) to Track B4**, which re-extracts the whole book with
the OC-E-fixed code and re-MTs — the 5 modules self-correct then. A targeted re-MT-now was rejected
(re-translates 5 whole modules wholesale to fix a localized duplication) and an inject/render dedup
stopgap was rejected (workaround downstream of an already-fixed root cause). Registered as a
known-residual alongside RC3/RC4.

## NON-issues (do not chase)
- The **double `</aside>`** in rendered 12-5 is *correct* nesting (check-knowledge note-aside
  closes, then the example aside closes). Not a defect.
- Signature (a) is **not** an injection bug (injection is faithful), **not** a live code bug
  (OC-E already fixed extraction), and **not** the same bug as (b). Different stage, different
  modules (15 for (b) vs ~5 for (a)), different resolution.

## Outcome / status
1. **(b) render fix — DONE, PR #238** (b1 title-leak + b2 escaped-table + b3 section/note
   heading). Reader-facing; gate-verified; awaits lead merge + sync/deploy.
2. **(a) extraction double-record — DEFERRED to Track B4** (stale March structure; OC-E already
   fixes the code; re-extract needs re-MT → B4). Registered as a known-residual with RC3/RC4.
   Until B4, 12-5 (and the other 4 mt-preview modules) will still show the list/equation
   duplication in published HTML — a known, tracked gap, not a regression from (b).
