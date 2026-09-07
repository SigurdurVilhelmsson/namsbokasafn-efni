#!/usr/bin/env python3
"""Acceptance harness for the figure READ layer — the instrument that decides whether
the pdfplumber replacement may be swapped in.

    FIGTEXT_PYLIBS=./pylibs python3 read_layer_accept.py --selftest
    FIGTEXT_PYLIBS=./pylibs python3 read_layer_accept.py --baseline  --json accept-baseline.json
    FIGTEXT_PYLIBS=./pylibs python3 read_layer_accept.py --candidate --json accept-candidate.json

🔴 THIS SHIPS NO READER. It ships the thing that judges one. It is written BEFORE the
replacement on purpose: a harness written afterwards gets tuned until it agrees.

Three readers, and a THREE-valued outcome (ruling R-1):

    read_baseline(pdf)  -> (runs, meta, outcome)   outcome: 'reads' | 'empty' | 'raises'
    read_candidate(pdf) -> (runs, meta, outcome)   imports readlayer.py, else raises
    read_oracle(pdf)    -> str                     pdftotext -q <pdf> -

`read_baseline` is `extract.py`'s loop VERBATIM and UNGUARDED — `page.Resources.Font`
and `int(fobj.FirstChar)` — with the exception caught at the boundary and classified.
It must never be made defensive: the point is to measure the program being replaced.
Swallowing a raise into `[]` is forbidden; it manufactures the population.

DENOMINATORS ARE MEASURED, NEVER INHERITED (ruling R-2). The census supplies the
PARTITION (its bucket labels); every count in this file is derived here. No population
size is hard-coded — 504, 496, 779 and 816 are outputs, and two of them came from a
guarded reader that is a third program again.

────────────────────────────────────────────────────────────────────────────────────
CONTRACT FOR TASK R2 — what `readlayer.py` must expose:

    readlayer.read(pdf_path) -> (runs, meta, outcome)

    runs : list of dicts, each carrying the NINE keys
           text(str) font(str) size(num) rot(num) x(num) y(num) adv(num)
           fill(None|seq) tm(6-seq)
    meta : {'fonts': {<fontkey>: {'base': <BaseFont str>, ...}}, ...}
           `run['font']` MUST be a key of `meta['fonts']` (ruling R-4 makes that key
           scope-qualified, e.g. 'PAGE/TT0', 'PAGE/Fm3/T1_0' — that is fine; this
           harness joins across readers on `base`, the only shared unit).
           A font whose bytes cannot be decoded to Unicode MUST carry
           `decodable: False` — C1b fails a silent reduction, and only that flag
           distinguishes "cannot read this" from "read nothing".
    outcome : advisory. The harness RE-DERIVES reads/empty from the runs and reports
              any disagreement, so a reader cannot certify itself.
────────────────────────────────────────────────────────────────────────────────────
"""
import collections
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time
import traceback
from contextlib import contextmanager
from pathlib import Path

EXP = Path(__file__).resolve().parent          # never process.cwd() — repo rule
sys.path.insert(0, str(EXP))
sys.path.insert(0, str(EXP / 'pylibs'))
os.environ.setdefault('FIGTEXT_PYLIBS', str(EXP / 'pylibs'))

import pikepdf                                                    # noqa: E402
import figtext as FT                                              # noqa: E402
import sources as S                                               # noqa: E402
from _deps import read_content                                    # noqa: E402
from pdftext import parse as pdftext_parse                        # noqa: E402
from blockkey import block_key                                    # noqa: E402

BOOK = 'efnafraedi-2e'
CENSUS = EXP / 'text-coverage-efnafraedi-2e.json'
OUTDIR = Path(os.environ.get('FIGTEXT_CENSUS_OUT') or (EXP / 'census-out'))
DEHASH = re.compile(r'-[0-9a-f]{4}$')

# The census buckets that are IN SCOPE. `ours-crashes` is included deliberately: it is an
# artefact of the CENSUS's instrument (text-coverage-census.py calls pg.Contents.read_bytes(),
# which raises when /Contents is an ARRAY), not of the reader. Those figures ARE the whole of
# spec H4, so excluding them measures H4 on zero figures.
TEXT_BUCKETS = ('page-text', 'form-text-only', 'type0-unreadable',
                'text-but-unexplained', 'ours-crashes')

# The nine run keys. Shape conformance is per-run and needs no pairing (ruling R-10).
RUN_KEYS = ('text', 'font', 'size', 'rot', 'x', 'y', 'adv', 'fill', 'tm')
NUMERIC_KEYS = ('size', 'rot', 'x', 'y', 'adv')

# ⚠️ An EXPLICIT whitespace set, never str.isspace()/str.strip(). `'\x1f'.isspace()` is
# True and a /Differences font maps \x1f to a Greek alpha, so .strip() would delete a real
# glyph — and would delete it from the `dropped, oracle also lacks` column too, which is
# exactly where a loss poppler cannot see would hide.
WS = ' \t\r\n\f'

# C4 pairs blocks by key and then compares geometry. The two readers derive x/y by
# different routes, so an exact compare is not the question; a block that has MOVED is.
BBOX_TOL_PT = 1.0

SELFTEST_SAMPLE = 40      # figures per bucket for selftest assertions 1-3 and 5
SELFTEST_CRASH_FLOOR = 20 # assertion 4's floor: "over 20 of the 38"


# ── population ──────────────────────────────────────────────────────────────────────

