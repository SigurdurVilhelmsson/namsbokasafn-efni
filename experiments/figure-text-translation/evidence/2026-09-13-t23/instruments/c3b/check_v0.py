#!/usr/bin/env python3
"""V0 instrument control: every per-block measure of measure-V0.jsonl == c3's baseline.jsonl / blocks.jsonl."""
import json, collections, sys
C3='/home/siggi/dev/scratch-c140/c3'
B={(r['basename'],r['block']):r for r in map(json.loads,open(C3+'/baseline.jsonl'))}
R={(r['basename'],r['block']):r for r in map(json.loads,open(C3+'/blocks.jsonl'))}
M=[json.loads(l) for l in open('/home/siggi/dev/scratch-c140/c3b/measure-V0.jsonl')]
assert len(M)==176 and {(m['basename'],m['block']) for m in M}==set(R), ('population', len(M))
mis=collections.defaultdict(list); n=collections.Counter()
def chk(name,a,b,k):
    n[name]+=1
    if a!=b: mis[name].append((k,a,b))
for m in M:
    k=(m['basename'],m['block']); bl=B[k]; r=R[k]
    chk('ink_on_dark', m['ink_on_dark'], bl['ink_on_dark_a128'],k)
    chk('ink_off_page', m['ink_off_page'], bl['ink_off_page_a128'],k)
    chk('gb_new_ink', m['gb_new_ink'], bl['gb_new_ink'],k)
    chk('shrunk', m['shrunk'], bl['shrunk'],k)
    chk('size', m['size'], bl['min_drawn_size'],k)
    chk('lines', m['lines'], r['out']['n_lines'],k)
    chk('spill', m['spill'], r['baseline']['spill_outside_container_px'],k)
    chk('ink_outside_filled', m['ink_outside_filled_region'], r['baseline']['ink_outside_container_px'],k)
    chk('src_ink_outside_filled', m['src_ink_outside_filled_region'], r['baseline']['src_ink_outside_container_px'],k)
    for g in ('container','free_dark_or_labels'):
        chk('geo_'+g, m['geometry'][g], {k2:r['geometry'][g][k2] for k2 in ('src','drawn')},k)
    chk('drawn_frame', m['drawn_frame'], r['drawn_frame'],k)
    hit=m['ink_on_dark']>=10; off=m['ink_off_page']>m['src_ink_off_page']
    v=[x for x,f in (('hit-artwork',hit),('off-page',off),('shrunk',m['shrunk'])) if f] or ['clean']
    chk('verdict', v, r['baseline']['verdict'],k)
print('comparisons per measure:', dict(n))
print('mismatches:', {k:len(v) for k,v in mis.items()} or 'NONE')
for k,v in mis.items(): print(' ',k, v[:4])
print('verdict counts', collections.Counter(tuple(r['baseline']['verdict']) for r in R.values()))
print('src_text_coll>=10:', [(m['basename'],m['block'],m['src_text_coll']) for m in M if m['src_text_coll']>=10])
print('V0 text_coll>=10:', [(m['basename'][9:],m['block'],m['key'],m['text_coll']) for m in M if m['text_coll']>=10])
