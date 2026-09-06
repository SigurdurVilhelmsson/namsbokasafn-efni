# M5 Figure Driver Implementation Plan

> 🔴 **DO NOT EXECUTE AS WRITTEN — THIS PLAN FAILED ITS BLIND ADVERSARIAL REVIEW (2026-09-06).**
> 16 CONFIRMED defects, 4 partial, 0 refuted, in the two families that matter: **silent failure**
> and **spend safety**. The architecture, the six-task shape and every [USER] ruling SURVIVE —
> what failed is the **wiring between stages** and the **order of write-vs-refuse**.
> ▶ **REVISE against register §C137 first. Revise, do not re-design.**
>
> The three that will bite first: the **paid stage cannot honour `--out`** (isolation stops one
> stage short of the money, so every figure would translate from the shared directory);
> **`compose.py` keeps English on a missing key and says so only on stdout**, which this plan's
> wrapper never reads; and **the sidecar is written before publish can refuse**, so a figure whose
> publish fails is paid for and then reported `skipped-current` for ever.
> ⚠️ And **Task 3's tests are satisfiable by a `figure-prepare.py` that cannot process any real
> artwork** — they assert only refusals.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one chapter's figures processable end to end, unattended, so an editor sees each translated figure beside its module.

**Architecture:** A thin Node driver (`tools/figure-run.js`) enumerates a chapter's figures from its CNXML, resolves each through `sources.py`, classifies it, sends only vectors-with-text to the paid MT stage, and writes the sidecar that unblocks the already-built review and publish path. Two thin Python entry points wrap the existing extraction and composition stages behind an explicit `--out <dir>`, giving per-figure isolation.

**Tech Stack:** Node 22 ESM (`tools/` is `"type": "module"`), Python 3.12 (pikepdf, cairo, PIL system-installed; fontTools/brotli vendored in `experiments/figure-text-translation/pylibs`), Vitest, `pdftocairo` from poppler-utils.

**Spec:** `docs/superpowers/specs/2026-09-06-m5-figure-driver-design.md`

## Global Constraints

- **`tools/` is ESM** (root `package.json` is `"type": "module"`). `tools/lib/*.cjs` exists ONLY for modules consumed by both trees — do not reach for `.cjs` for anything tools-only. `figure-text-sidecar.cjs` is already `.cjs`; import it with `createRequire`.
- **Resolve paths against `import.meta.url`/`__dirname`, never `process.cwd()`.**
- **Never `process.exit()` after writing output** — it discards queued stdout on a pipe. Use `process.exitCode`.
- **Set `process.exitCode = 1` on entry**, clear it only when a verdict is reached. A promise that never settles exits 0.
- **Unknown flags must be REJECTED, not dropped.** `tools/lib/parseArgs.js` silently drops them; `translate-blocks.mjs` exits 2 with `Unknown argument`. Follow `translate-blocks.mjs`.
- **`--dry-run` must never construct an API client.**
- **Nothing writes under `books/` until the sidecar step.**
- **Never read or write `books/*/01-source/` for artwork.** The artwork lives outside the repo via gitignored `sources.local.json`.
- Run `npm test` from the repo root. `grep` here is ugrep — pass `-a`.

**Exact shapes, copied from the tree (do not re-derive):**

```jsonc
// experiments/…/out/blocks.json — an ARRAY
[{ "key": "Boiling|point|of water", "english": "Boiling point of water",
   "lines": ["Boiling","point","of water"], "arc": false, "send": true }]

// experiments/…/out/translations-api.json
{ "_source": "Málstaður /v1/translate, no glossary",
  "blocks": { "Boiling|point|of water": ["Suðumark vatns"] } }

// books/<slug>/figure-text/<basename>.is.json  — note blocks is {k: v}, NOT {k: [v]}
{ "version": 1, "basename": "CNX_Chem_01_01_SciMethod",
  "blocks": { "Observation and curiosity": "Athugun og forvitni" } }
```

`tools/lib/figure-text-sidecar.cjs` exports `sidecarPath(bookDir, basename)`, `readSidecar(bookDir, basename)`, `writeSidecar(bookDir, basename, data)`, `computeRenderHash(blocks, composerVersion)`, `editorialState(...)`, `effectiveState(...)`. **`bookDir` is `books/<slug>`, not `books/`.**

---

## File Structure

| file | responsibility |
|---|---|
| `tools/lib/figure-outcomes.js` | **new** — the outcome enum, the tally, and the exit verdict. Pure. |
| `tools/lib/figure-classify.js` | **new** — resolve + raster probe + classify one figure. Pure over injected resolvers. |
| `experiments/…/figure-prepare.py` | **new** — artwork → `blocks.json` + `artwork.svg` + `prepare.json`, into `--out` |
| `experiments/…/figure-compose.py` | **new** — blocks + translations → `translated.svg`, from `--out` |
| `experiments/…/translate-blocks.mjs` | **modify** — invert gate 1 |
| `tools/figure-run.js` | **new** — the driver: enumerate, orchestrate, summarise |
| `tools/__tests__/figure-outcomes.test.js` | **new** |
| `tools/__tests__/figure-classify.test.js` | **new** |
| `tools/__tests__/figure-run-partition.test.js` | **new** — the corpus partition check |

---

