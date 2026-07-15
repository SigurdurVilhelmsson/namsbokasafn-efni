# Design: Pre-freeze extraction-coverage gate (campaign item 6b)

**Date:** 2026-07-15
**Campaign item:** 6b (Phase 2, `docs/plans/2026-07-11-pre-semester-coding-campaign.md`)
**Status:** design approved (revised v2 — content-coverage), pending spec review
**Design-hardening evidence:** workflow `wf_3dff697e-993` (recon + adversarial critique); findings self-verified against the live corpus. Register: BIO-EX1 (falsified) / BIO-EX2 / **BIO-EX3** (the live bug).

---

## 1. Context & problem

Biology (`liffraedi-2e`) is being onboarded: 13 of 259 modules extracted, **0 faithful**. Because
biology is 0-faithful, the only *irreversible* corpus corruption is **freezing a mis-segmented
extraction** — once a seg-id lands in `03-faithful-translation` or trips an MT edit-lock it is frozen
(it is the export-corpus join key). A gate that runs **after extraction, before the MT/Pass-1 freeze**
catches mis-segmentation where the fix is a **free re-extract**.

The design-hardening pass falsified the plan's premise and found a **live content-loss bug**:

- **BIO-EX3 — `processExercise` silently drops multiple-choice answer options.**
  `tools/cnxml-extract.js` `processExercise` (~L1355–1357) does
  `extractElements(problemMatch[1], 'para')` — it extracts only `<para>` from each `<problem>` and
  never invokes `processList` on the enumerated option `<list>`. The id-less `<item>` answer choices
  are never segmented → never MT'd → **absent from the Icelandic corpus** (reader sees a question stem
  with no choices). No error is raised.
  - **Verified live:** m66438 options `water and polymers`/`none of the above`/`combustion`/
    `acid-base reaction` = 0 occurrences in `02-for-mt`, stems present (selective drop);
    m66374 emits item-segments for 1 of 6 lists; m66376 drops `facilitated transport`/etc.
  - **Blast radius:** 208/259 biology modules carry `class="multiple-choice"` review sections.
  - Chemistry appears unaffected (no enumerated MC reviews — phrase-probe; needs structural confirm
    before any *fix*). Contradicts `docs/pipeline/cnxml-fidelity-gaps.md` ("✅ handled").

- **Why the plan missed it (BIO-EX1 falsified).** BIO-EX1's "0 dropped seg-ids" measured
  **id-coverage**. id-less items get synthesized `auto-N` seg-ids, so a dropped id-less item leaves no
  *missing seg-id* — id-coverage is structurally blind to it. **"0 dropped seg-ids" ≠ "0 dropped
  content."** The originally-approved id-coverage mechanism is therefore **abandoned**: on the real
  corpus it *false-flags* the id-orphan class (m68710, whose content is present 3×) and is *blind* to
  the id-less-leaf drop class that actually loses content.

## 2. Goal & non-goals

**Goal.** A read-only, per-module checkpoint tool that flags, before freeze, any reader-visible
`01-source` prose that is **absent from that module's segment corpus** (`02-for-mt`), plus duplicate
seg-ids. Detection only. Its first run inventories the full drop set across all 259 biology modules.

**Non-goals (explicit).**
- **Not** the `processExercise` fix — that is a separate follow-up PR (gate-first sequencing, lead-approved).
- **Not** an extract-traversal rewrite (BIO-EX2 — renumbers chemistry's frozen seg-ids, export-hostile).
- **Not** wired into `cnxml-extract`; **writes nothing** under `books/`.
- **Not** item #15's dup-seg-ID policy unification (assertion (ii) is a minimal flag + a pointer).
- **Not** a fuzzy/token-overlap scorer, a multi-book calibration harness, or both mechanisms built.

## 3. Assertions

### (i) Structural coverage  ← mechanism decided by the §7 go/no-go spike (2026-07-15)

**Content-coverage (contiguous-substring of normalized prose) was REJECTED by the go/no-go spike**
(§7): biology's pre-B4 segments carry legacy marker dialects (`__term__`, `*emphasis*`, `~sub~`,
`^sup^`) that neither `normalizeVisibleText` nor `normalizeForComparison` strips, so substring matching
false-positives on *present* paragraphs (verified: m66440 "familiar with carbohydrates" present in
segments yet flagged; m66438 `fs-id1724224` present as `__biological macromolecules__` yet flagged).
Hardening the normalizer to a robust multi-dialect reducer is scope-creep past S and still fragile.

