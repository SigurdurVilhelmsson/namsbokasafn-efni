# B1 — Glossary-aware Erlendur validation findings — 2026-06-28

**Status:** PASS. Implements item **B1** of the
[pipeline architecture implementation plan](../plans/2026-06-28-pipeline-architecture-implementation-plan.md).
B1 **gates B2/B3** — those are now cleared to proceed.

Companion to [2026-06-28-erlendur-probe-findings.md](./2026-06-28-erlendur-probe-findings.md)
(the earlier glossary-**OFF** characterization). This run re-tested marker integrity and the
chunk-size ceiling **with the production glossary attached**, the open caveat that doc flagged
("behavior could differ with glossary enabled — worth a glossary-on vs -off check").

Probe harness: `docs/audit/b1-glossary-probe.mjs` (paid; writes only to scratchpad, reads the
book tree read-only). Run cost: 114,517 billed characters, 11 requests, 0 failures.

## Headline

**The glossary does not degrade marker integrity, and the 25 KB chunk limit is safe with the
glossary attached. No re-tune required.** The plan's premise — that the full ~1,100-term
(~36 KB) glossary rides on every request and pressures the char budget — does not hold in
production: `filterGlossaryForText` trims the glossary to only the terms present in each chunk.

## Tests & results

### Part A — marker-survival matrix, glossary ON vs OFF (controlled)

A synthetic payload covering every marker family
(`[[i:]] [[b:]] [[sub:]] [[sup:]] [[link:|url]] [[xref:label|id]] [[xref:id]] [[docref:]]
[[MATH:N]] [[MEDIA:N]] [[BR]] {{term}} {{fn}}` + `<!-- SEG -->`) translated EN→IS twice:

| Run | filtered glossary terms | SEG ok | marker diffs |
|-----|------------------------:|:------:|--------------|
| glossary-OFF | 0 | ✓ | **ALL PRESERVED** |
| glossary-ON  | 6 | ✓ | **ALL PRESERVED** |

Attaching the glossary changed nothing about marker survival.

### Part B — full efnafraedi-2e ch5 re-translate WITH glossary (production flow)

All canonical ch5 modules, through the real `splitAtSegBoundaries` (25 KB) → per-chunk
`filterGlossaryForText` → `translateAuto` path:

| Module | SEG in/out | chunks | per-type marker diffs |
|--------|:----------:|:------:|-----------------------|
| chapter-metadata | 1 / 1 | 1 | ALL PRESERVED |
| m68723 | 7 / 7 | 1 | ALL PRESERVED |
| m68724 | 193 / 193 | 2 | ALL PRESERVED |
| m68726 | 170 / 170 | 2 | ALL PRESERVED |
| m68727 | 358 / 358 | 3 | ALL PRESERVED |

**729 SEG markers across 9 chunks, 100% preserved; every inline bracket family count identical
in/out; 0 control chars.**

### Chunk-size ceiling with glossary — the key correction

Production filters the glossary **per chunk** to only the terms occurring in that chunk:

- filtered terms per chunk: **1–56** (not the full 617 approved / "~1,100")
- filtered glossary serialized: **130–2,973 bytes** (not ~36 KB)
- chunks that hit the glossary-truncation-retry (`validateMarkers` fail → re-send without
  glossary): **0 of 9**

So a ~25 KB segment chunk carries **≤ ~3 KB** of glossary → ~28 KB total request, well under the
**clean-at-38 KB** ceiling the glossary-OFF probe established. The 25 KB limit has comfortable
headroom even with the glossary.

## Implications for the roadmap

- **B2 (downgrade `restore*` to validate-and-warn) and B3 (per-type bracket count check) are
  cleared.** Marker survival is 100% with the glossary, so the restoration heuristics remain
  redundant for API content under production conditions, not just glossary-off lab conditions.
- **Chunking:** keep 25 KB. The `payload + glossary` budgeting the plan called for is satisfied
  with large margin because of per-chunk filtering. Raising toward ~35 KB is *possible* (the
  38 KB clean result holds) but unnecessary — defer unless call-count reduction is wanted.
- **`filterGlossaryForText` is load-bearing** for this conclusion. Any future change that sends
  the unfiltered glossary (or a much larger filtered set) would reopen the char-budget question
  — re-run this probe if that path changes.

## Caveats (honest scope)

- One book (efnafraedi-2e, chemistry domain), one chapter (ch5, 729 SEG, 4 content modules).
  Other domains/books with denser term hits could filter to larger glossaries — but the ceiling
  headroom (3 KB observed vs 13 KB to the 38 KB limit) is wide.
- **"ALL PRESERVED" means marker COUNT parity per type, plus `repairSegTags` ran inside the probe
  (as in production).** So a recurrence of the prior probe's deterministic hyphen-in-id mangling
  (`m68724`→`m6-8724`) would be silently repaired and would not show in these diffs — which is the
  intended production behavior (`repairSegTags` is explicitly kept), but the claim is "counts intact
  + id-mangling auto-repaired," not "bytes untouched." The earlier glossary-OFF probe separately
  verified link/xref *content* integrity; this run did not re-check content.
- Marker survival ≠ translation fidelity; the `translation-errors.json` discrepancies are
  extraction/nesting issues independent of API marker survival (unchanged from the prior doc).
- **Cost-rate ambiguity — verify before any larger paid run.** `getUsage()` returned `totalChars`
  114,517 with `totalCost` **1145.17** and `estimatedISK` **572.585** — i.e. `totalCost` is exactly
  2× `estimatedISK` (0.01 vs 0.005 ISK/char; `createUsageTracker` in `malstadur-api.js` and the
  dry-run estimator disagree — **one rate is wrong**). The dry-run figure the spend was authorized
  against (~732 ISK) uses 0.005, so realized cost may be ~2×. Billed chars (114.5K) also came in
  *below* input (146K) — async-path usage may be under-recorded. This run stayed within its band,
  but before the plan's "~17,705 ISK whole-book" type run, **reconcile the rate against a real
  Miðeind invoice.**