def load_population(buckets=TEXT_BUCKETS, limit=None):
    rows = json.loads(CENSUS.read_text())
    pop = [r for r in rows if r['bucket'] in buckets]
    if limit:
        pop = pop[:limit]
    return rows, pop


def resolver():
    cfg = S.load_config()
    trees = S.load_trees(BOOK, cfg)
    prec = cfg['editionPrecedence']

    def resolve(name):
        p, key = S.resolve(name, trees, prec)
        if not p and DEHASH.search(name):
            p, key = S.resolve(DEHASH.sub('', name), trees, prec)
        return p, key
    return resolve


@contextmanager
def staged(path):
    """Convert .eps/.ai ONCE per figure and hand the SAME path to every reader.

    Converting per reader makes ghostscript's nondeterminism read as a reader difference.
    Yields (pdf_path, error); the temp file is removed in a finally.
    """
    if path.suffix.lower() not in ('.eps', '.ai'):
        yield path, None
        return
    tf = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    tf.close()
    try:
        r = subprocess.run(['gs', '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-dEPSCrop',
                            '-sDEVICE=pdfwrite', f'-sOutputFile={tf.name}', str(path)],
                           capture_output=True, timeout=120)
        if r.returncode != 0 or os.path.getsize(tf.name) == 0:
            yield None, f'gs exit {r.returncode}, {os.path.getsize(tf.name)} bytes'
        else:
            yield Path(tf.name), None
    except subprocess.TimeoutExpired:
        yield None, 'gs timeout 120s'
    finally:
        try:
            os.unlink(tf.name)
        except OSError:
            pass


# ── the three readers ───────────────────────────────────────────────────────────────

def outcome_of(runs):
    """'reads' iff any run carries a non-empty text string.

    The predicate is `text != ''`, NOT `text.strip()` — see WS above."""
    return 'reads' if any((r.get('text') if isinstance(r, dict) else '') for r in runs) else 'empty'


def read_baseline(pdf_path):
    """extract.py's loop, VERBATIM and UNGUARDED, with the exception caught AT THE
    BOUNDARY and classified as 'raises'. Do not make this defensive.

    `widths` is built in extract.py's shape — {fontkey: {charcode: width/1000}} — and
    NOT read-layer-bakeoff.py's {'first':…, 'w':[…]}, which pdftext.parse's
    `w.get(ord(ch), 0.5)` silently misses (advances 52.515/16.002/37.512 vs
    49.5/13.5/40.5, i.e. every advance wrong and no error).
    """
    try:
        pdf = pikepdf.open(pdf_path)
        page = pdf.pages[0]
        content = read_content(page)

        widths, fontmap = {}, {}
        for name, fobj in page.Resources.Font.items():
            first = int(fobj.FirstChar)
            ws = [float(w) for w in fobj.Widths]
            key = '/' + str(name).lstrip('/')
            widths[key] = {first + i: w / 1000.0 for i, w in enumerate(ws)}
            fontmap[key] = dict(base=str(fobj.BaseFont), first=first,
                                last=int(fobj.LastChar), subtype=str(fobj.Subtype),
                                encoding=str(fobj.get('/Encoding', '')))

        runs = pdftext_parse(content, widths)
        box = page.MediaBox
        meta = dict(source=str(pdf_path), fonts=fontmap,
                    page=[float(box[2]), float(box[3])], runs=len(runs))
    except Exception as exc:
        return [], {'fonts': {}, 'error': f'{type(exc).__name__}: {exc}',
                    'error_type': type(exc).__name__}, 'raises'
    return runs, meta, outcome_of(runs)


def read_candidate(pdf_path):
    """The replacement reader (Task R2's readlayer.py). See the CONTRACT block above."""
    try:
        import readlayer
    except ImportError as exc:
        raise SystemExit(
            "readlayer.py is not importable, so there is no candidate to accept.\n"
            f"  ({type(exc).__name__}: {exc})\n"
            "  Task R2 must create experiments/figure-text-translation/readlayer.py\n"
            "  exposing:  read(pdf_path) -> (runs, meta, outcome)\n"
            "  See the CONTRACT FOR TASK R2 block at the top of read_layer_accept.py.")
    if not hasattr(readlayer, 'read'):
        raise SystemExit("readlayer.py has no read(pdf_path) -> (runs, meta, outcome). "
                         "See the CONTRACT block in read_layer_accept.py.")
    try:
        runs, meta, declared = readlayer.read(pdf_path)
    except Exception as exc:
        return [], {'fonts': {}, 'error': f'{type(exc).__name__}: {exc}',
                    'error_type': type(exc).__name__}, 'raises'
    meta = dict(meta or {})
    meta['declared_outcome'] = declared      # reported, never trusted: a reader may not
    return runs, meta, outcome_of(runs)      # certify itself


def read_oracle(pdf_path):
    """poppler's view. `pdftotext` descends into /Form XObjects, which is precisely the
    scope the baseline cannot see, so it is the tiebreak in C1 and the referee in C3."""
    r = subprocess.run(['pdftotext', '-q', str(pdf_path), '-'],
                       capture_output=True, timeout=120)
    return r.stdout.decode('utf-8', 'replace')


def make_mutant(reader):
    """A reader that drops the LAST run of every figure. Used only by --selftest
    assertion 2: it is the positive control that proves C1 can go red at all."""
    def mutant(pdf_path):
        runs, meta, outcome = reader(pdf_path)
        if runs:
            runs = list(runs)[:-1]
        return runs, meta, outcome
    return mutant


MOJIBAKE_FIX = '°'   # '°' — the glyph H3's real fix produces where the baseline
                          # reads '¡'. See below: C1 cannot be affected by this CHOICE.


