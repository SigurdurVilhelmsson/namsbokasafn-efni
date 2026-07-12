# Structural-Marker Backstop Implementation Plan (Campaign Item 4, SR-OOS-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared structural-marker rule module enforced server-side (400/skip) on every route that writes pending segment content, with both client panes converged on it — per `docs/plans/2026-07-12-structural-marker-backstop-design.md` (D1–D8).

**Architecture:** New UMD module `server/public/js/segment-validation.js` returns structured violation codes. Enforcement sites (4): segment-editor `POST /edit` (inline 400, baselines server-loaded via `segmentParser.loadModuleForEditing`), localization `POST /save` and `POST /save-all` (inline 400, baselines from the already-loaded `loadModuleForLocalization` data), `propagationService.createPropagatedEdits` (per-occurrence `skipped` verdict). Both client panes call the shared module and keep their own `UI.validation` wording.

**Tech Stack:** Node 22 CJS server, Express 5, vanilla-JS IIFE client bundles, Vitest.

## Global Constraints

- Branch `fix/structural-marker-backstop` (off `main` @ `febebbcc`); one PR. Gate: `npm test` from repo root (baseline **2396** green). Commit per task; commit messages end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- **Server enforces HARD BLOCKS only** (design D3): codes `math-missing`, `br-removed`, `xref-missing`, `link-removed`, `docref-missing`, `media-missing`, `space-removed`. Warnings (`unmatched-pair`, `unmatched-emphasis`, `unmatched-subscript`, `unmatched-superscript`, `segment-cleared`) are NEVER enforced server-side.
- **Baselines are ALWAYS server-resolved** (design D5): segment editor → `seg.en`/`seg.is` from `segmentParser.loadModuleForEditing`; localization → `seg.en`/`seg.faithful` from `loadModuleForLocalization`; propagation → source segment's raw `en` + each occurrence's `currentIs`. NEVER validate against client-supplied `originalContent` (a bypasser controls it).
- **Identity parity** (design §5): the segment-editor client skips validation entirely when the edit equals the baseline (withdraw path, `segment-editor.js:1141`). The server guard therefore SKIPS validation when `editedContent === seg.is` — otherwise withdrawals on MT-degraded segments (baseline itself missing an EN marker) would 400 where the UI succeeds.
- 400 body shape: `{ error: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.', violations: [{ code, params }] }` (bulk: `params` includes `segmentId`). Icelandic summary verbatim as written here.
- The shared module is dependency-free, no DOM, UMD footer exactly in the `marker-highlight.js:109-113` shape (`root.segmentValidation = ...` + `module.exports` guard, IIFE over `typeof window !== 'undefined' ? window : globalThis`).
- Logger convention: `const log = require('../lib/logger')`; merged object first, message second. The batch-4 tripwire (`activityLogCallsiteGuard.test.js`) bans silent empty catches in routes/services — do not add any.
- Rule regexes are ported VERBATIM from `server/public/js/segment-editor.js:1027-1126` (the two client copies are rule-identical for all 7 blocks — verified 2026-07-12; the localization copy merely lacks the tilde/caret warnings and uses shorter messages).

---

### Task 1: Shared rule module + unit tests

**Files:**
- Create: `server/public/js/segment-validation.js`
- Create: `server/__tests__/segmentValidation.test.js`

