"""Write the review report of measurement 14 (the term check's two read-only dry runs) from its data files.

Usage (from this folder):
  python3 -I summarise-termcheck-dryruns.py ../data/termcheck-dryrun-magnesium.json ../data/termcheck-dryrun-c73.json \\
      ../reports/termcheck-dryruns.md"""
import json
import sys
from collections import Counter

mg_path, c73_path, out = sys.argv[1:4]
mg = json.load(open(mg_path, encoding='utf-8'))
c = json.load(open(c73_path, encoding='utf-8'))
ch = lambda n: 'app.' if n == -1 else str(n)
md = []
w = md.append

# ── magnesium ──
V = mg['variants']
ids = {k: {i['segmentId'] for i in v['issues']} for k, v in V.items()}
assert ids['B.fixed'] <= ids['B.now'] and ids['B.fixed'] <= ids['A.fixed']
assert V['base.now']['issueCount'] == 0 and V['base.fixed']['issueCount'] == 0
bf = {i['segmentId']: i for i in V['B.fixed']['issues']}
bn = {i['segmentId']: i for i in V['B.now']['issues']}
moved = sorted(i for i in bf if 'non-official-magnesín' in bn[i]['kinds'])
lookup_only = sorted(ids['A.fixed'] - ids['B.fixed'])
compound_only = [i for i in bf.values() if set(i['kinds']) <= {'closed-compound', 'other-magnes'} and 'closed-compound' in i['kinds']]
assert len(compound_only) == len(bf)

# ── the 59 ──
C = c['counts']
W = c['warnedB']
pairs = lambda st: sum(x['warned'] for x in C[st].values())
cls = Counter()
for x in C['B.fixed'].values():
    cls.update(x['byClass'])
distinct = len({w_['segmentId'] for ws in W.values() for w_ in ws})
assert all({w_['segmentId'] for w_ in W[k]} <= set(c['warnedBnowIds'][k]) for k in W)
assert all({w_['segmentId'] for w_ in W[k]} <= set(c['warnedAIds'][k]) for k in W)
non_compound = [(k, w_) for k, ws in W.items() for w_ in ws if w_['cls'] != 'compound-only']
fallback_names = sorted({a['id'].split('|')[0] for a in c['synthetic']['before']['anomalies'] if a['isFallback']})
assert C['B.fixed']['magnesium']['warned'] == V['B.fixed']['issueCount'], 'the two runs must agree on magnesium'
bin_tally = Counter(v['outcome'] for v in c['bin'].values())

w("# The editor's term check on compounds: two read-only dry runs (measurement 14)")
w('')
w(f"Measured 2026-11-21 on production at `{mg['_meta']['prodHead']}`, read-only. Each run added the entries to an **in-memory copy** "
  "of the database (the file opened read-only, serialized, and reopened from the buffer) and ran the server's own functions on it: "
  "`addEntry` (the write API the head-editor page calls), the BÍN chooser the page's automatic lookup runs, "
  "`buildEffectiveSegments` (the segments as editors see them, pending edits included) and `findTermsInSegments` (the term check). "
  "The file's size and mtime were unchanged after each run and the checkout stayed clean. Data: `data/termcheck-dryrun-magnesium.json`, "
  "`data/termcheck-dryrun-c73.json` (BÍN form lists reduced to counts).")
w('')
w('**The states.** Adding an entry schedules a BÍN lookup that stores the word\'s inflections a moment later, and the term check '
  'accepts the term or a stored form only as a whole word. So each run measures the text as it is and with the fix drafts of '
  'measurements 7-9 overlaid, under: no entry; **A**, the entry before its inflections are stored; **B**, after.')
w('')
w('## Magnesium alone')
w('')
w('| Warnings | Text as it is | With the fix drafts |')
w('|---|---:|---:|')
for label, a, b in (('No entry', 'base.now', 'base.fixed'), ('A: entry, before the lookup', 'A.now', 'A.fixed'),
                    ('B: entry and its BÍN inflections', 'B.now', 'B.fixed')):
    w(f"| {label} | {V[a]['issueCount']} | **{V[b]['issueCount']}** |" if a.startswith('B') else f"| {label} | {V[a]['issueCount']} | {V[b]['issueCount']} |")
w('')
r = mg['resolve']
w(f"- **Controls.** Before the entry `magnesium` resolves to no chemistry winner (only `{', '.join(r['before']['outOfScope'])}` out of scope, "
  "shown in the editor as an unchecked suggestion); after it, to the entry (`book-entry`). "
  f"All {mg['totals']['magnesiumSegments']} segments whose English names magnesium got a magnesium match in every state with the entry. "
  f"BÍN: {mg['bin']['outcome']}, {mg['bin']['nForms']} forms. Drafts: {mg['drafts']['unique']} unique, {mg['drafts']['same']} still equal to "
  f"production's text, {len(mg['drafts']['drifted'])} drifted. No other term's warnings changed in these segments.")
syn = mg['synthetic']
w('- **Synthetic segments** (the issue type, or — for none):')
w('')
w('| Segment | No entry | A | B |')
w('|---|---|---|---|')
for k in syn['B']:
    w(f"| {k} | {syn['before'][k]['issue'] or '—'} | {syn['A'][k]['issue'] or '—'} | {syn['B'][k]['issue'] or '—'} |")
w('')
w(f"- **With the drafts and the inflections, {len(bf)} warnings, every one a closed compound:** the segment holds magnesíum only as the "
  "first part of a longer word (one also holds the product name *Magnesia*).")
