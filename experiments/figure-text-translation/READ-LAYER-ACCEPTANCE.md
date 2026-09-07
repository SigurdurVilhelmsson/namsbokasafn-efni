# READ-LAYER ACCEPTANCE — the evidence for the swap

**Measured 2026-09-07 (M5 R5).** Producer: `read_layer_accept.py --candidate`, read-only,
**no network, 0 ISK**. Both readers and the poppler oracle run over one staged copy of each
figure, so ghostscript's nondeterminism cannot read as a reader difference.

**This file is EVIDENCE and it is dated. Status of the work is
[`REGISTER.md`](REGISTER.md)'s** — per [CLAUDE.md § One source of truth](../../CLAUDE.md), no
status verb appears here.

> **Reproduce it:**
> ```bash
> cd experiments/figure-text-translation
> FIGTEXT_PYLIBS=./pylibs python3 -u read_layer_accept.py --selftest
> FIGTEXT_PYLIBS=./pylibs python3 -u read_layer_accept.py --candidate --json accept-candidate.json
> ```
> ⚠️ **`python3 -u`, and redirect with `>` rather than a pipe.** Python block-buffers to a file,
> so a run killed mid-flight leaves **0 bytes** having printed plenty — and a shell wrapper then
> reports exit 0 over the empty artifact. **Judge this run by its `VERDICT:` line, never by a
> reported exit code.**

---

## The populations — re-derived, never inherited

🔴 **No population in this document is hard-coded anywhere (ruling R-2).** The census supplies the
*partition*; the harness supplies every *count*, on each run. The contract's old `504 read / 275
unread` were a **third program's** numbers — the bake-off's *guarded* reader, which is neither the
baseline nor the candidate — and they were wrong in both directions.

### Both readers, per census bucket

`rows` is the census partition. `unres`/`stagefail` are 0 throughout, so every column below is a
read outcome and the rows sum exactly.

| bucket | rows | base reads | base empty | base **raises** | cand reads | cand empty | cand raises |
|---|---:|---:|---:|---:|---:|---:|---:|
| `page-text` | 496 | 493 | 0 | **3** | **496** | 0 | 0 |
| `form-text-only` | 274 | 0 | 0 | **274** | **274** | 0 | 0 |
| `type0-unreadable` | 8 | 0 | 0 | **8** | **8** | 0 | 0 |
| `text-but-unexplained` | 1 | 0 | 0 | **1** | **1** | 0 | 0 |
| `ours-crashes` | 38 | 37 | 0 | **1** | 37 | **1** | 0 |
| **TOTAL** | **817** | **530** | **0** | **287** | **816** | **1** | **0** |

🔴 **THE BASELINE'S FAILURE IS A CRASH, NOT A SILENT SKIP.** `page.Resources.Font` is unguarded, so
it raises `AttributeError: /Font` on the form-text figures and `AttributeError: /FirstChar` on the
type0 ones — **287 raises, 0 empties.** An earlier "the page `/Font` dict is empty 40 of 40" was
measured with a **guarded** accessor, i.e. against a different program from the one being replaced.
▶ The harness therefore reports three outcomes, never two; folding a raise into `[]` would
manufacture the population.

⚠️ **`ours-crashes` is the CENSUS's blindness, not the reader's** — `text-coverage-census.py:59`
calls `pg.Contents.read_bytes()`, which raises when `/Contents` is an **array**. Measured: the
**baseline reads 37 of those 38 figures perfectly well.** The bucket name describes the census.

### Every figure still empty after the swap, NAMED

| figure | bucket | baseline | candidate | oracle |
|---|---|---|---|---|
| `CNX_Chem_06_01_Vibrstring` | `ours-crashes` | raises | **empty** | **0 words** |

**One figure, and it is not a gap.** poppler — a third, independently implemented instrument —
also finds no text. This is spec **H8** behaving correctly: a figure with no text returns `[]`, a
success with zero runs, never an exception. The census bucketed it as a crash because its own
`/Contents` read raised before it could discover there was nothing to read.

**Candidate `raises`: 0 of 817.**

---

## The criteria, each with its denominator

### C1 — regression control · **0 / 530 figures**

The predicate is **not** `baseline − candidate ≠ ∅` (ruling R-3). That mechanical rule flags every
mojibake fix: where the candidate correctly reads `°C` that the baseline read as `¡C`, the `¡` is
"missing". So the tiebreak asks poppler — **by COUNT, not by membership**:

```
regression  ⟺  ∃ch.  (baseline_chars − candidate_chars)[ch] > 0
                 ∧   candidate_chars[ch] < oracle_chars[ch]
