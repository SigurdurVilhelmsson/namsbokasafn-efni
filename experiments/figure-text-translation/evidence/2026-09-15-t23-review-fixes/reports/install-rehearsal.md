# Install rehearsal — the 16 reference patches, in task order, on a fresh copy of HEAD

Repository HEAD `433f9a2e419441a735289bd41ec2575131151541`. Copy: `$INSTALL` = `/home/siggi/dev/scratch-c140/fix3/assembler/install` (`git archive HEAD experiments/figure-text-translation tools/lib`, plus `sources.local.json`, `out/` and a `pylibs` symlink, then `git init && git add -A && git commit` inside it → `8832eb00a13f60443f5b374623c5a9d18b25e0b1`). Tests run in `$INSTALL/experiments/figure-text-translation`; `$REF` = `/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/reference`; `$TMP` = `/home/siggi/dev/scratch-c140/fix3/assembler/install-tmp`; `$GOLDEN` = `/home/siggi/dev/scratch-c140/fix3/assembler/install-golden`. Produced by `instruments/rehearse.py`; every block below is its verbatim output.

## T-W — artwork shift (R15)
Apply the test first; it is RED on HEAD code.
```
$ cd $INSTALL && git apply "$REF/04-test_figure_prepare.patch"
(no output)
rc=0
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figure_prepare.py
rc=1  last line: 3 FAILED: 7c prepare's artwork.svg of a FRACTIONAL page draws every point exactly where the <text> convention (x, page_h - y) puts it, 7 PRECONDITION figure-prepare.py exposes artwork_transform_refusal, 7g PRECONDITION svgfix exposes PDFTOCAIRO_SVG_FLAGS for the guard to read
  FAIL  7c prepare's artwork.svg of a FRACTIONAL page draws every point exactly where the <text> convention (x, page_h - y) puts it: exit 0, max displacement 1.3944481054690894 pt, mapped [(48.13671265006101, 55.20312677139), (419.86322134993895, 55.20312677139), (48.13671265006101, 13.800788321418992)]: 
  FAIL  7 PRECONDITION figure-prepare.py exposes artwork_transform_refusal
  FAIL  7g PRECONDITION svgfix exposes PDFTOCAIRO_SVG_FLAGS for the guard to read
```
Apply the implementation.
```
$ cd $INSTALL && git apply "$REF/01-strip-text.patch" "$REF/02-svgfix.patch" "$REF/03-figure-prepare.patch"
(no output)
rc=0
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figure_prepare.py
rc=0  last line: ALL PASS
```
**Mutation — prepare() no longer calls the guard.** Golden copy: `cp figure-prepare.py $GOLDEN/figure-prepare.py`. Anchor in `figure-prepare.py` (count == 1):
```
-     refusal = artwork_transform_refusal(out_dir / 'artwork.pdf')
+     refusal = None
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figure_prepare.py
rc=1  last line: 1 FAILED: 7g prepare EXITS 1 when the guard refuses, with the refusal in prepare.json
  FAIL  7g prepare EXITS 1 when the guard refuses, with the refusal in prepare.json: rc 0, {'basename': 'CNX_Fake_Wired', 'source': '/home/siggi/dev/scratch-c140/fix3/assembler/install-tmp/tmpm3igo5q4/CNX_Fake_Fractional.pdf', 'blocks': 0, 'sendable': 0, 'undecodedBlocks': 0, 'verbatimBlocks': 0, 'missingFontBlocks': 0, 'chars': 0, 'artworkSvgPath': '/home/siggi/dev/scratch-c140/fix3/assembler/install-tmp/tmpm3igo5q4/out-wired/artwork.svg', 'imageXObjects': 0, 'paintOps': 1, 'formTextXObjects': 0, 'warnings': []}
```
```
$ cp $GOLDEN/figure-prepare.py figure-prepare.py && cmp figure-prepare.py $GOLDEN/figure-prepare.py && echo restored
restored
```
## T-S — geometricPrecision on the text group (R12)
```
$ cd $INSTALL && git apply "$REF/13-test_svgout.patch"
(no output)
rc=0
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_svgout.py
rc=1  last line: 1 FAILED: S1 every one of the 8 <text> elements resolves to text-rendering=geometricPrecision (layout segments, the subscript, run-exact bold/italic, the rotated glyph)
  FAIL  S1 every one of the 8 <text> elements resolves to text-rendering=geometricPrecision (layout segments, the subscript, run-exact bold/italic, the rotated glyph)  -- [('með umframmagni af ', 'auto'), ('Br', 'auto'), ('2', 'auto'), ('.', 'auto'), ('Heat', 'auto'), ('x', 'auto'), ('B', 'auto'), ('a < b & c', 'auto')]
```
```
$ cd $INSTALL && git apply "$REF/12-svgout.patch" "$REF/16-figscripts.patch"
(no output)
rc=0
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_svgout.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_runexact.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_t23.py
rc=0  last line: ALL PASS
```
**Mutation — the group opener loses the attribute.** Golden copy: `cp svgout.py $GOLDEN/svgout.py`. Anchor in `svgout.py` (count == 1):
```
- '<g text-rendering="geometricPrecision">'
+ '<g>'
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_svgout.py
rc=1  last line: 1 FAILED: S1 every one of the 8 <text> elements resolves to text-rendering=geometricPrecision (layout segments, the subscript, run-exact bold/italic, the rotated glyph)
  FAIL  S1 every one of the 8 <text> elements resolves to text-rendering=geometricPrecision (layout segments, the subscript, run-exact bold/italic, the rotated glyph)  -- [('með umframmagni af ', 'auto'), ('Br', 'auto'), ('2', 'auto'), ('.', 'auto'), ('Heat', 'auto'), ('x', 'auto'), ('B', 'auto'), ('a < b & c', 'auto')]
```
```
$ cp $GOLDEN/svgout.py svgout.py && cmp svgout.py $GOLDEN/svgout.py && echo restored
restored
```
## T-C — poppler DeviceCMYK text colour (R14)
Module and tests first; the composer and readlayer are not yet wired.
```
$ cd $INSTALL && git apply "$REF/05-figcolour.patch" "$REF/08-test_figcolour.patch" "$REF/09-test_readlayer.patch" "$REF/10-test_compose_runexact.patch" "$REF/11-test_compose_t23.patch"
(no output)
rc=0
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figcolour.py
rc=1  last line: 8 FAILED: 1e K=1 (DeviceCMYK (0, 0, 0, 1)) draws pdftocairo's bytes, 1e rich black (corpus) (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws pdftocairo's bytes, 1e CMYK blue (DeviceCMYK (0.75, 0.5, 0, 0.2)) draws pdftocairo's bytes, 1e CMYK red (DeviceCMYK (0, 1, 1, 0)) draws pdftocairo's bytes, 1a K=1 draws (35,31,32) = #231f20 - the artwork's black - within 1/255, 1b the corpus rich black draws (33,28,29), within 1/255, 2a translated 'Observation and curiosity' (DeviceCMYK (0, 0, 0, 1)) draws (35, 31, 32), the fill pdftocairo gave the same colour, 2d kept 'H2O (g)' (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws (33, 28, 29), the fill pdftocairo gave the same colour
  FAIL  1e K=1 (DeviceCMYK (0, 0, 0, 1)) draws pdftocairo's bytes: composer (0, 0, 0) pdftocairo (35, 31, 32)
  FAIL  1e rich black (corpus) (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws pdftocairo's bytes: composer (20, 21, 24) pdftocairo (33, 28, 29)
  FAIL  1e CMYK blue (DeviceCMYK (0.75, 0.5, 0, 0.2)) draws pdftocairo's bytes: composer (51, 102, 204) pdftocairo (65, 94, 159)
  FAIL  1e CMYK red (DeviceCMYK (0, 1, 1, 0)) draws pdftocairo's bytes: composer (255, 0, 0) pdftocairo (237, 28, 36)
  FAIL  1a K=1 draws (35,31,32) = #231f20 - the artwork's black - within 1/255: (0, 0, 0)
  FAIL  1b the corpus rich black draws (33,28,29), within 1/255: (20, 21, 24)
  FAIL  2a translated 'Observation and curiosity' (DeviceCMYK (0, 0, 0, 1)) draws (35, 31, 32), the fill pdftocairo gave the same colour: label fills {(0, 0, 0)} artwork fills [(0, 0, 0), (33, 28, 29), (35, 31, 32), (51, 102, 204)]
  FAIL  2d kept 'H2O (g)' (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws (33, 28, 29), the fill pdftocairo gave the same colour: label fills {(20, 21, 24)} artwork fills [(0, 0, 0), (33, 28, 29), (35, 31, 32), (51, 102, 204)]
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_readlayer.py
rc=1  last line:   2 FAILED: 7a PIN — compose.cmyk draws through figcolour.fill_rgb, the one conversion, 7b2 a DeviceGray/RGB glyph in this population keeps its OWN space - not folded into cmyk
  FAIL  7a PIN — compose.cmyk draws through figcolour.fill_rgb, the one conversion: else the shapes asserted below are not the ones the composer accepts
  FAIL  7b2 a DeviceGray/RGB glyph in this population keeps its OWN space - not folded into cmyk: {'cmyk': 804} (CNX_Chem_01_02_decomp draws DeviceGray text; MUST be > 0 beside cmyk)
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_runexact.py
rc=1  last line: 1 FAILED: C1 CONTROL the translated ARC is byte-identical to the unchanged composer but for ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill
  FAIL  C1 CONTROL the translated ARC is byte-identical to the unchanged composer but for ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill: expected fill="#415e9f" (golden ['fill="#3366cc"']), now ['<text x="221.576" y="140.167" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(-4.2674 225.536 140.167)">B</text>', '<text x="229.488" y="140.145" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(3.9829 234.168 140.145)">O</text>', '<text x="238.737" y="141.519" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(12.9207 243.417 141.519)">G</text>', '<text x="247.853" y="143.248" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(18.9365 249.473 143.248)">I</text>', '<text x="250.699" y="145.301" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(24.2649 254.659 145.301)">X</text>']
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_t23.py
rc=1  last line: 1 FAILED: G1 CONTROL the kept population is byte-identical to the unchanged composer - except the planted decimal, which may differ ONLY by 26.98 -> 26,98, and ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill
  FAIL  G1 CONTROL the kept population is byte-identical to the unchanged composer - except the planted decimal, which may differ ONLY by 26.98 -> 26,98, and ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill: expected fill="#231f20" (golden ['fill="#000000"']), now ['<text x="10.000" y="160.000" font-family="FigIS" font-weight="400" font-size="12.000" fill="#000000" xml:space="preserve">26,98</text>', '<text x="10.000" y="200.000" font-family="FigIS" font-weight="400" font-size="12.000" fill="#000000" xml:space="preserve">H2O (g)</text>']
```
**Mutation — fill_rgb's cmyk branch becomes the naive inverse.** Golden copy: `cp figcolour.py $GOLDEN/figcolour.py`. Anchor in `figcolour.py` (count == 1):
```
-         return poppler_cmyk_rgb(c, m, y, k)
+         return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figcolour.py
rc=1  last line: 8 FAILED: 1e K=1 (DeviceCMYK (0, 0, 0, 1)) draws pdftocairo's bytes, 1e rich black (corpus) (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws pdftocairo's bytes, 1e CMYK blue (DeviceCMYK (0.75, 0.5, 0, 0.2)) draws pdftocairo's bytes, 1e CMYK red (DeviceCMYK (0, 1, 1, 0)) draws pdftocairo's bytes, 1a K=1 draws (35,31,32) = #231f20 - the artwork's black - within 1/255, 1b the corpus rich black draws (33,28,29), within 1/255, 2a translated 'Observation and curiosity' (DeviceCMYK (0, 0, 0, 1)) draws (35, 31, 32), the fill pdftocairo gave the same colour, 2d kept 'H2O (g)' (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws (33, 28, 29), the fill pdftocairo gave the same colour
  FAIL  1e K=1 (DeviceCMYK (0, 0, 0, 1)) draws pdftocairo's bytes: composer (0, 0, 0) pdftocairo (35, 31, 32)
  FAIL  1e rich black (corpus) (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws pdftocairo's bytes: composer (20, 21, 24) pdftocairo (33, 28, 29)
  FAIL  1e CMYK blue (DeviceCMYK (0.75, 0.5, 0, 0.2)) draws pdftocairo's bytes: composer (51, 102, 204) pdftocairo (65, 94, 159)
  FAIL  1e CMYK red (DeviceCMYK (0, 1, 1, 0)) draws pdftocairo's bytes: composer (255, 0, 0) pdftocairo (237, 28, 36)
  FAIL  1a K=1 draws (35,31,32) = #231f20 - the artwork's black - within 1/255: (0, 0, 0)
  FAIL  1b the corpus rich black draws (33,28,29), within 1/255: (20, 21, 24)
  FAIL  2a translated 'Observation and curiosity' (DeviceCMYK (0, 0, 0, 1)) draws (35, 31, 32), the fill pdftocairo gave the same colour: label fills {(0, 0, 0)} artwork fills [(0, 0, 0), (33, 28, 29), (35, 31, 32), (51, 102, 204)]
  FAIL  2d kept 'H2O (g)' (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws (33, 28, 29), the fill pdftocairo gave the same colour: label fills {(20, 21, 24)} artwork fills [(0, 0, 0), (33, 28, 29), (35, 31, 32), (51, 102, 204)]
```
```
$ cp $GOLDEN/figcolour.py figcolour.py && cmp figcolour.py $GOLDEN/figcolour.py && echo restored
restored
```
FAIL-name set of this run == FAIL-name set of the UNMUTATED run just above (composer not yet wired): **True**

