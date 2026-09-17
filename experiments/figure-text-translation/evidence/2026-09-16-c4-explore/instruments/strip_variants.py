"""Load the real strip-text.py (unmodified, imported via importlib since the filename has a
hyphen) once, and provide THREE swappable `strip_text_ops` implementations to assign onto the
imported module before calling its own `strip_text(pdf)`/`main()`-equivalent steps:

  ORIG_FN     - st.strip_text_ops, unmodified. The shipped behaviour.
  PERSIST_FN  - inside BT..ET keep ONLY persistent graphics-state operators
                (g G rg RG k K cs CS sc SC scn SCN gs w J j M d ri i); drop everything else
                inside BT..ET (including inline images at depth>0, exactly as ORIG does).
  NONTEXT_FN  - inside BT..ET drop ONLY text operators
                (Tc Tw Tz TL Tf Tr Ts Td TD Tm T* Tj TJ ' "); keep everything else, INCLUDING
                inline images at depth>0 (the 2026-09-13 prototype's rule -
                evidence/2026-09-13-compose-fidelity/instruments/1d/strip_variant.py's
                strip_keep_gstate -- it appends every ContentStreamInlineImage unconditionally,
                never gating on depth). This differs from ORIG/PERSIST's inline-image handling
                and is intentional per the task spec; noted here so nobody "fixes" it to match.

We never edit strip-text.py. We import it once via importlib.util.spec_from_file_location,
then reassign `st.strip_text_ops` before each call to `st.strip_text(pdf)` -- exactly the
pattern evidence/.../instruments/1d/strip_variant.py already used on a COPY of strip-text.py
(lib/strip_text_orig.py there); here we point straight at the real file instead of a copy.

FIGTEXT_OUT is set to a scratch directory BEFORE importing, defensively: `_deps.OUT` binds by
value at import time and `strip-text.py`'s own `main()` (which we never call) does
`OUT.mkdir(exist_ok=True)` -- if OUT were left at its default (HERE/'out') and anything ever
called main(), it would create a directory inside the repo tree. We call `strip_text()`
directly, never `main()`, so this is belt-and-braces, not load-bearing -- but cheap insurance
against ever writing under the repo by accident.
"""
import importlib.util
import os
import sys
from pathlib import Path

REPO = Path('/home/siggi/dev/repos/namsbokasafn-efni')
FIGTEXT = REPO / 'experiments/figure-text-translation'
SCRATCH = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore')

