"""§C140 ⑥ licence evidence, 2026-09-16 — the LOCAL half (the primary-source licence research is data/;
network captures made the same day are reports/network-captures.txt).

No network: every official file is a local path the caller downloaded (README § Reproducing).

  1. the official STIX file(s): size, sha256, name records 0/5/7/13/14, CFF Notice; with --stix100, whether 1.0.0
     differs from 1.1.0 in outline, width or Notice (what can and cannot tell the releases apart);
  2. three sampled source PDFs: their Type 1C STIXGeneral-Regular subset against official 1.1.0 — Notice, each glyph's
     DRAWN outline (subroutines resolved) and advance width (PDF /Widths vs official hmtx, tested for equality), with a
     control that must be False; then 2b, the same test over EVERY Type 1C STIXGeneral-Regular object in the tree;
  3. census of the `first-edition` tree's Source_File PDFs (pdffonts): STIX faces, STIX font OBJECTS by type (every
     non-CFF one listed); PDF count in `updates-2e`; EPS files in both trees by a byte search for "STIX";
  4. every books/*/media/*_IS.svg that embeds a font: faces by data-URI type, family + version, name IDs present, CSS
     font-family — and, for each, its same-named copies under books/*/05-publication/: byte-identical or not, and the
     fonts inside the copies that differ;
  5. the Debian copyright stanza for the Liberation fonts installed on this box;
  6. with --liberation1074 DIR (the unpacked official liberation-fonts-ttf-1.07.4 release): License.txt's grant,
     exception (a) and trademark clause, and LiberationSans-Regular.ttf's name records 0/5/13/14.

Usage (from experiments/figure-text-translation):
  PYTHONPATH=./pylibs python3 evidence/2026-09-16-stix-licence/instruments/local_fonts.py \
      --stix110 STIXGeneral-Regular-1.1.0.otf [--stix100 STIXGeneral-1.0.0.otf] [--liberation1074 DIR]
Needs pdffonts (poppler); fontTools + brotli from pylibs/; pikepdf importable (a system package on the box that ran it).
"""
import base64
import collections
import hashlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path

import pikepdf
import fontTools
import fontTools.subset as fsubset
from fontTools.agl import AGL2UV
from fontTools.cffLib import CFFFontSet
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve()
EXP = HERE.parents[3]                     # experiments/figure-text-translation
REPO = EXP.parents[1]
SAMPLES = ['Ch_14/Source_File/CNX_Chem_14_03_FishLemon.pdf',
           'Ch_04/Source_File/CNX_Chem_04_04_sandwich.pdf',
           'Ch_04/Source_File/CNX_Chem_04_02_HClsoln.pdf']
DEBIAN_LIBERATION = sorted(Path('/usr/share/doc').glob('fonts-liberation*/copyright'))


def names(font):
    return {r.nameID: r.toUnicode() for r in font['name'].names if r.platformID == 3}


def official(path):
    raw = Path(path).read_bytes()
    f = TTFont(io.BytesIO(raw))
    top = f['CFF '].cff[f['CFF '].cff.fontNames[0]]
    return raw, f, top


def pdf_stix(path):
    """(BaseFont, CFF top dict, {glyph name: /Widths advance}) of the first Type 1C STIX font object in the PDF."""
    pdf = pikepdf.open(path)
    for o in pdf.objects:
        if isinstance(o, pikepdf.Dictionary) and o.get('/Type') == '/Font' and 'STIX' in str(o.get('/BaseFont')):
            fd = o['/FontDescriptor']
            if '/FontFile3' not in fd:
                continue
            cs = CFFFontSet()
            cs.decompile(io.BytesIO(fd['/FontFile3'].read_bytes()), TTFont())
            top = cs[cs.fontNames[0]]
            first, widths = int(o['/FirstChar']), [float(w) for w in o['/Widths']]
            # pdffonts reports WinAnsi and there is no /Differences: glyph name -> Unicode (AGL) -> cp1252 code
            by_glyph = {}
            for g in top.charset:
                uv = AGL2UV.get(g)
                if uv is None:
                    continue
                try:
                    code = chr(uv).encode('cp1252')[0]
                except UnicodeEncodeError:
                    continue
                if 0 <= code - first < len(widths):
                    by_glyph[g] = widths[code - first]
            return str(o['/BaseFont']), top, by_glyph
    return None, None, None


