#!/usr/bin/env python3
"""§C140 ㊱ B6 — is each recomposed figure a TIMESTAMP-ONLY change against its committed copy? Read-only. 0 ISK.

    cd <repo root>
    python3 -u experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/instruments/media_value_check.py \
      <out.json>

For every modified books/efnafraedi-2e/media/*_IS.svg (git status), compares the committed copy (`git show HEAD:<path>`)
with the working-tree file, using figparts.py from the ⑥b build folder:
  artwork_same      artwork part sha256 equal
  textgroup_same    text group byte-equal
  style_faces_same  @font-face family/weight/style list equal
  woff2_only_head   same number of embedded woff2 blobs, and every pair decodes (fontTools) to the same table set with
                    every table byte-equal except `head`
  head_differs      how many blob pairs differ in `head` (the compose-time stamp; figure-run.js does not pin
                    SOURCE_DATE_EPOCH)
  timestamp_only    all four of the first four are true
CONTROLS, run first on one real figure, so a comparison that cannot see a difference cannot report "timestamp-only":
  C1 a planted one-character change inside the text group -> timestamp_only False (textgroup_same False)
  C2 the figure's first woff2 blob swapped for another figure's -> timestamp_only False (woff2_only_head False)
  C3 the committed copy against itself -> timestamp_only True with head_differs 0
Writes {controls, rows, n, timestamp_only, not_timestamp_only}. Terminal marker: `MEDIA-CHECK-DONE ok=<bool>` (controls
behave as stated). It restores nothing — the restore is a separate, recorded step.
"""
import base64, importlib.util, io, json, re, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(REPO / 'experiments/figure-text-translation/pylibs'))
from fontTools.ttLib import TTFont                    # noqa: E402

spec = importlib.util.spec_from_file_location(
    'figparts', REPO / 'experiments/figure-text-translation/evidence/2026-09-17-c6b-build/instruments/figparts.py')
figparts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(figparts)
BLOB = re.compile(rb'base64,([A-Za-z0-9+/=]+)\)')


def tables(b64):
    f = TTFont(io.BytesIO(base64.b64decode(b64)))
    return {t: bytes(f.reader[t]) for t in f.keys() if t != 'GlyphOrder' and t in f.reader.tables}


def parts_of(data):
    tmp = Path('/tmp/claude-1000') / f'c36-media-{abs(hash(data)) % 10**12}.svg'
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(data)
    try:
        p = figparts.parts(str(tmp))
    finally:
        tmp.unlink()
    i = data.index(b'<g ', data.rfind(b'</style>'))
    p['textgroup'] = data[i:data.rindex(b'</g>') + len(b'</g>')]
    return p


def compare(before, after):
    pb, pa = parts_of(before), parts_of(after)
    bb, ba = BLOB.findall(before), BLOB.findall(after)
    only_head, head_differs = len(bb) == len(ba), 0
    for x, y in zip(bb, ba):
        tx, ty = tables(x), tables(y)
        only_head = only_head and set(tx) == set(ty) and all(tx[t] == ty[t] for t in tx if t != 'head')
        head_differs += tx.get('head') != ty.get('head')
    r = dict(artwork_same=pb['artwork_sha256'] == pa['artwork_sha256'], textgroup_same=pb['textgroup'] == pa['textgroup'],
             style_faces_same=pb['style_font_faces'] == pa['style_font_faces'], woff2_only_head=only_head,
             woff2_blobs=len(ba), head_differs=head_differs)
    r['timestamp_only'] = all(r[k] for k in ('artwork_same', 'textgroup_same', 'style_faces_same', 'woff2_only_head'))
    return r


def main():
    out = Path(sys.argv[1])
    changed = sorted(l[3:] for l in subprocess.run(['git', 'status', '--porcelain', '--', 'books/efnafraedi-2e/media'],
                     capture_output=True, text=True, cwd=REPO).stdout.splitlines() if l.endswith('_IS.svg'))
    head = lambda p: subprocess.run(['git', 'show', f'HEAD:{p}'], capture_output=True, check=True, cwd=REPO).stdout

    ctl_path, other_path = changed[0], changed[1]
    cb, ca, co = head(ctl_path), (REPO / ctl_path).read_bytes(), (REPO / other_path).read_bytes()
    i = ca.index(b'<text ', ca.rfind(b'</style>'))
    j = ca.index(b'>', i) + 1
    planted_text = ca[:j] + (b'X' if ca[j:j + 1] != b'X' else b'Y') + ca[j + 1:]
    blob_a, blob_o = BLOB.findall(ca)[0], BLOB.findall(co)[0]
    planted_blob = ca.replace(blob_a, blob_o, 1)
    controls = dict(
        C1_planted_text=compare(cb, planted_text),
        C2_swapped_blob=compare(cb, planted_blob),
        C3_self=compare(cb, cb),
        figure=ctl_path, blob_donor=other_path)
    controls_ok = (not controls['C1_planted_text']['timestamp_only'] and not controls['C1_planted_text']['textgroup_same']
                   and not controls['C2_swapped_blob']['timestamp_only'] and not controls['C2_swapped_blob']['woff2_only_head']
                   and controls['C3_self']['timestamp_only'] and controls['C3_self']['head_differs'] == 0)
    rows = []
    for p in changed:
        r = dict(path=p, **compare(head(p), (REPO / p).read_bytes()))
        rows.append(r)
        print(f"{Path(p).name:48} art={r['artwork_same']} text={r['textgroup_same']} faces={r['style_faces_same']} "
              f"woff2_only_head={r['woff2_only_head']} head_differs={r['head_differs']}/{r['woff2_blobs']} "
              f"timestamp_only={r['timestamp_only']}", flush=True)
    res = dict(controls=controls, controls_ok=controls_ok, n=len(rows),
               timestamp_only=[r['path'] for r in rows if r['timestamp_only']],
               not_timestamp_only=[r['path'] for r in rows if not r['timestamp_only']], rows=rows)
    out.write_text(json.dumps(res, indent=1))
    print(f"controls_ok={controls_ok} (C1 {controls['C1_planted_text']['timestamp_only']}, "
          f"C2 {controls['C2_swapped_blob']['timestamp_only']}, C3 {controls['C3_self']['timestamp_only']})")
    print(f"figures={len(rows)} timestamp_only={len(res['timestamp_only'])} not={len(res['not_timestamp_only'])}")
    print(f'MEDIA-CHECK-DONE ok={controls_ok}')


if __name__ == '__main__':
    main()
