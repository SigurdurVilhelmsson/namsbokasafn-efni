#!/usr/bin/env python3
"""§C140 '6' M6 ([USER] R-12, R-13): kept STIX Italic, Bold and BoldItalic runs are drawn in their own official
STIX 1.1.0 face under the one FigSym family, styled characters inside translated labels carry their source face,
and the M5/M6 scratch gates are gone for good.

    FIGTEXT_PYLIBS=./pylibs python3 -u -B test_figsym_faces.py

[G] ENV-INDEPENDENCE GUARD (controller G11), pure. Composer '5' -> '6' pixels must not vary with the
    environment under one COMPOSER_VERSION, so the scratch gates (`M5_Rn`, `M6_KEPT`, `M6_SERIF`, all read from
    os.environ at import) were hardwired away. G1 scans the composer's drawing modules BY AST - code, not comments
    or docstrings - and fails on any environment read of an `M5_`/`M6_` name, whatever `os` is imported as
    (the scratch wrote `import os as _os`), and whether the name is a literal or COMPUTED from a leading literal:
    the integrate M5 gate read `_os.environ.get('M5_' + r, '1')` inside `_on(r)`, so a scanner that accepts only a
    constant string sees none of M5. (The first version did exactly that and passed its own controls, which planted
    only constant-string reads - so G0 now plants that verbatim read, an f-string, `%` and `.format`.) G0/G0b are
    its controls: planted sources the scanner MUST flag, and planted look-alikes (a comment, a docstring, an
    unrelated variable, a computed name that does not OPEN on M5_/M6_) it must not.
    CONTROL in G13's sense: it passes on the pre-M6 tree too; its red is the verbatim integrate port, which still
    carried `M6_KEPT = os.environ.get(...)`, `M6_SERIF = _os.environ.get(...)` and the M5 `_on(r)` gate.

[T] REAL FIGURES, end to end (the R0 pattern of test_compose_runexact.py): each source resolves through this
    box's sources.local.json, is prepared with figure-prepare.py into a temporary directory and composed with
    figure-compose.py and its committed sidecar - one figure at a time. A source that does not resolve or prepare
    is a FAIL, never a skip.
    T1  Systemqw: every <text> 'U', 'q', 'w' is FigSym italic - the 5 kept run-exact ones (half A: the defect
        [USER] named, a sans-italic U, q, w beside a serif Δ, = and +) and the 4 laid-out ones (half B, where M5
        made q and w the bases of qout/wby/qin/won); stix.layout names the 4.            RED before M6.
    T2  CONTROL Systemqw: Δ and ' = ' stay FigSym normal (⑥a); the two '0' (a Liberation run) stay FigIS.
    T3  Systemqw embeds exactly ONE FigSym italic face, holding U, q and w, renamed clean, with name IDs 0/7
        and the CFF Notice verbatim from the official Italic face (control: the official face violates).
                                                                                          RED before M6.
    T4  GATE HeatMeas: its STIX Italic comes from TrueType objects that were never outline-compared (§C140 ㉞),
        so no <text> is FigSym, and stix.skipped names its 6 runs `unverified-object` (they were `other-face`
        before M6, which made no distinction). Control: the 6 'q' are present, as FigIS italic.
                                                                                          RED before M6.
    ⚠️ This file names no hashing library or digest by design: tools/__tests__/figure-text-sidecar.test.js
    forbids both in every .py here except the allowlisted font-integrity files. The pins live in figsym.py.
"""
import ast
import base64
import io
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(HERE / 'pylibs'))
os.environ['SOURCE_DATE_EPOCH'] = '1700000000'  # BEFORE any child is spawned (woff2 head.modified)

REPO = HERE.parent.parent
SIDECARS = REPO / 'books' / 'efnafraedi-2e' / 'figure-text'
PREPARE = HERE / 'figure-prepare.py'
COMPOSE = HERE / 'figure-compose.py'
SCANNED = ('figscripts.py', 'compose.py', 'figsym.py', 'svgout.py', 'figlayout.py')
GATE = re.compile(r'^M[56]_')

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail and not ok else ''), flush=True)
    if not ok:
        fails.append(label)


def finish():
    print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    sys.exit(1 if fails else 0)


# ── [G] the environment-independence guard ─────────────────────────────────────────────────────────

