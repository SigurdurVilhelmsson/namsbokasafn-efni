# Read-only: how much of the June (9a69414d5) Icelandic maps onto the NEW (98a5fe2ff) segment set.
import subprocess, re, sys, collections, json
REPO='/home/siggi/dev/repos/namsbokasafn-efni'
OLD, NEW = '9a69414d5', '98a5fe2ff'
def git(*a): return subprocess.run(['git','-C',REPO,*a],capture_output=True,check=True).stdout.decode('utf-8')
def lst(ref, sub, suf):
    out={}
    for f in git('ls-tree','-r','--name-only',ref,'--',f'books/efnafraedi-2e/{sub}').split('\n'):
        if not f: continue
        p=f.split('/')
        if not (re.match(r'^ch\d+$',p[3]) or p[3]=='appendices'): continue
        n=p[4]
        if re.match(r'^m\d+-segments\.'+suf+r'\.md$',n) or n in (f'chapter-metadata-segments.{suf}.md',f'exercises-segments.{suf}.md'):
            out[(p[3], n.split('-segments')[0])]=f
    return out
SEG=re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
def segs(text):
    ms=list(SEG.finditer(text)); d={}
    for i,m in enumerate(ms):
        end=ms[i+1].start() if i+1<len(ms) else len(text)
        d.setdefault(m.group(1), text[m.end():end].strip())
    return d
CONTENT={'i','b','u','em','sub','sup','term','link','docref','fn','span','strong','emphasis','q','foreign','smallcaps'}
def plain(s):
    s=re.sub(r'\{\{(/?)(\w+)\}\}', ' ', s)          # curly legacy tags -> space
    s=re.sub(r'\+\+([^+]+?)\+\+', r'\1', s)
    for _ in range(6):
        s2=re.sub(r'\[\[(\w+):([^\[\]]*)\]\]', lambda m: (m.group(2).split('|')[0] if m.group(1) in CONTENT else ' '+m.group(1).upper()+' '), s)
        s2=re.sub(r'\[\[(\w+)\]\]', ' ', s2)
        if s2==s: break
        s=s2
    s=re.sub(r'\s+',' ',s).strip()
    return s
oen, ois, nen, nis = lst(OLD,'02-for-mt','en'), lst(OLD,'02-mt-output','is'), lst(NEW,'02-for-mt','en'), lst(NEW,'02-mt-output','is')
tot=collections.Counter(); bytype=collections.defaultdict(collections.Counter); bych=collections.defaultdict(collections.Counter)
chars=collections.Counter()
for key, nf in sorted(nen.items()):
    ch=key[0]
    N=segs(git('show',f'{NEW}:{nf}'))
    O=segs(git('show',f'{OLD}:{oen[key]}')) if key in oen else {}
    OI=segs(git('show',f'{OLD}:{ois[key]}')) if key in ois else {}
    for sid, en in N.items():
        typ=sid.split(':')[1] if ':' in sid else '?'
        tot['new_segments']+=1; bytype[typ]['new']+=1; bych[ch]['new']+=1
        if sid not in O:
            tot['id_not_in_june']+=1; bytype[typ]['id_not_in_june']+=1; bych[ch]['id_not_in_june']+=1; chars['id_not_in_june']+=len(en); continue
        if plain(O[sid])!=plain(en):
            tot['en_changed']+=1; bytype[typ]['en_changed']+=1; bych[ch]['en_changed']+=1; chars['en_changed']+=len(en); continue
        if not OI.get(sid):
            tot['no_june_is']+=1; bytype[typ]['no_june_is']+=1; bych[ch]['no_june_is']+=1; continue
        tot['june_carryable']+=1; bytype[typ]['june_carryable']+=1; bych[ch]['june_carryable']+=1; chars['june_carryable']+=len(en)
print(json.dumps(tot), json.dumps(chars))
print('by type:')
for t,c in sorted(bytype.items(), key=lambda x:-x[1]['new']): print(f'  {t:16s}', dict(c))
print('by chapter:')
for ch,c in sorted(bych.items()): print(f'  {ch:11s}', dict(c))
