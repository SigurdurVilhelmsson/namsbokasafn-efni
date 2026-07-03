# Clean-slate, first-principles design — CNXML→Icelandic translation system

**Date:** 2026-07-03
**Type:** Design + analysis memo (READ-ONLY study; no pipeline code changed, no API called).
**Question it answers:** If we designed this system from scratch today, what would the *ideal*
architecture be — and given that ideal, is a re-architecture worth it **before onboarding biology**,
or should we finish the current clean-up and onboard on the pipeline we have?
**Method:** Derive the ideal design from only two inputs (the Erlendur API + the CNXML source format)
*before* reading the current pipeline, to avoid anchoring; then correlate. An independent Fable-5
adversarial pass red-teamed the thesis and forced several corrections (a cheaper ideal than the one I
first reached for, an honest split of the "attribute-loss" bug, and a downgrade of the incremental-
migration plan). Those corrections are integrated below and flagged where they matter.

**Bottom line (for the impatient):** The ideal architecture is **"CNXML DOM as the single source of
truth; edit translatable text nodes *in place*; carry every non-translatable inline child as its
*original node*, never rebuild it from a lossy marker."** The pragmatic form of that ideal is
**candidate D — faithful full-DOM edit + canonical re-serialize, with a canonical (not byte-level) diff
for future OpenStax remerge** — which fixes the structural and attribute-loss bugs using boring,
well-tested primitives. A maximal-fidelity variant (**candidate C**, byte-splice into the original
buffer) buys raw-byte-identity of untouched regions but requires the single highest-risk component in
this project's history and is only justified if byte-identity is a hard requirement — which the repo's
own remerge analysis (`docs/pipeline/cnxml-fidelity-gaps.md`) says it is **not** (whitespace and
attribute order are classified cosmetic; §4). **Crucially, neither ideal cleans up the reader-visible junk on today's pages:
that junk is the *inline marker round-trip* (F5/F6), which is intrinsic to any plain-text-API design
and is inherited unchanged.** And the structural bugs the ideal would kill (F1, note-relocation, and
soon F4) are **already fixed or nearly fixed** in the current pipeline. **Recommendation: do not rewrite
to unblock biology. Finish F3/F4 (~2 PRs), strengthen the fidelity oracle (needed either way), and
onboard biology on the current pipeline.** Move toward candidate D only if per-book reconstruction cost
actually materialises across the next books — and then as a clean, prototype-proven swap, never a
long-lived hybrid (§7).

---

## 1. Erlendur (Málstaður) capability model — what the API can and cannot do

Verified against `tools/lib/malstadur-api.js` and `test-results/api-marker-survival.md`.

**It is a plain text-in / text-out translator. There is no HTML/XML/document mode.**

| Capability | Evidence | Consequence for design |
|---|---|---|
| Sync translate, **≤10,000 chars** | `malstadur-api.js:19,228-234` | A whole module often exceeds this → must chunk, or use async. |
| Async translate + poll | `:268-342` (`/v1/translate/tasks` + `pollTask`) | Whole-document requests are possible but slow (2 s poll, up to 6 min). |
| Body is `{text, targetLanguage, glossaries}` | `:236-243` | The unit of work is **a string**. Structure must be encoded *into* it or kept *out of band*. |
| Server-side glossaries `{sourceWord, targetWord}` | `formatGlossary :179-191` | Terminology priming is a first-class API feature — the glossary is the lever (matches the throughput roadmap). |
| Price 10 ISK / 1,000 chars | `:26-39` (`estimateIsk`) | **Every non-translatable byte you send is wasted money.** MathML — the densest content in a chemistry book — must never be sent. |

**Empirical structure survival** (`api-marker-survival.md`, 22 tests / 73 checks, 98.6 %): inline
delimiters ride through intact — `<!-- SEG:… -->`, `[[MATH:N]]`, `{{…}}`, `__term__`, markdown links,
`[#ref]`, `^sup^`/`~sub~`, `[[MEDIA:N]]` (matrix `:22-32`). **Two failure modes are load-bearing and
must not be forgotten:**

1. **The API reorders clauses.** T1.6 (`:141-160`): `See [Table 1.1] … about [chemistry] …` returned
   with the two links **swapped**. Translation is not position-preserving; inline anchors move *with
   their clause*. (Icelandic is a V2 language — sentence-internal reordering is the norm, not the
   exception.)
2. **Dense mixed segments lose a marker.** T1.11 (`:243-266`), the sole failure, dropped a `~2~`
   subscript in a segment carrying six marker types at once. Marker density multiplies risk.

