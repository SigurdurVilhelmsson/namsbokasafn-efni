import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
HERE = os.path.dirname(os.path.abspath(__file__))
D = load(); A = json.load(open(os.path.join(HERE, 'raw', 'astrans.json')))
mine = {}
for l in open(os.path.join(HERE, 'my_classes_gated-newen-reuse.jsonl')):
    r = json.loads(l); mine[r['key']] = r
th = {}
for l in open('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts/carryover/classification.jsonl'):
    r = json.loads(l); th[(r['module'], r['key'])] = r
files = {}
for p in D['new']['en']:
    first = D['new']['en'][p].split('SEG:')[1].split(':')[0]
    files.setdefault(first, []).append(p)
W = int(os.environ.get('W', '400'))
for key in sys.argv[1:]:
    mod = key.split(':')[0]
    p = [x for x in files[mod]][0]
    ne, _ = parse_first(D['new']['en'][p]); ni, _ = parse_first(D['new']['is'][pair_path(p)])
    je, _ = parse_first(D['june']['en'][p]); ji, _ = parse_first(D['june']['is'][pair_path(p)]); ae, _ = parse_first(A[p]['en'])
    m = mine[key]; t = th.get((module_of(p), key.split(':', 1)[1]), {})
    s = m.get('src_ext')
    print('=' * 100); print(key, '| my cls', m['cls'], 'src', s, 'clean', m.get('clean'), m.get('conv_reasons'), m.get('kind_delta'), 'ident', m.get('identical_new_is'), '| their', t.get('class'), t.get('source_key'), t.get('conv_status'), t.get('conv_reasons'))
    print('  NEW EN      :', ne[key][:W])
    if s:
        print('  JUNE EN src :', je[s][:W])
        if ae[s] != je[s]: print('  ASTRANS EN  :', ae[s][:W])
        print('  JUNE IS src :', ji[s][:W])
        print('  my carried  :', (m.get('carried') or '')[:W])
        if t.get('carried_is') and t.get('carried_is') != m.get('carried'): print('  their carried:', t['carried_is'][:W])
    elif key in je:
        print('  JUNE EN same:', je[key][:W]); print('  ASTRANS same:', ae.get(key, '')[:W]); print('  JUNE IS same:', ji[key][:W])
    print('  NEW IS      :', ni[key][:W])