Wire the composer and readlayer.
```
$ cd $INSTALL && git apply "$REF/06-compose.patch" "$REF/07-readlayer.patch"
(no output)
rc=0
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figcolour.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_readlayer.py
rc=0  last line:   ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_runexact.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_t23.py
rc=0  last line: ALL PASS
```
**Trap mutation — HEAD's readlayer.py (folds RGB/Gray into CMYK) under the wired composer.** Golden copy: `cp readlayer.py $GOLDEN/readlayer.py`.
```
$ cd $INSTALL && git show 8832eb00a13f60443f5b374623c5a9d18b25e0b1:experiments/figure-text-translation/readlayer.py > experiments/figure-text-translation/readlayer.py
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figcolour.py
rc=1  last line: 8 FAILED: 1e Gray 0 (DeviceGray (0,)) draws pdftocairo's bytes, 1e Gray 0.5 (DeviceGray (0.5,)) draws pdftocairo's bytes, 1e RGB blue (DeviceRGB (0.2, 0.4, 0.8)) draws pdftocairo's bytes, 1e RGB black (DeviceRGB (0, 0, 0)) draws pdftocairo's bytes, 1c DeviceGray 0 stays PURE black (0,0,0), exactly, 1d a DeviceRGB value is drawn unchanged, exactly (no table, no fixed-point), 2b translated 'Form a hypothesis' (DeviceGray (0,)) draws (0, 0, 0), the fill pdftocairo gave the same colour, 2c kept 'Test the hypothesis' (DeviceRGB (0.2, 0.4, 0.8)) draws (51, 102, 204), the fill pdftocairo gave the same colour
  FAIL  1e Gray 0 (DeviceGray (0,)) draws pdftocairo's bytes: composer (35, 31, 32) pdftocairo (0, 0, 0)
  FAIL  1e Gray 0.5 (DeviceGray (0.5,)) draws pdftocairo's bytes: composer (145, 143, 143) pdftocairo (128, 128, 128)
  FAIL  1e RGB blue (DeviceRGB (0.2, 0.4, 0.8)) draws pdftocairo's bytes: composer (65, 94, 159) pdftocairo (51, 102, 204)
  FAIL  1e RGB black (DeviceRGB (0, 0, 0)) draws pdftocairo's bytes: composer (35, 31, 32) pdftocairo (0, 0, 0)
  FAIL  1c DeviceGray 0 stays PURE black (0,0,0), exactly: (0.137298583984375, 0.1215972900390625, 0.12548828125)
  FAIL  1d a DeviceRGB value is drawn unchanged, exactly (no table, no fixed-point): (0.253631591796875, 0.368621826171875, 0.6221466064453125)
  FAIL  2b translated 'Form a hypothesis' (DeviceGray (0,)) draws (0, 0, 0), the fill pdftocairo gave the same colour: label fills {(35, 31, 32)} artwork fills [(0, 0, 0), (33, 28, 29), (35, 31, 32), (51, 102, 204)]
  FAIL  2c kept 'Test the hypothesis' (DeviceRGB (0.2, 0.4, 0.8)) draws (51, 102, 204), the fill pdftocairo gave the same colour: label fills {(65, 94, 159)} artwork fills [(0, 0, 0), (33, 28, 29), (35, 31, 32), (51, 102, 204)]
```
```
$ cp $GOLDEN/readlayer.py readlayer.py && cmp readlayer.py $GOLDEN/readlayer.py && echo restored
restored
```
**Added control (not in the task order) — the same naive `fill_rgb` mutation, now that the composer is wired.** Before 06/07 the composer does not call `figcolour`, so the mutation above cannot be told apart from the unwired RED state; this run is the one that shows the pure module's mutation is killed.
**Mutation — fill_rgb's cmyk branch becomes the naive inverse (composer wired).** Golden copy: `cp figcolour.py $GOLDEN/figcolour.py`. Anchor in `figcolour.py` (count == 1):
```
-         return poppler_cmyk_rgb(c, m, y, k)
+         return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figcolour.py
rc=1  last line: 8 FAILED: 1e K=1 (DeviceCMYK (0, 0, 0, 1)) draws pdftocairo's bytes, 1e rich black (corpus) (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws pdftocairo's bytes, 1e CMYK blue (DeviceCMYK (0.75, 0.5, 0, 0.2)) draws pdftocairo's bytes, 1e CMYK red (DeviceCMYK (0, 1, 1, 0)) draws pdftocairo's bytes, 1a K=1 draws (35,31,32) = #231f20 - the artwork's black - within 1/255, 1b the corpus rich black draws (33,28,29), within 1/255, 2a translated 'Observation and curiosity' (DeviceCMYK (0, 0, 0, 1)) draws (35, 31, 32), the fill pdftocairo gave the same colour, 2d kept 'H2O (g)' (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws (33, 28, 29), the fill pdftocairo gave the same colour
  FAIL  1e K=1 (DeviceCMYK (0, 0, 0, 1)) draws pdftocairo's bytes: composer (0, 0, 0) pdftocairo (35, 31, 32)
  FAIL  1e rich black (corpus) (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws pdftocairo's bytes: composer (20, 21, 24) pdftocairo (33, 28, 29)
  FAIL  1e CMYK blue (DeviceCMYK (0.75, 0.5, 0, 0.2)) draws pdftocairo's bytes: composer (51, 102, 204) pdftocairo (65, 94, 159)
  FAIL  1e CMYK red (DeviceCMYK (0, 1, 1, 0)) draws pdftocairo's bytes: composer (255, 0, 0) pdftocairo (237, 28, 36)
  FAIL  1a K=1 draws (35,31,32) = #231f20 - the artwork's black - within 1/255: (0, 0, 0)
  FAIL  1b the corpus rich black draws (33,28,29), within 1/255: (20, 21, 24)
  FAIL  2a translated 'Observation and curiosity' (DeviceCMYK (0, 0, 0, 1)) draws (35, 31, 32), the fill pdftocairo gave the same colour: label fills {(0, 0, 0)} artwork fills [(0, 0, 0), (33, 28, 29), (35, 31, 32), (51, 102, 204)]
  FAIL  2d kept 'H2O (g)' (DeviceCMYK (0.697266, 0.675781, 0.638672, 0.740234)) draws (33, 28, 29), the fill pdftocairo gave the same colour: label fills {(20, 21, 24)} artwork fills [(0, 0, 0), (33, 28, 29), (35, 31, 32), (51, 102, 204)]
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_runexact.py
rc=1  last line: 1 FAILED: C1 CONTROL the translated ARC is byte-identical to the unchanged composer but for ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill
  FAIL  C1 CONTROL the translated ARC is byte-identical to the unchanged composer but for ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill: expected fill="#3366cc" (golden ['fill="#3366cc"']), now ['<text x="221.576" y="140.167" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(-4.2674 225.536 140.167)">B</text>', '<text x="229.488" y="140.145" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(3.9829 234.168 140.145)">O</text>', '<text x="238.737" y="141.519" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(12.9207 243.417 141.519)">G</text>', '<text x="247.853" y="143.248" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(18.9365 249.473 143.248)">I</text>', '<text x="250.699" y="145.301" font-family="FigIS" font-weight="400" font-size="12.000" fill="#3366cc" xml:space="preserve" transform="rotate(24.2649 254.659 145.301)">X</text>']
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_t23.py
rc=1  last line: 1 FAILED: G1 CONTROL the kept population is byte-identical to the unchanged composer - except the planted decimal, which may differ ONLY by 26.98 -> 26,98, and ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill
  FAIL  G1 CONTROL the kept population is byte-identical to the unchanged composer - except the planted decimal, which may differ ONLY by 26.98 -> 26,98, and ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill: expected fill="#000000" (golden ['fill="#000000"']), now ['<text x="10.000" y="160.000" font-family="FigIS" font-weight="400" font-size="12.000" fill="#000000" xml:space="preserve">26,98</text>', '<text x="10.000" y="200.000" font-family="FigIS" font-weight="400" font-size="12.000" fill="#000000" xml:space="preserve">H2O (g)</text>']
```
```
$ cp $GOLDEN/figcolour.py figcolour.py && cmp figcolour.py $GOLDEN/figcolour.py && echo restored
restored
```
## T-L — box/cell label rules A and E (R13)
```
$ cd $INSTALL && git apply "$REF/15-test_figlayout.patch"
(no output)
rc=0
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figlayout.py
rc=1  last line: 10 FAILED: [L] flowchart b10: 'Fjöldi agna af A' -> Fjöldi / agna / af A at 9.0, fit, no overflow, [L] flowchart b7: 'Massi A' -> one line at 9.0, [L] flowchart b15: 'Rúmmál lausnar A' -> Rúmmál / lausnar A at 9.0, [L] flowchart b9: 'Rúmmál hreins efnis A' -> Rúmmál / hreins / efnis A at 9.0, [L] E alone (no symbol): 'Fjöldi agna af xy' -> Fjöldi / agna / af xy, [L] A: a binding count that fits only when shrunk (1 line at 8.0) beats a lone symbol at full size, [L] E in the width floor-overflow path: aaaaaaaaaaaaaaa / bb cc, the long word still named, [L] E in the height floor-overflow path: aaaaaaaa / b c at 7.5, height overhang named 18.048 > 6, [L] E does not keep the size of the count it rejects: 'Massi af cu' -> Massi / af cu at 9.0, fit, [L] CONTROL E's surviving count takes the largest size where it fits: Massi / af cu at 8.0
  FAIL  [L] flowchart b10: 'Fjöldi agna af A' -> Fjöldi / agna / af A at 9.0, fit, no overflow: ['Fjöldi', 'agna', 'af', 'A'] 9.0 fit
  FAIL  [L] flowchart b7: 'Massi A' -> one line at 9.0: ['Massi', 'A'] 9.0
  FAIL  [L] flowchart b15: 'Rúmmál lausnar A' -> Rúmmál / lausnar A at 9.0: ['Rúmmál', 'lausnar', 'A'] 9.0
  FAIL  [L] flowchart b9: 'Rúmmál hreins efnis A' -> Rúmmál / hreins / efnis A at 9.0: ['Rúmmál', 'hreins', 'efnis', 'A'] 9.0
  FAIL  [L] E alone (no symbol): 'Fjöldi agna af xy' -> Fjöldi / agna / af xy: ['Fjöldi', 'agna', 'af', 'xy'] 9.0
  FAIL  [L] A: a binding count that fits only when shrunk (1 line at 8.0) beats a lone symbol at full size: ['Massi', 'A'] 9.0 fit
  FAIL  [L] E in the width floor-overflow path: aaaaaaaaaaaaaaa / bb cc, the long word still named: ['aaaaaaaaaaaaaaa', 'bb', 'cc'] floor-overflow {'word': 'aaaaaaaaaaaaaaa', 'needPt': 56.25, 'budgetPt': 36.0, 'sizePt': 7.5, 'axis': 'width', 'linePt': 56.25}
  FAIL  [L] E in the height floor-overflow path: aaaaaaaa / b c at 7.5, height overhang named 18.048 > 6: ['aaaaaaaa', 'b', 'c'] 7.5 {'word': None, 'needPt': 29.046, 'budgetPt': 6.0, 'sizePt': 7.5, 'axis': 'height'}
  FAIL  [L] E does not keep the size of the count it rejects: 'Massi af cu' -> Massi / af cu at 9.0, fit: ['Massi', 'af', 'cu'] 7.5 fit
  FAIL  [L] CONTROL E's surviving count takes the largest size where it fits: Massi / af cu at 8.0: ['Massi', 'af', 'cu'] 7.5 fit
```
```
$ cd $INSTALL && git apply "$REF/14-figlayout.patch"
(no output)
rc=0
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figlayout.py
rc=0  last line: ALL PASS
```
**Mutation — decide()'s `_ae` default switched off (rules A and E off).** Golden copy: `cp figlayout.py $GOLDEN/figlayout.py`. Anchor in `figlayout.py` (count == 1):
```
- _height=True, _ae=True):
+ _height=True, _ae=False):
```
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figlayout.py
rc=1  last line: 10 FAILED: [L] flowchart b10: 'Fjöldi agna af A' -> Fjöldi / agna / af A at 9.0, fit, no overflow, [L] flowchart b7: 'Massi A' -> one line at 9.0, [L] flowchart b15: 'Rúmmál lausnar A' -> Rúmmál / lausnar A at 9.0, [L] flowchart b9: 'Rúmmál hreins efnis A' -> Rúmmál / hreins / efnis A at 9.0, [L] E alone (no symbol): 'Fjöldi agna af xy' -> Fjöldi / agna / af xy, [L] A: a binding count that fits only when shrunk (1 line at 8.0) beats a lone symbol at full size, [L] E in the width floor-overflow path: aaaaaaaaaaaaaaa / bb cc, the long word still named, [L] E in the height floor-overflow path: aaaaaaaa / b c at 7.5, height overhang named 18.048 > 6, [L] E does not keep the size of the count it rejects: 'Massi af cu' -> Massi / af cu at 9.0, fit, [L] CONTROL E's surviving count takes the largest size where it fits: Massi / af cu at 8.0
  FAIL  [L] flowchart b10: 'Fjöldi agna af A' -> Fjöldi / agna / af A at 9.0, fit, no overflow: ['Fjöldi', 'agna', 'af', 'A'] 9.0 fit
  FAIL  [L] flowchart b7: 'Massi A' -> one line at 9.0: ['Massi', 'A'] 9.0
  FAIL  [L] flowchart b15: 'Rúmmál lausnar A' -> Rúmmál / lausnar A at 9.0: ['Rúmmál', 'lausnar', 'A'] 9.0
  FAIL  [L] flowchart b9: 'Rúmmál hreins efnis A' -> Rúmmál / hreins / efnis A at 9.0: ['Rúmmál', 'hreins', 'efnis', 'A'] 9.0
  FAIL  [L] E alone (no symbol): 'Fjöldi agna af xy' -> Fjöldi / agna / af xy: ['Fjöldi', 'agna', 'af', 'xy'] 9.0
  FAIL  [L] A: a binding count that fits only when shrunk (1 line at 8.0) beats a lone symbol at full size: ['Massi', 'A'] 9.0 fit
  FAIL  [L] E in the width floor-overflow path: aaaaaaaaaaaaaaa / bb cc, the long word still named: ['aaaaaaaaaaaaaaa', 'bb', 'cc'] floor-overflow {'word': 'aaaaaaaaaaaaaaa', 'needPt': 56.25, 'budgetPt': 36.0, 'sizePt': 7.5, 'axis': 'width', 'linePt': 56.25}
  FAIL  [L] E in the height floor-overflow path: aaaaaaaa / b c at 7.5, height overhang named 18.048 > 6: ['aaaaaaaa', 'b', 'c'] 7.5 {'word': None, 'needPt': 29.046, 'budgetPt': 6.0, 'sizePt': 7.5, 'axis': 'height'}
  FAIL  [L] E does not keep the size of the count it rejects: 'Massi af cu' -> Massi / af cu at 9.0, fit: ['Massi', 'af', 'cu'] 7.5 fit
  FAIL  [L] CONTROL E's surviving count takes the largest size where it fits: Massi / af cu at 8.0: ['Massi', 'af', 'cu'] 7.5 fit
