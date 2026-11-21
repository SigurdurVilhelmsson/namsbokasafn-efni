"""Fill the two term-check dry-run templates (measurement 14) from committed files, giving the scripts that
were sent to production on 2026-11-21. Each built script embeds the editors' fix drafts it overlays; the
59-name one also embeds the 59 entries and each name's non-official bases from the census.

Usage (from this folder):
  python3 -I build-termcheck-dryruns.py magnesium termcheck-dryrun-magnesium.template.cjs termcheck-dryrun-magnesium.cjs \\
      ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json ../reports/editor-fixes-mixed.json
  python3 -I build-termcheck-dryruns.py c73 termcheck-dryrun-c73.template.cjs termcheck-dryrun-c73.cjs \\
      ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json ../reports/editor-fixes-mixed.json \\
      --entries ../reports/c73-entries.json ../data/render-census-69-names.json
The runs used the three sets of drafts that existed then (measurements 7-9); measurement 13's draft came after.
Send a built script on stdin to production, cwd = server/scripts:  node - efnafraedi-2e"""
import json
import sys

mode, tpl_path, out_path = sys.argv[1:4]
rest = sys.argv[4:]
entries_args = []
if '--entries' in rest:
    i = rest.index('--entries')
    entries_args, rest = rest[i + 1:i + 3], rest[:i]
draft_paths = rest
assert mode in ('magnesium', 'c73') and draft_paths, 'usage: see the docstring'

drafts = []
for p in draft_paths:
    for x in json.load(open(p, encoding='utf-8'))['segments']:
        d = {'segmentId': x['segmentId'], 'current': x['current'], 'proposed': x['proposed']}
        if mode == 'magnesium':
            d['set'] = x['set']
        drafts.append(d)

tpl = open(tpl_path, encoding='utf-8').read()
assert tpl.count('__DRAFTS__') == 1
out = tpl.replace('__DRAFTS__', json.dumps(drafts, ensure_ascii=False))
if mode == 'c73':
    entries_path, census_path = entries_args
    census = {r['english'][0]: r for r in json.load(open(census_path, encoding='utf-8'))['rows']}
    NOISE = {'kalkstein', 'aktiníðaröðin', 'alúmín'}  # the census's noise bases (measurement 4)
    EXTRA = {'beryllium': ['berillíum', 'berillín'], 'hafnium': ['hafnfn']}  # measurements 9 and 10
    entries = []
    for e in json.load(open(entries_path, encoding='utf-8'))['entries']:
        c = census[e['english']]
        non = [b for b, v in c['bases'].items() if not v['official'] and b not in NOISE] + EXTRA.get(e['english'], [])
        entries.append({'english': e['english'], 'forms': e['forms'], 'icelandic': e['icelandic'], 'nonOfficial': sorted(set(non))})
    assert len(entries) == 59
    assert out.count('__ENTRIES__') == 1
    out = out.replace('__ENTRIES__', json.dumps(entries, ensure_ascii=False))
open(out_path, 'w', encoding='utf-8').write(out)
print(mode, 'drafts', len(drafts), '->', out_path)
