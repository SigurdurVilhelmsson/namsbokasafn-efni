#!/usr/bin/env python3
"""Run the 2026-11 full AI term pass chapter by chapter, by the register's procedure.

For each chapter from --from onwards, in book order (ch10 left out):
  1. record the chapter about to start in driver-state.txt;
  2. run `node tools/ai-review/term-pass.js run --chapter <ch> --mode batch --max-tokens 64000
     --yes`, output to <ch>.log;
  3. check the result strictly (below); take coverage from a dry `apply` (no --write; its report
     goes to apply-dry-<ch>.md); run cap_projection.py twice; append a row to progress.tsv;
  4. stop (exit 2, reason in driver-state.txt) on anything outside the rules.

The rules. The runner's result line: exactly one `<ch>: run <id> complete, USD x (usable U of N
sent; truncated T, refusal 0, errored 0, not sent 0)` with U + T = N = the planned request count;
a ledger line with openUsd 0 and no reservations; no `stopped-at-cap`. The dry apply: it covers
the N planned requests; its only request problem is `response-truncated`, T times; INCOMPLETE =
N - (requests apply can use) is at most 10% of N, and the runner exited 2 exactly when INCOMPLETE
is above 0. An answer apply cannot use for any reason other than a cut-off (a segment skipped)
stops the driver unless TOLERATE_SKIPPED is set. More than 5 INCOMPLETE answers across the
driver's run also stop it. Both projections must exit 0 and see the chapter; k64 must be at least
1 at both ratios. The driver never retries, never changes effort, never edits or commits
anything.

Rulings it encodes ([USER], 2026-11-01): xhigh at --max-tokens 64000 from ch08; cut-off answers
are recorded and re-sent after the run; so are answers that skip segments (TOLERATE_SKIPPED).

usage: driver.py --from chNN            run from that chapter to the end
       driver.py --check-log FILE CH    print the runner-log verdict on one finished log (no spend)
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys
from datetime import datetime, timezone

REPO = pathlib.Path('/home/siggi/dev/repos/namsbokasafn-efni')
HERE = pathlib.Path.home() / '.cache/namsbokasafn-audit/full-run-2026-11'
ORDER = ['ch00', 'ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch11',
         'ch12', 'ch13', 'ch14', 'ch15', 'ch16', 'ch17', 'ch18', 'ch19', 'ch20', 'ch21', 'appendices']
SINCE = '2026-11-01T18:34:37Z'
PRIOR_RATIO = '0.1853'
PROJ = 'experiments/ai-review-pilot/full-run-cap-2026-11-01/cap_projection.py'
MAX_TOKENS = '64000'
# cap_projection.py plans reservations at 32,000, so its k overstates the margin here. k64
# reserves at the 64,000 worst case and settles at the observed ratio of the 32,000 worst case
# (max_tokens is a limit the model does not see, so an answer's cost does not depend on it).
W64 = HERE / 'worst-64000.json'
X_SUMMARY = REPO / 'experiments/ai-review-pilot/prompt-freeze-2026-11-01/plan-summary.json'
LEDGER = REPO / 'books/efnafraedi-2e/ai-review/ledger.jsonl'
CAP = 100.0
INCOMPLETE_CHAPTER_FRACTION = 0.10
INCOMPLETE_RUN_CEILING = 5
# [USER] 2026-11-01, after ch08: an answer apply cannot use for another reason (segments
# skipped) is recorded, the run continues, and it is re-sent after the run, within the ceilings.
TOLERATE_SKIPPED = True
STATE = HERE / 'driver-state.txt'
TSV = HERE / 'progress.tsv'
RESULT = re.compile(
    r'^(?P<ch>\S+): run (?P<run>\S+) complete, USD (?P<usd>[0-9.]+) \(usable (?P<u>\d+) of '
    r'(?P<s>\d+) sent; truncated (?P<t>\d+), refusal (?P<r>\d+), errored (?P<e>\d+), '
    r'not sent (?P<ns>\d+)\)$', re.M)
COVERAGE = re.compile(r'^coverage: (\d+) of (\d+) planned requests usable'
                      r'(?: \((\d+) not reviewed; (\d+) presented segments unanswered\))?$', re.M)


def now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def state(msg):
    STATE.write_text(f'{now()} {msg}\n', encoding='utf-8')
    print(f'{now()} {msg}', flush=True)


def log_verdict(text, ch, exit_code):
    """The runner log alone: (None, info) if it passes, or (reason, info)."""
    info = {}
    if exit_code not in (0, 2):
        return f'runner exit {exit_code}', info
    if 'stopped-at-cap' in text:
        return 'stopped-at-cap in output', info
    plan = re.search(rf'^{re.escape(ch)}\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s', text, re.M)
    if not plan:
        return 'no plan line', info
    info['planned'] = int(plan.group(1))
    hits = [m for m in RESULT.finditer(text) if m.group('ch') == ch]
    if len(hits) != 1:
        return f'{len(hits)} result lines (want exactly 1)', info
    m = hits[0]
    info.update(run=m.group('run'), usd=float(m.group('usd')), usable=int(m.group('u')),
                sent=int(m.group('s')), truncated=int(m.group('t')), exit=exit_code)
    t = info['truncated']
    bad = {k: int(m.group(k)) for k in ('r', 'e', 'ns') if int(m.group(k)) != 0}
    if bad:
        return f'non-zero refusal/errored/not-sent: {bad}', info
    if not (info['usable'] + t == info['sent'] == info['planned']):
        return (f"usable {info['usable']} + truncated {t} / sent {info['sent']} / "
                f"planned {info['planned']}"), info
    led = re.findall(r'^ledger: (\{.*\})$', text, re.M)
    if len(led) != 1:
        return f'{len(led)} ledger lines (want exactly 1)', info
    ledger = json.loads(led[0])
    info['settled'] = ledger.get('settledUsd')
    if ledger.get('openUsd') != 0 or ledger.get('reservations') != {}:
        return f'ledger not settled: {led[0]}', info
    return None, info


def coverage_verdict(stdout, ch, info, tolerate_skipped=None):
    """The dry apply's output: (None, cov) if it passes, or (reason, cov)."""
    tolerate = TOLERATE_SKIPPED if tolerate_skipped is None else tolerate_skipped
    cov = {}
    if 'dry run: nothing written' not in stdout:
        return 'dry apply did not report a dry run', cov
    m = re.search(rf'^{re.escape(ch)}: (\{{.*\}})$', stdout, re.M)
    c = COVERAGE.search(stdout)
    if not m or not c:
        return 'dry apply output not understood', cov
    counts = json.loads(m.group(1))
    cov.update(usableApply=int(c.group(1)), requests=int(c.group(2)),
               segmentsUnanswered=int(c.group(4) or 0),
               requestProblems=counts.get('requestProblems', {}))
    planned, t = info['planned'], info['truncated']
    if cov['requests'] != planned:
        return f"dry apply covers {cov['requests']} requests, planned {planned}", cov
    problems = cov['requestProblems']
    if set(problems) - {'response-truncated'} or problems.get('response-truncated', 0) != t:
        return f'request problems {problems} (truncated {t})', cov
    incomplete = cov['incomplete'] = planned - cov['usableApply']
    skipped = cov['skipped'] = incomplete - t
    if skipped < 0:
        return f'apply uses {cov["usableApply"]} of {planned} but {t} were cut off', cov
    if info['exit'] != (2 if incomplete else 0):
        return f"runner exit {info['exit']} with {incomplete} answers apply cannot use", cov
    if skipped and not tolerate:
        return (f'{skipped} answer(s) apply cannot use for a reason other than a cut-off '
                f"({cov['segmentsUnanswered']} segments unanswered): pause for [USER]"), cov
    if incomplete > INCOMPLETE_CHAPTER_FRACTION * planned:
        return f'{incomplete} of {planned} answers incomplete, above 10%', cov
    return None, cov


