# M5 Figure Driver Implementation Plan

> 🔴 **TASK 0's READ-SIDE REPAIRS (P1, P2, P3, P9) ARE SUPERSEDED BY A DECISION TAKEN AFTER THIS PLAN WAS WRITTEN → [`docs/decisions/2026-09-06-figure-read-layer-respec.md`](../../decisions/2026-09-06-figure-read-layer-respec.md).**
> The read layer — `extract.py` + `pdftext.py` + `strip-text.py`, ~239 lines — is being **replaced with a ready-made MIT reader**, not repaired. The measured reason is in [`TEXT-COVERAGE.md`](../../../experiments/figure-text-translation/TEXT-COVERAGE.md): it reads **496 of 779** text-bearing chemistry figures, and one figure is already outside every mechanism we have named. **The LAYOUT side (`figtext.py`, `compose.py`, `svgout.py`) is untouched by that decision** and everything in this plan that depends on it still stands.
> ▶ **What survives here verbatim:** the driver architecture, the spend rules, the sidecar/publish/review ordering, the outcome vocabulary, and every [USER] ruling. **What to re-read against the decision first:** Task 0 and Task 2.
> ▶ **The read layer's requirements now have their own owner** → [`docs/superpowers/specs/2026-09-06-figure-read-layer-contract.md`](../specs/2026-09-06-figure-read-layer-contract.md).
> 🔴 **CORRECTED — AN EARLIER VERSION OF THIS BANNER CLAIMED "Task 0 and Task 2 are written against it, not against the repair list". THAT WAS FALSE OF THIS FILE.** Task 0 is still titled *Repair the Python chain*, its Step 4 table still prescribes P1/P2/P3, and Step 6c is still the `/Form`-descent spike. **A banner asserting a rewrite that did not happen is worse than no banner**, because the chosen execution mode hands a fresh agent the TASK TEXT, not this header. ▶ **The per-step verdicts are marked inside Task 0 itself; read them there.**

> 🔴 **REVISED TWICE, 2026-09-06.** ✅ **THE CENSUS IS NO LONGER PENDING — it was produced and committed later the same day** (`experiments/figure-text-translation/TEXT-COVERAGE.md`), so every "pending a census" line below is discharged. **Tasks 1–6b are no longer gated on it; they are gated on the read-layer adapter.**
> A blind Fable closure review of the FIRST revision confirmed **8 more defects, 0 refuted** (48 claims self-struck, 37 lower-severity left unverified). **Two are blocking, and both are one root cause:** text drawn inside a `/Form` XObject is invisible to the extractor, and this plan's own P3 fix turns that from a loud crash into a **silent green copy** — English shipped to readers with a verdict of `ok`, matching this plan's own former acceptance line byte for byte. → new **P9**, a new `unreadable-text` outcome, and a replaced acceptance criterion.
> ▶ **The pattern across three review rounds is worth naming: every blocking finding has been about WHAT THE PYTHON CHAIN ACTUALLY DOES ON REAL ARTWORK — which is settled for free, on this box, with no API call.** That is why Task 0 comes first and why its acceptance is a measurement rather than a number written in advance.
> ⚠️ **THE TEST BLOCKS BELOW WITH `...` BODIES ARE SKETCHES, NOT TESTS.** Five capped findings were *"this test cannot fail"*. When a task is executed, either write its tests in full or state the property that makes each one non-vacuous — **a test written as a suggestion is what a fresh agent satisfies vacuously.**

> ✅ **REVISED 2026-09-06 against register §C137 and a 9-agent constraint verification.**
> The first version failed a blind adversarial review (16 confirmed, 4 partial, 0 refuted); the
> verification then found **two more** defects the review had missed, and **measured a fix the
> review left as an open question**.
> ▶ **What survives: the goal, the architecture, and every [USER] ruling.**
> ▶ **What changed: the TASK ORDER (two new tasks up front, one split, one moved), the
> write-vs-spend ORDER, the classification discriminator, the verdict, and three test files that
> could pass without the thing working.**
>
> **Spec:** `docs/superpowers/specs/2026-09-06-m5-figure-driver-design.md` — REVISED in the same pass. **Read it first.**
> **Findings this plan encodes:** register §C137 (D1–D11) plus N1/N2 and P1–P8 in the spec.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one chapter's figures processable end to end, unattended, so an editor sees each translated figure beside its module.

**Architecture:** A thin Node driver (`tools/figure-run.js`) enumerates a chapter's figures from its CNXML, resolves each through `sources.py`, classifies it, sends only vectors-with-text to the paid MT stage, and writes the sidecar that unblocks the already-built review and publish path. Two Python entry points wrap the existing extraction and composition stages behind an explicit `--out <dir>`, giving per-figure isolation.

**Tech Stack:** Node 22 ESM (`tools/` is `"type": "module"`), Python 3.12 (pikepdf, cairo, PIL system-installed; fontTools/brotli vendored in `experiments/figure-text-translation/pylibs`), Vitest, `pdftocairo` and `gs` from poppler-utils / ghostscript.

---

## 🔴 Read this before Task 0 — why the order changed

The old plan ran Task 1 → 6 and would have failed at the first real figure. Seven dependency violations were measured:

| # | violation |
|---|---|
| V1 | **The Python chain crashes on 23 of 30 ch04 figures and 91 of 178 across ch01–ch05.** None of the five edits that fix it appeared in any task. The old spec said "the whole single-figure chain works". |
| V2 | **Task 3's tests could not detect V1** — executed verbatim against a 12-line refuse-everything stub, **5 of 5 PASS**. |
| V3 | **Classification consumes a field prepare must produce, and came first.** "Has no vector" as the photo discriminator fires **1 time in 178** — OpenStax ships photographs as PDFs. |
| V4 | **Task 5's test could not run**: `translate-blocks.mjs` reads gitignored `out/blocks.json` and an unguarded gitignored `.env`, so in a clean tree the first assertion passes **vacuously** against the unfixed build. |
| V5 | **Task 5's test and code were jointly unsatisfiable** — the test demands exit 0 under `--book efnafraedi-2e`; the prescribed gate refuses whenever a glossary loads, and that book loads one. |
| V6 | **Task 6's stage list could express neither the retry path nor a 0-ISK recompose**, and referenced three functions defined nowhere. |
| V7 | **The block-key derivation fork expires at the first live run** — a sidecar's keys ARE the block keys, so once one chapter mints sidecars it becomes a key migration. |

**Revised order (2026-09-06 evening):** `R1` acceptance harness · `R2` the pdfplumber adapter · `R3` `/Form`-aware strip · `R4` the surviving Task-0 repairs · `R5` acceptance evidence + licence · then `0b` `--out` on the paid stage · `1` outcomes+verdict · `2` prepare · `3` classify (**moved after prepare**) · `4` compose · `5` invert gate 1 · `6a` the free driver · `6b` the paid driver.
▶ **`0` is superseded by `R1`–`R5`; its surviving repairs are `R4`.**
▶ **6b is the only task that can spend money**, which is what makes the [USER] authorisation gate at the end meaningful.

---

## Global Constraints

- **`tools/` is ESM** (root `package.json` is `"type": "module"`). `tools/lib/*.cjs` exists ONLY for modules consumed by both trees. `figure-text-sidecar.cjs` is already `.cjs`; import it with `createRequire`.
- **Resolve paths against `import.meta.url`/`__dirname`, never `process.cwd()`.**
- **Never `process.exit()` after writing output** — it discards queued stdout on a pipe. Use `process.exitCode`.
- **Set `process.exitCode = 1` on entry**, clear it only when a verdict is reached. A promise that never settles exits 0.
- **Unknown flags must be REJECTED, not dropped**, and **a valued flag whose value is missing or begins with `--` must be rejected too**. Follow `translate-blocks.mjs` (exit 2, `Unknown argument`), not `tools/lib/parseArgs.js` (silent drop).
- **`--dry-run` must spawn `translate-blocks.mjs` ZERO times.** Not "spawn it with `--dry-run`".
- **Nothing writes under `books/` until the sidecar step — and the sidecar step happens the moment money is spent.**
- **Never read or write `books/*/01-source/` for artwork.** The artwork lives outside the repo via gitignored `sources.local.json`.
- Run `npm test` from the repo root. `grep` here is ugrep and committed files hold NUL bytes — **pass `-a`**.
- 🔴 **NO TEST SUITE MAY CONSIST ONLY OF REFUSALS.** Every suite needs at least one case that fails if the thing does not actually work. This is §C137's D11 and it was committed by the author of this rule.

**Exact shapes, copied from the tree — verified 2026-09-06:**

```jsonc
// experiments/…/out/blocks.json — an ARRAY
[{ "key": "Boiling|point|of water", "english": "Boiling point of water",
   "lines": ["Boiling","point","of water"], "arc": false, "send": true }]

// experiments/…/out/translations-api.json
// ⚠️ an ARC block's value is a BARE STRING, not an array
{ "_source": "Málstaður /v1/translate, no glossary",
  "blocks": { "Boiling|point|of water": ["Suðumark vatns"], "Next ...": "Næst ..." } }

// books/<slug>/figure-text/<basename>.is.json — blocks is {k: v}, and there is NO `state` key
{ "version": 1, "basename": "CNX_Chem_01_01_SciMethod",
  "renderHash": "<computeRenderHash(blocks, COMPOSER_VERSION)>", "composerVersion": "1",
  "blocks": { "Observation and curiosity": "Athugun og forvitni" } }
```