```

— a character the baseline has that poppler does **not** attest **at that multiplicity** is
mojibake or surplus, not content.

🔴 **CORRECTED 2026-09-07 — THIS SECTION STATED `∩ oracle_chars ≠ ∅`, THE MEMBERSHIP FORM COMMIT
`7fab73b7` REPLACED, AND IT WAS WRITTEN AFTER THAT COMMIT.** `∩` asks *"does poppler see this glyph
anywhere?"*; the question is *"are we now short of what poppler attests?"* — ruling R-13's wrong
unit. The distinction is not academic: on `CNX_Chem_18_03_SiPurif`, the only C1 regression in the
full run, the baseline emits 44 characters of binary garbage before three real labels and the
candidate drops all 44, one of them a `c` (baseline 4, candidate 3, **oracle 3**). The membership
form flags `{'c': 1}`; the count form flags nothing, and nothing is what is true. **The `0 / 530`
below was produced by the COUNT form; only this prose was stale.** ⚠️ Strictly more precise, not
perfect: where the counts coincide it cannot tell a dropped junk `c` from a dropped real one.

| | figures |
|---|---:|
| in scope (baseline reads them) | 530 |
| **REGRESSIONS** | **0** |
| dropped, oracle also lacks it — **non-failing, reported as its own column** | 125 |

Top excused characters: `\x7f` ×163 · `Ð` ×122 · `±` ×93 · `\x1f` ×73 · `!` ×23 · `"` ×21 ·
`\x1e` ×18 · `¡` ×16.

⚠️ **That column is reported precisely because it is where a real loss of something poppler cannot
see would hide.** Its contents are the expected `/Encoding /Differences` mojibake set — `¡` is the
baseline's rendering of `°`, `\x7f` of `λ` — plus surplus the baseline over-read.

🔴 **In a baseline-vs-baseline run this excuse path is STRUCTURALLY UNREACHABLE** (nothing is ever
missing), so it reports `0/530` — a zero that says nothing about whether the mechanism works. That
is why **selftest assertion 5** exists: a mutant that deletes oracle-absent characters must produce
0 regressions **and** a non-zero excused count. Without it, the mechanism deciding whether ~96 H3
fixes are accepted would have no control, and its failure mode is the **silent rejection of correct
work**.

### C1b — `/Type0` correctness · **8 / 8 decoded, 0 silent reductions**

The rule is *either correctly decoded text **or** `decodable: false` in `meta.fonts`* — **a silent
reduction is a FAILURE.** All 8 decode cleanly through `/ToUnicode`. The baseline's output on these
figures was control-byte garbage (`'\x00\x0b\x00D\x00\x0c'` where the figure says `(a)(b)`), which
nothing downstream could tell from English.

🔴 **CORRECTED 2026-09-07 — UNTIL THAT DATE THIS CRITERION COULD NOT SEE THE FAILURE IT IS NAMED
FOR, AND `8 / 8 decoded` WAS A SATURATED RATE FROM AN INSTRUMENT THAT COULD ONLY REPORT TOTAL
LOSS.** `classify_type0` certified `decoded` on `set(charcount(text)) & set(ochars)` — **ONE shared
character**. A reader keeping a single character of every type0 figure (moles-6296: 1 of 54) was
classified `decoded 8` and the run exited 0. Since the baseline RAISES on all 8, `c1_scope` is
False there and C1b is the **only** verdict-bearing criterion over the bucket. It now compares
counts (`candidate[ch] < oracle[ch]` → FAIL-silent) and prints the shortfall by character.
▶ **The published `8 / 8` was TRUE and remains true** — the candidate's character multiset equals
the oracle's exactly on all 8, re-measured after the change, failing set unchanged in both
directions — **but it was not, until now, ESTABLISHED by the instrument that reported it.**
**`--selftest` assertion 8** is the sensitivity control it never had: a mutant keeping a quarter of
every type0 figure's runs must be `FAIL-silent`, with the real candidate still `decoded` alongside.

⚠️ **The `(cid:` detector is therefore tested against a SYNTHETIC fixture**, because the real corpus
no longer exercises it — 0 of the 8 contain that substring.

