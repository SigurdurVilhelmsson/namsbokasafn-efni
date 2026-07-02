# Fable 5 Fidelity & Provenance Review — efnafraedi-2e certification pipeline

**Date:** 2026-07-02
**Method:** Multi-agent Claude Fable 5 workflow (`wf_cfabe670-37e`) — 5 independent finders (one per pipeline seam: check-semantics, allowlist-honesty, inject, extract, provenance) → adversarial verification (each finding a Fable-5 skeptic tried to *refute*) → synthesis/dedupe/rank. 11 agents, 0 errors, ~1.0M subagent tokens.
**Independent confirmation:** The three published-HTML marker-residue classes (`[[TABLE:]]`, `[[math:N]]`, `[[i:]]`) and the admin source-overwrite guard were spot-checked by hand and reproduced exactly (see grep evidence in session transcript).
**Bottom line:** 22 findings survived adversarial verification, deduped to 15 ranked (13 CONFIRMED, 2 PLAUSIBLE).

> **Verdict:** "119/148 PERFECT / green" is **not** a losslessness guarantee. The fidelity check compares only the multiset of opening-tag *names* (MathML collapsed, attributes/text/order ignored), so real reader-visible corruption sits inside the "PERFECT", "benign", and "green" labels. Treat the manifest as "tag counts reconciled", not "faithful", until findings 1–5 land.

---

# Fidelity & Provenance Review — efnafraedi-2e certification pipeline

## Executive summary

**Is the "119/148 PERFECT / green manifest" claim trustworthy? No — not in the sense the word "PERFECT" implies.**

The fidelity check compares only *how many opening tags of each element name* exist in source vs. translated CNXML (MathML collapsed to `<m:math/>`, attributes and text ignored, order ignored). "PERFECT" therefore means "same bag of tag names", not "faithful". That narrowness is a design gap you were never told about — and verified counterexamples show it is not theoretical:

- **~15–36 certified-PERFECT modules have structurally reordered content** (intro paragraphs and worked examples moved below the subsections they introduce), live in published HTML today.
- **Certified-PERFECT modules ship literal pipeline junk to readers**: `[[TABLE:fs-id...]]`, `[[i:...]]`, and `[[math:N]]` strings appear as visible text on published pages.
- **Several "benign" allowlist entries are factually false**: they carry the reason "text + inline formatting present in output" while the actual bytes show glossary subscripts flattened or re-anchored mid-word (E_a → "Ea", "Avogadrosartala" → "<sub>A</sub>vogadrosartala") — including on the **faithful** (citable) track.
- **Separately from certification, one admin endpoint can overwrite the irrevocable CC BY copies under `01-source/`** with today's upstream bytes, with at most one generic confirmation and no code enforcement of your double-consent rule.

What IS true: the "green = zero unexplained" arithmetic is internally consistent for the net numbers it tracks, the known-loss-deferred entries are honestly surfaced, and no live math corruption was found. The problem is that the certified vocabulary (PERFECT, benign, green) promises far more than the check measures, and real reader-visible damage sits inside every one of those labels.

**Before onboarding biology**, the extract-reordering bug (finding 1) and the fetch-source guard (finding 2) matter most: the first will deterministically corrupt biology's reading order while stamping it PERFECT; the second is a one-click, hard-to-detect destruction of your legal baseline.

The findings below are deduped from five independent review seams and ranked by real risk. "Bug" vs "design gap" is called out per finding.

---

## HIGH severity

