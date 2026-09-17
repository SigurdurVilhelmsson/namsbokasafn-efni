"""Foreground smoke test + two controls, on CNX_Chem_04_05_combustion, BEFORE the full batch.
Predicted (from prior evidence, read before this ran):
  1d-completeness.md row 7: "7 arrowheads blue-grey instead of black, 1750 px"
  verify-pixel-instrument-and-prototype.md: "1,836 px" (own detector, >40 threshold), sample
    pixel src (53,49,49) -> artwork (91,142,171).
Expect: ORIG vs SOURCE (or PERSIST) differs by a few hundred to a few thousand px at >40 in
the arrowhead region; PERSIST vs ORIG differs by a similar amount (PERSIST restores black);
NONTEXT vs ORIG should differ the same way (predicted PERSIST==NONTEXT operator-for-operator
on this corpus). Also runs the SERIALISER control (double-strip: strip ORIG's own output a
second time, must be 0 px vs the first ORIG render) and the PLANTED control (draw a rectangle
on a copy of the ORIG png, must be detected >0).
Writes: render/controls/smoke_combustion.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import strip_variants as sv  # noqa: E402
import render_diff as rd  # noqa: E402

SCRATCH = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore')
SRC = Path('/home/siggi/dev/repos/Myndir/chemistry-2e/base/Ch_04/Source_File/CNX_Chem_04_05_combustion.pdf')
TMP = SCRATCH / 'render' / 'pdf_tmp' / 'smoke_combustion'
TMP.mkdir(parents=True, exist_ok=True)
PNGTMP = SCRATCH / 'render' / 'png_tmp' / 'smoke_combustion'
PNGTMP.mkdir(parents=True, exist_ok=True)
CROPDIR = SCRATCH / 'render' / 'controls'
CROPDIR.mkdir(parents=True, exist_ok=True)

out = {}

assert SRC.exists(), f'missing {SRC}'

# 1. SOURCE render (raw, unstripped)
ok, err = rd.render_pdf_to_png(SRC, PNGTMP / 'SOURCE')
out['source_render'] = {'ok': ok, 'error': err}
assert ok, err
source_arr = rd.load_rgb(str(PNGTMP / 'SOURCE.png'))

variant_arrs = {}
for variant in ('ORIG', 'PERSIST', 'NONTEXT'):
    out_pdf = TMP / f'{variant}.pdf'
    r = sv.run_variant(SRC, variant, out_pdf)
    out[f'strip_{variant}'] = {'ok': r['ok'], 'error': r['error']}
    assert r['ok'], r['error']
    ok, err = rd.render_pdf_to_png(out_pdf, PNGTMP / variant)
    out[f'render_{variant}'] = {'ok': ok, 'error': err}
    assert ok, err
    variant_arrs[variant] = rd.load_rgb(str(PNGTMP / f'{variant}.png'))

# 2. Diff PERSIST vs ORIG, NONTEXT vs ORIG, and PERSIST vs NONTEXT
for a, b in (('PERSIST', 'ORIG'), ('NONTEXT', 'ORIG'), ('PERSIST', 'NONTEXT')):
    d = rd.diff_stats(variant_arrs[a], variant_arrs[b])
    out[f'diff_{a}_vs_{b}'] = d
    print(f'{a} vs {b}: {d}')

# 3. Direction: on the ORIG-vs-PERSIST mask, is PERSIST closer to SOURCE than ORIG is?
import numpy as np
d_op = rd.diff_stats(variant_arrs['ORIG'], variant_arrs['PERSIST'])
mask0 = (np.max(np.abs(variant_arrs['ORIG'] - variant_arrs['PERSIST']), axis=2) > 0)
dist_orig = rd.mean_distance(variant_arrs['ORIG'], source_arr, mask0)
dist_persist = rd.mean_distance(variant_arrs['PERSIST'], source_arr, mask0)
out['direction'] = {
    'n_px_in_mask': int(mask0.sum()),
    'mean_dist_ORIG_to_SOURCE': dist_orig,
    'mean_dist_PERSIST_to_SOURCE': dist_persist,
    'PERSIST_moves_toward_source': (dist_persist < dist_orig) if (dist_orig is not None and dist_persist is not None) else None,
}
print('direction:', out['direction'])

# sample pixel check, matching prior evidence's cited sample
if d_op['bbox_gt0']:
    r0, r1, c0, c1 = d_op['bbox_gt0']
    rmid, cmid = (r0 + r1) // 2, (c0 + c1) // 2
    out['sample_pixel_mid_bbox'] = {
        'rc': [rmid, cmid],
        'source': source_arr[rmid, cmid].tolist(),
        'ORIG': variant_arrs['ORIG'][rmid, cmid].tolist(),
        'PERSIST': variant_arrs['PERSIST'][rmid, cmid].tolist(),
    }
    print('sample pixel:', out['sample_pixel_mid_bbox'])

# crop for visual inspection
if d_op['bbox_gt0']:
    rd.save_triptych_crop(
        [('SOURCE', source_arr), ('ORIG', variant_arrs['ORIG']),
         ('PERSIST', variant_arrs['PERSIST']), ('NONTEXT', variant_arrs['NONTEXT'])],
        d_op['bbox_gt0'], CROPDIR / 'combustion_crop.png', margin=15,
    )
    print('crop -> render/controls/combustion_crop.png')

# 4. SERIALISER control: strip ORIG's own already-stripped output a SECOND time (idempotent,
# no BT..ET left) -> resave -> re-render -> must be 0 px vs the first ORIG render.
orig_pdf = TMP / 'ORIG.pdf'
serial_pdf = TMP / 'ORIG_resaved.pdf'
r2 = sv.run_variant(orig_pdf, 'ORIG', serial_pdf)
out['serialiser_strip_again'] = {'ok': r2['ok'], 'error': r2['error']}
assert r2['ok'], r2['error']
ok, err = rd.render_pdf_to_png(serial_pdf, PNGTMP / 'ORIG_resaved')
assert ok, err
resaved_arr = rd.load_rgb(str(PNGTMP / 'ORIG_resaved.png'))
d_serial = rd.diff_stats(variant_arrs['ORIG'], resaved_arr)
out['serialiser_control_diff'] = d_serial
print('SERIALISER control (ORIG stripped a 2nd time vs 1st):', d_serial)

# also the IDENTITY-roundtrip variant of the same control, straight from the RAW source
identity_pdf = TMP / 'IDENTITY.pdf'
r3 = sv.identity_roundtrip(SRC, identity_pdf)
out['serialiser_identity_roundtrip'] = {'ok': r3['ok'], 'error': r3['error']}
assert r3['ok'], r3['error']
ok, err = rd.render_pdf_to_png(identity_pdf, PNGTMP / 'IDENTITY')
assert ok, err
identity_arr = rd.load_rgb(str(PNGTMP / 'IDENTITY.png'))
d_identity = rd.diff_stats(identity_arr, source_arr)
out['serialiser_identity_diff_vs_source'] = d_identity
print('SERIALISER control (identity parse/unparse of RAW source vs plain source render):', d_identity)

# 5. PLANTED control: draw a small black rectangle on a COPY of the ORIG png; the diff
# instrument must detect it (>0, and >40 since black-on-white/whatever background is a big jump).
from PIL import Image, ImageDraw
orig_png = PNGTMP / 'ORIG.png'
im = Image.open(orig_png).convert('RGB')
im2 = im.copy()
draw = ImageDraw.Draw(im2)
w, h = im2.size
draw.rectangle([w // 4, h // 4, w // 4 + 20, h // 4 + 20], fill=(0, 0, 0))
planted_path = PNGTMP / 'PLANTED.png'
im2.save(planted_path)
planted_arr = rd.load_rgb(str(planted_path))
d_planted = rd.diff_stats(variant_arrs['ORIG'], planted_arr)
out['planted_control_diff'] = d_planted
print('PLANTED control (20x20 rect on ORIG copy vs ORIG):', d_planted)

(SCRATCH / 'render' / 'controls' / 'smoke_combustion.json').write_text(json.dumps(out, indent=1))
print('DONE smoke_combustion')
