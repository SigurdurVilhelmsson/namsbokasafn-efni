# the c2 rule (scripts.line_char_styles) vs the census verdicts on the 34 (all34.jsonl)
import sys, json, collections
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation'); sys.path.insert(0, '/home/siggi/dev/scratch-c140/c2/proto')
import figtext as FT, scripts as TS
from blockkey import block_key
rows = [json.loads(l) for l in open('all34.jsonl')]
got = []
tok_all_styled = collections.Counter(); toks_translated = 0
for bn in sorted({r['basename'] for r in rows}):
    d = f'/home/siggi/dev/scratch-c140/prep/figs/{bn}'
    runs = json.load(open(f'{d}/runs.json')); meta = json.load(open(f'{d}/meta.json'))
    for b in FT.merge_blocks(FT.group(runs)):
        for l in ([b] if FT.is_arc(b) else FT.lines(b)):
            text, styles, base = TS.line_char_styles(l, meta['fonts'])
            k = 0
            for r in l:
                st = styles[k] if r['text'] else None; k += len(r['text'])
                got.append((st is not None and abs(st[1]) > 0.05, st is not None and st[2]))
        for t in TS.source_tokens(b, meta['fonts']):
            if all(s is not None for s in t['styles']): tok_all_styled[(bn[9:], block_key(b), t['text'])] += 1
want = [(r['rule_2b'] in ('sub', 'sup'), r['italic']) for r in rows]
print('runs', len(want), len(got), 'script verdict equal on all:', [g[0] for g in got] == [w[0] for w in want], '| italic equal:', [g[1] for g in got] == [w[1] for w in want])
print('all-styled (no-base) tokens in the 34, any state:', dict(tok_all_styled))