os.environ.setdefault('FIGTEXT_PYLIBS', str(FIGTEXT / 'pylibs'))
os.environ.setdefault('FIGTEXT_OUT', str(SCRATCH / 'render' / '_unused_figtext_out'))
for p in (str(FIGTEXT / 'pylibs'), str(FIGTEXT)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pikepdf  # noqa: E402

_spec = importlib.util.spec_from_file_location('strip_text_real', str(FIGTEXT / 'strip-text.py'))
st = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(st)

ORIG_FN = st.strip_text_ops   # the shipped, unmodified function -- saved once, reassigned per-figure

PERSIST_KEEP = {
    'g', 'G', 'rg', 'RG', 'k', 'K', 'cs', 'CS', 'sc', 'SC', 'scn', 'SCN',
    'gs', 'w', 'J', 'j', 'M', 'd', 'ri', 'i',
}
NONTEXT_DROP = {
    'Tc', 'Tw', 'Tz', 'TL', 'Tf', 'Tr', 'Ts', 'Td', 'TD', 'Tm', 'T*', 'Tj', 'TJ', "'", '"',
}


def persist_strip_text_ops(source):
    """Keep ONLY the persistent-gstate operator set inside BT..ET; drop everything else
    inside BT..ET (text ops, path ops, marked content, inline images at depth>0 -- same
    inline-image handling as ORIG, since none of those classes were ever found by the
    census on this corpus, this only matters as a documented choice, not a measured one)."""
    owner = None
    if isinstance(source, (bytes, bytearray)):
        owner = pikepdf.new()
        source = owner.make_stream(bytes(source))
    ops = list(pikepdf.parse_content_stream(source))
    out, depth, removed = [], 0, 0
    for instruction in ops:
        if isinstance(instruction, pikepdf.ContentStreamInlineImage):
            if depth == 0:
                out.append(instruction)
            continue
        op = str(instruction.operator)
        if op == 'BT':
            depth += 1
            removed += 1
            continue
        if op == 'ET':
            depth = max(0, depth - 1)
            continue
        if depth == 0:
            out.append(instruction)
        elif op in PERSIST_KEEP:
            out.append(instruction)
    result = pikepdf.unparse_content_stream(out)
    del owner
    return result, removed


def nontext_strip_text_ops(source):
    """Drop ONLY the text operator set inside BT..ET; keep everything else inside BT..ET,
    INCLUDING inline images at depth>0 (the 2026-09-13 prototype's rule -- see module
    docstring)."""
    owner = None
    if isinstance(source, (bytes, bytearray)):
        owner = pikepdf.new()
        source = owner.make_stream(bytes(source))
    ops = list(pikepdf.parse_content_stream(source))
    out, depth, removed = [], 0, 0
    for instruction in ops:
        if isinstance(instruction, pikepdf.ContentStreamInlineImage):
            out.append(instruction)   # ALWAYS kept -- differs from ORIG/PERSIST, see docstring
            continue
        op = str(instruction.operator)
        if op == 'BT':
            depth += 1
            removed += 1
            continue
        if op == 'ET':
            depth = max(0, depth - 1)
            continue
        if depth and op in NONTEXT_DROP:
            continue
        out.append(instruction)
    result = pikepdf.unparse_content_stream(out)
    del owner
    return result, removed


VARIANT_FNS = {
    'ORIG': ORIG_FN,
    'PERSIST': persist_strip_text_ops,
    'NONTEXT': nontext_strip_text_ops,
}


def run_variant(pdf_path, variant, out_pdf_path):
    """Open `pdf_path` fresh, apply VARIANT_FNS[variant] via monkey-patching
    st.strip_text_ops, run the same post-steps strip-text.py's main() does (remove
    /PieceInfo /LastModified /Metadata /Thumb, remove_unreferenced_resources), and save to
    `out_pdf_path`. -> dict(ok=bool, error=str|None, stats=dict|None)
    Never touches `pdf_path` itself; always opens read and saves to a new path.
    """
    st.strip_text_ops = VARIANT_FNS[variant]
    try:
        with pikepdf.open(str(pdf_path)) as pdf:
            stats = st.strip_text(pdf)
            page = pdf.pages[0]
            for k in ('/PieceInfo', '/LastModified', '/Metadata', '/Thumb'):
                if k in page.obj:
                    del page.obj[k]
            pdf.remove_unreferenced_resources()
            pdf.save(str(out_pdf_path))
        return {'ok': True, 'error': None, 'stats': stats}
    except Exception as exc:  # noqa: BLE001 - named and recorded, never swallowed
        return {'ok': False, 'error': f'{type(exc).__name__}: {exc}', 'stats': None}
    finally:
        st.strip_text_ops = ORIG_FN   # always restore -- never leave a variant "stuck" for
                                      # the next figure/variant call in this same process


def identity_roundtrip(pdf_path, out_pdf_path):
    """SERIALISER control: parse/unparse every stream (page + every reachable Form) with NO
    operator removed at all, then the same post-steps, then save. A diff of this against a
    render of `pdf_path` unchanged must be 0 px -- proving the diff instrument sees only
    REAL content changes, not re-serialisation noise (pikepdf's own number formatting /
    whitespace differs from the producer's on every round-trip, per strip-text.py's own
    docstring)."""
    def identity_fn(source):
        owner = None
        if isinstance(source, (bytes, bytearray)):
            owner = pikepdf.new()
            source = owner.make_stream(bytes(source))
        ops = list(pikepdf.parse_content_stream(source))
        result = pikepdf.unparse_content_stream(ops)
        del owner
        return result, 0
    st.strip_text_ops = identity_fn
    try:
        with pikepdf.open(str(pdf_path)) as pdf:
            stats = st.strip_text(pdf)   # runs the SAME walk (page + every reachable Form)
            page = pdf.pages[0]
            for k in ('/PieceInfo', '/LastModified', '/Metadata', '/Thumb'):
                if k in page.obj:
                    del page.obj[k]
            pdf.remove_unreferenced_resources()
            pdf.save(str(out_pdf_path))
        return {'ok': True, 'error': None, 'stats': stats}
    except Exception as exc:  # noqa: BLE001
        return {'ok': False, 'error': f'{type(exc).__name__}: {exc}', 'stats': None}
    finally:
        st.strip_text_ops = ORIG_FN