def _is_environ(node):
    """`<anything>.environ` or a bare `environ` (from os import environ)."""
    return ((isinstance(node, ast.Attribute) and node.attr == 'environ')
            or (isinstance(node, ast.Name) and node.id == 'environ'))


def _literal_prefix(node):
    """The LEADING literal text of a string expression, or None: a str constant itself; a binary operation's
    leftmost operand (`'M5_' + r`, `'M6_%s' % r`); an f-string's first part when that part is literal (`f'M5_{r}'`);
    the format string of `'M5_{}'.format(r)`. A name, a call or an f-string that opens on a field has none."""
    while isinstance(node, ast.BinOp):
        node = node.left
    if isinstance(node, ast.JoinedStr):
        node = node.values[0] if node.values else None
    elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'format':
        node = node.func.value
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def _gate_name(node):
    """The M5_/M6_ name `node` reads - for a COMPUTED name (the integrate M5 gate read `'M5_' + r`), its literal
    prefix, which is what the flagged row then names - or None."""
    lit = _literal_prefix(node)
    return lit if lit is not None and GATE.match(lit) else None


def env_gate_reads(source):
    """-> [(line, name)] for every environment READ of an M5_/M6_ name in `source`, keyed on the AST:
    `<x>.environ.get/pop/setdefault('M6_..')`, `<x>.environ['M6_..']`, `<x>.getenv('M6_..')` / `getenv(..)`,
    and `'M6_..' in <x>.environ` - with the name a literal OR computed from a leading literal (`_literal_prefix`).
    Comments and string literals elsewhere are not code and are not seen. NOT seen (no instance in any scanned
    module or in the integrate scratch): a name held in a variable first, or a read through a copy of environ."""
    out = []
    for n in ast.walk(ast.parse(source)):
        if isinstance(n, ast.Call) and n.args:
            f, name = n.func, _gate_name(n.args[0])
            if name is None:
                continue
            if isinstance(f, ast.Attribute) and f.attr in ('get', 'pop', 'setdefault') and _is_environ(f.value):
                out.append((n.lineno, name))
            elif (isinstance(f, ast.Attribute) and f.attr == 'getenv') or (isinstance(f, ast.Name) and f.id == 'getenv'):
                out.append((n.lineno, name))
        elif isinstance(n, ast.Subscript) and _is_environ(n.value):
            name = _gate_name(n.slice)
            if name is not None:
                out.append((n.lineno, name))
        elif isinstance(n, ast.Compare) and len(n.ops) == 1 and isinstance(n.ops[0], (ast.In, ast.NotIn)) \
                and _is_environ(n.comparators[0]):
            name = _gate_name(n.left)
            if name is not None:
                out.append((n.lineno, name))
    return sorted(out)


print('[G] the M5/M6 scratch gates are hardwired: no drawing module reads one from the environment')
PLANTED = '\n'.join((
    "import os",
    "import os as _os",
    "from os import environ, getenv",
    "M6_KEPT = os.environ.get('M6_KEPT', '1') == '1'",
    "M6_SERIF = _os.environ.get('M6_SERIF', '1') == '1'",
    "R1 = os.environ['M5_R1']",
    "R7 = getenv('M5_R7MODE')",
    "on = 'M5_R3' in environ",
    "t = _os.getenv('M6_TAIL', '')",
    "def _on(r):",
    "    return _os.environ.get('M5_' + r, '1') != '0'",
    "a = os.environ.get(f'M5_{r}', '1')",
    "b = environ['M6_%s' % r]",
    "c = getenv('M5_{}'.format(r))",
    "d = f'M6_{r}' in os.environ",
))
got0 = env_gate_reads(PLANTED)
check('G0 CONTROL the scanner FLAGS every planted gate read (get, _os alias, subscript, getenv, `in`, os.getenv) - '
      "and a COMPUTED name by its literal prefix: integrate's verbatim M5 gate `'M5_' + r` (line 11), an f-string, "
      "`%` and `.format`",
      got0 == [(4, 'M6_KEPT'), (5, 'M6_SERIF'), (6, 'M5_R1'), (7, 'M5_R7MODE'), (8, 'M5_R3'), (9, 'M6_TAIL'),
               (11, 'M5_'), (12, 'M5_'), (13, 'M6_%s'), (14, 'M5_{}'), (15, 'M6_')],
      repr(got0))
