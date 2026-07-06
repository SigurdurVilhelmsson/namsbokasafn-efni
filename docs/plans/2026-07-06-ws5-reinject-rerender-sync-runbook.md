# Runbook — WS5: efnafraedi-2e re-inject + re-render + sync (delivers the whole clean-slate arc)

**Date:** 2026-07-06. **Scope:** efnafraedi-2e ONLY. **Type:** pipeline Step 5a (re-inject) + 5b (re-render) + cross-repo sync.
**Run this in a fresh session.** Model: the render-only precedent `docs/plans/2026-06-30-efnafraedi-rerender-sync-runbook.md` (this one adds the re-inject phase).

## Why — this is the delivery step for the entire chemistry clean-slate arc

Every clean-slate fix since the last inject is **inert until 03-translated is re-injected and 05-publication is re-rendered**. The committed `03-translated/` is stale (pre-WS5). Fixes WS5 delivers (all MERGED to main unless noted):
- **WS4 (#233)** — English math labels → Icelandic at inject (`rate`→`hraði`, …) + F8 math-content check (warn-only).
- **RC1 (#235 — MUST BE MERGED FIRST)** — glossary `<term>` markup restore, fixes the `<sub>A</sub>vogadrosartala` corruption on the citable key-terms page.
- **OC-A/OC-B/OC-E** — id/element-order fixes (took residual 60→0).
- **F1** — extract section-order interleave. **F4** — table double-model. **F5/F6** — marker residue (`[[i:]]`/`[[math:N]]`/`[[TABLE:]]`).
- **WS1/WS2** — EN-residue scan + honest-manifest allowlist. **#216** — exercise↔answer `data-has-answer`.

Render code-fixes and inject code-fixes do NOT change published bytes by themselves — this runbook is the delivery.

## Prerequisites (block WS5)
1. **PR #235 (RC1) MERGED to main.** Verify: `grep -c collectNotationRuns tools/cnxml-inject.js` on main = 2 (not 0). (#234 F3 allowlist already merged.)
2. Clean tree; on a fresh branch off main, e.g. `chore/efnafraedi-ws5-reinject-rerender`.
3. `node --version` = 22.x (`.nvmrc`).

---

## Phase 1 — RE-INJECT both tracks (Step 5a)

`cnxml-inject.js` re-generates `03-translated/<track>/` from `01-source` + the current (translated) segments. This applies ALL merged inject fixes at once.

```bash
# mt-preview (default track) — all chapters
for ch in $(seq 0 21) appendices; do node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$ch"; done
# faithful track — only ch01 + ch03 exist (the citable modules; RC1 fix must reach these)
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --source-dir 03-faithful-translation
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 3 --source-dir 03-faithful-translation
```

### ⚠ Residue-skip gotcha (CRITICAL — learned 2026-07-06 debugging RC1)
`cnxml-inject.js` **SKIPS a module before writing** if injection is incomplete (any EN residue or missing segment) — the on-disk file keeps its STALE bytes. **m68700 currently reports 3 untranslated-EN residue segments** (WS1 assessed these as false positives — localized decimals / chemical formulae / note-titles, not genuine English). If m68700 skips, **the RC1 glossary fix never reaches it** (both tracks).

Handle it: re-run the residue modules with `--allow-incomplete` so they write despite the false-positive residue:
```bash
# after the loop, force-write any module the loop reported as SKIPPED — INCOMPLETE:
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 3 --module m68700 --allow-incomplete
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 3 --module m68700 --source-dir 03-faithful-translation --allow-incomplete
# (watch the loop output for other "SKIPPED — incomplete injection" lines and force-write each)
```
Do NOT blanket `--allow-incomplete` the whole book — only the specific false-positive-residue modules, so a genuinely-broken module still fails loud. (Root cause: A2 residue detector false-positives on chemistry units/formulae — logged register A2-c.)

### Hard gates that MUST pass during re-inject (fail loud)
- **Marker-residue gate (F5/F6):** any unconverted `[[TYPE:…]]` (incl. `[[TABLE:]]`) hard-fails the module (`assertNoMarkerResidue`). If a module throws on this, STOP — it's a real regression, not skippable.
- **`[[TABLE:]]` gate (F4):** table double-model — must be carved/expanded, not left as literal marker.

---

## Phase 2 — verify inject (the "review"; do NOT eyeball the diff)

1. **Fidelity check (tag counts + order + F8):**
   ```bash
   node tools/cnxml-fidelity-check.js --book efnafraedi-2e; echo "exit=$?"
   ```
   - Expect **exit 0** (0 unexplained). **The order check + F8 are still warn-only** — expect their warn lines to now be mostly quiet (re-inject applied the fixes); note the counts.
   - **m68811 allowlist update:** fresh re-inject flips m68811 `emphasis` **−1 → +1** (verified benign over-wrap, F3 audit). Update `books/efnafraedi-2e/fidelity-allowlist.json`: change the m68811 emphasis entry's `diff` from `-1` to `+1` (keep `benign` + reason), or the check goes UNEXPLAINED → exit 1. Re-run until exit 0.
2. **RC1 spot-check (citable):** the m68700 key-terms headword is now correct in BOTH tracks:
   ```bash
   grep -o '<term>Avogadrosartala (<emphasis[^)]*)' books/efnafraedi-2e/03-translated/{mt-preview,faithful}/ch03/m68700.cnxml
   grep -c '<sub>A</sub>vogadros' books/efnafraedi-2e/03-translated/*/ch03/m68700.cnxml   # expect 0
   ```
3. **WS4 math-label spot-check:** `grep -c 'm:mtext>hraði\|m:mtext>kerfi' books/efnafraedi-2e/03-translated/mt-preview/ch12/*.cnxml` — non-zero (substitution applied).
4. **No stray content:** confirm only intended `03-translated/` (+ derived `residue-report`/`translation-errors`) changed.

---

## Phase 3 — RE-RENDER both tracks (Step 5b)

```bash
for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch"; done
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --track faithful
node tools/cnxml-render.js --book efnafraedi-2e --chapter 3 --track faithful
```
Local, no API cost. Also copies newly-rendered images into `05-publication/.../images/`.

## Phase 4 — verify render (gate, not eyeball)

- **Identity-diff oracle → 0/0:** `node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e` → 0 `genuine-math-drop`, 0 image `cross-stage-drop`.
- **Assistive-math present:** `grep -rho 'class="assistive-mathml"' books/efnafraedi-2e/05-publication | wc -l` ≈ `<mjx-container` count.
- **Golden + baseline:** `npm test` green (from repo root); render-fidelity shape-drift clean vs `render-fidelity-baseline.json`.
- **Spot-check:** a ch16/ch17 key-terms page shows correct `N_A` / `E_cell` notation (RC1 live in HTML); a ch12 rate equation shows `hraði` subscript (WS4 live).

---

## Phase 5 — commit + PR (gate-verified, NOT line-by-line)

Commit the `03-translated/` (Phase 1) + `05-publication/` (Phase 3) + the m68811 allowlist edit on the branch. **Large diff is normal** (re-inject + MJX-id churn). **PR body states the gate results** (fidelity exit 0, RC1/WS4 spot-checks, oracle 0/0, assistive-math count, golden/baseline green) since the diff isn't human-reviewable. Merge on green gate. Rollback = `git revert` (output regenerable).

## Phase 6 — sync + deploy [lead, in namsbokasafn-vefur]
```bash
# from ../namsbokasafn-vefur
node scripts/sync-content.js --source ../namsbokasafn-efni
node scripts/generate-toc.js   # if toc inputs changed
```
Then vefur build + deploy to namsbokasafn.is (lead's manual prod path — auto-sync Action unconfigured, see memory `content-sync-vefur-broken`). Post-deploy spot-check: an equation renders with `hraði`/`N_A`; a screen reader announces an equation; search still works.

---

## Post-WS5 follow-ups (after content is live)
- **Re-triage the F3 RC1 allowlist entries** against fresh WS5 output: m68700/m68733/m68844 glossary terms are now correct → remove their `known-loss-deferred` entries (they become PERFECT); m68741/m68791/m68822 stay deferred (subscript content translated away — RC1 leaves them plain). See `docs/audit/2026-07-06-f3-benign-retriage.md` § Fix outcome.
- **Flip the gates warn→hard** (both were deferred to post-WS5 because they read committed `03-translated/`, stale until now): the **id-order check** and **F8 math-content check** in `cnxml-fidelity-check.js` — change from warn-only to exit-affecting, with little/no allowlist. Re-run to confirm still green on the freshly-injected output.
- **RC3 + RC4** remain Track B4 (re-MT) — NOT part of WS5.

## Out of scope
- Other books (only efnafraedi-2e is published). No re-MT (Track B4). glossary.json/index.json aggregate regeneration (separate generators, only if hover-data refresh wanted).
