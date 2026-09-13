#!/usr/bin/env python3
"""Compare the failing test NAMES of two GitHub Actions `test` job logs (vitest default reporter).

    gh api repos/<owner>/<repo>/actions/jobs/<job-id>/logs > main.log   # e.g. main's latest test job
    gh api repos/<owner>/<repo>/actions/jobs/<job-id>/logs > pr.log     # the PR's test job
    wc -c main.log pr.log          # CONTROL: a 0-byte log parses to an empty set and "matches" nothing
    python3 ci_failing_by_name.py main.log pr.log

Used 2026-09-13 to apply [USER]'s rule "if the reds match main, merge anyway" to PR #464: both logs
~1.2 MB, 36 = 36 names, none newly red or green. Equal summary counts are NOT that check.
"""
import re, sys
ANSI = re.compile(r'\x1b\[[0-9;]*m')

def fails(path):
    out = set()
    for line in open(path, encoding='utf-8', errors='replace'):
        line = re.sub(r'^\S+Z ', '', ANSI.sub('', line)).rstrip()
        m = re.match(r'\s*FAIL\s+(\S+\.test\.[jt]s)\s+>\s+(.*)$', line)
        if m:
            out.add(m.group(1) + ' > ' + re.sub(r'\s+\d+(\.\d+)?m?s$', '', m.group(2)))
    return out

a, b = fails(sys.argv[1]), fails(sys.argv[2])
print('first:', len(a), '| second:', len(b))
print('only in second (newly red):', sorted(b - a))
print('only in first (newly green):', sorted(a - b))
print('SETS IDENTICAL' if a == b and a else 'SETS DIFFER OR EMPTY')
