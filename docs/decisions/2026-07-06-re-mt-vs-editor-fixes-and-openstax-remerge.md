# Decision: re-MT is not required for OpenStax-remerge integrity; sequence B4 before the Pass-1 review push

- **Date:** 2026-07-06
- **Status:** Accepted
- **Context owners:** lead + pipeline
- **Related:** `docs/pipeline/cnxml-fidelity-gaps.md` (round-trip fidelity), B4 in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, project-memory `feedback-cnxml-no-overwrite` / licence provenance.

## Question

Does the complete chemistry book (`efnafraedi-2e`) need a **full re-MT**? Specifically: if we
skip a book-wide re-MT after B4 (the `<term>`/`<footnote>` bracket-marker migration) and instead
**rely on editors fixing dropped markers during Pass-1 review**, do we lose **structural
integrity of the CNXML** in a way that would hurt a hypothetical future merge with official
OpenStax?

## Decision

1. **Do NOT run a book-wide re-MT for remerge-integrity reasons.** The worry is largely unfounded
   (see Reasoning). A book-wide re-MT is a *quality* step, not a *correctness/integrity*
   requirement, and it is only ever *forced* as a side effect of choosing to do B4.
2. **If/when B4 is done, sequence it BEFORE the heavy Pass-1 review push, not after.**
3. **Fold an id-anchoring requirement into B4's design** (carry the term/footnote id inside the
   bracket marker), to eliminate the positional-cascade failure class permanently.
4. **Editors remain a backstop for *visible* marker drops only** — they are not the mechanism that
   guarantees structural/id fidelity.

## Reasoning

### The remerge is a source-level operation → `03-translated` is regenerable, so no permanent debt

A merge with upstream OpenStax is a 3-way diff of **English** CNXML: our read-only `01-source`
against OpenStax's new release. **`03-translated` never participates in that diff** — it is a
derived artifact rebuilt by extract → translate → inject. Therefore deferring re-MT creates **no
permanent structural debt**: when B4 lands, we re-extract from the untouched source and
`03-translated` is regenerated systematically with 0%-loss markers. The inline-marker gap is a
*quality property of a regenerable file*, not a one-way loss.

### What round-trips today (verified)

- **Block structure** (sections, tables, figures, lists, examples, glossary) round-trips via
  `structure.json`, independent of MT *and* of editor edits. Safe either way.
- **Inline elements that survive** round-trip faithfully **including ids** — verified: m68793's 13
  `<term>` ids are byte-identical `01-source` ↔ `03-translated`.
- The only gap is the **~2.3%** of legacy `{{term}}`/`{{fn}}` markers the MT API drops (B4's
  entire purpose is to remove this by switching to bracket markers).

### The failure mode when a marker IS dropped (the load-bearing check)

Injection restores term/footnote ids **purely by occurrence index** — `inlineAttrs.terms[termIndex++]`
at `tools/cnxml-inject.js:1439` (and footnotes at `:1455`). No content-anchoring, no
drop-compensation. So a dropped marker can shift every *downstream* element's id. Scope is bounded:
`reverseInlineMarkup` runs **per segment** (`inlineAttrs[segmentId]`, call site `:1688`), so a
cascade is contained to one segment. Segment census (`02-for-mt`):

- **420 segments** carry exactly 1 term → a drop is a **clean single-element loss** (term → plain
  text), no cascade.
- **163 segments** carry 2+ terms → a dropped *non-last* term causes a **segment-local id-cascade**
  (downstream terms in that segment get the wrong id).

Real incidence ≈ 2.3% × the non-last terms among those 163 segments — a handful book-wide.

### Why "rely on editors" is a weak control for this

Both failure modes are **invisible to a linguistic reviewer**: a term silently degraded to plain
text still reads as correct Icelandic, and a cascaded wrong-`id` is metadata the reviewer never
sees. Pass-1 review checks *language*, not CNXML ids. So editor vigilance cannot be the guarantee
of structural/id fidelity — it only catches the *obvious* visible drops someone happens to notice.

### The risk is inverted from the original framing

The asset that is **not** cheaply regenerable is **editor review investment**
(`03-faithful-translation`). B4's re-extract **changes segment boundaries** (measured: 51
insertions / 108 deletions on m68793's segment file), so review done on pre-B4 segmentation may not
remap cleanly onto post-B4 segments. Hence the real hazard is **stranding review effort by doing
the Pass-1 push before B4** — not "editors instead of re-MT loses integrity."

## Consequences

- The current `03-translated` (MT-preview) carries a small residual of missing/mis-`id`'d inline
  term/footnote elements. This is acceptable as a **regenerable-artifact quality gap**, not
  integrity debt. It does not block publication (renders correctly as HTML) or a future remerge
  (source-level).
- **B4 becomes a prerequisite-ordering constraint on the review push**, not just a Track-B quality
  item. Whoever plans the Pass-1 throughput work must decide B4 first.
- **B4's design gains a hard requirement:** anchor the id in the marker so restoration is not
  positional. This upgrades B4 from "0% loss if nothing drops" to "correct even when something
  drops" — the property that actually matters for a clean OpenStax contribution/remerge.
- The deferred residuals (signature (a) list double-record, RC3, RC4) ride along with B4's
  re-extract + re-MT and self-correct then (already registered).

## Alternatives considered

- **Book-wide re-MT now** — rejected: not required for integrity; re-translates 117/149
  term/footnote-bearing modules wholesale for marginal (2.3%→0%) marker-fidelity gain on a *draft*
  that Pass-1 review will edit anyway; Málstaður API cost.
- **Targeted re-extract + re-MT of just the affected modules** — available on demand if a specific
  reader-visible residual (e.g., 12-5's list duplication) must be cleared before B4, but not a
  standing need.
- **Inject/render-side dedup or positional-restore hardening without B4** — rejected as a
  workaround downstream of the real seam; the id-anchoring belongs in B4's marker design.
