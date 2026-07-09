# Fable-5 RUN 4 — chemistry render/inject/extract pipeline correctness review

**Date:** 2026-07-09
**Workflow:** `wf_875c71d1-ce7` (5 finders → dedup → 3-skeptic refute-by-default → synth, all `model:'fable'`)
**Ops health:** 60 agents, **0 errors, 0 empty results**, 3.67M subagent tokens, ~46 min. (Ops-lesson-3 check passed — this is a real result, not a crashed-empty one.)
**Scope:** the chemistry pipeline code merged since RUN 3 (PR #233): `git diff 15c963b9..HEAD` — `cnxml-render.js` (414 lines), `cnxml-inject.js` (292), `module-sections.js` (107), `cnxml-elements.js` (47), `cnxml-render-fidelity-check.js`, `cnxml-extract.js`, `verify-reextract-equivalence.js`.
**Result:** 18 raw → 18 deduped → **14 survived** ≥2-refute killing → 12 ranked (rank 6 merges a 3-finding link family).

## Headline verdict

**Chemistry is NOT clean.** Two **critical, live** defects sit inside the "119/148 PERFECT" claim, both invisible to the count-based fidelity gate (which is blind to order, numbering, and duplication):

1. Section 7.3's Lewis-structure procedure renders **scrambled**, with its step diagrams orphaned (rank 1).
2. Table numbering is **wrong across ~19 of 21 chapters**, plus `Tafla appendices.N` literal tokens on every appendix page (ranks 2–3).

Plus live emphasis-tag leaks (rank 4) and a duplicated figure (rank 5). **Ranks 1–5 are the "fix before the lead's pending combined re-render" set** — one re-render then delivers all the fixes at once.

Separately, **rank 6 is a HARD before-biology blocker**: `window="new"` links leak raw CNXML into HTML *and the fidelity gate has the identical first-attribute-anchored blind spot*, so the corruption is **already in committed biology `05-publication` output and the gate reports it PERFECT**.

---

## Ranked findings

### Live in chemistry — fix BEFORE the combined re-render (ranks 1–5)

**Rank 1 — CRITICAL — reading-order scramble (7.3 live).** `tools/cnxml-render.js:886` (`renderChildrenInDocumentOrder`). Standalone `<media>` is stripped from `simpleContent` *before* lists are extracted, so a list whose items contain media yields a `fullMatch` that is no longer a substring; `content.indexOf()` returns −1 → mapped to position 0 → the list sorts to the top of its section, step images orphaned ~50 lines away. Live on `7-3-lewis-takn-og-lewis-myndir.html` (m68739, `<ol id=fs-idm8107808>` + `fs-idp52495568`). Order-blind gate misses it. **Fix:** on −1, fall back to `content.indexOf('id="${lst.id}"')` (apply to every element class), or compute positions against the original unstripped content; add an order-aware assertion to the fidelity check. Latent biology hazard (image-heavy lists).

**Rank 2 — CRITICAL — wrong table numbers book-wide.** `tools/cnxml-render.js:3310`. The chapter-wide numbering pass numbers every `<table id=…>` with no `class="unnumbered"` skip (the equation pass at :3335 has exactly that skip; examples at :3318 also lack it). ~99–101 unnumbered tables across 19/21 chapters each consume a number → every real table number shifts vs OpenStax, with ghost gaps (ch1: 1.1–1.4, 1.6, 1.7 — no 1.5). Verified: m68789's Table 12.1 published as "Tafla 12.8"; four unnumbered example tables captioned "Tafla 12.4"–"12.7". **Fix:** skip `class~=unnumbered` in the table (and example) map builder; needs a re-render.

**Rank 3 — important — `Tafla appendices.N` labels.** `tools/cnxml-render.js:3310`. Labels built as `${args.chapter}.${counter}`; for appendices `args.chapter` is the literal string `'appendices'` with one counter across all 13 appendix modules (runs to `appendices.23`). OpenStax numbers per-letter (Table B1, G1…). The per-letter data already exists in-process (`buildAppendixIdMap.moduleLetters`, from #255) but is only used for hrefs. **Fix:** thread `appendixModuleLetters` into the numbering maps, reset per module, label `${letter}${counter}`. Bundle with rank 2.

**Rank 4 — important — emphasis mispairs + effect-less emphasis leak.** `tools/lib/cnxml-elements.js:718`. The emphasis regex is non-nesting-aware and requires `effect=`. Bold-wrapping-italics closes at the inner `</emphasis>` → truncated bold + raw tags; `<emphasis class="emphasis-one">` (24× in appendix m68866) passes through raw. Live: `16-4-frjals-orka.html` (4×), `6-4-rafeindabygging` (underlined valence-electron notation — a teaching device — mangled), `15-1`, `15-key-terms`, `appendices-8` (24×). `renderEmphasis` is dead code; `findRawCnxmlLeaks` is warn-only. **Fix:** innermost-first iterative replacement + handle missing `effect=` (default italics; map `class="emphasis-one"`). Independent of the others.

**Rank 5 — important — figure rendered twice on compiled exercises page.** `tools/cnxml-render.js:836`. `renderChildrenInDocumentOrder` pushes every figure as an unguarded top-level item; dedup relies on containers registering figure ids first. `renderExample`'s paraHandler does; `renderExercise`'s `renderSectionContent` does not (`hoistTags` = list/equation/table only). A figure in a `<para>` in `<problem>` renders once inline (raw `<caption>` in `<p>`, no number) and again at section level (numbered, duplicate id). Live: `10-exercises.html` has `<figure id="CNX_Chem_10_02_Needlefloa">` twice. **Fix:** mirror `renderExample`'s paraHandler in `renderExercise` (register/hoist para-nested figures) — the correct code exists in the sibling path (:1357–1364).

### Before biology onboarding (ranks 6–8, 10, 11)

**Rank 6 — important — HARD before-biology blocker — `window="new"`/class-first links leak, and the gate is blind to exactly them.** `tools/lib/cnxml-elements.js:736` (+771/814) and `cnxml-render-fidelity-check.js:59`. Every link arm anchors `url=`/`target-id=`/`document=` to the **first** attribute position, so OpenStax's prevalent `<link window="new" url=…>` (210× in liffraedi-2e source) matches no arm and passes through verbatim — browsers treat body `<link>` as void → dead text. The leak scanner `RAW_CNXML_LEAK_PATTERNS` has the **identical** first-attribute anchoring → returns `[]` on exactly these leaks. Verified end-to-end: 5 committed liffraedi-2e ch03 pages contain the raw tag today and the gate reports 0 findings. `renderLink()` (order-independent) is dead code. Chemistry is genuinely clean (0 `window=` links) — the assumption is chemistry-specific. **Fix (one PR, both sides):** make link matching attribute-order-independent in the renderer arms AND the gate regex (`/<link\b[^>]*\s(?:document|target-id|url)=/`); prove the gate fix RED against the committed leaking biology page, then re-render liffraedi ch03. Fixing only one side leaves the gate lying or turns pages red with no cure.

**Rank 7 — PLAUSIBLE — inline-table extraction requires id-first.** `tools/cnxml-extract.js:237`. Extract's inline-table pattern matches only id-first tables; every other table matcher accepts id anywhere. A non-id-first table in a container para would flatten into MT prose AND duplicate standalone outside its container, past every gate, with `report.complete=true`. PLAUSIBLE: corpus scan of all six books (555 tables, ~98 non-id-first, 14–15 in-para) shows **zero** overlap today (incl. biology). One attribute-reorder away. **Fix:** change the regex to `/<table[^>]*\sid="([^"]+)"[^>]*>…/` (match the inject side). Cheap insurance before biology; no re-extract needed.

**Rank 8 — minor (but biology-onboarding trigger) — intro render crash + whole-chapter rollback on missing IS title.** `tools/cnxml-render.js:563`. `buildModuleSections` always sets `_chapterTitle` (null when the metadata segment file is absent); the outline filter evaluates `info.section` **before** `!key.startsWith('_')` → `['_chapterTitle', null]` throws TypeError → lands in main()'s per-chapter catch → `rollbackWrittenFiles` rolls back the entire chapter over one missing string. A fresh biology chapter rendered before title translation is a normal state. **Fix:** reorder the filter (`!key.startsWith('_') && info.section !== '0'`). One line.

**Rank 10 — PLAUSIBLE minor — inject completeness blind spot.** `tools/cnxml-inject.js:2687` (+2987). `buildExampleDom`/`buildExerciseDom` `continue` on a `getElementById` miss before `getSeg` is called — and `getSeg` is the only place `segmentsMissing`/A2-residue is recorded. So a structure-vs-source id skew (the STALE-STRUCT condition that hit 143 modules) ships untranslated English with `report.complete=true` and an empty residue manifest. PLAUSIBLE: no current real instance (ch12 re-inject found all segments). **Fix:** record the miss (push to `segmentsMissing` / a `structureOrphans` counter that fails `report.complete`). Before the biology inject wave.

**Rank 11 — minor — `$1`/`$&` splice in multi-para table-cell injection.** `tools/cnxml-inject.js:2194`. `newContent.replace(paraPattern, `$1${paraText}$2`)` — JS interprets `$1..$9/$&` in the replacement string. A translated cell containing `$`-then-digit (e.g. EN currency `$1.99/gal`) splices tag text into the visible cell with `report.complete`. The safe callback form is already used at :2269 — this site was missed. Current MT data inert. **Fix:** callback form `(m,g1,g2)=>g1+paraText+g2` (or escape `$$`). Grep for other string-form replaces interpolating translation text.

### Minor / latent (ranks 9, 12)

**Rank 9 — minor — block ids dropped (~50 ids / 19 modules).** `tools/cnxml-render.js:1374`. Title-only paras in examples and paras inside list items lose their `id` (renderExample's paraHandler skips `renderPara` when post-title content is empty; `renderList` flattens `<para>` children discarding `p.id`). No target-id references a dropped id today — latent anchor rot; relevant to vefur's stable-id/PDF-redesign dependency. **Fix:** emit the id in both paths; consider a fidelity check that every source block id appears in output.

**Rank 12 — minor — `buildAppendixIdMap` bare catch swallows all errors.** `tools/cnxml-render.js:294`. The try/catch for the no-appendices case also swallows JSON.parse errors / missing fields from a corrupt `*-structure.json` → empty maps, zero diagnostics → all 67 chapter→appendix links (the #255 work) + every A1 reference render as dead text while the chapter exits 0. Violates the repo's fail-loud rule. **Fix:** catch only `err.code === 'ENOENT'`, rethrow the rest; test a corrupt structure file fails loud. Protects the just-delivered #255 work.

---

## Killed by the skeptics (4 — do not pursue)

- `null` buildTable coerced to literal "null" (`cnxml-inject.js`) — 3 refutes: trigger unreachable (placeholder, structure entry, originalCnxml all derive from the same immutable 01-source; extract's regex strictly narrower than inject's null path).
- document-only appendix link with no inner text emits raw `mNNNNN` — 2 refutes.
- silent legacy-fallback (chapter absent from collection-order reverts to filename sort) no-warning — 3 refutes.
- `window="new"` dropped on re-extract for all books — 3 refutes (separate from rank 6's leak).

---

## Recommended fix batching

- **PR A — "renderer pre-re-render fixes" (ranks 1, 2, 3, 4, 5; optionally 9, 12):** all in `cnxml-render.js`/`cnxml-elements.js`, all healed by the lead's ONE pending combined re-render. This is what makes chemistry actually clean. Ranks 2+3 share the numbering pass; rank 1 + rank 5 share `renderChildrenInDocumentOrder`.
- **PR B — "before-biology link + gate fix" (rank 6):** renderer arms + fidelity gate regex together; re-render liffraedi ch03. HARD blocker for biology.
- **PR C — "inject/extract hardening" (ranks 7, 8, 10, 11):** cheap, mostly one-liners, no re-render for existing books; land before the biology inject/render wave.

All fixing is normal-budget work (this run only *found* the bugs). Verify each fix against the cited real module/page.
