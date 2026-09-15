# §C140 exocytosis spike — adversarial verification

2026-09-13. 0 ISK: nothing that calls the MT was run. Scratch: `/home/siggi/dev/scratch-c140/exo-v/`.
The efni repo was only read, and no repo module was imported.

⚠️ **`PYTHONDONTWRITEBYTECODE=1` was NOT set on every python call.** Four calls lacked it:
- two `python3 -c "from PIL import Image …"` image-size probes, one run with cwd inside `experiments/figure-text-translation`;
- the `python3 -` summary of the sweep results;
- the `python3 -c` that counted distinct uncollapsed paints.

All four imported only the stdlib or PIL, which cannot write into the repo. The `find -newer` check below is empty.

**Provenance labels.** Everything not labelled otherwise was measured in this session. **Inherited, not re-run:**
- the 2^116 reference-cost model and the chain-length bisect (I tested the fix causally, not the model);
- the corpus census and the IcePack / HybrdOrbit probes;
- ⑩'s heal findings (mask-491) and the commute claim;
- prep's 3.89 s compose time;
- that the June copy embeds a raster (I only rendered it).
Chromium = Playwright's `chromium-headless-shell` 1234, through an `<img>` host page (my own harness, `exo-v/tools/rend.mjs` + `one.sh`).
- One browser ran at a time. The hard timeout was ≤ 300 s.
- A memory gate of ≥ 2,560 MiB available was checked before every load.
- Survivors were checked after every load by tracking my own process tree, plus `pgrep -x` for `chrome-headless`, `headless_shell` and `chrome`.
- **0 survivors** in every run.

## Verdict

**The diagnosis and the fix hold up. On exactness the evidence is now stronger than the spike's.**
- My parser-based fix shares no code with the spike's regex fix, and produces the **same bytes on all 34 figures**.
- The pass changes the same 3 figures by the same byte counts.
- Every one of the 155 collapsed exocytosis paints is pixel-exact in context. The spike covered paints 81–158 "by construction only"; I tested all of them.

**One claim needs a caveat.** "Pixel-faithful vs source.png" uses a reference that is not gold. The largest coherent place where Chromium differs from `source.png` is a dark outline on two myelin segments (up to 138 L).
- That outline is **absent from OpenStax's own published raster too**, and Chromium matches that raster better in that box.
- So the gold favours Chromium there. But the gold is a 700 px JPEG, which could blur a 1–2 px stroke, so this does not settle whether cairo or Blink reads the artwork correctly.
- The fix is not implicated: the sweep shows 0 Δ.

## 1. Reproduction, with controls

Unit: one load, DSF 1, `<img>` at the source.png pixel size.

| file | bytes | load / paint ms | peak tree RSS MiB |
|---|---|---|---|
| **committed `CNX_Chem_03_01_exocytosis-88f6_IS.svg`** | 24,921,365 | **never complete, 60,000 ms budget** | 1,077 |
| same file | | **never complete, 270,000 ms budget** (node killed at the 300 s hard cap) | 1,087 |
| control: brain-ec0b `_IS.svg` | 4,974,913 | 122 / 171 | 595 |
| control: brain-ec0b prepared `artwork.svg` | 4,964,452 | 141 / 139 | 594 |
| control: HClsoln `_IS.svg` (2 blend paints) | 481,229 | 109 / 312 | 594 |
| control: June copy in `05-publication/mt-preview` | 254,774 | 67 / 261 | 564 |
| **committed exocytosis + my pass** | 24,921,365 | **2,062 / 1,027** (repeat render 804,000/804,000 px identical) | 1,026 |
| committed exocytosis + my pass, DSF 2 | | 2,087 / 3,323 | 1,078 |

**Process check.** In the middle of the 60 s run, `pgrep -x chrome-headless` found 6 PIDs, while `pgrep -x headless_shell` and `pgrep -x chrome` found 0. This confirms the spike's finding that the prescribed survivor check is blind.

## 2. Independent fix: `exo-v/fix/lerpcollapse.py`

**How it works.** It parses the file with ElementTree and checks semantics, not cairo's text shape:
1. An add filter is 2×`feImage` plus `feComposite arithmetic k1=0 k2=1 k3=1 k4=0`, with the default filter region and equal subregions SR.
2. R is a `g` carrying only `id`, `filter` and `mask`, containing one rect whose box equals SR. R's filter is a 2-image `feBlend` with the same SR.
3. Ma is a plain `<mask>` holding one `use` of a group E. E's **last** child is an opaque white rect that covers SR after E's translate.
4. L is a `g` carrying only `id` and `mask`. Mb is a plain `<mask>` holding a `use` of a group E2 through a filter whose matrix is exactly `0 0 0 0 1 / … / 0 0 0 -1 1`, and E2 is opaque over SR.

