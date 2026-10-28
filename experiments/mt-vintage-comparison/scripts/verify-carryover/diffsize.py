"""How different are the 'differing' carried segments? Word-level similarity of visible June IS vs NEW IS."""
import sys, os, json, collections, difflib, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
HERE = os.path.dirname(os.path.abspath(__file__))
D = load()
NI = {}
for p in D['new']['en']:
    d, _ = parse_first(D['new']['is'][pair_path(p)])
    NI.update(d)
rows = [json.loads(l) for l in open(os.path.join(HERE, 'my_classes_gated-newen-reuse.jsonl'))]
buck = collections.Counter(); bchars = collections.Counter(); tot = 0; totc = 0
samples = collections.defaultdict(list)
for r in rows:
    if not r.get('src_ext') or not r['clean'] or r['identical_new_is']: continue
    a = re.findall(r'\w+|[^\w\s]', visible(r['carried'], legacy=False))
    b = re.findall(r'\w+|[^\w\s]', visible(NI[r['key']]))
    ratio = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
    bk = '>=0.95' if ratio >= 0.95 else '0.80-0.95' if ratio >= 0.8 else '0.50-0.80' if ratio >= 0.5 else '<0.50'
    buck[bk] += 1; bchars[bk] += r['en_chars']; tot += 1; totc += r['en_chars']
    if len(samples[bk]) < 2 and r['en_chars'] > 120: samples[bk].append(r['key'])
print('clean carried segments that differ from NEW IS:', tot, 'EN chars', totc)
for bk in ('>=0.95', '0.80-0.95', '0.50-0.80', '<0.50'):
    print(f'  token-similarity {bk:10s}: {buck[bk]:6d} segs ({100*buck[bk]/tot:5.1f}%)  {bchars[bk]:8d} EN chars ({100*bchars[bk]/totc:5.1f}%)')
print('samples:', dict(samples))