def make_mojibake_mutant(reader):
    """A reader that REPLACES every character poppler cannot see — R2's H3 fix in
    miniature. Used only by --selftest assertion 5 (ruling R-15).

    🔴 WHY THIS ASSERTION EXISTS. C1's rule is
    `regression ⟺ (baseline − candidate) ∩ oracle ≠ ∅`, and the intersection is what
    stops the harness REJECTING the ~96 mojibake repairs R2 exists to make: when the
    candidate correctly reads `°C` where the baseline read `¡C`, the `¡` is "missing"
    and a mechanical compare calls that a regression. In a baseline-vs-baseline run
    nothing is ever missing, so that branch is STRUCTURALLY UNREACHABLE and reports
    `0/530` — a zero that says nothing whatever about whether the mechanism works. This
    mutant is the only thing that reaches it.

    ⚠️ The REPLACEMENT CHARACTER cannot make the assertion pass spuriously: C1 looks only
    at the dropped side (`Counter(baseline) − Counter(candidate)`), so adding a character
    to the candidate can never create a regression, only mask one — and this mutant makes
    no other change for it to mask. The half that could genuinely fail is the one asserted
    alongside: zero regressions AND a non-zero excused count.

    ⚠️ Whitespace is skipped deliberately. `charcount` excludes whitespace, so `ochars`
    never contains a space, and without this guard every space in the corpus would be
    "oracle-absent" and get replaced — mangling block keys and making the mutant a
    caricature rather than a miniature of the fix it stands in for.
    """
    def mutant(pdf_path):
        runs, meta, outcome = reader(pdf_path)
        try:
            ochars = set(charcount(read_oracle(pdf_path)))
        except Exception:
            # No oracle, no mutation. `process_figure` tolerates an oracle failure; this
            # dict comprehension does not, and a mutant that raises would be read as a
            # harness fault rather than as the absence of a stimulus.
            return runs, meta, outcome
        if not ochars:
            return runs, meta, outcome
        out = []
        for r in runs:
            if isinstance(r, dict) and r.get('text'):
                t = ''.join(MOJIBAKE_FIX if (ch not in ochars and ch not in WS) else ch
                            for ch in r['text'])
                if t != r['text']:
                    r = dict(r, text=t)
            out.append(r)
        return out, meta, outcome
    return mutant


# ── measurement primitives ──────────────────────────────────────────────────────────

def charcount(text):
    return collections.Counter(ch for ch in text if ch not in WS)


def runs_text(runs):
    return ''.join((r.get('text') or '') if isinstance(r, dict) else '' for r in runs)


def blocks_of(runs):
    """figtext.group()/merge_blocks() index [0] unguarded and IndexError on []; the guard
    lives here because figtext.py is Task R4's file (P3), not this task's."""
    if not runs:
        return []
    return FT.merge_blocks(FT.group(runs))


def block_bbox(block):
    """Baseline extent of the block in user space: each run's origin plus its advance
    along its own rotation."""
    xs, ys = [], []
    for r in block:
        a = math.radians(r['rot'])
        xs += [r['x'], r['x'] + r['adv'] * math.cos(a)]
        ys += [r['y'], r['y'] + r['adv'] * math.sin(a)]
    return (min(xs), min(ys), max(xs), max(ys))


def block_fonts(block, meta):
    """The BaseFonts a block uses. Resolved through meta['fonts'] because the two readers
    key fonts differently by design (R-4: 'TT0' vs 'PAGE/TT0'); BaseFont is the shared unit."""
    fonts = (meta or {}).get('fonts') or {}
    out = set()
    for r in block:
        k = r.get('font')
        ent = fonts.get(k) or {}
        out.add(ent.get('base') or f'UNRESOLVED:{k}')
    return frozenset(out)


def block_records(runs, meta):
    """-> (list of (key, bbox, fonts), Counter of key -> multiplicity, error|None)"""
    try:
        blocks = blocks_of(runs)
        recs = [(block_key(b), block_bbox(b), block_fonts(b, meta)) for b in blocks]
    except Exception as exc:
        return [], collections.Counter(), f'{type(exc).__name__}: {exc}'
    return recs, collections.Counter(k for k, _, _ in recs), None


def key_delta(b_keys, c_keys):
    """C4b's comparison. MULTISETS, never sets — ruling R-13.

    🔴 A SET COMPARE CANNOT SEE A DROPPED TWIN, AND THE TWIN IS THE COMMON CASE.
    `compose.py` iterates BLOCKS and looks up `TR[key]` for each one, so two blocks that
    share a key are BOTH drawn. A candidate that produces one where the baseline produced
    two therefore leaves a label **undrawn** — while `set(candidate) == set(baseline)`,
    so a set compare reports nothing and every other count stays green. Measured over the
    full baseline run: **2,052 duplicate keys across 245 of 530 figures**, and 22 of 62
    page-text figures in an independent check.

    Takes two `collections.Counter`s; returns `(added, dropped)` as sorted
    `[(key, multiplicity)]`. The multiplicity IS the finding, so it is carried through to
    the row rather than summed away — `Counter - Counter` keeps only positive counts, which
    is exactly the asymmetric "what did this side have that the other did not" both
    directions need.
    """
    return (sorted((c_keys - b_keys).items()),
            sorted((b_keys - c_keys).items()))


CID = '(cid:'