**Design corollaries (from the API alone):**

- **C1** — send only translatable natural-language text; withhold and restore everything else
  (MathML, ids, non-text attributes).
- **C2** — inline non-text children must become opaque, low-density, collision-free placeholders that
  survive the API and can be restored. Unavoidable; source of the intrinsic bug class (§3).
- **C3** — because the API reorders, placeholder *position* is not stable, only its *token*.
  Restoration is by token identity, and a translated block's inner byte layout is **new information**,
  not recoverable from source (§4). *A corollary the first draft missed:* the API can put two equations
  in swapped order and every structural oracle stays green while the prose now attributes the wrong
  equation (§3, §6).
- **C4** — keep requests small and low-density (one block, few markers) to minimise reorder blast
  radius and the T1.11 loss mode. Argues against whole-document masking.

---

## 2. From-first-principles design (derived before reading the current pipeline)

### 2.1 The shape of the problem, from CNXML alone

Verified against `books/efnafraedi-2e/01-source/ch03/m68702.cnxml` and `…/ch12/m68789.cnxml`.

CNXML is a **tree**. A *small* subset of nodes carry translatable natural-language text, embedded in
**mixed content** with non-translatable siblings:

- A `<para>` interleaves text with `<emphasis>`, `<m:math>`, `<link target-id|url|document>`, `<sub>`,
  `<sup>`, `<term>` (`m68702:19`, `m68789:13,17`).
- Nested block structure: `<section>`, `<example>`, `<exercise>/<problem>/<solution>`,
  `<table>/<tgroup>/…/<entry>`, `<equation>`, `<figure>/<media>/<image>`, `<note>`, `<list>/<item>`.
- Every block carries a **stable id** (`fs-idm…`, `md:content-id`) and attributes; namespaces matter.

**The single most important structural fact:** the translatable surface is *tiny* relative to the
bytes. MathML equations dominate `m68702`/`m68789`, and **MathML is language-neutral notation that must
never be translated or re-serialized.** The nodes needing translation are `<title>`, `<para>` text,
`<term>` text, `<emphasis>` text, `<caption>`, `<entry>` text, `<item>` text, `<note>` title, and two
attributes — image `@alt`, table `@summary`. Everything else is pass-through.

The job: **(1) extract only translatable text; (2) hold every non-translatable region out of band;
(3) write Icelandic back into exactly the same nodes; (4) disturb nothing else — for OpenStax remerge;
(5) still yield reviewable EN↔IS segment pairs (the editorial product).**

### 2.2 Candidate architectures

All three viable candidates share one invariant that the *current* pipeline lacks: **the CNXML DOM is
the single source of truth; you edit translatable text nodes in the live tree and never rebuild block
structure from a separate sidecar.** They differ in how the translated document is emitted, and how
remerge fidelity is met.

**Candidate 1 — Whole-document protected-skeleton masking (rejected).** Mask every non-translatable
region to placeholders, leaving a skeleton of prose + placeholders in document order; send
section-sized chunks (async); unmask → CNXML. This *maximises* the two API risks: a section-sized
request gives clause-reorder (C3) whole blocks to shuffle across, and stacks marker density (C4) into
one request (T1.11). It also yields the *weakest* editorial artifact — no clean per-node segments to
review, version, or run a concordance over. **Rejected on both fidelity and editorial grounds.**

**Candidate C — DOM-canonical, byte-splice output.** Parse to DOM; project translatable text nodes as
segments keyed by stable node id + role; translate; then **write the Icelandic text back by splicing it
into the original byte buffer at each located node's source range**, re-inserting non-text inline
children as **verbatim original bytes**. Untouched siblings and attributes are *copied*, never
serialized. Maximal byte fidelity — but the "locate a node's source byte range" primitive **does not
exist in the toolchain** and is expensive/risky to build (§4, hit-3 analysis).

**Candidate D — DOM-canonical, faithful re-serialize + canonical remerge (recommended).** Parse the
whole original CNXML to a DOM *faithfully* (all attributes and children intact). Project translatable
text nodes as segments (same keying as C). Translate. Then **edit only those text nodes in the live
tree** — replacing their character data and re-attaching each non-text inline child **as its original
DOM node** (so `<link document="m68859" target-id="x"/>` and `<m:math>` keep every attribute; §3/§4) —
and **serialize the whole tree with a deterministic canonical serializer.** Untouched regions come out
*canonically equivalent* to source but not necessarily byte-identical. Future OpenStax remerge uses a
**canonical/XML-aware diff** (canonicalise both sides, then 3-way merge), which does not need
byte-identity. This gets the same structural correctness and attribute preservation as C using only
boring, well-tested primitives (a faithful `@xmldom` round-trip + a canonicaliser), and defers all
remerge machinery to the day remerge actually happens — off biology's critical path.

