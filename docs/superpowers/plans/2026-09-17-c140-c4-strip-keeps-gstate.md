# §C140 ④ — strip keeps graphics state inside text objects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `strip-text.py` keeps the persistent graphics-state operators it finds inside BT..ET and refuses any other non-text operator there, and the bought figures whose artwork changes are recomposed at 0 ISK.

**Architecture:** One function in `experiments/figure-text-translation/strip-text.py` changes (`strip_text_ops`), with a new exception and two operator constants; a new Python test file pins it by pixel value. Verification reuses the frozen exploration's render instrument, pointed at two whole modules (the file as it is at the branch start, and the fixed file), plus a real-prepare `artwork.svg` comparison that decides which bought figures to recompose with `tools/figure-run.js --stale --force --figure`.

**Tech Stack:** Python 3 (pikepdf, numpy, PIL from the gitignored `pylibs/`), poppler `pdftocairo`/`pdftotext`, ghostscript, Node 22 (`tools/figure-run.js`, `render-check.mjs` with playwright).

**Spec:** `docs/superpowers/specs/2026-09-17-c140-c4-strip-keeps-gstate-design.md` (rulings S1–S6). Exploration evidence: `experiments/figure-text-translation/evidence/2026-09-16-c4-explore/`.

## Global Constraints

