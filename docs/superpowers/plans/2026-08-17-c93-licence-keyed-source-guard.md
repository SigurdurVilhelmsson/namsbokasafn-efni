# §C93 — Licence-Keyed `01-source` Refresh Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it **impossible by construction** for any tool to overwrite the irrevocable CC BY copies under `books/*/01-source/`, and make a legitimate refresh of a CC BY-NC-SA book record what it superseded instead of erasing it.

**Architecture:** One new pure CJS module, `tools/lib/source-refresh-policy.cjs`, holding four conjunctive fail-closed gates. `tools/download-source.js` calls it. The two **live** defects on `main` (a licence-blind guard with an unconditional override; a CI baseline gate that a deletion walks past) are fixed in the same branch. No new tool; `server/services/openstaxFetcher.js` is deliberately **not** extended — it keys on OpenStax slugs, not ours, and importing it from MIT `tools/` would add an MIT→AGPL edge.

**Tech Stack:** Node 22.x · CommonJS for the new lib (mirrors `tools/lib/source-manifest.cjs`, consumed from both trees) · ESM for `tools/*.js` · Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-17-c93-licence-keyed-source-refresh-design.md`](../specs/2026-08-17-c93-licence-keyed-source-refresh-design.md) — read it before Task 2; it owns the four gates, the manifest v2 shape and the threat model.

---

## Global Constraints

- **🔴 NOTHING IN THIS BRANCH MAY WRITE UNDER `books/`.** Not tests, not fixtures, not a scratch run. Every test writes to a `fs.mkdtemp` directory. The whole point of this item is that `books/*/01-source/` is protected; a branch that pollutes it while building its own guard is self-refuting.
- **🔴 `assertRefreshable(sourceDir)` takes exactly ONE argument.** No options object, no `force`, no `allowOverwrite`, no env var. *There must be nothing to pass.* This is the machine-checkable form of "no flag overrides it", and a test pins the arity.
- **Allowlist, never denylist.** A denylist fails open on a typo, a new book, or a missing config. Unknown/absent/malformed licence values must land in the *same* refusal as CC BY.
- **Do not normalise, lowercase, trim-fold or regex the licence string.** Exact match against a closed set. An unrecognised value refuses, and the fix is a reviewable edit to `book-config.json` — never a looser matcher.
- **Resolve paths against something intrinsic, never `process.cwd()`.** The gate reads `path.join(sourceDir, '..', 'book-config.json')` — the sibling of the directory being written — so the write target *is* the identity and no caller can name one book and write another.
- **`tools/lib/*.cjs` is CommonJS**; `tools/*.js` is ESM (root `package.json` is `"type": "module"`). Vitest test files use `import` for vitest.
- Run `npm test` from the **repo root**, one process at a time (memory ceiling). CI also runs `npm run lint` and `npm run format:check`.
- **`docs-check` CI fires on `tools/**` changes** → run `npm run docs:generate` and commit its output (Task 6).
- **This gate does NOT replace CLAUDE.md's three-step written consent**, which stays unconditional and applies to every book regardless of licence. The gate converts an *accident* into an impossibility; consent governs the *deliberate* act. Do not narrow the consent rule in this branch.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `tools/lib/source-refresh-policy.cjs` | The four gates. Pure: no I/O beyond reading the sibling config and the passed-in collection XML. | **create** |
| `tools/__tests__/source-refresh-policy.test.js` | Gate unit tests, each refusal paired with a passing control | **create** |
| `tools/download-source.js` | Call G1/G2/G4; parse `<md:license>` for G3; write manifest v2 + `previous`; **fix the delete-prescribing error message** | modify |
| `tools/lib/source-manifest.cjs` | Read v2; honour `localOrigin` | modify |
| `tools/generate-source-manifest.js` | Mint-only (refuse when a manifest exists); licence-accurate `note` | modify |
| `tools/__tests__/source-manifest-baseline.test.js` | Fix the deletion dropout (finding ②) | modify |
| `tools/__tests__/source-downloader.test.js` | Fixtures gain a real sibling `book-config.json` | modify |
| `tools/__tests__/source-manifest-cli.test.js` | Retarget the `/CC BY/` note pin to the per-book code | modify |
| `server/__tests__/fetchSourceGuard.test.js` | Convert absence-assertion to exact-argv equality | modify |
| `CLAUDE.md` | Additive pointer to the licence-keyed gate; consent rule unchanged | modify (Task 6) |

---

## Task 1: Settle G3's premise — does upstream's collection XML still carry `<md:license url=…>`?

The spec marks this **UNKNOWN** and says G3 must not be built on an unverified premise: *"nobody re-measured that upstream `collection.xml` still carries `<md:license url=…>` today"* — and no raw collection XML exists locally (`find books -name '*.collection.xml'` → 0, control `collection-order.json` → 5).

**Files:** Create `test-results/c93-g3-premise-<TODAY>.txt` (evidence, committed)

**Interfaces:** Produces the go/no-go for G3's design, and the exact element/attribute shape Task 3 parses.

- [ ] **Step 1: Fetch one collection XML at a named sha and inspect it**

Fetch `collections/organic-chemistry.collection.xml` from `openstax/osbooks-organic-chemistry`. Record the sha you fetched at. Then answer, with the raw matched text quoted:
- Is there an `<md:license …>` element? What is its `url` attribute, verbatim?
- Is there any *other* licence-bearing element (a `<md:license>` text body, a `roles`/`copyright` element)?
- **Positive control in the same command:** confirm the file also contains `<col:subcollection` (the element `parseCollectionStructure` already relies on). If that is absent too, the fetch is wrong, not the premise.

- [ ] **Step 2: Do the same for one CC BY book's collection, for contrast**

Fetch chemistry's collection XML **read-only** and record its `<md:license url=…>` today. This is not a refresh — it is one HTTP GET whose result is written to `test-results/`, never to `books/`. Expected: today's chemistry says CC BY-NC-SA, which is precisely the substitution the guard exists to prevent. **If it still says CC BY, say so loudly** — it changes the provenance picture.

- [ ] **Step 3: Interpret**

If no `<md:license url=…>` exists upstream today, **STOP and report**: G3 as specified cannot be built and needs a different licence source. Do not invent one.

- [ ] **Step 4: Commit the evidence**

```bash
git add test-results/c93-g3-premise-*.txt
git commit -m "chore(C93): settle G3's premise — the licence element upstream collections carry"
```

---

## Task 2: `source-refresh-policy.cjs` — G1 (book gate) and G4 (write-set gate)

**Files:**
- Create: `tools/lib/source-refresh-policy.cjs`
- Create: `tools/__tests__/source-refresh-policy.test.js`

**Interfaces:**
- Produces: `assertRefreshable(sourceDir) → void` (throws on refusal); `assertWritePathAllowed(relPath, localOrigin) → void`; `REFRESHABLE` (a frozen Set, exported for the arity/enumeration test only)

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/source-refresh-policy.test.js`. Every refusal case is paired with a passing NC-SA control **in the same file**, so a module that refuses everything cannot read as a pass.

```javascript
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const policy = require('../lib/source-refresh-policy.cjs');

/** Build a throwaway book dir: <tmp>/<slug>/01-source, with a sibling book-config.json. */
function makeBook(licence) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c93-'));
  const bookDir = path.join(root, 'somebook');
  const sourceDir = path.join(bookDir, '01-source');
  fs.mkdirSync(sourceDir, { recursive: true });
  if (licence !== undefined) {
    fs.writeFileSync(
      path.join(bookDir, 'book-config.json'),
      JSON.stringify({ licence: { code: licence, obtained: '2026-03-23' } })
    );
  }
  return sourceDir;
}