**Interfaces:**
- Produces: `validateStructure(enText, originalIs, editedIs)` → `{ blocked: Array<{code, params}>|null, warnings: Array<{code, params}>|null }`. Browser global `window.segmentValidation.validateStructure`; CJS `require('../public/js/segment-validation').validateStructure`. Tasks 2–6 consume exactly this signature.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/segmentValidation.test.js`:

```js
/**
 * Shared structural-marker rules (SR-OOS-2, design D1/D2).
 * Table-driven: one violating and one passing case per hard block,
 * warning cases, and the identity case. These rules are the single
 * source of truth for both client panes AND the server backstop.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateStructure } = require('../public/js/segment-validation');

function codes(result) {
  return (result.blocked || []).map((v) => v.code);
}

describe('hard blocks', () => {
  const HARD_CASES = [
    {
      name: 'math-missing: [[MATH:N]] in EN must appear in edited IS',
      en: 'Energy [[MATH:1]] equals',
      orig: 'Orka [[MATH:1]] jafngildir',
      bad: 'Orka jafngildir',
      good: 'Orka jafngildir [[MATH:1]]',
      code: 'math-missing',
    },
    {
      name: 'br-removed: [[BR]] count must not decrease vs original IS',
      en: 'Line one',
      orig: 'Lína eitt[[BR]]lína tvö',
      bad: 'Lína eitt lína tvö',
      good: 'Lína eitt[[BR]]lína tvö breytt',
      code: 'br-removed',
    },
    {
      name: 'xref-missing: [#CNX_...] in EN must appear in edited IS',
      en: 'See [#CNX_Chem_05_02]',
      orig: 'Sjá [#CNX_Chem_05_02]',
      bad: 'Sjá myndina',
      good: 'Sjá [#CNX_Chem_05_02] hér',
      code: 'xref-missing',
    },
    {
      name: 'link-removed: [text](url) in original IS must be kept',
      en: 'plain',
      orig: 'Sjá [hlekkinn](#anchor) hér',
      bad: 'Sjá hlekkinn hér',
      good: 'Hér er [hlekkinn](#anchor)',
      code: 'link-removed',
    },
    {
      name: 'docref-missing: [doc#target] in EN must appear in edited IS',
      en: 'See [m68674#fs-id123]',
      orig: 'Sjá [m68674#fs-id123]',
      bad: 'Sjá tilvísunina',
      good: 'Tilvísun: [m68674#fs-id123]',
      code: 'docref-missing',
    },
    {
      name: 'media-missing: [[MEDIA:N]] in EN must appear in edited IS',
      en: 'Figure [[MEDIA:2]]',
      orig: 'Mynd [[MEDIA:2]]',
      bad: 'Mynd',
      good: '[[MEDIA:2]] Mynd',
      code: 'media-missing',
    },
    {
      name: 'space-removed: [[SPACE]] count must not decrease vs original IS',
      en: 'a b',
      orig: 'a[[SPACE]]b',
      bad: 'a b',
      good: 'a[[SPACE]]b og c',
      code: 'space-removed',
    },
  ];

  for (const c of HARD_CASES) {
    it(`${c.name} — violating edit is blocked`, () => {
      const result = validateStructure(c.en, c.orig, c.bad);
      expect(codes(result)).toContain(c.code);
    });
    it(`${c.name} — conforming edit passes`, () => {
      const result = validateStructure(c.en, c.orig, c.good);
      expect(codes(result)).not.toContain(c.code);
    });
  }

  it('identity edit passes every original-IS rule', () => {
    const orig = 'a[[SPACE]]b[[BR]][hlekkur](#x)';
    const result = validateStructure('a b', orig, orig);
    expect(result.blocked).toBeNull();
  });

  it('params carry the offending marker (math)', () => {
    const result = validateStructure('x [[MATH:7]]', 'y', 'y');
    const v = result.blocked.find((b) => b.code === 'math-missing');
    expect(v.params.marker).toBe('[[MATH:7]]');
  });

  it('br-removed params carry from/to counts', () => {
    const result = validateStructure('', 'a[[BR]]b[[BR]]c', 'a[[BR]]bc');
    const v = result.blocked.find((b) => b.code === 'br-removed');
    expect(v.params).toEqual({ from: 2, to: 1 });
  });
});

describe('warnings (advisory — never enforced server-side)', () => {
  it('odd ** count → unmatched-pair (bold)', () => {
    const result = validateStructure('', 'a', 'feitletrað ** stakt');
    const w = (result.warnings || []).find((x) => x.code === 'unmatched-pair');
    expect(w).toBeTruthy();
    expect(w.params.marker).toBe('**');
  });

  it('{= without =} → unmatched-emphasis', () => {
    const result = validateStructure('', 'a', '{= áhersla');
    expect((result.warnings || []).map((w) => w.code)).toContain('unmatched-emphasis');
  });

  it('odd tilde → unmatched-subscript; ~~ ignored', () => {
    const odd = validateStructure('', 'a', 'H~2O');
    expect((odd.warnings || []).map((w) => w.code)).toContain('unmatched-subscript');
    const strike = validateStructure('', 'a', 'texti ~~yfirstrikað~~ texti');
    expect((strike.warnings || []).map((w) => w.code)).not.toContain('unmatched-subscript');
  });

  it('odd caret → unmatched-superscript', () => {
    const result = validateStructure('', 'a', 'Ca^2+');
    expect((result.warnings || []).map((w) => w.code)).toContain('unmatched-superscript');
  });

  it('cleared segment → segment-cleared', () => {
    const result = validateStructure('', 'innihald', '   ');
    expect((result.warnings || []).map((w) => w.code)).toContain('segment-cleared');
  });

  it('clean edit → both null', () => {
    const result = validateStructure('plain', 'hreint', 'hreint breytt');
    expect(result.blocked).toBeNull();
    expect(result.warnings).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/segmentValidation.test.js`
Expected: FAIL — `Cannot find module '../public/js/segment-validation'`

- [ ] **Step 3: Write the module**

Create `server/public/js/segment-validation.js`. Rules ported verbatim from `segment-editor.js:1027-1126`; only the return values change (codes+params instead of `UI.validation` strings). UMD shape copied from `marker-highlight.js`:

```js
/**
 * Shared structural-marker validation (SR-OOS-2).
 *
 * ONE rule set, three consumers: the segment-editor pane, the
 * localization-editor pane, and the server-side save backstop. Rules are
 * pure and return structured violation codes; each consumer formats its
 * own wording (clients via UI.validation, server via its 400 body).
 *
 * blocked  = hard integrity rules (injection/render breaks without them);
 *            the server rejects these on save.
 * warnings = advisory only; NEVER enforced server-side (design D3).
 *
 * UMD: browser global `segmentValidation` + CommonJS module.exports,
 * same pattern as marker-highlight.js.
 */