### C2 — positive control · **286 / 287 gained**

Every figure the baseline could not read. The one that did not gain is `CNX_Chem_06_01_Vibrstring`,
above, which has no text for any instrument.

🔴 **THIS NUMBER MEANS ">= 1 CHARACTER", NOT "READ THE FIGURE" — and until 2026-09-07 nothing
anywhere measured the difference.** `c2_gained` is `outcome == 'reads'`, and `outcome_of` is
`any(r['text'] != '')`, so a single SPACE gains a figure. On this population C1, C4 and C4b have a
structurally empty denominator (they are fenced by `if b_out == 'reads'`, and the baseline raises
on all 287) and C3 asks only *has text at all*; only the 8 type0 figures got C1b. **That left 279
figures — the population this whole swap exists to fix — graded on existence alone.** Measured with
a partial /Form-walk mutant (keep the first quarter of the runs): **70% of oracle-attested
characters lost, every printed criterion clean, `exit 0`**, while the SAME mutant trips C1 on 40 of
40 page-text figures. The comparison datum sat unused on every row from the start: `oracle_chars`.
See **C2b**, below.

### C2b — completeness on the C2 population · **0 short of the oracle / 286 in scope**

🔴 **ADDED 2026-09-07. This is the criterion whose absence made C2's number mean ">= 1 character".**
On every figure where the baseline cannot read, the oracle HAS text and the candidate reads — the
**silent** case, since a candidate that raises or is empty is loud and C2 already names it — the
candidate must hold, per character, at least what `pdftotext` attests.

| | figures |
|---|---:|
| in scope (baseline cannot read · oracle has text · candidate reads) | 286 |
| **SHORT of the oracle** | **0** |

⚠️ **THE DENOMINATOR IS THE POINT.** A clean C2b over an empty scope would say nothing whatever,
so the scope is printed beside the count on every run. 286 of 287 is the whole C2 population bar
`CNX_Chem_06_01_Vibrstring`, which has no text for any instrument.

**It is VERDICT-BEARING, and that was decided by measurement rather than by preference:** the full
817-figure run reports 0 shortfall figures out of 286, so making it gate costs nothing today while
catching the class it exists for. Had it been non-zero the criterion would have stayed advisory
with the figures NAMED, and the decision handed back.

**`--selftest` assertion 9** is its sensitivity control: a mutant keeping the first quarter of each
figure's runs must be flagged on every figure it actually reduced (40 of 40 measured), while the
real candidate is clean over a scope that must be non-zero. That mutant shape is deliberate — it is
what a /Form walk that descends into some forms and not others produces, which is this branch's own
subject matter.

### C3 — oracle agreement · **0 disagreements / 817**

Neither oracle-only nor reader-only. The candidate and poppler agree on *whether a figure has text
at all* for every figure in scope.

### C4 — block conformance · 530 figures, 5,900 paired blocks

Compared **per block**, never per run: the two readers segment differently **by design**, so no run
index exists to compare on (ruling R-10).

| | figures |
|---|---:|
| block geometry differs > 1.0 pt | 143 / 530 |
| block font set differs | 1 / 530 |

**Per-run shape violations: candidate 0, baseline 6** (`font-unresolved` ×6).

🔴 **THE `143 / 530` NEEDS ITS CAUSE, AND THE OBVIOUS EXPLANATION ONLY COVERS PART OF IT.** Most of
it is re-segmentation — different block boundaries give different bounding boxes, and that is the
readers behaving as designed:

| of the 143 figures whose block geometry differs | figures |
|---|---:|
| block keys **also** differ — geometry moved *because the blocks did* | **109** |
| block-key **multiset identical**, geometry moved anyway | **34** |
| — of those 34, carrying duplicate keys (so C4's key-pairing is ambiguous) | 14 |
| — of those 34, **no duplicate key at all**, so the pairing is unambiguous | **20** |

▶ **The ambiguous-pairing explanation reaches 14 of 34 at most. On 20 figures the same block, paired
without ambiguity, sits more than 1 pt from where the baseline put it.** The moved keys are dominated
by short labels — `(a)`, `(b)`, axis ticks `10`/`20`/`25`, `Energy (kJ)` — consistent with the two
readers deriving `x`/`y` by different routes (the baseline from its own content-stream parse, the
candidate from pdfminer's text matrix), which is a known and deliberate difference.

⚠️ **This changes no criterion's verdict** — C1 records 0 regressions, and on these 34 the block-key
multiset is identical, so nothing goes unbought. **It is recorded as an open question rather than
resolved**, because "1 pt" is a tolerance somebody chose and no measurement here establishes which
reader is closer to the truth. Criterion 5 is the only instrument that could settle it, and on the
one figure where both readers ran it found **0 of 9** shared strings displaced — encouraging, but
one figure.
🔴 **That asymmetry is the non-vacuity control.** A `0 / 0` pair would be consistent with the shape
check doing nothing at all; a `0 / 6` pair proves it can fire and that the candidate is the side
that is clean.

### C4b — block-key conformance · the one that costs money

Compared as **MULTISETS** (ruling R-13). `compose.py` iterates blocks and looks up `TR[key]` per
block, so two blocks sharing a key are both drawn: a candidate producing one where the baseline
produced two leaves a label **undrawn**, with the key *set* identical.

| | value |
|---|---:|
| figures with key differences | 281 / 530 |
| blocks **added** | 2,266 occurrences (1,512 distinct keys) |
| blocks **dropped** | 1,415 occurrences (978 distinct keys) |
| — of those, **vanished entirely** | 965 |
| — of those, **twin-loss only** (key survives at reduced multiplicity) | 13 |
| duplicate keys — why this is a multiset | baseline 2,052 · candidate 5,375 |

🔴 **`VANISHED` is the field that separates a twin loss from a real key loss, and DISTINCT is not.**
`Counter - Counter` emits one delta entry per key that lost multiplicity, so collapsing two
identical blocks into one drops 1 occurrence and 1 distinct key — *exactly* as losing a wholly
unique block does.

⚠️ **The dropped keys are dominated by the baseline's own defects being corrected, and the shape is
legible in the samples**: `'Temperature (¡C)'` disappears because the candidate reads `°C`;
`'0.5011.522.533.544.5'` disappears because the baseline glued a whole axis of tick labels into one
run and the candidate segments them (`'0'`, `'0.5'`, …). **A dropped key here is usually a repaired
key, not a lost label** — which is why C1's oracle tiebreak, not C4b, is the failing criterion.

---

## Wall-clock and reproducibility

**766.6 s for 817 figures — 0.94 s each**, single process, no network.

🔴 **This run was compared field-by-field against the run promoted before it: 0 differences across
all 817 rows** (`status`, `bucket`, `oracle_words`, `oracle_chars`, the whole `base` object, and 18
candidate-arm fields including `c1_regression`, `c1_excused`, `c2_gained`, `c4b_added`,
`c4b_dropped`, `c4b_vanished`, `shape` and `dup_keys`). **A planted change was detected by the same
comparator**, so the null is not an instrument failure.

**`VERDICT: exit 0 — C1 regressions ×0, C1b silent-reduction ×0, C2b oracle shortfall ×0`**
**`(of 286 in scope).`**

---

## H7 — the fill-colour blindness, NAMED rather than counted as zero

🔴 **Ruling R-12 forbids reporting "H7 occurrences: 0" from the char stream, and the reason is that
the instrument is blind.** When pdfminer cannot parse a colour operand it logs a warning and leaves
`graphicstate.ncolor` **unchanged**, so the char silently carries the **previous** colour —
indistinguishable from a real one. **A named blindness is a finding; a zero from a blind instrument
is a lie.**

The only honest instrument is pdfminer's own warning stream, which `readlayer._WarningCounter`
counts into `meta['color_warnings']`.

⚠️ **The acceptance harness does NOT propagate that field** — measured, 0 of 817 arm rows carry it —
so this is a separate read-only pass over the same population.

**CONTROL, run first, because a zero from an unproven counter is worth nothing:** a synthetic
`Cannot set non-stroke color` log record moves the counter to 1, and an unrelated warning does not
move it. Only then is anything below a fact.

| over 817 figures, all read, 0 read failures | |
|---|---:|
| figures with ≥ 1 unparseable colour operand | **1** — `CNX_Chem_09_04_KMT2` (1 warning) |
| figures with unrecognised colour spaces | **3** — `CNX_Chem_14_07_titration2` (`Separation:1` ×44), `CNX_Chem_18_07_Nitrogen` (×45), `CNX_Chem_21_06_Penetrate` (×2) |
| figures using a font found in no `/Resources` | 0 |

▶ **Fills on those four figures are unreliable and should not be trusted**, and that is the whole of
the claim — H7 is *narrow*, not absent.

🔴 **AMENDED 2026-09-07 — "UNRELIABLE" WAS TOO KIND FOR THE THREE `Separation` FIGURES, AND THE
DIFFERENCE WAS THE WHOLE DEFECT.** `_fill` dispatched on the COMPONENT COUNT, so a 1-component
`/Separation` tint fell into the DeviceGray branch — and the two spaces mean OPPOSITE things by one
component: DeviceGray 1.0 is white, a Separation tint of 1.0 is FULL colorant. titration2's tint
transform decodes to DeviceCMYK `(0,0,0,t)`, i.e. 100% black ink, and the reader returned
`('cmyk',0,0,0,0)` → RGB (1,1,1). **18 runs across the three figures published `fill="#ffffff"`
through the real `svgout.write_svg`** — `'Phenolphthalein'`, `'pH range'`, `'Methyl orange'`,
`'ammonium (NH4+)'` among them — and `strip-text.py` removes the English underneath (712 dark px →
0). **5 of the affected blocks are `sendable`, so that is a PURCHASED Icelandic label rendered
white on white: absent, not mis-coloured.** "Unreliable colour" and "the label you paid for
disappears" are not the same disclosure.
▶ **Fixed:** dispatch is on the colour space, and an unrecognised space returns `None`, which
`compose.cmyk` and `svgout` render BLACK — the behaviour `_fill`'s own comment ("a fourth colour
space showing up must be VISIBLE rather than quietly turning black") was reaching for, black being
visible and white not. Measured after: white runs 18 → 0, with the DeviceCMYK `k=1.0` control on
the SAME figures unchanged. Pinned BY VALUE at `test_readlayer.py` CASE 7c — which 7b structurally
could not do, being a shape test over a population that excludes all three figures.
⚠️ **The three figures are still counted here, and must be:** they still carry an unrecognised
space, the fill is still not *known* to be right, and 7c uses that very count as its non-vacuity
denominator. What changed is that the failure is now the VISIBLE direction.

### The `\x1f` hazard, re-measured on the full population

`readlayer._looks_undecoded` condemns every character below `0x20`, but under an
`/Encoding /Differences` font **`\x1f` is a real Greek alpha** (`'\x1f bond'` is a genuine block
key in this corpus), so that is a correct read being called garbage. Since R4b the same predicate
also decides **spend** through `figtext.sendable`, so the consequence is **"a real label is never
bought"**, not merely "a font is flagged" — a silent omission from a purchased chapter that no count
can see, because the block is simply absent from the payload.

| in the candidate's own output, over 817 figures | |
|---|---:|
| figures whose text contains `\x1f` | **0** |
| figures whose text contains **any** sub-`0x20` control byte | **0** |
| total control bytes emitted | **0** |

**Latent, not firing** — and now measured over the whole in-scope population rather than the code
comment's 120 figures. ⚠️ **The zero is meaningful only because the same pass proves the reader
emits no control bytes at all**, which is separately the evidence that H2's replacement of the
baseline's control-byte garbage is complete.

⚠️ **Do not confuse this with C1's excused `'\x1f': 73`.** That counts `\x1f` in the **baseline's**
output which the oracle does not attest — i.e. the old reader's mojibake being correctly dropped.
The two numbers describe different readers.

**Status of this hazard is [`REGISTER.md`](REGISTER.md)'s**, including why it was left alone.

---

## Criterion 5 — the round trip

**This is the only check that can see English surviving *underneath* the composed Icelandic**, which
C1–C4b structurally cannot: they compare readers to each other, never the composed image to reality.
With `--control` (the figure's own English re-injected) `check.py` is a **true oracle** — its own
docstring says *"any disagreement is our defect, not a translation."*

🔴 **THE FIGURES WERE CHOSEN BY MEASUREMENT, NOT BY NAME.** Both figures an earlier draft named are
unusable: `CNX_Chem_01_01_SciMethod` has **forms = 0**, so R3's walk is a no-op on it however green
it comes out; `CNX_Chem_02_00_Biomarkers` dies on `check.py`'s size guard (published 1348×600 vs our
1300×600). The selection conditions were *the published raster matches our 200 dpi `pdftocairo`
render exactly* **and** *the figure has `/Form` XObjects whose streams contain `BT`*.

🔴 **DO NOT GATE ON `check.py`'s PERCENTAGE — THIS RUN IS THE DEMONSTRATION.** Its own header warns
that antialiasing between two rasterisers swamps layout error. Measured here on one figure, one
arm apart:

| arm A — `CNX_Chem_02_04_Isomers2` | ITEMS drawn | `check.py` pixels > 40 |
|---|---:|---:|
| **old** reader | **9** | 1.12 % |
| **new** reader | **33** | 1.14 % |

▶ **The new reader drew 24 more labels and the scalar got 0.02 points WORSE.** A numeric threshold
here is a gate that cannot see the thing it is guarding.

**What can see it is `ITEMS`, compared run-for-run** — the drawn string plus its x/y/size/weight/
fill, externalised through `compose.py --svg`'s `<text>` elements (no change to the composer was
needed):

| arm A — `CNX_Chem_02_04_Isomers2` (page-text; 44 forms containing text) | |
|---|---|
| strings **gained** by the new reader | **24 occurrences / 6 distinct** — `C` ×8, `CH2` ×6, `CH3` ×4, `H` ×2, `CH` ×2, `O` ×2 |
| strings **lost** | **0 occurrences / 0 distinct** |
| shared occurrences paired and compared | **9 of 9** (non-vacuity denominator) |
| of those, differing in x/y > 1 pt, size > 0.5 pt, weight or fill | **0** |

The gained strings are chemical formulae living inside the `/Form` XObjects — precisely the scope
the old reader never saw.

✅ **A third instrument corroborates COMPLETENESS, not merely improvement.** The census records
poppler's word count per figure, and it was not consulted when choosing these figures:

| figure | poppler words | ITEMS the new reader drew | ITEMS the old reader drew |
|---|---:|---:|---:|
| `CNX_Chem_02_04_Isomers2` | **33** | **33** | 9 |
| `CNX_Chem_02_04_Question4a_img` | **12** | **12** | — (raises) |

▶ **The new reader draws exactly as many strings as an independently implemented tool finds words**,
on both arms. A reader that merely gained *some* form text would land short of this.

⚠️ **THE TWO SIDES ARE NOT THE SAME UNIT, AND THE MATCH IS ONLY MEANINGFUL BECAUSE OF THESE FIGURES.**
`ITEMS` counts drawn strings *after* block merging; poppler counts **words**. They coincide here
because every label on both figures is a single token — chemical formulae and element symbols. ▶ **On
a figure with multi-word labels the two numbers SHOULD differ**, and a future reader running this on,
say, `CNX_Chem_01_01_SciMethod` (92 words, prose labels) must not read the mismatch as a defect.
This is corroboration on a favourable population, not a general identity.

| arm B — `CNX_Chem_02_04_Question4a_img` (form-text-only; 12 forms containing text) | |
|---|---|
| old reader | **`AttributeError: /Font` — raises. There is no old arm.** |
| new reader | 12 ITEMS (`H` ×8, `C` ×4); `check.py` 1.68 % |

🔴 **THE TWO ARMS DID NOT GET THE SAME CHECK, AND SAYING SO IS PART OF THE RESULT.** Arm A has a
run-for-run `ITEMS` comparison because both readers produce output. Arm B **cannot** have one: the
old reader crashes, so its only evidence is the `--control` overlay against OpenStax's published
raster. That is the whole point of the form-text bucket, but it means arm B's evidence is weaker in
kind, not merely in quantity.

---

## R3's `/Form` walk, on the source shapes R3 never exercised

R3's strip-text evidence was **`.pdf` rows only**. Ruling **R-5** found the `.eps` arm failing
**0 of 318** on a different axis, so "we did not check EPS" was not a safe silence.

### `.eps` — R3's walk is a NO-OP on every EPS figure, and that is a finding

| | |
|---|---:|
| `.eps` census rows in scope | 280 |
| evenly-spaced sample staged through `gs` and stripped | 60 |
| figures whose staged PDF contained `BT` before stripping | **60 / 60** |
| figures with `BT` remaining anywhere reachable after stripping | **0 / 60** |
| **`/Form` XObjects visited across all 60** | **0** |

🔴 **Ghostscript's `pdfwrite` emits no `/Form` XObjects, so the form walk R3 exists for cannot
execute on an EPS-sourced figure at all.** Text removal itself works — 60 of 60 clean.

🔴 **CORRECTED 2026-09-07 — THAT "60 of 60 clean" WAS MEASURED WITH BT-RESIDUE, THE ONE INSTRUMENT
THIS DOCUMENT ITSELF PROVES CANNOT FAIL HERE.** Line 394 below says it in as many words: *"BOTH
ARMS LEAVE ZERO BT … A test asserting only 'no reachable stream contains BT' therefore PASSES ON
THE WRECKAGE."* The pixel arm that could have seen it was selected on `forms > 0` — a property
`gs`'s `pdfwrite` guarantees is 0 for every EPS — so the `.eps` pixel population was **empty by
construction**, and the surviving claim was a saturated rate from a blind instrument over exactly
the population where the defect lived.
▶ **What it was blind to:** `BT` are two ordinary bytes and they occur inside the FLATE PAYLOAD of
an inline image, which only `.eps`-sourced figures carry here. `re.compile(rb'BT.*?ET', re.S)` then
matched from inside the payload forward to the next real `ET`, deleting the image's tail and every
drawing operator between. **6 of 817 figures, 8 matches; `CNX_Chem_09_03_BoylesLaw1` lost 147,074
non-white pixels — 53.9% of its drawing, the pressure gauge and BOTH Boyle's-law graphs** — while
`bt_blocks()` reported 0 and `pdftotext` reported 0 words on the wreckage.
✅ **Fixed:** the scan is `pikepdf.parse_content_stream`, where an inline image is its own
instruction and its payload is never scanned; an unparsable stream RAISES rather than falling back.
**Corpus reach, all 817 in-scope figures: 817/817 stripped, 0 parse failures, inline images
conserved 18,941 → 18,941 exactly.** `test_readlayer.py` CASE 14j-14m anchors on a TOKENISER and on
pixels — never on `BT.*?ET` — and 14k is a serialiser control, since every stream now re-serialises
and "the bytes changed" no longer implies "something was removed". **14j plants the evidence
first**: the byte regex must be shown destroying this figure's artwork before the fix is asserted.

⚠️ **State this as a property of the CONVERTER, not of EPS.** The claim measured is *"gs's output
carries no forms"*, **not** *"EPS files contain no form-like structure"*. The original PostScript
may well; `gs` flattens it. The operative consequence holds either way, because **the pipeline
always routes EPS through `gs`** — `readlayer.read`, the harness's `staged()` and this probe all use
the same invocation.

⚠️ **Both instruments here sit downstream of that same `gs` step** (the census stages EPS through
`gs` at `text-coverage-census.py:88-91` before counting forms), so their agreement — 0 of 294 `.eps`
rows with forms, against **402 of 601** `.pdf` rows carrying **10,234** forms — is *corroboration of
the converter's behaviour*, not two independent views of the EPS files.

### Ruling R-9, measured at population scale with the mutant that proves the check can fire

The first pass flagged "artwork loss" on EPS figures with `forms = 0` — where R-9's failure mode is
**structurally unreachable**. Those drops are text removal on figures that are almost nothing but
text: `CNX_Chem_00_HH_chemform2_img` is `words: 1, forms: 0, images: 0`, so blanking it is *correct*.
▶ **An absolute ink threshold is the wrong instrument.** The right one is a two-armed comparison on
the population where R-9 *can* fail:

- **REAL** — `strip_text()` as shipped: `form.write(new_bytes)`, mutating the existing object.
- **MUTANT** — R-9 re-planted: `pdf.make_stream(new_bytes)` assigned over the XObject, which
  discards `/Subtype /Form`, `/BBox`, `/Matrix`, `/Resources` and `/Group`.

Over **25 evenly-spaced figures of the 402 `.pdf` census rows with `forms > 0`** (1,304 forms
visited):

| | figures |
|---|---:|
| mutant destroys ink the shipped in-place write preserves | **8 / 25** |
| mutant pixel-identical to real (those forms carry no drawing) | 17 / 25 |
| **`BT` remaining after stripping — REAL arm** | **0 / 25** |
| **`BT` remaining after stripping — MUTANT arm** | **0 / 25** |

| figure | forms | real kept | mutant kept | mutant as a share of real |
|---|---:|---:|---:|---:|
| `CNX_Chem_02_04_MethaneRep` | 7 | 84.6 % | **2.2 %** | **2.5 %** |
| `CNX_Chem_08_03_spC` | 6 | 77.5 % | **3.7 %** | **4.7 %** |
| `CNX_Chem_08_02_sp3Geom` | 44 | 91.3 % | 25.1 % | 27.5 % |
| `CNX_Chem_08_02_HybrdOrbit` | 91 | 96.9 % | 62.5 % | 64.5 % |
| `CNX_Chem_04_01_rxn3` | 8 | 97.0 % | 66.2 % | 68.3 % |
| `CNX_Chem_20_01_alkanes` | 34 | 86.8 % | 76.8 % | 88.5 % |
| `CNX_Chem_06_03_Qnumbers` | 1 | 76.4 % | 68.9 % | 90.2 % |
| `CNX_Chem_01_05_Archer2_img` | 16 | 98.0 % | 97.7 % | 99.7 % |

🔴 **BOTH ARMS LEAVE ZERO `BT`. A test asserting only "no reachable stream contains BT" therefore
PASSES ON THE WRECKAGE — on 25 of 25 real figures.** Ruling R-9 argued this from one figure; it is
now measured. **The non-white pixel count is the only assertion that can see the failure**, and it
earns its zero here because the mutant arm goes red on 8 of the same 25.

⚠️ **On 17 of 25 the two arms are pixel-identical**, which matches `strip_text`'s own docstring:
on this corpus the forms that *draw* carry no text, and the text sits in sibling forms. ▶ **So a
regression to `make_stream` is invisible on two thirds of the figures you might sample** — which is
why the check belongs on a figure chosen because it *draws inside a form*, not on an arbitrary one.

**The `.eps` arm of this control has an EMPTY population** — `0` of 294 `.eps` rows have
`forms > 0` — recorded here with its denominator rather than as a passing zero.

---

## Populations NOT exercised, stated rather than left silent

- **The census's `unresolved` rows (253).** Not in the delivery at all after de-hashing, so there is
  no file to stage, read or strip. Nothing about the read layer can be measured on them.
- **The census's `ours-crashes` rows (38) through `strip-text`.** They *are* inside the acceptance
  run above (they are one of the five in-scope buckets, and the candidate reads 37 of 38), but they
  were not put through the R-9 two-armed probe as a bucket. The probe's population was selected on
  `forms > 0`, which is the property that decides whether R-9 can fail, and that selection crosses
  buckets rather than following them.
- **A second EPS→PDF converter.** None exists on this box, so whether `gs` itself drops text before
  either reader sees it remains unanswerable by a reader-vs-reader check. Criterion 5 is the only
  instrument that could see it, and it was run on `.pdf` sources.

---

## CI — the Python suite is NOT a gate

🔴 **NO WORKFLOW RUNS PYTHON.** Measured over all seven files in `.github/workflows/`:
`python` / `pytest` / `.py` match **0** lines, and the **control** — the same grep for `node` over
the same directory — matches **25**, so the zero is an absence rather than a grep that could not
see. Adding Python to CI is explicitly **out of scope** in the read-layer contract. ▶ **Every assertion in this experiment is hand-run.** A green root `npm test` is not
evidence about any of it, and neither is a green Actions tab.

Run them from `experiments/figure-text-translation`, with `FIGTEXT_PYLIBS=./pylibs` exported:

| command | what a pass looks like |
|---|---|
| `python3 -u read_layer_accept.py --selftest` | a terminal `ALL … PASS` line, **exit 0** |
| `python3 -u read_layer_accept.py --candidate --json <f>` | a terminal `VERDICT: exit 0` line naming 0 C1 regressions, 0 C1b silent reductions and 0 C2b oracle shortfalls, the last with its in-scope denominator printed beside it |
| `python3 -u test_readlayer.py` (and `test_sendable`, `test_blockkey_consumers`, `test_c4b_multiset`, `test_figtext_normalise`, `test_sources`) | a terminal `ALL PASS` line, **exit 0** |

⚠️ **They are NOT pytest suites and `pytest` is not installed here** — each is a plain script that
prints `ALL PASS` or `N FAILED: <names>` and exits 0/1. `python3 -m pytest` fails with
`ModuleNotFoundError`, which is easy to misread as a broken suite. **Run each file directly.**

**No count is recorded here** — run them and read what they print. ⚠️ **`--selftest`'s assertion
count is an enforceable value; its owner is `read_layer_accept.py`'s `selftest()` and the assertion
list it prints.**
