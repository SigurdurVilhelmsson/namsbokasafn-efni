# a11y-2: Assistive MathML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every rendered math expression (block + inline) a screen-reader-navigable accessible name by emitting a visually-hidden source-MathML sibling beside the SVG, with the visual subtree `aria-hidden`.

**Architecture:** One change point — `tools/lib/mathjax-render.js` `renderMathML()`, through which all four production call sites funnel. After MathJax produces the `<mjx-container><svg></svg></mjx-container>`, mark the container `aria-hidden="true"` and append a `<math class="assistive-mathml" style="<visually-hidden>">` built from the source MathML the function already holds. The hiding is **inline** → fully self-contained, no vefur CSS dependency, fail-safe.

**Tech Stack:** Node 22, ES modules, MathJax 4.1.2 (`@mathjax/src`, `input/mml`+`output/svg`, liteDOM), Vitest.

**Design spec:** `docs/superpowers/specs/2026-06-30-a11y-2-assistive-mathml-design.md`.

## Global Constraints

- **Robustness over expedience** (lead directive): one real code path; fail in the safe direction (a11y sibling degrades to SVG-only, the visual never fails because of this feature); no escape hatch that can reach prod. (`feedback-robustness-over-expedience`)
- **Self-contained output:** the assistive MathML must be hidden by an **inline** style. Do **not** introduce any dependency on a vefur (`namsbokasafn-vefur`) CSS rule. No vefur edits.
- **Scope = code + tests only.** Do **not** re-render `05-publication/` or sync to namsbokasafn.is in this work; that rides the separate pending stale-render re-render+sync PR.
- **Local test gate is authoritative:** `npm test` + `npm run validate` (CI credits out until ~Jul 1; no branch protection).
- **Math accessibility needs no translation** — math notation is language-neutral; no Málstaður API call here.
- Branch: `feat/a11y-2-assistive-mathml` (already created; the design doc is committed on it).
- Node 22 / `nvm use` before any `npm install` (none expected — no new deps).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `tools/lib/mathjax-render.js` | MathML→SVG render; now also emits the assistive MathML sibling | Modify `renderMathML`; add+export `buildAssistiveMml`; add `VISUALLY_HIDDEN_STYLE` const |
| `tools/__tests__/mathjax-render.test.js` | Unit tests for the new behavior | Create |
| `tools/__tests__/helpers/render-normalize.js` | Golden normalizer — collapse volatile/bulky math to stable markers | Modify `normalizeMathJax` to also collapse the assistive sibling |
| `tools/__tests__/fixtures/render-golden/**` | Byte-golden baseline | Regenerate (additive diff) |
| `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` | Backlog/register | Mark a11y-2 done; withdraw the `[VEFUR]` assistive-CSS note; log out-of-scope finds |

**Blast-radius note (verified, do not re-investigate):** the example/exercise/note-dom suites count equations with `html.split('<mjx-container').length - 1` — they count `mjx-container`, which stays 1 per expression (we add a `<math>` sibling, not a container), so they pass unchanged. Only the byte-golden suite regenerates.

---

### Task 1: Emit the assistive MathML sibling in `renderMathML`

**Files:**
- Modify: `tools/lib/mathjax-render.js` (`renderMathML` at `:31`; add module-level const + helper)
- Test: `tools/__tests__/mathjax-render.test.js` (create)

**Interfaces:**
- Produces: `renderMathML(mml: string, displayMode = true): string` — unchanged signature; output now = `<mjx-container … aria-hidden="true">…</mjx-container>` immediately followed by `<math class="assistive-mathml" …>…</math>` (the sibling is omitted entirely when `mml` has no `<math>`).
- Produces: `buildAssistiveMml(cleanMml: string, displayMode: boolean): string` — exported pure helper; returns the visually-hidden `<math …>…</math>` string, or `''` when `cleanMml` contains no `<math>…</math>`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/mathjax-render.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderMathML, buildAssistiveMml } from '../lib/mathjax-render.js';