w(f"- **The drafts clear {len(ids['B.now'] - ids['B.fixed'])}**, all genuine `magnesín` forms; **{len(moved)}** more drafts fix `magnesín` "
  "and leave a compound, so they still warn: " + '; '.join(f"`{m}`" for m in moved) + '.')
w(f"- **{len(lookup_only)} clear only once the lookup has stored the inflections** (mostly `magnesíums`).")
w('')
w('| Chapter | Segment | Name-bearing words |')
w('|---|---|---|')
for i in sorted(bf.values(), key=lambda x: (x['chapter'] == -1, x['chapter'], x['segmentId'])):
    w(f"| {ch(i['chapter'])} | `{i['segmentId']}` | {', '.join(i['tokens'])} |")
w('')
w('## The 59 adds, entered together')
w('')
w(f"| Warnings ((segment, name) pairs) | Text as it is | With the fix drafts |")
w('|---|---:|---:|')
w(f"| No entries | — | {pairs('base.fixed')} |")
w(f"| A: entries, before the lookup | — | {pairs('A.fixed')} |")
w(f"| B: entries and their BÍN inflections | {pairs('B.now')} | **{pairs('B.fixed')}** |")
w('')
w(f"- **With the drafts and the inflections: {pairs('B.fixed')} warnings on {distinct} distinct segments, across "
  f"{sum(1 for x in C['B.fixed'].values() if x['warned'])} names. {cls['compound-only']} are closed compounds only**: every name-bearing "
  "word the classifier recognises starts with the official form and goes on. The other " + str(len(non_compound)) + ' ' +
  ('is' if len(non_compound) == 1 else 'are') + ' ' + '; '.join(f"`{w_['segmentId']}` ({k}, {w_['cls']})" for k, w_ in non_compound) +
  ': `miðberyllínatómið`, a non-official form inside a compound, drafted in measurement 13.')
w(f"- **Without the drafts: {pairs('B.now')}**, {sum(x['byClass'].get('non-official', 0) for x in C['B.now'].values())} of them genuine "
  "non-official forms.")
w(f"- **Before the lookup: {pairs('A.fixed')}.** BÍN: {bin_tally.get('unambiguous', 0)} names unambiguous, "
  f"{bin_tally.get('not-in-bin', 0)} not in BÍN, {bin_tally.get('refused-ambiguous', 0)} refused as ambiguous "
  "(`data/c73-bin-outcomes.json` names them); those 13 get no inflections, and none of them warns on today's text.")
w(f"- **Today, before any entry:** {len(fallback_names)} names show in the editor as an unchecked suggestion from outside chemistry "
  f"({', '.join(fallback_names)}); the other {59 - len(fallback_names)} are not highlighted at all.")
w(f"- **Controls.** {c['added']} adds, {len(c['refusals'])} refusals; every English form resolves to its own entry "
  f"({len(c['resolveCheck'])} exceptions). Per name, a synthetic standalone form passes ({c['synthetic']['B']['passOk']} of 59) and a "
  f"closed compound warns ({c['synthetic']['B']['compoundWarns']} of 59). No name warns before the entries. "
  f"The (segment, name) pairs total {sum(x['enSegments'] for x in C['B.fixed'].values())}, the census's count. "
  f"Drafts: {c['drafts']['same']} of {c['drafts']['unique']} still equal to production's text. No other term's warnings changed "
  f"({len(c['otherIssueChanges'])}). Warned segment ids shrink state by state (B with drafts ⊆ B without, and ⊆ A). "
  "Magnesium's row equals the magnesium run.")
w('- **One state-A classification is a misfire, not an error:** actinium\'s `m68842:para:fs-idm9696240` is classed non-official '
  'in state A because `aktíníðaröðina`, the actinide-series word ruled on 2026-11-20, starts with the base `aktín`; it holds `aktíníums` '
  'too, so it passes once the inflections are stored. Found by a local re-run that kept state A\'s records.')
w('')
w('| Name | Segments naming it | B, as it is | A, with drafts | **B, with drafts** | Compounds only | BÍN |')
w('|---|---:|---:|---:|---:|---:|---|')
for k in sorted(C['B.fixed'], key=lambda k: (-C['B.fixed'][k]['warned'], k)):
    x = C['B.fixed'][k]
    w(f"| {k} | {x['enSegments']} | {C['B.now'][k]['warned']} | {C['A.fixed'][k]['warned']} | **{x['warned']}** | "
      f"{x['byClass'].get('compound-only', 0)} | {c['bin'][k]['outcome']} |")
w('')
w('## Limits')
w('')
w('- **Why compounds warn.** `wholeWordRegex` rejects a letter on either side of the term, so `magnesíumklóríð` does not contain '
  '`magnesíum` for the check; a hyphen is not a letter, so `magnesíum-jón` passes.')
w('- **The warnings are advisory**, read from the code rather than run: the module report\'s route says "Advisory — no block", the '
  'per-save warnings are returned with a save that cannot fail on them, and the editor page lists them.')
w('- **The drafts are measurements 7-9**, the ones that existed when the runs were made. Measurement 13\'s draft fixes the one real '
  'warning; the runs were not repeated with it.')
w('- **The nine replacement entries (§C245 ①) were not in either run.**')
w('- **"Compounds only" is the classifier\'s reading:** it sees the words that start with the official form or a known non-official '
  'base; a name inside a word is seen only through measurement 13\'s scan.')
open(out, 'w', encoding='utf-8').write('\n'.join(md) + '\n')
print('report', out, '| magnesium', len(bf), '| 59: pairs', pairs('B.fixed'), 'distinct', distinct, 'compound-only', cls['compound-only'])
