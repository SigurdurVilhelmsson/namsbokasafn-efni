# D1 PR-B — Config Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the config-as-data mechanism (PR-A, merged) into enforcement: `--book` required, fail-loud on a book with no `book-config.json`, no `chapter-modules` chemistry fallback, and `npm run validate` coverage — so a misconfigured book errors clearly instead of silently rendering chemistry/defaults.

**Architecture:** A shared `requireBook(args)` boundary check fronts every multi-book tool; `BOOK_OPTION` loses its chemistry default. `getBookRenderConfig` throws on a missing config (its only callers are render paths, which must refuse config-less books — so **no `--allow-default` escape exists**). `chapter-modules` errors instead of falling back to a hardcoded chemistry map. `validate-status.js` fails any book lacking a valid `book-config.json`.

**Tech Stack:** Node 22 ESM, Vitest. No new dependencies.

**Design spec:** [docs/plans/2026-06-29-d1-book-config-as-data-design.md](2026-06-29-d1-book-config-as-data-design.md) · **Depends on:** PR-A (#187, merged).

## Global Constraints

- **Robustness directive:** one real code path, fail loud, **no escape hatch** (lead 2026-06-29: `--allow-default` dropped as YAGNI — only render paths call `getBookRenderConfig`, and they must refuse config-less books). Memory `feedback-robustness-over-expedience`.
- **This is the behavior-CHANGING half.** Expect tests that relied on the chemistry default / SHARED-only fallback to need updating — that's intended, not collateral.
- Node 22 / ESM. Test gate is **local** `npm test` + `npm run validate`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File structure

- **Modify** `tools/lib/parseArgs.js` — add `fs`/`path`; add `requireBook(args)`; `BOOK_OPTION.default` → `null`.
- **Modify** the 9 multi-book tools — call `requireBook(args)` after the `args.help` exit: `cnxml-extract.js`, `api-translate.js`, `generate-tm.js`, `cnxml-fidelity-check.js`, `cnxml-linguistic-check.js`, `repair-emphasis.js`, `cnxml-render-fidelity-check.js`, `cnxml-render.js`, `cnxml-inject.js`.
- **Modify** `tools/lib/book-rendering-config.js` — `getBookRenderConfig` throws on missing config.
- **Modify** `server/services/renderService.js` — surface the throw as a clean error (not a crash).
- **Modify** `tools/lib/chapter-modules.js` — remove the `CHEMISTRY_2E_MODULES` fallback + map.
- **Modify** `scripts/validate-status.js` — require a valid `book-config.json` per book.
- **Tests:** `parseArgs.test.js`, `book-rendering-config.test.js`, `chapter-modules.test.js`, `pipeline-integration.test.js` + any other CLI-shelling spec.

---

### Task 1: `requireBook(args)` boundary helper

Add the helper but **do not wire it in or flip the default yet** — keeps the tree green so the helper is reviewed in isolation.

**Files:**
- Modify: `tools/lib/parseArgs.js` (add imports + `requireBook`)
- Test: `tools/__tests__/parseArgs.test.js`

**Interfaces:**
- Produces: `requireBook(args: {book: string|null, help: boolean}): void` — no-op on `help`; `process.exit(1)` with a clear message if `book` is falsy or `books/<book>/` is absent (cwd-relative).

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/parseArgs.test.js` (add `vi` to the vitest import if absent):

```js
import { requireBook } from '../lib/parseArgs.js';

describe('requireBook', () => {
  let exitSpy, errSpy;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('__exit__');
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('exits when --book is missing', () => {
    expect(() => requireBook({ book: null, help: false })).toThrow('__exit__');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits when the book directory does not exist', () => {
    expect(() => requireBook({ book: 'no-such-book-xyz', help: false })).toThrow('__exit__');
  });

  it('does not exit when --help was requested', () => {
    expect(() => requireBook({ book: null, help: true })).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('passes for an existing book directory', () => {
    expect(() => requireBook({ book: 'efnafraedi-2e', help: false })).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fails (requireBook not exported)**

Run: `npx vitest run tools/__tests__/parseArgs.test.js -t "requireBook"`
Expected: FAIL — `requireBook is not a function`.

- [ ] **Step 3: Implement**

At the top of `tools/lib/parseArgs.js` add imports:

```js
import fs from 'fs';
import path from 'path';
```

Add (e.g. after `BOOK_OPTION`):

```js
/**
 * Boundary check for multi-book tools: require a valid --book.
 * No-op when --help was requested (so help can still print). Otherwise exits
 * with a clear error if --book is missing or books/<book>/ does not exist.
 *
 * @param {{book: string|null, help: boolean}} args
 */
export function requireBook(args) {
  if (args.help) return;
  if (!args.book) {
    console.error('Error: --book is required (e.g. --book efnafraedi-2e)');
    process.exit(1);
  }
  if (!fs.existsSync(path.join('books', args.book))) {
    console.error(`Error: unknown book "${args.book}" — books/${args.book}/ does not exist`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tools/__tests__/parseArgs.test.js`
Expected: PASS (existing parseArgs tests + 4 new).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/parseArgs.js tools/__tests__/parseArgs.test.js
git commit -m "feat(cli): requireBook boundary check (D1 PR-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Make `--book` required (flip default + wire all tools + fix shelling tests)

Atomic behavior change: flipping the default breaks any tool/command that omitted `--book`, so the default flip, the `requireBook` wiring, and the test updates land together.

**Files:**
- Modify: `tools/lib/parseArgs.js:23` (`BOOK_OPTION.default` → `null`)
- Modify: the 9 tools listed in File structure (insert `requireBook(args)` after the `args.help` exit)
- Modify: `tools/__tests__/pipeline-integration.test.js` (+ any other CLI-shelling spec) to pass `--book`
- Modify: `tools/__tests__/parseArgs.test.js` if it asserts the old default

**Interfaces:**
- Consumes: `requireBook` (Task 1). Each tool already imports from `parseArgs.js` and has an `args.help` guard.

- [ ] **Step 1: Flip the default**

In `tools/lib/parseArgs.js`, `BOOK_OPTION`:

```js
export const BOOK_OPTION = {
  name: 'book',
  flags: ['--book'],
  type: 'string',
  default: null,
  parse: (val) => {
    if (!BOOK_SLUG_PATTERN.test(val)) {
      console.error('Error: --book must be alphanumeric with hyphens/underscores');
      process.exit(1);
    }
    return val;
  },
};
```

- [ ] **Step 2: Wire `requireBook` into each tool**

In **each** of the 9 tools, import `requireBook` (extend the existing `parseArgs.js` import) and call it immediately after the help-exit. The pattern in every tool's `main()`:

```js
import { parseArgs, BOOK_OPTION, /* … */, requireBook } from './lib/parseArgs.js';
// …
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  requireBook(args); // ← add this line
```

Apply at each tool's `args.help` site (line numbers from grep, re-confirm before editing): `cnxml-extract.js:1769`, `api-translate.js:629`, `generate-tm.js:423`, `cnxml-fidelity-check.js:191`, `cnxml-linguistic-check.js:229`, `repair-emphasis.js:243`, `cnxml-render-fidelity-check.js:238`, `cnxml-render.js:3229`, `cnxml-inject.js:3291`.

- [ ] **Step 3: Run the suite to surface every broken CLI-shelling command**

Run: `npm test 2>&1 | grep -E "Command failed|--book is required|FAIL"`
Expected: failures in `pipeline-integration.test.js` (and possibly `css-contract.test.js`) where `run(...)` invokes a tool without `--book`. This list is your work-list.

- [ ] **Step 4: Add `--book` to every shelled tool command in the failing specs**

In `tools/__tests__/pipeline-integration.test.js` (and any other failing spec), add `--book efnafraedi-2e` to every `node ${TOOLS}/cnxml-*.js …` / `api-translate.js …` invocation. (All target the copied `efnafraedi-2e` fixture, so the slug is uniform.) Example transform:

```js
// before
run(`node ${join(TOOLS, 'cnxml-inject.js')} --chapter 1 --module m68663 --source-dir 02-mt-output`);
// after
run(`node ${join(TOOLS, 'cnxml-inject.js')} --book efnafraedi-2e --chapter 1 --module m68663 --source-dir 02-mt-output`);
```

- [ ] **Step 5: Update any parseArgs test asserting the old default**

Run: `grep -n "efnafraedi-2e" tools/__tests__/parseArgs.test.js`
If a test asserts `BOOK_OPTION` defaults to `'efnafraedi-2e'` (or `parseArgs([])` yields `book: 'efnafraedi-2e'`), change the expectation to `null`.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. If a command still fails with `--book is required`, it was missed in Step 4 — add `--book` and re-run.

- [ ] **Step 7: Commit**

```bash
git add tools/lib/parseArgs.js tools/cnxml-extract.js tools/api-translate.js tools/generate-tm.js tools/cnxml-fidelity-check.js tools/cnxml-linguistic-check.js tools/repair-emphasis.js tools/cnxml-render-fidelity-check.js tools/cnxml-render.js tools/cnxml-inject.js tools/__tests__/pipeline-integration.test.js tools/__tests__/parseArgs.test.js
git commit -m "feat(cli): --book required across multi-book tools (D1 PR-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fail-loud on missing `book-config.json` (render paths)

**Files:**
- Modify: `tools/lib/book-rendering-config.js` (`getBookRenderConfig`: warn+fallback → throw)
- Modify: `tools/__tests__/book-rendering-config.test.js` (the PR-A SHARED-only-fallback test → expect throw)
- Modify: `server/services/renderService.js:85` (surface the throw cleanly)

**Interfaces:**
- Produces: `getBookRenderConfig(slug)` throws `Error` (message includes the slug) when `books/<slug>/book-config.json` is absent. `bookToDomain` is unchanged (still defaults to `'science'` — domain resolution must stay tolerant).

- [ ] **Step 1: Update the fallback test to expect a throw**

In `tools/__tests__/book-rendering-config.test.js`, replace the PR-A test `'falls back to SHARED-only for a book with no config file'`:

```js
  it('throws for a book with no config file (fail-loud)', () => {
    expect(() => getBookRenderConfig('no-such-book-xyz')).toThrow(/no-such-book-xyz/);
  });
```

- [ ] **Step 2: Run — fails (still returns SHARED-only)**

Run: `npx vitest run tools/__tests__/book-rendering-config.test.js -t "fail-loud"`
Expected: FAIL — no error thrown.

- [ ] **Step 3: Make `getBookRenderConfig` throw**

In `tools/lib/book-rendering-config.js`, change the missing-file branch:

```js
function getBookRenderConfig(bookSlug) {
  const file = readBookConfigFile(bookSlug);
  if (!file) {
    throw new Error(
      `No book-config.json for book "${bookSlug}" (books/${bookSlug}/book-config.json). ` +
        'Every book must have an explicit render config before it can be rendered.'
    );
  }
  return mergeWithShared(file);
}
```

(Leave `mergeWithShared(null)` defaulting in place — it is still used by nothing now, but keep it harmless; do not call it from `getBookRenderConfig`.)

- [ ] **Step 4: Run — passes; golden still green (5 configured books unaffected)**

Run: `npx vitest run tools/__tests__/book-rendering-config.test.js`
Expected: PASS (golden equality for the 5 configured books + fail-loud test).

- [ ] **Step 5: Surface the throw cleanly in the server**

Read `server/services/renderService.js` around line 85. Wrap the `getBookRenderConfig(book)` call so a missing config returns a clean editorial error instead of an unhandled throw:

```js
let bookConfig;
try {
  bookConfig = getBookRenderConfig(book);
} catch (err) {
  throw new Error(`Cannot render "${book}": ${err.message}`);
}
```

Then verify the render route already wraps `renderService` in try/catch (most do). Run the server render/preview specs:

Run: `npx vitest run server 2>&1 | tail -5`
Expected: PASS (all configured books render; no crash path introduced).

- [ ] **Step 6: Commit**

```bash
git add tools/lib/book-rendering-config.js tools/__tests__/book-rendering-config.test.js server/services/renderService.js
git commit -m "feat(config): fail-loud on missing book-config.json in render paths (D1 PR-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Remove the `chapter-modules` chemistry fallback

**Files:**
- Modify: `tools/lib/chapter-modules.js` (remove fallback + `CHEMISTRY_2E_MODULES` map + export)
- Modify: `tools/__tests__/chapter-modules.test.js` (delete the map data-integrity block; flip any fallback test to expect-throw)

**Interfaces:**
- Produces: `getChapterModules(chapter, bookSlug)` throws a clear error when no `collection-order.json` resolves for the book/chapter (instead of returning chemistry modules). `CHEMISTRY_2E_MODULES` no longer exported.

- [ ] **Step 1: Update the test — fallback becomes a throw; drop the map block**

In `tools/__tests__/chapter-modules.test.js`: delete the entire `describe('CHEMISTRY_2E_MODULES', …)` block and remove `CHEMISTRY_2E_MODULES` from the import. Add a fail-loud test:

```js
describe('getChapterModules fail-loud', () => {
  it('throws when no collection-order resolves for the book', () => {
    expect(() => getChapterModules(1, 'no-such-book-xyz')).toThrow(/collection-order/);
  });
});
```

- [ ] **Step 2: Run — fails (still falls back to chemistry, no throw)**

Run: `npx vitest run tools/__tests__/chapter-modules.test.js`
Expected: FAIL — the fail-loud test gets chemistry modules instead of a throw (and/or import error on the removed `CHEMISTRY_2E_MODULES`).

- [ ] **Step 3: Remove the fallback + map**

In `tools/lib/chapter-modules.js`: in `getChapterModules`, replace the `// Fallback: hardcoded chemistry map (legacy)` block (the `for … CHEMISTRY_2E_MODULES …` through the sort/return) with a throw:

```js
  throw new Error(
    `No collection-order.json entry for ${bookSlug || '(no --book)'} chapter ${chapter}. ` +
      'A book must provide books/<slug>/01-source/collection-order.json.'
  );
```

Delete the `CHEMISTRY_2E_MODULES` constant (the `const CHEMISTRY_2E_MODULES = { … }` block) and remove it from the `export { … }` line (leave `getChapterModules` exported).

- [ ] **Step 4: Run — passes**

Run: `npx vitest run tools/__tests__/chapter-modules.test.js`
Expected: PASS.

- [ ] **Step 5: Guard: confirm no configured/rendered book relies on the fallback**

Run: `npm test 2>&1 | grep -E "collection-order|FAIL" | head`
Expected: no new failures. If a render/integration spec for a book without `collection-order.json` now throws, give that book a `collection-order.json` (or scope it out of render). The 5 production books already have one.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/chapter-modules.js tools/__tests__/chapter-modules.test.js
git commit -m "feat(config): chapter-modules fail-loud, drop hardcoded chemistry map (D1 PR-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `validate` requires a valid `book-config.json` per book

**Files:**
- Modify: `scripts/validate-status.js` (after book discovery, ~line 200)
- Verify: `npm run validate`

**Interfaces:**
- Produces: `npm run validate` fails (non-zero, listed error) for any discovered book whose `book-config.json` is missing or lacks a `domain`.

- [ ] **Step 1: Add the per-book config check**

In `scripts/validate-status.js`, after the `books` array is finalized (and `bookFilter` applied, ~line 210) and before the per-chapter loop, add:

```js
// D1: every book must have a valid book-config.json (domain required)
for (const book of books) {
  const cfgPath = path.join(booksDir, book, 'book-config.json');
  if (!fs.existsSync(cfgPath)) {
    allErrors.push(`${book}: missing book-config.json`);
    continue;
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (!cfg.domain || typeof cfg.domain !== 'string') {
      allErrors.push(`${book}/book-config.json: missing or invalid "domain"`);
    }
  } catch (err) {
    allErrors.push(`${book}/book-config.json: invalid JSON (${err.message})`);
  }
}
```

Confirm `allErrors` is what drives the final non-zero exit (it is referenced near the end of the script); if the summary counts only `totalFiles`/`validFiles`, ensure a non-empty `allErrors` still forces `process.exit(1)` at the end.

- [ ] **Step 2: Run validate — passes (all discovered books are configured)**

Run: `npm run validate`
Expected: PASS — the 5 production books (the ones with a `chapters/` dir that validate discovers) all have `book-config.json` from PR-A.

- [ ] **Step 3: Prove the check bites — temporary negative test**

```bash
mv books/efnafraedi-2e/book-config.json /tmp/bc.json && npm run validate; echo "exit=$?"; mv /tmp/bc.json books/efnafraedi-2e/book-config.json
```
Expected: a `missing book-config.json` error and `exit=1`; then restored. Re-run `npm run validate` → PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-status.js
git commit -m "feat(validate): require a valid book-config.json per book (D1 PR-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (PR-B):**
- `--book` required across multi-book tools → Tasks 1 & 2. ✅
- Fail-loud on unknown/config-less book → Task 3 (render lib + server). ✅
- `--allow-default` → **dropped** (lead-approved YAGNI; no escape hatch). Spec's fencing requirement is satisfied vacuously — there is no escape to fence. ✅
- `chapter-modules` fallback removal → Task 4. ✅
- `validate` config coverage → Task 5. ✅
- Out of scope held: no render-config schema change, no new books, no PR-A mechanism churn. ✅

**Placeholder scan:** Repetitive edits (9-tool wiring, shelled-command `--book` additions) are given as a complete uniform pattern + a full-suite verification gate that enumerates the actual work-list — not "etc." placeholders. Every code step shows real code. ✅

**Type consistency:** `requireBook(args)` signature identical in Task 1 (def) and Task 2 (calls). `getBookRenderConfig(slug)` throw contract (Task 3) consumed by `renderService` (Task 3 Step 5) and unaffected for the 5 configured books (golden, Task 3 Step 4). `getChapterModules(chapter, bookSlug)` throw contract (Task 4) matches its test. `book-config.json` `domain` key (Task 5 validate) matches PR-A's schema. ✅

**Risk note:** Task 2 is the blast-radius task; its Step 3 deliberately uses the failing suite as the discovery mechanism for every command needing `--book`, so nothing is missed silently.
