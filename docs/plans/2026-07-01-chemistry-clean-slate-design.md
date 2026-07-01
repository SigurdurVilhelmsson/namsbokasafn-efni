# Design — Chemistry (efnafraedi-2e) clean-slate before biology

**Date:** 2026-07-01. **Status:** design approved by lead 2026-07-01, ready for the implementation
plan (`writing-plans`). **Scope:** efnafraedi-2e ONLY. **Type:** pipeline cleanup + translation
completeness (no new book, no architecture migration).

## Why this exists

The lead wants chemistry brought to a trustworthy "clean slate" **before** onboarding biology — a
single developer should not be tracking two half-finished books at once. Discovery (2026-07-01)
showed chemistry is in far better shape than "half-assed" on the surface but has three genuine
untranslated-content surfaces and a not-fully-honest fidelity manifest.

## Verified current state (2026-07-01)

All numbers below were measured against `main` HEAD; working tree clean.

| Layer | State |
|---|---|
| MT translation | ✅ **149/149** source modules translated — **no missing MT translations** |
| mt-preview inject | ✅ 149/149 |
| mt-preview render | ✅ **Current** — whole book re-rendered (PR #205); a11y-2 assistive MathML present in 192 HTML files; all C1–C4 / A3 render fixes delivered into committed `05-publication` |
| Reader delivery | ⏳ only **Phase-3 sync+deploy** remains (lead action on the deploy server; runbook `docs/plans/2026-06-30-efnafraedi-rerender-sync-runbook.md`) |
| Fidelity | ⚠️ **30 distinct modules / 47 discrepancies** = **39 real-loss tags across 25 modules** (negative diffs) + **8 artifact tags across 6 modules** (positive diffs); one module (`m68764`) carries both, so 25+6 counts it twice |
| Faithful track | ❌ 10/149 reviewed, 4 injected — **human Pass-1 deliverable, OUT of scope here** |
| TM (`tm/`) | ❌ empty (generated from faithful pairs) — OUT of scope |
| Localized track | ❌ does not exist — OUT of scope |

**Three untranslated-content surfaces** (the "missing translations"):
1. **Body-segment EN-residue** — chemistry was translated before the A2 residue check existed, so it
   has never been scanned for segments the API returned still in English. Unknown count.
2. **Figure alt-text** — **1,149 English `alt=` across 137 source files** (`cnxml-extract.js:202,
   1018,1061` carry `alt` through as metadata but never emit it as a translatable segment). This is
   a11y-1 / a11y-handoff Item 1. **OUT of scope here** — tracked separately, scheduled last (lead
   decision 2026-07-01).
3. **Math-embedded English labels** — descriptive subscript text inside equations, protected as
   `[[MATH:N]]` and thus never seen by the API: `rate` (64×), `cell` (50×), `mol solute` (23×),
   `vap` (19×), `surr` (17×), `sys` (16×), `cathode` (13×), `change` (12×), … A small recurring
   vocabulary (~15–30 distinct words). Present in both source and published; the few Icelandic labels
   (`massi`, `lausn`, `eðlismassi`) are incidental (glossary-derived / hand-edited), **not** a working
   translation mechanism.

## Scope

**In scope (this spec):** four independently-shippable workstreams — WS1 EN-residue, WS2 fidelity
honest-manifest, WS4 math-label substitution, WS5 delivery hand-off.

**Explicitly out of scope:** figure alt-text translation (WS3 / a11y-1 — separate spec, done last);
the faithful-review track, TM generation, and the localized track (all human Pass-1 editorial work,
adoption-bound per the throughput roadmap); any render/inject DOM migration (Track C — no active bug
in chemistry needs it).

## Constraints (inherited from the pipeline-architecture plan + project memory)

- **Robustness & future-proofing decide the design** — one real code path, fail loud, no silent
  green, config-as-data, escape hatches can't reach prod. `feedback-robustness-over-expedience`.
- 🔒 `books/*/01-source/` READ-ONLY — scanning is fine; never overwrite from upstream.
- **Translations are API-only** (Miðeind/Málstaður), never AI-generated. Any re-translation runs a
  **`--dry-run` + ISK estimate first** and pauses for go/no-go (lead: OK to spend if in budget at the
  time). Price = 1 ISK / 100 chars.
- **Path resolution:** resolve resources against `import.meta.url`/`__dirname` (files) or
  `resolveDbPath()` (DB), never `process.cwd()`. New tools run from repo root.
- Test gate is **local `npm test` from the repo root** (no branch protection). Each WS is its own PR
  off `main`; TDD/characterization before behavior changes.
- WS2 and WS4 change published output → they converge on a single backfill re-render (WS5); don't
  deploy mid-QA.

---

## WS1 — EN-residue scan + fix · S · no deps

**Goal:** find and fix any body segments the API returned still in English.

**Build:** read-only `tools/scan-residue.js` (`--book`, `--chapter`, `--json`). Walks
`02-for-mt/**/m*-segments.en.md` × `02-mt-output/**/m*-segments.is.md` per module, runs the existing
pure `detectResidue`/`normalizeForComparison`/`countContentWords` from `tools/lib/residue-check.js`
(reused verbatim — the content-word floor already suppresses legit EN==IS cells like formulae and
numeric answer keys). Emits a report grouped by chapter/module listing residue segments (EN/IS pair +
overlap ratio). **Does not touch `03-translated`** — avoids stale-render side effects; this is a
detector, not a re-inject.

**Then (triage):** genuinely-untranslated segments → re-translate the affected modules via
`api-translate` (**dry-run + estimate first**). If the scan is clean, WS1 ends at "documented clean."

**Test:** unit-test the scanner over a fixture with (a) a known EN-residue segment (flagged) and (b) a
known-clean EN==IS numeric/formula cell (not flagged).

**Reaches readers via:** the WS5 backfill re-render (only if any re-translation happened).

## WS2 — Fidelity triage → honest manifest · M · no deps

**Goal:** every remaining fidelity discrepancy is either fixed or **explicitly classified with a
reason** — so `green` in the manifest means *truly* clean.

**Triage** all 39 real-loss tags (25 modules) + 8 artifact tags (6 modules). For each, diff
`01-source` vs `03-translated` CNXML at the specific tag (`compareTagCounts`/`countTags`,
`tools/cnxml-fidelity-check.js:60/38`) and classify:
- **(a) fixable inject bug** — a builder in `cnxml-inject.js` drops/duplicates a tag it shouldn't.
- **(b) irreducible structural limit** — nested-para/list class, e.g. `m68727` (source 242 `<para>`,
  injected 235 = `para:-7`). Known-hard; would need the Track-C inject-DOM migration.
- **(c) benign counting edge** — e.g. positive "annotation overcounting" from EN-marker conversion
  creating an extra `<emphasis>`/`<term>` (the 8 positive-diff artifacts).

**Fix** the (a)s in `cnxml-inject.js`, each locked by a **characterization test** on the affected
module (source→inject tag-count parity for the fixed tag) before touching code.

**Honest manifest (the allowlist — lead: "a must"):** add a per-book **known-discrepancies
allowlist** data file (e.g. `books/<book>/fidelity-allowlist.json`) — each entry keyed by
`moduleId` + `tag` + expected `diff`, with a mandatory `reason` and `class` (`b`|`c`). The fidelity
check + `update-translation-errors` consult it: an allowlisted discrepancy is subtracted from the
"unexplained" count but **still listed** (never silently dropped). `green`/`perfect` becomes
"zero *unexplained* discrepancies." A discrepancy that is neither zero nor allowlisted keeps the
module red. New/unexpected discrepancies (drift) fail loud. No false red, no false green.

**Reaches readers via:** WS5 backfill re-render (for fixed modules).

## WS4 — Math-embedded English labels · M · dep: your Icelandic map

**Goal:** descriptive English subscript labels inside equations render (and read aloud, via a11y-2
assistive MathML) in Icelandic — without disturbing formulae/variables.

**Inventory first (I produce, you fill):** a script emits the distinct set of English-looking text
nodes inside math (`<m:mtext>`/`<m:mi>` content that is a word, not a chemical formula/unit/variable),
with occurrence counts and one example context each. You supply the Icelandic for each
(chemistry-domain decision — e.g. `cathode`→`bakskaut`? `surr`→`umhv`? `sys`→`kerfi`?).

**Constraints on the Icelandic labels (these render as small subscripts inside equations, so keep
them compact — the inventory sheet will state these inline):**
- **Length — the binding constraint.** English uses tight abbreviations precisely because subscripts
  render small (`surr`, `sys`, `vap`, `rxn`). Aim for **≤ the English abbreviation's length, hard cap
  ~6 characters**; abbreviate long words rather than spell them out (e.g. `surroundings`→`umh`, not
  `umhverfi`; `system`→`ker`, not `kerfi`, if the short form reads unambiguously). A too-long label
  reflows the equation and looks wrong at subscript size.
- **Single token, no spaces.** Subscripts don't take spaces gracefully — collapse multi-word English
  (`mol solute` → the `solute` part becomes one compact token, e.g. `uppl` for *uppleyst efni*).
- **Character set.** Icelandic letters are fine (`á é í ó ú ý ð þ æ ö`, upper/lower) — MathML text is
  UTF-8. **Forbidden:** the XML/HTML-special characters `< > & " '` (they'd need escaping and risk
  corrupting the MathML); also avoid leading/trailing whitespace.
- **Non-empty.** Every listed English label needs a value. A label you decide should stay unchanged
  (genuinely language-neutral after all) is mapped **to itself**, not left blank (blank would delete
  the label from the equation).
- **Case.** Keep lowercase unless the label is a proper symbol — matches how subscripts read.
- **Consistency & distinctness.** Prefer the same abbreviation the book's glossary/body text already
  uses for that term; and keep two different English labels mapping to **different** Icelandic forms
  where the distinction matters to a reader (don't collapse `cell` and `change` onto one token).

The inventory script will **flag any value that violates length / charset / emptiness** so violations
are caught at map-entry time, not at render.

**Build:** per-book `books/<book>/math-label-map.json` (English → Icelandic). Substitution applied at
**inject** (lead decision) — the `03-translated` CNXML carries Icelandic labels, so the translated
artifact is genuinely translated and render/assistive-MathML follow for free. Substitution touches
**only** `<m:mtext>`/`<m:mi>` text nodes whose content **exactly** matches a map key; formulae (`CO`,
`AgCl`), operators, and single-letter variables (`k`, `P`) are never touched. Emits a **loud report of
unmapped English-looking math text** (mirrors the C3 loud-seam pattern) so newly-appearing labels
surface instead of silently passing.

**Test:** substitution unit tests — a mapped label → Icelandic; formula `CO` and variable `k`
untouched; an unmapped English word is reported, not mutated.

**Reaches readers via:** WS5 backfill re-render.

## WS5 — Delivery confirmation + Phase-3 hand-off · S · dep: WS1/2/4 landed

**Goal:** the fixes actually reach readers, and nothing else is stale.

- Verify aggregates (`05-publication/{glossary.json,toc.json}`, index) are fresh (regenerate if WS2/WS4
  changed key-terms/equation HTML).
- Single **backfill re-render** of both tracks (mt-preview all chapters + faithful ch01/ch03), the
  runbook pattern (`for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book
  efnafraedi-2e --chapter "$ch"; done` + the two faithful renders). Commit.
- Package a **Phase-3 sync+deploy hand-off** note for the lead (reuse the
  `2026-06-30-efnafraedi-rerender-sync-runbook.md` format) — the deploy itself runs on the server.

## Sequencing

1. **WS1 scan** + **WS2 triage** in parallel (both cheap, both read-first, both inform).
2. **WS4** once you supply the Icelandic label map (I produce the inventory in parallel with 1).
3. WS1 re-translations (if any) + WS2 fixes + WS4 substitution land as separate PRs.
4. **WS5** last — one backfill re-render + hand-off.

Each WS = its own PR off `main`; local `npm test` from repo root is the gate.

## Definition of done

- `scan-residue` reports chemistry clean (or residues re-translated).
- Every fidelity discrepancy is fixed or allowlisted-with-reason; manifest `green` is honest.
- Math-label map applied; no unmapped English labels remain unreported.
- Both tracks re-rendered current; Phase-3 hand-off delivered to the lead.
- No regressions: `npm test` + `npm run validate` green from repo root.

## Decisions (resolved by lead 2026-07-01)

- Figure alt-text (WS3 / a11y-1) is a **separate** effort, scheduled **last** — not in this spec.
- OK to spend API ISK for re-translation **provided a dry-run confirms it's within budget first**.
- WS2 honest-manifest **allowlist is mandatory** (not a prose note).
- WS4 substitution applied at **inject** (not render).
- Faithful/TM/localized tracks stay out (human Pass-1, adoption-bound).