def looks_undecoded(text):
    """Control-byte garbage, or poppler's explicit un-decodable marker."""
    if CID in text:
        return True
    return any(ord(ch) < 0x20 and ch not in '\t\n\r' for ch in text)


def shape_violations(runs, meta):
    """C4's per-run half: nine keys, right types, font resolves. No pairing needed."""
    v = collections.Counter()
    fonts = (meta or {}).get('fonts') or {}
    for r in runs:
        if not isinstance(r, dict):
            v['not-a-dict'] += 1
            continue
        for k in RUN_KEYS:
            if k not in r:
                v[f'missing:{k}'] += 1
        if not isinstance(r.get('text'), str):
            v['type:text'] += 1
        for k in NUMERIC_KEYS:
            if not isinstance(r.get(k), (int, float)) or isinstance(r.get(k), bool):
                v[f'type:{k}'] += 1
        tm = r.get('tm')
        if not isinstance(tm, (list, tuple)) or len(tm) != 6:
            v['type:tm'] += 1
        fill = r.get('fill')
        if fill is not None and not isinstance(fill, (list, tuple)):
            v['type:fill'] += 1
        if r.get('font') not in fonts:
            v['font-unresolved'] += 1
    return v


# ── one figure, one staging, N readers ──────────────────────────────────────────────

def process_figure(row, resolve, cmp_readers):
    """Stage ONCE, read baseline ONCE, read the oracle ONCE, then every candidate arm.

    Every in-scope figure lands in exactly one status, so the table's columns sum to its
    rows. A `continue` on an unresolvable figure would manufacture the denominator.
    """
    name = row['name']
    out = dict(name=name, bucket=row['bucket'], arms={})
    path, edition = resolve(name)
    if not path:
        out['status'] = 'unresolved-now'
        return out
    out['edition'] = edition
    out['ext'] = path.suffix.lower()

    with staged(path) as (src, stage_err):
        if stage_err:
            out['status'] = 'stage-failed'
            out['stage_error'] = stage_err
            return out
        out['status'] = 'staged'
        try:
            oracle = read_oracle(src)
            out['oracle_error'] = None
        except Exception as exc:
            oracle = ''
            out['oracle_error'] = f'{type(exc).__name__}: {exc}'
        b_runs, b_meta, b_out = read_baseline(src)
        arms = {label: reader(src) for label, reader in cmp_readers.items()}

    ochars = charcount(oracle)
    out['oracle_words'] = len(oracle.split())
    out['oracle_chars'] = sum(ochars.values())
    out['base'] = dict(outcome=b_out, runs=len(b_runs),
                       chars=sum(charcount(runs_text(b_runs)).values()),
                       error=b_meta.get('error'))
    b_recs, b_keys, b_kerr = block_records(b_runs, b_meta)
    out['base']['blocks'] = len(b_recs)
    out['base']['blockkey_error'] = b_kerr
    out['base']['dup_keys'] = sum(n - 1 for n in b_keys.values() if n > 1)
    out['base']['shape'] = dict(shape_violations(b_runs, b_meta))

    b_chars = charcount(runs_text(b_runs))
    b_bykey = {k: (bb, ff) for k, bb, ff in b_recs}

    for label, (c_runs, c_meta, c_out) in arms.items():
        a = dict(outcome=c_out, runs=len(c_runs),
                 chars=sum(charcount(runs_text(c_runs)).values()),
                 error=c_meta.get('error'),
                 declared_outcome=c_meta.get('declared_outcome'))
        a['declared_disagrees'] = (a['declared_outcome'] is not None
                                   and a['declared_outcome'] != c_out)
        c_recs, c_keys, c_kerr = block_records(c_runs, c_meta)
        a['blocks'] = len(c_recs)
        a['blockkey_error'] = c_kerr
        a['dup_keys'] = sum(n - 1 for n in c_keys.values() if n > 1)
        a['shape'] = dict(shape_violations(c_runs, c_meta))
        c_chars = charcount(runs_text(c_runs))

        # ── C1: regression control, scoped to figures the BASELINE reads ──────────
        if b_out == 'reads':
            dropped = b_chars - c_chars          # Counter-, positive counts only
            a['c1_regression'] = {ch: n for ch, n in dropped.items() if ch in ochars}
            a['c1_excused'] = {ch: n for ch, n in dropped.items() if ch not in ochars}
            a['c1_scope'] = True
        else:
            a['c1_regression'], a['c1_excused'], a['c1_scope'] = {}, {}, False

        # ── C1b: type0 correctness ────────────────────────────────────────────────
        if row['bucket'] == 'type0-unreadable':
            a['c1b'] = classify_type0(c_runs, c_meta, ochars)

        # ── C2: positive control, scoped to figures the baseline CANNOT read ──────
        a['c2_scope'] = b_out in ('raises', 'empty')
        a['c2_gained'] = a['c2_scope'] and c_out == 'reads'

        # ── C3: oracle agreement about whether the figure has text AT ALL ─────────
        a['c3_oracle_has_text'] = bool(ochars)
        a['c3_reader_has_text'] = c_out == 'reads'
        a['c3_disagrees'] = a['c3_oracle_has_text'] != a['c3_reader_has_text']

        # ── C4 / C4b: paired by BLOCK KEY, never by run index (ruling R-10) ───────
        if b_out == 'reads' and c_out == 'reads':
            c_bykey = {k: (bb, ff) for k, bb, ff in c_recs}
            a['c4b_added'], a['c4b_dropped'] = key_delta(b_keys, c_keys)
            # Pair only keys UNIQUE on both sides: a duplicated key has no single partner.
            pairable = [k for k in set(b_keys) & set(c_keys)
                        if b_keys[k] == 1 and c_keys[k] == 1]
            geom, font = [], []
            for k in pairable:
                bb, bf = b_bykey[k]
                cb, cf = c_bykey[k]
                if max(abs(x - y) for x, y in zip(bb, cb)) > BBOX_TOL_PT:
                    geom.append(k)
                if bf != cf:
                    font.append(k)
            a['c4_paired'] = len(pairable)
            a['c4_geom_diff'] = sorted(geom)
            a['c4_font_diff'] = sorted(font)
            a['c4_scope'] = True
        else:
            a.update(c4b_added=[], c4b_dropped=[], c4_paired=0,
                     c4_geom_diff=[], c4_font_diff=[], c4_scope=False)
        out['arms'][label] = a
    return out


