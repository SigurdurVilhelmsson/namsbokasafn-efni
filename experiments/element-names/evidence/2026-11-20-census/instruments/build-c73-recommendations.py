"""Draft §C73 recommendations for the 68 element names with no chemistry glossary row: for each, does
it need a book glossary entry? A DRAFT for [USER]'s ruling, computed from the measurement-4 census
(data/render-census-69-names.json) and the official list (data/comparison-official-vs-resolver.json).

§C73 (CLAUDE.md): ask what the MT does unprompted; add a term only when the MT cannot be trusted to
produce the right word. The rule below is that test made explicit; THRESHOLD is the one free parameter.

Usage (from this folder):
  python3 -I build-c73-recommendations.py ../data/comparison-official-vs-resolver.json \\
      ../data/render-census-69-names.json ../reports/c73-entry-recommendations"""
import json
import sys

cmp_path, census_path, out = sys.argv[1:4]
cmp_ = json.load(open(cmp_path, encoding='utf-8'))
census = json.load(open(census_path, encoding='utf-8'))

THRESHOLD = 0.10  # non-official share at or above which the MT is called unreliable
NOISE = {'kalkstein', 'aktiníðaröðin', 'alúmín'}           # census bases that are not element names
HOMOGRAPHS = {'lead': 'the English verb "lead" (as in "lead to")'}  # an entry would fire on it
EXTRA_NONOFFICIAL = {                                       # documented outside the strong tier
    'beryllium': {'berillíum (weak tier)': 2, 'Berillínatómið (weak tier)': 1},
    'hafnium': {'hafnfn (MT garble; hand fix, measurement 10)': 4},
}

rows = {r['english'][0]: r for r in census['rows']}
names = [i for i in cmp_['items'] if i['status'] == 'unresolved']
assert len(names) == 68, len(names)

out_rows = []
for i in names:
    aliases = [a.strip().lower() for a in i['en'].replace(')', '').split('(') if a.strip()]
    en = next(a for a in aliases if a in rows)
    r = rows[en]
    off = non = 0
    for b, v in r['bases'].items():
        if b in NOISE:
            continue
        n = v['standalone'] + v['compound']
        if v['official']:
            off += n
        else:
            non += n
    non += sum(EXTRA_NONOFFICIAL.get(en, {}).values())
    total = off + non
    share = (non / total) if total else None
    if r['enSegments'] == 0:
        cls, rec, why = 'absent', 'no entry', 'the name does not occur in the book'
    elif en in HOMOGRAPHS:
        cls, rec, why = 'homograph', 'no entry', f'an entry would make the editor\'s term check fire on {HOMOGRAPHS[en]}'
    elif off == 0:
        cls, rec, why = 'never official', 'entry', 'the MT never produces the official name'
    elif share >= THRESHOLD:
        cls, rec, why = 'unreliable', 'entry', f'{share:.0%} of the MT\'s forms are not official'
    else:
        cls, rec, why = 'reliable', 'not needed by §C73', f'only {share:.0%} of the MT\'s forms are not official, and the drafted fixes clear those'
    out_rows.append({'n': i['n'], 'english': en, 'official': i['official'], 'enSegments': r['enSegments'],
                     'officialOccurrences': off, 'nonOfficialOccurrences': non,
                     'nonOfficialShare': None if share is None else round(share, 3),
                     'class': cls, 'recommendation': rec, 'why': why})

summary = {}
for o in out_rows:
    summary.setdefault(o['class'], []).append(o['english'])