describe('§C93 G1 — the book gate', () => {
  it('PASSES the refreshable licence (the control that makes the refusals mean something)', () => {
    expect(() => policy.assertRefreshable(makeBook('CC BY-NC-SA 4.0'))).not.toThrow();
  });

  it('REFUSES CC BY — the irrevocable copies', () => {
    expect(() => policy.assertRefreshable(makeBook('CC BY 4.0'))).toThrow(/CC BY 4\.0/);
  });

  it('REFUSES an absent book-config.json (fails closed, not open)', () => {
    expect(() => policy.assertRefreshable(makeBook(undefined))).toThrow();
  });

  it('REFUSES an unrecognised licence string rather than guessing', () => {
    expect(() => policy.assertRefreshable(makeBook('CC0'))).toThrow();
  });

  it('REFUSES a near-miss that a looser matcher would accept', () => {
    // Same licence, different spelling. An allowlist must NOT normalise.
    expect(() => policy.assertRefreshable(makeBook('cc by-nc-sa 4.0'))).toThrow();
    expect(() => policy.assertRefreshable(makeBook('CC BY-NC-SA 4.0 '))).toThrow();
  });

  it('🔴 HAS ARITY 1 — the machine-checkable form of "no flag overrides it"', () => {
    expect(policy.assertRefreshable.length).toBe(1);
  });

  it('🔴 exports no escape hatch', () => {
    const names = Object.keys(policy);
    expect(names).not.toContain('force');
    expect(names.filter((n) => /force|override|allow|bypass|unsafe/i.test(n))).toEqual([]);
  });
});

