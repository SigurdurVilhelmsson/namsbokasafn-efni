import json, collections
from pathlib import Path
R = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
F = Path('/home/siggi/dev/scratch-c140/prep/figs')
tot = collections.Counter()
per = {}
for d in sorted(F.iterdir()):
    if not d.is_dir(): continue
    b = d.name
    blocks = json.loads((d/'blocks.json').read_text())
    # blocks.json shape?
    if isinstance(blocks, dict) and 'blocks' in blocks: blocks = blocks['blocks']
    items = list(blocks.items()) if isinstance(blocks, dict) else [(x.get('key'), x) for x in blocks]
    side = json.loads((R/f'{b}.is.json').read_text())
    sb = side.get('blocks', side)
    n = len(items); nsend = sum(1 for k,v in items if v.get('send')); 
    rep = json.loads((d/'compose-report.json').read_text())
    tot['figs'] += 1; tot['blocks'] += n; tot['send_true'] += nsend; tot['send_false'] += n-nsend
    tot['identity'] += len(rep.get('identity', [])); tot['runExact'] += len(rep.get('runExact', []))
    tot['sidecar_unique_keys'] += len(sb)
    per[b] = (n, nsend, len(rep.get('identity', [])), len(rep.get('runExact', [])))
print(dict(tot))
print('example blocks.json type', type(json.loads((F/'CNX_Chem_04_03_map2_img'/'blocks.json').read_text())))
