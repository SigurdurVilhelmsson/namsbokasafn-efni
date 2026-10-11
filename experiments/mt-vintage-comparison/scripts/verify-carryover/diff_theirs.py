import sys, os, json, collections
HERE = os.path.dirname(os.path.abspath(__file__))
THEIRS = '/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts/carryover/classification.jsonl'
mine = {}
for l in open(os.path.join(HERE, sys.argv[1] if len(sys.argv) > 1 else 'my_classes_gated-newen.jsonl')):
    r = json.loads(l); r['_src_ext'] = r.get('src_ext'); mine[(r['ch'], r['mod'], r['key'].split(':',1)[1])] = r
th = {}
cls_vals = collections.Counter(); sub_vals = collections.Counter(); st = collections.Counter()
for l in open(THEIRS):
    r = json.loads(l); k = (r['chdir'], r['module'], r['key']); th[k] = r
    cls_vals[r['class']] += 1; sub_vals[(r['class'], r.get('sub'))] += 1; st[r.get('conv_status')] += 1
print('their class values:', dict(cls_vals))
print('their (class, sub):', dict(sub_vals))
print('their conv_status:', dict(st))
print('keysets equal:', set(mine) == set(th), len(mine), len(th))
# class label comparison
def mycls(r): return r['cls']
def thcls(r): return r['class'][0]
cm = collections.Counter((mycls(mine[k]), thcls(th[k])) for k in mine)
print('class (mine, theirs) cross-tab:', dict(cm))
# source comparison
srcdiff = []; carry_mine_only = []; carry_theirs_only = []
for k in mine:
    m = mine[k]; t = th[k]
    ms = m.get('src_ext'); ms = ms.split(':',1)[1] if ms else None; ts = t.get('source_key')
    ts_full = ts
    if ms and not ts_full: carry_mine_only.append(k)
    elif ts_full and not ms: carry_theirs_only.append(k)
    elif ms and ts_full and ms != ts_full: srcdiff.append((k, ms, ts_full))
print('carried by me only:', len(carry_mine_only), '| by them only:', len(carry_theirs_only), '| both but different source:', len(srcdiff))
json.dump({'mine_only': carry_mine_only, 'theirs_only': carry_theirs_only, 'srcdiff': srcdiff}, open(os.path.join(HERE, 'src_compare.json'), 'w'), indent=0)
# clean/fallback comparison on commonly-carried with same source
fb_m = {k for k in mine if mine[k].get('src_ext') and not mine[k]['clean']}
fb_t = {k for k in th if th[k].get('conv_status') and th[k]['conv_status'] != 'clean'}
print('fallbacks mine', len(fb_m), 'theirs', len(fb_t), 'both', len(fb_m & fb_t), 'mine-only', sorted(fb_m - fb_t)[:10], 'theirs-only', sorted(fb_t - fb_m)[:10])
for k in sorted(fb_t - fb_m): print('   theirs-only fallback', k, th[k].get('conv_status'), th[k].get('conv_reasons'), 'mine:', mine[k].get('cls'), mine[k].get('src_ext'), mine[k].get('clean'))
for k in sorted(fb_m - fb_t): print('   mine-only fallback', k, mine[k].get('conv_reasons'), mine[k].get('kind_delta'), 'theirs:', th[k].get('class'), th[k].get('conv_status'))
