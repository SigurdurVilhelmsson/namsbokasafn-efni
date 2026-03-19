# CNXML Fidelity Fixes — Remaining Issues

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce full-book fidelity discrepancies from 533 → 0 (or documented known-limitations).

**Baseline:** 68 modules checked, 36 PERFECT (53%), 32 with discrepancies.
**Prior work:** PR #54 fixed term overproduction, SEG corruption, equation wrappers, cross-doc links, bare emphasis. Ch01 went from 70 → 2 discrepancies.

**Architecture:** Fixes are in 3 pipeline tools (`cnxml-extract.js`, `cnxml-inject.js`, `api-translate.js`) plus the fidelity check tool. Each fix follows: investigate → write test → implement → verify with fidelity check. After fixing extraction/injection bugs, affected chapters must be **re-extracted and re-injected** (not re-translated — MT output is unchanged).

**Spec:** `docs/superpowers/specs/2026-03-18-cnxml-fidelity-fixes-design.md`

---

## Issue Summary (by root cause)

| # | Issue | Discrepancies | Root Cause | Fix Location |
|---|-------|---------------|------------|--------------|
| F1 | `<newline/>` loss | ~120 | **MT API** drops `[[BR]]` in ch09-13 | `api-translate.js` post-processing |
| F2 | `<image>`/`<media>` loss | ~94 (47+47) | **Injection** HTML-escapes images inside exercises | `cnxml-extract.js` + `cnxml-inject.js` |
| F3 | `<para>` loss in tables | ~49 | **Extraction** flattens multi-para table cells | `cnxml-extract.js` processTable() |
| F4 | `<title>` loss | ~11 | **Extraction** regex rejects titles with inline XML | `cnxml-extract.js` title regex |
| F5 | `<sub>`/`<sup>` loss | ~40 | **Injection** regex lookbehind edge cases | `cnxml-inject.js` reverseInlineMarkup() |
| F6 | `<sub>`/`<sup>` overproduction | ~35 | **MT API** adds/removes caret/tilde markers | `api-translate.js` post-processing or accept |
| F7 | `<m:math>` overproduction | ~41 | **Injection** restoring math from wrong metadata | `cnxml-inject.js` math restoration |
| F8 | `<emphasis>` mixed | ~20 | **MT API** shifts `*`/`**` markers | Accept or post-processing |
| F9 | `<entry>`/`<list>`/`<item>` loss | ~8 | Likely related to F3 (table cell structure) | Covered by F3 fix |
| F10 | `<footnote>` loss | ~2 | **MT API** or injection edge case | Investigate |
| F11 | `<link>` loss | ~2 | Unknown — not cross-doc (those were fixed) | Investigate |
| F12 | `<space>` loss | ~4 | **MT API** drops `[[SPACE:N]]` markers | Accept or post-processing |

---

## File Map

| File | Action | Issues |
|------|--------|--------|
| `tools/cnxml-extract.js` | Modify | F2, F3, F4 |
| `tools/cnxml-inject.js` | Modify | F2, F3, F5, F7 |
| `tools/api-translate.js` | Modify | F1 (post-processing) |
| `tools/cnxml-fidelity-check.js` | Modify | Bug: sub tag counts include MathML internals? |
| `tools/__tests__/pipeline-integration.test.js` | Modify | Regression tests for all fixes |

---

## Task 1: Fix title extraction regex (F4) — EASY WIN

**Root cause:** Line ~595 in `cnxml-extract.js` uses `/<title>([^<]+)<\/title>/` which fails when titles contain inline XML like `<emphasis>` or `<sup>`. Affects m68745 (ch08, -4 titles), m68727 (ch05, -2), m68758 (ch09, -1), m68786 (ch12, -1), m68793 (ch12, -1), m68860 (appendices, -2).

**Fix:** Change `[^<]+` to `[\s\S]*?` (non-greedy match allowing nested tags), then process the title content through `extractInlineText()` to convert inline markup to segment format.

- [ ] **Step 1:** Write a test case with a title containing `<emphasis>` and `<sup>` that currently fails extraction
- [ ] **Step 2:** Fix the regex in `cnxml-extract.js`
- [ ] **Step 3:** Verify: re-extract ch08, re-inject, fidelity check m68745 — title count should match
- [ ] **Step 4:** Run full test suite (`npm test`)

---