def classify_type0(runs, meta, ochars):
    """C1b. The reference is the ORACLE, not the baseline — the baseline RAISES on every
    type0 figure (AttributeError: /FirstChar), so 'less text than the baseline' is a
    predicate that can never fire.

    'decoded'              — real text that overlaps what poppler sees, no control bytes
    'declared-undecodable' — every font the runs use carries decodable: False
    'FAIL-silent'          — anything else: text quietly reduced, with nothing said
    """
    if not ochars:
        return 'n/a-no-oracle-text'
    text = runs_text(runs)
    if text and not looks_undecoded(text) and (set(charcount(text)) & set(ochars)):
        return 'decoded'
    fonts = (meta or {}).get('fonts') or {}
    used = {r.get('font') for r in runs if isinstance(r, dict)}
    if used and all((fonts.get(k) or {}).get('decodable') is False for k in used):
        return 'declared-undecodable'
    return 'FAIL-silent'


# ── reporting ───────────────────────────────────────────────────────────────────────

def bucket_table(results, buckets):
    """The per-bucket table. Six columns, and they SUM to `rows` — a table whose columns
    do not sum has silently dropped a population."""
    lines = []
    hdr = (f"{'bucket':24} {'rows':>5} {'reads':>6} {'empty':>6} {'raises':>7} "
           f"{'unres':>6} {'stagefail':>10}")
    lines.append(hdr)
    lines.append('-' * len(hdr))
    tot = collections.Counter()
    for b in buckets:
        rs = [r for r in results if r['bucket'] == b]
        if not rs:
            continue
        c = collections.Counter()
        for r in rs:
            if r['status'] == 'unresolved-now':
                c['unres'] += 1
            elif r['status'] == 'stage-failed':
                c['stagefail'] += 1
            else:
                c[r['base']['outcome']] += 1
        summed = c['reads'] + c['empty'] + c['raises'] + c['unres'] + c['stagefail']
        flag = '' if summed == len(rs) else f'  !! columns sum to {summed}, not {len(rs)}'
        lines.append(f"{b:24} {len(rs):>5} {c['reads']:>6} {c['empty']:>6} "
                     f"{c['raises']:>7} {c['unres']:>6} {c['stagefail']:>10}{flag}")
        tot.update(c)
        tot['rows'] += len(rs)
    lines.append('-' * len(hdr))
    lines.append(f"{'TOTAL':24} {tot['rows']:>5} {tot['reads']:>6} {tot['empty']:>6} "
                 f"{tot['raises']:>7} {tot['unres']:>6} {tot['stagefail']:>10}")
    return '\n'.join(lines), tot


