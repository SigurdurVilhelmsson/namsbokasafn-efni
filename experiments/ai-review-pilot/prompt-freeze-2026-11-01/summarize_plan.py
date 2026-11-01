#!/usr/bin/env python3
"""Summarise a term-pass `plan --all` output into what the freeze record cites.

The full plan holds every request body (about 28 MB), too large to commit. This keeps:
- the inputs the plan read (prompt and ruling set, by path and sha256) and its parameters;
- per chapter: counts, the estimate, and each request's key with the sha256 of its body
  (json.dumps with sort_keys and compact separators, UTF-8);
- the totals.

Usage: python3 -I summarize_plan.py <plan.json> <summary.json>
"""
import hashlib
import json
import sys

src, dst = sys.argv[1:3]
plan = json.load(open(src, encoding='utf-8'))


def digest(body):
    canon = json.dumps(body, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(canon.encode('utf-8')).hexdigest()


summary = {
    'about': 'term-pass plan --all at the prompt freeze, summarised by summarize_plan.py (see README.md)',
    'book': plan['book'],
    'prompt': plan['prompt'],
    'rulingSet': plan['rulingSet'],
    'params': plan['params'],
    'totals': plan['totals'],
    'chapters': [
        {
            'chapterDir': c['chapterDir'],
            'counts': c['counts'],
            'estimate': c['estimate'],
            'requests': [{'key': r['key'], 'bodySha256': digest(r['body'])} for r in c['requests']],
        }
        for c in plan['chapters']
    ],
}
n = sum(len(c['requests']) for c in summary['chapters'])
if n != plan['totals']['requests']:
    sys.exit(f'refusing: {n} request digests, totals say {plan["totals"]["requests"]}')
with open(dst, 'w', encoding='utf-8') as f:
    f.write(json.dumps(summary, ensure_ascii=False, indent=1) + '\n')
print(f'{dst}: {len(summary["chapters"])} chapters, {n} request digests')
