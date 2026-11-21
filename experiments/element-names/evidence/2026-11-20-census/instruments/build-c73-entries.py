"""Draft the 59 book glossary entries of [USER]'s §C73 ruling (2026-11-21), ready to enter on the
head-editor page: mode add, the English headword, the official Icelandic, and a reason citing the
decision record and the ruling, with that name's measurement-4 counts.

Usage (from this folder):
  python3 -I build-c73-entries.py ../reports/c73-entry-recommendations.json \\
      ../data/render-census-69-names.json ../data/comparison-official-vs-resolver.json ../reports/c73-entries"""
import json
import sys

rec_path, census_path, cmp_path, out = sys.argv[1:5]
rec = json.load(open(rec_path, encoding='utf-8'))
census = {r['english'][0]: r for r in json.load(open(census_path, encoding='utf-8'))['rows']}
cmp_ = json.load(open(cmp_path, encoding='utf-8'))

DECISION = 'docs/decisions/2026-11-20-official-element-names-visindavefur.md'
RULING = '§C245 í docs/plans/2026-07-21-post-item17-followup-campaign.md'
SOURCE = 'Vísindavefurinn, svar 89909 (13.11.2026), https://www.visindavefur.is/svar.php?id=89909'
NOISE = {'kalkstein', 'aktiníðaröðin', 'alúmín'}
EXTRA = {'beryllium': {'berillíum': 2, 'Berillínatómið': 1}, 'hafnium': {'hafnfn': 4}}
FIRST = 'magnesium'  # [USER]'s ruling: enter one frequent name first and read its warnings

aliases = {}
for it in cmp_['items']:
    al = [a.strip().lower() for a in it['en'].replace(')', '').split('(') if a.strip()]
    for a in al:
        aliases[a] = al
# Latin aliases are not English forms an editor would see in OpenStax's text.
LATIN = {'natrium', 'kalium', 'ferrum', 'cuprum', 'argentum', 'stannum', 'stibium', 'aurum', 'hydrargyrum', 'plumbum'}


def tilvik(n):
    return f'í {n} tilviki' if n % 10 == 1 and n % 100 != 11 else f'í {n} tilvikum'


def butum(n):
    return f'í {n} bút' if n % 10 == 1 and n % 100 != 11 else f'í {n} bútum'


entries = []
for r in rec['rows']:
    if r['recommendation'] != 'entry':
        continue
    en = r['english']
    off = r['official'][0]
    c = census[en]
    others = {b: v['standalone'] + v['compound'] for b, v in c['bases'].items() if not v['official'] and b not in NOISE}
    others.update(EXTRA.get(en, {}))
    others = sorted(others.items(), key=lambda kv: (-kv[1], kv[0]))
    off_n = r['officialOccurrences']
    non_n = r['nonOfficialOccurrences']
    assert non_n == sum(n for _, n in others), (en, non_n, others)
    listing = ', '.join(f'„{b}“ {n}' for b, n in others)
    if off_n == 0:
        mt = f'vélþýðingin skrifar aldrei „{off}“, heldur {listing}'
    else:
        mt = f'vélþýðingin skrifar „{off}“ {tilvik(off_n)} en annað {tilvik(non_n)} ({listing})'
    reason = (f'[USER]: opinbera heitið er {off} (Vísindavefurinn 89909; ákvörðun {DECISION}; '
              f'§C73-úrskurður 2026-11-21, {RULING}). Talið {butum(r["enSegments"])}: {mt}. Úrskurðað 2026-11-21.')
    assert len(reason) <= 2000 and '\n' not in reason
    forms = [f for f in aliases[en] if f not in LATIN]
    lookup = 'cesium' if en == 'caesium' else en  # OpenStax writes the US spelling
    forms = [lookup] + [f for f in forms if f != lookup]
    entries.append({'n': r['n'], 'english': en, 'lookup': lookup, 'forms': forms, 'icelandic': off,
                    'mode': 'add', 'class': r['class'], 'enSegments': r['enSegments'],
                    'officialOccurrences': off_n, 'nonOfficialOccurrences': non_n, 'reason': reason, 'source': SOURCE})

entries.sort(key=lambda e: (e['english'] != FIRST, e['n']))
assert len(entries) == 59 and entries[0]['english'] == FIRST
json.dump({'source': SOURCE, 'entries': entries}, open(out + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

md = ["# The 59 book glossary entries of the §C73 ruling (drafts, 2026-11-21)", '',
      "[USER] accepted the §C73 draft as is on 2026-11-21 (`c73-entry-recommendations.md`; register §C245): these 59 element names "
      "get a book glossary entry. None of them has a chemistry row, so **every entry is an add**. Checked read-only on production "
      "on 2026-11-21: none of the 60 English forms (the 59 names plus *cesium*) resolves in chemistry, is excluded as a whole "
      "headword, has a `book_term_preference` row or is claimed by a book entry, and none is a house-style term. So the page "
      "will offer only *Til hliðar*, with no confirmation.", '',
      '## Order of work', '',
      '1. **Merge #756 first.** The reasons cite the decision record and §C245 by their repo paths.',
      "2. **Paste the editors' fix drafts first** (`editor-fixes*-paste.txt`). Then the term check's warnings after step 3 are not "
      'mixed with segments that still hold a non-official form.',
      f'3. **Enter {FIRST} first and read its warnings** (the ruling). The editor\'s term check expects the official name wherever '
      'the English names the element; a warning on a segment that uses the official name only inside a compound means the check '
      'does not see compounds. Stop and tell Claude if that happens.',
      '4. **Then enter the rest in one sitting.** Adding entries moves the book layer, so chemistry\'s next cron export is held '
      "(`refused-layer-change`) until it is released with the register's four-line runbook; one sitting means one release.", '',
      '## For every entry', '',
      '- **Enskt orð:** the English headword, then *Fletta*; then *Setja þýðingu bókar*.',
      '- **Íslensk þýðing bókarinnar:** the official name.',
      '- **Enskar orðmyndir:** as prefilled; add a second line only where shown (caesium).',
      '- **Mode:** *Til hliðar (núverandi orð er áfram leyfilegt)*, which is the only option.',
      f'- **Heimild:** `{SOURCE}`',
      '- **Worklist:** none. The page gives an add no worklist; the segment fixes are the editors\' fix drafts.',
      '- *Sækja beygingar* is optional. Superheavy names are not in BÍN, so it finds no inflections for them.', '',
      '## The 59', '',
      '| # | Enskt orð | Enskar orðmyndir | Íslensk þýðing | Class | Segments |', '|---:|---|---|---|---|---:|']
for k, e in enumerate(entries, 1):
    md.append(f"| {k} | `{e['lookup']}` | {', '.join(f'`{f}`' for f in e['forms'])} | `{e['icelandic']}` | {e['class']} | {e['enSegments']} |")
md += ['', '## Reasons (Ástæða), one per entry', '']
for k, e in enumerate(entries, 1):
    md += [f"**{k}. {e['english']} → {e['icelandic']}**" + (' — enter this one first' if k == 1 else ''), '', f"    {e['reason']}", '']
open(out + '.md', 'w', encoding='utf-8').write('\n'.join(md))
print('entries', len(entries), '| first', entries[0]['english'], '| caesium forms', [e['forms'] for e in entries if e['english'] == 'caesium'])
