#!/usr/bin/env python3
"""§C140 ⑥a spec § 4.1 — free re-count of STIX runs on the current (post-④) prepare of the 34
bought figures. Read-only: no MT, no figure-run.js, nothing under books/ is touched.

    python3 stix_recount.py --tree <before-tree repo root> --out <compose34 --out root> \
        --report-dir <dir to write stix-recount.json + keys-vs-c4.txt>
        [--c4-blocks <evidence/2026-09-17-c4-build/reports/after/blocks>]

For each of the 34 figures (read from --out/prep/<b>/{meta.json,runs.json,blocks.json} and
--out/work/<b>/compose-report.json):

  1. Recompute `blocks = figtext.merge_blocks(figtext.group(runs))` exactly as compose.py does,
     and `keys = [blockkey.block_key(b) for b in blocks]`. This MUST equal the compose report's
     own `blocks` list (it was produced from the same runs.json by the same functions) - asserted,
     not assumed.
  2. Classify every block key as `kept` (compose-report `runExact`, which already includes
     `identity`) or `translated` (compose-report `translated` MINUS `identity`, i.e. genuinely
     laid out) via Counter/multiset arithmetic over the report's own lists - not by re-deriving
     the kept/identity decision ourselves. This is exact (not merely a heuristic) because the
     decision `compose.py` makes for a block is a pure function of
     (key in TR, TR[key], block_english(block), arc), and two block instances that produce the
     SAME key necessarily share the same `block_english` (both are its own lines text) and, bar a
     pathological is_arc/fit_circle coincidence that cannot yield equal key strings, the same
     `arc` - so every occurrence of one key gets the same classification. Asserted per figure:
     the kept and laid-out multisets are disjoint in KEYS, and their sum equals the full `blocks`
     multiset (an exhaustive partition). A figure that fails either assertion is named in `_meta`
     and skipped for classification (not crashed past).
  3. For each block, a run's base font name is `figscripts._base_name(run, meta['fonts'])`. A
     block with >=1 run named exactly `STIXGeneral-Regular` is a REGULAR STIX block, counted
     `kept_blocks` or `translated_blocks` by its classification above; its characters (from every
     STIXGeneral-Regular run, via `figtext.run_draw_text(run)[0]`) are collected. A block with no
     Regular run but >=1 run in another STIX face (`STIXGeneral-Italic/-Bold/-BoldItalic`, or the
     bare `STIXGeneral`) is counted `other_face_blocks` - a single residual count, per spec § 4.1's
     "separately any other STIX face" (T2 leaves these faces untouched; no kept/translated split
     is asked of them).
  4. Every collected character is checked against the OFFICIAL font's cmap
     (`fontTools.ttLib.TTFont(<font>).getBestCmap()`), after verifying that font's sha256.

Writes `<report-dir>/stix-recount.json`: `{basename: {kept_blocks, translated_blocks,
other_face_blocks, chars, chars_outside_cmap}, "_meta": {...}}` (`chars`/`chars_outside_cmap` are
sorted lists of the actual characters, for auditability; a count is `len(...)`), and
`<report-dir>/keys-vs-c4.txt` (per figure: byte-identical / DIFFERS / no-c4-file, comparing
--out/prep/<b>/blocks.json against --c4-blocks/<b>.blocks.json). Prints totals.
"""
import argparse, collections, hashlib, json, os, sys
from pathlib import Path