### 2.3 Why D over C (the output-serializer choice)

C and D make the **same** structural edits and the **same** finding-9 fix (carry the original inline
node, don't rebuild it — §3). They differ *only* in the output writer and the remerge strategy:

- **C** preserves untouched-region bytes exactly, so remerge can use an ordinary textual 3-way merge —
  but it requires a **hand-rolled, position-tracking XML scanner** (namespaces, entities, CDATA,
  multi-byte UTF-8) plus a **leaf-first patch engine with offset rebasing** for nested translated nodes
  (a `<title>` inside an `<example>` inside a `<section>`, each separately segmented). Its failure mode
  is corrupting *valid XML into invalid bytes* — strictly worse than a normalizer's "normalized but
  well-formed" output. This is the highest-risk component proposed anywhere in this project.
- **D** normalizes untouched-region bytes (attribute order, entity form, whitespace), so remerge needs
  a **canonical/XML-aware diff tool** instead of textual merge — a more standard, testable dependency,
  and one you only need *when you remerge*.

Both push complexity somewhere; D pushes it into a well-understood, deferrable place. **Recommended
ideal: D. C only if raw-byte-identity of untouched regions is proven to be a hard requirement** — and
the repo's own remerge analysis says it is **not** (§4).

**Candor (from the advisor pass): D is the least-adversarially-tested candidate here.** The red-team
attacked *C* in depth and *proposed* D as its constructive alternative; I then promoted D to the
recommendation. Two of D's load-bearing claims are therefore verified below rather than assumed — the
remerge requirement (§4, now cited to `cnxml-fidelity-gaps.md`) and D's MathML-serialization exposure
(§4, a real new risk the spike must *prove*, not wave away).

### 2.4 Data flow (candidate D)

```
01-source/m.cnxml ──faithful parse──▶ DOM (canonical source of truth; all attrs/children intact)
                                          │
                 segments(dom): project translatable text nodes, keyed by (moduleId, node-id, role);
                 non-text inline children (math, xref links, media) → placeholders backed by a
                 side-map to their ORIGINAL DOM nodes
                                          │  EN segments (also the editor feed — see §5)
                                          ▼
                 Erlendur API  (glossary-primed, one block/request, low marker density)
                                          │  IS segments (same keys)
                                          ▼
                 apply(dom, IS): for each key → edit that text node IN THE LIVE TREE:
                    replace character data with IS text; re-attach each non-text inline child as its
                    ORIGINAL node from the side-map (attributes intact); text-bearing inline children
                    (emphasis/term/text-links) round-trip via markers that REFERENCE the original node
                                          ▼
                 canonical serialize whole DOM ──▶ 03-translated/…/m.cnxml ──render──▶ HTML
                 (remerge, someday: canonicalise upstream + ours, XML-aware 3-way diff)
```

The editorial assets (segment review, TM, concordance, per-segment version history) hang off the
segment projection, whose keys are the stable node ids the current editor DB already uses (§5).

---

## 3. Honest bug scorecard — what the ideal kills, inherits, and is already-fixed

The recent clean-up named four hard classes: **F1** (extract reorders section content), **F4** (table
double-modelled → duplicates), **F5/F6** (inline marker residue), **nested para/list**. Read against
the 15-finding Fable-5 audit (`docs/audit/2026-07-02-fable5-fidelity-provenance-review.md`), they sort
into **three** groups by root cause — and, per the adversarial pass, a fourth column matters as much as
the kill column: **most of the structural kills are *already fixed* in the current pipeline**, so the
ideal's *marginal* value is smaller than a naive scorecard implies.

| Bug (finding) | Root cause | Ideal (C/D) | Status in *current* pipeline |
|---|---|---|---|
| F1 section reorder (1) | order rebuilt from a sidecar that dropped document order | **Eliminated** (edit-in-place inherits order) | **Already fixed** — `processSection` position-sort, PR #219 |
| F4 table double-model (4) | table modelled twice (structure elem **and** inline `[[TABLE:]]`) | **Eliminated** (one representation; a block-level table never becomes inline text) | **Pending** — F4 (~1 PR, at extraction) |
| Note-relocation (11) | `processNote` captures only some children → table re-emitted at section level | **Eliminated** (note's children edited in place) | **Partially fixed** — 2026-03-30 figures-in-para pass; tables-in-note still open |
| Nested para/list | block nesting rebuilt from a flat list | **Eliminated** (nesting is the DOM's own) | Largely handled; edge cases remain |
| Attribute loss, e.g. `document=` (9) | inline node **rebuilt from a lossy marker** (`[[docref:]]` can't encode `document=` + `target-id` + text) | **Eliminated *only if* the design carries the original node** (side-map, §2.4), **not** by splice/serialize choice; see caveat ↓ | **Live bug** |
| Entity re-escape / math re-serialize (8) | `@xmldom` re-serializes untouched fragments | **Eliminated** (math kept as original node, never re-serialized; D canonicalises text regions only) | Present in example/exercise/note path |
| Dropped identity tags (13) | reconstruction | **Eliminated** (faithful DOM round-trip carries them) | Latent |
| **F5 nested `[[i:[[link:]]]]` (5)** | inline mixed-content marker round-trip | **INHERITED (intrinsic)** | **Already fixed** — PR #220 |
| **F6 `[[MATH:N]]`→`[[math:n]]` (6)** | inline term-annotation over placeholders | **INHERITED (intrinsic)** | **Already fixed** — PR #220 |
| `<sub>`/`<term>` re-anchoring on faithful track (3) | inline marker/annotation round-trip | **INHERITED (intrinsic)** | **Live bug** (F3 retriage pending) |
| Oracle blindness (7, 8, 10, 12, 14, 15) | the *fidelity check*, not the translator | **Orthogonal** — needs a better oracle **either way** | **Live** |
| Source-overwrite guard (2) | server authz | **Orthogonal** | Fixed — F2/PR #218 |

**Three honest corrections the adversarial pass forced:**

1. **Finding 9 is *not* "eliminated by splice."** The lost `document=` was on an *inline* `<link>`, which
   travels the **marker channel**, not the byte channel. It is destroyed by the current *lossy marker
   grammar* (`[[docref:doc#target]]` encodes a target and a doc but not both-plus-text, no `window=`,
   no `class`), **regardless of whether the enclosing bytes are spliced or serialized.** The fix is
   architectural but specific: **carry each inline child as its original node / exact bytes and
   re-attach it**, instead of rebuilding it from a semantic marker. Candidate D does this via the
   side-map (§2.4); it needs no byte-splicing. *Residual intrinsic part:* a **text-bearing** link that
   also carries extra attributes (`url` **and** `target-id` **and** display text) still needs a richer
   node-referencing marker; if the marker grammar stays lossy, that sliver of finding-9 stays intrinsic.

2. **The structural kills are mostly already banked.** F1, F5, F6 shipped (#219/#220); note-relocation
   is partly done; only F4 + F3 remain live. So the ideal's *marginal* structural value over the
   *current* pipeline is: the attribute/entity-loss class (findings 9/8/13 — remerge-relevant, **not**
   reader-visible) plus **insurance against future reconstruct-class bugs** as new books land. Modest —
   and it is the honest denominator for the rewrite decision (§7).

3. **The intrinsic class is where the reader-visible junk lives.** Of the three residue classes on
   published pages, the ideal kills only **F4**; **F5/F6 survive any rewrite** because flattening a
   para's inline formatting to placeholders and re-expanding it is a property of *"text API + mixed
   content,"* not of the reconstruction step. A rewrite does **not** clean the pages — finishing the
   inline fixes does (and #220 already did most of it).

**And a bug *no* architecture fixes (adversarial hit 8):** because the API reorders clauses (C3), a
faithful pipeline — spliced or serialized — will re-emit `[[MATH:2]] … [[MATH:1]]` in swapped order,
producing well-formed, attribute-perfect, oracle-green CNXML in which the prose attributes the wrong
equation. The id-order/LCS check (§6) cannot distinguish this from legitimate Icelandic V2 reordering.
The only real mitigation is a **per-segment marker-sequence flag routed to human review** — an
editorial-workflow feature, orthogonal to the splice-vs-serialize choice and to any rewrite.

---

## 4. Byte-fidelity analysis — the normalization trap, and the substitute the first draft missed

Remerge to OpenStax wants **untouched regions to be faithful**: attribute order, whitespace, entity
encoding, self-closing form. The first-draft instinct was: "a full DOM re-serialize normalizes those,
so we must splice into the original buffer." The adversarial pass showed that instinct **over-specifies
the requirement and under-prices the alternative.**

**What re-serialization actually does — and does not — damage.** `@xmldom/xmldom`
(`tools/lib/cnxml-dom.js:9,48-53`) normalizes byte form on serialize (attribute quoting, self-closing,
entities, whitespace) but **does not drop attributes**. Finding 9's `document=` loss came from
*reconstruction from a lossy marker/sidecar*, **not** from serialization. So a **faithful full-DOM
parse → edit text nodes → serialize** (candidate D) **preserves every attribute and every untouched
subtree's content**, fixing findings 9/8/13, while changing only *byte form* of untouched regions.

**Does remerge actually need byte-identity? The repo's own analysis says no — it needs canonical
equivalence.** `docs/pipeline/cnxml-fidelity-gaps.md` (the project's dedicated remerge-fidelity
assessment) classifies exactly the byte-level properties at issue as **cosmetic and non-functional**:
whitespace/indentation is "Low (cosmetic)… semantically equivalent but not byte-identical… not a
functional issue for OpenStax processing (XML parsers normalize whitespace)" (Gap 3, `:77-81`); the XML
declaration is "Low… OpenStax likely normalizes these" (Gap 4, `:83-87`); and **attribute order is
"Severity None (cosmetic)… not significant per the XML spec… not a real issue"** (Gap 5, `:89-93`). Its
verdict: "The extract→inject architecture is sound. The structural/block-level elements round-trip
correctly. The remaining issues are in the inline markup" (`:238`). So the requirement to preserve is
**attribute *presence and values*** (losing `document=` is a real, functional break — Gap 6d, `:120`,
where a `<link document=…>` with no `target-id` "fall[s] through and become[s] plain text" at
`cnxml-extract.js:265`) — **not attribute *order* or whitespace.** Candidate D preserves the former (a
faithful DOM round-trip carries every attribute) and normalizes only the latter (the cosmetic Gaps
3/5). A 3-way remerge can then run on **canonicalised** XML — a standard, testable diff tool, and one
you only need *the day you remerge*, which is off biology's path. Candidate C's byte-splice, by
contrast, forces a high-risk position-tracking scanner + patch engine into *every* inject *now* to buy
raw-byte-identity that the repo's own analysis says remerge does not need.

**But D carries a real, new exposure the current pipeline avoids — prove it, don't assume it.** Today,
MathML never touches a serializer: it is extracted to `[[MATH:N]]` placeholders and **exactly restored**
from `equations.json` (`cnxml-fidelity-gaps.md:40`, "Exact restoration ✅"). Candidate D, by parsing and
re-serializing the *whole* document, would route **every `<m:math>` block through `@xmldom`'s
serializer** — a strictly larger exposure than today, on the densest and most fidelity-sensitive content
in a chemistry book. "@xmldom doesn't drop attributes" (true) is **not** the same as "it round-trips
namespaced MathML structure intact." Two mitigations, in order of preference: (i) **keep D's math
handling identical to today's** — hold `<m:math>` nodes out as exact-byte placeholders across the
serialize and re-insert verbatim (D serializes only the prose skeleton), which removes the exposure
entirely; or (ii) if math *is* serialized, make the **normalized math-content hash** (§6.1) a hard gate
on the spike that *proves* @xmldom round-trips every hard-module equation before D is trusted. The
first-draft claim that D uses only "boring, safe primitives" is corrected: the primitives are boring,
but exercising them on whole-document MathML is a new risk that the validation spike must retire.

**Where the boundary falls when word order changes (unchanged from the first analysis, and it bites
both C and D).** You cannot preserve the *inner* bytes of a **translated** para: the API reorders, so
the Icelandic sentence has a new word order and its inline children sit at **new positions**. The inner
flow of a translated block is genuinely new and must be regenerated in both C and D. What differs is
only the treatment of *untouched* regions (C: original bytes; D: canonical bytes) and *non-text inline
children* (both: re-attach the original node/bytes — the finding-9 fix).

**Validation must measure this, because the current oracle cannot.** `compareTagCounts` strips MathML
to `<m:math/>` and compares only the **multiset of opening-tag names**
(`cnxml-fidelity-check.js:41-57`) — blind to order, attributes, text, and math interior;
`compareElementOrder` (`:109-123`) is warn-only and **not wired into the green exit** (`:357-359`). The
go/no-go byte check for either ideal is an **identity round-trip**: `apply(dom, segments_EN)`
("translate" each segment to itself), then diff against source *after canonicalisation* — a correct D
yields **zero canonical diff**; any diff localises a node type that regenerates when it should preserve.

---

## 5. Correlation with the current system — right instincts, wrong invariant

Verified against `cnxml-extract.js`, `cnxml-inject.js`, `cnxml-fidelity-check.js`, and the audit.

**What the current design got essentially right (keep these):**

1. **Extract-from-original, never fetch-from-upstream.** Extraction only *reads* `01-source`
   (`cnxml-extract.js:1662-1663`) — the licence-provenance guard lives here. Non-negotiable.
2. **Segments keyed on stable node ids** (`m68664:para:fs-idp77567568`). This *is* the projection every
   candidate needs — and it is why the "segments as a projection" framing is, on the **input side,
   largely a reframe of the status quo** (adversarial hit 5): the current element-keyed segments already
   *are* a projection over translatable nodes. **The novelty of the ideal is entirely on the *output*
   side** (edit-in-place + carry-original-node vs. reconstruct-from-sidecar), not on how segments are
   produced. The editor DB (`segment_edits`, `content_versions`, `tm_segments`, `localization_pending_edits`,
   `mined_term_candidates`) keys on `(book, module_id, segment_id)`; any ideal **must keep
   element-granularity segments with the *same* ids** or it orphans all human-reviewed history. (Watch
   the positional `auto-N` ids for elements without source ids — they renumber if the "translatable
   node" set changes, under *any* design.)
3. **The impulse to relocate complex blocks from the original rather than rebuild them.** The
   figure/table path (`buildFigure:1915-1919`, `buildTable:2003-2009`) already grabs the original
   fragment and replaces only inner cells — a crude, partial version of "carry the original." The
   instinct is right; the ideal generalises it to all nodes and makes it exact.
4. **Glossary-as-lever.** API terminology priming via server-side glossary (`formatGlossary`), matching
   the throughput roadmap's "glossary, not TM, primes Málstaður."

**What is accretion sediment (the villain, named precisely):** the pipeline holds **three
representations** — flat EN segments (`02-for-mt`), a `structure.json` skeleton with type + id +
nesting + segment-refs but **no byte offsets** (`cnxml-extract.js:1766-1767`; order is array/sort order,
`:512-529`), and the original CNXML — and **reconstructs** Icelandic CNXML at inject by walking the
sidecar (`buildCnxml`, `cnxml-inject.js:1509-1795`): document shell + para/section/list from **template
strings** (`:1584-1585,1836-1866`), example/exercise/note parsed and **re-serialized** through `@xmldom`
(`:2499/2742/2979`), figure/table regex-relocated (`:1915-1919,2003-2009`). This grew historically
(Word → manual upload → Markdown → de/reconstruct CNXML). **Every reconstruction bug — F1, F4,
note-relocation, finding-9 attribute loss — lives in reconstruct-from-sidecar, and the sidecar's lack
of byte offsets is why order and untouched bytes can't be recovered.**

> **Name my bias (required):** everyone here is primed to cast "inject" as the villain, and I have to
> guard against *both* directions of that bias. The evidence adjudicates: inject's *reconstruction* is
> genuinely the villain (the audit's own verbs — "faithfully **rebuilds** the wrong order," "the
> **rebuilt** note," "the table **re-enters**"). My *first* draft over-corrected the other way in two
> places, and the adversarial pass caught both: (a) I asserted "current inject already splices, so a
> rewrite would *regress* byte fidelity" — **wrong and retracted**; the confirmed mechanism is
> reconstruct-dominated. (b) I then *over-credited the fix*, claiming "splice eliminates the
> attribute-loss class" — also wrong; finding 9 is a *marker-grammar* loss fixed by carrying the
> original node, not by the byte-splice, and a sliver of it is intrinsic. The honest, narrow statement:
> **the villain is `reconstruct-from-sidecar`; the fix is `edit-in-place + carry-original-node`; the
> cheapest form is a faithful DOM round-trip (D), not byte-splicing (C); and none of it touches the
> intrinsic inline class or the API-reorder class.**

**Irreducible essential complexity (survives any design):** flattening a para's inline mixed content to
placeholders and re-expanding it (F5/F6 surface); the **per-book policy of *which* nodes are
translatable** (organic's os-embed exercises + section key-terms, biology's iframes + species names —
project memory `organic-chemistry-structure`, `d4-iframe-embeds`); chunking to the 10k/async limit;
glossary priming; completeness/residue gating; and a fidelity oracle strong enough to *prove*
losslessness (today's cannot — §6).

---

## 6. Validation plan — the spike (designed, NOT executed)

The current oracle is too weak to adjudicate any of this — so **the first deliverable of any validation,
rewrite or not, is a stronger oracle.**

### 6.1 Strengthen the oracle (prerequisite, needed either way)

Add, alongside the existing tag-count check:

1. **Id-order / LCS check**, promoted from warn-only to a gate (catches self-inflicted F1 reorder).
2. **Attribute-sensitive diff for `<link>`** (`document`, `target-id`, `url`) and for `id`/`md:content-id`
   (catches findings 9/13).
3. **Normalized math-content hash** per `<m:math>` block (catches finding 8; prerequisite before WS4
   ever edits math).
4. **Canonical (untouched-region) round-trip** — the identity-translation diff from §4.
5. **Per-segment marker-sequence flag** — where the IS marker order differs from EN, surface for human
   review (the only mitigation for the API-reorder / wrong-equation class, §3).

### 6.2 The oracle-measured experiment (do not run — this is the design)

Translate the **hard modules** *both ways* — current pipeline and a candidate-D prototype — and diff
each against source with the strengthened oracle:

| Module | Why it's the hard case | The claim it tests |
|---|---|---|
| `m68789` | table-in-exercise = the F4 double-model (`docs/plans/2026-07-02-f456-marker-residue-design.md:179-198`: table modelled as both structure element and inline `[[TABLE:]]` → triples on rebuild) | Does the ideal handle it with **zero** special-casing? (One representation; a block-level table never becomes inline text.) |
| `m68811` | nested `[[i:[[link:…]]]]` | Proves the inline-marker class the ideal **still owns** — measure it *failing/partial* here, honestly. |
| `m68702` / `m68833` | interleaved prose + subsection = the F1 reorder case | Does the ideal inherit document order from the DOM (zero id-order diff)? |

**Metrics per module, per pipeline:** tag-name multiset diff (expect 0 both); **id-order diff** (0 for
ideal; **nonzero for a *pre-#219* current** — demonstrates the oracle now sees F1); **link-attribute
diff** (0 for ideal; the m68692 loss becomes *detectable*); **math-hash diff** (0 both, now *proven*);
**marker residue** (0 for ideal on m68789/m68702; **possible residue on m68811** — report, don't hide);
**canonical identity round-trip** (0 for candidate D on all; any diff names the leaking node type).

**Go / no-go:** GO for the edit-in-place invariant iff, on all three hard modules, id-order = 0,
link-attr = 0, math-hash = 0, **and** canonical identity round-trip = 0 — *with zero per-module
special-casing*. The F4 module passing with no special case is the single strongest signal. Always
**expect** m68811 inline residue in both pipelines — that persistence is the honest proof a rewrite is
not a residue cure.

**Bias guard on the experiment:** run the current pipeline through the *same* strengthened oracle — the
comparison is oracle-vs-oracle, not "ideal vs. my prior that inject is bad."

---

## 7. Recommendation — framed on biology-onboarding economics

**Decision criterion (guardrail #4): would onboarding biology + the next ~3 books be *dramatically*
cheaper on the ideal design than on the now-mostly-fixed current one? If merely comparable, finish and
onboard.**

**The economics, honestly:**

- The current pipeline is **~80 % cleaned**: F1/F2/F5/F6 shipped; **F3 (benign-allowlist byte-retriage)
  + F4 (table double-model, at extraction) remain — ~2 PRs.** A rewrite resets *known* bugs to zero but
  **not *actual* bugs**, and must re-earn the licence guard, the editor-DB segment-id contract, glossary
  priming, chunking, and the completeness gate that already work.
- **The live reader-visible junk is mostly intrinsic.** The ideal kills only **F4** of the three
  residue classes; **F5/F6 survive any rewrite** (§3). *Finishing the inline fixes cleans the pages; a
  rewrite does not.*
- **What the ideal uniquely buys** is attribute/entity fidelity (findings 9/8/13) — real but
  **invisible to readers**, material only at OpenStax **remerge**, which is not on biology's path — plus
  **insurance against future reconstruct-class bugs.**
- **The one pro-rewrite argument, deflated (adversarial hit 6):** I claimed reconstruction cost "scales
  per-book" via container-type builders while the ideal is "container-agnostic." Partly true, partly
  not. The genuinely per-book cost is the **translatability taxonomy** (which nodes are translatable) —
  and that is present under *every* design, including the ideal; the inject builders are downstream
  reflections of it, and edit-in-place even *adds* a granularity decision (does a `<solution>` edit as
  one region or per-para?). What the ideal actually deletes is **~1,200 lines of output builders and one
  *class* of future bug** — worth something, but not "eliminates per-book cost."

**Therefore — the sequence, not a binary:**

1. **Finish F3 + F4 (~2 PRs).** F4's own design already found the true fix — *at extraction*: model a
   table once (structure element **or** inline ref, mirroring `figuresHandledInContainers`). That is a
   small, local step *toward* the ideal's "one representation" invariant, taken where it belongs.
2. **Strengthen the oracle (§6.1) before biology extraction** — needed either way; without it biology's
   F1-class reorders bake in and stamp PERFECT (the audit's #1 pre-biology warning). Add the per-segment
   marker-sequence flag (§3) — the only guard against the wrong-equation class no architecture fixes.
3. **Onboard biology on the current pipeline.** Cheaper path to *published biology pages*; their quality
   is gated by the intrinsic inline fixes (done) + F4 (step 1), not by the reconstruction architecture.

**"Don't rewrite if…" (explicit stop condition):** if the current pipeline, run through the
*strengthened* oracle, passes biology's hard modules with **≤ ~1 PR of per-book special-casing**, do not
rewrite — reconstruction cost is not scaling, and finishing wins.

**"Do move to candidate D if…" (the overturning condition):** if biology/organic/microbiology require
**recurring per-book *imperative* handling** — new container-type builders minting fresh
reconstruction/attribute bugs per book. Then bring **candidate D** (faithful DOM + canonical serialize
+ canonical-diff remerge — **not** the byte-splice C, and **not** an incremental hybrid) forward as a
**clean, prototype-proven whole-pipeline swap**, validated on the hard modules against the strengthened
oracle *before* switching.

**Why not the incremental "convert inject node-by-node" path I first proposed — struck (adversarial
hits 2 & 4):** a half-converted inject runs *two* mechanisms writing one output document — exactly the
double-modelling shape that produced F4, now institutionalised pipeline-wide for the migration's
duration. Its flagship guard (the untouched-region round-trip) **cannot go green until the last node
type converts**, so the guard is unavailable during precisely the window it must guard; every increment
perturbs previously-certified modules, invalidating the baseline. It violates the project's own recorded
rule (`feedback-robustness-over-expedience`: one real code path, fail loud). The migration, if it ever
happens, must be a clean swap behind a prototype — never a long-lived hybrid.

**Net:** the reader-visible cleanup is the intrinsic inline work, which finishing does and a rewrite
does not; the ideal's unique win (byte/attribute fidelity) is a remerge concern off biology's path; and
the per-book scaling that could justify a rewrite is a *watch item*, not a present fact. **Finish F3/F4,
strengthen the oracle, onboard biology. Revisit candidate D only if the next books prove reconstruction
cost is really scaling.**

---

## Appendix — evidence index

| Claim | Source |
|---|---|
| API text-only, sync ≤10k, async, glossary, price | `tools/lib/malstadur-api.js:19,26-39,179-191,228-243,268-342` |
| Markers survive ~98.6 %; API **reorders**; T1.11 marker loss | `test-results/api-marker-survival.md:6-32,141-160,243-266` |
| CNXML mixed content; MathML bulk; stable ids | `books/efnafraedi-2e/01-source/ch03/m68702.cnxml:16-24,40,73-78`; `…/ch12/m68789.cnxml:13-17,64-112` |
| Current inject reconstruct-dominated (template strings + `@xmldom` re-serialize), not splice | `tools/cnxml-inject.js:1509-1795,1584-1585,1836-1866,2499/2742/2979`; `tools/lib/cnxml-dom.js:9,48-53` |
| Figure/table = partial byte-preserve via id-regex (right instinct, narrow) | `tools/cnxml-inject.js:1915-1919,2003-2009` |
| Three representations; structure.json has no byte offsets; order = array/sort | `tools/cnxml-extract.js:1761-1787,512-529` |
| F4 root cause = extraction double-models the table | `docs/plans/2026-07-02-f456-marker-residue-design.md:179-198` |
| Oracle blind to order/attrs/text/math; order check warn-only | `tools/cnxml-fidelity-check.js:41-57,109-123,357-359` |
| Full bug catalogue + "PERFECT ≠ lossless"; per-book format risk | `docs/audit/2026-07-02-fable5-fidelity-provenance-review.md:8,35-103`; `docs/plans/2026-07-01-chemistry-clean-slate-design.md` |
| Editor DB keys on `(book, module_id, segment_id)` | server migrations `008/031/034/036/037` (`segment_edits`, `content_versions`, `localization_pending_edits`, `tm_segments`, `mined_term_candidates`) |
| Remerge needs canonical-equivalence, **not** byte-identity: whitespace/attr-order/XML-decl are cosmetic; math exact-restored via placeholders; inline markup is the real gap | `docs/pipeline/cnxml-fidelity-gaps.md:40,77-93,120,238`; finding-9 root cause `tools/cnxml-extract.js:265` |
```