### Task 1: Outcome vocabulary and the exit verdict

Pure, no I/O, no dependencies. It fixes the vocabulary every later task uses.

**Files:**
- Create: `tools/lib/figure-outcomes.js`
- Test: `tools/__tests__/figure-outcomes.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `CLASSIFICATION_OUTCOMES`, `PROCESS_OUTCOMES`, `ALL_OUTCOMES` (arrays of string); `emptyTally()` → object with every outcome key at 0; `verdict(tally)` → `{ok: boolean, reasons: string[]}`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import {
  CLASSIFICATION_OUTCOMES, PROCESS_OUTCOMES, ALL_OUTCOMES, emptyTally, verdict,
} from '../lib/figure-outcomes.js';

describe('figure outcome vocabulary', () => {
  it('keeps classification and process outcomes disjoint', () => {
    const overlap = CLASSIFICATION_OUTCOMES.filter((o) => PROCESS_OUTCOMES.includes(o));
    expect(overlap).toEqual([]);
    expect(ALL_OUTCOMES.length).toBe(CLASSIFICATION_OUTCOMES.length + PROCESS_OUTCOMES.length);
  });

  it('emptyTally has a zero for every outcome and nothing else', () => {
    const t = emptyTally();
    expect(Object.keys(t).sort()).toEqual([...ALL_OUTCOMES].sort());
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
  });
});

describe('verdict', () => {
  it('is ok when work happened and nothing needs a human', () => {
    const t = { ...emptyTally(), translated: 5, 'copied-photo': 2 };
    expect(verdict(t).ok).toBe(true);
  });

  it('is NOT ok when any figure failed', () => {
    const t = { ...emptyTally(), translated: 5, 'failed-compose': 1 };
    const v = verdict(t);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toContain('failed-compose');
  });

  it('is NOT ok when a figure is unresolved — a hole in the artwork delivery', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 1 };
    expect(verdict(t).ok).toBe(false);
  });

  // 🔴 The spec's self-review caught this: a chapter of legitimate photographs
  // translates zero and is CORRECT. Failing it would train the operator to
  // ignore the exit code.
  it('is ok when zero translated because nothing was translate-able', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'copied-textless': 3 };
    expect(verdict(t).ok).toBe(true);
  });

  it('is NOT ok when translate-able figures existed but none translated', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'failed-mt': 4 };
    const v = verdict(t);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/none .*translated|zero translated/i);
  });

  it('is ok on a run where everything was already current', () => {
    const t = { ...emptyTally(), 'skipped-current': 12 };
    expect(verdict(t).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/figure-outcomes.test.js`
Expected: FAIL — `Failed to resolve import "../lib/figure-outcomes.js"`.

- [ ] **Step 3: Implement**

```js
// tools/lib/figure-outcomes.js
/**
 * The closed outcome vocabulary for a figure run, and the run's exit verdict.
 *
 * Two disjoint groups. A figure lands in EXACTLY ONE bucket, which is what makes
 * the corpus partition check (Task 6) meaningful: the tally must sum to the
 * number of figures enumerated.
 */

/** What the figure IS. */
export const CLASSIFICATION_OUTCOMES = [
  'translated',
  'copied-photo',
  'copied-textless',
  'unresolved',
];

/** What HAPPENED to it. A figure that was translate-able but failed lands here, never in `translated`. */
export const PROCESS_OUTCOMES = [
  'failed-prepare',
  'failed-mt',
  'failed-compose',
  'failed-publish',
  'skipped-current',
];

export const ALL_OUTCOMES = [...CLASSIFICATION_OUTCOMES, ...PROCESS_OUTCOMES];

/** Outcomes that mean a translate-able figure did NOT get translated. */
const FAILED = ['failed-prepare', 'failed-mt', 'failed-compose', 'failed-publish'];

export function emptyTally() {
  const t = {};
  for (const k of ALL_OUTCOMES) t[k] = 0;
  return t;
}

/**
 * Decide the run's verdict. NOT "did it finish" — "does a human need to look?".
 * @param {Record<string, number>} tally
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function verdict(tally) {
  const reasons = [];
  for (const k of FAILED) {
    if (tally[k] > 0) reasons.push(`${tally[k]} figure(s) ${k}`);
  }
  if (tally.unresolved > 0) {
    reasons.push(
      `${tally.unresolved} figure(s) unresolved — the artwork delivery has a hole for this chapter`
    );
  }
  // 🔴 The predicate is deliberately NOT `translated === 0 && figures > 0`.
  // A chapter whose figures are legitimately ALL photographs translates zero and
  // is correct; failing it would train the operator to ignore the exit code.
  const attempted = tally.translated + FAILED.reduce((n, k) => n + tally[k], 0);
  if (attempted > 0 && tally.translated === 0) {
    reasons.push('zero translated although translate-able figures were found');
  }
  return { ok: reasons.length === 0, reasons };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tools/__tests__/figure-outcomes.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-outcomes.js tools/__tests__/figure-outcomes.test.js
git commit -m "feat(M5): the figure outcome vocabulary and its exit verdict"
```

---

### Task 2: Classification, including the photo-vs-missing discriminator

**Files:**
- Create: `tools/lib/figure-classify.js`
- Test: `tools/__tests__/figure-classify.test.js`