def summarise(results, label, buckets):
    """Print the criteria with a denominator on every line. Returns (c1_regs, c1b_fails)."""
    table, tot = bucket_table(results, buckets)
    print(table)
    print()

    staged_rows = [r for r in results if r['status'] == 'staged']
    arms = [r for r in staged_rows if label in r['arms']]

    def arm(r):
        return r['arms'][label]

    n = len(arms)
    print(f"  ARM: {label}   ({n} of {len(results)} in-scope figures staged and read)")
    ac = collections.Counter(arm(r)['outcome'] for r in arms)
    print(f"    candidate outcomes:        reads {ac['reads']}/{n}  "
          f"empty {ac['empty']}/{n}  raises {ac['raises']}/{n}")
    lied = [r['name'] for r in arms if arm(r)['declared_disagrees']]
    if lied:
        print(f"    ⚠ declared outcome disagrees with derived: {len(lied)}/{n}  "
              f"{lied[:5]}")

    # C1
    c1_scope = [r for r in arms if arm(r)['c1_scope']]
    c1_bad = [r for r in c1_scope if arm(r)['c1_regression']]
    c1_exc = [r for r in c1_scope if arm(r)['c1_excused']]
    print(f"\n  C1  regression (baseline reads it, candidate loses a char the ORACLE also has)")
    print(f"      REGRESSIONS:               {len(c1_bad)}/{len(c1_scope)} figures")
    for r in c1_bad[:10]:
        d = arm(r)['c1_regression']
        print(f"        {r['name']:44} {sum(d.values()):>5} chars  {dict(list(d.items())[:6])}")
    if len(c1_bad) > 10:
        print(f"        … and {len(c1_bad)-10} more (see --json)")
    print(f"      dropped, oracle also lacks: {len(c1_exc)}/{len(c1_scope)} figures "
          f"(NON-FAILING — mojibake the candidate fixed, per ruling R-3)")
    exc_chars = collections.Counter()
    for r in c1_exc:
        exc_chars.update(arm(r)['c1_excused'])
    if exc_chars:
        print(f"        top excused chars: {dict(exc_chars.most_common(8))}")

    # C1b
    c1b = [r for r in arms if 'c1b' in arm(r)]
    c1b_fail = [r for r in c1b if arm(r)['c1b'] == 'FAIL-silent']
    if c1b:
        cc = collections.Counter(arm(r)['c1b'] for r in c1b)
        print(f"\n  C1b type0 correctness       {len(c1b)} figures: "
              + '  '.join(f'{k} {v}' for k, v in cc.most_common()))
        for r in c1b_fail:
            print(f"        FAIL-silent: {r['name']}  "
                  f"(oracle {r['oracle_words']} words, candidate {arm(r)['chars']} chars)")

    # C2
    c2 = [r for r in arms if arm(r)['c2_scope']]
    gained = [r for r in c2 if arm(r)['c2_gained']]
    stuck = [r for r in c2 if not arm(r)['c2_gained']]
    print(f"\n  C2  positive control (baseline raises or is empty)  {len(c2)} figures")
    print(f"      GAINED (candidate reads):  {len(gained)}/{len(c2)}")
    print(f"      still not read:            {len(stuck)}/{len(c2)}")
    for r in stuck[:15]:
        print(f"        {r['name']:44} base={r['base']['outcome']:6} "
              f"cand={arm(r)['outcome']:6} oracle={r['oracle_words']}w")
    if len(stuck) > 15:
        print(f"        … and {len(stuck)-15} more (see --json)")

    # C3
    c3 = [r for r in arms if arm(r)['c3_disagrees']]
    only_o = [r for r in c3 if r['arms'][label]['c3_oracle_has_text']]
    only_r = [r for r in c3 if not r['arms'][label]['c3_oracle_has_text']]
    print(f"\n  C3  oracle agreement (does the figure have text AT ALL)")
    print(f"      disagreements:             {len(c3)}/{len(arms)}  "
          f"(oracle-only {len(only_o)}, reader-only {len(only_r)})")
    for r in only_r[:8]:
        print(f"        reader-only text: {r['name']}  (poppler sees none — suspect junk)")

    # C4 / C4b
    c4 = [r for r in arms if arm(r)['c4_scope']]
    geom = [r for r in c4 if arm(r)['c4_geom_diff']]
    font = [r for r in c4 if arm(r)['c4_font_diff']]
    kdiff = [r for r in c4 if arm(r)['c4b_added'] or arm(r)['c4b_dropped']]
    paired = sum(arm(r)['c4_paired'] for r in c4)
    print(f"\n  C4  block conformance (both read: {len(c4)} figures, {paired} paired blocks)")
    print(f"      geometry differs > {BBOX_TOL_PT}pt:   {len(geom)}/{len(c4)} figures")
    print(f"      font set differs:          {len(font)}/{len(c4)} figures")
    shape = collections.Counter()
    for r in arms:
        shape.update(arm(r)['shape'])
    base_shape = collections.Counter()
    for r in staged_rows:
        base_shape.update(r['base']['shape'])
    print(f"      per-run shape violations:  candidate {sum(shape.values())}  "
          f"| baseline {sum(base_shape.values())} (CONTROL: a 0/0 pair may mean the "
          f"check is vacuous)")
    if shape:
        print(f"        candidate: {dict(shape.most_common(6))}")
    if base_shape:
        print(f"        baseline:  {dict(base_shape.most_common(6))}")
    # OCCURRENCES and DISTINCT are different numbers and both are reported: a candidate
    # that turns two identical blocks into one drops 1 OCCURRENCE and 0 DISTINCT keys,
    # which is precisely the loss ruling R-13 exists to make visible.
    add_occ = sum(n for r in c4 for _, n in arm(r)['c4b_added'])
    drop_occ = sum(n for r in c4 for _, n in arm(r)['c4b_dropped'])
    add_dis = sum(len(arm(r)['c4b_added']) for r in c4)
    drop_dis = sum(len(arm(r)['c4b_dropped']) for r in c4)
    bdup = sum(r['base']['dup_keys'] for r in staged_rows)
    cdup = sum(arm(r)['dup_keys'] for r in arms)
    print(f"\n  C4b BLOCK-KEY conformance — the one that costs money (MULTISET, R-13)")
    print(f"      figures with key differences: {len(kdiff)}/{len(c4)}   "
          f"blocks added {add_occ} ({add_dis} distinct keys), "
          f"dropped {drop_occ} ({drop_dis} distinct keys)")
    print(f"      duplicate keys — WHY this compare is a multiset and not a set: "
          f"baseline {bdup}, candidate {cdup}")
    for r in kdiff[:8]:
        print(f"        {r['name']:40} +{arm(r)['c4b_added'][:2]} -{arm(r)['c4b_dropped'][:2]}")
    if len(kdiff) > 8:
        print(f"        … and {len(kdiff)-8} more (see --json)")

    blkerr = [r['name'] for r in arms if arm(r)['blockkey_error']]
    if blkerr:
        print(f"\n  ⚠ block-key derivation raised on {len(blkerr)}/{n}: {blkerr[:5]}")
    return len(c1_bad), len(c1b_fail)


# ── the runs ────────────────────────────────────────────────────────────────────────

def run_arms(pop, cmp_readers, progress=True):
    resolve = resolver()
    results = []
    t0 = time.time()
    for i, row in enumerate(pop):
        results.append(process_figure(row, resolve, cmp_readers))
        if progress and i and i % 50 == 0:
            print(f"    …{i}/{len(pop)}  ({time.time()-t0:.0f}s)", flush=True)
    return results, time.time() - t0