FONT_SHA256 = '5add3f3f2bd7fd897d2fa5ccbe468607c52111dc44cdfaaf2d851a574f5357a7'
DEFAULT_FONT = Path('~/.cache/namsbokasafn-figtext/stix-1.1.0/STIXGeneral-Regular.otf').expanduser()
OTHER_STIX_FACES = {'STIXGeneral-Italic', 'STIXGeneral-Bold', 'STIXGeneral-BoldItalic', 'STIXGeneral'}
REGULAR = 'STIXGeneral-Regular'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def font_path():
    p = os.environ.get('FIGTEXT_STIX_FONT')
    return Path(p).expanduser() if p else DEFAULT_FONT


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--tree', required=True, help='the BEFORE tree repository root')
    ap.add_argument('--out', required=True, help="compose34.py's --out root (has prep/ and work/)")
    ap.add_argument('--report-dir', required=True)
    ap.add_argument('--c4-blocks',
                     default=str(Path(__file__).resolve().parents[2]
                                 / '2026-09-17-c4-build' / 'reports' / 'after' / 'blocks'))
    a = ap.parse_args()

    tree = Path(a.tree).resolve()
    composer_dir = tree / 'experiments' / 'figure-text-translation'
    out = Path(a.out).resolve()
    report_dir = Path(a.report_dir).resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    c4_blocks = Path(a.c4_blocks).resolve()

    fp = font_path()
    if not fp.is_file():
        print(f'BLOCKED: font file missing at {fp}', flush=True)
        sys.exit(1)
    actual = sha256(fp)
    if actual != FONT_SHA256:
        print(f'BLOCKED: font sha256 mismatch at {fp}: expected {FONT_SHA256}, got {actual}', flush=True)
        sys.exit(1)
    print(f'font ok: {fp} sha256={actual}', flush=True)

    # Import the BEFORE tree's own figtext/blockkey/figscripts (its group/merge/key/base-name
    # logic is what drew what we are recounting), and its pylibs (fontTools) via the same
    # FIGTEXT_PYLIBS/_deps ordering compose34.py uses.
    os.environ.setdefault('FIGTEXT_PYLIBS', str(composer_dir / 'pylibs'))
    sys.path.insert(0, str(composer_dir))
    import _deps  # noqa: F401,E402
    import figtext as FT  # noqa: E402
    import figscripts as FS  # noqa: E402
    from blockkey import block_key  # noqa: E402
    from fontTools.ttLib import TTFont  # noqa: E402

    cmap = TTFont(str(fp)).getBestCmap()

    prep_root = out / 'prep'
    work_root = out / 'work'
    basenames = sorted(p.name for p in prep_root.iterdir() if p.is_dir())

    recount = {}
    concerns = []
    keys_vs_c4_lines = []

    for b in basenames:
        pd = prep_root / b
        wd = work_root / b
        meta_p, runs_p, blocks_p = pd / 'meta.json', pd / 'runs.json', pd / 'blocks.json'
        report_p = wd / 'compose-report.json'
        if not (meta_p.is_file() and runs_p.is_file() and report_p.is_file()):
            concerns.append(f'{b}: missing meta.json/runs.json/compose-report.json - skipped')
            continue

        # --- keys-vs-c4 (blocks.json byte identity) ---
        c4_file = c4_blocks / f'{b}.blocks.json'
        if not c4_file.is_file():
            keys_vs_c4_lines.append(f'{b}: no-c4-file')
        elif blocks_p.read_bytes() == c4_file.read_bytes():
            keys_vs_c4_lines.append(f'{b}: byte-identical')
        else:
            keys_vs_c4_lines.append(f'{b}: DIFFERS')

        meta = json.loads(meta_p.read_text())
        runs = json.loads(runs_p.read_text())
        blocks = FT.merge_blocks(FT.group(runs))
        keys = [block_key(bl) for bl in blocks]
        report = json.loads(report_p.read_text())

        if keys != report.get('blocks'):
            concerns.append(f'{b}: recomputed block keys != compose-report blocks - skipped classification')
            continue

        blocks_c = collections.Counter(report['blocks'])
        kept_c = collections.Counter(report['runExact'])
        laid_c = collections.Counter(report['translated']) - collections.Counter(report['identity'])

        overlap = set(kept_c) & set(laid_c)
        if overlap:
            concerns.append(f'{b}: kept/laid-out key sets overlap on {sorted(overlap)} - '
                             f'per-block classification is ambiguous for this figure')
        if kept_c + laid_c != blocks_c:
            missing_from_partition = blocks_c - kept_c - laid_c
            extra_in_partition = (kept_c + laid_c) - blocks_c
            concerns.append(f'{b}: kept+laid-out != full blocks multiset '
                             f'(missing={dict(missing_from_partition)}, extra={dict(extra_in_partition)})')

        def classify(key):
            if key in kept_c:
                return 'kept'
            if key in laid_c:
                return 'translated'
            return None

        kept_blocks = translated_blocks = other_face_blocks = 0
        chars = set()
        for bl, key in zip(blocks, keys):
            fonts = meta['fonts']
            base_names = {FS._base_name(r, fonts) for r in bl}
            if REGULAR in base_names:
                cls = classify(key)
                if cls == 'kept':
                    kept_blocks += 1
                elif cls == 'translated':
                    translated_blocks += 1
                else:
                    concerns.append(f'{b}: STIX-Regular block {key!r} has no classification '
                                     f'(not in runExact or translated-not-identity)')
                for r in bl:
                    if FS._base_name(r, fonts) == REGULAR:
                        text, _removed = FT.run_draw_text(r)
                        chars.update(text)
            elif base_names & OTHER_STIX_FACES:
                other_face_blocks += 1

        chars_sorted = sorted(chars)
        outside = sorted(c for c in chars if ord(c) not in cmap)
        recount[b] = dict(kept_blocks=kept_blocks, translated_blocks=translated_blocks,
                           other_face_blocks=other_face_blocks, chars=chars_sorted,
                           chars_outside_cmap=outside)

    recount['_meta'] = dict(font=str(fp), font_sha256=actual, figures=len(basenames), concerns=concerns)
    (report_dir / 'stix-recount.json').write_text(json.dumps(recount, indent=1, ensure_ascii=False))
    (report_dir / 'keys-vs-c4.txt').write_text('\n'.join(keys_vs_c4_lines) + '\n')

    tot_kept = sum(v['kept_blocks'] for k, v in recount.items() if k != '_meta')
    tot_trans = sum(v['translated_blocks'] for k, v in recount.items() if k != '_meta')
    tot_other = sum(v['other_face_blocks'] for k, v in recount.items() if k != '_meta')
    tot_chars = sorted(set().union(*(set(v['chars']) for k, v in recount.items() if k != '_meta')) or [])
    tot_outside = sorted(set().union(*(set(v['chars_outside_cmap']) for k, v in recount.items() if k != '_meta')) or [])
    print(f'TOTALS: kept_blocks={tot_kept} translated_blocks={tot_trans} other_face_blocks={tot_other} '
          f'unique_chars={len(tot_chars)} chars_outside_cmap={len(tot_outside)}', flush=True)
    if concerns:
        print(f'\n!! {len(concerns)} concern(s):', flush=True)
        for c in concerns:
            print(f'     {c}', flush=True)


if __name__ == '__main__':
    main()