**Interfaces:**
- Consumes: `CLASSIFICATION_OUTCOMES` from Task 1 (not imported; the strings are shared vocabulary).
- Produces: `classifyFigure({ vectorPath, rasterPath, blocks })` → `{ outcome: string, sendable: number }` where `outcome` is one of `'translated'|'copied-photo'|'copied-textless'|'unresolved'` used here as the INTENT (the driver downgrades `translated` to a `failed-*` if a later stage throws), and `sendable` is the count of blocks with `send === true`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { classifyFigure } from '../lib/figure-classify.js';

const block = (key, send) => ({ key, english: key, lines: [key], arc: false, send });

describe('classifyFigure', () => {
  it('translates a vector with sendable blocks', () => {
    const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: null,
      blocks: [block('Fahrenheit', true), block('212 °F', false)] });
    expect(r).toEqual({ outcome: 'translated', sendable: 1 });
  });

  it('copies a vector whose blocks are all unsendable', () => {
    const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: null,
      blocks: [block('212 °F', false), block('32 °F', false)] });
    expect(r).toEqual({ outcome: 'copied-textless', sendable: 0 });
  });

  it('copies a vector with no blocks at all', () => {
    const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: null, blocks: [] });
    expect(r.outcome).toBe('copied-textless');
  });

  it('copies a photograph — a raster with no vector', () => {
    const r = classifyFigure({ vectorPath: null, rasterPath: '/a/x.jpg', blocks: null });
    expect(r).toEqual({ outcome: 'copied-photo', sendable: 0 });
  });

  // 🔴 The two must not collapse: a photo legitimately has no PDF, a MISSING
  // vector also has none, and only the second means the delivery has a hole.
  it('reports nothing-in-the-delivery as unresolved, NOT as a photo', () => {
    const r = classifyFigure({ vectorPath: null, rasterPath: null, blocks: null });
    expect(r).toEqual({ outcome: 'unresolved', sendable: 0 });
  });

  it('prefers the vector when both exist', () => {
    const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: '/a/x.jpg',
      blocks: [block('Celsius', true)] });
    expect(r.outcome).toBe('translated');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/figure-classify.test.js`
Expected: FAIL — cannot resolve `../lib/figure-classify.js`.

- [ ] **Step 3: Implement**

```js
// tools/lib/figure-classify.js
/**
 * Classify ONE figure from what the artwork delivery holds for it and what
 * extraction found inside.
 *
 * 🔴 [USER] 2026-09-06: "photos move over untranslated, vector images with text
 * paths translated through MT". That rule is DERIVED here rather than
 * configured: a photograph simply has no vector in the delivery, and a
 * text-less vector simply yields no sendable block.
 *
 * @param {{vectorPath: string|null, rasterPath: string|null, blocks: Array|null}} input
 * @returns {{outcome: string, sendable: number}}
 */
export function classifyFigure({ vectorPath, rasterPath, blocks }) {
  if (vectorPath) {
    const sendable = (blocks || []).filter((b) => b && b.send === true).length;
    return sendable > 0
      ? { outcome: 'translated', sendable }
      : { outcome: 'copied-textless', sendable: 0 };
  }
  // 🔴 A photograph and a MISSING vector both fail to resolve a vector. Only the
  // raster probe separates them, and only `unresolved` says the delivery has a
  // hole — a fact nothing else in the pipeline looks for.
  if (rasterPath) return { outcome: 'copied-photo', sendable: 0 };
  return { outcome: 'unresolved', sendable: 0 };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tools/__tests__/figure-classify.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-classify.js tools/__tests__/figure-classify.test.js
git commit -m "feat(M5): classify a figure, separating a photograph from a hole in the delivery"
```

---

### Task 3: `figure-prepare.py` — artwork to blocks, into `--out`

**Files:**
- Create: `experiments/figure-text-translation/figure-prepare.py`
- Test: `experiments/figure-text-translation/test_figure_prepare.py`

**Interfaces:**
- Consumes: the existing `extract.py`, `strip-text.py`, `emit-blocks.py` behaviour and `_deps.py`.
- Produces: CLI `python3 figure-prepare.py <artwork-path> --out <dir>`; writes `<out>/blocks.json`, `<out>/artwork.png`, `<out>/artwork.svg`, `<out>/meta.json`, `<out>/runs.json`, and `<out>/prepare.json` = `{"basename": str, "source": str, "blocks": int, "sendable": int, "artworkSvgPath": str, "warnings": [str]}`. Exit 0 on success, 1 on failure with `{"error": str, "warnings": []}` in `prepare.json`.

- [ ] **Step 1: Write the failing test**

Match the existing plain-assert style of `test_sources.py` — this experiment does not use pytest.

```python
#!/usr/bin/env python3
"""Tests for figure-prepare.py's contract. Run: python3 test_figure_prepare.py"""
import json, subprocess, sys, tempfile, pathlib

HERE = pathlib.Path(__file__).resolve().parent
FAILURES = []

def check(label, cond, detail=''):
    if cond:
        print(f"  PASS  {label}")
    else:
        FAILURES.append(label)
        print(f"  FAIL  {label} {detail}")

def test_missing_artwork_fails_cleanly():
    with tempfile.TemporaryDirectory() as td:
        r = subprocess.run([sys.executable, str(HERE / 'figure-prepare.py'),
                            '/nonexistent/nope.pdf', '--out', td],
                           capture_output=True, text=True)
        check('missing artwork exits 1', r.returncode == 1, f'got {r.returncode}')
        p = pathlib.Path(td) / 'prepare.json'
        check('missing artwork still writes prepare.json', p.exists())
        if p.exists():
            d = json.loads(p.read_text())
            check('prepare.json carries an error', bool(d.get('error')))

def test_out_is_required():
    r = subprocess.run([sys.executable, str(HERE / 'figure-prepare.py'), '/tmp/x.pdf'],
                       capture_output=True, text=True)
    check('--out is required', r.returncode == 2, f'got {r.returncode}')

def test_out_is_honoured_not_the_shared_dir():
    # The shared experiments/out/ must NOT be touched when --out is given.
    shared = HERE / 'out' / 'prepare.json'
    before = shared.exists()
    with tempfile.TemporaryDirectory() as td:
        subprocess.run([sys.executable, str(HERE / 'figure-prepare.py'),
                        '/nonexistent/nope.pdf', '--out', td], capture_output=True)
    check('shared out/ untouched', shared.exists() == before)

if __name__ == '__main__':
    test_missing_artwork_fails_cleanly()
    test_out_is_required()
    test_out_is_honoured_not_the_shared_dir()
    print('ALL PASS' if not FAILURES else f'{len(FAILURES)} FAILED')
    sys.exit(1 if FAILURES else 0)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd experiments/figure-text-translation && python3 test_figure_prepare.py`
Expected: FAIL — `figure-prepare.py` does not exist, so every subprocess returns a non-matching code.

- [ ] **Step 3: Implement**

```python
#!/usr/bin/env python3
"""Prepare ONE figure for translation, into an isolated --out directory.

Wraps what extract.py + strip-text.py + emit-blocks.py already do. It adds
nothing but isolation, the missing `pdftocairo -svg`, and a machine-readable
result — the driver reads prepare.json, never the intermediates.

    python3 figure-prepare.py <artwork.pdf|.eps|.ai> --out <dir>
"""
import json, os, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent


def fail(out_dir, message, warnings):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'prepare.json').write_text(
        json.dumps({'error': message, 'warnings': warnings}, ensure_ascii=False, indent=1)
    )
    print(f'FAILED: {message}', file=sys.stderr)
    return 1


