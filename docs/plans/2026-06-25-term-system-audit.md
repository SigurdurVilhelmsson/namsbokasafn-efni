# Term-system audit & fix — book-wide glossary/index aggregates

**Date:** 2026-06-25
**Scope:** `efnafraedi-2e` (fixed), `lifraen-efnafraedi` (gap reported), architecture recommendation.

## 1. The bug (reported from the reader side)

On namsbokasafn.is the chemistry book showed **dead glossary tooltips** in many
chapters — e.g. §6.1 has 24 inline `<dfn class="term">` markers but zero
tooltips. The reader's tooltip action (`vefur: src/lib/actions/glossaryTerms.ts`)
needs **both** an inline `<dfn class="term">` (present in the HTML) **and** a
matching entry in the book-wide `glossary.json` (absent).

### Root cause

The two book-wide aggregates were **stale**:

| File | Generated | Covered |
|------|-----------|---------|
| `…/mt-preview/glossary.json` | 2026-03-06 | only ch {1,2,3,4,5,9,12,13} |
| `…/mt-preview/index.json` | 2026-02-22 | only ch {1,2,3,4,5,9,12,13} |

The book content (chs 6–21) was finished later (May 2026) but the aggregates
were never regenerated. A measured before/after, replicating the reader's exact
3-tier matcher against the published HTML:

```
glossary coverage of <dfn class="term"> across all chapters:
  BEFORE (stale live): 310/854 dfns match (36%)   ch6,8,10,11,14–21 ≈ 0%
  AFTER  (this fix):   705/854 dfns match (83%)    +393 dfns, 0 regressions
```

(The unmatched remainder is mostly proper names — `Newton`, `Bohr` — which
correctly have no glossary entry, plus a tail of inline terms the CNXML
`<glossary>` never defined; see §4 follow-ups.)

## 2. Footguns & the real root cause

1. **Different default tracks.** `generate-glossary.js` defaults to
   `--track mt-preview` (full 21-chapter coverage); `generate-index.js` defaults
   to `--track faithful` (only ch01+ch03 exist → would have made index.json
   *worse*). Both must be run against `mt-preview`, which is the track the reader
   actually serves (vefur `sync-content.js` only overlays the *faithful* rollup
   when the **whole book** is faithful; otherwise the mt-preview rollup is
   canonical).

2. **A hand-curation layer that regeneration silently destroys.** The live
   `glossary.json` was generator output **plus** manual edits (commit
   `4d8ba9df`): 7 hand-authored terms with no CNXML `<glossary>` source, 9
   `alternateEnglish` synonym arrays, 1 english fix. A naïve re-run wipes all of it.

3. **ROOT CAUSE of the "ch5 regression" — a markup-intolerant regex in both
   generators.** `generate-glossary.js`/`generate-index.js` extracted the headword
   with `<term>([^<]+)</term>`, which matches **only pure text**. OpenStax wraps
   physical-quantity symbols in `<emphasis effect="italics">` (and some terms carry
   `<m:math>` + `[[math:N]]`), e.g. `varmi (<emphasis>q</emphasis>)`,
   `vermi (<emphasis>H</emphasis>)`. Every such `<term>` was **silently dropped** —
   **65 terms book-wide** for efnafraedi-2e (763 glossary terms in the CNXML, only
   698 extracted). A re-injection between March and now wrapped those symbols in
   markup, which is why the loss *looked* like a content regression in ch5
   (thermochemistry — heavy in symbol-annotated quantities: enthalpy, heat, work,
   internal energy, heat capacity…). The definitions were **never lost from the
   CNXML**; the tool couldn't see them. Fixed in `tools/lib/glossary-term.js`
   (strip `<m:math>` blocks and `[[math:N]]`, then strip inline tags — the same way
   `<meaning>` was already handled), used by both generators. Regression-guarded by
   `tools/__tests__/glossary-term.test.js`.

