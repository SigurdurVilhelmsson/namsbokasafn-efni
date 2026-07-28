# C1d — Appendix write-path publish enablement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the last structural block on appendix **publish** — `validate-chapter.js` (arg-parse + dir-builders) and `publicationService.validateBeforePublish` — so a POST to `…/appendices/mt-preview` reaches the pipeline instead of failing closed with a 500.

**Architecture:** `validateBeforePublish` sends the CLI-safe chapter form via `chapterLabel.cliChapterArg` (`'appendices'`, not `'-1'`); `validate-chapter.js` `parseArgs` captures `appendices`/`-1` as the chapter positional and normalizes it to `-1`; its dir-builders adopt the two on-disk conventions (`chapterDir` for `ch`-prefixed source/structure dirs, a bare appendix-aware helper for pub-output dirs). faithful/localized stay `checkTrackReadiness`-gated (empty dirs) until content exists — unchanged.

**Tech Stack:** Node.js 22. `tools/validate-chapter.js` is **ESM** (root `type:module`; `import`/`import.meta.url`). `server/lib/chapterLabel.js` and `server/services/publicationService.js` are **CommonJS**. Vitest. Run all tests from the **repo root** (`npm test`).

## Global Constraints

- **Canonical form (`server/lib/chapterLabel.js`):** `cliChapterArg(-1)→'appendices'`, `cliChapterArg(N)→String(N)`; `normalizeChapter('appendices'|'-1')→-1`, `normalizeChapter('0'|junk)→null`; `chapterDir(-1)→'appendices'`, `chapterDir(N)→'chNN'`.
- **Two on-disk dir conventions (C1a durable rule):** `ch`-prefixed source/structure dirs (`01-source/chNN`, `02-structure/chNN`) → for appendices `01-source/appendices` etc.; BARE pub-output dirs (`<pubDir>/chapters/NN`) → for appendices `<pubDir>/chapters/appendices`. `chapterDir` gives the `ch`-form; the pub-form needs `chapter === -1 ? 'appendices' : padStart`.
- **⚠️ AMENDED 2026-07-28 (pre-flight premise check) — `validateChapter:1055` is the DOMINANT dir site and was MISSING from this plan.** `validateChapter` builds `const chapterDir = \`ch${String(chapter).padStart(2,'0')}\`` (`:1055`) and passes it into `context` (`:1071`) and `results` (`:1080`); **12 validators destructure `chapterDir` from context** (`:84,:119,:192,:228,:287,:336,:394,:449,:487,:529,:620`) and build every `sourceDir`/`structureDir` from it. The original plan listed only `:706/:765/:819/:857` (bare pub) and `:900/:901/:935` (`ch`-prefixed) — with `:1055` unconverted the feature does **not** work: every source/structure check resolves `ch-1`, `results.valid` goes false, and `publishChapter` throws a 400 instead of a 500. It is also a **name collision** with the imported `chapterDir` helper (same shadow class as C1b's `:199`). **Rule: rename the local to `chapterDirName`; leave the context KEY `chapterDir` unchanged** so the 12 consumers need no edit.
- **No behavior change for numeric chapters (0..99):** `cliChapterArg(N)=String(N)`, `chapterDir(N)=chNN`, `parseArgs` unchanged for integer/flag args; pin byte-identity with an assertion (C1b lesson).
- **Fails-safe preserved:** this PR must NOT open a write path that bypasses `checkTrackReadiness`. faithful/localized still fail closed on empty dirs; mt-preview is the one newly-enabled write, and only when `02-mt-output/appendices` exists.
- **`validate-chapter.js` is widely used** (all publish validation) — the dir-builder change touches numeric publishing; the full suite + numeric-chapter pins are the regression gate.
- **Branch:** `fix/appendices-writepath-publish`. ~~Base main `2a990e67` (after C1b #324)~~ — **actual base main `46b50c58`** (C1c #325, C13 #337, C14 #343 and the Dependabot batch landed in between; every premise below was re-verified against that tree on 2026-07-28). Independent of C1c.
- **Commit trailer:** end every commit message with
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- **Modify** `tools/validate-chapter.js` — `parseArgs` (`:959-991`) + dir-builders (**context `:1055` ← the dominant site, added 2026-07-28**; bare pub `:706/:765/:819/:857`; `ch`-prefixed `:900/:901/:935`; **image-path regex `:791`, added 2026-07-28**) + a `chapterLabel` import. *(Tasks 1, 2)*
- **Modify** `server/services/publicationService.js` — `validateBeforePublish` argv (`:129`). *(Task 3)*
- **Test:** new `tools/__tests__/validateChapterAppendices.test.js` (parseArgs + **behavioural** dir resolution through `validateChapter({projectRoot})`, reusing the temp-dir harness idiom already in `tools/__tests__/validate-chapter.test.js`); extend a publicationService test (Task 3); a publish-route integration assertion (Task 4).

---

## Task 1: `validate-chapter.js parseArgs` accepts `appendices`/`-1`

**Files:**
- Modify: `tools/validate-chapter.js` (`parseArgs` `:959-991`; add a `chapterLabel` import)
- Test: `tools/__tests__/validateChapterAppendices.test.js` (create — **`.test.js`, NOT `.test.mjs`**: the `tools` vitest project globs `tools/__tests__/**/*.test.js` (confirmed in `vitest.workspace.js`); a `.test.mjs` here would silently never run. The file is ESM regardless — root `type:module` — so `import` works.)

**Interfaces:**
- Produces: `parseArgs(['book','appendices'])` and `parseArgs(['book','-1'])` both yield `{ chapter: -1, … }`; `parseArgs(['book','5'])` yields `{ chapter: 5, … }`; a real flag (`--track x`) still parsed.

- [ ] **Step 1: chapterLabel import mechanism**

`validate-chapter.js` is ESM; `parseArgs` is already exported (`tools/validate-chapter.js:1238` `export { validateChapter, parseArgs, … }`). Bring in the CJS `chapterLabel` via `createRequire`:
```js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { normalizeChapter, chapterDir } = require('../server/lib/chapterLabel');
```
(Confirm the relative path from `tools/` to `server/lib/chapterLabel.js` is `../server/lib/chapterLabel`.)

- [ ] **Step 2: Write the failing test**

```js
import { parseArgs } from '../validate-chapter.js'; // already exported at validate-chapter.js:1238
import { describe, it, expect } from 'vitest';

describe('validate-chapter parseArgs — appendices', () => {
  it('captures "appendices" as chapter -1', () => {
    expect(parseArgs(['efnafraedi-2e', 'appendices']).chapter).toBe(-1);
  });
  it('captures bare "-1" as chapter -1 (not dropped as a flag)', () => {
    expect(parseArgs(['efnafraedi-2e', '-1']).chapter).toBe(-1);
  });
  it('numeric chapter unchanged', () => {
    expect(parseArgs(['efnafraedi-2e', '5']).chapter).toBe(5);
  });
  it('a real flag is still parsed as a flag', () => {
    expect(parseArgs(['efnafraedi-2e', '5', '--track', 'mt-preview']).track).toBe('mt-preview');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- validateChapterAppendices`
Expected: FAIL — `appendices` → `NaN`; `-1` → `null` (dropped as a flag).

- [ ] **Step 4: Implement**

Add the `createRequire` + `chapterLabel` import (Step 1). (`parseArgs` is already exported at `:1238` — no export change needed.) Then change the positional handling (`:982-989`):
```js
// before
} else if (arg === '--track' && args[i + 1]) {
  result.track = args[++i];
} else if (!arg.startsWith('-')) {
  if (!result.book) {
    result.book = arg;
  } else if (!result.chapter) {
    result.chapter = parseInt(arg, 10);
  }
}
// after
} else if (arg === '--track' && args[i + 1]) {
  result.track = args[++i];
} else if (!arg.startsWith('-')) {
  if (!result.book) {
    result.book = arg;
  } else if (result.chapter === null) {
    result.chapter = normalizeChapter(arg); // 'appendices'->-1, '5'->5, junk->null
  }
} else if (result.book && result.chapter === null && normalizeChapter(arg) === -1) {
  // bare "-1" (appendices) after the book positional — starts with '-' but is a chapter, not a flag
  result.chapter = -1;
}
```
(Use `result.chapter === null` — not `!result.chapter` — so a legitimate `0` or `-1` is not re-parsed.)

**⚠️ AMENDED 2026-07-28:** the bare-negative branch is bound to **exactly `-1`**, not the plan's original `normalizeChapter(arg) !== null`. The looser form would silently swallow `-5`, `-99` etc. as chapter numbers; `chapterLabel`'s own contract says bounds are each caller's policy, and `-1` is the only negative this repo has. Add a test pinning that `parseArgs(['book','-5']).chapter` stays `null`.

- [ ] **Step 5: Run test to verify it passes** — `npm test -- validateChapterAppendices` → PASS.

- [ ] **Step 6: Full suite** — `npm test` → all green (no existing validate-chapter numeric behavior regressed).

- [ ] **Step 7: Commit**

```bash
git add tools/validate-chapter.js tools/__tests__/validateChapterAppendices.test.js
git commit -m "fix(validate-chapter): parseArgs accepts appendices/-1 as chapter (C1d B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `validate-chapter.js` dir-builders (both conventions)

**Files:**
- Modify: `tools/validate-chapter.js` (**context builder `:1055`**; bare pub dirs `:706/:765/:819/:857`; `ch`-prefixed `:900/:901/:935`; **image-path regex `:791`**)
- Test: extend `tools/__tests__/validateChapterAppendices.test.js`

**⚠️ TWO SITES ADDED 2026-07-28 — see Global Constraints. Neither was in the original plan.**

**(a) `:1055` — `validateChapter`'s context builder. This is the site that makes the feature work.** 12 validators read `chapterDir` off `context`; leaving it as `ch${padStart}` yields `ch-1` and a 400. Rename the LOCAL only:
```js
// before
const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
const statusPath = path.join(root, 'books', book, 'chapters', chapterDir, 'status.json');
// after — local renamed to avoid shadowing the imported helper; context KEY unchanged
const chapterDirName = chapterDir(chapter);
const statusPath = path.join(root, 'books', book, 'chapters', chapterDirName, 'status.json');
// ...and in BOTH the `context` object (:1071) and the `results` object (:1080):
chapterDir: chapterDirName,
```
The `results.chapterDir` field is part of the tool's `--json` output that `validateBeforePublish` parses — it keeps the same key and, for numeric chapters, the same value.

**(b) `:791` — `html-images-exist` image-path regex.** `new RegExp(\`^/content/${book}/chapters/\\\\d+/\`)` never matches `chapters/appendices/`, so an appendix page's `/content/…` image src is never reduced to its basename; `path.join(pubDir, relativeSrc)` then probes a path that cannot exist and the check falls through to the `01-source/media` fallback. Widen to `(?:\\d+|appendices)`. **Severity note:** this validator is `SEVERITY.WARNING` and `validateBeforePublish` spawns **without `--strict`**, so it can never set `valid:false` — it cannot block a publish. It is included because it sits inside the path C1d turns on, not because it gates.

**Interfaces:**
- Consumes: `chapterDir` (imported in Task 1). Adds a local `pubChapterDirName(chapter)` helper.
- After Task 1, `parseArgs` yields `chapter: -1` for appendices; every check receives that integer `chapter`.

- [ ] **Step 1: Write the failing test**

**⚠️ TEST APPROACH AMENDED 2026-07-28 — assert BEHAVIOURALLY, do not export `pubChapterDirName` just to pin it.** A static pin on a pure helper proves the helper exists; it does **not** prove the 12 `context.chapterDir` consumers resolve correctly, which is the whole risk here (and is exactly the "static pins prove presence not behavior" lesson in CLAUDE.md/memory).

`tools/__tests__/validate-chapter.test.js` already carries the right idiom: a temp dir passed as `projectRoot`, with `setupBook`/`setupHtmlPub` writing a minimal book tree. Mirror it in the new file with appendix variants (`01-source/appendices`, `02-structure/appendices`, `<pubDir>/chapters/appendices`, `chapters/appendices/status.json`) and drive the real entry point:

```js
const results = await validateChapter({ book, chapter: -1, track: 'mt-preview', projectRoot: tmp });
// positive: the dir-resolving checks actually PASS against the appendix tree
expect(results.checks['is-segments-exist'].passed).toBe(true);
// negative: no wrong-convention path leaks anywhere in the output
expect(JSON.stringify(results)).not.toMatch(/ch-1|chappendices|chapters[\\/\\\\]-1/);
// byte-identity pin for numeric chapters (the C1b lesson — pin, don't reason)
expect((await validateChapter({ book, chapter: 5, ... })).chapterDir).toBe('ch05');
```
Keep the numeric-chapter pin for **both** conventions (`ch05` for source/structure, bare `05` for pub output) — the C1a regression risk is a well-meaning "DRY" refactor collapsing the bare pub dir onto `chapterDir()`. `server/__tests__/publicationAppendices.test.js` already pins the same pair on the server side; mirror its intent.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- validateChapterAppendices`
Expected: FAIL — the pub dirs build bare `-1`; the source dirs build `ch-1`.

- [ ] **Step 3: Implement**

Near the top of `validate-chapter.js` (after the `chapterLabel` import), add the bare pub helper:
```js
// Publication output dirs are BARE (`<pubDir>/chapters/05`, `.../appendices`),
// unlike the ch-prefixed source/structure dirs. chapterDir() gives the ch-form,
// so the bare pub form needs its own builder.
const pubChapterDirName = (ch) => (ch === -1 ? 'appendices' : String(ch).padStart(2, '0'));
```

Bare pub-dir sites (`:703→:706`, `:762→:765`, `:816→:819`, `:854→:857`) — at each, drop the local `const chapterStr = String(chapter).padStart(2, '0')` and use the helper in the `path.join`:
```js
// before
const chapterStr = String(chapter).padStart(2, '0');
...
const pubDir = path.join(root, 'books', book, trackConfig.pubDir, 'chapters', chapterStr);
// after (remove the chapterStr line if unused elsewhere in the block)
const pubDir = path.join(root, 'books', book, trackConfig.pubDir, 'chapters', pubChapterDirName(chapter));
```

`ch`-prefixed source/structure site (`:898→:900/:901/:935`) — replace `ch${chapterStr}` with `chapterDir(chapter)`:
```js
// before
const chapterStr = String(chapter).padStart(2, '0');
const structDir = path.join(root, 'books', book, '02-structure', `ch${chapterStr}`);
const sourceDir = path.join(root, 'books', book, '01-source', `ch${chapterStr}`);
// ... later
`ch${chapterStr}`,
// after
const chapterDirName = chapterDir(chapter);
const structDir = path.join(root, 'books', book, '02-structure', chapterDirName);
const sourceDir = path.join(root, 'books', book, '01-source', chapterDirName);
// ... later
chapterDirName,
```
Verify each edited block: if `chapterStr` is used for anything OTHER than the dir (e.g. a message string), keep a local for that use. Grep the block first.

- [ ] **Step 4: Run test to verify it passes** — `npm test -- validateChapterAppendices` → PASS.

- [ ] **Step 5: Full suite** — `npm test` → all green (numeric dir resolution byte-identical).

- [ ] **Step 6: Commit**

```bash
git add tools/validate-chapter.js tools/__tests__/validateChapterAppendices.test.js
git commit -m "fix(validate-chapter): dir-builders resolve appendices (both conventions) (C1d B3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `validateBeforePublish` sends CLI-safe chapter arg

**Files:**
- Modify: `server/services/publicationService.js` (`validateBeforePublish` argv `:126-132`)
- Test: new/extended publicationService test asserting the spawned argv

**Interfaces:**
- Consumes: `chapterLabel.cliChapterArg` (publicationService is CJS — `require('../lib/chapterLabel')`; confirm it isn't already imported, else reuse).

- [ ] **Step 1: Write the failing test**

Assert that `validateBeforePublish(book, -1, 'mt-preview')` spawns `validate-chapter.js` with `'appendices'` in argv (not `'-1'`), and `validateBeforePublish(book, 5, 'mt-preview')` spawns `'5'`. Easiest: `vi.mock('child_process')` (or spy on `spawn`) and inspect the args array; the function returns a Promise that you can let reject/resolve on the mocked child.

```js
// shape:
// const spawnSpy = vi.spyOn(childProcess, 'spawn').mockReturnValue(fakeChild);
// validateBeforePublish('efnafraedi-2e', -1, 'mt-preview');
// expect(spawnSpy.mock.calls[0][1]).toContain('appendices');
// expect(spawnSpy.mock.calls[0][1]).not.toContain('-1');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- publicationService`
Expected: FAIL — argv contains `'-1'`.

- [ ] **Step 3: Implement**

In `server/services/publicationService.js`, add `const { cliChapterArg } = require('../lib/chapterLabel');` (if not already importing `chapterLabel`), then (`:129`):
```js
// before
const args = [
  path.join(TOOLS_DIR, 'validate-chapter.js'),
  bookSlug,
  String(chapterNum),
  '--track',
  track,
  '--json',
];
// after
const args = [
  path.join(TOOLS_DIR, 'validate-chapter.js'),
  bookSlug,
  cliChapterArg(chapterNum), // 'appendices' for -1, String(N) for numeric
  '--track',
  track,
  '--json',
];
```

- [ ] **Step 4: Run test to verify it passes** — `npm test -- publicationService` → PASS.

- [ ] **Step 5: Full suite** — `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add server/services/publicationService.js server/__tests__/
git commit -m "fix(publication): validateBeforePublish sends cliChapterArg for appendices (C1d B1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: End-to-end publish-path assertion (mt-preview reaches publish; faithful readiness-gated)

**Files:**
- Test: extend the publication route test (mirror the harness that already exercises `/api/publication/:book/:chapter/:track`)
- (No new production code expected — this task VERIFIES B1–B3 compose. If it reveals a gap, fix it here and note it.)

**Interfaces:**
- Consumes: the full publish path (`publication.js` route → `publishChapter` → `validateBeforePublish` → `validate-chapter.js`).

- [ ] **Step 1: Write the failing/verifying test**

**⚠️ AMENDED 2026-07-28 — assert POSITIVELY. "The failure reason is no longer a 500" can pass vacuously while the feature is broken** (any new failure mode satisfies it). Required assertions:

1. **`validateBeforePublish('efnafraedi-2e', -1, 'mt-preview')` resolves** with parseable results (pre-fix: rejects on empty stdout). Against the **real committed** `books/efnafraedi-2e/02-mt-output/appendices` (13 modules) — the same real-content idiom `server/__tests__/publicationAppendices.test.js` uses.
2. **The dir-resolving checks PASS** for the appendix chapter — i.e. `is-segments-exist` (and the structure check) report `passed: true`, proving `context.chapterDir` resolved the real `appendices/` tree.
3. **No wrong-convention path anywhere** in the returned errors/warnings: nothing matches `ch-1`, `chappendices`, or `chapters/-1`.
4. **Fail-closed preserved:** `checkTrackReadiness('efnafraedi-2e', -1, 'faithful')` stays `ready: false` (no `03-faithful-translation/appendices` on disk), so `publishChapter` still throws *before* validation for that track.

**⚠️ Do NOT assert `results.valid === true` globally** against real appendix content. The content-quality validators (`manifest-consistency` in particular) run against the real 2247-file `02-structure/appendices` tree for the first time here; a genuine source-hash or segment-count finding there is a **data** finding, not a tool bug. Pinning global validity would pin data, and would tempt a future silencing of a real validator. Log any such finding to the register instead.

- [ ] **Step 2: Run test**

Run: `npm test -- publication`
Expected: if B1–B3 compose, this passes; if a gap remains (e.g. an un-converted dir-builder in the publish path), it fails — fix the specific gap here.

- [ ] **Step 3: Implement any gap found** (only if Step 2 fails). Otherwise none.

- [ ] **Step 4: Full suite** — `npm test` → all green.

- [ ] **Step 5: Commit** (if any change; else skip to Task 5)

```bash
git add server/__tests__/
git commit -m "test(publication): appendix mt-preview reaches publish; faithful stays readiness-gated (C1d B4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full-suite gate + docs/register + whole-branch review + PR

- [ ] **Step 1: Full suite from repo root** — `npm test` → all green. Any newly-red existing test is a real regression (validate-chapter is widely used) — fix, don't update.

- [ ] **Step 2: Update the campaign register**

In `docs/plans/2026-07-21-post-item17-followup-campaign.md`, under C1: mark the **C1d write-path publish enablement DELIVERED in PR-4** (validate-chapter.js parseArgs + dir-builders + validateBeforePublish cliChapterArg); note appendix **mt-preview** publish is now enabled (faithful/localized await content, correctly readiness-gated); note **no data-op** and the first real appendix publish is a later editorial action; with C1c merged, confirm C1 code-complete except U3b backlog.

- [ ] **Step 3: Commit docs**

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(campaign): C1d write-path publish enablement delivered (PR-4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Whole-branch adversarial review + PR**

Run a whole-branch adversarial review (the C1a/C1b pattern — lenses over correctness / the two dir-convention handling / numeric-chapter byte-identity / fails-safe preservation (readiness gate not bypassed) / test integrity), triage, then open the PR (lead merges). **PR body MUST state:** what's delivered; that appendix mt-preview publish is now enabled but there is **no appendix content to publish yet** (forward-looking); that faithful/localized stay readiness-gated; no data-op / re-render; deploy gated by A4.

---

## Self-Review

**Spec coverage:** B1 validateBeforePublish cliChapterArg → Task 3; B2 parseArgs → Task 1; B3 dir-builders (both conventions) → Task 2; B4 end-to-end → Task 4; gate+docs+review → Task 5. ✅

**Placeholder scan:** Task 1 Step 1 flags "confirm the tools test glob" and "confirm the relative path" as verification pointers with the concrete file to check (`vitest.workspace.js`), not TBDs. Task 4 is a verify-then-fix-if-needed task by design (the composition may already work). No TODO.

**Type consistency:** `cliChapterArg` returns a string (`'appendices'`/`String(N)`); `normalizeChapter` returns `number|null`; `chapterDir` returns `chNN`/`appendices`; `pubChapterDirName` returns bare `NN`/`appendices`. `parseArgs().chapter` is `number|null` (−1 for appendices). Used consistently across tasks.
