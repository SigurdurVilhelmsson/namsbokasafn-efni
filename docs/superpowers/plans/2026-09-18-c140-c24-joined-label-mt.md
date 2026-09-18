# §C140 ㉔ — figure-label MT per label AND joined — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**BANNER — written 2026-09-18.** This plan owns the HOW. It owns **no status**: whether ㉔ is
built, merged or deployed lives in the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`)
⏩ RESUME. If they disagree, the register wins.

**Goal:** Send every multi-label figure's labels to Málstaður both per label and newline-joined, keep the joined wording unless a guard rejects it, and show every disagreement to the editor as a one-click alternative.

**Architecture:** The joined arm and its guards live in the one paid tool, `experiments/figure-text-translation/translate-blocks.mjs`, as pure exported helpers plus a second request inside `main`. The result rides `translations-api.json` → `tools/figure-run.js` → the sidecar (new optional fields outside `renderHash`) → `server/services/figureReviewService.js` → the existing warning slot in the review panel.

**Tech Stack:** Node 22 ESM (`tools/`, `experiments/`), CommonJS (`server/`, `tools/lib/*.cjs`), Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-18-c140-c24-joined-label-mt-design.md`](../specs/2026-09-18-c140-c24-joined-label-mt-design.md) — read it first; this plan argues from it. The ruling it implements: [`docs/decisions/2026-09-15-figure-label-mt-joined-and-per-label.md`](../../decisions/2026-09-15-figure-label-mt-joined-and-per-label.md).

## Global Constraints

- **0 ISK.** Every test injects a stub client into `main` (`createClient` + `estimateIsk`, both or neither). **No task runs a paid request.** Never run `translate-blocks.mjs` or `figure-run.js` without `--dry-run` outside a test.
- **Both arms stay bare** — no `glossaries` field on any request (§C133). The pre-flight invariant must cover the joined request.
- **`renderHash`, `COMPOSER_VERSION`, `SIDECAR_VERSION`, `blocks.json`, `compose.py`: unchanged.**
- **Branch:** `feat/c140-c24-joined-label-mt` (exists; carries the ruling `70fabbcaf` and the spec).
- **Run tests from the repo root.** `npm test` is `vitest run`; E2E is `cd server && npm run test:e2e` (a separate CI job). `npm run lint` and `npm run format:check` are separate CI gates.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Grep with `-a`** (committed files hold NUL bytes — CLAUDE.md).
- **Mutation testing:** `cp` the file to a golden copy BEFORE the first mutation, restore from it, `cmp` after every round and at the end; `git status --porcelain` whenever an agent that mutates files goes quiet.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `experiments/figure-text-translation/translate-blocks.mjs` | modify | new pure exports `formulaGuard`, `splitJoined`, `selectWording`, `joinable`, `wireChars`; joined arm in `main`; header rationale superseded |
| `tools/__tests__/figure-mt-joined.test.js` | create | unit tests of the pure helpers + `main` with a stub client |
| `tools/__tests__/figure-mt-duplicate-keys.test.js` | modify | per-line stub; expectations gain the joined request |
| `tools/figure-run.js` | modify | `billableFrom` uses `wireChars`; `normaliseTranslations` carries `alternatives`/`mtJoined`; minted sidecar carries them |
| `tools/__tests__/figure-run-free.test.js` | modify | billable size of a two-label figure; normalise shape |
| `tools/__tests__/figure-run-paid.test.js` | modify | fake translate stage can write alternatives; sidecar carries them |
| `tools/lib/figure-consistency.cjs` | modify | `mtAlternativeWarnings`, `mtFigureWarning` |
| `tools/__tests__/figure-consistency.test.js` | modify | tests for both |
| `server/services/figureReviewService.js` | modify | carry-forward in `applyApprovedFigureEdits`; `buildFigurePayload` 5th param |
| `server/routes/segment-editor.js` | modify | pass the sidecar's MT info to `buildFigurePayload` |
| `server/__tests__/figureReviewService.test.js`, `server/__tests__/figureReviewRoutes.test.js` | modify | carry-forward + payload tests |
| `server/public/js/segment-editor.js` | modify | render `warnings.mt` (with **Nota**) and `warnings.mtFigure` |
| `books/__e2e-fixture__/figure-text/CNX_Chem_01_01_WaterDom.is.json` | create | a fixture sidecar carrying an alternative |
| `server/e2e/figure-review.spec.js` | modify | fourth figure; apply-the-alternative test |

---

### Task 1: The pure helpers — guard, split, selection, wire size

**Files:**
- Modify: `experiments/figure-text-translation/translate-blocks.mjs` (add exports after `dedupeSendBlocks`)
- Create: `tools/__tests__/figure-mt-joined.test.js`

**Interfaces:**
- Produces:
  - `formulaGuard(english: string, icelandic: string): string[]` — reasons, `[]` = passes. Reasons: `'digits'`, `'subsup'`, `` `formula:${token}` ``.
  - `splitJoined(reply: string, n: number): {ok: true, lines: string[]} | {ok: false, got: number}`
  - `selectWording(english: string, perLabel: string, joinedLine: string): {text: string, alt: null | {kept: 'joined'|'per-label', other?: string, reason: 'disagree'|'formula'|'empty'}, rejected?: {text: string, damage: string[]}}`
  - `joinable(send: Array<{english: string}>): boolean` — ≥ 2 labels and none contains `\n`
  - `wireChars(send: Array<{english: string}>): {perLabel: number, joined: number, total: number}`

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/figure-mt-joined.test.js`:

```js
/**
 * §C140 ㉔ — the joined figure-label arm ([USER] ruling 2026-09-15, spec
 * docs/superpowers/specs/2026-09-18-c140-c24-joined-label-mt-design.md).
 *
 * ⚠️ NO NETWORK, EVER — `main` takes its API pair as a parameter and every test injects a stub.
 * ⚠️ Lives in `tools/__tests__/` though the module is in `experiments/`, for the reason
 * `figure-mt-glossary.test.js` states.
 */
import { describe, it, expect } from 'vitest';
import {
  formulaGuard,
  splitJoined,
  selectWording,
  joinable,
  wireChars,
} from '../../experiments/figure-text-translation/translate-blocks.mjs';

describe('formulaGuard — measured 0/501 on the 2026-09-15 answers', () => {
  it('passes the decimal comma: separators are ignored, digits are not', () => {
    expect(formulaGuard('formed by the reaction of 12.85 g of', 'myndað við hvarf 12,85 g af')).toEqual([]);
  });
  it('passes the ruled mol → mól localisation (not a formula token)', () => {
    expect(formulaGuard('Multiply by Avogadro’s number (mol–1)', 'Margfaldið með tölu Avogadros (mól–1)')).toEqual([]);
  });
  it('passes a formula kept verbatim', () => {
    expect(formulaGuard('required to react with H2O', 'sem þarf til að hvarfast við H2O')).toEqual([]);
  });
  it('fires on a transposed digit', () => {
    expect(formulaGuard('12.85 g', '12,58 g')).toContain('digits');
  });
  it('fires on a dropped digit', () => {
    expect(formulaGuard('9.55 g of', '9,5 g af')).toContain('digits');
  });
  it('fires on a new subscript — the alt-probe damage — and a subscript is NOT the digit 2', () => {
    const why = formulaGuard('H2O', 'H₂O');
    expect(why).toContain('subsup');
    expect(why).toContain('digits'); // `\d` is ASCII-only in JS: ₂ does not count as 2
    expect(why).toContain('formula:H2O');
  });
  it('fires on a formula token that did not survive verbatim', () => {
    expect(formulaGuard('NaCl solution', 'Natríumklóríðlausn')).toContain('formula:NaCl');
  });
  it('does not treat an ordinary capitalised word as a formula', () => {
    expect(formulaGuard('Element', 'Frumefni')).toEqual([]);
  });
  it('allows a sub/superscript the English already carried', () => {
    expect(formulaGuard('cm³', 'cm³')).toEqual([]);
  });
});