LOOKALIKE = '\n'.join((
    "import os",
    "# M6_KEPT = os.environ.get('M6_KEPT', '1') == '1'   (the scratch gate, hardwired away)",
    '"""os.environ.get(\'M6_SERIF\') was read here once."""',
    "p = os.environ.get('FIGTEXT_STIX_FONT')",
    "M6_LOG = []",
    "d = {}.get('M6_KEPT')",
    "e = os.environ.get(PREFIX + 'KEPT')",
    "f = os.environ.get(f'{x}M6_')",
    "g = os.environ.get('FIGTEXT_' + 'M5_X')",
))
got0b = env_gate_reads(LOOKALIKE)
check('G0b CONTROL the scanner does NOT flag a comment, a docstring, another variable, a non-environ .get, nor a '
      'computed name whose LEADING part is not an M5_/M6_ literal (a variable, an f-string field, another literal)',
      got0b == [], repr(got0b))
for name in SCANNED:
    p = HERE / name
    if not p.is_file():
        check(f'G1 {name} exists to be scanned', False, str(p))
        continue
    src = p.read_text(encoding='utf-8')
    reads = env_gate_reads(src)
    check(f'G1 {name}: no environment read of an M5_/M6_ name ({len(src.splitlines())} lines scanned)',
          reads == [] and len(src) > 1000, repr(reads))


# ── [T] real figures ──────────────────────────────────────────────────────────────────────────────

def texts(svg):
    """[(text, family, style, weight, path)] of every <text>, in order; path 'layout' iff kerning is off."""
    out = []
    for m in re.finditer(r'<text\b([^>]*)>(.*?)</text>', svg, re.S):
        a = m.group(1)

        def g(k, a=a):
            mm = re.search(k + r'="([^"]*)"', a)
            return mm.group(1) if mm else None
        out.append((m.group(2), g('font-family'), g('font-style'), g('font-weight'),
                    'layout' if 'font-kerning:none' in a else 'exact'))
    return out


def faces(svg):
    """[(family, weight, style, TTFont)] of every @font-face, in order."""
    from fontTools.ttLib import TTFont
    return [(fam, w, st, TTFont(io.BytesIO(base64.b64decode(b))))
            for fam, w, st, b in re.findall(r"@font-face\{font-family:'(\w+)';font-weight:(\d+);font-style:(\w+);"
                                            r"src:url\(data:font/woff2;base64,([^)]+)\)", svg)]


try:
    import sources as SRC
    _cfg = SRC.load_config()
    _trees = SRC.load_trees('efnafraedi-2e', _cfg)
except SystemExit as exc:
    _cfg = _trees = None
    check('T0 PRECONDITION the source trees load on this box (sources.local.json)', False, str(exc))
    finish()


def compose_real(basename, tmp):
    """resolve -> prepare -> compose with the committed sidecar. -> (svg text, report) or None after a FAIL."""
    try:
        src, _ = SRC.resolve(basename, _trees, _cfg['editionPrecedence'], superseded=_cfg.get('supersededArtwork'))
    except SystemExit as exc:
        src = None
        print(f'      {exc}')
    check(f'{basename}: PRECONDITION the source resolves on this box', src is not None, 'unresolved')
    if src is None:
        return None
    out = Path(tmp) / basename
    env = dict(os.environ)
    env.pop('FIGTEXT_OUT', None)
    prep = subprocess.run([sys.executable, '-B', str(PREPARE), str(src), '--basename', basename, '--out', str(out)],
                          capture_output=True, text=True, env=env, cwd=str(HERE))
    check(f'{basename}: PRECONDITION figure-prepare.py exits 0', prep.returncode == 0,
          f'exit {prep.returncode}: {prep.stderr.strip()[-400:]}')
    if prep.returncode != 0:
        return None
    comp = subprocess.run([sys.executable, '-B', str(COMPOSE), '--out', str(out), '--translations',
                           str(SIDECARS / f'{basename}.is.json')], capture_output=True, text=True, env=env,
                          cwd=str(HERE))
    ok = comp.returncode == 0 and (out / 'translated.svg').is_file() and (out / 'compose-report.json').is_file()
    check(f'{basename}: PRECONDITION figure-compose.py exits 0 and writes translated.svg + compose-report.json', ok,
          f'exit {comp.returncode}: {(comp.stdout + comp.stderr).strip()[-600:]}')
    if not ok:
        return None
    return ((out / 'translated.svg').read_text(encoding='utf-8'),
            json.loads((out / 'compose-report.json').read_text(encoding='utf-8')))


