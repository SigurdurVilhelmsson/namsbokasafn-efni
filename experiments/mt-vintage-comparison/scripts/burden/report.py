import json, sys
from collections import Counter, defaultdict
B = json.load(open(sys.argv[1]))
assert B['complete']
common_only = len(sys.argv) > 2 and sys.argv[2] == 'common'
recs = [r for r in B['records'] if (r['common'] or not common_only)]
bases = ('june', 'new', 'hybrid')
CL = ('SWAP-PARALLEL', 'SWAP-AGREEMENT', 'ABSENT')
RANK = {c: i for i, c in enumerate(CL)}
chs = sorted({r['chapter'] for r in B['prose']})
pk = 'proseCommon' if common_only else 'prose'
ok = 'okCommon' if common_only else 'ok'
prose = defaultdict(Counter)
for r in B['prose']:
    prose[(r['base'], r['chapter'])]['prose'] += r[pk]; prose[(r['base'], r['chapter'])]['ok'] += r[ok]
pairs = defaultdict(Counter); segs = defaultdict(dict)
for r in recs:
    pairs[(r['base'], r['chapter'])][r['class']] += 1
    k = (r['mod'], r['key'])
    cur = segs[(r['base'], r['chapter'])].get(k)
    if cur is None or RANK[r['class']] > RANK[cur]: segs[(r['base'], r['chapter'])][k] = r['class']
hw = defaultdict(Counter)
for h in B['headwords']:
    hw[(h['base'], h['chapter'])]['n'] += 1
    hw[(h['base'], h['chapter'])]['exactFix'] += (not h['exactOk'])
    hw[(h['base'], h['chapter'])]['carriesFix'] += (not h['carriesOk'])
print('POPULATION:', 'common ids only' if common_only else 'all segments of each base')
print('unit: segment-term pairs needing change (P=SWAP-PARALLEL A=SWAP-AGREEMENT X=ABSENT) | unique segments needing >=1 change | key-terms headword fixes (exact / carries)')
tot = {b: Counter() for b in bases}
hdr = f"{'ch':5s}" + ''.join(f"| {b.upper():^44s}" for b in bases)
print(hdr)
for ch in chs:
    line = f'{ch:5s}'
    for b in bases:
        p = pairs[(b, ch)]; n = sum(p.values()); u = Counter(segs[(b, ch)].values())
        pr = prose[(b, ch)]
        line += f"| pr{pr['prose']:4d} fix{n:4d} P{p['SWAP-PARALLEL']:3d} A{p['SWAP-AGREEMENT']:3d} X{p['ABSENT']:3d} seg{len(segs[(b, ch)]):4d} hw{hw[(b, ch)]['exactFix']:2d}/{hw[(b, ch)]['carriesFix']:2d} "
        t = tot[b]; t['prose'] += pr['prose']; t['fix'] += n; t['seg'] += len(segs[(b, ch)])
        for c in CL: t[c] += p[c]; t['seg-' + c] += u[c]
        t['hwExact'] += hw[(b, ch)]['exactFix']; t['hwCarries'] += hw[(b, ch)]['carriesFix']; t['hwN'] += hw[(b, ch)]['n']
    print(line)
print()
for b in bases:
    t = tot[b]
    print(f"{b.upper():7s} prose pairs {t['prose']}, needing change {t['fix']} ({100*t['fix']/t['prose']:.1f}%): "
          f"P {t['SWAP-PARALLEL']}, A {t['SWAP-AGREEMENT']}, X {t['ABSENT']} | unique segments {t['seg']} "
          f"(worst class P {t['seg-SWAP-PARALLEL']}, A {t['seg-SWAP-AGREEMENT']}, X {t['seg-ABSENT']}) | "
          f"headword fixes exact {t['hwExact']}/{t['hwN']}, carries {t['hwCarries']}/{t['hwN']}")
# ABSENT sub-split
sub = Counter((r['base'], r.get('absentSub')) for r in recs if r['class'] == 'ABSENT')
print('ABSENT split (PARTIAL = some content words of a multiword target present):', {f'{b}:{s}': n for (b, s), n in sorted(sub.items())})
# SWAP decisions resting on a non-citation (defsite) variant form
nc = Counter((r['base'], r['class']) for r in recs if r['class'].startswith('SWAP') and not r['variantCitation'])
print('SWAP decided on a surface (possibly inflected) defsite form:', dict(nc))
# by how the target was set
how = Counter((r['base'], r['how']) for r in recs)
print('needing change by decision source:', {f'{b}:{h}': n for (b, h), n in sorted(how.items())})
# hybrid: which vintage supplied the Icelandic of the segments needing change
hs = Counter(r['isSrc'] for r in recs if r['base'] == 'hybrid')
hp = Counter()
for r in B['prose']:
    pass
print('HYBRID needing change by IS source:', dict(hs))
# segment types
st = Counter((r['base'], r['segType']) for r in recs)
print('needing change by segment type:')
for b in bases:
    print('  ', b, dict(Counter({k[1]: v for k, v in st.items() if k[0] == b}).most_common(12)))
