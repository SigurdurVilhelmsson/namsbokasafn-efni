#!/usr/bin/env python3
"""SUPPLEMENTARY (not a frozen verdict): re-run the adapted measure.py on a tag with the instrument's text RASTER and
advance measurements switched to LINEAR metrics (cairo HINT_METRICS_OFF), to separate what the build lays out from
what the frozen instrument's hinted 200-dpi raster adds.

    PYTHONDONTWRITEBYTECODE=1 PRED_WORK_ROOT=<root> python3 -u supp_render.py TAG hinted   -> out/measure-TAG.SUPP-hinted.jsonl
    PYTHONDONTWRITEBYTECODE=1 PRED_WORK_ROOT=<root> python3 -u supp_render.py TAG linear   -> out/measure-TAG.SUPP-linear.jsonl

`hinted` changes nothing (the CONTROL: must be byte-identical to out/measure-TAG.jsonl); `linear` sets
HINT_METRICS_OFF on every cairo context c3lib hands out (new_a8, and measure_adv's context), before measure.py,
baseline.py and containers.py bind them. measure.py itself is exec'd unchanged except its output filename.
"""
import sys, os
from pathlib import Path
sys.dont_write_bytecode = True
PRED = Path('/home/siggi/dev/scratch-c140/plan/pred2')
sys.path.insert(0, str(PRED / 'instruments'))
TAG, MODE = sys.argv[1], sys.argv[2]
assert MODE in ('hinted', 'linear')
import c3lib
if MODE == 'linear':
    cairo = c3lib.cairo
    _FO = cairo.FontOptions(); _FO.set_hint_metrics(cairo.HINT_METRICS_OFF)
    _new_a8 = c3lib.new_a8

    def new_a8(fig, pad):
        surf, ctx = _new_a8(fig, pad)
        ctx.set_font_options(_FO)
        return surf, ctx
    _measure_adv = c3lib.measure_adv

    def measure_adv(ctx, text, size, bold, italic=False):
        ctx.set_font_options(_FO)
        return _measure_adv(ctx, text, size, bold, italic)
    c3lib.new_a8 = new_a8
    c3lib.measure_adv = measure_adv
src = (PRED / 'instruments' / 'measure.py').read_text()
old = "out = open(PRED / 'out' / f'measure-{V}.jsonl', 'w')"
assert src.count(old) == 1
src = src.replace(old, f"out = open(PRED / 'out' / f'measure-{{V}}.SUPP-{MODE}.jsonl', 'w')")
sys.argv = ['measure.py', TAG]
g = {'__name__': '__main__', '__file__': str(PRED / 'instruments' / 'measure.py')}
exec(compile(src, 'measure.py', 'exec'), g)
