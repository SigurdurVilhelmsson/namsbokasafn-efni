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

**✅ RESULT (2026-07-01, PR pending):** scanner shipped (`tools/scan-residue.js` + pure
`tools/lib/residue-scan.js`). Whole-book chemistry scan = **0 genuine body residues** — all 24 body flags
are false positives (localized-decimal answer keys, chemical formulae, scientist proper-name note-titles,
unit relations). The only genuine English is the **preface `m68662` (76 segments = OpenStax
author/contributor attribution)**, which the lead chose to **leave verbatim** (names/institutions don't
translate; a custom Icelandic *formáli* already exists). **No re-translation; no `02-mt-output` change.**
Two out-of-scope finds logged to the pipeline plan's register (A2 detector false-positives on ≥3-letter
units; `requireBook` cwd-relative path).

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

---

## Re-prioritization after Fable-5 fidelity review (2026-07-02)

A multi-agent **Claude Fable 5** review of the fidelity/provenance pipeline (11 agents, adversarially
verified, top claims hand-spot-checked; full report: **`docs/audit/2026-07-02-fable5-fidelity-provenance-review.md`**)
found that **"119/148 PERFECT / green" is not a losslessness guarantee** — the check compares only the
opening-tag-name multiset (MathML collapsed, attributes/text/**order** ignored). Real reader-visible
corruption is live inside the PERFECT/benign/green labels. 22 findings survived → 15 ranked (13 CONFIRMED,
2 PLAUSIBLE). **This does not replace WS1–WS5; it re-sequences them, because several findings are
prerequisites to this plan's own remaining workstreams and one reopens WS2.**

### How the findings attach to the existing workstreams
- **WS2 (was ✅ done) is REOPENED** by **F3** (the 28 `benign` allowlist entries were classified by tag
  *family* with boilerplate reasons, never instance-verified; ≥6 mask byte-verified glossary `<sub>`
  corruption, incl. the **faithful** track) and **F7** (allowlist matches a bare signed integer → track-,
  cause-, and netting-blind). The manifest *arithmetic* stands; the *classifications* and the check's *scope*
  don't. WS2's own DoD ("green is honest") is not yet met.
- **WS4 (math labels) gains a prerequisite: F8** — all MathML is stripped before counting, so WS4's
  `<m:mtext>`/`<m:mi>` edits are invisible to certification. Add normalized-math-content hashing to the
  fidelity check *before or with* WS4.
- **WS5 (delivery re-render) is now gated on F1 + F4/F5/F6**, not just WS1/2/4 — a re-render re-bakes the
  scramble (F1) and re-emits the marker residue (F4/F5/F6) into published HTML.
- **F2 is new and standalone** (server provenance safety) — no workstream owns it, but "clean slate before
  biology" requires it.

### DO NOW — blocks biology onboarding and/or the WS5 re-render
1. **F2 — guard `01-source/`** (`server/routes/admin.js` fetch-source; `pipelineService.js:598–637`;
   `tools/download-source.js`). Single generic `confirmed:true` (zero when no faithful segments) can overwrite
   the irrevocable CC BY copies; triple-consent rule unenforced in code; no `01-source` checksum. **Only
   irreversible risk on the list — do first.** Refuse-overwrite + commit a SHA-256 manifest CI verifies.
2. **F1 — fix extract section ordering** (`cnxml-extract.js:685` `processSection` — port the top-level
   position-sort ~512–525) **+ add an id-order (LCS) check to the fidelity check.** ~15–36 PERFECT modules
   publish scrambled order (verified m68702, m68833). Deterministic → will corrupt biology and re-bake on WS5.
3. **F4/F5/F6 — three marker-residue inject bugs** (`cnxml-inject.js` ~1136 `[[TABLE:]]`, ~1154 nested
   `[[i:[[link:]]]]`, ~827 lowercased `[[math:N]]`) **+ add a "no `[[` in output" assertion to the
   completeness gate.** Verified live in `05-publication/` HTML. Must be clean before the WS5 re-render.
4. **F3 — re-triage all 28 `benign` allowlist entries** with a real per-instance source-vs-output text diff
   (one-off script), and fix the glossary `<sub>`/emphasis re-anchoring in inject. **Closes WS2's actual
   honesty gap.**
5. **F8 — normalized-math-content hashing in the fidelity check** — do *with* WS4 (its only safety net when
   editing equations).

### FOLLOW-UP — non-blocking (robustness; after the clean slate is delivered)
- **F7** allowlist track + cause-fingerprint; **F9** `<link>` attribute (`document`/`target-id`/`url`) check
  (already one live broken cross-doc link, m68692); **F10** give the **faithful** track its own manifest
  record; **F11** capture note-nested tables/equations in position at extract; **F12** `--strict` nonzero exit
  on skipped/zero-checked; **F13** count closing tags + allow hyphenated element names; **F14** make
  known-loss pointers repo-relative + resolvable; **F15** read the manifest `generated` timestamp, don't trust
  `green` alone (merge=ours staleness window).
- **Two un-reviewed surfaces = future Fable-5 targets** (use sparingly): a systematic **`server/` authz pass**
  (F2 hints at more unenforced-guard gaps of that class) and the **vefur / cross-repo seam**. Neither was in
  this review's scope (pipeline-tools only; server touched only where it intersected CC-BY provenance).

### Revised sequencing
1. **F2** (standalone, urgent, small) → land first.
2. **F1 + F4/F5/F6 + the completeness-gate `[[` assertion** → these gate WS5.
3. **F3** benign re-triage + inject `<sub>` fix → completes WS2's honesty DoD.
4. **WS4 + F8 together** (math-label map from lead + math-content hashing guard).
5. **WS5 last** — backfill re-render (now emitting corrected order + no residue) + Phase-3 hand-off.
   **⚠️ Do not run the Phase-3 sync/deploy until steps 1–4 land, or it re-publishes the corruption.**

> Amended Definition of Done: WS2's "green is honest" now additionally requires the benign class to be
> instance-verified (F3) and the check to cover order (F1) and math content (F8) — not just tag-name counts.

---

## Amendment 2026-07-03 — clean-slate re-architecture decision + oracle-hardening gate

**Trigger:** the parked "should we rebuild the pipeline ground-up from CNXML-EN + the Erlendur API?"
question was investigated and answered. Design spec:
**`docs/design/2026-07-03-clean-slate-translation-system-design.md`** (merged, PR #221; advisor +
Fable-5 adversarial red-team). This amendment folds its conclusions into this plan. It does not add a
workstream — it closes the rewrite question, converts the scattered oracle findings into an explicit
**biology gate**, and adds one new editorial item (F16).

### Decision: DON'T rewrite to unblock biology — finish this clean-slate, onboard on the current pipeline
- The current inject is confirmed **reconstruct-from-sidecar + re-serialize** (not splice); that step is
  the F1/F4/note-relocation/finding-9 bug factory.
- But the scorecard is **3-of-4 and mostly already-banked**: F1/F5/F6 shipped (#219/#220). A
  structure-preserving design kills only **F4** of the three *reader-visible* residue classes;
  **F5/F6 inline-marker residue is intrinsic to ANY plain-text-API design** → a rewrite does NOT clean
  the pages, finishing the inline fixes does.
- The ideal's unique win (untouched-byte/attribute fidelity) is a **remerge** concern, and remerge needs
  **canonical-equivalence, not byte-identity** (`docs/pipeline/cnxml-fidelity-gaps.md` Gaps 3/5 classify
  whitespace/attribute-order as cosmetic) — off biology's critical path.

### The oracle work is now a GATE, not scattered next-steps
The memo's highest-leverage point: the fidelity oracle is *blind* (tag-name multiset only; order/attrs/
math/text ignored), and hardening it is **needed either way** — it is the prerequisite that makes both
"finish now" and any future candidate-D swap safe. Split the F-items by whether they **gate biology**
(silent, baked-in corruption of a fresh book) or **trail** it (quality hardening):

**GATE biology extraction + the WS5 re-render (land before onboarding biology):**
- **Promote the id-order (LCS) check from warn-only → hard-fail.** #219 added it *warn-only*
  (`cnxml-fidelity-check.js:357-359`); as a warn it does not stop biology's F1-class reorders baking in
  and certifying PERFECT (audit's #1 pre-biology warning). Small change, high leverage.
- **F8 — normalized math-content hash** (already planned *with* WS4). Must land before biology
  extraction, not after — the only guard when WS4 edits equations; chemistry's densest content is
  otherwise unprotected.
- **F4 — table double-model, fixed at extraction** (model once; mirror `figuresHandledInContainers`).
  Already the next clean-slate item; the memo confirms the extraction-level fix, not an inject-side hack.

**TRAIL into the throughput/robustness track (harden quality; do not cause irreversible corruption of a
fresh book):**
- **F9** `<link>` attribute diff (`document`/`target-id`/`url`) — the finding-9 class (marker-grammar
  lossiness at `cnxml-extract.js:265`; one live broken cross-doc link, m68692). **F7** allowlist
  track-field + cause-fingerprint; **F10** faithful-track manifest record.
- **F16 (NEW) — per-segment marker-sequence flag.** The Erlendur API **reorders clauses** (verified: a
  Table-1.1 link swapped position; Icelandic is V2), so a faithful pipeline — spliced OR reconstructed —
  re-emits `[[MATH:2]]…[[MATH:1]]` in swapped order → prose attributes the **wrong** equation,
  **oracle-green under every architecture**. The id-order/LCS check cannot tell this from legitimate
  Icelandic reordering. Only mitigation: an editorial flag — where the IS marker order differs from EN
  within a segment, surface for human review. Owner = throughput track (editorial feature), not
  clean-slate.

### Candidate-D watch-item (revisit trigger — do NOT build now)
If we ever migrate, the documented ideal is **candidate D** — faithful DOM edit-in-place + canonical
serialize + canonical-diff remerge — **not** the byte-splice candidate C (highest-risk component the
project has ever considered) and **not** an incremental hybrid (double-writing tar pit; guard oracle
can't go green mid-migration). Bring it forward only as a **clean, prototype-proven whole-pipeline swap**
(validated on m68789/m68811/m68702 against the hardened oracle) and **only if** onboarding
biology/organic/microbiology requires **writing a new container-type builder**
(`buildExerciseDom`/`processNote`-style) — the observable signal that reconstruction cost is scaling
per-book. The per-book *translatability taxonomy* cost is present under all designs and is NOT the
trigger. Absent the signal, it stays parked.

### Revised sequencing (supersedes the 2026-07-02 "Revised sequencing" for the biology-gating question)
1. **F2** ✅ (#218) → **F1** ✅ (#219) → **F5/F6 + `[[` gate** ✅ (#220).
2. **F4** (extraction) + **promote id-order check to hard-fail** + **F8 math-hash (with WS4)** → the
   **oracle-hardening gate**.
3. **F3** benign re-triage (now byte-diff-backed by the hardened oracle) → completes WS2 honesty DoD.
4. **WS5** batched re-extract → re-inject → re-render → sync (chemistry clean slate delivered).
5. **Biology onboarding** — gated behind step 2 (id-order hard-fail + math-hash) and F4. F9/F7/F10/F16
   trail.
