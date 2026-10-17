#!/usr/bin/env python3
"""Freeze plan 1.6's input: prod's pending chemistry edit rows, classified against the
current MT, with the editors' names removed.

Input: the JSON that server/scripts/read-pending-edits.js prints (it holds editor names, so it
stays off the repo). Output: results/<date>/pending-edits-<date>.json, committed.

Each row is classified against the segment's text in books/<book>/02-mt-output at HEAD:
  - already-present: the current MT equals the editor's text;
  - clean: the current MT equals the text the editor started from (original_content), so the
    edit applies to the text it was made on;
  - base-changed: neither. The edit was made on an older MT. ⚠️ applyApprovedEdits does not
    compare original_content with the current text, so approving such a row overwrites.
  - segment-gone: the segment id no longer exists.
Comparison is exact after stripping leading and trailing whitespace. A whitespace-normalised
equality is recorded alongside, so a class that only whitespace decided would show.

Usage: freeze_pending_edits.py <prod-dump.json> <out.json>
"""
import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SEG = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')  # the permissive recogniser parseSegments uses


def segments(path):
    parts = SEG.split(open(path, encoding='utf-8').read())
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts), 2)}


def module_file(book, mod, tree, suffix):
    found = glob.glob(os.path.join(ROOT, 'books', book, tree, '*', f'{mod}-segments.{suffix}.md'))
    return found[0] if found else None


def main():
    dump, out = sys.argv[1], sys.argv[2]
    d = json.load(open(dump, encoding='utf-8'))
    book = d['book']
    editors = {}
    cache = {}
    ws = lambda s: re.sub(r'\s+', ' ', s or '').strip()
    rows = []
    for r in d['rows']:
        mod = r['module_id']
        if mod not in cache:
            mt, en = module_file(book, mod, '02-mt-output', 'is'), module_file(book, mod, '02-for-mt', 'en')
            cache[mod] = (segments(mt) if mt else {}, segments(en) if en else {})
        mt, en = cache[mod]
        cur = mt.get(r['segment_id'])
        orig, edit = (r['original_content'] or '').strip(), (r['edited_content'] or '').strip()
        if cur is None:
            cls = 'segment-gone'
        elif cur == edit:
            cls = 'already-present'
        elif cur == orig:
            cls = 'clean'
        else:
            cls = 'base-changed'
        editor = editors.setdefault(r['editor_id'], f'editor {len(editors) + 1}')
        rows.append({
            'id': r['id'], 'chapter': r['chapter'], 'module': mod, 'segment': r['segment_id'],
            'created': r['created_at'], 'editor': editor, 'editorNote': r['editor_note'],
            'class': cls, 'wsNormalisedOriginalEqualsCurrent': cur is not None and ws(orig) == ws(cur),
            'en': en.get(r['segment_id']), 'original': orig, 'edited': edit, 'currentMt': cur,
        })
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    by = {}
    for x in rows:
        by[x['class']] = by.get(x['class'], 0) + 1
    res = {
        'about': 'Plan 2026-10-10 item 1.6: prod pending segment_edits rows for one book, classified '
                 'against the current MT at repoHead. Editor names replaced by stable labels.',
        'book': book, 'readAt': d['readAt'], 'repoHead': head, 'statusCounts': d['counts'],
        'otherRowsOnTheseSegments': len(d['others']), 'byClass': by, 'rows': rows,
    }
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'{len(rows)} pending rows -> {by}; other rows on these segments: {len(d["others"])} -> {out}')


if __name__ == '__main__':
    main()
