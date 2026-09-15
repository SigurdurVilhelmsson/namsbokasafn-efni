#!/usr/bin/env python3
"""Browser space/collision/overhang census over composed figure SVGs, at 7 display scales.

    python3 -u census.py --out <dir> [--items-root <dir>] <svg> [<svg> ...]

A parameterised copy of /home/siggi/dev/scratch-c140/fix2/integrated/census/{cb2.mjs,an2.py} (originals:
/home/siggi/dev/scratch-c140/fix1/space-verify/{cb.mjs,an.py}). Same measurement, same classifier, same
thresholds; one SVG set per run instead of HEAD and integrated side by side.

<svg>: a translated.svg (figure name = its directory's name) or a books media <b>_IS.svg (figure = <b>).
--items-root: a directory holding <figure>/items.json, diag.json and meta.json from an INSTRUMENTED compose
  of the SAME text (the plain compose writes no items.json/diag.json). Default:
  /home/siggi/dev/scratch-c140/fix2/final/work (the final build). For HEAD-era SVGs use
  /home/siggi/dev/scratch-c140/plan/pred2/work/REPO. The pairing is checked: every figure's <text> count and
  every <text> body (XML-unescaped) must equal items.json's texts in order, else the run stops — so items that
  do not describe the SVG cannot be used silently.

Steps: cb.mjs (Playwright Chromium from server/node_modules) measures every <text> at scales
1,1.25,1.5,1.75,2.0833333,2.5,3 px/pt in `default` mode and in `gp` mode (CSS geometricPrecision); the
classifier takes each version's own gp measurement at 2.0833333 as the ideal and counts, per scale:
  lost       a space-bearing segment boundary whose rendered gap < 0.5 x ideal
  narrowed   space-bearing, gap < ideal - 0.5 pt (and not lost)
  added      space-bearing, gap > 1.5 x ideal
  collision  a boundary without a space whose gap < ideal - 0.5 pt
  overhang   a layout label's default right edge passes its container (+0.1 pt) or the page while its ideal
             right edge does not
Controls printed: worst |default - gp@2.0833| over all scales (0.0 when the SVG carries geometricPrecision).

Writes <out>/jobs.json, cb_default.json, cb_gp.json, census.json. Last stdout line: `CENSUS-DONE`.
Expected: the committed pre-fix media (HEAD 433f9a2e, --items-root plan/pred2/work/REPO) → lost 16,
collision 94, overhang 36 over the 7 scales (164 boundaries, 24 space-bearing); the final build's SVGs → 0/0/0.
Afterwards `pgrep -a chrome-headless` must print nothing.
"""
import argparse, collections, html, json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCALES = ['1', '1.25', '1.5', '1.75', '2.0833333', '2.5', '3']
NS = '2.0833333'


def fig_name(svg):
    p = Path(svg)
    return p.parent.name if p.name == 'translated.svg' else re.sub(r'_IS\.svg$', '', p.name)


def pairs(items):
    grp = {}
    for i, it in enumerate(items):
        if it.get('path') == 'layout':
            grp.setdefault(('L', it['block'], it['line']), []).append(i)
        elif it.get('path') == 'run-exact' and abs(it['rot']) < 1e-6:
            grp.setdefault(('R', it['block'], round(it['y'], 2)), []).append(i)
    for k, ix in grp.items():
        ix = sorted(ix, key=lambda i: (items[i].get('seg', 0), items[i]['x'])) if k[0] == 'L' else sorted(ix, key=lambda i: items[i]['x'])
        for a, b in zip(ix, ix[1:]):
            yield k, a, b
    for k, ix in grp.items():
        yield ('END',) + k, ix, None