def dry_apply(ch, run):
    p = subprocess.run(['node', 'tools/ai-review/term-pass.js', 'apply', '--chapter', ch, '--run', run,
                        '--report', str(HERE / f'apply-dry-{ch}.md')],
                       cwd=REPO, capture_output=True, text=True)
    if p.returncode != 0:
        return None, f'dry apply exit {p.returncode}: {p.stderr.strip()[-300:]}'
    return p.stdout, None


def projection(extra):
    p = subprocess.run(['python3', '-I', PROJ, '--order', ','.join(ORDER), '--since', SINCE, *extra],
                       cwd=REPO, capture_output=True, text=True)
    if p.returncode != 0:
        return None, f'projection exit {p.returncode}: {p.stderr.strip()[-300:]}'
    return json.loads(p.stdout), None


def worst(path, key):
    d = json.loads(path.read_text(encoding='utf-8'))
    if key == 'summary':
        return {c['chapterDir']: c['estimate']['worstCaseUsd']['batch'] for c in d['chapters']}
    return d['worstBatchUsd']


def ledger_settled():
    total = 0.0
    for line in LEDGER.read_text(encoding='utf-8').splitlines():
        if line:
            e = json.loads(line)
            if e['type'] == 'settle':
                total += e['usd']
    return total


def k64(ratio, res_x, settled, remaining, w32, w64):
    """The largest cost multiple at which the cap refuses no remaining chapter at 64,000."""
    def refused(k):
        spent = settled
        for c in remaining:
            if spent + w64[c] * res_x > CAP:
                return c
            spent += k * ratio * w32[c] * res_x
        return None
    lo, hi = 0.0, 20.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if refused(mid) is None else (lo, mid)
    return round(lo, 2), refused(lo * 1.001)