def main(argv):
    if '--out' not in argv or len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    artwork = pathlib.Path(argv[0])
    out_dir = pathlib.Path(argv[argv.index('--out') + 1]).resolve()
    warnings = []

    if not artwork.exists():
        return fail(out_dir, f'artwork not found: {artwork}', warnings)

    out_dir.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, FIGTEXT_OUT=str(out_dir))

    # extract + emit-blocks. capture_output is NOT used: emit-blocks.py:17 swallows
    # extract's subset-font warning, and in an unattended run a swallowed warning
    # is a silently mistranslated figure.
    try:
        r = subprocess.run([sys.executable, str(HERE / 'emit-blocks.py'), str(artwork)],
                           env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if r.stderr.strip():
            warnings.extend(line for line in r.stderr.splitlines() if line.strip())
        if r.returncode != 0:
            return fail(out_dir, f'emit-blocks failed: {r.stderr.strip()[:300]}', warnings)
    except Exception as exc:  # noqa: BLE001 - report, never crash the driver's loop
        return fail(out_dir, f'emit-blocks raised: {exc}', warnings)

    # strip text and render BOTH backgrounds. The -svg half is the gap: SVG is the
    # settled outputFormat and its input had no producer.
    try:
        r = subprocess.run([sys.executable, str(HERE / 'strip-text.py'), str(artwork), '--svg'],
                           env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if r.stderr.strip():
            warnings.extend(line for line in r.stderr.splitlines() if line.strip())
        if r.returncode != 0:
            return fail(out_dir, f'strip-text failed: {r.stderr.strip()[:300]}', warnings)
    except Exception as exc:  # noqa: BLE001
        return fail(out_dir, f'strip-text raised: {exc}', warnings)

    blocks_path = out_dir / 'blocks.json'
    if not blocks_path.exists():
        return fail(out_dir, 'emit-blocks wrote no blocks.json', warnings)
    blocks = json.loads(blocks_path.read_text())
    svg = out_dir / 'artwork.svg'

    (out_dir / 'prepare.json').write_text(json.dumps({
        'basename': artwork.stem,
        'source': str(artwork),
        'blocks': len(blocks),
        'sendable': sum(1 for b in blocks if b.get('send')),
        'artworkSvgPath': str(svg) if svg.exists() else None,
        'warnings': warnings,
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
```

Then thread `FIGTEXT_OUT` through `_deps.py` so `OUT` honours it:

```python
# _deps.py — replace the OUT assignment
OUT = pathlib.Path(os.environ.get('FIGTEXT_OUT') or (HERE / 'out'))
```

and add the `--svg` branch to `strip-text.py` beside the existing `-png` call:

```python
# strip-text.py, after the existing pdftocairo -png invocation
if '--svg' in sys.argv:
    subprocess.run(['pdftocairo', '-svg', str(OUT / 'artwork.pdf'), str(OUT / 'artwork.svg')],
                   check=True)
```

- [ ] **Step 4: Run and watch it pass**

Run: `cd experiments/figure-text-translation && python3 test_figure_prepare.py`
Expected: `ALL PASS`.

Then confirm the existing suites still pass:
Run: `cd experiments/figure-text-translation && python3 test_sources.py && python3 test_figtext_normalise.py`
Expected: `ALL PASS` for both.

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/figure-prepare.py \
        experiments/figure-text-translation/test_figure_prepare.py \
        experiments/figure-text-translation/_deps.py \
        experiments/figure-text-translation/strip-text.py
git commit -m "feat(M5): figure-prepare.py — per-figure isolation and the missing artwork.svg producer"
```

---

### Task 4: `figure-compose.py` — blocks and translations to SVG

**Files:**
- Create: `experiments/figure-text-translation/figure-compose.py`
- Test: `experiments/figure-text-translation/test_figure_compose.py`

**Interfaces:**
- Consumes: `<out>/meta.json`, `<out>/runs.json`, `<out>/artwork.png`, `<out>/artwork.svg` from Task 3.
- Produces: CLI `python3 figure-compose.py --out <dir> --translations <path>`; writes `<out>/translated.svg` and `<out>/compose.json` = `{"outputPath": str}` or `{"error": str}`. Exit 0 / 1.

- [ ] **Step 1: Write the failing test**

```python
#!/usr/bin/env python3
"""Tests for figure-compose.py's contract. Run: python3 test_figure_compose.py"""
import json, subprocess, sys, tempfile, pathlib

HERE = pathlib.Path(__file__).resolve().parent
FAILURES = []

def check(label, cond, detail=''):
    if cond: print(f"  PASS  {label}")
    else:
        FAILURES.append(label); print(f"  FAIL  {label} {detail}")

def test_out_and_translations_required():
    r = subprocess.run([sys.executable, str(HERE / 'figure-compose.py')],
                       capture_output=True, text=True)
    check('no args exits 2', r.returncode == 2, f'got {r.returncode}')

def test_missing_artwork_svg_fails_before_writing():
    with tempfile.TemporaryDirectory() as td:
        out = pathlib.Path(td)
        (out / 'translations.json').write_text('{"blocks": {}}')
        r = subprocess.run([sys.executable, str(HERE / 'figure-compose.py'),
                            '--out', td, '--translations', str(out / 'translations.json')],
                           capture_output=True, text=True)
        check('missing artwork.svg exits 1', r.returncode == 1, f'got {r.returncode}')
        check('no partial translated.svg left behind', not (out / 'translated.svg').exists())
        d = json.loads((out / 'compose.json').read_text())
        check('compose.json carries an error', bool(d.get('error')))

if __name__ == '__main__':
    test_out_and_translations_required()
    test_missing_artwork_svg_fails_before_writing()
    print('ALL PASS' if not FAILURES else f'{len(FAILURES)} FAILED')
    sys.exit(1 if FAILURES else 0)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd experiments/figure-text-translation && python3 test_figure_compose.py`
Expected: FAIL — `figure-compose.py` does not exist.

- [ ] **Step 3: Implement**

```python
#!/usr/bin/env python3
"""Compose ONE translated figure from an isolated --out directory.

    python3 figure-compose.py --out <dir> --translations <path>

Wraps compose.py --svg. Checks its inputs FIRST: compose.py writes
translated.png at :203 before reading artwork.svg at :207, so a missing SVG
would otherwise crash after a partial write.
"""
import json, os, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent


def arg(argv, flag):
    return argv[argv.index(flag) + 1] if flag in argv and argv.index(flag) + 1 < len(argv) else None


def main(argv):
    out = arg(argv, '--out')
    translations = arg(argv, '--translations')
    if not out or not translations:
        print(__doc__, file=sys.stderr)
        return 2
    out_dir = pathlib.Path(out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    def fail(msg):
        (out_dir / 'compose.json').write_text(json.dumps({'error': msg}, ensure_ascii=False))
        print(f'FAILED: {msg}', file=sys.stderr)
        return 1

    # 🔴 Check inputs BEFORE invoking compose.py — it writes translated.png before
    # it reads artwork.svg, so a missing input leaves a partial artefact.
    for required in ('meta.json', 'runs.json', 'artwork.png', 'artwork.svg'):
        if not (out_dir / required).exists():
            return fail(f'missing input: {required}')
    if not pathlib.Path(translations).exists():
        return fail(f'missing translations: {translations}')

    env = dict(os.environ, FIGTEXT_OUT=str(out_dir))
    r = subprocess.run([sys.executable, str(HERE / 'compose.py'),
                        '--svg', '--translations', str(translations)],
                       env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        return fail(f'compose failed: {r.stderr.strip()[:300]}')
    svg = out_dir / 'translated.svg'
    if not svg.exists():
        return fail('compose wrote no translated.svg')
    (out_dir / 'compose.json').write_text(json.dumps({'outputPath': str(svg)}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run and watch it pass**

Run: `cd experiments/figure-text-translation && python3 test_figure_compose.py`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/figure-compose.py \
        experiments/figure-text-translation/test_figure_compose.py
git commit -m "feat(M5): figure-compose.py — validate inputs before composing, so a missing SVG leaves no partial write"
```

---

### Task 5: Invert gate 1 — the figure MT leg must refuse WITH a glossary

**Files:**
- Modify: `experiments/figure-text-translation/translate-blocks.mjs`
- Test: `tools/__tests__/figure-mt-glossary.test.js` (exists — update it)

**Interfaces:**
- Consumes: nothing new.
- Produces: unchanged CLI, inverted refusal. `translate-blocks.mjs --book <slug>` refuses with `REFUSED (glossary-on-wire)` and exit 2 if a glossary would be sent.

- [ ] **Step 1: Read the existing test and the gate**

Run: `grep -an "glossary" experiments/figure-text-translation/translate-blocks.mjs | head -20`
Run: `cat tools/__tests__/figure-mt-glossary.test.js`

Note what the current gate asserts, so the inversion replaces it rather than sitting beside it.

- [ ] **Step 2: Write the failing test**

Replace the existing gate assertions with their inverse. Keep the file's other tests.

```js
it('REFUSES when a glossary would go on the wire ([USER] 2026-09-06, on §C133)', () => {
  // The gate INVERTS rather than disappears. Deleting it would leave the paid
  // figure leg ungated, which is how this project has lost a guard before.
  const res = spawnSync('node', [TRANSLATE_BLOCKS, '--book', 'efnafraedi-2e', '--dry-run'],
    { encoding: 'utf8' });
  expect(res.stdout + res.stderr).not.toMatch(/Glossary: \d+ approved/);
});

it('sends no glossary and says so in the run record', () => {
  const res = spawnSync('node', [TRANSLATE_BLOCKS, '--book', 'efnafraedi-2e', '--dry-run'],
    { encoding: 'utf8' });
  expect(res.status).toBe(0);
  expect(res.stdout).toMatch(/no glossary/i);
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/figure-mt-glossary.test.js`
Expected: FAIL — the current build prints `Glossary: 1703 approved chemistry terms`.

- [ ] **Step 4: Invert the gate**

Replace the glossary load and its "or refuses" branch with the inverse. Keep it a
GATE — deleting it would leave the paid figure leg ungated.

```js
// experiments/figure-text-translation/translate-blocks.mjs
//
// 🔴 GATE 1, INVERTED — [USER] 2026-09-06, on §C133's measurement that the
// glossary buys no terminology consistency (44.2 / 44.6 / 44.4% across three
// runs, a spread inside the measure's own noise).
//
// The case is stronger for figures than for prose: figure text is labels and
// captions — short, fragmentary, often a single noun — which is exactly where a
// flat context-free map does its worst work, because there is no sentence to
// disambiguate against. And a wrong label is baked into an image rather than
// editable in the segment editor.
//
// This REPLACES the old "sends the glossary, or refuses" gate. It is not deleted.
if (glossaryTerms && glossaryTerms.length > 0) {
  console.error(
    `REFUSED (glossary-on-wire): ${glossaryTerms.length} term(s) would be sent. ` +
      'The figure MT leg carries no glossary ([USER] 2026-09-06).'
  );
  process.exitCode = 2;
  return;
}
const runSource = 'Málstaður /v1/translate, no glossary';
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run tools/__tests__/figure-mt-glossary.test.js`
Expected: PASS.
Then: `node experiments/figure-text-translation/translate-blocks.mjs --book efnafraedi-2e --dry-run`
Expected: exit 0, a cost line, and **no** `Glossary:` line.

- [ ] **Step 6: Commit**

```bash
git add experiments/figure-text-translation/translate-blocks.mjs tools/__tests__/figure-mt-glossary.test.js
git commit -m "feat(M5): invert figure gate 1 — the MT leg now refuses WITH a glossary"
```

---

### Task 6: The driver

**Files:**
- Create: `tools/figure-run.js`
- Test: `tools/__tests__/figure-run-partition.test.js`

**Interfaces:**
- Consumes: `figure-outcomes.js` (Task 1), `figure-classify.js` (Task 2), `figure-prepare.py` (Task 3), `figure-compose.py` (Task 4), `translate-blocks.mjs` (Task 5), `figure-text-sidecar.cjs`, `publish-figure-svg.js`.
- Produces: the CLI in the spec; exported `enumerateChapterFigures(bookSlug, chapter)` → `string[]` of basenames, and `normaliseTranslations(apiJson)` → `{[key: string]: string}`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normaliseTranslations, enumerateChapterFigures, isStale } from '../figure-run.js';

const FIGURE_RUN = fileURLToPath(new URL('../figure-run.js', import.meta.url));
import { ALL_OUTCOMES } from '../lib/figure-outcomes.js';

describe('normaliseTranslations', () => {
  // The MT tool writes {k: [v]}; the sidecar takes {k: v}. ONE conversion site.
  it('unwraps the single-element arrays the MT tool writes', () => {
    expect(normaliseTranslations({ blocks: { 'A|B': ['Á B'], C: ['Sé'] } }))
      .toEqual({ 'A|B': 'Á B', C: 'Sé' });
  });

  it('takes the first element when the API returns more than one', () => {
    expect(normaliseTranslations({ blocks: { A: ['first', 'second'] } })).toEqual({ A: 'first' });
  });

  it('passes a bare string through unchanged', () => {
    expect(normaliseTranslations({ blocks: { A: 'plain' } })).toEqual({ A: 'plain' });
  });

  it('drops an empty translation rather than writing an empty label', () => {
    expect(normaliseTranslations({ blocks: { A: [''], B: ['ok'] } })).toEqual({ B: 'ok' });
  });

  it('returns {} for a payload with no blocks', () => {
    expect(normaliseTranslations({})).toEqual({});
  });
});

describe('enumerateChapterFigures', () => {
  it('reads image basenames from the chapter CNXML, deduplicated and sorted', () => {
    const found = enumerateChapterFigures('efnafraedi-2e', 4);
    expect(Array.isArray(found)).toBe(true);
    expect(found.length).toBeGreaterThan(0);          // non-vacuity: ch04 HAS figures
    expect(new Set(found).size).toBe(found.length);   // deduplicated
    expect(found.every((b) => !b.includes('/'))).toBe(true);  // basenames, not paths
    expect(found.every((b) => !/\.(jpg|png|pdf)$/i.test(b))).toBe(true); // extension stripped
  });
});

describe('spec invariant 2 — nothing writes under books/ before the sidecar step', () => {
  it('a --dry-run leaves the working tree untouched', () => {
    const before = spawnSync('git', ['status', '--porcelain', 'books/'], { encoding: 'utf8' }).stdout;
    const run = spawnSync('node', [FIGURE_RUN, '--book', 'efnafraedi-2e', '--chapter', '4', '--dry-run'],
      { encoding: 'utf8' });
    const after = spawnSync('git', ['status', '--porcelain', 'books/'], { encoding: 'utf8' }).stdout;
    expect(after).toBe(before);
    // Non-vacuity: the run must actually have done something, or this proves nothing.
    expect(run.stdout).toMatch(/\d+ figure/);
  });
});

describe('isStale — the derivation the --stale batch run selects on', () => {
  // 🔴 Staleness is DERIVED, never stored: approving an edit rewrites renderHash,
  // which makes the composed image stale as a CONSEQUENCE. No flag, no queue.
  it('is stale when the approved text has moved past the composed image', () => {
    expect(isStale({ renderHash: 'aaa', composedHash: 'bbb' })).toBe(true);
  });

  it('is NOT stale when the image was composed from the current text', () => {
    expect(isStale({ renderHash: 'aaa', composedHash: 'aaa' })).toBe(false);
  });

  // An absent composedHash yields mt-preview, never approved — so it needs composing.
  it('treats a never-composed sidecar as stale', () => {
    expect(isStale({ renderHash: 'aaa' })).toBe(true);
  });

  it('treats a missing sidecar as NOT stale — there is nothing to recompose', () => {
    expect(isStale(null)).toBe(false);
  });
});

describe('the outcome partition', () => {
  it('every outcome the driver can emit is in the closed vocabulary', () => {
    // Guards the partition check: an outcome string not in ALL_OUTCOMES would
    // make the tally stop summing to the figure count, silently.
    const src = readFileSync(new URL('../figure-run.js', import.meta.url), 'utf8');
    const emitted = [...src.matchAll(/outcome:\s*'([a-z-]+)'/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(0);
    for (const o of emitted) expect(ALL_OUTCOMES).toContain(o);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/figure-run-partition.test.js`
Expected: FAIL — cannot resolve `../figure-run.js`.

- [ ] **Step 3: Implement the driver**

The load-bearing structure, with the rules encoded. Fill the marked stage calls
using the CLIs defined in Tasks 3–5.

```js
#!/usr/bin/env node
// tools/figure-run.js — the per-chapter figure driver.
//
// 🔴 FAILURE DEFAULT. A promise that never settles exits 0 — silently, with no
// output and no verdict. So the process starts FAILED and is cleared only when a
// verdict is genuinely reached, on the last line of main().
process.exitCode = 1;

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { emptyTally, verdict } from './lib/figure-outcomes.js';
import { classifyFigure } from './lib/figure-classify.js';
import { TAG_ATTR_SPAN } from './lib/cnxml-parser.js';

const require = createRequire(import.meta.url);
const { readSidecar, writeSidecar } = require('./lib/figure-text-sidecar.cjs');
const { chapterDir } = require('../server/lib/chapterLabel.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const EXP = path.join(REPO, 'experiments', 'figure-text-translation');

const FLAGS = new Set(['--book', '--chapter', '--module', '--figure',
                       '--dry-run', '--stale', '--force', '--json']);
const VALUED = new Set(['--book', '--chapter', '--module', '--figure']);

/** Strict, because parseArgs SILENTLY DROPS unknown flags and a dropped flag is a no-op. */
export function parseCli(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!FLAGS.has(a)) throw new Error(`Unknown argument: ${a}`);
    out[a.replace(/^--/, '')] = VALUED.has(a) ? argv[++i] : true;
  }
  return out;
}

/** The MT tool writes {k:[v]}; the sidecar takes {k:v}. ONE conversion site. */
export function normaliseTranslations(apiJson) {
  const src = (apiJson && apiJson.blocks) || {};
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s === 'string' && s.length > 0) out[k] = s;
  }
  return out;
}

/** Derived staleness — no flag, no queue. An absent composedHash means never composed. */
export function isStale(sidecar) {
  if (!sidecar) return false;
  return sidecar.composedHash !== sidecar.renderHash;
}

/**
 * 🔴 CNXML-DRIVEN, deliberately against the easier option. Enumerating the artwork
 * directory answers "what artwork do we have"; the question is "what does this
 * chapter show a reader". Only this side surfaces `unresolved`.
 * ⚠️ TAG_ATTR_SPAN, never `[^>]*` — a raw `>` inside an attribute truncates it.
 */
export function enumerateChapterFigures(bookSlug, chapter) {
  const dir = path.join(REPO, 'books', bookSlug, '01-source', chapterDir(chapter));
  const re = new RegExp(`<image${TAG_ATTR_SPAN}src="([^"]+)"`, 'g');
  const found = new Set();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.cnxml'))) {
    const xml = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of xml.matchAll(re)) {
      found.add(path.basename(m[1]).replace(/\.[^.]+$/, ''));
    }
  }
  return [...found].sort();
}

function main() {
  let args;
  try {
    args = parseCli(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
    return;
  }
  if (!args.book) { console.error('REFUSED (no-book)'); process.exitCode = 2; return; }
  if (!args.chapter === !args.stale) {
    console.error('REFUSED (scope): pass exactly one of --chapter or --stale');
    process.exitCode = 2; return;
  }

  const bookDir = path.join(REPO, 'books', args.book);
  const tally = emptyTally();
  const named = { unresolved: [], 'skipped-current': [] };
  const figures = args.stale ? listStaleFigures(bookDir) : enumerateChapterFigures(args.book, Number(args.chapter));
  const scoped = args.figure ? figures.filter((b) => b === args.figure) : figures;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figure-run-'));

  for (const basename of scoped) {
    // Per-figure isolation: --out T/<basename>, NEVER the shared experiments/out/.
    const out = path.join(tmpRoot, basename);
    const record = processFigure({ args, bookDir, basename, out });   // ← stages, below
    tally[record.outcome] += 1;
    if (named[record.outcome]) named[record.outcome].push(basename);
  }

  printSummary(tally, named, scoped.length);
  const v = verdict(tally);
  for (const r of v.reasons) console.error(`  ! ${r}`);
  // 🔴 exitCode, never process.exit() — stdout to a pipe is async and exit() discards it.
  process.exitCode = v.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

`processFigure` runs the stages in the spec's order and returns `{outcome}`:

1. `process.exitCode = 1` as the FIRST statement (failure default).
2. Strict argument parsing — reject unknown flags with exit 2 and `Unknown argument: <flag>`, matching `translate-blocks.mjs`. Do **not** use `parseArgs`; it drops unknown flags silently.
3. Refuse with exit 2 and `REFUSED (no-book)` when `--book` is absent; refuse when neither or both of `--chapter`/`--stale` are given.
4. `enumerateChapterFigures(bookSlug, chapter)` — read `books/<slug>/01-source/<chapterDir>/*.cnxml` using `chapterDir()` from `server/lib/chapterLabel.js` (the canonical `chNN` idiom, deliberately imported per the C1a two-conventions rule), match `<image[^>]*src="([^"]+)"` **using `TAG_ATTR_SPAN` from `tools/lib/cnxml-parser.js` rather than `[^>]*`** (a raw `>` inside an attribute truncates the naive form), take `path.basename(src)` minus its extension, dedupe, sort.
5. Per figure: resolve via `python3 sources.py <book> <basename>` for the vector; probe the same trees for `.jpg/.png/.tif` for the raster; `figure-prepare.py --out T/<basename>`; `classifyFigure`; for `translated`, `translate-blocks.mjs` then `figure-compose.py`; `writeSidecar(bookDir, basename, {version: 1, basename, blocks})`; `publish-figure-svg.js`.
6. `--dry-run` stops after classification and prints the tally plus the estimated cost. It must not spawn `translate-blocks.mjs` without `--dry-run`.
7. `--stale` selects figures where `readSidecar(...).renderHash !== readSidecar(...).composedHash`.
8. Tally with `emptyTally()`; print a per-outcome summary that **names** `skipped-current` and `unresolved` figures, not just counts them.
9. `const v = verdict(tally); process.exitCode = v.ok ? 0 : 1;` as the LAST statement. Never `process.exit()`.

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run tools/__tests__/figure-run-partition.test.js`
Expected: PASS.

- [ ] **Step 5: Run the free corpus check**

Run: `node tools/figure-run.js --book efnafraedi-2e --chapter 4 --dry-run > /tmp/m5-ch04.txt 2>&1; echo "exit=$?"; cat /tmp/m5-ch04.txt`

Expected: a tally whose outcome counts **sum exactly to the enumerated figure count**. Verify that sum by hand from the output. Costs 0 ISK — `--dry-run` constructs no API client.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: green. Compare the failing set by NAME against `main`'s floor, both directions — a count alone hides a swap.

- [ ] **Step 7: Commit**

```bash
git add tools/figure-run.js tools/__tests__/figure-run-partition.test.js
git commit -m "feat(M5): the per-chapter figure driver — enumerate, classify, translate, sidecar, publish"
```

---

## After the plan

Do **not** run a paid figure translation as part of implementation. The first live run is a separate, [USER]-authorised step, preceded by `--dry-run` on the target chapter.
