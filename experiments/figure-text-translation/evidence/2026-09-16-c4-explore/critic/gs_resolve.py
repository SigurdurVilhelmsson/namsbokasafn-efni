"""Critic check (read-only, 0 ISK): resolve every `gs` operator found INSIDE BT..ET to the
ExtGState dictionary it names, and tally the dictionary keys/values that matter downstream
(/BM, /SMask, /ca, /CA, /AIS, /Font, /TR, /TR2, /OP, /op, /OPM, /SA, /SM, /LW, /D ...).

Walk = census_lib.walk_pdf's reachability (page 1 contents + every reachable /Form, objgen
deduped). Name lookup: the owning stream's /Resources /ExtGState; if a form has no
/Resources, fall back to the parent's (inheritance), and record that it happened.

POSITIVE CONTROL: for every figure we ALSO tally every ExtGState dict reachable in the same
resource trees regardless of where it is used, so a corpus with blend modes / soft masks
anywhere shows the instrument can see /BM and /SMask values at all.
Population: census/results.jsonl rows with status ok, kind pdf, and 'gs' in op_counts.
Output: critic/gs_resolve.jsonl (one line per figure) + critic/gs_resolve.txt (summary, ends DONE).
"""
import collections, json, os, sys, time
REPO='/home/siggi/dev/repos/namsbokasafn-efni'; FIG=REPO+'/experiments/figure-text-translation'
S='/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore'
os.environ.setdefault('FIGTEXT_PYLIBS', FIG+'/pylibs')
os.environ.setdefault('FIGTEXT_OUT', S+'/critic/_unused_out')
sys.path[:0]=[FIG+'/pylibs', FIG]
import pikepdf
from _deps import read_content

TEXT_OPS={'Tc','Tw','Tz','TL','Tf','Tr','Ts','Td','TD','Tm','T*','Tj','TJ',"'",'"'}
KEYS_OF_INTEREST=['/BM','/SMask','/ca','/CA','/AIS','/Font','/TR','/TR2','/OP','/op','/OPM','/SA','/SM',
                  '/LW','/LC','/LJ','/ML','/D','/RI','/FL','/BG','/BG2','/UCR','/UCR2','/HT','/TK']

def val(o):
    try:
        if isinstance(o, pikepdf.Dictionary) or isinstance(o, pikepdf.Stream): return '<dict>'
        if isinstance(o, pikepdf.Array): return '[' + ' '.join(val(x) for x in o) + ']'
        return str(o)
    except Exception as e: return f'<err {type(e).__name__}>'

def summarise(egs):
    d={}
    for k in egs.keys():
        if k=='/Type': continue
        d[k]=val(egs[k])
    return d

def gs_names_inside_bt(stream_bytes):
    owner=pikepdf.new(); st=owner.make_stream(bytes(stream_bytes))
    depth=0; inside=collections.Counter(); outside=collections.Counter()
    for ins in pikepdf.parse_content_stream(st):
        if isinstance(ins, pikepdf.ContentStreamInlineImage): continue
        op=str(ins.operator)
        if op=='BT': depth+=1; continue
        if op=='ET': depth=max(0,depth-1); continue
        if op=='gs' and ins.operands:
            (inside if depth else outside)[str(ins.operands[0])]+=1
    del st; del owner
    return inside, outside

def process(path):
    rec={'inside_bt':[], 'all_egs':[], 'unresolved':[], 'inherited_lookup':0, 'streams':0}
    with pikepdf.open(path) as pdf:
        page=pdf.pages[0]
        pres=pikepdf.Page(page).obj.get('/Resources')
        def egs_dict(res):
            if res is None: return None
            return res.get('/ExtGState')
        def record_all(res, label):
            e=egs_dict(res)
            if e is None: return
            for nm, dct in e.items():
                try: rec['all_egs'].append({'stream':label,'name':str(nm),'keys':summarise(dct)})
                except Exception as ex: rec['all_egs'].append({'stream':label,'name':str(nm),'error':str(ex)})
        def handle(stream_bytes, res, parent_res, label):
            rec['streams']+=1
            inside, outside = gs_names_inside_bt(stream_bytes)
            lookup=res
            if res is None:
                lookup=parent_res
            for nm, n in inside.items():
                e=egs_dict(lookup)
                if (e is None or nm not in e) and lookup is not parent_res and parent_res is not None:
                    e2=egs_dict(parent_res)
                    if e2 is not None and nm in e2:
                        e=e2; rec['inherited_lookup']+=1
                if e is None or nm not in e:
                    rec['unresolved'].append({'stream':label,'name':nm,'n':n}); continue
                rec['inside_bt'].append({'stream':label,'name':nm,'n':n,'also_outside_bt':outside.get(nm,0),
                                         'keys':summarise(e[nm])})
        handle(read_content(page).encode('latin-1'), pres, None, 'PAGE')
        record_all(pres, 'PAGE')
        seen=set()
        def walk(res):
            xo=res.get('/XObject') if res is not None else None
            if xo is None: return
            for nm, x in xo.items():
                if str(x.get('/Subtype',''))!='/Form' or not isinstance(x, pikepdf.Stream): continue
                if x.objgen in seen: continue
                seen.add(x.objgen)
                sub=x.get('/Resources')
                label=f'FORM{nm}:{x.objgen}'
                handle(x.read_bytes(), sub, res, label)
                record_all(sub, label)
                if sub is not None: walk(sub)
        walk(pres)
    return rec

