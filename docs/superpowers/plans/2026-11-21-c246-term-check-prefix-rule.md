# §C246 term-check prefix rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The editor's term check accepts an approved Icelandic term when a word *starts* with it, so a closed
compound such as `magnesíumklóríð` counts as `magnesíum`, within [USER]'s five rulings.

**Architecture:** A new pure module, `server/lib/termPrefixRule.js`, owns the two enforceable values and the
qualification test. `terminologyService.js` changes in two functions only. `buildInflectionRegex` gains a prefix
shape, and `matchesForm` passes each caller's role and asks for that shape when the role and the term qualify.
`wholeWordRegex` and the whole English side stay untouched.

**Tech Stack:** Node 22 (`.nvmrc`), `server/` is CommonJS, better-sqlite3, Vitest (unit), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-11-21-c246-term-check-prefix-rule-design.md` (approved by [USER] 2026-11-21,
including its §8 calls). Read it first; this plan argues from it, and its §3.4 table is the test list.

## Global Constraints

- **Branch:** `feat/c246-term-check-prefix-rule`, cut from `origin/main` only after PR #757 has merged (the spec
  reaches `main` with it). Never commit to `main`; push and open the PR only when [USER] asks.
- **The values, exactly:** `MIN_PREFIX_TERM_LENGTH = 4`, `PREFIX_EXCLUDED_FORMS = ['merki']`. They live in
  `server/lib/termPrefixRule.js` and nowhere else (CLAUDE.md § *One source of truth*).
- **Length** is `[...text].length` (code points) of the term text as stored. **The exclusion** compares the
  lowercased text exactly, so `formerki` is not excluded.
- **A multi-word or hyphenated term** (text contains whitespace or `-`) qualifies only when its last part, split on
  `/[\s-]/`, has 4 or more code points. A term ending in `-` has an empty last part and never qualifies.
- **Roles:** `winner` and `tie` take the prefix when the text qualifies; `alternative` never does (A2).
- **One rule for every book:** there is no book filter (the spec's §8, call 3).
- **Stored inflected forms stay whole-word in every role** (ruling 1).
- **Do not change `wholeWordRegex`.** `lib/termAutomaton.js` and `lib/wordBoundary.js` promise to reproduce it.
- **Do not regenerate `server/__tests__/fixtures/c24-golden.json`.** It must pass unchanged.
- **Test files:** `import` Vitest and Node built-ins; load server modules with `createRequire(import.meta.url)`.
  Copy the header from `server/__tests__/importConcepts.test.js`; Vitest cannot be `require`d.
- **Run `npm test` from the repo root.** CI also runs `npm run lint`, `npm run format:check` and the E2E job.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The term occurring inside a word** (`miðberyllíumatómið` holds `beryllíum` after `mið`) must still warn: the
   left boundary stays. → Task 2, test `RF1`.
2. **A stored inflected form starting a compound** (term `sýra`, stored form `sýru`, segment `sýrustig`) must
   still warn, because stored forms are whole-word only (ruling 1). → Task 2, test `RF2`.
3. **A qualifying term containing regex metacharacters** (`eining (mól)`) must match its own literal text and must
   not throw. → Task 2, test `RF3`.
4. **An upper-case compound** (`MAGNESÍUMKLÓRÍÐ`) must pass like the lower-case one; case handling is unchanged.
   → Task 2, test `RF4`.
5. **The intra-concept sibling** (rank-2 `atóm` inside `atómmassi`) must stay `missing`. A2 covers the
   `isTermsFor` sibling search as well as the cross-concept `alts`. → Task 2, test `RF5`.

---

### Task 1: The rule's values and its qualification test

**Files:**
- Create: `server/lib/termPrefixRule.js`
- Test: `server/__tests__/termPrefixRule.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (CommonJS `module.exports`):
  - `MIN_PREFIX_TERM_LENGTH: number`, which is `4`;
  - `PREFIX_EXCLUDED_FORMS: readonly string[]`, which is `['merki']`, frozen;
  - `prefixQualifies(text: string | null | undefined): boolean`.

- [ ] **Step 1: Cut the branch**

```bash
gh pr view 757 --json state --jq .state        # must print MERGED
git fetch origin && git switch -c feat/c246-term-check-prefix-rule origin/main
test -f docs/superpowers/specs/2026-11-21-c246-term-check-prefix-rule-design.md && echo spec-present
```

