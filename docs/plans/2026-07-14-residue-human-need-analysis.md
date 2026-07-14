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

## Provenance
Workflow `wf_5ffa3c94-159` (2026-07-14). Adversarial hunt conclusion: *"CONFIRMED — nothing outside the m68662 preface needs a human translator."* Feeds roadmap `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` #3.
