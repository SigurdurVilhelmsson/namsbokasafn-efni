#!/usr/bin/env python3
"""Will the AI term pass's full run fit under the runner's USD 100 cap? (0 USD, no network)

The model, per chapter, run one chapter at a time in batch mode:
- the reservation a chapter's batch makes = its plan worst case x a reservation factor (the
  runtime counts tokens and adds its margin, so it reserves a little more than `plan` estimates);
- the cost a chapter settles at = its reservation x a cost ratio (actual / reserved);
- the cap refuses a chapter when settled spend + that chapter's reservation would exceed the cap.

Both factors come from the 2026-11-01 ch10 re-run in the ledger (one run per effort), unless
--ratio-x overrides the cost ratio with the one the full run itself has shown so far.

It reports the expected spend and the multiple of it (k) at which the cap would first refuse a
chapter: in the given order, in two reference orders, and under the fallback the 2026-11-01 cap
rule sets (remaining chapters at high with 16000 output tokens once an xhigh chapter is refused).

Usage (from the repository root):
  python3 -I experiments/ai-review-pilot/full-run-cap-2026-11-01/cap_projection.py [--out FILE]
      [--order ch01,ch02,...] [--done ch01,...] [--ratio-x R]
--done names chapters the full run has already settled: their cost is in the ledger's settled
total, so they are dropped from what is left to run.
"""
import argparse
import json
import pathlib

REPO = pathlib.Path(__file__).resolve().parents[3]
X_SUMMARY = REPO / 'experiments/ai-review-pilot/prompt-freeze-2026-11-01/plan-summary.json'
H_SUMMARY = REPO / 'experiments/ai-review-pilot/full-run-cap-2026-11-01/plan-summary-high-16000.json'
LEDGER = REPO / 'books/efnafraedi-2e/ai-review/ledger.jsonl'
CAP = 100.0
# The 2026-11-01 ch10 re-run, one batch run per effort. Its reservations are compared with ch10's
# worst case in the plan summaries, the same plans every other chapter's reservation is scaled from.
RUN_X = '20261101T101529Z-137d40e8'   # xhigh, --max-tokens 32000
RUN_H = '20261101T101143Z-0a3bb55e'   # high, --max-tokens 16000


def per_chapter(path):
    s = json.loads(path.read_text(encoding='utf-8'))
    return {c['chapterDir']: c['estimate']['worstCaseUsd']['batch'] for c in s['chapters']}


def ledger():
    sums, settled = {}, 0.0
    for line in LEDGER.read_text(encoding='utf-8').splitlines():
        if not line:
            continue
        e = json.loads(line)
        b = sums.setdefault(e['runId'], {'reserve': 0.0, 'settle': 0.0})
        if e['type'] in b:
            b[e['type']] += e['usd']
        if e['type'] == 'settle':
            settled += e['usd']
    return sums, settled


def simulate(order, worst_x, worst_h, f, settled, k, fallback):
    """Return (first chapter the cap refuses or None, chapter the run switched to high at or None)."""
    spent, mode, switched = settled, 'xhigh', None
    for ch in order:
        rx = worst_x[ch] * f['resX']
        if mode == 'xhigh' and spent + rx <= CAP:
            spent += k * f['ratioX'] * rx
            continue
        if not fallback:
            return ch, None
        mode, switched = 'high', switched or ch
        rh = worst_h[ch] * f['resH']
        if spent + rh > CAP:
            return ch, switched
        spent += k * f['ratioH'] * rh
    return None, switched


def kstar(order, worst_x, worst_h, f, settled, fallback):
    lo, hi = 0.0, 20.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if simulate(order, worst_x, worst_h, f, settled, mid, fallback)[0] is None:
            lo = mid
        else:
            hi = mid
    return lo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out')
    ap.add_argument('--order')
    ap.add_argument('--done', default='')
    ap.add_argument('--ratio-x', type=float)
    a = ap.parse_args()
    worst_x, worst_h = per_chapter(X_SUMMARY), per_chapter(H_SUMMARY)
    sums, settled = ledger()
    f = {
        'resX': sums[RUN_X]['reserve'] / worst_x['ch10'],
        'ratioX': sums[RUN_X]['settle'] / sums[RUN_X]['reserve'],
        'resH': sums[RUN_H]['reserve'] / worst_h['ch10'],
        'ratioH': sums[RUN_H]['settle'] / sums[RUN_H]['reserve'],
    }
    if a.ratio_x is not None:
        f['ratioX'] = a.ratio_x
    done = {c for c in a.done.split(',') if c}
    order = [c for c in (a.order.split(',') if a.order else list(worst_x)) if c not in done]
    unknown = [c for c in order + sorted(done) if c not in worst_x]
    if unknown:
        raise SystemExit(f'unknown chapters: {unknown}')
    expected = sum(worst_x[c] * f['resX'] * f['ratioX'] for c in order)
    orders = {
        'given': order,
        'largestFirst': sorted(order, key=lambda c: -worst_x[c]),
        'smallestFirst': sorted(order, key=lambda c: worst_x[c]),
    }
    result = {
        'cap': CAP,
        'settledBefore': round(settled, 2),
        'headroom': round(CAP - settled, 2),
        'factors': {k: round(v, 4) for k, v in f.items()},
        'chaptersLeft': len(order),
        'expectedSpend': round(expected, 2),
        'headroomAfterExpected': round(CAP - settled - expected, 2),
        'firstRefusal': {},
    }
    for name, o in orders.items():
        for fb in (False, True):
            k = kstar(o, worst_x, worst_h, f, settled, fb)
            refused, switched = simulate(o, worst_x, worst_h, f, settled, k * 1.001, fb)
            result['firstRefusal'][f"{name}{'WithHighFallback' if fb else ''}"] = {
                'k': round(k, 2),
                'spendAtK': round(k * expected, 1),
                'refusedChapter': refused,
                'switchedToHighAt': switched,
            }
    text = json.dumps(result, indent=1) + '\n'
    if a.out:
        pathlib.Path(a.out).write_text(text, encoding='utf-8')
    print(text, end='')


main()
