#!/usr/bin/env python3
"""Score the masked blind reading test (plan 2026-10-10 rev. 5, step 1.7). Written and committed
BEFORE the first answer, so neither the rule nor its arithmetic is chosen after the results.

THE DECISION RULE (D1, answered 2026-10-11; also on the page above the first pair):
  A pair is DECISIVE when the answer is "A reads better" or "B reads better". "Equally good" and
  "both wrong" are counted and reported, never decisive.
  Switch the base to the hybrid ONLY IF, over the decisive pairs, BOTH hold:
    1. June wins at least 6 of every 10 (share >= 0.60), and
    2. the lower end of the 95% Wilson interval for June's share is above 0.50.
  Otherwise the base stays the September MT. The rule is asymmetric on purpose: a small June
  advantage does not pay for the carry tool, a superseding decision record and mixed provenance.
  (Clause 2 binds below about 100 decisive pairs, clause 1 above it; MIN_WINS below tabulates it.)

THE MASKING CHECK (plan: "if [USER] guesses well above chance, the masking failed"):
  After each quality answer the page asks "which do you think was September?" (A / B / can't
  tell). Over the pairs where a side was named, if the lower end of the 95% Wilson interval for
  the share named CORRECTLY is above 0.50, the masking failed and the quality result is NOT USED.
  A per-pair guess gives the check the same power as the main result; one guess at the end
  would be a coin flip either way.

AMENDED 2026-10-14, key-blind, after 30 of 150 answers and before any further one: the term
mask missed a class (terms and substance names that no ruling covers, plus four ruled terms the
patterns could not follow; README § 1.7). --exclude FILE names the flagged pairs
(results/2026-10-11/masked-test-term-flags.json). The quality rule is then applied TWICE, to all
answered pairs as registered and to the pairs left after exclusion, and the override fires only
if it fires on BOTH. That is never looser than either reading alone, so it keeps D1's asymmetry
toward September and does not pick a primary after collection began. The masking check stays
over every pair, flagged ones included, because a term leak is exactly what it should see.

Inputs:
  --pairs   results/2026-10-11/masked-test-pairs.json (carries the key's sha256)
  --key     masked-test-key.json (off-repo until the answers are frozen; its sha256 must match)
  --answers the frozen answers: EITHER the page's database dump as it comes, a directory written
            by `ArtifactData list collection=stage1_reading out_dir=D` (the files are
            D/stage1_reading/<pair_id>.json; pass D or D/stage1_reading), OR a JSON list of
            {pair_id, choice: A|B|equal|both_wrong, septGuess: A|B|unsure}, or {"answers": [...]}.
            Reading the dump directly means no mapping step is written after the answers exist.

Usage:
  python3 experiments/terminology-consistency/masked_test_analyse.py --pairs P --key K --answers A
  python3 experiments/terminology-consistency/masked_test_analyse.py --table   # the rule's arithmetic
"""
import argparse, glob, hashlib, json, math, os, sys

Z = 1.959964  # two-sided 95%
SHARE = 0.60
CHOICES = {'A', 'B', 'equal', 'both_wrong'}
GUESSES = {'A', 'B', 'unsure'}


def wilson_low(k, n):
    if n == 0:
        return 0.0
    p = k / n
    d = 1 + Z * Z / n
    c = p + Z * Z / (2 * n)
    h = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n))
    return (c - h) / d


def fires(wins, n):
    return n > 0 and wins / n >= SHARE and wilson_low(wins, n) > 0.5


def min_wins(n):
    return next((k for k in range(n + 1) if fires(k, n)), None)


