#!/usr/bin/env python3
"""Attribute every decision delta between the frozen r2 prototype (V5_p2.0_f7.5) and the FINAL build to a named input.

    PYTHONDONTWRITEBYTECODE=1 python3 -u attribute.py      -> ../out/attribution.json (+ stdout)

0 ISK. figlayout.decide (the FINAL module, from plan/pred2/inst-C) is pure, so it is driven here with each of its
inputs switched between the PROTOTYPE's value and the FINAL build's value, one factor at a time:

  r9      R9 short-token binding            proto: off (_r9=False)                 final: on
  height  box/cell height budget            proto: off (_height=False)             final: on
  cues    source line starts/ends           proto: FT.along(l[0]) + HINTED run widths   final: PDF advances (adv)
  width   the one width function            proto: hinted 200-dpi advances         final: HINT_METRICS_OFF (compose.lin_advance)
  geom    container geometry                proto: r2/census.json (L R D U / FL FR room, margins)   final: figcontainers
  align   container alignment               proto: census cell_align / open_align_r2              final: figcontainers
  sz0     label body size                   proto: block[0]['size']                final: figscripts.body_size
  words   ② styles on the value             proto: r2/tree/c2_scripts (flat 0.12 rule)            final: figscripts

CONTROLS (the harness is worthless unless both hold):
  ALL-PROTO inputs reproduce the FROZEN r2 diag (wrapped lines, size, step, top, anchor+disp, drawn widths) on 176/176.
  ALL-FINAL inputs reproduce the FINAL build's own diag (lines, size, step, x0, top, disp, vdisp, overflow) on 176/176.
Then per block: FORWARD chain (factors switched cumulatively in the order above) and LEAVE-ONE-OUT (final inputs with
one factor reverted) - a factor is named for a block when it changes the decision in EITHER, and the two views are
reported side by side so an interaction is visible rather than hidden.
"""
import json, math, sys, collections, importlib.util
from pathlib import Path

sys.dont_write_bytecode = True
PRED = Path('/home/siggi/dev/scratch-c140/plan/pred2')
INST = PRED / 'inst-C'
sys.path.insert(0, str(INST / 'pylibs'))
sys.path.insert(0, str(INST))
import cairo
import figtext as FT
import figscripts as FS
import figlayout as FLY
from blockkey import block_key
assert Path(FLY.__file__).resolve().parent == INST.resolve(), FLY.__file__
_spec = importlib.util.spec_from_file_location('c2_scripts', '/home/siggi/dev/scratch-c140/r2/tree/c2_scripts.py')
TS = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(TS)

SCR = Path('/home/siggi/dev/scratch-c140')
PREP = SCR / 'prep/figs'
R2W = SCR / 'r2/work/V5_p2.0_f7.5'
FINW = PRED / 'work/FINAL'
SIDE = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/figure-text')
CENSUS = json.loads((SCR / 'r2/census.json').read_text())
S = 200.0 / 72.0
FAMILY = 'Liberation Sans'
PAD, FLOOR = 2.0, 7.5
FACTORS = ['r9', 'height', 'cues', 'width', 'geom', 'align', 'sz0', 'words']

_h_surf = cairo.ImageSurface(cairo.FORMAT_RGB24, 4, 4); HCTX = cairo.Context(_h_surf)          # compose's hinted ctx
_l_surf = cairo.ImageSurface(cairo.FORMAT_A8, 8, 8); LCTX = cairo.Context(_l_surf)             # compose's mctx
_fo = cairo.FontOptions(); _fo.set_hint_metrics(cairo.HINT_METRICS_OFF); LCTX.set_font_options(_fo)


