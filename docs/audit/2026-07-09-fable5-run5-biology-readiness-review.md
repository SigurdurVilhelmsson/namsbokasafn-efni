# Fable-5 RUN 5 — biology-readiness / book-agnostic sweep

**Date:** 2026-07-09
**Workflow:** `wf_ba30807b-2b1` (5 finders → dedup → 3-skeptic refute-by-default → synth, all `model:'fable'`)
**Ops health:** 51 agents, **0 errors, 0 empty results**, 3.03M subagent tokens, ~34 min. (Ops-lesson-3 check passed.)

> **Model-provenance note (added 2026-07-09, after the RUN 6 fallback discovery):** transcript audit shows **27 of 51 agents (~53%) auto-fell-back from Fable-5 to Opus 4.8 mid-run** under degraded Fable capacity (a silent harness fallback, invisible in the workflow result — see [[fable5-review-strategy]] OPS LESSON 4). **This materially weakens this report's "model diversity found what Opus missed" framing — roughly half the finding-analysis finished on Opus 4.8.** Findings validity is NOT affected: all three CRITICALs are confirmed-on-real-`books/liffraedi-2e/`-source, every finding cites an exact `file:line`, all passed 3-skeptic adversarial verification, and each is re-verified at fix time. What is lost is *recall confidence* — a clean-Fable re-run might surface additional biology-readiness bugs; queued as optional/low-priority, after RUN 6, not blocking remediation.
**Scope:** WHOLE pipeline (not a diff) — `tools/` + `server/` — hunting places that silently assume chemistry and will misbehave when **biology (liffraedi-2e)** or an organic-format book is processed/previewed. Verified against real `books/liffraedi-2e/` source.
**Result:** 15 raw → 15 deduped → **8 survived** ≥2-refute killing → 6 distinct ranked bugs (synthesis merged 2 duplicate pairs). 5 CONFIRMED, 1 PLAUSIBLE.

## Headline

Three **CRITICAL, must-fix-before-biology** bugs, each a real chemistry-tuned blind spot that fires the moment biology renders — all confirmed on actual biology source, all with green renders / no gate / no error. Plus two important onboarding blockers and one preview-only divergence. **None duplicate RUN 4.** This directly de-risks biology onboarding.

---

## Ranked findings

### CRITICAL — must fix before biology (ranks 1–3)

**Rank 1 — CONFIRMED — alpha list numbering lost → 900+ biology MC options mis-numbered against letter answer keys.** `tools/cnxml-render.js:1679` (`renderList`). `renderList` reads only `list-type`/`bullet-style` and emits a bare `<ol>`/`<ul>` with no `type`/`list-style-type`. `number-style` (lower-alpha/upper-alpha) is captured at extract (`cnxml-extract.js:1598`) and preserved through inject (`cnxml-inject.js:3416`) but **silently dropped at render** — no render path consumes it, and vefur `content.css` hard-codes `ol{list-style-type:decimal}`. Chemistry has only 2 lower-alpha lists (procedural, never answer-keyed) so it went unnoticed. Biology source has **932** `number-style="lower-alpha"`; microbiology 129 lower-alpha + 317 upper-alpha — overwhelmingly the option lists of multiple-choice/matching questions. **Failure:** `books/liffraedi-2e/01-source/ch11/m66484.cnxml` has a 4-option `lower-alpha` list with `<solution><para>C</para></solution>`; the reader sees options numbered 1,2,3,4 while the answer key says "C" — answer-to-option correspondence broken on every lettered MC/matching item. **Fix:** in `renderList`, read `number-style` and emit `list-style-type: lower-alpha`/`upper-alpha` (or `type="a"/"A"`) for enumerated lists; add a render test on a biology lower-alpha list.

**Rank 2 — CONFIRMED — index generator hardcodes chemistry data for every book → dead, linkless biology index.** `tools/generate-index.js:140`. `loadModuleMap(_book)` ignores its book argument and unconditionally reads `server/data/chemistry-2e.json` (which contains 0 `m66` ids; all biology modules are `m66xxx`). **Failure:** `node tools/generate-index.js --book liffraedi-2e` resolves no biology module → every index entry emitted with `section/sectionTitle/sectionSlug = null`; the tool prints "Index Generated Successfully" (exit 0) while producing a reader-facing index with no chapter/section and no navigable links. **Fix:** resolve the data file by scanning `server/data/*.json` for `.slug === book` (the pattern already in `translate-chapter-titles.js`) and **fail loud** if none matches. **Same hardcode reportedly recurs in `openstax-fetch.cjs:70` and `docx-import.js:205` — audit as a batch.**