describe('splitJoined', () => {
  it('splits into exactly n trimmed lines', () => {
    expect(splitJoined('Frumefni\n Fjöldi \n', 2)).toEqual({ ok: true, lines: ['Frumefni', 'Fjöldi'] });
  });
  it('tolerates CRLF', () => {
    expect(splitJoined('A\r\nB', 2)).toEqual({ ok: true, lines: ['A', 'B'] });
  });
  it('refuses one line too few', () => {
    expect(splitJoined('A B', 2)).toEqual({ ok: false, got: 1 });
  });
  it('refuses one line too many', () => {
    expect(splitJoined('A\nB\nC', 2)).toEqual({ ok: false, got: 3 });
  });
  it('refuses an empty reply without throwing', () => {
    expect(splitJoined('', 2)).toEqual({ ok: false, got: 1 });
    expect(splitJoined(undefined, 2)).toEqual({ ok: false, got: 1 });
  });
});

describe('selectWording', () => {
  it('agreement: keeps the wording, records nothing', () => {
    expect(selectWording('Quantity', 'Fjöldi', 'Fjöldi')).toEqual({ text: 'Fjöldi', alt: null });
  });
  it('disagreement: keeps JOINED and offers per-label', () => {
    expect(selectWording('Element', 'Þáttur', 'Frumefni')).toEqual({
      text: 'Frumefni',
      alt: { kept: 'joined', other: 'Þáttur', reason: 'disagree' },
    });
  });
  it('formula damage: keeps PER-LABEL, offers nothing, records the rejected text', () => {
    const r = selectWording('H2O', 'H2O', 'H₂O');
    expect(r.text).toBe('H2O');
    expect(r.alt).toEqual({ kept: 'per-label', reason: 'formula' });
    expect(r.alt.other).toBeUndefined();
    expect(r.rejected.text).toBe('H₂O');
  });
  it('empty joined line: falls back to per-label with reason empty', () => {
    expect(selectWording('Element', 'Þáttur', '')).toEqual({
      text: 'Þáttur',
      alt: { kept: 'per-label', reason: 'empty' },
    });
  });
  it('empty per-label: keeps joined and never offers an empty suggestion', () => {
    expect(selectWording('Element', '', 'Frumefni')).toEqual({ text: 'Frumefni', alt: null });
  });
  it('both empty: empty text, no alternative (the dropped path handles it)', () => {
    expect(selectWording('Element', '', '')).toEqual({ text: '', alt: null });
  });
});

