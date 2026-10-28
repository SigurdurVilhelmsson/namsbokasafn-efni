#!/usr/bin/env python3
"""Classify each taught term from measure.py's output. No measuring happens here.

For a term t, with prose occurrences n_old / n_new:
  oldKeep_old = share of OLD prose carrying K_old   (how the July text rendered t)
  oldKeep_new = share of NEW prose carrying K_old   (did the new text keep that word?)
  newK_new    = share of NEW prose carrying K_new   (does the new text agree with its own key-terms entry?)

Classes (evaluated in order; MIN_N prose occurrences on both sides, else LOW-N):
  RULING-BROKEN-NEW / -BOTH  an EXACT house-style ruling (server/lib/houseStyleTerms.js) covers
                 t, and the new key-terms entry does not carry it or < RULED of the new prose does;
                 -NEW when the July text complied, -BOTH when it did not either
  RULED-APPLIED  an exact ruling covers t, the new text follows it and the July text did not:
                 the change is the INTENDED effect of a ruling, not drift
  (a ruling that only PARTLY matches, e.g. `cell -> ker` inside `unit cell`, is shown but never
   classifies: several rulings are scoped to one sense or one chapter.)
  TEXT-RENAMED   the new prose stopped using the July word (oldKeep_new < oldKeep_old - DROP, the
                 July word established: oldKeep_old >= ESTABLISHED) but switched CONSISTENTLY to the
                 new key-terms entry (newK_new >= RULED): a different word, not an inconsistency
  TEXT-DRIFT     the same drop, without a consistent replacement: the new text is LESS consistent
  KEYTERM-SPLIT  the key-terms entry changed, the new prose kept the July word, and it does not
                 carry the new entry: the new key-terms page disagrees with its own chapter text
  KEYTERM-FIXED  the key-terms entry changed and the new prose now agrees with it better than
                 the July prose agreed with the July entry
  KEYTERM-OTHER  the key-terms entry changed in some other pattern (read the rows)
  STABLE         the entry did not change and agreement did not drop by DROP
  TEXT-GAIN      the entry did not change and agreement rose by DROP
These are thresholds on a stem matcher, not judgements of correctness: every row a
reader acts on should be read in measure.py's `misses` examples first.
"""
import json, sys
from collections import Counter, defaultdict

MIN_N, DROP, ESTABLISHED, RULED = 3, 0.2, 0.6, 0.8


def share(a, b):
    return a / b if b else None


def classify(t):
    o, n = t['old'], t['new']
    ru = t.get('ruling')
    if ru and ru['exact']:
        r_new = share(n['ruled'], n['prose'])
        r_old = share(o['ruled'], o['prose'])
        rm = {'ruled_old': r_old and round(r_old, 2), 'ruled_new': r_new and round(r_new, 2)}
        if not n['keyTermRuled'] or (n['prose'] >= MIN_N and r_new < RULED):
            old_ok = o['keyTermRuled'] and (o['prose'] < MIN_N or r_old >= RULED)
            return ('RULING-BROKEN-NEW' if old_ok else 'RULING-BROKEN-BOTH'), rm
        if not o['keyTermRuled'] or (o['prose'] >= MIN_N and r_old < RULED):
            return 'RULED-APPLIED', rm
    if o['prose'] < MIN_N or n['prose'] < MIN_N:
        return 'LOW-N', {}
    changed = t['renderingChanged']
    ok_old = share(o['own'], o['prose'])
    ok_new_keep = share(n['other'] if changed else n['own'], n['prose'])
    nk_new = share(n['own'], n['prose'])
    m = {'oldKeep_old': round(ok_old, 2), 'oldKeep_new': round(ok_new_keep, 2), 'newK_new': round(nk_new, 2)}
    if ok_old >= ESTABLISHED and ok_new_keep < ok_old - DROP:
        return ('TEXT-RENAMED' if changed and nk_new >= RULED else 'TEXT-DRIFT'), m
    if changed:
        if ok_new_keep >= ok_old - DROP and nk_new < 0.5:
            return 'KEYTERM-SPLIT', m
        if nk_new > ok_old + DROP:
            return 'KEYTERM-FIXED', m
        return 'KEYTERM-OTHER', m
    if nk_new > ok_old + DROP:
        return 'TEXT-GAIN', m
    return 'STABLE', m


def main():
    r = json.load(open(sys.argv[1], encoding='utf-8'))
    assert r.get('complete'), 'measure.py output has no terminal marker — the run did not finish'
    out = {'oldRef': r['oldRef'], 'newRef': r['newRef'],
           'thresholds': {'MIN_N': MIN_N, 'DROP': DROP, 'ESTABLISHED': ESTABLISHED, 'RULED': RULED},
           'chapters': [], 'book': Counter()}
    for c in r['chapters']:
        rows = []
        for t in c['terms']:
            cls, m = classify(t)
            rows.append({**{k: t[k] for k in ('module', 'definitionId', 'en', 'K', 'renderingChanged', 'ruling')},
                         'class': cls, **m,
                         'old': {k: t['old'][k] for k in ('prose', 'own', 'other', 'ruled', 'keyTermRuled', 'defSites', 'defAgree', 'misses')},
                         'new': {k: t['new'][k] for k in ('prose', 'own', 'other', 'ruled', 'keyTermRuled', 'defSites', 'defAgree', 'misses')}})
        cnt = Counter(x['class'] for x in rows)
        cons = {}
        for v in ('old', 'new'):
            el = [x for x in rows if x['old']['prose'] >= MIN_N and x['new']['prose'] >= MIN_N]
            cons[v] = [sum(1 for x in el if x[v]['own'] / x[v]['prose'] >= RULED), len(el)]
        out['book'].update(cnt)
        arms = Counter(str((a or {}).get('arm')) for a in c['newArms'].values())
        out['chapters'].append({'chapter': c['chapter'], 'arms': dict(arms), 'counts': dict(cnt), 'consistent': cons, 'terms': rows})
    json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('book:', dict(out['book']))
    for c in out['chapters']:
        print(c['chapter'], c['arms'], 'consistent old %d/%d new %d/%d' % (*c['consistent']['old'], *c['consistent']['new']), {k: c['counts'].get(k, 0) for k in
              ('RULING-BROKEN-NEW', 'RULING-BROKEN-BOTH', 'RULED-APPLIED', 'TEXT-RENAMED', 'TEXT-DRIFT', 'KEYTERM-SPLIT', 'KEYTERM-OTHER', 'KEYTERM-FIXED', 'TEXT-GAIN', 'STABLE', 'LOW-N')})


if __name__ == '__main__':
    main()
