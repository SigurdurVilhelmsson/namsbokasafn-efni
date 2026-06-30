# Runbook — efnafraedi-2e combined re-render + sync (a11y-2 + A3 + stale-render)

**Date:** 2026-06-30. **Scope:** efnafraedi-2e ONLY. **Type:** pipeline Step 5b (render) + cross-repo sync.
**Status:** scoped, decisions resolved; Phase 1 ready to execute.

## Why

Three merged-but-inert changes reach readers only after a re-render + sync of the published HTML:
- **a11y-2** (PR #203): visually-hidden assistive `<math>` sibling on every equation (screen-reader access).
- **A3** (PR #204): 22 recovered equations + the ch13 ICE-table image (ch12/13/16/17/21/appendices). Appendix-A periodic table stays the intentional `/lotukerfi` interactive replacement (not re-rendered as a static image).
- **Stale-render backlog** (~8 modules whose committed HTML lagged the post-#179–183 renderer): subsumed — re-rendering every chapter makes all committed output current.

Render code-fixes do NOT change published HTML by themselves; this runbook is the delivery.

## Decisions (lead, 2026-06-30)

1. **Land method:** branch + PR, gated by the programmatic verification below — NOT line-by-line diff review (the diff is dominated by cosmetic MathJax-id churn; a real regression would be invisible to the eye). Reversible via `git revert`.
2. **Cross-repo sequencing:** land **vefur Task 3a** (search-index strip for the assistive `<math>` sibling — see `namsbokasafn-vefur docs/plans/2026-06-30-cross-book-css-and-embed-handoff.md` Task 3a) **before** syncing the re-rendered content, so vefur's full-text index never ingests MathML tokens.

## Scope of the render

`cnxml-render.js` renders one track per invocation (default `mt-preview`). efnafraedi-2e tracks with published content:
- **mt-preview** — all 23 chapters: `ch00`–`ch21` + `appendices`.
- **faithful** — only `ch01` and `ch03` (4 faithful modules).
- No `localized` track exists for this book.

Aggregates (`05-publication/{glossary.json,toc.json}`) are produced by separate generators, NOT by `cnxml-render.js` — they are out of scope here (A3's glossary fix changes the compiled key-terms **HTML**, not the json hover-data). If a glossary/index refresh is wanted, that's a separate `generate-glossary.js`/`generate-index.js` step.

---

## Phase 1 — efni re-render + commit + verify + PR

1. **On `chore/efnafraedi-rerender-a11y2-a3` (branched from main @19e9a843).** Re-render both tracks:
   ```bash
   for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch"; done
   node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track faithful
   node tools/cnxml-render.js --book efnafraedi-2e --chapter 3 --track faithful
   ```
   Local, no API cost, ~2–3 min. Also copies newly-rendered images (e.g. the ch13 ICE-table SVG) into `05-publication/.../images/`.

2. **Verification gate (this is the "review" — do NOT eyeball the diff):**
   - **Identity-diff oracle on the committed output → 0/0:**
     `node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e` → expect 0 `genuine-math-drop` and 0 image `cross-stage-drop` across 23 chapters. (Valid here because the freshly-rendered HTML carries the assistive MathML the oracle keys on.)
   - **Assistive-math present everywhere:** `grep -rho 'class="assistive-mathml"' books/efnafraedi-2e/05-publication | wc -l` ≈ total equation count (sanity: non-zero, comparable to `<mjx-container` count).
   - **Golden + baseline:** `npm test` (golden suite) green; `node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e` shape-drift clean vs the committed `render-fidelity-baseline.json`.
   - **Spot-check:** ch13 §13-2 (recovered solution equations), a ch16/ch17 glossary key-terms page (term math), appendix-A page (still the `/lotukerfi` link, not a static periodic-table image).

3. **Commit** the `05-publication/` changes (HTML + new images) on the branch. Expect a large diff (MJX-id churn + assistive math + A3 recoveries) — this is normal. **PR body must state the verification-gate results** (oracle 0/0, assistive-math count, golden/baseline green) since the diff itself isn't human-reviewable. Merge on green gate.

**Rollback:** `git revert` the content commit — render output is fully regenerable from committed `03-translated/`; render code is test-locked.

## Phase 2 — vefur Task 3a (search-index strip) [in namsbokasafn-vefur]

Implement the `search.worker.ts` strip for `<math class="assistive-mathml">…</math>` per the handoff (`namsbokasafn-vefur docs/plans/2026-06-30-cross-book-css-and-embed-handoff.md` Task 3a). Its own small PR in the vefur repo. **Must merge before Phase 3.** (Cross-repo: relaunch Claude in namsbokasafn-vefur for that work per the repo's cross-repo protocol.)

## Phase 3 — sync to vefur + deploy [in namsbokasafn-vefur, lead]

After Phase 1 (efni main) AND Phase 2 (vefur 3a) are merged:
```bash
# from ../namsbokasafn-vefur
node scripts/sync-content.js --source ../namsbokasafn-efni
node scripts/generate-toc.js           # if toc inputs changed (overlay model; see vefur CLAUDE.md)
```
Then vefur build + deploy to namsbokasafn.is (the lead's manual prod pull + sync/deploy path — the auto-sync Action is unconfigured; see efni memory `content-sync-vefur-broken`).

**Post-deploy spot-check on namsbokasafn.is:** a recovered equation renders; a screen reader announces an equation (a11y-2 live validation, reader-plan § P2.5); search for a real prose word still works (3a didn't over-strip).

---

## Out of scope / not touched
- Other books (only efnafraedi-2e is published/faithful). No re-render of edlisfraedi/liffraedi/lifraen/orverufraedi/stjornufraedi.
- `03-translated/` re-inject (this is render-only; any stale *input* content is a separate inject concern — the oracle 0/0 confirms render output is current).
- glossary.json/index.json aggregate regeneration (separate generators; do only if a hover-data refresh is wanted).
- The deferred A3 Minors (regex hardening, extra guard tests, loud-seam ignore-set) — logged in the pipeline-architecture register, not part of delivery.