## Task 2: Fix newline loss via post-processing (F1) — HIGHEST VOLUME

**Root cause:** The Málstaður API drops `[[BR]]` markers in some translations (ch09-13). Markers are correctly extracted into EN segments but vanish from IS output. Chapters 1-8 are unaffected (may have been translated with different API settings or earlier API version).

**Fix strategy:** Post-process in `api-translate.js`: for each segment, compare `[[BR]]` count in EN input vs IS output. If the IS output has fewer, **re-insert** the missing `[[BR]]` at line-break positions (or at the same relative positions as in the EN). If no good heuristic, warn and leave a marker comment.

**Alternative:** Accept as MT limitation and re-translate affected chapters after contacting Málstaður about marker preservation. This may be more practical since `[[BR]]` positions are content-dependent.

- [ ] **Step 1:** Investigate 2-3 specific segments from m68789 to understand the `[[BR]]` loss pattern — are they at paragraph boundaries? mid-sentence? consistent positions?
- [ ] **Step 2:** Decide on fix approach: post-processing heuristic vs. re-translation vs. accept-and-document
- [ ] **Step 3:** If fixable: implement per-segment `[[BR]]` repair in `api-translate.js` post-processing
- [ ] **Step 4:** Verify on affected modules
- [ ] **Step 5:** Run full test suite

---

## Task 3: Fix image/media loss in exercises (F2) — HIGH IMPACT

**Root cause:** Images inside `<exercise>` elements (problems and solutions) are being HTML-escaped during injection. The translated CNXML contains literal `&lt;media ...&gt;` text instead of actual `<media>` XML elements. Affects m68693 (ch02, -10), m68700 (ch03, -11), m68713 (ch04, -2), m68744 (ch08, -3), m68745 (ch08, -6), m68746 (ch08, -1), m68751 (ch09, -1), m68791 (ch12, -4), m68795 (ch12, -8), m68801 (ch13, -1).

**Investigation needed:** The extraction puts exercise images into segments as raw CNXML. The injection XML-escapes segment content when building `<para>` elements, which corrupts the embedded `<media>` tags. The fix likely involves extracting exercise images as placeholders (like `[[MATH:N]]`) or processing them separately in the structure.

- [ ] **Step 1:** Read the extraction code for exercises — how are images inside `<problem>` and `<solution>` handled?
- [ ] **Step 2:** Read a specific escaped example in m68693 translated output to confirm the escaping pattern
- [ ] **Step 3:** Design the fix: either (a) extract exercise images as placeholders with metadata in manifest, or (b) mark image segments specially so injection doesn't escape them
- [ ] **Step 4:** Write failing test
- [ ] **Step 5:** Implement fix in extraction + injection
- [ ] **Step 6:** Re-extract and re-inject m68693, verify fidelity
- [ ] **Step 7:** Run full test suite

---

## Task 4: Fix para loss in table cells (F3) — MEDIUM

**Root cause:** `processTable()` in `cnxml-extract.js` calls `extractInlineText()` on entire cell content, flattening multi-paragraph cells into a single segment. The `<para>` structure inside `<entry>` elements is destroyed. Affects m68710 (ch04, -19), m68789 (ch12, -15), m68801 (ch13, -15).

**Fix:** Refactor `processTable()` to detect multi-paragraph cells and extract each `<para>` as a separate segment, similar to how `processNote()` handles nested paragraphs. The injection's `buildTable()` must then reconstruct the multi-para cell structure.

**Complexity:** Medium-high — changes the segment structure for table cells, which may affect existing translations.

- [ ] **Step 1:** Read `processTable()` and `buildTable()` to understand current approach
- [ ] **Step 2:** Check how many existing translated modules have multi-para table cells (scope the blast radius)
- [ ] **Step 3:** Write failing test with a table cell containing 2+ paragraphs
- [ ] **Step 4:** Implement multi-para cell handling in extraction
- [ ] **Step 5:** Update `buildTable()` in injection to reconstruct para structure
- [ ] **Step 6:** Verify: re-extract ch04, re-inject, fidelity check m68710
- [ ] **Step 7:** Run full test suite

---

## Task 5: Fix sub/sup injection regex (F5) — MEDIUM

**Root cause:** The lookbehind regex `(?<=[^\s~])~([^\s~]{1,15})~` requires a non-whitespace, non-tilde character before the opening tilde. This fails when:
- `~text~` appears at the start of a segment (no preceding character)
- `~text~` follows certain characters excluded by the lookbehind
- Consecutive subscripts like `~2~~3~` (second tilde-pair starts with `~`)

