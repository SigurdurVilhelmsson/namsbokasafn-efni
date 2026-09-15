#!/usr/bin/env python3
"""Independent recount of results.jsonl (P / J1 / J2 arms) vs committed figure-text."""
import json, re, collections, pathlib
BASE = pathlib.Path('/home/siggi/dev/scratch-c140/label-context-mt')
FT = pathlib.Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
recs = [json.loads(l) for l in open(BASE / 'results.jsonl') if l.strip()]
print('records', len(recs), collections.Counter(r['arm'] for r in recs))

P = collections.defaultdict(dict); J = {}
for r in recs:
    if r['arm'] == 'P': P[r['fig']][r['idx']] = r
    else:
        assert (r['fig'], r['arm']) not in J; J[(r['fig'], r['arm'])] = r
multi = sorted(f for f in P if len(P[f]) > 1)
single = sorted(f for f in P if len(P[f]) == 1)
print('figs', len(P), 'multi', len(multi), 'single', single)
# joined arm must exist for multi figs, and P idx contiguous, J en == join of P en
for f in multi:
    n = len(P[f]); assert sorted(P[f]) == list(range(n))
    for a in ('J1', 'J2'):
        j = J[(f, a)]
        assert j['keys'] == [P[f][i]['key'] for i in range(n)], (f, a)
        assert j['en'] == '\n'.join(P[f][i]['en'] for i in range(n)), (f, a)
print('joined arms for single figs:', [k for k in J if k[0] in single])

split = {}; split_ok = collections.Counter(); split_bad = []
for f in multi:
    n = len(P[f])
    for a in ('J1', 'J2'):
        lines = J[(f, a)]['is'].split('\n')
        ok = len(lines) == n and all(l.strip() for l in lines)
        split_ok[a] += ok
        if ok: split[(f, a)] = lines
        else: split_bad.append((f, a, n, len(lines), J[(f, a)]['is']))
print('split ok', dict(split_ok), 'of', len(multi), 'each; total', sum(split_ok.values()), 'of', 2 * len(multi))
for b in split_bad: print('  SPLIT FAIL', b)

labels = []
for f in multi:
    blocks = json.load(open(FT / f'{f}.is.json'))['blocks']
    for i in range(len(P[f])):
        k = P[f][i]['key']
        labels.append(dict(fig=f, idx=i, key=k, en=P[f][i]['en'], P=P[f][i]['is'],
                           C=blocks.get(k), J1=split.get((f, 'J1'), [None] * 99)[i],
                           J2=split.get((f, 'J2'), [None] * 99)[i]))
N = len(labels)
print('labels in multi figs', N, 'missing committed', sum(l['C'] is None for l in labels))
dupkeys = sum(1 for f in multi for k, c in collections.Counter(P[f][i]['key'] for i in P[f]).items() if c > 1)
print('duplicate keys within a fig', dupkeys)

def ws(s): return ' '.join(s.split())
def cmp(a, b, norm=lambda s: s):
    both = [l for l in labels if l[a] is not None and l[b] is not None]
    d = [l for l in both if norm(l[a]) != norm(l[b])]
    return len(d), len(both), d
for a, b in [('P', 'C'), ('J1', 'J2'), ('J1', 'P'), ('J2', 'P')]:
    n, den, d = cmp(a, b); nw, _, _ = cmp(a, b, ws)
    print(f'{a} vs {b}: differ {n}/{den} exact; {nw}/{den} whitespace-normalised')
both = [l for l in labels if l['J1'] is not None and l['J2'] is not None]
stable = [l for l in both if l['J1'] == l['J2'] != l['P']]
print('J1==J2!=P:', len(stable), '/', len(both))
for l in stable: print('   ', l['fig'], repr(l['en']), 'P=', repr(l['P']), 'J=', repr(l['J1']))

