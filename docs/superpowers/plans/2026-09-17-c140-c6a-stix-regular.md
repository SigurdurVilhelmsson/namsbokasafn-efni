# §C140 ⑥a — kept STIX symbols drawn in STIX 1.1.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kept, run-exact runs whose source font is `STIXGeneral-Regular` are drawn in a renamed subset of the official STIX 1.1.0 font (family `FigSym`), with the notices and the release's licence text in each such SVG, and the bought figures whose composed text changes are recomposed at 0 ISK.

**Architecture:** A new module `experiments/figure-text-translation/figsym.py` owns everything about the STIX font — locating and hash-checking the local file, eligibility, cmap coverage, the renamed woff2 subset, and the `<metadata>` licence element. `compose.py` marks eligible run-exact items `family='FigSym'`; `svgout.py` embeds the FigSym face and metadata only when such an item exists. Verification composes the 34 bought figures before and after without the driver, diffs their `<text>` lists, checks them in Chromium, and recomposes the changed ones with `figure-run.js --stale --force --figure`.

**Tech Stack:** Python 3 (fontTools, pikepdf, PIL from gitignored `pylibs/`), cairo (compose PNG), Node 22 (`tools/figure-run.js`, `render-check.mjs` with playwright).

**Spec:** `docs/superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md` (rulings T1–T6). Exploration: `experiments/figure-text-translation/evidence/2026-09-17-c6-explore/`.

## Global Constraints