```
```
$ cp $GOLDEN/figlayout.py figlayout.py && cmp figlayout.py $GOLDEN/figlayout.py && echo restored
restored
```
FAIL-name set of this run == FAIL-name set of the RED run (HEAD figlayout.py, new test): **True**

## After T-L — every test file by name
```
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_blockkey_consumers.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_c4b_multiset.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_runexact.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_compose_t23.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figcolour.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figcontainers.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figlayout.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figscripts.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figtext_normalise.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figtext_out.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figtext_runexact.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figure_compose.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_figure_prepare.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_make_fixture.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_numloc.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_readlayer.py
rc=0  last line:   ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_sendable.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_sources.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_svgfix.py
rc=0  last line: ALL PASS
$ FIGTEXT_PYLIBS=./pylibs PYTHONDONTWRITEBYTECODE=1 TMPDIR=$TMP python3 -u test_svgout.py
rc=0  last line: ALL PASS
```
## After T-L — touched files against the verified scratch tree
```
cmp strip-text.py fix2/final/tree/strip-text.py: identical
cmp svgfix.py fix2/final/tree/svgfix.py: identical
cmp figure-prepare.py fix2/final/tree/figure-prepare.py: identical
cmp test_figure_prepare.py fix2/final/tree/test_figure_prepare.py: identical
cmp figcolour.py fix2/final/tree/figcolour.py: identical
cmp compose.py fix2/final/tree/compose.py: identical
cmp readlayer.py fix2/final/tree/readlayer.py: identical
cmp test_figcolour.py fix2/final/tree/test_figcolour.py: identical
cmp test_readlayer.py fix2/final/tree/test_readlayer.py: identical
cmp test_compose_runexact.py fix2/final/tree/test_compose_runexact.py: identical
cmp test_compose_t23.py fix2/final/tree/test_compose_t23.py: identical
cmp svgout.py fix2/final/tree/svgout.py: identical
cmp test_svgout.py fix2/final/tree/test_svgout.py: identical
cmp figlayout.py fix2/final/tree/figlayout.py: identical
cmp test_figlayout.py fix2/final/tree/test_figlayout.py: identical
cmp figscripts.py fix2/final/tree/figscripts.py: identical
touched identical: 16/16
all *.py in the copy: 46; differing from fix2/final/tree or missing there: []
```
```
$ cd $INSTALL && git status --porcelain
 M experiments/figure-text-translation/compose.py
 M experiments/figure-text-translation/figlayout.py
 M experiments/figure-text-translation/figscripts.py
 M experiments/figure-text-translation/figure-prepare.py
 M experiments/figure-text-translation/readlayer.py
 M experiments/figure-text-translation/strip-text.py
 M experiments/figure-text-translation/svgfix.py
 M experiments/figure-text-translation/svgout.py
 M experiments/figure-text-translation/test_compose_runexact.py
 M experiments/figure-text-translation/test_compose_t23.py
 M experiments/figure-text-translation/test_figlayout.py
 M experiments/figure-text-translation/test_figure_prepare.py
 M experiments/figure-text-translation/test_readlayer.py
?? experiments/figure-text-translation/figcolour.py
?? experiments/figure-text-translation/test_figcolour.py
?? experiments/figure-text-translation/test_svgout.py
```
REHEARSAL-COMPLETE
