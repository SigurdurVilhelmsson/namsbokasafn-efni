#!/usr/bin/env python3
"""Tests for strip-text.py's text-object rule (§C140 ④). Run:

    FIGTEXT_PYLIBS=./pylibs python3 test_strip_text.py

Plain checks, like the other suites. Every pixel assertion compares a VALUE, never a count of non-white pixels
(a recoloured element has the same count), and every property is paired with a negative arm built from the
shipped rule (drop everything inside BT..ET), which must FAIL the same assertion — so the test can see the defect.
"""
import importlib.util
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import _deps  # noqa: F401  — sys.path, never process.cwd()

import pikepdf  # noqa: E402
from PIL import Image  # noqa: E402

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('strip_text_tool', HERE / 'strip-text.py')
ST = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ST)
N = pikepdf.Name
WORK = Path(tempfile.mkdtemp(prefix='c4-strip-test-'))
fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''))
    if not ok:
        fails.append(label)


def old_rule(source):
    """The shipped rule, frozen here as the negative arm: every instruction inside BT..ET is dropped."""
    owner = None
    if isinstance(source, (bytes, bytearray)):
        owner = pikepdf.new()
        source = owner.make_stream(bytes(source))
    out, depth = [], 0
    for ins in pikepdf.parse_content_stream(source):
        if isinstance(ins, pikepdf.ContentStreamInlineImage):
            if depth == 0:
                out.append(ins)
            continue
        op = str(ins.operator)
        if op == 'BT':
            depth += 1
            continue
        if op == 'ET':
            depth = max(0, depth - 1)
            continue
        if depth == 0:
            out.append(ins)
    data = pikepdf.unparse_content_stream(out)
    del owner
    return data


def page_pdf(content, dst, in_form=False):
    """A 100x100 pt page drawing `content`, on the page or inside one /Form. -> dst."""
    pdf = pikepdf.new()
    font = pdf.make_indirect(pikepdf.Dictionary(Type=N('/Font'), Subtype=N('/Type1'), BaseFont=N('/Helvetica')))
    gs = pdf.make_indirect(pikepdf.Dictionary(Type=N('/ExtGState'), LW=6))
    res = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font), ExtGState=pikepdf.Dictionary(GS1=gs))
    page = pdf.add_blank_page(page_size=(100, 100))
    if in_form:
        form = pdf.make_stream(content)
        form.Type, form.Subtype = N('/XObject'), N('/Form')
        form.BBox = pikepdf.Array([0, 0, 100, 100])
        form.Resources = res
        page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Fm0=pdf.make_indirect(form)))
        page.Contents = pdf.make_stream(b'q /Fm0 Do Q\n')
    else:
        page.Resources = res
        page.Contents = pdf.make_stream(content)
    pdf.save(dst)
    return dst


def render(pdf_path, tag):
    base = WORK / tag
    subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf_path), str(base)], check=True)
    return Image.open(f'{base}.png').convert('RGB')


def words(pdf_path):
    r = subprocess.run(['pdftotext', str(pdf_path), '-'], capture_output=True, text=True)
    return r.stdout.split()


def strip_with(src, dst, rule):
    """Strip `src` into `dst` with ST.strip_text, the text-object rule replaced by `rule` when given."""
    saved = ST.strip_text_ops
    if rule is not None:
        ST.strip_text_ops = lambda s: (rule(s), 0, 0)
    try:
        pdf = pikepdf.open(src)
        stats = ST.strip_text(pdf)
        pdf.save(dst)
        return stats
    finally:
        ST.strip_text_ops = saved


# 200 dpi: 1 pt = 200/72 px. The second square spans 55..85 pt in x and 20..50 pt in y (PDF y up).
def px(img, x_pt, y_pt):
    s = 200 / 72
    return img.getpixel((int(x_pt * s), int((100 - y_pt) * s)))


# ── 1. A fill colour set inside BT paints the artwork drawn after ET ────────────────────────────
print('\n[1] fill colour set inside a text object survives the strip')
COLOUR = (b'0 0 0 rg 5 20 30 30 re f\n'
          b'BT 1 0 0 rg /F1 12 Tf 5 70 Td (Hi) Tj ET\n'
          b'55 20 30 30 re f\n')