def iter_stix_cff(path, face):
    """Every Type 1C font object in the PDF whose BaseFont (prefix stripped) equals `face`: (top dict, {glyph: width})."""
    pdf = pikepdf.open(path)
    for o in pdf.objects:
        if not (isinstance(o, pikepdf.Dictionary) and o.get('/Type') == '/Font'):
            continue
        if str(o.get('/BaseFont', '')).lstrip('/').split('+', 1)[-1] != face:
            continue
        fd = o.get('/FontDescriptor')
        if fd is None or '/FontFile3' not in fd:
            continue
        cs = CFFFontSet()
        cs.decompile(io.BytesIO(fd['/FontFile3'].read_bytes()), TTFont())
        top = cs[cs.fontNames[0]]
        widths, first = [float(w) for w in o.get('/Widths', [])], int(o.get('/FirstChar', 0))
        diffs = isinstance(o.get('/Encoding'), pikepdf.Dictionary) and '/Differences' in o['/Encoding']
        by_glyph = {}
        if not diffs:                         # only the plain WinAnsi case is mapped; anything else stays unknown
            for g in top.charset:
                uv = AGL2UV.get(g)
                try:
                    code = chr(uv).encode('cp1252')[0] if uv is not None else None
                except UnicodeEncodeError:
                    code = None
                if code is not None and 0 <= code - first < len(widths):
                    by_glyph[g] = widths[code - first]
        yield top, by_glyph


def outline(top, glyph):
    """The glyph as drawn (subroutines resolved), so a subsetter's re-encoding cannot fake a difference."""
    pen = RecordingPen()
    top.CharStrings[glyph].draw(pen)
    return pen.value


def pdffonts_rows(path):
    """[(font name without subset prefix, type, emb)] — columns split on runs of 2+ spaces, since types contain spaces."""
    out = subprocess.run(['pdffonts', str(path)], capture_output=True, text=True).stdout.splitlines()[2:]
    rows = []
    for line in out:
        m = re.match(r'(\S+)\s+(.+?)\s{2,}(\S+)\s+(yes|no)\s+(yes|no)\s+(yes|no)', line)
        if m:
            rows.append((m.group(1).split('+', 1)[-1], m.group(2).strip(), m.group(4)))
    return rows