def adv(ctx, text, bold, italic, px):
    ctx.select_font_face(FAMILY, cairo.FONT_SLANT_ITALIC if italic else cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(px)
    return ctx.text_extents(text).x_advance / S


def container_from_census(cz):
    """tree-figlayout/equiv_figlayout.py's mapping, verbatim in behaviour."""
    c = cz['r2cls']
    if c in ('box', 'cell'):
        d = dict(cls=c, why=cz.get('container_source', ''), L=cz['L'], R=cz['R'], D=cz['D'], U=cz['U'],
                 src_left_margin=cz['src_left_margin'], src_right_margin=cz['src_right_margin'],
                 src_up_margin=cz['src_up_margin'], src_down_margin=cz['src_down_margin'])
        d.update(align='center', align_why='box') if c == 'box' else d.update(align=cz['cell_align'], align_why=cz['cell_align_why'])
        return d
    return dict(cls='open', why=cz.get('room_up_by', ''), FL=cz['FL'], FR=cz['FR'], room_up=cz['room_up'],
                room_down=cz['room_down'], free_left_clear=cz['free_left_clear'],
                free_right_clear=cz['free_right_clear'], align=cz['open_align_r2'], align_why=cz['open_align_r2_why'])


class Block:
    def __init__(self, fig, BI, row):
        self.name, self.BI, self.row = fig['name'], BI, row
        b = fig['blocks'][BI]; self.b = b; self.ls = FT.lines(b)
        self.bold = fig['BOLD']; fonts = fig['meta']['fonts']
        self.key = block_key(b); assert self.key == row['key'], (self.name, BI)
        self.new = FT.normalise_block_value(fig['TR'][self.key], False)
        cz = CENSUS[f'{self.name}#{BI}']; self.cz = cz
        # words
        tt = TS.source_tokens(b, fonts); ft = FS.source_tokens(b, fonts)[0]
        self.words = {}
        wp, wf = [], []
        for para in self.new:
            wp += TS.words(para, TS.transfer(tt, para)[0] if tt else [None] * len(para))
            wf += FS.words(para, FS.transfer(ft, para)[0] if ft else [None] * len(para))
        self.words = {'proto': wp, 'final': wf}
        self.tokens_equal = [(t['text'], [tuple(s) if s else None for s in t['styles']]) for t in tt] == \
                            [(t['text'], [tuple(s) if s else None for s in t['styles']]) for t in ft]
        self.words_equal = [(w, [tuple(s) if s else None for s in st]) for w, st in wp] == \
                           [(w, [tuple(s) if s else None for s in st]) for w, st in wf]
        # sizes
        self.sz = {'proto': b[0]['size'], 'final': FS.body_size(b, fonts)}
        # cues (sz0 filled in per config)
        starts_h = [FT.along(l[0]) for l in self.ls]
        widths_h = [sum(adv(HCTX, r['text'], r['font'] in self.bold, False, r['size'] * S) for r in l) for l in self.ls]
        self.cues = {'proto': dict(n_src=len(self.ls), starts=starts_h, ends=[s + w for s, w in zip(starts_h, widths_h)],
                                   projs=[FT.proj(l[0]) for l in self.ls]),
                     'final': dict(n_src=len(self.ls), starts=[min(FT.along(r) for r in l) for l in self.ls],
                                   ends=[max(FT.along(r) + r['adv'] for r in l) for l in self.ls],
                                   projs=[FT.proj(l[0]) for l in self.ls])}
        self.cprod = row['container']; self.ccen = container_from_census(cz)
        assert self.cprod['cls'] == self.ccen['cls'], (self.name, BI, self.cprod['cls'], self.ccen['cls'])

    def width(self, metric, words_from):
        seg = (TS if words_from == 'proto' else FS)
        ctx = HCTX if metric == 'proto' else LCTX

        def segs_of(lc):
            sg = seg.segments(lc) or [('', None)]
            if any(st for _, st in sg):
                sg = seg.split_at_word_edges(sg)
            return sg

        def width(chars, size, j):
            fr = self.ls[min(j, len(self.ls) - 1)][0]; bold = fr['font'] in self.bold
            return sum(adv(ctx, t, bold, bool(st and st[2]), size * (st[0] if st else 1.0) * S) for t, st in segs_of(chars))
        return width

    def decide(self, cfg):
        cues = dict(self.cues[cfg['cues']], sz0=self.sz[cfg['sz0']])
        if cfg['geom'] == 'final':
            cont = dict(self.cprod)
            if cfg['align'] == 'proto':
                cont['align'] = self.ccen['align']
        else:
            cont = dict(self.ccen)
            if cfg['align'] == 'final':
                cont['align'] = self.cprod['align']
        lay = FLY.decide(self.words[cfg['words']], self.width(cfg['width'], cfg['words']), cont, cues,
                         floor=FLOOR, pad=PAD, _r9=cfg['r9'] == 'final', _height=cfg['height'] == 'final')
        return dict(lines=[''.join(c for c, _ in l) for l in lay['lines']], size=lay['size'], step=lay['step'],
                    align=lay['align'], x0=lay['x0'], top=lay['top'], disp=lay['disp'], vdisp=lay['vdisp'],
                    widths=lay['widths'], anchor=lay['anchor'], overflow=lay['overflow'])


def diff(a, b, tol=0.01):
    d = []
    for k in ('lines', 'size', 'step', 'align'):
        if a[k] != b[k]:
            d.append(k)
    if len(a['x0']) != len(b['x0']) or max(abs(x - y) for x, y in zip(a['x0'], b['x0'])) > tol:
        d.append('x0')
    if abs(a['top'] - b['top']) > tol:
        d.append('top')
    if (a['overflow'] is None) != (b['overflow'] is None):
        d.append('overflow')
    return d


PROTO = {f: 'proto' for f in FACTORS}
FINAL = {f: 'final' for f in FACTORS}
names = sorted(p.name for p in FINW.iterdir() if p.is_dir())
assert len(names) == 34
res = dict(blocks={}, controls={})
ctrl_proto_fail, ctrl_final_fail = [], []
tok_neq, words_neq, sz_neq = [], [], []
for name in names:
    meta = json.loads((PREP / name / 'meta.json').read_text())
    fig = dict(name=name, meta=meta, blocks=FT.merge_blocks(FT.group(json.loads((PREP / name / 'runs.json').read_text()))),
               BOLD={k for k, v in meta['fonts'].items() if 'bold' in v['base'].lower()},
               TR=json.loads((SIDE / f'{name}.is.json').read_text())['blocks'])
    frozen = {d['block']: d for d in json.loads((R2W / name / 'diag.json').read_text())}
    for row in json.loads((FINW / name / 'diag.json').read_text()):
        BI = row['block']; blk = Block(fig, BI, row); ck = f'{name}#{BI}'
        short = f"{name.replace('CNX_Chem_', '')} b{BI}"
        if not blk.tokens_equal: tok_neq.append(short)
        if not blk.words_equal: words_neq.append(short)
        if blk.sz['proto'] != blk.sz['final']: sz_neq.append((short, blk.sz['proto'], blk.sz['final']))
        P = blk.decide(PROTO); F = blk.decide(FINAL)
        fz = frozen[BI]
        okp = (P['lines'] == fz['wrapped'] and P['size'] == fz['sz'] and P['step'] == fz['r2']['step'].replace('iv-overflow', 'v-overflow')
               and abs(P['top'] - fz['top']) < 1e-6 and abs(P['anchor'] + P['disp'] - fz['anchor']) < 1e-6
               and all(abs(x - y) < 1e-6 for x, y in zip(P['widths'], fz['drawn_widths'])))
        if not okp: ctrl_proto_fail.append((short, P['lines'], P['size'], P['step'], fz['wrapped'], fz['sz'], fz['r2']['step']))
        okf = (F['lines'] == row['lines'] and F['size'] == row['size'] and F['step'] == row['step'] and F['align'] == row['align']
               and all(abs(x - y) < 1e-9 for x, y in zip(F['x0'], row['x0'])) and abs(F['top'] - row['top']) < 1e-9
               and abs(F['disp'] - row['r2']['disp_pt']) < 1e-9 and abs(F['vdisp'] - row['r2']['vdisp_pt']) < 1e-9
               and F['overflow'] == row['overflow'])
        if not okf: ctrl_final_fail.append((short, F['lines'], F['size'], F['step'], row['lines'], row['size'], row['step']))
        # forward chain
        cfg = dict(PROTO); prev = P; fwd = []
        for f in FACTORS:
            cfg = dict(cfg, **{f: 'final'}); cur = blk.decide(cfg)
            dd = diff(prev, cur)
            if dd:
                fwd.append(dict(factor=f, changes=dd, before=dict(lines=prev['lines'], size=prev['size'], step=prev['step'], align=prev['align']),
                                after=dict(lines=cur['lines'], size=cur['size'], step=cur['step'], align=cur['align']),
                                dx0=round(max(abs(x - y) for x, y in zip(prev['x0'], cur['x0'])), 3) if len(prev['x0']) == len(cur['x0']) else None,
                                dtop=round(cur['top'] - prev['top'], 3)))
            prev = cur
        loo = []
        for f in FACTORS:
            cur = blk.decide(dict(FINAL, **{f: 'proto'}))
            dd = diff(cur, F)
            if dd:
                loo.append(dict(factor=f, changes=dd, reverted=dict(lines=cur['lines'], size=cur['size'], step=cur['step'], align=cur['align']),
                                dx0=round(max(abs(x - y) for x, y in zip(cur['x0'], F['x0'])), 3) if len(cur['x0']) == len(F['x0']) else None))
        total = diff(P, F)
        res['blocks'][short] = dict(cls=row['cls'], total=total, proto=dict(lines=P['lines'], size=P['size'], step=P['step'], align=P['align']),
                                    final=dict(lines=F['lines'], size=F['size'], step=F['step'], align=F['align']),
                                    dx0=round(max(abs(x - y) for x, y in zip(P['x0'], F['x0'])), 3) if len(P['x0']) == len(F['x0']) else None,
                                    dtop=round(F['top'] - P['top'], 3), forward=fwd, leave_one_out=loo)
        print(f"{short:40} {row['cls']:4} total={total} fwd={[(x['factor'], x['changes']) for x in fwd]} loo={[(x['factor'], x['changes']) for x in loo]}", flush=True)

res['controls'] = dict(proto_reproduces_frozen_fail=ctrl_proto_fail, final_reproduces_build_fail=ctrl_final_fail,
                       tokens_c2_vs_figscripts_differ=tok_neq, words_differ=words_neq, body_size_differs=sz_neq)
B = res['blocks']
summary = collections.Counter()
by_factor = collections.defaultdict(lambda: collections.defaultdict(list))
for short, r in B.items():
    for view in ('forward', 'leave_one_out'):
        for x in r[view]:
            for c in x['changes']:
                by_factor[view][f"{x['factor']}:{c}"].append(short)
res['by_factor'] = {v: {k: sorted(set(l)) for k, l in d.items()} for v, d in by_factor.items()}
(PRED / 'out' / 'attribution.json').write_text(json.dumps(res, indent=1, ensure_ascii=False))
print('\nCONTROL all-proto inputs reproduce the frozen r2 diag: fail', len(ctrl_proto_fail), ctrl_proto_fail[:5])
print('CONTROL all-final inputs reproduce the FINAL build diag: fail', len(ctrl_final_fail), ctrl_final_fail[:5])
print('blocks', len(B), '| tokens c2 != figscripts:', tok_neq, '| words differ:', words_neq, '| body size != b[0] size:', sz_neq)
print('blocks whose decision differs proto -> final (lines/size/step/align/x0>0.01/top>0.01/overflow):',
      sum(1 for r in B.values() if r['total']))
for view in ('forward', 'leave_one_out'):
    print(f'\n{view}:')
    for k, l in sorted(res['by_factor'][view].items()):
        print(f'  {k:18} {len(set(l)):3}  {sorted(set(l)) if len(set(l)) <= 30 else "(many)"}')
