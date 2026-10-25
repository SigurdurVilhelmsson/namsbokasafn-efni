#!/usr/bin/env python3
"""Read-only: fetch equations.json + inline-attrs.json + structure.json for each module at
the NEW ref, the June ref, and the June-IS last-modifying commit (as-translated)."""
import json, os, subprocess
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
JUNE = '9a69414d5e7c0834c940f36ec14b49b654c2fb54'
NEW = '98a5fe2ff1e5dfb773829364f2863225a220b199'
BOOK = 'books/efnafraedi-2e'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw')
meta = json.load(open(os.path.join(OUT, 'meta.json')))
def show(ref, path):
    r = subprocess.run(['git', '-C', REPO, 'show', f'{ref}:{path}'], capture_output=True)
    return r.stdout.decode('utf-8') if r.returncode == 0 else None
n = 0
for r in meta:
    if r['module'] == 'chapter-metadata': continue
    astrans = r['june_is_commit'].split(' ')[0]
    for kind in ['equations', 'inline-attrs', 'structure']:
        path = f"{BOOK}/02-structure/{r['chdir']}/{r['module']}-{kind}.json"
        for tag, ref in [('new', NEW), ('june', JUNE), ('astrans', astrans)]:
            t = show(ref, path)
            if t is None: continue
            d = os.path.join(OUT, f'struct_{tag}', r['chdir'])
            os.makedirs(d, exist_ok=True)
            open(os.path.join(d, f"{r['module']}-{kind}.json"), 'w', encoding='utf-8').write(t)
            n += 1
print('files', n)
