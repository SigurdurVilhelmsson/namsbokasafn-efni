#!/usr/bin/env python3
"""Read-only: for each June IS file find the last BULK rewrite (>=30% of segments changed,
or file created) at or before the June ref = the commit at which its text was last
MACHINE-TRANSLATED (later small edits = repairs).  Then compare, per key, the visible
English at that commit with the June-ref English.  Differences = June IS segments whose
English moved (in visible text) after they were translated."""
import json, subprocess, sys, collections
sys.path.insert(0, '.')
from segparse import parse, key_of
from markers import visible
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
meta = json.load(open('raw/meta.json'))
def git(*a):
    r = subprocess.run(['git', '-C', REPO, *a], capture_output=True)
    return r.stdout.decode('utf-8') if r.returncode == 0 else None
res = collections.Counter(); ex = []; per_mod = {}
for m in meta:
    en_path = f"books/efnafraedi-2e/02-for-mt/{m['chdir']}/{m['module']}-segments.en.md"
    is_path = en_path.replace('02-for-mt', '02-mt-output').replace('.en.md', '.is.md')
    hist = git('log', '--format=%H %ad %s', '--date=short', '9a69414d5', '--', is_path).strip().split('\n')
    trans = None
    for line in hist:
        sha, d, subj = line.split(' ', 2)
        cur = git('show', f'{sha}:{is_path}'); prev = git('show', f'{sha}^:{is_path}')
        if prev is None:
            trans = (sha, d, subj, 'created'); break
        C = {key_of(s): t for s, t in parse(cur)}; P = {key_of(s): t for s, t in parse(prev)}
        if not P:
            trans = (sha, d, subj, 'created'); break
        changed = sum(1 for k in C if P.get(k) != C[k]) / max(1, len(C))
        if changed >= 0.30:
            trans = (sha, d, subj, f'{changed:.0%} changed'); break
    if trans is None:
        res['no-bulk-commit-found'] += 1; continue
    jref = {key_of(s): t for s, t in parse(git('show', f'9a69414d5:{en_path}'))}
    T = git('show', f'{trans[0]}:{en_path}')
    if T is None:
        # EN path absent at that commit (pre-rename): try the old path
        T = git('show', f"{trans[0]}:{en_path.replace('efnafraedi-2e', 'efnafraedi')}")
    if T is None:
        res['en-missing-at-translation-commit'] += 1; per_mod[m['module']] = (trans[1], trans[2][:50], 'EN missing'); continue
    E = {key_of(s): t for s, t in parse(T)}
    N = {key_of(s): t for s, t in parse(open(f"raw/new_en/{m['chdir']}/{m['module']}.md").read())}
    nd = 0; na = 0
    for k, t in jref.items():
        lit = N.get(k, t).count('*')
        if k not in E: na += 1; continue
        if visible(E[k], lit) != visible(t, lit):
            nd += 1
            if len(ex) < 15: ex.append((m['module'], k, trans[1], visible(E[k], lit)[:80], visible(t, lit)[:80]))
    res['keys'] += len(jref); res['visible-differs'] += nd; res['key-absent'] += na
    per_mod[m['module']] = (trans[1], trans[2][:60], trans[3], nd, na)
print(dict(res))
c = collections.Counter((v[0], v[1]) for v in per_mod.values())
for k, n in sorted(c.items()): print('  translation commit', k, 'modules:', n)
print('modules with differences:', {k: v for k, v in per_mod.items() if len(v) > 3 and (v[3] or v[4])})
for e in ex: print('  ', e)
json.dump(per_mod, open('is_translation_commit.json', 'w'), indent=0, ensure_ascii=False)