for where in ('page', 'form'):
    src = page_pdf(COLOUR, WORK / f'colour-{where}.pdf', in_form=(where == 'form'))
    new_out, old_out = WORK / f'colour-{where}-new.pdf', WORK / f'colour-{where}-old.pdf'
    stats = strip_with(src, new_out, None)
    strip_with(src, old_out, old_rule)
    s, n, o = render(src, f'c-{where}-src'), render(new_out, f'c-{where}-new'), render(old_out, f'c-{where}-old')
    check(f'1a-{where} CONTROL — the source paints the second square red', px(s, 70, 35)[0] > 200 and px(s, 70, 35)[1] < 60,
          f'source pixel {px(s, 70, 35)}')
    check(f'1b-{where} NEGATIVE ARM — the shipped rule paints it black', px(o, 70, 35)[0] < 60,
          f'old-rule pixel {px(o, 70, 35)} (if red, this fixture cannot show the defect)')
    check(f'1c-{where} the fixed strip paints it red, like the source', px(n, 70, 35) == px(s, 70, 35),
          f'fixed {px(n, 70, 35)} vs source {px(s, 70, 35)}')
    check(f'1d-{where} and says it kept the state', stats['state_kept'] == 1, f"state_kept={stats['state_kept']}")
    def glyph_box_dark(img):     # the "Hi" glyphs sit in x 5..20 pt, y 68..80 pt; nothing else is drawn there
        s_ = 200 / 72
        box = img.crop((int(5 * s_), int(20 * s_), int(20 * s_), int(32 * s_)))
        return sum(1 for p in box.getdata() if sum(p) < 600)
    check(f'1e-{where} CONTROL — the source draws glyph ink in the glyph box', glyph_box_dark(s) > 20,
          f'{glyph_box_dark(s)} dark px')
    check(f'1f-{where} the text is still removed: no glyph ink, no words', glyph_box_dark(n) == 0 and words(new_out) == [],
          f'{glyph_box_dark(n)} dark px, words {words(new_out)}')

# ── 2. An ExtGState set inside BT survives too ─────────────────────────────────────────────────
print('\n[2] an ExtGState set inside a text object survives the strip')
GS = (b'BT /GS1 gs /F1 12 Tf 5 70 Td (Hi) Tj ET\n'
      b'0 0 0 RG 10 40 m 90 40 l S\n')
src = page_pdf(GS, WORK / 'gs.pdf')
new_out, old_out = WORK / 'gs-new.pdf', WORK / 'gs-old.pdf'
strip_with(src, new_out, None)
strip_with(src, old_out, old_rule)
s, n, o = render(src, 'gs-src'), render(new_out, 'gs-new'), render(old_out, 'gs-old')
# 1 pt default width is ~3 px thick at 200 dpi; the /LW 6 line is ~17 px. Sample 2.5 pt above the line centre.
check('2a CONTROL — the source line is thick', px(s, 50, 42.5)[0] < 60, f'source pixel {px(s, 50, 42.5)}')
check('2b NEGATIVE ARM — the shipped rule draws it thin', px(o, 50, 42.5)[0] > 200, f'old-rule pixel {px(o, 50, 42.5)}')
check('2c the fixed strip draws it thick, like the source', px(n, 50, 42.5) == px(s, 50, 42.5),
      f'fixed {px(n, 50, 42.5)} vs source {px(s, 50, 42.5)}')

# ── 3. Anything else inside BT refuses, loudly, from a page and from a form ─────────────────────
print('\n[3] any other operator inside a text object refuses the figure')
REFUSED = {
    'q': b'BT q /F1 12 Tf (x) Tj Q ET\n',
    'cm': b'BT 1 0 0 1 5 5 cm /F1 12 Tf (x) Tj ET\n',
    'BDC': b'BT /Span <</ActualText (x)>> BDC /F1 12 Tf (x) Tj EMC ET\n',
    're': b'BT 0 0 10 10 re f /F1 12 Tf (x) Tj ET\n',
    'Do': b'BT /Fm9 Do /F1 12 Tf (x) Tj ET\n',
    'BX': b'BT BX /F1 12 Tf (x) Tj EX ET\n',
    'zz': b'BT zz /F1 12 Tf (x) Tj ET\n',
}
for op, content in REFUSED.items():
    for where in ('page', 'form'):
        src = page_pdf(content, WORK / f'refuse-{op}-{where}.pdf', in_form=(where == 'form'))
        try:
            strip_with(src, WORK / f'refuse-{op}-{where}-out.pdf', None)
            raised, msg = None, ''
        except ST.UnparsableStream as exc:
            raised, msg = exc, str(exc)
        check(f'3-{op}-{where} refused, naming the operator',
              raised is not None and f"'{op}'" in msg, f'{type(raised).__name__ if raised else "no exception"}: {msg[:160]}')
