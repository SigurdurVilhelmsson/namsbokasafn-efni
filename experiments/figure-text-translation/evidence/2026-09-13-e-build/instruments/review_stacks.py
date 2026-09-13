#!/usr/bin/env python3
"""source raster / before (BASE media) / after (working-tree media), per figure, as one JPEG."""
import json, os, re, shutil, subprocess, sys
from pathlib import Path
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
EXP = REPO / 'experiments/figure-text-translation'
sys.path.insert(0, str(EXP / 'pylibs'))
from PIL import Image, ImageDraw

T9 = Path(__file__).resolve().parent
BASE = sys.argv[1]
SITE = T9 / 'site' / 'img'
SITE.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, FIGTEXT_PYLIBS=str(EXP / 'pylibs'))
names = sorted(p.name[:-len('.is.json')] for p in (REPO / 'books/efnafraedi-2e/figure-text').glob('*.is.json'))
HASH_SUFFIX = re.compile(r'-[0-9a-f]{4}$')


def sources(ns):
    return json.loads(subprocess.run([sys.executable, 'sources.py', '--json', 'efnafraedi-2e', *ns],
                                     capture_output=True, text=True, env=env, cwd=str(EXP)).stdout)


src = sources(names)
for n in [n for n in names if not src.get(n)]:          # the driver's lookup-only de-hash
    src[n] = sources([HASH_SUFFIX.sub('', n)]).get(HASH_SUFFIX.sub('', n))
assert all(src.get(n) for n in names), [n for n in names if not src.get(n)]
done = []
for b in names:
    if (SITE / f'{b}.jpg').exists():          # resumable
        done.append(b); continue
    w = T9 / 'work' / b
    w.mkdir(parents=True, exist_ok=True)
    # Rasterise the PDF prepare STAGES, never the raw source: 9 of the 34 sources are .eps,
    # which pdftocairo cannot read; prepare converts them and writes <basename>.pdf.
    subprocess.run([sys.executable, str(EXP / 'figure-prepare.py'), src[b]['path'], '--basename', b,
                    '--out', str(w / 'prep')], check=True, capture_output=True, env=env, cwd=str(EXP))
    staged = w / 'prep' / f'{b}.pdf'
    assert staged.exists(), f'prepare staged no {staged.name} for {b}'
    subprocess.run(['pdftocairo', '-png', '-r', '150', '-singlefile', str(staged), str(w / 'source')],
                   check=True, timeout=300)
    srcimg = Image.open(w / 'source.png').convert('RGB')
    W, H = srcimg.size
    (w / 'before.svg').write_bytes(subprocess.run(
        ['git', '-C', str(REPO), 'show', f'{BASE}:books/efnafraedi-2e/media/{b}_IS.svg'],
        capture_output=True, check=True).stdout)
    (w / 'after.svg').write_bytes((REPO / f'books/efnafraedi-2e/media/{b}_IS.svg').read_bytes())
    panels = [('SOURCE - the OpenStax PDF', srcimg)]
    for tag, label in (('before', 'BEFORE - composed 2026-09-12'), ('after', 'AFTER - E, recomposed')):
        (w / f'{tag}.png').unlink(missing_ok=True)
        try:
            r = subprocess.run(['node', str(EXP / 'render-check.mjs'), str(w / f'{tag}.svg'),
                                str(w / f'{tag}.png'), str(W), str(H)],
                               capture_output=True, text=True, timeout=180)
            err = r.stderr[-300:] if r.returncode != 0 else ''
        except subprocess.TimeoutExpired:
            err = 'timed out after 180 s'
        if err or not (w / f'{tag}.png').exists():
            print('RENDER FAILED', b, tag, err, flush=True)
            panels.append((label + ' - NOT RENDERABLE IN HEADLESS CHROMIUM', Image.new('RGB', (W, 40), 'white')))
        else:
            panels.append((label, Image.open(w / f'{tag}.png').convert('RGB')))
    band = 28
    out = Image.new('RGB', (W, sum(p.size[1] + band for _, p in panels)), 'white')
    y = 0
    d = ImageDraw.Draw(out)
    for label, p in panels:
        d.rectangle([0, y, W, y + band], fill=(40, 40, 40))
        d.text((8, y + 8), label, fill='white')
        out.paste(p, (0, y + band))
        y += p.size[1] + band
    if out.size[0] > 1400:
        out = out.resize((1400, round(out.size[1] * 1400 / out.size[0])))
    out.save(SITE / f'{b}.jpg', quality=85)
    shutil.rmtree(w, ignore_errors=True)                 # /tmp is small; the JPEG is what is kept
    done.append(b)
    print('ok', b, flush=True)
print('rendered', len(done), 'of', len(names))
