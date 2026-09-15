import sys, os, json, subprocess, hashlib
sys.path.insert(0, '/home/siggi/dev/scratch-c140/exo/fix')
from collapse_blend_lerp import collapse_blend_lerp   # spiker's, run as a black box for cross-check only
PREP = '/home/siggi/dev/scratch-c140/prep/figs'
rows = []
for d in sorted(os.listdir(PREP)):
    src = os.path.join(PREP, d, 'artwork.svg')
    if not os.path.isfile(src):
        rows.append({'fig': d, 'missing': True}); continue
    mine = '/home/siggi/dev/scratch-c140/exo-v/out34/%s.mine.svg' % d
    r = subprocess.run(['python3', '/home/siggi/dev/scratch-c140/exo-v/fix/lerpcollapse.py', src, mine], capture_output=True, text=True, env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'))
    if r.returncode:
        rows.append({'fig': d, 'err': r.stderr[-300:]}); continue
    rep = json.loads(r.stdout)
    a = open(src, 'rb').read(); m = open(mine, 'rb').read()
    ts, trep = collapse_blend_lerp(a.decode('utf-8'))
    tb = ts.encode('utf-8')
    ndiff_mine = sum(1 for x, y in zip(a, m) if x != y) if len(a) == len(m) else 'len%+d' % (len(m) - len(a))
    row = {'fig': d, 'bytes': len(a), 'add': rep['addFilters'], 'mineCollapsed': rep['collapsed'], 'mineRejected': len(rep['rejected']),
           'mineBytesDiff': ndiff_mine, 'identical_mine': a == m,
           'theirCollapsed': trep['collapsed'], 'theirClipped': len(trep['clipped']), 'theirUnmatched': len(trep['unmatched']),
           'identical_theirs': a == tb, 'mine_eq_theirs': m == tb}
    if not row['identical_mine']:
        pass
    else:
        os.remove(mine)
    rows.append(row); print(json.dumps(row), flush=True)
json.dump(rows, open('/home/siggi/dev/scratch-c140/exo-v/out34/cmp34.json', 'w'), indent=1)
print('figs', len(rows), 'identical_mine', sum(1 for r in rows if r.get('identical_mine')), 'identical_theirs', sum(1 for r in rows if r.get('identical_theirs')), 'mine_eq_theirs', sum(1 for r in rows if r.get('mine_eq_theirs')))