rows=[json.loads(l) for l in open(S+'/census/results.jsonl')]
pop=[r for r in rows if r['status']=='ok' and r['kind']=='pdf' and 'gs' in r['op_counts']]
bought=set(open(S+'/bought-basenames.txt').read().split())
out_jsonl=open(S+'/critic/gs_resolve.jsonl','w')
t0=time.time()
agg_in=collections.Counter(); agg_all=collections.Counter(); figs_flag=collections.defaultdict(set)
occ_resolved=0; occ_unresolved=0; census_occ=0; mism=[]
for i,r in enumerate(pop):
    census_occ+=r['op_counts']['gs']
    try:
        rec=process(r['artwork'])
    except Exception as ex:
        rec={'error':f'{type(ex).__name__}: {ex}'}
    rec['basename']=r['basename']; rec['bought']=r['basename'] in bought
    out_jsonl.write(json.dumps(rec)+'\n'); out_jsonl.flush()
    if 'error' in rec:
        figs_flag['ERROR'].add(r['basename']); continue
    n_in=sum(x['n'] for x in rec['inside_bt'])+sum(x['n'] for x in rec['unresolved'])
    if n_in!=r['op_counts']['gs']: mism.append((r['basename'], n_in, r['op_counts']['gs']))
    occ_resolved+=sum(x['n'] for x in rec['inside_bt']); occ_unresolved+=sum(x['n'] for x in rec['unresolved'])
    for x in rec['inside_bt']:
        for k,v in x['keys'].items():
            agg_in[(k, v if k in ('/BM','/SMask','/ca','/CA','/AIS','/OP','/op','/OPM','/SA','/TK') else '*')]+=x['n']
            if k=='/BM' and v not in ('/Normal','/Compatible','[/Normal]'): figs_flag['IN_BT_BM_nonNormal'].add(r['basename'])
            if k=='/SMask' and v!='/None': figs_flag['IN_BT_SMask_notNone'].add(r['basename'])
            if k in ('/ca','/CA'):
                try:
                    if float(v)<1: figs_flag['IN_BT_alpha_lt1'].add(r['basename'])
                except ValueError: figs_flag['IN_BT_alpha_nonnum'].add(r['basename'])
            if k=='/Font': figs_flag['IN_BT_Font'].add(r['basename'])
            if k in ('/TR','/TR2','/BG','/BG2','/UCR','/UCR2','/HT'): figs_flag['IN_BT_devicedep'].add(r['basename'])
            if k in ('/LW','/LC','/LJ','/ML','/D','/RI','/FL'): figs_flag['IN_BT_linestate'].add(r['basename'])
    for x in rec['all_egs']:
        ks=x.get('keys',{})
        if ks.get('/BM') not in (None,'/Normal','/Compatible'): figs_flag['ANY_EGS_BM_nonNormal'].add(r['basename']); agg_all[('/BM',ks['/BM'])]+=1
        if ks.get('/SMask') not in (None,'/None'): figs_flag['ANY_EGS_SMask_notNone'].add(r['basename']); agg_all[('/SMask',ks['/SMask'])]+=1
    if (i+1)%25==0: print(f'... {i+1}/{len(pop)} {time.time()-t0:.1f}s', flush=True)
out_jsonl.close()
L=[]
L.append(f'population (census ok, kind pdf, gs in op_counts): {len(pop)} figures; bought among them: {sum(1 for r in pop if r["basename"] in bought)}')
L.append(f'census gs-inside-BT occurrences over this population: {census_occ}')
L.append(f'this instrument: resolved {occ_resolved}, unresolved {occ_unresolved}, per-figure count mismatches vs census: {len(mism)} {mism[:5]}')
L.append(f'figures erroring: {sorted(figs_flag["ERROR"])}')
L.append('--- key/value tallies over gs-inside-BT OCCURRENCES (value shown only for blend/mask/alpha/overprint keys) ---')
for (k,v),n in sorted(agg_in.items(), key=lambda kv:-kv[1]): L.append(f'  {k} {v}: {n}')
L.append('--- figure flags ---')
for f in ('IN_BT_BM_nonNormal','IN_BT_SMask_notNone','IN_BT_alpha_lt1','IN_BT_alpha_nonnum','IN_BT_Font','IN_BT_devicedep','IN_BT_linestate','ANY_EGS_BM_nonNormal','ANY_EGS_SMask_notNone'):
    s=figs_flag.get(f,set()); b=sorted(x for x in s if x in bought)
    L.append(f'  {f}: {len(s)} figures; bought {len(b)} {b}; first: {sorted(s)[:8]}')
L.append('--- POSITIVE CONTROL: non-Normal /BM or non-None /SMask values seen ANYWHERE in these figures\' ExtGState resources (dict entries, not uses) ---')
for (k,v),n in sorted(agg_all.items(), key=lambda kv:-kv[1])[:20]: L.append(f'  {k} {v}: {n}')
L.append(f'elapsed {time.time()-t0:.1f}s')
L.append(f'DONE n={len(pop)}')
open(S+'/critic/gs_resolve.txt','w').write('\n'.join(L)+'\n')
print('\n'.join(L))
