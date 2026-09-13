import sys, json, re, collections, glob
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation'); sys.path.insert(0, '/home/siggi/dev/scratch-c140/c2/proto')
import figtext as FT, scripts as TS
from blockkey import block_key, block_english
SC = '/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text'
stats = collections.Counter(); spaced = []; allvals_spaced = []; misses = []; placed_total = 0; stretch_total = 0
distinct_tokens = set()
for bn in sorted(open('names34.txt').read().split()):
    d = f'/home/siggi/dev/scratch-c140/prep/figs/{bn}'
    runs = json.load(open(f'{d}/runs.json')); meta = json.load(open(f'{d}/meta.json'))
    sc = json.load(open(f'{SC}/{bn}.is.json'))['blocks']
    all_toks = []
    for b in FT.merge_blocks(FT.group(runs)):
        key = block_key(b); arc = FT.is_arc(b)
        toks = TS.source_tokens(b, meta['fonts'])
        all_toks += toks
        # does any styled stretch sit on a line with NO base-size run? (stacked orphan)
        for l in FT.lines(b):
            t_, s_, base = TS.line_char_styles(l, meta['fonts'])
            if not any(abs(r['size'] - base) < 0.2 and r['size'] >= max(x['size'] for x in b) - 0.2 for r in l):
                stats['lines with no block-base-size run'] += 1
        if key not in sc or FT.is_identity(sc[key], block_english(b), arc):
            continue
        stats['translated blocks (drawn)'] += 1
        if not toks: continue
        stats['translated blocks with tokens'] += 1
        v = sc[key]
        for t in toks:
            stats['tokens'] += 1; distinct_tokens.add(t['text'])
            assert not re.search(r'\s', t['text'])
            pat = r'\s*'.join(map(re.escape, t['text']))
            for m in re.finditer(pat, v):
                if re.search(r'\s', m.group()): spaced.append((bn, key, t['text'], m.group()))
        fmt, miss = TS.transfer(toks, v)
        n = sum(len(TS._stretches(t['styles'])) for t in toks)
        stretch_total += n
        placed_total += n - len(miss)
        misses += [(bn, key, m) for m in miss]
# any value in any sidecar containing a whitespace-interrupted form of ANY source token of its figure
for p in sorted(glob.glob(f'{SC}/*.is.json')):
    pass
print(dict(stats)); print('distinct token texts', len(distinct_tokens), sorted(distinct_tokens))
print('whitespace-interrupted token occurrences in translated values:', spaced)
print('stretches placed', placed_total, 'of', stretch_total, 'misses', misses)