def classify(D, G, jobs, root):
    out = {k: collections.defaultdict(list) for k in ('lost', 'added', 'narrowed', 'collision', 'overhang')}
    nb = nsp = 0
    for fig, j in sorted(jobs.items()):
        items = json.loads((root / fig / 'items.json').read_text())
        diag = {e['block']: e for e in json.loads((root / fig / 'diag.json').read_text())}
        for k, a, b in pairs(items):
            if k[0] == 'END':
                if k[1] != 'L':
                    continue
                last = max(a, key=lambda i: items[i]['x'])
                it = items[last]
                if abs(it['rot']) > 1e-6:
                    continue
                c = diag[k[2]]['container']
                lim = c['FR'] if c['cls'] == 'open' else c['R']
                ling = it['x'] + G[fig][NS][last][1]
                for s in SCALES:
                    end = it['x'] + D[fig][s][last][1]
                    if (end > lim + 0.1 or end > j['w']) and not (ling > lim + 0.1 or ling > j['w']):
                        out['overhang'][s].append((fig, k[2], c['cls'], round(ling, 2), round(end, 2), round(lim, 2)))
                continue
            A, B = items[a], items[b]
            ng = (B['x'] + G[fig][NS][b][0] - G[fig][NS][b][2]) - (A['x'] + G[fig][NS][a][1])
            sp = (A['text'] != A['text'].rstrip()) or (B['text'] != B['text'].lstrip())
            nb += 1
            nsp += sp
            for s in SCALES:
                arr = D[fig][s]
                v = (B['x'] + arr[b][0] - arr[b][2]) - (A['x'] + arr[a][1])
                rec = (fig, k[0], k[1], k[2], A['text'], B['text'], round(ng, 3), round(v, 3))
                if sp:
                    if v < 0.5 * ng:
                        out['lost'][s].append(rec)
                    elif v < ng - 0.5:
                        out['narrowed'][s].append(rec)
                    elif v > 1.5 * ng:
                        out['added'][s].append(rec)
                elif v < ng - 0.5:
                    out['collision'][s].append(rec)
    return nb, nsp, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--items-root', default='/home/siggi/dev/scratch-c140/fix2/final/work')
    ap.add_argument('svgs', nargs='+')
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    root = Path(a.items_root)
    jobs = {}
    for svg in a.svgs:
        fig = fig_name(svg)
        items = json.loads((root / fig / 'items.json').read_text())
        meta = json.loads((root / fig / 'meta.json').read_text())
        texts = [html.unescape(t) for t in re.findall(r'<text [^>]*>(.*?)</text>', Path(svg).read_text(encoding='utf-8'), re.S)]
        want = [it['text'] for it in items]
        if texts != want:
            sys.exit(f'PAIRING FAILED {fig}: svg has {len(texts)} <text>, items.json {len(want)}; '
                     f'first difference at {next((i for i, (x, y) in enumerate(zip(texts, want)) if x != y), min(len(texts), len(want)))}')
        jobs[fig] = dict(fig=fig, svg=str(Path(svg).resolve()), w=meta['page'][0], h=meta['page'][1], n=len(texts))
    (out / 'jobs.json').write_text(json.dumps(list(jobs.values()), indent=1))
    print(f'paired {len(jobs)} figures against {root}', flush=True)
    for mode in ('default', 'gp'):
        p = subprocess.run(['node', str(HERE / 'cb.mjs'), ','.join(SCALES), mode, str(out / f'cb_{mode}.json'),
                            str(out / 'jobs.json')], capture_output=True, text=True, timeout=1800)
        print(f'cb.mjs {mode}: rc={p.returncode} {p.stdout.strip()[-80:]} {p.stderr.strip()[-300:]}', flush=True)
        if p.returncode != 0 or 'DONE-MARKER' not in p.stdout:
            sys.exit('cb.mjs failed')
    D = json.loads((out / 'cb_default.json').read_text())
    G = json.loads((out / 'cb_gp.json').read_text())
    nb, nsp, res = classify(D, G, jobs, root)
    print(f'boundaries {nb}, space-bearing {nsp}')
    for k in ('lost', 'added', 'narrowed', 'collision', 'overhang'):
        print(f'   {k:10}', ' '.join(f'{s}:{len(res[k][s])}' for s in SCALES), '| total', sum(len(res[k][s]) for s in SCALES))
    worst = max(abs(p - q) for f in D for s in SCALES for x, y in zip(D[f][s], G[f][NS]) for p, q in zip(x, y))
    print('CONTROL default (all 7 scales) vs gp@2.0833: worst |delta| pt =', round(worst, 4))
    (out / 'census.json').write_text(json.dumps(dict(items_root=str(root), boundaries=nb, space_boundaries=nsp,
                                                     worst_default_vs_gp=worst,
                                                     **{k: {s: v[s] for s in SCALES} for k, v in res.items()}),
                                                indent=1, ensure_ascii=False))
    print('CENSUS-DONE')


if __name__ == '__main__':
    main()
