# critic

## Headline

⑥ should be two PRs, STIX first. The STIX half is ruled on and needs only font changes if it touches only kept runs: 42 of 45 symbol blocks in 10 figures. The kerning half is an unruled design choice. Its per-run fix from the data reaches none of the kept runs in the 34 in translated mode, and its real fix touches translated labels. I could not check the explorer reports: they never reached me, so I re-checked the evidence they rest on.

## Findings

- ## 0. What I could critique
- The three explorer reports never reached me. `scratchpad/c6-explore/{composer,kerning,licence}/` are all empty, and the prompt carried only their apologies for not writing a file, not their findings.
- So I could not spot-check "three file:line claims in each". Nothing below critiques text I did not see.
- Instead I re-checked the evidence those reports would cite: the register row ⑥ (campaign plan line 1915), the RESUME ruling (lines 14-23), `COMPOSE-FIDELITY.md`, the compose-fidelity reports 1b/1d/2a with `data/1a-blocks.jsonl`, the licence README and reports, and the composer code. I also ran read-only fontTools probes over font files already on disk.
- ## 1. Claims checked

### Verified
- **45 symbol blocks in 10 figures.** `1a-blocks.jsonl` `has_symfont` gives 45 blocks: 41 never sent, 1 identity (HClsoln), 3 translated. All 3 translated ones are in `CNX_Chem_04_04_sandwich` (matches `1d-completeness.md:29`, "K 41, I 1, T 3").
- **The 34 figures use only `STIXGeneral-Regular`** (`1d-completeness.md:68`).
- **The committed `sandwich_IS.svg` draws `+` and `=` in FigIS (Liberation).** Its three translated `<text>` elements carry `font-family="FigIS"`, and the FigIS Regular subset's cmap contains `+` and `=`.
- **The official STIX 1.1.0 Regular on disk matches the recorded hash** (`5add3f3f…57a7`, `reports/network-captures.txt:7`). It covers `+ = × − – < > → ∞ μ µ` and the Greek letters used, and holds all 19 glyphs the source subsets use (`local-fonts.txt:45`).
- **The pixel damage is where the fidelity doc says.** `figcontainers.py:29-30,91-95` builds source frames from `run['adv']`, not from a cairo measure. So changing the face of a kept run cannot move any translated label's layout.

### Imprecise
- **"883 corpus blocks" mixes faces.** `1b-census.md:178` gives 883 blocks, of which **739 are in composed figures** (193 figures). By face (`1b-census.md:186`): Regular 468, Italic 338, Bold 58, BoldItalic 48, bare `STIXGeneral` 1.
  - Only Regular was compared with official 1.1.0 (licence README lines 37, 40, 137).
  - So roughly half of the corpus exposure is outside what "subset STIX 1.1.0" is known to match.
- **"Symbol offset 2.0 → 0.2 px"** (register row) is `2a-prototype.md:175`'s **0.28** median. It was measured on the `nogeo` ablation, with a font extracted from the PDF and made-up vertical metrics (`stixface.py:73-75`), not on a subset of the official file.
- **"Chromium applies Liberation Sans's kern table"** (register line 1915; `compose.py:169-170`; spec line 101) is right about the values and wrong about the mechanism.
  - The embedded FigIS woff2 has **no** legacy `kern` table: fontTools' subsetter drops it. Chromium applies the GPOS `kern` feature, kept by `svgout.py:31` `layout_features=['*']` (probed on `sandwich_IS.svg`).
  - In system Liberation 2.1.5, all 908 legacy pairs in Regular have the same GPOS value, and none of the 1,107 GPOS-only pairs is a Latin pair (< U+0250).
  - So the numbers stand, but a fix that "drops the kern table" would do nothing.

### Contradicted
- **"A gap can only widen" / "which can only widen a gap"** (`compose.py:169-170`, `figscripts.py:445-447`, register line 1915).
  - Liberation Regular has **68 positive** legacy kern pairs. The Latin ones are `f’` (+37 units) and `r’` (+76 units); the rest are Greek and Cyrillic.
  - A segment containing `r’` or `f’` draws **longer** than cairo measured, so an overlap is possible.
  - How many of the 34 are exposed is not measured.
