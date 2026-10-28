import subprocess,re,json,collections
REPO='/home/siggi/dev/repos/namsbokasafn-efni'; OLD,NEW='9a69414d5','98a5fe2ff'
CARRY='/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/c32360c3-1089-4c20-a265-f77815e24ff3/scratchpad/plan-facts/carryover/classification.jsonl'
cls={}
for l in open(CARRY):
    r=json.loads(l); cls[(r['module'],r['key'])]=r['class']
SEG=re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
def segs(t):
    ms=list(SEG.finditer(t)); d={}
    for i,m in enumerate(ms):
        e=ms[i+1].start() if i+1<len(ms) else len(t); d.setdefault(m.group(1),t[m.end():e].strip())
    return d
CONTENT={'i','b','u','em','sub','sup','term','link','docref','fn','span','strong','emphasis','q','foreign','smallcaps'}
def plain(s):
    s=re.sub(r'\{\{(/?)(\w+)\}\}',' ',s); s=re.sub(r'\+\+([^+]+?)\+\+',r'\1',s)
    for _ in range(6):
        s2=re.sub(r'\[\[(\w+):([^\[\]]*)\]\]',lambda m:(m.group(2).split('|')[0] if m.group(1) in CONTENT else ' '+m.group(1).upper()+' '),s)
        s2=re.sub(r'\[\[(\w+)\]\]',' ',s2)
        if s2==s: break
        s=s2
    return re.sub(r'\s+',' ',s).strip()
files=[f for f in subprocess.run(['git','-C',REPO,'ls-tree','-r','--name-only',NEW,'books/efnafraedi-2e/02-for-mt'],capture_output=True,text=True).stdout.split('\n') if re.search(r'/m\d+-segments\.en\.md$',f)]
c=collections.Counter(); ex=[]
for f in files:
    mod=f.split('/')[-1].split('-segments')[0]
    N=segs(subprocess.run(['git','-C',REPO,'show',f'{NEW}:{f}'],capture_output=True,text=True).stdout)
    r=subprocess.run(['git','-C',REPO,'show',f'{OLD}:{f}'],capture_output=True,text=True)
    if r.returncode: continue
    O=segs(r.stdout)
    for k,e in N.items():
        t=k.split(':')[1]; ck=':'.join(k.split(':')[1:])
        if t!='para' or k not in O: continue
        if plain(O[k])!=plain(e):
            c[cls.get((mod,ck),'?')]+=1
            if len(ex)<4: ex.append((mod,k,O[k][:150],'||',e[:150]))
print(dict(c))
for x in ex: print(x)