### 1. Extraction reorders section content; the check cannot see it; scrambles are live and certified PERFECT — **bug + design gap, CONFIRMED**
- **What:** In any section that has paragraphs/examples/equations *before or between* nested subsections, `processSection()` in the extractor pushes all subsections first and the loose content after — discarding document order. Injection faithfully rebuilds the wrong order. Because the fidelity check compares only a tag-name multiset, pure reordering is invisible and the module certifies PERFECT.
- **Why:** `tools/cnxml-extract.js:685` pushes nested sections before sibling content with no position sort (the module top level *does* position-sort — the section level just never got the same fix). `tools/cnxml-fidelity-check.js:51` counts tag names only.
- **Impact:** Verified in m68702 (ch03: "Percent Composition" intro + worked example relocated below the following subsection) and m68833 (ch18: a section's opening sentence becomes its closing sentence), both live in published HTML. Scans found 21–50 affected modules depending on method, ~15–36 of them in the certified-PERFECT set. Deterministic: every re-render (WS5) and every biology extract reproduces it.
- **Where:** `tools/cnxml-extract.js:685` (root cause); `tools/cnxml-fidelity-check.js:51` (blindness).
- **Next step:** Port the top-level position-sort (extract lines ~512–525) into `processSection()`, re-extract/re-inject, and add an id-order (LCS) comparison to the fidelity check — do this before biology and before the WS5 re-render.

### 2. Admin fetch-source can overwrite the CC BY `01-source/` copies with near-zero friction — **bug (missing guard), CONFIRMED**
- **What:** `POST /api/admin/books/:slug/fetch-source` re-downloads upstream and `copyFileSync`s over `books/{book}/01-source/`. The only guard counts *faithful/localized* segment files: a book with a full MT translation but no faithful segments gets **zero** confirmation; otherwise a single generic `confirmed:true` suffices. It also overwrites `.source-info.json` (the recorded fetch-date licence basis). Your CLAUDE.md triple-consent rule exists nowhere in code, and there is no checksum manifest — the fidelity tooling compares against `01-source` *as it is now*, so a swapped source re-certifies green.
- **Impact:** One click silently replaces the irrevocable CC BY bytes with current CC BY-NC-SA upstream — the exact catastrophe the repo's top rule exists to prevent — recoverable only by git archaeology and undetectable by any certification tool. Biology/microbiology (also CC BY, likely zero faithful segments) are in the zero-confirmation bucket.
- **Where:** `server/routes/admin.js:311`; guard logic `server/services/pipelineService.js:598–637`; unconditional copy in `tools/download-source.js` (~lines 191/208/225).
- **Next step:** Make the endpoint refuse to overwrite an existing `01-source/` (require a separate, explicitly named force path or remove overwrite entirely), and commit a SHA-256 manifest of `01-source/` that CI/fidelity tooling verifies.

### 3. The "benign" allowlist class masks verified reader-visible corruption, including on the faithful track — **process failure + inject bug, CONFIRMED**
- **What:** The 28 "benign" entries were classified per tag *family* with one boilerplate reason ("text + inline formatting present in output"), never verified per instance. Byte-level checks falsified that reason in at least 6 modules: glossary `<sub>` markers flattened to plain text or re-anchored mid-word (m68741 "ΔHgrind"; m68793 "virkjun<sub>a</sub>rorka (Ea)"; m68733, m68805, m68700 "<sub>A</sub>vogadrosartala (NA)"), and a `<term>` anchor dropped (m68789). The m68700 corruption is published on the **faithful** key-terms page — the academically citable asset.
- **Why:** The tag-count check can't distinguish "formatting artifact" from "formatting destroyed" (a mis-anchored `<sub>` balances the multiset), and the WS2 plan prescribed family-level boilerplate with no instance verification step.
- **Impact:** The green manifest makes provably false factual assertions; the two-of-two failed spot-checks bound how much the whole benign class can be trusted. Readers see corrupted chemical notation on published glossary pages today.
- **Where:** `books/efnafraedi-2e/fidelity-allowlist.json:41` (and :104); underlying inject term/marker re-anchoring bug.
- **Next step:** Re-triage all 28 benign entries with an actual source-vs-output text diff per instance (a one-off script can do it), and fix the glossary sub/emphasis re-anchoring in inject.

### 4. Unexpanded `[[TABLE:id]]` placeholders publish as literal text; tables are torn out of their exercises; 3 of 6 affected modules certified PERFECT — **bug, CONFIRMED**
- **What:** Inject deliberately keeps `[[TABLE:id]]` for `buildPara` to expand — but `buildExerciseDom` never expands it and then strips the original table from the exercise; the table re-enters as a sibling, so tag counts match. The completeness gate checks segments, `[[MATH:N]]`, and EN residue — never `[[TABLE:]]`. The EN-residue detector actively *strips* bracket markers before scanning, so no gate anywhere catches this.
- **Impact:** 13 live placeholders across 6 modules (m68764, m68770, m68789, m68791, m68793, m68829); verified verbatim in published HTML (e.g. `05-publication/mt-preview/chapters/12/12-4-heildud-hradalogmal.html:152` shows `[[TABLE:fs-idm140502592]]` as paragraph text). m68764/m68770/m68829 are certified PERFECT under green:true. Re-render re-emits it.
- **Where:** `tools/cnxml-inject.js:1136` (kept placeholder), ~2645/2683 (exercise path never expands, then strips table).
- **Next step:** Add `[[TABLE:]]` expansion to the exercise/example/note paths (or fail the completeness gate on any surviving `[[TABLE:`), then re-inject the 6 modules.

### 5. Nested `[[i:[[link:...]]]]` markers never resolve: literal `[[i:` published, emphasis lost — and the resulting diff is allowlisted "benign" — **bug, CONFIRMED**
- **What:** The bracket-marker loop only converts a marker whose content contains no other `[[...]]`; `[[link:]]` conversion runs once *after* the loop with no second emphasis pass. So `[[i:[[link:text|url]]]]` leaves the outer marker as raw text and loses the `<emphasis>`. In m68811 two emphasis elements are lost but a gain elsewhere nets to -1, which the allowlist classifies benign ("text + inline formatting present in output").
- **Impact:** Published `15-exercises.html` lines 101/110 show readers `Í [[i:<a ...>Handbook of Chemistry and Physics</a>]]` — raw marker garbage — while the manifest stays green.
- **Where:** `tools/cnxml-inject.js:1154` (leaf-only regex), ~1301 (single late link pass).
- **Next step:** Run the emphasis/bracket pass again after link conversion (or treat `[[link:]]` as a convertible leaf), and add a "no `[[` residue in output" assertion to the completeness gate.

---

## MEDIUM severity

### 6. Term annotation lowercases `[[MATH:N]]` → unrestorable `[[math:N]]` literals in published prose and key-terms pages — **bug, CONFIRMED**
- **What:** `annotateInlineTerms` (and the glossary path) strip other markers but not `[[MATH:]]` before `.toLowerCase()`; the restore regex and completeness gate match uppercase only. The annotation adds text only, so tag counts are unchanged → PERFECT.
- **Impact:** Live reader-visible junk, e.g. `5-3-vermi.html:273` "(e. standard enthalpy of formation [[math:23]])" and four `[[math:N]]` literals on each of the ch05/ch17 key-terms pages; m68747 and m68823 are certified PERFECT.
- **Where:** `tools/cnxml-inject.js:827` (inline) and ~1667 (glossary).
- **Next step:** Strip `[[MATH:N]]` in both strip-chains (or make the restore/gate regexes case-insensitive) and re-inject the affected modules.

### 7. Allowlist matching is a bare signed integer per (module, tag) — no track, no cause fingerprint, and offsetting changes net to zero — **design gap, CONFIRMED**
- **What:** `classifyDiff` matches only `moduleId + tag + net diff`. Consequences, all demonstrated: (a) an entry minted from mt-preview triage auto-explains a same-numbered diff on the **faithful** track that was never inspected (live: `--track faithful` prints m68700 `emphasis -1 [benign]`, exit 0); (b) a future different cause producing the same integer stays "explained" with a stale reason; (c) dropping one `<para>` and duplicating another yields diff 0 → PERFECT, and the 2026-03-30 duplicate-figure bug was exactly that shape.
- **Impact:** The "green = zero unexplained, drift fails loud" guarantee only covers changes in the *net number* — not cause, track, or composition. The citable faithful track currently inherits mt-preview triage labels.
- **Where:** `tools/lib/fidelity-allowlist.js:21–25`.
- **Next step:** Add a track field to allowlist entries and a lightweight fingerprint (e.g. the ids or nearest-id context of the differing elements) so a changed cause breaks the match.

### 8. All MathML interiors are stripped before counting — equations are entirely unprotected — **design gap, CONFIRMED**
- **What:** Every `m:math` block is collapsed to `<m:math/>` before tag counting, so garbling a digit (180.159 → 18.0159, demonstrated) or replacing one equation's contents with another's certifies PERFECT.
- **Impact:** No live damage found (the only changed math blocks in certified modules are `>`→`&gt;` re-escaping), but this is zero protection for a chemistry book's densest content class — and WS4 (math-label substitution) is about to *edit* math regions with this as its only safety net.
- **Where:** `tools/cnxml-fidelity-check.js:44`.
- **Next step:** Before starting WS4, add a normalized-math-content comparison (hash each math block after whitespace/entity normalization) to the fidelity check.

### 9. Attribute loss is invisible: a certified-PERFECT module already carries a broken cross-document link — **design gap with a live instance, CONFIRMED**
- **What:** The tag regex captures element names only; all attributes are discarded. m68692 (certified PERFECT) lost `document="m68859"` from its Appendix-A link — the remerge-grade CNXML now encodes a cross-document reference as a same-page anchor. Glossary id rewrites (m68664) are equally invisible. A render-time appendix rescue map masks the reader impact *for appendix targets only*.
- **Where:** `tools/cnxml-fidelity-check.js:51`; live instance `books/efnafraedi-2e/03-translated/mt-preview/ch02/m68692.cnxml:92`.
- **Next step:** Add an attribute-sensitive comparison for `<link>` (`document`, `target-id`, `url`) — small, high-value, and exactly the class that produces silent dead links.

### 10. The faithful track — the human-verified citable deliverable — has no fidelity record in the manifest at all — **design gap, CONFIRMED**
- **What:** `translation-errors.json` contains only `tracks['mt-preview']`; the manifest is regenerated only on inject, and faithful hasn't been re-injected since the track-qualified format landed. Yet faithful CNXML exists (4 modules) and its HTML is published — and the one faithful module with a diff (m68700) carries the corrupted Avogadro glossary term.
- **Where:** `tools/lib/update-translation-errors.js:138` (per-track write), :197–205 (legacy shapes silently dropped).
- **Next step:** Run the fidelity check/manifest update for the faithful track explicitly, and make manifest "green" cover every track that has published output.

### 11. Tables (and equations/examples) nested inside `<note>` are silently relocated outside the note — **bug, CONFIRMED**
- **What:** `processNote()` extracts only title/paras/lists, so a note's table isn't in the structure tree; inject then strips tables from the rebuilt note and re-emits them at section level. The table appears exactly once either way → PERFECT.
- **Impact:** m68795 (ch12): the enzyme-classification table moves from inside its note to after it — grouping/placement lost in certified output. Data survives, hence medium.
- **Where:** `tools/cnxml-extract.js:1416`; strip at `tools/cnxml-inject.js:2810`.
- **Next step:** Extend `processNote()` to capture table/equation children in position (same pattern as the 2026-03-30 figures-in-para fix).

---

## LOW severity

### 12. The standalone fidelity CLI exits 0 no matter how many modules were skipped or filtered to nothing — **design gap, CONFIRMED**
- **What:** `main()` gates the exit code only on unexplained discrepancies; `--track faithful` prints "Checked: 4 / Skipped: 145" and exits 0, and a nonexistent `--module m99999` (Checked: 0) also exits 0. The manifest generator deliberately closed this exact hole (`green` requires `skippedUntranslated === 0`); the CLI didn't. No script consumes the CLI exit code today, which is why this is low — but it's a loaded footgun for biology onboarding.
- **Where:** `tools/cnxml-fidelity-check.js:298` vs. `tools/lib/update-translation-errors.js:135`.
- **Next step:** Add `--strict` (or default) behavior: nonzero exit when skipped > 0 or checked == 0.

### 13. `countTags` never counts closing tags and can't match hyphenated names like `md:content-id` — **design gap, CONFIRMED**
- **What:** The regex's name class lacks `-` and only matches opening tags, so an unclosed `<para>` or a dropped `<md:content-id>` (the module's OpenStax-remerge identity) certifies PERFECT. No live instance; latent guard gap.
- **Where:** `tools/cnxml-fidelity-check.js:51`.
- **Next step:** Add `-` to the name class and a cheap well-formedness parse (the DOM lib is already a dependency).

