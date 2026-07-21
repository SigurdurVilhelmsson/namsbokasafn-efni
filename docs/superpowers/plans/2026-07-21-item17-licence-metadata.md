# Item 17 — Licence metadata per product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `books/<slug>/book-config.json` the **canonical** per-book licence datum (read by `getBookLicence`, unchanged return contract), pin it against the provenance doc and — cross-repo — against vefur's `book.ts`, and land a preventive licence-containment helper + an explicit "added-terms export is licence-neutral" disposition. Closes campaign item 17, the last Phase-4 item.

**Architecture:** `getBookLicence(slug)` (in `tools/lib/book-licences.cjs`, CommonJS) stops using an inline `BOOK_LICENCES` map and instead reads `books/<slug>/book-config.json`'s new nested `licence` block — one source of truth. Its `{licence, obtained}` return is frozen, so the three consumers (`export-corpus.js`, `generate-tm.js`, `server/routes/tm.js`) and their byte output are untouched. A validation test pins the 6 covered books' codes to the provenance doc; a `VEFUR_CONTRACT`-gated cross-repo test bridges the `'CC BY 4.0'` ↔ `'CC-BY-4.0'` format gap and asserts efni↔vefur agreement. A new pure `licence-containment.cjs` encodes the "no restrictive book in a permissive aggregate" rule (no caller yet). The item-21 added-terms export is documented + test-locked as licence-neutral (terms aren't copyrightable).

**Tech Stack:** Node 22, CommonJS (`tools/lib/*.cjs`) + ESM test files, Vitest. No new dependencies. No renderer/CSS/vefur change.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-21-item17-licence-metadata-design.md`. Handoff: `docs/handoffs/2026-07-21-item17-licence-metadata-handoff.md`. Posture: `docs/provenance/openstax-cnxml-licence-provenance.md` §1/§6.1.
- **`getBookLicence(slug)` return contract is FROZEN:** `{ licence: <code string>, obtained: <YYYY-MM-DD> }`. `export-corpus.js`, `generate-tm.js`, `server/routes/tm.js` and their output bytes must not change.
- **Field shape (nested):** `"licence": { "code": "CC BY 4.0", "obtained": "<YYYY-MM-DD>" }`. The `code` keeps efni's **spaced** form (matches provenance + current stamping). Values, verbatim from provenance §1 / the current `book-licences.cjs` rows:
  - `efnafraedi-2e` → `CC BY 4.0`, `2026-01-19`
  - `liffraedi-2e` → `CC BY 4.0`, `2026-03-11`
  - `orverufraedi` → `CC BY 4.0`, `2026-03-09`
  - `edlisfraedi-2e` → `CC BY-NC-SA 4.0`, `2026-03-23`
  - `lifraen-efnafraedi` → `CC BY-NC-SA 4.0`, `2026-03-23`
  - `__e2e-fixture__` → `CC BY 4.0`, `2026-01-01` (test-fixture placeholder, NOT a provenance claim)
- **Fail-loud:** `getBookLicence` throws when the book-config is missing OR has no `licence.code`. `stjornufraedi`/`testbook` get no `licence` block and keep throwing.
- **Only a test imports `BOOK_LICENCES`** (`tools/__tests__/book-licences.test.js`); production imports only `getBookLicence`. The map export is dropped and that test rewritten.
- **Cross-repo licence-code format differs:** efni `'CC BY 4.0'` (spaces) vs vefur `'CC-BY-4.0'` (SPDX hyphens). The agreement test normalises both (`replace(/[\s-]/g,'').toUpperCase()`) before comparing.
- **No cross-book aggregate export exists** — the containment helper has no caller; it is the encoded rule + its test. Do NOT wire it anywhere.
- **Run the full suite from the repo root** (`npm test`) — authoritative gate; no branch protection. Baseline this branch starts from: **3271 passing / 229 files** (main `453d9389`).
- **Branch:** `feat/item17-licence-metadata`, cut from `main`. The spec, plan, and handoff are committed to `main` pre-branch (items-19/20 pattern); Task 0 only cuts the branch.

---

### Task 0: Cut the branch

The spec, plan, and handoff are **already committed to `main`** (pre-branch, items-19/20 pattern — see the `docs(item17): spec + plan + handoff` commit in `git log`). No doc commit is needed here — just cut the feature branch from an up-to-date `main`:

```bash
git checkout main && git pull --ff-only
git checkout -b feat/item17-licence-metadata
```
Proceed to Task 1.

---

### Task 1: `book-config.json` becomes the canonical licence source

**Files:**
- Modify: `books/efnafraedi-2e/book-config.json`, `books/liffraedi-2e/book-config.json`, `books/orverufraedi/book-config.json`, `books/edlisfraedi-2e/book-config.json`, `books/lifraen-efnafraedi/book-config.json`, `books/__e2e-fixture__/book-config.json` (add the `licence` block)
- Modify: `tools/lib/book-licences.cjs` (rewrite `getBookLicence`, drop `BOOK_LICENCES`)
- Test: `tools/__tests__/book-licences.test.js` (rewrite)

**Interfaces:**
- Produces: `getBookLicence(slug) → {licence, obtained}` (contract unchanged); `module.exports = { getBookLicence }` (no `BOOK_LICENCES`).

- [ ] **Step 1: Add the `licence` block to each of the 6 book-configs.** In each file, add a top-level `"licence"` key (place it right after the opening `{`, as the first key, followed by a comma). Values per the Global Constraints table. Example for `books/efnafraedi-2e/book-config.json`:

```json
{
  "licence": { "code": "CC BY 4.0", "obtained": "2026-01-19" },
  "domain": "chemistry",
```

For `books/__e2e-fixture__/book-config.json`, include a comment-free block but keep the placeholder honest (the fixture provenance note lives in the test):

```json
  "licence": { "code": "CC BY 4.0", "obtained": "2026-01-01" },
```

The other four: `liffraedi-2e` `{ "code": "CC BY 4.0", "obtained": "2026-03-11" }`; `orverufraedi` `{ "code": "CC BY 4.0", "obtained": "2026-03-09" }`; `edlisfraedi-2e` `{ "code": "CC BY-NC-SA 4.0", "obtained": "2026-03-23" }`; `lifraen-efnafraedi` `{ "code": "CC BY-NC-SA 4.0", "obtained": "2026-03-23" }`. Do NOT touch `stjornufraedi`/`testbook`. Validate each file still parses: `node -e "require('./books/<slug>/book-config.json')"` (exit 0).

- [ ] **Step 2: Rewrite the test** — replace `tools/__tests__/book-licences.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getBookLicence } = require('../lib/book-licences.cjs');
const mod = require('../lib/book-licences.cjs');

const REPO_ROOT = path.resolve(__dirname, '../..');

// Provenance §1 allowlist — the ONLY books that carry a licence. Editing a value
// here without editing the provenance doc + book-config is the mistake this pins.
const EXPECTED = {
  'efnafraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-01-19' },
  'liffraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-03-11' },
  orverufraedi: { licence: 'CC BY 4.0', obtained: '2026-03-09' },
  'edlisfraedi-2e': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
  'lifraen-efnafraedi': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
  '__e2e-fixture__': { licence: 'CC BY 4.0', obtained: '2026-01-01' },
};

