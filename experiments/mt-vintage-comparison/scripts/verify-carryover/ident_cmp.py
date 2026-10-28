import sys, os, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
HERE = os.path.dirname(os.path.abspath(__file__))
D = load()
files = {(chapter_of(p), module_of(p)): p for p in D['new']['en']}
NI = {}
for (ch, mod), p in files.items():
    d, _ = parse_first(D['new']['is'][pair_path(p)])
    for k, v in d.items(): NI[(ch, mod, k.split(':', 1)[1])] = v
th = {}
for l in open('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts/carryover/classification.jsonl'):
    r = json.loads(l); th[(r['chdir'], r['module'], r['key'])] = r
mine = {}
for l in open(os.path.join(HERE, 'my_classes_gated-newen.jsonl')):
    r = json.loads(l); mine[(r['ch'], r['mod'], r['key'].split(':',1)[1])] = r
t_id = {k for k, r in th.items() if r.get('conv_status') == 'clean' and r.get('carried_is') == NI[k]}
m_id = {k for k, r in mine.items() if r.get('clean') and r.get('identical_new_is')}
print('their carried_is == NEW IS (recounted by me):', len(t_id), 'chars', sum(th[k]['en_chars'] for k in t_id))
print('mine identical:', len(m_id), '| both', len(t_id & m_id), '| mine-only', len(m_id - t_id), '| theirs-only', len(t_id - m_id))
ex = sorted(m_id - t_id)
for k in ex[:10]:
    print('  ', k, '\n     theirs:', repr(th[k].get('carried_is', '')[:160]), '\n     NEW IS:', repr(NI[k][:160]), '\n     mine  :', repr(mine[k].get('carried','')[:160]))
c = collections.Counter()
for k in m_id - t_id:
    a, b = th[k].get('carried_is', ''), NI[k]
    c['visible-equal' if visible(a) == visible(b) else 'visible-differ'] += 1
print('mine-only identical, theirs differ — their carried vs NEW IS visible:', dict(c))