4. **A terminology mistranslation surfaced by the fix — stale, mixed-vintage MT.**
   ch5 `m68727`'s glossary block (and its exercises) render *enthalpy* as
   **`entalpía`**, while the body text and the Íðorðabanki-approved glossary use
   **`vermi`**. Root cause established by experiment (`scratchpad:
   mt-enthalpy-experiment.mjs`): sending the real English segments through Miðeind
   **with** the current approved glossary (which has `enthalpy→vermi` since
   2026-03-11) yields **`vermi` consistently** (body + glossary + combustion/
   formation); **without** the glossary it yields **`varmi`** (heat — wrong);
   neither yields `entalpía`. So `entalpía` is **leftover MT from an earlier pass**:
   the last commit to touch ch5's MT output (2026-03-23 `57467ce3`) was a
   re-extract/re-**inject**, not a re-translate, so older pre-glossary `entalpía`
   segments survived alongside a later `vermi` body. The only `entalp*` terms
   book-wide are these (ch5 only).
   - **RESOLVED at source (2026-06-25).** ch5 was re-translated with the current
     glossary and re-injected/re-rendered:
     `api-translate --book efnafraedi-2e --chapter 5 --force` (113,761 chars,
     ~ISK 1,140 at the observed rate) → `cnxml-inject --chapter 5` →
     `cnxml-render --chapter 5 --track mt-preview`. Result: `entalp` count is **0**
     across the ch5 CNXML, the rendered HTML (glossary, body **and** exercises), and
     the regenerated `glossary.json`; enthalpy reads `vermi` everywhere natively.
     The 4 `correctHeadword` stopgap entries were **removed** from the supplement
     (the `correctHeadword` *capability* in `apply-glossary-supplement.js` is kept
     for future MT/Íðorðabanki drift). No section slugs/filenames changed (5.3 was
     already `5-3-vermi.html`), so no reader URLs broke. ch5 dfn coverage 100%.
   - Re-translation vs the previous MT output: 65% of segments differ but total
     length is ~unchanged (−1.3%) → overwhelmingly cosmetic rewording (neural-MT
     non-determinism); no systematic register shift; the one substantive delta is
     the now-consistent glossary application (the enthalpy fix).
   - The interim `correctHeadword` mechanism (rename a generated headword by English)
     remains the right tool if MT terminology drift is found in a chapter that
     *can't* be cheaply re-translated.

## 3. The fix shipped

Two parts: **(a)** the generator root-cause fix above (recovers 65 terms natively),
and **(b)** a **durable curation supplement** that makes regeneration
non-destructive and idempotent:

- `tools/apply-glossary-supplement.js` — applies a committed supplement on top of
  `generate-glossary.js` output (all ops match the reader's matcher in
  `glossaryTerms.ts`):
  - `correctHeadword`: rename a generated headword in place, keyed by English
    (parenthetical-insensitive) — documented terminology corrections where MT
    deviated from Íðorðabanki (the `entalpía`→`vermi` family).
  - `graftAlternateEnglish`: union synonym arrays onto the generated entry sharing
    the primary English, so inline `(e. synonym)` annotations still resolve.
  - `add`: append an entry **only if** neither its Icelandic headword nor its
    English (incl. `head (parenthetical)` composite parts) is already covered by
    the generated output — so it rescues only genuinely-missing hand-authored terms
    and never creates a stale duplicate once the CNXML provides one.
- `books/efnafraedi-2e/glossary-supplement.json` — the committed curation: **6
  `add`** (hand-authored, no CNXML source: Atwater system, cathode ray, biofuel,
  Gay-Lussac's law, series, molecular mass) + **11 `graftAlternateEnglish`**. (The 4
  `correctHeadword` enthalpy entries were retired once ch5 was re-translated — see
  §2.4; the op remains available in the tool.) Provenance: commit `4d8ba9df` + this audit.
  Note: the symbol-annotated terms the old supplement "rescued" are **gone** — they
  extract natively after the §2.3 fix.
- Unit tests: `tools/__tests__/apply-glossary-supplement.test.js` (15 cases) +
  `glossary-term.test.js` (7 cases).

### Canonical regeneration command (efnafraedi-2e)

```bash
node tools/generate-glossary.js --book efnafraedi-2e
node tools/apply-glossary-supplement.js --book efnafraedi-2e
node tools/generate-index.js --book efnafraedi-2e --track mt-preview \
  --toc ../namsbokasafn-vefur/static/content/efnafraedi-2e/toc.json
```

Result: `glossary.json` 753 terms, `index.json` 763 entries (all 21 chapters, 0
missing `sectionSlug`). Reader-matcher coverage of inline `<dfn>` went **36% → 87%**
(310→740 of 854), **0 regressions** vs the old live file, +35 net fixes;
`rafsegulgeislun` and the rest of §6.1 resolve, and enthalpy shows `vermi`.

## 4. Known follow-ups (separate from the staleness fix)