describe('getBookLicence — sourced from book-config.json', () => {
  for (const [slug, expected] of Object.entries(EXPECTED)) {
    it(`returns the provenance-pinned licence for ${slug}`, () => {
      expect(getBookLicence(slug)).toEqual(expected);
    });

    it(`sources ${slug} from its book-config.json (not a hardcoded map)`, () => {
      const cfg = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'books', slug, 'book-config.json'), 'utf-8')
      );
      expect(getBookLicence(slug)).toEqual({ licence: cfg.licence.code, obtained: cfg.licence.obtained });
    });
  }

  it('throws for a book whose config has no licence block (fail-loud)', () => {
    expect(() => getBookLicence('stjornufraedi')).toThrow(/licence/i);
    expect(() => getBookLicence('testbook')).toThrow(/licence/i);
  });

  it('throws for a slug with no book-config.json at all', () => {
    expect(() => getBookLicence('no-such-book')).toThrow();
  });

  it('no longer exports the inline BOOK_LICENCES map (single source is book-config)', () => {
    expect(mod.BOOK_LICENCES).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/book-licences.test.js`
Expected: FAIL — `mod.BOOK_LICENCES` is still defined (old code), and the throw-message regex changed from `/book-licences\.cjs/` to `/licence/i`.

- [ ] **Step 4: Rewrite `tools/lib/book-licences.cjs`:**

```js
/**
 * book-licences.cjs — per-book licence for export tools.
 *
 * Item 17 (2026-07-21): book-config.json is now the CANONICAL licence datum.
 * getBookLicence reads books/<slug>/book-config.json's `licence` block; there
 * is no inline map. Source of truth for the values:
 * docs/provenance/openstax-cnxml-licence-provenance.md §1.
 *
 * getBookLicence THROWS when a book has no licence — a book enters the export
 * path deliberately, licence-first: add a `"licence": { "code", "obtained" }`
 * block to its book-config after checking the provenance doc. (stjornufraedi /
 * testbook carry none and therefore throw, unchanged.)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Books root: intrinsic (__dirname), never process.cwd() — the server runs cwd=server/.
// tools/lib/../../books == repo-root/books.
const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * @param {string} slug
 * @returns {{licence: string, obtained: string}}
 */
function getBookLicence(slug) {
  const configPath = path.join(REPO_ROOT, 'books', slug, 'book-config.json');
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch {
    throw new Error(
      `No book-config.json for book "${slug}" (${configPath}) — cannot resolve its licence. ` +
        'Onboard licence-first; see docs/provenance/openstax-cnxml-licence-provenance.md'
    );
  }
  const cfg = JSON.parse(raw);
  const code = cfg.licence && cfg.licence.code;
  const obtained = cfg.licence && cfg.licence.obtained;
  if (!code || !obtained) {
    throw new Error(
      `No licence recorded for book "${slug}" in ${configPath} — add a ` +
        '`"licence": { "code": …, "obtained": … }` block after checking ' +
        'docs/provenance/openstax-cnxml-licence-provenance.md'
    );
  }
  return { licence: code, obtained };
}

module.exports = { getBookLicence };
```

**Test-isolation note (advisor catch — decide consciously, do NOT "fix"):** `getBookLicence` now reads the **real** `books/` dir and does **not** honor `tm-export.cjs`'s `_setTestBooksDir` (which steers `generateTm` to a temp fixture). The `runExport`/`tmRoute` fixture tests use **real** book slugs (`efnafraedi-2e`, `__e2e-fixture__`), so `getBookLicence` reads their real, committed `book-config.json` licence — an **intentional, documented coupling**: the licence is stable per-book metadata (not fixture content), and the frozen contract returns the identical value the inline map did. Do NOT add a `booksDir` arg to isolate these tests — the temp fixtures have no `book-config.json`, so that would make `getBookLicence` throw. Task 1 Step 1 migrating `__e2e-fixture__`'s book-config is what keeps the E2E writer fixture green.

- [ ] **Step 5: Run to verify it passes**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/book-licences.test.js`
Expected: PASS (all slugs return the pinned values from book-config; throws for stjornufraedi/testbook/no-such-book; no BOOK_LICENCES).

- [ ] **Step 6: Verify the consumers are byte-unchanged.** Run their suites — the TM licence-stamp + corpus licence tests must stay green with no snapshot/byte change:

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/export-corpus.test.js tools/__tests__/generate-tm.test.js tools/__tests__/tm-export.test.js && cd server && npx vitest run __tests__/tmRoute.test.js`
Expected: PASS — all **THREE** byte-frozen consumers green (export-corpus, generate-tm, tm route), proving the `{licence, obtained}` contract held. `export-corpus.test.js` exercises the licence stamp (18 assertions) — it is the third named consumer and MUST be in this gate (advisor catch: `tm-export.test.js` tests the lib, not the corpus). If any snapshot/byte assertion moves, STOP — the contract was not preserved.

- [ ] **Step 7: Commit**

```bash
git add books/efnafraedi-2e/book-config.json books/liffraedi-2e/book-config.json \
        books/orverufraedi/book-config.json books/edlisfraedi-2e/book-config.json \
        books/lifraen-efnafraedi/book-config.json books/__e2e-fixture__/book-config.json \
        tools/lib/book-licences.cjs tools/__tests__/book-licences.test.js
git commit -m "feat(item17): book-config.json is the canonical per-book licence

getBookLicence reads books/<slug>/book-config.json's licence block (nested
{code,obtained}); inline BOOK_LICENCES map removed; return contract frozen so
corpus/TM/tm-route bytes are unchanged. Fail-loud on a missing licence."
```

---

### Task 2: Cross-repo licence agreement test (VEFUR_CONTRACT-gated)

**Files:**
- Test: `tools/__tests__/licence-vefur-contract.test.js` (new)

**Interfaces:**
- Consumes: `getBookLicence` (Task 1); vefur `../namsbokasafn-vefur/src/lib/types/book.ts` (`bookKey` + `derivativeLicence` per `attribution` block).

- [ ] **Step 1: Write the test** — `tools/__tests__/licence-vefur-contract.test.js`:

```js
/**
 * Item 17 — efni book-config licence ↔ vefur book.ts derivativeLicence agreement.
 * Mirrors css-contract.test.js: skip when the sister repo is absent; VEFUR_CONTRACT=1
 * turns absence into a hard failure. Normalises the format gap
 * ('CC BY 4.0' ↔ 'CC-BY-4.0') before comparing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getBookLicence } = require('../lib/book-licences.cjs');

const VEFUR_BOOK_TS = path.resolve(__dirname, '../../../namsbokasafn-vefur/src/lib/types/book.ts');

// The provenanced books efni stamps and vefur displays (both derive from provenance §1).
const PROVENANCED = ['efnafraedi-2e', 'liffraedi-2e', 'orverufraedi', 'edlisfraedi-2e', 'lifraen-efnafraedi'];

const normalise = (code) => code.replace(/[\s-]/g, '').toUpperCase(); // 'CC BY 4.0' & 'CC-BY-4.0' -> 'CCBY4.0'

function readVefurLicences() {
  const src = fs.readFileSync(VEFUR_BOOK_TS, 'utf-8');
  const map = {};
  const re = /bookKey:\s*'([^']+)'[\s\S]*?derivativeLicence:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) map[m[1]] = m[2];
  return map;
}

describe('licence agreement: efni book-config ↔ vefur book.ts', () => {
  const vefurExists = fs.existsSync(VEFUR_BOOK_TS);
  const requireVefur = process.env.VEFUR_CONTRACT === '1';

  if (requireVefur) {
    it('VEFUR_CONTRACT=1 requires vefur book.ts to be present', () => {
      expect(vefurExists, `VEFUR_CONTRACT=1 but vefur book.ts not found at ${VEFUR_BOOK_TS}`).toBe(true);
    });
  }

  it.skipIf(!vefurExists)('parses at least the provenanced books from vefur book.ts', () => {
    const vefur = readVefurLicences();
    for (const slug of PROVENANCED) {
      expect(vefur[slug], `vefur book.ts has no derivativeLicence for ${slug}`).toBeTruthy();
    }
  });

  it.skipIf(!vefurExists)('every provenanced book agrees after format normalisation', () => {
    const vefur = readVefurLicences();
    for (const slug of PROVENANCED) {
      const efni = getBookLicence(slug).licence;
      expect(
        normalise(efni),
        `licence disagreement for ${slug}: efni="${efni}" vefur="${vefur[slug]}"`
      ).toBe(normalise(vefur[slug]));
    }
  });
});
```

- [ ] **Step 2: Run it (vefur is checked out here, so it runs — not skips)**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/licence-vefur-contract.test.js`
Expected: PASS — the 5 provenanced books agree after normalisation. If it FAILS on a specific book, that is a real efni↔vefur licence disagreement — STOP and report it (a provenance-integrity finding for the lead, not a test to loosen).

- [ ] **Step 3: Mutation-check the normalisation + gate.** Temporarily change one book's `book-config.json` `licence.code` to a wrong value (e.g. `edlisfraedi-2e` → `"CC BY 4.0"`), re-run, CONFIRM the agreement test goes RED (disagreement with vefur's `CC-BY-NC-SA-4.0`), then REVERT the config. Record the RED output. (Proves the test actually compares, not just normalises to a constant.)

- [ ] **Step 4: Commit**

```bash
git add tools/__tests__/licence-vefur-contract.test.js
git commit -m "test(item17): VEFUR_CONTRACT cross-repo licence agreement

book-config licence.code ↔ vefur book.ts derivativeLicence, normalised across
the 'CC BY 4.0' / 'CC-BY-4.0' format gap. Skips without the sister repo;
VEFUR_CONTRACT=1 hard-fails on absence (css-contract pattern)."
```

---

### Task 3: Licence-containment helper

**Files:**
- Create: `tools/lib/licence-containment.cjs`
- Test: `tools/__tests__/licence-containment.test.js` (new)

**Interfaces:**
- Produces: `assertLicenceContainment(licences, target)`, `mostRestrictive(licences)`, `RESTRICTIVENESS` (map).

- [ ] **Step 1: Write the failing test** — `tools/__tests__/licence-containment.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { assertLicenceContainment, mostRestrictive, RESTRICTIVENESS } = require('../lib/licence-containment.cjs');

const BY = 'CC BY 4.0';
const NCSA = 'CC BY-NC-SA 4.0';

describe('mostRestrictive', () => {
  it('returns CC BY for an all-CC-BY set', () => {
    expect(mostRestrictive([BY, BY])).toBe(BY);
  });
  it('returns CC BY-NC-SA when any member is NC-SA', () => {
    expect(mostRestrictive([BY, NCSA, BY])).toBe(NCSA);
  });
  it('throws on an unknown code', () => {
    expect(() => mostRestrictive(['MIT'])).toThrow(/Unknown licence/);
  });
  it('throws on an empty set', () => {
    expect(() => mostRestrictive([])).toThrow();
  });
});

describe('assertLicenceContainment', () => {
  it('permits an all-same aggregate', () => {
    expect(() => assertLicenceContainment([BY, BY], BY)).not.toThrow();
  });
  it('permits a CC BY book inside a CC BY-NC-SA aggregate', () => {
    expect(() => assertLicenceContainment([BY, NCSA], NCSA)).not.toThrow();
  });
  it('FORBIDS a CC BY-NC-SA book inside a CC BY aggregate', () => {
    expect(() => assertLicenceContainment([BY, NCSA], BY)).toThrow(/containment/i);
  });
});

describe('RESTRICTIVENESS', () => {
  it('ranks NC-SA above CC BY', () => {
    expect(RESTRICTIVENESS[NCSA]).toBeGreaterThan(RESTRICTIVENESS[BY]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/licence-containment.test.js`
Expected: FAIL — `Cannot find module '../lib/licence-containment.cjs'`.

- [ ] **Step 3: Create `tools/lib/licence-containment.cjs`:**

```js
/**
 * licence-containment.cjs — the rule for combining per-book licences into ONE
 * aggregate export (item 17 part c).
 *
 * NO caller today: every current export (corpus, TM, glossary, index, book-data)
 * row-stamps or emits per-book, and the one cross-book mixer (the item-21
 * Árnastofnun added-terms seed) is licence-neutral because terms aren't
 * copyrightable. This is the encoded rule + its test, which a FUTURE cross-book
 * aggregate MUST call so a restrictive (NC/SA) book is never silently folded
 * into a permissive (CC BY) aggregate. Codes are efni's spaced form.
 */
'use strict';

// Higher = more restrictive. Extend as new licences enter the corpus.
const RESTRICTIVENESS = { 'CC BY 4.0': 0, 'CC BY-NC-SA 4.0': 1 };

function rank(code) {
  if (!(code in RESTRICTIVENESS)) {
    throw new Error(
      `Unknown licence code "${code}" — add it to tools/lib/licence-containment.cjs RESTRICTIVENESS`
    );
  }
  return RESTRICTIVENESS[code];
}

/**
 * The most restrictive licence in the set (an aggregate's effective licence).
 * @param {string[]} licences
 * @returns {string}
 */
function mostRestrictive(licences) {
  if (!Array.isArray(licences) || licences.length === 0) {
    throw new Error('mostRestrictive requires a non-empty array of licence codes');
  }
  return licences.reduce((a, b) => (rank(b) > rank(a) ? b : a));
}

/**
 * Assert a set of member books may be combined into ONE aggregate labelled
 * `target`. Fail-loud: throws if any member is more restrictive than `target`.
 * @param {string[]} licences member book licence codes
 * @param {string} target the aggregate's intended licence code
 */
function assertLicenceContainment(licences, target) {
  const worst = mostRestrictive(licences);
  if (rank(worst) > rank(target)) {
    throw new Error(
      `Licence containment violation: an aggregate labelled "${target}" would include a ` +
        `more-restrictive "${worst}" book. The aggregate must be at least "${worst}".`
    );
  }
}

module.exports = { assertLicenceContainment, mostRestrictive, RESTRICTIVENESS };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/licence-containment.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/licence-containment.cjs tools/__tests__/licence-containment.test.js
git commit -m "feat(item17): licence-containment helper (preventive, no caller yet)

assertLicenceContainment / mostRestrictive encode 'no restrictive book in a
permissive aggregate'. No cross-book aggregate exists; a future one must call
this. Pure lib + unit test."
```

---

### Task 4: Added-terms licence-neutral disposition + provenance §6.1 addendum

**Files:**
- Modify: `server/lib/arnastofnunSeed.js` (disposition comment)
- Test: `server/__tests__/arnastofnunSeed.test.js` (add a no-licence-stamp lock)
- Modify: `docs/provenance/openstax-cnxml-licence-provenance.md` (§6.1 addendum)

**Interfaces:**
- Consumes: `SEED_COLUMNS`, `serializeSeedJson` (item 21 PR-B).

- [ ] **Step 1: Add the disposition lock test** — append to `server/__tests__/arnastofnunSeed.test.js`:

```js
describe('added-terms seed is intentionally licence-neutral (item 17 c2)', () => {
  it('has no licence column in the CSV header', () => {
    expect(SEED_COLUMNS).not.toContain('licence');
    expect(SEED_COLUMNS.join(',')).not.toMatch(/licen[cs]e/i);
  });
  it('emits no licence field in the JSON doc or its terms', () => {
    const doc = JSON.parse(serializeSeedJson([ROW], { date: new Date('2026-01-02Z') }));
    expect('licence' in doc).toBe(false);
    expect(Object.keys(doc.terms[0])).not.toContain('licence');
  });
});
```

(`SEED_COLUMNS`, `serializeSeedJson`, `ROW` are already imported/defined at the top of that test file.)

- [ ] **Step 2: Run to verify it passes** (the seed already carries no licence — this LOCKS that):

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni/server && npx vitest run __tests__/arnastofnunSeed.test.js`
Expected: PASS.

- [ ] **Step 3: Add the disposition comment** at the top of `server/lib/arnastofnunSeed.js`, after the existing header block's final line (before `const SEED_COLUMNS`):

```js
// LICENCE (item 17): this export is intentionally LICENCE-NEUTRAL and carries no
// licence stamp — individual terms aren't copyrightable (established in item 21
// PR-B). It is the only cross-book mixer, so this is recorded as its deliberate
// disposition rather than guarded (see docs/provenance/…-provenance.md §6.1 and
// tools/lib/licence-containment.cjs). Do not add a licence column here.
```

- [ ] **Step 4: Add the §6.1 addendum** to `docs/provenance/openstax-cnxml-licence-provenance.md` (append at the end of the `### 6.1` section, before the next `##`):

```markdown

#### 6.1.a — Item 17 implementation (2026-07-21)

- **Canonical datum.** The per-book licence now lives in `books/<slug>/book-config.json`
  (`"licence": { "code", "obtained" }`); `tools/lib/book-licences.cjs` `getBookLicence()` reads it
  (return contract unchanged; the inline map is retired). Provenanced books only — `stjornufraedi`/`testbook`
  carry none and `getBookLicence` throws for them.
- **Display mechanism adjusted.** The §6.1 "per-product licence footer keyed off book-config" is delivered by
  **vefur**, which already renders a correct, data-driven per-page/print licence footer (`BookAttribution.svelte`,
  build-gated). **efni emits no footer.** A `VEFUR_CONTRACT`-gated test asserts efni's `book-config` licence codes
  agree (after format normalisation) with vefur's `book.ts` `derivativeLicence`.
- **Containment.** corpus + TM already row-stamp per-book and are unaffected. No cross-book aggregate export
  exists; `tools/lib/licence-containment.cjs` encodes the "no restrictive book in a permissive aggregate" rule for
  any future one. The Árnastofnun added-terms export is **licence-neutral** (terms aren't copyrightable) and is
  therefore not a containment target.
```

- [ ] **Step 5: Commit**

```bash
git add server/lib/arnastofnunSeed.js server/__tests__/arnastofnunSeed.test.js \
        docs/provenance/openstax-cnxml-licence-provenance.md
git commit -m "docs(item17): added-terms licence-neutral disposition + §6.1 addendum

Test-lock: the added-terms seed carries no licence stamp (terms aren't
copyrightable). Provenance §6.1.a records book-config as canonical, vefur as
footer owner, and the containment invariant."
```

---

### Task 5: Full-suite gate + campaign register

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 17 → shipped + any registers)