- **0 ISK.** Never run `translate-blocks.mjs`. `tools/figure-run.js` runs only with `--dry-run`, except Task 4's recompose, which is `--stale --force --figure <basename>` on figures that already have a sidecar (it prints `MT spawned for 0 figure(s)`); run it in the FOREGROUND.
- **Before any `figure-run.js` run:** from `experiments/figure-text-translation/`, `FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py` must print `ALL PASS`.
- **Nothing under `books/` is written** except Task 4's recomposed `books/efnafraedi-2e/media/<basename>_IS.svg` files. `books/*/01-source/` is read-only by project rule. No sidecar or `image-mapping.json` may change.
- **Base commit for "before":** `7a45f0500fe5b19287ad5b98e89360d452beda94` (main at PR #475; `strip-text.py` is unchanged from there to the branch start).
- **Python tests** run from `experiments/figure-text-translation/` as `FIGTEXT_PYLIBS=./pylibs python3 test_X.py`, use plain `check(label, ok, detail)` + a final `ALL PASS` line (no pytest), and are not in CI — record their last lines in commit messages and evidence.
- **JS:** no JS file changes in this plan. The full root vitest run is compared **by failing test name** with the baseline list, both directions, with a planted control and a died-file check.
- **Heavy commands one at a time** (memory-capped box; `/tmp` is a 4.9 GB tmpfs): corpus renders, corpus prepares, the vitest run and the recompose never overlap. Use `python3 -u` and a terminal marker line for any long redirected batch; judge completion by the marker.
- **Evidence** goes in `experiments/figure-text-translation/evidence/2026-09-17-c4-build/`; frozen evidence cites only files inside its own folder (design/plan links excepted). `.gitignore` ignores `*.log`: `git add -f` any cited log.
- **Numbers in any document come from files produced in this build** — never from the spec, this plan or memory.
- The persistent-state allowlist is exactly: `g G rg RG k K cs CS sc SC scn SCN gs w J j M d ri i`. The text operators are exactly: `Tc Tw Tz TL Tf Tr Ts Td TD Tm T* Tj TJ ' "`.
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (an implementer may name its own model).

---

### Task 1: Baseline and predictions (0 ISK, before any code change)

**Files:**
- Create: `experiments/figure-text-translation/evidence/2026-09-17-c4-build/PREDICTIONS.md`
- Create: `…/2026-09-17-c4-build/instruments/strip_text_before.py` (byte copy of `strip-text.py` at the base commit)
- Create: `…/2026-09-17-c4-build/instruments/prepare_corpus.py` (copy of `evidence/2026-09-16-c7-build/instruments/prepare_corpus.py`)
- Create: `…/2026-09-17-c4-build/instruments/figparts.py` (copy of `evidence/2026-09-15-t23-review-fixes/instruments/figparts.py`)
- Create: `…/2026-09-17-c4-build/instruments/svg_arms.py`
- Create: `…/2026-09-17-c4-build/instruments/june_copies.py`
- Create: `…/2026-09-17-c4-build/reports/before/…` (outputs)

**Interfaces:**
- Produces: `instruments/strip_text_before.py` (Task 3 imports it as the BEFORE module); `reports/before/summary.tsv` + `reports/before/blocks/` (Task 3 diffs them); `reports/before/svg-arms.json` (Task 3 compares); `instruments/svg_arms.py --label before|after`; `instruments/figparts.py` (Task 4); `reports/before/npm-failing-by-name.txt` (Task 3).

- [ ] **Step 1: Freeze the "before" strip and copy the reused instruments**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
B=experiments/figure-text-translation/evidence/2026-09-17-c4-build
mkdir -p $B/instruments $B/reports/before
git show 7a45f0500fe5b19287ad5b98e89360d452beda94:experiments/figure-text-translation/strip-text.py > $B/instruments/strip_text_before.py
cmp $B/instruments/strip_text_before.py experiments/figure-text-translation/strip-text.py && echo "before == working file (expected at this step)"
cp experiments/figure-text-translation/evidence/2026-09-16-c7-build/instruments/prepare_corpus.py $B/instruments/
cp experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/instruments/figparts.py $B/instruments/
cp experiments/figure-text-translation/evidence/2026-09-16-c7-build/reports/after-fix/npm-failing-by-name.txt $B/reports/before/npm-failing-by-name.txt
```

In `$B/instruments/prepare_corpus.py`, change the `--label` choices line to `choices=['before', 'after']` and its docstring's evidence folder name to `2026-09-17-c4-build` and "§C140 ④"; nothing else. Keep `reports/before/npm-failing-by-name.txt` byte-exact; its provenance goes in Task 5's README (this branch changes no JS, and PR #475's CI failing names matched this list).

- [ ] **Step 2: Write `instruments/svg_arms.py`**

```python
#!/usr/bin/env python3
"""§C140 ④ — does the strip change artwork.svg on the bought figures where it could without a pixel change?

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/svg_arms.py --label before [--twice]

Runs the REAL figure-prepare.py (which runs whatever strip-text.py is on disk) for each figure into a temp
directory and records artwork.svg's sha256 and size, svgfix.json, and counts of <mask, <image, <use, <path.
--twice runs each figure a second time and records whether artwork.svg is byte-identical (the determinism
control that makes a before/after sha comparison meaningful). Keeps a gzipped copy of each artwork.svg in
the scratch dir given by --keep (default: none).
Writes reports/<label>/svg-arms.json and prints DONE n=<k> as its last line.
"""
import argparse, gzip, hashlib, json, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve()
EXP = HERE.parents[3]
sys.path.insert(0, str(EXP))
import _deps  # noqa: F401,E402
import sources as S  # noqa: E402

FIGURES = ['CNX_Chem_04_05_combustion', 'CNX_Chem_03_01_exocytosis-88f6', 'CNX_Chem_03_03_empform',
           'CNX_Chem_04_02_HClsoln', 'CNX_Chem_04_03_flowchart', 'CNX_Chem_04_04_sandwich']
HASH_SUFFIX = '-'


def resolve(name, trees, prec):
    detail = S.resolve_detail(name, trees, prec) if hasattr(S, 'resolve_detail') else None
    if detail and detail.get('path'):
        return Path(detail['path'])
    stem = name.rsplit('-', 1)[0] if len(name.rsplit('-', 1)[-1]) == 4 else name
    detail = S.resolve_detail(stem, trees, prec)
    return Path(detail['path']) if detail and detail.get('path') else None


def prepare(artwork, basename):
    out = Path(tempfile.mkdtemp(prefix='c4-svgarm-'))
    r = subprocess.run([sys.executable, str(EXP / 'figure-prepare.py'), str(artwork), '--basename', basename,
                        '--out', str(out)], capture_output=True, text=True, cwd=str(EXP), timeout=1800)
    return out, r.returncode, (r.stderr or r.stdout)[-400:]


def measure(out):
    svg = (out / 'artwork.svg').read_bytes()
    fix = json.loads((out / 'svgfix.json').read_text()) if (out / 'svgfix.json').exists() else None
    return {'sha256': hashlib.sha256(svg).hexdigest(), 'bytes': len(svg), 'svgfix': fix,
            'mask': svg.count(b'<mask'), 'image': svg.count(b'<image'), 'use': svg.count(b'<use'),
            'path': svg.count(b'<path')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--label', required=True, choices=['before', 'after'])
    ap.add_argument('--twice', action='store_true')
    ap.add_argument('--keep')
    args = ap.parse_args()
    cfg = S.load_config()
    trees = S.load_trees('efnafraedi-2e', cfg)
    prec = cfg['editionPrecedence']
    rows = {}
    for b in FIGURES:
        art = resolve(b, trees, prec)
        if art is None:
            rows[b] = {'error': 'unresolved'}
            print(f'{b}: unresolved', flush=True)
            continue
        out, rc, tail = prepare(art, b)
        row = {'artwork': str(art), 'rc': rc}
        if rc == 0:
            row.update(measure(out))
            if args.keep:
                keep = Path(args.keep) / args.label
                keep.mkdir(parents=True, exist_ok=True)
                with gzip.open(keep / f'{b}.artwork.svg.gz', 'wb') as fh:
                    fh.write((out / 'artwork.svg').read_bytes())
            if args.twice:
                out2, rc2, _ = prepare(art, b)
                row['second_sha256'] = measure(out2)['sha256'] if rc2 == 0 else None
                row['deterministic'] = row['second_sha256'] == row['sha256']
                shutil.rmtree(out2, ignore_errors=True)
        else:
            row['error_tail'] = tail
        shutil.rmtree(out, ignore_errors=True)
        rows[b] = row
        print(f"{b}: rc={rc} sha={row.get('sha256', '')[:12]} det={row.get('deterministic')}", flush=True)
    dst = HERE.parents[1] / 'reports' / args.label / 'svg-arms.json'
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(rows, indent=1))
    print(f'DONE n={len(rows)}')


if __name__ == '__main__':
    main()
```

Before running it, read `sources.py`'s `resolve_detail` and `load_trees` signatures and fix the helper calls if they differ (the ⑦ build added `resolve_detail(name, trees, precedence, …)`); **report any change you had to make.** A hashed name like `exocytosis-88f6` resolves through its stripped stem, as the driver's de-hash does.

- [ ] **Step 3: Run the SVG arms, before, with the determinism control**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
SP=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-build
mkdir -p $SP
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/svg_arms.py --label before --twice --keep $SP/svg-keep \
  > evidence/2026-09-17-c4-build/reports/before/svg-arms.log 2>&1; tail -8 evidence/2026-09-17-c4-build/reports/before/svg-arms.log
```

Expected: last line `DONE n=6`, every figure `rc=0`. If any figure is `det=False`, artwork.svg is not deterministic for that figure: record it; Task 3 must then compare by the counts and a structural diff instead of the sha for that figure (say so in PREDICTIONS.md).

- [ ] **Step 4: Run the keys baseline**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/prepare_corpus.py --label before \
  > evidence/2026-09-17-c4-build/reports/before/run.log 2>&1; tail -3 evidence/2026-09-17-c4-build/reports/before/run.log
wc -l evidence/2026-09-17-c4-build/reports/before/summary.tsv
```

Expected: the instrument's own terminal line, and `summary.tsv` with a header plus 38 rows (34 bought + 4 hazard figures).

- [ ] **Step 5: Write `instruments/june_copies.py` and measure the June-vintage copies once (spec S6)**

```python
#!/usr/bin/env python3
"""§C140 ④ S6 — do the June-vintage published copies carry the same lost graphics state? Read-only.

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/june_copies.py <scratch-dir>

For each figure: render the committed books/efnafraedi-2e/media/<b>_IS.svg in Chromium (render-check.mjs,
the reader's renderer) at the source raster's pixel size, render the source artwork with pdftocairo at 200 dpi,
and save a side-by-side crop of the region the exploration found the strip damages. Prints the crop paths and
DONE. Judgement is by LOOKING at the crops; the numbers are only the crop boxes.
"""
import subprocess, sys, tempfile
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve()
EXP = HERE.parents[3]
REPO = EXP.parents[1]
sys.path.insert(0, str(EXP))
import _deps  # noqa: F401,E402
import sources as S  # noqa: E402

# (basename, crop box in 200-dpi source pixels: left, top, right, bottom) — the exploration's PERSIST-vs-ORIG
# bbox_gt40 (evidence/2026-09-16-c4-explore/render/results.jsonl.gz) with a 20 px margin
# (Egeom: the line-dash-wedge row; IcePack: the lettering).
FIGURES = [('CNX_Chem_07_06_Egeom', (311, 358, 1230, 690)), ('CNX_Chem_05_02_IcePack', (116, 166, 564, 280))]


def main(scratch):
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    cfg = S.load_config()
    trees = S.load_trees('efnafraedi-2e', cfg)
    for b, box in FIGURES:
        svg = REPO / 'books/efnafraedi-2e/media' / f'{b}_IS.svg'
        d = S.resolve_detail(b, trees, cfg['editionPrecedence'])
        src = Path(d['path'])
        base = scratch / f'{b}-source'
        subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(src), str(base)], check=True)
        s_img = Image.open(f'{base}.png')
        w, h = s_img.size
        june = scratch / f'{b}-june.png'
        subprocess.run(['node', str(EXP / 'render-check.mjs'), str(svg), str(june), str(w), str(h), '1'],
                       check=True, cwd=str(EXP))
        j_img = Image.open(june).convert('RGB').resize((w, h))
        box = box or (0, 0, w, h)
        pair = Image.new('RGB', (2 * (box[2] - box[0]), box[3] - box[1]), 'white')
        pair.paste(s_img.convert('RGB').crop(box), (0, 0))
        pair.paste(j_img.crop(box), (box[2] - box[0], 0))
        out = HERE.parents[1] / 'reports' / 'before' / f'june-{b}.png'
        pair.save(out)
        print(f'{b}: source {w}x{h}; crop {box} -> {out}', flush=True)
    print('DONE')


if __name__ == '__main__':
    main(sys.argv[1])