**Adopted mechanism — expected-seg-id coverage over the extractor's deterministic id-linked emit
schemes** (normalization-free, orphan-immune). For each source container-child that `cnxml-extract.js`
emits under a deterministic id, assert that expected seg-id is present among the `02-for-mt` markers:

- **List items — v1 scope, the verified BIO-EX3 bug:** for each `<list>` under `<content>` with K direct
  `<item>` children, the expected seg-id of item *i* is `item.id || `${list.id}-item-${i+1}`` (verbatim
  from `cnxml-extract.js:1646/1697`). Fewer than K present → flag `{module, listId, present/K, missing
  item text snippets}`. (Spike: m66438 3/3 option lists flag 0/4; m68710 stepwise list passes 6/6.)
- **Glossary term/def & figure captions — DEFERRED fast-follow (not v1):** the identical id-linked
  pattern (`${term.id}-term`/`-def` at `cnxml-extract.js:568/573`; `${figure.id}-caption` at `:1099`).
  Left out of v1 because (a) the verified live bug is lists only, (b) the glossary term-id source needs
  confirming, and (c) YAGNI. Add when calibration or a future intake surfaces a live drop in these
  classes. The v1 corpus run spot-checks them manually.

This is **orphan-immune** (counts a list's items against its own id-linked scheme; never checks an
individual inner-para id, so the m68710 `<item><para id>` orphan that sank plain id-coverage does not
participate) and **dialect-immune** (no prose text is compared — only seg-id presence).