def full_run(label, cmp_readers, jout, limit, bucket):
    buckets = (bucket,) if bucket else TEXT_BUCKETS
    if bucket and bucket not in TEXT_BUCKETS:
        print(f"--bucket must be one of {TEXT_BUCKETS}", file=sys.stderr)
        return 2
    _, pop = load_population(buckets, limit)
    print(f"POPULATION: {len(pop)} figures in buckets {list(buckets)} "
          f"(partition from the census; every count below is measured here)\n")
    results, secs = run_arms(pop, cmp_readers)
    c1_bad, c1b_fail = summarise(results, label, buckets)
    print(f"\n  wall-clock: {secs:.1f}s for {len(pop)} figures "
          f"({secs/max(len(pop),1):.2f}s each)")
    if jout:
        jout.parent.mkdir(parents=True, exist_ok=True)
        jout.write_text(json.dumps(results, indent=1, ensure_ascii=False))
        print(f"  per-figure rows -> {jout}")

    # An exit code is a VERDICT, and this run is what decides whether the swap may
    # happen. C1b is folded in deliberately: its rule is "a silent reduction is a
    # FAILURE", and a gate that exits 0 while 8 figures quietly lose their text is not
    # a gate. Both components are printed every time, so the code is never ambiguous.
    verdict = 0 if (c1_bad == 0 and c1b_fail == 0) else 1
    print(f"\n  VERDICT: exit {verdict} — C1 regressions ×{c1_bad}, "
          f"C1b silent-reduction ×{c1b_fail}")
    if label == 'self' and c1b_fail:
        print("    (baseline-vs-baseline: the C1b failures are EXPECTED and are the "
              "defect R2 must fix —\n     the baseline raises AttributeError: /FirstChar "
              "on every type0 figure, so it reduces\n     their text to nothing and says "
              "nothing. That is what `decodable: False` exists to declare.)")
    return verdict


def sample(rows, n):
    """Evenly spaced across the bucket, so a selftest sample is not one chapter."""
    if len(rows) <= n:
        return list(rows)
    return [rows[int(i * len(rows) / n)] for i in range(n)]