(function (root) {
  'use strict';

  /**
   * @param {string} enText     EN source segment (trusted, server-loaded)
   * @param {string} originalIs baseline IS text (segment editor: seg.is;
   *                            localization: seg.faithful)
   * @param {string} editedIs   the proposed content
   * @returns {{ blocked: Array<{code:string, params:Object}>|null,
   *             warnings: Array<{code:string, params:Object}>|null }}
   */
  function validateStructure(enText, originalIs, editedIs) {
    var blocked = [];
    var warnings = [];
    var en = enText || '';
    var orig = originalIs || '';
    var edited = editedIs || '';

    // Hard block: [[MATH:N]] in EN but missing from edited IS
    var enMath = en.match(/\[\[MATH:\d+\]\]/g) || [];
    for (var i = 0; i < enMath.length; i++) {
      if (edited.indexOf(enMath[i]) === -1) {
        blocked.push({ code: 'math-missing', params: { marker: enMath[i] } });
      }
    }

    // Hard block: [[BR]] removed (present in original IS but not edited)
    var origBR = orig.match(/\[\[BR\]\]/g) || [];
    var editBR = edited.match(/\[\[BR\]\]/g) || [];
    if (origBR.length > editBR.length) {
      blocked.push({ code: 'br-removed', params: { from: origBR.length, to: editBR.length } });
    }

    // Hard block: [#CNX_...] cross-references in EN but missing from edited IS
    var enXrefs = en.match(/\[#[A-Za-z0-9_.-]+\]/g) || [];
    for (var j = 0; j < enXrefs.length; j++) {
      if (edited.indexOf(enXrefs[j]) === -1) {
        blocked.push({ code: 'xref-missing', params: { ref: enXrefs[j] } });
      }
    }

    // Hard block: [text](#anchor) or [text](doc#target) links in original IS but removed
    var origLinks = orig.match(/\[[^\]]+\]\([^)]+\)/g) || [];
    for (var l = 0; l < origLinks.length; l++) {
      if (edited.indexOf(origLinks[l]) === -1) {
        blocked.push({ code: 'link-removed', params: { link: origLinks[l] } });
      }
    }

    // Hard block: [doc#target] self-closing document refs in EN but missing from edited IS
    var enDocRefs = en.match(/\[[A-Za-z0-9_.-]+#[A-Za-z0-9_.-]+\]/g) || [];
    for (var k = 0; k < enDocRefs.length; k++) {
      if (edited.indexOf(enDocRefs[k]) === -1) {
        blocked.push({ code: 'docref-missing', params: { ref: enDocRefs[k] } });
      }
    }

    // Hard block: [[MEDIA:N]] in EN but missing from edited IS
    var enMedia = en.match(/\[\[MEDIA:\d+\]\]/g) || [];
    for (var n = 0; n < enMedia.length; n++) {
      if (edited.indexOf(enMedia[n]) === -1) {
        blocked.push({ code: 'media-missing', params: { marker: enMedia[n] } });
      }
    }

    // Hard block: [[SPACE]] / [[SPACE:N]] in original IS but removed
    var origSpaces = orig.match(/\[\[SPACE(?::\d+)?\]\]/g) || [];
    var editSpaces = edited.match(/\[\[SPACE(?::\d+)?\]\]/g) || [];
    if (origSpaces.length > editSpaces.length) {
      blocked.push({
        code: 'space-removed',
        params: { from: origSpaces.length, to: editSpaces.length },
      });
    }

    // Warning: unmatched formatting pairs (odd count)
    var pairs = [
      { marker: '**', re: /\*\*/g },
      { marker: '__', re: /__/g },
      { marker: '++', re: /\+\+/g },
    ];
    for (var p = 0; p < pairs.length; p++) {
      var count = (edited.match(pairs[p].re) || []).length;
      if (count % 2 !== 0) {
        warnings.push({ code: 'unmatched-pair', params: { marker: pairs[p].marker, count: count } });
      }
    }

    // Asymmetric pair: {= must match =}
    var openEmph = (edited.match(/\{=/g) || []).length;
    var closeEmph = (edited.match(/=\}/g) || []).length;
    if (openEmph !== closeEmph) {
      warnings.push({ code: 'unmatched-emphasis', params: { open: openEmph, close: closeEmph } });
    }

    // Warning: unmatched ~ for subscript (ignore ~~ strikethrough)
    var tildeCount = (edited.match(/(?<![~])~(?!~)/g) || []).length;
    if (tildeCount % 2 !== 0) {
      warnings.push({ code: 'unmatched-subscript', params: { count: tildeCount } });
    }

    // Warning: unmatched ^ for superscript
    var caretCount = (edited.match(/\^/g) || []).length;
    if (caretCount % 2 !== 0) {
      warnings.push({ code: 'unmatched-superscript', params: { count: caretCount } });
    }

    // Warning: segment cleared when original had content
    if (orig.trim() && !edited.trim()) {
      warnings.push({ code: 'segment-cleared', params: {} });
    }

    return {
      blocked: blocked.length > 0 ? blocked : null,
      warnings: warnings.length > 0 ? warnings : null,
    };
  }

  if (typeof root !== 'undefined') root.segmentValidation = { validateStructure: validateStructure };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validateStructure: validateStructure };
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/segmentValidation.test.js`
Expected: PASS (all table cases)

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-validation.js server/__tests__/segmentValidation.test.js
git commit -m "feat(validation): shared structural-marker rule module (UMD, violation codes) (SR-OOS-2 D1/D2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Segment-editor save backstop (`POST /edit`)

**Files:**
- Modify: `server/routes/segment-editor.js` (the `POST /:book/:chapter/:moduleId/edit` handler, ~:310-349 — guard inserted after the basic body checks, BEFORE `segmentEditor.saveSegmentEdit`)
- Create: `server/__tests__/segmentEditBackstop.test.js`

**Interfaces:**
- Consumes: `validateStructure` from Task 1; `segmentParser.loadModuleForEditing(book, chapterNum, moduleId)` → `{ segments: [{ segmentId, en, is, ... }] }` (the same loader the GET at `:265` uses).
- Produces: the 400 shape `{ error: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.', violations }` and 404 `{ error: 'segment not found' }` that Task 7's static pins reference.

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/segmentEditBackstop.test.js`. Harness: router introspection (books-routes/adminBooksHonesty precedent) + the committed fixture book `books/__e2e-fixture__` (real EN/IS module files — copy the fixture usage + `.locked`-marker teardown idiom from `server/__tests__/mtLockOnFirstEdit.test.js`, which drives `saveSegmentEdit` against the same fixture). Env before any server require (`SESSIONS_DB_PATH` → temp file, `JWT_SECRET`), `runAllMigrations()`.

```js
/**
 * Server-side structural-marker backstop on POST /edit (SR-OOS-2, design D4/D5).
 *
 * The client's hard-block gate is bypassable (direct API call); this pins
 * that the ROUTE now rejects structural violations with 400 + violation
 * codes, using SERVER-loaded baselines (never the client's originalContent),
 * skips validation on identity edits (withdraw parity, design §5), and 404s
 * unknown segment ids.
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'backstop-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

// ... beforeAll: runAllMigrations(); require router; locate the
// POST /:book/:chapter/:moduleId/edit layer; extract final handler.
// Pick a real fixture segment: load segmentParser.loadModuleForEditing on the
// fixture book/chapter/module used by mtLockOnFirstEdit.test.js and take a
// segment whose `en` is non-empty; derive violating content by injecting an
// EN [[MATH:9]]-style requirement is NOT possible per-test — instead derive
// the violating edit from the segment's OWN baseline: append nothing and
// strip a marker the baseline carries, or (robust across fixtures) pick the
// EN-side rule: edited content that omits an EN [[MATH/MEDIA/xref]] marker
// the fixture segment actually has; if the fixture has none, use the
// original-IS rules: baseline + '[[BR]]' saved first is NOT possible without
// a save — so use link/BR/SPACE only if present. The test MUST introspect
// the fixture segment and select an applicable rule, failing loudly with a
// clear message if the fixture offers no marker-bearing segment (see Step 2).
```

The introspect-and-select shape, concretely (this is the full test logic to implement):

```js
function pickMarkerCase(segments) {
  for (const seg of segments) {
    const en = seg.en || '';
    const is = seg.is || '';
    const m = en.match(/\[\[MATH:\d+\]\]/) || en.match(/\[\[MEDIA:\d+\]\]/);
    if (m && is.includes(m[0])) {
      return { seg, marker: m[0], edited: is.split(m[0]).join(''), codePrefix: m[0].startsWith('[[MATH') ? 'math-missing' : 'media-missing' };
    }
    const br = is.match(/\[\[BR\]\]/);
    if (br) return { seg, marker: '[[BR]]', edited: is.replace('[[BR]]', ' '), codePrefix: 'br-removed' };
  }
  return null;
}
```

Tests:
1. **Violation → 400 + code:** POST with `editedContent` = the stripped variant → `status 400`, `body.error` equals the Icelandic summary verbatim, `body.violations` contains the expected code, and **no row lands in `segment_edits`** (query the temp DB).
2. **Client-supplied originalContent is ignored:** same request but with `originalContent` set equal to the violating `editedContent` (a bypasser trying to make the diff look like identity) → still 400. (The identity skip keys on the SERVER baseline `seg.is`, not the posted value.)
3. **Identity edit skips validation:** POST with `editedContent === seg.is` on a marker-bearing segment → NOT 400 (200 withdraw/no-op response), even though a strict re-validation of the baseline against EN could fail on degraded fixtures.
4. **Valid edit passes:** `editedContent = seg.is + ' breytt'` → 200, row exists; clean up the row and any `.locked` marker in afterAll (mtLockOnFirstEdit teardown idiom).
5. **Unknown segmentId → 404** `{ error: 'segment not found' }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/segmentEditBackstop.test.js`
Expected: FAIL — case 1 currently returns 200 (row saved; clean it in the test's afterAll regardless of pass/fail), case 5 currently saves a floating row (also cleaned). If `pickMarkerCase` returns null on the fixture, STOP: report which fixture module was scanned — the fixture needs a marker-bearing segment picked deliberately, not silently skipped.

- [ ] **Step 3: Implement the route guard**

In `server/routes/segment-editor.js`, `POST /:book/:chapter/:moduleId/edit`, after the `category` check (~:333) and before the `try { segmentEditor.saveSegmentEdit(...)`:

```js
    // SR-OOS-2 backstop: the client's hard-block gate is bypassable, so the
    // save route re-checks structural markers against SERVER-loaded baselines
    // (never the client-supplied originalContent). Identity edits skip — the
    // UI never validates withdrawals (parity, design §5). Warnings are
    // advisory and deliberately NOT enforced here (design D3).
    let baseline;
    try {
      const modData = segmentParser.loadModuleForEditing(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );
      baseline = modData.segments.find((s) => s.segmentId === segmentId);
    } catch (loadErr) {
      log.error({ err: loadErr }, 'Backstop baseline load failed');
      return res.status(loadErr.message.includes('not found') ? 404 : 500).json({
        error: loadErr.message,
      });
    }
    if (!baseline) {
      return res.status(404).json({ error: 'segment not found' });
    }
    if (editedContent !== baseline.is) {
      const structure = segmentValidation.validateStructure(
        baseline.en,
        baseline.is,
        editedContent
      );
      if (structure.blocked) {
        return res.status(400).json({
          error: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.',
          violations: structure.blocked,
        });
      }
    }
```

Add the require at the top of the file alongside the existing service requires:

```js
const segmentValidation = require('../public/js/segment-validation');
```

(`segmentParser` and `log` are already required in this file — verify and reuse; do not double-require.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/segmentEditBackstop.test.js server/__tests__/mtLockOnFirstEdit.test.js server/__tests__/segmentEditorService.test.js`
Expected: PASS (the two neighbor suites prove no collateral damage to the save path).

- [ ] **Step 5: Commit**

```bash
git add server/routes/segment-editor.js server/__tests__/segmentEditBackstop.test.js
git commit -m "fix(editor): server-side structural-marker backstop on segment save (SR-OOS-2 D4/D5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Localization save backstops (`POST /save`, `POST /save-all`)

**Files:**
- Modify: `server/routes/localization-editor.js` (single-save handler ~:307-460 and save-all handler ~:470-640 — both already call `segmentParser.loadModuleForLocalization` inside the module lock; the guard goes right after that load)
- Create: `server/__tests__/localizationSaveBackstop.test.js`

**Interfaces:**
- Consumes: Task 1's `validateStructure`; the already-loaded `data.segments` (fields: `segmentId`, `en`, `faithful`, `localized`, `hasLocalized`).
- Produces: single-save 400 `{ error: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.', violations }`; save-all 400 with `violations` whose `params` include `segmentId` (design §4: reject the whole batch — no partial apply).

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/localizationSaveBackstop.test.js` — same harness family as Task 2 (env-before-require, migrations, router introspection on `require('../routes/localization-editor')`). Baseline source: `seg.en` + `seg.faithful` (the localization pane's client gate validates against faithful — `localization-editor.js:978` — NOT against the current localized text). Fixture: reuse `books/__e2e-fixture__` if it carries `03-faithful-translation` files for the fixture module (check first: `ls books/__e2e-fixture__/03-faithful-translation/`); if it does not, build a temp books dir via the `segmentParser.BOOKS_DIR` swap idiom from `server/__tests__/segmentEditorService.test.js:17-32` with one module containing a `[[MATH:1]]`-bearing EN segment + matching faithful file — that also makes the marker-bearing segment deterministic instead of fixture-dependent (prefer this).

Tests:
1. Single save with faithful's `[[MATH:1]]` stripped → 400 + `math-missing`; localized file NOT written.
2. Single save valid → 200 (or the route's existing success shape); file written. (Run with review-tier OFF — default `book_settings`.)
3. save-all where ONE of two segments violates → 400, `violations[0].params.segmentId` names it, NEITHER segment written (whole-batch reject).
4. save-all all-valid → success, both written.
5. Unchanged segments in save-all (content equals current baseline) are not validated (identity parity — mirrors the route's existing changed-only `auditEdits` computation).

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run server/__tests__/localizationSaveBackstop.test.js`
Expected: cases 1 and 3 FAIL (saves succeed today).

- [ ] **Step 3: Implement both guards**

Single-save handler — after `const data = segmentParser.loadModuleForLocalization(...)` and the existing segment lookup (the handler already finds the segment; reuse its variable):

```js
      // SR-OOS-2 backstop (parity with edValidateSegmentEdit: baseline is
      // the FAITHFUL text, warnings advisory-only — design D3/D5).
      if (seg && content !== (seg.hasLocalized ? seg.localized : seg.faithful)) {
        const structure = segmentValidation.validateStructure(seg.en, seg.faithful, content);
        if (structure.blocked) {
          return res.status(400).json({
            error: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.',
            violations: structure.blocked,
          });
        }
      }
```

save-all handler — after the `auditEdits` array is built (it already contains exactly the CHANGED segments with `previousContent`/`newContent`), before the review-tier branch:

```js
      // SR-OOS-2 backstop: validate every changed segment against its
      // faithful baseline; reject the whole batch on any violation —
      // a partial apply of a structurally broken batch is worse than a
      // clean retry (design §4).
      const batchViolations = [];
      for (const e of auditEdits) {
        const segData = data.segments.find((s) => s.segmentId === e.segmentId);
        if (!segData) continue;
        const structure = segmentValidation.validateStructure(
          segData.en,
          segData.faithful,
          e.newContent
        );
        if (structure.blocked) {
          for (const v of structure.blocked) {
            batchViolations.push({ code: v.code, params: { ...v.params, segmentId: e.segmentId } });
          }
        }
      }
      if (batchViolations.length > 0) {
        return res.status(400).json({
          error: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.',
          violations: batchViolations,
        });
      }
```

Add `const segmentValidation = require('../public/js/segment-validation');` to the file's requires. Adapt variable names (`seg`, `content`, `data`) to what the handlers actually use — read them first; the shapes above show the logic, the handler's local names win.

- [ ] **Step 4: Run tests + neighbors**

Run: `npx vitest run server/__tests__/localizationSaveBackstop.test.js server/__tests__/localizationReviewService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/localization-editor.js server/__tests__/localizationSaveBackstop.test.js
git commit -m "fix(localization): structural-marker backstop on save + save-all (whole-batch reject) (SR-OOS-2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Propagation guard (per-occurrence skip)

**Files:**
- Modify: `server/services/propagationService.js` (`createPropagatedEdits`, ~:63+), `server/routes/segment-editor.js` (propagate route ~:920-945: pass the source segment's raw `en`)
- Modify: `server/__tests__/propagationService.test.js` (new describe block)

**Interfaces:**
- Consumes: Task 1's `validateStructure`.
- Produces: `createPropagatedEdits(conn, { ..., sourceEn, ... })` — new optional param; occurrences whose `validateStructure(sourceEn, occ.currentIs, propagatedText)` blocks are pushed to `skipped` with `reason: 'structure_blocked'` (design D8: propagated content passes by construction when baselines match — this is insurance for divergent `currentIs`).

- [ ] **Step 1: Write the failing test**

Add to `server/__tests__/propagationService.test.js` (reuse its existing harness/seed idioms — read the file first):

```js
describe('structural-marker guard on propagation (SR-OOS-2 D8)', () => {
  it('skips an occurrence whose currentIs carries a link the propagated text drops', () => {
    // occurrence baseline has a [text](url) link; propagatedText omits it
    // → link-removed blocks → skipped with reason 'structure_blocked',
    // no row inserted for that occurrence; other eligible occurrences
    // still get rows.
  });

  it('propagates normally when baselines are marker-compatible', () => {
    // identical-source occurrence, no structural markers → created as before.
  });
});
```

(Write the real seed/assert code against the file's existing helpers — occurrences are plain objects `{ moduleId, segmentId, currentIs }`; assert on the returned `{ created, skipped }` arrays and on `segment_edits` rows.)

- [ ] **Step 2: Run to verify the first case fails** (no guard yet → a row IS created).

- [ ] **Step 3: Implement**

In `createPropagatedEdits`, inside the occurrence loop, after the existing `classifyOccurrence` verdict check:

```js
      // SR-OOS-2: propagated content is validated per-occurrence against the
      // occurrence's own baseline (currentIs) + the source EN. Blocked
      // occurrences are skipped (propagation's existing verdict model), not
      // fatal — other occurrences still propagate.
      if (sourceEn !== undefined) {
        const structure = segmentValidation.validateStructure(
          sourceEn,
          occ.currentIs,
          propagatedText
        );
        if (structure.blocked) {
          skipped.push({ moduleId: occ.moduleId, segmentId: occ.segmentId, reason: 'structure_blocked' });
          continue;
        }
      }
```

Destructure `sourceEn` from the params object; add the require. In the propagate route (`segment-editor.js:925+`), the source segment's `en` is already looked up to build `enNorm` — restructure minimally so the RAW `en` is captured once and passed as `sourceEn` (the normalized form keeps feeding `findOccurrences` unchanged):

```js
      const sourceSeg = segmentParser
        .loadModuleForEditing(req.params.book, req.chapterNum, req.params.moduleId)
        .segments.find((s) => s.segmentId === segmentId);
      const enNorm = propagation.normalizeEn(sourceSeg?.en || '');
```

(Verify the actual normalize call name in the route — the existing code computes `enNorm` from the same lookup; keep its exact function, just split the segment lookup out so `sourceSeg.en` is available for the `createPropagatedEdits` call.)

- [ ] **Step 4: Run** `npx vitest run server/__tests__/propagationService.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/propagationService.js server/routes/segment-editor.js server/__tests__/propagationService.test.js
git commit -m "fix(propagation): per-occurrence structural-marker guard (skip, not fatal) (SR-OOS-2 D8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Segment-editor pane convergence

**Files:**
- Modify: `server/public/js/segment-editor.js:1023-1126` (replace `validateSegmentEdit`'s body), `server/views/segment-editor.html:1548` (script tag)

**Interfaces:**
- Consumes: browser global `segmentValidation.validateStructure` (Task 1). The pane's `saveEdit` continues to call `validateSegmentEdit(seg.en, seg.is, editedContent)` and read `{ blocked, warnings }` as string arrays — the wrapper maps codes to the existing `UI.validation` formatters so wording is unchanged.

- [ ] **Step 1: Replace the rule body with a code→message wrapper**

```js
  /**
   * Validate a segment edit before saving. Rules live in the shared
   * segment-validation.js module (also enforced server-side, SR-OOS-2);
   * this wrapper only maps violation codes to the pane's wording.
   * Returns { blocked: string[]|null, warnings: string[]|null }
   */
  function validateSegmentEdit(enText, originalIs, editedIs) {
    const result = segmentValidation.validateStructure(enText, originalIs, editedIs);
    const PAIR_NAMES = {
      '**': UI.validation.pairNames.bold,
      __: UI.validation.pairNames.term,
      '++': UI.validation.pairNames.underline,
    };
    const BLOCK_MSG = {
      'math-missing': (p) => UI.validation.mathMissing(p.marker),
      'br-removed': (p) => UI.validation.brRemoved(p.from, p.to),
      'xref-missing': (p) => UI.validation.xrefMissing(p.ref),
      'link-removed': (p) => UI.validation.linkRemoved(p.link),
      'docref-missing': (p) => UI.validation.docRefMissing(p.ref),
      'media-missing': (p) => UI.validation.mediaMissing(p.marker),
      'space-removed': (p) => UI.validation.spaceRemoved(p.from, p.to),
    };
    const WARN_MSG = {
      'unmatched-pair': (p) => UI.validation.unmatchedPair(PAIR_NAMES[p.marker], p.count),
      'unmatched-emphasis': (p) => UI.validation.unmatchedEmphasis(p.open, p.close),
      'unmatched-subscript': (p) => UI.validation.unmatchedSubscript(p.count),
      'unmatched-superscript': (p) => UI.validation.unmatchedSuperscript(p.count),
      'segment-cleared': () => UI.validation.segmentCleared,
    };
    return {
      blocked: result.blocked ? result.blocked.map((v) => BLOCK_MSG[v.code](v.params)) : null,
      warnings: result.warnings ? result.warnings.map((v) => WARN_MSG[v.code](v.params)) : null,
    };
  }
```

- [ ] **Step 2: Add the script tag** in `server/views/segment-editor.html` after `/js/ui-strings.js` (line 1548), before `/js/marker-highlight.js`:

```html
  <script src="/js/segment-validation.js"></script>
```

- [ ] **Step 3: Verify no rule text remains** — `grep -n "MATH:\\\\d\|\[\[BR\]\]" server/public/js/segment-editor.js` should show no rule regexes in `validateSegmentEdit` (the marker-highlight code elsewhere in the file is unrelated and untouched).

- [ ] **Step 4: Run the client-adjacent static suites** — `npx vitest run server/__tests__/ui-strings.test.js server/__tests__/clientMessageContracts.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/views/segment-editor.html
git commit -m "refactor(editor): segment pane delegates marker rules to shared module (SR-OOS-2 D6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Localization pane convergence

**Files:**
- Modify: `server/public/js/localization-editor.js:877-964` (replace `edValidateSegmentEdit`'s body), `server/views/localization-editor.html` (script tag after `/js/ui-strings.js`)

**Interfaces:** same wrapper pattern as Task 5, but mapped to this pane's `*Short` formatters. **Deliberate behavior addition (design D6/D7, record in the design amendment):** this pane gains the tilde/caret warnings it previously lacked — advisory-only, wording via the shared `UI.validation.unmatchedSubscript`/`unmatchedSuperscript` formatters both panes already load.

- [ ] **Step 1: Replace the body** (ES5 style — this file uses `var`/functions, keep that):

```js
  /**
   * Validate a segment edit before saving (localization editor). Rules live
   * in the shared segment-validation.js module (also enforced server-side,
   * SR-OOS-2); this wrapper maps codes to this pane's shorter wording.
   * Note: the shared rules add the ~/^ warnings this pane previously lacked
   * (advisory only).
   */
  function edValidateSegmentEdit(enText, originalIs, editedIs) {
    var result = segmentValidation.validateStructure(enText, originalIs, editedIs);
    var pairNames = {
      '**': UI.validation.pairNames.bold,
      __: UI.validation.pairNames.term,
      '++': UI.validation.pairNames.underline,
    };
    var blockMsg = {
      'math-missing': function (p) { return UI.validation.mathMissingShort(p.marker); },
      'br-removed': function () { return UI.validation.brRemovedShort; },
      'xref-missing': function (p) { return UI.validation.xrefMissingShort(p.ref); },
      'link-removed': function (p) { return UI.validation.linkRemoved(p.link); },
      'docref-missing': function (p) { return UI.validation.docRefMissingShort(p.ref); },
      'media-missing': function (p) { return UI.validation.mediaMissingShort(p.marker); },
      'space-removed': function (p) { return UI.validation.spaceRemoved(p.from, p.to); },
    };
    var warnMsg = {
      'unmatched-pair': function (p) { return UI.validation.unmatchedPair(pairNames[p.marker], p.count); },
      'unmatched-emphasis': function (p) { return UI.validation.unmatchedEmphasis(p.open, p.close); },
      'unmatched-subscript': function (p) { return UI.validation.unmatchedSubscript(p.count); },
      'unmatched-superscript': function (p) { return UI.validation.unmatchedSuperscript(p.count); },
      'segment-cleared': function () { return UI.validation.segmentCleared; },
    };
    return {
      blocked: result.blocked
        ? result.blocked.map(function (v) { return blockMsg[v.code](v.params); })
        : null,
      warnings: result.warnings
        ? result.warnings.map(function (v) { return warnMsg[v.code](v.params); })
        : null,
    };
  }
```

- [ ] **Step 2: Script tag** in `server/views/localization-editor.html` after the `/js/ui-strings.js` line, before `/js/localization-editor.js`:

```html
    <script src="/js/segment-validation.js"></script>
```

- [ ] **Step 3: Run** `npx vitest run server/__tests__/ui-strings.test.js server/__tests__/clientMessageContracts.test.js` → PASS.

- [ ] **Step 4: Commit**

```bash
git add server/public/js/localization-editor.js server/views/localization-editor.html
git commit -m "refactor(localization): pane delegates marker rules to shared module (+~/^ warnings) (SR-OOS-2 D6/D7)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Wiring pins (guard-the-guard)

**Files:**
- Create: `server/__tests__/structuralBackstopWiring.test.js`

**Interfaces:** static pins only; no production change.

- [ ] **Step 1: Write the pins**

```js
/**
 * Guard-the-guard (SR-OOS-2): the shared rules only protect what calls them.
 * Pins: all four server enforcement sites call validateStructure; both panes
 * delegate to the shared module (no resurrected inline rule bodies); both
 * views load the script; the UMD module keeps its CJS export.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

describe('server enforcement sites', () => {
  it('segment-editor route guards the save path', () => {
    const src = read('routes/segment-editor.js');
    expect(src).toMatch(/segmentValidation\.validateStructure\(/);
    expect(src).toMatch(/Vistun hafnað: byggingarmerki vantar eða hafa breyst\./);
  });
  it('localization route guards save AND save-all (two call sites)', () => {
    const src = read('routes/localization-editor.js');
    expect(src.match(/segmentValidation\.validateStructure\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
  it('propagation guards per-occurrence', () => {
    const src = read('services/propagationService.js');
    expect(src).toMatch(/validateStructure\(/);
    expect(src).toMatch(/structure_blocked/);
  });
});

describe('client panes delegate (no inline rule bodies)', () => {
  for (const pane of ['public/js/segment-editor.js', 'public/js/localization-editor.js']) {
    it(`${pane} calls the shared module and owns no MATH regex`, () => {
      const src = read(pane);
      expect(src).toMatch(/segmentValidation\.validateStructure\(/);
      // the rule regex lives ONLY in segment-validation.js now
      expect(src).not.toMatch(/\[\\\[MATH:\\d\+\\\]\\\]/);
    });
  }
});

describe('views load the shared script before the pane bundle', () => {
  for (const view of ['views/segment-editor.html', 'views/localization-editor.html']) {
    it(`${view} includes /js/segment-validation.js`, () => {
      expect(read(view)).toMatch(/src="\/js\/segment-validation\.js"/);
    });
  }
});

describe('UMD contract', () => {
  it('module is requirable from CJS and exports validateStructure', async () => {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    expect(typeof req('../public/js/segment-validation').validateStructure).toBe('function');
  });
});
```

(Adjust the no-inline-rule regex during implementation so it matches the literal source text of a `[[MATH:\d+]]` matcher without false-positiving on the wrapper's code strings — verify by temporarily re-adding a rule body and watching the pin fail.)

- [ ] **Step 2: Run** `npx vitest run server/__tests__/structuralBackstopWiring.test.js` → PASS (everything already landed in Tasks 1-6).

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/structuralBackstopWiring.test.js
git commit -m "test(validation): guard-the-guard wiring pins for the structural backstop (SR-OOS-2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Full gate + docs

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 4 → shipped), `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (SR-OOS-2 entry → resolved), `docs/plans/2026-07-12-structural-marker-backstop-design.md` (Amendments section)

- [ ] **Step 1:** `npm test` from repo root → ALL PASS (≥ 2396 + new). Fix anything red first.
- [ ] **Step 2:** Campaign doc item 4 → shipped summary (enforcement sites, whole-batch reject, propagation skip, pane convergence incl. the localization pane's new ~/^ warnings). SR-OOS-2 register entry in the 2026-06-28 plan → `✅ RESOLVED 2026-07-12` with one-line scope.
- [ ] **Step 3:** Design Amendments section: route-level enforcement with server-loaded baselines instead of inside `saveSegmentEdit` (D4 refinement — the service receives client-supplied `originalContent` and its ~600-line test suite runs on synthetic segments; the route is where trusted baselines already exist), identity-skip parity rule, propagation skip-not-fatal, localization pane warning additions, plus anything execution discovers.
- [ ] **Step 4:** Commit docs; hand off to the finishing skill (PR off `main`, title `fix(editor): server-side structural-marker backstop + shared rule module (SR-OOS-2, campaign item 4)`).