print('\n[T] real figures: Systemqw (halves A and B) and HeatMeas (the Type 1 gate)')
with tempfile.TemporaryDirectory(prefix='figsym-faces-') as tmp:
    res = compose_real('CNX_Chem_05_03_Systemqw', tmp)
    if res is not None:
        svg, rep = res
        t = texts(svg)
        uqw = [x for x in t if x[0] in ('U', 'q', 'w')]
        check('T1 Systemqw: every U/q/w <text> is FigSym italic - 5 kept run-exact (half A) and 4 laid out (half B)',
              all(x[1] == 'FigSym' and x[2] == 'italic' for x in uqw)
              and sum(x[4] == 'exact' for x in uqw) == 5 and sum(x[4] == 'layout' for x in uqw) == 4,
              repr(uqw))
        lay = rep.get('stix', {}).get('layout')
        check('T1b ... and stix.layout names the 4 laid-out ones: {key, block, text q|w, face [False, True]}',
              isinstance(lay, list) and [(e.get('text'), e.get('face')) for e in lay]
              == [('q', [False, True]), ('w', [False, True]), ('q', [False, True]), ('w', [False, True])]
              and all(isinstance(e.get('key'), str) and isinstance(e.get('block'), int) for e in lay)
              and all(e['key'] in rep.get('translated', []) for e in lay), repr(lay))
        sym = [x for x in t if x[0] in ('Δ', ' = ')]
        zeros = [x for x in t if x[0] == '0']
        check("T2 CONTROL Systemqw: Δ and ' = ' stay FigSym normal (⑥a); the two '0' (Liberation) stay FigIS",
              len(sym) >= 2 and all(x[1] == 'FigSym' and x[2] is None for x in sym)
              and [x[1] for x in zeros] == ['FigIS', 'FigIS'], repr((sym, zeros)))
        import figsym
        import fontsubset
        fs_it = [f for f in faces(svg) if f[0] == 'FigSym' and f[2] == 'italic']
        ok3, d3 = len(fs_it) == 1, repr([f[:3] for f in faces(svg)])
        if ok3:
            sub, off = fs_it[0][3], figsym.load_face((False, True))[0]
            cm = sub.getBestCmap()
            ok3 = (set(map(ord, 'Uqw')) <= set(cm) and fontsubset.name_violations(sub, figsym.FORBIDDEN) == []
                   and all(sub['name'].getDebugName(i) == off['name'].getDebugName(i) for i in (0, 7))
                   and sub['CFF '].cff.topDictIndex[0].Notice == off['CFF '].cff.topDictIndex[0].Notice
                   and fs_it[0][1] == '400' and len(fontsubset.name_violations(off, figsym.FORBIDDEN)) >= 4)
            d3 = f'cmap {sorted(chr(c) for c in cm)}; violations {fontsubset.name_violations(sub, figsym.FORBIDDEN)}'
        check('T3 Systemqw embeds ONE FigSym italic face, 400, holding U/q/w, renamed clean, IDs 0/7 + CFF Notice '
              'verbatim from the official Italic (control: the official face violates)', ok3, d3)

    res = compose_real('CNX_Chem_05_02_HeatMeas', tmp)
    if res is not None:
        svg, rep = res
        t = texts(svg)
        stix = rep.get('stix', {})
        qs = [x for x in t if x[0] == 'q']
        check('T4 GATE HeatMeas: no <text> is FigSym; stix.drawn is empty and stix.skipped is its 6 STIX Italic '
              'runs, each `unverified-object` (TrueType objects, never outline-compared)',
              not any(x[1] == 'FigSym' for x in t) and stix.get('drawn') == []
              and [s.get('reason') for s in stix.get('skipped', [])] == ['unverified-object'] * 6
              and stix.get('layout') == [], repr(stix))
        check("T4b CONTROL ... the 6 'q' it gates are there, drawn FigIS italic", len(qs) == 6
              and all(x[1] == 'FigIS' and x[2] == 'italic' for x in qs), repr(qs))

finish()