def main(args):
    trees = json.loads((EXP / 'sources.local.json').read_text())['efnafraedi-2e']
    base = Path(trees['first-edition'])

    print('== 1. official STIX file(s), as given on the command line')
    offs = []
    for p in [args['--stix110']] + ([args['--stix100']] if args.get('--stix100') else []):
        raw, f, top = official(p)
        n = names(f)
        offs.append((f, top))
        print(f'{Path(p).name}: {len(raw)} bytes, sha256 {hashlib.sha256(raw).hexdigest()}')
        print(f'  name 0: {n.get(0)!r}')
        print(f'  name 5: {n.get(5)!r}\n  name 7: {n.get(7)!r}\n  name 14: {n.get(14)!r}')
        print(f'  name 13: {n.get(13)!r}')
        print(f'  CFF Notice: {top.Notice!r}')
    off, off_top = offs[0]
    off_w = {g: off['hmtx'][g][0] for g in off.getGlyphOrder()}
    if len(offs) > 1:
        f2, t2 = offs[1]
        w2 = {g: f2['hmtx'][g][0] for g in f2.getGlyphOrder()}
        for g in ('plus', 'equal', 'space', 'multiply'):
            print(f'  first vs second official file, {g}: outline identical={outline(off_top, g) == outline(t2, g)}, '
                  f'width identical={off_w.get(g) == w2.get(g)}')
        print(f'  first vs second official file, CFF Notice identical: {off_top.Notice == t2.Notice}')

    print('\n== 2. the Type 1C STIX subset in three sampled source PDFs, against the FIRST official file')
    for rel in SAMPLES:
        name, top, pdf_w = pdf_stix(base / rel)
        glyphs = [g for g in top.charset if g != '.notdef']
        print(f'\n{Path(rel).name}: BaseFont={name}; glyphs besides .notdef: {glyphs}')
        print(f'  CFF Notice identical to official: {top.Notice == off_top.Notice}')
        for g in glyphs:
            print(f'  {g}: outline identical={outline(top, g) == outline(off_top, g)}; '
                  f'width PDF={pdf_w.get(g)} official={off_w.get(g)} identical={pdf_w.get(g) == off_w.get(g)}')
        other = 'minus' if glyphs[-1] != 'minus' else 'equal'
        print(f'  CONTROL {glyphs[-1]} vs official {other!r}: identical={outline(top, glyphs[-1]) == outline(off_top, other)} (must be False)')

    print('\n== 2b. EVERY Type 1C STIXGeneral-Regular object in the first-edition Source_File PDFs, against official 1.1.0')
    n_pdf = n_obj = notice_same = 0
    glyph_total = glyph_same = width_known = width_same = 0
    names_seen = collections.Counter()
    for p in sorted(base.rglob('*')):
        if p.suffix.lower() != '.pdf' or 'Source_File' not in p.parts:
            continue
        objs = list(iter_stix_cff(p, 'STIXGeneral-Regular'))
        if objs:
            n_pdf += 1
        for top, w in objs:
            n_obj += 1
            notice_same += top.Notice == off_top.Notice
            for g in top.charset:
                if g == '.notdef':
                    continue
                glyph_total += 1
                names_seen[g] += 1
                glyph_same += g in off_top.CharStrings and outline(top, g) == outline(off_top, g)
                if g in w:
                    width_known += 1
                    width_same += w[g] == off_w.get(g)
    print(f'  {n_obj} objects in {n_pdf} PDFs; CFF Notice identical to 1.1.0: {notice_same} of {n_obj}')
    print(f'  glyph instances (besides .notdef): {glyph_total}; outline identical to 1.1.0: {glyph_same}')
    print(f'  advance widths determinable (plain WinAnsi, no /Differences): {width_known}; identical to 1.1.0: {width_same}')
    print(f'  distinct glyph names: {len(names_seen)} — {sorted(names_seen)}')

    print('\n== 3. census')
    all_base = sorted(base.rglob('*'))
    pdfs = [p for p in all_base if p.suffix.lower() == '.pdf' and 'Source_File' in p.parts]
    faces, types, with_stix = collections.Counter(), collections.Counter(), 0
    type_examples = collections.defaultdict(list)
    for p in pdfs:
        rows = [r for r in pdffonts_rows(p) if 'STIX' in r[0]]
        if rows:
            with_stix += 1
        faces.update({r[0] for r in rows})
        for r in rows:
            types[r[1]] += 1
            if r[1] != 'Type 1C' or len(type_examples[r[1]]) < 3:     # every non-CFF object; 3 CFF examples
                type_examples[r[1]].append(f'{p.relative_to(base)} {r[0]}')
    n_all_pdf = sum(1 for p in all_base if p.suffix.lower() == '.pdf')
    print(f'first-edition tree: {len(pdfs)} Source_File PDFs of {n_all_pdf} PDFs in the tree; {with_stix} embed a STIX face')
    print('  STIX faces, counted as PDFs per face (a PDF with two faces counts once for each):')
    for k, v in faces.most_common():
        print(f'    {v:4d}  {k}')
    print('  STIX font OBJECTS by pdffonts type:')
    for k, v in types.most_common():
        print(f'    {v:4d}  {k}   e.g. {type_examples[k]}')
    upd = trees.get('updates-2e')
    if upd:
        print(f"  updates-2e tree: {sum(1 for p in Path(upd).rglob('*') if p.suffix.lower() == '.pdf')} PDFs of any kind")
    for label, root in trees.items():
        epss = [p for p in Path(root).rglob('*') if p.suffix.lower() == '.eps']
        print(f'  {label}: EPS files containing the bytes "STIX": {sum(1 for p in epss if b"STIX" in p.read_bytes())} of {len(epss)}')

    print('\n== 4. fonts embedded in books/*/media/*_IS.svg')
    print(f'  fontTools {fontTools.version}: subset Options().name_IDs default = {fsubset.Options().name_IDs}')
    pub_copies = collections.defaultdict(list)
    for q in REPO.glob('books/*/05-publication/**/*_IS.svg'):
        pub_copies[q.name].append(q)
    faces_of = lambda text: re.findall(r"url\(data:font/([a-z0-9-]+);base64,([^)]+)\)", text)
    groups = collections.defaultdict(lambda: {'files': set(), 'faces': 0, 'ids': collections.Counter(), 'css': collections.Counter(),
                                              'n0': collections.Counter(), 'copies': 0, 'identical': 0, 'files_all_identical': 0,
                                              'differing_copy_fonts': collections.Counter()})
    no_font = []
    for svg_path in sorted(REPO.glob('books/*/media/*_IS.svg')):
        raw = svg_path.read_bytes()
        svg = raw.decode('utf-8', errors='replace')
        found = faces_of(svg)
        if not found:
            no_font.append(str(svg_path.relative_to(REPO)))
            continue
        css = set(re.findall(r"font-family:\s*'([^']+)'", svg))
        keys = set()
        for kind, b64 in found:
            try:
                f = TTFont(io.BytesIO(base64.b64decode(b64)))
                n = names(f)
                key = (kind, f"{n.get(1)} | {n.get(5)}")
            except Exception as e:                      # a face we cannot parse is reported, never dropped
                key, n = (kind, f'UNPARSEABLE {type(e).__name__}'), {}
            g = groups[key]
            keys.add(key)
            g['files'].add(svg_path.name)
            g['faces'] += 1
            g['ids'][tuple(sorted(n))] += 1
            g['n0'][n.get(0)] += 1
            for c in css:
                g['css'][c] += 1
        copies = pub_copies.get(svg_path.name, [])
        same = [q for q in copies if q.read_bytes() == raw]
        for key in keys:
            g = groups[key]
            g['copies'] += len(copies)
            g['identical'] += len(same)
            g['files_all_identical'] += bool(copies) and len(same) == len(copies)
            for q in copies:
                if q.read_bytes() != raw:
                    for kind2, b642 in faces_of(q.read_text(encoding='utf-8', errors='replace')):
                        try:
                            n2 = names(TTFont(io.BytesIO(base64.b64decode(b642))))
                            g['differing_copy_fonts'][f"{kind2} | {n2.get(1)} | {n2.get(5)}"] += 1
                        except Exception as e:
                            g['differing_copy_fonts'][f'{kind2} | UNPARSEABLE {type(e).__name__}'] += 1
    for (kind, label), g in sorted(groups.items(), key=lambda kv: -len(kv[1]['files'])):
        print(f"  data:font/{kind} — {label}: {len(g['files'])} files, {g['faces']} faces")
        print(f"    name IDs present: {dict(g['ids'])}")
        print(f"    CSS font-family names in those files: {dict(g['css'])}")
        print(f"    name ID 0: {dict(g['n0'])}")
        print(f"    same-named copies under books/*/05-publication/: {g['copies']}; byte-identical: {g['identical']}; "
              f"files whose every copy is identical: {g['files_all_identical']}")
        print(f"    faces inside the copies that DIFFER: {dict(g['differing_copy_fonts'])}")
    print(f"  _IS.svg files in books/*/media/ with no embedded font: {no_font}")

    print('\n== 5. Debian copyright stanza for the Liberation fonts installed on this box')
    for p in DEBIAN_LIBERATION:
        lines = p.read_text(encoding='utf-8').splitlines()
        stop = next((i for i, l in enumerate(lines) if l.startswith('License:')), 12)
        print(f'  {p}:')
        for l in lines[:stop + 1]:
            print(f'    {l}')


    if args.get('--liberation1074'):
        d = Path(args['--liberation1074'])
        print('\n== 6. the official Liberation Fonts 1.07.4 release, unpacked at the given directory')
        lic = (d / 'License.txt').read_text(encoding='utf-8', errors='replace')
        for needle in ('grants to the user', '(a) As a special exception', 'If Client makes a redistribution'):
            i = lic.find(needle)
            print(f'  License.txt: {lic[i:i + 420].strip()!r}' if i >= 0 else f'  License.txt: {needle!r} NOT FOUND')
        n = names(TTFont(d / 'LiberationSans-Regular.ttf'))
        for k in (0, 5, 13, 14):
            print(f'  LiberationSans-Regular.ttf name {k}: {n.get(k)!r}')


def parse(argv):
    args, i = {}, 0
    while i < len(argv):
        if argv[i] in ('--stix110', '--stix100', '--liberation1074') and i + 1 < len(argv):
            args[argv[i]] = argv[i + 1]
            i += 2
        else:
            raise SystemExit(f'unknown or incomplete argument: {argv[i]!r}')
    if '--stix110' not in args:
        raise SystemExit('--stix110 is required')
    return args


if __name__ == '__main__':
    main(parse(sys.argv[1:]))
