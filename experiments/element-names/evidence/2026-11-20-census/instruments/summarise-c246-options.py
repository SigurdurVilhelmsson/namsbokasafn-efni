"""Write the report of measurement 16 (the options census for §C246's two open questions) from c246-options.cjs's
raw output.

The raw output is NOT committed: it labels enabling words with classes derived from BÍN, and the BÍN licensing
decision (docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md) defaults to committing
no BÍN-derived data. This report carries aggregate counts and a short list of illustrative examples.

Usage (from this folder; the second raw output, measurement 15's, is optional and must carry the same
installed-check hash):
  python3 -I summarise-c246-options.py <raw output> ../reports/c246-options.md [<measurement-15 raw output>]"""
import json
import re
import sys
from collections import Counter


def load(path):
    raw = open(path, encoding='utf-8').read().rstrip()
    assert raw.endswith('END-OF-REPORT'), f'{path}: not a complete run'
    return json.loads(raw[:-len('END-OF-REPORT')])


raw_path, out = sys.argv[1:3]
r = load(raw_path)
m15 = load(sys.argv[3]) if len(sys.argv) > 3 else None
if m15:
    assert m15['hashes']['installed'] == r['hashes']['installed'], 'measurement 15 measured a different corpus'
assert r['fileUnchanged'] and r['controlEqual']
assert all(v['removedWithoutWord'] == 0 and v['survivingWithWord'] == 0 for v in r['attribution'].values())
A = r['arms']
assert all(a['added'] == 0 and a['otherChange'] == 0 for a in A.values())

TRUE = {'inflection', 'inflection-by-ending', 'compound'}
grp = lambda c: 'false' if c.startswith('false') else ('true' if c in TRUE else 'undecided')
key = lambda x: x['segmentId'] + '|' + x['english']
sets = {k: {key(x): x for x in a['rows']} for k, a in A.items()}
assert set(sets['T1']) == set(sets['T2']), 'alternatives must remove nothing'
LABEL = {'T1': 'A1', 'T2': 'A2', 'T3': 'A3', 'M1': 'B2', 'M2': 'B3'}
DESC = {
    'T1': 'prefix for the winner, the tie options and alternatives; multi-word terms whole-phrase',
    'T2': 'prefix for the winner and the tie options; alternatives whole-word; multi-word terms whole-phrase',
    'T3': 'prefix for the winner only; multi-word terms whole-phrase',
    'M1': "T1's roles, and multi-word and hyphenated terms take the prefix on the whole phrase",
    'M2': "T1's roles, and multi-word and hyphenated terms take it only when the last word has four letters or more",
}


def mix(rows):
    c = Counter(grp(x['best']['cls']) for x in rows)
    n = len(rows)
    rng = f"{100 * c['false'] / n:.1f}–{100 * (c['false'] + c['undecided']) / n:.1f}%" if n else '—'
    return c, n, rng


md = ["# §C246's two open questions: an options census (measurement 16)", '']
md.append(f"Measured 2026-11-21 on production at `{r['head'][:9]}`, read-only, by `instruments/c246-options.cjs`, with "
          "[USER]'s rulings of that day built in: the base rule (the term may start a word, its stored inflected forms "
          "only as whole words), a minimum term length of four letters, and the form `merki` excluded. It runs the real "
          "term check over every chemistry segment as editors see it today, as installed and as a copy compiled from the "
          "same source with the role-aware prefix rule patched in. The database file was opened read-only and was "
          f"unchanged after the run. Method and classification as in measurement 15 (`c246-census.md`).")
md.append('')
md.append(f"**Population.** {r['current']['warnings']:,} warnings today, **{r['current']['ties']:,} of them ties** (the "
          "resolver found several equally ranked answers, any of which passes).")
md.append('')
md.append('**Controls, all passed.** The unchanged copy reproduces the installed check exactly over the whole corpus'
          + (", and the installed check's corpus hash equals measurement 15's" if m15 else '') + '. No arm adds a warning '
          'or changes one in any way other than `missing` → `alternative`. Every removed warning has an enabling word and '
          'no surviving warning has one, in every arm.')
md.append('')
md.append('## The arms')
md.append('')
md += ['| Arm | Option | What takes the prefix | Removed | of them ties | `missing` → `alternative` | True | Undecided | False | False range |',
       '|---|---|---|---:|---:|---:|---:|---:|---:|---|']
for k in ('T1', 'T2', 'T3', 'M1', 'M2'):
    a = A[k]
    c, n, rng = mix(a['rows'])
    md.append(f"| {k} | {LABEL[k]} | {DESC[k]} | {n:,} | {a['tieRemoved']} | {a['toAlternative']} | {c['true']:,} | {c['undecided']} | {c['false']} | {rng} |")
