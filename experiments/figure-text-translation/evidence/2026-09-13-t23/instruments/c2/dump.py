import json, sys
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
import figtext as FT
from blockkey import block_key
for b in sys.argv[1:]:
    d = f'/home/siggi/dev/scratch-c140/c2/prep/{b}'
    runs = json.load(open(f'{d}/runs.json')); meta = json.load(open(f'{d}/meta.json'))
    print('=====', b, 'run keys', sorted(runs[0].keys()))
    for bi, blk in enumerate(FT.merge_blocks(FT.group(runs))):
        print(f'-- block {bi} {block_key(blk)!r} arc={FT.is_arc(blk)}')
        for li, l in enumerate(FT.lines(blk)):
            for r in l:
                base = meta['fonts'].get(r['font'], {}).get('base', '')
                print(f'   L{li} {r["text"]!r:24} size={r["size"]:.3f} proj={FT.proj(r):8.3f} along={FT.along(r):8.3f} adv={r["adv"]:.3f} rot={r["rot"]} font={base}')
