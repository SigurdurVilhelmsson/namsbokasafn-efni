#!/usr/bin/env python3
"""Read-only: is the June ENGLISH visible text stable across every EN version since the
earliest June IS vintage (2026-03-19)?  For each module, compare per-key visible text of the
EN file at every EN-touching commit in [c43026f46 .. 9a69414d5] (where the file existed and
the commit is not after the June IS was last written... we take ALL versions, conservative)."""
import json, subprocess, sys, collections
sys.path.insert(0, '.')
from segparse import parse, key_of
from markers import visible
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'
meta = json.load(open('raw/meta.json'))
def git(*a):
    r = subprocess.run(['git', '-C', REPO, *a], capture_output=True)
    return r.stdout.decode('utf-8') if r.returncode == 0 else None
tot_keys = 0; unstable = collections.Counter(); ex = []
per_commit = collections.Counter()
for m in meta:
    en_path = f"books/efnafraedi-2e/02-for-mt/{m['chdir']}/{m['module']}-segments.en.md"
    is_path = en_path.replace('02-for-mt', '02-mt-output').replace('.en.md', '.is.md')
    # commits that wrote the IS file in the window: earliest one bounds the relevant EN history
    is_commits = git('log', '--format=%H', 'c43026f46^..9a69414d5', '--', is_path).split()
    en_commits = git('log', '--format=%H %ad', '--date=short', 'c43026f46^..9a69414d5', '--', en_path).strip().split('\n')
    jref = {key_of(s): t for s, t in parse(git('show', f'9a69414d5:{en_path}'))}
    N = {key_of(s): t for s, t in parse(open(f"raw/new_en/{m['chdir']}/{m['module']}.md").read())}
    jv = {k: visible(t, N.get(k, t).count('*')) for k, t in jref.items()}
    tot_keys += len(jv)
    if not is_commits:
        continue  # IS not written in the window (e.g. older); skip
    earliest_is = is_commits[-1]
    # EN versions at or after the earliest IS write (the English the IS could have been made from)
    rel = git('log', '--format=%H %ad', '--date=short', f'{earliest_is}^..9a69414d5', '--', en_path).strip().split('\n')
    rel = [x for x in rel if x]
    # plus the EN as it stood when the earliest IS was written
    cands = [(earliest_is, 'earliest-IS-commit')] + [(x.split()[0], x.split()[1]) for x in rel]
    seen_bad = set()
    for sha, d in cands:
        t = git('show', f'{sha}:{en_path}')
        if t is None: continue
        E = {key_of(s): x for s, x in parse(t)}
        for k, v in jv.items():
            if k not in E:
                unstable['key-absent-in-an-older-EN'] += (k not in seen_bad); seen_bad.add(k); per_commit[d] += 1
                continue
            if visible(E[k], N.get(k, E[k]).count('*')) != v and k not in seen_bad:
                seen_bad.add(k); unstable['visible-text-differs-in-an-older-EN'] += 1; per_commit[d] += 1
                if len(ex) < 12: ex.append((m['module'], k, d, visible(E[k], 0)[:90], v[:90]))
print('June-ref EN keys:', tot_keys, 'keys whose visible text was not stable since the earliest IS write:', dict(unstable))
print('first-differing EN version dates:', dict(per_commit))
for e in ex: print('  ', e)
