#!/usr/bin/env python3
"""Five-way figure census, ONE population, denominator stated.

Population: every distinct <image src> basename referenced by a book's CNXML
(what the driver would enumerate), resolved through sources.py's real edition
precedence. NOT the artwork tree, which is a different population.

Two instruments, deliberately different implementations:
  OURS   = extract.py's view (pikepdf, page /Contents + page /Resources/Font only)
  ORACLE = poppler pdftotext, which descends into /Form XObjects
A disagreement is the finding.
"""
import json, re, subprocess, sys, tempfile, os
from pathlib import Path

EXP = Path(__file__).resolve().parent   # never an absolute machine path - repo rule
sys.path.insert(0, str(EXP))
sys.path.insert(0, str(EXP / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(EXP / 'pylibs'))
import pikepdf
import sources as S

BOOK = sys.argv[1] if len(sys.argv) > 1 else 'efnafraedi-2e'
REPO = Path(__file__).resolve().parents[2]
SRC = REPO / 'books' / BOOK / '01-source'

# --- population: CNXML <image src> basenames -------------------------------
IMG = re.compile(rb'<image\b[^>]*?src="([^"]+)"', re.S)
names = set()
for cnxml in sorted(SRC.rglob('*.cnxml')):
    for m in IMG.finditer(cnxml.read_bytes()):
        b = os.path.basename(m.group(1).decode('utf-8', 'replace'))
        names.add(os.path.splitext(b)[0])
names = sorted(names)

cfg = S.load_config(); trees = S.load_trees(BOOK, cfg); prec = cfg['editionPrecedence']
DEHASH = re.compile(r'-[0-9a-f]{4}$')

def oracle_words(pdf):
    try:
        r = subprocess.run(['pdftotext', '-q', str(pdf), '-'],
                           capture_output=True, timeout=60)
        return len(r.stdout.decode('utf-8', 'replace').split())
    except Exception:
        return -1

def ours(pdf):
    """What extract.py can see: page /Font + BT in the page stream."""
    try:
        with pikepdf.open(pdf) as p:
            pg = p.pages[0]
            res = pg.get('/Resources', {}) or {}
            fonts = res.get('/Font', {}) or {}
            pagefonts = [str(k) for k in fonts.keys()]
            type0 = sum(1 for k in fonts.keys()
                        if str(fonts[k].get('/Subtype', '')) == '/Type0')
            usable = sum(1 for k in fonts.keys()
                         if '/FirstChar' in fonts[k] and '/Widths' in fonts[k])
            stream = bytes(pg.Contents.read_bytes()) if '/Contents' in pg else b''
            xo = res.get('/XObject', {}) or {}
            forms = [k for k in xo.keys() if str(xo[k].get('/Subtype', '')) == '/Form']
            formtext = 0
            for k in forms:
                try:
                    if b'BT' in bytes(xo[k].read_bytes()):
                        formtext += 1
                except Exception:
                    pass
            imgs = sum(1 for k in xo.keys() if str(xo[k].get('/Subtype', '')) == '/Image')
            return dict(pagefonts=len(pagefonts), usablefonts=usable, type0=type0,
                        pageBT=b'BT' in stream, forms=len(forms),
                        formtext=formtext, images=imgs)
    except Exception as e:
        return dict(error=type(e).__name__)

rows = []
for n in names:
    p, key = S.resolve(n, trees, prec)
    dehashed = False
    if not p and DEHASH.search(n):
        p, key = S.resolve(DEHASH.sub('', n), trees, prec)
        dehashed = bool(p)
    if not p:
        rows.append(dict(name=n, bucket='unresolved')); continue

    src = p
    tmp = None
    if p.suffix.lower() in ('.eps', '.ai'):
        tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
        tmp.close()
        r = subprocess.run(['gs', '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-dEPSCrop',
                            '-sDEVICE=pdfwrite', f'-sOutputFile={tmp.name}', str(p)],
                           capture_output=True, timeout=120)
        if r.returncode != 0 or os.path.getsize(tmp.name) == 0:
            rows.append(dict(name=n, bucket='eps-convert-failed', edition=key)); 
            os.unlink(tmp.name); continue
        src = Path(tmp.name)

    w = oracle_words(src)
    o = ours(src)
    if tmp: os.unlink(tmp.name)

    if 'error' in o:
        bucket = 'ours-crashes'
    elif w <= 0:
        bucket = 'photo' if o.get('images') else 'textless'
    elif o['pageBT'] and o['usablefonts'] > 0:
        bucket = 'page-text'                    # our extractor can read it
    elif o['formtext'] > 0:
        bucket = 'form-text-only'               # 🔴 SILENT SKIP
    elif o['type0'] > 0 or (o['pagefonts'] > 0 and o['usablefonts'] == 0):
        bucket = 'type0-unreadable'             # 🔴 SILENT PARTIAL
    else:
        bucket = 'text-but-unexplained'         # 🔴 a mechanism we have not named
    rows.append(dict(name=n, bucket=bucket, words=w, edition=key,
                     dehashed=dehashed, ext=p.suffix.lower(), **o))

out = Path(os.environ.get('FIGTEXT_CENSUS_OUT') or (Path(__file__).resolve().parent / 'census-out'))
(out / f'{BOOK}.json').write_text(json.dumps(rows, indent=1))
from collections import Counter
c = Counter(r['bucket'] for r in rows)
print(f"BOOK={BOOK}  DENOMINATOR = {len(names)} distinct CNXML <image src> basenames")
for k, v in c.most_common():
    print(f"  {k:24} {v:5}")
skip = [r for r in rows if r['bucket'] in ('form-text-only','type0-unreadable','text-but-unexplained')]
print(f"\n  SILENT-SKIP POPULATION: {len(skip)}  ({sum(r.get('words',0) for r in skip)} English words)")
