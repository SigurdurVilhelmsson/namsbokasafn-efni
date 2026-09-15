"""Shared helpers for the c3 container / collision measurements (scratch only)."""
import json, math, sys, os
from pathlib import Path

C3 = Path('/home/siggi/dev/scratch-c140/c3')   # read-only inputs
C3B = Path('/home/siggi/dev/scratch-c140/c3b')
PREP = Path('/home/siggi/dev/scratch-c140/prep')
REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
EXP = REPO / 'experiments/figure-text-translation'
SIDE = REPO / 'books/efnafraedi-2e/figure-text'
sys.path.insert(0, str(C3 / 'pylibs-np'))
sys.path.insert(0, str(EXP / 'pylibs'))
sys.path.insert(0, str(C3B / 'tree'))          # byte-identical copies of figtext/blockkey (cmp-checked)
import numpy as np
import cairo
from PIL import Image
import figtext as FT
from blockkey import block_key

DPI = 200.0
S = DPI / 72.0
FAMILY = "Liberation Sans"
ASC, DESC = 0.73, 0.21     # 1d's glyph-box vertical extent (pixel.py)


def names():
    man = json.loads((PREP / 'manifest.json').read_text())
    return [f['basename'] for f in man['figures']]


class Fig:
    def __init__(self, b, items_dir=None, diag_dir=None):
        self.b = b
        self.d = PREP / 'figs' / b
        self.meta = json.loads((self.d / 'meta.json').read_text())
        self.W, self.H = self.meta['page']
        self.runs = json.loads((self.d / 'runs.json').read_text())
        self.blocks = FT.merge_blocks(FT.group(self.runs))
        self.keys = [block_key(bl) for bl in self.blocks]
        self.items = json.loads(((Path(items_dir) / b if items_dir else self.d) / 'items.json').read_text())
        self.diag = {r['block']: r for r in json.loads(((Path(diag_dir) if diag_dir else C3 / 'work') / b / 'diag.json').read_text())}
        self.art_rgb = np.asarray(Image.open(self.d / 'artwork.png').convert('RGB')).astype(np.int16)
        self.art_L = np.asarray(Image.open(self.d / 'artwork.png').convert('L'))
        self.h, self.w = self.art_L.shape
        self.bold_fonts = {k for k, v in self.meta['fonts'].items() if 'bold' in v['base'].lower()}
        paths = {}
        for it in self.items:
            paths.setdefault(it['block'], set()).add(it['path'])
        self.path = {bi: ('+'.join(sorted(p))) for bi, p in paths.items()}

    def block_items(self, bi):
        return [it for it in self.items if it['block'] == bi]

    def layout_blocks(self):
        return [bi for bi in range(len(self.blocks)) if self.path.get(bi) == 'layout']

    def dev(self, x, y):
        return x * S, (self.H - y) * S

    # ---------- source geometry ----------
    def src_runs_as_items(self, bi):
        """The block's source runs as drawn by compose.draw_run_exact (the source layout)."""
        out = []
        for r in self.blocks[bi]:
            text, _ = FT.run_draw_text(r)
            if text == '':
                continue
            bold, italic = FT.run_face(r, self.meta['fonts'])
            out.append(dict(text=text, x=r['x'], y=r['y'], rot=r['rot'], size=r['size'],
                            bold=bold, italic=italic, dx=0.0, adv=r['adv']))
        return out

    def src_line_boxes(self, bi):
        """Per source line: (along0, along1, proj_base, size, rot) using runs' own adv."""
        out = []
        for l in FT.lines(self.blocks[bi]):
            a0 = min(FT.along(r) for r in l)
            a1 = max(FT.along(r) + r['adv'] for r in l)
            sz = max(r['size'] for r in l)
            out.append((a0, a1, FT.proj(l[0]), sz, l[0]['rot']))
        return out


# ---------- rendering (compose.py's own draw statements) ----------
def new_a8(fig, pad):
    surf = cairo.ImageSurface(cairo.FORMAT_A8, fig.w + 2 * pad, fig.h + 2 * pad)
    ctx = cairo.Context(surf)
    return surf, ctx


def draw_items(ctx, fig, items, pad):
    for it in items:
        ctx.select_font_face(FAMILY,
                             cairo.FONT_SLANT_ITALIC if it['italic'] else cairo.FONT_SLANT_NORMAL,
                             cairo.FONT_WEIGHT_BOLD if it['bold'] else cairo.FONT_WEIGHT_NORMAL)
        ctx.set_font_size(it['size'] * S)
        px, py = fig.dev(it['x'], it['y'])
        ctx.save(); ctx.translate(px + pad, py + pad); ctx.rotate(-math.radians(it['rot']))
        ctx.set_source_rgba(0, 0, 0, 1); ctx.move_to(it['dx'] * S, 0); ctx.show_text(it['text'])
        ctx.restore()


def a8_array(surf):
    surf.flush()
    w, h, st = surf.get_width(), surf.get_height(), surf.get_stride()
    return np.frombuffer(surf.get_data(), dtype=np.uint8).reshape(h, st)[:, :w].copy()


def ink_mask(fig, items, pad):
    surf, ctx = new_a8(fig, pad)
    draw_items(ctx, fig, items, pad)
    return a8_array(surf)


def measure_adv(ctx, text, size, bold, italic=False):
    ctx.select_font_face(FAMILY, cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size * S)
    return ctx.text_extents(text).x_advance / S


def fill_poly(ctx, pts):
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(*p)
    ctx.close_path(); ctx.fill()


def rot_rect_dev(fig, a0, a1, n0, n1, rot, pad):
    """rectangle in (along, normal) text coords -> device px polygon (with pad)."""
    t = math.radians(rot)
    pts = []
    for a, n in ((a0, n0), (a1, n0), (a1, n1), (a0, n1)):
        x = a * math.cos(t) - n * math.sin(t)
        y = a * math.sin(t) + n * math.cos(t)
        px, py = fig.dev(x, y)
        pts.append((px + pad, py + pad))
    return pts
