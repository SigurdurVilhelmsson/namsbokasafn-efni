import sys, os
sys.path.insert(0, '.')
from segs import parse
R = '/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/reference-translations/pre-remt-editorial-2026-08-23'
D = 'data'
FA = {'m68663': 'ch01', 'm68664': 'ch01', 'm68699': 'ch03', 'm68700': 'ch03'}
for mod, ch in FA.items():
    fa = parse(open(f'{R}/{ch}/{mod}-segments.is.md').read())
    fids = [i for i, _ in fa]
    print(f'== {mod}: faithful segs={len(fa)} distinct ids={len(set(fids))}')
    for ref in ['3c39e1615', 'c43026f46', '7658de896', 'de601457d', '689ddf3e2', '9a69414d5', '98a5fe2ff']:
        for kind in ['en', 'is']:
            p = f'{D}/{ref}-{mod}.{kind}.md'
            if not os.path.exists(p):
                continue
            ids = [i for i, _ in parse(open(p).read())]
            s = set(ids)
            inter = len(set(fids) & s)
            print(f'   {ref} {kind}: n={len(ids)} faithful∩={inter} faithful-only={len(set(fids)-s)} ref-only={len(s-set(fids))} sameOrder={ids==fids}')