```

Run it, then **open both saved PNGs and look**: write one sentence per figure into `reports/before/june-copies.md` — does the June copy show the damage the exploration found in the ORIG strip (Egeom's wedge/dash bonds faint; IcePack's lettering), match the source, or show something else? If a render fails (playwright missing), record the error verbatim — do not install anything.

- [ ] **Step 6: Write `PREDICTIONS.md`**

```markdown
# Predictions — §C140 ④, written before the code change (2026-09-17)

Numbers from the frozen exploration (`evidence/2026-09-16-c4-explore/`, copied here as expectations, not as
measurements of this build).

- **P1 — corpus renders.** Over the 533 figures (the 34 bought + every figure the census found with a non-text
  operator inside BT), BEFORE (`instruments/strip_text_before.py`) vs AFTER (the fixed `strip-text.py`): exactly
  **34** figures differ by value (count_gt0 > 0), **15** above 40 per channel, the changed set **equal by name** to the
  exploration's; every changed pixel at distance 0.0 from the source; the serialiser control 0 px; the planted control
  detected.
- **P2 — bought.** Among the 34 bought figures only `CNX_Chem_04_05_combustion` differs.
- **P3 — refusals.** The fixed strip, run over every figure the census scanned (909 distinct), refuses **0**.
- **P4 — keys.** `reports/after/summary.tsv` equals `reports/before/summary.tsv` byte for byte, and all 38
  `blocks.json` are identical.
- **P5 — SVG arms.** combustion's `artwork.svg` differs before/after. For exocytosis-88f6, empform, HClsoln,
  flowchart and sandwich: **undetermined** (the render saw 0 px); for every figure, no `<mask`/`<image` count and no
  `svgfix.json` collapsed/addOps count rises.
- **P6 — recompose.** Only the recompose set's `_IS.svg` files change under `books/`; for each, `textgroup_sha256`
  is identical and `artwork_sha256` differs; `MT spawned for 0 figure(s)`; no sidecar or mapping change;
  combustion's recomposed copy, rendered in Chromium, shows 7 black arrowheads.
- **P7 — tests.** Every existing Python suite still prints `ALL PASS`; `test_strip_text.py` prints `ALL PASS` and its
  negative arms fail against the shipped rule; the root vitest failing names equal `reports/before/npm-failing-by-name.txt`.
- **P8 — June copies.** Unpredicted: recorded as found (`reports/before/june-copies.md`).
```

Adjust only P5 if Step 3 found a non-deterministic figure (say how it will be compared instead).

- [ ] **Step 7: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/evidence/2026-09-17-c4-build
git add -f experiments/figure-text-translation/evidence/2026-09-17-c4-build/reports/before/*.log
git status --porcelain -- books/   # must be empty
git commit -m "evidence(figures): §C140 ④ build — baseline, SVG arms, June copies and predictions, 0 ISK"
```

---

### Task 2: The strip keeps persistent graphics state and refuses anything else (TDD)

**Files:**
- Create: `experiments/figure-text-translation/test_strip_text.py`
- Modify: `experiments/figure-text-translation/strip-text.py` (module docstring; `strip_text_ops`; new constants and exception; `strip_text` stats; `main` printout; the clipping-mode docstring paragraph)

**Interfaces:**
- Produces: `TEXT_OPERATORS: frozenset[str]`, `PERSISTENT_STATE_OPERATORS: frozenset[str]`,
  `class TextObjectOperatorRefused(UnparsableStream)`, `strip_text_ops(source) -> (bytes, blocks_removed: int, state_kept: int)`,
  `strip_text(pdf) -> {'page_before', 'page_after', 'forms_visited', 'forms_rewritten', 'state_kept', 'unparsable'}`.

- [ ] **Step 1: Write the failing tests** — `experiments/figure-text-translation/test_strip_text.py`