It then byte-replaces `filter="url(#F_add)"` → `filter="url(#F_blend)"`, and asserts that the byte count equals the number of referencing elements found by the parse.

**Over all 34 prepared `artwork.svg`** (`exo-v/out34/cmp34.json`):

| outcome | figures |
|---|---|
| byte-identical after my pass | **31** |
| — of which have no add filter at all (vacuous) | 30 |
| — rxn3: 6 add filters, all rejected because E ends in a clipped `g` | 1 |
| exocytosis | 155 collapsed, 155 bytes changed; rejected `filter-101`, `-131`, `-139` (the same three as the spike) |
| sandwich | 52 of 52 collapsed, 52 bytes changed |
| HClsoln | 2 of 2 collapsed, 2 bytes changed |
| **my output == the spike's output** | **34 of 34** |

In every collapsed paint, F_blend's id is F_add − 1 (checked, 0 exceptions) and L's `use` target equals the blend's destination.

## 3. Exactness

### What the fix does, in SVG terms

The task framing, "replace a uniform-rect mask with opacity", is **not** what the fix does. The fix retargets the use site from `add(R·Ma, L·Mb)` to the blend filter itself, so both masks and the L term drop out. It is exact when all of the following hold:
- **Ma is 1 on SR.**
  - Ma is a luminance mask by default. Its content ends in an opaque white rect over SR, so after source-over the colour is white and alpha is 1.
  - White is a fixed point under sRGB and linearRGB, and the luminance coefficients sum to 1. So `color-interpolation` on the mask cannot move it.
  - The default mask region is −10%/120% of R's bbox, which is SR, so the region covers SR.
- **Mb is 0 on SR.** The invert matrix gives alpha′ = 1 − 1 = 0 wherever E2 is opaque.
- **The arithmetic term is exact.** k2·R + k3·0 = R.
- **The crop is unchanged.** The blend's filter region at the use site is the bbox of the use site's rect, which is SR: the same crop R had.

**Where it could still differ:**
1. **Anti-aliased SR boundary pixels**, where Ma is strictly between 0 and 1. That is only possible if the SR boundary falls inside the picture.
2. **The extra rendering level.** The original has one more level (R → `feImage`, whose `color-interpolation-filters` defaults to linearRGB → `feComposite` in sRGB). That is a possible 8-bit round trip in an engine that quantises intermediates.

### (1) The boundary is outside the picture — static walk (`exo-v/tools/srwalk.py`)

The walk follows children, `use`, mask content and `feImage` element references, and records every CTM at which each collapsed use site is reached.

| figure | collapsed paints reached | reached with | SR covers the whole viewBox |
|---|---|---|---|
| exocytosis | 155 of 155 | 1 CTM each | 155 |
| sandwich | 52 of 52 | 1 CTM each | 52 |
| HClsoln | 2 of 2 | 1 CTM each | 2 |

So the anti-aliased edge where the lerp and the blend could differ lies **outside the rendered picture at every scale**.

### (2) The extra level is lossless in Chromium — uncollapse sweep (`exo-v/sweep/results.txt`)

Starting from the fully fixed reader file, a block of ≤ 10 collapsed paints was restored to cairo's lerp, rendered, and compared with the fully fixed render.
- **Coverage:** 17 renders; the union of restored paints is 155 of 155.
- **Result:** **all 17 are 804,000 / 804,000 px identical, max channel Δ 0.** Load 2.1–2.8 s each.
- **Positive control:** the same top block (145:155) with its `feBlend` modes set to `normal` changes 357 px (327 by > 8, max Δ 133), all in the myelin region. The instrument sees those paints.
- **Determinism control:** a repeat render of the full fix is identical.
- **DSF 2:** blocks 145:155 and 60:70 restored are 3,216,000 / 3,216,000 px identical.

This closes the spike's named gap ("paints 81–158 have no Chromium before"). **The fix changes 0 pixels on exocytosis in Chromium** at DSF 1 and DSF 2.

### (3) The other two figures that change, before and after

Unit: full-height render at reader size, DSF 1.

| figure | px identical | max Δ | non-white px | load / paint ms, before → after |
|---|---|---|---|---|
| HClsoln | 540,150 / 540,150 | 0 | 157,851 | 109 / 312 → 164 / 80 |
| sandwich | 934,700 / 934,700 | 0 | 405,118 | 16,401 / 6,326 → 14,164 / 605 |

