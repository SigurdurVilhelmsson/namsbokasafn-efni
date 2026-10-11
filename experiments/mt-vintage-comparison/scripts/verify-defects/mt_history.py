import subprocess,os,sys,json,collections
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from seglib_v import parse
REPO='/home/siggi/dev/repos/namsbokasafn-efni'
REF='9a69414d5'
def git(*a):
    return subprocess.run(['git','-C',REPO]+list(a),capture_output=True,text=True,check=True).stdout
files=[l for l in git('ls-tree','-r','--name-only',REF,'--','books/efnafraedi-2e/02-mt-output').splitlines() if l.endswith('segments.is.md') and '(' not in l]
print(len(files),file=sys.stderr)
res={}
for f in files:
    commits=git('log','--format=%h|%ad','--date=format:%Y-%m-%d %H:%M',REF,'--',f).splitlines()
    commits=[c.split('|') for c in commits][::-1]  # oldest first
    prev=None; hist=[]
    for h,d in commits:
        try: t=git('show',f'{h}:{f}')
        except subprocess.CalledProcessError: t=''
        segs=parse(t); m={}
        for s in segs: m.setdefault(s['key'],s['text'])
        if prev is None:
            frac=1.0; n=len(m); ch=n
        else:
            common=[k for k in m if k in prev]
            ch=sum(1 for k in m if k not in prev or prev[k]!=m[k])
            n=len(m); frac=ch/max(n,1)
        hist.append({'commit':h,'date':d,'nseg':n,'changed':ch,'frac':round(frac,3)})
        prev=m
    res[f]=hist
json.dump(res,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'is_history.json'),'w'),indent=0)