**Deliberately NOT detected (documented residual, runbook + register):** standalone id-bearing `<para>`
drops (none found live — the spike's para "flags" were all legacy-marker false positives), truncation
*within* a present item, and id-less `<table>` `<entry>` drops (entries get `auto-N` ids not linked to
their table, so they are not count-attributable — unlike list items). These need robust content-coverage
(deferred) and are logged so a future drop in these classes is not silently assumed impossible.

### (ii) No duplicate seg-ids
Flag any source `id` that defines >1 element within `<content>` (source-based, catches the
different-emitted-type collision the seg-id-based check misses), **and** any full seg-id that occurs
>1× in the raw markers (the inject-side `parseSegmentsMap` dedupes `'first'`, so a raw dup is a latent
inject drop). One-line pointer to campaign item #15; no policy work here.

## 4. The segmentable set S (reference — was load-bearing for the rejected content-coverage mechanism)

> **Note (2026-07-15):** With structural coverage adopted (§3(i)), the gate no longer collects "all S
> leaves" — it keys off the three id-linked emit schemes (list items / glossary / captions). This table
> stays as the authoritative record of what the extractor segments (derived from every
> `addSegment(type, …, elementId)` call site) and grounds the id-linked schemes in §3(i).

| source tag | segment type(s) | scope |
|---|---|---|
| `<para>` | para / problem / solution / entry | `<content>` |
| `<item>` | item / para | `<content>` |
| `<entry>` | entry (table cell) | `<content>` |
| `<title>` | title / para-title / note-title / section-title | `<content>` |
| `<caption>` | caption | `<content>` |
| `<term>`, `<meaning>`/`<definition>` | glossary-term / glossary-def | `<glossary>` (separate pass) |

**Collection set S = {para, item, entry, title, caption}** for the `<content>` pass, plus a separate
`<glossary>` pass over term/definition text. Inline tags (`term`/`emphasis`/`link`/`footnote`/`sub`/
`sup`) are **NOT** in S — they ride inside their parent block segment as bracket/underscore markers and
never become a seg elementId; collecting them would false-flag every body `<term id>` and make GREEN
unreachable. Use S, **not** `cnxml-dom.js` `BLOCK_TAGS` (which omits item/title/caption/entry).

**Out of scope for v1 (documented in the runbook):** module `<title>` and `<abstract>` (live outside
`<content>`; id-less single top-level captures, low drop risk; including them risks metadata false
positives). A dropped module title/abstract is not silently plausible the way an id-less option is.

## 5–6. Own-text & normalization (SUPERSEDED — content-coverage rejected)

> **Superseded 2026-07-15 by the §7 go/no-go.** These sections specified the own-text computation and
> the `normalizeVisibleText`/`normalizeForComparison` substring match for the content-coverage
> mechanism. The spike (§7) proved that mechanism is defeated by biology's legacy marker dialects, so it
> is not implemented. Retained only as the rationale trail. The adopted structural mechanism (§3(i))
> uses **no prose normalization** — it compares seg-id presence only.

## 7. Go/no-go outcome (2026-07-15 scratchpad spike over the real corpus)

The spec mandated proving the content-coverage normalization round-trip before building on it. The
scratchpad spike ran it against the live corpus and **rejected content-coverage; adopted structural
coverage** (§3(i)). Evidence:

- **Content-coverage substring match, correct normalizer (`normalizeVisibleText` + lowercase):**
  m68710 GREEN improved 10→2 flags but still false-positive; m66438/m66440 flagged *present* paragraphs.
  Root cause: biology's pre-B4 segments use legacy `__term__`/`*i*` markers that `normalizeVisibleText`
  does not strip — `As you've learned, __biological macromolecules__ are large` ≠ source
  `As you've learned, biological macromolecules are large`. Confirmed present via grep (m66440
  "familiar with carbohydrates" = 1, "stoichiometric formula" = 1) → **false positives**, not drops.
  A robust multi-dialect normalizer is past S and still brittle.
- **Structural coverage (child-count + id-linked presence), zero normalization:** RED — m66438 3/3
  option lists flag (`0/4` emitted), m66440 5/5, m66373 4/4, m66374 **4/5** (the 1 content list passes),
  m66376 6/6. GREEN — m68710 4 lists **0 flags** (stepwise list 6/6; orphan invisible), m66437 0/0.
  **Zero false positives, deterministic.**

**Decision:** implement structural coverage (§3(i)). No normalization, no own-text, no marker handling.
The spike code is throwaway; the plan re-derives it as TDD from the fixtures in §9.

## 8. Tool shape

- **CLI** `tools/verify-extraction-coverage.js` — cloned from `tools/scan-residue.js`:
  `--book <slug> [--chapter N|appendices] [--json]`, per-module report, summary line, `exit 1` on any
  flag. Read-only; resolves paths via `import.meta.url` (never `process.cwd()`). Not wired into extract.
- **Pure lib** `tools/lib/extraction-coverage.js` — no I/O; takes source CNXML text + segment file text
  as strings, returns `{ listFindings, dupFindings }`. Consumes `@xmldom/xmldom` `DOMParser` (find
  `<content>`, walk `<list>`/`<item>`) + `seg-markers.cjs` `parseSegmentsMap` (emitted seg-ids).
  **No `residue-check`, no prose normalization** — seg-id presence only. Expected list-item seg-id =
  `item.id || `${list.id}-item-${i+1}`` (mirrors `cnxml-extract.js:1646/1697`).
- **Post-MT half = one runbook line** pointing the checkpoint at the existing `tools/scan-residue.js`
  (EN-residue over `02-mt-output`). No new code.

## 9. Acceptance criteria (INVERTED — calibration is "flags known drops, passes known non-drops")

- **RED — must FLAG (fixtures built from real corpus text):**
  - **R1 (real, in-corpus):** m66438's dropped option lists — `<list id=fs-id1238542>` etc. with 4
    `<item>`s, 0 `item:fs-id1238542-item-*` segments emitted → flag.
  - **R2 (synthetic unit):** a fixture list with K items where one expected `item:*` seg-id is removed
    from the segment file → flag (`present = K-1`).
- **GREEN — must NOT flag:**
  - **G1 (id-orphan, content present):** m68710's stepwise list `<list id=fs-idp34895184>` with 6 items
    → 6 `item:fs-idp34895184-item-*` segments present → **not flagged** (the orphaned inner-`<para id>`
    never participates — this is what sank plain id-coverage and passes here).
  - **G2 (present content list):** m66374's one legitimate content list (4/5 lists flag; that 1 passes)
    → items emitted → not flagged.
  - **G3 (nested/complex list):** a list whose items carry their own `id`s (not the `-item-N` scheme) →
    matched by `item.id` → not flagged.
- **Corpus cross-check (informational, read-only):** run over extracted biology-11 + a chem sample.
  **Expect** biology to flag the review-option drops (that is the gate working, not a failure); **expect**
  m68710-class chem modules to pass. Do **not** treat "green on biology-13" as success. Any *chem* flag
  gets a human glance (potential real drop); do not edit frozen content.

## 10. Testing plan (Vitest, TDD)

Unit (pure lib), each fixture a minimal CNXML string + segment-file string: R1 (list 4 items / 0
emitted → flag), R2 (K items / K-1 emitted → flag), G1 (list 6/6 → pass), G2 (content list all emitted
→ pass), G3 (items with own ids → pass), id-less-list skipped (no false flag); dup-seg-id (source id
defines 2 elements → flag; raw-marker dup → flag). CLI smoke test mirroring `scan-residue` tests (exit
code 0/1, `--json` shape). `npm test` from the repo root is the authoritative gate.

## 11. Deliverable (one PR, sizing S)

New CLI + new lib + tests + a runbook line in the biology-intake runbook + register update (6b done,
BIO-EX3 recorded, go/no-go outcome). The `processExercise` fix is a **separate follow-up PR**.

## 12. Risks & open items

- **id-less lists** (`<list>` with no `id` attribute): the expected item seg-id `${list.id}-item-N`
  becomes `undefined-item-N` — the check can't compute a real expected id, so such a list must be
  **skipped** (not flagged) to avoid a false positive. Calibrate against biology (the verified-bug lists
  all carry ids); log any id-less list encountered.
- **`processExercise`-fix safety (for the follow-up, not this PR):** before telling the lead the fix is
  corpus-safe, run a **structural** `<list>`-in-`<problem>` / `class="multiple-choice"` sweep across
  every FROZEN book (chemistry confirmed frozen; verify physics/organic/microbiology). A frozen hit
  means adding option-extraction renumbers frozen seg-ids (BIO-EX2 landmine).
- **Classes structural coverage does NOT catch** (documented residual — **not-yet-observed, NOT proven
  absent**): standalone id-bearing `<para>` drops, truncation within a present item, id-less `<table>`
  `<entry>` drops. The "no standalone-para drops in biology" claim rests on a few greps + biology-11
  having 0 nested lists — that is *not-yet-observed*, not *confirmed safe*; treat accordingly at full
  intake. These need robust content-coverage (deferred — blocked on a multi-dialect normalizer). Logged
  so a future drop here is not silently assumed impossible.
- **Container-skip verified on real data** (not only synthetic fixtures): the flattening-container skip
  was confirmed by extracting `books/liffraedi-2e/01-source/ch21/m66534.cnxml` in-memory (`extractSegments`
  → `analyzeModule`) — the entry-nested list `fs-idm54557568` is NOT flagged (content present in its
  entry segment) while 6 genuine multiple-choice problem-option lists in the same module ARE flagged.
  `caption`/`footnote` share `entry`'s `extractInlineText`→`stripTags` flattening path (code-confirmed,
  same mechanism the reviewer verified for `entry`/`table`).
