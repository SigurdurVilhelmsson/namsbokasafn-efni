# M5 Figure Driver Implementation Plan

> ✅ **REVISED 2026-09-06 against register §C137 and a 9-agent constraint verification.**
> The first version failed a blind adversarial review (16 confirmed, 4 partial, 0 refuted); the
> verification then found **two more** defects the review had missed, and **measured a fix the
> review left as an open question**.
> ▶ **What survives: the goal, the architecture, and every [USER] ruling.**
> ▶ **What changed: the TASK ORDER (two new tasks up front, one split, one moved), the
> write-vs-spend ORDER, the classification discriminator, the verdict, and three test files that
> could pass without the thing working.**
>
> **Spec:** `docs/superpowers/specs/2026-09-06-m5-figure-driver-design.md` — REVISED in the same pass. **Read it first.**
> **Findings this plan encodes:** register §C137 (D1–D11) plus N1/N2 and P1–P8 in the spec.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one chapter's figures processable end to end, unattended, so an editor sees each translated figure beside its module.

**Architecture:** A thin Node driver (`tools/figure-run.js`) enumerates a chapter's figures from its CNXML, resolves each through `sources.py`, classifies it, sends only vectors-with-text to the paid MT stage, and writes the sidecar that unblocks the already-built review and publish path. Two Python entry points wrap the existing extraction and composition stages behind an explicit `--out <dir>`, giving per-figure isolation.

**Tech Stack:** Node 22 ESM (`tools/` is `"type": "module"`), Python 3.12 (pikepdf, cairo, PIL system-installed; fontTools/brotli vendored in `experiments/figure-text-translation/pylibs`), Vitest, `pdftocairo` and `gs` from poppler-utils / ghostscript.

---

## 🔴 Read this before Task 0 — why the order changed

The old plan ran Task 1 → 6 and would have failed at the first real figure. Seven dependency violations were measured:

| # | violation |
|---|---|
| V1 | **The Python chain crashes on 23 of 30 ch04 figures and 91 of 178 across ch01–ch05.** None of the five edits that fix it appeared in any task. The old spec said "the whole single-figure chain works". |
| V2 | **Task 3's tests could not detect V1** — executed verbatim against a 12-line refuse-everything stub, **5 of 5 PASS**. |
| V3 | **Classification consumes a field prepare must produce, and came first.** "Has no vector" as the photo discriminator fires **1 time in 178** — OpenStax ships photographs as PDFs. |
| V4 | **Task 5's test could not run**: `translate-blocks.mjs` reads gitignored `out/blocks.json` and an unguarded gitignored `.env`, so in a clean tree the first assertion passes **vacuously** against the unfixed build. |
| V5 | **Task 5's test and code were jointly unsatisfiable** — the test demands exit 0 under `--book efnafraedi-2e`; the prescribed gate refuses whenever a glossary loads, and that book loads one. |
| V6 | **Task 6's stage list could express neither the retry path nor a 0-ISK recompose**, and referenced three functions defined nowhere. |
| V7 | **The block-key derivation fork expires at the first live run** — a sidecar's keys ARE the block keys, so once one chapter mints sidecars it becomes a key migration. |

**Revised order:** `0` repair Python · `0b` `--out` on the paid stage · `1` outcomes+verdict · `2` prepare · `3` classify (**moved after prepare**) · `4` compose · `5` invert gate 1 · `6a` the free driver · `6b` the paid driver.
▶ **6b is the only task that can spend money**, which is what makes the [USER] authorisation gate at the end meaningful.

---

## Global Constraints

- **`tools/` is ESM** (root `package.json` is `"type": "module"`). `tools/lib/*.cjs` exists ONLY for modules consumed by both trees. `figure-text-sidecar.cjs` is already `.cjs`; import it with `createRequire`.
- **Resolve paths against `import.meta.url`/`__dirname`, never `process.cwd()`.**
- **Never `process.exit()` after writing output** — it discards queued stdout on a pipe. Use `process.exitCode`.
- **Set `process.exitCode = 1` on entry**, clear it only when a verdict is reached. A promise that never settles exits 0.
- **Unknown flags must be REJECTED, not dropped**, and **a valued flag whose value is missing or begins with `--` must be rejected too**. Follow `translate-blocks.mjs` (exit 2, `Unknown argument`), not `tools/lib/parseArgs.js` (silent drop).
- **`--dry-run` must spawn `translate-blocks.mjs` ZERO times.** Not "spawn it with `--dry-run`".
- **Nothing writes under `books/` until the sidecar step — and the sidecar step happens the moment money is spent.**
- **Never read or write `books/*/01-source/` for artwork.** The artwork lives outside the repo via gitignored `sources.local.json`.
- Run `npm test` from the repo root. `grep` here is ugrep and committed files hold NUL bytes — **pass `-a`**.
- 🔴 **NO TEST SUITE MAY CONSIST ONLY OF REFUSALS.** Every suite needs at least one case that fails if the thing does not actually work. This is §C137's D11 and it was committed by the author of this rule.

**Exact shapes, copied from the tree — verified 2026-09-06:**

```jsonc
// experiments/…/out/blocks.json — an ARRAY
[{ "key": "Boiling|point|of water", "english": "Boiling point of water",
   "lines": ["Boiling","point","of water"], "arc": false, "send": true }]

// experiments/…/out/translations-api.json
// ⚠️ an ARC block's value is a BARE STRING, not an array
{ "_source": "Málstaður /v1/translate, no glossary",
  "blocks": { "Boiling|point|of water": ["Suðumark vatns"], "Next ...": "Næst ..." } }

// books/<slug>/figure-text/<basename>.is.json — blocks is {k: v}, and there is NO `state` key
{ "version": 1, "basename": "CNX_Chem_01_01_SciMethod",
  "renderHash": "<computeRenderHash(blocks, COMPOSER_VERSION)>", "composerVersion": "1",
  "blocks": { "Observation and curiosity": "Athugun og forvitni" } }
```

