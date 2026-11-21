"""Write the report of measurement 15 (the §C246 census) from c246-census.cjs's raw output.

The raw output is NOT committed: it labels every enabling word with a class derived from BÍN, and the BÍN
licensing decision (docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md) defaults to
committing no BÍN-derived data. This report carries aggregate counts and a short list of illustrative examples.

Usage (from this folder; extra raw outputs, if given, must carry the same corpus hashes):
  python3 -I summarise-c246-census.py <raw output> ../reports/c246-census.md [<earlier raw output> ...]"""
import json
import re
import sys
from collections import Counter, defaultdict


def load(path):
    raw = open(path, encoding='utf-8').read().rstrip()
    assert raw.endswith('END-OF-REPORT'), f'{path}: not a complete run'
    return json.loads(raw[:-len('END-OF-REPORT')])


raw_path, out = sys.argv[1:3]
r = load(raw_path)
earlier = [load(p) for p in sys.argv[3:]]
for e in earlier:
    assert e['hashes'] == r['hashes'], 'an earlier run measured a different corpus result'
assert r['fileUnchanged'] and r['controlEqual']
assert all(v['removedWithoutWord'] == 0 and v['survivingWithWord'] == 0 for v in r['attribution'].values())
assert r['base']['added'] == 0 and r['all']['added'] == 0
p = r['planted']
assert p['warnsToday'] == [True, True] and p['warnsUnderBase'] == [False, False]
assert p['classes'][0].endswith(':undecided') and p['classes'][1].endswith(':compound')

TRUE = {'inflection', 'inflection-by-ending', 'compound'}
grp = lambda c: 'false' if c.startswith('false') else ('true' if c in TRUE else 'undecided')
B = ['1-2', '3', '4', '5', '6-7', '8-10', '11+', 'multi-part']


def bucket(f):
    if re.search(r'[\s-]', f):
        return 'multi-part'
    n = len(f)
    return '1-2' if n <= 2 else '3' if n == 3 else '4' if n == 4 else '5' if n == 5 else '6-7' if n <= 7 else '8-10' if n <= 10 else '11+'


key = lambda x: x['segmentId'] + '|' + x['english']
base = {key(x): x for x in r['base']['rows']}
allr = {key(x): x for x in r['all']['rows']}
assert set(base) <= set(allr)
only_all = {k: v for k, v in allr.items() if k not in base}
relabel = Counter((grp(base[k]['best']['cls']), grp(allr[k]['best']['cls'])) for k in base)


def table(rows, md):
    agg = defaultdict(Counter)
    for x in rows.values():
        agg[bucket(x['best']['form'])][grp(x['best']['cls'])] += 1
    md += ['| Term length | Removed | True | Undecided | False | False range |', '|---|---:|---:|---:|---:|---|']
    tot = Counter()
    for b in B:
        c = agg[b]
        n = sum(c.values())
        tot.update(c)
        if n:
            md.append(f"| {b} | {n} | {c['true']} | {c['undecided']} | {c['false']} | "
                      f"{100 * c['false'] / n:.1f}–{100 * (c['false'] + c['undecided']) / n:.1f}% |")
    n = sum(tot.values())
    md.append(f"| **Total** | **{n}** | {tot['true']} | {tot['undecided']} | {tot['false']} | "
              f"{100 * tot['false'] / n:.1f}–{100 * (tot['false'] + tot['undecided']) / n:.1f}% |")
    md.append('')


md = ["# The term check under a 'word starts with the term' rule: a corpus census (measurement 15, §C246)", '']
md.append(f"Measured 2026-11-21 on production at `{r['head'][:9]}`, read-only, by `instruments/c246-census.cjs` "
          f"({len(earlier) + 1} runs; the corpus result, hashed per arm, was identical in every run). It runs the real "
          "term check over every chemistry segment as editors see it today, pending edits included, twice: as installed, "
          "and as a copy compiled from the same source with only `buildInflectionRegex` changed. "
          f"The database file was opened read-only and was unchanged after the run.")
