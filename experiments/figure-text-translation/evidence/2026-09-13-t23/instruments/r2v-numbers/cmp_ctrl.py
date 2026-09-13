import json, sys
from pathlib import Path
ROOT = Path('/home/siggi/dev/scratch-c140'); ME = ROOT / 'r2v-numbers'; R2 = ROOT / 'r2'
def load(p): return {(r['basename'], r['block']): r for r in map(json.loads, open(p))}
for mt, ht in (('V5_p2.0_f7.0', 'V0'), ('V5_p2.0_f7.0', 'V5_p2.0_f7.5'), ('V5_p2.0_f7.0', 'V5_p2.0_f7.0')):
    m = load(ME / 'out' / f'mym-{mt}.jsonl'); h = load(R2 / f'measure-{ht}.jsonl')
    bad = [k for k in m if m[k]['text'] != h[k]['text'] or m[k]['lines'] != h[k]['lines'] or abs(m[k]['size'] - h[k]['size']) > 1e-6
           or max(abs(m[k]['frame'][s] - h[k]['drawn_frame'][s]) for s in ('a0', 'a1', 'n0', 'n1')) > 0.011
           or m[k]['ink_on_dark'] != h[k]['ink_on_dark'] or m[k]['spill'] != h[k]['spill'] or m[k]['text_coll'] != h[k]['text_coll']]
    print(f'mine {mt} vs builder {ht}: {len(bad)} blocks differ', sorted(f"{b.replace('CNX_Chem_','')} b{i}" for b, i in bad)[:8])
