"""Registration of the browser-rendered artwork (Chromium, artwork.svg) against pdftocairo's artwork.png:
best integer (dx,dy) in [-8,8]^2 maximising overlap of dark masks, globally and per horizontal third.
Positive control: artwork.png shifted by a known (3,-2) must return (3,-2)."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
SP = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/d293cd29-19d8-4ccc-a2b3-244bf111501b/scratchpad')
def dark(p):
    a = np.asarray(Image.open(p).convert('L')).astype(np.int16)
    return a < 128
def best(A, B, R=8):
    """shift (dx,dy) such that B[y,x] ~ A[y-dy, x-dx]"""
    H, W = A.shape; bestv = (-1, 0, 0)
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            a = A[max(0, -dy):H - max(0, dy), max(0, -dx):W - max(0, dx)]
            b = B[max(0, dy):H - max(0, -dy), max(0, dx):W - max(0, -dx)]
            v = int((a & b).sum())
            if v > bestv[0]: bestv = (v, dx, dy)
    return bestv
out = []
names = sys.argv[1:] or (SP / 'prep/bought.txt').read_text().split()
A0 = dark(SP / 'prep' / names[0] / 'artwork.png')
Bs = np.zeros_like(A0); Bs[max(0,-2):A0.shape[0]-max(0,2), 3:] = A0[max(0,2):A0.shape[0]-max(0,-2), :-3]
print('control expects (3,-2):', best(A0, Bs)[1:])
for b in names:
    p = SP / 'proto/bprep' / b / 'artwork.png'
    if not p.exists(): continue
    A = dark(SP / 'prep' / b / 'artwork.png'); B = dark(p)
    g = best(A, B)
    W = A.shape[1]; thirds = [best(A[:, i*W//3:(i+1)*W//3], B[:, i*W//3:(i+1)*W//3]) for i in range(3)]
    row = dict(basename=b, W=W, H=A.shape[0], dark_px=int(A.sum()), glob=g[1:], overlap=round(g[0]/max(A.sum(),1),3),
               thirds=[t[1:] for t in thirds], thirds_overlap=[round(t[0]/max(1, A[:, i*W//3:(i+1)*W//3].sum()),3) for i, t in enumerate(thirds)])
    out.append(row); print(json.dumps(row), flush=True)
(SP / 'proto/data/regshift.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in out))
