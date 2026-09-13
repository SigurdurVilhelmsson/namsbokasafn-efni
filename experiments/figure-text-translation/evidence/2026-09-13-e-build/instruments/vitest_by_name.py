#!/usr/bin/env python3
"""Diff a vitest JSON report's FAILING set by name against a baseline list.

    npx vitest run --reporter=json --outputFile=<report.json>
    python3 vitest_by_name.py <report.json> <baseline-names.txt>   # prints NEWLY RED / NEWLY GREEN

A baseline file is one "file :: full test name" per line; write one with --write-baseline.
Counts alone cannot see a swap (one fixed, another broken): compare the SETS.
A file that fails with no assertion results (load error, timeout) is listed separately,
because it contributes no names and would otherwise read as green.
"""
import json, sys

def failing(report):
    d = json.load(open(report))
    names = sorted(tr['name'].split('namsbokasafn-efni/')[-1] + ' :: ' + a['fullName']
                   for tr in d['testResults'] for a in tr['assertionResults'] if a['status'] == 'failed')
    noassert = [tr['name'].split('namsbokasafn-efni/')[-1] for tr in d['testResults']
                if tr['status'] != 'passed' and not tr['assertionResults']]
    return names, noassert

if __name__ == '__main__':
    now, noassert = failing(sys.argv[1])
    if '--write-baseline' in sys.argv:
        open(sys.argv[2], 'w').write('\n'.join(now) + '\n'); print('wrote', len(now)); sys.exit(0)
    base = [l for l in open(sys.argv[2]).read().splitlines() if l]
    print('failing now:', len(now), 'baseline:', len(base))
    print('NEWLY RED:'); [print('  ', x) for x in sorted(set(now) - set(base))]
    print('NEWLY GREEN:'); [print('  ', x) for x in sorted(set(base) - set(now))]
    print('FILES WITH ANY DELTA:', sorted({x.split(' :: ')[0] for x in set(now) ^ set(base)}))
    print('FILES FAILED WITH NO ASSERTIONS (load/timeout):', noassert)
