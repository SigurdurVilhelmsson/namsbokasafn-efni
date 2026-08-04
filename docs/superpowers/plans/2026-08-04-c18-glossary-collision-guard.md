# C18 Glossary Collision Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a competition between two approved Icelandic translations of one English headword **visible** everywhere it occurs, and stop the MT path from acting on an unresolved one — without choosing any term.

**Architecture:** One pure detector module (`tools/lib/glossary-collisions.js`) is the single definition of "competition". Three consumers use it: `buildGlossaryMap` returns it as data for the render path; `formatGlossary` omits competing headwords and comma-list values from the outbound MT glossary and reports via callback; a standalone validator gates against a committed per-book baseline.

**Tech Stack:** Node 22.x, vanilla ES modules, Vitest. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-08-04-c18-glossary-collision-guard-design.md`](../specs/2026-08-04-c18-glossary-collision-guard-design.md)
**Register item:** C18 (P1, `[CODE]`) in [`docs/plans/2026-07-21-post-item17-followup-campaign.md`](../../plans/2026-07-21-post-item17-followup-campaign.md)
**Branch:** `fix/c18-glossary-collision-guard`

---

## Global Constraints

Every task's requirements implicitly include this section.

1. **🔴 `formatGlossary`'s return object IS the outbound HTTP request body.** `tools/lib/malstadur-api.js:242` assigns it to `body.glossaries` via `filterGlossaryForText`'s spread. **NEVER add a field to that return object** — a count, a report, a debug key, anything. Data added there is shipped to a third party. The existing wire-shape test in `tools/__tests__/malstadur-glossary-guard.test.js` exists specifically to stop this. **All reporting goes through callbacks.**
2. **Byte-neutrality on the render path is a requirement.** `buildGlossaryMap` keeps last-write-wins unchanged. This PR must not change a single rendered byte.
3. **Never choose a term.** The guard surfaces competition; register §C14 ② owns resolving it. A deterministic-but-arbitrary tiebreak is not a fix.
4. **Never resolve a resource path against `process.cwd()`.** Use `import.meta.url` / `__dirname`. The server runs with `cwd=server/`.
5. **Run `npm test` from the repo root.** It is the authoritative gate (no branch protection).
6. **CI runs more than `npm run lint`.** It also runs `npm run format:check` (prettier). Run both before every commit.
7. **Vanilla ES modules, functional style.** Validate at boundaries; trust internal paths.
8. **One commit per task**, message body explaining *why*, ending with the `Co-Authored-By` trailer.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/lib/glossary-collisions.js` | **Create.** Pure detector + pure warning formatter. No I/O, no logging. The single definition of "competition". |
| `tools/lib/math-label-substitute.js` | **Modify.** `buildGlossaryMap` returns `{map, collisions}`; `loadMathLabelResolver` annotates `masked` and passes the report up. |
| `tools/cnxml-inject.js` | **Modify.** Warn once per book, on resolver cache-miss. |
| `tools/cnxml-fidelity-check.js` | **Modify.** Stop discarding the report; warn once (already once-per-book by structure). |
| `tools/lib/malstadur-api.js` | **Modify.** `formatGlossary` omits competing headwords + comma-list values; new `onOmitted` callback. |
| `tools/api-translate.js` | **Modify.** Thread `onOmitted` through `loadGlossary`; extend `glossaryStatusLine`. |
| `tools/translate-chapter-titles.js` | **Modify.** Pass `onOmitted` at both call sites; print the returned count. |
| `tools/validate-glossary.js` | **Create.** CLI gate with `--update-baseline`, following `cnxml-render-fidelity-check.js`'s idiom. |
| `books/{efnafraedi-2e,lifraen-efnafraedi}/glossary/glossary-collisions-baseline.json` | **Create.** Committed worklists. |
| `package.json` | **Modify.** Add `validate:glossary` script. |

---

### Task 1: The pure detector

**Files:**
- Create: `tools/lib/glossary-collisions.js`
- Test: `tools/__tests__/glossary-collisions.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `findGlossaryCollisions(terms: Array<{english?:string, icelandic?:string, status?:string}>, opts?: {approvedOnly?: boolean}) → {competitions: Array<{english:string, candidates:string[], chosen:string}>, commaLists: Array<{english:string, value:string, parts:string[]}>}`
  - `formatCollisionReport(bookLabel: string, collisions: object) → string|null`

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/glossary-collisions.test.js`:

```js
// tools/__tests__/glossary-collisions.test.js
/**
 * C18: two approved translations can compete for one English headword.
 * buildGlossaryMap's Map silently last-write-wins; formatGlossary sends both
 * to Málstaður. This detector is the single definition of "competition" —
 * three consumers share it so the rule cannot drift.
 */
import { describe, it, expect } from 'vitest';
import { findGlossaryCollisions, formatCollisionReport } from '../lib/glossary-collisions.js';

const term = (english, icelandic, status = 'approved') => ({ english, icelandic, status });

describe('findGlossaryCollisions — competitions', () => {
  it('reports two distinct Icelandic values for one English key', () => {
    const { competitions } = findGlossaryCollisions([
      term('atom', 'frumeind'),
      term('atom', 'atóm'),
    ]);
    expect(competitions).toEqual([
      { english: 'atom', candidates: ['frumeind', 'atóm'], chosen: 'atóm' },
    ]);
  });

  it('does NOT report two identical values (a duplicate row is not a competition)', () => {
    const { competitions } = findGlossaryCollisions([
      term('water', 'vatn'),
      term('water', 'vatn'),
    ]);
    expect(competitions).toEqual([]);
  });

  it('collects all three candidates when three compete', () => {
    const { competitions } = findGlossaryCollisions([
      term('resonance', 'samhrif'),
      term('resonance', 'vok'),
      term('resonance', 'vok mynd'),
    ]);
    expect(competitions[0].candidates).toEqual(['samhrif', 'vok', 'vok mynd']);
  });

  it('chosen is the LAST qualifying entry, matching buildGlossaryMap last-write-wins', () => {
    const { competitions } = findGlossaryCollisions([term('group', 'flokkur'), term('group', 'hópur')]);
    expect(competitions[0].chosen).toBe('hópur');
  });

  it('folds case: Atom and atom are one key', () => {
    const { competitions } = findGlossaryCollisions([
      term('Atom', 'frumeind'),
      term('atom', 'atóm'),
    ]);
    expect(competitions).toHaveLength(1);
    expect(competitions[0].english).toBe('atom');
  });

  it('ignores blank sides, matching both consumers own filters', () => {
    const { competitions } = findGlossaryCollisions([
      term('ether', 'eter'),
      term('ether', '   '),
      term('  ', 'eter'),
    ]);
    expect(competitions).toEqual([]);
  });

  it('approvedOnly:true excludes non-approved candidates', () => {
    const { competitions } = findGlossaryCollisions([
      term('cell', 'fruma'),
      term('cell', 'ker', 'proposed'),
    ]);
    expect(competitions).toEqual([]);
  });

  it('approvedOnly:false includes them', () => {
    const { competitions } = findGlossaryCollisions(
      [term('cell', 'fruma'), term('cell', 'ker', 'proposed')],
      { approvedOnly: false }
    );
    expect(competitions).toHaveLength(1);
  });
});

describe('findGlossaryCollisions — comma lists', () => {
  it('reports a comma-separated value and splits parts for the reader', () => {
    const { commaLists } = findGlossaryCollisions([term('anion', 'anjón, mínusjón, neijón')]);
    expect(commaLists).toEqual([
      {
        english: 'anion',
        value: 'anjón, mínusjón, neijón',
        parts: ['anjón', 'mínusjón', 'neijón'],
      },
    ]);
  });

  it('a comma value that ALSO competes appears in both arrays, independently', () => {
    const r = findGlossaryCollisions([term('power', 'fjöldatala, stétt'), term('power', 'veldi')]);
    expect(r.competitions).toHaveLength(1);
    expect(r.commaLists).toHaveLength(1);
  });

  it('a plain value is not a comma list', () => {
    expect(findGlossaryCollisions([term('water', 'vatn')]).commaLists).toEqual([]);
  });
});

describe('formatCollisionReport', () => {
  it('returns null when there is nothing to report', () => {
    expect(formatCollisionReport('efnafraedi-2e', { competitions: [], commaLists: [] })).toBeNull();
  });

  it('names the book, both counts, and the chosen term', () => {
    const out = formatCollisionReport('efnafraedi-2e', {
      competitions: [{ english: 'group', candidates: ['flokkur', 'hópur'], chosen: 'hópur' }],
      commaLists: [],
    });
    expect(out).toContain('efnafraedi-2e');
    expect(out).toContain('group → flokkur | hópur');
    expect(out).toContain('hópur');
  });

  it('states both the total and the unmasked count when masked is annotated', () => {
    const out = formatCollisionReport('efnafraedi-2e', {
      competitions: [
        { english: 'atom', candidates: ['a', 'b'], chosen: 'b', masked: true },
        { english: 'group', candidates: ['c', 'd'], chosen: 'd', masked: false },
      ],
      commaLists: [],
    });
    expect(out).toContain('2 English key');
    expect(out).toContain('1 not covered');
  });

  it('truncates a long list rather than printing every entry', () => {
    const competitions = Array.from({ length: 13 }, (_, i) => ({
      english: `term${i}`,
      candidates: ['a', 'b'],
      chosen: 'b',
      masked: false,
    }));
    const out = formatCollisionReport('efnafraedi-2e', { competitions, commaLists: [] });
    expect(out).toContain('… 8 more');
    expect(out).not.toContain('term12 →');
  });

  it('always points at the validator for the full list', () => {
    const out = formatCollisionReport('efnafraedi-2e', {
      competitions: [{ english: 'group', candidates: ['a', 'b'], chosen: 'b' }],
      commaLists: [],
    });
    expect(out).toContain('npm run validate:glossary -- --book efnafraedi-2e');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/glossary-collisions.test.js`
