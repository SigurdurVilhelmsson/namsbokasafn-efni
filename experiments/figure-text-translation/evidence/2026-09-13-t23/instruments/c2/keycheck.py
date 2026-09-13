import json, sys, collections
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
import figtext as FT
from blockkey import block_key
SC = '/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text'
for b in sys.argv[1:]:
    d = f'/home/siggi/dev/scratch-c140/c2/prep/{b}'
    runs = json.load(open(f'{d}/runs.json'))
    blocks = FT.merge_blocks(FT.group(runs))
    keys = [block_key(x) for x in blocks]
    bj = json.load(open(f'{d}/blocks.json'))
    sc = json.load(open(f'{SC}/{b}.is.json'))
    print(b, 'multiset==blocks.json', collections.Counter(keys) == collections.Counter(p['key'] for p in bj),
          'sidecar keys == send keys', set(sc['blocks']) == {p['key'] for p in bj if p['send']}, 'nblocks', len(keys))
    print('  sidecar top-level keys', list(sc.keys()))