md.append('')
md.append(f"**Population.** Today's state: **{r['current']['warnings']:,} warnings** ({r['current']['byType'].get('missing', 0):,} "
          f"`missing`, {r['current']['byType'].get('alternative', 0):,} `alternative`) over {r['current']['terms']:,} terms, in "
          f"{r['corpus']['segments']:,} segments. A warning is one term in one segment. None of §C245's 59 held adds is "
          "in the database, so measurement 14's 151 compound warnings are not in these counts.")
md.append('')
md.append('**The arms.** *Base*: the term counts if a word starts with it; its stored inflected forms still count only as '
          'whole words. *All*: the stored forms count as the start of a word too (§C246 design question 3).')
md.append('')
md.append('**Controls, all passed.** The unchanged copy reproduces the installed check exactly over the whole corpus. No '
          'warning is added in either arm. Every removed warning has at least one enabling word, and no surviving warning '
          f"has one (attribution {r['attribution']['base']['removedWithoutWord']}/{r['attribution']['base']['survivingWithWord']} "
          f"and {r['attribution']['all']['removedWithoutWord']}/{r['attribution']['all']['survivingWithWord']}). A planted "
          f"control on `{p['term']}` (`{p['english']}`): `{p['term']}xqzv` and `{p['term']}efni` both warn today and both pass "
          'under the base rule, and the classifier calls them not-compound and compound.')
md.append('')
md.append('## How each removed warning is classified')
md.append('')
md.append('Each removed warning is judged by its best enabling word (a word of the segment that starts with a tested '
          'form): one real inflection or compound anywhere makes the pass legitimate. Words are labelled by these rules, '
          'in order, using BÍN (read-only) and the concept model\'s Icelandic terms:')
md.append('')
md += ['1. **Inflection**: BÍN lists the word as a form of the term, or of a lemma the term itself belongs to (`gögn` → `gögnum`, lemma *gagn*).',
       '2. **Compound**: the rest of the word, after an optional linking `-s-`, `-a-`, `-u-`, `-ar-`, `-ur-` or `-na-`, is a '
       'word BÍN knows or a concept-model term (four letters or more), or a noun BÍN knows (three letters).',
       '3. **False pass**: BÍN knows the word, and it is an unrelated word (no lemma starts with the term), or only a '
       'non-noun (a derived verb or adjective: `jónast`, `prófaðu`), or a noun whose lemma is the term plus a short '
       'suffix that is not an ending (a derived noun: `merking`, `klóríð`).',
       '4. **Inflection by ending**: BÍN does not know the word, and the rest is an inflection or article ending.',
       '5. **Undecided**: none of these.', '']
md.append('"True" (1, 2, 4) is a ceiling: *compound* only means the rest is a word, so it can hide a word that is a '
          'different concept. "False" is a floor, and *undecided* is mostly true (mostly compounds whose second part '
          'BÍN does not list). The rules were refined in three rounds on this same data, so they are heuristics; '
          'the false range below runs from the false count to false plus undecided.')
md.append('')
md.append('## The base rule')
md.append('')
md.append(f"**It removes {r['base']['removed']:,} of the {r['current']['warnings']:,} warnings** "
          f"({100 * r['base']['removed'] / r['current']['warnings']:.1f}%), across {len(r['base']['perTerm'])} of the "
          f"{r['current']['terms']:,} terms. Another **{r['base']['toAlternative']}** change from `missing` to `alternative` "
          'instead of disappearing: a known synonym now matches as a prefix.')
md.append('')
table(base, md)
drv = defaultdict(Counter)
for x in base.values():
    g = grp(x['best']['cls'])
    if g != 'true':
        drv[bucket(x['best']['form'])][(x['expected'], g)] += 1
