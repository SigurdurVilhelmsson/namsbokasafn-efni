import json,subprocess,os,sys
from seglib_v import parse
S=os.path.dirname(os.path.abspath(__file__))
REPO='/home/siggi/dev/repos/namsbokasafn-efni'
def git(*a, check=True):
    r=subprocess.run(['git','-C',REPO]+list(a),capture_output=True,text=True)
    if check and r.returncode: raise RuntimeError(r.stderr)
    return r.stdout if r.returncode==0 else None
last=json.load(open(f'{S}/june_lastmt.json'))
os.makedirs(f'{S}/june_sent_v',exist_ok=True)
report=[]
for isf,v in sorted(last.items()):
    enf=isf.replace('02-mt-output','02-for-mt').replace('segments.is.md','segments.en.md')
    c=v['commit']
    en_at_mt=git('show',f'{c}:{enf}',check=False)
    is_now=open(f"{S}/tree-9a69414d5/{isf}",encoding='utf-8').read()
    en_now=open(f"{S}/tree-9a69414d5/{enf}",encoding='utf-8').read()
    ids_is=[s['key'] for s in parse(is_now)]
    ids_mt=[s['key'] for s in parse(en_at_mt)] if en_at_mt else None
    ids_now=[s['key'] for s in parse(en_now)]
    rel=enf.split('02-for-mt/')[1]
    os.makedirs(os.path.dirname(f'{S}/june_sent_v/{rel}'),exist_ok=True)
    src='mt' if (en_at_mt and ids_mt==ids_is) else ('now' if ids_now==ids_is else 'MISMATCH')
    chosen=en_at_mt if src=='mt' else (en_now if src=='now' else (en_at_mt or en_now))
    open(f'{S}/june_sent_v/{rel}','w',encoding='utf-8').write(chosen)
    report.append({'is':isf,'mt_commit':c,'en_at_mt_ids_match':ids_mt==ids_is,'en_now_ids_match':ids_now==ids_is,'en_now_eq_en_mt': en_now==en_at_mt,'src':src})
import collections
print(collections.Counter((r['en_at_mt_ids_match'],r['en_now_ids_match'],r['en_now_eq_en_mt']) for r in report))
print([ (r['is'].split('/')[-2:],r['mt_commit']) for r in report if r['src']=='MISMATCH'])
print('EN at 9a69414d5 differs from EN at MT commit:',sum(1 for r in report if not r['en_now_eq_en_mt']))
json.dump(report,open(f'{S}/sent_report.json','w'),indent=0)
