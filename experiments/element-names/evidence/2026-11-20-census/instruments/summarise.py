"""Regenerate reports/*.md from data/*.json and print every headline tally the README quotes.
Usage (from this folder): python3 -I summarise.py ../data ../reports"""
import collections
import json
import sys

DATA, OUT = sys.argv[1], sys.argv[2]
R = 45


def load(name):
    return json.load(open(f'{DATA}/{name}', encoding='utf-8'))


def excerpt(e):
    t, s, l = e['text'], e['start'], e['length']
    pre = '…' if (e['cutBefore'] or s - R > 0) else ''
    post = '…' if (e['cutAfter'] or s + l + R < len(t)) else ''
    return (pre + t[max(0, s - R):s] + '**' + t[s:s + l] + '**' + t[s + l:s + l + R] + post).replace('|', '\\|')


ch = lambda c: 'App.' if c == -1 else str(c)

# 1. comparison
cmp_ = load('comparison-official-vs-resolver.json')
print('comparison:', dict(collections.Counter(i['status'] for i in cmp_['items'])))
res = load('resolver-121-names.json')
resolved = [r for r in res['rows'] if r['icelandic']]
print('resolver: names', len(res['rows']), 'resolved', len(resolved),
      'domains', dict(collections.Counter(f"{r['domain']}/{r['reason']}" for r in resolved)),
      'chapter deviations', sum(len(r['chapterDeviations']) for r in res['rows']),
      'export disagreements', [r['english'] for r in resolved if not r['exportAgrees']])

# 2. nine dry counts
nine = load('dry-counts-9-names.json')
out = []
for sp in nine['specs']:
    print(f"nine: {sp['english']:<13} EN {sp['enSegments']:>3} already {sp['alreadyOfficial']} listed {len(sp['items'])}")
    if not sp['items']:
        continue
    out.append(f"### {sp['english']}: `{sp['resolvesTo']}` → official `{sp['official']}` ({len(sp['items'])})\n\n"
               '| Ch. | Segment id | Excerpt |\n|---|---|---|')
    for i in sp['items']:
        out.append(f"| {ch(i['chapter'])} | `{i['segmentId']}` | {excerpt(i['excerpt'])} |")
    out.append('')
open(f'{OUT}/nine-name-segments.md', 'w', encoding='utf-8').write('\n'.join(out))
print('nine totals:', nine['totals'])

# 3. ruthenium by the MT's forms
ru = load('dry-count-ruthenium-mt-forms.json')
rows = ['| Ch. | Segment id | Excerpt |', '|---|---|---|']
for i in ru['items']:
    rows.append(f"| {ch(i['chapter'])} | `{i['segmentId']}` | {excerpt(i['excerpt'])} |")
open(f'{OUT}/ruthenium-segments.md', 'w', encoding='utf-8').write(
    '### ruthenium: MT forms `rúþen` → official `rúþeníum` (8)\n\n' + '\n'.join(rows) + '\n')
print('ruthenium:', 'EN', ru['enSegments'], 'already', ru['alreadyOfficial'], 'listed', ru['listed'], 'census', ru['census'])

# 4. render census
cen = load('render-census-69-names.json')
cat = collections.Counter()
lines = ['| # | English | Official | Segs | | MT forms (occurrences, compounds included) |', '|---|---|---|---|---|---|']
tot_off = tot_non = 0
for r in cen['rows']:
    b = r['bases']
    if r['enSegments'] == 0:
        cat['absent'] += 1
        continue
    tot = {k: v['standalone'] + v['compound'] for k, v in b.items()}
    off = sum(n for k, n in tot.items() if b[k]['official'])
    non = sum(n for k, n in tot.items() if not b[k]['official'])
    tot_off += off
    tot_non += non
    forms = sorted(tot.items(), key=lambda kv: (not b[kv[0]]['official'], -kv[1]))
    fs = ' · '.join(f"{'✓' if b[k]['official'] else '✗'} {k} {n}" for k, n in forms)
    extra = []
    if r['weak']:
        extra.append('also: ' + ', '.join(f'{k} {n}' for k, n in r['weak'].items()))
    # Hand-picked from the unshaped tier after reading it (that tier also holds ordinary words such as
    # lítil, magni, röðina, which are not renderings): the two entries that ARE renderings of the name.
    if r['english'][0] == 'hafnium':
        extra.append('garbled: hafnfn 4')
    if r['english'][0] == 'gadolinium':
        extra.append('also: gadólíni 1')
    flag = '✓' if non == 0 else ('✗' if off == 0 else '⚠')
    cat[flag] += 1
    lines.append(f"| {r['n']} | {r['english'][0]} | {'/'.join(r['official'])} | {r['enSegments']} | {flag} | "
                 + fs + ((' — ' + '; '.join(extra)) if extra else '') + ' |')
open(f'{OUT}/render-census-table.md', 'w', encoding='utf-8').write('\n'.join(lines))
print('census categories:', dict(cat), 'official', tot_off, 'non-official', tot_non,
      'unmatched EN segments >0:', {r['english'][0]: r['noCandidateCount'] for r in cen['rows'] if r['noCandidateCount']})

# 5. lanthanide words (added after [USER] ruled that lanþan carries into its derived words)
la = load('lanthanide-census.json')
rows = ['| Ch. | Segment id | Icelandic lant-/lanþ- words | Excerpt |', '|---|---|---|---|']
for i in la['items']:
    rows.append(f"| {ch(i['chapter'])} | `{i['segmentId']}` | {', '.join(i['words'])} | {excerpt(i['excerpt'])} |")
open(f'{OUT}/lanthanide-segments.md', 'w', encoding='utf-8').write(
    f"### lanthanide words: English *lanthanide(s)* / *lanthanoid(s)* ({la['englishSegments']} segments)\n\n" + '\n'.join(rows) + '\n')
old = sum(v['count'] for v in la['forms'].values() if v['kind'] == 'derived-old')
new = sum(v['count'] for v in la['forms'].values() if v['kind'] == 'derived-official')
print('lanthanide: EN segments', la['englishSegments'], 'with a lant/lanþ word', la['withStemWord'], 'unmatched', len(la['misses']),
      '| segments with old derived', la['withDerivedOld'], 'with official derived', la['withDerivedOfficial'],
      '| occurrences old', old, 'official', new, '| by chapter', dict(collections.Counter(ch(i['chapter']) for i in la['items'])))