**Rank 3 — CONFIRMED — unmapped biology note types leak English headers onto Icelandic pages.** `tools/cnxml-render.js:104` (`getNoteTypeLabel`) + `tools/lib/book-rendering-config.js:147` (`generateFallbackLabel`). On a note-class miss with `default===null`, the code Title-Cases the raw English class with **no warning, log, or gate** — a missing mapping is indistinguishable from a deliberate one. `liffraedi-2e/book-config.json` maps only visual-connection/evolution/career; biology source has `class="everyday"` (19), `class="scientific"` (9), `class="scientific method"` (1) = **29 notes**, none mapped. **Failure:** biology ch08 m66473 `<note class="everyday"><title>Photosynthesis at the Grocery Store</title>` renders `<p class="note-type">Everyday</p>` — an English header above Icelandic body text, published, green render, no signal to the editor. **Fix:** add everyday/scientific/scientific-method to `liffraedi-2e/book-config.json` `noteTypeLabels` (audit for others); **independently**, make `generateFallbackLabel` log a warning when it falls back, so future unmapped classes are visible at render time instead of shipping English silently.

### Important — before the biology inject/render wave (ranks 4–5)

**Rank 4 — PLAUSIBLE — duplicate `id="exercises-<moduleId>"` on biology multi-exercise-type modules.** `tools/cnxml-render.js:2938` (`renderCompiledExercises`). Chemistry has one exercise type per module (unique id). Biology's config declares three exercise-type sections all with slug `exercises`, so they compile into one file; a module with all three (e.g. m66440) yields three sibling `<section id="exercises-m66440">` — **invalid HTML (duplicate id)**, CONFIRMED via real biology render. Marked PLAUSIBLE because the wrapper id currently has **no consumer** (cross-refs + vefur answer-linking key off inner `fs-id…`), so the functional harm (anchor hides critical-thinking/visual-exercise groups) is latent. **Fix:** suffix the wrapper id with the exercise type (`exercises-<moduleId>-<type>`); add a duplicate-id assertion to the compiled-exercises test on a biology chapter.

**Rank 5 — CONFIRMED — chapter-assignment endpoints cap chapter at 30 → biology ch31–47 unassignable via the head-editor workflow.** `server/routes/admin.js:1058` (POST) + `:1098` (DELETE) reject `chapterNum > 30` with 400 "Invalid chapter"; `admin.html:746` mirrors it with `<input max="30">`. But `openstaxCatalogue.js:87` declares liffraedi-2e `chapterCount:47`, and biology has ch01–ch47 on disk. **Failure:** a head-editor assigning an editor to biology ch34 gets 400 (message reads like a validation typo, not a cap); with `enforce_assignments` ON, editors then 403 on ch31–47 with no head-editor path to grant access. (An ADMIN can work around it via the uncapped user-edit modal.) **Fix:** derive the max from the book's `chapterCount` (or route through the shared `validateBookChapter` middleware, MAX_CHAPTERS 99, that these routes bypass), in `admin.js:1058/1098` and `admin.html:746`.

### Minor — preview-only (rank 6)

**Rank 6 — CONFIRMED — server preview never threads `titleTranslations` → live preview diverges from published output.** `tools/cnxml-render.js:439`. The per-call config hook copies `options.bookConfig` into `BOOK_CONFIG`/`NOTE_TYPE_LABELS` but **never sets `TITLE_TRANSLATIONS`**, which is assigned only in CLI `main()` (:3182) and the test helper — neither runs on the server preview path. So `translateTitle()` reads `{}` on every in-process render. **This is a new instance of RUN 2's FR2 "server preview inherits chemistry/CLI-only state" class.** NOT reader-visible (published CLI render is correct); only the editor's live preview shows English structural titles (`Answer:` instead of `Svar:`). **Failure:** previewing chemistry m68782 (`<note><title>Answer:</title>`) shows `<h4>Answer:</h4>` in preview vs `<h4>Svar:</h4>` published. **Fix:** one line in the :439 block — `TITLE_TRANSLATIONS = options.bookConfig.titleTranslations || {}`; add a server-preview test.

---

## Killed by the skeptics (6 — do not pursue)

- `translate-chapter-titles.js` domain='chemistry' / chemistry glossary term for every book — 2 refutes (two submissions, both killed).
- `loadEquationTextDictionary` cwd-relative `books/` resolution — 3 refutes.
- `check-source-updates.js` `${book}.json` filename assumption — 3 refutes.
- residue gate blocks correctly-translated biology Latin-taxonomy segments — 2 refutes.
- `hasApiMarkers` per-segment sniff misclassifies marker-sparse biology prose — 3 refutes.

---

## Notes for the consolidated remediation

- Ranks 1–3 are the biology-onboarding **must-fix** set (all render-side, all confirmed on biology source). Rank 1 also needs the vefur `content.css` alpha rule (cross-repo — coordinate).
- Rank 2's chemistry-data hardcode is a **class** (generate-index + openstax-fetch.cjs + docx-import.js) — fix as one batch with a shared slug→data-file resolver that fails loud.
- Rank 3 and rank 6 share a theme with RUN 2/RUN 4: **silent fallback to a chemistry/English default instead of failing loud.** Consider a render-time "unmapped/untranslated" warning surface as a general guard.
- All fixes are normal-budget work; this run only *found* them. Verify each against the cited real biology module.
