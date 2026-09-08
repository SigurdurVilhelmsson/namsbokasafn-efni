"""Dependency shim.

pikepdf / pdfplumber / pycairo / Pillow are NOT repo dependencies - this is an
experiment, not a pipeline tool. Install them into a directory of your choice and
point FIGTEXT_PYLIBS at it, or install them normally:

    python3 -m pip install --target=./pylibs pikepdf pdfplumber pycairo pillow
    FIGTEXT_PYLIBS=./pylibs python3 extract.py <figure.pdf>

pdfplumber (which brings pdfminer.six) is the READ layer - readlayer.py. It is
easy to miss because pylibs/ already happens to contain it, so everything works
here without it ever being declared. It is not optional: extract.py cannot import.

FIGTEXT_OUT overrides the shared out/ directory, so one figure can be processed in
isolation:

    FIGTEXT_OUT=/tmp/fig-042 python3 emit-blocks.py <figure.pdf>

See the note beside OUT below for the three things that are easy to get wrong about it.
"""
import os, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent      # never process.cwd() - repo rule

# FIGTEXT_OUT gives ONE figure its own output directory. Without it every consumer of the
# chain writes into the same HERE/'out', so a driver walking a chapter has each figure
# overwrite the previous figure's runs.json / meta.json / blocks.json - and two figures
# processed concurrently interleave with no error, no missing file, and a blocks.json
# describing a different picture from the artwork.png beside it.
#
# ⚠️ `from _deps import OUT` binds BY VALUE at import time, so this must be set in the
# PARENT before the child process starts. Setting os.environ['FIGTEXT_OUT'] after _deps
# has been imported changes nothing in this process.
#
# ⚠️ The directory's PARENT must exist. extract.py and strip-text.py each do
# `OUT.mkdir(exist_ok=True)` - one level, no parents=True - and compose.py and check.py
# only ever read from it.
#
# `.expanduser().resolve()` mirrors FIGTEXT_PYLIBS below: a relative value is made
# absolute ONCE, here, against the importing process's cwd. Leaving it relative would mean
# two different directories in one run, because a wrapper spawns some children with
# cwd=HERE (emit-blocks.py must, since it spawns extract.py by a relative path) and others
# from wherever the operator stood.
_out = os.environ.get('FIGTEXT_OUT')
OUT = Path(_out).expanduser().resolve() if _out else HERE / 'out'

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
