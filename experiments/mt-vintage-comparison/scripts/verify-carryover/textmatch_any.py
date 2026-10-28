"""Method-independent: for each NEW key, does ANY June segment in the same module carry the identical
normalized English (June-ref AND as-translated)? Also: offset structure of shifted entry cells, and dup check."""
import sys, os, json, collections, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
HERE = os.path.dirname(os.path.abspath(__file__))
D = load(); A = json.load(open(os.path.join(HERE, 'raw', 'astrans.json')))
any_match = collections.Counter(); per_type_nomatch = collections.Counter(); nomatch = []
offsets_per_module = {}
dup_generic_diff = 0; dup_total = 0; dup_examples = []
for p in sorted(D['new']['en']):
    ip = pair_path(p)
    ne, no = parse_first(D['new']['en'][p]); je, jo = parse_first(D['june']['en'][p]); ae, _ = parse_first(A[p]['en'])
    jt = collections.defaultdict(list)
    for k in jo:
        v = visible(je[k])
        if v == visible(ae[k]): jt[v].append(k)
    for k in no:
        v = visible(ne[k]); typ = k.split(':')[1]
        if jt.get(v):
            any_match[typ in ('alt', 'table-summary')] += 1
        else:
            per_type_nomatch[typ] += 1
            if typ not in ('alt', 'table-summary'): nomatch.append((k, ne[k][:150]))
    # duplicates: compare each repeat occurrence with first under generic normalization
    for lang, txt in (('en', D['new']['en'][p]), ('is', D['new']['is'][ip]), ('jen', D['june']['en'][p]), ('jis', D['june']['is'][ip])):
        first = {}
        for k, c in parse_records(txt):
            if k in first:
                dup_total += 1
                if visible(c) != visible(first[k]):
                    dup_generic_diff += 1
                    if len(dup_examples) < 5: dup_examples.append((lang, k, first[k][:100], c[:100]))
            else:
                first[k] = c
print('NEW keys with >=1 identical-normalized-EN June segment in module: non-alt/summary', any_match[False], '| alt/summary', any_match[True])
print('no match by type:', dict(per_type_nomatch))
for x in nomatch: print('   ', x)
print('duplicate occurrences (4 corpora: NEW EN, NEW IS, June EN, June IS):', dup_total, 'differing from first under generic normalization:', dup_generic_diff)
for e in dup_examples: print('   ', e)