A tail of inline `<dfn class="term">` still has no glossary match because the
CNXML `<glossary>` never defined them (not a tooling gap — the same class as the
7 hand-adds in `4d8ba9df`). The checker
(`scratchpad: check-term-coverage.mjs`) lists them per chapter; e.g. §6.1:
`bylgjulengd` (wavelength), `tíðni` (frequency), `ljóseindir` (photons),
`Standbylgjur` (standing waves). These are **content-completeness** items —
either add the definitions to the source CNXML `<glossary>`, or extend the
supplement's `add` list. Tracked, not blocking.

## 5. `lifraen-efnafraedi` — structural gap, NOT just staleness

`lifraen-efnafraedi` (Organic Chemistry, only ch03 translated, 8 modules) has
**zero `<glossary>` blocks** in its translated CNXML, yet its HTML carries 38
inline `<dfn class="term">`. Organic Chemistry uses OpenStax's newer
**per-section "key-terms"** format, not a module-level `<glossary>` element. So
`generate-glossary.js` / `generate-index.js` (which extract `<glossary>`) produce
an **empty** aggregate for it — no amount of re-running fixes that.

**Recommendation:** this is separate work. Either (a) teach the extractor to read
the per-section key-terms structure for organic-format books, or (b) accept no
book-wide glossary for `lifraen-efnafraedi` until it has more than one chapter.
Do **not** bolt a second extraction path onto this staleness fix.

## 6. Architecture: should there be two separate aggregates?

**Finding:** `glossary.json` and `index.json` come from the **same** source dir
and the **same** `<glossary>` extraction (~285 near-identical entries). Field
overlap is near-total:

| index.json | glossary.json |
|---|---|
| `termIs` | `term` |
| `termEn` | `english` |
| `definition`, `chapter` | `definition`, `chapter` |
| **+** `section`, `sectionSlug`, `sectionTitle`, `termId` (location) | **+** `alternateEnglish`, deduped by headword |

Consumers (vefur): `glossary.json` → hover tooltips, `TextHighlighter`,
`/ordabok` (3); `index.json` → `/atridiordasskra` (1). The per-chapter
"Lykilhugtök" page is a **third, independent** system rendered by
`cnxml-render.js` — **not** redundant; leave it alone.

**Two generators with different default tracks, run at different times, WILL
drift — that drift is literally this bug.** Recommendation:

> **Option (b): one canonical extraction pass that emits both files atomically.**
> A single tool extracts each module's `<glossary>` once, applies the supplement
> once, then projects the canonical dataset into both reader shapes:
> `glossary.json` (dedup-by-headword + `alternateEnglish`) and `index.json`
> (per-occurrence + `section`/`slug`/`title`/`termId`). One source, one track,
> one curation layer, emitted together → no drift possible.

**Migration cost (small):** no vefur consumer changes — the emitted file *shapes*
stay byte-compatible (the unified tool's correctness test is that it reproduces
the current hand-fixed `glossary.json`/`index.json`). It folds the three existing
tools (`generate-glossary`, `generate-index`, `apply-glossary-supplement`) into
one; the per-book section map must stop being hardcoded to
`server/data/chemistry-2e.json` (use the book's own
`server/data/<book>.json` — `organic-chemistry.json` etc.).

**Status:** written up, not built. Given the project's "data + adoption, no
net-new tooling" posture and a non-developer maintainer, the durable supplement
in §3 already kills the recurrence risk for the live book. Build the unified tool
when a second book needs aggregates, or when convenient.

## 7. System roles (authoritative — per maintainer, 2026-06-25)

There are four term systems; the maintainer clarified each role. **The reader's
single source of truth is the reviewed CNXML, NOT the terminology DB:**

1. **Árnastofnun Íðorðabanki glossaries** — uploaded to the Miðeind/Erlendur MT API
   as glossaries for terminology enforcement *during machine translation*.
2. **Editor terminology DB** (`terminology_headwords`+`terminology_translations`,
   migration 032; `source='idordabankinn'`, `idordabanki_id`, `inflections`, from
   `tools/fetch_idordabanki.py`+`fetch_bin_inflections.py`; ~1,117 prod terms) — the
   Íðorðabanki terms imported for **editorial consistency, lookup, and as the
   reference editors use when reviewing**. **Editorial tooling — it does NOT feed
   reader output directly.**