# ---- formula / number / symbol damage ----
LET = r'[^\W\d_]'
FORM = re.compile(r'(?<![\w])(?:(?:[A-Z][a-z]?\d*)|\((?:[A-Z][a-z]?\d*)+\)\d*)+(?:\((?:aq|s|l|g)\))?[+–−]?(?!' + LET + ')')
NUM = re.compile(r'\d+(?:[.,]\d+)?')
SYM = re.compile(r'[+–−=→%×/]')
def sig(s, en=False):
    forms = [m.group(0) for m in FORM.finditer(s)]
    nums = [m.group(0).replace(',', '.') for m in NUM.finditer(s)]
    if not en: pass
    syms = [c for c in SYM.findall(s)]
    return collections.Counter(forms), collections.Counter(nums), collections.Counter(syms)
def dotdecimal_kept(en, tr):  # a '.' decimal kept instead of comma
    return [m for m in re.findall(r'\d+\.\d+', tr)]
damage = []
for l in labels:
    ef, en_, es = sig(l['en'])
    for arm in ('P', 'J1', 'J2', 'C'):
        t = l[arm]
        if t is None: continue
        tf, tn, ts = sig(t)
        probs = []
        if tf != ef: probs.append(f'formula EN{dict(ef)} vs {dict(tf)}')
        if tn != en_: probs.append(f'number EN{dict(en_)} vs {dict(tn)}')
        if ts != es: probs.append(f'symbol EN{dict(es)} vs {dict(ts)}')
        if dotdecimal_kept(l['en'], t): probs.append('decimal point not localised')
        if probs: damage.append((l['fig'], l['idx'], arm, l['en'], t, probs))
print('damage candidates', len(damage))
for d in damage: print('  ', d)
# English-side positive control: labels with any formula/number tokens
ctl = sum(1 for l in labels if any(sig(l['en'])))
print('labels whose EN carries >=1 formula/number/symbol token (control):', sum(1 for l in labels if sum(sum(c.values()) for c in sig(l['en']))>0), '/', N)

cost = collections.defaultdict(float); units = collections.defaultdict(int); types = set()
for r in recs:
    cost[r['arm']] += r['usage']['cost']; units[r['arm']] += r['usage']['units']; types.add(r['usage']['unitType'])
    assert r['usage']['units'] == len(r['en']) or True
print('cost by arm', {k: round(v, 2) for k, v in cost.items()}, 'total', round(sum(cost.values()), 2))
print('units by arm', dict(units), 'total', sum(units.values()), types)
print('units==len(en) mismatches', [(r['fig'], r['arm'], r['usage']['units'], len(r['en'])) for r in recs if r['usage']['units'] != len(r['en'])][:10])
print('usage keys', {tuple(sorted(r['usage'])) for r in recs})

# ---- controls and extras ----
tf, tn, ts = sig('Mól af C8H17 og 9,56 g'); ef, en_, es = sig('Moles of C8H18 and 9.55 g')
print('CONTROL mutated formula/number detected:', tf != ef, tn != en_)
print('CONTROL decimal comma accepted:', sig('12,85 g')[1] == sig('12.85 g')[1])
for l in labels:
    runs = re.findall(r' {2,}', l['en'])
    if re.search(r' {3,}', l['en']):
        for arm in ('P', 'J1', 'J2', 'C'):
            print('  wide-gap', l['fig'], arm, repr(l[arm]), 'EN gaps', [len(x) for x in re.findall(r' {3,}', l['en'])], 'arm gaps', [len(x) for x in re.findall(r' {3,}', l[arm])])
print('unit mL->ml:', [(l['fig'], arm) for l in labels for arm in ('P','J1','J2','C') if 'mL' in l['en'] and 'mL' not in l[arm]])
_, _, d = cmp('J1', 'J2')
for l in d: print('  J1!=J2', l['fig'], repr(l['en']), repr(l['J1']), repr(l['J2']), 'P=', repr(l['P']))
_, _, d = cmp('P', 'C')
for l in d: print('  P!=C', l['fig'], repr(l['en']), 'P=', repr(l['P']), 'C=', repr(l['C']))
