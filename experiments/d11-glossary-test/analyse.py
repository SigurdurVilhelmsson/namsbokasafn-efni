#!/usr/bin/env python3
"""D11's pre-registered analysis (DESIGN §8), with an input adapter for measure.py.

THE ADAPTER. `experiments/terminology-consistency/measure.py` is imported UNCHANGED and only its two
file readers, `git_show` and `git_ls`, are replaced. A D11 run tree lives outside git ([USER],
2026-10-26: the raw MT is not committed), so the replacement readers let a tree stand in for a commit.
Every score below comes from measure.py's own `measure_chapter`, `carries` and self-test; this file
adds no matching logic.

  ref `tree:<run>`  a D11 run tree under --trees (for example `tree:r1-M`)
  ref `<sha>`       a commit, restricted to D11's module in that chapter (the module-scope context)
  `server/lib/houseStyleTerms.js` (it feeds only measure.py's `ruled` fields, not the primary metric)
  is read for a tree ref at the commit the buy ran from (`<trees>/REPO_HEAD`).

THE PRIMARY ANALYSIS (DESIGN §8, frozen 2026-10-25): for each run, whether each module's running text
is consistent with its own key-terms entry, for the nine TEXT-DRIFT terms, compared between arms.
M against no glossary is the primary contrast. The nine are taken from
`terminology-consistency/results/2026-10-10/classified-common.json` by module and definition id.

OPERATIONALISATION, written before any D11 tree was measured:
  * consistent: the README's headline rule, own/prose >= RULED (0.8), where prose >= MIN_N (3).
    A term with prose < MIN_N in a run is LOW-N, not counted, and reported.
  * per run: how many of the nine are consistent (the headline), and the mean share own/prose over
    the nine (descriptive).
  * an arm effect counts only beyond the arm's own two-run difference (DESIGN §7): the two arms' run
    ranges must not overlap, so both runs of one arm score above both runs of the other. Equal or
    overlapping ranges mean no effect. Applied to the run-level count and, per term, to the share.
SECONDARY (pre-registered): S against no glossary and M against S, the same way; all of the two
modules' taught terms; segment-level difference rates between runs and between arms.
CONTEXT (not pre-registered, labelled as such): the June MT (9a69414d5) and the September MT
(98a5fe2ff), measured the same way at the same module scope.

ADDED AFTER THE FIRST RUN (2026-10-26; neither touches the primary analysis):
  * contextCommonIds: each D11 run scored only on segment ids that the June MT also has, like the
    June/September context pair (which uses measure.py's --common-ids). The first run's context rows
    counted a different population (18 prose uses of *atom* against the runs' 22). Not pre-registered.
  * juneOnly: DESIGN §8 pre-registers "the June-only terms are reported separately"; the first run
    left them out. Per run, the prose uses of each June-only headword in its module, and how many
    carry each March value. Two-letter values (pH) are outside the matcher (stems() keeps words of 3+
    letters), so only their prose count is reported.

CONTROLS (--controls): (a) the original git readers, unrestricted, reproduce the 2026-10-10 numbers
for the nine terms exactly; (b) a tree built from 98a5fe2ff's files scores exactly as 98a5fe2ff does
through the git readers; (c) a run's scores do not depend on which run it is paired with.

No segment text is written to the output (max_examples 0): only counts and key-terms entries.

Usage:
  python3 -u experiments/d11-glossary-test/analyse.py --trees ~/d11-buy-2026-10-26 --controls
  python3 -u experiments/d11-glossary-test/analyse.py --trees ~/d11-buy-2026-10-26 --out <dir>
"""
import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
BOOK = 'efnafraedi-2e'
MODULES = {'ch01': 'm68667', 'ch11': 'm68781'}
RUNS = ['r1-M', 'r1-S', 'r1-none', 'r2-none', 'r2-S', 'r2-M']
ARMS = {'M': ['r1-M', 'r2-M'], 'S': ['r1-S', 'r2-S'], 'none': ['r1-none', 'r2-none']}
JUNE, SEPTEMBER = '9a69414d5', '98a5fe2ff'
CLASSIFIED = os.path.join(REPO, 'experiments/terminology-consistency/results/2026-10-10/classified-common.json')


