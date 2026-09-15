# etheneBr bond position

`bond.py` drives byte-identical copies of `fix2/integrated/bond/imgr.mjs` (SVG → Chromium `<img>` → PNG) and `segs.py` (bond rows and ink segments):

```bash
python3 -u bond.py --out <dir> /home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/media/CNX_Chem_04_03_etheneBr_img_IS.svg <regen-out>/work/CNX_Chem_04_03_etheneBr_img/translated.svg
pgrep -a chrome-headless   # must print nothing
```

**Expected:** source (pdftocairo, 600 dpi) bond rows 201…233, segment `(3454, 3540)`; the final build's SVG `(3454, 3539)` on rows 201…233; the committed pre-fix media `(3443, 3528)` on rows 200…232. Recorded run: `../../reports/bond.txt`. Last line `BOND-DONE`.