- **The per-run kerning case has no exposure on the 34 as published.**
  - All 6 runs "the source set unkerned" (`2a-prototype.md:186`: rxn2 `Coefficient` ×2, flowchart `of A` ×2, moleratio2 `Avogadro’s`, exocytosis `Vesicles`) sit in blocks whose `cls` is `sent-translated` in `1a-blocks.jsonl`.
  - The data-driven `font-kerning` choice (`plusvariant.py:55`, kept items only) therefore reaches **0 kept runs in translated mode**. The gain reported at `2a-prototype.md:188` was measured in control mode.

### What the prototype does not meet
- **The 2026-09-13 font fails the ruling on its own wording.** It sets family and CFF name `FigSTIX` (`stixface.py:34,71,74`) and writes no copyright or trademark notice.
- **Reusing `svgout.subset_face` as-is would also fail it.** It sets no `name_IDs`, and fontTools' default is `[0..6]` (`local-fonts.txt:64`). So:
  - trademark ID 7 is **dropped**;
  - IDs 1, 3, 4 and 6 keep `STIXGeneral`, `FontMaster:STIXGeneral-Regular:1.1.0` and `STIXGeneral-Regular` (probed);
  - the CFF top dict keeps `fontNames=['STIXGeneral-Regular']`, `FullName`, and `FamilyName='STIXGeneral'` (probed). These CFF names are not in the evidence's name-ID mapping, and the design must cover them.
- ## 2. Unverified premises the design must not inherit
- **The ruling as worded is narrower than "every stricter reading".** The RESUME text (plan lines 19-23) says "a font-family name containing neither 'STIX' nor 'TM Math'". The evidence's strict readings also cover:
  - individual words of a reserved name (FAQ 5.4, README lines 91-92), so `Fonts`, `TM` and `Math` too;
  - "other mechanisms that specify a font" (5.3), meaning name IDs 1/3/4/6/16/17/21/22 and, by extension, the CFF names.
  - The ruling claims to satisfy every stricter reading. That is true only if the design renames the internal records and avoids all four words; it should state that it does.