`tools/lib/figure-text-sidecar.cjs` exports `SIDECAR_VERSION`, `COMPOSER_VERSION` (`'1'`), `sidecarPath`, `readSidecar`, `writeSidecar`, `computeRenderHash`, `editorialState`, `effectiveState`. **`bookDir` is `books/<slug>`, not `books/`.**
🔴 **`writeSidecar` MINTS FREELY** — `mkdirSync` + atomic tmp/rename, no existence check. *(The old spec said both callers refuse on a missing file; that is true of the CALLERS' gates, not the writer.)*
🔴 **`publish-figure-svg.js` stamps `composedHash` iff `sidecar.renderHash` is truthy — `state` is irrelevant to it.** That is why the minted sidecar carries `renderHash` and no `state`.

---

## File Structure

| file | responsibility |
|---|---|
| `experiments/…/extract.py`, `figtext.py`, `emit-blocks.py`, `sources.py`, `census.py` | **repair** — Task 0 |
| `experiments/…/fixtures/fixture_figure.pdf` + `make_fixture.py` | **new** — the positive control |
| `experiments/…/translate-blocks.mjs` | **modify** — `--out` (Task 0b), invert gate 1 (Task 5) |
| `tools/lib/figure-outcomes.js` | **new** — outcome enum, safe tally, exit verdict. Pure. |
| `experiments/…/figure-prepare.py` | **new** — artwork → blocks + svg + `prepare.json`, into `--out` |
| `tools/lib/figure-classify.js` | **new** — classify one figure from prepare's output |
| `experiments/…/figure-compose.py` | **new** — compose with a machine-readable verdict |
| `tools/lib/figure-enumerate.cjs` | **new** — the enumeration predicate, shared with the server |
| `tools/figure-run.js` | **new** — the driver |

---

### Task 0: Repair the Python chain so it can process real artwork

🔴 **Without this, every later task is tested against something that cannot run.** A throwaway-copy proof took ch04 from **6 translated + 23 crashes** to **13 translated + 16 copied + 0 crashes**, with no regression in the 6 that already worked.

**Files:**
- Modify: `experiments/figure-text-translation/extract.py`, `figtext.py`, `emit-blocks.py`, `sources.py`, `census.py`
- Create: `experiments/figure-text-translation/fixtures/make_fixture.py`, `fixtures/fixture_figure.pdf`
- Test: `experiments/figure-text-translation/test_figure_chain.py`

- [ ] **Step 1: Read before you write.** Open `extract.py`, `figtext.py`, `emit-blocks.py`, `sources.py`. Confirm each defect below **exists at HEAD** before changing it — a plan's premise is a hypothesis, and this plan has already had several falsified.

- [ ] **Step 2: Write the failing test** — `test_figure_chain.py`, plain-assert style like `test_sources.py` (this experiment does not use pytest).

Cases, each of which must FAIL now:
1. **A text-less vector returns zero blocks, does not raise.** Build a PDF with a stroke and no `BT…ET`; assert `emit-blocks` exits 0 and `blocks.json` is `[]`.
2. **A page with no `/Font` resource does not raise.**
3. **A `/Type0` CID font is skipped, not fatal.**
4. **`emit-blocks.py` works from a foreign cwd.** Run it with `cwd=` a tempdir. *(Today it spawns `'extract.py'` cwd-relative and dies.)*
5. **`emit-blocks.py` does not swallow the child's stderr** — assert the subset-font warning is observable.
6. **`sources.py` REFUSES when a configured tree root is absent from disk**, rather than falling through to the next tree. Positive control: with all roots present, resolution still succeeds.
7. 🔴 **The emit-side and compose-side block keys are IDENTICAL for the fixture.** Derive both and assert set equality. *(This is P8 and it is the one that costs money.)*

- [ ] **Step 3: Run and watch them fail.** `cd experiments/figure-text-translation && python3 test_figure_chain.py`

- [ ] **Step 4: Implement**

| # | change |
|---|---|
| P1 | `extract.py` — read `/Resources`→`/Font` defensively, defaulting to `{}`, instead of `page.Resources.Font` |
| P2 | `extract.py` — `if '/FirstChar' not in fobj or '/Widths' not in fobj: continue` (skip `/Type0`; `pdftext.parse` already defaults a missing width to 0.5) |
| P3 | `figtext.py` — `if not runs: return []` in `group()`, `if not blocks: return []` in `merge_blocks()` |
| P4 | `emit-blocks.py` — spawn `str(HERE / 'extract.py')`, and stop discarding the child's stderr |
| P6 | `sources.py` — a configured-but-absent tree root REFUSES (or `load_trees` preflights every root in `editionPrecedence`); add the case to `test_sources.py` |
| P8 | **delete the blank-run filter from `emit-blocks.py`** — see the ruling below |

🔴 **P8 IS DECIDED BY MEASUREMENT. DELETE THE FILTER FROM `emit-blocks.py`; DO NOT ADD ONE TO `compose.py`.** Two independent figures, both arms, with per-glyph controls:
- Deleting emit's filter leaves `compose.py` **byte-identical**, the composed image **0 pixels** different, and strictly improves the paid wire — `"not consistent with"` instead of `"notconsistentwith"`, and it stops buying the untranslatable fragment `"addition of"` as a block. Corpus cost: **194 characters, 1.94 ISK.**
- Adding compose's filter moves block boundaries on **32 of 393** figures: one label splits into three, two of which flip `left`→`center` alignment; a length-realistic Icelandic map produces **overlapping text**; and it corrupts the `--control` oracle image.
- ⚠️ **A one-figure measurement gives the WRONG answer here.** `SciMethod` shows no boundary movement because all 3 of its blank runs sit in *arc* blocks, whose predicate is pure Euclidean distance. **188 of 243 blank-bearing blocks corpus-wide are non-arc.**
- ▶ **Then make it unrepeatable: put the key derivation in ONE function both scripts import.** ⚠️ **`census.py` is a THIRD consumer holding the emit-side view — move it too, or its counts will match neither script.**
- ⚠️ **If a filter is ever wanted again, the predicate must be `text == ''`, NEVER `not text.strip()`** — see the alpha item below.

🔴 **P5 — EPS IS NOT AN EDGE CASE; IT IS THE CORRECT ARTWORK.** The precedence-winning tree is **EPS-only for some chapters**, so the figures `pikepdf` cannot open are exactly the ones we are supposed to use. Convert first, in `figure-prepare.py` (Task 2):

```bash
gs -q -dNOPAUSE -dBATCH -dSAFER -dEPSCrop -sDEVICE=pdfwrite -sOutputFile=<out>/artwork-src.pdf <src>
```

gs 10.06.0 is installed; **7 of 7 real ch04 EPS convert in ~0.23 s each.**

- [ ] **Step 5: Commit the fixture.** `fixtures/make_fixture.py` regenerates `fixture_figure.pdf` byte-for-byte using **the standard library only** (raw PDF bytes, ~50 lines). A working generator is at `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/a14335b8-192d-4c29-9cc6-d2a67f9048b6/scratchpad/m5-verify/make_fixture.py`.

The fixture MUST contain, or the positive control is not a control:
- `/Resources /Font` with **explicit `/FirstChar` `/LastChar` `/Widths`** — reportlab supplies none in either path and `extract.py` dies with `AttributeError: /FirstChar`, so **the obvious recipe does not work**
- a `BT … /F1 n Tf … Tm … (text) Tj … ET` block
- one `TJ` array (the kerning branch) and one rotated `Tm` (the rot branch)
- one verbatim block such as `"100"`, so `looks_verbatim` holds it back and **`sendable != blocks`**
- a vector stroke **outside** `BT…ET`, so `strip-text.py`'s `re.sub(r'BT.*?ET','')` leaves artwork and `artwork.svg` is non-empty
- `/LastChar < 200`, so the subset warning fires

Measured end to end on this fixture: **4 blocks, 3 sendable, `artwork.svg` 397 bytes with the stroke intact.**

- [ ] **Step 6: Run and watch them pass.** Then the existing suites: `python3 test_sources.py && python3 test_figtext_normalise.py`.

- [ ] **Step 7: Write the CI sentence.** Add to this task's section of the repo docs, in writing: **the Python suite is NOT a CI gate — no workflow runs Python.** Name the hand-run command and its expected output. **Adding Python to CI is out of scope.** *(Without this sentence, a green CI reads as evidence the Python side passed.)*

- [ ] **Step 8: Commit**

```bash
git add experiments/figure-text-translation/
git commit -m "fix(M5 Task 0): repair the figure chain — it crashed on 23 of 30 ch04 figures"
```

---

### Task 0b: `--out` on the paid stage, and a `.env` that may be absent

🔴 **Spec Invariant 1 is unimplementable without this.** `translate-blocks.mjs` has no `--out`, rejects unknown flags, and reads/writes four hardcoded `HERE/out/…` paths — so **every figure in a chapter would translate from whichever figure was extracted last.** The old spec asserted the flag existed; the old plan said "unchanged CLI". Neither threaded isolation into the only stage that costs money.

**Files:** Modify `experiments/figure-text-translation/translate-blocks.mjs` · Test `tools/__tests__/figure-mt-glossary.test.js` (exists — extend it)

**Interfaces:** `--out <dir>` added to `KNOWN_FLAGS`; all four `out/` paths resolve against it, defaulting to `path.join(HERE, 'out')` when absent.

- [ ] **Step 1: Read the tool.** Confirm at HEAD: `KNOWN_FLAGS` (~:49), the read of `out/blocks.json` (~:190), the unguarded `.env` read (~:196), the writes of `out/api-run.json` (~:245) and `out/translations-api.json` (~:259), and the `out/meta.json` read via `figureNameFrom` (~:248).

- [ ] **Step 2: Write the failing test.** Unit-level, no subprocess, no `.env`, no shared `out/` — matching the 12 existing tests in that file, which run in 29 ms and touch none of those. Build a fixture dir under `os.tmpdir()` holding `blocks.json` + `meta.json`; drive the tool with `--book efnafraedi-2e --out <fixture>` and a **stub client that records every `opts` it is handed**. Assert:
  1. the fixture dir received `api-run.json` and `translations-api.json`, **and the shared `experiments/…/out/` was not written** — compare its **full inventory and mtimes**, not one filename;
  2. `--dry-run` exits **0** in a tree with no `.env` and no shared `out/`.

Both fail today: (1) with `Unknown argument: --out`, exit 2; (2) with an uncaught `ENOENT`.

- [ ] **Step 3: Run and watch it fail.**

- [ ] **Step 4: Implement**
- Add `'--out'` to `KNOWN_FLAGS`; add its branch to `parseFigureArgs`; compute `const outDir = args.out ?? path.join(HERE, 'out')` and use it at the four call sites. `figureNameFrom` already takes a path — only its argument changes.
- Replace the unguarded `fs.readFileSync(path.join(REPO, '.env'))` with **`loadEnvFile`**, already imported from `tools/api-translate.js` in this file and already pinned by `api-translate.test.js` to return `{}` for a missing path.
- Add a **missing-value check** to `parseFigureArgs`, so `--book --dry-run` refuses instead of swallowing `--dry-run` as the book name.

⚠️ **Do NOT use an env var here, and do NOT try cwd-per-figure.** `FIGTEXT_OUT` is right for Python (one line in `_deps.py` reaches all five importers) but wrong for Node: an env var has **no refusal machinery**, so a misspelled `FIGTEXT_OUTT=` writes silently to the shared directory — the exact silent-no-op class this tool's own docstring exists to close, on the paid leg. And cwd-per-figure is **refuted by execution**: `HERE` derives from `import.meta.url`, so cwd changes nothing. **Mixed mechanisms are correct: `--out` to Node, `FIGTEXT_OUT=` to Python.**

- [ ] **Step 5: Run and watch it pass.** Confirm the 12 existing tests still pass — all three `parseFigureArgs` assertions use `toMatchObject`, and no test asserts `KNOWN_FLAGS`'s contents, so nothing should break.

- [ ] **Step 6: Commit**

```bash
git add experiments/figure-text-translation/translate-blocks.mjs tools/__tests__/figure-mt-glossary.test.js
git commit -m "feat(M5 Task 0b): --out on the paid figure stage — isolation reaches the money"
```

---

### Task 1: Outcome vocabulary, safe tally, and the exit verdict

Pure, no I/O. It fixes the vocabulary every later task uses.

**Files:** Create `tools/lib/figure-outcomes.js` · Test `tools/__tests__/figure-outcomes.test.js`

**Interfaces:** `CLASSIFICATION_OUTCOMES`, `PROCESS_OUTCOMES`, `ALL_OUTCOMES`; `emptyTally()`; **`tallyOutcome(tally, outcome)`** (throws on an outcome outside the vocabulary); **`verdict(tally, enumeratedCount)`** → `{ok, reasons}`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import {
  CLASSIFICATION_OUTCOMES, PROCESS_OUTCOMES, ALL_OUTCOMES, emptyTally, tallyOutcome, verdict,
} from '../lib/figure-outcomes.js';

describe('figure outcome vocabulary', () => {
  it('keeps classification and process outcomes disjoint', () => {
    expect(CLASSIFICATION_OUTCOMES.filter((o) => PROCESS_OUTCOMES.includes(o))).toEqual([]);
    expect(ALL_OUTCOMES.length).toBe(CLASSIFICATION_OUTCOMES.length + PROCESS_OUTCOMES.length);
  });

  it('emptyTally has a zero for every outcome and nothing else', () => {
    const t = emptyTally();
    expect(Object.keys(t).sort()).toEqual([...ALL_OUTCOMES].sort());
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
  });
});

// 🔴 N1. Measured on the old plan's `tally[record.outcome] += 1`: an out-of-vocabulary or
// undefined outcome MINTS A NEW KEY HOLDING NaN, so 5 figures with 2 mis-bucketed summed to 3
// and the verdict still returned {ok:true}, exit 0.
describe('tallyOutcome refuses to lose a figure', () => {
  it('counts a known outcome', () => {
    const t = emptyTally();
    tallyOutcome(t, 'translated');
    expect(t.translated).toBe(1);
  });

  it('THROWS on an outcome outside the vocabulary', () => {
    expect(() => tallyOutcome(emptyTally(), 'nearly-translated')).toThrow(/vocabulary/i);
  });

  it('THROWS on undefined rather than minting a NaN key', () => {
    expect(() => tallyOutcome(emptyTally(), undefined)).toThrow();
  });
});

describe('verdict', () => {
  const sum = (t) => Object.values(t).reduce((a, b) => a + b, 0);

  it('is ok when work happened and nothing needs a human', () => {
    const t = { ...emptyTally(), translated: 5, 'copied-photo': 2 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  it('is NOT ok when any figure failed', () => {
    const t = { ...emptyTally(), translated: 5, 'failed-compose': 1 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toContain('failed-compose');
  });

  // 🔴 R9, [USER] 2026-09-06. 170 of 1,148 chemistry figures (14.8%) are unresolved in the
  // delivery TODAY, in every chapter. Failing on it made every run exit 1 by design.
  it('is ok when figures are unresolved — counted and named, never fatal', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 3 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  it('still REPORTS unresolved so the delivery hole stays visible', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 3 };
    expect(verdict(t, sum(t)).reasons.join(' ')).toMatch(/unresolved/);
  });

  // The spec's self-review caught this: a chapter of legitimate photographs translates zero
  // and is CORRECT. Failing it would train the operator to ignore the exit code.
  it('is ok when zero translated because nothing was translate-able', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'copied-textless': 3 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  it('is NOT ok when translate-able figures existed but none translated', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'failed-mt': 4 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/none .*translated|zero translated/i);
  });

  it('is ok on a run where everything was already current', () => {
    const t = { ...emptyTally(), 'skipped-current': 12 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  // 🔴 THE PARTITION IS CHECKED AT RUNTIME, NOT BY HAND AND NOT BY A SOURCE REGEX.
  it('is NOT ok when the tally does not sum to the figures enumerated', () => {
    const t = { ...emptyTally(), translated: 3 };
    const v = verdict(t, 5);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/partition|sum/i);
  });

  it('is ok when the tally sums exactly — the control for the case above', () => {
    const t = { ...emptyTally(), translated: 5 };
    expect(verdict(t, 5).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `npx vitest run tools/__tests__/figure-outcomes.test.js` → cannot resolve the import.

- [ ] **Step 3: Implement**

```js
// tools/lib/figure-outcomes.js
/**
 * The closed outcome vocabulary for a figure run, and the run's exit verdict.
 *
 * Two disjoint groups. A figure lands in EXACTLY ONE bucket, which is what makes the
 * partition check meaningful: the tally must sum to the number of figures enumerated.
 */

/** What the figure IS. */
export const CLASSIFICATION_OUTCOMES = [
  'translated', 'copied-photo', 'copied-textless', 'unresolved',
];

/** What HAPPENED to it. A translate-able figure that failed lands here, never in `translated`. */
export const PROCESS_OUTCOMES = [
  'failed-prepare', 'failed-mt', 'failed-compose', 'failed-publish', 'skipped-current',
];

export const ALL_OUTCOMES = [...CLASSIFICATION_OUTCOMES, ...PROCESS_OUTCOMES];

const FAILED = ['failed-prepare', 'failed-mt', 'failed-compose', 'failed-publish'];

export function emptyTally() {
  const t = {};
  for (const k of ALL_OUTCOMES) t[k] = 0;
  return t;
}

/**
 * 🔴 THE ONLY WAY A FIGURE MAY BE COUNTED. A bare `tally[outcome] += 1` mints a new key
 * holding NaN for an unknown or undefined outcome — the tally then stops summing to the
 * figure count and the run still reports ok. Refuse instead: a figure that falls out of
 * the partition is a figure nobody knows was missed.
 */
export function tallyOutcome(tally, outcome) {
  if (!ALL_OUTCOMES.includes(outcome)) {
    throw new Error(
      `Outcome ${JSON.stringify(outcome)} is not in the closed vocabulary: ${ALL_OUTCOMES.join(', ')}`
    );
  }
  tally[outcome] += 1;
  return tally;
}

/**
 * Decide the run's verdict. NOT "did it finish" — "does a human need to look?".
 * @param {Record<string, number>} tally
 * @param {number} enumeratedCount figures enumerated; the partition must sum to it
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function verdict(tally, enumeratedCount) {
  const reasons = [];
  for (const k of FAILED) if (tally[k] > 0) reasons.push(`${tally[k]} figure(s) ${k}`);

  // 🔴 R9 ([USER] 2026-09-06): unresolved is REPORTED, never fatal. 14.8% of chemistry's
  // figures are unresolved in the delivery today, so failing on it made every chapter run
  // exit 1 — the always-red exit code the spec argues against.
  if (tally.unresolved > 0) {
    reasons.push(
      `NOTE (not a failure): ${tally.unresolved} figure(s) unresolved — the artwork delivery has a hole here`
    );
  }

  // The predicate is deliberately NOT `translated === 0 && figures > 0`: a chapter whose
  // figures are legitimately ALL photographs translates zero and is correct.
  const attempted = tally.translated + FAILED.reduce((n, k) => n + tally[k], 0);
  if (attempted > 0 && tally.translated === 0) {
    reasons.push('zero translated although translate-able figures were found');
  }

  const summed = ALL_OUTCOMES.reduce((n, k) => n + tally[k], 0);
  const partitionOk = summed === enumeratedCount;
  if (!partitionOk) {
    reasons.push(`partition broken: outcomes sum to ${summed} but ${enumeratedCount} figure(s) were enumerated`);
  }

  // A NOTE must not fail the run; everything else must.
  const fatal = reasons.filter((r) => !r.startsWith('NOTE'));
  return { ok: fatal.length === 0, reasons };
}
```

- [ ] **Step 4: Run and watch it pass.**

- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-outcomes.js tools/__tests__/figure-outcomes.test.js
git commit -m "feat(M5 Task 1): the figure outcome vocabulary, a tally that cannot lose a figure, and the verdict"
```

---

### Task 2: `figure-prepare.py` — artwork to blocks, into `--out`

**Files:** Create `experiments/figure-text-translation/figure-prepare.py` · Test `experiments/figure-text-translation/test_figure_prepare.py`

**Interfaces:** `python3 figure-prepare.py <artwork-path> --out <dir>`; writes `<out>/blocks.json`, `artwork.png`, `artwork.svg`, `meta.json`, `runs.json`, and `prepare.json`:

```jsonc
{ "basename": str, "source": str, "blocks": int, "sendable": int,
  "artworkSvgPath": str|null, "imageXObjects": int, "paintOps": int, "warnings": [str] }
```

Exit 0 on success (**including zero blocks**), 1 on failure with `{"error": str, "warnings": []}` in `prepare.json`, 2 on a usage error.

🔴 **`imageXObjects` and `paintOps` are NOT optional extras — Task 3's classification cannot work without them.**

- [ ] **Step 1: Write the failing test — refusals AND a positive control**

🔴 **The old version of this task had three cases, all refusals, and a 12-line stub that refuses everything passed 5 of 5.** The positive control is the point of this step.

```python
def test_real_artwork_prepares():   # 🔴 THE POSITIVE CONTROL — without it this suite is vacuous
    with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as cwd:
        r = subprocess.run([sys.executable, str(HERE / 'figure-prepare.py'),
                            str(HERE / 'fixtures' / 'fixture_figure.pdf'), '--out', td],
                           capture_output=True, text=True, cwd=cwd)   # foreign cwd ON PURPOSE
        check('real artwork exits 0', r.returncode == 0, r.stderr[-400:])
        d = json.loads((pathlib.Path(td) / 'prepare.json').read_text())
        check('finds 4 blocks',   d['blocks'] == 4,   f"got {d.get('blocks')}")
        check('3 are sendable',   d['sendable'] == 3, f"got {d.get('sendable')}")
        svg = d.get('artworkSvgPath')
        check('artwork.svg exists and is non-empty',
              bool(svg) and pathlib.Path(svg).exists() and pathlib.Path(svg).stat().st_size > 0)
        check('subset-font warning surfaced', any('subset' in w.lower() for w in d['warnings']))
        check('reports paint ops', d['paintOps'] > 0)
```

Keep the refusal cases (missing artwork → exit 1 with an error in `prepare.json`; `--out` required → exit 2), and **replace the old isolation test**: it watched a single filename, `HERE/out/prepare.json`, which **no script in the tree ever writes**, so `before == after` was trivially true even if isolation failed completely. Compare the shared `out/`'s **full inventory and mtimes** instead.

Add: **a text-less vector exits 0 with `blocks == 0`** — that is `copied-textless`, and the old chain crashed on it.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement**

Wrap `emit-blocks.py` and `strip-text.py`, threading `FIGTEXT_OUT`. Specifics that were wrong or missing before:
- **Convert `.eps`/`.ai` to PDF first** with the `gs` invocation in Task 0.
- **Derive `warnings` from `<out>/meta.json`** — `[f for f, d in meta['fonts'].items() if d['last'] < 200]` — **not** by plumbing a child's stderr. Verified to reproduce `extract.py`'s own list exactly on the fixture (`['/F1']`) and on real chemistry artwork (`['/TT0','/TT1']`).
- **Count `imageXObjects` and `paintOps`** from the page. Measured cleanly separable on ch04: 0 images / 13–31 paint ops for line art versus 1–20 images / 0–4 paint ops for photographs.
- **`artworkSvgPath` must be non-null on success, or exit 1.** N2b: the old contract let prepare return 0 with `artworkSvgPath: null`, classification say `translated`, **the MT be paid**, and compose then fail on the missing input.
- Add the `--svg` branch to `strip-text.py` beside the existing `-png` call. *(`out/artwork.svg` had no producer — the file on disk was a hand-run `pdftocairo -svg`.)*
- Thread `FIGTEXT_OUT` in `_deps.py`. ⚠️ **`OUT = Path(os.environ.get('FIGTEXT_OUT') or (HERE / 'out'))`** — the old plan wrote `pathlib.Path(...)`, but `_deps.py` does `from pathlib import Path`, so `pathlib` is not in scope and that patch is a `NameError`.

- [ ] **Step 4: Run and watch it pass**, including the positive control.

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/
git commit -m "feat(M5 Task 2): figure-prepare.py — per-figure isolation, EPS, and a positive control that can fail"
```

---

### Task 3: Classification — moved AFTER prepare, because its discriminator is prepare's output

**Files:** Create `tools/lib/figure-classify.js` · Test `tools/__tests__/figure-classify.test.js`

**Interfaces:** `classifyFigure({ vectorPath, rasterPath, blocks, imageXObjects, paintOps })` → `{ outcome, sendable }`. `outcome` is the **intent**; the driver downgrades it to a `failed-*` if a later stage throws.

🔴 **THE OLD DISCRIMINATOR WAS WRONG IN THE DIRECTION THAT LOOKS RIGHT.** *"A photograph simply has no vector in the delivery"* is false — **OpenStax delivers photographs AS PDFs.** Measured: **167 of 178** figures across ch01–ch05 resolve to a vector, so a `copied-photo` bucket keyed on "has no vector" fires **once in 178**, and every photograph is fed to extraction as though it were line art.

- [ ] **Step 1: Write the failing test.** Keep the old cases (vector with sendable blocks → `translated`; all-unsendable → `copied-textless`; no blocks → `copied-textless`; raster-only → `copied-photo`; nothing → `unresolved`; vector wins over raster) and **add the two the old table could not express**:

```js
// 🔴 OpenStax ships photographs as PDFs. Without a content discriminator this figure —
// a wrapped bitmap with no text — was called `copied-textless`, and every photograph in
// the corpus with it. Measured separable on ch04: line art has paint ops and no image
// XObjects; a photograph is the mirror image.
it('calls a text-less vector that is a wrapped bitmap a PHOTO', () => {
  const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: null, blocks: [],
    imageXObjects: 3, paintOps: 0 });
  expect(r.outcome).toBe('copied-photo');
});

it('calls a text-less vector with paint operations LINE ART', () => {
  const r = classifyFigure({ vectorPath: '/a/x.pdf', rasterPath: null, blocks: [],
    imageXObjects: 0, paintOps: 22 });
  expect(r.outcome).toBe('copied-textless');
});
```

⚠️ **The table keys on `sendable`, not on `blocks`.** They disagree on 4 of 30 ch04 figures and `sendable` is right — sending `'\x00\x0b'` to a paid MT is the failure this prevents. *(The old spec's table said `blocks`; the code said `sendable`. The code was right, and the spec is now corrected.)*

- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.** A vector with ≥1 sendable block is `translated`. A vector with none splits on `imageXObjects > 0 && paintOps === 0` → `copied-photo`, else `copied-textless`. Raster-only → `copied-photo`. Nothing → `unresolved`.
  🔴 **Keep `copied-photo` and `unresolved` distinct** though they share a path: a photograph legitimately has no translatable text; a missing vector is a hole in the delivery, and **`unresolved` is the only number in the pipeline that looks at the delivery at all.**
- [ ] **Step 4: Run and watch it pass.**
- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-classify.js tools/__tests__/figure-classify.test.js
git commit -m "feat(M5 Task 3): classify from CONTENT — OpenStax ships photographs as PDFs"
```

---

### Task 4: `figure-compose.py` — compose with a verdict the driver can read

🔴 **THIS IS HALF OF §C137's HEADLINE.** `compose.py` **keeps the English** for any key it cannot match, reports it **only on stdout**, and exits **0**. The old wrapper read `returncode` and `stderr` and never read stdout. Composed with the missing `--out`: every figure tallied `translated`, English in the image, a green verdict, ~36 ISK for a chapter that produced nothing, and a sidecar asserting **another figure's** labels.

🔴 **AND THE OBVIOUS FIX IS DEFEATED: A CORRECT RUN ALSO PRINTS `!! N block(s) … ENGLISH KEPT`** — for the `send:false` verbatim blocks. **So the check must compare KEY SETS, never the warning's presence, and never a count** (a count cancels a swap).

**Files:** Create `experiments/figure-text-translation/figure-compose.py` · Modify `compose.py` · Test `test_figure_compose.py`

**Interfaces:** `python3 figure-compose.py --out <dir> --translations <path>`; writes `<out>/translated.svg` and `<out>/compose.json` = `{"outputPath": str}` or `{"error": str, "keys": [...]}`. Exit 0 / 1 / 2.
`compose.py` additionally writes `<out>/compose-report.json` = `{blocks: [...], missing: [...], translated: [...], translationsPath: str, control: bool}`.

- [ ] **Step 1: Write the failing test.** Keep the two refusal cases, and add the ones that matter:

```python
def test_a_missing_key_is_caught_even_though_compose_exits_zero():
    # blocks.json declares a send:true key that translations.json does not carry.
    # compose.py keeps the English, says so on STDOUT, and exits 0. The wrapper must REFUSE.
    ...
    check('wrapper exits 1', r.returncode == 1)
    d = json.loads((out / 'compose.json').read_text())
    check('names the offending key', 'Boiling point of water' in d.get('keys', []))

def test_a_CORRECT_run_with_send_false_blocks_still_passes():
    # 🔴 THE CONTROL THAT MAKES THE TEST ABOVE MEAN ANYTHING. A correct run prints the same
    # ENGLISH KEPT warning for verbatim blocks. A check keyed on the warning fails here.
    ...
    check('correct run exits 0', r.returncode == 0)
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement**

In `compose.py`: after the block loop, write `compose-report.json`. **Keep the existing stdout prints** — humans use them. Also treat an **empty/whitespace** normalised value on the `key in TR` branch as *missing*, which the code's own comment already claims and the code does not do.
⚠️ **Safe to change:** a repo-wide search for a programmatic invocation of `compose.py` finds none — every hit is a comment, a doc, or a test asserting the server does **not** run it.

In `figure-compose.py`:
1. **Validate inputs BEFORE invoking `compose.py`** — it writes `translated.png` before it reads `artwork.svg`, so a missing SVG otherwise crashes after a partial write.
2. After the subprocess, read `compose-report.json` and assert **two differently-anchored set equalities**:
   - `set(report.blocks) == {b.key for b in blocks.json}` — the derivation-agreement assertion; catches P8 recurring
   - `set(report.missing) == {b.key for b in blocks.json if not b.send}` — **SET equality, not count**
3. On either mismatch: write `{"error": …, "keys": [...]}` and return 1, **naming the offending keys**.

🔴 **Do NOT rely on `returncode`/`stderr`.** Measured: exit 0 and **0 bytes of stderr** for every failure mode, including a nonexistent `--translations` path.

- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/
git commit -m "feat(M5 Task 4): compose reports its own key set — the silent ENGLISH KEPT path closes"
```

---

### Task 5: Invert gate 1 — the figure MT leg must refuse WITH a glossary

**Files:** Modify `experiments/figure-text-translation/translate-blocks.mjs` · Test `tools/__tests__/figure-mt-glossary.test.js`

🔴 **THE OLD VERSION OF THIS TASK CANNOT BE PASTED, AND PATCHING IT WOULD PRESERVE A WRONG PREMISE.** Its replacement snippet used `glossaryTerms` and `runSource`, which appear **0 times** in the file; the `_source` string it assigned is an **inlined ternary**; its refusal format differs from every existing one; and **its test and its code were jointly unsatisfiable** — the test demanded exit 0 under `--book efnafraedi-2e`, while the gate refused whenever a glossary loaded, and that book loads one.

- [ ] **Step 1: Read the real code.** `resolveGlossaryOrRefuse({book, noGlossary})` (~:183) returning `{ok, glossary, termCount, code, message}`; the refusal print `  ✗ REFUSED (${resolved.code}): ${resolved.message}` (~:185); `translateOptsFor(resolved.glossary, b.english)` (~:220); the `_source` ternary (~:262). Note that **`--no-glossary` already implements the whole desired end-state** — it skips the file read, omits the field, nulls the record and sets the bare `_source`. **Only the DEFAULT and the refusal branch need to move.**

- [ ] **Step 2: Write the failing test.** Assert on the **wire payload**, not on stdout:

```js
it('sends NO glossary on the figure leg, whatever --book says ([USER] 2026-09-06, on §C133)', () => {
  // The gate INVERTS rather than disappears — deleting it would leave the paid figure leg
  // ungated, which is how this project has lost a guard before.
  // Drive with a STUB client that records opts; assert no recorded request carries
  // `glossaries`, and that at least one request was recorded (non-vacuity).
});
```

⚠️ **Delete the old Step-2 test `expect(res.stdout).toMatch(/no glossary/i)`.** The tool's bare-run stdout is `glossary: NONE — bare run, acknowledged with --no-glossary`, which that regex misses; the only string it matches is the `_source` **field**, written to a file a `--dry-run` never produces. **A test cannot observe a run record its own command does not write.**
⚠️ **Delete the old Step-3 expectation naming `Glossary: 1703 approved chemistry terms`.** A live glossary count in a plan document is forbidden by CLAUDE.md § One source of truth, drifts on the 2-hourly export, and was true only on a machine whose stale `out/` happened to hold 8 blocks.

- [ ] **Step 3: Run it and watch it fail.**

- [ ] **Step 4: Invert the gate — on the OUTCOME, not on a count.** Refuse if any block's `opts.glossaries` would be present. **Do not gate on `resolved.termCount`**: that makes `--book` a self-destruct flag, contradicting both the CLI contract (`--book` is required) and this task's own exit-0 test.

The rationale belongs in the code, because the next reader will wonder why a gate was inverted rather than deleted:

```js
// 🔴 GATE 1, INVERTED — [USER] 2026-09-06, on §C133's measurement that the glossary buys no
// terminology consistency (44.2 / 44.6 / 44.4% across three runs, inside the measure's own
// noise). The case is STRONGER for figures than for prose: figure text is labels and captions
// — short, fragmentary, often a single noun — which is exactly where a flat context-free map
// does its worst work, because there is no sentence to disambiguate against. And a wrong label
// is baked into an image rather than editable in the segment editor.
// This REPLACES the old "sends the glossary, or refuses" gate. It is not deleted: deleting it
// would leave the paid figure leg ungated.
```

- [ ] **Step 5: Run and watch it pass.** Then `node experiments/figure-text-translation/translate-blocks.mjs --book efnafraedi-2e --dry-run` → **exit 0**, a cost line, and no glossary on the wire.

- [ ] **Step 6: Commit**

```bash
git add experiments/figure-text-translation/translate-blocks.mjs tools/__tests__/figure-mt-glossary.test.js
git commit -m "feat(M5 Task 5): invert figure gate 1 — the MT leg refuses to carry a glossary"
```

---

### Task 6a: The driver, free half — enumerate, classify, preview. Writes nothing.

**Files:** Create `tools/figure-run.js`, `tools/lib/figure-enumerate.cjs` · Test `tools/__tests__/figure-run-free.test.js`

**Interfaces:** exports `parseCli`, `enumerateChapterFigures(bookSlug, chapter, opts)`, `isStale(sidecar)`, `normaliseTranslations(apiJson)` → `{blocks, dropped}`, `summarise(...)`. The CLI through `--dry-run`.

- [ ] **Step 1: Write the failing test.** Carry over the normaliser and staleness cases, and add or fix these:

```js
// ⚠️ RELABELLED, not new: an ARC block's value is written as a BARE STRING. `Array.isArray(v)
// ? v[0] : v` discriminates the two shapes exactly; a naive v[0] would yield 'S'. The old test
// called this "passes a bare string through unchanged" and never said it was the arc case.
it('passes an ARC block\'s bare string through unchanged', () => {
  expect(normaliseTranslations({ blocks: { A: 'Suðumark' } }).blocks).toEqual({ A: 'Suðumark' });
});

// 🔴 D9: an empty MT value must not vanish silently — English in the image, no review row.
it('REPORTS what it dropped rather than only returning survivors', () => {
  const r = normaliseTranslations({ blocks: { A: [''], B: ['ok'] } });
  expect(r.blocks).toEqual({ B: 'ok' });
  expect(r.dropped).toEqual(['A']);
});

// R7: enumeration is ALL images, and reviewability is reported alongside.
it('enumerates every image, and flags which ones the review panel can show', () => {
  const found = enumerateChapterFigures('efnafraedi-2e', 4);
  expect(found.length).toBeGreaterThan(0);                    // non-vacuity
  expect(new Set(found.map((f) => f.basename)).size).toBe(found.length);
  expect(found.every((f) => !f.basename.includes('/'))).toBe(true);
  expect(found.some((f) => f.reviewable)).toBe(true);         // both classes present,
  expect(found.some((f) => !f.reviewable)).toBe(true);        // or this proves nothing
});

// ⚠️ appendices are the -1 sentinel; Number('appendices') is NaN and chapterDir(NaN) is 'chNaN'.
it('accepts appendices as a chapter', () => { /* via cliChapterArg, not Number() */ });

// D6/§C83: a declared flag that nothing reads is worse than an absent one.
it('REFUSES when --figure matches nothing, instead of exiting 0 having done nothing', () => { ... });
it('REFUSES when --module names a file that does not exist', () => { ... });
it('REFUSES a valued flag whose value is missing or begins with --', () => { ... });

// D3: "already done" is derived from the hashes, never from a file existing.
it('treats a sidecar with no composedHash as NOT current — it was paid for but never published', () => {
  expect(isStale({ renderHash: 'aaa' })).toBe(true);
});

// Spec invariant 2.
it('a --dry-run leaves the working tree untouched', () => { /* git status before/after, + non-vacuity */ });

// 🔴 N1: the check the OLD test was named for but did not perform.
it('the summary asserts the partition at RUNTIME and fails when it does not sum', () => { ... });

// R7: the gap must be named, not just counted.
it('NAMES the translated figures the review panel cannot show', () => { ... });
```

⚠️ **Delete the old `describe('the outcome partition')` source-regex test.** It greps `figure-run.js` for `outcome: '<literal>'`, which is not the partition check, and is defeated by the idiomatic `` outcome: `failed-${stage}` `` form — measured: it sees only `["translated"]` and still passes `length > 0`. Keep a regex only as a *secondary* lint, with a non-vacuity control.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement.** Notes that are load-bearing:
- **Failure default first**: `process.exitCode = 1` as the first statement.
- **Strict `parseCli`** — reject unknown flags AND missing/`--`-prefixed values. Normalise `dry-run` → `dryRun`; the old skeleton read `args.dryRun`, which `parseCli` never set, so **any consumer written that way would have run LIVE**.
- **Enumerate through `tools/lib/figure-enumerate.cjs`**, consumed by both this ESM driver and the CJS `figureReviewService.js`, so the driver's idea of a figure and the review panel's cannot drift. Dual-consumer is the one legitimate `.cjs` reason in this repo, and that service already reaches into `tools/lib/` twice.
- Use **`TAG_ATTR_SPAN` from `tools/lib/cnxml-parser.js`, never `[^>]*`** — a raw `>` inside an attribute truncates the naive form silently.
- Use **`chapterDir()` from `server/lib/chapterLabel.js`** (the canonical `chNN` idiom; the MIT→AGPL edge is deliberate per the C1a rule) and **`cliChapterArg`** for the argument, not `Number()`.
- **Strip a `-[0-9a-f]{4}` suffix** from the CNXML-derived basename before declaring `unresolved` — otherwise a naming gap is reported as a delivery hole.
- **Count with `tallyOutcome`**, never `tally[x] += 1`.
- **PRE-FLIGHT, PURE:** check that an `image-mapping.json` entry exists *or could be minted* — no write. Organic has **0** entries, so without this every figure would be bought and then refused `unmapped`.
- **Label the mode in the summary.** A `--dry-run` summary must not be byte-identical to a successful live run.
- **`process.exitCode = v.ok ? 0 : 1` as the last statement.** Never `process.exit()`.
- **Remove `tmpRoot`** at the end — `/tmp` here is a ~4.9 GB tmpfs that runs >90% full.

- [ ] **Step 4: Run the unit tests.**
- [ ] **Step 5: The free corpus check.**

```bash
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --dry-run > /tmp/m5-ch04.txt 2>&1; echo "exit=$?"; cat /tmp/m5-ch04.txt
```

**Acceptance, and it costs 0 ISK:** `failed-prepare = 0`, the tally sums to **30**, and the expected shape is **13 translated / 16 copied-* / 1 copied-photo / 0 unresolved**. The driver asserts the sum itself; do not verify it by hand.

- [ ] **Step 6: Commit**

```bash
git add tools/figure-run.js tools/lib/figure-enumerate.cjs tools/__tests__/figure-run-free.test.js
git commit -m "feat(M5 Task 6a): the figure driver's free half — enumerate, classify, preview, and assert the partition"
```

---

### Task 6b: The driver, paid half — spend, record, compose, publish

🔴 **THIS IS THE ONLY TASK THAT CAN SPEND MONEY.** Two per-figure paths, **selected by whether a sidecar exists — not by a flag**.

**Files:** Modify `tools/figure-run.js` · Test `tools/__tests__/figure-run-paid.test.js`

- [ ] **Step 1: Write the failing test.** With a stub MT and a stub publisher, assert:

```js
// 🔴 N2 — THE PURCHASE IS RECORDED BEFORE ANYTHING THAT CAN FAIL AFTER IT.
it('writes the sidecar as soon as the MT returns, even when the post-MT check then FAILS', () => {
  // A 7-of-8 return must land in a failure bucket AND leave all 7 translations on disk.
  // Without this, adopting Task 4's check converts a new DETECTION into a new LOSS.
});

// 🔴 D3 — a figure whose publish is refused must not be reported done, ever.
it('a refused publish leaves no composedHash, lands in failed-publish, and is NOT skipped-current next run', () => { ... });

it('buckets a THROW from publish as failed-publish', () => {
  // fs.copyFileSync is unguarded and throws past every refusal — proven with EACCES.
});

// 🔴 D5/R8 — the single biggest spend change.
it('spends NOTHING on --stale: recomposes from the sidecar\'s own blocks', () => {
  expect(stubMt.calls).toBe(0);   // not "called with --dry-run" — not called
});

it('spends NOTHING on --force either', () => { expect(stubMt.calls).toBe(0); });

it('does not overwrite an editor\'s corrected text with a fresh machine translation', () => { ... });

// R8: the only spendable figure is one with no sidecar.
it('spends only on a figure with NO sidecar', () => { ... });

// D3: the two hash fields travel in opposite directions.
it('carries composedHash forward on a recompose and never carries state forward', () => { ... });

// D4: unmapped must be unreachable after money has been spent.
it('refuses an unmintable figure BEFORE the MT is called', () => { expect(stubMt.calls).toBe(0); });

// The minted payload — measured, not chosen.
it('mints renderHash and NO state, so the figure reads mt-preview and publish can stamp', () => { ... });
```

- [ ] **Step 2: Run and watch them fail.**

- [ ] **Step 3: Implement — the order is the fix.**

```
 5. PRE-FLIGHT   mapping entry exists or is mintable?          PURE, no write
 6. translate    ONLY if no sidecar (R8). --out T/<basename>   ← the only paid step
 7. SIDECAR      writeSidecar(...) IMMEDIATELY, and REGARDLESS of step 8's verdict
 8. verify       compare key SETS both ways → decides the BUCKET, never the record
 9. compose      figure-compose.py, from sidecar.blocks
10. mint+publish mapping entry (tmp+rename), then publish → stamps composedHash
```

- **Recompose path** (`--stale`, `--force`, or any figure that already has a sidecar): prepare (free) → compose from `sidecar.blocks` → publish. **Zero MT spawns.** Do not rewrite `state`/`renderHash` if `blocks` did not change; just recompose and let the publisher stamp.
- **Mint the mapping entry in the driver**, importing `DEFAULT_SUFFIX` and `mergeMapping` from `tools/generate-image-mapping.js`, taking the extension from `path.extname()` of the composer's output, gating on the basename being in the source-image index, and writing tmp+rename.
  🔴 **REJECT the option a reader of §C137 will reach for first: "run `generate-image-mapping.js` before publish".** **Proved a no-op** — with `media/` empty it mints **0** entries, because it derives them from files already on disk. It helps only figures that need no help, and throws outright on `lifraen-efnafraedi`, which has no `media/` at all.
- **Wrap `publishFigureSvg` in try/catch** — it has three outcomes, not two.
- **Add `tools/figure-run.js` to `tools/__tests__/source-write-guard.test.js`'s ALLOW set** as a writer of `books/<slug>/media/image-mapping.json`.
- **Update the comment at `publish-figure-svg.js` (~:169-172)**, which this change falsifies: a driver-minted sidecar *does* carry a `renderHash`, so the "ordinary case" it describes is no longer ordinary.

- [ ] **Step 4: Run the unit tests.**
- [ ] **Step 5: Run the whole suite.** `npm test` from the repo root. **Compare the failing set by NAME against `main`'s floor, both directions** — a count alone hides a swap. ⚠️ `npm test | tail` reports the pipe's exit code; do not read it as the suite's.
- [ ] **Step 6: Commit**

```bash
git add tools/figure-run.js tools/__tests__/figure-run-paid.test.js tools/publish-figure-svg.js tools/__tests__/source-write-guard.test.js
git commit -m "feat(M5 Task 6b): the paid half — the purchase is recorded before anything that can fail after it"
```

---

## After the plan

**Do NOT run a paid figure translation as part of implementation.** The first live run is a separate, **[USER]-authorised** step, preceded by `--dry-run` on the target chapter. Task 6a's acceptance check is free and is the evidence that the chapter is ready.

**Known limitations this plan deliberately does NOT close** — each is in the spec's Open items with its measured consequence:
- **A Greek letter is being treated as whitespace.** `/Differences [31, /uni03B1]` means `\x1f` IS alpha, and `'\x1f'.isspace()` is True. `pdftext.parse` never applies `/Encoding /Differences` at all, so alpha reaches the wire raw and composes as a missing glyph. **Pre-existing, arm-independent, and it degrades every Greek-bearing chemistry figure M5 translates.** → needs its own [CODE] item.
- **Widening the review surface to non-figure media (R7)** — three legs, not a filter: the 12 ch04 images have no node in `02-structure` at all.
- **`books/<slug>/media/` and `figure-text/` have no permission class**, and this plan adds a third automated writer to `media/`.
- **170 of 1,148 chemistry figures are unresolved in the artwork delivery** — R9 makes it reportable, not fixed.