**Answer to "name any figure where the fix changes pixels": none found.**
- Population: the 3 figures the pass touches among the 34, measured in Chromium at DSF 1 (all 3) and DSF 2 (exocytosis only).
- The 31 untouched figures are byte-identical, so they cannot change.

### Diagnostic side checks on exocytosis

Unit: one render each, compared with the full fix.
- **forceclip**, the 3 clipped paints also collapsed with their clip ignored: 804,000 / 804,000 identical. In Chromium the clip of those 3 paints makes no pixel difference.
- **noclippaint**, the sources of the 3 clipped paints removed: 950 px differ, 127 by > 8, confined to y 35–68, x 106–230. So those paints do draw, and the forceclip null is not vacuous.

## 4. Fidelity against source.png, with a text-ink mask

**Mask:** dilate by 3 px the union of |L(source.png) − L(cairo artwork.png)| > 10 and |L(Chromium `_IS`) − L(Chromium artwork)| > 10.

| render | N px compared | px with \|ΔL\| > 20 | mean \|ΔL\| |
|---|---|---|---|
| fixed exocytosis `_IS` | 787,303 | 6,652 (**0.845 %**) | 0.63 |
| control: brain `_IS` | 466,549 | 1,962 (0.421 %) | 1.22 |

The spike reported 0.843 % (N = 788,872). With dilation 5 the result is 0.849 %.

**The residual is not uniform noise.** Clusters (`tools/clusters.py`): 318 clusters; the largest is 1,510 px, scattered along the synapse membrane. The second, **347 px at y 175–245, x 225–260, loses the dark outline of the last two myelin segments**:
- source.png pixel (240,240) is (19,26,21); Chromium draws (94,117,85); up to 138 L brighter.
- This is visible at ×4 and ×5 (`exo-v/r/exo_cluster2_x5.png`).

**What it is not:**

| hypothesis | test | result |
|---|---|---|
| the fix | sweep | identical, so not the fix |
| the 3 clipped paints | noclippaint | 0 px changed in that box |
| embedded images | all 37 `<image>` hidden | 83,373 px change overall, only 22 in the box |
| screen paint `filter-213` (a soft-masked source over the axon) | source removed | 0 change in the box |
| ⑩'s ring | spike's healed render `exo/heal/h_v1.png` | same 348 px brighter by > 20 in the box; heal leaves it untouched |
| chain truncation | head retargeted to `filter-294` / `-276` | never dark at those k either |

**The construct is not identified.**

**Control against the actual gold.** Checked against OpenStax's published raster:
- **The June published copy** (`05-publication/mt-preview/…/CNX_Chem_03_01_exocytosis-88f6_IS.svg`, 254,774 B, rendered in Chromium) **also lacks those outlines** (`exo-v/r/exo_myelin_source_june_fix_x4.png`).
- **The OpenStax JPG** `01-source/media/CNX_Chem_03_01_exocytosis-88f6.jpg` (700×390, resampled to 1200×670), in that box:

  | render | mean \|ΔL\| vs JPG | px with \|ΔL\| > 20 |
  |---|---|---|
  | Chromium fixed | 6.96 | 362 |
  | cairo source.png | 11.82 | 507 |

- Over the whole figure cairo is slightly closer to the JPG: mean |ΔL| 2.79 vs 3.09. The resampled 700-px JPG is a blunt instrument, so this is corroboration, not a measurement of fidelity.

**So the gold favours Chromium in that box.** OpenStax's published raster lacks the outline, just as Chromium's render does.
- A 1–2 px dark stroke at 1200 px is about 1 px at the JPEG's 700 px, where compression can blur it.
- This therefore does **not** prove that cairo is wrong and Blink is right; the construct is unidentified.
- It does mean that, measured against what readers see today, this is not evidence of a regression.

**What this means for the spike's number.** "0.827 % … the tight end of the renderer-noise band" mixes reference-side artefacts with renderer differences, and its calibration is not noise either:
- brain's 0.416 % contains ⑩'s visible ring: 521 px by the spike's own §7, about a quarter of brain's roughly 1,960 px over 20.
- **Neither number bounds fidelity against the gold**, which is `01-source` plus OpenStax's published output.

## 5. Other checks

- **Discriminating control** (arithmetic kept, L emptied):
  - Its generator is not saved in `exo/`; only its output is.
  - Reconstructed by byte arithmetic: the file is 6,643 bytes shorter, which is **exactly** the L `use` lines of the 155 collapsed paints (all 158 would be 6,772). So the control is well-formed.
  - Its PNG equals the spike's `v1.png` at 804,000 / 804,000.
  - The spike's `v1b.png` equals my independent render of my own fixed `artwork.svg`, 804,000 / 804,000.