describe('§C93 G4 — the write-set gate', () => {
  const ALLOWED = [
    'ch01/m00001.cnxml',
    'ch28/m00309.cnxml',
    'appendices/m00226.cnxml',
    'media/OChem_01_05_001.jpg',
    '.source-info.json',
    '.source-manifest.json',
    'collection-order.json',
  ];
  const FORBIDDEN = [
    'docx/ch00/preface.docx',
    'exercises/11-03-OC-P06.json',
    'ch00/../../evil.txt',
    'notes.txt',
  ];

  it('allows every path on the closed write allowlist', () => {
    for (const p of ALLOWED) expect(() => policy.assertWritePathAllowed(p, [])).not.toThrow();
  });

  it('🔴 REFUSES docx/ and exercises/ — outside every hash gate, unrestorable by refetch', () => {
    for (const p of FORBIDDEN) expect(() => policy.assertWritePathAllowed(p, [])).toThrow();
  });

  it('REFUSES a localOrigin path even though its directory is allowlisted', () => {
    const local = [{ path: 'ch00/m68662.cnxml', reason: 're-authored from a CC BY-era Word export' }];
    expect(() => policy.assertWritePathAllowed('ch00/m68662.cnxml', local)).toThrow(/m68662/);
    // control: its neighbour in the same directory is still writable
    expect(() => policy.assertWritePathAllowed('ch00/m68663.cnxml', local)).not.toThrow();
  });

  it('honours a localOrigin DIRECTORY prefix', () => {
    const local = [{ path: 'media/', reason: 'hand-curated' }];
    expect(() => policy.assertWritePathAllowed('media/x.jpg', local)).toThrow();
    expect(() => policy.assertWritePathAllowed('ch01/m1.cnxml', local)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and verify they fail**

Run: `npx vitest run tools/__tests__/source-refresh-policy.test.js`
Expected: FAIL — `Cannot find module '../lib/source-refresh-policy.cjs'`.

- [ ] **Step 3: Implement the module**

Create `tools/lib/source-refresh-policy.cjs`:

```javascript
/**
 * §C93 — the licence-keyed `01-source` refresh gate.
 *
 * INVARIANT: a refresh may replace bytes only with identically-licensed bytes, in a book
 * whose recorded licence is on a closed refreshable allowlist, at paths on a closed write
 * allowlist, recording the superseded state append-only. Four conjunctive, fail-closed
 * conditions. COROLLARY: this tooling can never change a book's licence posture.
 *
 * ⚠️ This gate does NOT replace CLAUDE.md's three-step written consent, which is
 * unconditional and applies to every book regardless of licence. The gate converts an
 * ACCIDENT into an impossibility; consent governs the DELIBERATE act.
 *
 * WHY A CLOSED ALLOWLIST AND NOT A DENYLIST: a denylist fails OPEN on a typo, on a new book,
 * or on a missing config — exactly the cases where you most want a refusal. Chemistry,
 * Biology and Microbiology were obtained while CC BY 4.0 and that grant is irrevocable for
 * those copies; replacing their bytes with today's CC BY-NC-SA upstream destroys the
 * provenance basis, and because the per-module CNXML carries NO licence element, the
 * substitution would be INVISIBLE in the file content.
 */
const fs = require('fs');
const path = require('path');

/**
 * Licences whose books may be refreshed from upstream. EXACT string match, deliberately.
 * Do NOT normalise, lowercase, trim-fold or regex these — an unrecognised value must refuse,
 * and the fix is a reviewable edit to book-config.json, never a looser matcher.
 */
const REFRESHABLE = Object.freeze(new Set(['CC BY-NC-SA 4.0']));

/** Closed write allowlist. Anything not matched here is unreachable by a refresh. */
const WRITE_ALLOW = [
  /^ch\d{2}\/[^/]+\.cnxml$/,
  /^appendices\/[^/]+\.cnxml$/,
  /^media\/[^/]+$/,
];
const WRITE_ALLOW_EXACT = new Set([
  '.source-info.json',
  '.source-manifest.json',
  'collection-order.json',
]);

/**
 * G1 — the book gate. ONE argument, on purpose: there is nothing to pass, no options object,
 * no force, no env var. The write target IS the identity, so no caller can name one book and
 * write another.
 *
 * @param {string} sourceDir absolute path to a book's `01-source` directory
 * @throws if the book's recorded licence is not on the refreshable allowlist
 */
function assertRefreshable(sourceDir) {
  const configPath = path.join(sourceDir, '..', 'book-config.json');
  let code;
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const lic = cfg.licence || cfg.license;
    code = typeof lic === 'string' ? lic : lic && lic.code;
  } catch (err) {
    throw new Error(
      `§C93 G1 REFUSED: cannot read a licence for ${sourceDir} (${configPath}: ${err.message}). ` +
        `A refresh requires a recorded licence on the refreshable allowlist. This fails CLOSED ` +
        `on purpose — an unreadable config is not permission.`
    );
  }
  if (!REFRESHABLE.has(code)) {
    throw new Error(
      `§C93 G1 REFUSED: '${code}' is not refreshable. Refreshable: ${[...REFRESHABLE].join(', ')}. ` +
        `Books obtained while CC BY 4.0 (Chemistry, Biology, Microbiology) hold an IRREVOCABLE ` +
        `grant for those exact bytes; upstream is CC BY-NC-SA today, and because the per-module ` +
        `CNXML carries no licence element the substitution would be invisible in the files. ` +
        `There is no flag that overrides this.`
    );
  }
}

/**
 * G4 — the write-set gate. The ONE owner of "what a refresh may touch".
 *
 * `localOrigin` is a carve-out WITHIN the allowlist for bytes that did not come from
 * upstream and that no refetch restores — e.g. chemistry's re-authored `ch00/m68662.cnxml`.
 * It accepts file paths and directory prefixes (trailing `/`).
 *
 * @param {string} relPath path relative to `01-source`, POSIX separators
 * @param {Array<{path: string}>} localOrigin
 */
function assertWritePathAllowed(relPath, localOrigin = []) {
  if (relPath.includes('..') || path.isAbsolute(relPath)) {
    throw new Error(`§C93 G4 REFUSED: '${relPath}' escapes 01-source/.`);
  }
  const onList =
    WRITE_ALLOW_EXACT.has(relPath) || WRITE_ALLOW.some((re) => re.test(relPath));
  if (!onList) {
    throw new Error(
      `§C93 G4 REFUSED: '${relPath}' is not on the write allowlist. A refresh may touch only ` +
        `chNN/*.cnxml, appendices/*.cnxml, media/*, and the three metadata sidecars. This is ` +
        `what protects docx/ and exercises/, which sit outside every hash gate and which no ` +
        `refetch restores.`
    );
  }
  for (const entry of localOrigin || []) {
    const p = entry && entry.path;
    if (!p) continue;
    const hit = p.endsWith('/') ? relPath.startsWith(p) : relPath === p;
    if (hit) {
      throw new Error(
        `§C93 G4 REFUSED: '${relPath}' is declared localOrigin (${entry.reason || 'no reason recorded'}) ` +
          `— it did not come from upstream and a refresh must never overwrite it.`
      );
    }
  }
}

module.exports = { assertRefreshable, assertWritePathAllowed, REFRESHABLE };
```

- [ ] **Step 4: Run and verify they pass**

Run: `npx vitest run tools/__tests__/source-refresh-policy.test.js`
Expected: PASS.

- [ ] **Step 5: 🔴 Verify each refusal against the BROKEN state**

For **each** refusal test, neutralise the gate it exercises (e.g. temporarily make `assertRefreshable` a no-op, or make `WRITE_ALLOW` match everything), re-run, and confirm **that specific test FAILS**. Restore. Record which tests you checked, which mutant flipped each, and what happened.

> 🔴 **CORRECTED 2026-08-17 — this step first said "confirm that specific test goes green", which is INVERTED and dangerous.** These are `expect(...).toThrow()` assertions: with the gate removed the call no longer throws, so the test goes **RED**. A refusal test that stays **green** under mutation is precisely the vacuous case this step exists to catch — the original wording told the implementer to accept exactly what it was meant to reject.
>
> ⚠️ **And one mutant per gate is not enough — check that every refusal test is reached by some mutant.** Neutralising the path allowlist does **not** exercise the `localOrigin` carve-out, because the carve-out runs *after* it; a sweep of A–C would have reported "all refusal tests discriminate" with two unchecked. **A mutant that does not reach a test tells you nothing about that test.**

> A refusal test that would still refuse with the gate removed proves nothing. Task 2 of the §C88 branch found a negative test that could not discriminate at all — do not repeat it.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/source-refresh-policy.cjs tools/__tests__/source-refresh-policy.test.js
git commit -m "feat(C93): the licence-keyed refresh gate — G1 book gate, G4 write-set gate"
```

---

## Task 3: G2 (vintage) and G3 (licence identity)

**Depends on Task 1's finding** for the exact element/attribute G3 parses.

**Files:** Modify `tools/lib/source-refresh-policy.cjs` and its test.

**Interfaces:** Produces `assertVintageAdvances(sourceDir, newCommit) → {previousCommit}`; `assertLicenceUnchanged(collectionXml, expectedCode) → void`; `LICENCE_URL_TO_CODE` (closed enum).

- [ ] **Step 1: Write the failing tests** — one refusal per gate, each with a passing control.

Cover: G2 refuses an absent `.source-info.json`; refuses a missing `commitHash`; refuses when the new commit **equals** the recorded one (nothing to supersede); passes when it differs. G3 refuses when the parsed licence URL maps to a **different** code than expected — **in either direction**, with an explicit test for the NC-SA→CC BY case, since that is the one that self-poisons the allowlist; refuses an unrecognised URL; passes on an exact match.

- [ ] **Step 2: Run and verify they fail.**

- [ ] **Step 3: Implement, using the element shape Task 1 measured.**

The URL→code map is a **closed enum**; an unrecognised URL refuses. Write the comment explaining *why G3 exists*: G1 keys on the **recorded** licence, which describes the **old** bytes, while authorising a write of **new** bytes whose licence is unknown until fetched. Without G3 the allowlist self-poisons — an upstream NC-SA→CC BY flip would pull CC BY bytes into a book still recorded as NC-SA, and the *next* refresh would destroy an irrevocable CC BY copy.

- [ ] **Step 4: Run and verify they pass.**

- [ ] **Step 5: Verify each refusal against the broken state**, as Task 2 Step 5 — **neutralise the gate and confirm the refusal test goes RED, not green** (see the correction there), and confirm every refusal test is reached by at least one mutant.

- [ ] **Step 6: Commit.**

---

## Task 4: Wire the gates into `download-source.js`, and fix the delete-prescribing message

**Files:** Modify `tools/download-source.js`, `tools/__tests__/source-downloader.test.js`

- [ ] **Step 1: Fix the error message first — it is a live hazard on its own.**

`tools/download-source.js:190-199` currently tells the operator to *"delete `01-source/` by hand, then re-run with `--allow-overwrite-source`."* Following that destroys chemistry's re-authored `ch00/m68662.cnxml` (not upstream in any CC BY form, unrestorable by refetch), its **273** `docx/` files (the sole CC BY provenance basis), and organic's **1,961** exercise files — none of which `computeFiles`' `*.cnxml` walk covers.

Replace it with a message that names the gate, names what deletion would destroy, and **prescribes nothing destructive**.

- [ ] **Step 2: Call `assertRefreshable(sourceDir)` in `organizeSourceFiles`, before any write.**

It replaces the `existingCnxml.length > 0 && !allowOverwrite` condition as the *licence* check. Decide deliberately — and record in the report — whether `allowOverwrite` still gates the *populated-directory* question, and state why. **`--allow-overwrite-source` must no longer be able to reach a CC BY book by any path.**

- [ ] **Step 3: Update `source-downloader.test.js`'s fixtures.**

Every case passes a tmp `sourceDir` with no sibling config, so the gate refuses and they go red. **That is correct and must not be mocked away** — a mocked gate is a gate by care. Write a real NC-SA `book-config.json` beside the tmp dir for the pass cases, and add a CC BY refusal case.

- [ ] **Step 4: `npm test` from the repo root; then commit.**

---

## Task 5: Manifest v2, mint-only generator, and the CI dropout

**Files:** `tools/lib/source-manifest.cjs`, `tools/generate-source-manifest.js`, `tools/__tests__/source-manifest-baseline.test.js`, `tools/__tests__/source-manifest-cli.test.js`, `server/__tests__/fetchSourceGuard.test.js`

- [ ] **Step 1: Fix the baseline dropout (finding ②) — write the test first.**

`source-manifest-baseline.test.js` enumerates books by `listCnxmlFiles(...).length > 0` with `expect(books.length).toBeGreaterThan(0)` as its only floor, so **a book whose `01-source` CNXML is emptied drops out of the gate silently.** Enumerate the **union** of *has a manifest* and *has CNXML*. Add two tests: delete the CNXML → still enumerated via the manifest → red; delete the manifest → still enumerated via the CNXML → red. Deleting **both** drops out and is **declared out of model** (a tracked-file deletion visible in the diff).

> ⚠️ `__e2e-fixture__` (licence `CC BY 4.0`, 0 CNXML, no manifest) must stay out of **both** sets, so the suite is unaffected. **Do not key this on licence.**

- [ ] **Step 2: Make `generate-source-manifest.js` mint-only.** Refuse when a manifest already exists; `--all` then mints only for books lacking one — a no-op on today's tree (5 of 5 present). Add **no** regenerate or `--supersede` verb: if a tree drifted, the fix is `git checkout` of the source, not a new manifest.

- [ ] **Step 3: Licence-accurate `note`.** `NOTE` is a `const` saying *"…for the **CC BY** 01-source CNXML"* and is written into all 5 manifests including both NC-SA books; `source-manifest-cli.test.js` pins it with `/CC BY/`. Derive the note from the book's own licence and retarget the pin.

- [ ] **Step 4: Convert `fetchSourceGuard.test.js` from absence to presence.** It asserts the string `--allow-overwrite-source` is **absent** from the spawned argv. An absence says whether you observed, never whether it is there, and it passes vacuously the moment the flag is renamed. Assert the argv **equals the exact known list**.

- [ ] **Step 5: Manifest v2 read support** in `source-manifest.cjs` — read `version: 2`, honour `localOrigin`, keep v1 readable (all 5 committed manifests are v1 today; this branch does not migrate them).

- [ ] **Step 6: `npm test`; commit.**

---

## Task 6: CLAUDE.md, generated docs, and final verification

- [ ] **Step 1: CLAUDE.md — additive only.** Add a short pointer, inside the existing source-overwrite section, that a licence-keyed mechanical gate now exists and where it lives. **Do NOT narrow the three-step consent rule** — it stays unconditional for every book. Keep it to a few lines; that file is always loaded.

- [ ] **Step 2: `npm run docs:generate`** and commit anything under `docs/_generated/` — `docs-check` CI fires on `tools/**` changes.

- [ ] **Step 3: Run the real gates:** `npm test` · `npm run lint` · `npm run format:check`, all from the repo root. A green `npm test` is not evidence about lint or format; CI runs all three.

- [ ] **Step 4: Prove the guard on the real tree, read-only.** For each of the five books, call `assertRefreshable(books/<slug>/01-source)` in a scratch script and record pass/refuse. Expected: **`lifraen-efnafraedi` and `edlisfraedi-2e` pass; `efnafraedi-2e`, `liffraedi-2e`, `orverufraedi` refuse.** That 2-pass/3-refuse split is the positive control — a gate that refused all five would look "safe" and be useless. **Write nothing.**

- [ ] **Step 5: Commit, push, open the PR.** `git fetch origin` first. Note in the PR body that the two live findings (①②) are fixed and that consent is unchanged.

---

## Self-Review

**Spec coverage.** G1 → Task 2. G2/G3 → Task 3 (gated on Task 1's premise check). G4 + `localOrigin` → Task 2. Placement (no new tool, CJS, sibling-config path resolution) → Task 2's module header. Manifest v2 + supersede-never-regenerate → Task 5. The test plan's five items → Tasks 2, 4, 5. Threat model (out of model: an insider editing CNXML *and* config *and* manifest) → Task 2's module docstring.

**Deliberate gaps, stated:** manifest v2 *writing* (the `supersedes` append) is specified but only **read** support lands here — the write happens in the refresher path (Task 4) and the five committed manifests stay v1. Task 5 Step 5 says so.

**Type consistency.** `assertRefreshable(sourceDir)` arity 1 throughout. `assertWritePathAllowed(relPath, localOrigin)` used with that signature in Tasks 2 and 4. `localOrigin` entries are `{path, reason, evidence?}` in the spec, the tests and the module.