describe('joinable and wireChars — the one owner of what a figure is billed for', () => {
  const b = (english) => ({ key: english, english });
  it('a single label is not joinable and buys no joined request', () => {
    expect(joinable([b('Water')])).toBe(false);
    expect(wireChars([b('Water')])).toEqual({ perLabel: 5, joined: 0, total: 5 });
  });
  it('two labels: joined = both + one newline', () => {
    expect(joinable([b('Oxygen gas'), b('Water')])).toBe(true);
    expect(wireChars([b('Oxygen gas'), b('Water')])).toEqual({ perLabel: 15, joined: 16, total: 31 });
  });
  it('a label containing a newline makes the figure unjoinable — nothing billed for it', () => {
    const send = [b('A\nB'), b('C')];
    expect(joinable(send)).toBe(false);
    expect(wireChars(send).joined).toBe(0);
  });
  it('an empty plan is zero, without throwing', () => {
    expect(wireChars([])).toEqual({ perLabel: 0, joined: 0, total: 0 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tools/__tests__/figure-mt-joined.test.js`
Expected: FAIL — `formulaGuard` (etc.) is not exported / `is not a function`.

- [ ] **Step 3: Implement**

In `translate-blocks.mjs`, directly after `dedupeSendBlocks`:

```js
/**
 * §C140 ㉔ — Unicode sub/superscript characters: U+2070–U+209F plus Latin-1 ¹ ² ³. The 2026-09-15
 * alt-text probe saw the MT rewrite formula digits as these.
 */
const SUBSUP = /[⁰-₟²³¹]/g;

/**
 * A formula-like token: two or more element-symbol capitals (`NaCl`, `CO2`), or one symbol followed
 * by digits (`H2`). An ordinary capitalised word (`Element`) matches neither alternative.
 */
const FORMULA_TOKEN = /\b(?:[A-Z][a-z]?\d*){2,}\b|\b[A-Z][a-z]?\d+\b/g;

/**
 * Does `icelandic` alter a formula, digit or symbol relative to `english`? Returns the reasons,
 * `[]` meaning it passes.
 *
 * 🔴 MEASURED, NOT CHOSEN (spec §2). The experiment's own verbatim-token predicate fired on 4
 * labels in EVERY arm — all correct Icelandic (`12.85 → 12,85`, `mol → mól`) — so it would have
 * rejected correct joined answers and fallen back to a per-label answer with the same "defect".
 * This one fires on 0 of 501 real answers (169 per-label, 166 + 166 joined) and on all three
 * damage shapes in the controls.
 *
 * ⚠️ `\D` / `\d` are ASCII-only in JavaScript, with or without the `u` flag. That is REQUIRED
 * here: a subscript `₂` must not count as the digit `2`, or `H2O → H₂O` would pass leg 1.
 *
 * @param {string} english
 * @param {string} icelandic
 * @returns {string[]}
 */
export function formulaGuard(english, icelandic) {
  const why = [];
  if (english.replace(/\D/g, '') !== icelandic.replace(/\D/g, '')) why.push('digits');
  const subsup = (s) => (s.match(SUBSUP) || []).length;
  if (subsup(icelandic) > subsup(english)) why.push('subsup');
  for (const token of english.match(FORMULA_TOKEN) || []) {
    if (!icelandic.includes(token)) why.push(`formula:${token}`);
  }
  return why;
}

/**
 * Split a joined reply back into its labels. Anything but exactly `n` lines is a refusal: the
 * model has merged, split or restructured the payload (§C118 measured it doing so), and there is
 * then no sound way to say which line belongs to which label.
 *
 * @param {string} reply
 * @param {number} n  the label count sent
 * @returns {{ok: true, lines: string[]} | {ok: false, got: number}}
 */
export function splitJoined(reply, n) {
  const lines = String(reply ?? '')
    .trim()
    .split('\n')
    .map((l) => l.trim());
  return lines.length === n ? { ok: true, lines } : { ok: false, got: lines.length };
}

/**
 * Choose one label's wording from its two answers ([USER] 2026-09-15: keep the joined wording,
 * flag every disagreement).
 *
 * ⚠️ A REJECTED JOINED WORDING IS NEVER OFFERED AS AN ALTERNATIVE — offering it in the panel would
 * invite exactly the damage the guard exists to stop. It is returned as `rejected` for the run
 * log only. And an EMPTY per-label answer is never offered either: a one-click "apply nothing"
 * is not a suggestion.
 *
 * @param {string} english
 * @param {string} perLabel
 * @param {string} joinedLine
 * @returns {{text: string, alt: object|null, rejected?: {text: string, damage: string[]}}}
 */
export function selectWording(english, perLabel, joinedLine) {
  const p = (perLabel ?? '').trim();
  const j = (joinedLine ?? '').trim();
  if (j === '') {
    return p === '' ? { text: '', alt: null } : { text: p, alt: { kept: 'per-label', reason: 'empty' } };
  }
  const damage = formulaGuard(english, j);
  if (damage.length > 0) {
    return { text: p, alt: { kept: 'per-label', reason: 'formula' }, rejected: { text: j, damage } };
  }
  if (p === '' || p === j) return { text: j, alt: null };
  return { text: j, alt: { kept: 'joined', other: p, reason: 'disagree' } };
}

/**
 * Is this figure sent joined at all? Needs ≥ 2 labels (one label joined is the per-label request
 * again — pure waste) and no label containing a newline (it could not split back). Checked BEFORE
 * the request, so no money is spent on a payload that cannot be used.
 *
 * @param {Array<{english: string}>} send  the deduped send blocks
 */
export function joinable(send) {
  return send.length >= 2 && !send.some((b) => b.english.includes('\n'));
}

/**
 * 🔴 THE ONE DEFINITION OF WHAT A FIGURE'S RUN IS BILLED FOR (spec §4.3). `main`'s plan line and
 * `tools/figure-run.js`'s `billableFrom` both call this; a second sum anywhere is how ⑦'s dry-run
 * would silently under-report a ㉔ run by about half.
 *
 * @param {Array<{english: string}>} send  the deduped send blocks
 * @returns {{perLabel: number, joined: number, total: number}}
 */
export function wireChars(send) {
  const perLabel = send.reduce((n, b) => n + b.english.length, 0);
  const joined = joinable(send) ? perLabel + send.length - 1 : 0;
  return { perLabel, joined, total: perLabel + joined };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tools/__tests__/figure-mt-joined.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add experiments/figure-text-translation/translate-blocks.mjs tools/__tests__/figure-mt-joined.test.js
git commit -m "feat(figures): §C140 ㉔ — pure guard, split, selection and wire-size helpers for the joined label arm, 0 ISK

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The joined arm inside `main`

**Files:**
- Modify: `experiments/figure-text-translation/translate-blocks.mjs` (`main`, file header)
- Modify: `tools/__tests__/figure-mt-joined.test.js` (append)
- Modify: `tools/__tests__/figure-mt-duplicate-keys.test.js`

**Interfaces:**
- Consumes: Task 1's five helpers.
- Produces: `translations-api.json` = `{_source, blocks, alternatives: {[key]: alt}, mtJoined: {status: 'ok'|'single-label'|'split-failed'|'skipped-newline', labels: number, lines?: number}}`. `blocks` keeps today's shape (arc → string, else one-element array) and holds the KEPT wording. The plan line's first line stays `  <N> blocks, <C> chars, est <X> ISK` with `C = wireChars(send).total` (a `figure-run-free` test parses it).

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/figure-mt-joined.test.js` (and add `main` to its import list, plus `import fs from 'fs'; import os from 'os'; import path from 'path'; import { beforeEach, afterEach } from 'vitest';`):

```js
const block = (key, english, extra = {}) => ({
  key,
  english,
  lines: english.split(' '),
  arc: false,
  send: true,
  ...extra,
});

function fixtureOut(blocks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figjoin-'));
  fs.writeFileSync(path.join(dir, 'blocks.json'), JSON.stringify(blocks));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ source: '/nowhere/JOIN_FIG.pdf' }));
  return dir;
}

/**
 * A stub whose per-label and joined answers are scripted separately, keyed on the EXACT text
 * sent. An unscripted text throws: a test must never pass because the stub invented an answer.
 */
function scriptedStub(seen, answers) {
  return {
    translate: async (text, opts) => {
      seen.push({ text, opts });
      if (!(text in answers)) throw new Error(`unscripted request: ${JSON.stringify(text)}`);
      return { text: answers[text] };
    },
    getUsage: () => ({ requests: seen.length }),
  };
}

const runWith = (dir, seen, answers, extraArgs = []) =>
  main(['--book', 'efnafraedi-2e', '--out', dir, ...extraArgs], {
    createClient: () => scriptedStub(seen, answers),
    estimateIsk: (c) => c / 100,
    envPath: path.join(dir, 'absent.env'),
  });

const readTrans = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'translations-api.json'), 'utf-8'));

describe('main — the joined arm', () => {
  let realLog;
  let savedExitCode;
  beforeEach(() => {
    realLog = console.log;
    console.log = () => {};
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });
  afterEach(() => {
    console.log = realLog;
    process.exitCode = savedExitCode;
  });

  it('keeps the joined wording and records the per-label one as the alternative', async () => {
    const dir = fixtureOut([block('Element', 'Element'), block('Quantity', 'Quantity')]);
    const seen = [];
    await runWith(dir, seen, {
      Element: 'Þáttur',
      Quantity: 'Fjöldi',
      'Element\nQuantity': 'Frumefni\nFjöldi',
    });
    expect(process.exitCode).toBeUndefined();
    expect(seen.map((s) => s.text)).toEqual(['Element', 'Quantity', 'Element\nQuantity']);
    const t = readTrans(dir);
    expect(t.blocks).toEqual({ Element: ['Frumefni'], Quantity: ['Fjöldi'] });
    expect(t.alternatives).toEqual({
      Element: { kept: 'joined', other: 'Þáttur', reason: 'disagree' },
    });
    expect(t.mtJoined).toEqual({ status: 'ok', labels: 2 });
  });

  it('agreement on every label writes no alternatives (the control)', async () => {
    const dir = fixtureOut([block('A', 'A'), block('B', 'B')]);
    const seen = [];
    await runWith(dir, seen, { A: 'a', B: 'b', 'A\nB': 'a\nb' });
    const t = readTrans(dir);
    expect(t.blocks).toEqual({ A: ['a'], B: ['b'] });
    expect(t.alternatives).toEqual({});
  });

  it('a reply that does not split back keeps EVERY per-label answer and says why', async () => {
    const dir = fixtureOut([block('A', 'A'), block('B', 'B')]);
    const seen = [];
    await runWith(dir, seen, { A: 'a', B: 'b', 'A\nB': 'a og b' });
    const t = readTrans(dir);
    expect(t.blocks).toEqual({ A: ['a'], B: ['b'] });
    expect(t.alternatives).toEqual({});
    expect(t.mtJoined).toEqual({ status: 'split-failed', labels: 2, lines: 1 });
  });

  it('a formula-damaged joined line keeps that label per-label, and only that label', async () => {
    const dir = fixtureOut([block('H2O', 'H2O'), block('Element', 'Element')]);
    const seen = [];
    await runWith(dir, seen, {
      H2O: 'H2O',
      Element: 'Þáttur',
      'H2O\nElement': 'H₂O\nFrumefni',
    });
    const t = readTrans(dir);
    expect(t.blocks).toEqual({ H2O: ['H2O'], Element: ['Frumefni'] });
    expect(t.alternatives.H2O).toEqual({ kept: 'per-label', reason: 'formula' });
    expect(t.alternatives.Element).toEqual({ kept: 'joined', other: 'Þáttur', reason: 'disagree' });
  });

  it('a single-label figure makes exactly ONE request', async () => {
    const dir = fixtureOut([block('Water', 'Water')]);
    const seen = [];
    await runWith(dir, seen, { Water: 'Vatn' });
    expect(seen.map((s) => s.text)).toEqual(['Water']);
    expect(readTrans(dir).mtJoined).toEqual({ status: 'single-label', labels: 1 });
  });

  it('a label containing a newline: the joined request is NEVER SENT', async () => {
    const dir = fixtureOut([block('A', 'A\nB'), block('C', 'C')]);
    const seen = [];
    await runWith(dir, seen, { 'A\nB': 'a b', C: 'c' });
    expect(seen.map((s) => s.text)).toEqual(['A\nB', 'C']); // no third, joined request
    expect(readTrans(dir).mtJoined).toEqual({ status: 'skipped-newline', labels: 2 });
  });

  it('keeps the arc shape: an arc block is a bare string, as before', async () => {
    const dir = fixtureOut([block('NaCl', 'NaCl', { arc: true }), block('Salt', 'Salt')]);
    const seen = [];
    await runWith(dir, seen, { NaCl: 'NaCl', Salt: 'Salt', 'NaCl\nSalt': 'NaCl\nSalt' });
    expect(readTrans(dir).blocks).toEqual({ NaCl: 'NaCl', Salt: ['Salt'] });
  });

  it('sends no glossary on the joined request either', async () => {
    const dir = fixtureOut([block('A', 'A'), block('B', 'B')]);
    const seen = [];
    await runWith(dir, seen, { A: 'a', B: 'b', 'A\nB': 'a\nb' });
    expect(seen.filter((s) => 'glossaries' in s.opts)).toEqual([]);
    expect(seen.every((s) => s.opts.targetLanguage === 'is')).toBe(true);
  });

  it('--dry-run prices both arms, first line parseable as before', async () => {
    const dir = fixtureOut([block('Oxygen gas', 'Oxygen gas'), block('Water', 'Water')]);
    const logs = [];
    console.log = (m) => logs.push(String(m));
    await main(['--book', 'efnafraedi-2e', '--out', dir, '--dry-run'], {
      createClient: () => {
        throw new Error('no client under --dry-run');
      },
      estimateIsk: (c) => c / 100,
      envPath: path.join(dir, 'absent.env'),
    });
    expect(logs.some((l) => /^\s+2 blocks, 31 chars, est 0\.31 ISK/.test(l))).toBe(true);
    expect(logs.some((l) => /per-label 15 \+ joined 16 chars/.test(l))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'translations-api.json'))).toBe(false);
  });

  it('records both arms in api-run.json', async () => {
    const dir = fixtureOut([block('Element', 'Element'), block('Quantity', 'Quantity')]);
    const seen = [];
    await runWith(dir, seen, {
      Element: 'Þáttur',
      Quantity: 'Fjöldi',
      'Element\nQuantity': 'Frumefni\nFjöldi',
    });
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'api-run.json'), 'utf-8'));
    expect(run.joined).toMatchObject({ text: 'Element\nQuantity', reply: 'Frumefni\nFjöldi', status: 'ok' });
    expect(run.blocks.find((b) => b.key === 'Element')).toMatchObject({
      is: 'Þáttur',
      joined: 'Frumefni',
      kept: 'Frumefni',
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tools/__tests__/figure-mt-joined.test.js`
Expected: the Task 1 tests PASS; the new `main — the joined arm` tests FAIL (only two requests made; no `alternatives`/`mtJoined` in the output).

- [ ] **Step 3: Implement in `main` — four targeted edits**

⚠️ **Edit in place; do not replace `main` wholesale.** The `.env` loading, the API-module import,
the glossary line, the `--no-glossary` note, the `--dry-run` return and the `glossaryRecord`
derivation all stay exactly as they are — dropping the `.env` loop would lose the API key on the
paid leg.

**E1** — replace `const chars = send.reduce((n, b) => n + b.english.length, 0);` with:

```js
  // §C140 ㉔ — the ONE definition of the billed size (see `wireChars`); `billableFrom` in
  // tools/figure-run.js calls the same function, so the plan and the driver cannot disagree.
  const size = wireChars(send);
  const joinedText = joinable(send) ? send.map((b) => b.english).join('\n') : null;
```

(and in the comment above it that begins *"⚠️ SO THIS chars READS LOWER"*, rename `chars` → `size.total`
and add: *"it now also includes the joined request, which prepare.json never counts."*)

**E2** — replace `const steered = glossarySteeredBlocks(wire);` with:

```js
  // The joined request rides the wire too, so it is asserted here beside the per-label ones,
  // under a key no block can have.
  const joinedOpts = joinedText === null ? null : translateOptsFor(glossary, joinedText);
  const steered = glossarySteeredBlocks(
    joinedOpts ? [...wire, { block: { key: '(joined)' }, opts: joinedOpts }] : wire
  );
```

**E3** — replace the plan-line `console.log` (the one printing `blocks, … chars, est … ISK` from `chars`) with:

```js
  // ⚠️ THE FIRST LINE'S SHAPE IS PARSED by figure-run-free.test.js (`N blocks, C chars`); `C` is
  // the TOTAL across both arms, which is what the run is billed for.
  console.log(
    `  ${send.length} blocks, ${size.total} chars, est ${api.estimateIsk(size.total).toFixed(2)} ISK`
  );
  console.log(
    `  per-label ${size.perLabel} + joined ${size.joined} chars ` +
      `(§C140 ㉔, [USER] 2026-09-15: ${joinedText === null ? 'no joined request' : 'labels sent both ways'})`
  );
```

**E4** — replace everything from `const client = api.createClient();` through the
`fs.writeFileSync(path.join(outDir, 'translations-api.json'), …);` call (keeping the
`blocksSteered`/`glossaryRecord` lines, which sit between the loop and the writes, **verbatim** where
marked) with:

```js
  const client = api.createClient();
  const perLabel = {};
  const log = [];
  for (const { block: b, opts } of wire) {
    const t0 = Date.now();
    const r = await client.translate(b.english, opts);
    const got = (r.text || '').trim();
    perLabel[b.key] = got;
    // `glossarySent` is an OUTCOME, not the caller's intent (existing comment — keep it).
    log.push({
      key: b.key,
      en: b.english,
      is: got,
      ms: Date.now() - t0,
      glossarySent: Boolean(opts.glossaries),
    });
    console.log(`    ${JSON.stringify(b.english).padEnd(28)} -> ${JSON.stringify(got)}`);
  }

  // §C140 ㉔ — the joined arm. A refusal of the joined answer never costs a label its wording:
  // it only decides WHICH wording is kept (spec §4.1).
  let mtJoined;
  let joinedRecord = null;
  let lines = null;
  if (send.length < 2) {
    mtJoined = { status: 'single-label', labels: send.length };
  } else if (joinedText === null) {
    mtJoined = { status: 'skipped-newline', labels: send.length };
  } else {
    const t0 = Date.now();
    const r = await client.translate(joinedText, joinedOpts);
    const reply = r.text || '';
    const split = splitJoined(reply, send.length);
    mtJoined = split.ok
      ? { status: 'ok', labels: send.length }
      : { status: 'split-failed', labels: send.length, lines: split.got };
    if (split.ok) lines = split.lines;
    joinedRecord = { text: joinedText, reply, status: mtJoined.status, ms: Date.now() - t0 };
    console.log(`    joined (${send.length} labels) -> ${mtJoined.status}`);
  }

  const out = {};
  const alternatives = {};
  send.forEach((b, i) => {
    const sel = lines
      ? selectWording(b.english, perLabel[b.key], lines[i])
      : { text: perLabel[b.key], alt: null };
    if (sel.alt) alternatives[b.key] = sel.alt;
    const entry = log.find((l) => l.key === b.key);
    entry.joined = lines ? lines[i] : null;
    entry.kept = sel.text;
    if (sel.rejected) entry.rejected = sel.rejected;
    out[b.key] = b.arc ? sel.text : [sel.text]; // composer wraps lines itself
  });

  const usage = client.getUsage ? client.getUsage() : client.usage;
  // ▼ KEEP VERBATIM: the existing `blocksSteered` / `glossaryRecord` comment and two lines. ▼
  const blocksSteered = log.filter((l) => l.glossarySent).length;
  const glossaryRecord = blocksSteered === 0 ? null : { book: args.book, blocksSteered };
  fs.writeFileSync(
    path.join(outDir, 'api-run.json'),
    JSON.stringify(
      {
        figure: figureNameFrom(path.join(outDir, 'meta.json')),
        // (keep the existing comment about the slug)
        book: args.book,
        when: new Date().toISOString(),
        glossary: glossaryRecord,
        blocks: log,
        joined: joinedRecord,
        usage,
      },
      null,
      1
    )
  );
  fs.writeFileSync(
    path.join(outDir, 'translations-api.json'),
    JSON.stringify(
      {
        _source: glossaryRecord
          ? `Málstaður /v1/translate, glossary ${args.book}`
          : 'Málstaður /v1/translate, no glossary',
        blocks: out,
        alternatives,
        mtJoined,
      },
      null,
      1
    )
  );
```

The final `console.log('\n  usage:', …)` stays. Add `wireChars, joinable, splitJoined, selectWording`
nowhere else — they are defined in this same file (Task 1).

Then replace the file header's first paragraph ("One request per DISTINCT BLOCK KEY, not one joined request: …") with:

```js
 * 🔴 SUPERSEDED 2026-09-18 (§C140 ㉔, [USER] ruling 2026-09-15 —
 * docs/decisions/2026-09-15-figure-label-mt-joined-and-per-label.md). This header used to argue
 * for per-label requests ONLY. Every figure with ≥ 2 labels now also gets ONE joined request
 * (labels newline-joined, dedupe order); the joined wording is kept unless `splitJoined` or
 * `formulaGuard` rejects it, and every disagreement is recorded for the editor. Per-label alone
 * reproduced wrong-sense labels every time (Element → Þáttur); joined alone destabilised
 * established terms — neither dominates, so both are bought and a human judges the difference.
 * The spend roughly doubles; `wireChars` is the one definition of it.
```

- [ ] **Step 4: Update the duplicate-keys tests for the second request**

In `tools/__tests__/figure-mt-duplicate-keys.test.js`, make the stub translate **line by line**, so a joined request agrees with the per-label ones and the written blocks stay exactly what they were:

```js
    translate: async (text, opts) => {
      seen.push({ text, opts });
      // Line by line, so the §C140 ㉔ joined request AGREES with the per-label answers and
      // the written blocks are unchanged — which is what these tests are about.
      return { text: text.split('\n').map((l) => `IS:${l}`).join('\n') };
    },
```

and update the two multi-label expectations:

```js
    // test 'bills one request per distinct key, …'
    expect(seen.map((s) => s.text)).toEqual(['Reactant', 'Product', 'Reactant\nProduct']);
    // … (trans.blocks assertion unchanged)
    expect(apiRun.usage).toEqual({
      requests: 3,
      chars: 'ReactantProduct'.length + 'Reactant\nProduct'.length,
    });

    // test 'buys every distinct key when there are no duplicates …'
    expect(seen.map((s) => s.text)).toEqual([
      'Reactant',
      'Product',
      'Catalyst',
      'Reactant\nProduct\nCatalyst',
    ]);
```

Add one sentence to the first test's comment: *"The joined request (§C140 ㉔) carries each distinct key ONCE — the dedupe governs it too."* The `NaCl` test is single-key and unchanged.

- [ ] **Step 5: Run the MT tests**

Run: `npx vitest run tools/__tests__/figure-mt-joined.test.js tools/__tests__/figure-mt-duplicate-keys.test.js tools/__tests__/figure-mt-glossary.test.js`
Expected: PASS, all three files.

- [ ] **Step 6: Commit**

```bash
git add experiments/figure-text-translation/translate-blocks.mjs tools/__tests__/figure-mt-joined.test.js tools/__tests__/figure-mt-duplicate-keys.test.js
git commit -m "feat(figures): §C140 ㉔ — the figure MT leg sends multi-label figures joined as well, keeps the joined wording, records every disagreement, 0 ISK

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The driver carries the alternatives into the sidecar; one wire-size owner

**Files:**
- Modify: `tools/figure-run.js` (`billableFrom`, `normaliseTranslations`, step 7 mint, the import at line 82)
- Modify: `tools/__tests__/figure-run-free.test.js`, `tools/__tests__/figure-run-paid.test.js`

**Interfaces:**
- Consumes: `wireChars(send)` (Task 1); `translations-api.json` shape (Task 2).
- Produces: `normaliseTranslations(apiJson) → {blocks, dropped, alternatives, mtJoined}`; minted sidecar optionally carries `mtAlternatives` (same shape as `alternatives`) and `mtJoined`.

- [ ] **Step 1: Write / update the failing tests**

In `tools/__tests__/figure-run-free.test.js`:

```js
// in the 'lists each would-buy figure …' test — rxn2 has two labels, so it now also buys
// one joined request ('Oxygen gas\nWater' = 16 chars): §C140 ㉔
    expect(rxn2.billable).toEqual({ blocks: 2, chars: 31 });
    expect(text).toContain(
      'would buy 1 figure(s): 31 billable characters, est 0.31 ISK at list rate ' +
        '(+1 figure(s) whose billable size is UNKNOWN)'
    );
    expect(text).toMatch(/CNX_Chem_04_01_rxn2\s+2 block\(s\), 31 chars/);
```

The "billableFrom equals the translate leg's own plan line" test needs **no change** — it must stay green, and that is the proof the two sides share one owner.

Update the two whole-shape assertions in `describe('normaliseTranslations')`:

```js
    expect(normaliseTranslations(null)).toEqual({ blocks: {}, dropped: [], alternatives: {}, mtJoined: null });
    expect(normaliseTranslations({})).toEqual({ blocks: {}, dropped: [], alternatives: {}, mtJoined: null });
```

and add:

```js
  it('carries alternatives and mtJoined through (§C140 ㉔)', () => {
    const r = normaliseTranslations({
      blocks: { A: ['Frumefni'], B: ['Fjöldi'] },
      alternatives: { A: { kept: 'joined', other: 'Þáttur', reason: 'disagree' } },
      mtJoined: { status: 'ok', labels: 2 },
    });
    expect(r.alternatives).toEqual({ A: { kept: 'joined', other: 'Þáttur', reason: 'disagree' } });
    expect(r.mtJoined).toEqual({ status: 'ok', labels: 2 });
  });

  it('discards an alternative whose block was dropped — no warning may point at nothing', () => {
    const r = normaliseTranslations({
      blocks: { A: [''], B: ['ok'] },
      alternatives: { A: { kept: 'per-label', reason: 'empty' } },
    });
    expect(r.dropped).toEqual(['A']);
    expect(r.alternatives).toEqual({});
  });

  it('ignores a malformed alternatives field rather than throwing', () => {
    expect(normaliseTranslations({ blocks: { A: ['x'] }, alternatives: ['nope'] }).alternatives).toEqual({});
    expect(normaliseTranslations({ blocks: { A: ['x'] }, mtJoined: 'nope' }).mtJoined).toBeNull();
  });
```

In `tools/__tests__/figure-run-paid.test.js`, let the fake translate stage write extra top-level fields — change the `JSON.stringify({ _source: 'stub, no glossary', blocks: payload })` line to:

```js
        JSON.stringify({ _source: 'stub, no glossary', blocks: payload, ...(spec.__extra || {}) })
```

and add, inside `describe('the purchase is recorded before anything that can fail after it')`:

```js
  it('the minted sidecar carries the joined-arm alternatives (§C140 ㉔)', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    const spawn = fakeSpawn({
      prepare: () => ({ sendable: 8 }),
      translate: () => ({
        __extra: {
          alternatives: { k0: { kept: 'joined', other: 'per-label k0', reason: 'disagree' } },
          mtJoined: { status: 'ok', labels: 8 },
        },
      }),
    });
    const result = await runFigures(live(booksRoot), { spawn, booksRoot });
    expect(rec(result, 'FIG_A').outcome).toBe('translated');
    const side = readSidecar(bookDir, 'FIG_A');
    expect(side.mtAlternatives).toEqual({
      k0: { kept: 'joined', other: 'per-label k0', reason: 'disagree' },
    });
    expect(side.mtJoined).toEqual({ status: 'ok', labels: 8 });
    // renderHash is over blocks ONLY — the new fields must not move it.
    expect(side.renderHash).toBe(computeRenderHash(side.blocks, COMPOSER_VERSION));
  });

  it('a payload with no alternatives mints a sidecar WITHOUT the fields (the control)', async () => {
    const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'] });
    const spawn = fakeSpawn({ prepare: () => ({ sendable: 8 }) });
    await runFigures(live(booksRoot), { spawn, booksRoot });
    const side = readSidecar(bookDir, 'FIG_A');
    expect('mtAlternatives' in side).toBe(false);
    expect('mtJoined' in side).toBe(false);
  });
```

If `computeRenderHash` / `COMPOSER_VERSION` are not yet imported in `figure-run-paid.test.js`, add `const { computeRenderHash, COMPOSER_VERSION } = require('../lib/figure-text-sidecar.cjs');` beside its existing sidecar import (check with `grep -an "figure-text-sidecar" tools/__tests__/figure-run-paid.test.js`).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tools/__tests__/figure-run-free.test.js tools/__tests__/figure-run-paid.test.js`
Expected: FAIL — `billable.chars` is 15 not 31; `normaliseTranslations` lacks `alternatives`; the sidecar lacks `mtAlternatives`.

- [ ] **Step 3: Implement**

`tools/figure-run.js` line 82:

```js
import {
  dedupeSendBlocks,
  wireChars,
} from '../experiments/figure-text-translation/translate-blocks.mjs';
```

`billableFrom`:

```js
/**
 * §C140 ⑦ — the characters a live run would BUY for one prepared figure.
 *
 * 🔴 CORRECTED 2026-09-18 (§C140 ㉔). This docstring used to say that a change to what is sent
 * "changes this in one place" — while the body summed `english.length` ITSELF, so ㉔'s joined
 * request would have been invisible here and the dry-run would have under-reported a live run by
 * about half. It now asks the translate leg's `wireChars`, the one owner of the billed size.
 * An unreadable blocks.json is UNKNOWN, never zero.
 */
export function billableFrom(outDir) {
  try {
    const blocks = JSON.parse(fs.readFileSync(path.join(outDir, 'blocks.json'), 'utf-8'));
    const send = dedupeSendBlocks(blocks.filter((b) => b.send));
    return { blocks: send.length, chars: wireChars(send).total };
  } catch (err) {
    return { blocks: null, chars: null, error: err.message };
  }
}
```

`normaliseTranslations` — add before `return { blocks, dropped };` (and change the early return to include the new fields):

```js
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { blocks, dropped, alternatives: {}, mtJoined: null };
  }
  // … existing loop unchanged …

  // §C140 ㉔ — the joined arm's per-key verdicts. An alternative for a key that did not survive
  // is discarded with it: a warning must never point at a block that does not exist.
  const alternatives = {};
  const rawAlt = apiJson.alternatives;
  if (rawAlt && typeof rawAlt === 'object' && !Array.isArray(rawAlt)) {
    for (const [key, alt] of Object.entries(rawAlt)) {
      if (key in blocks && alt && typeof alt === 'object' && !Array.isArray(alt)) {
        alternatives[key] = alt;
      }
    }
  }
  const mtJoined =
    apiJson.mtJoined && typeof apiJson.mtJoined === 'object' && !Array.isArray(apiJson.mtJoined)
      ? apiJson.mtJoined
      : null;
  return { blocks, dropped, alternatives, mtJoined };
```

Update its `@returns` to `{blocks, dropped, alternatives, mtJoined}`.

Step 6/7 in `runFigure` (around line 1305 and the `minted` literal):

```js
    const { blocks, dropped, alternatives, mtJoined } = normaliseTranslations(
      readJson(path.join(outDir, 'translations-api.json'))
    );
    // …
    const minted = {
      version: SIDECAR_VERSION,
      basename: rec.basename,
      renderHash: computeRenderHash(blocks, COMPOSER_VERSION),
      composerVersion: COMPOSER_VERSION,
      blocks,
      // §C140 ㉔ — OUTSIDE renderHash by construction (computeRenderHash reads `blocks` only), so
      // no approval or staleness verdict moves. Omitted when there is nothing to say, so a
      // sidecar from a single-label figure keeps today's exact shape.
      ...(Object.keys(alternatives).length ? { mtAlternatives: alternatives } : {}),
      ...(mtJoined ? { mtJoined } : {}),
    };
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tools/__tests__/figure-run-free.test.js tools/__tests__/figure-run-paid.test.js tools/__tests__/figure-mt-joined.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/figure-run.js tools/__tests__/figure-run-free.test.js tools/__tests__/figure-run-paid.test.js
git commit -m "feat(figures): §C140 ㉔ — the driver mints the joined-arm alternatives into the sidecar; billableFrom asks the MT leg for the wire size, 0 ISK

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Server — carry the fields forward and expose the warnings

**Files:**
- Modify: `tools/lib/figure-consistency.cjs`, `tools/__tests__/figure-consistency.test.js`
- Modify: `server/services/figureReviewService.js` (`applyApprovedFigureEdits`, `buildFigurePayload`)
- Modify: `server/routes/segment-editor.js:624`
- Modify: `server/__tests__/figureReviewService.test.js`, `server/__tests__/figureReviewRoutes.test.js`

**Interfaces:**
- Consumes: sidecar fields `mtAlternatives`, `mtJoined` (Task 3).
- Produces:
  - `mtAlternativeWarnings(blocks, mtBlocks, mtAlternatives) → Array<{blockKey, current, suggested?, reason}>` — only for keys whose current block equals the MT's kept wording.
  - `mtFigureWarning(mtJoined) → string|null` — non-null for `'split-failed'` / `'skipped-newline'`.
  - `buildFigurePayload(basename, fig, referenceText, imageUrl = null, mt = null)` where `mt = {mtBlocks, mtAlternatives, mtJoined}`; payload `warnings` gains `mt` (array) and `mtFigure` (string|null).

- [ ] **Step 1: Write the failing tests**

`tools/__tests__/figure-consistency.test.js` — extend the require to `const { decimalSeparatorWarnings, captionDivergence, mtAlternativeWarnings, mtFigureWarning } = require('../lib/figure-consistency.cjs');` and append:

```js
describe('mtAlternativeWarnings (§C140 ㉔)', () => {
  const MT = { Element: 'Frumefni', H2O: 'H2O' };
  const ALT = {
    Element: { kept: 'joined', other: 'Þáttur', reason: 'disagree' },
    H2O: { kept: 'per-label', reason: 'formula' },
  };
  it('offers the per-label wording on a disagreement', () => {
    expect(mtAlternativeWarnings(MT, MT, ALT)).toContainEqual({
      blockKey: 'Element',
      current: 'Frumefni',
      suggested: 'Þáttur',
      reason: 'disagree',
    });
  });
  it('a formula fallback is a note with NO suggestion', () => {
    const w = mtAlternativeWarnings(MT, MT, ALT).find((x) => x.blockKey === 'H2O');
    expect(w).toEqual({ blockKey: 'H2O', current: 'H2O', reason: 'formula' });
  });
  it('goes silent once the editor has changed the block', () => {
    const edited = { ...MT, Element: 'Frumefni (leiðrétt)' };
    expect(mtAlternativeWarnings(edited, MT, ALT).map((w) => w.blockKey)).toEqual(['H2O']);
  });
  it('goes silent once the alternative has been applied', () => {
    const applied = { ...MT, Element: 'Þáttur' };
    expect(mtAlternativeWarnings(applied, MT, ALT).map((w) => w.blockKey)).toEqual(['H2O']);
  });
  it('is empty for a sidecar with no alternatives (every pre-㉔ figure)', () => {
    expect(mtAlternativeWarnings(MT, MT, undefined)).toEqual([]);
    expect(mtAlternativeWarnings(MT, MT, null)).toEqual([]);
  });
  it('never offers an empty suggestion', () => {
    const alt = { Element: { kept: 'joined', other: '', reason: 'disagree' } };
    expect(mtAlternativeWarnings(MT, MT, alt)).toEqual([
      { blockKey: 'Element', current: 'Frumefni', reason: 'disagree' },
    ]);
  });
});

describe('mtFigureWarning (§C140 ㉔)', () => {
  it('names a split failure', () => {
    expect(mtFigureWarning({ status: 'split-failed', labels: 3, lines: 2 })).toMatch(/2.*3/);
  });
  it('names a skipped joined request', () => {
    expect(mtFigureWarning({ status: 'skipped-newline', labels: 2 })).toBeTruthy();
  });
  it('is null when the joined arm worked, was not needed, or is unknown', () => {
    expect(mtFigureWarning({ status: 'ok', labels: 2 })).toBeNull();
    expect(mtFigureWarning({ status: 'single-label', labels: 1 })).toBeNull();
    expect(mtFigureWarning(undefined)).toBeNull();
  });
});
```

`server/__tests__/figureReviewService.test.js` — inside `describe('applyApprovedFigureEdits')`, following the `composedVersion` carry-forward test's idiom:

```js
  it('CARRIES mtAlternatives and mtJoined FORWARD — an approval must not erase the MT verdicts (§C140 ㉔)', () => {
    const ALT = { Celsius: { kept: 'joined', other: 'Celsíus', reason: 'disagree' } };
    const JOINED = { status: 'ok', labels: 2 };
    // The suite's beforeEach writes NO sidecar, so this test writes its own.
    writeSidecar(bookDir, 'CNX_T', {
      version: 1,
      basename: 'CNX_T',
      blocks: MT,
      mtAlternatives: ALT,
      mtJoined: JOINED,
    });
    svc.setState(db, { bookId, basename: 'CNX_T', state: 'approved', reviewedBy: 'ed', blocks: MT });
    svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'CNX_T', mtBlocks: MT });
    const after = readSidecar(bookDir, 'CNX_T');
    expect(after.mtAlternatives).toEqual(ALT);
    expect(after.mtJoined).toEqual(JOINED);
  });

  it('does NOT invent mtAlternatives for a sidecar that never had them', () => {
    writeSidecar(bookDir, 'CNX_T', { version: 1, basename: 'CNX_T', blocks: MT });
    svc.setState(db, { bookId, basename: 'CNX_T', state: 'approved', reviewedBy: 'ed', blocks: MT });
    svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'CNX_T', mtBlocks: MT });
    const after = readSidecar(bookDir, 'CNX_T');
    expect('mtAlternatives' in after).toBe(false);
    expect('mtJoined' in after).toBe(false);
  });
```

`server/__tests__/figureReviewRoutes.test.js` — inside `describe('buildFigurePayload')`:

```js
  it('carries the §C140 ㉔ MT warnings when given the sidecar MT info', () => {
    const f = { effectiveState: 'mt-preview', blocks: { Element: 'Frumefni' }, note: null };
    const p = buildFigurePayload('CNX_T', f, '', null, {
      mtBlocks: { Element: 'Frumefni' },
      mtAlternatives: { Element: { kept: 'joined', other: 'Þáttur', reason: 'disagree' } },
      mtJoined: { status: 'split-failed', labels: 2, lines: 1 },
    });
    expect(p.warnings.mt).toEqual([
      { blockKey: 'Element', current: 'Frumefni', suggested: 'Þáttur', reason: 'disagree' },
    ]);
    expect(p.warnings.mtFigure).toBeTruthy();
  });
  it('an explicit empty list and null without MT info — never a missing key', () => {
    const p = buildFigurePayload('CNX_T', fig, '');
    expect(p.warnings.mt).toEqual([]);
    expect(p.warnings.mtFigure).toBeNull();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tools/__tests__/figure-consistency.test.js server/__tests__/figureReviewService.test.js server/__tests__/figureReviewRoutes.test.js`
Expected: FAIL — functions not exported; fields dropped on approval; `warnings.mt` undefined.

- [ ] **Step 3: Implement**

`tools/lib/figure-consistency.cjs`, before `module.exports`:

```js
/**
 * §C140 ㉔ — the joined-vs-per-label verdicts, as review-panel warnings.
 *
 * Emitted only while the block still holds the MT's KEPT wording (`mtBlocks[key]`): once an editor
 * has changed it — including by applying the suggestion — the warning has done its job. Compared
 * against the sidecar's MT text, never another segment (CLAUDE.md: never decide by comparing two
 * editable strings; the MT side here is the machine's own record, not an editable segment).
 *
 * ⚠️ `suggested` only for a disagreement with a NON-EMPTY per-label wording. A formula or empty
 * fallback is a note: the joined wording was rejected, and offering it would invite the damage.
 */
function mtAlternativeWarnings(blocks, mtBlocks, mtAlternatives) {
  const out = [];
  if (!mtAlternatives || typeof mtAlternatives !== 'object') return out;
  for (const [blockKey, alt] of Object.entries(mtAlternatives)) {
    if (!alt || typeof alt !== 'object') continue;
    const current = blocks[blockKey];
    if (typeof current !== 'string' || current !== (mtBlocks || {})[blockKey]) continue;
    const w = { blockKey, current, reason: alt.reason };
    if (alt.reason === 'disagree' && typeof alt.other === 'string' && alt.other.trim() !== '') {
      w.suggested = alt.other;
    }
    out.push(w);
  }
  return out;
}

/** A figure-level note when NO label on the figure had the joined arm's context. */
function mtFigureWarning(mtJoined) {
  if (!mtJoined || typeof mtJoined !== 'object') return null;
  if (mtJoined.status === 'split-failed') {
    return `Samhengisþýðing féll á skiptingu (${mtJoined.lines} línur fyrir ${mtJoined.labels} merkingar) — allar merkingar eru stakar vélþýðingar.`;
  }
  if (mtJoined.status === 'skipped-newline') {
    return 'Samhengisþýðing var ekki send — allar merkingar eru stakar vélþýðingar.';
  }
  return null;
}

module.exports = { decimalSeparatorWarnings, captionDivergence, mtAlternativeWarnings, mtFigureWarning };
```

`server/services/figureReviewService.js` — extend its require of `figure-consistency.cjs` with `mtAlternativeWarnings, mtFigureWarning` (find it with `grep -an "figure-consistency" server/services/figureReviewService.js`).

In `applyApprovedFigureEdits`, after the `composedVersion` line:

```js
  // §C140 ㉔ — the MT's joined-vs-per-label verdicts, carried for the SAME reason as the two stamps
  // above: this function rebuilds the whole sidecar from a field list, so a field without its own
  // line here is silently erased by the first approval — and with it the editor's only sign that a
  // label was contested. They describe the MACHINE's output, which an approval does not change.
  const mtAlternatives = (existing && existing.mtAlternatives) || null;
  const mtJoined = (existing && existing.mtJoined) || null;
```

and in `data`, after `blocks: fig.blocks,`:

```js
    ...(mtAlternatives ? { mtAlternatives } : {}),
    ...(mtJoined ? { mtJoined } : {}),
```

`buildFigurePayload`:

```js
function buildFigurePayload(basename, fig, referenceText, imageUrl = null, mt = null) {
  const info = mt || {};
  return {
    // … unchanged fields …
    warnings: {
      decimal: decimalSeparatorWarnings(fig.blocks),
      caption: captionDivergence(fig.blocks, referenceText || ''),
      // §C140 ㉔. `[]` / `null`, never absent, for the reason `imageUrl` states above.
      mt: mtAlternativeWarnings(fig.blocks, info.mtBlocks, info.mtAlternatives),
      mtFigure: mtFigureWarning(info.mtJoined),
    },
  };
}
```

Add `@param {{mtBlocks?: object, mtAlternatives?: object, mtJoined?: object}|null} [mt]` to its JSDoc.

`server/routes/segment-editor.js:624`:

```js
        figures.push(
          figureReview.buildFigurePayload(f.basename, resolved.fig, referenceText, imageUrl, {
            mtBlocks: resolved.mtBlocks,
            mtAlternatives: resolved.sidecar.mtAlternatives,
            mtJoined: resolved.sidecar.mtJoined,
          })
        );
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tools/__tests__/figure-consistency.test.js tools/__tests__/figure-consistency-parity.test.js server/__tests__/figureReviewService.test.js server/__tests__/figureReviewRoutes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/figure-consistency.cjs tools/__tests__/figure-consistency.test.js server/services/figureReviewService.js server/routes/segment-editor.js server/__tests__/figureReviewService.test.js server/__tests__/figureReviewRoutes.test.js
git commit -m "feat(figures): §C140 ㉔ — approvals keep the MT's joined-arm verdicts, and the figure payload carries them as warnings, 0 ISK

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The review panel — render the alternative with **Nota**; E2E

**Files:**
- Modify: `server/public/js/segment-editor.js` (`renderFigureBlock`, `renderFigureCard`)
- Create: `books/__e2e-fixture__/figure-text/CNX_Chem_01_01_WaterDom.is.json`
- Modify: `server/e2e/figure-review.spec.js`

**Interfaces:**
- Consumes: payload `warnings.mt` (`{blockKey, current, suggested?, reason}`) and `warnings.mtFigure` (Task 4).

- [ ] **Step 1: Add the fixture and write the failing E2E test**

`m68664` has four figures and `CNX_Chem_01_01_WaterDom` is the one without a sidecar — it becomes this test's own figure (one figure per mutating test). Create `books/__e2e-fixture__/figure-text/CNX_Chem_01_01_WaterDom.is.json` with **exactly** these bytes (the spec's `beforeAll` compares committed bytes to its `PRISTINE` constant):

```json
{
 "version": 1,
 "basename": "CNX_Chem_01_01_WaterDom",
 "blocks": {
  "Element": "Frumefni",
  "Quantity": "Fjöldi"
 },
 "mtAlternatives": {
  "Element": {
   "kept": "joined",
   "other": "Þáttur",
   "reason": "disagree"
  }
 }
}
```

(with a trailing newline). In `server/e2e/figure-review.spec.js`:

```js
const WATERDOM = 'CNX_Chem_01_01_WaterDom';
/** §C140 ㉔ — this figure's own block, touched by no other test. */
const MT_ALT_KEY = 'Element';
const MT_ALT_KEPT = 'Frumefni';
const MT_ALT_PER_LABEL = 'Þáttur';
```

add to `PRISTINE`:

```js
  [WATERDOM]: `{
 "version": 1,
 "basename": "CNX_Chem_01_01_WaterDom",
 "blocks": {
  "Element": "Frumefni",
  "Quantity": "Fjöldi"
 },
 "mtAlternatives": {
  "Element": {
   "kept": "joined",
   "other": "Þáttur",
   "reason": "disagree"
  }
 }
}
`,
```

Update the counts that WaterDom now changes:
- `'the card renders the figures the API actually returns'`: `.toEqual([ALCHEMIST, CHEMWEB, SCIMETHOD, WATERDOM])` (sorted — `WaterDom` sorts last), `toHaveCount(4)`, and the comment "m68664 carries FOUR figures; all four now have a sidecar" — **and add** a line keeping the skip meaningful: `// the no-sidecar skip is still bound by the m68663 test below.`
- `'shows the translated figure, and only where one exists'`: the loop becomes `for (const basename of [CHEMWEB, SCIMETHOD, WATERDOM])`.

New test:

```js
  /**
   * §C140 ㉔ — a label where the joined and per-label MT disagreed shows the per-label wording as
   * a one-click alternative. Mutating, so it owns WATERDOM alone.
   */
  test('an MT alternative is offered, guarded, applied in one click, and then gone', async ({ page }) => {
    await openFixtureModule(page, 'm68664');
    const row = blockRow(page, WATERDOM, MT_ALT_KEY);
    const input = row.locator('[data-block-input]');
    const apply = row.locator('[data-block-apply]');

    await expect(input).toHaveValue(MT_ALT_KEPT); // precondition, stated
    // Filtered BY TEXT: the caption-divergence check may legitimately add its own warning to this
    // block from the module's caption, and that is not what this test is about.
    const mtWarning = (r) => r.locator('[data-block-warning]', { hasText: 'stakra merkinga' });
    await expect(mtWarning(row)).toHaveCount(1);
    await expect(mtWarning(row)).toContainText(MT_ALT_PER_LABEL);

    // The guard, both directions — enabled on pristine input is the control.
    await expect(apply).toBeEnabled();
    await input.fill('Frumefni — í vinnslu');
    await expect(apply).toBeDisabled();
    await input.fill(MT_ALT_KEPT);
    await expect(apply).toBeEnabled();

    await apply.click();
    const after = blockRow(page, WATERDOM, MT_ALT_KEY);
    await expect(after.locator('[data-block-input]')).toHaveValue(MT_ALT_PER_LABEL);
    await expect(mtWarning(after)).toHaveCount(0);
    await expect(after.locator('[data-block-apply]')).toHaveCount(0);

    // CONTROL: the sibling block with no alternative never showed one.
    await expect(mtWarning(blockRow(page, WATERDOM, 'Quantity'))).toHaveCount(0);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx playwright test e2e/figure-review.spec.js`
Expected: the new test FAILS (no warning rendered); the updated count tests PASS (the API already returns WaterDom).

- [ ] **Step 3: Implement the panel**

In `renderFigureCard`, extend the warnings object:

```js
    const warnings = {
      decimal: (fig.warnings && fig.warnings.decimal) || [],
      caption: (fig.warnings && fig.warnings.caption) || [],
      mt: (fig.warnings && fig.warnings.mt) || [],
    };
```

and, just before `const list = document.createElement('ul');`:

```js
    // §C140 ㉔ — every label on this figure fell back to its per-label MT, i.e. without the
    // sibling labels' context: the wrong-sense risk the joined arm exists to remove.
    if (fig.warnings && fig.warnings.mtFigure) {
      const figWarn = document.createElement('p');
      figWarn.className = 'figure-warning';
      figWarn.setAttribute('data-figure-mt-warning', '');
      figWarn.textContent = `⚠ ${fig.warnings.mtFigure}`;
      card.appendChild(figWarn);
    }
```

In `renderFigureBlock`, after the caption loop and before `return li;`:

```js
    // §C140 ㉔ — the joined and per-label MT disagreed; the block holds the joined wording and the
    // per-label one is offered in one click, never automatically ([USER] 2026-09-15). Same guard
    // as the decimal suggestion: the offer was computed from the SAVED text, so typing disables it.
    // A formula/empty fallback carries no `suggested` and renders as a note only.
    for (const w of warnings.mt) {
      if (w.blockKey !== key) continue;
      if (!w.suggested) {
        li.appendChild(
          figureWarning(
            w.reason === 'formula'
              ? '⚠ Samhengisþýðing breytti tölu eða formúlu — stök vélþýðing notuð.'
              : '⚠ Samhengisþýðing skilaði engu — stök vélþýðing notuð.'
          )
        );
        continue;
      }
      li.appendChild(figureWarning(`⚠ Orðalag MT stakra merkinga: ${w.suggested}`));
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn btn-sm figure-block-apply';
      apply.setAttribute('data-block-apply', '');
      apply.textContent = 'Nota';
      apply.setAttribute('aria-label', `Nota orðalag stakra merkinga fyrir ${key}`);
      const syncApplyEnabled = () => {
        apply.disabled = input.value !== w.current;
      };
      syncApplyEnabled();
      input.addEventListener('input', syncApplyEnabled);
      apply.addEventListener('click', () => saveFigureBlock(basename, key, w.suggested));
      li.appendChild(apply);
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx playwright test e2e/figure-review.spec.js`
Expected: PASS, every test in the file. Then `git status --porcelain books/__e2e-fixture__/` must print nothing (the `afterEach` restores pristine bytes; a dirty fixture is a defect).

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/e2e/figure-review.spec.js books/__e2e-fixture__/figure-text/CNX_Chem_01_01_WaterDom.is.json
git commit -m "feat(editor): §C140 ㉔ — the figure review panel offers the per-label MT wording in one click where the joined wording was kept, 0 ISK

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Mutation proof, full gates, register

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (RESUME + ㉔ row)
- Create: `experiments/figure-text-translation/evidence/2026-09-18-c24-joined-label-mt/MUTATIONS.md`

- [ ] **Step 1: Mutation-test each guard against its own test**

For each mutation below: `cp <file> /tmp/…golden` first (once per file), apply the mutation, run the named test file, **require RED**, restore from the golden copy, `cmp` against it. Record each result in `MUTATIONS.md` as a table (mutation · file · test run · red/green · restored `cmp` ok).

| # | File | Mutation | Must go red in |
|---|---|---|---|
| M1 | `translate-blocks.mjs` | `splitJoined`: `lines.length === n` → `true` | `figure-mt-joined.test.js` |
| M2 | `translate-blocks.mjs` | `formulaGuard`: drop the `digits` push | `figure-mt-joined.test.js` |
| M3 | `translate-blocks.mjs` | `formulaGuard`: drop the `subsup` push | `figure-mt-joined.test.js` |
| M4 | `translate-blocks.mjs` | `formulaGuard`: drop the formula-token loop | `figure-mt-joined.test.js` |
| M5 | `translate-blocks.mjs` | `joinable`: drop the `\n` check | `figure-mt-joined.test.js` |
| M6 | `translate-blocks.mjs` | `wireChars`: `joined` → `0` | `figure-run-free.test.js` |
| M7 | `figureReviewService.js` | drop `...(mtAlternatives ? …)` from `data` | `figureReviewService.test.js` |
| M8 | `figure-consistency.cjs` | drop the `current !== mtBlocks[key]` condition | `figure-consistency.test.js` |
| M9 | `translate-blocks.mjs` | `selectWording`: return `alt: null` on disagreement | `figure-mt-joined.test.js` |

After the last round: `cmp` every golden copy against its file one final time, and `git status --porcelain` must show only the intended commits' files (i.e. clean).

- [ ] **Step 2: Run the full gates and compare BY NAME against `main`**

```bash
npm test 2>&1 | tee /tmp/claude-c24-vitest.txt ; echo "exit ${PIPESTATUS[0]}"
npm run lint
npm run format:check
cd server && npm run test:e2e
```

`npm test` has pre-existing failures on `main` (register: 13 files / 36 tests at `9d9dd0165`). **Compare the failing set BY NAME** against `main` at the branch point — `0 only-branch` is the bar; a count match alone is not evidence. Check out `main` in a worktree **with both `node_modules` trees installed** (memory `worktree-floor-needs-both-dep-trees`) to produce the floor.

- [ ] **Step 3: Update the register and commit**

In the register's newest RESUME: ㉔ built on the branch (commit SHAs), what was verified (mutation table path, the by-name comparison), and the next action: **[USER]'s review + merge (merge commit, not squash) → deploy** (it touches `server/`, so prod's review panel needs it) — **after which the 2026-09-13 buying stop is lifted by [USER]'s 2026-09-18 ruling**. Update the ㉔ row's status cell. Then:

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md experiments/figure-text-translation/evidence/2026-09-18-c24-joined-label-mt/MUTATIONS.md
git commit -m "docs(register): §C140 ㉔ built on its branch — mutation-proved, CI compared by name; merge + deploy lift the buying stop, 0 ISK

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the PR** — only when [USER] says so.