- **Rollout path.** Both tracks' ch03 HTML already reference `CNX_Chem_03_01_exocytosis-88f6_IS.svg`. The file there is the 254,774 B June version (last touched by `d2095274`), and it differs from `books/efnafraedi-2e/media/…_IS.svg` from byte 2. So the spike's claim holds: the next render + sync replaces a working file with the 24.9 MB SVG.
- **Cost of the spike's regex pass:** 8.48 s on exocytosis and 1.84 s on sandwich, 122 MB peak for both runs. Prepare composed exocytosis in 3.89 s (inherited from prep.md). My parser version takes 5.9 s and 208 MB. This is not a defect, but the regex version does about five whole-text searches per add filter.

## Defects found

1. **Arithmetic in the spike report (§5):** "31 byte-identical (27 have no add filter; rxn3 …)". The correct figure is **30** with no add filter, so 30 + rxn3 = 31. Consequence: "31 of 34 byte-identical" is 30 vacuous files plus 1 real identity. Only 4 of the 34 figures exercise the pass at all.
2. **The fidelity claim is framed against a non-gold reference.** The largest coherent Chromium-vs-source.png divergence on the fixed exocytosis is the lost dark outline on two myelin segments (347 px, up to 138 L). OpenStax's published raster lacks the outline too, and Chromium is closer to the JPG in that box (6.96 vs 11.82 mean |ΔL|). So the spike's "renderer-noise band" is not noise on either side:
   - on the exocytosis side it contains cairo-side artefacts;
   - on the calibration side it contains ⑩'s visible ring on brain.

   This does not implicate the fix. It does mean 0.827 % / 0.843 % should not be cited as a bound on fidelity. Whether cairo or Blink is "right" about the outline is unsettled: the only gold available is a 700 px JPEG.

## Fold-in and cost

**Fold the collapse in, as its own commit, before the heal.** My evidence meets the conditions: exact in context for 155 of 155 paints, 0 Δ on all 3 changed figures, and byte-equal with the spike's pass on 34 of 34.

**I do not rule on the spike's (ii), the heal finding.** It was not re-run here.

**Where the pass goes.** `strip-text.py` passes `out_svg` straight to `pdftocairo -svg`. So the pass needs a read → edit → write of the ~25 MB file inserted right after that call, which is the same slot ⑩ needs.

**Cost:** the spike's regex version takes 8.5 s and 122 MB on exocytosis, against a 3.89 s prepare (inherited), so it roughly triples prepare time on the one figure that needs it. My parser version takes 5.9 s and 208 MB.

**Regression population:** only 4 of the 34 figures exercise the pass at all. The heavier corpus carriers (IcePack, HybrdOrbit, OxyacTorch) are the real test population, and their numbers are inherited and the figures not bought. HClsoln, at 481 KB with 2 paints and a renderable "before", is a cheap fixture.
3. **An evidence artefact is not reproducible.** The generator for the discriminating control (`ctl_emptyL.svg`) is not saved. It was verified here by byte arithmetic, not by re-running.
4. **The prescribed survivor check is blind (re-measured).** `pgrep -x headless_shell` / `pgrep -x chrome` return nothing while 6 `chrome-headless` processes are alive.

## Misses (named)

- **Firefox and WebKit are not measured.** `~/.cache/ms-playwright` holds only Chromium builds, and no system `firefox` exists. The spike's inference that Firefox cannot render cairo's element-referencing `feImage` is untested. If it is right, all 4 carriers render wrong in Firefox with or without this fix.
- **The construct behind the myelin-outline difference between cairo and Chromium/OpenStax is not identified.** Five hypotheses were eliminated (§4).
- ⑩'s commute claim and heal findings were not re-run.
- **Corpus exposure was not re-run:** IcePack, HybrdOrbit and the census are inherited.
- **Sandwich's residual 14 s load was not investigated.**
- **Scale coverage is partial.** Exactness is shown at DSF 1 at source pixel size (all 3 changed figures) and DSF 2 (2 exocytosis blocks). The static walk makes it scale-independent in principle; a phone-width render was not done.

## Housekeeping

`git status --porcelain` (efni) returned exactly one line, not mine:

```
?? docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md
```

`find experiments/figure-text-translation -newer reports/critic.md -not -path '*/pylibs/*' | head` returned nothing.

No browser processes remain.
