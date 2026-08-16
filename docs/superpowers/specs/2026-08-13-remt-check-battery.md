<!-- FROZEN EVIDENCE — banner-dated 2026-08-13. Per CLAUDE.md § One source of truth this is
     EVIDENCE, never status. If it disagrees with the active register, THE REGISTER WINS. -->

# Check battery — companion to the gated per-module re-MT loop design

> ## 🔴 AMENDMENT — 2026-08-16, after §C82 Plan A was implemented and reviewed
>
> **This spec is binding authority for Plans B and C, which are still unwritten — so read this
> block before building from it.** Executing Plan A falsified several of its claims. Per this
> project's convention a frozen design record is amended with a banner, never silently edited,
> so the original text below stands unchanged and this block overrides it where they conflict.
>
> 1. **§5 item 7 lists `validate-chapter.js` among "the four tools with no `--module`" needing a
>    per-module wrapper. That is WRONG, and building the wrapper would ship two silently-wrong
>    checks.** `validate-chapter` is **chapter-scoped by design**: 2 of its **16** validators
>    reconcile *across* a chapter's modules — `figure-numbers` (sequential within chapter) and
>    `cross-references` (matched against the chapter-wide caption set). Neither is computable
>    from one module. It belongs in this spec's existing *"chapter-only by design → Tier 4"*
>    category, beside `cnxml-render-fidelity-check`. → register **§C86**.
> 2. **The per-module R1/R5 tools are `cnxml-fidelity-check.js` and `cnxml-linguistic-check.js`
>    — NOT `cnxml-render-fidelity-check.js`, which is a different tool.** Plan A's Task 8
>    reasoned about the latter and left the former two ungated; both were measured on 2026-08-16
>    exiting **0 having examined ZERO modules** on a `--module` that matched nothing, and
>    silently widening to a whole-chapter scan on a bare `--module`. Both are fixed on the
>    §C82 Plan A branch. **Any driver this spec describes must still treat "examined 0 units"
>    as a failure in its own right, not infer a pass from exit 0.**
> 3. **E2's occurrence figures in any prose — here or in the register — are stale.** The
>    owner is the committed pin in `tools/__tests__/bracket-body-corpus.test.js`. One
>    measurement had three published versions, differing in the finding count itself.
> 4. **E2 required a fix Plan A found only under FRESH extraction** — which is what this
>    spec's own loop step 2 performs. Its body comparison decoded entities on one side only,
>    so every marker body holding a character reference (`&#8722;`, `&#x2212;`, …) reported a
>    false swallow: 6 of 342 organic modules, 10 false findings. E2 is specified as BLOCKING,
>    so each was a false halt on a paid run. **Any check comparing DOM-derived text against
>    raw segment text inherits this hazard — normalize both sides.**
> 5. **Do not treat "round-trip check green" as evidence that alt CONTENT survived.** It counts
>    attributes; deleting every alt segment leaves it green. → register §C85.

**Owns:** the check list, tiering, blocking/advisory split, fixture ledger and validation plan
for §C82's loop.
**Companion to:** [`2026-08-13-gated-per-module-remt-loop-design.md`](2026-08-13-gated-per-module-remt-loop-design.md),
which owns the loop's architecture and state model.
**Cites, never restates:** the pilot runbook's measured baselines
([`docs/plans/2026-08-12-c56-pilot-re-extract-remt-runbook.md`](../../plans/2026-08-12-c56-pilot-re-extract-remt-runbook.md),
its `P1–P5`/`M1–M7`) and the active register's item numbers.

⚠️ **Provenance and its one gap.** Produced 2026-08-12/13 by a four-angle investigation, each
angle adversarially challenged. **One challenger did not complete** — `attack:existing-checks`
died on a connection error — so **Tier 0's and Tier 1's *reuse* verdicts are the least
verified part of this document.** Every claim carries a measurement marker; treat `[M†]`
(measured upstream, not re-run) in that area with more caution than elsewhere.

---

# CHECK BATTERY — gated per-module re-MT loop (§C82)

**Status of numbers below:** `[M]` = I measured it in this session (command shown or reproducible from §4). `[M*]` = measured by an upstream investigation and re-confirmed by me. `[M†]` = measured by an upstream investigation, not re-run here. `[A]` = argued.

**Naming.** The draft's `S1–S9/T1–T2` is retired — it collided with the runbook's already-measured `P1–P5/M1–M7` (`docs/plans/2026-08-12-c56-pilot-re-extract-remt-runbook.md:239-285`) and CLAUDE.md § *One source of truth* forbids a second scheme. Final ids are tier-prefixed and map to both. **The runbook keeps its baselines; this spec never restates a count it owns.**