- **0 ISK.** Never run `translate-blocks.mjs`. `tools/figure-run.js` runs only in Task 5, as `--stale --force --figure <basename>` on figures that already have a sidecar, in the FOREGROUND, after `FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py` prints `ALL PASS`; its report must say `MT spawned for 0 figure(s)`.
- **Nothing under `books/` is written** except Task 5's recomposed `books/efnafraedi-2e/media/<basename>_IS.svg`; no sidecar or `image-mapping.json` changes. `01-source/` is read-only.
- **The font file is never committed.** It is read from `$FIGTEXT_STIX_FONT` if set, else `~/.cache/namsbokasafn-figtext/stix-1.1.0/STIXGeneral-Regular.otf`, and must hash to sha256 `5add3f3f2bd7fd897d2fa5ccbe468607c52111dc44cdfaaf2d851a574f5357a7`.
- **The licence text IS committed** at `experiments/figure-text-translation/fonts/STIX-1.1.0-LICENSE.txt`, byte-identical to `~/.cache/namsbokasafn-figtext/stix-1.1.0/STIX-Font-License-2010.txt`, sha256 `69eca010e01385fd991696cd087e03b586656936b61619cd9f7bf6cc0044dcc3` (the `pdftotext -layout` text of the release's `STIX Font License 2010.pdf`, PDF sha256 `f9e7dfa5f80b16145050794cf430c2473b6c060d2adbbef61bbb335d063e5680`, source `https://raw.githubusercontent.com/stipub/stixfonts/master/archive/STIXv1.1.0/License/STIX%20Font%20License%202010.pdf`).
- **Family name `FigSym`.** No name record with ID 1, 2, 3, 4, 5, 6, 16, 17, 21 or 22 and no CFF `fontNames`/`FullName`/`FamilyName` may contain `stix`, `fonts`, `tm` or `math` (case-insensitive). Name IDs 0 and 7 and the CFF `Notice` are kept verbatim.
- **Licensing information is never an XML comment** (the licence text contains `--`); it goes in an escaped `<metadata>` element.
- **No `COMPOSER_VERSION` change.**
- **The base for "before" is the ④ branch head `ff00d5fbbb3fc013f2b3eaaca1103d2ea1cc423c`**, not `main`.
- Python tests run from `experiments/figure-text-translation/` as `FIGTEXT_PYLIBS=./pylibs python3 test_X.py`, plain `check()` + a final `ALL PASS`; not in CI — record results in evidence and commit messages. JS: no JS file changes; root vitest compared **by failing test name** with a planted control and a died-file check.
- **Heavy commands one at a time** (memory-capped box, 4.9 GB tmpfs `/tmp`); `python3 -u` + a terminal marker for long redirected batches.
- **Evidence** in `experiments/figure-text-translation/evidence/2026-09-17-c6a-build/`; frozen evidence cites only its own folder (design/plan links excepted); `git add -f` cited `*.log`; numbers come only from files produced in this build.
- Commit messages end with a `Co-Authored-By:` trailer naming the implementing model.

---

### Task 1: Baseline, recount and predictions (0 ISK, before any code change)

**Files:**
- Create: `experiments/figure-text-translation/evidence/2026-09-17-c6a-build/instruments/compose34.py`
- Create: `…/2026-09-17-c6a-build/instruments/textlist.py`
- Create: `…/2026-09-17-c6a-build/instruments/stix_recount.py`
- Create: `…/2026-09-17-c6a-build/PREDICTIONS.md`, `…/reports/before/…`

**Interfaces:**
- Produces: `compose34.py --tree <dir> --out <dir>` (prepare + compose the 34 bought figures with a given composer tree, no driver, no MT); `textlist.py <svg>…` → JSON per file: every `<text>`'s text, x, y, font-size, font-weight, font-style, fill, font-family, plus `faces` (the `@font-face` families/weights/styles in order), `metadata` (bool), `xml_ok` (bool); `reports/before/textlists.json`; `reports/before/stix-recount.json`.

- [ ] **Step 1: A worktree for the BEFORE composer**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
SP=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c6a-build
mkdir -p $SP
git worktree add $SP/before-tree ff00d5fbbb3fc013f2b3eaaca1103d2ea1cc423c
ln -s /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs $SP/before-tree/experiments/figure-text-translation/pylibs
ln -s /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/sources.local.json $SP/before-tree/experiments/figure-text-translation/sources.local.json
git -C $SP/before-tree log --oneline -1
```

The worktree lives in the scratchpad (outside the repo tree), so it never shows in `git status`. Remove it in Task 5 Step 6.

- [ ] **Step 2: Write `instruments/compose34.py`**

Copy `evidence/2026-09-15-t23-review-fixes/instruments/regen34.py` into `evidence/2026-09-17-c6a-build/instruments/compose34.py` and change exactly this:
1. **Sources:** the old `/home/siggi/dev/scratch-c140/prep/sources.json` no longer exists. Resolve each figure's artwork with the tree's own `sources.py` exactly as `evidence/2026-09-17-c4-build/instruments/prepare_corpus.py` does (`resolve_detail`, de-hash retry on a trailing `-xxxx`), importing `sources` from `<tree>/experiments/figure-text-translation` (put that directory first on `sys.path`).
2. **`--tree`** is a repository root (default `/home/siggi/dev/repos/namsbokasafn-efni`); the composer directory is `<tree>/experiments/figure-text-translation`. Sidecars are always read from the MAIN repository's `books/efnafraedi-2e/figure-text/`.
3. Keep: `SOURCE_DATE_EPOCH=1700000000`, `PYTHONDONTWRITEBYTECODE=1`, `--svg`, deleting `translated.png` after compose, `rc.json`, the `DONE <n> figures prep_fail=<k> compose_fail=<m>` terminal line, exocytosis last.
4. The environment passed to compose inherits `FIGTEXT_STIX_FONT` if set (no change needed if `os.environ` is copied).

Read `regen34.py` fully first; report every other change you had to make.

- [ ] **Step 3: Write `instruments/textlist.py`**

```python
#!/usr/bin/env python3
"""§C140 ⑥a — the drawn text of composed figure SVGs, as data. Read-only.

    python3 textlist.py <svg> [<svg> ...]   -> JSON {path: {...}} on stdout

Per file: xml_ok (the whole file parses as XML), texts (every <text> in document order: text, x, y, size, weight,
style, fill, family), faces (every @font-face as family/weight/style, in order), metadata (a <metadata> element
exists), metadata_text (its text, or None).
"""
import json, re, sys
import xml.etree.ElementTree as ET

SVGNS = '{http://www.w3.org/2000/svg}'
FACE = re.compile(r"@font-face\{font-family:'([^']+)';font-weight:(\d+);font-style:(\w+);")


def one(path):
    data = open(path, 'rb').read()
    out = {'xml_ok': True, 'texts': [], 'faces': [], 'metadata': False, 'metadata_text': None}
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        out['xml_ok'] = False
        out['error'] = str(exc)
        return out
    for el in root.iter():
        tag = el.tag.replace(SVGNS, '')
        if tag == 'text':
            a = el.attrib
            out['texts'].append(dict(text=el.text or '', x=a.get('x'), y=a.get('y'), size=a.get('font-size'),
                                     weight=a.get('font-weight'), style=a.get('font-style', 'normal'),
                                     fill=a.get('fill'), family=a.get('font-family')))
        elif tag == 'style':
            out['faces'] += [dict(family=f, weight=w, style=s) for f, w, s in FACE.findall(el.text or '')]
        elif tag == 'metadata':
            out['metadata'] = True
            out['metadata_text'] = el.text
    return out


if __name__ == '__main__':
    print(json.dumps({p: one(p) for p in sys.argv[1:]}, indent=1, ensure_ascii=False))
```

- [ ] **Step 4: Compose BEFORE and extract its text lists**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
B=experiments/figure-text-translation/evidence/2026-09-17-c6a-build
SP=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c6a-build
mkdir -p $B/reports/before
python3 -u $B/instruments/compose34.py --tree $SP/before-tree --out $SP/before > $B/reports/before/compose34.log 2>&1
tail -2 $B/reports/before/compose34.log
python3 $B/instruments/textlist.py $SP/before/work/*/translated.svg > $B/reports/before/textlists.json
python3 -c "import json;d=json.load(open('$B/reports/before/textlists.json'));print(len(d),'files',sum(1 for v in d.values() if v['xml_ok']),'xml_ok',sum(len(v['texts']) for v in d.values()),'texts')"
```

Expected: `DONE 34 figures prep_fail=0 compose_fail=0`; 34 files, 34 `xml_ok`.

- [ ] **Step 5: Write and run `instruments/stix_recount.py` (spec § 4.1)**

For each of the 34 figures, from `$SP/before/prep/<b>/` (`runs.json`, `meta.json`, `blocks.json`) and `$SP/before/work/<b>/compose-report.json`:
- the blocks (by `blockkey.block_key` of `figtext.merge_blocks(figtext.group(runs))`, exactly as `compose.py` builds them — import both from the BEFORE tree) that contain at least one run whose base font name (`figscripts._base_name(run, meta['fonts'])`) is `STIXGeneral-Regular`, and separately any other STIX face (`STIXGeneral-Italic`, `-Bold`, `-BoldItalic`, bare `STIXGeneral`);
- each such block classified by the compose report: `runExact` (kept, incl. identity) or `translated`-and-not-`identity` (laid out);
- the characters those STIX runs draw (`figtext.run_draw_text(run)[0]`) and whether every one is in the official font's cmap (`fontTools.ttLib.TTFont(<font path>).getBestCmap()`, font located per the Global Constraints, sha256 checked first — if the file is missing or the hash differs, STOP and report BLOCKED).

Write `reports/before/stix-recount.json` (`{figure: {kept_blocks, translated_blocks, other_face_blocks, chars, chars_outside_cmap}}`) and print totals. Also: the 34 prep `blocks.json` files are byte-identical to `evidence/2026-09-17-c4-build/reports/after/blocks/` where both exist (`cmp`), written to `reports/before/keys-vs-c4.txt`.

- [ ] **Step 6: Write `PREDICTIONS.md`**

```markdown
# Predictions — §C140 ⑥a, written before the code change (2026-09-17)

Expectations from the frozen exploration (`evidence/2026-09-17-c6-explore/critic.md`) and the spec; the measured
recount (`reports/before/stix-recount.json`) is stated beside each where it exists.

- **P1 — recount.** On the 34: kept STIX-Regular blocks 42, translated 3 (all in CNX_Chem_04_04_sandwich), other STIX
  faces 0, characters outside the official cmap 0; prep keys identical to ④'s. (Measured before the change: <fill from the
  file>.)
- **P2 — text lists (compose-only, after vs before).** For every figure: the same number of `<text>` elements with the same
  text, x, y, size, weight, style and fill. `font-family` changes from `FigIS` to `FigSym` exactly on the run-exact items drawn
  from an eligible run, and nowhere else. Figures with no eligible run: identical text lists, no FigSym face, no metadata.
- **P3 — faces.** A figure with an eligible run gains exactly one `@font-face` for `FigSym` (400/normal) after its FigIS rules;
  FigIS rules keep their order; a FigIS face whose only characters moved to FigSym disappears.
- **P4 — XML and metadata.** All 34 after-SVGs parse as XML; every figure with an eligible run carries one `<metadata>` holding
  the copyright notice, the trademark notice and the pinned licence text; no other figure carries one.
- **P5 — names.** The FigSym subset embedded in every such figure has no forbidden word in name IDs 1–6/16/17/21/22 or the CFF
  names, and keeps name IDs 0 and 7 and the CFF Notice verbatim.
- **P6 — Chromium.** On the figures with an eligible run, the kept STIX glyphs render closer to the source raster after than
  before; removing the FigSym `@font-face` rule changes the after render (the family is really used).
- **P7 — recompose.** Only the figures P2 names change under `books/`; for each, the artwork part is byte-identical and the text
  group differs; `MT spawned for 0 figure(s)`; no sidecar or mapping change.
- **P8 — suites.** Every Python suite prints `ALL PASS`; root vitest failing names equal the baseline by name.
```

Fill P1's measured parenthesis from `stix-recount.json`; change nothing else.

- [ ] **Step 7: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/evidence/2026-09-17-c6a-build
git add -f experiments/figure-text-translation/evidence/2026-09-17-c6a-build/reports/before/*.log
git status --porcelain -- books/   # must be empty
git commit -m "evidence(figures): §C140 ⑥a build — baseline text lists, STIX recount and predictions, 0 ISK"
```

---

### Task 2: `figsym.py` — the STIX font, fail-closed (TDD)

**Files:**
- Create: `experiments/figure-text-translation/figsym.py`
- Create: `experiments/figure-text-translation/fonts/STIX-1.1.0-LICENSE.txt` (copy from the cache; hash-checked)
- Create: `experiments/figure-text-translation/test_figsym.py`

**Interfaces:**
- Produces: `FAMILY = 'FigSym'`; `FONT_SHA256`, `LICENCE_SHA256`; `class FontUnavailable(Exception)`; `font_path() -> Path`; `load() -> TTFont` (raises `FontUnavailable`); `eligible_base(base: str) -> bool`; `covers(text: str) -> bool`; `name_violations(font) -> list[str]`; `subset_woff2(chars: set[str]) -> bytes`; `metadata_element() -> str`.

- [ ] **Step 1: Copy the licence text and check it**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
mkdir -p fonts && cp /home/siggi/.cache/namsbokasafn-figtext/stix-1.1.0/STIX-Font-License-2010.txt fonts/STIX-1.1.0-LICENSE.txt
sha256sum fonts/STIX-1.1.0-LICENSE.txt   # must print 69eca010e01385fd991696cd087e03b586656936b61619cd9f7bf6cc0044dcc3
```

- [ ] **Step 2: Write the failing tests — `test_figsym.py`**

```python
#!/usr/bin/env python3
"""Tests for figsym.py (§C140 ⑥a). Run: FIGTEXT_PYLIBS=./pylibs python3 test_figsym.py

Plain checks. Every property that could pass vacuously is paired with a control that must fail it."""
import io, os, shutil, sys, tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

import _deps  # noqa: F401
import figsym as FS  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f": {detail}" if detail else ''))
    if not ok:
        fails.append(label)


print('\n[1] the font is located and hash-checked')
p = FS.font_path()
check('1a the official font file is present on this box', p.is_file(), str(p))
font = FS.load()
check('1b load() returns the official 1.1.0 file', font['name'].getDebugName(5) == 'Version 1.1.0', font['name'].getDebugName(5))
tmp = Path(tempfile.mkdtemp(prefix='figsym-test-'))
bad = tmp / 'bad.otf'
bad.write_bytes(p.read_bytes()[:-1] + b'\x00')
os.environ['FIGTEXT_STIX_FONT'] = str(bad)
FS._reset()
try:
    FS.load()
    raised = ''
except FS.FontUnavailable as exc:
    raised = str(exc)
check('1c a file with the wrong hash is REFUSED, naming the reason', 'sha256' in raised, raised[:160])
os.environ['FIGTEXT_STIX_FONT'] = str(tmp / 'absent.otf')
FS._reset()
try:
    FS.load()
    raised = ''
except FS.FontUnavailable as exc:
    raised = str(exc)
check('1d a missing file is REFUSED, naming the path', 'absent.otf' in raised, raised[:160])
del os.environ['FIGTEXT_STIX_FONT']
FS._reset()

print('\n[2] eligibility is exactly STIXGeneral-Regular')
check('2a a subset-prefixed Regular base is eligible', FS.eligible_base('/ABCDEF+STIXGeneral-Regular'))
check('2b an unprefixed Regular base is eligible', FS.eligible_base('STIXGeneral-Regular'))
for base in ('/ABCDEF+STIXGeneral-Italic', '/ABCDEF+STIXGeneral-Bold', 'STIXGeneral', '/XYZABC+MathematicalPi-One',
             '/ABCDEF+LiberationSans', 'Symbol'):
    check(f'2c {base} is NOT eligible', not FS.eligible_base(base))
check('2d covers() accepts characters the official cmap has', FS.covers('+=×−<>'))
check('2e covers() rejects a character it lacks', not FS.covers('中'))

print('\n[3] the renamed subset carries no reserved name or word, and keeps the notices')
woff = FS.subset_woff2({'+', '=', '×'})
sub = TTFont(io.BytesIO(woff))
check('3a the subset is woff2', sub.flavor == 'woff2', str(sub.flavor))
check('3b no forbidden word anywhere a font is named', FS.name_violations(sub) == [], str(FS.name_violations(sub)))
orig = FS.load()
for nid in (0, 7):
    check(f'3c name ID {nid} kept verbatim', sub['name'].getDebugName(nid) == orig['name'].getDebugName(nid),
          (sub['name'].getDebugName(nid) or '')[:80])
check('3d the CFF Notice is kept verbatim',
      sub['CFF '].cff.topDictIndex[0].Notice == orig['CFF '].cff.topDictIndex[0].Notice)
check('3e family name ID 1 is FigSym', sub['name'].getDebugName(1) == 'FigSym', sub['name'].getDebugName(1))
check('3f CONTROL — the unrenamed official font DOES violate', len(FS.name_violations(orig)) >= 4,
      str(FS.name_violations(orig)[:4]))
cmap = sub.getBestCmap()
check('3g the subset holds the requested characters', all(ord(c) in cmap for c in '+=×'), str(sorted(cmap)[:6]))

print('\n[4] the metadata element parses, carries the notices and the pinned licence text')
md = FS.metadata_element()
lic = (Path(FS.__file__).parent / 'fonts' / 'STIX-1.1.0-LICENSE.txt').read_text(encoding='utf-8')
check('4a CONTROL — the licence text contains "--" (why a comment is impossible)', '--' in lic)
try:
    el = ET.fromstring(md)
    parsed = True
except ET.ParseError as exc:
    el, parsed = None, False
check('4b <metadata> parses as XML', parsed)
check('4c it is not a comment', md.lstrip().startswith('<metadata') and '<!--' not in md)
text = el.text if el is not None else ''
check('4d it carries the copyright notice', orig['name'].getDebugName(0) in text)
check('4e it carries the trademark notice', orig['name'].getDebugName(7) in text)
check('4f it carries the licence text exactly', lic.strip() in text)
check('4g it names FigSym, STIX Fonts 1.1.0 and the OFL 1.1',
      all(s in text for s in ('FigSym', '1.1.0', 'SIL Open Font License, Version 1.1')))

shutil.rmtree(tmp, ignore_errors=True)
print(f"\n  {'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(0 if not fails else 1)
```

- [ ] **Step 3: Run it; it must fail on the missing module**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 test_figsym.py 2>&1 | tail -5`
Expected: `ModuleNotFoundError: No module named 'figsym'`.

- [ ] **Step 4: Write `figsym.py`**

```python
#!/usr/bin/env python3
"""§C140 ⑥a — the STIX font the composer draws kept STIX symbols in. One owner for all of it.

[USER] 2026-09-16 (campaign register ⏩ RESUME): accept subsetting STIX 1.1.0 into composed SVGs meeting the strict
licence readings — a family name containing neither "STIX" nor "TM Math", the copyright and trademark notices kept, OFL
licensing information in each SVG. Evidence: evidence/2026-09-16-stix-licence/, evidence/2026-09-17-c6-explore/.

- The font file is the OFFICIAL STIXGeneral-Regular.otf 1.1.0, never extracted from a PDF and NEVER COMMITTED. It is read
  from $FIGTEXT_STIX_FONT, else ~/.cache/namsbokasafn-figtext/stix-1.1.0/STIXGeneral-Regular.otf, and REFUSED unless its
  sha256 matches: a figure that needs it then fails loudly instead of silently drawing Liberation.
- The subset is renamed FigSym in every record a font is named by (name IDs 1-6, 16, 17, 21, 22 and the CFF names), and
  keeps name IDs 0 (copyright) and 7 (trademark) and the CFF Notice verbatim. `name_violations` is the check, run on every
  subset before it is returned.
- The licence text is the release's own licence document as text, committed in fonts/ and hash-checked. It goes into a
  <metadata> element, escaped — NEVER an XML comment: it contains "--", which is illegal inside a comment, and an ill-formed
  SVG does not render in <img> at all.
"""
import hashlib, io, os, re
from pathlib import Path
import _deps  # noqa: F401

HERE = Path(__file__).resolve().parent
FAMILY = 'FigSym'
FONT_SHA256 = '5add3f3f2bd7fd897d2fa5ccbe468607c52111dc44cdfaaf2d851a574f5357a7'
LICENCE_FILE = HERE / 'fonts' / 'STIX-1.1.0-LICENSE.txt'
LICENCE_SHA256 = '69eca010e01385fd991696cd087e03b586656936b61619cd9f7bf6cc0044dcc3'
DEFAULT_PATH = Path.home() / '.cache' / 'namsbokasafn-figtext' / 'stix-1.1.0' / 'STIXGeneral-Regular.otf'
ELIGIBLE_BASE = 'STIXGeneral-Regular'
NAMED_IDS = (1, 2, 3, 4, 5, 6, 16, 17, 21, 22)
FORBIDDEN = re.compile(r'stix|fonts|tm|math', re.I)
RENAMED = {1: 'FigSym', 3: 'FigSym-Regular:1.1.0-subset', 4: 'FigSym Regular', 6: 'FigSym-Regular',
           16: 'FigSym', 17: 'Regular', 21: 'FigSym', 22: 'Regular'}
_PREFIX = re.compile(r'^/?(?:[A-Z]{6}\+)?')
_font = None


class FontUnavailable(Exception):
    """The official STIX file is missing or is not the pinned one. RAISED, never worked around."""


def _reset():
    """Forget the loaded font (tests switch $FIGTEXT_STIX_FONT)."""
    global _font
    _font = None


def font_path():
    return Path(os.environ['FIGTEXT_STIX_FONT']) if os.environ.get('FIGTEXT_STIX_FONT') else DEFAULT_PATH


def load():
    global _font
    if _font is None:
        from fontTools.ttLib import TTFont
        p = font_path()
        if not p.is_file():
            raise FontUnavailable(f'STIX 1.1.0 font not found at {p} (set FIGTEXT_STIX_FONT; see figsym.py)')
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        if digest != FONT_SHA256:
            raise FontUnavailable(f'{p} sha256 {digest} is not the pinned STIX 1.1.0 file {FONT_SHA256}')
        _font = TTFont(str(p))
    return _font


def eligible_base(base):
    """True only for STIXGeneral-Regular, with or without a leading '/' and a six-letter subset prefix."""
    return _PREFIX.sub('', base or '') == ELIGIBLE_BASE


def covers(text):
    cmap = load().getBestCmap()
    return all(ord(c) in cmap for c in text)


def name_violations(font):
    """Every place a font is named that contains a reserved name or word. [] is clean."""
    out = []
    for rec in font['name'].names:
        if rec.nameID in NAMED_IDS and FORBIDDEN.search(rec.toUnicode()):
            out.append(f'name ID {rec.nameID} ({rec.platformID},{rec.platEncID},{rec.langID}): {rec.toUnicode()}')
    if 'CFF ' in font:
        cff = font['CFF '].cff
        top = cff.topDictIndex[0]
        for label, value in (('CFF fontNames', ' '.join(cff.fontNames)), ('CFF FullName', getattr(top, 'FullName', '')),
                             ('CFF FamilyName', getattr(top, 'FamilyName', ''))):
            if value and FORBIDDEN.search(value):
                out.append(f'{label}: {value}')
    return out


def subset_woff2(chars):
    """A FigSym subset of the official font holding `chars`, as woff2 bytes. Refuses to return a subset that still names
    a reserved name or word."""
    from fontTools import subset as fsubset
    from fontTools.ttLib import TTFont
    load()                                   # hash check first, on the path in force
    font = TTFont(str(font_path()))
    opt = fsubset.Options()
    opt.layout_features = ['*']
    opt.desubroutinize = True
    opt.drop_tables += ['DSIG']
    opt.notdef_outline = True
    opt.name_IDs = [0, 1, 2, 3, 4, 5, 6, 7, 13, 14]
    opt.name_languages = ['*']
    opt.name_legacy = True
    sub = fsubset.Subsetter(options=opt)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    for rec in font['name'].names:
        if rec.nameID in RENAMED:
            rec.string = RENAMED[rec.nameID]
    cff = font['CFF '].cff
    cff.fontNames = ['FigSym-Regular']
    top = cff.topDictIndex[0]
    top.FullName = 'FigSym Regular'
    top.FamilyName = 'FigSym'
    left = name_violations(font)
    if left:
        raise FontUnavailable(f'renamed subset still names a reserved name or word: {left}')
    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def _esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def metadata_element():
    """The licensing information for an SVG that embeds a FigSym subset: an escaped <metadata> element."""
    lic = LICENCE_FILE.read_bytes()
    digest = hashlib.sha256(lic).hexdigest()
    if digest != LICENCE_SHA256:
        raise FontUnavailable(f'{LICENCE_FILE} sha256 {digest} is not the pinned licence text {LICENCE_SHA256}')
    name = load()['name']
    body = (f"Font: {FAMILY} is a subset of STIXGeneral-Regular from STIX Fonts 1.1.0, renamed as its licence requires.\n"
            f"Copyright notice: {name.getDebugName(0)}\n"
            f"Trademark notice: {name.getDebugName(7)}\n"
            f"The font software is licensed under the SIL Open Font License, Version 1.1. Its licence follows.\n\n"
            f"{lic.decode('utf-8')}")
    return f'<metadata>{_esc(body)}</metadata>'
```

⚠️ If `rec.string = …` does not re-encode for a platform-1 (Mac Roman) record in this fontTools version, use `font['name'].setName(value, nameID, platformID, platEncID, langID)` instead; report which you used. If a name ID in `RENAMED` is absent from the subset, it is simply not written — do not add records.

- [ ] **Step 5: Run the tests — ALL PASS**

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 test_figsym.py 2>&1 | tail -30`
Expected: every check `PASS`, `ALL PASS`. If 2e fails because the official cmap does contain `中`, pick a character it lacks (search `getBestCmap()`) and report it.

- [ ] **Step 6: Prove the rename check bites (mutation, golden copy)**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
SP=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c6a-build
cp figsym.py $SP/figsym.golden.py
python3 - <<'EOF'
p='figsym.py'; s=open(p).read()
old="    cff.fontNames = ['FigSym-Regular']\n"
assert s.count(old)==1; open(p,'w').write(s.replace(old,"    cff.fontNames = cff.fontNames\n"))
EOF
FIGTEXT_PYLIBS=./pylibs python3 test_figsym.py 2>&1 | grep -E "FAIL|ALL PASS" | head
cp $SP/figsym.golden.py figsym.py && cmp $SP/figsym.golden.py figsym.py && echo RESTORED
```

Expected under the mutation: `subset_woff2` raises (`FontUnavailable` — the self-check) and the file stops with a traceback or 3a–3g fail; then `RESTORED`. Record the output.

- [ ] **Step 7: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/figsym.py experiments/figure-text-translation/test_figsym.py experiments/figure-text-translation/fonts/STIX-1.1.0-LICENSE.txt
git commit -m "feat(figures): §C140 ⑥a — figsym.py: the official STIX 1.1.0 font, hash-checked, renamed FigSym, with its licence metadata"
```

---

### Task 3: The composer draws eligible kept runs in FigSym (TDD)

**Files:**
- Modify: `experiments/figure-text-translation/compose.py` (`draw_run_exact`; the compose report)
- Modify: `experiments/figure-text-translation/svgout.py` (`write_svg`)
- Modify: `experiments/figure-text-translation/test_svgout.py` (new cases)

**Interfaces:**
- Consumes: `figsym.eligible_base`, `figsym.covers`, `figsym.subset_woff2`, `figsym.metadata_element`, `figsym.FAMILY`, `figsym.FontUnavailable` (Task 2); `figscripts._base_name(run, fonts)`.
- Produces: run-exact items carry `family` (`'FigSym'` or absent); `compose-report.json` gains `stix: {drawn: [key…], skipped: [{key, reason}]}` with reasons `translated`, `other-face`, `cmap`; `write_svg` emits the FigSym face after the FigIS faces and the `<metadata>` as the first child of the text group, only when an item has `family == 'FigSym'`.

- [ ] **Step 1: Read first**

Read `compose.py` in full (it is a script: module-level code builds `ITEMS`, then writes PNG, SVG and `compose-report.json`), `svgout.py` in full, `test_svgout.py` in full, and `figscripts._base_name`. Note the comment above the `compose-report.json` write: nothing may be printed between the `!!` header and its keys.

- [ ] **Step 2: Write the failing svgout tests** (append to `test_svgout.py`, in its existing style; use its existing fixture helpers for an artwork SVG and items)

Cases, each asserting by parsing the output (not by substring where a parse is possible):
1. **No FigSym item** → parses as XML; the `@font-face` families are only `FigIS`, in today's (bold, italic) order; every `<text>` has `font-family="FigIS"`; no `<metadata>` element; and the `<g>`'s first child is a `<text>` (the group is unchanged in shape).
2. **One FigSym item** (`family='FigSym'`, text `'+'`) and one FigIS item → the output parses as XML; `@font-face` families in order `FigIS…`, then `FigSym` 400/normal; the FigSym item's `<text>` has `font-family="FigSym"`, the other `FigIS`; exactly one `<metadata>` and it is the first child of the `<g>`; the FigIS face's characters do not include `'+'` (decode the woff2 with fontTools and read its cmap).
3. **All characters moved to FigSym** → no FigIS face is emitted when no item uses it.
4. **figparts contract:** the output still splits with `evidence/2026-09-17-c4-build/instruments/figparts.py`'s `split()` rule (last `<style>`; remainder `\n<g …>…</g>\n</svg>\n`) — import `split` from that file by path and assert it does not raise.

Run: `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 test_svgout.py 2>&1 | tail -15` → the new cases FAIL.

- [ ] **Step 3: Implement `svgout.write_svg`**

- FigIS character sets: only items whose `it.get('family') != 'FigSym'`.
- After the FigIS loop, if any item has `family == 'FigSym'`: `figsym.subset_woff2({chars of those items})` → one `@font-face{font-family:'FigSym';font-weight:400;font-style:normal;src:url(data:font/woff2;base64,…) format('woff2');}` appended after the FigIS rules.
- `<text>`: `font-family="{it.get('family', FAMILY)}"`; a FigSym item's `font-weight` is its own (400 for Regular) — leave the existing attribute logic.
- The group: `parts = [style, '<g text-rendering="geometricPrecision">']`, then, only when a FigSym item exists, `figsym.metadata_element()` as the next part, then the `<text>` parts. Import figsym lazily inside `write_svg` (only when needed), so a box without the font still composes figures without STIX.

- [ ] **Step 4: Implement `compose.py`**

In `draw_run_exact`, per run after `bold, italic = FT.run_face(...)`:

```python
        family = None
        base = FSC._base_name(r, meta['fonts'])
        if figsym.eligible_base(base):
            if figsym.covers(text):                   # raises figsym.FontUnavailable when the font is missing/wrong
                family = figsym.FAMILY
                STIX['drawn'].add(key)
            else:
                STIX['skipped'].append(dict(key=key, reason='cmap'))
        elif base.startswith('STIXGeneral'):
            STIX['skipped'].append(dict(key=key, reason='other-face'))
```

Add `family=family` to the `ITEMS.append(dict(...))` only when `family` is set. `key` is the block key being drawn — `draw_run_exact(block)` does not receive it today: add a `key` parameter (`draw_run_exact(drawn, key)` at its call site) rather than a global. Check what `FSC._base_name` returns for a run with no font entry (it must not raise on `.startswith`). Import `figscripts as FSC` (or reuse the module's existing alias for figscripts if it already has one — check) and `figsym` at the top. Initialise `STIX = {'drawn': set(), 'skipped': []}` beside the other report lists. On the translated path, when a translated (not identity) block contains an eligible run, append `dict(key=key, reason='translated')`; an eligible-looking STIX run in another face (`_base_name` starts with `STIXGeneral` but `eligible_base` is False) is `reason='other-face'`, recorded wherever the run is seen. Add `'stix': {'drawn': sorted(STIX['drawn']), 'skipped': STIX['skipped']}` to the `compose-report.json` dict (additive, like `localized`). The cairo PNG keeps drawing Liberation (its toy font API cannot load an uninstalled font; nothing publishes that PNG).

A missing or wrong font raises `figsym.FontUnavailable` out of `draw_run_exact` for a figure with an eligible run: compose.py dies before writing `compose-report.json`, which `figure-compose.py` already treats as a failed compose. Do not catch it.

- [ ] **Step 5: A compose-level test** — add to `test_compose_runexact.py` (read it first; it composes real fixture figures) a case composing `CNX_Chem_04_02_HClsoln` (it has an identity STIX block) in `--control` mode with `--svg`, asserting: `compose-report.json` `stix.drawn` is non-empty; the SVG parses; at least one `<text font-family="FigSym">` exists; its `<metadata>` exists; and — **negative arm** — with `FIGTEXT_STIX_FONT` pointing at a missing file, compose exits non-zero and writes no `compose-report.json`. Also update the `faces()` helpers in `test_compose_runexact.py` and `test_compose_t23.py` that regex only `'FigIS'` only if a case now fails because of them; otherwise leave them and say so.

- [ ] **Step 6: Suites**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
for t in test_figsym.py test_svgout.py test_compose_runexact.py test_compose_t23.py test_figure_compose.py test_blockkey_consumers.py test_figtext_out.py test_figcolour.py test_readlayer.py test_figure_prepare.py test_sendable.py test_sources.py test_make_fixture.py test_figrings.py test_svgfix.py test_strip_text.py; do
  printf '%s: ' "$t"; FIGTEXT_PYLIBS=./pylibs python3 "$t" 2>&1 | tail -1
done
```

Expected: every line `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/compose.py experiments/figure-text-translation/svgout.py experiments/figure-text-translation/test_svgout.py experiments/figure-text-translation/test_compose_runexact.py
git commit -m "feat(figures): §C140 ⑥a — kept STIXGeneral-Regular runs are drawn in FigSym, with the licence metadata

<paste Step 6's result lines>"
```

---

### Task 4: After-measurements (0 ISK)

**Files:**
- Create: `…/2026-09-17-c6a-build/instruments/compare_textlists.py`, `…/instruments/chromium_stix.py`
- Create: `…/2026-09-17-c6a-build/reports/after/…`

**Interfaces:**
- Consumes: `compose34.py`, `textlist.py` (Task 1); the changed composer (Tasks 2–3).
- Produces: `reports/after/recompose-set.txt` (one basename per line).

- [ ] **Step 1: Compose AFTER** — `python3 -u $B/instruments/compose34.py --out $SP/after > $B/reports/after/compose34.log 2>&1` (default tree = this repository); expect `DONE 34 figures prep_fail=0 compose_fail=0`. Then `textlist.py $SP/after/work/*/translated.svg > $B/reports/after/textlists.json`.

- [ ] **Step 2: `compare_textlists.py`** — for each figure compare `before` vs `after` `textlists.json` entries (key the files by basename, not by full path): same count of texts; for each index the fields `text x y size weight style fill` equal; `family` changes listed; faces before/after; metadata before/after; `xml_ok` after. Write `reports/after/textlist-compare.txt` (one line per figure: `changed_family_count`, `other_field_diffs`, faces before → after, metadata) and `reports/after/recompose-set.txt` (figures with `changed_family_count > 0`). Also read each after figure's `compose-report.json` `stix` and check its `drawn` keys correspond to the family-changed texts. Check P1–P4 against these files; P5: run `figsym.name_violations` on the FigSym woff2 extracted from each after-SVG with a FigSym face (decode the base64 `src`), write the results to `reports/after/names.txt`.

- [ ] **Step 3: `chromium_stix.py` (P6)** — for each figure in the recompose set: render the before-SVG, the after-SVG, and the after-SVG with its FigSym `@font-face` rule removed (write that variant to scratch) with `node render-check.mjs <svg> <png> <w> <h> 1` at the source raster size; render the source artwork PDF with `pdftocairo -png -r 200`; for every FigSym `<text>` element, crop a box around it (from its x/y/font-size) in all four images and record the mean absolute difference to the source for before and after, and whether the no-rule variant differs from after. Save a side-by-side crop per figure under `reports/after/crops/` and LOOK at at least three of them; write one sentence each into `reports/after/chromium-look.md`. P6 is met when the after mean difference is lower than before on the majority of FigSym texts per figure and the no-rule control differs.

- [ ] **Step 4: Suites (P8)** — the Python loop from Task 3 Step 6 → `reports/after/python-tests.txt`; the root vitest by name exactly as `evidence/2026-09-17-c4-build/instruments/npm_compare.cjs` does it (copy it into this build's instruments and re-point both paths to this build's folder; baseline: copy `evidence/2026-09-17-c4-build/reports/after/npm-failing-by-name.txt` into `reports/before/npm-failing-by-name.txt` with its provenance noted in Task 6's README), writing `reports/after/npm-compare.txt`.

- [ ] **Step 5: Commit** — `git add` the build folder (+ `git add -f` logs); `git status --porcelain -- books/` empty; `git commit -m "evidence(figures): §C140 ⑥a build — after: text lists, names, Chromium, suites, 0 ISK"`.

---

### Task 5: Recompose the changed bought figures (0 ISK, foreground)

**Files:** Modify only `books/efnafraedi-2e/media/<basename>_IS.svg` for each basename in `reports/after/recompose-set.txt`; create `…/reports/recompose/…`.

- [ ] **Step 1:** `python3 evidence/2026-09-17-c4-build/instruments/figparts.py` (copy it into this build's instruments first) over the current `_IS.svg` of each set member → `reports/recompose/parts-before.json`.
- [ ] **Step 2:** `cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1` → `ALL PASS`, else STOP (BLOCKED).
- [ ] **Step 3:** For each basename (chapter `N` = its `NN` without a leading zero), in the foreground: `node tools/figure-run.js --book efnafraedi-2e --chapter N --figure <b> --stale --force > $B/reports/recompose/<b>.txt 2>&1`; each must show `MT spawned for 0 figure(s)`, `published 1 figure(s)`, `VERDICT ok` — anything else: STOP and report.
- [ ] **Step 4:** `git status --porcelain -- books/ > reports/recompose/git-status-books.txt` lists exactly the set's `_IS.svg` files; `figparts.py` after → `parts-after.json`; a compare file with, per figure, `artwork_same=True textgroup_changed=True` and the same `text_count` (P7). Run `textlist.py` over the recomposed `_IS.svg` files and confirm their `family` values equal the after compose's.
- [ ] **Step 5:** Render two recomposed figures with `render-check.mjs` and LOOK; one sentence each into `reports/recompose/look.md`.
- [ ] **Step 6:** Remove the BEFORE worktree: `git worktree remove --force $SP/before-tree` (it holds only symlinks and a checkout; `--force` is needed because of the untracked symlinks — confirm with `git -C $SP/before-tree status --porcelain` that nothing else is untracked first), `git worktree prune`.
- [ ] **Step 7:** Commit `books/efnafraedi-2e/media` + `reports/recompose`: `git commit -m "feat(figures): §C140 ⑥a — recompose the bought figures whose kept STIX symbols are now drawn in FigSym, 0 ISK"`.

---

### Task 6: Evidence write-up and documentation

**Files:** Create `…/2026-09-17-c6a-build/VERIFICATION.md`, `…/README.md`; modify the campaign register and `experiments/figure-text-translation/REGISTER.md`.

- [ ] **Step 1: `VERIFICATION.md`** — frozen banner; P1–P8 table (predicted / measured / file), every number from a file under `reports/`; controls (the rename mutation from Task 2's commit message; the no-rule Chromium control; the missing-font negative arm); known limits (only the Regular face; translated STIX blocks stay Liberation; Firefox/WebKit unmeasured; cairo PNG stays Liberation).
- [ ] **Step 2: `README.md`** — instruments and commands; provenance of the npm baseline copy; that the font file is not in the repository and where it is read from; the licence text's source and hashes.
- [ ] **Step 3: Campaign register** (exact-string edits; raw U+0001 count stays 3):
  - **§C140 ⑥ row:** the STIX half built and verified on `feat/c140-c6a-stix-regular` (links: spec, VERIFICATION.md); per-run kerning still open → pointer to the new row.
  - **New row** after the last (next free circled number): **per-run kerning (⑥b)** — open, logged, carrying `evidence/2026-09-17-c6-explore/kerning.md` and `critic.md`'s findings: option (a) `font-kerning:none` on translated layout items vs (b) kern pairs in `lin_advance`; "a gap can only widen" contradicted by Liberation's positive `r’`/`f’` pairs; the per-run kept-run form reaches 0 kept runs on the 34.
  - **New row:** STIX Italic/Bold/BoldItalic faces and the 6 TrueType STIX objects not compared with official files — before buying beyond ch03/ch04.
  - **Row ㉗:** append one sentence — the existing FigIS Liberation subsets keep "Liberation" in name IDs 1/4/6, which the same strict reading would reach; not changed by ⑥a.
  - **New top ⏩ RESUME block** (previous top marked superseded): ⑥a built, verified and recomposed on `feat/c140-c6a-stix-regular`, stacked on ④'s PR #476 (merge ④ first); the single next action is [USER]'s review of the ④ and ⑥a PRs; kerning (⑥b) is the next build item; the font must be provisioned on any box that composes (path + hash, → `figsym.py`); buying stays stopped; figures reach readers only after a re-render and [USER]'s sync.
- [ ] **Step 4: `REGISTER.md`** — in the newest status table only, a row for FigSym (→ `figsym.py`, VERIFICATION.md).
- [ ] **Step 5:** Commit, push (`git push -u origin feat/c140-c6a-stix-regular`), no PR; `git status --porcelain` empty.
