"""For each June IS file, find the last commit (<= June ref) that modified it, and read the EN
and the equations.json at that commit. Read-only (git log / git show)."""
import subprocess, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
JUNE = '9a69414d5'
D = load()
out = {}
for p in sorted(D['june']['en']):
    ip = pair_path(p)
    c = subprocess.run(['git', '-C', REPO, 'log', '-1', '--format=%H %cs %s', JUNE, '--', ip], capture_output=True, text=True).stdout.strip()
    h, date, subj = c.split(' ', 2)
    en = subprocess.run(['git', '-C', REPO, 'show', f'{h}:{p}'], capture_output=True)
    mod = module_of(p); ch = chapter_of(p)
    eqp = f'books/efnafraedi-2e/02-structure/{ch}/{mod}-equations.json'
    eq = subprocess.run(['git', '-C', REPO, 'show', f'{h}:{eqp}'], capture_output=True)
    out[p] = {'commit': h, 'date': date, 'subject': subj[:120],
              'en': en.stdout.decode() if en.returncode == 0 else None,
              'eq': eq.stdout.decode() if eq.returncode == 0 else None}
missing = [p for p, v in out.items() if v['en'] is None]
print('files', len(out), 'EN missing at IS commit:', len(missing), missing[:5])
from collections import Counter
print('IS last-commit dates:', Counter(v['date'][:7] for v in out.values()))
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', 'astrans.json'), 'w') as f:
    json.dump(out, f)