| draft | runbook | final | fate |
|---|---|---|---|
| S1 | — | **A1** | redefined (count parity → seg-id **set** equality; count cannot fail, see A1) |
| S2 | — | **A2** | kept, split into 3 modes; parseability half is net-new |
| S3 | M3 | **A3** | kept, **widened + per-segment + bidirectional** (§C69 comparability call) |
| S4 | — | **A4** | redefined (file-scan is a tautology → read producer's `unwrapped[]`) |
| S5 | — | **A5** | redefined (byte-identity fires on 23.5% of pairs) |
| S6 | — | **R1** | kept as-is |
| S7 | — | **R3** | kept, per-file invocation |
| S8 | — | **R4** | kept, warnings promoted |
| S9 | — | **E5** | **moved tier**: post-MT gate → free pre-MT extraction check; it is §C81's acceptance test |
| T1 | — | **G2/G3/G4** | **moved tier**: per-module output → per-book glossary input |
| T2 | — | **H2** | **dropped as a gate** (see §1 drops) |
| — | P1 | E1 | kept (both dialects) |
| — | P2 | E2 | **instrument replaced** (byte pattern is wrong in both directions) |
| — | P3 | E3 | kept |
| — | P4 | E6 | kept (`find -name '*.backup.*'`, never `git status`) |
| — | P5 | E7 | kept, advisory |
| — | M1/M2 | A6 | kept EN+IS |
| — | M4 | R2 | kept (`attrMismatches`, excluded from exit code) |
| — | M5 | K1 | **moved tier**: chapter-aggregated by design, cannot be per-module |
| — | M6 | K3 | kept |
| — | M7 | A8 | demoted to bookkeeping (estimate-vs-estimate, cannot fail) |

---

## 1. THE CHECK LIST

### Tier 0 — per BOOK, once, before the first ISK. Free.

| id | asserts | PASS/FAIL/WARN | code | blind spot | fixture that proves it fires |
|---|---|---|---|---|---|
| **G1** | no English headword has 2+ distinct `approved` Icelandic values, beyond `glossary-collisions-baseline.json` | FAIL→halt book | **reuse** `tools/lib/glossary-collisions.js:29` `findGlossaryCollisions` + `tools/validate-glossary.js:165` (exits 1) | **provably blind to the §C73/§C77 class** `[M*]`: `is → lófalægur` is single-valued so it is not a competition — measured absent while `atom` (2 values) is detected as the positive control | 17 real competitions across the 4 committed files (§C72) `[M†]`; `atom` synthetic control |
| **G2** | no `-ium` English headword resolves to a `-ín`/`-in` Icelandic ending (must be `-íum`) | FAIL→halt book | **new** (~15 lines, runs through the real `formatGlossary`, `tools/lib/malstadur-api.js:204`, so it measures the **wire body**, not the file) | **retrodictive** — encodes a rule the [LEAD] supplied *after* §C73 was found; generalises to nothing else | `git 120352b0` chemistry glossary → **44**; `b665c43d` → **0** `[M†]` |
| **G3** | no headword is a common English function word | FAIL→halt book | **new**; stoplist **must be derived from an English frequency list + min-length**, not hand-copied from §C77's table | fitted if the stoplist is copied; will not find the *next* homograph; word boundaries do not fix the entry, only its reach | reproduces §C77's four-book table exactly on the wire, and independently reproduces the `in → tomma` promotion §C73's deletion caused `[M†]` |
| **G4** | one headword does not resolve differently across books | WARN | **new** | catches **3 of §C73's 44** — 41 are chemistry-only elements with no second book to disagree with; structurally blind to anything uniformly wrong `[M†]` | the sodium/potassium/calcium trio in the pre-C73 vintage |
| **G5** | committed `glossary-unified.json` is a non-null object with a known producer stamp, not shrunk >50% | FAIL | **reuse** `server/lib/glossaryProducer.js`, `glossaryExportDecision.js` | gates producer swap and halving, never correctness | the 4-byte `null` payload that walked past all three gates (§C21 amendment) |

**Why Tier 0 exists at all:** §C78 — propagation is **segment-keyed, not term-keyed**, so a bad glossary entry that reaches output cannot be flipped back across a book. A glossary defect caught here costs one DB edit; caught after the run it costs re-MT. `[A, from §C78]`

**G-arm (§C82 ③) — the winner criterion, which the register does not define.** Module 1 of each book runs both arms (~1,000 ISK). Comparison, same module/vintage:
1. **A3** total per-segment marker-delta magnitude — glossary arm expected worse (§C67 class 3 is glossary-driven).
2. **A4** `unwrapped[]` count — glossary-driven by construction.
3. glossary target-word occurrence count in output (a **compliance proxy**, not a correctness measure).
4. **blind side-by-side human read** of the same N segments.

Rule: (1) and (2) can only **disqualify** the glossary arm; if they tie, (4) decides. **Record the winning arm *and the glossary content hash* in the module run record** — a later glossary change invalidates the decision.

### Tier 1 — per MODULE, PRE-MT. Free, loops until clean, **gates the spend**.

| id | asserts | semantics | code | blind spot | fixture |
|---|---|---|---|---|---|
| **E1** | zero legacy markers on the EN side, **both dialects**: `{{i\|b\|term\|fn}}` **and** `++text++` | FAIL | reuse runbook P1 regex; `++` count **must be anchored to `<emphasis effect="underline">` in `01-source`** | the naive `++[^+]+++` regex **over-counts 26%** on adjacent runs: 49 hits vs 39 source elements across 6 chemistry modules `[M†]` | SHOULD-TRIP: 1,798 EN occurrences across 104 chemistry + 4 micro modules `[M†]`; nested breakage `++4[[i:s++[[sup:2]]]]` in `books/efnafraedi-2e/02-for-mt/ch06/m68734-segments.en.md`. MUST-NOT-TRIP: physics ch04 EN = 0 |
| **E2** | every bracket-marker body equals its `01-source` element content | FAIL | **new** — the byte pattern `[[type: ` is **the wrong instrument in both directions** | see fixture column | SHOULD-TRIP ×2: `m68733` `[[i: 3d;]]` (self-closing `<emphasis/>` swallow) **and** `m68710:716,722` `[[i:is the reductant, HCl(g]]` — **which the byte pattern cannot see at all** (no leading space). MUST-NOT-TRIP ×8 occurrences: `[[sub: fusion]]`×2, `[[sub: vaporization]]`, `[[i: molecules]]`×2, `[[i: argentum]]`, `[[i: sp]]`, `[[i: twice]]` — all correct extraction of source-legitimate leading spaces. **8 of 9 live hits are false positives = 89% by occurrence** `[M]` |
| **E3** | no raw XML residue in segments: `<(emphasis\|term\|link\|note\|para\|entry\|row)\b` | FAIL | reuse runbook P3 | widened once already; assume a next tag | baseline 0 both sides `[M†]` — needs a planted control |
| **E4** | every `01-source` `<list>` item reached a segment; no **real** duplicate seg-id (different visible text under one id) | FAIL | **reuse `tools/verify-extraction-coverage.js`** → `tools/lib/extraction-coverage.js:163 analyzeModule` (pure per-module fn — import, don't shell) | none found; it is the strongest existing instrument | SHOULD-TRIP: `orverufraedi` m58781/m58782/m58783 → **14 lists with 0/4 items emitted, exit 1** `[M]`. MUST-NOT-TRIP: the other four books exit 0, **and chemistry's 285 benign duplicate extras must not fire** `[M]` |
| **E5** | count of non-empty `alt=` in `01-source` == count of alt segments emitted to `02-for-mt`; **reports the count examined** | FAIL | **new**, same shape as E4 — it belongs in `extraction-coverage.js`, not in a post-MT battery | vacuous on a figure-less module unless the examined-count is printed | SHOULD-TRIP: **the entire tree today** — chemistry 1,149 alt attrs in source, **0** alt in `02-for-mt` (positive control: 394 SEG lines read from the same file) `[M]`. MUST-NOT-TRIP: post-§C81 |
| **E6** | extract emitted no unexpected files | FAIL | reuse runbook P4 — **`find … -name '*.backup.*'`, NOT `git status --porcelain`** | `git status` cannot see `.gitignore:20 *.backup.*` | the 2026-08-12 run reported `??` = none while writing **67** backup files `[M†]` |
| **E7** | re-extraction is equivalent to committed: seg-id **set** + per-id normalized visible text + equation key-set | **WARN** (quarantine + attribution, not halt) | **reuse** `tools/verify-reextract-equivalence.js` → exported `compareModule`, `normalizeVisibleText` | §C81 **intends** to change extraction, so this cannot be a halt this cycle | its own docstring warns an under-built `normalizeVisibleText` false-positives on ~20 benign chemistry modules `[M†]` |
| **E8** | extraction fingerprint recorded for the module (§C82 ①, one vintage per book) | record | **new** | — | n/a — bookkeeping |
| **E9** | **pre-flight**: no `.locked` sibling · `git log` shows no hand edit under `02-mt-output` · every expected input exists non-empty · `--force` present · `--force --dry-run` cost within band | FAIL | reuse `tools/lib/mt-lock.cjs:14 isMtLocked`; `mtRunDecision` returns `locked-skip` before `--force` | a lock is fail-safe (unreadable ⇒ locked); `git log` is the only witness to a hand-edited MT baseline | 8 live `.locked` files (§C79) `[M†]`; **a bare `--dry-run` reports `~0 ISK` on an already-translated module — a wrong answer that looks like an answer** (runbook:334) |

### Tier 2 — per MODULE, POST-MT. Paid, one shot. Surface: `02-for-mt` × `02-mt-output`.

| id | asserts | semantics | code | blind spot | fixture |
|---|---|---|---|---|---|
| **A1** | EN seg-id **set** == IS seg-id set | FAIL | reuse `tools/lib/seg-markers.cjs` parse | **count parity cannot fail on a written file** — `validateMarkers` throws at `tools/api-translate.js:1132-1140` *before* `fs.writeFileSync` at :1164. A count check here is a second code path over an unreachable state `[M†]` | none natural; the informative artifact is the **thrown** condition, captured in the run record |
| **A2** | (a) producer's `markersNormalized == 0`; (b) `parseSegments(out).length == raw marker count`; (c) no `<!-- SEG: ` spaced form | (a) WARN→quarantine · (b)(c) FAIL | (a) reuse `countInlineMarkers`/`normalizeSegMarkers` (`api-translate.js:296`, :1124 — **repairs and proceeds**); (b)(c) **new** | (a) is a *repaired* condition — the file is clean, the counter is the evidence; the glue class **defeats A1 and A2(c) simultaneously** (`api-translate.js:287-292`: marker count unchanged, preceding segment silently dropped) | **NO natural fixture: 0 spaced-SEG occurrences corpus-wide, against a positive control of 36,907 canonical markers in the same sweep** `[M]`. Synthetic only, verified against the real `segmentParser.parseSegments` |
| **A3** | per-**segment**, per-type bracket-marker counts preserved EN→IS, **both directions** | FAIL→halt | **reuse-with-changes** `bracketMarkerDelta` (`api-translate.js:467`). Three fixes required: widen `BRACKET_MARKER_TYPES` (:302, 14 types) to the full `KNOWN_BRACKET_TYPES` (:337) **plus `math` and `EQ`**; compute per segment; make it gating | it is a **relative** check and inherits input defects; **payload** corruption preserving counts is out of scope (`[[xref:kafli\|1]]` → `[[xref:kafli>1]]` returns `{}`) | **the acceptance trio, all executed** `[M]`: `m58781` → `{"b":-2}` (true positive) · `m68791` → `{}` with MATH 84/84 TABLE 6/6 (true negative) · **`m68823` → `{}` while MATH went 56→54 (proven FALSE NEGATIVE — this is the widening's acceptance test)**. Invention direction: `lifraen-efnafraedi/ch23/exercises` → `{"i":+33}` `[M]`. Three more MATH false negatives found: `m68819` 120→119, `m68832` 9→8, `m68852` 52→50 — **4 modules in 227 pairs, ~1.8%** `[M]` |
| **A4** | producer's `unwrapped[]` count is within band for the module | WARN→quarantine | **reuse the return value** at `api-translate.js:1195-1202` | **a file scan is a tautology** — `unwrapInventedMarkers` runs inside `translateChunk` (:1023, :1046) before write, so post-hoc "invented markers = 0" holds whether the model invented 9 or 900 `[M†]` | `m00033`'s 9 invented markers reproduced 9/9/9 across three runs — **but the bytes are gone from the tree**; its live replacement (ch23 exercises) is a *different* class the unwrap **cannot repair by design** (invented type `i` is a KNOWN type) `[M]` |
| **A5** | untranslated residue. **Stage 1**: exact EN==IS residue beyond `residue-allowlist.json`. **Stage 2**: identical **and** ≥120 alphabetic chars **after stripping markers** | S1 FAIL→halt · S2 WARN→human queue | reuse `tools/scan-residue.js --json` + `tools/lib/residue-allowlist.js` — **the tool EXITS 0 WITH FINDINGS** (`process.exit` only at :71,:78, arg validation), so the driver must read the JSON and apply its own threshold `[M†]` | raw byte-identity is useless as a module predicate: **7,300 of 31,025 paired segments (23.5%) are legitimately identical** `[M]`. `scan-residue`'s 69 **ratio warnings are NOT allowlist-filtered** and cluster in chemistry worked solutions at 0.71–0.86 → advisory only | SHOULD-TRIP: `m68662`, 76 exact residues, the only module `scan-residue` flags `[M†]`. Stage 2 → **9 segments corpus-wide**, of which 3 are `m68662` preface biographies (known-good) and **6 are genuine** untranslated prose: `lifraen-efnafraedi` m00037, m00135×3 · `orverufraedi` m58802, m58803 `[M]`. MUST-NOT-TRIP: the 7,300; the 16 allowlist entries; and the 2 that fall out on marker-stripping (`m68734`, `m68843` — electron configurations and coordination complexes whose "letters" are marker syntax) `[M]` |
| **A6** | zero legacy `{{…}}` / `++…++` on the **IS** side | FAIL | as E1 | — | 5,588 IS-side occurrences across 113 chemistry + 4 micro modules `[M†]` |
| **A7** | numeric tokens preserved EN→IS | WARN | reuse `server/services/qaCheckService.js:79 checkNumbers` (pure, per-module, no I/O) | `numberKey` strips non-digits, so `3.5` and `35` collide — its own comment calls it a heuristic; **its sibling `checkEnResidue` (≥2 function words) is the C67 over-reporter — do not enable it** | none; needs a planted digit change |
| **A8** | character count within estimate band | record only | — | **`M7` compares `usage.estimatedISK` to `estimateIsk(chars)` from the same function — it cannot fail** (runbook:315). Compare **characters**; true cost is the Málstaður invoice | n/a |

### Tier 3 — per MODULE, POST-INJECT / POST-RENDER. Free, re-runnable.

| id | asserts | semantics | code | blind spot | fixture |
|---|---|---|---|---|---|
| **R1** | no **unexplained** element-count discrepancy `01-source` → `03-translated` | FAIL | **reuse as-is** `tools/cnxml-fidelity-check.js` (`--book --chapter --module`, verified per-module, exit 0 with "0 unexplained") | allowlist match is **exact `moduleId+tag+diff`**; only `efnafraedi-2e` has one (36 entries, committed 2026-07-06). Re-MT moves diffs → known-benign losses resurface as "new"; a still-matching entry masks a genuinely new defect at that module+tag | MUST-NOT-TRIP: the 36 entries. SHOULD-TRIP: plant a tag deletion in a scratch copy |
| **R2** | inject `attrMismatches == 0` | FAIL | reuse `tools/cnxml-inject.js` — **read the output, not the exit code**: `complete` is computed from four conditions and `attrMismatches` is deliberately excluded (runbook:301-305) | — | `{{term}}` → `[[term:text\|id]]` migration is 84% of the pilot's legacy load |
| **R3** | RelaxNG-valid CNXML, one file per invocation | `fatal:` FAIL always · structural errors FAIL for chemistry, WARN elsewhere (FINDINGS §5) | **reuse** `experiments/cnxml-validation-gate/validate-cnxml.js`; **`--allowlist allowlist.recommended.json` is effectively mandatory** (default allowlist fails 660 of 1,192 pristine files) | **orthogonal to R1** — chemistry has 37 fidelity discrepancies and **0** schema errors. Never substitutes | 1,192 pristine OpenStax files validate clean under the recommended allowlist = the zero point. Per-file invocation **structurally defeats** jing's batch-abort fail-quiet |
| **R4** | render produced the expected files, non-empty, no placeholder leaks, images exist, equations rendered | errors FAIL · **ID-preservation warning promoted to FAIL** | **reuse** `tools/audit-render-output.js` (own `parseArgs` at :37 with `--module`, `--json`, `--track`) | **exit code keys on `totalErrors` only (:543)** — a real ID drop is a *warning* and passes. **`--book` defaults to `efnafraedi-2e` (:41)** — omit it and you audit chemistry whichever book you meant | `m68663 --track mt-preview` → "0 error(s), 1 warning(s) … 1 ID(s) missing from output", exit 0 `[M†]` — the warning **is** the fixture for the promotion |
| **R5** | leaf text in `03-translated` differs from `01-source` | **WARN only** | reuse `tools/cnxml-linguistic-check.js` | fires on **68 of 149 chemistry modules**, including language-neutral `(a) (b) (c) (d)` option labels — a per-module halt halts on ~46% of the book `[M†]` | whole-book run exits 1 (gate fires); `m68663` exits 0 (clean control) |

### Tier 4 — per CHAPTER, at chapter close. Not per module.

| id | asserts | semantics | code | blind spot | fixture |
|---|---|---|---|---|---|
| **K1** | render shape-drift vs `render-fidelity-baseline.json` | WARN; **"no baseline" must print as SKIPPED, never as clean** | reuse `tools/cnxml-render-fidelity-check.js` — **chapter-aggregated by design** (header: "the chapter is the closed reconciliation unit"); it has **no `--module`, and `parseArgs` silently accepts and ignores one** | baselines exist only for `efnafraedi-2e` ch10-21+appendices and `edlisfraedi-2e` ch04 → **inert for chemistry ch1-9 and three entire books**, while printing `Total findings: 0` `[M†]`. Run from repo root: from the wrong cwd it prints the same `0` having read **zero files** (§C60) | ch2 → `ch2: clean (no baseline — shape-drift skipped)` then `Total findings: 0`, exit 0 |
| **K2** | element/math counts `03-translated` → `05-publication` do not drop | FAIL | reuse the **baseline-free cross-stage `>=` invariant** in the same tool — this half works everywhere | — | §C64: physics ch04, 554 `<m:math>` → 546 `[M†]` |
| **K3** | every published-file rename accounted for by an old→new slug map (C9 contract) | FAIL | reuse runbook M6 instrument (`find -name '*.html'`) | prune-without-map destroys the information permanently | `published-BEFORE-*.txt` captured 2026-08-12: 335 html files, 24 in the pilot |

### DROPPED, with reasons

- **S4 as drafted** ("invented markers post-unwrap must be 0"). **Tautology** — the repair runs before write; residual is 0 by construction `[M†]`. Replaced by **A4** (producer counter) + **A3**'s positive direction, which catches the class the unwrap *cannot* repair (invented markers of a **known** type: ch23 exercises `[[i:]]` 19→52) `[M]`.
- **S1 as drafted** (segment-count parity). Cannot fail on a written file — `validateMarkers` throws at `api-translate.js:1132-1140` before the write `[M†]`. Replaced by **A1** (set equality) + the run record.
- **T2** (within-module term consistency). Dropped **as a gate**, moved to **H2**. Two independent kills: (a) **consistent wrongness passes it** — `magnesín` propagated uniformly into `magnesínklóríð` everywhere (§C73); (b) **§C54's priority chain actively prescribes singular/plural divergence** — `carbohydrates` → `kolvetni` [biology] vs `carbohydrate` → `sykra` [anatomy-physiology], so the check would fail correct text and pass prescribed inconsistency `[M†]`. Also: `terminologyService.findTermsInSegments` is DB-dependent, **fail-closed-silent on an unscoped book**, and §C50 measured its issue volume at **3.4–4.3 per segment on untouched MT output** — 340–430 findings on a 100-segment module.
- **T1 as drafted** ("glossary homograph sweep reaching output"). Moved to Tier 0. The instrument that looks like its owner is **provably blind**: `findGlossaryCollisions` detects *competitions*, and §C77's class is a single-valued wrong entry `[M*]`. Output-side detection would require knowing Icelandic orthography, which no gate has.
- **S9 as drafted** (post-MT figure alt). Not dropped — **re-tiered to E5**. `alt` is captured to `02-structure` and never reaches `02-for-mt` `[M]`, so today it is unrunnable; post-§C81 it becomes an *extraction-coverage* question, free and pre-MT. It is §C81's acceptance test and it guards **12,888 of the ~112,200 ISK** (register:322-327). Dropping it as the upstream `failure-classes` investigation recommended would delete the only check on 11.5% of the spend.
- **S5 as drafted** (byte-identical). Redefined — 23.5% base rate `[M]`.
- **M7 as a check**. Demoted to A8 bookkeeping — estimate vs estimate from one function.

---

## 2. BLOCKING vs ADVISORY

**Derivation rule, applied mechanically:** *a check with no known-bad fixture cannot be blocking.* That is the project's own "never shown to FAIL is not a check", and it decides the split without hand-assignment. Second rule: **a pre-MT check is cheap to block on** (fix in code, re-extract, free); **a post-MT check that blocks must have a measured base rate**, because a false halt on 500 modules costs attention, and §C82 ② already routes every failure to a human read.

### BLOCKING

| id | justification | expected halt rate |
|---|---|---|
| **G1 G2 G3 G5** | per **book**, once, free, before any spend; §C78 makes a post-hoc glossary fix unaffordable | 0 once fixed |
| **E1 E2 E3 E4 E5 E6 E9** | pre-MT, free, loops. A halt costs a re-extract, not money. All have live SHOULD-TRIP **and** MUST-NOT-TRIP fixtures `[M]` | 0 after the §C81 re-extract, **except E4 on `orverufraedi` — see the false-halt warning below** |
| **A3** (widened, per-segment) | the flagship: catches real marker destruction that reaches the reader; **currently a proven false negative on 4 chemistry modules** `[M]`. Pilot measured 2.0% marker loss on the current model | ~2% ≈ **10 halts in 500** |
| **A5 stage 1** | exact untranslated residue beyond the allowlist is unambiguous | **conditional — blocking ONLY after the allowlist is re-derived** (see §5); otherwise `m68662`'s 76 fire |
| **A6** | legacy dialect on the IS side is unambiguous and has a 5,588-occurrence known-bad `[M†]` | 0 |
| **A2(b)(c)** | an unparseable SEG marker makes the module un-injectable; §C29 proves inject failure is the one downstream stage with no workaround (`m58805` is committed and **cannot be regenerated**) | 0 expected; synthetic fixture only |
| **R2** | `attrMismatches` is the `{{term}}` migration's *signature* failure and is deliberately excluded from the exit code | low |
| **R3** `fatal:` | jing aborts the batch after a fatal — per-file invocation makes this a real halt rather than a silent skip | 0 |
| **R4** errors **+ promoted ID-preservation warning** | reader-visible missing content; the warning-not-error split is what lets an ID drop pass today `[M†]` | low |
| **K2** | §C64 — 8 equations lost between inject and publication, reader-visible, and **free to fix** (render stage, no re-MT) | per chapter |
| **K3** | a prune without a slug map 404s every inbound link, permanently | per chapter |

### ADVISORY (recorded in the run record, do not halt)

**A1** (cannot fail on a written file) · **A2(a)** `markersNormalized` (repaired-and-proceeded; quarantine signal) · **A4** `unwrapped[]` (rate input for the arm decision) · **A5 stage 2** (9 corpus-wide → human queue, not a halt) · **A7** numbers (heuristic; `3.5`/`35` collide) · **A8** cost · **E7** re-extract equivalence (§C81 *intends* to change extraction) · **E8** fingerprint · **R1 order/math sub-checks** (warn-only in the tool) · **R3 structural errors on non-chemistry books** (FINDINGS §5) · **R5** linguistic-check (68/149 base rate `[M†]`) · **K1** shape drift (inert without a baseline) · **G4** cross-book divergence (catches 3 of 44).

### Two guaranteed false halts to disarm before the run

1. **`orverufraedi` fails E4 today.** Micro is in scope (12 files, 2,100 ISK) and `verify-extraction-coverage --book orverufraedi` **exits 1** on 14 dropped lists in m58781/m58782/m58783 `[M]` — a pre-existing extraction defect (`[[bio-review-option-drop]]`), not an MT regression. **The designated A3 true-positive fixture, `m58781`, is one of those three modules.** Triage or baseline it before the shakedown, or module 1 halts.
2. **Chapter 0 is falsy.** `if (args.module && !args.chapter)` at `cnxml-linguistic-check.js:240` and `cnxml-fidelity-check.js:297` rejects `--chapter 0`; and `--chapter 0` *without* `--module` silently scanned **all 149 chemistry modules** where `--chapter 1` scanned 7 `[M†]`. Chemistry ch00 holds `m68662` — the only A5 fixture.

---

## 3. WHAT THE BATTERY CANNOT SEE

Stated plainly, because this defines the human read (§C82 ②: first 3 modules per book, every failure, ~1-in-10 sample).

1. **A wrong-but-well-formed, `approved`, uncontested term.** The §C73/§C77 class. It is well-formed, so the collision sweep, producer gate and shrink guard all *correctly* see nothing. `status: "approved"` in `glossary-unified.json` is **assigned mechanically from provenance at import, not by review** (§C63), so "approved and uncontested" carries no information about correctness. Tier 0 catches the *known instances*; the *class* is unreachable mechanically.
2. **Consistent wrongness.** `magnesín` → `magnesínklóríð` everywhere. Every consistency check passes it.
3. **Whether the model obeyed a bad entry.** Compliance is **partial and unpredictable** — measured: `sodium→natrín` ignored, `magnesium→magnesín` obeyed `[M†]`. Unquantified at corpus scale, and no output check can measure it without already knowing the right answer.
4. **Content that has no segment to compare.** §C4 nested-para truncation: the inner `<para>` gets no segment at all, so its English survives into published output and **A5 structurally cannot fire** — there is nothing to compare. Likewise anything dropped at extract (micro's 14 lists; `alt` today) is invisible to every post-MT check.
5. **Meaning.** Every marker preserved, every number preserved, and the sentence still wrong: mistranslation, negation flips, a hallucinated or omitted clause inside a segment, wrong register for a school textbook.
6. **Payload corruption that preserves counts.** `[[xref:kafli|1]]` → `[[xref:kafli>1]]`; a duplicated `[[MATH:1]]`. A3 returns `{}` for both `[M†]`. (Not on the `/v1/translate` path today — but marker-survival evidence is **per-endpoint**, and the model behind an endpoint changes.)
7. **Staleness.** §C57 — output correct but older than its input; a per-module pass/fail battery has no way to express it.
8. **Render-side glossary substitution in prose.** `buildGlossaryMap` applies **no omission at all** (last-write-wins). The only render-side protection is `math-label-map.json`'s self-map idiom, covering **math labels only**. `at → marsnákaætt` (a snake family) reached **21 leaf math labels** while being correctly withheld from the MT `[M†]`. Nothing checks substitution in body prose.
9. **§C13's two live follow-ups**: a figure kept verbatim in a container bypasses image localization; a captioned figure inside `<example>`/`<exercise>` leaks caption prose into the body **and keeps the English caption** — live in published `m68764`.

### H1–H4 — what a reviewer should actually look for

- **H1 · Terminology against domain knowledge, not against the glossary.** Element and compound names, units, SI prefixes. Check the **stem inside compounds** (`magnesíumklóríð`, not `magnesínklóríð`) — the compound is where a wrong stem does the most damage and where no gate looks.
- **H2 · Homograph substitution in context.** Where the English source contains `is / no / in / at / one / will / be / As / At / Be / OR`, read the Icelandic sentence for a spurious term substitution. `filterGlossaryForText` is a case-insensitive **substring** test with no word boundary (`api-translate.js:941`) `[M*]`, so `is` matches *basis*, `no` matches *phenomenon*.
- **H2b · Singular/plural divergence is sometimes CORRECT.** §C54: `carbohydrates → kolvetni` but `carbohydrate → sykra`, because the book's domain chain resolves them to different concepts. **Do not report as inconsistency** without checking the concept ids — this is exactly why T2 is not a gate.
- **H3 · Read the English alongside.** Does a clause exist in one and not the other? Is a negation preserved?
- **H4 · Figure captions and (post-§C81) alt text.** Does the alt describe the figure, in Icelandic?
- **Known false-positive ground the reviewer should NOT spend time on:** front-matter biographies and researcher/institution names (legitimately English — `m68662`, and 3 of A5's 9 stage-2 hits), chemistry worked solutions (formulaic near-identity, 69 ratio warnings at 0.71–0.86), and language-neutral option labels `(a) (b) (c) (d)`.

---

## 4. VALIDATION PLAN — prove the battery before spending

**Structure, copied from `server/scripts/verify-b4b0-gates.js`.** Gates are extracted as **functions**; `--self-test` plants each defective state and requires **the real gate function** to detect it. The comment at :289-301 records why: the first version gave `--self-test` its own hand-written `detect` predicate, and deleting gate 1's assertion left the gate reporting PASS on a live violation while the self-test still printed DETECTED — gate 2's case was a tautology true on every input. **Copy the structure, not the idea.** Exit 0 all passed / 1 a gate failed / 2 usage-or-environment.

**Every check emits three things, always:** its verdict, **its own version stamp**, and **the number of units it examined**. §C60 is the reason: a check reported `Total findings: 0` while reading zero files. §C82 ① is the second reason: without a per-module record of which instrument version judged it, a mid-campaign fix makes earlier green verdicts unfalsifiable and the quarantine cannot be scoped.

### Fixture ledger (all Tier A — bytes in the working tree today)

| check | SHOULD-TRIP (proves it fires) | MUST-NOT-TRIP (proves it discriminates) |
|---|---|---|
| E1 `{{}}` | 1,798 EN occurrences, 104 chem + 4 micro modules | physics ch04 EN = 0 |
| E1 `++` | `m68734` `++4[[i:s++[[sup:2]]]]` | **49 regex hits vs 39 source `<emphasis effect="underline">`** — the +26% over-count |
| E2 | `m68733` `[[i: 3d;]]` · **`m68710:716,722` `[[i:is the reductant, HCl(g]]`** (byte pattern blind) | 8 occurrences: m68768 ×3, m68710 ×2, m68692, m68831, m68750 |
| E4 | `orverufraedi` → 14 lists, **exit 1** | 4 books **exit 0**; chemistry's **285 benign duplicate extras** |
| E5 | today's tree: chem 1,149 alt attrs → **0** alt segments | post-§C81; + vacuity control (alt segments examined) |
| A2 | **none exists** — synthetic, verified against real `parseSegments` | 36,907 canonical markers parse |
| A3 | `m58781` `{b:-2}` · ch23 exercises `{i:+33}` · **`m68823` MATH 56→54 returning `{}`** · m68819, m68832, m68852 | `m68791` `{}` with MATH 84/84, TABLE 6/6 |
| A4 | synthetic (m00033's bytes are gone) | ch23 exercises is a *different* class — do not conflate |
| A5-1 | `m68662`, 76 exact residues | 16 allowlist entries |
| A5-2 | 6 genuine: m00037, m00135×3, m58802, m58803 | 7,300 identical pairs (23.5%) · 3 m68662 biographies · m68734 + m68843 (marker-syntax letters) |
| A6 | 5,588 IS-side occurrences | — |
| R1 | planted tag deletion in a scratch copy | 36 allowlist entries |
| R3 | planted structural error | 1,192 pristine OpenStax files clean under `allowlist.recommended.json` |
| R4 | `m68663`'s live ID-missing warning | — |
| K1/K2 | physics ch04 554→546 `<m:math>` | chemistry ch10-21 baseline |
| SPACE/BR/`math`/EQ | **none — 0/0 corpus-wide** | must be built by running the **real extractor** over source that produces them, never hand-written |

**Honest headline: roughly half the battery has no natural known-bad fixture** — A2, A4, A7, E3, R1, R3, and the SPACE/BR/`math`/EQ marker types. Those are advisory or synthetic-only until one exists, by the rule in §2.

### Sequence

1. **Run the self-test.** Every check with a Tier-A fixture must go red on it and green on its control, through the real gate function.
2. **Whole-corpus dry sweep** of every check over all 227 existing pairs. Record base rates. **Any check whose base rate exceeds ~5% cannot be blocking** — R5 (46%) and raw A5 (23.5%) already fail that test `[M]`.
3. **§C81 lands → re-extract chemistry ch01 → re-run Tier 1.** E5 must flip from 100% fail to 0.
4. **Physics preview shakedown (§C82 ④, 10 files, ~2,346 ISK)** with the full battery live. Physics is the right shakedown because it has *no* fidelity allowlist and *no* residue allowlist — the battery runs with nothing pre-explained.
5. **Module 1 of each book runs both glossary arms** (§C82 ③) under the G-arm criterion above.
6. Only then chemistry.

**One caveat on the fixture corpus:** 227 pairs against **1,192 source modules**; chemistry supplies 149 of 227 (66%) while physics+biology+micro hold ~59% of the source and supply 30 fixtures (13%) `[M†]`. Every fixture predates the current extractor, and the loop re-extracts first. **The battery is validated on chemistry-shaped input; state that in the same breath as any pass rate.**

---

## 5. MUST BE BUILT BEFORE THE LOOP RUNS

Ordered by what blocks what.

1. **§C81 — figure `alt` into `cnxml-extract`.** Register-owned, P1, blocks all extraction (register:333, :340). Everything below assumes it has landed.
2. **Persist the per-module MT run record.** `tools/lib/provenance.js:28 writeProvenance` writes exactly `{schemaVersion, tool, generatedAt}` — verified on disk `[M]`. The counters that A1/A2/A4 depend on are returned at `api-translate.js:1195-1202` (`chars`, `usage`, `markersNormalized`, `mismatches`, `bracketDelta`, `unwrapped`) and **go nowhere**; `bracketDelta` and `unwrapped` are `console.error` Notes (:1181-1193). **Without this, three of the draft's nine structural checks are ceremony** — the repairs (`repairSegTags` :149, `normalizeSegMarkers` :1124, `unwrapInventedMarkers` :366) erase their own evidence before the file is written. Extend the sidecar with: the six counters, glossary **content hash** + arm, chars, `estimatedISK`, extraction fingerprint, and the version of every gate that judged the module.
3. **Re-derive both allowlists after the §C81 re-extract, before the loop.** `residue-allowlist.json` is **segmentId-keyed** and a re-extract renumbers seg-ids — it is **wholly voided**, and only `efnafraedi-2e` + `lifraen-efnafraedi` have one. `fidelity-allowlist.json` is **exact `moduleId+tag+diff`** (`tools/lib/fidelity-allowlist.js:21-24`), 36 entries, vintage 2026-07-06, chemistry only. Until this is done, **A5 stage 1 and R1 cannot be blocking.** This sequencing constraint appears in no existing document.
4. **A3: widen `BRACKET_MARKER_TYPES`, compute per segment, make it gating.** Record it as the **§C69 comparability call** (register:427-430) — the full run becomes stricter than the pilot, and that is a [LEAD] decision, not a silent fix.
5. **Fix the chapter-0 truthiness bug** (`cnxml-linguistic-check.js:240`, `cnxml-fidelity-check.js:297`) or exclude ch00 explicitly and say so. Chemistry ch00 holds the only A5 fixture.
6. **The driver**, `verify-b4b0-gates.js`-shaped: gates as functions, `--self-test` invoking the real gate, exit 0/1/2. **It must read `--json` per tool and apply its own thresholds — exit codes are not a uniform contract** (`scan-residue` and `cnxml-render-fidelity-check` exit 0 with findings; the rest gate). Place it in `server/` or shell tools with `--json`, following `publicationService.validateBeforePublish:124-127` — root is ESM, `server/` is CommonJS, and `qaCheckService`/`segmentParser` are AGPL.
7. **Per-module wrappers** for the four tools with no `--module`: `scan-residue.js`, `verify-extraction-coverage.js` (import `analyzeModule` instead), `validate-chapter.js` (positional `<book> <chapter>`, defaults `--track faithful`), `cnxml-render-fidelity-check.js` (chapter-only by design → Tier 4). **`parseArgs` silently drops unknown flags**, so passing `--module` to any of these today is a no-op that runs the whole book `[M]`.
8. **E4 baseline for `orverufraedi`** (14 dropped lists) — or the shakedown halts on module 1.
9. **E9 pre-flight**: `.locked` check, `git log` on `02-mt-output`, expected-input assertion, mandatory `--force`, and `--force --dry-run` for the estimate (a bare `--dry-run` reports `~0 ISK`).
10. **E2's source-anchored instrument** — the byte pattern must be replaced, not tuned: 89% false positives by occurrence, and it misses the defect class entirely whenever the swallowed text has no leading space `[M]`.
11. **E5** in `tools/lib/extraction-coverage.js`, same shape as `checkDuplicateSegIds`, with the examined-count printed.

**Reconciliation duty:** publish the S/T → P/M → final mapping table into the runbook, and cite the runbook and register for baselines rather than restating them here. Per CLAUDE.md § *One source of truth*, an unmapped third numbering scheme is itself a defect.