"""Census: published _IS.svg files whose embedded raster payload does not match the size the
<image> element declares, with a DIFFERENT ASPECT (a hi-res photo at the same aspect is legit).
Resumable via JSONL. Read-only against the repo."""
import sys, re, io, base64, json, os, subprocess
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
from PIL import Image
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'june-census.jsonl')
files = subprocess.run(['git', '-C', REPO, 'ls-files', 'books/efnafraedi-2e/05-publication/mt-preview/*_IS.svg'],
                       capture_output=True, text=True).stdout.split()
done = set()
if os.path.exists(OUT):
    for line in open(OUT):
        try: done.add(json.loads(line)['file'])
        except Exception: pass
IMG = re.compile(r'<image\b([^>]*?)/?>')
with open(OUT, 'a') as fh:
    for f in files:
        if f in done: continue
        s = open(os.path.join(REPO, f), encoding='utf-8', errors='replace').read()
        n = bad = 0; ex = None
        for m in IMG.finditer(s):
            a = m.group(1)
            d = re.search(r'base64,([^"]+)"', a)
            w = re.search(r'\bwidth="([^"]+)"', a); h = re.search(r'\bheight="([^"]+)"', a)
            if not (d and w and h): continue
            try:
                px = Image.open(io.BytesIO(base64.b64decode(d.group(1)))).size
                W, H = float(w.group(1)), float(h.group(1))
            except Exception:
                continue
            n += 1
            if W > 0 and H > 0 and px[0] > 0 and px[1] > 0:
                ar_decl, ar_px = W / H, px[0] / px[1]
                if abs(ar_decl - ar_px) / ar_decl > 0.05:
                    bad += 1
                    if ex is None: ex = [[W, H], list(px)]
        fh.write(json.dumps({'file': f, 'images': n, 'aspectMismatch': bad, 'example': ex}) + '\n')
rows = [json.loads(l) for l in open(OUT)]
withImg = [r for r in rows if r['images'] > 0]
bad = [r for r in rows if r['aspectMismatch'] > 0]
print(json.dumps({'files': len(rows), 'withEmbeddedImages': len(withImg), 'withAspectMismatch': len(bad),
                  'ch04': [ (r['file'].split('/')[-1], r['images'], r['aspectMismatch']) for r in bad if '/chapters/04/' in r['file']],
                  'sample': [(r['file'].split('/')[-1], r['images'], r['aspectMismatch'], r['example']) for r in bad[:15]]}, indent=1))
