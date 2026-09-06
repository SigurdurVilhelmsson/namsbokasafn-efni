#!/usr/bin/env python3
"""Read-layer bake-off: candidate readers vs the committed census population.

Question: of the text-bearing figures, how many can each reader see?
CONTROL (mandatory): does the candidate ever read FEWER words than ours? A gain
on the failing set means nothing if it silently regresses the working set.
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path
EXP = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
sys.path.insert(0, str(EXP)); sys.path.insert(0, str(EXP / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(EXP / 'pylibs'))
import sources as S, pdfplumber, warnings
warnings.filterwarnings('ignore')

CEN = Path('/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/text-coverage-efnafraedi-2e.json')
rows = json.loads(CEN.read_text())
TEXT = [r for r in rows if r['bucket'] in ('page-text','form-text-only','type0-unreadable','text-but-unexplained')]
cfg = S.load_config(); trees = S.load_trees('efnafraedi-2e', cfg); prec = cfg['editionPrecedence']
import re
DEHASH = re.compile(r'-[0-9a-f]{4}$')

def ours_words(pdf):
    """What extract.py's parser actually yields, via the real code path."""
    try:
        import pdftext, pikepdf
        with pikepdf.open(pdf) as p:
            pg = p.pages[0]
            res = pg.get('/Resources', {}) or {}
            fonts = res.get('/Font', {}) or {}
            widths = {}
            for k in fonts.keys():
                f = fonts[k]
                if '/FirstChar' in f and '/Widths' in f:
                    widths[str(k)] = {'first': int(f['/FirstChar']),
                                      'w': [float(x) for x in f['/Widths']]}
            from _deps import read_content
            runs = pdftext.parse(read_content(pg), widths)
            return sum(len(r['text'].split()) for r in runs)
    except Exception:
        return -1

def plumber_words(pdf):
    try:
        with pdfplumber.open(pdf) as d:
            return len(d.pages[0].extract_words())
    except Exception:
        return -1

out = []
for i, r in enumerate(TEXT):
    n = r['name']
    p, key = S.resolve(n, trees, prec)
    if not p and DEHASH.search(n):
        p, key = S.resolve(DEHASH.sub('', n), trees, prec)
    if not p: continue
    src, tmp = p, None
    if p.suffix.lower() in ('.eps', '.ai'):
        tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False); tmp.close()
        rr = subprocess.run(['gs','-q','-dNOPAUSE','-dBATCH','-dSAFER','-dEPSCrop',
                             '-sDEVICE=pdfwrite',f'-sOutputFile={tmp.name}',str(p)],
                            capture_output=True, timeout=120)
        if rr.returncode != 0: os.unlink(tmp.name); continue
        src = Path(tmp.name)
    o, pl = ours_words(src), plumber_words(src)
    if tmp: os.unlink(tmp.name)
    out.append(dict(name=n, bucket=r['bucket'], oracle=r.get('words',0), ours=o, plumber=pl))
    if i % 100 == 0: print(f"  ...{i}/{len(TEXT)}", flush=True)

Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/a14335b8-192d-4c29-9cc6-d2a67f9048b6/scratchpad/census/bakeoff.json').write_text(json.dumps(out, indent=1))
n = len(out)
ours_ok = sum(1 for r in out if r['ours'] > 0)
pl_ok    = sum(1 for r in out if r['plumber'] > 0)
gained   = [r for r in out if r['ours'] <= 0 < r['plumber']]
REGRESS  = [r for r in out if r['plumber'] < r['ours'] and r['ours'] > 0]
print(f"\nPOPULATION: {n} text-bearing figures (from the committed census)")
print(f"  ours     reads {ours_ok:4}  ({100*ours_ok/n:.1f}%)")
print(f"  pdfplumber reads {pl_ok:4}  ({100*pl_ok/n:.1f}%)")
print(f"  GAINED: {len(gained)} figures ours cannot read at all")
print(f"  🔴 CONTROL — REGRESSIONS (plumber reads FEWER than ours): {len(REGRESS)}")
for r in REGRESS[:10]: print(f"      {r['name']:38} ours={r['ours']:4} plumber={r['plumber']:4}")
tot_o = sum(max(r['ours'],0) for r in out); tot_p = sum(max(r['plumber'],0) for r in out)
print(f"  words: ours={tot_o}  plumber={tot_p}  oracle={sum(r['oracle'] for r in out)}")
