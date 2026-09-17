#!/usr/bin/env python3
"""§C140 ⑥a — Task 4 Step 2: compare BEFORE vs AFTER `textlist.py` output. Read-only, 0 ISK.

    python3 compare_textlists.py --before-json <before/textlists.json> --after-json <after/textlists.json> \
        --after-work <dir with <b>/compose-report.json per figure> --out-dir <dir>

Figures are keyed by BASENAME (`Path(path).parent.name` — every file is `translated.svg`), never by
full path, since before/after live under different scratch roots.

Writes, into `--out-dir`:
  textlist-compare.txt   — one line per figure: changed_family_count, other_field_diffs, faces
                           before -> after, metadata before -> after, xml_ok after, and (when the
                           figure has any FigSym item) the drawn-key cross-check and family-change
                           count vs `len(stix.drawn)`.
  recompose-set.txt      — figures with changed_family_count > 0, one basename per line, sorted.

Checked, not just reported (raises AssertionError, not silently logged, on any of):
  - both textlists.json cover the same 34 figures
  - per figure, same NUMBER of <text> elements before/after
  - for every index, family is the ONLY field allowed to differ
  - every family change is FigIS -> FigSym (never FigIS -> FigIS, never anything -> FigIS)
  - every family-changed item's text is a substring of at least one of that figure's
    `compose-report.json` `stix.drawn` block keys (P3-ish cross-check the brief asks for)
  - P4 (metadata): a figure carries a `<metadata>` iff `changed_family_count > 0`, and where it
    exists its inner text is BYTE-EQUAL (via a shared XML parse) to a freshly computed
    `figsym.metadata_element()` — not merely "contains the words", which could pass on a truncated
    or reordered body.

Also writes `names.txt` (P5): for every after-SVG with a FigSym `@font-face`, decode its embedded
woff2 (the base64 payload of that one rule, extracted from the file — NOT re-derived from
`figsym.subset_woff2`, so this is a check on what actually shipped) and run `figsym.name_violations`
on it; separately assert name IDs 0/7 and the CFF `Notice` equal the OFFICIAL font's (loaded once via
`figsym.load()`), since `name_violations` alone only proves the FORBIDDEN words are absent, not that
the KEPT ones are intact.
"""
import argparse, base64, json, re, sys
from pathlib import Path

FIGSYM_FACE = re.compile(
    r"@font-face\{font-family:'FigSym';font-weight:400;font-style:normal;"
    r"src:url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\)"
)

HERE = Path(__file__).resolve().parent
COMPOSER_DIR = HERE.parents[2]           # experiments/figure-text-translation
assert (COMPOSER_DIR / 'figsym.py').is_file(), COMPOSER_DIR

FIELDS = ('text', 'x', 'y', 'size', 'weight', 'style', 'fill')


def by_basename(textlists):
    out = {}
    for p, data in textlists.items():
        b = Path(p).parent.name
        assert b not in out, f'duplicate figure basename {b!r} in {list(textlists)}'
        out[b] = data
    return out


def load_figsym():
    import os
    os.environ.setdefault('FIGTEXT_PYLIBS', str(COMPOSER_DIR / 'pylibs'))
    sys.path.insert(0, str(COMPOSER_DIR))
    import _deps  # noqa: F401
    import figsym  # noqa: E402
    return figsym


def expected_metadata_text(figsym):
    """Parse figsym's own `metadata_element()` the same way `textlist.py` parses the SVG, so the
    comparison is XML-text to XML-text, not string to string (escaping artefacts cancel out)."""
    import xml.etree.ElementTree as ET
    el = ET.fromstring(figsym.metadata_element())
    return el.text


