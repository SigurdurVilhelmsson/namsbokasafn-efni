"""Extract embedded raster images from an SVG, report their pixel size, and how <use>/<mask>
reference them, so 'blurred blobs' can be judged file-intrinsic vs renderer-specific."""
import sys, re, base64, io, os, json
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
from PIL import Image

src = sys.argv[1]; outdir = sys.argv[2]
os.makedirs(outdir, exist_ok=True)
s = open(src, encoding='utf-8').read()
rows = []
for m in re.finditer(r'<image\b([^>]*?)/?>', s):
    attrs = m.group(1)
    href = re.search(r'href="data:image/(\w+);base64,([^"]+)"', attrs)
    if not href:
        rows.append({'attrs': attrs[:120], 'external': True}); continue
    fmt, data = href.group(1), href.group(2)
    im = Image.open(io.BytesIO(base64.b64decode(data)))
    idm = re.search(r'\bid="([^"]+)"', attrs)
    w = re.search(r'\bwidth="([^"]+)"', attrs); h = re.search(r'\bheight="([^"]+)"', attrs)
    tr = re.search(r'transform="([^"]+)"', attrs)
    name = (idm.group(1) if idm else f'anon{m.start()}')
    im.save(os.path.join(outdir, f'{name}.png'))
    rows.append({'id': name, 'fmt': fmt, 'px': im.size, 'mode': im.mode, 'declared': [w and w.group(1), h and h.group(1)], 'transform': tr and tr.group(1)})
# how are they used
uses = re.findall(r'<use\b[^>]*>', s)
use_rows = [u[:200] for u in uses[:12]]
masks = re.findall(r'<mask\b[^>]*>.{0,300}', s, flags=re.S)[:4]
print(json.dumps({'images': rows, 'nUse': len(uses), 'useSample': use_rows, 'maskSample': [x[:300] for x in masks]}, indent=1))
