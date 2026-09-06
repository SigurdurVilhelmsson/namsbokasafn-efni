#!/usr/bin/env python3
"""EPS control, two parts.

PART 1 — reader vs reader on the gs-CONVERTED pdf: character multiset, ours vs candidate.
PART 2 — THE SHARED BLIND SPOT. Both readers see the CONVERTED pdf, so a loss in the gs
step is invisible to part 1 no matter how clean it looks. Two instruments agreeing
downstream of one lossy step is worth nothing. So: compare literal PostScript strings in
the RAW EPS against the text present after conversion.
"""
import json, os, re, subprocess, sys, tempfile, warnings
from collections import Counter
from pathlib import Path
EXP = Path(__file__).resolve().parent   # never an absolute machine path - repo rule
sys.path.insert(0, str(EXP)); sys.path.insert(0, str(EXP / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(EXP / 'pylibs'))
warnings.filterwarnings('ignore')
import sources as S, pdfplumber, pdftext, pikepdf
from _deps import read_content

rows = json.loads((EXP / 'text-coverage-efnafraedi-2e.json').read_text())
EPS = [r for r in rows if r.get('ext') == '.eps' and r['bucket'] in
       ('page-text','form-text-only','type0-unreadable','text-but-unexplained')]
cfg = S.load_config(); trees = S.load_trees('efnafraedi-2e', cfg); prec = cfg['editionPrecedence']
DEH = re.compile(r'-[0-9a-f]{4}$')
norm = lambda s: re.sub(r'\s+', '', s)
# PostScript literal strings: (...) with escapes. Crude but independent of our parser.
PSSTR = re.compile(rb'\((?:[^()\\]|\\.){2,}\)')

seg, loss, gain, gsloss, gsok, failed = [], [], [], [], 0, []
for i, r in enumerate(EPS):
    n = r['name']
    p, _ = S.resolve(n, trees, prec)
    if not p and DEH.search(n): p, _ = S.resolve(DEH.sub('', n), trees, prec)
    if not p: continue
    tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False); tmp.close()
    rr = subprocess.run(['gs','-q','-dNOPAUSE','-dBATCH','-dSAFER','-dEPSCrop',
                         '-sDEVICE=pdfwrite',f'-sOutputFile={tmp.name}',str(p)],
                        capture_output=True, timeout=180)
    if rr.returncode != 0 or os.path.getsize(tmp.name) == 0:
        failed.append(n); os.unlink(tmp.name); continue
    src = Path(tmp.name)
    try:
        with pikepdf.open(src) as d:
            pg = d.pages[0]; fo = (pg.get('/Resources',{}) or {}).get('/Font',{}) or {}
            w = {}
            for k in fo.keys():
                f = fo[k]
                if '/FirstChar' in f and '/Widths' in f:
                    w[str(k)] = {'first': int(f['/FirstChar']), 'w':[float(x) for x in f['/Widths']]}
            ours = norm(''.join(x['text'] for x in pdftext.parse(read_content(pg), w)))
        with pdfplumber.open(src) as d:
            pl = norm(''.join(c['text'] for c in d.pages[0].chars))
        conv_words = subprocess.run(['pdftotext','-q',str(src),'-'],
                                    capture_output=True, timeout=60).stdout.decode('utf-8','replace')
    except Exception as e:
        failed.append(f"{n}:{type(e).__name__}"); os.unlink(tmp.name); continue
    os.unlink(tmp.name)

    miss = Counter(ours) - Counter(pl)
    if miss: loss.append((n, len(ours), len(pl), ''.join(sorted(miss))[:30]))
    elif len(pl) > len(ours): gain.append((n, len(ours), len(pl)))
    else: seg.append(n)

    # PART 2 — gs fidelity, independent of both readers
    try:
        raw = p.read_bytes()
        cand = [m.group()[1:-1].decode('latin-1') for m in PSSTR.finditer(raw)]
        cand = [c for c in cand if re.search(r'[A-Za-z]{3,}', c)][:40]
        if cand:
            conv = norm(conv_words)
            missing = [c for c in cand if norm(c) and norm(c) not in conv]
            if missing: gsloss.append((n, len(cand), len(missing), missing[:3]))
            else: gsok += 1
    except Exception: pass
    if i % 50 == 0: print(f"  ...{i}/{len(EPS)}", flush=True)

print(f"\nPART 1 — reader vs reader on {len(EPS)} text-bearing EPS (gs-converted)")
print(f"  identical or candidate-superset : {len(seg)+len(gain)}   (of which candidate read MORE: {len(gain)})")
print(f"  \U0001f534 real character loss           : {len(loss)}")
for t in loss[:15]: print(f"      {t[0]:38} ours={t[1]:5} cand={t[2]:5} missing={t[3]!r}")
print(f"  gs conversion FAILED            : {len(failed)}  {failed[:5]}")
print(f"\nPART 2 — gs fidelity (raw EPS strings vs post-conversion text), the SHARED blind spot")
print(f"  figures whose EPS strings all survived conversion: {gsok}")
print(f"  \U0001f534 figures with strings LOST in conversion    : {len(gsloss)}")
for t in gsloss[:10]: print(f"      {t[0]:38} {t[2]}/{t[1]} lost  e.g. {t[3]}")
