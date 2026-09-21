"""§C168 — the raster gate and the raster arm. Run: python3 test_figweight.py"""
import base64
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import figweight  # noqa: E402
from svgout import raster_shell  # noqa: E402

ART = ('<svg xmlns="http://www.w3.org/2000/svg" width="354.39" height="199.95" '
       'viewBox="0 0 354.39 199.95">{}</svg>')


def _svg(paths=0, clips=0, tiles=0, pad=0):
    body = '<path d="M0 0"/>' * paths + '<clipPath id="c"/>' * clips + '<image href="x"/>' * tiles
    return ART.format(body + '<!--' + 'x' * pad + '-->')


def test_ordinary_figure_stays_vector():
    # The corpus median is ~98 KB and 28 vector elements. Nothing here should fire.
    hit, m, why = figweight.should_rasterise(_svg(paths=28))
    assert hit is False, why
    assert m['vectorElements'] == 28


def test_path_soup_fires_and_is_named():
    # KMTPhases1: 93,289 vector elements, 0 tiles, 53.5 MB.
    hit, m, why = figweight.should_rasterise(_svg(paths=30000, pad=9 * 1024 * 1024))
    assert hit is True
    assert 'path soup' in why


def test_tile_soup_fires_and_is_named():
    # sandwich: 1,192 vector elements but 5,800 raster tiles, 18.8 MB — an element
    # count alone would miss it entirely.
    hit, m, why = figweight.should_rasterise(_svg(paths=1192, tiles=5800, pad=9 * 1024 * 1024))
    assert hit is True
    assert 'tile soup' in why


def test_path_DATA_fires_and_is_named():
    # exocytosis: 5,809 elements, 37 tiles, 23.8 MB — the mechanism NEITHER counter
    # can see, and the reason size is the necessary condition.
    hit, m, why = figweight.should_rasterise(_svg(paths=5809, tiles=37, pad=24 * 1024 * 1024))
    assert hit is True
    assert 'path data' in why


def test_a_SMALL_tile_heavy_figure_is_left_alone():
    # HPerDcmp has 929 tiles in 1.1 MB; Electrolys 524 in 0.9 MB. Rasterising those
    # trades crispness for nothing, so mechanism alone must not fire.
    hit, _, why = figweight.should_rasterise(_svg(paths=2913, tiles=929, pad=1024 * 1024))
    assert hit is False, why


def test_the_DOM_backstop_fires_under_the_byte_threshold():
    hit, _, why = figweight.should_rasterise(_svg(paths=26000))
    assert hit is True
    assert 'DOM backstop' in why


def test_raster_shell_keeps_the_artwork_geometry_exactly():
    # 🔴 Inventing a viewBox would move every text item: compose.py places them at
    # absolute coordinates in the artwork's own units.
    png = pathlib.Path(tempfile.mkstemp(suffix='.png')[1])
    png.write_bytes(b'\x89PNG\r\n\x1a\nFAKE')
    out = raster_shell(_svg(paths=5), png)
    assert 'viewBox="0 0 354.39 199.95"' in out
    assert out.count('<image') == 1
    assert '<path' not in out          # the artwork layer is gone
    assert 'xmlns:xlink' in out        # href namespace declared
    assert base64.b64encode(b'\x89PNG\r\n\x1a\nFAKE').decode() in out


def test_raster_shell_is_dramatically_smaller():
    png = pathlib.Path(tempfile.mkstemp(suffix='.png')[1])
    png.write_bytes(b'\x89PNG\r\n\x1a\n' + b'p' * 2000)
    heavy = _svg(paths=40000)
    assert len(raster_shell(heavy, png)) < len(heavy) / 10


def test_thresholds_are_exported_values_not_prose():
    assert figweight.RASTER_BYTES_MIN > 0
    assert figweight.RASTER_VECTOR_ELEMENTS_MIN > 20991  # above the corpus p99
    assert figweight.RASTER_TILES_MIN > 317              # above the corpus p99


# ── the project's own harness: check() + ALL PASS, no pytest on this box ──────
FAILED = []


def check(label, ok, detail=''):
    print(('  ok   ' if ok else '  FAIL ') + label + ('' if ok else f'   {detail}'))
    if not ok:
        FAILED.append(label)


if __name__ == '__main__':
    for name, fn in sorted(globals().items()):
        if not name.startswith('test_') or not callable(fn):
            continue
        try:
            fn()
            check(name, True)
        except AssertionError as e:
            check(name, False, repr(e))
        except Exception as e:  # noqa: BLE001 - a crash is a failure, and must say so
            check(name, False, f'{type(e).__name__}: {e}')
    print('ALL PASS' if not FAILED else f'{len(FAILED)} FAILED: ' + ', '.join(FAILED))
    sys.exit(1 if FAILED else 0)