### 14. Known-loss-deferred "pointers" are validated only for truthiness — free prose passes — **design gap, PLAUSIBLE**
- **What:** The mandatory pointer check is `!e.pointer`; nothing resolves the pointer, so if the referenced plan doc is archived, the four deferred real losses stay green-explained behind dangling strings forever. All four pointers are currently meaningful, so harm is prospective.
- **Where:** `tools/lib/fidelity-allowlist.js:29`.
- **Next step:** Require pointers to be repo-relative paths and add a test that they resolve.

### 15. `translation-errors.json` (a certification artifact) is under `merge=ours` — a conflicting merge silently keeps stale results — **acknowledged tradeoff, PLAUSIBLE**
- **What:** On a both-sides-changed merge the losing side's fresher fidelity results are discarded until the next inject regenerates the file. Deliberate and documented; self-healing; but a committed "green" can briefly represent a stale check.
- **Where:** `.gitattributes:13`.
- **Next step:** Accept as-is, but have deploy/QA read the per-track `generated` timestamp rather than trusting green alone.

---

## What to do first (practical order for one person)

1. **Guard `01-source/`** (finding 2) — small change, closes the only irreversible risk.
2. **Fix extract section ordering + add order check** (finding 1) — before biology extraction and before the WS5 re-render, or you bake the scramble in again.
3. **Fix the three marker-residue inject bugs** (findings 4, 5, 6) and add "no `[[` in output" to the completeness gate — turns three classes of published junk into hard failures.
4. **Re-triage the benign allowlist with byte diffs** (finding 3) and add track+fingerprint to entries (finding 7).
5. **Add math-content hashing** (finding 8) before WS4 touches equations.

Until 1–4 land, treat "PERFECT / green" as "tag counts reconciled", not "faithful" — and don't cite it to anyone as a losslessness guarantee.
