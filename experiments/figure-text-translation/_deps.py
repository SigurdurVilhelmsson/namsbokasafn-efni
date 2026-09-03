"""Dependency shim.

pikepdf / pycairo / Pillow are NOT repo dependencies - this is an experiment, not
a pipeline tool. Install them into a directory of your choice and point
FIGTEXT_PYLIBS at it, or install them normally:

    python3 -m pip install --target=./pylibs pikepdf pycairo pillow
    FIGTEXT_PYLIBS=./pylibs python3 extract.py <figure.pdf>
"""
import os, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent      # never process.cwd() - repo rule
OUT = HERE / 'out'

_extra = os.environ.get('FIGTEXT_PYLIBS')
if _extra:
    sys.path.insert(0, str(Path(_extra).expanduser().resolve()))
sys.path.insert(0, str(HERE))


def read_content(page):
    """Page content stream as text. /Contents may be one stream or an ARRAY of
    streams which the viewer concatenates; a reader that handles only the first
    shape silently reports perfectly good figures as unreadable."""
    import pikepdf
    obj = pikepdf.Page(page).obj.get('/Contents')
    if obj is None:
        return ''
    parts = list(obj) if isinstance(obj, pikepdf.Array) else [obj]
    return b'\n'.join(p.read_bytes() for p in parts).decode('latin-1')