```python
#!/usr/bin/env python3
"""Tests for strip-text.py's text-object rule (§C140 ④). Run:

    FIGTEXT_PYLIBS=./pylibs python3 test_strip_text.py

Plain checks, like the other suites. Every pixel assertion compares a VALUE, never a count of non-white pixels
(a recoloured element has the same count), and every property is paired with a negative arm built from the
shipped rule (drop everything inside BT..ET), which must FAIL the same assertion — so the test can see the defect.
"""
import importlib.util
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import _deps  # noqa: F401  — sys.path, never process.cwd()

import pikepdf  # noqa: E402
from PIL import Image  # noqa: E402

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('strip_text_tool', HERE / 'strip-text.py')
ST = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ST)
N = pikepdf.Name
WORK = Path(tempfile.mkdtemp(prefix='c4-strip-test-'))
fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''))
    if not ok:
        fails.append(label)


def old_rule(source):
    """The shipped rule, frozen here as the negative arm: every instruction inside BT..ET is dropped."""
    owner = None
    if isinstance(source, (bytes, bytearray)):
        owner = pikepdf.new()
        source = owner.make_stream(bytes(source))
    out, depth = [], 0
    for ins in pikepdf.parse_content_stream(source):
        if isinstance(ins, pikepdf.ContentStreamInlineImage):
            if depth == 0:
                out.append(ins)
            continue
        op = str(ins.operator)
        if op == 'BT':
            depth += 1
            continue
        if op == 'ET':
            depth = max(0, depth - 1)
            continue
        if depth == 0:
            out.append(ins)
    data = pikepdf.unparse_content_stream(out)
    del owner
    return data


def page_pdf(content, dst, in_form=False):
    """A 100x100 pt page drawing `content`, on the page or inside one /Form. -> dst."""
    pdf = pikepdf.new()
    font = pdf.make_indirect(pikepdf.Dictionary(Type=N('/Font'), Subtype=N('/Type1'), BaseFont=N('/Helvetica')))
    gs = pdf.make_indirect(pikepdf.Dictionary(Type=N('/ExtGState'), LW=6))
    res = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font), ExtGState=pikepdf.Dictionary(GS1=gs))
    page = pdf.add_blank_page(page_size=(100, 100))
    if in_form:
        form = pdf.make_stream(content)
        form.Type, form.Subtype = N('/XObject'), N('/Form')
        form.BBox = pikepdf.Array([0, 0, 100, 100])
        form.Resources = res
        page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Fm0=pdf.make_indirect(form)))
        page.Contents = pdf.make_stream(b'q /Fm0 Do Q\n')
    else:
        page.Resources = res
        page.Contents = pdf.make_stream(content)
    pdf.save(dst)
    return dst


def render(pdf_path, tag):
    base = WORK / tag
    subprocess.run(['pdftocairo', '-png', '-r', '200', '-singlefile', str(pdf_path), str(base)], check=True)
    return Image.open(f'{base}.png').convert('RGB')


def words(pdf_path):
    r = subprocess.run(['pdftotext', str(pdf_path), '-'], capture_output=True, text=True)
    return r.stdout.split()


def strip_with(src, dst, rule):
    """Strip `src` into `dst` with ST.strip_text, the text-object rule replaced by `rule` when given."""
    saved = ST.strip_text_ops
    if rule is not None:
        ST.strip_text_ops = lambda s: (rule(s), 0, 0)
    try:
        pdf = pikepdf.open(src)
        stats = ST.strip_text(pdf)
        pdf.save(dst)
        return stats
    finally:
        ST.strip_text_ops = saved


# 200 dpi: 1 pt = 200/72 px. The second square spans 55..85 pt in x and 20..50 pt in y (PDF y up).
def px(img, x_pt, y_pt):
    s = 200 / 72
    return img.getpixel((int(x_pt * s), int((100 - y_pt) * s)))


# ── 1. A fill colour set inside BT paints the artwork drawn after ET ────────────────────────────
print('\n[1] fill colour set inside a text object survives the strip')
COLOUR = (b'0 0 0 rg 5 20 30 30 re f\n'
          b'BT 1 0 0 rg /F1 12 Tf 5 70 Td (Hi) Tj ET\n'
          b'55 20 30 30 re f\n')
for where in ('page', 'form'):
    src = page_pdf(COLOUR, WORK / f'colour-{where}.pdf', in_form=(where == 'form'))
    new_out, old_out = WORK / f'colour-{where}-new.pdf', WORK / f'colour-{where}-old.pdf'
    stats = strip_with(src, new_out, None)
    strip_with(src, old_out, old_rule)
    s, n, o = render(src, f'c-{where}-src'), render(new_out, f'c-{where}-new'), render(old_out, f'c-{where}-old')
    check(f'1a-{where} CONTROL — the source paints the second square red', px(s, 70, 35)[0] > 200 and px(s, 70, 35)[1] < 60,
          f'source pixel {px(s, 70, 35)}')
    check(f'1b-{where} NEGATIVE ARM — the shipped rule paints it black', px(o, 70, 35)[0] < 60,
          f'old-rule pixel {px(o, 70, 35)} (if red, this fixture cannot show the defect)')
    check(f'1c-{where} the fixed strip paints it red, like the source', px(n, 70, 35) == px(s, 70, 35),
          f'fixed {px(n, 70, 35)} vs source {px(s, 70, 35)}')
    check(f'1d-{where} and says it kept the state', stats['state_kept'] == 1, f"state_kept={stats['state_kept']}")
    def glyph_box_dark(img):     # the "Hi" glyphs sit in x 5..20 pt, y 68..80 pt; nothing else is drawn there
        s_ = 200 / 72
        box = img.crop((int(5 * s_), int(20 * s_), int(20 * s_), int(32 * s_)))
        return sum(1 for p in box.getdata() if sum(p) < 600)
    check(f'1e-{where} CONTROL — the source draws glyph ink in the glyph box', glyph_box_dark(s) > 20,
          f'{glyph_box_dark(s)} dark px')
    check(f'1f-{where} the text is still removed: no glyph ink, no words', glyph_box_dark(n) == 0 and words(new_out) == [],
          f'{glyph_box_dark(n)} dark px, words {words(new_out)}')

# ── 2. An ExtGState set inside BT survives too ─────────────────────────────────────────────────
print('\n[2] an ExtGState set inside a text object survives the strip')
GS = (b'BT /GS1 gs /F1 12 Tf 5 70 Td (Hi) Tj ET\n'
      b'0 0 0 RG 10 40 m 90 40 l S\n')
src = page_pdf(GS, WORK / 'gs.pdf')
new_out, old_out = WORK / 'gs-new.pdf', WORK / 'gs-old.pdf'
strip_with(src, new_out, None)
strip_with(src, old_out, old_rule)
s, n, o = render(src, 'gs-src'), render(new_out, 'gs-new'), render(old_out, 'gs-old')
# 1 pt default width is ~3 px thick at 200 dpi; the /LW 6 line is ~17 px. Sample 2.5 pt above the line centre.
check('2a CONTROL — the source line is thick', px(s, 50, 42.5)[0] < 60, f'source pixel {px(s, 50, 42.5)}')
check('2b NEGATIVE ARM — the shipped rule draws it thin', px(o, 50, 42.5)[0] > 200, f'old-rule pixel {px(o, 50, 42.5)}')
check('2c the fixed strip draws it thick, like the source', px(n, 50, 42.5) == px(s, 50, 42.5),
      f'fixed {px(n, 50, 42.5)} vs source {px(s, 50, 42.5)}')

# ── 3. Anything else inside BT refuses, loudly, from a page and from a form ─────────────────────
print('\n[3] any other operator inside a text object refuses the figure')
REFUSED = {
    'q': b'BT q /F1 12 Tf (x) Tj Q ET\n',
    'cm': b'BT 1 0 0 1 5 5 cm /F1 12 Tf (x) Tj ET\n',
    'BDC': b'BT /Span <</ActualText (x)>> BDC /F1 12 Tf (x) Tj EMC ET\n',
    're': b'BT 0 0 10 10 re f /F1 12 Tf (x) Tj ET\n',
    'Do': b'BT /Fm9 Do /F1 12 Tf (x) Tj ET\n',
    'BX': b'BT BX /F1 12 Tf (x) Tj EX ET\n',
    'zz': b'BT zz /F1 12 Tf (x) Tj ET\n',
}
for op, content in REFUSED.items():
    for where in ('page', 'form'):
        src = page_pdf(content, WORK / f'refuse-{op}-{where}.pdf', in_form=(where == 'form'))
        try:
            strip_with(src, WORK / f'refuse-{op}-{where}-out.pdf', None)
            raised, msg = None, ''
        except ST.UnparsableStream as exc:
            raised, msg = exc, str(exc)
        check(f'3-{op}-{where} refused, naming the operator',
              raised is not None and f"'{op}'" in msg, f'{type(raised).__name__ if raised else "no exception"}: {msg[:160]}')
# ── 3-inline: an inline image inside BT ────────────────────────────────────────────────────────
def _raises_inline():
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(100, 100))
    page.Contents = pdf.make_stream(b'BT BI /W 1 /H 1 /BPC 8 /CS /G ID \x00 EI ET\n')
    try:
        ST.strip_text_ops(page)
        return False, 'no exception'
    except ST.TextObjectOperatorRefused as exc:
        return True, str(exc)


ok, msg = _raises_inline()
check('3-inline an inline image inside a text object is refused', ok, msg[:160])

# ── 4. Order and constants ──────────────────────────────────────────────────────────────────────
print('\n[4] kept operators keep their place; the two operator sets are disjoint')
data, removed, kept = ST.strip_text_ops(b'0 0 1 rg BT 1 0 0 rg /F1 12 Tf (x) Tj ET 5 5 10 10 re f\n')
_owner = pikepdf.new()          # a NAMED owner: an inline pikepdf.new() dies mid-expression (strip-text.py docstring)
ops = [str(i.operator) for i in pikepdf.parse_content_stream(_owner.make_stream(data))]
check('4a order: the kept rg sits after the earlier rg and before the fill', ops == ['rg', 'rg', 're', 'f'],
      f'operators {ops}, removed={removed}, kept={kept}')
check('4b constants are disjoint', not (ST.TEXT_OPERATORS & ST.PERSISTENT_STATE_OPERATORS),
      str(ST.TEXT_OPERATORS & ST.PERSISTENT_STATE_OPERATORS))
check('4c the allowlist is exactly the approved set',
      ST.PERSISTENT_STATE_OPERATORS == frozenset('g G rg RG k K cs CS sc SC scn SCN gs w J j M d ri i'.split()),
      str(sorted(ST.PERSISTENT_STATE_OPERATORS)))
check('4d the text operators are exactly the approved set',
      ST.TEXT_OPERATORS == frozenset(['Tc', 'Tw', 'Tz', 'TL', 'Tf', 'Tr', 'Ts', 'Td', 'TD', 'Tm', 'T*', 'Tj', 'TJ', "'", '"']),
      str(sorted(ST.TEXT_OPERATORS)))

# ── 5. Serialiser control ───────────────────────────────────────────────────────────────────────
print('\n[5] a stream without text round-trips pixel-identically')
src = page_pdf(b'0 0 1 rg 10 10 80 80 re f\n', WORK / 'notext.pdf')
out = WORK / 'notext-out.pdf'
st5 = strip_with(src, out, None)
check('5 no text: same pixels, nothing kept or removed',
      list(render(src, 'nt-src').getdata()) == list(render(out, 'nt-out').getdata()) and st5['state_kept'] == 0,
      f"state_kept={st5['state_kept']}")

# ── 6. Corpus anchor: combustion's arrowheads (local only) ──────────────────────────────────────
print('\n[6] corpus anchor — combustion, inside an arrowhead component')
try:
    import read_layer_accept as H  # noqa: E402
    resolve = H.resolver()
    path, _ = resolve('CNX_Chem_04_05_combustion')
except Exception as exc:  # noqa: BLE001 — a box without the source tree
    path = None
    print(f'  SKIP  6: source tree unavailable ({type(exc).__name__}: {exc})')
if path:
    with H.staged(path) as (staged, err):
        assert not err, err
        new_out, old_out = WORK / 'comb-new.pdf', WORK / 'comb-old.pdf'
        strip_with(staged, new_out, None)
        strip_with(staged, old_out, old_rule)
        s, n, o = render(staged, 'comb-src'), render(new_out, 'comb-new'), render(old_out, 'comb-old')
    # Rows 150-177, cols 267-305 at 200 dpi hold the largest arrowhead (exploration render/logs/post_pass.log).
    # Find a pixel inside it where the SOURCE is dark — never the bbox midpoint, which falls between arrowheads.
    cand = [(c, r) for r in range(150, 178) for c in range(267, 306) if sum(s.getpixel((c, r))) < 150]
    probe = cand[len(cand) // 2] if cand else None
    check('6a CONTROL — a dark source pixel exists inside the arrowhead box', probe is not None, str(probe))
    if probe:
        check('6b NEGATIVE ARM — the shipped rule does not match the source there',
              o.getpixel(probe) != s.getpixel(probe), f'old {o.getpixel(probe)} vs source {s.getpixel(probe)}')
        check('6c the fixed strip matches the source there', n.getpixel(probe) == s.getpixel(probe),
              f'fixed {n.getpixel(probe)} vs source {s.getpixel(probe)}')

shutil.rmtree(WORK, ignore_errors=True)
print(f"\n  {'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(0 if not fails else 1)
```

