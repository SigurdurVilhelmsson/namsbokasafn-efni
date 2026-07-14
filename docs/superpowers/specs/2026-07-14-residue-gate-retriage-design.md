# Residue-gate re-triage — design (2026-07-14)

**Roadmap:** byte-perfect efnafraedi-2e #3 (re-scoped), Tier 1
(`docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md`).
**Campaign item:** pre-semester coding campaign, Phase 2 (adjacent to #6b/#7)
(`docs/plans/2026-07-11-pre-semester-coding-campaign.md`).
**Analysis basis:** `docs/plans/2026-07-14-residue-human-need-analysis.md` (workflow
`wf_5ffa3c94-159`).

## Problem

The untranslated-EN residue gate (`tools/lib/residue-check.js` →
`tools/cnxml-inject.js`) flags a segment as `exact` residue when its normalized EN
equals its normalized IS and the IS side has ≥3 content words (≥3 letters). A single
`exact` residue sets `report.complete = false`, and `cnxml-inject.js:4211`
(`!complete && !allowIncomplete`) then **SKIPS the module before `writeOutput`** — so
its on-disk `03-translated/` + `05-publication/` bytes stay frozen at the pre-#248
STALE-STRUCT state (stale WS5 reading order + pre-localized numbers).

The gate is **over-flagging language-neutral content**: chemical formulas
(`(a) CrP; (b) HgS`), SI/chem units (`0.987 bar`, `rem = RBE × rad`), already-localized
numbers (`123,896 amu`, which normalizes identically to EN once digits are stripped),
and proper nouns (chemist-portrait person-name titles). These are not translation
failures, but they hold 13 correct chemistry modules out of publication and block the
`#5`/`#7` gate flips (which require an empty unexplained set).

`--allow-incomplete` is **not** the fix: it is the blanket escape hatch that would also
write genuinely-incomplete modules and mask real problems, and it leaves the gate dirty
so `#5`/`#7` can never become hard. This is proper gate re-triage.

## Ground truth (validated 2026-07-14)

`books/efnafraedi-2e/residue-report.mt-preview.json`: **100 exact residues across 14
modules**. Strip the LEAD-owned `m68662` preface (76 — out of scope here) → **24 exact
residues across 13 modules**. Every one of the 24 was read from `02-for-mt` and
classified (`wf_5ffa3c94-159`, adversarially verified); none is a genuine untranslated
prose segment.

**Sole-blocker verification (this session):** each of the 13 modules was probed with
`cnxml-inject --book efnafraedi-2e --chapter N --module mX` (no `--allow-incomplete`, so
the module is skipped before `writeOutput` — zero writes). **All 13 print only
`Untranslated-EN residue: N`** — none reports Missing segments, Unresolved math, or Table
cell gaps. Residue is therefore the *sole* `complete`-blocker for all 13 (confirmed even
for the `[[MATH:*]]`/`[[MEDIA:*]]`-bearing m68739/m68798/m68862). **⇒ tolerating the
residue provably un-sticks all 13.**

### Routing of the 24 (predicate vs allowlist)

| # | Module | Seg id(s) | Content | Route |
|---|---|---|---|---|
| 1 | m68696 | `solution:fs-idp411135344` | formulas | predicate |
| 2 | m68698 | `para:fs-idp268148560`, `solution:fs-idm303264`, `solution:fs-idp268325312`, `solution:fs-idp282330448` | formulas | predicate |
| 3 | m68700 | `solution:fs-idm15352224`, `solution:fs-idp18584256`, `solution:fs-idp50221696` | numbers + `amu` | predicate |
| 4 | m68739 | `solution:fs-idm123049856` | formulas | predicate |
| 5 | m68752 | `solution:fs-idm1704032`, `solution:fs-idm99835712` | `atm`/`torr`/`kPa` + formulas | predicate |
| 6 | m68798 | `problem:fs-idp163617584`, `…279106656`, `…63377856`, `…70859392`, `…94542848` | formulas + `atm` | predicate |
| 7 | m68804 | `solution:fs-idp96688048` | `pH`/`pOH` | predicate |
| 8 | m68858 | `entry:auto-119`, `entry:auto-48` | `rem = RBE × rad` | predicate |
| 9 | m68862 | `entry:auto-20` | `L atm mol K J` | predicate |
| 10 | m68729 | `note-title:fs-idp23436864-title` | "Dorothy Crowfoot Hodgkin" | **allowlist** (proper noun) |
| 11 | m68784 | `note-title:fs-idm42784320-title` | "Frederick Gardner Cottrell" | **allowlist** (proper noun) |
| 12 | m68750 | `para:fs-idp131216672` | `0.974 atm; 740 mm Hg; 98.7 kPa; 0.987 bar` | **allowlist** (homograph `bar`) |
| 13 | m68809 | `para:fs-idm41259968` | `pH = 14 − pOH = … + log([OH⁻]) = 12.30` | **allowlist** (homograph `log`) |

Predicate = 20 residues (9 modules). Allowlist = 4 residues (4 modules). All 13 → `complete`.

## Design — two units

### Unit A — `isLanguageNeutral(text)` predicate (pure, `tools/lib/residue-check.js`)

A new pure function. `detectResidue` calls it: when a segment would be flagged `exact`
but `isLanguageNeutral(enText)` is true, it returns non-residue and sets a new field
`languageNeutral: true` (for reporting). No I/O — the vocabulary is a module-level const.

**It runs on case-preserving text** (not `normalizeForComparison`'s lowercased output —
case is the formula signal). Reuses the existing case-preserving `stripMarkers` to drop
`[[MATH:n]]`/`[[MEDIA:n]]` placeholders and unwrap `[[type:content]]`/`{{type}}` markers,
then removes standalone numbers, punctuation/operators (`= + − · : ; , ( )` …), and
enumeration markers — **single lowercase letters** (the `a`/`b` from `(a)`/`(b)`, `b.`
list markers). **Single uppercase letters are retained** (`O`, `H`, `K`, `N` — they are
formula-shaped and legitimately recognized). **Every remaining word-token must be
recognized**, else the segment is *not* language-neutral (stays flagged). This
all-or-nothing quantifier is the safety property.

Recognized token classes — **unambiguous, non-homograph only**:

1. **Curated unit set** (case-insensitive match): `amu atm torr mmHg kPa Pa mol L mL g kg
   mg K J kJ cal kcal V N W eV rem rad RBE Gy Sv Bq Ci ppm nm pm cm mm s Hz`. Also the
   two-token unit `mm Hg` (handled as `mm` + formula-shaped `Hg`). **Deliberately excludes
   multi-letter English homographs** (`bar`, `log`, `ln`, `sin`, `cos`, `tan`) — a segment
   whose only non-predicate token is such a homograph goes to the allowlist. (`mol`, `rem`,
   `rad`, `torr`, `atm`, `amu` are safe — none is an ordinary English word.)
2. **Formula-shaped token** — matches `/^([A-Z][a-z]?\d*)+$/` (uppercase-initial
   element-symbol runs, optional digits): `Cr CrP HgS Mn PO Cu FeCl NH SO CO SeF BBCl
   RBE …`. English words break the pattern at the first lowercase-initial run (`The`,
   `Water`, `Dorothy` → not formula-shaped).
3. **Quantity-symbol set** (unambiguous, non-homograph): `pH pOH pKa pKb pKw pI`.

**Excluded on purpose (→ allowlist, not predicate):** `log`, `ln`, `bar`, `sin`, `cos`,
`tan`, and any token that is an ordinary English word. Homographic tokens cannot be
safely classified out of context; admitting them erodes the all-or-nothing guarantee and
opens vocabulary creep.

### Unit B — per-book residue allowlist (`tools/lib/residue-allowlist.js` + `books/<book>/residue-allowlist.json`)

A near-verbatim mirror of `tools/lib/fidelity-allowlist.js`:

- `loadResidueAllowlist(bookDir)` → `{ entries: [] }` when the file is absent
  (**default: nothing tolerated** — fail-loud posture).
- `classifyResidue(moduleId, segmentId, allowlist)` → exact match on
  `moduleId` + `segmentId`. Unlisted / drifted / invalid `class` / missing `reason` →
  **not tolerated** (mirrors `classifyDiff`'s fail-loud contract; an unrecognized class is
  treated as no explanation at all).
- Entry shape: `{ moduleId, segmentId, class, reason }`. Valid classes:
  `"proper-noun"` (person/institution names) and `"homograph-unit"` (a language-neutral
  cell whose only blocker is an English-homograph token like `bar`/`log`). A missing
  `reason` → not tolerated.

`residue-check.js` stays pure (no I/O), so the allowlist is applied by the **callers**,
not the detector.

`books/efnafraedi-2e/residue-allowlist.json` ships **4 entries**:

```json
{ "_comment": "Residue gate: language-neutral segments a pattern cannot safely classify. proper-noun = person/institution name; homograph-unit = unit/expression whose only blocker is an English-homograph token. Exact match moduleId+segmentId; drift/missing reason → still flagged. See docs/superpowers/specs/2026-07-14-residue-gate-retriage-design.md",
  "entries": [
    { "moduleId": "m68729", "segmentId": "m68729:note-title:fs-idp23436864-title", "class": "proper-noun", "reason": "chemist-portrait person-name title (Dorothy Crowfoot Hodgkin); note body is translated" },
    { "moduleId": "m68784", "segmentId": "m68784:note-title:fs-idm42784320-title", "class": "proper-noun", "reason": "chemist-portrait person-name title (Frederick Gardner Cottrell); note body is translated" },
    { "moduleId": "m68750", "segmentId": "m68750:para:fs-idp131216672", "class": "homograph-unit", "reason": "pressure values; only non-predicate token is the English homograph 'bar' (0.987 bar)" },
    { "moduleId": "m68809", "segmentId": "m68809:para:fs-idm41259968", "class": "homograph-unit", "reason": "pH/pOH calculation; only non-predicate token is the English homograph 'log' (log([OH-]))" }
  ]
}
```

### Integration & report schema

- `detectResidue` (pure) applies the predicate → automatically benefits **both**
  consumers (`scan-residue.js` and the inject gate) since both call it.
- The **allowlist** is loaded once per run by each CLI (`cnxml-inject.js` main,
  `scan-residue.js` main) from the book dir, threaded into `buildCnxml` via `opts` as an
  `isAllowlisted(moduleId, segmentId)` closure (keeps `buildCnxml` I/O-free). In the gate
  loop (`cnxml-inject.js:~1850`): a segment that is `exact` **and** allowlisted goes to a
  new `stats.tolerated` bucket instead of `stats.residues`, so `report.complete` no longer
  trips on it. `scan-residue.js` applies the same classification for consistent reporting.
- **Report schema:** add a non-gating `tolerated[]` (segmentId + reason) to the residue
  manifest (`upsertResidueModule` + the summary). Allowlisted residues stay *visible and
  auditable* rather than vanishing; `exact[]` keeps meaning "genuine untranslated
  residue" — the invariant `#5`/`#7`'s empty-unexplained-set depends on. Predicate
  (language-neutral) segments are simply not residues (omitted).

**Global scope (deliberate):** the `detectResidue` predicate change affects **every
book's** residue scan, not only efnafraedi-2e. This is intended — it is the biology
generalization the hybrid model was chosen for (biology has formula/unit/pH cells too).
efnafraedi-2e is the representative before/after check; the allowlist stays per-book.

## Testing

- **Predicate unit tests** (`tools/__tests__/residue-check.test.js`):
  - *positive* → `languageNeutral: true`: `(a) CrP; (b) HgS`, `(NH4)2SO4`,
    `123,896 amu`, `rem = RBE × rad`, `pH = 3.587; pOH = 10.413`, the gas-constant row,
    and the `atm`/`kPa`/`torr` cells.
  - *negative — the load-bearing half* → still `exact`: `Write the two half-reactions`,
    `Dorothy Crowfoot Hodgkin`, and — the test that actually exercises the risk — a real
    English residue that **contains a recognized token**: `Measure the pH of each
    solution carefully` and `Report the value in atm units` must still flag. (Defends the
    all-or-nothing property against future vocab growth.)
  - *homograph exclusion*: `log([OH-]) = 12.30` and `0.987 bar` are **not**
    `languageNeutral` (they depend on the allowlist, not the predicate).
- **Allowlist tests** (`tools/__tests__/residue-allowlist.test.js`): exact-match tolerate;
  unlisted / drifted `segmentId` / invalid `class` / missing `reason` → not tolerated
  (fail-loud parity with `fidelity-allowlist.test.js`).
- **Corpus net** (recorded in the spec, run before/after): full-book `scan-residue`
  `exact` count drops **100 → 76** (only the m68662 preface remains), `tolerated` = 4,
  and **no module outside the known 13** loses a residue (guards against the predicate
  silently masking a genuine residue elsewhere in the book).

## Verification (done criteria)

1. `npm test` green from repo root.
2. For each of the 13 modules, `cnxml-inject --book efnafraedi-2e --chapter N --module mX`
   (no `--allow-incomplete`) now prints `COMPLETE`, not `SKIPPED`.
3. `scan-residue --book efnafraedi-2e --json` reports `exactResidues: 76` (all in
   m68662), `tolerated: 4`.

## Scope & non-goals

- **In scope (this PR):** `residue-check.js` predicate, `residue-allowlist.js` +
  `residue-allowlist.json` (4 entries), inject/scan wiring, `tolerated[]` report field,
  tests. **Zero `03-translated/` or `05-publication/` changes.**
- **Out of scope (separate follow-up op):** the re-inject/re-render **data sweep** of the
  13 modules (picks up the 14 already-localized numbers and re-renders correct order via
  the delivered collection-order authority, roadmap #6). Its reader-facing delivery via
  vefur/L3 is lead-gated. Sequenced after this PR lands.
- **Out of scope (LEAD lane):** the `m68662` preface — 5 needs-human segments (full MT +
  hand-edit) and its 71 correct-EN names/institutions. When LEAD processes it, those names
  become future `residue-allowlist.json` `proper-noun` entries (same mechanism); this PR
  leaves m68662 entirely untouched (it stays `incomplete`, as expected).
- **Not touched:** the `#5` (order) / `#7` (F8) gate flips — they are gated on the data
  sweep completing, downstream of this PR.
