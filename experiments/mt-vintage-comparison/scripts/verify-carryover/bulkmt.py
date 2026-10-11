"""EN drift since each June IS file's last BULK MT commit (>=30% of IS segments changed vs the parent version)."""
import sys, os, json, subprocess, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segs import *
from norm import *
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
D = load()
def git(*a): return subprocess.run(['git','-C',REPO,*a],capture_output=True)
def show(ref, p):
    r = git('show', f'{ref}:{p}'); return r.stdout.decode() if r.returncode == 0 else None
drift = []; nobulk = []; bulkdates = collections.Counter()
for p in sorted(D['june']['en']):
    ip = pair_path(p)
    commits = git('log', '--format=%H %cs', '9a69414d5', '--', ip).stdout.decode().split('\n')
    commits = [c.split() for c in commits if c.strip()]
    bulk = None
    for i, (h, d) in enumerate(commits):
        cur, _ = parse_first(show(h, ip))
        prevtxt = show(h + '^', ip)
        prev, _ = parse_first(prevtxt) if prevtxt else ({}, None)
        ch = sum(1 for k in cur if prev.get(k) != cur[k])
        if cur and ch / len(cur) >= 0.30:
            bulk = (h, d); break
    if not bulk:
        nobulk.append(p); continue
    bulkdates[bulk[1][:7]] += 1
    be, _ = parse_first(show(bulk[0], p) or '')
    je, jo = parse_first(D['june']['en'][p])
    for k in jo:
        if k in be and visible(be[k]) != visible(je[k]):
            drift.append((k, bulk[0][:9], bulk[1], be[k][:100], je[k][:100]))
        elif k not in be:
            drift.append((k, bulk[0][:9], bulk[1], '<absent at bulk commit>', je[k][:100]))
print('files without a bulk commit:', len(nobulk), nobulk[:5])
print('bulk commit months:', dict(bulkdates))
print('keys whose visible EN at the bulk-MT commit differs from June-ref EN:', len(drift))
by = collections.Counter(d[0].split(':')[0] for d in drift); print(dict(by))
for d in drift[:30]: print('  ', d)