- [ ] **Step 1: Run the full suite from the repo root**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npm test`
Expected: PASS — baseline **3271** + the new `book-licences` (rewritten), `licence-vefur-contract`, `licence-containment`, and `arnastofnunSeed` disposition cases; **no reds**. Record the new total. Also run once with the cross-repo gate armed to prove it: `VEFUR_CONTRACT=1 npx vitest run tools/__tests__/licence-vefur-contract.test.js` → PASS (vefur present).

- [ ] **Step 2: Update the campaign doc** — flip item 17 from "Not started"/"unblocked" to shipped, and note Phase 4 complete. In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, edit the item-17 bullet (search `**Licence metadata per product**` / the `17.` line) to record: book-config canonical + getBookLicence reads it (contract frozen); VEFUR_CONTRACT cross-repo pin; containment helper (no caller); added-terms licence-neutral; footer stays vefur-owned (part b dropped). Add any out-of-scope register notes discovered during implementation.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(campaign): item 17 licence-metadata shipped — Phase 4 complete"
```

---

## Self-Review

**1. Spec coverage** (spec §4):
- Part (a) single-source: 6 book-config migrations + `getBookLicence` rewrite + frozen contract (Task 1). ✓
- Part (a) validation allowlist (6 codes pinned to provenance; throws for the 2 scaffolds) — folded into Task 1's rewritten test (no separate file — YAGNI). ✓
- Part (a′) cross-repo agreement, VEFUR_CONTRACT-gated, format-normalised (Task 2), mutation-checked. ✓
- Part (c) containment helper (no caller) + test (Task 3). ✓
- Part (c) added-terms licence-neutral disposition (comment + lock test) + provenance §6.1 addendum (Task 4). ✓
- Global: `getBookLicence` return frozen → consumer bytes unchanged, proven by Task 1 Step 6. ✓
- Out of scope honored: no renderer/CSS/vefur change; helper not wired; format stays spaced. ✓

**2. Placeholder scan:** every code step shows full file/content; every run step gives the command + expected result. No TBD/TODO. ✓

**3. Type consistency:** `getBookLicence(slug) → {licence, obtained}` (Task 1) consumed unchanged; `assertLicenceContainment(licences, target)` / `mostRestrictive(licences)` / `RESTRICTIVENESS` names match across Task 3 lib + test; the cross-repo test's `normalise` + `readVefurLicences` are self-contained (Task 2). The rewritten `book-licences.test.js` imports only `getBookLicence` (+ `mod` for the BOOK_LICENCES-absence pin). ✓
