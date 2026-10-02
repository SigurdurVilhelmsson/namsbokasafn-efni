#!/usr/bin/env python3
"""§C140 ㊸ equivalence: the pre-㊸ find_candidates vs the memoised one, memo on and off,
on every committed chemistry _IS.svg except Econfig (which the pre-㊸ walk cannot finish).

    python3 -u equivalence.py [<git rev of the pre-㊸ figrings.py, default 7193e7f6d>]

Compares every Candidate field and the viewBox, at RING_BYTES and at -inf. Read-only.
"""
import importlib.util, json, subprocess, sys, tempfile, time
from pathlib import Path
EXP = Path(__file__).resolve().parents[2]
REPO = EXP.parents[1]
REV = sys.argv[1] if len(sys.argv) > 1 else '7193e7f6d'
sys.path.insert(0, str(EXP / 'pylibs'))
sys.path.insert(0, str(EXP))
import figrings as NEW
old_src = subprocess.run(['git', '-C', str(REPO), 'show',
                          f'{REV}:experiments/figure-text-translation/figrings.py'],
                         check=True, capture_output=True, text=True).stdout
tmp = Path(tempfile.mkdtemp()) / 'figrings_old.py'
tmp.write_text(old_src, encoding='utf-8')
spec = importlib.util.spec_from_file_location('figrings_old', tmp)
OLD = importlib.util.module_from_spec(spec)
spec.loader.exec_module(OLD)
assert 'memo' not in old_src and 'memo' in Path(NEW.__file__).read_text(encoding='utf-8')
media = REPO / 'books' / 'efnafraedi-2e' / 'media'
SKIP = 'CNX_Chem_06_04_Econfig_IS.svg'
files = sorted(p for p in media.glob('*_IS.svg') if p.name != SKIP)
tot = {'rev': REV, 'files': 0, 'mismatch': [], 'cands_default': 0, 'cands_inf': 0,
       'memo_mode': 0, 'paths_mode': 0, 't_old': 0.0, 't_new': 0.0}

def dump(r):
    c, vb = r
    return json.dumps([[x.as_dict() for x in c], vb], sort_keys=True)

for p in files:
    text = p.read_text(encoding='utf-8')
    for thr, k in ((OLD.RING_BYTES, 'cands_default'), (float('-inf'), 'cands_inf')):
        t = time.time(); o = OLD.find_candidates(text, ring_bytes=thr); tot['t_old'] += time.time() - t
        st = {}
        t = time.time(); n = NEW.find_candidates(text, ring_bytes=thr, stats=st); tot['t_new'] += time.time() - t
        f = NEW.find_candidates(text, ring_bytes=thr, memo=False)
        tot[k] += len(o[0])
        if not (dump(o) == dump(n) == dump(f)):
            tot['mismatch'].append((p.name, k))
        if k == 'cands_default':
            tot[st['mode'] + '_mode'] += 1
    tot['files'] += 1
st = {}
t = time.time()
ec = NEW.find_candidates((media / SKIP).read_text(encoding='utf-8'), ring_bytes=float('-inf'), stats=st)
tot['econfig_inf'] = {'cands': [x.as_dict() for x in ec[0]], 'stats': st, 's': round(time.time() - t, 2)}
tot['econfig_default'] = [x.as_dict() for x in NEW.find_candidates(
    (media / SKIP).read_text(encoding='utf-8'))[0]]
tot['t_old'] = round(tot['t_old'], 1); tot['t_new'] = round(tot['t_new'], 1)
print(json.dumps(tot, indent=1, default=str))
print('DONE')