- **The licence text to embed has no recorded hash.** `network-captures.txt` §A hashes only the two STIX OTFs, the Liberation 1.07.4 tarball and `OFL-FAQ.txt`. The STIX 1.x `License/` document the README cites (claim #31) was never pinned.
- **No durable copy of STIX 1.1.0 exists.**
  - `dpkg -l` lists only `fonts-liberation 1:2.1.5`, and `/usr/share/fonts/*/stix*` does not exist.
  - The only copies are in this session's scratchpad, which is temporary.
  - Debian's `fonts-stix` is 1.1.1, which was never compared.
- **OFL.txt contains `--`** (scratchpad copy: lines 23 and 25 are dash rules, and line 55 reads `-- in part or in whole --`). `--` is illegal inside an XML comment, and an ill-formed SVG will not render in `<img>` at all.
  - So the licence text cannot go in a comment; it has to go in an escaped `<metadata>` or `<desc>`.
- ## 3. What still needs measuring

### Free, no render
1. **Re-count STIX runs on the current 34.** The 1a data dates from 2026-09-13; the prepare step has changed since (R14 colour spaces, ⑦ glyph repair, ④ strip). Needs a `figure-prepare` re-run at 0 ISK.
   - Assert: 42 kept + 3 translated blocks, face Regular only.
   - Assert: every character of every STIX run is in the official cmap.
   - Assert: `blocks.json` keys are byte-identical.
2. **Unit test on the renamed subset.** No name record (IDs 1-6, 16, 17, 21, 22) or CFF string (`fontNames`, `FullName`, `FamilyName`) contains `STIX`, `Fonts`, `TM` or `Math`, and IDs 0 and 7 plus the CFF `Notice` are kept verbatim.
   - Positive control: the same test fails on the prototype's `FigSTIX`.
3. **An XML-parse test** of every composed SVG with the licence metadata present.
4. **Download and hash the STIX 1.1.0 licence document** (network, later).
5. **Before any corpus run beyond the 34:** download official 1.1.0 Italic, Bold and BoldItalic, and extend `local_fonts.py`'s §2b comparison to the 37 Italic, 9 Bold and 1 BoldItalic PDFs. The 5 TrueType objects and 1 CID TrueType object also need a route; they are not CFF.
6. **Census of `r’`/`f’` and other positive-kern pairs** inside translated segment texts on the 34.
7. **Corpus census of source-unkerned kept runs,** to decide whether the data-driven per-run kerning is worth building at all.

### Renders, one at a time, later
- **R-a, compose only, 0 ISK:** all 34 in translated mode with the STIX change. Predicted:
  - the `<text>` list is identical in text, x, y, size, weight, style and fill;
  - only `font-family` changes, on the run elements of the 42 kept STIX blocks;
  - the FigIS subsets lose exactly the characters no longer drawn in Liberation;
  - the 24 figures without STIX have identical `<text>` lists (their bytes still differ through `head.modified`, per `1d-completeness.md:40`).
- **R-b, Chromium:** the 10 STIX figures, old against new. Re-run 2a's per-block `bscore_mixed` instrument against the source raster to redo the "plus" result on the real composer with the official subset.
  - Control: remove the new `@font-face` rule and the render must change. A mis-named family falls back silently, which would otherwise read as a pass.
- **R-c, Chromium, kerning PR:** the R12 browser census (lost spaces, collisions, overhangs at 7 scales; `PREDICTIONS.md:105-113`) plus the "28 of 647 short" count.
  - Predicted: 0 short segments with `font-kerning:none` on `path='layout'` items.
  - Positive control: the rule removed brings back 28.
- **R-d:** confirm Chromium honours `font-kerning` in the form the code writes (inline `style` or a `<style>` rule; a presentation attribute may not work). The prototype used inline `style` (`plusvariant.py:71`).
- Firefox and WebKit are not on the box and stay unmeasured.
- ## 4. The smallest design that meets the ruling (STIX PR)

### Font source
- The official `STIXGeneral-Regular.otf` 1.1.0, pinned to sha256 `5add3f3f…57a7`. The composer must refuse on a hash mismatch; failing closed and naming the refusal in `compose-report`.
- **Needs a decision:** commit the file, or keep it in a gitignored local path.
  - Committing it into the public repo is distribution: the OFL text must sit beside it, and root `LICENSE` needs a carve-out, because `experiments/` is MIT.
  - A gitignored path follows the local-box prerequisite pattern (like `pylibs/`).
- Do **not** extract from the PDFs. The ruling says subset 1.1.0, and FAQ 1.14 discourages extraction.

### Which runs
- Only **kept, run-exact** runs (`compose.py:77-114`, which includes identity blocks).
- Only when the BaseFont, with its subset prefix removed, equals `STIXGeneral-Regular`.
- **Do not** key on `figscripts.is_symbol_run` or `SYMBOL_FONT` (`figscripts.py:52,75`). They also match MathematicalPi, Symbol, cmsy and bare `STIXGeneral`, none of which was compared.
- A run with any character outside the official cmap stays in Liberation and is named in the report.
- Italic, Bold and BoldItalic STIX runs stay as today (Liberation with slant and weight) and are counted in the report.
- Nothing on the layout path or the arc path changes.

### Subset
- fontTools subset of the official file to the characters used.
- `name_IDs` includes 0 and 7.
- Rewrite IDs 1, 3, 4 and 6 (16/17/21/22 are absent from 1.1.0), CFF `fontNames[0]`, `FullName` and `FamilyName` to a name free of `STIX`, `Fonts`, `TM` and `Math` (e.g. `FigSym`).
- Keep the CFF `Notice`.
- Drop the `kern` feature. It is harmless either way: STIX 1.1.0 GPOS has 1,016 pairs and **none** among the 19 source glyphs.
- Save as woff2.

### SVG
- Emit the `@font-face{font-family:'FigSym'…}` rule only when a STIX item exists, placed after the FigIS rules so the ordering pin "no italic item emits today's rules in today's order" holds.
- Give those items `font-family="FigSym"`.
- Compute the FigIS character sets from non-STIX items only.
- Put the copyright notice, trademark notice and the pinned OFL 1.1 text in an escaped `<metadata>` element (not an XML comment, per §2). That is about 5 KB, and only in STIX-bearing figures.

### Recompose
- One `COMPOSER_VERSION` bump (`tools/lib/figure-text-sidecar.cjs:30`, currently `'3'`), then `figure-run.js --stale --force` over the 34 at 0 ISK on the branch, verified value by value against R-a.

### Deferred on purpose
- The 3 sandwich translated blocks (see §5).
- The corpus Italic and Bold faces (§3 item 5).
- ㉗: the existing FigIS Liberation subsets keep IDs 1/4/6 containing "Liberation", which is a reserved name. The same strict reading would apply to them; they are out of ⑥'s scope and should be flagged, not fixed here.
- ## 5. Risks that would change the 34 figures' labels, not just their fonts
I read "textgroup" as the `<text>` elements inside `<g text-rendering="geometricPrecision">` (`svgout.py:78`); the term does not occur anywhere in the repo.

1. **Extending STIX into translated labels.**
   - `SourceStyle` is `(ratio, frac, italic)` (`figscripts.py:50`) and has no field for the font.
   - Giving the sandwich `+`/`=` a STIX face would need a new style bit through `FS.transfer`. Any styled segment triggers `split_at_word_edges` (`figscripts.py:440`), which changes the number of `<text>` elements and their x values.
   - It also changes `lin_advance` widths (`compose.py:180`): STIX `+`/`=` is 685/1000 em against Liberation's ~0.572 em. That feeds `figlayout.decide`'s partition, shrink and anchor.
   - All 3 exposed blocks are in sandwich.
2. **Kerning option (b), putting kern pair values into `lin_advance`.** Widths shrink, so line breaks, sizes and anchors can flip on any translated label. Option (a), `font-kerning:none` on layout items, moves no layout decision; the rendered text still shifts by up to 0.99 pt per segment.
   - GPOS and the legacy table agree for Latin, so `plusvariant.py`'s `kern_wanted` would be a valid instrument for (b).
3. **Simplifying `split_at_word_edges` in the kerning PR** because its docstring cites the kerning gap (`figscripts.py:445-447`). Removing the cut re-segments the `<text>` elements of translated labels.
4. **Keying the face on `is_symbol_run`** would swap MathematicalPi and Symbol glyphs, which draw different characters (`COMPOSE-FIDELITY.md:178-181`).
5. **Mapping STIX Italic or Bold runs to STIX Regular** loses slant or weight. There are 0 such runs in the 34 and 444 face-blocks in the corpus.
6. **Characters missing from the STIX cmap** fall back to whatever font the browser picks, not to FigIS, unless the design handles it.
7. **Re-prepare during recompose.** `figure-run` re-prepares each time. ⑥ must not touch `readlayer`, `figtext.group`/`lines` or `blockkey`, or bought keys move, the drift guard fires, and figures get re-bought. Re-prepare and diff the key sets first.
8. **Stacking on ④'s unmerged branch.** A ⑥ recompose would also carry ④'s artwork changes (18 of 34 figures have graphics-state ops inside BT, `1d-completeness.md:32`). One bump per PR (R1) means ⑥'s value-by-value diff must be taken against ④'s recomposed media, not against `main`.
9. **Other effects that are not label changes:**
   - `translated.png` stays cairo/Liberation, because the toy font API cannot load an uninstalled STIX. Its only consumers are existence checks in `test_figure_compose.py:399-443`, and nothing in `tools/` or `server/` reads it.
   - The `faces()` helpers in `test_compose_runexact.py:151-155` and `test_compose_t23.py:206-210` regex only `'FigIS'`. They are blind to a second family, so add a new pin for FigSym rather than relying on them.
   - ⑨ `localise_block` relies on `.` and `,` having equal advances in Liberation (`compose.py:116-124`). The 19 STIX source glyphs include neither, so exposure is 0 today; the spec should say so.
- ## 6. Should ⑥ be split? Yes, and STIX first

| | STIX half | Kerning half |
|---|---|---|
| Ruling | answered (RESUME item 4) | none |
| What changes | fonts only, if kept runs only | translated labels' rendering (option a) or their layout (option b) |
| Exposure on the 34 | 42 blocks in 10 figures | 0 kept runs; 28 of 647 translated segments measured short |
| Evidence it needs | a font-provisioning decision, a licence-text pin, R-a, R-b | its own census R-c and the option (a)/(b) choice |

- The two halves do not interact: STIX 1.1.0 has 0 kern pairs among the 19 source glyphs.
- Different evidence and different risk classes make two PRs, each with one `COMPOSER_VERSION` bump. The two extra recomposes cost 0 ISK each.
- This is compatible with [USER]'s "④ then ⑥ … to PRs" (plan line 15).
- ## 7. Footprint
`git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain`, run at the end, shows only the six untracked paths under `experiments/figure-text-translation/evidence/2026-09-17-c4-build/`: `instruments/{npm_compare.cjs,population.py,refusal_walk.py,render_arms.py,render_diff.py}` and `reports/after/`. These were already present at the start and are not mine.

I made no repo change and wrote no scratchpad file. All probes were read-only fontTools or JSON reads run under `nice`: no renders, no prepare or compose, no network.

## Open questions

- Where should the official STIXGeneral-Regular 1.1.0 file live? Committing it to the public repo is distribution, needs the OFL text beside it, and needs a carve-out in root LICENSE for `experiments/`. The alternative is a gitignored local path checked against the sha256 (like `pylibs/`). This is [LEAD]'s call.
- Which exact licence text goes into each SVG? The STIX 1.x `License/` document (claim #31) or SIL's generic `OFL.txt` with the STI copyright header? Whichever it is has not been downloaded with a hash yet.
- Does [USER]'s wording "a font-family name containing neither STIX nor TM Math" also cover (a) the individual words `Fonts`, `TM` and `Math` (FAQ 5.4) and (b) the internal name IDs 1/3/4/6 plus the CFF `fontNames`/`FullName`/`FamilyName`? The design should do both, because the ruling claims to satisfy every stricter reading. The spec should say so explicitly rather than reinterpret the ruling.
- The 3 translated sandwich blocks with STIX `+`/`=`: leave them in Liberation, a visible inconsistency inside one figure, or do a follow-on that carries a symbol-font bit through `FS.transfer`? The follow-on changes the layout of translated labels.
- Kerning option (a) `font-kerning:none` on `path='layout'` items (browser matches cairo, Icelandic set unkerned) or option (b) kern pairs inside `lin_advance` (matches the source's typography, can change line breaks and sizes)? Nobody has ruled on it.
- Is the data-driven per-run kerning for kept runs worth building? It reaches 0 kept runs on the 34 in translated mode, and its corpus exposure is not measured.
- Do the ⑥ PRs stack on ④'s unmerged branch, and if so, which recomposed media is the baseline for the value-by-value diff?
- Must the Italic, Bold and BoldItalic STIX faces be checked against the official 1.1.0 files before buying resumes beyond ch03/ch04? They are 338, 58 and 48 corpus blocks against 468 Regular, and 5 of the objects are TrueType, not CFF.
- Is `font-kerning` honoured in Firefox and WebKit, and in which form (inline `style`, a `<style>` rule, or a presentation attribute)? Neither browser is on the box, and only an inline style has been measured in Chromium.