md.append('**What drives the false and undecided counts** (the term, its class, its warnings):')
md.append('')
for b in B:
    if drv[b]:
        md.append(f"- **{b}:** " + ', '.join(f"`{t}` {g} {n}" for (t, g), n in drv[b].most_common(6)))
md.append('')
old = Counter(x['expected'] for x in base.values() if x['expected'] in ('german', 'sirkon', 'rúten', 'lantan', 'praseódým', 'neódým', 'pólon', 'astat', 'plúton'))
md.append(f"**{sum(old.values())} of the false passes are §C245's old physics forms** ("
          + ', '.join(f'`{k}` {v}' for k, v in old.most_common()) + '): the check expects the old form, the text holds the '
          'official name (`germaníum`), and the rule would silence the warning. The text is right by the official list; '
          '§C245 ①\'s nine replacement entries are the fix for those segments.')
md.append('')
md.append('**Examples** (base arm; the word, the census\'s class, and its occurrences):')
md.append('')
P = r['base']['pairs']
for b in B:
    fs = [x for x in P if x['bucket'] == b and x['cls'].startswith('false')][:6]
    us = [x for x in P if x['bucket'] == b and x['cls'] == 'undecided'][:4]
    if fs or us:
        md.append(f"- **{b}:** " + '; '.join(f"`{x['form']}` → `{x['word']}` ({x['cls'][6:] if x['cls'].startswith('false') else 'undecided'}) ×{x['count']}" for x in fs + us))
md.append('')
md.append('**The terms that lose the most warnings:**')
md.append('')
cur = {(t['english'], t['expected']): t['warnings'] for t in r['currentPerTerm']}
md += ['| English | Expected | Warnings today | Removed | of them false |', '|---|---|---:|---:|---:|']
for t in r['base']['perTerm'][:20]:
    f = sum(v for k, v in t['byClass'].items() if k.startswith('false'))
    md.append(f"| {t['english']} | `{t['expected']}` | {cur.get((t['english'], t['expected']), '')} | {t['removed']} | {f} |")
md.append('')
md.append('## Stored forms as prefixes too (the *all* arm)')
md.append('')
md.append(f"It removes **{len(only_all):,} more** warnings ({r['all']['removed']:,} in all), and another {r['all']['toAlternative']} "
          'change to `alternative`. The shared warnings keep their base-arm class: classifying them again under this arm '
          f"relabels {relabel[('false', 'true')]} of the base arm's false passes as true (a stored form such as `merkin` "
          'leaves a different rest of the word), so only the extra removals are classified here:')
md.append('')
table(only_all, md)
PA = Counter((x['best']['form'], x['best']['word'].lower()) for x in only_all.values() if x['best']['cls'].startswith('false'))
md.append('Its extra false passes come from short stored forms that start other words (the best enabling word of each '
          'extra removal classed false, with its warnings): ' +
          '; '.join(f"`{f}` → `{w}` ×{n}" for (f, w), n in PA.most_common(8)) + '. Most are unrelated words '
          '(`hvarfast` "to disappear", `staðlaðar` "standardised"); `jarðalkalímálmar` (alkaline earth metals) is a '
          'borderline case the classifier counts as false.')
md.append('')
md.append('## Limits')
md.append('')
md += ['- The classes are heuristics with a ceiling and a floor (above); a human review of the undecided and false lists '
       'decides any single case.',
       '- Only chemistry was measured, and only today\'s text: a later edit or a new glossary row changes the counts.',
       '- A warning removed by the rule may still be a correct one to remove for a reason the census does not see, or '
       'the reverse.',
       '- Per the BÍN licensing decision, the per-word classes are not committed; rerun the instrument (it needs '
       '`tools/data/SHsnid.csv` on the box) to regenerate them.', '']
open(out, 'w', encoding='utf-8').write('\n'.join(md))
print('report', out, '| base removed', r['base']['removed'], '| all extra', len(only_all))
