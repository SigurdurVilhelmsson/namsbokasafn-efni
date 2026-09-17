import json, collections, sys
S='/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore'
out=[]
def p(*a): out.append(' '.join(str(x) for x in a))
C=[json.loads(l) for l in open(f'{S}/census/results.jsonl')]
p('CENSUS rows', len(C), 'distinct basenames', len({d['basename'] for d in C}))
p('status', dict(collections.Counter(d['status'] for d in C)))
ok=[d for d in C if d['status']=='ok']
p('ok distinct basenames', len({d['basename'] for d in ok}))
occ=collections.Counter(); figs=collections.Counter()
for d in ok:
    for op,n in d['op_counts'].items(): occ[op]+=n; figs[op]+=1
p('op occ', dict(occ)); p('op figs', dict(figs))
bought=set(open(f'{S}/bought-basenames.txt').read().split())
p('bought list size', len(bought))
okb=[d for d in ok if d['basename'] in bought]
p('bought scanned rows', len(okb), 'bought flag True rows', sum(1 for d in ok if d['bought']))
p('bought with nontext', sum(1 for d in okb if d['any_nontext_in_bt']))
bo=collections.Counter(); bf=collections.Counter()
for d in okb:
    for op,n in d['op_counts'].items(): bo[op]+=n; bf[op]+=1
p('bought op occ', dict(bo), 'figs', dict(bf))
nt=[d for d in ok if d['any_nontext_in_bt']]
p('rows with nontext', len(nt), 'distinct', len({d['basename'] for d in nt}), 'keys with N2O5', [d['key'] for d in nt if 'N2O5' in d['basename']])
lp=[d for d in ok if d['n_later_paint_events']>0]
p('later-paint rows', len(lp), 'bought', sorted(d['basename'] for d in lp if d['basename'] in bought))
bykind=collections.defaultdict(lambda:[0,0])
for d in ok:
    bykind[d['kind']][0]+=1; bykind[d['kind']][1]+= d['any_nontext_in_bt']
p('by kind [scanned, nontext]', dict(bykind))
tr7=sorted(d['basename'] for d in ok if 7 in d['tr_modes'])
p('Tr7', len(tr7), tr7)
p('Tr modes all', dict(collections.Counter(m for d in ok for m in d['tr_modes'])))
p('bt_net_q nonzero figs', sum(1 for d in ok if d['bt_net_q_nonzero_count']>0), 'malformed', sum(d['malformed_unclosed_bt'] for d in ok))
p('unparsable forms figs', sum(1 for d in ok if d['unparsable_forms']))
# gs names inside BT, per figure
gsn=collections.Counter()
for d in ok:
    for e in d['later_paint_events']:
        pass
# render
R=[json.loads(l) for l in open(f'{S}/render/results.jsonl')]
p('RENDER rows', len(R), 'variants', dict(collections.Counter(r['variant'] for r in R)))
p('render status by variant', dict(collections.Counter((r['variant'], r['status']) for r in R)))
main=[r for r in R if r['variant'] in ('ORIG','PERSIST','NONTEXT')]
p('distinct basenames main', len({r['basename'] for r in main}))
for v in ('PERSIST','NONTEXT'):
    rows=[r for r in main if r['variant']==v and 'diff_vs_orig' in r]
    # last row per basename
    last={}
    for r in rows: last[r['basename']]=r
    g40=sorted(b for b,r in last.items() if r['diff_vs_orig'].get('count_gt40',0)>0)
    g0=sorted(b for b,r in last.items() if r['diff_vs_orig'].get('count_gt0',0)>0)
    p(v, 'rows w/ diff', len(rows), 'distinct', len(last), 'gt40', len(g40), 'gt0', len(g0))
    p(v, 'bought gt0', [b for b in g0 if b in bought])
    dirs=[(b, last[b].get('direction_vs_source')) for b in g0]
    bad=[(b,dd) for b,dd in dirs if not dd or not dd.get('moves_toward_source') or dd.get(f'mean_dist_{v}_to_SOURCE') not in (0.0,)]
    p(v, 'changed figs lacking dist==0.0 toward source', len(bad), bad[:5])
    if v=='PERSIST':
        CH=set(g0)
pn=[r for r in main if r['variant']=='NONTEXT' and r.get('diff_persist_vs_nontext',{}).get('count_gt0',0)>0]
p('PERSIST vs NONTEXT differ', len(pn))
comb=[r for r in main if r['basename']=='CNX_Chem_04_05_combustion' and r['variant']=='PERSIST']
p('combustion PERSIST diff', comb[-1]['diff_vs_orig'])
lpset={d['basename'] for d in lp}
p('changed subset of later-paint', CH<=lpset, 'changed outside', sorted(CH-lpset))
# duplicates in render results
cnt=collections.Counter((r['basename'],r['variant']) for r in R)
p('dup (basename,variant) rows', sum(1 for k,v in cnt.items() if v>1))
# non-main variants
p('other variant rows sample', [ (r['basename'],r['variant'],r.get('status'),r.get('diff_vs_orig',r.get('diff'))) for r in R if r['variant'] not in ('ORIG','PERSIST','NONTEXT')][:3])
open(f'{S}/critic/spotcheck.txt','w').write('\n'.join(out)+'\nDONE spotcheck\n')
