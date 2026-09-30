#!/usr/bin/env python3
"""§C140 ⑭ — does the raster arm repair the in-document-feImage figures? Scores four comparisons per figure against
Chromium's render of TODAY's vector media (what readers see today in the engine the corpus was built for):

  vector firefox  : today's defect
  raster chromium : the raster arm, Chromium
  raster firefox  : the raster arm, Firefox

    python3 raster_arm_ab.py <today-sweep-dir> <raster-sweep-dir> <out.tsv> <sheet-dir> <basename>...

Both sweep dirs are browser-sweep.mjs output (rows.{full,notext}.jsonl + png/<engine>/<variant>/<id>.png). Writes a TSV
and, per figure, a sheet: vector chromium | vector firefox | raster firefox (artwork-only variant).
Run with PYTHONPATH=<experiments/figure-text-translation>/pylibs from experiments/figure-text-translation.
"""
import csv, importlib.util, sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(HERE))          # browser-score.py imports the composer's _deps from its own directory
spec = importlib.util.spec_from_file_location('bs', HERE / 'browser-score.py')
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)
from PIL import Image, ImageDraw  # noqa: E402

today, raster, out_tsv, sheet_dir = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
ids = sys.argv[5:]
sheet_dir.mkdir(parents=True, exist_ok=True)


def png(root, eng, var, i):
    return root / 'png' / eng / var / f'{i}.png'


with open(out_tsv, 'w', newline='') as fh:
    w = csv.writer(fh, delimiter='\t')
    w.writerow(['figure', 'variant', 'comparison', 'tol_hot_tiles', 'tol_strong', 'strong', 'size_delta'])
    for var in ('notext', 'full'):
        for i in ids:
            ref = bs.load_rgb(png(today, 'chromium', var, i))
            for label, other in (('vector firefox (today)', png(today, 'firefox', var, i)),
                                 ('raster chromium (after)', png(raster, 'chromium', var, i)),
                                 ('raster firefox (after)', png(raster, 'firefox', var, i))):
                m = bs.pair_metrics(ref, bs.load_rgb(other))
                w.writerow([i, var, label, m['tol_hot_tiles'], f"{m['tol_strong']:.5f}", f"{m['strong']:.5f}",
                            m['size_delta']])
for i in ids:
    tiles = [(t, Image.open(p).convert('RGB')) for t, p in (
        ('vector, Chromium (today)', png(today, 'chromium', 'notext', i)),
        ('vector, Firefox (today)', png(today, 'firefox', 'notext', i)),
        ('raster arm, Firefox (after)', png(raster, 'firefox', 'notext', i)))]
    wd = sum(t.width for _, t in tiles) + 24
    ht = max(t.height for _, t in tiles) + 16
    s = Image.new('RGB', (wd, ht), 'white')
    d = ImageDraw.Draw(s)
    x = 0
    for label, t in tiles:
        s.paste(t, (x, 16))
        d.text((x + 2, 2), f'{i}: {label}', fill=(200, 0, 0))
        x += t.width + 12
    if s.width > 1800:
        s = s.resize((1800, int(s.height * 1800 / s.width)))
    s.save(sheet_dir / f'raster-arm-{i}.png', optimize=True)
print('ok')