def load_measure():
    path = os.path.join(REPO, 'experiments/terminology-consistency/measure.py')
    spec = importlib.util.spec_from_file_location('measure', path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


M = load_measure()
GIT_SHOW, GIT_LS = M.git_show, M.git_ls  # the originals, kept for control (a) and the context refs


class Readers:
    """The replacement readers. `trees` maps a tree name to its directory."""

    def __init__(self, trees_root, repo_head):
        self.root = trees_root
        self.repo_head = repo_head

    def _tree(self, ref):
        return os.path.join(self.root, ref[len('tree:'):])

    def show(self, ref, path):
        if ref.startswith('tree:'):
            if path == 'server/lib/houseStyleTerms.js':
                return GIT_SHOW(self.repo_head, path)
            f = os.path.join(self._tree(ref), path)
            if not os.path.isfile(f):
                return None
            with open(f, encoding='utf-8') as fh:
                return fh.read()
        return GIT_SHOW(ref, path)

    def ls(self, ref, path):
        if ref.startswith('tree:'):
            d = os.path.join(self._tree(ref), path)
            return sorted(os.listdir(d)) if os.path.isdir(d) else []
        names = GIT_LS(ref, path)
        # A commit is restricted to D11's module in that chapter, so its scope matches a tree's.
        parts = path.rstrip('/').split('/')
        if len(parts) == 4 and parts[2] == '02-mt-output' and parts[3] in MODULES:
            names = [n for n in names if n.startswith(MODULES[parts[3]] + '-')]
        return names


def use(readers):
    M.git_show, M.git_ls = readers.show, readers.ls


def use_original():
    M.git_show, M.git_ls = GIT_SHOW, GIT_LS


def nine_terms():
    j = json.load(open(CLASSIFIED, encoding='utf-8'))
    out = []
    for c in j['chapters']:
        for t in c['terms']:
            if t['class'] == 'TEXT-DRIFT' and t['module'] in MODULES.values():
                out.append({'chapter': c['chapter'], 'module': t['module'], 'definitionId': t['definitionId'],
                            'en': t['en'], 'oct10': {'old': [t['old']['own'], t['old']['prose']],
                                                     'new': [t['new']['own'], t['new']['prose']]}})
    assert len(out) == 9, f'expected the nine TEXT-DRIFT terms, found {len(out)}'
    return out


def measure_pair(ch, old_ref, new_ref, rulings):
    return M.measure_chapter(BOOK, ch, old_ref, new_ref, 0, rulings, True)


def by_id(res):
    return {(t['module'], t['definitionId']): t for t in res['terms']}


def vintage_scores(t, v):
    x = t[v]
    return {'K': t['K'][v], 'prose': x['prose'], 'own': x['own'], 'defAgree': x['defAgree']}


def run_scores(readers, rulings):
    """{run: {(module, definitionId): scores}} for every taught term of both modules."""
    use(readers)
    out = {r: {} for r in RUNS}
    for arm, (a, b) in ARMS.items():
        for ch in MODULES:
            res = measure_pair(ch, f'tree:{a}', f'tree:{b}', rulings)
            for key, t in by_id(res).items():
                out[a][key] = {'en': t['en'], **vintage_scores(t, 'old')}
                out[b][key] = {'en': t['en'], **vintage_scores(t, 'new')}
    return out


def consistent(s):
    if s['prose'] < M_MIN_N:
        return None  # LOW-N
    return s['own'] / s['prose'] >= M_RULED


def share(s):
    return s['own'] / s['prose'] if s['prose'] else None


def arm_effect(a_vals, b_vals):
    """'a' if both of a's runs exceed both of b's, 'b' for the reverse, else None (overlap or tie)."""
    if any(v is None for v in a_vals + b_vals):
        return 'n/a'
    if min(a_vals) > max(b_vals):
        return 'a'
    if min(b_vals) > max(a_vals):
        return 'b'
    return None


def seg_diff(readers, ra, rb):
    """Share of segments (ids in both runs, both modules) whose Icelandic differs between two runs."""
    n = d = 0
    for ch, mod in MODULES.items():
        p = f'books/{BOOK}/02-mt-output/{ch}/{mod}-segments.is.md'
        sa, sb = M.parse_segments(readers.show(f'tree:{ra}', p)), M.parse_segments(readers.show(f'tree:{rb}', p))
        for k in sa.keys() & sb.keys():
            n += 1
            d += sa[k] != sb[k]
    return {'differ': d, 'segments': n, 'share': round(d / n, 4) if n else None}


WIRE_COMPARE = os.path.join(HERE, 'results/2026-10-24/wire-compare.json')
MARCH_GLOSSARY = os.path.join(REPO, 'tools/__tests__/fixtures/d11-march-glossary-5db701c92/glossary-unified.json')


def june_only(readers):
    """Per module, each June-only headword (wire-compare.json's onlyJune), per run: prose uses in that
    module and how many carry each of its March values (measure.py's carries/stems)."""
    wc = json.load(open(WIRE_COMPARE, encoding='utf-8'))
    march = json.load(open(MARCH_GLOSSARY, encoding='utf-8'))
    values = {}
    for t in march['terms']:
        if t.get('status') == 'approved':
            values.setdefault(t['english'], []).append(t['icelandic'])
    out = []
    for m in wc['modules']:
        ch, mod = m['module'].split('/')
        heads = sorted({x.split(' → ')[0] for c in m['perChunk'] for x in c['onlyJune']})
        for h in heads:
            pat = M.en_pattern(M.norm_en(h))
            row = {'module': mod, 'headword': h, 'values': values.get(h, []), 'runs': {}}
            for r in RUNS:
                en = M.parse_segments(readers.show(f'tree:{r}', f'books/{BOOK}/02-for-mt/{ch}/{mod}-segments.en.md'))
                is_ = M.parse_segments(readers.show(f'tree:{r}', f'books/{BOOK}/02-mt-output/{ch}/{mod}-segments.is.md'))
                n = 0
                carry = {v: 0 for v in row['values']}
                for key, etxt in en.items():
                    if key.startswith(('glossary-term:', 'glossary-def:')) or key not in is_:
                        continue
                    if not pat or not pat.search(M.plain(etxt)):
                        continue
                    n += 1
                    for v in row['values']:
                        st = M.stems(v)
                        carry[v] += bool(st) and M.carries(is_[key], st)
                row['runs'][r] = {'prose': n, 'carries': carry}
            row['scorable'] = {v: bool(M.stems(v)) for v in row['values']}
            out.append(row)
    return out


def context_common(readers, rulings, keys):
    """Each run scored on ids the June MT also has (pair JUNE vs the run, --common-ids)."""
    out = {}
    for r in RUNS:
        per = {}
        for ch in MODULES:
            res = by_id(M.measure_chapter(BOOK, ch, JUNE, f'tree:{r}', 0, rulings, True))
            for key in keys:
                if key in res:
                    per[key] = vintage_scores(res[key], 'new')
        out[r] = per
    return out


def controls(readers, rulings_new):
    report = {}
    # (a) the original readers reproduce 2026-10-10 for the nine
    use_original()
    ok_a = []
    for t in nine_terms():
        res = by_id(M.measure_chapter(BOOK, t['chapter'], JUNE, SEPTEMBER, 0, rulings_new, True))
        got = res[(t['module'], t['definitionId'])]
        g = {'old': [got['old']['own'], got['old']['prose']], 'new': [got['new']['own'], got['new']['prose']]}
        ok_a.append({'en': t['en'], 'oct10': t['oct10'], 'now': g, 'match': g == t['oct10']})
    report['a_reproduces_oct10'] = {'all': all(x['match'] for x in ok_a), 'terms': ok_a}

    # (b) a tree built from SEPTEMBER's files scores as SEPTEMBER does through the git readers
    tmp = tempfile.mkdtemp(prefix='d11-ctlb-')
    try:
        for ch, mod in MODULES.items():
            for sub, name in (('02-for-mt', f'{mod}-segments.en.md'), ('02-mt-output', f'{mod}-segments.is.md'),
                              ('02-mt-output', f'{mod}-provenance.json')):
                rel = f'books/{BOOK}/{sub}/{ch}/{name}'
                txt = GIT_SHOW(SEPTEMBER, rel)
                if txt is None:
                    continue
                os.makedirs(os.path.dirname(os.path.join(tmp, 'sept', rel)), exist_ok=True)
                with open(os.path.join(tmp, 'sept', rel), 'w', encoding='utf-8') as fh:
                    fh.write(txt)
        rb = Readers(tmp, readers.repo_head)
        use(rb)
        ok_b = []
        for ch in MODULES:
            via_tree = by_id(measure_pair(ch, 'tree:sept', 'tree:sept', rulings_new))
            via_git = by_id(measure_pair(ch, SEPTEMBER, SEPTEMBER, rulings_new))
            for key in via_git:
                a, b = vintage_scores(via_tree[key], 'new'), vintage_scores(via_git[key], 'new')
                ok_b.append(a == b)
        report['b_tree_equals_git'] = {'all': all(ok_b) and len(ok_b) > 0, 'terms': len(ok_b)}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # (c) pairing does not change a run's scores
    use(readers)
    rulings = M.load_rulings('tree:r1-M')
    ok_c = []
    for ch in MODULES:
        p1 = by_id(measure_pair(ch, 'tree:r1-M', 'tree:r2-M', rulings))
        p2 = by_id(measure_pair(ch, 'tree:r1-M', 'tree:r1-none', rulings))
        for key in p1:
            ok_c.append(vintage_scores(p1[key], 'old') == vintage_scores(p2[key], 'old'))
    report['c_pairing_independent'] = {'all': all(ok_c) and len(ok_c) > 0, 'terms': len(ok_c)}
    return report


def analyse(readers):
    use(readers)
    rulings = M.load_rulings('tree:r1-M')
    if not rulings:
        sys.exit('could not load houseStyleTerms.js at REPO_HEAD')
    scores = run_scores(readers, rulings)
    nine = nine_terms()
    keys = [(t['module'], t['definitionId']) for t in nine]

    # context: June and September at the same module scope (not pre-registered)
    use(readers)
    ctx = {}
    for ch in MODULES:
        res = by_id(M.measure_chapter(BOOK, ch, JUNE, SEPTEMBER, 0, rulings, True))
        for key, t in res.items():
            ctx[key] = {'june': vintage_scores(t, 'old'), 'september': vintage_scores(t, 'new')}

    per_term = []
    for t, key in zip(nine, keys):
        row = {'module': t['module'], 'definitionId': t['definitionId'], 'en': t['en'], 'runs': {}}
        for r in RUNS:
            s = scores[r][key]
            row['runs'][r] = {**s, 'share': share(s) and round(share(s), 3), 'consistent': consistent(s)}
        for c in ('june', 'september'):
            s = ctx[key][c]
            row[c] = {**s, 'share': share(s) and round(share(s), 3), 'consistent': consistent(s)}
        sh = {arm: [share(scores[r][key]) for r in rs] for arm, rs in ARMS.items()}
        row['effect'] = {'M_vs_none': arm_effect(sh['M'], sh['none']), 'S_vs_none': arm_effect(sh['S'], sh['none']),
                         'M_vs_S': arm_effect(sh['M'], sh['S'])}
        per_term.append(row)

    def run_level(run_keys_scores):
        el = [s for s in run_keys_scores if consistent(s) is not None]
        return {'consistent': sum(1 for s in el if consistent(s)), 'eligible': len(el),
                'lowN': len(run_keys_scores) - len(el),
                'meanShare': round(sum(share(s) for s in el) / len(el), 3) if el else None}

    runs = {r: run_level([scores[r][k] for k in keys]) for r in RUNS}
    for c in ('june', 'september'):
        runs[c] = run_level([ctx[k][c] for k in keys])
    counts = {arm: [runs[r]['consistent'] for r in rs] for arm, rs in ARMS.items()}
    headline = {'M_vs_none': arm_effect(counts['M'], counts['none']),
                'S_vs_none': arm_effect(counts['S'], counts['none']),
                'M_vs_S': arm_effect(counts['M'], counts['S'])}

    # secondary: all taught terms of the two modules
    all_keys = sorted(scores['r1-M'].keys())
    all_terms = {r: run_level([scores[r][k] for k in all_keys]) for r in RUNS}
    all_counts = {arm: [all_terms[r]['consistent'] for r in rs] for arm, rs in ARMS.items()}
    all_effect = {'M_vs_none': arm_effect(all_counts['M'], all_counts['none']),
                  'S_vs_none': arm_effect(all_counts['S'], all_counts['none']),
                  'M_vs_S': arm_effect(all_counts['M'], all_counts['S'])}

    # secondary: segment-level difference rates
    within = {arm: seg_diff(readers, *rs) for arm, rs in ARMS.items()}
    between = {}
    for a1, a2 in (('M', 'none'), ('S', 'none'), ('M', 'S')):
        pairs = [seg_diff(readers, x, y) for x in ARMS[a1] for y in ARMS[a2]]
        n = sum(p['segments'] for p in pairs)
        d = sum(p['differ'] for p in pairs)
        between[f'{a1}_vs_{a2}'] = {'differ': d, 'segments': n, 'share': round(d / n, 4)}

    use(readers)
    cc = context_common(readers, rulings, keys)
    cc_runs = {r: run_level([cc[r][k] for k in keys]) for r in RUNS}
    cc_terms = [{'en': t['en'], **{r: {'own': cc[r][k]['own'], 'prose': cc[r][k]['prose'],
                                       'share': share(cc[r][k]) and round(share(cc[r][k]), 3)} for r in RUNS}}
                for t, k in zip(nine, keys)]

    return {
        'contextCommonIds': {'note': 'added after the first run; D11 runs scored on ids the June MT also has, '
                                     'the same population as the june/september rows; not pre-registered',
                             'runLevel': cc_runs, 'terms': cc_terms},
        'juneOnly': june_only(readers),
        'design': 'experiments/d11-glossary-test/DESIGN.md §8',
        'thresholds': {'MIN_N': M_MIN_N, 'RULED': M_RULED},
        'rule': 'an arm effect counts only when the two arms\' run ranges do not overlap (DESIGN §7)',
        'nineTerms': per_term,
        'runLevel': runs,
        'headline': {'counts': counts, 'effect': headline},
        'secondary': {'allTaughtTerms': {'terms': len(all_keys), 'runLevel': all_terms, 'counts': all_counts,
                                         'effect': all_effect},
                      'segmentDifference': {'withinArm': within, 'betweenArms': between}},
        'context': 'june/september rows are the committed MT vintages at the same module scope; not pre-registered',
    }


# measure.py's classifier thresholds live in classify.py; the README's headline rule uses MIN_N and RULED.
M_MIN_N, M_RULED = 3, 0.8


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--trees', required=True)
    ap.add_argument('--controls', action='store_true')
    ap.add_argument('--out')
    a = ap.parse_args()
    trees = os.path.abspath(os.path.expanduser(a.trees))
    repo_head = open(os.path.join(trees, 'REPO_HEAD'), encoding='utf-8').read().strip()
    if not M.selftest():
        sys.exit('measure.py matcher self-test failed; refusing to measure')
    readers = Readers(trees, repo_head)
    os.chdir(REPO)  # measure.py's git readers resolve against the working directory
    result = {'trees': trees, 'repoHead': repo_head}
    if a.controls:
        rulings_new = (use_original(), M.load_rulings(SEPTEMBER))[1]
        result['controls'] = controls(readers, rulings_new)
        print(json.dumps({k: v.get('all') for k, v in result['controls'].items()}), file=sys.stderr)
    if a.out:
        result['analysis'] = analyse(readers)
    result['complete'] = True  # terminal marker: judge a run by this, never by the exit code
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        with open(os.path.join(a.out, 'analysis.json'), 'w', encoding='utf-8') as fh:
            json.dump(result, fh, ensure_ascii=False, indent=1)
        print(f'wrote {os.path.join(a.out, "analysis.json")}', file=sys.stderr)
    else:
        json.dump(result, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
