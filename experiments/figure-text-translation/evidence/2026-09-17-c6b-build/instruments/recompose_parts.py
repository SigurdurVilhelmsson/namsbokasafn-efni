#!/usr/bin/env python3
"""§C140 ⑥b P7 — what the recompose changed in each committed figure, part by part. Read-only. 0 ISK.

    cd <repo root>
    FIGTEXT_PYLIBS=experiments/figure-text-translation/pylibs python3 -u \
      experiments/figure-text-translation/evidence/2026-09-17-c6b-build/instruments/recompose_parts.py \
      <before-rev> <after-rev> <recompose-set.txt> <scratch-dir> <out.json>

For every figure in <recompose-set.txt> ("<chapter> <basename>" per line), both versions of
books/efnafraedi-2e/media/<b>_IS.svg are read with `git show <rev>:<path>` into <scratch-dir>, split by
figparts.py (this folder), and compared:
  artwork_same         artwork part sha256 equal
  textgroup_changed    text group sha256 differs
  textgroup_minus_property_same   the AFTER text group with every ` style="font-kerning:none"` removed is byte-equal
                       to the BEFORE text group (so the property is the text group's ONLY change)
  properties           how many were removed for that comparison
  text_count_same, faces_same, g_opener_same
  woff2_only_head      every embedded @font-face blob, decoded with fontTools, differs from its BEFORE counterpart
                       in no table but `head` (figure-run.js does not pin SOURCE_DATE_EPOCH, so head.modified and
                       checkSumAdjustment move on every compose), and the blob lists pair up 1:1
Writes {before_rev, after_rev, all_ok, rows}. Terminal marker: stdout's last line `PARTS-DONE all_ok=<bool>`.
"""
import base64, importlib.util, io, json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / 'pylibs'))
from fontTools.ttLib import TTFont                    # noqa: E402

spec = importlib.util.spec_from_file_location('figparts', HERE / 'figparts.py')
figparts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(figparts)
PROP = b' style="font-kerning:none"'
BLOB = re.compile(rb'base64,([A-Za-z0-9+/=]+)\)')


def textgroup(data):
    i = data.index(b'<g ', data.rfind(b'</style>'))
    return data[i:data.rindex(b'</g>') + len(b'</g>')]


def tables(b64):
    f = TTFont(io.BytesIO(base64.b64decode(b64)))
    out = {}
    for tag in f.keys():
        if tag == 'GlyphOrder':
            continue
        buf = f.reader[tag] if tag in f.reader.tables else None
        out[tag] = bytes(buf) if buf is not None else None
    return out


def main():
    before_rev, after_rev, set_file, scratch, out = sys.argv[1:6]
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    figs = [l.split()[1] for l in Path(set_file).read_text().splitlines() if l.strip()]
    rows, all_ok = [], True
    for b in figs:
        rel = f'books/efnafraedi-2e/media/{b}_IS.svg'
        paths = {}
        for tag, rev in (('before', before_rev), ('after', after_rev)):
            data = subprocess.run(['git', 'show', f'{rev}:{rel}'], capture_output=True, check=True).stdout
            p = scratch / f'{b}.{tag}.svg'
            p.write_bytes(data)
            paths[tag] = p
        pb, pa = figparts.parts(str(paths['before'])), figparts.parts(str(paths['after']))
        db, da = paths['before'].read_bytes(), paths['after'].read_bytes()
        tg_a = textgroup(da)
        blobs_b, blobs_a = BLOB.findall(db), BLOB.findall(da)
        head_only = len(blobs_b) == len(blobs_a)
        for x, y in zip(blobs_b, blobs_a):
            tb, ta = tables(x), tables(y)
            head_only = head_only and set(tb) == set(ta) and all(tb[t] == ta[t] for t in tb if t != 'head')
        r = dict(figure=b,
                 artwork_same=pb['artwork_sha256'] == pa['artwork_sha256'],
                 textgroup_changed=pb['textgroup_sha256'] != pa['textgroup_sha256'],
                 textgroup_minus_property_same=tg_a.replace(PROP, b'') == textgroup(db),
                 properties=tg_a.count(PROP),
                 text_count_same=pb['text_count'] == pa['text_count'],
                 faces_same=pb['style_font_faces'] == pa['style_font_faces'],
                 g_opener_same=pb['g_opener'] == pa['g_opener'],
                 woff2_blobs=len(blobs_a), woff2_only_head=head_only)
        ok = all(v for k, v in r.items() if isinstance(v, bool)) and r['properties'] > 0
        all_ok = all_ok and ok
        rows.append(r)
        print(f"{b:40} artwork_same={r['artwork_same']} tg_minus_prop_same={r['textgroup_minus_property_same']} "
              f"props={r['properties']} blobs={r['woff2_blobs']} woff2_only_head={head_only} ok={ok}", flush=True)
    Path(out).write_text(json.dumps(dict(before_rev=before_rev, after_rev=after_rev, all_ok=all_ok, rows=rows), indent=1))
    print(f"figures={len(rows)} properties={sum(r['properties'] for r in rows)} "
          f"woff2 blobs={sum(r['woff2_blobs'] for r in rows)}")
    print(f'PARTS-DONE all_ok={all_ok}')


if __name__ == '__main__':
    main()