Expected: FAIL — `Failed to resolve import "../lib/glossary-collisions.js"`

- [ ] **Step 3: Write the implementation**

Create `tools/lib/glossary-collisions.js`:

```js
// tools/lib/glossary-collisions.js
/**
 * C18 — detect unresolved term competitions in a glossary term list.
 *
 * A "competition" is one English headword with two or more DISTINCT approved
 * Icelandic translations. It matters because both consumers of the glossary
 * resolve it badly and silently:
 *   - buildGlossaryMap (tools/lib/math-label-substitute.js) writes every term
 *     into a Map keyed on lowercase English, so the last row wins — array
 *     order decides which word is substituted.
 *   - formatGlossary (tools/lib/malstadur-api.js) emits one pair per row, so
 *     it sends Málstaður both atom→frumeind AND atom→atóm in one request.
 *
 * This module ONLY reports. It never chooses a term: choosing is editorial
 * work owned by register C14 (2), and a deterministic-but-arbitrary tiebreak
 * is still an unreviewed editorial decision (register C18).
 *
 * Pure — no I/O, no logging, no process.cwd().
 */

/**
 * @param {Array<{english?:string, icelandic?:string, status?:string}>} terms
 * @param {{approvedOnly?: boolean}} [opts] approvedOnly mirrors the caller's
 *   own filter; pass false when `terms` has already been filtered.
 * @returns {{competitions: Array<{english:string, candidates:string[], chosen:string}>,
 *            commaLists: Array<{english:string, value:string, parts:string[]}>}}
 */
export function findGlossaryCollisions(terms, { approvedOnly = true } = {}) {
  const list = Array.isArray(terms) ? terms : [];
  const filtered = approvedOnly ? list.filter((t) => t && t.status === 'approved') : list;

  const byKey = new Map(); // lowercased english -> Icelandic values, in input order
  const commaLists = [];

  for (const t of filtered) {
    if (!t) continue;
    // Same blank-side filter both consumers already apply, so the detector
    // never reports a competition its consumer would not have had.
    const en = typeof t.english === 'string' ? t.english.trim() : '';
    const is = typeof t.icelandic === 'string' ? t.icelandic.trim() : '';
    if (!en || !is) continue;

    const key = en.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(is);

    if (is.includes(',')) {
      commaLists.push({
        english: key,
        value: is,
        parts: is
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }
  }

  const competitions = [];
  for (const [english, values] of byKey) {
    const candidates = [...new Set(values)];
    if (candidates.length < 2) continue;
    // `chosen` mirrors buildGlossaryMap's last-write-wins EXACTLY. It records
    // the status quo so the report describes reality; it does not propose a
    // change. If this ever diverges from what the Map returns, the report
    // becomes confidently wrong, which is worse than silence.
    competitions.push({ english, candidates, chosen: values[values.length - 1] });
  }

  return { competitions, commaLists };
}

const MAX_LISTED = 5;

/**
 * Operator-facing report. Pure — returns the string, never prints it, so the
 * inject and fidelity-check paths cannot drift into two different formats.
 *
 * @param {string} bookLabel
 * @param {{competitions?: Array<object>, commaLists?: Array<object>}} collisions
 * @returns {string|null} null when there is nothing to report
 */
export function formatCollisionReport(bookLabel, collisions) {
  const competitions = (collisions && collisions.competitions) || [];
  const commaLists = (collisions && collisions.commaLists) || [];
  if (competitions.length === 0 && commaLists.length === 0) return null;

  const lines = [];

  if (competitions.length > 0) {
    // Both numbers are stated on purpose. The total is what exists in the data
    // and what the baseline must carry; the unmasked count is what currently
    // reaches readers. Printing only the second would make math-label-map.json
    // look like a fix rather than a coincidence.
    const unmasked = competitions.filter((c) => c.masked !== true).length;
    lines.push(
      `⚠️  glossary (${bookLabel}): ${competitions.length} English key(s) have more than one approved Icelandic term.`
    );
    lines.push(
      `    ${unmasked} not covered by math-label-map.json — for those, row order decides which term readers see.`
    );
    for (const c of competitions.slice(0, MAX_LISTED)) {
      lines.push(`      ${c.english} → ${c.candidates.join(' | ')}   (using: ${c.chosen})`);
    }
    if (competitions.length > MAX_LISTED) {
      lines.push(`      … ${competitions.length - MAX_LISTED} more`);
    }
  }

  if (commaLists.length > 0) {
    lines.push(
      `⚠️  glossary (${bookLabel}): ${commaLists.length} Icelandic value(s) are comma-separated lists, not single terms.`
    );
    for (const c of commaLists.slice(0, MAX_LISTED)) {
      lines.push(`      ${c.english} → "${c.value}"`);
    }
    if (commaLists.length > MAX_LISTED) {
      lines.push(`      … ${commaLists.length - MAX_LISTED} more`);
    }
  }

  lines.push(`    Full list: npm run validate:glossary -- --book ${bookLabel}`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/glossary-collisions.test.js`
