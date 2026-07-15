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

### (i) Content-coverage
For each **prose leaf** in `01-source`, its normalized own-text must appear as a contiguous substring
of the module's concatenated normalized segment text. A miss = a dropped/truncated leaf → flag
`{module, chapter, tag, sourceId | "id-less", snippet}`.

### (ii) No duplicate seg-ids
Flag any source `id` that defines >1 element within `<content>` (source-based, catches the
different-emitted-type collision the seg-id-based check misses), **and** any full seg-id that occurs
>1× in the raw markers (the inject-side `parseSegmentsMap` dedupes `'first'`, so a raw dup is a latent
inject drop). One-line pointer to campaign item #15; no policy work here.

## 4. The segmentable set S (load-bearing)

Derived from every `addSegment(type, …, elementId)` call site in `cnxml-extract.js` (read-only audit):

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

## 5. Own-text of a leaf

`ownText(E)` = the reader-visible text of E that is **not** accounted for by a descendant segment:

1. Work on a clone of E.
2. Remove `<m:math>`/`<math>` and `<media>` subtrees entirely — they carry no prose leaf (`<media>`'s
   only text is its `alt` **attribute**, not `textContent`), so removing them makes a math/media-only
   element deterministically non-prose without relying on `FORMULA_RE` matching a placeholder token.
   **Do NOT blanket-strip `<table>`** — its prose lives in `<entry>`/`<caption>`/`<title>` children,
   which are in S and are removed by step 3 (from a container's own-text) *and* collected as their own
   candidates. A blanket table-strip would make `<entry>` cells uncheckable, contradicting §4.
3. Remove every descendant **subtree whose tag is in S** (by tag — id-less children included), because
   that descendant is itself a coverage candidate. Subtracting by tag (not "id-bearing descendants
   only") empties container leaves (`problem`/`solution`/list-bearing paras, tables) regardless of child
   id-presence — hardening against the ~246 unextracted modules.
4. `textContent` of the remainder = own-text.

A leaf is a **coverage candidate** iff `countContentWords(normalizeForComparison(ownText)) >= 1`
(floor = **1**, not the residue default 3 — a 1–2 word option like "combustion" is a real drop) **and**
`isLanguageNeutral(ownTextRaw) === false` (formula/unit-only cells are not prose). Contract: pass RAW
case-preserving text to `isLanguageNeutral` (FORMULA_RE / case-sensitive pH depend on it) and
`normalizeForComparison()` output to `countContentWords` — both are required, neither alone is correct.

## 6. Normalization (the substring match)

Both sides reduce via `stripMarkers` + `normalizeForComparison` (from `tools/lib/residue-check.js`):
markers stripped to inner text, digits/symbols → space, Unicode-letter lowercased, whitespace
collapsed. Segment side additionally: concatenate all of a module's segments (so a source leaf split
across segments still matches). Match = source leaf's normalized string is a substring of the
concatenated normalized segment string. **Tradeoff (accepted):** module-level concatenation can, in
principle, report a leaf "present" if its token run happens to span two unrelated segments' boundary —
a false negative (missed drop). This is preferred over per-segment matching, which false-*positives*
whenever the extractor legitimately splits one source leaf across segments; and a whole-leaf drop (the
target class, e.g. `none of the above`) is absent from the concatenation entirely, so the boundary case
does not affect detection of the bug this gate exists to catch.

## 7. Mechanism go/no-go & fallback

**Primary = content-coverage (§3(i)).** General: catches the option-list drop, id-less para drops,
truncation, table-cell drops, glossary-def drops.

**Go/no-go spike (TDD FIRST, before the tool):** prove the normalization round-trip on 2–3 real pairs
— e.g. source `<para><emphasis effect="italics">Write the two half-reactions</emphasis>.</para>`
(→ own-text "Write the two half-reactions") and its segment `[[i:Write the two half-reactions]].`
reduce to the **identical** normalized string; and that m66438's `none of the above` reduces to a
string absent from the m66438 segment concatenation. If clean → content-coverage ships within S.

**Fallback (only if the round-trip genuinely explodes across marker dialects) = child-count:** for each
`<list id=L>` under `<content>`, the source item count must equal the number of `item:L-item-*` (and
`item:<child-id>`) segments; 0 → drop. Dead simple, no normalization, catches the exact review-option
class. Documented as fallback; **not** built alongside the primary.

## 8. Tool shape

- **CLI** `tools/verify-extraction-coverage.js` — cloned from `tools/scan-residue.js`:
  `--book <slug> [--chapter N|appendices] [--json]`, per-module report, summary line, `exit 1` on any
  flag. Read-only; resolves paths via `import.meta.url` (never `process.cwd()`). Not wired into extract.
- **Pure lib** `tools/lib/extraction-coverage.js` — no I/O; exports the collection + own-text + match
  functions so they are unit-testable. Consumes `cnxml-dom.js` (parse) + `residue-check.js` (normalize).
- **Post-MT half = one runbook line** pointing the checkpoint at the existing `tools/scan-residue.js`
  (EN-residue over `02-mt-output`). No new code.

## 9. Acceptance criteria (INVERTED — calibration is "flags known drops, passes known non-drops")

- **RED — must FLAG:**
  - **R1 (real, in-corpus):** m66438's dropped review options (`none of the above`, etc.) — content
    absent from segments.
  - **R2 (synthetic unit):** a fixture module with one prose `<para>`/`<item>` segment deleted → flagged.
- **GREEN — must NOT flag:**
  - **G1 (id-orphan, content present):** m68710 `fs-idp218612096` — "Write the two half-reactions" is
    present 3× under sibling ids; content-coverage reports it present (id-coverage would have false-flagged).
  - **G2 (inline term):** a body `<term id>` whose text is a substring of its parent para segment.
  - **G3 (language-neutral):** a formula/unit-only cell (e.g. `(a) CrP; (b) HgS`) — not prose, not flagged.
- **Corpus cross-check (informational, read-only):** run over extracted biology-11 + a chem sample.
  **Expect** biology to flag the review-option drops (that is the gate working, not a failure); **expect**
  m68710-class chem modules to pass. Do **not** treat "green on biology-13" as success. Any *chem* flag
  that is not a known id-orphan gets a human glance (potential real drop); do not edit frozen content.

## 10. Testing plan (Vitest, TDD)

Unit (pure lib): the §7 normalization-round-trip spike (written first); R1, R2, G1, G2, G3; own-text
subtraction (math/media/table stripped, in-S descendants subtracted); dup-seg-id (source-based +
raw-marker). CLI smoke test mirroring `scan-residue` tests (exit code, `--json` shape). `npm test` from
the repo root is the authoritative gate.

## 11. Deliverable (one PR, sizing S→M)

New CLI + new lib + tests + a runbook line in the biology-intake runbook + register update (6b done,
BIO-EX3 recorded, exclusion rules). The `processExercise` fix is a **separate follow-up PR**.

## 12. Risks & open items

- **Normalization round-trip** is the one sub-problem that can balloon (marker-dialect zoo across 259
  heterogeneous modules). Mitigation: TDD spike as the §7 go/no-go before building the tool.
- **`processExercise`-fix safety (for the follow-up, not this PR):** before telling the lead the fix is
  corpus-safe, run a **structural** `<list>`-in-`<problem>` / `class="multiple-choice"` sweep across
  every FROZEN book (chemistry confirmed frozen; verify physics/organic/microbiology). A frozen hit
  means adding option-extraction renumbers frozen seg-ids (BIO-EX2 landmine).
- **Untested id-less sibling classes** (red-team): table `<entry>` cells, `<note>`/`<example>` inner
  prose, caption-titles, glossary defs — content-coverage over leaves subsumes them; the first corpus
  run confirms whether any are live.
