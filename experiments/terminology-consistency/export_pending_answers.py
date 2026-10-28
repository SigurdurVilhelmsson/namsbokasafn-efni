#!/usr/bin/env python3
"""Freeze [USER]'s answers to the stage 1 page's *Pending edits* tab (plan 2026-10-10, item 1.6).

The page (https://claude.ai/artifact/DgVvKPCVcWMaHsM9NVtF3w, Version 6, built at 526bd4cee) asked
[USER] to rule apply or drop on the 10 `clean` rows of prod's pending chemistry edits: the rows
whose `original_content` equals the current September MT, so the edit applies to the text it was
made on. Answers live in the page's `stage1_pending` collection as `{choice: apply|drop, note}`,
keyed `e<edit id>`. That database is not durable enough to cite, so this script writes them to a
dated file next to the input they were given against.

Checks (any failure exits 1 and writes nothing):
  - the answered ids are EXACTLY the input's `clean` rows: none missing, none extra;
  - every choice is `apply` or `drop`;
  - every answer has a recorded db version.

The 28 rows the page did not ask about are listed with their class, so the file accounts for all
38 rows, but their handling is not decided here:
  - `already-present` (5): the September MT produced the editor's text;
  - `base-changed` (23): [USER] ruled 2026-10-17 that each becomes an editor note on its
    September segment (plan 2.2), never an applied edit.

Usage:
  python3 -I export_pending_answers.py <dump-dir> <versions.json> <out.json>
<dump-dir> is an ArtifactData `out_dir` holding stage1_pending/*.json; <versions.json> maps doc
id -> the version the listing reported (the dump files do not carry it).
"""
import glob
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PENDING = os.path.join(HERE, 'results', '2026-10-17', 'pending-edits-2026-10-17.json')
PAGE = {
    'url': 'https://claude.ai/artifact/DgVvKPCVcWMaHsM9NVtF3w',
    'collection': 'stage1_pending',
    'version': 6,
    'builtAt': '526bd4cee',
    'generator': 'experiments/terminology-consistency/stage1_page.py',
}


def sha256_file(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__.split('Usage:')[1].strip())
    dump, vers_path, out = sys.argv[1:]
    src = json.load(open(PENDING, encoding='utf-8'))
    versions = json.load(open(vers_path, encoding='utf-8'))
    rows = {f"e{r['id']}": r for r in src['rows']}
    asked = sorted(k for k, r in rows.items() if r['class'] == 'clean')

    saved = {}
    for f in sorted(glob.glob(os.path.join(dump, 'stage1_pending', '*.json'))):
        saved[os.path.splitext(os.path.basename(f))[0]] = json.load(open(f, encoding='utf-8'))

    problems = []
    missing, extra = sorted(set(asked) - set(saved)), sorted(set(saved) - set(asked))
    if missing:
        problems.append(f'not answered: {missing}')
    if extra:
        problems.append(f'answers for rows the page did not ask about: {extra}')
    for k, a in saved.items():
        if a.get('choice') not in ('apply', 'drop'):
            problems.append(f'{k}: choice {a.get("choice")!r} is not apply or drop')
        if k not in versions:
            problems.append(f'{k}: no db version recorded')
    if problems:
        sys.exit('refused, nothing written:\n  ' + '\n  '.join(problems))

    answers = []
    for k in asked:
        r, a = rows[k], saved[k]
        answers.append({
            'id': r['id'], 'docId': k, 'chapter': r['chapter'], 'module': r['module'],
            'segment': r['segment'], 'choice': a['choice'], 'note': a.get('note') or '',
            'savedAt': a.get('savedAt'), 'version': versions[k],
        })
    tally = {c: sum(1 for a in answers if a['choice'] == c) for c in ('apply', 'drop')}
    unasked = {c: sorted(r['id'] for r in src['rows'] if r['class'] == c)
               for c in sorted({r['class'] for r in src['rows']} - {'clean'})}
    res = {
        'about': ("[USER]'s rulings on the 10 clean pending chemistry edits (plan 2026-10-10, item 1.6), "
                  'frozen from a dump of the stage 1 page database by '
                  'experiments/terminology-consistency/export_pending_answers.py. A ruling is recorded '
                  'here; it reaches prod only through a committed script that [USER] runs, and "apply" '
                  'means a status change, never running applyApprovedEdits.'),
        'page': PAGE,
        'input': {'path': os.path.relpath(PENDING, os.path.join(HERE, '..', '..')),
                  'sha256': sha256_file(PENDING), 'readAt': src['readAt'], 'repoHead': src['repoHead']},
        'tally': tally,
        'answers': answers,
        'notAsked': {c: {'ids': ids, 'n': len(ids)} for c, ids in unasked.items()},
        'total': len(src['rows']),
    }
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'{len(answers)} answers {tally}; not asked: '
          f'{ {c: v["n"] for c, v in res["notAsked"].items()} }; total {res["total"]} -> {out}')


if __name__ == '__main__':
    main()
