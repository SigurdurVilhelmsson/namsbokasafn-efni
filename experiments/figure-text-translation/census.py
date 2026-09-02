#!/usr/bin/env python3
"""Census a directory of figure PDFs: what is automatable, and what is not.

    FIGTEXT_PYLIBS=./pylibs python3 census.py <dir-of-pdfs> [--json out.json]

Answers, per figure, the only questions that decide build-vs-hand-edit:
  * is the text LIVE, or outlined into paths?  (outlined => manual, no exceptions)
  * is the font SUBSTITUTABLE?  A proprietary subset font cannot be replaced with
    one carrying Icelandic glyphs, so that figure is manual regardless.
  * can THIS parser read it?  Type0/CID is a known gap - reported, never guessed.
  * how much text, and how much of it is set on a curve (per-glyph placement)?
"""
import sys, json, re, subprocess, collections
from pathlib import Path
import _deps
from _deps import read_content
import pikepdf
from pdftext import parse
import figtext as FT

# Families we can substitute a full Icelandic-covering face for. Everything else
# needs checking by hand before its figure is called automatable.
SUBSTITUTABLE = ('liberation', 'arial', 'helvetica', 'times', 'courier',
                 'dejavu', 'nimbus', 'freesans', 'myriad')

OPS = re.compile(r"(?<![\w/])(BT|ET|Tj|TJ|'|\"|Tm|Td|TD|T\*|TL|Tc|Tw|Tz|Ts|Tf|cm|q|Q|Do|sh)(?![\w])")


def one(path):
    r = dict(file=path.name, error=None)
    try:
        pdf = pikepdf.open(path)
    except Exception as e:
        r['error'] = f"open: {e}"; return r
    r['pages'] = len(pdf.pages)
    page = pdf.pages[0]
    try:
        content = read_content(page)
    except Exception as e:
        r['error'] = f"contents: {e}"; return r

    box = page.get('/MediaBox') or page.get('/CropBox')
    r['page_pt'] = [round(float(box[2]), 1), round(float(box[3]), 1)] if box else None
    r['ops'] = sorted({m.group() for m in OPS.finditer(content)})

    fonts, widths, cid, nonsub = {}, {}, [], []
    res = page.get('/Resources') or {}
    for name, fobj in (res.get('/Font') or {}).items():
        key = '/' + str(name).lstrip('/')
        base = str(fobj.get('/BaseFont', '?'))
        sub = str(fobj.get('/Subtype', '?'))
        fonts[key] = dict(base=base, subtype=sub)
        fam = base.split('+')[-1].lower()
        if sub == '/Type0':
            cid.append(base)
        if not any(s in fam for s in SUBSTITUTABLE):
            nonsub.append(base)
        try:
            first = int(fobj.FirstChar)
            widths[key] = {first + i: float(w) / 1000.0
                           for i, w in enumerate(fobj.Widths)}
        except Exception:
            widths[key] = {}
    r['fonts'] = fonts
    r['cid_fonts'] = sorted(set(cid))
    r['unsubstitutable_fonts'] = sorted(set(nonsub))

    if not fonts:
        r['verdict'] = 'NO LIVE TEXT'
        r['runs'] = r['blocks'] = r['words'] = 0
        return r

    runs = parse(content, widths)
    runs = [x for x in runs if x['text'].strip()]
    r['runs'] = len(runs)
    if not runs:
        r['verdict'] = 'NO LIVE TEXT'; r['blocks'] = r['words'] = 0; return r

    blocks = FT.merge_blocks(FT.group(runs))
    r['blocks'] = len(blocks)
    r['arc_blocks'] = sum(1 for b in blocks if FT.is_arc(b))
    def blocktext(b):
        return (''.join(y['text'] for y in b) if FT.is_arc(b)
                else ' '.join(''.join(y['text'] for y in l) for l in FT.lines(b)))
    bt = [blocktext(b) for b in blocks]
    prose = [t for t in bt if not FT.looks_verbatim(t)]
    r['verbatim_blocks'] = len(bt) - len(prose)
    r['prose_blocks'] = len(prose)
    text = ' '.join(bt)
    r['words'] = len(text.split())
    r['prose_words'] = len(' '.join(prose).split())
    r['single_char_runs'] = sum(1 for x in runs if len(x['text'].strip()) == 1)
    r['sample'] = [(''.join(y['text'] for y in b) if FT.is_arc(b)
                    else '|'.join(''.join(y['text'] for y in l) for l in FT.lines(b)))
                   for b in blocks[:3]]

    if r['cid_fonts']:
        r['verdict'] = 'PARSER GAP (Type0/CID)'
    elif r['unsubstitutable_fonts']:
        r['verdict'] = 'FONT RISK'
    elif r['pages'] > 1:
        r['verdict'] = 'MULTI-PAGE'
    else:
        r['verdict'] = 'AUTOMATABLE'
    return r


def main(d, jout=None):
    files = sorted(Path(d).glob('*.pdf'))
    rows = [one(f) for f in files]
    w = max(len(x['file']) for x in rows)
    print(f"{'figure':{w}}  {'verdict':22} {'blk':>4} {'prose':>6} {'verb':>5} "
          f"{'words':>6} {'arc':>4}  fonts")
    print('-' * (w + 76))
    for x in rows:
        if x['error']:
            print(f"{x['file']:{w}}  {'ERROR':22} {x['error'][:40]}"); continue
        fam = ','.join(sorted({v['base'].split('+')[-1] for v in x['fonts'].values()})) or '-'
        print(f"{x['file']:{w}}  {x['verdict']:22} {x['blocks']:>4} "
              f"{x.get('prose_blocks',0):>6} {x.get('verbatim_blocks',0):>5} "
              f"{x.get('prose_words',0):>6} {x.get('arc_blocks',0):>4}  {fam[:36]}")
    print()
    c = collections.Counter(x['verdict'] for x in rows if not x['error'])
    for k, v in c.most_common():
        print(f"  {k:24} {v}")
    print(f"\n  blocks total              {sum(x.get('blocks',0) for x in rows)}")
    print(f"    of which PROSE (to MT)  {sum(x.get('prose_blocks',0) for x in rows)}")
    print(f"    of which VERBATIM       {sum(x.get('verbatim_blocks',0) for x in rows)}"
          "   formulas / numbers / symbols - never sent to MT")
    print(f"  words in prose blocks     {sum(x.get('prose_words',0) for x in rows)}")
    if jout:
        Path(jout).write_text(json.dumps(rows, indent=1, ensure_ascii=False))
        print(f"\n  -> {jout}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    j = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
    main(sys.argv[1], j)