- [ ] **Step 2: Write the failing test** `server/__tests__/termPrefixRule.test.js`, with these assertions:

```js
expect(MIN_PREFIX_TERM_LENGTH).toBe(4);
expect(PREFIX_EXCLUDED_FORMS).toEqual(['merki']);
expect(Object.isFrozen(PREFIX_EXCLUDED_FORMS)).toBe(true);
// single words: the 4-code-point minimum
expect(prefixQualifies('ál')).toBe(false);
expect(prefixQualifies('jón')).toBe(false);
expect(prefixQualifies('glas')).toBe(true);
expect(prefixQualifies('vetni')).toBe(true);
// the exclusion: exact and case-insensitive
expect(prefixQualifies('merki')).toBe(false);
expect(prefixQualifies('Merki')).toBe(false);
expect(prefixQualifies('formerki')).toBe(true);
// multi-word and hyphenated: judged by the last part (B3)
expect(prefixQualifies('Lewis-mynd')).toBe(true);
expect(prefixQualifies('einsetulögmál Pauli')).toBe(true);
expect(prefixQualifies('oxunar-afoxunarhvarf')).toBe(true);
expect(prefixQualifies('sýrubindandi lyf')).toBe(false);
expect(prefixQualifies('fjölatóma jón')).toBe(false);
expect(prefixQualifies('upphafs-')).toBe(false);
// nothing to judge
expect(prefixQualifies('')).toBe(false);
expect(prefixQualifies(null)).toBe(false);
expect(prefixQualifies(undefined)).toBe(false);
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run server/__tests__/termPrefixRule.test.js`
Expected: FAIL, `Cannot find module '../lib/termPrefixRule'`.

- [ ] **Step 4: Implement `server/lib/termPrefixRule.js`**