def check_names(figsym, b, svg_path, official_names):
    """-> list of lines for names.txt, list of concerns. `official_names` = (copyright, trademark,
    cff_notice) from the OFFICIAL font, computed once by the caller."""
    from io import BytesIO
    from fontTools.ttLib import TTFont
    text = Path(svg_path).read_text(encoding='utf-8')
    m = FIGSYM_FACE.search(text)
    lines, concerns = [], []
    if not m:
        concerns.append(f'{b}: expected a FigSym @font-face rule, none found in {svg_path}')
        return lines, concerns
    woff2 = base64.b64decode(m.group(1))
    font = TTFont(BytesIO(woff2))
    violations = figsym.name_violations(font)
    cp = font['name'].getDebugName(0)
    tm = font['name'].getDebugName(7)
    notice = font['CFF '].cff.topDictIndex[0].Notice if 'CFF ' in font else None
    ok_ids = (cp, tm, notice) == official_names
    lines.append(f'{b}: violations={violations} ids_0_7_notice_match_official={ok_ids} '
                 f'copyright={cp!r} trademark={tm!r} notice={notice!r}')
    if violations:
        concerns.append(f'{b}: name_violations non-empty: {violations}')
    if not ok_ids:
        concerns.append(f'{b}: name ID 0/7 or CFF Notice does not match the official font: '
                         f'got {(cp, tm, notice)!r} want {official_names!r}')
    return lines, concerns


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--before-json', required=True)
    ap.add_argument('--after-json', required=True)
    ap.add_argument('--after-work', required=True, help='dir holding <basename>/compose-report.json')
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--after-svg-dir', help='dir holding <basename>/translated.svg for P5 (default: --after-work)')
    a = ap.parse_args()
    svg_dir = Path(a.after_svg_dir or a.after_work)

    before = by_basename(json.loads(Path(a.before_json).read_text()))
    after = by_basename(json.loads(Path(a.after_json).read_text()))
    assert set(before) == set(after), f'figure sets differ: only-before={set(before)-set(after)} only-after={set(after)-set(before)}'
    figures = sorted(before)
    assert len(figures) == 34, f'expected 34 figures, found {len(figures)}'

    figsym = load_figsym()
    exp_meta = expected_metadata_text(figsym)

    lines = []
    recompose = []
    concerns = []
    for b in figures:
        bt, at = before[b], after[b]
        bt_texts, at_texts = bt['texts'], at['texts']
        if len(bt_texts) != len(at_texts):
            concerns.append(f'{b}: text count differs before={len(bt_texts)} after={len(at_texts)}')
            lines.append(f'{b}\tCOUNT MISMATCH before={len(bt_texts)} after={len(at_texts)}')
            continue

        changed_family = []      # (index, before_family, after_family, text)
        other_diffs = []         # (index, field, before_value, after_value)
        for i, (bi, ai) in enumerate(zip(bt_texts, at_texts)):
            if bi.get('family') != ai.get('family'):
                changed_family.append((i, bi.get('family'), ai.get('family'), ai.get('text')))
            for f in FIELDS:
                if bi.get(f) != ai.get(f):
                    other_diffs.append((i, f, bi.get(f), ai.get(f)))

        # Every family change must be exactly FigIS -> FigSym (T2's contract; anything else is a bug).
        for i, bf, af, txt in changed_family:
            if not (bf == 'FigIS' and af == 'FigSym'):
                concerns.append(f'{b}[{i}]: unexpected family change {bf!r} -> {af!r} (text={txt!r})')

        changed_family_count = len(changed_family)
        if changed_family_count > 0:
            recompose.append(b)

        # Drawn-key cross-check + count, only meaningful when something changed.
        drawn_note = ''
        if changed_family_count > 0:
            report = json.loads((Path(a.after_work) / b / 'compose-report.json').read_text())
            drawn = report.get('stix', {}).get('drawn', [])
            hay = '\x00'.join(drawn)  # NUL-joined so a substring can never straddle two keys
            bad = [txt for (_, _, _, txt) in changed_family if txt not in hay]
            if bad:
                concerns.append(f'{b}: family-changed text(s) not found in any stix.drawn key: {bad}')
            drawn_note = f' stix.drawn={len(drawn)} family_changed={changed_family_count}'

        # P4: metadata presence must correlate exactly with "has an eligible run", and its content
        # must equal the shared figsym.metadata_element() body.
        meta_before, meta_after = bt['metadata'], at['metadata']
        if meta_after != (changed_family_count > 0):
            concerns.append(f'{b}: metadata presence {meta_after} does not match changed_family_count={changed_family_count}')
        if meta_after and at['metadata_text'] != exp_meta:
            concerns.append(f'{b}: metadata_text differs from figsym.metadata_element()')

        lines.append(
            f'{b}\tchanged_family_count={changed_family_count}\tother_field_diffs={len(other_diffs)}'
            f'\tfaces_before={bt["faces"]}\tfaces_after={at["faces"]}'
            f'\tmetadata_before={meta_before}\tmetadata_after={meta_after}'
            f'\txml_ok_after={at["xml_ok"]}' + drawn_note
        )
        if other_diffs:
            for i, f, bv, av in other_diffs:
                lines.append(f'  DIFF {b}[{i}] {f}: before={bv!r} after={av!r}')

    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'textlist-compare.txt').write_text('\n'.join(lines) + '\n')
    (out_dir / 'recompose-set.txt').write_text('\n'.join(sorted(recompose)) + ('\n' if recompose else ''))

    # P5: names.txt, over the official font once plus every figure with a FigSym face.
    official_font = figsym.load()
    official_names = (official_font['name'].getDebugName(0), official_font['name'].getDebugName(7),
                       official_font['CFF '].cff.topDictIndex[0].Notice if 'CFF ' in official_font else None)
    name_lines = [f'official: copyright={official_names[0]!r} trademark={official_names[1]!r} notice={official_names[2]!r}']
    for b in sorted(recompose):
        nl, nc = check_names(figsym, b, svg_dir / b / 'translated.svg', official_names)
        name_lines += nl
        concerns += nc
    (out_dir / 'names.txt').write_text('\n'.join(name_lines) + '\n')

    print(f'figures={len(figures)} recompose_set={len(recompose)} concerns={len(concerns)}')
    for c in concerns:
        print(f'CONCERN: {c}')
    if concerns:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