def load_answers(path):
    if os.path.isdir(path):
        d = os.path.join(path, 'stage1_reading') if os.path.isdir(os.path.join(path, 'stage1_reading')) else path
        out = []
        for f in sorted(glob.glob(os.path.join(d, '*.json'))):
            doc = json.load(open(f))
            doc = doc.get('data', doc) if isinstance(doc.get('data'), dict) else doc
            out.append({**doc, 'pair_id': os.path.splitext(os.path.basename(f))[0]})
        return out
    ans = json.load(open(path))
    return ans['answers'] if isinstance(ans, dict) else ans


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pairs'); ap.add_argument('--key'); ap.add_argument('--answers')
    ap.add_argument('--table', action='store_true')
    ap.add_argument('--exclude', help='flag file; the rule must fire with and without these pairs')
    a = ap.parse_args()
    if a.table:
        for n in (20, 40, 60, 80, 100, 120, 150):
            k = min_wins(n)
            print(f'{n:4d} decisive pairs: June needs {k} wins ({k / n:.0%}), lower bound {wilson_low(k, n):.3f}')
        return
    if not (a.pairs and a.key and a.answers):
        ap.error('--pairs, --key and --answers are required (or --table)')

    pairs = json.load(open(a.pairs))
    key_bytes = open(a.key, 'rb').read()
    sha = hashlib.sha256(key_bytes).hexdigest()
    if sha != pairs['keySha256']:
        sys.exit(f'key sha256 {sha} does not match the committed {pairs["keySha256"]}: refusing')
    key = json.loads(key_bytes)['key']
    ans = load_answers(a.answers)
    ids = {p['pair_id'] for p in pairs['pairs']}

    excl = {f['pair_id'] for f in json.load(open(a.exclude))['flags']} if a.exclude else set()
    tally = {'june': 0, 'sept': 0, 'equal': 0, 'both_wrong': 0}
    tally_x = dict(tally)
    guess = {'right': 0, 'wrong': 0, 'unsure': 0}
    seen, bad = set(), []
    for r in ans:
        pid, ch, g = r.get('pair_id'), r.get('choice'), r.get('septGuess')
        if pid not in ids or ch not in CHOICES or pid in seen:
            bad.append(r); continue
        seen.add(pid)
        june_side = key[pid]['june']
        k = ('june' if ch == june_side else 'sept') if ch in ('A', 'B') else ch
        tally[k] += 1
        if pid not in excl:
            tally_x[k] += 1
        if g in ('A', 'B'):
            sept_side = 'B' if june_side == 'A' else 'A'
            guess['right' if g == sept_side else 'wrong'] += 1
        else:
            guess['unsure'] += 1

    n = tally['june'] + tally['sept']
    nx = tally_x['june'] + tally_x['sept']
    gn = guess['right'] + guess['wrong']
    masking_failed = gn > 0 and wilson_low(guess['right'], gn) > 0.5
    out = {
        'answered': len(seen), 'pairs': len(ids), 'unanswered': len(ids - seen), 'rejectedRows': len(bad),
        'tally': tally, 'decisive': n,
        'juneShare': round(tally['june'] / n, 4) if n else None,
        'juneShareWilsonLow95': round(wilson_low(tally['june'], n), 4) if n else None,
        'minJuneWinsForThisN': min_wins(n) if n else None,
        **({'excluded': len(excl), 'tallyAfterExclusion': tally_x, 'decisiveAfterExclusion': nx,
            'juneShareAfterExclusion': round(tally_x['june'] / nx, 4) if nx else None,
            'juneShareWilsonLow95AfterExclusion': round(wilson_low(tally_x['june'], nx), 4) if nx else None,
            'minJuneWinsAfterExclusion': min_wins(nx) if nx else None,
            'firesAll': fires(tally['june'], n), 'firesAfterExclusion': fires(tally_x['june'], nx)}
           if a.exclude else {}),
        'septGuess': guess, 'guessCorrectShare': round(guess['right'] / gn, 4) if gn else None,
        'guessWilsonLow95': round(wilson_low(guess['right'], gn), 4) if gn else None,
        'maskingFailed': masking_failed,
    }
    if masking_failed:
        out['verdict'] = 'NOT USED: the vintages were recognisable (masking failed). Base stays September by default.'
    elif fires(tally['june'], n) and (not a.exclude or fires(tally_x['june'], nx)):
        out['verdict'] = 'OVERRIDE FIRES: June reads clearly better. Base = hybrid (plan step 2.1).'
    else:
        out['verdict'] = 'NO OVERRIDE: base stays the September MT.'
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