Export the two values and `prefixQualifies(text)`, following the Global Constraints exactly. The file's header
comment names the spec and says these are the only copies of the values.

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run server/__tests__/termPrefixRule.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/lib/termPrefixRule.js server/__tests__/termPrefixRule.test.js
git commit -m "feat(terminology): §C246 prefix-rule values and qualification test"
```

---

### Task 2: The term check takes the prefix rule

**Files:**
- Modify: `server/services/terminologyService.js` (`matchesForm` inside `findTermsInSegments`, its four call sites,
  `buildInflectionRegex`, and the comments at both)
- Test: `server/__tests__/findTermsPrefixRule.test.js` (new)

**Interfaces:**
- Consumes: `prefixQualifies(text)` from Task 1.
- Produces:
  - `buildInflectionRegex(icelandic: string, inflections: string[], { prefix = false } = {}): RegExp`, module-private
    as today;
  - `matchesForm(term, role: 'winner' | 'tie' | 'alternative'): boolean`;
  - no export changes.

- [ ] **Step 1: Write the failing tests** `server/__tests__/findTermsPrefixRule.test.js`

Setup, as in `terminologyService.test.js`'s IS-side block:
- `beforeEach`: a fresh migrated database (`freshMigratedDb()`), then `seedBooks(db)` from
  `../scripts/lib/scratchCorpus` (silence its `console.log`, as `findTermsGolden.test.js` does), then
  `DELETE FROM concept_term` and `DELETE FROM concept` (as `findTermsTie.test.js` does), so that
  migration-seeded house-style rows cannot collide with a fixture's English, then
  `terminologyService._setTestDb(db)`;
- `afterEach`: `_setTestDb(null)` and `db.close()`;
- book `efnafraedi-2e`, whose chain is chemistry > physics.

Small local helpers:
- `addConcept(domain)`;
- `addTerm(conceptId, lang, text, rank = 1, inflections = null)`, which stores `inflections` as a JSON string in
  `concept_term.inflections`;
- `seg(en, is)`, which builds the one-segment array;
- `run(en, is)`, which returns `findTermsInSegments(seg(en, is), 'efnafraedi-2e').s1.issues`.

One `it` per row. "passes" asserts `issues` is `[]`. "warns" asserts one issue with `type: 'missing'` and
`expected` equal to the term. Every row seeds a chemistry concept for its English and Icelandic, unless the row
says otherwise.

| Id | English → Icelandic (extra setup) | `isContent` | Expected | Red before? |
|---|---|---|---|---|
| R1 | magnesium → magnesíum | `Magnesíumjónin er lítil.` | passes | **yes** |
| R2 | magnesium → magnesíum | `Magnesíum-jónin er lítil.` | passes | no |
| R3 | magnesium → magnesíum (inflections `["magnesíums"]`) | `Massi magnesíums.` | passes | no |
| R4 | magnesium → magnesíum (no inflections) | `Massi magnesíums.` | passes | **yes** |
| R5 | magnesium → magnesíum | `Mg er málmur.` | warns | no |
| R6 | magnesium → magnesíum | `Magnesín er málmur.` | warns | no |
| R7 | beryllium → beryllíum | `í kringum miðberyllínatómið` | warns | no |
| RF1 | beryllium → beryllíum | `í kringum miðberyllíumatómið` | warns | no |
| R8a | ion → jón | `Jónun er ferli.` | warns | no |
| R8b | ion → jón | `Þetta er jón.` | passes | no |
| R9 | label → merki | `Merkingin sést.` | warns | no |
| R11 | Lewis structure → Lewis-mynd | `Lewis-myndin sýnir það.` | passes | **yes** |
| R12 | antacid → sýrubindandi lyf | `sýrubindandi lyfið virkar` | warns | no |
| R13 | initial pH → upphafs- | `Upphafs-pH er 7.` | warns | no |
| RF2 | acid → sýra (inflections `["sýru","sýrur"]`) | `Sýrustig lausnarinnar.` | warns | no |
| RF3 | mole unit → eining (mól) | `Ein eining (mól) hér.` | passes, no throw | no |
| RF4 | magnesium → magnesíum | `MAGNESÍUMKLÓRÍÐ` | passes | **yes** |
| T1 | sign → two chemistry concepts, `formerki` and `tákn` (a tie) | `Formerkisins gætir.` | passes | **yes** |
| T2 | sign → two chemistry concepts, `merki` and `formerki` (a tie) | `Merkingin sést.` | warns (`missing`, `options` has both) | no |
| A0 | valence → chemistry `gildistala`; physics `gildi` | `Gildi frumeindarinnar.` | one issue, `type: 'alternative'`, `used: 'gildi'` (fixture control) | no |
| A1 | valence → chemistry `gildistala`; physics `gildi` | `Gildishvolfið er fullt.` | one issue, `type: 'missing'` (A2) | no |
| RF5 | atom → `frumeind` rank 1 and `atóm` rank 2, same concept | `Atómmassi er mældur.` | one issue, `type: 'missing'` (A2) | no |

Each `enContent` is a short English sentence containing the English term, for example
`'The magnesium ion is small.'`.

- [ ] **Step 2: Run the tests to verify the red set**

Run: `npx vitest run server/__tests__/findTermsPrefixRule.test.js`
Expected: exactly **R1, R4, R11, RF4 and T1 fail**, each with an unexpected `missing` issue, and all 17 others
pass. Any other failure is a fixture error; fix it before touching the service.

- [ ] **Step 3: Implement the rule in `server/services/terminologyService.js`**

- **`require`** `prefixQualifies` from `../lib/termPrefixRule`.
- **`buildInflectionRegex(icelandic, inflections, { prefix = false } = {})`:**
  - without `prefix`, return `wholeWordRegex([icelandic, ...inflections])` exactly as now;
  - with it, return one `giu` RegExp that alternates `(?<![\p{L}\p{N}_])(?:<escaped icelandic>)`, with no right
    boundary, with the stored inflections as today's whole-word alternation;
  - use the existing `escapeRegex`.
- **`matchesForm(term, role)`:** pass `{ prefix: role !== 'alternative' && prefixQualifies(term.text) }`.
- **🔴 Change all four call sites in this same step, with explicit roles:**
  - `hit.tied.some((t) => matchesForm(t, 'tie'))`;
  - `matchesForm(winner, 'winner')`;
  - `alts.find((t) => matchesForm(t, 'alternative'))`;
  - the `isTermsFor(...).find(...)` callback passes `'alternative'`.

  `.some` and `.find` pass the array index as the second argument, so a call site left as `.find(matchesForm)`
  would hand `role` the value `0` and give alternatives the prefix.
- **The comments** at `matchesForm` and `buildInflectionRegex` state the rule in one line each and name the spec.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npx vitest run server/__tests__/findTermsPrefixRule.test.js server/__tests__/termPrefixRule.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Run the existing term-check suites**

Run: `npx vitest run server/__tests__/terminologyService.test.js server/__tests__/findTermsTie.test.js server/__tests__/findTermsDifferential.test.js server/__tests__/findTermsSymbolCase.test.js server/__tests__/findTermsGolden.test.js server/__tests__/readFiringRows.test.js server/__tests__/bookGlossaryResolve.test.js server/__tests__/findTermsC19ApplyProbe.test.js`
Expected: PASS, with `findTermsGolden` unchanged.

For any failure, check whether the failing assertion expects a warning on a word that starts with a qualifying
winner or tie term:
- if it does, update that test's expectation, and say in the commit message which ruling flips it;
- if it doesn't, the implementation is wrong, so fix the code, not the test.

- [ ] **Step 6: Run the full gates**

Run, from the repo root: `npm test && npm run lint && npm run format:check`
Expected: all pass.

Then run the E2E job (`cd server && npm run test:e2e`) where the local environment allows; otherwise rely on CI's
`e2e` job and say so. `e2e/terminology-multibook.spec.js` expects a `missing` issue for `leikföng-e2e-seed`, and
nothing in the module text starts with that form, so it should be unaffected.

- [ ] **Step 7: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/findTermsPrefixRule.test.js
git commit -m "feat(terminology): §C246 the term check accepts a word that starts with the term"
```

