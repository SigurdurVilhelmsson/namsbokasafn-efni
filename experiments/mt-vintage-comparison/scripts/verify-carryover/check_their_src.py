"""For every key the other investigator carries, check their chosen source with MY normalizer:
visible(NEW EN[k]) == visible(June-ref EN[src]) == visible(as-translated EN[src]); and source uniqueness."""
import sys, os, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
HERE = os.path.dirname(os.path.abspath(__file__))
THEIRS = '/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts/carryover/classification.jsonl'
D = load(); A = json.load(open(os.path.join(HERE, 'raw', 'astrans.json')))
files = {}
for p in D['new']['en']:
    files[(chapter_of(p), module_of(p))] = p
cache = {}
def get(ch, mod):
    if (ch, mod) not in cache:
        p = files[(ch, mod)]; ip = pair_path(p)
        pref = (D['new']['en'][p].split('SEG:')[1].split(':')[0])  # module prefix in SEG ids
        cache[(ch, mod)] = (pref, parse_first(D['new']['en'][p])[0], parse_first(D['june']['en'][p])[0], parse_first(A[p]['en'])[0], parse_first(D['june']['is'][ip])[0])
    return cache[(ch, mod)]
stat = collections.Counter(); bad = []; srcuse = collections.Counter()
mine = {}
for l in open(os.path.join(HERE, 'my_classes_gated-newen.jsonl')):
    r = json.loads(l); mine[(r['ch'], r['mod'], r['key'].split(':',1)[1])] = r
for l in open(THEIRS):
    r = json.loads(l)
    s = r.get('source_key')
    if not s: continue
    pref, ne, je, ae, ji = get(r['chdir'], r['module'])
    k = pref + ':' + r['key']; sk = pref + ':' + s
    srcuse[(r['chdir'], r['module'], s)] += 1
    v = visible(ne[k])
    okj = sk in je and visible(je[sk]) == v
    oka = sk in ae and visible(ae[sk]) == v
    sub = r['class'][0] + ('/' + r['sub'][:10] if r.get('sub') else '')
    stat[(sub, okj, oka)] += 1
    if not (okj and oka):
        m = mine[(r['chdir'], r['module'], r['key'])]
        bad.append({'key': k, 'their_src': sk, 'class': r['class'], 'sub': r.get('sub'), 'okj': okj, 'oka': oka,
                    'new_en': ne[k][:160], 'june_en_src': je.get(sk, '')[:160], 'astrans_en_src': ae.get(sk, '')[:160], 'my_src': m.get('src_ext'),
                    'conv': r.get('conv_status')})
print('their carried keys by (class/sub, juneref-EN equal, astrans-EN equal):')
for x, n in sorted(stat.items(), key=lambda x: -x[1]): print('  ', x, n)
dup = {k: n for k, n in srcuse.items() if n > 1}
print('June source keys used more than once by their mapping:', len(dup), list(dup.items())[:5])
print('mismatching sources:', len(bad))
json.dump(bad, open(os.path.join(HERE, 'their_src_mismatch.json'), 'w'), ensure_ascii=False, indent=1)
for b in bad[:12]: print(json.dumps(b, ensure_ascii=False)[:600])
