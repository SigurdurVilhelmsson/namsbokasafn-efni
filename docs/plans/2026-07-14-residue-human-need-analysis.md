# Residue human-need analysis — re-scoping roadmap #3 (2026-07-14)

**Question:** of the 100 verbatim-EN residue segments across the "15 incomplete modules" (`residue-report.mt-preview.json` `exact[]`), which actually need a **human translator** vs a mechanical fix?

**Method:** every residue segment's EN source (`02-for-mt`) was compared to its MT output (`02-mt-output`), then adversarially verified by a 4-agent workflow (`wf_5ffa3c94-159`): 3 parallel classifiers + 1 hunter tasked to *refute* "nothing outside the preface needs a human." The hunter **failed to refute** (read all 26 non-preface residue segments + every ratio-warning). (The preface classifier's structured output failed the harness on an oversized 76-item array, but its analysis was recovered verbatim from its transcript and is consistent ×5.)

## Verdict: `reinject=14 · correct-EN=81 · needs-human=5` (all 5 in the preface)

**There is no sustained Pass-1/MTPE campaign here.** The entire human-translation surface is **5 preface segments the lead already owns.** Everything else is mechanical or a gate false-positive.

### needs-human (5) — all `m68662` preface; LEAD full-MT + hand-edit
- `m68662:title:pref-sec-027-title` — "About the authors" → "Um höfundana"
- `m68662:title:pref-sub-028-title` — "Senior contributing authors"
- `m68662:para:pref-p-029` / `pref-p-030` / `pref-p-031` — author-bio paragraphs
- (The other 71 preface residue segments are reviewer **names + institutions** — `pref-list-034` ×15, `pref-list-036` ×55, `pref-p-032` bold author name — which **correctly stay English** by lead decision, e.g. "Queensborough Community College" must NOT become "Queensborough samfélagsháskóli".)

### reinject (14) — MT already localized; re-inject/re-render picks up the correct form (0 human, 0 re-MT)
These are number-localization (decimal `123.896`→`123,896 amu`, `1.00`→`1,00 atm`; thousands `107,000`→`107.000 torr`) already present in `02-mt-output` but showing English in the published page (a stale inject artifact):
```
m68700:solution:fs-idm15352224   m68700:solution:fs-idp18584256   m68700:solution:fs-idp50221696
m68750:para:fs-idp131216672      m68752:solution:fs-idm1704032    m68752:solution:fs-idm99835712
m68798:problem:fs-idp163617584   m68798:problem:fs-idp279106656   m68798:problem:fs-idp63377856
m68798:problem:fs-idp70859392    m68798:problem:fs-idp94542848    m68804:solution:fs-idp96688048
m68809:para:fs-idm41259968       m68862:entry:auto-20
```
(Spot-verified end-to-end: m68700's published CNXML already shows `123,896 amu` — so several of these may already be correct-on-disk and merely re-flagged; a re-render pass confirms.)

### correct-EN (81) — language-neutral; the residue gate should TOLERATE these, not translate them
- **Chemical formulas / answer lists** (`(a) CrP; (b) HgS; …`, `(NH4)2SO4`, `SeF6`): m68698 ×4, m68739 ×1, m68696 ×1.
- **Units / equations / constants** (`rem = RBE × rad`, gas-constant R table): m68858 ×2, plus the reinject set's unit tails.
- **Chemist-portrait person-name titles** (bodies ARE translated; only the person-name title stays English): `m68729:note-title:fs-idp23436864-title` (Dorothy Crowfoot Hodgkin), `m68784:note-title:fs-idm42784320-title` (Frederick Gardner Cottrell).
- **71 preface names+institutions** (above).

## Recommended execution of the re-scoped #3

1. **Residue-gate re-triage** (`[fix]`, code): relax `scan-residue.js` / the inject residue check to not flag segments whose only content is chemical formulas / numbers / SI units / element symbols / person-names+institutions (language-neutral). This un-sticks the 13 non-preface modules from the #248 STALE-STRUCT exclusion. *(This is the real lever — not translation.)*
2. **Re-inject + re-render sweep** the 13 non-preface modules → picks up the 14 already-localized numbers **and fixes their WS5-stale reading order** (the whole reason they were excluded). The 5 order-broken modules resolve here.
3. **Preface `m68662`** (LEAD): run it through full MT (names/institutions stay English), then hand-edit the 5 `needs-human` segments above.
4. **Then** re-run the order gate → confirm order→near-0 → flip #5 (warn→hard); re-triage + flip #7 (F8).

`m68865` (appendices, 1,484 segs, **0 residue**) is in the incomplete-15 list for order/size, not translation — it clears with the sweep.

## Delivery outcome (2026-07-14, the re-inject/re-render sweep — roadmap #3 item b)

The code half (residue-gate re-triage) shipped as **PR #282** (code-only, manifest reverted). This is the **data half**: re-inject + re-render the 13 non-preface residue-unblocked modules on the `mt-preview` track. Branch `data/chem-residue-sweep-13-mtpreview`.

**Probe findings that shaped the sweep (all empirical):**
- **No re-extract needed.** All 4 "March-stale" `structure.json` files (m68696/m68698/m68752/m68862) re-extract **byte-identical** → they already reflect current (F1-fixed) extraction. The 10 July-fresh modules got their order fix from #248's re-extract, but the residue gate had blocked it from ever being injected. So the sweep is **re-inject/re-render only** (the roadmap #3(a) "re-extract" wording was the general recipe, already satisfied by #248 for these).
- **13 inject COMPLETE** under the relaxed gate; corpus net (independent `scan-residue`): **exact 76 (all m68662 preface) · tolerated 4 · non-preface still-exact = none.**
- **Only 4 modules produced changed `03-translated`** (real reading-order fixes): m68700, m68750, m68858 = **pure reorders** (added-set == removed-set); m68739 = **structure repair** (intro-paras/figures moved before the "octet rule" subsection + 4 valence-electron `<equation>`s relocated into their `<item>`s). The other 9 injected byte-identical — their deliverable is purely the **manifest COMPLETE flip**.
- **Render set = the 4 changed modules** (module-level render also regenerates the chapter's compiled rollups; rendering an unchanged module is a byte-identical no-op on the module page). m68739's render-golden regenerated (`UPDATE_GOLDEN=1`).
- **Gates:** raw-markup leak scan on the 4 pages = 0; `fidelity:render` = 17 findings **before and after** (zero introduced by this sweep — the 17 are pre-existing em/strong baseline drift on main); render-golden 10/10; full suite green.

### 🔴 m68865 correction — NOT cleared by the sweep (supersedes line 41 above)
`m68865` (appendices) is blocked by a **missing/duplicate table-entry segment** (`m68865:entry:auto-338` — the inject reports "1 duplicate skipped (first-match-wins)" + "1 missing"), a *different* root cause than the residue gate. #282's re-triage does not touch it, so it **still SKIPs incomplete** and was **excluded** from this sweep (lead decision 2026-07-14). Likely a table-cell auto-id collision at extraction (two `<entry>`s hashed to the same `auto-N`, one wins, the other's id dangles). **Follow-up:** diagnose the auto-id collision in `cnxml-extract.js` table-cell numbering; separate task from the residue track. Register it under the byte-perfect roadmap tier-3.

## Provenance
Workflow `wf_5ffa3c94-159` (2026-07-14). Adversarial hunt conclusion: *"CONFIRMED — nothing outside the m68662 preface needs a human translator."* Feeds roadmap `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` #3.
