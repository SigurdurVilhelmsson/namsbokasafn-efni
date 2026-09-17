"""Render a PDF to PNG at 200 dpi with pdftocairo, load it as an RGB (alpha composited onto
white) int16 numpy array, and diff two same-sized rasters: count of pixels whose max-channel
abs difference is >40 and >0, plus the bounding box of each.
"""
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

DPI = 200
RENDER_TIMEOUT = 300


def render_pdf_to_png(pdf_path, png_root):
    """`pdftocairo -png -r 200 -singlefile <pdf> <png_root>` -> writes <png_root>.png.
    -> (ok, error_or_None). A timeout is its own outcome, not an exception that propagates.
    """
    try:
        result = subprocess.run(
            ['pdftocairo', '-png', '-r', str(DPI), '-singlefile', str(pdf_path), str(png_root)],
            capture_output=True, timeout=RENDER_TIMEOUT,
        )
    except subprocess.TimeoutExpired as exc:
        return False, f'TimeoutExpired: {exc}'
    if result.returncode != 0:
        return False, f'pdftocairo exit {result.returncode}: {result.stderr.decode("utf-8","replace")[-500:]}'
    png_path = Path(str(png_root) + '.png')
    if not png_path.exists() or png_path.stat().st_size == 0:
        return False, 'pdftocairo exit 0 but no/empty PNG written'
    return True, None


def load_rgb(png_path):
    """Load a PNG, compositing any alpha onto white, as an int16 HxWx3 array (int16 so a
    subtraction never wraps like uint8 would)."""
    im = Image.open(png_path)
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert('RGB')
    return np.array(im, dtype=np.int16)


def diff_stats(a, b):
    """a, b: int16 HxWx3 arrays. -> dict. If shapes differ, records size_match=False and
    nothing else (a size mismatch is its own outcome per the task spec, not a pixel count)."""
    if a.shape != b.shape:
        return {'size_match': False, 'shape_a': list(a.shape), 'shape_b': list(b.shape)}
    d = np.max(np.abs(a - b), axis=2)   # HxW, max channel abs diff per pixel
    mask40 = d > 40
    mask0 = d > 0
    out = {
        'size_match': True, 'shape': list(a.shape),
        'count_gt40': int(mask40.sum()), 'count_gt0': int(mask0.sum()),
        'bbox_gt40': _bbox(mask40), 'bbox_gt0': _bbox(mask0),
    }
    return out


def _bbox(mask):
    if not mask.any():
        return None
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    r0, r1 = np.where(rows)[0][[0, -1]]
    c0, c1 = np.where(cols)[0][[0, -1]]
    return [int(r0), int(r1), int(c0), int(c1)]   # row_min, row_max, col_min, col_max (inclusive)


def mean_distance(arr, ref, mask):
    """Mean per-pixel euclidean channel distance from `arr` to `ref`, restricted to `mask`
    (a boolean HxW array). -> float or None if mask is empty."""
    if not mask.any():
        return None
    dist = np.sqrt(np.sum((arr[mask].astype(np.float64) - ref[mask].astype(np.float64)) ** 2, axis=-1))
    return float(dist.mean())


def save_triptych_crop(arrays_labeled, bbox, out_path, margin=20, max_width=1400):
    """arrays_labeled: list of (label, HxWx3 int16 array) all same shape. bbox: [r0,r1,c0,c1]
    (inclusive) or None (falls back to the whole image, capped). Crops each to bbox+margin,
    concatenates horizontally with a thin separator and a label strip, downscales if the
    combined width exceeds max_width, and saves as PNG."""
    from PIL import ImageDraw, ImageFont
    h, w = arrays_labeled[0][1].shape[:2]
    if bbox is None:
        r0, r1, c0, c1 = 0, min(h - 1, 400), 0, min(w - 1, 400)
    else:
        r0, r1, c0, c1 = bbox
    r0 = max(0, r0 - margin); r1 = min(h - 1, r1 + margin)
    c0 = max(0, c0 - margin); c1 = min(w - 1, c1 + margin)
    crops = []
    for label, arr in arrays_labeled:
        crop = arr[r0:r1 + 1, c0:c1 + 1].astype(np.uint8)
        im = Image.fromarray(crop, mode='RGB')
        crops.append((label, im))
    sep = 6
    label_h = 18
    cw, ch = crops[0][1].size
    total_w = cw * len(crops) + sep * (len(crops) - 1)
    total_h = ch + label_h
    canvas = Image.new('RGB', (total_w, total_h), (240, 240, 240))
    draw = ImageDraw.Draw(canvas)
    x = 0
    for label, im in crops:
        canvas.paste(im, (x, label_h))
        draw.text((x + 2, 2), label, fill=(0, 0, 0))
        x += cw + sep
    if total_w > max_width:
        scale = max_width / total_w
        canvas = canvas.resize((int(total_w * scale), int(total_h * scale)))
    canvas.save(out_path)