- [ ] **Step 2: Run it against the shipped code and confirm it fails for the right reasons**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 test_strip_text.py 2>&1 | tail -30`
Expected: a crash or FAILs because `TextObjectOperatorRefused`, `TEXT_OPERATORS`, `PERSISTENT_STATE_OPERATORS` and the 3-tuple return do not exist yet. Record the output. (The 1a/1b/2a/2b/6a/6b CONTROL and NEGATIVE ARM checks are expected to PASS once the file can run at all — they test the fixtures, not the fix.)

- [ ] **Step 3: Implement in `strip-text.py`**

Add after `class UnparsableStream`:

```python
# §C140 ④. Text operators are removed with the text object. Everything below is graphics state PDF does NOT
# scope to BT..ET: a colour or ExtGState set inside a text object keeps applying to artwork drawn after ET, so
# deleting it recolours that artwork (measured: combustion's 7 arrowheads blue-grey; Egeom's wedge bonds nearly
# gone). Census 2026-09-16 over 909 figures: inside BT..ET only k, gs and rg occur besides text operators
# (evidence/2026-09-16-c4-explore/). Anything else found there is REFUSED, not guessed — see TextObjectOperatorRefused.
TEXT_OPERATORS = frozenset(['Tc', 'Tw', 'Tz', 'TL', 'Tf', 'Tr', 'Ts', 'Td', 'TD', 'Tm', 'T*', 'Tj', 'TJ', "'", '"'])
PERSISTENT_STATE_OPERATORS = frozenset('g G rg RG k K cs CS sc SC scn SCN gs w J j M d ri i'.split())


class TextObjectOperatorRefused(UnparsableStream):
    """An operator inside BT..ET that is neither text nor persistent graphics state. RAISED, never guessed.

    For these, keeping and dropping can BOTH silently damage artwork: an in-BT `q` whose `Q` sits outside;
    half of a marked-content pair; English drawn as a path, an XObject or an inline image. None occurs in the
    909-figure census, so a refusal costs nothing today and turns an unmeasured case — organic's artwork, a
    ghostscript upgrade — into one loud failed prepare instead of a silently wrong picture. Extend
    PERSISTENT_STATE_OPERATORS only with evidence.
    """
```

Replace the body of `strip_text_ops` from `ops = list(...)` to `return result, removed` with:

```python
    ops = list(pikepdf.parse_content_stream(source))
    out, depth, removed, kept = [], 0, 0, 0
    for instruction in ops:
        # An inline image is its own instruction, so its payload is never scanned for
        # operators at all — which is the whole point.
        if isinstance(instruction, pikepdf.ContentStreamInlineImage):
            if depth:
                raise TextObjectOperatorRefused(
                    "an inline image inside a text object (BT..ET) — refused, not guessed; see "
                    "TextObjectOperatorRefused")
            out.append(instruction)
            continue
        op = str(instruction.operator)
        if op == 'BT':
            # DEPTH, not a boolean: BT..ET does not nest in valid PDF, but a malformed
            # stream that opens twice must not be closed by the first ET and drop the
            # rest of the text object back into the output.
            depth += 1
            removed += 1
            continue
        if op == 'ET':
            depth = max(0, depth - 1)
            continue
        if depth == 0:
            out.append(instruction)
        elif op in PERSISTENT_STATE_OPERATORS:
            out.append(instruction)          # graphics state outlives ET — keep it where it was
            kept += 1
        elif op not in TEXT_OPERATORS:
            raise TextObjectOperatorRefused(
                f"operator '{op}' inside a text object (BT..ET) is neither text nor persistent graphics "
                f"state — refused, not guessed; see TextObjectOperatorRefused")
    result = pikepdf.unparse_content_stream(out)
    del owner            # explicit: nothing below may reference the throwaway Pdf
    return result, removed, kept