Similar issue for `^text^` superscripts.

The MT output preserves all markers (122→122 in m68747), but injection only converts 120 → 10 lost.

- [ ] **Step 1:** Find 2-3 specific segments where `~text~` markers survive MT but don't become `<sub>` in output — identify the exact edge case patterns
- [ ] **Step 2:** Write failing test cases for each pattern
- [ ] **Step 3:** Fix the regex (likely: make lookbehind optional at string start, handle consecutive markers)
- [ ] **Step 4:** Verify no false positives are introduced (tildes in normal text must not become sub)
- [ ] **Step 5:** Run full test suite

---

## Task 6: Investigate m:math overproduction (F7) — INVESTIGATION

**Root cause hypothesis:** m68791 has 109 `<m:math>` in source but 127 in translated output (+18). The equations.json has 140 entries (109 inline math + 31 block-level equation IDs). Injection may be incorrectly wrapping some inline math in `<equation>` elements, or the MathML stripping in the fidelity check may be incomplete.

- [ ] **Step 1:** Compare specific math elements in source vs translated for m68791 — find the extras
- [ ] **Step 2:** Check if the fidelity tool's MathML stripping is working correctly (is it stripping ALL `<m:math>...</m:math>` before counting, or are some nested ones slipping through?)
- [ ] **Step 3:** If real overproduction: trace injection code for math restoration logic
- [ ] **Step 4:** Fix or document as known limitation
- [ ] **Step 5:** Run full test suite

---

## Task 7: Accept or document MT-caused marker shifts (F6, F8, F12)

Some discrepancies are caused by the MT API modifying markers during translation. These cannot be fixed in extraction/injection — they require either:
- (a) Post-processing that compares EN/IS marker counts (like the term fix in PR #54)
- (b) Contacting Málstaður about marker preservation settings
- (c) Accepting as known limitations

**Affected:**
- `<sup>` overproduction: m68674 (+2), m68791 (+28), m68789 (+4)
- `<emphasis>` shifts: scattered across modules (~20 total)
- `<space>` loss: m68791 (-4)

- [ ] **Step 1:** Quantify: how many discrepancies are purely MT-caused vs fixable in extract/inject?
- [ ] **Step 2:** For sup/sub: implement count-based limiting (same approach as the term fix) if the pattern is consistent
- [ ] **Step 3:** For emphasis: assess whether `*`/`**` marker repair is feasible
- [ ] **Step 4:** Document remaining known limitations in `docs/pipeline/cnxml-fidelity-gaps.md`

---

## Task 8: Re-validate full book

After all fixes, re-extract and re-inject all translated chapters, then run the full fidelity check.

- [ ] **Step 1:** Re-extract all translated chapters: `for ch in 1 2 3 4 5 8 9 12 13; do node tools/cnxml-extract.js --book efnafraedi-2e --chapter $ch; done` + appendices
- [ ] **Step 2:** Re-inject all: `for ch in 1 2 3 4 5 8 9 12 13; do node tools/cnxml-inject.js --book efnafraedi-2e --chapter $ch --source-dir 02-mt-output; done` + appendices
- [ ] **Step 3:** Run fidelity check: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e --verbose`
- [ ] **Step 4:** Compare results against baseline (533 discrepancies, 36/68 perfect)
- [ ] **Step 5:** Update `docs/pipeline/cnxml-fidelity-gaps.md` with final state
- [ ] **Step 6:** Run full test suite: `npm test`

---

## Recommended Execution Order

```
Task 1 (title regex)     ─── easy, self-contained, immediate wins
Task 5 (sub/sup regex)   ─── focused regex fix, similar to Task 1
Task 4 (table paras)     ─── extraction refactor, medium complexity
Task 3 (exercise images) ─── extraction + injection, design needed
Task 2 (newline loss)    ─── MT issue, may need external coordination
Task 6 (math overproduction) ─── investigation first, then fix
Task 7 (MT marker shifts) ─── document/accept or post-process
Task 8 (full re-validation) ─── final sweep
```

Tasks 1 and 5 can be parallelized. Tasks 3 and 4 can be parallelized after investigation.
Task 2 decision gates on investigation (may punt to "re-translate" or "accept").
