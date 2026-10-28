#!/usr/bin/env python3
"""Read-only: which NEW-IS segment keys were changed by HAND REPAIR commits between the
June ref and the NEW ref (efnafraedi-2e/02-mt-output)."""
import sys, json, subprocess, re
sys.path.insert(0, '.')
from segparse import parse, key_of
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
JUNE = '9a69414d5'; NEW = '98a5fe2ff'
def git(*a):
    return subprocess.run(['git', '-C', REPO, *a], capture_output=True).stdout.decode('utf-8')
commits = git('log', '--format=%H %ad %s', '--date=short', '--grep=HAND REPAIR', f'{JUNE}..{NEW}', '--', 'books/efnafraedi-2e/02-mt-output/').strip().split('\n')
out = []
for line in commits:
    sha, date, subj = line.split(' ', 2)
    if 'HAND REPAIR' not in subj:  # a body mention (e.g. 'NO HAND REPAIR WAS NEEDED') is not a repair
        continue
    files = git('show', '--name-only', '--format=', sha, '--', 'books/efnafraedi-2e/02-mt-output/').split()
    for f in files:
        if not f.endswith('-segments.is.md'): continue
        before = git('show', f'{sha}^:{f}'); after = git('show', f'{sha}:{f}')
        B = {}; A = {}
        for s, t in parse(before): B.setdefault(key_of(s), t)
        for s, t in parse(after): A.setdefault(key_of(s), t)
        m = re.match(r'books/efnafraedi-2e/02-mt-output/([^/]+)/(.+)-segments\.is\.md', f)
        for k in A:
            if B.get(k) != A[k]:
                out.append({'commit': sha[:9], 'date': date, 'subject': subj[:90], 'chdir': m.group(1), 'module': m.group(2), 'key': k, 'before': B.get(k), 'after': A[k]})
json.dump(out, open('handrepair_keys.json', 'w'), ensure_ascii=False, indent=1)
import collections
print('changed keys per commit:', dict(collections.Counter((o['date'], o['commit']) for o in out)))
print('total keys:', len(out), 'unique (module,key):', len({(o['module'], o['key']) for o in out}))
for o in out[:6]: print(o['module'], o['key'], repr(o['before'])[:80], '->', repr(o['after'])[:80])