`tools/lib/figure-text-sidecar.cjs` exports `SIDECAR_VERSION`, `COMPOSER_VERSION` (`'1'`), `sidecarPath`, `readSidecar`, `writeSidecar`, `computeRenderHash`, `editorialState`, `effectiveState`. **`bookDir` is `books/<slug>`, not `books/`.**
🔴 **`writeSidecar` MINTS FREELY** — `mkdirSync` + atomic tmp/rename, no existence check. *(The old spec said both callers refuse on a missing file; that is true of the CALLERS' gates, not the writer.)*
🔴 **`publish-figure-svg.js` stamps `composedHash` iff `sidecar.renderHash` is truthy — `state` is irrelevant to it.** That is why the minted sidecar carries `renderHash` and no `state`.

---

## File Structure

| file | responsibility |
|---|---|
| `experiments/…/read_layer_accept.py` | **new** — the acceptance harness, with a proven-red `--selftest` (R1) |
| `experiments/…/readlayer.py` | **new** — the pdfplumber adapter; `extract.py` delegates to it and keeps its CLI (R2) |
| `experiments/…/strip-text.py` | **modify** — descend into `/Form` XObjects (R3) |
| `experiments/…/figtext.py`, `sources.py`, `emit-blocks.py`, `census.py` | **repair** — Task R4 (P3, P6, P8) |
| `experiments/…/extract.py`, `pdftext.py` | 🔴 **REPLACED as the read layer** — `pdftext.parse` survives only as the harness's baseline arm |
| `experiments/…/fixtures/fixture_figure.pdf` + `make_fixture.py` | **new** — the positive control |
| `experiments/…/translate-blocks.mjs` | **modify** — `--out` (Task 0b), invert gate 1 (Task 5) |
| `tools/lib/figure-outcomes.js` | **new** — outcome enum, safe tally, exit verdict. Pure. |
| `experiments/…/figure-prepare.py` | **new** — artwork → blocks + svg + `prepare.json`, into `--out` |
| `tools/lib/figure-classify.js` | **new** — classify one figure from prepare's output |
| `experiments/…/figure-compose.py` | **new** — compose with a machine-readable verdict |
| `tools/lib/figure-enumerate.cjs` | **new** — the enumeration predicate, shared with the server |
| `tools/figure-run.js` | **new** — the driver |

---

## 🔴 THE READ-LAYER REPLACEMENT — Tasks R1–R5, and they come FIRST

Added 2026-09-06 evening, after [USER] ruled the read layer **replaced, not repaired**
(→ [`docs/decisions/2026-09-06-figure-read-layer-respec.md`](../../decisions/2026-09-06-figure-read-layer-respec.md)),
against the written contract
(→ [`docs/superpowers/specs/2026-09-06-figure-read-layer-contract.md`](../specs/2026-09-06-figure-read-layer-contract.md)).

**Tasks 1–6b are gated on these.** Task 0 survives only as its non-read-side repairs, which are
Task R4 below; **Task 0's own section is kept as evidence, and its banner table says which of
its steps still stand.** Where Task 0 and R1–R5 disagree, **R1–R5 win.**

🔴 **THE ORDER IS DELIBERATE AND THE FIRST TASK SHIPS NO READER.** The harness is built and
proven able to go RED before a candidate exists, because a harness written after the thing it
judges gets tuned until it agrees.

**Measured, before any of this was written — do not re-derive:**

| fact | measurement |
|---|---|
| the mechanism of the 274-figure miss | on 40 `form-text-only` figures the page `/Font` dict is empty **40 of 40**, while **380 of 386** `/Form` XObjects carry one. `extract.py` reads `page.Resources.Font` and the page stream, so it sees nothing. **Not a parse failure — a scope failure** |
| resource key as a join key is safe here | **0 of 40** figures have one key mapping to two BaseFonts; only two key names exist (`/T1_0`, `/TT0`). Positive control: 380 form font dicts. **So detect a conflict loudly; do not design around one** |
| pdfplumber descends into forms | 19 chars on `CNX_Chem_02_00_Biomarkers`, where the baseline reads **0** |
| `x`/`y` must come from the matrix | same figure, first char: `matrix[5] = 56.6582` vs `y0 = 53.9312` — **2.727 pt**, the descender |
| coverage | baseline **504** of 779 text-bearing; pdfplumber **779**, with **0** real regressions on the measured `.pdf` set and **0** real character losses across all 280 EPS |

### Task R1: The acceptance harness — built FIRST, and proven able to go RED

🔴 **THIS TASK SHIPS NO READER. It ships the instrument that judges one.** Building the
reader first and the harness afterwards is how a harness gets tuned until it agrees with
whatever was built — the failure this campaign has already paid for twice.

**Files:**
- Create: `experiments/figure-text-translation/read_layer_accept.py`
- Read only: `text-coverage-efnafraedi-2e.json`, `sources.py`, `pdftext.py`, `_deps.py`

**The population is the committed census, never a fresh crawl.** Load
`text-coverage-efnafraedi-2e.json` (1,148 rows) and take the four text-bearing buckets:
`page-text` (496), `form-text-only` (274), `type0-unreadable` (8), `text-but-unexplained` (1)
= **779**. `photo` (71), `textless` (7), `unresolved` (253) and `ours-crashes` (38) are out.
⚠️ **State the denominator in every line of output.** Two censuses in this campaign already
disagreed because they resolved different populations.

- [ ] **Step 1: Two reader entry points behind one interface.**

```python
def read_baseline(pdf_path) -> (runs, meta)   # today's extract.py path: pikepdf + pdftext.parse
def read_candidate(pdf_path) -> (runs, meta)  # imports readlayer.py if it exists, else raises
```

⚠️ **`read_baseline` MUST build `widths` in `extract.py`'s shape** — `{fontkey: {charcode:
width/1000}}`, keyed `'/' + name.lstrip('/')`. `read-layer-bakeoff.py` builds a *different*
shape (`{'first':…, 'w':[…]}`), which `pdftext.parse`'s `w.get(ord(ch), 0.5)` silently misses,
so every advance falls back to the 0.5 default. That did not matter for a word count; **it
makes `adv` meaningless, and `adv` is criterion 4.** Copy `extract.py`'s loop, do not copy the
bake-off's.

- [ ] **Step 2: EPS staging, shared by both readers.** `.eps`/`.ai` → `gs -q -dNOPAUSE -dBATCH
  -dSAFER -dEPSCrop -sDEVICE=pdfwrite -sOutputFile=<tmp>.pdf <src>`, 120 s timeout. **Both
  readers must get the SAME converted bytes** — convert once per figure, hand the same path to
  both. Converting twice makes any `gs` nondeterminism read as a reader difference.

- [ ] **Step 3: The four criteria.**

| # | criterion | the rule, and the trap |
|---|---|---|
| **C1** | **Regression control** — on figures the baseline reads, the candidate must lose no text | 🔴 **COMPARE CHARACTER MULTISETS** (`collections.Counter` over all run text, whitespace stripped), **NEVER word counts.** A word-count comparison across readers that segment differently produced **155 false regressions** of which **0** were real. Report `missing = baseline_counter - candidate_counter`; a figure is a regression iff that is non-empty |
| **C2** | **Positive control** — on figures the baseline reads as empty, the candidate must return non-empty runs | this is the 274+8+1 set. **Report it as a COUNT OF FIGURES GAINED, and name the ones still empty** |
| **C3** | **Oracle agreement** — `pdftotext -q <pdf> -` (poppler, independently implemented) | disagreement about *whether a figure has text at all* is a finding. **Not a character diff** — poppler normalises differently |
| **C4** | **Field conformance** — on figures BOTH read, the nine fields agree | `font` compared **as a join key** (does it resolve in `meta.fonts`?), not as a string equal to the baseline's. `x`/`y` compared **as baseline origins**, tolerance 0.01 pt. `adv` tolerance **2%**, and report the distribution, not just pass/fail |

🔴 **AND ONE CRITERION THE CONTRACT DOES NOT NAME, WHICH IS THE ONE THAT COSTS MONEY:**

| **C4b** | **BLOCK-KEY conformance** | Runs are an intermediate; **the block key is what is bought, what keys the sidecar, and what the editor sees.** For every figure both read, derive blocks with `figtext.merge_blocks(figtext.group(runs))` and the emit-side key rule, and compare the **key SETS**. Report set equality, plus added/dropped keys. ⚠️ **A field-by-field pass with different block keys is a failure**, because `figtext.group`'s adjacency test amplifies small `adv` errors into different cuts |

- [ ] **Step 4: 🔴 PROVE THE HARNESS CAN FAIL — `--selftest`, and it is not optional.**

A harness that has never been red proves nothing. `--selftest` runs three assertions and exits
non-zero if any fails:

1. **Plumbing** — baseline vs baseline over a 40-figure sample of `page-text`: C1 regressions
   **0**, C4 mismatches **0**, C4b block-key set differences **0**. *(If this is not clean, the
   comparator is broken, not the reader.)*
2. **Sensitivity** — inject a mutant reader that drops the last run of every figure; C1 must
   report a **non-zero** regression count on that same sample. *(A comparator that cannot see a
   deleted run cannot see a lost one.)*
3. **The positive-control set is genuinely failing today** — over a 40-figure sample of
   `form-text-only`, the BASELINE must read **0** figures. If it reads any, the census bucket
   and the reader disagree and the whole population is suspect.

⚠️ **Assertion 2 is the one that will be skipped.** Without it C1 is a null with no control,
and this repo's own rule is that a null without a positive control is not an answer.

- [ ] **Step 5: Output.** `--json <path>` writes per-figure rows; stdout prints a summary with
  the denominator on every line. **Never `process.exit`-equivalent after writing** — this is
  Python, so `sys.exit(code)` after the write is fine, but flush first.

- [ ] **Step 6: Run `--selftest` and paste the output into the report.** Then run the full
  baseline-vs-baseline pass over all 779 and record the wall-clock; the candidate run must fit
  the same budget.

- [ ] **Step 7: Commit.** `test(M5 R1): the read-layer acceptance harness, with a proven-red selftest`

---

### Task R2: `readlayer.py` — the pdfplumber adapter

**Files:**
- Create: `experiments/figure-text-translation/readlayer.py`
- Modify: `experiments/figure-text-translation/extract.py` (delegate to it; keep the CLI)
- Test: `experiments/figure-text-translation/test_readlayer.py`

**The seam is unchanged and that is the whole point:** `extract.py <artwork>` still writes
`out/runs.json` + `out/meta.json` and still prints the same lines. `emit-blocks.py` already
spawns it as a subprocess, so **nothing downstream changes and the library-vs-subprocess
question in the contract is answered by keeping the existing boundary.**

- [ ] **Step 1: Read `compose.py` lines 45–70 and `figtext.py` before writing.** They are the
  consumers; the contract describes them but they are the authority.

- [ ] **Step 2: Write the failing tests** (`test_readlayer.py`, plain-assert style like
  `test_sources.py` — this experiment does not use pytest). **At least one test must fail if
  the reader does not actually work** — a suite of refusals is forbidden (§C137 D11).

Cases:
1. **A `form-text-only` figure returns non-empty runs.** `CNX_Chem_02_00_Biomarkers` — measured
   19 chars via pdfplumber, **0 runs** via the baseline.
2. **`font` resolves as a join key**: every `run['font']` is a key of `meta['fonts']`.
3. **`x`/`y` are baseline origins**: for a known char, `y != y0`. Measured on
   `CNX_Chem_02_00_Biomarkers`'s first char: `matrix[5] = 56.6582`, `y0 = 53.9312` — a 2.727 pt
   descender. **Asserting `y == y0` would pass on the wrong value.**
4. **`fill` is a 5-tuple `compose.cmyk()` can unpack** — `_, c, m, y, k = f`. Assert
   `len(fill) == 5 and fill[0] == 'cmyk'` for every non-null fill.
5. **A `/Type0` figure reports `decodable: false`** and none of its runs is `send:true`.
   Population: the 8 `type0-unreadable` figures, e.g. `CNX_Chem_01_02_decomp`.
6. **A textless figure returns `[]`, does not raise** (H8).
7. **`meta['source']` basename is the ORIGINAL artwork's**, for an `.eps` input.

- [ ] **Step 3: Run and watch them fail.**

- [ ] **Step 4: Implement.** The nine fields, and the traps that fail silently:

| field | derivation | the trap |
|---|---|---|
| `text` | join of the run's chars | pdfminer already unescapes and maps encodings — **do not re-apply `winansi()`** |
| `font` | 🔴 **the RESOURCE KEY**, via a BaseFont→key map built with **pikepdf** over the page `/Resources/Font` **and every `/Form` XObject's own**, recursively | pdfplumber gives `fontname` = the **BaseFont**, with **no leading slash**; pikepdf's `/BaseFont` has one. Normalise both sides or every join misses and **every bold label silently renders regular** |
| `size` | `hypot(m[0], m[1])` of `char['matrix']` | **verify against `char['size']` across the corpus and report the disagreement rate.** The contract defines it as the Tf operand × matrix scale; if pdfminer folds the size into the matrix these coincide, and if it does not, they do not. **Do not assume — measure and record which you used** |
| `rot` | `degrees(atan2(m[1], m[0]))` | — |
| `x`,`y` | `char['matrix'][4]`, `[5]` | 🔴 **NOT `x0`/`y0`** — those are bbox corners. Measured 2.727 pt apart |
| `adv` | 🔴 **derive from POSITIONS**: project (last char origin − first char origin) onto the baseline unit vector, plus the last char's own advance | **NEVER `sum(char['adv'])`** — pdfminer's per-char `adv` excludes `Tc`, `Tw` and `TJ` kerning, which move the line matrix rather than the glyph. An `adv` off by a constant factor silently **changes where blocks are CUT**, i.e. what gets bought |
| `fill` | normalise EVERY colour space to `('cmyk', c, m, y, k)` | `compose.cmyk()` does `_, c, m, y, k = f` and **raises on any other arity**. DeviceRGB → `(1-r, 1-g, 1-b, 0)`-style conversion, DeviceGray → `(0,0,0,1-g)`. This is **H6** — the baseline records `k` only. **A 2-component space (H7) must be RECORDED, never silently dropped**: emit a null fill and count it in `meta` |
| `tm` | `list(char['matrix'])` | — |

**Run aggregation — pdfplumber gives CHARS, not runs.** Start a new run when fontname, size
(±0.2) or rotation (±3°) changes, or when the next char's origin is not baseline-adjacent to
the previous one's advance. 🔴 **The success criterion is NOT "the same runs as the baseline" —
it is the same BLOCK KEYS after `figtext.group` + `merge_blocks` (harness C4b).** Tune
aggregation against that, not against run counts.

**Open with `laparams=None`** (pdfplumber's default). **Any `LAParams` triggers layout analysis
and reorders chars into textboxes**, silently destroying content-stream order — which
`figtext.group` depends on, since it walks `zip(runs, runs[1:])`.

**Font conflict = a loud refusal, not a silent pick.** Build the BaseFont→resource-key map over
page + all forms. If one resource key maps to two different BaseFonts within one figure, record
`fontKeyConflict: [...]` in `meta` and **name it on stderr**. ✅ **Measured base rate: 0 of 40
figures, with 380 of 386 form XObjects carrying a `/Font` resource as the positive control, and
only two key names (`/T1_0`, `/TT0`) in play corpus-wide.** So this refusal should never fire —
**if it fires, that is news, which is exactly why it must not be silent.**

⚠️ **`meta.fonts[*].last` is UNDEFINED for a `/Type0` font** — CID fonts carry `/W`, not
`/FirstChar`/`/LastChar`. **Do not fake a value and do not crash.** The subset signal is the
standard `ABCDEF+` prefix on the BaseFont; use it, and emit `last: null`. ⚠️ `extract.py`'s
subset warning tests `d['last'] < 200`, so **it must be updated to tolerate `None`** or it
raises on the first Type0 figure.

**H2's positive signal exists and must be used:** pdfminer emits the literal substring `(cid:`
for an undecodable CID. A font whose text contains it gets `decodable: false` in `meta.fonts`,
and **its runs are never eligible for `send:true`.** This is what stops control-byte garbage
reaching the paid MT.

**EPS/AI:** stage via `gs` (as R1 Step 2). 🔴 **`meta['source']` MUST be the ORIGINAL artwork
path**, never the converted temp file — the publisher cross-checks
`basenameFromMeta(meta.json)` against the sidecar key, and a mismatch is refused **after
payment**, on every run, for ever.

- [ ] **Step 5: Run the tests, then the harness.** `python3 read_layer_accept.py --selftest`
  must still pass, then the full run. **Record C1, C2, C3, C4, C4b with denominators.**

- [ ] **Step 6: Commit.** `feat(M5 R2): replace the figure read layer with a pdfplumber adapter`

---

### Task R3: `strip-text.py` must descend into `/Form` XObjects

🔴 **WITHOUT THIS, R2 MAKES THINGS WORSE, NOT BETTER.** `strip-text.py` does
`re.sub(r'BT.*?ET', '', content)` on the **page** stream only. Once R2 can read the 274
form-text figures, their English is extracted, translated and composed — while the original
English **survives inside the form and is drawn underneath**. Measured shape: 14 English words
in, 14 English words still on the artwork.

**pdfplumber cannot do this** — it reads, it does not write. **Stay on pikepdf.**

**Files:** Modify `experiments/figure-text-translation/strip-text.py`; test in `test_readlayer.py`.

- [ ] **Step 1: Write the failing test.** On `CNX_Chem_02_00_Biomarkers` (or another
  `form-text-only` figure), assert that after stripping, **no reachable stream contains a `BT`
  token** — page stream *and* every `/Form` XObject's, recursively. Positive control in the
  same test: assert the figure had **> 0** `BT` blocks before stripping, or the assertion
  passes on a figure that never had any.

- [ ] **Step 2: Implement.** Walk `/Resources/XObject`; for each with `/Subtype /Form`, read its
  stream, `re.sub(r'BT.*?ET', '', …, flags=re.S)`, write it back with `pdf.make_stream`, and
  **recurse into that form's own `/Resources/XObject`**.

⚠️ **A form object can be referenced from more than one place.** Rewrite each *object* once —
key on `pikepdf.Object.objgen` — or a shared form is processed twice and the second pass
operates on already-stripped bytes (harmless) while a **cycle** hangs (not harmless). **Guard
with a visited set.**

⚠️ **Depth is measured, not assumed** — report the maximum nesting depth found across the
`form-text-only` population in the task report.

- [ ] **Step 3: Run the test, then re-run `read_layer_accept.py --selftest`.**

- [ ] **Step 4: Commit.** `fix(M5 R3): strip text inside /Form XObjects, not just the page stream`

---

### Task R4: The Task-0 repairs that SURVIVE the respec (batch — one dispatch)

These are independent of the reader and each is a small edit. **Do them as one batch.**

| # | file | change |
|---|---|---|
| **P3** | `figtext.py` | `if not runs: return []` in `group()`; `if not blocks: return []` in `merge_blocks()`. Both index `[0]` unguarded today |
| **P6** | `sources.py` | a configured-but-absent tree root **REFUSES** rather than falling through to the next tree. Add the case to `test_sources.py`, **with a positive control**: with all roots present, resolution still succeeds |
| **P8** | `emit-blocks.py`, `compose.py`, `census.py` | 🔴 **DELETE the blank-run filter from `emit-blocks.py`; DO NOT add one to `compose.py`.** Then put the key derivation in **ONE function both import** — `census.py` is a THIRD consumer holding the emit-side view and must move too, or its counts match neither |

🔴 **P8's ruling is by measurement, and a one-figure check gives the WRONG answer.** Deleting
emit's filter leaves `compose.py` byte-identical and the composed image **0 pixels** different,
and costs **194 characters / 1.94 ISK** corpus-wide. Adding compose's filter moves block
boundaries on **32 of 393** figures and corrupts the `--control` oracle. `SciMethod` shows no
movement because all 3 of its blank runs are in *arc* blocks; **188 of 243 corpus-wide are not.**

⚠️ **If a blank filter is ever wanted again, its predicate must be `text == ''`, NEVER
`not text.strip()`** — a font declaring `/Differences [31, /uni03B1]` makes `\x1f` an alpha, and
`'\x1f'.isspace()` is `True`, so the Greek letter is deleted and the label splits around it.

- [ ] **Commit.** `fix(M5 R4): the Task-0 repairs the read-layer respec leaves standing`

---

### Task R5: Run acceptance for real, close criterion 5, and land the licence

- [ ] **Step 1: Full acceptance run** over all 779, candidate vs baseline. Write
  `experiments/figure-text-translation/READ-LAYER-ACCEPTANCE.md` — a committed, banner-dated
  evidence artefact carrying C1–C4b **with denominators**, the wall-clock, and every figure
  still empty after the swap, **named**.

- [ ] **Step 2: 🔴 Criterion 5 — the round trip, which is the only check that sees the whole
  chain.** On at least one `page-text` figure (`CNX_Chem_01_01_SciMethod`) **and at least one
  `form-text-only` figure: `extract → strip-text → compose --control → check.py`.

🔴 **DO NOT GATE ON `check.py`'s PERCENTAGE.** Its own header warns *"Read the overlay, not the
percentage. Antialiasing between two rasterisers swamps layout error"* — **fixing four real
placement bugs moved the scalar 3.00% → 2.70% while the overlay changed completely.** Compare
`ITEMS` (the drawn string plus its x/y/size/rot) run-for-run, which is exact, and keep the
overlay image as evidence.

▶ **The `form-text-only` figure is the one that matters**: it is the only check that can show
English surviving *under* the composed text, which is R3's failure mode and which C1–C4b
structurally cannot see.

- [ ] **Step 3: The licence.** ✅ **[USER] RULED 2026-09-06: `experiments/` is MIT, same as
  `tools/` and `scripts/`.** Add it to the root `LICENSE`'s path table. Rationale to record:
  `tools/figure-run.js` is MIT and spawns this tree, so anything else creates a new
  MIT→copyleft edge beside known gap E-2. ⚠️ **Nothing third-party is vendored** — `pylibs/` is
  gitignored — so the repo distributes no dependency code; the ruling is about *our* code.
  For the record: pdfplumber **MIT** (new), pikepdf **MPL-2.0** and pycairo
  **LGPL-2.1-only OR MPL-1.1** (both already used by the KEPT layer), all import-only.

- [ ] **Step 4: The CI sentence.** State in the evidence artefact, in writing: **the Python
  suite is NOT a CI gate — no workflow runs Python.** Name the hand-run commands and their
  expected output. *(Without this sentence a green CI reads as evidence the Python side passed.)*

- [ ] **Step 5: Root `npm test`** — it must be unaffected; this branch touches no JS on the
  tested paths. Run it from the repo root and record the result. ⚠️ **Never `npm test | tail`**
  — the pipe's exit code masks a red suite.

- [ ] **Step 6: Commit.** `docs(M5 R5): read-layer acceptance evidence, and experiments/ is MIT`

---

### Task 0: Repair the Python chain so it can process real artwork

> 🔴 **HALF OF THIS TASK IS SUPERSEDED. READ THIS BEFORE EXECUTING ANY STEP.**
> [USER] 2026-09-06 (later the same day) → [`docs/decisions/2026-09-06-figure-read-layer-respec.md`](../../decisions/2026-09-06-figure-read-layer-respec.md):
> **the READ layer is REPLACED with an off-the-shelf reader, not repaired.**
>
> | step | verdict |
> |---|---|
> | **P1, P2** (`extract.py`) | 🔴 **DO NOT IMPLEMENT** — that file is being replaced. P2's *requirement* — an unreadable font must be REPORTED, never silently skipped — survives as contract **H2** |
> | **P3** (`figtext.py`) | ✅ **IMPLEMENT** — `figtext.py` is the LAYOUT layer, which is kept |
> | **P4** (`emit-blocks.py`) | ⚠️ **DEFER** — it orchestrates the reader; its shape depends on the adapter |
> | **P5** (EPS → PDF via `gs`) | ✅ **IMPLEMENT** — the adapter needs it too; 0 failures measured over 280 figures |
> | **P6** (`sources.py`) | ✅ **IMPLEMENT** — resolution, not reading |
> | **P8** (block-key derivation) | ✅ **IMPLEMENT** — emit and compose must agree whoever reads |
> | **P9** (`/Form` descent) | 🔴 **FORECLOSED** — the adopted reader already does it |
> | **Step 6b** (produce the census) | ✅ **DONE** — committed as `TEXT-COVERAGE.md`; do not re-run as a task |
> | **Step 6c** (the P9 spike) | ✅ **DISCHARGED** — the census and bake-off ARE the measurement R10 asked for, and the answer was *adopt, do not hand-write* |

🔴 **Without this, every later task is tested against something that cannot run.** A throwaway-copy proof took ch04 from **6 translated + 23 crashes** to **13 translated + 16 copied + 0 crashes**, with no regression in the 6 that already worked.

**Files:**
- Modify: `experiments/figure-text-translation/extract.py`, `figtext.py`, `emit-blocks.py`, `sources.py`, `census.py`
- Create: `experiments/figure-text-translation/fixtures/make_fixture.py`, `fixtures/fixture_figure.pdf`
- Test: `experiments/figure-text-translation/test_figure_chain.py`

- [ ] **Step 1: Read before you write.** Open `extract.py`, `figtext.py`, `emit-blocks.py`, `sources.py`. Confirm each defect below **exists at HEAD** before changing it — a plan's premise is a hypothesis, and this plan has already had several falsified.

- [ ] **Step 2: Write the failing test** — `test_figure_chain.py`, plain-assert style like `test_sources.py` (this experiment does not use pytest).

Cases, each of which must FAIL now:
1. **A text-less vector returns zero blocks, does not raise.** Build a PDF with a stroke and no `BT…ET`; assert `emit-blocks` exits 0 and `blocks.json` is `[]`.
2. **A page with no `/Font` resource does not raise.**
3. 🔴 **A `/Type0` font is REPORTED, not merely skipped.** *(The old wording — "skipped, not fatal" — is a test that passes on the failure.)* Skipping suppresses the crash while the font's text still becomes garbage runs, is held back as verbatim, and the figure reads as partly textless. **Measured on `PerTable2`: six Type0 category labels ERASED from the composed figure** — control `Group=1 Actinides=1`, defect `Noble=0 Halogens=0 Pnictogens=0` — exit 0, verdict ok, no review row, because block keys exist only for extracted blocks. The fixture gains a Type0 font with one hex-string `Tj`, and the assertion is that a **warning names it**.
4. 🔴 **TEXT INSIDE A `/Form` XObject IS FOUND, AND STRIPPED.** Build a PDF whose only `BT…ET` sits inside a `/Form` XObject invoked by `Do`; assert emit-blocks finds it AND strip-text removes it from `artwork.svg`. **Without this the positive control tests values, not coverage** — and coverage is where the corpus actually fails.
4. **`emit-blocks.py` works from a foreign cwd.** Run it with `cwd=` a tempdir. *(Today it spawns `'extract.py'` cwd-relative and dies.)*
5. **`emit-blocks.py` does not swallow the child's stderr** — assert the subset-font warning is observable.
6. **`sources.py` REFUSES when a configured tree root is absent from disk**, rather than falling through to the next tree. Positive control: with all roots present, resolution still succeeds.
7. 🔴 **The emit-side and compose-side block keys are IDENTICAL for the fixture.** Derive both and assert set equality. *(This is P8 and it is the one that costs money.)*

- [ ] **Step 3: Run and watch them fail.** `cd experiments/figure-text-translation && python3 test_figure_chain.py`

- [ ] **Step 4: Implement**

| # | change |
|---|---|
| P1 | `extract.py` — read `/Resources`→`/Font` defensively, defaulting to `{}`, instead of `page.Resources.Font` |
| P2 | `extract.py` — do not let a `/Type0` font raise, but **RECORD IT**: `fonts[key] = {subtype, skipped: true}` in `meta.json`, and Task 2's warning derivation emits `unreadable font <name> (/Type0): N text-showing ops not extracted`, counting `Tj/TJ/'/"` executed under a font absent from `widths`. **A bare `continue` is a silent erasure** — see Step 2 case 3 |
| P3 | `figtext.py` — `if not runs: return []` in `group()`, `if not blocks: return []` in `merge_blocks()` |
| P4 | `emit-blocks.py` — spawn `str(HERE / 'extract.py')`, and stop discarding the child's stderr |
| P6 | `sources.py` — a configured-but-absent tree root REFUSES (or `load_trees` preflights every root in `editionPrecedence`); add the case to `test_sources.py` |
| P8 | **delete the blank-run filter from `emit-blocks.py`** — see the ruling below |

🔴 **P8 IS DECIDED BY MEASUREMENT. DELETE THE FILTER FROM `emit-blocks.py`; DO NOT ADD ONE TO `compose.py`.** Two independent figures, both arms, with per-glyph controls:
- Deleting emit's filter leaves `compose.py` **byte-identical**, the composed image **0 pixels** different, and strictly improves the paid wire — `"not consistent with"` instead of `"notconsistentwith"`, and it stops buying the untranslatable fragment `"addition of"` as a block. Corpus cost: **194 characters, 1.94 ISK.**
- Adding compose's filter moves block boundaries on **32 of 393** figures: one label splits into three, two of which flip `left`→`center` alignment; a length-realistic Icelandic map produces **overlapping text**; and it corrupts the `--control` oracle image.
- ⚠️ **A one-figure measurement gives the WRONG answer here.** `SciMethod` shows no boundary movement because all 3 of its blank runs sit in *arc* blocks, whose predicate is pure Euclidean distance. **188 of 243 blank-bearing blocks corpus-wide are non-arc.**
- ▶ **Then make it unrepeatable: put the key derivation in ONE function both scripts import.** ⚠️ **`census.py` is a THIRD consumer holding the emit-side view — move it too, or its counts will match neither script.**
- ⚠️ **If a filter is ever wanted again, the predicate must be `text == ''`, NEVER `not text.strip()`** — see the alpha item below.

🔴 **P9 — TEXT INSIDE A `/Form` XObject IS INVISIBLE, AND P3 IS WHAT MAKES IT SILENT. THIS IS THE LARGEST FINDING IN THREE REVIEW ROUNDS.** Measured directly:

| figure | page `/Font` | page stream has `BT` | Form XObjects | forms containing `BT` |
|---|---|---|---|---|
| `CNX_Chem_04_04_limiting` | **empty** | **no** | 4 | **4** |
| `CNX_Chem_04_03_etheneBr_img` | **empty** | **no** | 17 | **17** |
| `CNX_Chem_01_01_SciMethod` | `/TT0 /TT1` | **yes** | 0 | 0 |

▶ **THE LAST ROW IS THE POINT: `SciMethod` IS THE FIGURE THE WHOLE EXPERIMENT WAS DEVELOPED AGAINST, AND IT IS THE ATYPICAL ONE.** **274 of 895** resolution-winning chemistry vectors keep all their text inside Form XObjects — **8 of ch04's 23**. At HEAD they CRASH. With P1–P3 applied and nothing else, `CNX_Chem_04_04_limiting` (14 English words) yields `blocks: 0`, exit 0 → `copied-textless` → **English shipped, no sidecar, no review row, verdict `{ok:true}`.** Fixing the extractor alone is worse: 14 English words survive `strip-text` and sit *under* the composed Icelandic.

**P9 has two halves, and BOTH are needed:**
- **Read:** `extract.py` / `pdftext.parse` descend recursively into `/Form` XObjects, using each form's own `/Resources/Font` and its `/Matrix` composed with the CTM at the `Do` site.
- **Strip:** `strip-text.py` removes `BT…ET` inside every reachable form, not just the page stream. ⚠️ **`census.py` is blind in the same way and must move with them.**

⚠️ **IF P9 IS DESCOPED, THE FIGURES MUST STILL BE NAMED — NEVER BUCKETED `copied-*`.** `figure-prepare.py` reports `formTextXObjects` (a POSITIVE count of reachable forms whose stream contains `BT`), and `sendable == 0 && formTextXObjects > 0` becomes the **`unreadable-text`** outcome: counted, every figure NAMED in the summary, a NOTE in the verdict, **not fatal** — R9's shape, because a `failed-prepare` bucket would make ch04 exit 1 on 8 of 30 for as long as the extractor cannot read forms, which is the always-red exit code this design rejects.
🔴 **THE GENERAL RULE, AND IT IS THE ONE TO CARRY: "NO BLOCKS" MUST NEVER BE INFERRED FROM AN ABSENCE.** A count of zero and an inability to count are different facts, and only a positive signal tells them apart.

🔴 **P5 — EPS IS NOT AN EDGE CASE; IT IS THE CORRECT ARTWORK.** The precedence-winning tree is **EPS-only for some chapters**, so the figures `pikepdf` cannot open are exactly the ones we are supposed to use. Convert first, in `figure-prepare.py` (Task 2):

```bash
gs -q -dNOPAUSE -dBATCH -dSAFER -dEPSCrop -sDEVICE=pdfwrite -sOutputFile=<out>/artwork-src.pdf <src>
```

gs 10.06.0 is installed; **7 of 7 real ch04 EPS convert in ~0.23 s each.**

- [ ] **Step 5: Commit the fixture.** `fixtures/make_fixture.py` regenerates `fixture_figure.pdf` byte-for-byte using **the standard library only** (raw PDF bytes, ~50 lines). A working generator is at `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/a14335b8-192d-4c29-9cc6-d2a67f9048b6/scratchpad/m5-verify/make_fixture.py`.

The fixture MUST contain, or the positive control is not a control:
- `/Resources /Font` with **explicit `/FirstChar` `/LastChar` `/Widths`** — reportlab supplies none in either path and `extract.py` dies with `AttributeError: /FirstChar`, so **the obvious recipe does not work**
- a `BT … /F1 n Tf … Tm … (text) Tj … ET` block
- one `TJ` array (the kerning branch) and one rotated `Tm` (the rot branch)
- one verbatim block such as `"100"`, so `looks_verbatim` holds it back and **`sendable != blocks`**
- a vector stroke **outside** `BT…ET`, so `strip-text.py`'s `re.sub(r'BT.*?ET','')` leaves artwork and `artwork.svg` is non-empty
- `/LastChar < 200`, so the subset warning fires

Measured end to end on this fixture: **4 blocks, 3 sendable, `artwork.svg` 397 bytes with the stroke intact.**

- [ ] **Step 6: Run and watch them pass.** Then the existing suites: `python3 test_sources.py && python3 test_figtext_normalise.py`.

- [ ] **Step 6b: PRODUCE THE FIVE-WAY CENSUS — this is the deliverable the rest of the plan waits on.**

🔴 **Every blocking finding in three review rounds has been about what the chain does on real artwork, and that is settled here, for free, with no API call.** Run the repaired chain over the resolution-winning artwork for chemistry and classify each figure into exactly one of:

| bucket | signal |
|---|---|
| **page-text** | page `/Font` present and the page stream carries `BT` |
| **form-text-only** | no page text; ≥1 reachable `/Form` XObject whose stream carries `BT` |
| **Type0-garbage** | text-showing ops executed under a font absent from `widths` |
| **genuinely textless** | no text-showing ops anywhere reachable |
| **photo** | image XObjects, no paint ops |

Write it to a committed artefact under `experiments/figure-text-translation/`. **Then fill in Task 6a Step 5's expected per-bucket tally from it**, and only then treat Tasks 1–6b as final.

⚠️ **The buckets must be counted per RESOLUTION-WINNING figure, and the denominator stated.** Two censuses in this campaign have already disagreed because one resolved vector-only and the other probed rasters too — that is a different population, not a different answer.

- [ ] **Step 6c: THE P9 SPIKE — timeboxed, and its OUTPUT IS A NUMBER, not a decision.**

🔴 **[USER] RULING 2026-09-06 (R10): M5 is committed neither TO Form XObject support nor AGAINST it. Measure the size, then decide.** Deferring is costly — under the one-pass-edit ruling an editor who meets English figures has no second pass — but committing to unknown work inside the biggest task, on a chain that has surprised three review rounds, is worse. **The census makes the choice cheap; make it there.**

**Timebox it.** Produce, in writing, either:
- **a working proof on ONE real form-text figure** — `CNX_Chem_04_04_limiting` (4 forms, all with `BT`) — showing its 14 English words **extracted AND stripped from `artwork.svg`**, plus an estimate of what the remaining work is; or
- **a statement of what blocks it**, naming the specific mechanism.

**What the spike must actually establish**, because these are the parts that make it more than a `Do` recursion:
1. does `pdftext.parse` compose the form's `/Matrix` with the CTM at the `Do` site correctly, so glyph positions land where the composer expects them?
2. does a form's own `/Resources/Font` reach the width table?
3. does `strip-text.py` remove `BT…ET` **inside** every reachable form — because extraction alone leaves the English *under* the Icelandic (measured 14 → 14)?
4. are forms nested, and how deep on the real corpus?

⚠️ **Do NOT let the spike quietly become the implementation.** If it runs long, that IS the answer: report the size and take the `unreadable-text` path, which is already designed, already honest, and already names every affected figure.

- [ ] **Step 7: Write the CI sentence.** Add to this task's section of the repo docs, in writing: **the Python suite is NOT a CI gate — no workflow runs Python.** Name the hand-run command and its expected output. **Adding Python to CI is out of scope.** *(Without this sentence, a green CI reads as evidence the Python side passed.)*

- [ ] **Step 8: Commit**

```bash
git add experiments/figure-text-translation/
git commit -m "fix(M5 Task 0): repair the figure chain — it crashed on 23 of 30 ch04 figures"
```

---

### Task 0b: `--out` on the paid stage, and a `.env` that may be absent

🔴 **Spec Invariant 1 is unimplementable without this.** `translate-blocks.mjs` has no `--out`, rejects unknown flags, and reads/writes four hardcoded `HERE/out/…` paths — so **every figure in a chapter would translate from whichever figure was extracted last.** The old spec asserted the flag existed; the old plan said "unchanged CLI". Neither threaded isolation into the only stage that costs money.

**Files:** Modify `experiments/figure-text-translation/translate-blocks.mjs` · Test `tools/__tests__/figure-mt-glossary.test.js` (exists — extend it)

**Interfaces:** `--out <dir>` added to `KNOWN_FLAGS`; all four `out/` paths resolve against it, defaulting to `path.join(HERE, 'out')` when absent.

- [ ] **Step 1: Read the tool.** Confirm at HEAD: `KNOWN_FLAGS` (~:49), the read of `out/blocks.json` (~:190), the unguarded `.env` read (~:196), the writes of `out/api-run.json` (~:245) and `out/translations-api.json` (~:259), and the `out/meta.json` read via `figureNameFrom` (~:248).

- [ ] **Step 2: Write the failing test.** Unit-level, no subprocess, no `.env`, no shared `out/` — matching the 12 existing tests in that file, which run in 29 ms and touch none of those. Build a fixture dir under `os.tmpdir()` holding `blocks.json` + `meta.json`; drive the tool with `--book efnafraedi-2e --out <fixture>` and a **stub client that records every `opts` it is handed**. Assert:
  1. the fixture dir received `api-run.json` and `translations-api.json`, **and the shared `experiments/…/out/` was not written** — compare its **full inventory and mtimes**, not one filename;
  2. `--dry-run` exits **0** in a tree with no `.env` and no shared `out/`.

Both fail today: (1) with `Unknown argument: --out`, exit 2; (2) with an uncaught `ENOENT`.

- [ ] **Step 3: Run and watch it fail.**

- [ ] **Step 4: Implement**
- Add `'--out'` to `KNOWN_FLAGS`; add its branch to `parseFigureArgs`; compute `const outDir = args.out ?? path.join(HERE, 'out')` and use it at the four call sites. `figureNameFrom` already takes a path — only its argument changes.
- Replace the unguarded `fs.readFileSync(path.join(REPO, '.env'))` with **`loadEnvFile`**, already imported from `tools/api-translate.js` in this file and already pinned by `api-translate.test.js` to return `{}` for a missing path.
- Add a **missing-value check** to `parseFigureArgs`, so `--book --dry-run` refuses instead of swallowing `--dry-run` as the book name.

⚠️ **Do NOT use an env var here, and do NOT try cwd-per-figure.** `FIGTEXT_OUT` is right for Python (one line in `_deps.py` reaches all five importers) but wrong for Node: an env var has **no refusal machinery**, so a misspelled `FIGTEXT_OUTT=` writes silently to the shared directory — the exact silent-no-op class this tool's own docstring exists to close, on the paid leg. And cwd-per-figure is **refuted by execution**: `HERE` derives from `import.meta.url`, so cwd changes nothing. **Mixed mechanisms are correct: `--out` to Node, `FIGTEXT_OUT=` to Python.**

- [ ] **Step 5: Run and watch it pass.** Confirm the 12 existing tests still pass — all three `parseFigureArgs` assertions use `toMatchObject`, and no test asserts `KNOWN_FLAGS`'s contents, so nothing should break.

- [ ] **Step 6: Commit**

```bash
git add experiments/figure-text-translation/translate-blocks.mjs tools/__tests__/figure-mt-glossary.test.js
git commit -m "feat(M5 Task 0b): --out on the paid figure stage — isolation reaches the money"
```

---

### Task 1: Outcome vocabulary, safe tally, and the exit verdict

Pure, no I/O. It fixes the vocabulary every later task uses.

**Files:** Create `tools/lib/figure-outcomes.js` · Test `tools/__tests__/figure-outcomes.test.js`

**Interfaces:** `CLASSIFICATION_OUTCOMES`, `PROCESS_OUTCOMES`, `ALL_OUTCOMES`; `emptyTally()`; **`tallyOutcome(tally, outcome)`** (throws on an outcome outside the vocabulary); **`verdict(tally, enumeratedCount)`** → `{ok, reasons}`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import {
  CLASSIFICATION_OUTCOMES, PROCESS_OUTCOMES, ALL_OUTCOMES, emptyTally, tallyOutcome, verdict,
} from '../lib/figure-outcomes.js';

describe('figure outcome vocabulary', () => {
  it('keeps classification and process outcomes disjoint', () => {
    expect(CLASSIFICATION_OUTCOMES.filter((o) => PROCESS_OUTCOMES.includes(o))).toEqual([]);
    expect(ALL_OUTCOMES.length).toBe(CLASSIFICATION_OUTCOMES.length + PROCESS_OUTCOMES.length);
  });

  it('emptyTally has a zero for every outcome and nothing else', () => {
    const t = emptyTally();
    expect(Object.keys(t).sort()).toEqual([...ALL_OUTCOMES].sort());
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
  });
});

// 🔴 N1. Measured on the old plan's `tally[record.outcome] += 1`: an out-of-vocabulary or
// undefined outcome MINTS A NEW KEY HOLDING NaN, so 5 figures with 2 mis-bucketed summed to 3
// and the verdict still returned {ok:true}, exit 0.
describe('tallyOutcome refuses to lose a figure', () => {
  it('counts a known outcome', () => {
    const t = emptyTally();
    tallyOutcome(t, 'translated');
    expect(t.translated).toBe(1);
  });

  it('THROWS on an outcome outside the vocabulary', () => {
    expect(() => tallyOutcome(emptyTally(), 'nearly-translated')).toThrow(/vocabulary/i);
  });

  it('THROWS on undefined rather than minting a NaN key', () => {
    expect(() => tallyOutcome(emptyTally(), undefined)).toThrow();
  });
});

describe('verdict', () => {
  const sum = (t) => Object.values(t).reduce((a, b) => a + b, 0);

  it('is ok when work happened and nothing needs a human', () => {
    const t = { ...emptyTally(), translated: 5, 'copied-photo': 2 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  it('is NOT ok when any figure failed', () => {
    const t = { ...emptyTally(), translated: 5, 'failed-compose': 1 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toContain('failed-compose');
  });

  // 🔴 R9, [USER] 2026-09-06. 253 of 1,148 chemistry figures (22%) — *(prose here said 170 before the census existed; `TEXT-COVERAGE.md` owns this number)* are unresolved in the
  // delivery TODAY, in every chapter. Failing on it made every run exit 1 by design.
  // 🔴 Same shape as unresolved: named, never fatal. If it failed the run, ch04 would exit 1
  // on 8 of 30 for as long as the extractor cannot read Form XObjects.
  it('is ok when figures are unreadable-text — but SAYS SO', () => {
    const t = { ...emptyTally(), translated: 5, 'unreadable-text': 8 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(true);
    expect(v.reasons.join(' ')).toMatch(/cannot read/i);
  });

  it('is ok when figures are unresolved — counted and named, never fatal', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 3 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  it('still REPORTS unresolved so the delivery hole stays visible', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 3 };
    expect(verdict(t, sum(t)).reasons.join(' ')).toMatch(/unresolved/);
  });

  // The spec's self-review caught this: a chapter of legitimate photographs translates zero
  // and is CORRECT. Failing it would train the operator to ignore the exit code.
  it('is ok when zero translated because nothing was translate-able', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'copied-textless': 3 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  it('is NOT ok when translate-able figures existed but none translated', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'failed-mt': 4 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/none .*translated|zero translated/i);
  });

  it('is ok on a run where everything was already current', () => {
    const t = { ...emptyTally(), 'skipped-current': 12 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  // 🔴 THE PARTITION IS CHECKED AT RUNTIME, NOT BY HAND AND NOT BY A SOURCE REGEX.
  it('is NOT ok when the tally does not sum to the figures enumerated', () => {
    const t = { ...emptyTally(), translated: 3 };
    const v = verdict(t, 5);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/partition|sum/i);
  });

  it('is ok when the tally sums exactly — the control for the case above', () => {
    const t = { ...emptyTally(), translated: 5 };
    expect(verdict(t, 5).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tools/__tests__/figure-outcomes.test.js` → cannot resolve the import.

- [ ] **Step 3: Implement**

```js
// tools/lib/figure-outcomes.js
/**
 * The closed outcome vocabulary for a figure run, and the run's exit verdict.
 *
 * Two disjoint groups. A figure lands in EXACTLY ONE bucket, which is what makes the
 * partition check meaningful: the tally must sum to the number of figures enumerated.
 */

/** What the figure IS. */
export const CLASSIFICATION_OUTCOMES = [
  'translated', 'copied-photo', 'copied-textless', 'unresolved',
  // 🔴 The figure HAS text; our extractor cannot read it — today because the text lives
  // inside a /Form XObject (274 of 895 chemistry vectors). NOT copied-*: a count of zero
  // and an inability to count are different facts. Non-fatal, like `unresolved` (R9), or
  // ch04 would exit 1 on 8 of 30 until P9 lands.
  'unreadable-text',
];

/** What HAPPENED to it. A translate-able figure that failed lands here, never in `translated`. */
export const PROCESS_OUTCOMES = [
  'failed-prepare', 'failed-mt', 'failed-compose', 'failed-publish', 'skipped-current',
];

export const ALL_OUTCOMES = [...CLASSIFICATION_OUTCOMES, ...PROCESS_OUTCOMES];

const FAILED = ['failed-prepare', 'failed-mt', 'failed-compose', 'failed-publish'];

export function emptyTally() {
  const t = {};
  for (const k of ALL_OUTCOMES) t[k] = 0;
  return t;
}

/**
 * 🔴 THE ONLY WAY A FIGURE MAY BE COUNTED. A bare `tally[outcome] += 1` mints a new key
 * holding NaN for an unknown or undefined outcome — the tally then stops summing to the
 * figure count and the run still reports ok. Refuse instead: a figure that falls out of
 * the partition is a figure nobody knows was missed.
 */
export function tallyOutcome(tally, outcome) {
  if (!ALL_OUTCOMES.includes(outcome)) {
    throw new Error(
      `Outcome ${JSON.stringify(outcome)} is not in the closed vocabulary: ${ALL_OUTCOMES.join(', ')}`
    );
  }
  tally[outcome] += 1;
  return tally;
}

/**
 * Decide the run's verdict. NOT "did it finish" — "does a human need to look?".
 * @param {Record<string, number>} tally
 * @param {number} enumeratedCount figures enumerated; the partition must sum to it
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function verdict(tally, enumeratedCount) {
  const reasons = [];
  for (const k of FAILED) if (tally[k] > 0) reasons.push(`${tally[k]} figure(s) ${k}`);

  // 🔴 R9 ([USER] 2026-09-06): unresolved is REPORTED, never fatal. 14.8% of chemistry's
  // figures are unresolved in the delivery today, so failing on it made every chapter run
  // exit 1 — the always-red exit code the spec argues against.
  if (tally.unresolved > 0) {
    reasons.push(
      `NOTE (not a failure): ${tally.unresolved} figure(s) unresolved — the artwork delivery has a hole here`
    );
  }
  // 🔴 Same shape, different cause: the artwork is present and carries text we cannot read.
  // It MUST be named, because the alternative — bucketing it copied-* — ships English to a
  // reader under a green verdict, which is the defect this outcome exists to make visible.
  if (tally['unreadable-text'] > 0) {
    reasons.push(
      `NOTE (not a failure): ${tally['unreadable-text']} figure(s) carry text this extractor cannot read (see P9)`
    );
  }

  // The predicate is deliberately NOT `translated === 0 && figures > 0`: a chapter whose
  // figures are legitimately ALL photographs translates zero and is correct.
  const attempted = tally.translated + FAILED.reduce((n, k) => n + tally[k], 0);
  if (attempted > 0 && tally.translated === 0) {
    reasons.push('zero translated although translate-able figures were found');
  }

  const summed = ALL_OUTCOMES.reduce((n, k) => n + tally[k], 0);
  const partitionOk = summed === enumeratedCount;
  if (!partitionOk) {
    reasons.push(`partition broken: outcomes sum to ${summed} but ${enumeratedCount} figure(s) were enumerated`);
  }

  // A NOTE must not fail the run; everything else must.
  const fatal = reasons.filter((r) => !r.startsWith('NOTE'));
  return { ok: fatal.length === 0, reasons };
}
```

- [ ] **Step 4: Run and watch it pass.**

- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-outcomes.js tools/__tests__/figure-outcomes.test.js
git commit -m "feat(M5 Task 1): the figure outcome vocabulary, a tally that cannot lose a figure, and the verdict"
```

---

### Task 2: `figure-prepare.py` — artwork to blocks, into `--out`

**Files:** Create `experiments/figure-text-translation/figure-prepare.py` · Test `experiments/figure-text-translation/test_figure_prepare.py`

**Interfaces:** `python3 figure-prepare.py <artwork-path> --out <dir>`; writes `<out>/blocks.json`, `artwork.png`, `artwork.svg`, `meta.json`, `runs.json`, and `prepare.json`:

```jsonc
{ "basename": str, "source": str, "blocks": int, "sendable": int,
  "artworkSvgPath": str|null, "imageXObjects": int, "paintOps": int, "warnings": [str] }
```

Exit 0 on success (**including zero blocks**), 1 on failure with `{"error": str, "warnings": []}` in `prepare.json`, 2 on a usage error.

🔴 **`prepare.json` ALSO CARRIES `formTextXObjects`** — the count of reachable `/Form` XObjects whose stream contains `BT`. Task 3 cannot tell "no text" from "cannot read the text" without it.
🔴 **AND `figure-prepare.py` TAKES `--basename <b>` AND STAGES THE ARTWORK AS `<out>/<b>.pdf` BEFORE EXTRACTION** — gs output for EPS/AI, a copy for a de-hashed PDF. **Delete the literal `artwork-src.pdf`.** Without this, `meta.source`'s basename is `artwork-src` (or the de-hashed name) while the sidecar key is the CNXML basename, and the publisher refuses `basename-mismatch` **after the figure has been paid for** — measured on all 7 ch04 EPS and 9 hashed ch03 figures, and `--dry-run` structurally cannot see it.

🔴 **`imageXObjects` and `paintOps` are NOT optional extras — Task 3's classification cannot work without them.**

- [ ] **Step 1: Write the failing test — refusals AND a positive control**

🔴 **The old version of this task had three cases, all refusals, and a 12-line stub that refuses everything passed 5 of 5.** The positive control is the point of this step.

```python
def test_real_artwork_prepares():   # 🔴 THE POSITIVE CONTROL — without it this suite is vacuous
    with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as cwd:
        r = subprocess.run([sys.executable, str(HERE / 'figure-prepare.py'),
                            str(HERE / 'fixtures' / 'fixture_figure.pdf'), '--out', td],
                           capture_output=True, text=True, cwd=cwd)   # foreign cwd ON PURPOSE
        check('real artwork exits 0', r.returncode == 0, r.stderr[-400:])
        d = json.loads((pathlib.Path(td) / 'prepare.json').read_text())
        check('finds 4 blocks',   d['blocks'] == 4,   f"got {d.get('blocks')}")
        check('3 are sendable',   d['sendable'] == 3, f"got {d.get('sendable')}")
        svg = d.get('artworkSvgPath')
        check('artwork.svg exists and is non-empty',
              bool(svg) and pathlib.Path(svg).exists() and pathlib.Path(svg).stat().st_size > 0)
        check('subset-font warning surfaced', any('subset' in w.lower() for w in d['warnings']))
        check('reports paint ops', d['paintOps'] > 0)
```

Keep the refusal cases (missing artwork → exit 1 with an error in `prepare.json`; `--out` required → exit 2), and **replace the old isolation test**: it watched a single filename, `HERE/out/prepare.json`, which **no script in the tree ever writes**, so `before == after` was trivially true even if isolation failed completely. Compare the shared `out/`'s **full inventory and mtimes** instead.

Add: **a text-less vector exits 0 with `blocks == 0`** — that is `copied-textless`, and the old chain crashed on it.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement**

Wrap `emit-blocks.py` and `strip-text.py`, threading `FIGTEXT_OUT`. Specifics that were wrong or missing before:
- **Convert `.eps`/`.ai` to PDF first** with the `gs` invocation in Task 0.
- **Derive `warnings` from `<out>/meta.json`** — `[f for f, d in meta['fonts'].items() if d['last'] < 200]` — **not** by plumbing a child's stderr. Verified to reproduce `extract.py`'s own list exactly on the fixture (`['/F1']`) and on real chemistry artwork (`['/TT0','/TT1']`).
- **Count `imageXObjects` and `paintOps`** from the page. Measured cleanly separable on ch04: 0 images / 13–31 paint ops for line art versus 1–20 images / 0–4 paint ops for photographs.
- **`artworkSvgPath` must be non-null on success, or exit 1.** N2b: the old contract let prepare return 0 with `artworkSvgPath: null`, classification say `translated`, **the MT be paid**, and compose then fail on the missing input.
- Add the `--svg` branch to `strip-text.py` beside the existing `-png` call. *(`out/artwork.svg` had no producer — the file on disk was a hand-run `pdftocairo -svg`.)*
- Thread `FIGTEXT_OUT` in `_deps.py`. ⚠️ **`OUT = Path(os.environ.get('FIGTEXT_OUT') or (HERE / 'out'))`** — the old plan wrote `pathlib.Path(...)`, but `_deps.py` does `from pathlib import Path`, so `pathlib` is not in scope and that patch is a `NameError`.

- [ ] **Step 4: Run and watch it pass**, including the positive control.

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/
git commit -m "feat(M5 Task 2): figure-prepare.py — per-figure isolation, EPS, and a positive control that can fail"
```

---

### Task 3: Classification — moved AFTER prepare, because its discriminator is prepare's output

**Files:** Create `tools/lib/figure-classify.js` · Test `tools/__tests__/figure-classify.test.js`

**Interfaces:** `classifyFigure({ vectorPath, rasterPath, blocks, imageXObjects, paintOps })` → `{ outcome, sendable }`. `outcome` is the **intent**; the driver downgrades it to a `failed-*` if a later stage throws.

🔴 **THE OLD DISCRIMINATOR WAS WRONG IN THE DIRECTION THAT LOOKS RIGHT.** *"A photograph simply has no vector in the delivery"* is false — **OpenStax delivers photographs AS PDFs.** Measured: **167 of 178** figures across ch01–ch05 resolve to a vector, so a `copied-photo` bucket keyed on "has no vector" fires **once in 178**, and every photograph is fed to extraction as though it were line art.

- [ ] **Step 1: Write the failing test.** Keep the old cases (vector with sendable blocks → `translated`; all-unsendable → `copied-textless`; no blocks → `copied-textless`; raster-only → `copied-photo`; nothing → `unresolved`; vector wins over raster) and **add the two the old table could not express**:

```js
// 🔴 THE BLOCKING CASE. The figure HAS text; we cannot read it. Bucketing it copied-* ships
// English to a reader under a green verdict — measured on CNX_Chem_04_04_limiting, 14 English
// words, blocks:0, exit 0. This test must be FIRST, because formTextXObjects outranks both
// copied buckets.
it('calls a figure whose text lives in a Form XObject UNREADABLE, never copied', () => {
  const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: null, blocks: [],
    imageXObjects: 20, paintOps: 2, formTextXObjects: 4 });
  expect(r.outcome).toBe('unreadable-text');
});

it('still calls a genuinely text-less vector copied — the control for the case above', () => {
  const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: null, blocks: [],
    imageXObjects: 0, paintOps: 22, formTextXObjects: 0 });
  expect(r.outcome).toBe('copied-textless');
});

// 🔴 OpenStax ships photographs as PDFs. Without a content discriminator this figure —
// a wrapped bitmap with no text — was called `copied-textless`, and every photograph in
// the corpus with it. Measured separable on ch04: line art has paint ops and no image
// XObjects; a photograph is the mirror image.
it('calls a text-less vector that is a wrapped bitmap a PHOTO', () => {
  const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: null, blocks: [],
    imageXObjects: 3, paintOps: 0 });
  expect(r.outcome).toBe('copied-photo');
});

it('calls a text-less vector with paint operations LINE ART', () => {
  const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: null, blocks: [],
    imageXObjects: 0, paintOps: 22 });
  expect(r.outcome).toBe('copied-textless');
});
```

⚠️ **The table keys on `sendable`, not on `blocks`.** They disagree on 4 of 30 ch04 figures and `sendable` is right — sending `'\x00\x0b'` to a paid MT is the failure this prevents. *(The old spec's table said `blocks`; the code said `sendable`. The code was right, and the spec is now corrected.)*

- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.** A vector with ≥1 sendable block is `translated`. A vector with none: **test `formTextXObjects > 0` FIRST** → `unreadable-text`; otherwise split on `imageXObjects > 0 && paintOps === 0` → `copied-photo`, else `copied-textless`. Raster-only → `copied-photo`. Nothing → `unresolved`.
  🔴 **ORDER IS LOAD-BEARING.** `CNX_Chem_04_04_limiting` reports `imageXObjects: 20, paintOps: 2` — it would land in `copied-photo` on the content discriminator alone, while carrying 14 English words. **The unreadable test must precede both copied buckets.**
  🔴 **Keep `copied-photo` and `unresolved` distinct** though they share a path: a photograph legitimately has no translatable text; a missing vector is a hole in the delivery, and **`unresolved` is the only number in the pipeline that looks at the delivery at all.**
- [ ] **Step 4: Run and watch it pass.**
- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-classify.js tools/__tests__/figure-classify.test.js
git commit -m "feat(M5 Task 3): classify from CONTENT — OpenStax ships photographs as PDFs"
```

---

### Task 4: `figure-compose.py` — compose with a verdict the driver can read

🔴 **THIS IS HALF OF §C137's HEADLINE.** `compose.py` **keeps the English** for any key it cannot match, reports it **only on stdout**, and exits **0**. The old wrapper read `returncode` and `stderr` and never read stdout. Composed with the missing `--out`: every figure tallied `translated`, English in the image, a green verdict, ~36 ISK for a chapter that produced nothing, and a sidecar asserting **another figure's** labels.

🔴 **AND THE OBVIOUS FIX IS DEFEATED: A CORRECT RUN ALSO PRINTS `!! N block(s) … ENGLISH KEPT`** — for the `send:false` verbatim blocks. **So the check must compare KEY SETS, never the warning's presence, and never a count** (a count cancels a swap).

**Files:** Create `experiments/figure-text-translation/figure-compose.py` · Modify `compose.py` · Test `test_figure_compose.py`

**Interfaces:** `python3 figure-compose.py --out <dir> --translations <path>`; writes `<out>/translated.svg` and `<out>/compose.json` = `{"outputPath": str}` or `{"error": str, "keys": [...]}`. Exit 0 / 1 / 2.
`compose.py` additionally writes `<out>/compose-report.json` = `{blocks: [...], missing: [...], translated: [...], translationsPath: str, control: bool}`.

- [ ] **Step 1: Write the failing test.** Keep the two refusal cases, and add the ones that matter:

```python
def test_a_missing_key_is_caught_even_though_compose_exits_zero():
    # blocks.json declares a send:true key that translations.json does not carry.
    # compose.py keeps the English, says so on STDOUT, and exits 0. The wrapper must REFUSE.
    ...
    check('wrapper exits 1', r.returncode == 1)
    d = json.loads((out / 'compose.json').read_text())
    check('names the offending key', 'Boiling point of water' in d.get('keys', []))

def test_a_CORRECT_run_with_send_false_blocks_still_passes():
    # 🔴 THE CONTROL THAT MAKES THE TEST ABOVE MEAN ANYTHING. A correct run prints the same
    # ENGLISH KEPT warning for verbatim blocks. A check keyed on the warning fails here.
    ...
    check('correct run exits 0', r.returncode == 0)
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement**

In `compose.py`: after the block loop, write `compose-report.json`. **Keep the existing stdout prints** — humans use them. Also treat an **empty/whitespace** normalised value on the `key in TR` branch as *missing*, which the code's own comment already claims and the code does not do.
⚠️ **Safe to change:** a repo-wide search for a programmatic invocation of `compose.py` finds none — every hit is a comment, a doc, or a test asserting the server does **not** run it.

In `figure-compose.py`:
1. **Validate inputs BEFORE invoking `compose.py`** — it writes `translated.png` before it reads `artwork.svg`, so a missing SVG otherwise crashes after a partial write.
2. After the subprocess, read `compose-report.json` and assert **two differently-anchored set equalities**:
   - `set(report.blocks) == {b.key for b in blocks.json}` — the derivation-agreement assertion; catches P8 recurring
   - `set(report.missing) == {b.key for b in blocks.json if not b.send}` — **SET equality, not count**
3. On either mismatch: write `{"error": …, "keys": [...]}` and return 1, **naming the offending keys**.

🔴 **Do NOT rely on `returncode`/`stderr`.** Measured: exit 0 and **0 bytes of stderr** for every failure mode, including a nonexistent `--translations` path.

- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/
git commit -m "feat(M5 Task 4): compose reports its own key set — the silent ENGLISH KEPT path closes"
```

---

### Task 5: Invert gate 1 — the figure MT leg must refuse WITH a glossary

**Files:** Modify `experiments/figure-text-translation/translate-blocks.mjs` · Test `tools/__tests__/figure-mt-glossary.test.js`

🔴 **THE OLD VERSION OF THIS TASK CANNOT BE PASTED, AND PATCHING IT WOULD PRESERVE A WRONG PREMISE.** Its replacement snippet used `glossaryTerms` and `runSource`, which appear **0 times** in the file; the `_source` string it assigned is an **inlined ternary**; its refusal format differs from every existing one; and **its test and its code were jointly unsatisfiable** — the test demanded exit 0 under `--book efnafraedi-2e`, while the gate refused whenever a glossary loaded, and that book loads one.

- [ ] **Step 1: Read the real code.** `resolveGlossaryOrRefuse({book, noGlossary})` (~:183) returning `{ok, glossary, termCount, code, message}`; the refusal print `  ✗ REFUSED (${resolved.code}): ${resolved.message}` (~:185); `translateOptsFor(resolved.glossary, b.english)` (~:220); the `_source` ternary (~:262). Note that **`--no-glossary` already implements the whole desired end-state** — it skips the file read, omits the field, nulls the record and sets the bare `_source`. **Only the DEFAULT and the refusal branch need to move.**

- [ ] **Step 2: Write the failing test.** Assert on the **wire payload**, not on stdout:

```js
it('sends NO glossary on the figure leg, whatever --book says ([USER] 2026-09-06, on §C133)', () => {
  // The gate INVERTS rather than disappears — deleting it would leave the paid figure leg
  // ungated, which is how this project has lost a guard before.
  // Drive with a STUB client that records opts; assert no recorded request carries
  // `glossaries`, and that at least one request was recorded (non-vacuity).
});
```

⚠️ **Delete the old Step-2 test `expect(res.stdout).toMatch(/no glossary/i)`.** The tool's bare-run stdout is `glossary: NONE — bare run, acknowledged with --no-glossary`, which that regex misses; the only string it matches is the `_source` **field**, written to a file a `--dry-run` never produces. **A test cannot observe a run record its own command does not write.**
⚠️ **Delete the old Step-3 expectation naming `Glossary: 1703 approved chemistry terms`.** A live glossary count in a plan document is forbidden by CLAUDE.md § One source of truth, drifts on the 2-hourly export, and was true only on a machine whose stale `out/` happened to hold 8 blocks.

- [ ] **Step 3: Run it and watch it fail.**

- [ ] **Step 4: Invert the gate — on the OUTCOME, not on a count.** Refuse if any block's `opts.glossaries` would be present. **Do not gate on `resolved.termCount`**: that makes `--book` a self-destruct flag, contradicting both the CLI contract (`--book` is required) and this task's own exit-0 test.

The rationale belongs in the code, because the next reader will wonder why a gate was inverted rather than deleted:

```js
// 🔴 GATE 1, INVERTED — [USER] 2026-09-06, on §C133's measurement that the glossary buys no
// terminology consistency (44.2 / 44.6 / 44.4% across three runs, inside the measure's own
// noise). The case is STRONGER for figures than for prose: figure text is labels and captions
// — short, fragmentary, often a single noun — which is exactly where a flat context-free map
// does its worst work, because there is no sentence to disambiguate against. And a wrong label
// is baked into an image rather than editable in the segment editor.
// This REPLACES the old "sends the glossary, or refuses" gate. It is not deleted: deleting it
// would leave the paid figure leg ungated.
```

- [ ] **Step 5: Run and watch it pass.** Then `node experiments/figure-text-translation/translate-blocks.mjs --book efnafraedi-2e --dry-run` → **exit 0**, a cost line, and no glossary on the wire.

- [ ] **Step 6: Commit**

```bash
git add experiments/figure-text-translation/translate-blocks.mjs tools/__tests__/figure-mt-glossary.test.js
git commit -m "feat(M5 Task 5): invert figure gate 1 — the MT leg refuses to carry a glossary"
```

---

### Task 6a: The driver, free half — enumerate, classify, preview. Writes nothing.

**Files:** Create `tools/figure-run.js`, `tools/lib/figure-enumerate.cjs` · Test `tools/__tests__/figure-run-free.test.js`

**Interfaces:** exports `parseCli`, `enumerateChapterFigures(bookSlug, chapter, opts)`, `isStale(sidecar)`, `normaliseTranslations(apiJson)` → `{blocks, dropped}`, `summarise(...)`. The CLI through `--dry-run`.

- [ ] **Step 1: Write the failing test.** Carry over the normaliser and staleness cases, and add or fix these:

```js
// ⚠️ RELABELLED, not new: an ARC block's value is written as a BARE STRING. `Array.isArray(v)
// ? v[0] : v` discriminates the two shapes exactly; a naive v[0] would yield 'S'. The old test
// called this "passes a bare string through unchanged" and never said it was the arc case.
it('passes an ARC block\'s bare string through unchanged', () => {
  expect(normaliseTranslations({ blocks: { A: 'Suðumark' } }).blocks).toEqual({ A: 'Suðumark' });
});

// 🔴 D9: an empty MT value must not vanish silently — English in the image, no review row.
it('REPORTS what it dropped rather than only returning survivors', () => {
  const r = normaliseTranslations({ blocks: { A: [''], B: ['ok'] } });
  expect(r.blocks).toEqual({ B: 'ok' });
  expect(r.dropped).toEqual(['A']);
});

// R7: enumeration is ALL images, and reviewability is reported alongside.
it('enumerates every image, and flags which ones the review panel can show', () => {
  const found = enumerateChapterFigures('efnafraedi-2e', 4);
  expect(found.length).toBeGreaterThan(0);                    // non-vacuity
  expect(new Set(found.map((f) => f.basename)).size).toBe(found.length);
  expect(found.every((f) => !f.basename.includes('/'))).toBe(true);
  expect(found.some((f) => f.reviewable)).toBe(true);         // both classes present,
  expect(found.some((f) => !f.reviewable)).toBe(true);        // or this proves nothing
});

// ⚠️ appendices are the -1 sentinel; Number('appendices') is NaN and chapterDir(NaN) is 'chNaN'.
it('accepts appendices as a chapter', () => { /* via cliChapterArg, not Number() */ });

// D6/§C83: a declared flag that nothing reads is worse than an absent one.
it('REFUSES when --figure matches nothing, instead of exiting 0 having done nothing', () => { ... });
it('REFUSES when --module names a file that does not exist', () => { ... });
it('REFUSES a valued flag whose value is missing or begins with --', () => { ... });

// D3: "already done" is derived from the hashes, never from a file existing.
it('treats a sidecar with no composedHash as NOT current — it was paid for but never published', () => {
  expect(isStale({ renderHash: 'aaa' })).toBe(true);
});

// Spec invariant 2.
it('a --dry-run leaves the working tree untouched', () => { /* git status before/after, + non-vacuity */ });

// 🔴 N1: the check the OLD test was named for but did not perform.
it('the summary asserts the partition at RUNTIME and fails when it does not sum', () => { ... });

// R7: the gap must be named, not just counted.
it('NAMES the translated figures the review panel cannot show', () => { ... });
```

⚠️ **Delete the old `describe('the outcome partition')` source-regex test.** It greps `figure-run.js` for `outcome: '<literal>'`, which is not the partition check, and is defeated by the idiomatic `` outcome: `failed-${stage}` `` form — measured: it sees only `["translated"]` and still passes `length > 0`. Keep a regex only as a *secondary* lint, with a non-vacuity control.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Notes that are load-bearing:
- **Failure default first**: `process.exitCode = 1` as the first statement.
- **Strict `parseCli`** — reject unknown flags AND missing/`--`-prefixed values. Normalise `dry-run` → `dryRun`; the old skeleton read `args.dryRun`, which `parseCli` never set, so **any consumer written that way would have run LIVE**.
- **Enumerate through `tools/lib/figure-enumerate.cjs`**, consumed by both this ESM driver and the CJS `figureReviewService.js`, so the driver's idea of a figure and the review panel's cannot drift. Dual-consumer is the one legitimate `.cjs` reason in this repo, and that service already reaches into `tools/lib/` twice.
- Use **`TAG_ATTR_SPAN` from `tools/lib/cnxml-parser.js`, never `[^>]*`** — a raw `>` inside an attribute truncates the naive form silently.
- Use **`normalizeChapter()` then `chapterDir()` from `server/lib/chapterLabel.js`** (the canonical `chNN` idiom; the MIT→AGPL edge is deliberate per the C1a rule). ⚠️ **`normalizeChapter` is the PARSER** (`'appendices'` → `-1`, `'4'` → `4`); **`cliChapterArg` runs the OTHER WAY** (integer → CLI string) and is not what you want here. `Number('appendices')` is `NaN` and `chapterDir(NaN)` is `'chNaN'` — a loud ENOENT, but on a chapter that has 36 unmapped figures.
- **Strip a `-[0-9a-f]{4}` suffix** from the CNXML-derived basename before declaring `unresolved` — otherwise a naming gap is reported as a delivery hole.
- **Count with `tallyOutcome`**, never `tally[x] += 1`.
- **PRE-FLIGHT, PURE:** check that an `image-mapping.json` entry exists *or could be minted* — no write. Organic has **0** entries, so without this every figure would be bought and then refused `unmapped`.
- 🔴 **PRE-FLIGHT ALSO ASSERTS IDENTITY, AND THIS IS THE ONE `--dry-run` COULD NOT SEE:** `basenameFromMeta(<out>/meta.json) === basename`. `meta.json` already exists after step 3, so the check is free. Without it, every EPS figure (7 of ch04's 30) and every hash-suffixed figure (9 on ch03) is **paid for and then refused `basename-mismatch`**, on every run, for ever. **A figure's identity is the UNSTRIPPED CNXML basename everywhere; P7's de-hash is lookup-only and must never rename it.**
- **Label the mode in the summary.** A `--dry-run` summary must not be byte-identical to a successful live run.
- **`process.exitCode = v.ok ? 0 : 1` as the last statement.** Never `process.exit()`.
- **Remove `tmpRoot`** at the end — `/tmp` here is a ~4.9 GB tmpfs that runs >90% full.

- [ ] **Step 4: Run the unit tests.**
- [ ] **Step 5: The free corpus check.**

```bash
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --dry-run > /tmp/m5-ch04.txt 2>&1; echo "exit=$?"; cat /tmp/m5-ch04.txt
```

🔴 **THE EXPECTED TALLY IS PENDING TASK 0's CENSUS — DO NOT USE THE OLD ONE.** This step used to require **13 translated / 16 copied-* / 1 photo / 0 unresolved = 30**. **That is precisely the shape a form-blind extractor produces**, and 6–8 of those "copied" figures contain English prose — so the criterion would have certified the defect it was meant to catch.

**Acceptance that holds regardless of the census:**
- the run is `--dry-run` and costs **0 ISK**;
- the tally **sums to the enumerated count** — the driver asserts this itself, do not verify by hand;
- **no figure lands in `copied-*` while carrying `formTextXObjects > 0`**;
- `failed-prepare = 0`.

✅ **THE CENSUS EXISTS — read the per-bucket numbers from [`experiments/figure-text-translation/TEXT-COVERAGE.md`](../../../experiments/figure-text-translation/TEXT-COVERAGE.md), which owns them.** For chemistry: **496** page-text · **274** form-text-only · **8** Type0-unreadable · **7** textless · **71** photo · **253** unresolved · **38** ours-crashes · **1** unexplained. ⚠️ **Those are OUR reader's buckets; the adapter is expected to move most of `form-text-only` and `Type0` into readable.** Re-run the producer rather than quoting this.

- [ ] **Step 6: Commit**

```bash
git add tools/figure-run.js tools/lib/figure-enumerate.cjs tools/__tests__/figure-run-free.test.js
git commit -m "feat(M5 Task 6a): the figure driver's free half — enumerate, classify, preview, and assert the partition"
```

---

### Task 6b: The driver, paid half — spend, record, compose, publish

🔴 **THIS IS THE ONLY TASK THAT CAN SPEND MONEY.** Two per-figure paths, **selected by whether a sidecar exists — not by a flag**.

**Files:** Modify `tools/figure-run.js` · Test `tools/__tests__/figure-run-paid.test.js`

- [ ] **Step 1: Write the failing test.** With a stub MT and a stub publisher, assert:

```js
// 🔴 N2 — THE PURCHASE IS RECORDED BEFORE ANYTHING THAT CAN FAIL AFTER IT.
it('writes the sidecar as soon as the MT returns, even when the post-MT check then FAILS', () => {
  // A 7-of-8 return must land in a failure bucket AND leave all 7 translations on disk.
  // Without this, adopting Task 4's check converts a new DETECTION into a new LOSS.
});

// 🔴 D3 — a figure whose publish is refused must not be reported done, ever.
it('a refused publish leaves no composedHash, lands in failed-publish, and is NOT skipped-current next run', () => { ... });

it('buckets a THROW from publish as failed-publish', () => {
  // fs.copyFileSync is unguarded and throws past every refusal — proven with EACCES.
});

// 🔴 D5/R8 — the single biggest spend change.
it('spends NOTHING on --stale: recomposes from the sidecar\'s own blocks', () => {
  expect(stubMt.calls).toBe(0);   // not "called with --dry-run" — not called
});

it('spends NOTHING on --force either', () => { expect(stubMt.calls).toBe(0); });

it('does not overwrite an editor\'s corrected text with a fresh machine translation', () => { ... });

// R8: the only spendable figure is one with no sidecar.
it('spends only on a figure with NO sidecar', () => { ... });

// 🔴 The paid stage is ALL-OR-NOTHING PER FIGURE, and that is ACCEPTED, not fixed:
// translate-blocks.mjs writes its outputs only after its whole loop, so a throw at block k of n
// persists NOTHING (measured: 2 blocks billed, neither output file written). Exposure is one
// figure, ~1 ISK — §C134's shape, where [USER] ruled retry rather than code around it.
it('a non-zero exit from the MT buckets failed-mt, writes NO sidecar, and stays eligible', () => { ... });

// ⚠️ And the clause that stops an implementer minting an empty sidecar R8 would lock for ever.
it('mints NO sidecar when translations-api.json is absent or parses to zero blocks', () => { ... });

// D3: the two hash fields travel in opposite directions.
// 🔴 REPLACED. The old test here was 'carries composedHash forward and never carries state
// forward' — satisfiable non-vacuously ONLY by a recompose that rewrites the sidecar without
// `state`, which SILENTLY DESTROYS a head editor's approval on the very --stale run meant to
// turn the badge green. A recompose writes the sidecar under NO circumstances.
it('a recompose does not write the sidecar at all; the publisher stamp is the only write', () => {
  // Drive the REAL publishFigureSvg (not a stub) on an approved fixture carrying a STALE
  // composedHash. Assert state === 'approved' SURVIVES and composedHash === renderHash after.
  // ⚠️ This test FAILS TODAY on a shipped bug: withComposedHash overwrites its own stamp when
  // the key is already present, so composedHash stays OLD after a successful publish and every
  // later --stale re-selects the same figure. That is a [CODE] item, not a plan defect —
  // record it, and do not paper over it by relaxing the assertion.
});

// D4: unmapped must be unreachable after money has been spent.
it('refuses an unmintable figure BEFORE the MT is called', () => { expect(stubMt.calls).toBe(0); });

// The minted payload — measured, not chosen.
it('mints renderHash and NO state, so the figure reads mt-preview and publish can stamp', () => { ... });
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement — the order is the fix.**

```
 5. PRE-FLIGHT   mapping entry exists or is mintable?          PURE, no write
 6. translate    ONLY if no sidecar (R8). --out T/<basename>   ← the only paid step
 7. SIDECAR      writeSidecar(...) IMMEDIATELY, and REGARDLESS of step 8's verdict
 8. verify       compare key SETS both ways → decides the BUCKET, never the record
 9. compose      figure-compose.py, from sidecar.blocks
10. mint+publish mapping entry (tmp+rename), then publish → stamps composedHash
```

- **Recompose path** (`--stale`, `--force`, or any figure that already has a sidecar): prepare (free) → compose from `sidecar.blocks` → publish. **Zero MT spawns.** Do not rewrite `state`/`renderHash` if `blocks` did not change; just recompose and let the publisher stamp.
- **Mint the mapping entry in the driver**, importing `DEFAULT_SUFFIX` and `mergeMapping` from `tools/generate-image-mapping.js`, taking the extension from `path.extname()` of the composer's output, gating on the basename being in the source-image index, and writing tmp+rename.
  🔴 **REJECT the option a reader of §C137 will reach for first: "run `generate-image-mapping.js` before publish".** **Proved a no-op** — with `media/` empty it mints **0** entries, because it derives them from files already on disk. It helps only figures that need no help, and throws outright on `lifraen-efnafraedi`, which has no `media/` at all.
- **Wrap `publishFigureSvg` in try/catch** — it has three outcomes, not two.
- **Add `tools/figure-run.js` to `tools/__tests__/source-write-guard.test.js`'s ALLOW set** as a writer of `books/<slug>/media/image-mapping.json`.
- **Update the comment at `publish-figure-svg.js` (~:169-172)**, which this change falsifies: a driver-minted sidecar *does* carry a `renderHash`, so the "ordinary case" it describes is no longer ordinary.

- [ ] **Step 4: Run the unit tests.**
- [ ] **Step 5: Run the whole suite.** `npm test` from the repo root. **Compare the failing set by NAME against `main`'s floor, both directions** — a count alone hides a swap. ⚠️ `npm test | tail` reports the pipe's exit code; do not read it as the suite's.
- [ ] **Step 6: Commit**

```bash
git add tools/figure-run.js tools/__tests__/figure-run-paid.test.js tools/publish-figure-svg.js tools/__tests__/source-write-guard.test.js
git commit -m "feat(M5 Task 6b): the paid half — the purchase is recorded before anything that can fail after it"
```

---

## After the plan

**Do NOT run a paid figure translation as part of implementation.** The first live run is a separate, **[USER]-authorised** step, preceded by `--dry-run` on the target chapter. Task 6a's acceptance check is free and is the evidence that the chapter is ready.

**Known limitations this plan deliberately does NOT close** — each is in the spec's Open items with its measured consequence:
- 🔴 **`withComposedHash` OVERWRITES ITS OWN STAMP when the key is already present**, so a successful publish leaves the on-disk `composedHash` at its OLD value while the publisher returns the new one. The correction loop's final step never completes and every later `--stale` re-selects the same figure. **A bug in shipped code, found while reviewing this plan** → **§C138** owns its status.
- **The paid stage is all-or-nothing per figure** — a throw at block k discards the k−1 already bought. ~1 ISK, §C134's shape: retry, do not code around.
- **A Greek letter is being treated as whitespace.** `/Differences [31, /uni03B1]` means `\x1f` IS alpha, and `'\x1f'.isspace()` is True. `pdftext.parse` never applies `/Encoding /Differences` at all, so alpha reaches the wire raw and composes as a missing glyph. **Pre-existing, arm-independent, and it degrades every Greek-bearing chemistry figure M5 translates.** → **§C138** owns its status.
- **Widening the review surface to non-figure media (R7)** — three legs, not a filter: the 12 ch04 images have no node in `02-structure` at all.
- **`books/<slug>/media/` and `figure-text/` have no permission class**, and this plan adds a third automated writer to `media/`.
- **253 of 1,148 chemistry figures are unresolved in the artwork delivery** — R9 makes it reportable, not fixed.
