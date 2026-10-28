import re,subprocess,collections,json,sys
REPO='/home/siggi/dev/repos/namsbokasafn-efni'
SEG=re.compile(r'<!--\s*SEG:(\S+?)\s*-->')
TIL=re.compile(r'~([^~\s][^~]{0,30}?)~')
CAR=re.compile(r'\^([^^\s][^^]{0,30}?)\^')
def ls(ref,path):
    return [l for l in subprocess.run(['git','-C',REPO,'ls-tree','-r','--name-only',ref,path],capture_output=True,text=True).stdout.splitlines() if l.endswith('-segments.is.md') and '(' not in l]
def show_many(ref,paths):
    p=subprocess.Popen(['git','-C',REPO,'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    out,_=p.communicate(''.join(f'{ref}:{x}\n' for x in paths).encode())
    res={};i=0
    for x in paths:
        nl=out.index(b'\n',i);parts=out[i:nl].decode().split();i=nl+1
        if parts[-1]=='missing': res[x]=None; continue
        sz=int(parts[2]);res[x]=out[i:i+sz].decode('utf-8','replace');i+=sz+1
    return res
def segs(t):
    ms=list(SEG.finditer(t));o={}
    for k,m in enumerate(ms):
        e=ms[k+1].start() if k+1<len(ms) else len(t)
        o.setdefault(m.group(1),t[m.end():e].strip())
    return o
ref='98a5fe2ff'
isp=ls(ref,'books/efnafraedi-2e/02-mt-output')
enp=[p.replace('02-mt-output','02-for-mt').replace('.is.md','.en.md') for p in isp]
IS=show_many(ref,isp); EN=show_many(ref,enp)
c=collections.Counter(); ex=collections.defaultdict(list)
for ip,ep in zip(isp,enp):
    if IS[ip] is None or EN[ep] is None: continue
    si=segs(IS[ip]); se=segs(EN[ep])
    for k,v in si.items():
        e=se.get(k,'')
        for name,rx,mk in (('tilde',TIL,'sub'),('caret',CAR,'sup')):
            for m in rx.finditer(v):
                c[name+'_IS']+=1
                inner=m.group(1)
                en_has_marker=('[[%s:%s'%(mk,inner)) in e or ('[[%s:'%mk) in e
                en_has_legacy=bool(rx.search(e))
                kind='EN_has_same_legacy' if en_has_legacy else ('EN_has_bracket_'+mk if en_has_marker else 'EN_neither')
                c[name+'|'+kind]+=1
                typ=k.split(':')[1]
                c[name+'|type:'+typ]+=1
                if len(ex[name+'|'+kind])<4: ex[name+'|'+kind].append((ip.split('/')[-1],k,m.group(0),v[max(0,m.start()-40):m.end()+20],'EN:',e[:160]))
for k,v in sorted(c.items()): print(k,v)
for k,v in ex.items():
    print('==',k)
    for x in v: print('   ',x)
