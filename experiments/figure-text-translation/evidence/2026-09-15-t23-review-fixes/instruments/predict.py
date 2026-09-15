#!/usr/bin/env python3
"""Per-figure prediction hashes for the 34 bought figures, and a by-value check against them.

    python3 predict.py write <regen-out|work-root> <PREDICTIONS.json> [--tree <composer dir>]
    python3 predict.py check <PREDICTIONS.json> --dir <regen-out|work-root>
    (`--check` is accepted as an alias of `check`)
    python3 predict.py check <PREDICTIONS.json> --media [<media dir>]
    python3 predict.py diff  <A.json> <B.json>

<regen-out> is a regen34.py --out directory (it holds work/<b>/); a bare work root (holding <b>/ directly,
e.g. /home/siggi/dev/scratch-c140/fix2/final/work) is accepted too. The prepared inputs are read THROUGH
work/<b>/'s symlinks (artwork.svg, blocks.json, runs.json), so a work root whose links point at another
prep directory is hashed from that prep directory.

Keys per figure:
  artwork_svg_sha256      prep artwork.svg
  blocks_sha256           prep blocks.json
  runs_sha256             prep runs.json
  compose_report_sha256   work compose-report.json
  media_artwork_sha256    figparts artwork part of work translated.svg
  media_textgroup_sha256  figparts text group of work translated.svg
  text_count              <text> elements in that group
  style_font_faces        the @font-face list of the <style> (family/weight/style) — stable across
                          SOURCE_DATE_EPOCH, so font embedding is checked without hashing the woff2 bytes

check --dir compares every key. check --media compares ONLY media_artwork_sha256, media_textgroup_sha256,
text_count and style_font_faces, reading <media dir>/<b>_IS.svg (default: the repository's books/efnafraedi-2e/media) through
figparts — the <style> BYTES are never compared (see figparts.py). Output: one MATCH/MISMATCH line per figure
(mismatching keys named), then `N/34 MATCH` per key and a final `N/34 MATCH` line. Exit 0 only on 34/34.

diff prints, per key, how many figures differ between two prediction files, and their names.
"""
import hashlib, json, sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import figparts  # noqa: E402

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
MEDIA = REPO / 'books/efnafraedi-2e/media'
SIDECARS = REPO / 'books/efnafraedi-2e/figure-text'
KEYS = ('artwork_svg_sha256', 'blocks_sha256', 'runs_sha256', 'compose_report_sha256',
        'media_artwork_sha256', 'media_textgroup_sha256', 'text_count', 'style_font_faces')
MEDIA_KEYS = ('media_artwork_sha256', 'media_textgroup_sha256', 'text_count', 'style_font_faces')
TREE_FILES = ('compose.py', 'figcolour.py', 'figlayout.py', 'figscripts.py', 'figure-prepare.py', 'readlayer.py',
              'strip-text.py', 'svgfix.py', 'svgout.py')


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def names():
    ns = sorted(p.name[:-len('.is.json')] for p in SIDECARS.glob('*.is.json'))
    assert len(ns) == 34, len(ns)
    return ns


def work_root(d):
    d = Path(d)
    return d / 'work' if (d / 'work').is_dir() else d


def figure(wd):
    fp = figparts.parts(wd / 'translated.svg')
    return dict(artwork_svg_sha256=sha(wd / 'artwork.svg'), blocks_sha256=sha(wd / 'blocks.json'),
                runs_sha256=sha(wd / 'runs.json'), compose_report_sha256=sha(wd / 'compose-report.json'),
                media_artwork_sha256=fp['artwork_sha256'], media_textgroup_sha256=fp['textgroup_sha256'],
                text_count=fp['text_count'], style_font_faces=fp['style_font_faces'])


def write(src, dst, tree=None):
    w = work_root(src)
    figs = {b: figure(w / b) for b in names()}
    meta = dict(source=str(Path(src).resolve()), keys=list(KEYS),
                sidecars_sha256=hashlib.sha256(''.join(sha(SIDECARS / f'{b}.is.json') for b in names())
                                               .encode()).hexdigest(),
                note='sidecars_sha256 = sha256 of the concatenated hex sha256 of the 34 *.is.json in sorted name order')
    if tree:
        meta['tree'] = str(Path(tree).resolve())
        meta['tree_files_sha256'] = {f: sha(Path(tree) / f) for f in TREE_FILES if (Path(tree) / f).is_file()}
    Path(dst).write_text(json.dumps(dict(meta=meta, figures=figs), indent=1, sort_keys=False) + '\n')
    print(f'wrote {dst}: {len(figs)} figures')


def check(pred, dir_=None, media=None):
    P = json.loads(Path(pred).read_text())['figures']
    keys = KEYS if dir_ else MEDIA_KEYS
    per_key = {k: 0 for k in keys}
    full = 0
    for b in names():
        if dir_:
            got = figure(work_root(dir_) / b)
        else:
            fp = figparts.parts(Path(media) / f'{b}_IS.svg')
            got = dict(media_artwork_sha256=fp['artwork_sha256'], media_textgroup_sha256=fp['textgroup_sha256'],
                       text_count=fp['text_count'], style_font_faces=fp['style_font_faces'])
        bad = [k for k in keys if got[k] != P[b][k]]
        for k in keys:
            per_key[k] += k not in bad
        full += not bad
        print(f'{"MATCH   " if not bad else "MISMATCH"} {b}' + (f'  keys={bad}' if bad else ''))
    for k in keys:
        print(f'  {k:24} {per_key[k]}/34 MATCH')
    print(f'{full}/34 MATCH')
    return full == 34


def diff(a, b):
    A = json.loads(Path(a).read_text())['figures']
    B = json.loads(Path(b).read_text())['figures']
    for k in KEYS:
        d = [n for n in names() if A[n][k] != B[n][k]]
        print(f'{k:24} differ {len(d)}/34' + (f': {" ".join(d)}' if d and len(d) < 34 else ''))


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == '--check':
        a[0] = 'check'
    if a[0] == 'write':
        tree = a[a.index('--tree') + 1] if '--tree' in a else None
        write(a[1], a[2], tree)
    elif a[0] == 'check':
        if '--dir' in a:
            ok = check(a[1], dir_=a[a.index('--dir') + 1])
        else:
            i = a.index('--media')
            ok = check(a[1], media=a[i + 1] if len(a) > i + 1 else MEDIA)
        sys.exit(0 if ok else 1)
    elif a[0] == 'diff':
        diff(a[1], a[2])
    else:
        sys.exit(__doc__)
