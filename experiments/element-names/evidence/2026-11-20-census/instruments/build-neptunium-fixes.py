"""Editors' fix drafts for change 6 (neptunium -> neptúníum): the four periodic-table alt segments that still hold
the old form `neptún` after the change was entered (its worklist, run read-only on production on 2026-11-21).

All four already have a draft in measurements 7-9 (identical in all three sets, pasted from editor-fixes-paste.txt),
so a new draft must START from that drafted text, or pasting it would undo those fixes. This script:
  1. reads the effective text fetched read-only on production (../data/neptunium-targets.json, from
     fetch-neptunium-targets.cjs) and asserts it equals either the drafts' `current` (not yet pasted) or their
     `proposed` (already pasted), so nothing has drifted;
  2. takes the drafted `proposed` (identical across the three sets, asserted) and replaces the whole word `neptún`
     with `neptúníum`, asserting exactly one occurrence per segment and no other change;
  3. writes ../reports/editor-fixes-neptunium.json, .md and -paste.txt.

Usage (from this folder):
  python3 -I build-neptunium-fixes.py ../data/neptunium-targets.json ../reports/editor-fixes-neptunium
"""
import json
import re
import sys

targets_path, out_prefix = sys.argv[1:3]
SETS = ['editor-fixes', 'editor-fixes-never-official', 'editor-fixes-mixed']
OLD, NEW = 'neptún', 'neptúníum'
WORD = re.compile(r'(?<![\w])' + OLD + r'(?![\w])')

fetched = json.load(open(targets_path, encoding='utf-8'))['segments']
drafts = {s: {x['segmentId']: x for x in json.load(open(f'../reports/{s}.json', encoding='utf-8'))['segments']}
          for s in SETS}

out = []
for f in fetched:
    sid = f['segmentId']
    assert 'error' not in f, f
    prior = [drafts[s][sid] for s in SETS if sid in drafts[s]]
    assert len(prior) == 3, (sid, len(prior))
    assert len({p['current'] for p in prior}) == 1 and len({p['proposed'] for p in prior}) == 1, sid
    current, drafted = prior[0]['current'], prior[0]['proposed']
    eff = f['isContent']
    if eff == current:
        state = 'not yet pasted'
    elif eff == drafted:
        state = 'already pasted'
    else:
        sys.exit(f'{sid}: effective text matches neither the draft base nor the drafted text; re-run the drafts')
    assert len(WORD.findall(drafted)) == 1, (sid, WORD.findall(drafted))
    proposed = WORD.sub(NEW, drafted)
    assert proposed.replace(NEW, OLD, 1) == drafted, sid  # exactly one change, nothing else
    out.append({
        'set': 'neptunium', 'chapter': f['chapter'], 'moduleId': f['moduleId'], 'segmentId': sid,
        'current': eff, 'basedOn': 'the identical drafts of measurements 7-9 (editor-fixes-paste.txt)',
        'stateOnProduction': state, 'proposed': proposed, 'change': [OLD, NEW], 'length': len(proposed),
    })


def label(ch):
    return 'App.' if ch == -1 else ch


json.dump({'segments': out}, open(out_prefix + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(out_prefix + '-paste.txt', 'w', encoding='utf-8') as fh:
    for s in out:
        fh.write(f"=== {s['segmentId']} (ch {label(s['chapter'])}) ===\n{s['proposed']}\n\n")
states = sorted({s['stateOnProduction'] for s in out})
md = [
    "# Editors' fix: change 6's worklist, neptún → neptúníum (4 segments)",
    '',
    "Drafted 2026-11-21 from the effective Icelandic on production (read-only, `data/neptunium-targets.json`). These "
    "are the four segments change 6's worklist (book entry *neptunium → neptúníum*) still lists: the periodic-table "
    "image description, once each in ch 2, 18, 19 and the appendices.",
    '',
    f"- **4 segments**, each already drafted in measurements 7-9 (identical in all three sets; state on production: "
    f"{', '.join(states)}).",
    '- **Each new draft starts from that drafted text** and changes exactly one word, `neptún` → `neptúníum` '
    '(asserted per segment).',
    '- **Paste these four blocks instead of the blocks for the same segments in `editor-fixes-paste.txt`**, or after '
    'them: each one contains all of that set\'s fixes as well as this one.',
    '',
    'Full text for pasting: `editor-fixes-neptunium-paste.txt` (4 blocks).',
    '',
]
for s in out:
    md.append(f"- ch {label(s['chapter'])} · `{s['segmentId']}`: `{OLD};` → `{NEW};`")
open(out_prefix + '.md', 'w', encoding='utf-8').write('\n'.join(md) + '\n')
print(f'{len(out)} drafts; states on production: {states} -> {out_prefix}.json/.md/-paste.txt')