---

### Task 3: Acceptance on production (after [USER] merges and deploys)

The PR, its merge and the deploy are [USER]'s. `scripts/deploy.sh` needs `sudo`. This task is read-only on
production and starts only once production runs the merge commit.

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C246, §C245's hold, the RESUME entry)
- Evidence (not committed raw): the two dry-run outputs

**Interfaces:**
- Consumes: the measurement-14 instruments in `experiments/element-names/evidence/2026-11-20-census/instruments/`
  (`build-termcheck-dryruns.py`, `termcheck-dryrun-{magnesium,c73}.template.cjs`, `ingest-termcheck-dryrun.py`).
- Produces: a recorded pass or fail of the spec's §6.1.

- [ ] **Step 1: Confirm production runs the change**

Run: `ssh -o BatchMode=yes <prod> 'cd ~/repos/namsbokasafn-efni && git log --oneline -1 && git status --porcelain | wc -l'`
Expected: the merge commit of this branch's PR, or a later one, and `0`.

- [ ] **Step 2: Rebuild both dry-run scripts**

Use README §14's commands. Build a second c73 script as well, with `../reports/editor-fixes-inner.json` added to
the draft list.

- [ ] **Step 3: Run them read-only on production**

Run each with `ssh ... 'cd ~/repos/namsbokasafn-efni/server/scripts && node - efnafraedi-2e' < <script> > <raw>`,
recording the database file's `stat` and `git status --porcelain` before and after.
Expected:
- **c73 script, measurements 7–9's drafts:** `counts['B.fixed']` totals **1** warning, `beryllium` on
  `m68742:para:fs-idp122770240`. `magnesium` is 0.
- **c73 script with the inner draft as well:** **0**.
- **The c73 synthetic block:** `synthetic.B.compoundWarns` is **0** and `passOk` is **59**. The 59 `|compound`
  ids now appear under `anomalies` with `issue: null`, which is the new behaviour, not an error.
- **The magnesium script:** `variants['B.fixed'].issueCount` is **0**, down from 43. `synthetic.B` has
  `S3-closed-compound` issue `null` and still `missing` for `S5-symbol-only` and `S6-non-official`.
- **Both:** `fileUnchanged` is `true`, and production's checkout stays clean.

- [ ] **Step 4: Record it**

- **If every expectation holds:** §C246 reads built, deployed and the acceptance passed (cite this branch's PR
  and merge commit), and §C245's hold on the 59 adds lifts. [USER] then follows step 4 of
  `reports/c73-entries.md`.
- **If any expectation fails:** record the measured numbers and stop for [USER].
- **Either way,** roll dashboard rows s22 and s23 in the same session (CLAUDE.md; procedure in memory
  `dashboard-artifact`).
- **The spec's §6.2** (4,451 of 31,573 warnings on 2026-11-21's text) is an expectation, not part of acceptance.
  Measurement 15's census cannot be re-run unchanged, because its patch anchor is gone once this change lands.

- [ ] **Step 5: Commit the register update** on a docs branch, and open its PR when [USER] asks.