// E = mc^2 in m:-prefixed MathML, as the pipeline passes it in.
const MML =
  '<m:math><m:mrow><m:mi>E</m:mi><m:mo>=</m:mo><m:mi>m</m:mi>' +
  '<m:msup><m:mi>c</m:mi><m:mn>2</m:mn></m:msup></m:mrow></m:math>';

describe('renderMathML — assistive MathML sibling', () => {
  it('appends exactly one assistive <math> sibling (block)', () => {
    const out = renderMathML(MML, true);
    const count = (out.match(/<math\b[^>]*class="assistive-mathml"/g) || []).length;
    expect(count).toBe(1);
  });

  it('marks the visual mjx-container aria-hidden so AT skips the SVG', () => {
    const out = renderMathML(MML, true);
    expect(out).toMatch(/<mjx-container\b[^>]*aria-hidden="true"/);
  });

  it('hides the assistive <math> with an inline style (no external CSS needed)', () => {
    const out = renderMathML(MML, true);
    const tag = out.match(/<math\b[^>]*class="assistive-mathml"[^>]*>/)[0];
    expect(tag).toMatch(/style="[^"]*position:absolute/);
    expect(tag).toMatch(/clip:rect/);
  });

  it('applies to inline math too (display=false)', () => {
    const out = renderMathML(MML, false);
    expect(out).toMatch(/class="assistive-mathml"/);
    expect(out).toMatch(/<mjx-container\b[^>]*aria-hidden="true"/);
  });

  it('preserves the source MathML content in the sibling', () => {
    const out = renderMathML(MML, true);
    const math = out.match(
      /<math\b[^>]*class="assistive-mathml"[\s\S]*?<\/math>/
    )[0];
    expect(math).toContain('<msup>');
    expect(math).toContain('<mn>2</mn>');
  });

  it('tags block math display="block" on the assistive node', () => {
    const tag = renderMathML(MML, true).match(
      /<math\b[^>]*class="assistive-mathml"[^>]*>/
    )[0];
    expect(tag).toMatch(/display="block"/);
  });

  it('buildAssistiveMml returns "" when there is no <math> (degrade to SVG-only)', () => {
    expect(buildAssistiveMml('plain text, no math here', false)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/mathjax-render.test.js`
Expected: FAIL — `buildAssistiveMml` is not exported / no `assistive-mathml` in output.

- [ ] **Step 3: Implement the change**

In `tools/lib/mathjax-render.js`, add a module-level constant after the `doc`/`adaptor` setup (after line 23):

```js
// Inline visually-hidden style (the standard sr-only clip technique). Inline so
// the assistive MathML is hidden without any external stylesheet — the rendered
// HTML is self-contained and needs no vefur CSS rule.
const VISUALLY_HIDDEN_STYLE =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;' +
  'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';

/**
 * Build a visually-hidden, screen-reader-only MathML sibling from source MathML.
 * The renderer's input IS MathML, so the accessible representation is free to
 * emit — we just decline to discard it. Returns '' when there is no parseable
 * <math>…</math>, so the visual SVG ships alone (degrade, don't crash).
 * @param {string} cleanMml - MathML with the m: namespace prefix already stripped
 * @param {boolean} displayMode - true for block equations
 * @returns {string} the <math …>…</math> string, or '' if no <math> present
 */
export function buildAssistiveMml(cleanMml, displayMode) {
  const mathMatch = cleanMml.match(/<math\b[\s\S]*<\/math>/i);
  if (!mathMatch) return '';
  const inner = mathMatch[0];
  const attrs = [
    'class="assistive-mathml"',
    /\bxmlns=/.test(inner) ? '' : 'xmlns="http://www.w3.org/1998/Math/MathML"',
    displayMode && !/\bdisplay=/.test(inner) ? 'display="block"' : '',
    `style="${VISUALLY_HIDDEN_STYLE}"`,
  ]
    .filter(Boolean)
    .join(' ');
  return inner.replace(/^<math\b/i, `<math ${attrs}`);
}
```

Then change `renderMathML` (currently lines 31-45) to:

```js
export function renderMathML(mml, displayMode = true) {
  // Strip namespace prefix if present
  const cleanMml = mml.replace(/<(\/?)m:/g, '<$1');

  const node = doc.convert(cleanMml, { display: displayMode });
  let visual = adaptor.outerHTML(node);

  // Add crisp rendering attributes to prevent antialiasing
  visual = visual.replace(
    /<svg/,
    '<svg shape-rendering="geometricPrecision" text-rendering="geometricPrecision"'
  );

  // The SVG is purely visual; hide it from assistive tech (it is a nameless
  // role="img"). The accessible representation is the MathML sibling below.
  visual = visual.replace(/<mjx-container\b/, '<mjx-container aria-hidden="true"');

  return visual + buildAssistiveMml(cleanMml, displayMode);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/mathjax-render.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/mathjax-render.js tools/__tests__/mathjax-render.test.js
git commit -m "feat(a11y-2): emit visually-hidden assistive MathML beside math SVG

renderMathML now appends a self-contained, inline-hidden <math> sibling
(source MathML) and marks the visual mjx-container aria-hidden, so screen
readers get a navigable accessible name for every block and inline
expression. Degrades to SVG-only when no <math> is present.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Keep golden fixtures compact and regenerate the baseline

**Files:**
- Modify: `tools/__tests__/helpers/render-normalize.js` (`normalizeMathJax` at `:31`)
- Regenerate: `tools/__tests__/fixtures/render-golden/**`

**Interfaces:**
- Consumes: `renderMathML` output from Task 1 (now contains the `<math class="assistive-mathml">` sibling).
- Produces: `normalizeMathJax(html)` additionally collapses each assistive sibling to a stable `<math class="assistive-mathml">[ASSISTIVE-MML]</math>` marker, so goldens stay small and deterministic while still proving the sibling is emitted.

- [ ] **Step 1: Extend the normalizer**

In `tools/__tests__/helpers/render-normalize.js`, replace the `normalizeMathJax` function body so it collapses BOTH the container and the assistive sibling:

```js
export function normalizeMathJax(html) {
  return (
    html
      // Volatile MathJax SVG container → stable data-latex placeholder.
      .replace(/<mjx-container\b([^>]*)>[\s\S]*?<\/mjx-container>/g, (_full, attrs) => {
        const m = attrs.match(/data-latex="([^"]*)"/);
        const latex = m ? m[1] : '';
        return `<mjx-container data-latex="${latex}">[MATHJAX]</mjx-container>`;
      })
      // Assistive MathML sibling (deterministic but bulky) → presence marker.
      .replace(
        /<math\b[^>]*class="assistive-mathml"[^>]*>[\s\S]*?<\/math>/g,
        '<math class="assistive-mathml">[ASSISTIVE-MML]</math>'
      )
  );
}
```

- [ ] **Step 2: Run the golden suite to confirm it now fails (intentional drift)**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Expected: FAIL — committed goldens lack the `[ASSISTIVE-MML]` markers (this is the intended additive change).

- [ ] **Step 3: Regenerate the golden baseline**

Run: `UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Expected: PASS (writes fixtures).

- [ ] **Step 4: Review the diff is additive-only**

Run: `git --no-pager diff --stat tools/__tests__/fixtures/render-golden/`
Then inspect one math-bearing fixture:
Run: `git --no-pager diff tools/__tests__/fixtures/render-golden/ch05/m68727.html | head -60`
Expected: every change is an INSERTED `<math class="assistive-mathml">[ASSISTIVE-MML]</math>` immediately after a `[MATHJAX]` placeholder. **No** structural HTML moved, removed, or reordered. If anything else changed, STOP and use `superpowers:systematic-debugging`.

- [ ] **Step 5: Re-run the golden suite clean**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/__tests__/helpers/render-normalize.js tools/__tests__/fixtures/render-golden/
git commit -m "test(a11y-2): normalize + regenerate golden for assistive MathML sibling

normalizeMathJax now collapses the assistive <math> sibling to a stable
[ASSISTIVE-MML] marker; golden fixtures regenerated. Diff is additive-only
(one marker per equation), proving structure is otherwise byte-identical.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Full-suite gate + register/memory update

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`

**Interfaces:** none (verification + docs).

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS, all green (≈1414+ tests). In particular the example/exercise/note-dom suites pass unchanged (they count `mjx-container`, not `<math>`). If a render suite fails on a literal `<math>` count or exact-HTML compare, the only legitimate change is the additive sibling — confirm that, then update that assertion or normalize it the same way; otherwise STOP (`superpowers:systematic-debugging`).

- [ ] **Step 2: Run validate**

Run: `npm run validate`
Expected: PASS (24/24 chapter status files).

- [ ] **Step 3: Update the backlog/register**

In `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`:
- In the `🟠 High` Consolidated-Backlog table, mark the **a11y-2** row done with the PR/branch (`feat/a11y-2-assistive-mathml`) and a one-line "self-contained, no vefur leg" note.
- In the `🔗 Cross-repo [vefur]` section, **withdraw** any assistive-MathML CSS expectation: a11y-2 shipped self-contained, so no vefur rule is needed (distinct from the D4 embed CSS, which remains open).
- Append to the out-of-scope register: any issues found during implementation (e.g. if the `data-latex=""` empty-key in the golden normalizer is worth a follow-up). If none, note "none".

- [ ] **Step 4: Commit the docs**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(a11y-2): mark done in backlog; withdraw vefur assistive-MathML CSS note

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Update project memory**

Update `~/.claude/projects/-home-siggi-dev-repos-namsbokasafn-efni/memory/`:
- Add a topic file `a11y-2-assistive-mathml.md` (math now has a self-contained visually-hidden MathML sibling; lives in `renderMathML`; reaches readers only after a re-render + manual sync) and a one-line `MEMORY.md` pointer; link `[[accessibility-alt-math-pending]]` (a11y-1 still open) and `[[content-sync-vefur-broken]]` (sync is manual).
- In `accessibility-alt-math-pending.md`, note Item 2 (math) is **done**; Item 1 (figure alt) remains.

---

## Delivery note (NOT in this PR — for whoever does the re-render)

The accessibility win reaches namsbokasafn.is only after a re-render + manual sync. Bundle with the pending stale-render re-render+sync PR:
```bash
for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch"; done
# then from ../namsbokasafn-vefur: node scripts/sync-content.js --source ../namsbokasafn-efni
```
Expect noisy `MJX-NN` MathJax-id renumbering across re-rendered files (cosmetic; see `objectives-page-data-pending`). Re-render every book that has published math, not just efnafraedi.

---

## Self-Review

- **Spec coverage:** §Architecture→Task 1; §Output shape→Task 1 (Steps 3); §Error handling (degrade to SVG-only)→Task 1 test 7 + `buildAssistiveMml` guard; §Testing list (a–e)→Task 1 tests 1-7; §behavior-changing/golden→Task 2; §A3-unaffected→Task 3 Step 1 (full suite incl. fidelity-check tests); §scope code+tests-only→Global Constraints + Delivery note; §out-of-scope (a11y-1, vefur withdrawn)→Task 3 Step 3 + memory. All covered.
- **Placeholder scan:** none — all steps carry real code/commands/expected output.
- **Type consistency:** `buildAssistiveMml(cleanMml, displayMode)`, `VISUALLY_HIDDEN_STYLE`, `class="assistive-mathml"`, and the `[ASSISTIVE-MML]` marker are used identically across Tasks 1-2.
