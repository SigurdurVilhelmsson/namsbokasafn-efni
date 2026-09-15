# Browser census

`census.py` (driver + classifier, from `fix2/integrated/census/an2.py`) and `cb.mjs` (Playwright measurement, `fix2/integrated/census/cb2.mjs` plus a usage header). Run from anywhere:

```bash
# committed pre-fix media (HEAD 433f9a2e): items from the instrumented HEAD compose
python3 -u census.py --out <dir> --items-root /home/siggi/dev/scratch-c140/plan/pred2/work/REPO \
  /home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/media/<b>_IS.svg ...   # the 34
# final build (a regen34 work dir, or the recomposed books media): items from the instrumented final compose (default)
python3 -u census.py --out <dir> <regen-out>/work/<b>/translated.svg ...             # the 34
pgrep -a chrome-headless   # must print nothing
```

**Expected:** HEAD media → `boundaries 164, space-bearing 24`; lost 16, collision 94, overhang 36 over the 7 scales (per scale in `../../reports/census-head.txt`), control worst |default − gp| 8.9688 pt. Final build → 0 / 0 / 0 (and added 0, narrowed 0), control 0.0. The run stops with `PAIRING FAILED` when `--items-root` does not describe the SVGs' text. Last line `CENSUS-DONE`.
