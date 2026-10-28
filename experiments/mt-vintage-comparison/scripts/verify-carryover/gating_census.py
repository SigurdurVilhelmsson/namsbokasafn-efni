import sys, os, re, collections, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
import norm as N
D = load()
G = {'^x^': re.compile(r'(?<=[^\s^])\^[^\s^]{1,15}\^'), '~x~': re.compile(r'(?<=[^\s~])~[^\s~]{1,15}~'),
     '__x__': re.compile(r'(?<!_)__[^_]+__(?!_)'), '*x*': re.compile(r'\*[^*]+\*')}
seg_api = collections.Counter(); seg_noapi = collections.Counter(); occ_api = collections.Counter(); ex = []
rows = {json.loads(l)['mod'] + ':' + json.loads(l)['key'].split(':',1)[1] if False else None for l in []}
car = {}
for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'my_classes_gated-newen.jsonl')):
    r = json.loads(l)
    if r.get('src_ext'): car[r['src_ext']] = r
for p, txt in D['june']['is'].items():
    d, _ = parse_first(txt)
    for k, s in d.items():
        api = bool(N.API_MARKERS.search(s))
        for name, pat in G.items():
            m = pat.findall(s)
            if m:
                if api:
                    seg_api[name] += 1; occ_api[name] += len(m)
                    if k in car and len(ex) < 8: ex.append((name, k, car[k]['clean'], s[:140]))
                else:
                    seg_noapi[name] += 1
print('June IS segments with gated legacy form AND an API marker (left literal by injector):', dict(seg_api), 'occurrences', dict(occ_api))
print('June IS segments with gated legacy form, no API marker (converted):', dict(seg_noapi))
for e in ex: print('  ', e)
