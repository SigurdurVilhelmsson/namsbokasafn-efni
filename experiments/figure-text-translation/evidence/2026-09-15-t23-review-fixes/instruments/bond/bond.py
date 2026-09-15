#!/usr/bin/env python3
"""etheneBr C=C double bond, located in pixel columns at 600 dpi: the source PDF against composed SVGs.

    python3 -u bond.py --out <dir> [--source-pdf <staged etheneBr pdf>] <svg> [<svg> ...]

A driver around copies of /home/siggi/dev/scratch-c140/fix2/integrated/bond/{imgr.mjs,segs.py} (byte-identical).
  source: pdftocairo -png -r 600 -singlefile <source-pdf>  (default: the staged PDF figure-prepare wrote,
          /home/siggi/dev/scratch-c140/fix2/integrated/prep/CNX_Chem_04_03_etheneBr_img/CNX_Chem_04_03_etheneBr_img.pdf)
  svg:    node imgr.mjs <svg> <png> 3900 579 — the SVG as a Chromium <img> (Playwright from server/node_modules),
          page 468 x 69.5 pt at 600/72 px per pt
  scan:   python3 segs.py <png...> — the rows where columns 3462..3524 are all ink (the bond), and the ink
          segments on its first and last row between x 3300 and 3700

Expected (R15): source `bond rows [201, 202] [232, 233]`, bond segment (3454, 3540); the final build's SVG
(3454, 3539) on the same rows — 1 px right-edge antialiasing between Chromium and cairo; the committed pre-fix
media (HEAD 433f9a2e) (3443, 3528) on rows 200/232, i.e. 11-12 px (about 1.4 pt) left and one row up.
Last stdout line: `BOND-DONE`. Afterwards `pgrep -a chrome-headless` must print nothing.
"""
import argparse, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_PDF = ('/home/siggi/dev/scratch-c140/fix2/integrated/prep/CNX_Chem_04_03_etheneBr_img/'
               'CNX_Chem_04_03_etheneBr_img.pdf')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--source-pdf', default=DEFAULT_PDF)
    ap.add_argument('svgs', nargs='*')
    a = ap.parse_args()
    out = Path(a.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    pngs = []
    src = out / 'source600'
    p = subprocess.run(['pdftocairo', '-png', '-r', '600', '-singlefile', a.source_pdf, str(src)],
                       capture_output=True, text=True, timeout=300)
    print(f'source {a.source_pdf} -> {src}.png rc={p.returncode} {p.stderr.strip()}', flush=True)
    pngs.append(f'{src}.png')
    for i, svg in enumerate(a.svgs):
        png = out / f'svg{i}.png'
        p = subprocess.run(['node', str(HERE / 'imgr.mjs'), svg, str(png), '3900', '579'],
                           capture_output=True, text=True, timeout=300)
        print(f'svg{i} {svg} -> {png} rc={p.returncode} {p.stderr.strip()[-300:]}', flush=True)
        pngs.append(str(png))
    p = subprocess.run([sys.executable, str(HERE / 'segs.py'), *pngs], capture_output=True, text=True, timeout=300)
    print(p.stdout, p.stderr, flush=True)
    print('BOND-DONE')


if __name__ == '__main__':
    main()