```

In `strip_text`: change `stripped, _n = strip_text_ops(content)` to `stripped, _n, kept = strip_text_ops(content)`; initialise `stats` with `'state_kept': kept`; in the form walk change `new, _n = strip_text_ops(old)` to `new, _n, form_kept = strip_text_ops(old)` and add `stats['state_kept'] += form_kept` after `xobj.write(new)`. The existing `except Exception` around each call already collects a refusal from a form into `stats['unparsable']` and raises `UnparsableStream` after the walk, and the page-level `except Exception` wraps it — keep both; their messages include `str(exc)`, which names the operator.

⚠️ The page-level wrap re-raises as `UnparsableStream(f'page content stream: {type(exc).__name__}: {exc}')` — the operator name survives in the message, which is what test 3 asserts.

In `main()`, after the form-XObjects print line, add:

```python
    print(f"graphics state kept from text objects: {stats['state_kept']} operator(s)")
```

- [ ] **Step 4: Correct the docstrings (spec S5)**

- Module docstring line 2: `"""Stage 2 - remove every BT..ET text object (keeping the graphics state set inside it), drop the embedded Illustrator private data,`.
- `strip_text_ops` docstring first line: `Remove every BT..ET text object from one content stream, TOKEN-AWARE, keeping persistent graphics state.` and add after it one sentence: `-> (new_bytes, blocks_removed, state_kept). Raises TextObjectOperatorRefused for any other non-text operator inside BT..ET (§C140 ④).`
- `strip_text` docstring first sentence: replace "Remove every BT..ET block" with "Remove every BT..ET text object (keeping persistent graphics state)"; update the `->` dict to include `'state_kept': int`.
- The `7 Tr` paragraph's SCOPE sentence: replace `occurs on **8 of the 895 resolved chemistry figures**` with `occurs on **9 of the 909 figures the 2026-09-16 census scanned**` and append `CNX_Chem_18_04_Nanotube` to the list with the note `(found 2026-09-16; its sendability is unmeasured)`; replace `ALL EIGHT measure` with `THE ORIGINAL EIGHT measure` and `**Live exposure is therefore 0**` with `**Live exposure is 0 for those eight; Nanotube is unmeasured**`. Add one sentence: `Keeping graphics state (§C140 ④) does not touch this: Tr is a text operator and the clip is built from the removed glyphs.`

- [ ] **Step 5: Run the new suite — it must pass**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 test_strip_text.py 2>&1 | tail -40`
Expected: every check `PASS` (or `SKIP 6` only if the source tree is absent — it is present on this box, so a SKIP here is a failure to investigate), last line `ALL PASS`.

- [ ] **Step 6: Prove the negative arms bite — mutation, golden-copy protected**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
SP=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-build
mkdir -p $SP && cp strip-text.py $SP/strip-text.golden.py
# Mutation: stop keeping state (drop allowlisted ops like the shipped rule)
python3 - <<'EOF'
p='strip-text.py'; s=open(p).read()
old="            out.append(instruction)          # graphics state outlives ET — keep it where it was\n            kept += 1\n"
assert s.count(old)==1; open(p,'w').write(s.replace(old,"            kept += 0\n"))
EOF
FIGTEXT_PYLIBS=./pylibs python3 test_strip_text.py 2>&1 | grep -E "FAIL|ALL PASS" | head -12
cp $SP/strip-text.golden.py strip-text.py && cmp $SP/strip-text.golden.py strip-text.py && echo RESTORED
```

Expected: 1c-page, 1c-form, 1d-*, 2c, 6c FAIL under the mutation; then `RESTORED`. Record the output.

- [ ] **Step 7: Every existing Python suite still passes**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
for t in test_readlayer.py test_figure_prepare.py test_figure_compose.py test_sendable.py test_sources.py test_make_fixture.py test_figrings.py test_svgfix.py test_strip_text.py; do
  printf '%s: ' "$t"; FIGTEXT_PYLIBS=./pylibs python3 "$t" 2>&1 | tail -1
done
```

Expected: every line ends `ALL PASS`.

- [ ] **Step 8: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/strip-text.py experiments/figure-text-translation/test_strip_text.py
git commit -m "fix(figures): §C140 ④ — the strip keeps graphics state set inside text objects, and refuses anything else there

<paste Step 7's nine result lines>"
```

---

### Task 3: After-measurements — corpus renders, refusals, keys, SVG arms, suites (0 ISK)

**Files:**
- Create: `…/2026-09-17-c4-build/instruments/render_arms.py`, `…/instruments/refusal_walk.py`
- Copy into `…/2026-09-17-c4-build/instruments/`: `render_diff.py`, `population.py` from `evidence/2026-09-16-c4-explore/instruments/`
- Create: `…/2026-09-17-c4-build/reports/after/…`

**Interfaces:**
- Consumes: `instruments/strip_text_before.py` (Task 1), the fixed `strip-text.py` (Task 2), `reports/before/*` (Task 1), `evidence/2026-09-16-c4-explore/census/figures-with-nontext-in-bt.tsv`, `…/census/results.jsonl.gz`, `…/render/results.jsonl.gz`.
- Produces: `reports/after/recompose-set.txt` — one basename per line (Task 4 reads it).

- [ ] **Step 1: Write `instruments/render_arms.py`**

Start from a copy of `evidence/2026-09-16-c4-explore/instruments/driver_render.py` and `strip_variants.py`, and change exactly these things (read both files fully first):
1. **Arms by whole module, never by replacing a function.** Load two modules with `importlib.util.spec_from_file_location`: `BEFORE` from `instruments/strip_text_before.py`, `AFTER` from `experiments/figure-text-translation/strip-text.py`. The variants are `BEFORE` (call `BEFORE.strip_text(pdf)`) and `AFTER` (call `AFTER.strip_text(pdf)`); no PERSIST/NONTEXT. A `TextObjectOperatorRefused` from AFTER is recorded as `status: refused` with the message, never swallowed.
2. **Paths:** SCRATCH = `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-build/render`; results to `reports/after/render-results.jsonl` in this evidence folder; crops (only for figures that change) to SCRATCH, with the combustion and Egeom stacks copied into `reports/after/crops/`.
3. **Population:** read `population.py`'s builder, but take the census TSV and summary.tsv paths from the frozen exploration folder (`evidence/2026-09-16-c4-explore/census/figures-with-nontext-in-bt.tsv`) and this build's `reports/before/summary.tsv`; 533 figures.
4. **Keep:** the SERIALISER control (BEFORE stripped twice, 0 px), the PLANTED control (a drawn rectangle detected), the per-figure "direction toward source" measurement for changed figures, and the `DONE n=` terminal line.

Then write `reports/after/render-summary.md` from `render-results.jsonl` with a small aggregation (counts changed >0 and >40, the changed set by name, its comparison **by name** with the exploration's 34 from `evidence/2026-09-16-c4-explore/render/results.jsonl.gz` (PERSIST rows with `count_gt0 > 0`), bought figures changed, mean distance to source on changed figures, the two controls, refused count).

- [ ] **Step 2: Run the corpus renders (heavy — alone)**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
B=evidence/2026-09-17-c4-build
PYTHONDONTWRITEBYTECODE=1 FIGTEXT_PYLIBS=./pylibs python3 -u $B/instruments/render_arms.py > $B/reports/after/render.log 2>&1
tail -3 $B/reports/after/render.log
```

Expected: `DONE n=533`. Check P1 and P2 against `reports/after/render-summary.md`.

- [ ] **Step 3: Write and run `instruments/refusal_walk.py` over every scanned figure (P3)**

```python
#!/usr/bin/env python3
"""§C140 ④ P3 — run the FIXED strip over every figure the 2026-09-16 census scanned and count refusals. No render.

    cd experiments/figure-text-translation
    FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/refusal_walk.py