Expected: PASS, 16 tests

- [ ] **Step 5: Lint, format, commit**

```bash
npm run lint && npm run format:check
git add tools/lib/glossary-collisions.js tools/__tests__/glossary-collisions.test.js
git commit -m "feat(c18): pure detector for glossary term competitions

One English headword can carry two approved Icelandic translations.
buildGlossaryMap's Map last-write-wins on them; formatGlossary sends
both to Malstadur. This module is the single definition of what a
competition is, so the three consumers cannot drift apart.

It reports and never chooses — choosing is editorial work owned by
register C14 (2), and an arbitrary tiebreak is not a fix.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Render path reports collisions as data

**Files:**
- Modify: `tools/lib/math-label-substitute.js:15-25` (`buildGlossaryMap`), `:135-146` (`loadMathLabelResolver`)
- Test: `tools/__tests__/math-label-substitute.test.js:11-25`

**Interfaces:**
- Consumes: `findGlossaryCollisions` from Task 1.
- Produces:
  - `buildGlossaryMap(glossary) → {map: Map<string,string>, collisions: {competitions, commaLists}}` — **breaking change**, was a bare `Map`.
  - `loadMathLabelResolver(bookDir) → {resolve, overlay, glossaryMap, collisions}` where each competition gains `masked: boolean`.

- [ ] **Step 1: Write the failing test**

Replace the existing `describe('buildGlossaryMap', …)` block at `tools/__tests__/math-label-substitute.test.js:11-25` with:

```js
describe('buildGlossaryMap', () => {
  it('keeps only approved terms with non-empty Icelandic, keyed lowercase', () => {
    const g = {
      terms: [
        { english: 'Rate', icelandic: 'hraði', status: 'approved' },
        { english: 'sub', icelandic: '', status: 'approved' }, // empty → dropped
        { english: 'cell', icelandic: 'ker', status: 'pending' }, // not approved → dropped
      ],
    };
    const { map } = buildGlossaryMap(g);
    expect(map.get('rate')).toBe('hraði');
    expect(map.has('sub')).toBe(false);
    expect(map.has('cell')).toBe(false);
  });

  it('reports a competition instead of resolving it silently (C18)', () => {
    const g = {
      terms: [
        { english: 'atom', icelandic: 'frumeind', status: 'approved' },
        { english: 'atom', icelandic: 'atóm', status: 'approved' },
      ],
    };
    const { collisions } = buildGlossaryMap(g);
    expect(collisions.competitions).toHaveLength(1);
    expect(collisions.competitions[0].candidates).toEqual(['frumeind', 'atóm']);
  });

  // BYTE-NEUTRALITY. This PR must not change a single rendered byte, so the
  // Map must keep resolving to the LAST qualifying entry exactly as before.
  // Stated as "last wins" rather than "same as before the change" because the
  // latter is untestable — it collapses to hardcoding the value.
  it('still resolves to the LAST qualifying entry (byte-neutral)', () => {
    const g = {
      terms: [
        { english: 'atom', icelandic: 'frumeind', status: 'approved' },
        { english: 'atom', icelandic: 'atóm', status: 'approved' },
      ],
    };
    const { map } = buildGlossaryMap(g);
    expect(map.get('atom')).toBe('atóm');
  });

  // The report must not be able to drift from the Map it describes. Asserting
  // them independently would let a confidently-wrong report ship green.
  it('chosen equals what the map actually returns', () => {
    const g = {
      terms: [
        { english: 'group', icelandic: 'flokkur', status: 'approved' },
        { english: 'group', icelandic: 'hópur', status: 'approved' },
      ],
    };
    const { map, collisions } = buildGlossaryMap(g);
    expect(collisions.competitions[0].chosen).toBe(map.get('group'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/math-label-substitute.test.js`
Expected: FAIL — `map` is undefined (destructuring a `Map`)

- [ ] **Step 3: Write the implementation**

In `tools/lib/math-label-substitute.js`, add the import after line 4:

```js
import { findGlossaryCollisions } from './glossary-collisions.js';
```

Replace `buildGlossaryMap` (lines 15-25) with:

```js
export function buildGlossaryMap(glossary) {
  const map = new Map();
  const terms = glossary && Array.isArray(glossary.terms) ? glossary.terms : [];
  for (const t of terms) {
    if (t.status !== 'approved') continue;
    const en = (t.english || '').trim().toLowerCase();
    const is = (t.icelandic || '').trim();
    if (en && is) map.set(en, is);
  }
  // C18: the Map above resolves competing translations by last-write-wins,
  // silently. The behaviour is DELIBERATELY unchanged (this must not move a
  // rendered byte); what changes is that the competition is now reported.
  return { map, collisions: findGlossaryCollisions(terms, { approvedOnly: true }) };
}
```

Update the JSDoc `@returns` above it from `{Map<string,string>}` to:

```js
 * @returns {{map: Map<string,string>, collisions: {competitions: Array<object>, commaLists: Array<object>}}}
```

Replace the body of `loadMathLabelResolver` (lines 135-146) after the `glossary` const with:

```js
  const { map: glossaryMap, collisions } = buildGlossaryMap(glossary);

  // buildGlossaryMap sees the glossary only. This is the first point that
  // holds BOTH the glossary and the overlay, so it is where a competition can
  // be told apart from one math-label-map.json overrides. Masking is computed
  // with resolveLabel's own rules, not a plain overlay lookup, or the
  // annotation would disagree with the resolution it describes.
  // NOTE: the key is already lowercased by buildGlossaryMap, so this answers
  // "would the overlay win for this key as stored" — an approximation that is
  // for REPORTING only and never gates behaviour.
  const annotated = {
    ...collisions,
    competitions: collisions.competitions.map((c) => ({
      ...c,
      masked: resolveLabel(c.english, { overlay, glossaryMap }).source.startsWith('overlay'),
    })),
  };

  return { resolve: buildResolver({ overlay, glossaryMap }), overlay, glossaryMap, collisions: annotated };
```

- [ ] **Step 4: Run the full suite to catch the other caller**

Run: `npm test`
Expected: PASS. If `cnxml-inject.js` or `cnxml-fidelity-check.js` tests fail here, that is Tasks 3 — but `loadMathLabelResolver`'s own return shape is additive, so they should not.

- [ ] **Step 5: Lint, format, commit**

```bash
npm run lint && npm run format:check
git add tools/lib/math-label-substitute.js tools/__tests__/math-label-substitute.test.js
git commit -m "feat(c18): buildGlossaryMap reports competitions as data

Returns {map, collisions} instead of a bare Map. One production caller
(loadMathLabelResolver, same file), which now annotates each competition
with whether math-label-map.json covers it — the first point that holds
both the glossary and the overlay.

Last-write-wins is DELIBERATELY unchanged. Switching to first-wins or
sorted would silently change 12 chemistry terms in published output — a
different arbitrary decision wearing a fix's clothing. A test pins the
Map to the last qualifying entry, and another pins `chosen` to what the
Map actually returns so the report cannot drift into being confidently
wrong.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Both render-path tools warn, once per book

**Files:**
- Modify: `tools/cnxml-inject.js:4166-4172` (`getMathLabelResolver`)
- Modify: `tools/cnxml-fidelity-check.js:310`

**Interfaces:**
- Consumes: `formatCollisionReport` (Task 1), `loadMathLabelResolver`'s `collisions` (Task 2).
- Produces: nothing new. Behavioural only.

**⚠️ This task has no red-first test, deliberately.** Its whole content is wiring a pure
formatter (fully unit-tested in Task 1) into two `console.warn` call sites. A unit test
here would either duplicate Task 1's coverage or assert on a console mock, which pins the
mock rather than the behaviour. **The verification is Step 3: running both real tools
against a real book and reading the output.** Do not invent a test to satisfy the ritual —
`path` is already imported in both files (`cnxml-inject.js:39`, `cnxml-fidelity-check.js:21`).

**Context an implementer needs:** there are **two** consumers of `loadMathLabelResolver`, and they differ structurally.
- `cnxml-inject.js` calls it through a per-`bookDir` cache (`_mathLabelResolverCache`). A whole-book chemistry inject touches ~90 modules; warning per module would print ~1,170 lines and train the reader to ignore it. Warn on **cache-miss only**.
- `cnxml-fidelity-check.js` already calls it **once in `main()`** (`:310`), before the per-chapter loop. It is once-per-book by structure and needs **no cache** — it only has to stop discarding the report.

- [ ] **Step 1: Wire both consumers**

In `tools/cnxml-inject.js`, add to the import block at line 63-67:

```js
import {
  loadMathLabelResolver,
  substituteMathLabels,
  reportMathLabels,
} from './lib/math-label-substitute.js';
import { formatCollisionReport } from './lib/glossary-collisions.js';
```

Replace `getMathLabelResolver` (lines 4166-4172) with:

```js
const _mathLabelResolverCache = new Map();
function getMathLabelResolver(bookDir) {
  if (!_mathLabelResolverCache.has(bookDir)) {
    const resolver = loadMathLabelResolver(bookDir);
    // C18: warn on cache-miss only — once per book per process. A whole-book
    // inject touches ~90 modules, so per-module warning would print ~1,170
    // lines and train the reader to ignore it. Noise fails the same way
    // silence does.
    const report = formatCollisionReport(path.basename(bookDir), resolver.collisions);
    if (report) console.warn(report);
    _mathLabelResolverCache.set(bookDir, resolver);
  }
  return _mathLabelResolverCache.get(bookDir);
}
```

In `tools/cnxml-fidelity-check.js`, add after line 32:

```js
import { formatCollisionReport } from './lib/glossary-collisions.js';
```

Replace line 310 with:

```js
  // C18: already once-per-book by structure — this call sits before the
  // per-chapter loop, so no cache is needed. It previously discarded the
  // collision report, which made the tool whose job is reporting
  // discrepancies silent about this one.
  const { resolve: mathResolve, collisions: mathCollisions } = loadMathLabelResolver(BOOKS_DIR);
  const collisionReport = formatCollisionReport(path.basename(BOOKS_DIR), mathCollisions);
  if (collisionReport) console.warn(collisionReport);
```

- [ ] **Step 2: Verify by running both real tools against a real book**

```bash
node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1 2>&1 | head -20
```
Expected: the ⚠️ block appears **once**, naming 13 keys with **12 not covered**, listing 5 and `… 8 more`.

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 2>&1 | grep -c 'glossary (efnafraedi-2e)'
```
⚠️ **Flags, not positionals.** `node tools/cnxml-inject.js efnafraedi-2e 1` exits 1 with
`Error: --book is required` and never reaches the warning, so `grep -c` returns **0** — a
false negative that reads exactly like the guard having regressed. (CLAUDE.md documented
the positional form for three tools until 2026-08-04; corrected there.)
⚠️ This command performs a **real inject** and regenerates `translation-errors.json` and
`residue-report.mt-preview.json`. Revert that churn before committing —
`git checkout -- books/efnafraedi-2e/{translation-errors.json,residue-report.mt-preview.json}`
— it is not part of this change.
Expected: **1** — not one per module. If this prints a number in the dozens, the warning
is outside the cache-miss branch.

```bash
npm test
```
Expected: PASS.

- [ ] **Step 3: Lint, format, commit**

```bash
npm run lint && npm run format:check
git add tools/cnxml-inject.js tools/cnxml-fidelity-check.js
git commit -m "feat(c18): both render-path tools report competitions once per book

cnxml-fidelity-check.js is a SECOND consumer of loadMathLabelResolver
(:31, :310, :155) and was discarding the report entirely — a fail-quiet
path in the tool whose whole job is reporting discrepancies.

The two differ structurally and only one needs a cache: inject warns on
resolver cache-miss (~90 modules per book, so per-module warning would
print ~1,170 lines), while fidelity-check already calls the loader once
in main() before its chapter loop.

Both print from the same pure formatter so the formats cannot drift.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The MT path stops sending contradictions

**Files:**
- Modify: `tools/lib/malstadur-api.js:200-225` (`formatGlossary`)
- Test: `tools/__tests__/malstadur-glossary-guard.test.js` (append)

**Interfaces:**
- Consumes: `findGlossaryCollisions` (Task 1).
- Produces: `formatGlossary(terms, {domain, approvedOnly, onSkipped, onOmitted})` — `onOmitted` receives `{omitted: Array<{sourceWord, targetWord}>, competitions, commaLists}`.

**🔴 The hard constraint for this task:** the object `formatGlossary` returns **is the outbound HTTP body** (`malstadur-api.js:242` assigns it to `body.glossaries`). **Do not add any field to it.** The omission report goes out via `onOmitted` only.

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/malstadur-glossary-guard.test.js`:

```js
describe('formatGlossary competing-term guard (C18)', () => {
  it('omits EVERY candidate of a competing headword, not just one', () => {
    const g = formatGlossary([
      ok('water', 'vatn'),
      ok('atom', 'frumeind'),
      ok('atom', 'atóm'),
    ]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('omits a comma-separated value — it is a list, not a term', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok('anion', 'anjón, mínusjón, neijón')]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('leaves non-competing, non-list terms untouched', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok('ether', 'eter')]);
    expect(g.terms).toHaveLength(2);
  });

  it('folds case when deciding a competition (Atom and atom are one headword)', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok('Atom', 'frumeind'), ok('atom', 'atóm')]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('detects over the POST-FILTER set: approvedOnly:true hides a proposed rival', () => {
    const g = formatGlossary([
      ok('water', 'vatn'),
      { english: 'atom', icelandic: 'frumeind', status: 'approved' },
      { english: 'atom', icelandic: 'atóm', status: 'proposed' },
    ]);
    expect(g.terms).toContainEqual({ sourceWord: 'atom', targetWord: 'frumeind' });
  });

  it('…and approvedOnly:false exposes it', () => {
    const g = formatGlossary(
      [
        { english: 'atom', icelandic: 'frumeind', status: 'approved' },
        { english: 'atom', icelandic: 'atóm', status: 'proposed' },
      ],
      { approvedOnly: false }
    );
    expect(g.terms).toEqual([]);
  });

  it('reports what it omitted via onOmitted', () => {
    let report = null;
    formatGlossary([ok('atom', 'frumeind'), ok('atom', 'atóm')], {
      onOmitted: (r) => {
        report = r;
      },
    });
    expect(report.omitted).toHaveLength(2);
    expect(report.competitions[0].english).toBe('atom');
  });

  it('does not fire onOmitted when nothing was omitted', () => {
    let called = false;
    formatGlossary([ok('water', 'vatn')], { onOmitted: () => (called = true) });
    expect(called).toBe(false);
  });

  // Same invariant onSkipped carries: a swallowed reporting callback would
  // reintroduce a fail-quiet path in the very change that removes one.
  it('lets a throwing onOmitted propagate', () => {
    expect(() =>
      formatGlossary([ok('atom', 'frumeind'), ok('atom', 'atóm')], {
        onOmitted: () => {
          throw new Error('boom');
        },
      })
    ).toThrow('boom');
  });

  // The returned object IS the outbound request body. Adding a field here
  // ships data to a third party.
  it('does not add any field to the wire shape', () => {
    const g = formatGlossary([ok('atom', 'frumeind'), ok('atom', 'atóm')], { onOmitted: () => {} });
    expect(Object.keys(g).sort()).toEqual(['domain', 'sourceLanguage', 'targetLanguage', 'terms']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/malstadur-glossary-guard.test.js -t 'C18'`
Expected: FAIL — first test gets 3 terms, expected 1.

- [ ] **Step 3: Write the implementation**

In `tools/lib/malstadur-api.js`, add near the other imports at the top of the file:

```js
import { findGlossaryCollisions } from './glossary-collisions.js';
```

Replace `formatGlossary` (lines 200-225) with:

```js
function formatGlossary(
  terms,
  { domain = 'chemistry', approvedOnly = true, onSkipped, onOmitted } = {}
) {
  const filtered = approvedOnly ? terms.filter((t) => t.status === 'approved') : terms;

  // C18: an unresolved competition must not prime MT at all. Sending both
  // atom→frumeind AND atom→atóm in one request is a contradiction the API
  // resolves however it likes. Omitting BOTH candidates is deliberate —
  // picking one here would be an unreviewed editorial decision.
  //
  // Detected over the POST-FILTER set, because callers disagree on
  // approvedOnly (api-translate.js passes true, translate-chapter-titles.js
  // passes false), so "what competes" depends on what is actually being sent.
  const { competitions, commaLists } = findGlossaryCollisions(filtered, { approvedOnly: false });
  const competingKeys = new Set(competitions.map((c) => c.english));
  const listValues = new Set(commaLists.map((c) => c.value));

  const usable = [];
  const skipped = [];
  const omitted = [];
  for (const t of filtered) {
    const sourceWord = typeof t.english === 'string' ? t.english.trim() : '';
    const targetWord = typeof t.icelandic === 'string' ? t.icelandic.trim() : '';
    if (!sourceWord || !targetWord) {
      skipped.push(t);
      continue;
    }
    if (competingKeys.has(sourceWord.toLowerCase()) || listValues.has(targetWord)) {
      omitted.push({ sourceWord, targetWord });
      continue;
    }
    usable.push({ sourceWord, targetWord });
  }

  if (skipped.length > 0 && typeof onSkipped === 'function') {
    onSkipped(skipped);
  }
  if (omitted.length > 0 && typeof onOmitted === 'function') {
    onOmitted({ omitted, competitions, commaLists });
  }

  // ⚠️ This object IS the outbound request body (see :242, body.glossaries).
  // Never add a field here — reporting goes through the callbacks above.
  return {
    domain,
    sourceLanguage: 'en',
    targetLanguage: 'is',
    terms: usable,
  };
}
```

Update the JSDoc above it to document `onOmitted`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tools/__tests__/malstadur-glossary-guard.test.js`
Expected: PASS — all pre-existing blank-side tests plus the 10 new ones.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
npm run lint && npm run format:check
git add tools/lib/malstadur-api.js tools/__tests__/malstadur-glossary-guard.test.js
git commit -m "feat(c18): stop priming MT with contradictory glossary terms

formatGlossary sent Malstadur both atom->frumeind and atom->atom in one
request — contradictory instructions for one source word, resolved by
whatever the API does with duplicates. Every chemistry api-translate run
shipped 13 of these. Measured: 27 of 617 rows omitted (4.4%).

Both candidates are omitted, not one: picking here would be an
unreviewed editorial decision. Comma-separated values are omitted too —
a glossary instruction of \"anjon, minusjon, neijon\" is not a term.

Detected over the POST-FILTER set because callers disagree on
approvedOnly. The report rides a callback, never the return value: that
object IS the outbound HTTP body (:242), so a field added there ships to
a third party. A test pins the wire shape.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire the report at every production caller

**Files:**
- Modify: `tools/api-translate.js:632` (`loadGlossary` signature), `:655-661`, `:678-685` (`glossaryStatusLine`), `:1108-1118` (`main`)
- Modify: `tools/translate-chapter-titles.js:118`, `:127`
- Test: `tools/__tests__/api-translate-glossary-skip.test.js` (append)

**Interfaces:**
- Consumes: `formatGlossary`'s `onOmitted` (Task 4).
- Produces:
  - `loadGlossary(glossaryDir, domain, {onSkipped, onOmitted})`
  - `glossaryStatusLine(glossary, skippedCount, omittedCount = 0) → string`

**Why this task exists:** a callback nobody passes is a fail-quiet path dressed as a guard. Without it `api-translate.js` silently drops 27 chemistry rows and prints nothing.

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/api-translate-glossary-skip.test.js`.

**⚠️ Do NOT add an import line.** That file already imports what this needs at `:17`:
`import { loadGlossary, filterGlossaryForText, glossaryStatusLine } from '../api-translate.js';`
Adding a second import of the same module is redundant and trips lint. (Importing
`api-translate.js` is safe: its `main()` is guarded at `:1370` by
`process.argv[1] === fileURLToPath(import.meta.url)`, which is vitest's path under test.)

```js
describe('glossaryStatusLine — omitted count (C18)', () => {
  const g = { domain: 'chemistry', terms: [{ sourceWord: 'water', targetWord: 'vatn' }] };

  it('reports omitted terms alongside skipped ones', () => {
    expect(glossaryStatusLine(g, 0, 27)).toContain('27');
  });

  it('says nothing extra when nothing was omitted', () => {
    expect(glossaryStatusLine(g, 0, 0)).toBe('Glossary: 1 approved chemistry terms');
  });

  it('reports both counts when both happened', () => {
    const line = glossaryStatusLine(g, 3, 27);
    expect(line).toContain('3');
    expect(line).toContain('27');
  });

  // Same reasoning as the malformed-total case already documented in this
  // file: when everything is omitted, glossary is null and the line must not
  // read identically to "there is no glossary file".
  it('still reports the omitted count when the glossary loaded as null', () => {
    expect(glossaryStatusLine(null, 0, 27)).toContain('27');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/api-translate-glossary-skip.test.js -t 'omitted count'`
Expected: FAIL — the line contains no `27`.

- [ ] **Step 3: Write the implementation**

In `tools/api-translate.js`, change `loadGlossary` (line 632) to:

```js
export function loadGlossary(glossaryDir, domain, { onSkipped, onOmitted } = {}) {
```

Extend its JSDoc `@param` line to:

```js
 * @param {{onSkipped?: (dropped: Array<object>) => void,
 *          onOmitted?: (report: {omitted: Array<object>, competitions: Array<object>, commaLists: Array<object>}) => void}} [options]
```

Inside it, add a second local beside `dropped`:

```js
  let dropped = null;
  let omittedReport = null;
```

and extend the `formatGlossary` call (line ~645):

```js
    glossary = formatGlossary(data.terms || [], {
      domain,
      approvedOnly: true,
      onSkipped: (d) => {
        dropped = d;
      },
      // Same non-throwing inner-callback discipline as onSkipped above: a
      // throwing caller callback handed straight to formatGlossary would be
      // swallowed by this try/catch and returned as null, indistinguishable
      // from corrupt JSON.
      onOmitted: (r) => {
        omittedReport = r;
      },
    });
```

and extend the reporting point (line ~660), keeping it **before** the empty-check:

```js
  // BEFORE the empty-check, deliberately. When every approved term is
  // malformed or omitted, terms.length is 0 and this function returns null —
  // and the caller then prints "none available", the same message as having
  // no glossary file at all. Reporting first is what keeps the worst case
  // (a wholly corrupt or wholly contested glossary) from reading as the
  // benign one.
  if (dropped && typeof onSkipped === 'function') onSkipped(dropped);
  if (omittedReport && typeof onOmitted === 'function') onOmitted(omittedReport);
```

Replace `glossaryStatusLine` (lines 678-685) with:

```js
export function glossaryStatusLine(glossary, skippedCount, omittedCount = 0) {
  const notes = [];
  if (skippedCount > 0) notes.push(`${skippedCount} malformed skipped`);
  // C18: an omitted term is a term whose Icelandic side is contested. Naming
  // it here rather than in a separate line keeps the MT stage's one status
  // line the single place a glossary defect surfaces.
  if (omittedCount > 0) notes.push(`${omittedCount} omitted — contested or comma-list`);
  const note = notes.length > 0 ? ` (${notes.join(', ')})` : '';
  return glossary
    ? `Glossary: ${glossary.terms.length} approved ${glossary.domain} terms${note}`
    : `Glossary: none available${note} (continuing without)`;
}
```

Update `main()` (lines 1108-1118):

```js
  let glossary = null;
  if (!args.noGlossary) {
    const domain = bookToDomain(args.book);
    let skippedCount = 0;
    let omittedCount = 0;
    glossary = loadGlossary(path.join(BOOKS_DIR, 'glossary'), domain, {
      onSkipped: (dropped) => {
        skippedCount = dropped.length;
      },
      onOmitted: (report) => {
        omittedCount = report.omitted.length;
      },
    });
    console.log(glossaryStatusLine(glossary, skippedCount, omittedCount));
  }
```

In `tools/translate-chapter-titles.js`, replace lines 118-123 with:

```js
    let omittedCount = 0;
    glossaries = [
      formatGlossary(allTerms, {
        domain: 'chemistry',
        approvedOnly: false,
        onOmitted: (report) => {
          omittedCount = report.omitted.length;
        },
      }),
    ];
    // Print what is actually sent, not allTerms.length: formatGlossary's
    // blank-side guard (register C14) drops entries with a blank/non-string
    // English or Icelandic side, and its competing-term guard (register C18)
    // drops contested headwords and comma-list values — so the counts diverge
    // three ways.
    const omitNote = omittedCount > 0 ? `, ${omittedCount} contested/list omitted` : '';
    console.log(`\nGlossary: ${glossaries[0].terms.length} terms${omitNote} (${glossaryPath})`);
```

and line 127 (the no-book-glossary branch) with:

```js
  glossaries = [formatGlossary(inlineTerms, { domain: 'chemistry', approvedOnly: false })];
  console.log(`\nGlossary: ${glossaries[0].terms.length} inline terms (no book glossary found)`);
```

*(The inline branch previously printed `inlineTerms.length` — the input, not the output. Same defect `:119`'s own comment warns about, one branch over.)*

- [ ] **Step 4: Run tests, then verify against the real book**

Run: `npm test`
Expected: PASS.

```bash
node tools/api-translate.js --book efnafraedi-2e --dry-run 2>&1 | grep -i glossary
```
Expected: `Glossary: 590 approved chemistry terms (27 omitted — contested or comma-list)`
*(617 usable − 27 omitted = 590. If the number differs, re-derive it before assuming the code is wrong — the glossary may have changed.)*

- [ ] **Step 5: Lint, format, commit**

```bash
npm run lint && npm run format:check
git add tools/api-translate.js tools/translate-chapter-titles.js tools/__tests__/api-translate-glossary-skip.test.js
git commit -m "feat(c18): surface omitted glossary terms at the MT stage

A callback nobody passes is a fail-quiet path dressed as a guard —
without this, api-translate silently drops 27 chemistry rows and prints
nothing. onOmitted is now wired at every production call site.

Reporting stays BEFORE the empty-check for the reason this file already
documents for onSkipped: when every term is omitted, terms.length is 0
and the loader returns null, so the status line would otherwise read
identically to having no glossary file at all — the worst case rendered
indistinguishable from the benign one.

Also fixes the no-book-glossary branch of translate-chapter-titles,
which printed its INPUT count — the same defect the comment one branch
over warns about.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The validator and its baselines

**Files:**
- Create: `tools/validate-glossary.js`
- Create: `books/efnafraedi-2e/glossary/glossary-collisions-baseline.json`
- Create: `books/lifraen-efnafraedi/glossary/glossary-collisions-baseline.json`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `findGlossaryCollisions` (Task 1), `parseArgs`/`BOOK_OPTION`/`requireBook` from `tools/lib/parseArgs.js`.
- Produces: `npm run validate:glossary -- --book <slug> [--update-baseline]`, exit 1 on findings beyond baseline.

**Pattern to follow:** `tools/cnxml-render-fidelity-check.js` — `baselinePath()` (`:378`), `loadBaseline()` (`:382`), the `--update-baseline` boolean option (`:393`), the `_note` field, and `process.exit(findings > 0 ? 1 : 0)`.

- [ ] **Step 1: Write the tool**

Create `tools/validate-glossary.js`:

```js
#!/usr/bin/env node
/**
 * Gate on unresolved glossary term competitions (register C18).
 *
 * A competition is one English headword with two or more approved Icelandic
 * translations. Row order currently decides which one wins, silently. This
 * tool fails on any competition NOT recorded in the book's baseline file.
 *
 * The baseline is a WORKLIST, not an approval: every entry is an unresolved
 * editorial decision (register C14 (2)). Shrink it by resolving terms; do not
 * grow it to silence the gate.
 *
 * Usage:
 *   node tools/validate-glossary.js --book efnafraedi-2e
 *   node tools/validate-glossary.js --book efnafraedi-2e --update-baseline
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, requireBook } from './lib/parseArgs.js';
import { findGlossaryCollisions } from './lib/glossary-collisions.js';

// Resolve books/ against this file, never process.cwd() — the server runs
// with cwd=server/ and a cwd-relative books/ path silently points elsewhere.
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function glossaryPath(bookDir) {
  return path.join(bookDir, 'glossary', 'glossary-unified.json');
}

export function baselinePath(bookDir) {
  return path.join(bookDir, 'glossary', 'glossary-collisions-baseline.json');
}

export function loadBaseline(bookDir) {
  const p = baselinePath(bookDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Compare findings against a baseline.
 * @returns {{newCompetitions: Array<object>, changedChoices: Array<object>,
 *            newCommaLists: Array<object>, resolved: string[]}}
 */
export function diffAgainstBaseline(collisions, baseline) {
  const baseComps = (baseline && baseline.competitions) || {};
  const baseLists = (baseline && baseline.commaLists) || {};

  const newCompetitions = [];
  const changedChoices = [];
  for (const c of collisions.competitions) {
    const b = baseComps[c.english];
    if (!b) {
      newCompetitions.push(c);
      continue;
    }
    // A changed `chosen` for an unchanged candidate set is the drift this
    // fence exists to catch: row order shifted and readers silently got a
    // different word.
    if (b.chosen !== c.chosen || b.candidates.join(' ') !== c.candidates.join(' ')) {
      changedChoices.push({ english: c.english, was: b, now: c });
    }
  }

  const newCommaLists = collisions.commaLists.filter((c) => baseLists[c.english] !== c.value);
  const seen = new Set(collisions.competitions.map((c) => c.english));
  const resolved = Object.keys(baseComps).filter((k) => !seen.has(k));

  return { newCompetitions, changedChoices, newCommaLists, resolved };
}

function buildBaseline(collisions) {
  const competitions = {};
  for (const c of collisions.competitions) {
    competitions[c.english] = { candidates: c.candidates, chosen: c.chosen };
  }
  const commaLists = {};
  for (const c of collisions.commaLists) commaLists[c.english] = c.value;
  return {
    _note:
      'Accepted term competitions (register C18). This file is a WORKLIST, not an approval. ' +
      'Every entry is an unresolved editorial decision (register C14 (2)) that row order is ' +
      'currently making on readers’ behalf. Shrink it by resolving terms in the terminology ' +
      'DB; do not grow it to silence the gate.',
    competitions,
    commaLists,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    { name: 'updateBaseline', flags: ['--update-baseline'], type: 'boolean', default: false },
  ]);
  if (args.help) {
    console.log('validate-glossary.js — gate on unresolved term competitions. See file header.');
    process.exit(0);
  }
  requireBook(args);

  const bookDir = path.join(REPO_ROOT, 'books', args.book);
  const gp = glossaryPath(bookDir);
  if (!fs.existsSync(gp)) {
    console.log(`${args.book}: no glossary-unified.json — nothing to check`);
    process.exit(0);
  }

  const glossary = JSON.parse(fs.readFileSync(gp, 'utf8'));
  const collisions = findGlossaryCollisions(glossary.terms || [], { approvedOnly: true });

  if (args.updateBaseline) {
    const out = buildBaseline(collisions);
    fs.writeFileSync(baselinePath(bookDir), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(
      `Wrote ${baselinePath(bookDir)} — ${collisions.competitions.length} competition(s), ` +
        `${collisions.commaLists.length} comma-list(s)`
    );
    process.exit(0);
  }

  const baseline = loadBaseline(bookDir);
  const d = diffAgainstBaseline(collisions, baseline);

  for (const c of d.newCompetitions) {
    console.error(`NEW competition: ${c.english} → ${c.candidates.join(' | ')} (using: ${c.chosen})`);
  }
  for (const c of d.changedChoices) {
    console.error(
      `CHANGED choice: ${c.english} was "${c.was.chosen}", now "${c.now.chosen}" — row order shifted`
    );
  }
  for (const c of d.newCommaLists) {
    console.error(`NEW comma-list: ${c.english} → "${c.value}"`);
  }
  for (const k of d.resolved) {
    console.log(`resolved since baseline (remove from baseline): ${k}`);
  }

  const findings = d.newCompetitions.length + d.changedChoices.length + d.newCommaLists.length;
  console.log(
    `\n${args.book}: ${collisions.competitions.length} competition(s), ` +
      `${collisions.commaLists.length} comma-list(s), ${findings} beyond baseline` +
      (baseline ? '' : ' (NO BASELINE FILE — every finding is new)')
  );
  process.exit(findings > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add after the `validate` line:

```json
    "validate:glossary": "node tools/validate-glossary.js",
```

- [ ] **Step 3: Verify it fails loudly with no baseline**

```bash
node tools/validate-glossary.js --book efnafraedi-2e; echo "exit=$?"
```
Expected: 13 `NEW competition:` lines, `(NO BASELINE FILE — every finding is new)`, `exit=1`.

- [ ] **Step 4: Generate both baselines and verify green**

```bash
node tools/validate-glossary.js --book efnafraedi-2e --update-baseline
node tools/validate-glossary.js --book lifraen-efnafraedi --update-baseline
node tools/validate-glossary.js --book efnafraedi-2e; echo "exit=$?"
node tools/validate-glossary.js --book lifraen-efnafraedi; echo "exit=$?"
```
Expected: both `13 competition(s), 0 comma-list(s), 0 beyond baseline`, `exit=0`.

Then **read the generated file** and confirm it lists `atom`, `group`, `resonance` with their candidates and `chosen`.

- [ ] **Step 5: Confirm biology gets NO baseline**

```bash
node tools/validate-glossary.js --book liffraedi-2e; echo "exit=$?"
```
Expected: `0 competition(s), 0 comma-list(s), 0 beyond baseline`, `exit=0`, and **no baseline file created**. Biology has no approved terms today; when its terminology lands, its competitions must announce themselves rather than be absorbed.

- [ ] **Step 6: Lint, format, commit**

⚠️ Commit the baseline JSON files in the **same commit** as the tool. `lint-staged` stashes unstaged tracked changes on commit, so a data file written in one step and committed in another can be silently dropped.

```bash
npm run lint && npm run format:check
git add tools/validate-glossary.js package.json books/efnafraedi-2e/glossary/glossary-collisions-baseline.json books/lifraen-efnafraedi/glossary/glossary-collisions-baseline.json
git commit -m "feat(c18): validate-glossary gate with per-book baselines

Follows cnxml-render-fidelity-check's baseline idiom (baselinePath,
loadBaseline, --update-baseline, a load-bearing _note, exit 1 on
findings).

The baseline records the CHOSEN TERM per key, not a count. A count would
be a number living in prose — the thing CLAUDE.md's one-source-of-truth
rule forbids — and it would hide WHICH term changed when one flipped. A
changed `chosen` for an unchanged candidate set fails the gate: that
means row order shifted and readers silently got a different word.

Two books get baselines with the same 13 entries (lifraen-efnafraedi's
glossary is a byte-identical copy of chemistry's). liffraedi-2e
deliberately gets NONE — it has no approved terms yet, and \"findings
without a baseline fails\" is what makes biology's competitions announce
themselves when its terminology lands.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The regression fence

**Files:**
- Create: `tools/__tests__/glossaryCollisionBaseline.test.js`

**Interfaces:**
- Consumes: `findGlossaryCollisions` (Task 1), `diffAgainstBaseline`/`loadBaseline`/`glossaryPath` (Task 6).
- Produces: nothing.

**Why a test and not just the CLI:** `npm run validate` is `scripts/validate-status.js` (a chapter-`status.json` schema validator) — the glossary does not belong there. And per CLAUDE.md the `validate` workflow is **path-filtered** on `pull_request`, so it silently does not report on most PRs. `npm test` is the authoritative gate and is not path-filtered, so the fence lives there.

- [ ] **Step 1: Write the test**

Create `tools/__tests__/glossaryCollisionBaseline.test.js`:

```js
// tools/__tests__/glossaryCollisionBaseline.test.js
/**
 * C18 regression fence over the COMMITTED glossaries.
 *
 * Its job is not to decide terms — it is to stop a new competition arriving
 * unnoticed, which is exactly how biology's 3,817 would land during
 * onboarding. A book with findings and NO baseline file must FAIL: absence of
 * a baseline is not approval (the C11(b) lesson — staleness is the alarm).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findGlossaryCollisions } from '../lib/glossary-collisions.js';
import { diffAgainstBaseline, loadBaseline, glossaryPath } from '../validate-glossary.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOKS_DIR = path.join(REPO_ROOT, 'books');

const booksWithGlossaries = fs
  .readdirSync(BOOKS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((slug) => fs.existsSync(glossaryPath(path.join(BOOKS_DIR, slug))));

describe('committed glossaries have no competitions beyond their baseline', () => {
  it('finds at least one book with a glossary (the sweep is not vacuous)', () => {
    expect(booksWithGlossaries.length).toBeGreaterThan(0);
  });

  it.each(booksWithGlossaries)('%s', (slug) => {
    const bookDir = path.join(BOOKS_DIR, slug);
    const glossary = JSON.parse(fs.readFileSync(glossaryPath(bookDir), 'utf8'));
    const collisions = findGlossaryCollisions(glossary.terms || [], { approvedOnly: true });
    const d = diffAgainstBaseline(collisions, loadBaseline(bookDir));

    expect(
      {
        newCompetitions: d.newCompetitions.map((c) => c.english),
        changedChoices: d.changedChoices.map((c) => c.english),
        newCommaLists: d.newCommaLists.map((c) => c.english),
      },
      `Run: npm run validate:glossary -- --book ${slug}`
    ).toEqual({ newCompetitions: [], changedChoices: [], newCommaLists: [] });
  });
});

describe('diffAgainstBaseline semantics', () => {
  const collisions = {
    competitions: [{ english: 'atom', candidates: ['frumeind', 'atóm'], chosen: 'atóm' }],
    commaLists: [],
  };

  it('a finding with NO baseline is new — absence of a baseline is not approval', () => {
    expect(diffAgainstBaseline(collisions, null).newCompetitions).toHaveLength(1);
  });

  it('a finding recorded in the baseline is accepted', () => {
    const baseline = {
      competitions: { atom: { candidates: ['frumeind', 'atóm'], chosen: 'atóm' } },
      commaLists: {},
    };
    expect(diffAgainstBaseline(collisions, baseline).newCompetitions).toEqual([]);
  });

  it('a CHANGED choice fails even though the candidates are unchanged', () => {
    const baseline = {
      competitions: { atom: { candidates: ['frumeind', 'atóm'], chosen: 'frumeind' } },
      commaLists: {},
    };
    expect(diffAgainstBaseline(collisions, baseline).changedChoices).toHaveLength(1);
  });

  it('a NEW candidate joining an existing competition fails', () => {
    const baseline = {
      competitions: { atom: { candidates: ['frumeind'], chosen: 'atóm' } },
      commaLists: {},
    };
    expect(diffAgainstBaseline(collisions, baseline).changedChoices).toHaveLength(1);
  });

  it('reports a baseline entry that no longer competes, so the file can shrink', () => {
    const baseline = {
      competitions: {
        atom: { candidates: ['frumeind', 'atóm'], chosen: 'atóm' },
        group: { candidates: ['flokkur', 'hópur'], chosen: 'hópur' },
      },
      commaLists: {},
    };
    expect(diffAgainstBaseline(collisions, baseline).resolved).toEqual(['group']);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tools/__tests__/glossaryCollisionBaseline.test.js`
Expected: PASS — chemistry and organic clean against their baselines, biology clean with no baseline (0 findings), plus 6 semantics tests.

- [ ] **Step 3: Prove the fence actually bites (mutation check)**

A fence that never fails is indistinguishable from no fence. Verify it fails on a real regression:

```bash
node -e "
const fs=require('fs');
const p='books/efnafraedi-2e/glossary/glossary-collisions-baseline.json';
const b=JSON.parse(fs.readFileSync(p));
delete b.competitions['group'];
fs.writeFileSync(p+'.bak', fs.readFileSync(p));
fs.writeFileSync(p, JSON.stringify(b,null,2)+'\n');
"
npx vitest run tools/__tests__/glossaryCollisionBaseline.test.js
```
Expected: **FAIL**, naming `group` under `newCompetitions`.

Restore:
```bash
mv books/efnafraedi-2e/glossary/glossary-collisions-baseline.json.bak books/efnafraedi-2e/glossary/glossary-collisions-baseline.json
npx vitest run tools/__tests__/glossaryCollisionBaseline.test.js
```
Expected: PASS.

- [ ] **Step 4: Full suite**

Run: `npm test`
Expected: PASS. Record the file/test counts from the output — the PR description cites them, and no document in this repo may restate them.

- [ ] **Step 5: Lint, format, commit**

```bash
npm run lint && npm run format:check
git add tools/__tests__/glossaryCollisionBaseline.test.js
git commit -m "test(c18): regression fence over the committed glossaries

Rides npm test rather than npm run validate: that script is
validate-status.js (a chapter status.json schema validator), and per
CLAUDE.md the validate workflow is path-filtered on pull_request, so it
silently does not report on most PRs. npm test is the authoritative gate
and is not path-filtered.

A book with findings and NO baseline FAILS — absence of a baseline is
not approval. That is what makes biology's competitions announce
themselves when its terminology lands instead of being absorbed.

Includes a vacuity guard (the sweep must find at least one book) and
covers the changed-choice case, which is the drift that matters: same
candidates, different winner, means row order shifted and readers
silently got a different word.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Final verification before the PR

- [ ] `npm test` from the repo root — green. **This is the authoritative gate.**
- [ ] `npm run lint` **and** `npm run format:check` — both green (CI runs both; `npm run lint` alone is not the Lint job).
- [ ] **Byte-neutrality proof.** Re-render one chemistry chapter and confirm zero diff:
  ```bash
  git stash list  # ensure clean tree first
  node tools/cnxml-render.js efnafraedi-2e 1
  git status --short books/efnafraedi-2e/05-publication/
  ```
  Expected: **no modified files**. If anything changed, the render path is not byte-neutral and Task 2 is wrong.
- [ ] Whole-branch adversarial review (the item-17/-21 pattern) before opening the PR.
- [ ] Update register §C18 with the outcome. **Edit §C18 in the register — do not edit the frozen spec**, per CLAUDE.md § *One source of truth*.

## What this PR does NOT do

State these in the PR description so nobody infers otherwise:

- **Changes no published page.** Substitution runs at inject time; reaching readers needs a re-inject, a re-render **and** a manual vefur sync.
- **Does not make it safe to re-enable the glossary export.** Prod carries an uncommitted `#CONTAINED-2026-08-03#` edit disabling the export leg of `scripts/git-backup.sh`; lifting it re-runs the unattended write within 2h. That needs the producer/provenance guard (register §C14 ② step 4), which is out of scope here.
- **Resolves no term.** The baselines are worklists for §C14 ②'s per-book flips — chemistry is 124 decisions.
- **Does not demote surplus DB rows** (§C14 ② step 2 — a data op).
