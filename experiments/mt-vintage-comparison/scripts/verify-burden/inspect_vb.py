import json, sys, os, pickle, re
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vb_lib import *
import classes_vb as C   # re-runs classification quickly (prints summary)
B = C.B; corpus = C.corpus; dec = C.decided
def show(base, mod, key, term, full=False, window=None):
    p = next(p for p in B['results']['all'][base] if p['mod'] == mod and p['key'] == key and p['term'] == term)
    d = dec[(p['ch'], p['term'])]
    c = corpus[p['ch']][p['mod']]
    en = c['enJ'][key] if base == 'june' else c['enN'][key]
    is_ = c['isJ'][key] if base == 'june' else (c['isN'][key] if base == 'new' else c['hyb'][key])
    comps = C.competitors(d, True)
    carried = [x for x in comps if M.carries(is_, M.stems(x))]
    print(f'\n=== {base} {mod} {key} term={term!r} target={d["target"]!r} cls={p["cls"]}')
    print('   competitors:', comps)
    print('   carried    :', carried, [C.final2(x) for x in carried], 'target final2', C.final2(d['target']))
    pi = M.plain(is_)
    if window:
        i = pi.find(window); print('   IS window:', pi[max(0, i-200):i+300])
    elif full:
        print('   EN:', M.plain(en)); print('   IS:', pi)
for args in [('new','m68667','para:fs-idp42086864','heterogeneous mixture', True),
             ('new','m68741','table-summary:fs-idm33829552-summary','lattice energy', True),
             ('june','m68733','para:fs-idm146032560','amplitude', True),
             ('new','m68847','problem:fs-idp1050336','functional group', False),
             ('new','m68754','para:fs-idp14262464','rate of diffusion', False),
             ('new','m68773','para:fs-idp589840','face-centered cubic unit cell', False),
             ('june','m68844','para:fs-idm89530000','central metal', False),
             ('hybrid','m68769','alt:fs-idp24684528-alt','critical point', False),
             ('new','m68781','para:fs-idm4855136','weak electrolyte', False)]:
    show(*args)