Reads evidence/2026-09-16-c4-explore/census/results.jsonl.gz (status ok rows: artwork path + staged_pdf_recipe),
stages .eps/.ai with the census's own ghostscript argv (readlayer.GS_ARGV), opens the PDF, calls strip_text, and
records ok / refused (with message) / error. Writes reports/after/refusal-walk.jsonl and prints DONE n=… refused=….
"""
import gzip, importlib.util, json, os, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve()
EXP = HERE.parents[3]
sys.path.insert(0, str(EXP))
import _deps  # noqa: F401,E402
import pikepdf  # noqa: E402
import readlayer  # noqa: E402

spec = importlib.util.spec_from_file_location('strip_after', EXP / 'strip-text.py')
ST = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ST)
CENSUS = EXP / 'evidence/2026-09-16-c4-explore/census/results.jsonl.gz'
OUT = HERE.parents[1] / 'reports/after/refusal-walk.jsonl'


def main():
    rows = [json.loads(l) for l in gzip.open(CENSUS, 'rt')]
    rows = [r for r in rows if r['status'] == 'ok']
    n = refused = errors = 0
    with open(OUT, 'w') as fh:
        for r in rows:
            art = Path(r['artwork'])
            tmp = None
            try:
                if r['kind'] in ('eps', 'ai'):
                    fd, tmp = tempfile.mkstemp(suffix='.pdf')
                    os.close(fd)
                    subprocess.run(readlayer.GS_ARGV + [f'-sOutputFile={tmp}', str(art)],
                                   check=True, capture_output=True, timeout=300)
                    src = tmp
                else:
                    src = str(art)
                with pikepdf.open(src) as pdf:
                    stats = ST.strip_text(pdf)
                rec = {'key': r['key'], 'status': 'ok', 'state_kept': stats['state_kept']}
            except ST.UnparsableStream as exc:
                refused += 1
                rec = {'key': r['key'], 'status': 'refused', 'message': str(exc)[:400]}
            except Exception as exc:  # noqa: BLE001
                errors += 1
                rec = {'key': r['key'], 'status': 'error', 'message': f'{type(exc).__name__}: {exc}'[:400]}
            finally:
                if tmp and os.path.exists(tmp):
                    os.unlink(tmp)
            n += 1
            fh.write(json.dumps(rec) + '\n')
            fh.flush()
    print(f'DONE n={n} refused={refused} errors={errors}')


if __name__ == '__main__':
    main()
```

It stages with `readlayer.GS_ARGV` (the read layer's own argv) plus the output file. Run it alone:

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
PYTHONDONTWRITEBYTECODE=1 FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/refusal_walk.py > evidence/2026-09-17-c4-build/reports/after/refusal-walk.log 2>&1
tail -2 evidence/2026-09-17-c4-build/reports/after/refusal-walk.log
```

Expected: `DONE n=910 refused=0 errors=0` (910 ok census rows = 909 figures + N2O5's second file). Positive control for the walk: sum `state_kept` over its rows — must be > 0 (the fixed strip is really running), and combustion's row `state_kept` ≥ 1.

- [ ] **Step 4: Keys (P4)**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
B=evidence/2026-09-17-c4-build
FIGTEXT_PYLIBS=./pylibs python3 -u $B/instruments/prepare_corpus.py --label after > $B/reports/after/run.log 2>&1; tail -2 $B/reports/after/run.log
cmp $B/reports/before/summary.tsv $B/reports/after/summary.tsv && echo SUMMARY-IDENTICAL
for f in $B/reports/before/blocks/*; do cmp -s "$f" "$B/reports/after/blocks/$(basename "$f")" || echo "DIFF $f"; done; echo BLOCKS-CHECKED
```

Write the three outputs into `reports/after/keys-identity.txt`.

- [ ] **Step 5: SVG arms after (P5) and the recompose set**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
SP=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-build
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/svg_arms.py --label after --keep $SP/svg-keep \
  > evidence/2026-09-17-c4-build/reports/after/svg-arms.log 2>&1; tail -8 evidence/2026-09-17-c4-build/reports/after/svg-arms.log
python3 - <<'EOF'
import json
B='evidence/2026-09-17-c4-build/reports'
b=json.load(open(f'{B}/before/svg-arms.json')); a=json.load(open(f'{B}/after/svg-arms.json'))
lines=[]; rs=[]
for k in b:
    bb,aa=b[k],a[k]
    changed = bb.get('sha256')!=aa.get('sha256')
    rise=[f for f in ('mask','image') if aa.get(f,0)>bb.get(f,0)]
    lines.append(f"{k}: det_before={bb.get('deterministic')} changed={changed} mask {bb.get('mask')}->{aa.get('mask')} image {bb.get('image')}->{aa.get('image')} use {bb.get('use')}->{aa.get('use')} path {bb.get('path')}->{aa.get('path')} svgfix {bb.get('svgfix')} -> {aa.get('svgfix')} rises={rise}")
    if changed: rs.append(k)
open(f'{B}/after/svg-arms-compare.txt','w').write('\n'.join(lines)+'\n')
open(f'{B}/after/recompose-set.txt','w').write('\n'.join(rs)+('\n' if rs else ''))
print('\n'.join(lines)); print('RECOMPOSE SET:', rs)
EOF
```

If a figure was non-deterministic before (Task 1 Step 3), decide its membership by the counts and a `diff` of the two kept `artwork.svg.gz` files, and write the reasoning into `svg-arms-compare.txt`. Combustion must be in the set; if it is not, STOP and report (BLOCKED) — do not recompose.

- [ ] **Step 6: Suites (P7)**

Python: the nine-suite loop from Task 2 Step 7, output to `reports/after/python-tests.txt`. Then the root vitest by name, alone:

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
SP=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-build
timeout 3000 npx vitest run --reporter=json --outputFile=$SP/vitest-after.json > $SP/vitest-after.out 2>&1; echo "exit=$?"
node experiments/figure-text-translation/evidence/2026-09-16-c7-build/instruments/npm_compare.cjs 2>/dev/null | head -1 || true
```

Read `evidence/2026-09-16-c7-build/instruments/npm_compare.cjs` (the ⑦ fix wave's by-name comparison) and copy it into this build's `instruments/`, pointed at `$SP/vitest-after.json` and this build's `reports/before/npm-failing-by-name.txt`; run it so it writes `reports/after/npm-compare.txt` (now/before names, only-now, only-before, files that died without a failing test, and the planted-control result) and `reports/after/npm-failing-by-name.txt`. Expected: only-now `[]`, only-before `[]`, died `[]`, planted control surfaces.

- [ ] **Step 7: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/evidence/2026-09-17-c4-build
git add -f experiments/figure-text-translation/evidence/2026-09-17-c4-build/reports/after/*.log
git status --porcelain -- books/   # must be empty
git commit -m "evidence(figures): §C140 ④ build — after: corpus renders, refusal walk, keys, SVG arms, suites, 0 ISK"
```

---

### Task 4: Recompose the bought figures whose artwork changed (0 ISK, foreground)

**Files:**
- Modify: `books/efnafraedi-2e/media/<basename>_IS.svg` for each basename in `reports/after/recompose-set.txt` (and nothing else under `books/`)
- Create: `…/2026-09-17-c4-build/reports/recompose/…`

**Interfaces:**
- Consumes: `reports/after/recompose-set.txt` (Task 3), `instruments/figparts.py` (Task 1).

- [ ] **Step 1: Snapshot the parts of the current copies**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
B=experiments/figure-text-translation/evidence/2026-09-17-c4-build
mkdir -p $B/reports/recompose
SET=$(cat $B/reports/after/recompose-set.txt); echo "$SET"
python3 $B/instruments/figparts.py $(for b in $SET; do echo books/efnafraedi-2e/media/${b}_IS.svg; done) > $B/reports/recompose/parts-before.json
```

- [ ] **Step 2: Ring-gate prerequisite**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1`
Expected: `ALL PASS`. If not, STOP (BLOCKED): the ring gate fails closed without numpy.

- [ ] **Step 3: Recompose, one figure at a time, in the foreground**

For each basename in the set, with `N` its chapter number (the `NN` in `CNX_Chem_NN_…`, without a leading zero):

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter N --figure <basename> --stale --force \
  > experiments/figure-text-translation/evidence/2026-09-17-c4-build/reports/recompose/<basename>.txt 2>&1
tail -15 experiments/figure-text-translation/evidence/2026-09-17-c4-build/reports/recompose/<basename>.txt
```

Expected per run: `MT spawned for 0 figure(s)`, `published 1 figure(s)`, `VERDICT ok`. Any other verdict: STOP and report.

- [ ] **Step 4: Exactly the set changed, and by the right part (P6)**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
B=experiments/figure-text-translation/evidence/2026-09-17-c4-build
git status --porcelain -- books/ | tee $B/reports/recompose/git-status-books.txt
SET=$(cat $B/reports/after/recompose-set.txt)
python3 $B/instruments/figparts.py $(for b in $SET; do echo books/efnafraedi-2e/media/${b}_IS.svg; done) > $B/reports/recompose/parts-after.json
python3 - "$B" <<'EOF'
import json, sys
B=sys.argv[1]; b=json.load(open(f'{B}/reports/recompose/parts-before.json')); a=json.load(open(f'{B}/reports/recompose/parts-after.json'))
out=[]
for k in b:
    out.append(f"{k}: textgroup_same={b[k]['textgroup_sha256']==a[k]['textgroup_sha256']} artwork_changed={b[k]['artwork_sha256']!=a[k]['artwork_sha256']} text_count {b[k]['text_count']}->{a[k]['text_count']}")
open(f'{B}/reports/recompose/parts-compare.txt','w').write('\n'.join(out)+'\n'); print('\n'.join(out))
EOF
```

Expected: `git-status-books.txt` lists exactly one ` M books/efnafraedi-2e/media/<b>_IS.svg` per set member and nothing else (no sidecar, no mapping); every line `textgroup_same=True artwork_changed=True`, same `text_count`.

- [ ] **Step 5: Look at combustion in the reader's renderer**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
node render-check.mjs ../../books/efnafraedi-2e/media/CNX_Chem_04_05_combustion_IS.svg evidence/2026-09-17-c4-build/reports/recompose/combustion-chromium.png 1300 321 1
```

Open the PNG and look. Write one sentence into `reports/recompose/combustion-look.md`: arrowhead colour, and whether labels and artwork are otherwise as before. If the arrowheads are not black: STOP and report.

- [ ] **Step 6: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add books/efnafraedi-2e/media experiments/figure-text-translation/evidence/2026-09-17-c4-build/reports/recompose
git status --porcelain | head
git commit -m "feat(figures): §C140 ④ — recompose the bought figures whose artwork the strip fix changes, 0 ISK"
```

---

### Task 5: Evidence write-up and documentation

**Files:**
- Create: `…/2026-09-17-c4-build/VERIFICATION.md`, `…/2026-09-17-c4-build/README.md`
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C140 ④ row; new rows; a new top ⏩ RESUME block)
- Modify: `experiments/figure-text-translation/REGISTER.md` (the strip-text rows that assert the old behaviour)

- [ ] **Step 1: `VERIFICATION.md`** — frozen banner in the style of `evidence/2026-09-16-c7-build/VERIFICATION.md`; a P1–P8 table (predicted / measured / file) with every number copied from a file under `reports/`; the two controls; the mutation output from Task 2 Step 6 (from its commit message); limits (the census walk scope; `.eps` staged; PNG vs SVG where Task 3 Step 5 found determinism issues, if any). Mark any unmet prediction ❌ with the measured value — never edit code to make one pass.

- [ ] **Step 2: `README.md`** — what this folder holds; how each report was produced (instrument + command); that `reports/before/npm-failing-by-name.txt` is a byte copy of `evidence/2026-09-16-c7-build/reports/after-fix/npm-failing-by-name.txt`, valid as a baseline because this branch changes no JS and PR #475's CI matched it by name; that `instruments/strip_text_before.py` is `strip-text.py` at `7a45f050`.

- [ ] **Step 3: The campaign register** — exact-string edits; check `python3 -c "print(open('docs/plans/2026-07-21-post-item17-followup-campaign.md','rb').read().count(b'\x01'))"` is 3 before and after.
  - **④ row** status → `✅ built + verified on feat/c140-c4-strip-keeps-gstate` with links to the spec and `evidence/2026-09-17-c4-build/VERIFICATION.md`, and the recompose set named.
  - **New rows after ㉘** (next free circled numbers), each "open, logged": the June-vintage copies (what `reports/before/june-copies.md` found, and that ④ does not touch them); `CNX_Chem_18_04_Nanotube` is a 9th clipping-mode figure with unmeasured sendability; overprint set inside text objects (6 figures, none bought) lost by every renderer; ghostscript staging rewrites text-object content (N2O5's `.pdf` vs staged `.eps`).
  - **New top ⏩ RESUME block** (mark the previous top one "(superseded by the block above)"): ④ built, verified and recomposed on the branch; the single next action is **⑥'s remainder on a new branch stacked on this one** (STIX 1.1.0 subset meeting the strict readings, per [USER]'s 2026-09-16 answer 4; per-run kerning); the ④ PR opens after the final review, and merge + deploy stay [USER]'s; buying stays stopped.

- [ ] **Step 4: `experiments/figure-text-translation/REGISTER.md`** — the rows naming `strip-text.py` with "❌ drops colour/graphics-state ops inside BT..ET" (in the newest status table only; frozen older snapshots stay as written): state that ④ keeps persistent graphics state and refuses other non-text operators, pointing at `evidence/2026-09-17-c4-build/VERIFICATION.md`.

- [ ] **Step 5: Commit and push (no PR)**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/evidence/2026-09-17-c4-build docs/plans/2026-07-21-post-item17-followup-campaign.md experiments/figure-text-translation/REGISTER.md
git commit -m "docs(figures): §C140 ④ verified — the strip keeps graphics state; recomposed figures named; out-of-scope findings logged"
git push origin feat/c140-c4-strip-keeps-gstate
git status --porcelain   # must be empty
```
