import sys, json, os
EXP='/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation'
sys.path.insert(0, EXP); os.environ.setdefault('FIGTEXT_PYLIBS', EXP+'/pylibs')
import _deps
import figtext as FT
from blockkey import block_key, block_lines
from readlayer import read
paths = sys.argv[1:]
for p in paths:
    runs, meta, outcome = read(p)
    fonts = meta['fonts']
    print('=====', p.split('chemistry-2e/')[1], outcome, 'runs', len(runs))
    for k, v in fonts.items():
        if 'Mathematical' in v['base']:
            print('  META font', k, json.dumps(v))
    blocks = FT.merge_blocks(FT.group(runs))
    for b in blocks:
        mp = [r for r in b if 'Mathematical' in fonts.get(r['font'], {}).get('base', '')]
        if not mp: continue
        arc = FT.is_arc(b); key = block_key(b); joined = key if arc else ' '.join(block_lines(b))
        send = FT.sendable(b, joined, fonts)
        print('  BLOCK key=%r send=%s' % (key, send))
        for r in b:
            print('     run %r font=%s base=%s size=%s' % (r['text'], r['font'], fonts[r['font']]['base'], r['size']))
