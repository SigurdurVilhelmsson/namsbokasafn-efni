"""Collect observed renderings per taught term: key-terms entries (both vintages, every chapter,
same English headword), bold in-text definition renderings (both vintages, measure.py's positional
pairing), the exact house-style ruling, and the verdict's july/new entries."""
import json, sys
from collections import Counter, defaultdict
sys.path.insert(0, sys.argv[1])
import lib
M = lib.M
C, S = lib.load(sys.argv[2])
T = json.load(open(sys.argv[3]))
terms, R = T['terms'], T['rulings']
# key-terms entries by English headword, across the whole book, both vintages
kt = defaultdict(Counter)
for t in terms:
    for v, K in (('old', t['Kold']), ('new', t['Knew'])):
        if K: kt[t['enNorm']][(M.plain(K).strip(), f'keyterm-{v}-{t["chapter"]}')] += 1
# bold definition sites per chapter+headword, both vintages
defs = defaultdict(Counter)
for ch in C['chapters']:
    heads = {t['enNorm'] for t in terms if t['chapter'] == ch}
    for m in C['modules'][ch]['new']:
        for v in ('old', 'new'):
            en, is_ = S[(ch, m, v)]
            for k, e in en.items():
                if k.startswith(('glossary-term:', 'glossary-def:')) or k not in is_: continue
                es = M.term_spans(e)
                if not es: continue
                isp = M.term_spans(is_[k])
                for i, s in enumerate(es):
                    h = M.norm_en(s)
                    if h in heads and len(isp) == len(es):
                        defs[(ch, h)][(M.plain(isp[i]).strip(), f'defsite-{v}')] += 1
out = {}
for t in terms:
    vs = Counter()
    vs.update(kt[t['enNorm']])
    vs.update(defs[(t['chapter'], t['enNorm'])])
    for r in R:
        if any(f.lower() == t['enNorm'] for f in r['en']):
            vs[(r['is'], 'ruling')] += 1
    out[f"{t['chapter']}|{t['definitionId']}"] = [[f, s, n] for (f, s), n in vs.items()]
json.dump(out, open(sys.argv[4], 'w'), ensure_ascii=False, indent=0)
# show a few decided terms
for t in terms:
    if t['src'] in ('verdict', 'ruling') and t['chapter'] in ('ch01', 'ch04', 'ch07'):
        print(t['chapter'], repr(t['en']), '->', repr(t['target']), t.get('choice'))
        for f, s, n in out[f"{t['chapter']}|{t['definitionId']}"]:
            print('     ', repr(f), s, n)