# ── 3-inline: an inline image inside BT ────────────────────────────────────────────────────────
def _raises_inline():
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(100, 100))
    page.Contents = pdf.make_stream(b'BT BI /W 1 /H 1 /BPC 8 /CS /G ID \x00 EI ET\n')
    try:
        ST.strip_text_ops(page)
        return False, 'no exception'
    except ST.TextObjectOperatorRefused as exc:
        return True, str(exc)


ok, msg = _raises_inline()
check('3-inline an inline image inside a text object is refused', ok, msg[:160])

# ── 4. Order and constants ──────────────────────────────────────────────────────────────────────
print('\n[4] kept operators keep their place; the two operator sets are disjoint')
data, removed, kept = ST.strip_text_ops(b'0 0 1 rg BT 1 0 0 rg /F1 12 Tf (x) Tj ET 5 5 10 10 re f\n')
_owner = pikepdf.new()          # a NAMED owner: an inline pikepdf.new() dies mid-expression (strip-text.py docstring)
ops = [str(i.operator) for i in pikepdf.parse_content_stream(_owner.make_stream(data))]
check('4a order: the kept rg sits after the earlier rg and before the fill', ops == ['rg', 'rg', 're', 'f'],
      f'operators {ops}, removed={removed}, kept={kept}')
check('4b constants are disjoint', not (ST.TEXT_OPERATORS & ST.PERSISTENT_STATE_OPERATORS),
      str(ST.TEXT_OPERATORS & ST.PERSISTENT_STATE_OPERATORS))
check('4c the allowlist is exactly the approved set',
      ST.PERSISTENT_STATE_OPERATORS == frozenset('g G rg RG k K cs CS sc SC scn SCN gs w J j M d ri i'.split()),
      str(sorted(ST.PERSISTENT_STATE_OPERATORS)))
check('4d the text operators are exactly the approved set',
      ST.TEXT_OPERATORS == frozenset(['Tc', 'Tw', 'Tz', 'TL', 'Tf', 'Tr', 'Ts', 'Td', 'TD', 'Tm', 'T*', 'Tj', 'TJ', "'", '"']),
      str(sorted(ST.TEXT_OPERATORS)))

# ── 5. Serialiser control ───────────────────────────────────────────────────────────────────────
print('\n[5] a stream without text round-trips pixel-identically')
src = page_pdf(b'0 0 1 rg 10 10 80 80 re f\n', WORK / 'notext.pdf')
out = WORK / 'notext-out.pdf'
st5 = strip_with(src, out, None)
check('5 no text: same pixels, nothing kept or removed',
      list(render(src, 'nt-src').getdata()) == list(render(out, 'nt-out').getdata()) and st5['state_kept'] == 0,
      f"state_kept={st5['state_kept']}")

# ── 6. Corpus anchor: combustion's arrowheads (local only) ──────────────────────────────────────
print('\n[6] corpus anchor — combustion, inside an arrowhead component')
try:
    import read_layer_accept as H  # noqa: E402
    resolve = H.resolver()
    path, _ = resolve('CNX_Chem_04_05_combustion')
except Exception as exc:  # noqa: BLE001 — a box without the source tree
    path = None
    print(f'  SKIP  6: source tree unavailable ({type(exc).__name__}: {exc})')
if path:
    with H.staged(path) as (staged, err):
        assert not err, err
        new_out, old_out = WORK / 'comb-new.pdf', WORK / 'comb-old.pdf'
        strip_with(staged, new_out, None)
        strip_with(staged, old_out, old_rule)
        s, n, o = render(staged, 'comb-src'), render(new_out, 'comb-new'), render(old_out, 'comb-old')
    # Rows 150-177, cols 267-305 at 200 dpi hold the largest arrowhead (exploration render/logs/post_pass.log).
    # Find a pixel inside it where the SOURCE is dark — never the bbox midpoint, which falls between arrowheads.
    cand = [(c, r) for r in range(150, 178) for c in range(267, 306) if sum(s.getpixel((c, r))) < 150]
    probe = cand[len(cand) // 2] if cand else None
    check('6a CONTROL — a dark source pixel exists inside the arrowhead box', probe is not None, str(probe))
    if probe:
        check('6b NEGATIVE ARM — the shipped rule does not match the source there',
              o.getpixel(probe) != s.getpixel(probe), f'old {o.getpixel(probe)} vs source {s.getpixel(probe)}')
        check('6c the fixed strip matches the source there', n.getpixel(probe) == s.getpixel(probe),
              f'fixed {n.getpixel(probe)} vs source {s.getpixel(probe)}')

shutil.rmtree(WORK, ignore_errors=True)
print(f"\n  {'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(0 if not fails else 1)