3. **CNXML end-of-chapter `<glossary>`** — authored by OpenStax, translated by
   Erlendur, **reviewed by editors using the Íðorðabanki glossaries as reference.**
   This is the **canonical, reviewed definition source** for the reader (and what
   `glossary.json`/`index.json` extract).
4. **Inline `(e. English)` annotations** in the body text — the Íðorðabanki glossary
   is the source for adding these English equivalents inline.

**Implication — do NOT bridge the terminology DB to `glossary.json`.** That would
bypass editorial review (rule: every reader definition must be a reviewed CNXML
glossary entry). The earlier draft of this section proposed auto-sourcing from the
DB; that contradicts the model above and is **withdrawn**.

**Correct handling of the §4 residual gaps.** Maintainer rule: *every tagged term in
the CNXML should be in that chapter's `<glossary>`.* So an inline `<dfn>` with no
glossary match (`bylgjulengd`/wavelength, `ljóseindir`/photons) is a **content gap
in the reviewed CNXML chapter glossary**, to be fixed at the source during editorial
review (terminology DB as the reference), **not** patched into the aggregate. The
re-translation drops (`vermi`/enthalpy, `varmi`/heat — §2) are the same: they should
be restored to the CNXML `<glossary>` (investigate why ch5's glossary lost them in a
re-extraction; the §3 supplement is an interim stopgap until the source is fixed).
Two caveats: proper names (`Newton`, `Bohr`) are tagged `<term>` by OpenStax but
correctly have no glossary entry — they should get no tooltip (ideally untagged).

**The coverage checker is the editorial QA tool for this** (`scratchpad:
check-term-coverage.mjs`, portable): it lists, per chapter, every inline tagged term
missing from the glossary — i.e. the exact review worklist to complete each chapter's
`<glossary>`. Worth promoting into `tools/` and wiring into the never-called
`check-consistency` path (throughput-roadmap Unit 3).

## 8. index.json decision (measured, not assumed)

Applying the supplement only to `glossary.json` means the new `index.json` (full
ch1–21, 698 entries, up from a ch1–13-only 285) does **not** carry the ~28
re-translation-dropped terms (vermi/enthalpy, varmi/heat, …). **Decision: accept.**
Those entries have no current section/slug, so grafting them into a *location-keyed*
alphabetical index would render dead (linkless) rows — worse UX than omission, and
internally inconsistent (the index reflects where terms are defined *now*). The net
is overwhelmingly positive (+413 entries, ch6–21 now present). The proper fix for
both files is **completing the CNXML chapter `<glossary>`** at the source (§7),
after which both `glossary.json` and `index.json` regain the terms naturally (with
locations). The §3 supplement on `glossary.json` is the interim stopgap; the index
deliberately reflects current content. (If the maintainer wants those terms listed
in the index meanwhile, graft them slug-less — a one-line extension of the supplement
to the index generator.)

## 9. Reader term surfaces — is the book-wide "Orðabók" redundant? (maintainer Q)

Four reader-facing surfaces, all ultimately from the CNXML `<glossary>`:

| Surface | Reader route | Data | Shape |
|---|---|---|---|
| Inline hover tooltips | (every page) | `glossary.json` | dedup by headword + `alternateEnglish` |
| **Orðabók** browse | `/ordabok` | `glossary.json` | dedup by headword |
| **Atriðisorðaskrá** (index) | `/atridiordasskra` | `index.json` | per-occurrence + section/slug/title |
| **Lykilhugtök** (per chapter) | chapter page | rendered by `cnxml-render.js` | per-chapter, in-page |

**Assessment:** `glossary.json` itself is **not** redundant — it is the data source
for the inline hover tooltips (the high-value feature this whole task restored), so it
must exist regardless of any browse page. What *is* arguably redundant is the
standalone **`/ordabok` browse page**: Atriðisorðaskrá (`/atridiordasskra`) is a
strict superset of it (same terms, plus alphabetical ordering **and** clickable
section locations), and Lykilhugtök covers the per-chapter view. So:

- **Keep** `glossary.json` (tooltips) and Atriðisorðaskrá + Lykilhugtök.
- **Candidate to retire:** the `/ordabok` page, folding "look up any term + its
  definition" into Atriðisorðaskrá. Low-stakes **reader-UI (vefur) decision** — make
  it there, not here; the data file stays for tooltips.
- **Long-term (ties to §6):** one canonical term dataset feeding both tooltips and
  the index, eliminating the glossary.json/index.json split entirely — which is also
  the cleanest answer to "no redundant systems."