json.dump({'threshold': THRESHOLD, 'summary': {k: len(v) for k, v in summary.items()}, 'rows': out_rows},
          open(out + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

pct = lambda s: '—' if s is None else f'{s:.0%}'
md = ["# Draft §C73 recommendations: book glossary entries for the 68 element names with no chemistry row", '',
      "**A draft for [USER]'s ruling, not a ruling.** Built by `instruments/build-c73-recommendations.py` from the "
      "measurement-4 census and the official list (Vísindavefur 89909). §C73 (CLAUDE.md) asks what the MT does unprompted; "
      "the rule below makes that test explicit.", '',
      '## The rule', '',
      '1. **Absent from the book:** no entry. Nothing to check.',
      '2. **Homograph:** no entry. ' + '; '.join(f'*{k}* is also {v}' for k, v in HOMOGRAPHS.items())
      + '; an entry would make the editor\'s term check fire on it (CLAUDE.md, wrong-sense homographs).',
      '3. **Never official:** entry. The MT never produces the official name.',
      f'4. **Unreliable:** entry, when {THRESHOLD:.0%} or more of the MT\'s forms are not official.',
      f'5. **Reliable:** not needed by §C73, when under {THRESHOLD:.0%} are not official. The drafted fixes clear those; an '
      'entry would only add protection against future regressions, which is a separate choice.', '',
      f'**{THRESHOLD:.0%} is the one free parameter.** Every name\'s share is in the table, so moving it moves only rows 4–5. '
      'Occurrences count standalone forms and compounds, in segments whose English names the element (measurement 4). '
      'Noise bases (`kalkstein`, `aktiníðaröðin`, `alúmín`) are left out. Beryllium\'s one-*l* forms and hafnium\'s `hafnfn` '
      'garble are counted as non-official.', '',
      '## Summary', '',
      '| Class | Recommendation | Names |', '|---|---|---:|']
order = ['never official', 'unreliable', 'reliable', 'homograph', 'absent']
recs = {'never official': 'entry', 'unreliable': 'entry', 'reliable': 'not needed by §C73', 'homograph': 'no entry', 'absent': 'no entry'}
md += [f'| {c} | {recs[c]} | {len(summary.get(c, []))} |' for c in order if c in summary]
md += ['', f"**Entries recommended: {len(summary.get('never official', [])) + len(summary.get('unreliable', []))}.**", '',
       '## Per name', '',
       '| # | English | Official | Segments | Official | Not official | Share not official | Class | Recommendation |',
       '|---:|---|---|---:|---:|---:|---:|---|---|']
for o in sorted(out_rows, key=lambda x: (order.index(x['class']), x['n'])):
    md.append(f"| {o['n']} | {o['english']} | {'/'.join(o['official'])} | {o['enSegments']} | {o['officialOccurrences']} | "
              f"{o['nonOfficialOccurrences']} | {pct(o['nonOfficialShare'])} | {o['class']} | {o['recommendation']} |")
near = sorted((o for o in out_rows if o['nonOfficialShare'] is not None and o['class'] in ('unreliable', 'reliable')
               and abs(o['nonOfficialShare'] - THRESHOLD) <= 0.05), key=lambda x: x['nonOfficialShare'])
md += ['', '## Near the threshold', '',
       f'Names within 5 points of {THRESHOLD:.0%}, where moving the threshold changes the answer: '
       + ', '.join(f"{o['english']} {o['nonOfficialShare']:.1%} ({o['recommendation']})" for o in near) + '.', '',
       '## Not measured', '',
       "- **How the editor's term check treats compounds.** An entry makes the term check expect the official name wherever the "
       "English names the element. For the frequent names (magnesium 119 segments, helium 55) a segment that uses the official "
       "name only inside a compound could draw a warning, if the check does not see compounds. Enter one such entry first and "
       "read its warnings before entering the rest.", '']
md += ['', '## Not in the 68, but related', '',
       "- **aluminum** (US spelling; OpenStax uses it): chemistry resolves only the British *aluminium* (`ál`), so the editor's "
       "term check never fires on *aluminum*. The MT writes `ál` consistently (183 occurrences). §C73 does not ask for an entry; "
       "adding *aluminum* as an English form of `ál` would only make the term check see it.",
       "- **How an entry here behaves:** none of these names has a chemistry row to replace, so each entry is an *add*. "
       "The page gives an add no worklist (`add-alongside`), so the segment fixes come from measurements 8–9, not from the page.", '']
open(out + '.md', 'w', encoding='utf-8').write('\n'.join(md))
print('rows', len(out_rows), '| summary', {k: len(v) for k, v in summary.items()})
