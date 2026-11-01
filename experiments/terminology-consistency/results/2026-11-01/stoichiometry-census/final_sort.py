#!/usr/bin/env python3
"""[USER]'s final sense sort of the 78 segments the stoichiometry ruling matches (2026-11-01).

Inputs, both in this directory:
- stoich-items.json: the review page's items, each with Claude's PROPOSED sense
  (head | topic | mixed | ratio);
- db/: the page's database as [USER] left it, saved verbatim with ArtifactData (out_dir).

A group's `flipped` list, written when [USER] confirmed the group, is the authority on what
changed. A flips/sNN document that names the item's proposed sense is a flip [USER] made and then
took back (the document stays, at version 2). The script checks that every flip document agrees
with its group's list, and refuses if not, so the two sources cannot silently disagree.

Writes final-sort-2026-11-01.json: each item's proposed and final sense, and the counts.
Usage: python3 -I final_sort.py
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
items = json.loads((HERE / 'stoich-items.json').read_text(encoding='utf-8'))['items']
db = HERE / 'db'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))

groups = {p.stem: read(p) for p in sorted((db / 'groups').glob('*.json'))}
flips = {p.stem: read(p)['sense'] for p in sorted((db / 'flips').glob('*.json'))}
answers = {p.stem: read(p) for p in sorted((db / 'answers').glob('*.json'))}
meta = read(db / 'meta' / 'review.json')

problems = []
if not meta.get('complete'):
    problems.append('meta/review is not marked complete')
if sorted(meta.get('groupsConfirmed', [])) != ['mixed', 'ratio', 'topic']:
    problems.append(f"groups confirmed: {meta.get('groupsConfirmed')}")
for name, g in groups.items():
    if g.get('confirmed') is not True:
        problems.append(f'group {name} not confirmed')

proposed = {i['id']: i['sense'] for i in items}
flipped_by_group = {sid: name for name, g in groups.items() for sid in g['flipped']}
for sid, sense in flips.items():
    if sid not in proposed:
        problems.append(f'{sid}: flip for an unknown item')
        continue
    in_list = sid in flipped_by_group
    changed = sense != proposed[sid]
    if in_list != changed:
        problems.append(f'{sid}: flip document says {sense}, proposal {proposed[sid]}, '
                        f"group list {'has' if in_list else 'lacks'} it")
    if in_list and flipped_by_group[sid] != proposed[sid]:
        problems.append(f'{sid}: listed under group {flipped_by_group[sid]}, proposed {proposed[sid]}')
for sid in flipped_by_group:
    if sid not in flips:
        problems.append(f'{sid}: in a group list with no flip document')
for name, g in groups.items():
    n = sum(1 for s in proposed.values() if s == name)
    if g['items'] != n:
        problems.append(f"group {name}: page counted {g['items']} items, proposal has {n}")
if problems:
    sys.stderr.write('refusing:\n  ' + '\n  '.join(problems) + '\n')
    sys.exit(1)

rows = []
for i in items:
    final = flips[i['id']] if i['id'] in flipped_by_group else i['sense']
    rows.append({'id': i['id'], 'chapter': i['chapter'], 'key': i['key'], 'kind': i['kind'],
                 'candidate': i['candidate'], 'proposed': i['sense'], 'final': final})
count = lambda k: {s: sum(1 for r in rows if r[k] == s) for s in ('head', 'topic', 'mixed', 'ratio')}
out = {
    'about': 'final sense sort of the stoichiometry census (see README.md); built by final_sort.py',
    'answers': {k: {'choice': v['choice'], 'note': v['note']} for k, v in answers.items()},
    'proposedCounts': count('proposed'),
    'finalCounts': count('final'),
    'changed': [{'id': r['id'], 'from': r['proposed'], 'to': r['final']} for r in rows
                if r['proposed'] != r['final']],
    'items': rows,
}
(HERE / 'final-sort-2026-11-01.json').write_text(
    json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(f"items {len(rows)}; proposed {out['proposedCounts']}; final {out['finalCounts']}; "
      f"changed {len(out['changed'])}")