def selftest():
    """FIVE assertions. Exits NON-ZERO when any fails.

    3 and 4 are asymmetric on purpose: together they prove the harness distinguishes a
    crash from a read, which is the whole of ruling R-1.

    5 is the one a baseline-vs-baseline run CANNOT reach (ruling R-15): C1's mojibake
    excuse only fires when something is missing, so without a mutant its 0 is a zero from
    an unexercised branch. It is what decides whether R2's ~96 H3 repairs are accepted or
    silently rejected as regressions, and its failure mode is the rejection of correct
    work — the direction nobody goes looking for.
    """
    rows = json.loads(CENSUS.read_text())
    fails = []

    def check(label, ok, detail):
        print(f"  {'PASS' if ok else 'FAIL'}  {label}: {detail}", flush=True)
        if not ok:
            fails.append(label)

    pt = sample([r for r in rows if r['bucket'] == 'page-text'], SELFTEST_SAMPLE)
    ft = sample([r for r in rows if r['bucket'] == 'form-text-only'], SELFTEST_SAMPLE)
    oc = [r for r in rows if r['bucket'] == 'ours-crashes']

    # 1, 2 and 5 share ONE collection pass, so they are the same sample by construction.
    print(f"\n[1+2+5] page-text sample: {len(pt)} figures, baseline vs "
          f"{{self, drop-last-run mutant, mojibake mutant}}", flush=True)
    res, secs = run_arms(pt, {'self': read_baseline,
                              'mutant': make_mutant(read_baseline),
                              'mojibake': make_mojibake_mutant(read_baseline)},
                         progress=False)
    staged_rows = [r for r in res if r['status'] == 'staged']
    read_rows = [r for r in staged_rows if r['base']['outcome'] == 'reads']

    self_reg = [r for r in read_rows if r['arms']['self']['c1_regression']]
    self_key = [r for r in staged_rows if r['arms']['self']['c4b_added']
                or r['arms']['self']['c4b_dropped']]
    blocks_seen = sum(r['base']['blocks'] for r in staged_rows)
    check('1 plumbing — baseline vs baseline is clean',
          len(self_reg) == 0 and len(self_key) == 0 and len(read_rows) > 0
          and blocks_seen > 0,
          f"{len(read_rows)}/{len(pt)} figures read, {blocks_seen} blocks derived; "
          f"C1 regressions {len(self_reg)}, C4b key differences {len(self_key)} "
          f"(non-vacuity: both denominators must be > 0)")

    mut_reg = [r for r in read_rows if r['arms']['mutant']['c1_regression']]
    check('2 SENSITIVITY — a reader that drops the last run MUST trip C1',
          len(mut_reg) > 0,
          f"{len(mut_reg)}/{len(read_rows)} figures flagged. Without this, C1 is a null "
          f"with no positive control")

    print(f"\n[3] form-text-only sample: {len(ft)} figures — the set C2 exists to fix",
          flush=True)
    res3, _ = run_arms(ft, {}, progress=False)
    st3 = [r for r in res3 if r['status'] == 'staged']
    oc3 = collections.Counter(r['base']['outcome'] for r in st3)
    errs = collections.Counter(r['base']['error'] for r in st3
                               if r['base']['outcome'] == 'raises')
    check('3 the positive-control set is genuinely failing TODAY',
          oc3['raises'] == len(st3) and len(st3) > 0 and oc3['empty'] == 0,
          f"raises {oc3['raises']}/{len(st3)}, empty {oc3['empty']}, reads {oc3['reads']} "
          f"— a CRASH, not a silent scope failure. {dict(errs.most_common(2))}")

    print(f"\n[4] ours-crashes: all {len(oc)} figures — the census's instrument crashed, "
          f"the reader does not", flush=True)
    res4, _ = run_arms(oc, {}, progress=False)
    st4 = [r for r in res4 if r['status'] == 'staged']
    oc4 = collections.Counter(r['base']['outcome'] for r in st4)
    check(f'4 the population correction is live (>= {SELFTEST_CRASH_FLOOR} of {len(oc)} read)',
          oc4['reads'] >= SELFTEST_CRASH_FLOOR,
          f"reads {oc4['reads']}, empty {oc4['empty']}, raises {oc4['raises']} "
          f"of {len(st4)} staged ({len(oc)} rows)")
    nonread = [(r['name'], r['base']['error'] or r['base']['outcome'])
               for r in st4 if r['base']['outcome'] != 'reads']
    if nonread:
        print(f"        the non-readers, NAMED: {nonread}")

    # 5 reuses the [1+2+5] pass above — no figure is read twice — but is asserted here so
    # the output reads in order. It is the ONLY thing that reaches C1's excuse branch.
    print(f"\n[5] the mojibake excuse (ruling R-15) — measured on the same {len(pt)} "
          f"page-text figures", flush=True)
    moj_reg = [r for r in read_rows if r['arms']['mojibake']['c1_regression']]
    moj_exc = [r for r in read_rows if r['arms']['mojibake']['c1_excused']]
    moj_chars = collections.Counter()
    for r in moj_exc:
        moj_chars.update(r['arms']['mojibake']['c1_excused'])
    check('5 the EXCUSE fires and C1 does NOT reject the fix it exists to accept',
          len(moj_reg) == 0 and len(moj_exc) > 0,
          f"regressions {len(moj_reg)}/{len(read_rows)} (MUST be 0), excused "
          f"{len(moj_exc)}/{len(read_rows)} figures (MUST be > 0, or the branch was "
          f"never reached and its 0 means nothing): "
          f"{dict(moj_chars.most_common(6))}")
    if moj_reg:
        for r in moj_reg[:5]:
            print(f"        WRONGLY FLAGGED: {r['name']:44} "
                  f"{dict(list(r['arms']['mojibake']['c1_regression'].items())[:6])}")

    print(f"\n  {'ALL 5 PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
    return 0 if not fails else 1


# ── strict argv ─────────────────────────────────────────────────────────────────────

BOOL_FLAGS = {'--selftest', '--baseline', '--candidate', '--help', '-h'}
VALUE_FLAGS = {'--json', '--limit', '--bucket'}
USAGE = __doc__.split('🔴')[0].strip()


def parse_argv(argv):
    """Unknown flags are REJECTED, not dropped, and a valued flag whose value is missing
    or begins with '--' is rejected too. `tools/lib/parseArgs.js`'s silent drop is how a
    'safe rehearsal into a scratch directory' becomes a full-strength run."""
    opts = {'json': None, 'limit': None, 'bucket': None, 'mode': None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ('--help', '-h'):
            print(USAGE)
            raise SystemExit(0)
        if a in ('--selftest', '--baseline', '--candidate'):
            if opts['mode']:
                print(f"Conflicting modes: {opts['mode']} and {a[2:]}", file=sys.stderr)
                raise SystemExit(2)
            opts['mode'] = a[2:]
            i += 1
            continue
        if a in VALUE_FLAGS:
            if i + 1 >= len(argv) or argv[i + 1].startswith('--'):
                print(f"Missing value for {a}", file=sys.stderr)
                raise SystemExit(2)
            opts[a[2:]] = argv[i + 1]
            i += 2
            continue
        print(f"Unknown argument: {a}", file=sys.stderr)
        print(f"Known: {sorted(BOOL_FLAGS | VALUE_FLAGS)}", file=sys.stderr)
        raise SystemExit(2)
    if opts['limit'] is not None:
        if not opts['limit'].isdigit() or int(opts['limit']) < 1:
            print("--limit must be a positive integer", file=sys.stderr)
            raise SystemExit(2)
        opts['limit'] = int(opts['limit'])
    if opts['json']:
        p = Path(opts['json'])
        opts['json'] = p if p.is_absolute() else OUTDIR / p
    if not opts['mode']:
        print(USAGE, file=sys.stderr)
        raise SystemExit(2)
    return opts


def main(argv):
    opts = parse_argv(argv)
    if opts['mode'] == 'selftest':
        return selftest()
    if opts['mode'] == 'baseline':
        return full_run('self', {'self': read_baseline},
                        opts['json'], opts['limit'], opts['bucket'])
    return full_run('candidate', {'candidate': read_candidate},
                    opts['json'], opts['limit'], opts['bucket'])


if __name__ == '__main__':
    # Failure default: a run that dies before reaching a verdict is NOT a pass.
    code = 2
    try:
        code = main(sys.argv[1:])
    except SystemExit as e:
        if isinstance(e.code, int):
            code = e.code
        else:
            # A SystemExit carrying a MESSAGE (read_candidate's contract refusal). Print
            # it — swallowing it turns a loud refusal into a bare exit code.
            if e.code:
                print(e.code, file=sys.stderr)
            code = 2
    except Exception:
        traceback.print_exc()
        code = 2
    sys.stdout.flush()
    sys.stderr.flush()
    sys.exit(code)