md.append('')
md.append('Option B1 (multi-word and hyphenated terms stay whole-phrase) is what T1–T3 measure.')
md.append('')
md.append('## Question A: which uses of a form take the prefix')
md.append('')
md.append(f"**Alternatives remove nothing.** T1 and T2 remove the identical set of {len(sets['T1']):,} warnings. What alternatives "
          f"change is the wording: under T1, {A['T1']['toAlternative']} warnings turn from `missing` into `alternative` "
          "(the editor is told a known synonym was used), because a synonym now matches as the start of a word. The most "
          'frequent (English, expected, the synonym it would name, warnings):')
md.append('')
md += [f"- {t['english']} → `{t['expected']}`, would say `{t['used']}`: {t['n']}" for t in A['T1']['transitions'][:10]]
md.append('')
tie_only = [sets['T1'][k] for k in sets['T1'] if k not in sets['T3']]
assert all(x['tie'] for x in tie_only)
c, n, rng = mix(tie_only)
md.append(f"**The tie options.** T1 removes {n} warnings that T3 keeps, all of them ties where a tied answer matched as the "
          f"start of a word: {c['true']} true, {c['undecided']} undecided, {c['false']} false, a false range of **{rng}**. "
          'The terms behind most of them (English → expected, warnings):')
md.append('')
md.append(', '.join(f"{e} → `{x}` {m}" for (e, x), m in Counter((x['english'], x['expected']) for x in tie_only).most_common(10)) + '.')
md.append('')
md.append('Examples (the word, its class, warnings): ' + '; '.join(
    f"`{f}` → `{w}` ({g}) ×{m}" for (f, w, g), m in Counter(
        (x['best']['form'], x['best']['word'].lower(), grp(x['best']['cls'])) for x in tie_only).most_common(10)) + '.')
md.append('')
md.append('## Question B: multi-word and hyphenated terms')
md.append('')
mp = lambda rows: [x for x in rows if re.search(r'[\s-]', x['best']['form'])]
for k in ('M1', 'M2'):
    rows = mp(A[k]['rows'])
    hy = [x for x in rows if '-' in x['best']['form'] and ' ' not in x['best']['form']]
    mw = [x for x in rows if ' ' in x['best']['form']]
    ch, nh, _ = mix(hy)
    cw, nw, _ = mix(mw)
    md.append(f"- **{k} ({LABEL[k]}):** {len(rows)} more removals than T1. Hyphenated {nh} ({ch['true']} true, {ch['undecided']} "
              f"undecided, {ch['false']} false); multi-word {nw} ({cw['true']} true, {cw['undecided']} undecided, {cw['false']} false).")
md.append('')
md.append('Under M1, by term (the term, its class, warnings): ' + ', '.join(
    f"`{f}` {g} {m}" for (f, g), m in Counter((x['best']['form'], grp(x['best']['cls'])) for x in mp(A['M1']['rows'])).most_common()) + '.')
md.append('')
diff = [sets['M1'][k] for k in sets['M1'] if k not in sets['M2']]
md.append(f"**What M2 removes from M1:** {len(diff)} warnings: " + '; '.join(
    f"`{f}` → `{w}` ({g}) ×{m}" for (f, w, g), m in Counter(
        (x['best']['form'], x['best']['word'], grp(x['best']['cls'])) for x in diff).most_common()) + '. Terms that END in a hyphen '
    "(`upphafs-`, `tilrauna-`) have an empty last word, so the four-letter rule excludes them; it also excludes a last word of "
    'three letters (`lyf`, `jón`).')
md.append('')
c, n, rng = mix(A['M2']['rows'])
md.append(f"**A2 with B3.** Because alternatives remove nothing, the removals of option A2 with option B3 equal M2's: "
          f"**{n:,} of {r['current']['warnings']:,} warnings** ({100 * n / r['current']['warnings']:.1f}%), across "
          f"{len({(x['english'], x['expected']) for x in A['M2']['rows']})} terms, false range {rng}, and no `missing` → "
          '`alternative` change (alternatives stay whole-word under A2).')
md.append('')
md.append('## Limits')
md.append('')
md += ["- The classes are measurement 15's heuristics, with a ceiling (true) and a floor (false).",
       '- Only chemistry, and only today\'s text.',
       '- Per the BÍN licensing decision, the per-word classes are not committed; rerun the instrument (it reads '
       '`tools/data/SHsnid.csv` on the box) to regenerate them.', '']
open(out, 'w', encoding='utf-8').write('\n'.join(md))
print('report', out, '| A2+B3 removals', n)