def k_verdict(ka, kb):
    if min(ka, kb) < 1:
        return f'k64 below 1 (observed ratio {ka}, at {PRIOR_RATIO} {kb}): pause for [USER]'
    return None


def check_chapter(ch, text, exit_code):
    reason, info = log_verdict(text, ch, exit_code)
    if reason:
        return reason, info, None
    out, err = dry_apply(ch, info['run'])
    if err:
        return err, info, None
    reason, cov = coverage_verdict(out, ch, info)
    info.update(cov)
    proc, err = projection([])
    if err:
        return reason or err, info, None
    prior, err = projection(['--ratio-x', PRIOR_RATIO])
    if err:
        return reason or err, info, None
    done = set(proc.get('fullRunRuns', {}).values())
    if ch not in done:
        return reason or f'projection does not see {ch} among the full run\'s runs', info, None
    remaining = [c for c in ORDER if c not in done]
    w32, w64 = worst(X_SUMMARY, 'summary'), worst(W64, 'w64')
    settled, res_x = ledger_settled(), proc['factors']['resX']
    ka, ka_ch = k64(proc['factors']['ratioX'], res_x, settled, remaining, w32, w64)
    kb, _ = k64(float(PRIOR_RATIO), res_x, settled, remaining, w32, w64)
    row = dict(info, ratio=proc['factors']['ratioX'], k=proc['firstRefusal']['given']['k'],
               kRefused=proc['firstRefusal']['given']['refusedChapter'],
               kHigh=proc['firstRefusal']['givenWithHighFallback']['k'],
               k0=prior['firstRefusal']['given']['k'], headroom=proc['headroom'],
               expected=proc['expectedSpend'], k64=ka, k64Refused=ka_ch, k64prior=kb)
    return reason or k_verdict(ka, kb), info, row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='start')
    ap.add_argument('--check-log', nargs=2, metavar=('FILE', 'CH'))
    a = ap.parse_args()
    if a.check_log:
        text = pathlib.Path(a.check_log[0]).read_text(encoding='utf-8')
        code = re.findall(r'^EXIT=(\d+)$', text, re.M)
        reason, info = log_verdict(text, a.check_log[1], int(code[-1]) if code else -1)
        print('STOP' if reason else 'continue', reason or '', json.dumps(info))
        sys.exit(2 if reason else 0)
    if a.start not in ORDER:
        sys.exit(f'--from must be one of {ORDER}')
    if not TSV.exists():
        sys.exit(f'{TSV} is missing; it holds the earlier chapters')
    run_incomplete = 0
    for ch in ORDER[ORDER.index(a.start):]:
        state(f'STARTING {ch} (max-tokens {MAX_TOKENS}, tolerate skipped {TOLERATE_SKIPPED})')
        log = HERE / f'{ch}.log'
        with log.open('w', encoding='utf-8') as fh:
            p = subprocess.run(['node', 'tools/ai-review/term-pass.js', 'run', '--chapter', ch,
                                '--mode', 'batch', '--max-tokens', MAX_TOKENS, '--yes'],
                               cwd=REPO, stdout=fh, stderr=subprocess.STDOUT)
            fh.write(f'EXIT={p.returncode}\n')
        reason, info, row = check_chapter(ch, log.read_text(encoding='utf-8'), p.returncode)
        if row:
            with TSV.open('a', encoding='utf-8') as fh:
                fh.write('\t'.join(str(x) for x in (
                    now(), ch, row['run'], row['planned'], row['usable'], row['usd'],
                    row['settled'], row['ratio'], row['k'], row['kRefused'], row['kHigh'],
                    row['k0'], row['headroom'], row['expected'], row['truncated'], MAX_TOKENS,
                    row['k64'], row['k64prior'], row.get('incomplete', ''),
                    row.get('segmentsUnanswered', ''))) + '\n')
        run_incomplete += info.get('incomplete', 0)
        if not reason and run_incomplete > INCOMPLETE_RUN_CEILING:
            reason = (f'{run_incomplete} incomplete answers since the driver started, '
                      f'above {INCOMPLETE_RUN_CEILING}')
        if reason:
            state(f'STOPPED after {ch}: {reason} | {json.dumps(info)}')
            sys.exit(2)
        state(f'DONE {ch} ({info["run"]}, USD {info["usd"]}, incomplete {info["incomplete"]}, '
              f'k64 {row["k64"]} / {row["k64prior"]})')
    state('FINISHED: every chapter in the order ran')


main()
