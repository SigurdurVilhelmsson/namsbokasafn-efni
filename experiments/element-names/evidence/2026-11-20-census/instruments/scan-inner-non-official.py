"""Find non-official element-name forms INSIDE a word, which the census (measurement 4) could not see:
its classifier, and so measurements 6-9, looked for a non-official form only at the start of a word.

Reads the committed MT (02-mt-output), not the effective text: a form written by a pending edit is not
seen here (measurement 13 fetches the effective text of every hit it keeps). Each hit gets a verdict;
the exclusions are explicit and listed in the output.

Usage (from this folder):
  python3 -I scan-inner-non-official.py ../data/render-census-69-names.json ../data/comparison-official-vs-resolver.json \\
      ../data/mixed-lists.json ../data/never-official-lists.json ../../../../../books/efnafraedi-2e/02-mt-output \\
      ../data/inner-non-official-scan.json ../reports/editor-fixes.json ../reports/editor-fixes-never-official.json \\
      ../reports/editor-fixes-mixed.json"""
import glob
import json
import os
import re
import sys

census_path, cmp_path, mixed_path, never_path, mt_dir, out = sys.argv[1:7]
draft_paths = sys.argv[7:]
census = json.load(open(census_path, encoding='utf-8'))['rows']
cmp_ = json.load(open(cmp_path, encoding='utf-8'))
NOISE = {'kalkstein', 'aktiníðaröðin', 'alúmín'}  # the census's own noise bases (measurement 4)
MIN_BASE = 5  # shorter bases (e.g. `ál`-like stems) would match inside ordinary words
OFFICIAL_LONG = sorted({o.lower() for i in cmp_['items'] for o in i['official'] if len(o) >= MIN_BASE})
# Words that contain a base but are not element names at all.
NOT_ELEMENT = {'glýserín': 'glycerine', 'enteróbaktín': 'enterobactin', 'strikalín': 'strika + lína, a dashed line',
               'alkalín': 'alkaline'}

mixed_names = {r['english'][0] for r in json.load(open(mixed_path, encoding='utf-8'))['rows']}
never_names = {r['english'][0] for r in json.load(open(never_path, encoding='utf-8'))['rows']}
bases = []  # (english, base)
for r in census:
    en = r['english'][0]
    for b, v in r['bases'].items():
        if not v['official'] and b not in NOISE and len(b) >= MIN_BASE:
            bases.append((en, b.lower()))
all_bases = sorted({b for _, b in bases})

drafted = {}
for p in draft_paths:
    for s in json.load(open(p, encoding='utf-8'))['segments']:
        drafted.setdefault(s['segmentId'], (os.path.basename(p), s['proposed']))

SEG = re.compile(r'<!--\s*SEG:(\S+?)\s*-->')
TOKEN = re.compile(r'[^\W\d_]+')


def chapter_of(d):
    return -1 if d == 'appendices' else int(d[2:])


def verdict(en, base, low):
    if any(o in low for o in OFFICIAL_LONG):
        return 'excluded', 'holds an official name (e.g. prótaktíníum)'
    if any(low.startswith(b) for b in all_bases):
        return 'excluded', 'starts with a non-official base: a start-of-word form the census already counts'
    for w, gloss in NOT_ELEMENT.items():
        if w in low:
            return 'excluded', f'not an element name ({gloss})'
    return 'genuine', ''


hits = []
files = sorted(glob.glob(os.path.join(mt_dir, '*', '*.is.md')))
for f in files:
    chapter_dir = os.path.basename(os.path.dirname(f))
    if not (chapter_dir == 'appendices' or re.fullmatch(r'ch\d+', chapter_dir)):
        continue
    parts = SEG.split(open(f, encoding='utf-8').read())
    for i in range(1, len(parts), 2):
        sid, body = parts[i], parts[i + 1]
        for t in TOKEN.findall(body):
            low = t.lower()
            for en, b in bases:
                if b not in low or low.startswith(b):
                    continue
                v, why = verdict(en, b, low)
                d = drafted.get(sid)
                hits.append({
                    'english': en, 'base': b, 'token': t, 'segmentId': sid, 'moduleId': sid.split(':', 1)[0],
                    'chapter': chapter_of(chapter_dir), 'verdict': v, 'why': why,
                    'set': 'inner', 'nameClass': 'mixed' if en in mixed_names else 'never-official' if en in never_names else None,
                    'draftedIn': d[0] if d else None, 'draftStillHoldsToken': (t in d[1]) if d else None,
                })

seen, uniq = set(), []
for h in hits:
    k = (h['segmentId'], h['english'], h['token'])
    if k not in seen:
        seen.add(k)
        uniq.append(h)
genuine = [h for h in uniq if h['verdict'] == 'genuine']
json.dump({'_meta': {'measured': '2026-11-21', 'book': 'efnafraedi-2e', 'source': '02-mt-output (committed MT)',
                     'minBase': MIN_BASE, 'notElement': NOT_ELEMENT, 'files': len(files)},
           'hits': uniq, 'genuine': genuine},
          open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('files', len(files), '| hits', len(uniq), '| genuine', len(genuine),
      [(h['english'], h['segmentId'], h['token'], h['draftedIn']) for h in genuine])
