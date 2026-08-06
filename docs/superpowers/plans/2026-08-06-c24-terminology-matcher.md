# C24 Terminology Matcher Swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one primitive inside `findTermsInSegments` — "first occurrence of English headword T in segment S" — with an Aho-Corasick scan, ending a ~100-second synchronous event-loop block that makes the production editor unusable.

**Architecture:** One Aho-Corasick automaton, built from the English headwords and cached behind a fingerprint computed from rows we already read on every call, replaces ~20,073 per-call `RegExp` compiles and 5.66 M regex executions. The Icelandic side stays a regex but becomes lazily built. The outer `for (const term of terms)` loop, the `consumed` span tiler, `translationTier`, the partition and the translation ranking are preserved **byte-for-byte**; only the `exec` inside the loop becomes a map lookup.

**Tech Stack:** Node 22 (`.nvmrc`) · CommonJS (`server/package.json` is `"type": "commonjs"`) · better-sqlite3 13 · Vitest (unit) + Playwright (E2E) · new runtime dep `@monyone/aho-corasick` in `server/` only.

**Spec:** [`docs/superpowers/specs/2026-08-06-c24-terminology-matcher-design.md`](../specs/2026-08-06-c24-terminology-matcher-design.md) — read §4.1, §4.4, §4.6, §4.7, §4.8 before starting.

## Global Constraints

- **Node 22.x.** `.nvmrc` is the single source of truth. Do not change it, any workflow pin, or either `engines` floor — `tools/__tests__/ci-node-version.test.js` fails if they drift.
- **Run `npm test` from the repo root.** The server runs with cwd=`server/`; resolving anything against `process.cwd()` is a durable-rule violation.
- **Never resolve resource paths against `process.cwd()`.** Use `import.meta.url` / `__dirname`, and `resolveDbPath()` for the DB.
- **`server/` is AGPL-3.0 and is the production internet-facing tree.** It is audited separately (`.github/workflows/security.yml:36,39` runs `npm audit --audit-level=high` in both trees).
- **`server/package.json:37` pins `xlsx` to `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.** After any `npm install` inside `server/`, `git diff server/package-lock.json` and confirm the ONLY change is the new package. That URL dependency entry must survive byte-identical.
- **The swap must be behaviour-preserving.** `translationTier`, the in-scope/fallback partition, the `consumed` tiler, the translation ranking sort, match-object construction and issue construction are **not** to be modified. If a change seems to require touching them, stop and re-read §2 of the spec.
- **No silent fallbacks.** An automaton build failure must throw. A `try/catch` that reverts to the regex path would restore the 100 s block with a green suite.
- **Never `toMatchSnapshot`** for the golden — `-u` regenerates it silently. Use `toEqual` against checked-in JSON.
- **No production data in fixtures.** The repo is public and `sessions.db` holds editor identities. Fixtures derive from committed `books/*/glossary/glossary-unified.json` only.
- **Do not add Icelandic inflections** (BÍN or otherwise) anywhere in this work. `buildInflectionRegex` is the hot path; raising stored forms moves the correctness oracle while we rewrite the implementation beneath it.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/lib/caseFold.js` | **Create.** Length-stable, per-character Unicode case folding with a derived override table. Exports `foldString`, `foldChar`, `FOLD_OVERRIDES`. |
| `server/lib/caseFold.data.js` | **Create.** The generated override table (data only, no logic). |
| `server/scripts/derive-case-fold.js` | **Create.** One-shot derivation that emits `caseFold.data.js`. Committed so the table's provenance is reproducible. |
| `server/lib/wordBoundary.js` | **Create.** `isWholeWordAt(text, begin, end)` — code-point-aware `[\p{L}\p{N}_]` boundary test. |
| `server/lib/termAutomaton.js` | **Create.** `buildTermAutomaton(entries)` and `findFirstOccurrences(automaton, text)`. Owns THE INVARIANT (§4.1). |
| `server/services/terminologyService.js` | **Modify.** SQL ordering (`:1349`), subject sort, lazy `isRegex` (`:1376`), automaton cache + the `exec` → lookup swap (`:1420-1433`). |
| `server/routes/terminology.js` | **Modify.** Delete `POST /check-consistency` (`:1101-1140`). |
| `server/routes/segment-editor.js` | **Modify.** Correct the false "Live QA (non-blocking)" comment (`:438`). |
| `server/__tests__/fixtures/c24-terms.json` | **Create.** Committed fixture term set. |
| `server/__tests__/fixtures/c24-golden.json` | **Create.** Committed golden output, captured from the UNMODIFIED function. |
| `server/scripts/build-c24-fixture.js` | **Create.** Fixture generator. Committed; its header documents which properties are load-bearing. |
| `server/__tests__/caseFold.test.js` | **Create.** Exhaustive fold sweep. |
| `server/__tests__/termAutomaton.test.js` | **Create.** Automaton + reduction + degenerate inputs. |
| `server/__tests__/findTermsGolden.test.js` | **Create.** Golden equality, differential, compile counts. |
| `server/e2e/terminology.spec.js` | **Modify.** Remove 2 deleted-route tests. |
| `server/e2e/terminology-multibook.spec.js` | **Modify.** Add the 2 ported behavioural tests. |
| `docs/_generated/routes.md` | **Regenerate** via `npm run docs:generate`. |

---

## THE INVARIANT — read before any task

Every task exists to protect this. Copy it into any review you request.

> **`firstWholeWordOccurrence(headword, segment)`** = the **earliest** position at which the
> headword occurs **with whole-word boundaries**.
> **Filter to whole-word FIRST, then take the earliest. Never "all occurrences."**

Three plausible implementations exist. All look correct; only one is:

| implementation | result on `"mass spectrometry uses bitmasses and mass units"` for headword `mass` |
|---|---|
| **filter-then-earliest** ✅ | **0** |
| earliest-then-filter ❌ | picks the interior hit inside `bitmasses`, rejects it, reports **no match** |
| last-wins ❌ | **34** |

Today's code takes **one** `exec` per term and, if it overlaps a claimed span, drops the term entirely (`:1429-1430`) — it never looks for a later occurrence. Aho-Corasick returns all occurrences, so "try the next one, it doesn't overlap" is an *improvement that breaks byte-identity*.

---

## Task 1: Fixture generator and committed term set

The committed glossary corpus **cannot** seed a meaningful golden on its own: it has no `subjects` and no `inflections` fields (0 of 4,496 terms), and `liffraedi-2e` is 100% `needs_review`, which `WHERE status IN ('approved','proposed')` reduces to zero rows. The generator must synthesize those, deliberately.

**Files:**
- Create: `server/scripts/build-c24-fixture.js`
- Create: `server/__tests__/fixtures/c24-terms.json` (generated output, committed)
- Create: `server/__tests__/fixtures/c24-segments.json` (generated output, committed)
- Test: `server/__tests__/findTermsGolden.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `c24-terms.json` — `{ headwords: Array<{english, pos, translations: Array<{icelandic, inflections: string[]|null, status: 'approved'|'proposed', subjects: string[]}>}> }`; `c24-segments.json` — `Array<{segmentId: string, enContent: string, isContent: string}>`.

- [ ] **Step 1: Write the failing test for the fixture's load-bearing properties**

Create `server/__tests__/findTermsGolden.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const terms = JSON.parse(
  readFileSync(new URL('./fixtures/c24-terms.json', import.meta.url), 'utf-8')
);
const segments = JSON.parse(
  readFileSync(new URL('./fixtures/c24-segments.json', import.meta.url), 'utf-8')
);

// The fixture is an ORACLE INPUT. If it loses these properties the golden keeps
// passing while covering nothing. Each assertion names the production fact it
// mirrors (spec §4.10 / §4.11).
describe('c24 fixture realism', () => {
  const allTr = terms.headwords.flatMap((h) => h.translations);

  it('is fallback-heavy for a chemistry book, as production is (709 vs ~28194)', () => {
    const chem = allTr.filter((t) => t.subjects.includes('chemistry')).length;
    expect(chem / allTr.length).toBeLessThan(0.15);
  });

  it('contains within-subject collisions, which are 95.9% of real collisions', () => {
    const collisions = terms.headwords.filter((h) => {
      const bySubject = new Map();
      for (const t of h.translations) {
        for (const s of t.subjects) bySubject.set(s, (bySubject.get(s) || 0) + 1);
      }
      return [...bySubject.values()].some((n) => n > 1);
    });
    expect(collisions.length).toBeGreaterThanOrEqual(5);
  });

  it('contains a cross-subject-only collision, which the tier partition resolves', () => {
    const cross = terms.headwords.filter((h) => {
      if (h.translations.length < 2) return false;
      const subs = new Set(h.translations.flatMap((t) => t.subjects));
      return subs.size === h.translations.length;
    });
    expect(cross.length).toBeGreaterThanOrEqual(1);
  });

  it('contains a 72-form inflection list, production’s measured maximum', () => {
    expect(Math.max(...allTr.map((t) => (t.inflections || []).length))).toBe(72);
  });

  it('contains the mól / "mól (m)" shape the audit counterexample needs', () => {
    expect(
      allTr.some((t) => (t.inflections || []).some((f) => f.includes('(') && f.includes(' ')))
    ).toBe(true);
  });

  it('contains short abbreviation headwords, which dominate real collisions', () => {
    expect(terms.headwords.filter((h) => h.english.length <= 2).length).toBeGreaterThanOrEqual(3);
  });

  it('contains proposed rows, so the approved-beats-proposed tiebreak is exercised', () => {
    // Production has ZERO proposed, so this path is otherwise never covered anywhere.
    expect(allTr.some((t) => t.status === 'proposed')).toBe(true);
    expect(allTr.some((t) => t.status === 'approved')).toBe(true);
  });

  it('has multi-segment input, which nothing in the suite exercises today', () => {
    expect(segments.length).toBeGreaterThanOrEqual(20);
  });

  it('has segments whose EN actually contains fixture headwords', () => {
    const words = new Set(terms.headwords.map((h) => h.english.toLowerCase()));
    const hit = segments.filter((s) =>
      [...words].some((w) => s.enContent.toLowerCase().includes(w))
    );
    expect(hit.length).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run server/__tests__/findTermsGolden.test.js`
Expected: FAIL — `ENOENT` on `fixtures/c24-terms.json`.

- [ ] **Step 3: Write the generator**

Create `server/scripts/build-c24-fixture.js`:

```js
/**
 * Builds the C24 golden-oracle fixture. Run: node server/scripts/build-c24-fixture.js
 *
 * WHICH PROPERTIES ARE LOAD-BEARING (do not "simplify" these away):
 *  - FALLBACK-HEAVY subject skew. Production gives a chemistry book ~709 in-scope
 *    translations against ~28,194 fallback (spec §4.10). A balanced fixture would leave
 *    the busiest branch — fallback's "surfaces but never issues" rule — untested.
 *  - WITHIN-SUBJECT collisions. 95.9% of real multi-translation headwords collide inside
 *    one subject (§4.11), where the tier partition cannot separate them, isPrimary ties,
 *    and the ranking comparator returns 0 — so SQL row order decides. This is why the
 *    ORDER BY carries `t.id ASC`.
 *  - A 72-form inflection list. Production's measured maximum; the 4.16 mean hides it.
 *  - SHORT ABBREVIATION headwords (W, pH, os). Real collisions skew to 1-3 char
 *    abbreviations and prefixes, which also generate the most automaton hits per segment
 *    and sort LAST under LENGTH(english) DESC.
 *  - PROPOSED rows. Production has zero, so approved-beats-proposed is otherwise dead.
 *
 * Source: committed books/efnafraedi-2e/glossary/glossary-unified.json ONLY.
 * NEVER production data — this repo is public.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', '__tests__', 'fixtures');
const SUBJECTS = ['biology', 'mathematics', 'physics', 'chemistry'];

const corpus = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'books', 'efnafraedi-2e', 'glossary', 'glossary-unified.json'),
    'utf-8'
  )
);
const rows = (Array.isArray(corpus) ? corpus : corpus.terms || []).filter(
  (t) => t.english && t.icelandic
);

// Deterministic PRNG — the fixture must be byte-reproducible across runs.
let seed = 24;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const headwords = [];

// 1. Bulk: 300 single-translation terms, fallback-heavy (only ~10% chemistry).
for (const r of rows.slice(0, 300)) {
  const subject = rand() < 0.1 ? 'chemistry' : SUBJECTS[Math.floor(rand() * 3)];
  headwords.push({
    english: r.english,
    pos: null,
    translations: [
      {
        icelandic: r.icelandic,
        inflections: null,
        status: 'approved',
        subjects: [subject],
      },
    ],
  });
}

// 2. Within-subject collisions (95.9% of the real shape) — abbreviation-flavoured.
const withinSubject = [
  ['W', 'biology', ['vatt', 'vött']],
  ['pH', 'biology', ['sýrustig', 'pH']],
  ['os', 'biology', ['bein', 'munnur']],
  ['ATP', 'biology', ['adenosínþrífosfat', 'þríyrki']],
  ['catalyst', 'chemistry', ['hvati', 'efnahvati']],
  ['bond', 'chemistry', ['tengi', 'efnatengi']],
];
for (const [english, subject, ices] of withinSubject) {
  headwords.push({
    english,
    pos: null,
    translations: ices.map((icelandic) => ({
      icelandic,
      inflections: null,
      status: 'approved',
      subjects: [subject],
    })),
  });
}

// 3. Cross-subject collision (the 4.1% the tier partition resolves cleanly).
headwords.push({
  english: 'cell',
  pos: null,
  translations: [
    { icelandic: 'fruma', inflections: null, status: 'approved', subjects: ['biology'] },
    { icelandic: 'rafhlaða', inflections: null, status: 'approved', subjects: ['chemistry'] },
  ],
});

// 4. The audit counterexample: a longest-alternative-fails backtrack case.
headwords.push({
  english: 'mole',
  pos: null,
  translations: [
    {
      icelandic: 'mól',
      inflections: ['mól (m)'],
      status: 'approved',
      subjects: ['chemistry'],
    },
  ],
});

// 5. The 72-form tail.
headwords.push({
  english: 'inflection tail term',
  pos: null,
  translations: [
    {
      icelandic: 'beygingarhali',
      inflections: Array.from({ length: 72 }, (_, i) => `beygingarhali${i}`),
      status: 'approved',
      subjects: ['chemistry'],
    },
  ],
});

// 6. Proposed rows — production has none, so this tiebreak is otherwise dead code.
headwords.push({
  english: 'tentative term',
  pos: null,
  translations: [
    { icelandic: 'bráðabirgðaorð', inflections: null, status: 'proposed', subjects: ['chemistry'] },
    { icelandic: 'staðfest orð', inflections: null, status: 'approved', subjects: ['chemistry'] },
  ],
});

// 7. Overlap/precedence shapes the swap must preserve exactly.
headwords.push(
  {
    english: 'melting point',
    pos: null,
    translations: [
      { icelandic: 'bræðslumark', inflections: null, status: 'approved', subjects: ['chemistry'] },
    ],
  },
  {
    english: 'melting',
    pos: null,
    translations: [
      { icelandic: 'bráðnun', inflections: null, status: 'approved', subjects: ['chemistry'] },
    ],
  },
  {
    english: 'mass',
    pos: null,
    translations: [
      { icelandic: 'massi', inflections: null, status: 'approved', subjects: ['chemistry'] },
    ],
  },
  {
    english: 'atomic mass',
    pos: null,
    translations: [
      { icelandic: 'atómmassi', inflections: null, status: 'approved', subjects: ['chemistry'] },
    ],
  }
);

// --- Segments: EN must actually contain the headwords, or the oracle compares empties. ---
const segments = [
  {
    segmentId: 'm001:para:fs-id0001',
    enContent: 'The atomic mass unit is defined so that mass can be compared.',
    isContent: 'Atómmassaeiningin er skilgreind þannig að massa megi bera saman.',
  },
  {
    segmentId: 'm001:para:fs-id0002',
    enContent: 'Melting occurs at the melting point of the substance.',
    isContent: 'Bráðnun verður við bræðslumark efnisins.',
  },
  {
    segmentId: 'm001:para:fs-id0003',
    enContent: 'mass spectrometry uses bitmasses and mass units',
    isContent: 'Massagreining notar bitmassa og massaeiningar.',
  },
  {
    segmentId: 'm001:para:fs-id0004',
    enContent: 'A catalyst lowers the activation energy of the reaction.',
    isContent: 'Efnahvati lækkar virkjunarorku efnahvarfsins.',
  },
  {
    segmentId: 'm001:para:fs-id0005',
    enContent: 'The cell membrane regulates transport.',
    isContent: 'Frumuhimnan stýrir flutningi.',
  },
  {
    segmentId: 'm001:para:fs-id0006',
    enContent: 'Measure the pH and record W for each sample.',
    isContent: 'Mældu sýrustig og skráðu vatt fyrir hvert sýni.',
  },
  {
    segmentId: 'm001:para:fs-id0007',
    enContent: 'One mole of gas occupies a fixed volume.',
    isContent: 'Eitt mól af gasi tekur fast rúmmál.',
  },
  {
    segmentId: 'm001:para:fs-id0008',
    enContent: 'ATP powers the reaction inside the cell.',
    isContent: 'ATP knýr efnahvarfið innan frumunnar.',
  },
  { segmentId: 'm001:para:fs-id0009', enContent: '', isContent: '' },
  {
    segmentId: 'm001:para:fs-id0010',
    enContent: 'No glossary term appears in this sentence at all.',
    isContent: 'Ekkert hugtak birtist í þessari setningu.',
  },
];
// Pad to >=20 segments using real corpus sentences so the multi-segment path is real.
for (let i = 0; i < 14; i++) {
  const r = rows[i * 7];
  segments.push({
    segmentId: `m002:para:fs-id${String(i).padStart(4, '0')}`,
    enContent: `A ${r.english} is described here, and the bond matters.`,
    isContent: `Hér er ${r.icelandic} lýst, og efnatengi skiptir máli.`,
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'c24-terms.json'),
  JSON.stringify({ headwords }, null, 1) + '\n'
);
fs.writeFileSync(
  path.join(OUT, 'c24-segments.json'),
  JSON.stringify(segments, null, 1) + '\n'
);
console.log(
  `wrote ${headwords.length} headwords, ` +
    `${headwords.reduce((n, h) => n + h.translations.length, 0)} translations, ` +
    `${segments.length} segments`
);
```

- [ ] **Step 4: Generate and verify determinism**

```bash
node server/scripts/build-c24-fixture.js
md5sum server/__tests__/fixtures/c24-terms.json
node server/scripts/build-c24-fixture.js
md5sum server/__tests__/fixtures/c24-terms.json
```
Expected: identical md5 both times. If not, the PRNG or iteration order is non-deterministic — fix before proceeding, or the golden will churn.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run server/__tests__/findTermsGolden.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/build-c24-fixture.js server/__tests__/fixtures/ server/__tests__/findTermsGolden.test.js
git commit -m "test(c24): fixture generator with production-shaped skew and collisions

The committed glossary corpus cannot seed a meaningful golden: it has no
subjects and no inflections fields (0 of 4,496), and liffraedi-2e is 100%
needs_review, which the in-scope filter reduces to zero rows. The generator
synthesizes those deliberately, reproducing prod's measured shape — fallback
heavy, within-subject collisions, a 72-form inflection tail, short
abbreviation headwords, and proposed rows that production does not have."
```

---

## Task 2: Complete the ordering fix

Three levels are unspecified today and all three land in the golden. Fixing only the headword level leaves the oracle resting on arbitrary order for ~35% of production headwords.

**Files:**
- Modify: `server/services/terminologyService.js:1349` (the `ORDER BY`), `:1366` (subject split)
- Test: `server/__tests__/terminologyService.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: deterministic row order for `findTermsInSegments`; `matches[].subjects` and `translations[].subjects` sorted ascending.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/terminologyService.test.js`, inside the top-level `describe`:

```js
describe('findTermsInSegments() — deterministic ordering (C24 oracle prerequisite)', () => {
  it('orders sibling translations of one headword by translation id', () => {
    // Both approved, both same subject => the ranking comparator returns 0 for every
    // comparison, so sorted[0] is raw SQL row order. Production is in exactly this
    // state for 7,096 of 7,402 multi-translation headwords (spec §4.11).
    const hwId = insertHeadword({ english: 'bond' });
    const t2 = insertTranslation(hwId, { icelandic: 'efnatengi', status: 'approved' });
    const t1 = insertTranslation(hwId, { icelandic: 'tengi', status: 'approved' });
    addSubject(t2, 'chemistry');
    addSubject(t1, 'chemistry');

    const res = terminologyService.findTermsInSegments(
      [{ segmentId: 's', enContent: 'The bond is strong.', isContent: 'Tengið er sterkt.' }],
      'efnafraedi-2e'
    );
    // t2 was inserted first, so it has the lower id and must win under `t.id ASC`.
    expect(t2).toBeLessThan(t1);
    expect(res.s.matches[0].translations.map((t) => t.id)).toEqual([t2, t1]);
    expect(res.s.matches[0].icelandic).toBe('efnatengi');
  });

  it('returns subject arrays in sorted order', () => {
    const { trId } = insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
      subjects: ['physics', 'biology', 'chemistry'],
    });
    expect(trId).toBeGreaterThan(0);
    const res = terminologyService.findTermsInSegments(
      [{ segmentId: 's', enContent: 'A molecule forms.', isContent: 'Sameind myndast.' }],
      'efnafraedi-2e'
    );
    expect(res.s.matches[0].subjects).toEqual(['biology', 'chemistry', 'physics']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t "deterministic ordering"`
Expected: the subject test FAILS (order is whatever `GROUP_CONCAT` produced). The translation-id test may pass by luck — that is exactly the point; it is unspecified today.

- [ ] **Step 3: Make the ordering explicit**

In `server/services/terminologyService.js`, change the `ORDER BY` at `:1349` from:

```js
      ORDER BY LENGTH(h.english) DESC
```

to:

```js
      -- C24: three levels must be deterministic or the golden oracle rests on
      -- unspecified order. h.id breaks equal-length headword ties; t.id breaks
      -- sibling translations, which share BOTH keys and whose ranking comparator
      -- returns 0 whenever isPrimary and status match (spec §5.0).
      ORDER BY LENGTH(h.english) DESC, h.id ASC, t.id ASC
```

And at `:1366`, change:

```js
    const subjects = row.subjects ? row.subjects.split(',') : [];
```

to:

```js
    // GROUP_CONCAT order is unspecified; sort in JS rather than with
    // GROUP_CONCAT(... ORDER BY ...), which needs SQLite >= 3.44 and would couple
    // the oracle to the bundled engine version.
    const subjects = row.subjects ? row.subjects.split(',').sort() : [];
```

- [ ] **Step 4: Run the full service suite**

Run: `npx vitest run server/__tests__/terminologyService.test.js`
Expected: PASS, including the pre-existing tier/homograph tests at `:845`, `:861`, `:881`, `:906`, `:965`, `:981`, `:1011`, `:1045`, `:1058`, `:1335-1378`.

- [ ] **Step 5: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "fix(terminology): make findTermsInSegments row order fully deterministic

ORDER BY LENGTH(english) DESC had no tie-break at any level. Headwords of equal
length were arbitrary, and sibling translations share BOTH sort keys so they
were completely unordered. That matters more than it looks: the ranking sort
returns 0 when isPrimary and status match, and all 28,903 production rows are
approved, so sorted[0] IS raw row order for the 7,096 headwords that collide
within one subject — ~35% of all headwords. It decides matches[].icelandic,
translations[] order and issues[].expected.

This is a deliberate, small behaviour change and it ships here so the golden
captured next is not built on unspecified order."
```

---

## Task 3: Capture the golden from the UNMODIFIED function

Order matters absolutely. The golden must be produced by the *current* implementation, after Task 2's ordering fix and before any Aho-Corasick code exists. Reversed, the oracle certifies the new code against itself.

**Files:**
- Create: `server/__tests__/fixtures/c24-golden.json`
- Create: `server/scripts/capture-c24-golden.js`
- Modify: `server/__tests__/findTermsGolden.test.js`

**Interfaces:**
- Consumes: `c24-terms.json`, `c24-segments.json` (Task 1); `terminologyService.findTermsInSegments`.
- Produces: `c24-golden.json` — the exact return value of `findTermsInSegments(segments, 'efnafraedi-2e')`.

- [ ] **Step 1: Write the capture script**

Create `server/scripts/capture-c24-golden.js`:

```js
/**
 * Captures the C24 golden oracle. Run: node server/scripts/capture-c24-golden.js
 *
 * MUST be run against the UNMODIFIED matcher (after the ordering fix, before any
 * Aho-Corasick code). Re-running it after the swap would certify the new code
 * against itself and destroy the oracle. If the golden ever needs regenerating,
 * do it from a checkout at the pre-swap commit — never from HEAD.
 */
const path = require('path');
const fs = require('fs');
const { createTestDb } = require('../__tests__/helpers/terminologyTestDb');
const terminologyService = require('../services/terminologyService');

const FIX = path.join(__dirname, '..', '__tests__', 'fixtures');
const terms = JSON.parse(fs.readFileSync(path.join(FIX, 'c24-terms.json'), 'utf-8'));
const segments = JSON.parse(fs.readFileSync(path.join(FIX, 'c24-segments.json'), 'utf-8'));

const db = createTestDb();
terminologyService._setTestDb(db);

const insHw = db.prepare('INSERT INTO terminology_headwords (english, pos) VALUES (?, ?)');
const insTr = db.prepare(
  `INSERT INTO terminology_translations
     (headword_id, icelandic, inflections, source, status, proposed_by, proposed_by_name)
   VALUES (?, ?, ?, 'fixture', ?, 'u1', 'Fixture')`
);
const insSubj = db.prepare(
  'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
);

for (const hw of terms.headwords) {
  const hwId = Number(insHw.run(hw.english, hw.pos).lastInsertRowid);
  for (const tr of hw.translations) {
    const trId = Number(
      insTr.run(hwId, tr.icelandic, tr.inflections ? JSON.stringify(tr.inflections) : null, tr.status)
        .lastInsertRowid
    );
    for (const s of tr.subjects) insSubj.run(trId, s);
  }
}

const golden = terminologyService.findTermsInSegments(segments, 'efnafraedi-2e');
fs.writeFileSync(path.join(FIX, 'c24-golden.json'), JSON.stringify(golden, null, 1) + '\n');

const nMatches = Object.values(golden).reduce((n, r) => n + r.matches.length, 0);
const nIssues = Object.values(golden).reduce((n, r) => n + r.issues.length, 0);
console.log(`golden: ${Object.keys(golden).length} segments, ${nMatches} matches, ${nIssues} issues`);

terminologyService._setTestDb(null);
db.close();
```

- [ ] **Step 2: Capture it, and sanity-check that it is not vacuous**

```bash
node server/scripts/capture-c24-golden.js
```
Expected: a line reporting **non-zero** matches AND **non-zero** issues. A golden of all-empty results would pass forever while proving nothing — if either count is 0, the fixture or the seeding is wrong. Fix before continuing.

- [ ] **Step 3: Add the golden equality test**

Append to `server/__tests__/findTermsGolden.test.js`:

```js
import { createTestDb } from './helpers/terminologyTestDb.js';

const terminologyService = require('../services/terminologyService');
const golden = JSON.parse(
  readFileSync(new URL('./fixtures/c24-golden.json', import.meta.url), 'utf-8')
);

function seedFixture(db) {
  const insHw = db.prepare('INSERT INTO terminology_headwords (english, pos) VALUES (?, ?)');
  const insTr = db.prepare(
    `INSERT INTO terminology_translations
       (headword_id, icelandic, inflections, source, status, proposed_by, proposed_by_name)
     VALUES (?, ?, ?, 'fixture', ?, 'u1', 'Fixture')`
  );
  const insSubj = db.prepare(
    'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
  );
  for (const hw of terms.headwords) {
    const hwId = Number(insHw.run(hw.english, hw.pos).lastInsertRowid);
    for (const tr of hw.translations) {
      const trId = Number(
        insTr.run(
          hwId,
          tr.icelandic,
          tr.inflections ? JSON.stringify(tr.inflections) : null,
          tr.status
        ).lastInsertRowid
      );
      for (const s of tr.subjects) insSubj.run(trId, s);
    }
  }
}

describe('findTermsInSegments golden equality (C24 migration oracle)', () => {
  let db;
  beforeAll(() => {
    db = createTestDb();
    terminologyService._setTestDb(db);
    seedFixture(db);
  });

  it('the golden is not vacuous', () => {
    const nMatches = Object.values(golden).reduce((n, r) => n + r.matches.length, 0);
    const nIssues = Object.values(golden).reduce((n, r) => n + r.issues.length, 0);
    expect(nMatches).toBeGreaterThan(0);
    expect(nIssues).toBeGreaterThan(0);
  });

  // One `it` per segment so a diff names the failing case (the pattern at
  // tools/__tests__/book-rendering-config.test.js:5-13).
  for (const segmentId of Object.keys(golden)) {
    it(`reproduces the pre-swap result for ${segmentId}`, () => {
      const actual = terminologyService.findTermsInSegments(segments, 'efnafraedi-2e');
      expect(actual[segmentId]).toEqual(golden[segmentId]);
    });
  }
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/findTermsGolden.test.js`
Expected: PASS. (It must pass **now**, against the unmodified matcher — that is what makes it an oracle.)

- [ ] **Step 5: Commit**

```bash
git add server/scripts/capture-c24-golden.js server/__tests__/fixtures/c24-golden.json server/__tests__/findTermsGolden.test.js
git commit -m "test(c24): capture the golden oracle from the UNMODIFIED matcher

Captured after the ordering fix and before any Aho-Corasick code exists.
Reversed, the oracle would certify the new implementation against itself.
The capture script carries that warning: if the golden ever needs
regenerating, do it from a checkout at this commit, never from HEAD.

Includes a not-vacuous assertion — a golden of all-empty results would pass
forever while proving nothing."
```

---

## Task 4: Length-stable Unicode case folding

`/iu` uses simple case **folding**; `toLowerCase()` is lowercase **mapping**. They are different Unicode operations and 92 code-point pairs disagree. The table is *derived*, not hand-written, and the test re-derives it.

**Files:**
- Create: `server/scripts/derive-case-fold.js`
- Create: `server/lib/caseFold.data.js`
- Create: `server/lib/caseFold.js`
- Test: `server/__tests__/caseFold.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `foldChar(ch) -> string` (always the same `.length` as `ch`); `foldString(s) -> string` (always `s.length`); `FOLD_OVERRIDES: Map<string,string>`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/caseFold.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { foldString, foldChar } = require('../lib/caseFold');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const iuEq = (a, b) => new RegExp(`^${esc(a)}$`, 'iu').test(b);

/** Closure of a code point under per-character toLowerCase/toUpperCase. */
function candidates(ch) {
  const seen = new Set([ch]);
  const queue = [ch];
  while (queue.length) {
    const c = queue.pop();
    for (const next of [c.toLowerCase(), c.toUpperCase()]) {
      if ([...next].length !== 1 || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
}

describe('caseFold', () => {
  it('is length-stable for every code point', () => {
    const bad = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      if (foldChar(ch).length !== ch.length) bad.push(cp.toString(16));
    }
    expect(bad).toEqual([]);
  });

  it('agrees with /iu on every code point and its case-closure', () => {
    // O(n) — NOT all pairs. Compare each code point only against its own
    // lower/upper closure, which is where every /iu equivalence lives.
    const bad = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      for (const other of candidates(ch)) {
        if (other === ch) continue;
        const foldSame = foldChar(ch) === foldChar(other);
        if (foldSame !== iuEq(ch, other)) {
          bad.push(`U+${cp.toString(16)} vs U+${other.codePointAt(0).toString(16)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('leaves U+0130 alone — the only length-changing lowercase in Unicode', () => {
    expect('İ'.toLowerCase().length).toBe(2); // the hazard
    expect(foldChar('İ')).toBe('İ'); // the guard
    expect(iuEq('İ', 'i')).toBe(false); // and /iu agrees
  });

  it('is context-free, so Final_Sigma cannot apply', () => {
    expect('ΟΣ'.toLowerCase()).toBe('ος'); // whole-string lowercase: wrong
    expect(foldString('ΟΣ')).toBe(foldString('οσ')); // per-char: right
    expect(/σ/iu.test('ΟΣ')).toBe(true); // and matches /iu
  });

  it('folds the documented divergent pairs', () => {
    for (const [a, b] of [
      ['µ', 'μ'], // MICRO SIGN vs GREEK SMALL MU
      ['ſ', 's'], // LONG S
      ['ς', 'σ'], // FINAL SIGMA vs SIGMA
      ['ϕ', 'φ'], // PHI SYMBOL vs PHI
    ]) {
      expect(foldChar(a)).toBe(foldChar(b));
    }
  });

  it('preserves indices, so automaton offsets map onto the original string', () => {
    const s = 'The MASS of the Sample';
    expect(foldString(s).length).toBe(s.length);
    expect(foldString(s).indexOf('mass')).toBe(s.indexOf('MASS'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/caseFold.test.js`
Expected: FAIL — `Cannot find module '../lib/caseFold'`.

- [ ] **Step 3: Write the derivation script**

Create `server/scripts/derive-case-fold.js`:

```js
/**
 * Derives the case-fold override table. Run: node server/scripts/derive-case-fold.js
 *
 * WHY A TABLE AT ALL: /iu uses simple case FOLDING, String#toLowerCase is lowercase
 * MAPPING. Different Unicode operations — scf(µ)=μ but lower(µ)=µ. Roughly 92 code
 * point pairs disagree. Getting this wrong UNDER-matches, i.e. a term suggestion
 * silently disappears with a green suite.
 *
 * The table is derived here and verified exhaustively by caseFold.test.js. Do not
 * hand-edit server/lib/caseFold.data.js — re-run this.
 */
const fs = require('fs');
const path = require('path');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const iuEq = (a, b) => new RegExp(`^${esc(a)}$`, 'iu').test(b);

/** Base fold: per-character lowercase, identity when that would change length. */
function baseFold(ch) {
  const l = ch.toLowerCase();
  return l.length === ch.length ? l : ch;
}

function candidates(ch) {
  const seen = new Set([ch]);
  const queue = [ch];
  while (queue.length) {
    const c = queue.pop();
    for (const next of [c.toLowerCase(), c.toUpperCase()]) {
      if ([...next].length !== 1 || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
}

const overrides = new Map();
for (let cp = 0; cp <= 0x10ffff; cp++) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  const ch = String.fromCodePoint(cp);
  for (const other of candidates(ch)) {
    if (other === ch || !iuEq(ch, other)) continue;
    if (baseFold(ch) === baseFold(other)) continue;
    // Disagreement. Canonicalise the whole /iu class onto ONE representative:
    // the lowest code point among the class's base folds, so the choice is
    // stable regardless of iteration order.
    const cls = candidates(ch).filter((c) => iuEq(ch, c));
    const target = cls
      .map(baseFold)
      .sort((a, b) => a.codePointAt(0) - b.codePointAt(0))[0];
    for (const c of cls) {
      if (baseFold(c) !== target && c.length === target.length) overrides.set(c, target);
    }
  }
}

const lines = [...overrides]
  .sort((a, b) => a[0].codePointAt(0) - b[0].codePointAt(0))
  .map(([from, to]) => {
    const u = (s) => `\\u${s.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    return `  ['${u(from)}', '${u(to)}'],`;
  });

fs.writeFileSync(
  path.join(__dirname, '..', 'lib', 'caseFold.data.js'),
  `/**
 * GENERATED by server/scripts/derive-case-fold.js — do not hand-edit.
 * Code points where JS simple case FOLDING (what /iu uses) disagrees with
 * lowercase MAPPING (what String#toLowerCase does).
 * Verified exhaustively by server/__tests__/caseFold.test.js.
 */
module.exports = [
${lines.join('\n')}
];
`
);
console.log(`wrote ${overrides.size} overrides`);
```

- [ ] **Step 4: Generate the table and write the module**

```bash
node server/scripts/derive-case-fold.js
```
Expected: a non-zero override count (roughly 90; the exact number is whatever Unicode says — do not assert a literal).

Create `server/lib/caseFold.js`:

```js
/**
 * Length-stable, context-free Unicode case folding for the C24 term matcher.
 *
 * THREE PROPERTIES, all load-bearing:
 *  1. LENGTH-STABLE. Folded offsets equal original offsets, so automaton positions
 *     index straight into the original string with no remapping table. U+0130 is the
 *     only code point in Unicode whose toLowerCase changes length; it folds to itself,
 *     which is also what /iu does.
 *  2. CONTEXT-FREE. Per character, never on the whole string — "ΟΣ".toLowerCase() is
 *     "ος" (Final_Sigma), which DISAGREES with /iu. Per-char gives "οσ", which agrees.
 *  3. /iu-EQUIVALENT. toLowerCase is lowercase mapping; /iu uses simple case folding.
 *     The overrides reconcile them. Verified exhaustively in caseFold.test.js.
 *
 * NEVER use toLocaleLowerCase: "I".toLocaleLowerCase("tr") is "ı" (U+0131).
 */
const OVERRIDE_PAIRS = require('./caseFold.data');

const FOLD_OVERRIDES = new Map(OVERRIDE_PAIRS);

function foldChar(ch) {
  const override = FOLD_OVERRIDES.get(ch);
  if (override !== undefined) return override;
  const lower = ch.toLowerCase();
  return lower.length === ch.length ? lower : ch;
}

/** Fold a whole string. Output .length always equals input .length. */
function foldString(str) {
  let out = '';
  for (const ch of str) out += foldChar(ch);
  return out;
}

module.exports = { foldChar, foldString, FOLD_OVERRIDES };
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run server/__tests__/caseFold.test.js`
Expected: PASS, 6 tests. The two sweeps iterate 1.1 M code points; allow ~10–30 s. If either reports a non-empty `bad` array, the derivation is incomplete — fix `derive-case-fold.js` and regenerate; do not weaken the test.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/derive-case-fold.js server/lib/caseFold.js server/lib/caseFold.data.js server/__tests__/caseFold.test.js
git commit -m "feat(terminology): length-stable /iu-equivalent case folding

Folding per character rather than per string gives three things the matcher
needs: stable offsets (so automaton positions index into the original with no
remapping), context-freedom (whole-string toLowerCase applies Final_Sigma and
DISAGREES with /iu), and — via a derived override table — actual equivalence
with the /iu simple case folding the current regex uses.

The table is derived by script and verified by an exhaustive sweep over all
1,112,064 code points, not a sample. Errors here under-match, i.e. a term
suggestion silently disappears with a green suite."
```

---

## Task 5: Code-point-aware word boundary

**Files:**
- Create: `server/lib/wordBoundary.js`
- Test: `server/__tests__/termAutomaton.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `isWholeWordAt(text: string, begin: number, end: number) -> boolean`, where `begin` is inclusive and `end` exclusive.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/termAutomaton.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isWholeWordAt } = require('../lib/wordBoundary');

describe('isWholeWordAt', () => {
  const at = (text, word) => isWholeWordAt(text, text.indexOf(word), text.indexOf(word) + word.length);

  it('accepts a standalone word', () => expect(at('the mass here', 'mass')).toBe(true));
  it('rejects a word inside a longer word', () => expect(at('bitmasses', 'mass')).toBe(false));
  it('accepts at string start', () => expect(at('mass here', 'mass')).toBe(true));
  it('accepts at string end', () => expect(at('the mass', 'mass')).toBe(true));
  it('rejects when followed by a digit', () => expect(at('mass2', 'mass')).toBe(false));
  it('rejects when preceded by an underscore', () => expect(at('a_mass', 'mass')).toBe(false));
  it('accepts across punctuation', () => expect(at('(mass)', 'mass')).toBe(true));
  it('accepts across an Icelandic letter boundary correctly', () =>
    expect(at('þungi mass hér', 'mass')).toBe(true));
  it('rejects when preceded by an Icelandic letter', () =>
    expect(at('þmass', 'mass')).toBe(false));

  it('steps by CODE POINT, not code unit, next to an astral character', () => {
    // '𝐀' is two UTF-16 units. A naive text[begin-1] reads a lone low surrogate,
    // which is never \p{L}, so the boundary would wrongly pass.
    const text = '\u{1D400}atom';
    expect(isWholeWordAt(text, 2, 6)).toBe(false);
    // and the regex it replaces agrees:
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/u.test(text)).toBe(false);
  });

  it('accepts after an astral character that is NOT a letter', () => {
    const text = '\u{1F600}atom'; // emoji, not \p{L}
    expect(isWholeWordAt(text, 2, 6)).toBe(true);
    expect(/(?<![\p{L}\p{N}_])atom(?![\p{L}\p{N}_])/u.test(text)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/termAutomaton.test.js`
Expected: FAIL — `Cannot find module '../lib/wordBoundary'`.

- [ ] **Step 3: Write the implementation**

Create `server/lib/wordBoundary.js`:

```js
/**
 * Whole-word boundary test, byte-equivalent to the lookarounds in
 * terminologyService.wholeWordRegex:
 *   (?<![\p{L}\p{N}_]) ... (?![\p{L}\p{N}_])   with the u flag
 *
 * Applied to the ORIGINAL text, never the folded copy.
 *
 * NOTE the deliberate omission of \p{M}: this reproduces a PRE-EXISTING quirk
 * where the boundary succeeds mid-grapheme, so "Bru" matches decomposed "Brünn"
 * (U+0075 U+0308) but not precomposed "Brünn". Preserved on purpose — changing it
 * would be a behaviour change outside C24's scope.
 */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** @param {number} begin inclusive @param {number} end exclusive */
function isWholeWordAt(text, begin, end) {
  if (begin > 0) {
    // Step back one CODE POINT: if text[begin-1] is a low surrogate, the code
    // point starts at begin-2. Reading the lone surrogate would never match
    // \p{L} and would wrongly pass the boundary.
    let i = begin - 1;
    const unit = text.charCodeAt(i);
    if (unit >= 0xdc00 && unit <= 0xdfff && i > 0) i -= 1;
    if (WORD_CHAR.test(String.fromCodePoint(text.codePointAt(i)))) return false;
  }
  if (end < text.length) {
    if (WORD_CHAR.test(String.fromCodePoint(text.codePointAt(end)))) return false;
  }
  return true;
}

module.exports = { isWholeWordAt };
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run server/__tests__/termAutomaton.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/wordBoundary.js server/__tests__/termAutomaton.test.js
git commit -m "feat(terminology): code-point-aware whole-word boundary test

Reproduces wholeWordRegex's \\p{L}\\p{N}_ lookarounds exactly, including their
deliberate omission of \\p{M} (a pre-existing mid-grapheme quirk, preserved).

Steps back by code point rather than code unit: a naive text[begin-1] reads a
lone low surrogate next to an astral character, which is never \\p{L}, so the
boundary would wrongly pass. Pinned against the regex it replaces."
```

---

## Task 6: The automaton and the reduction

This task owns THE INVARIANT. Read it again before starting.

**Files:**
- Modify: `server/package.json`, `server/package-lock.json` (add `@monyone/aho-corasick`)
- Create: `server/lib/termAutomaton.js`
- Test: `server/__tests__/termAutomaton.test.js`

**Interfaces:**
- Consumes: `foldString` (Task 4), `isWholeWordAt` (Task 5).
- Produces:
  - `buildTermAutomaton(entries: Array<{headwordId:number, english:string}>) -> {ac, byKeyword: Map<string, number[]>, keywordCount: number}`
  - `findFirstOccurrences(automaton, text: string) -> Map<number, {index:number, length:number}>`

- [ ] **Step 1: Install the dependency and verify the lockfile**

```bash
cd server && npm install @monyone/aho-corasick && cd ..
git diff --stat server/package.json server/package-lock.json
grep -c 'cdn.sheetjs.com' server/package-lock.json
```
Expected: `package.json` gains one dependency line. **The `cdn.sheetjs.com` URL entries must still be present** — if that count drops, the lockfile was rewritten; `git checkout` it and redo the install with the CDN reachable.

Then confirm the artifact matches what the spec assumes:
```bash
cd server && node -e "
const {AhoCorasick} = require('@monyone/aho-corasick');
console.log(JSON.stringify(new AhoCorasick(['acid']).matchInText('xacidy')));
" && cd ..
```
Expected: `[{"begin":1,"end":5,"keyword":"acid"}]` — `begin` inclusive, `end` **exclusive**.

- [ ] **Step 2: Write the failing tests**

Append to `server/__tests__/termAutomaton.test.js`:

```js
const { buildTermAutomaton, findFirstOccurrences } = require('../lib/termAutomaton');

const build = (pairs) =>
  buildTermAutomaton(pairs.map(([headwordId, english]) => ({ headwordId, english })));

describe('findFirstOccurrences — THE INVARIANT', () => {
  it('takes the EARLIEST WHOLE-WORD occurrence, filtering before reducing', () => {
    // Three occurrences of "mass"; the middle one is interior to "bitmasses".
    // filter-then-earliest => 0. earliest-then-filter => no match. last-wins => 34.
    const a = build([[1, 'mass']]);
    const text = 'mass spectrometry uses bitmasses and mass units';
    expect(findFirstOccurrences(a, text).get(1)).toEqual({ index: 0, length: 4 });
  });

  it('finds a later occurrence when the FIRST raw hit is not whole-word', () => {
    const a = build([[1, 'mass']]);
    const text = 'bitmasses contain mass';
    expect(findFirstOccurrences(a, text).get(1)).toEqual({ index: 18, length: 4 });
  });

  it('reports nothing when every occurrence is interior', () => {
    const a = build([[1, 'mass']]);
    expect(findFirstOccurrences(a, 'bitmasses and bitmasses').has(1)).toBe(false);
  });

  it('returns overlapping terms independently — the tiler decides, not the automaton', () => {
    const a = build([[1, 'atomic mass'], [2, 'mass']]);
    const found = findFirstOccurrences(a, 'The atomic mass unit is defined.');
    expect(found.get(1)).toEqual({ index: 4, length: 11 });
    expect(found.get(2)).toEqual({ index: 11, length: 4 });
  });

  it('is case-insensitive via folding, with offsets into the ORIGINAL string', () => {
    const a = build([[1, 'mass']]);
    const text = 'The MASS is large.';
    expect(findFirstOccurrences(a, text).get(1)).toEqual({ index: 4, length: 4 });
    expect(text.slice(4, 8)).toBe('MASS');
  });

  it('gives every headword sharing one english the SAME position', () => {
    // UNIQUE(english, pos) permits this; production has zero today (spec §4.1.1),
    // so this is a guard against a schema-permitted state, not observed behaviour.
    const a = build([[1, 'bond'], [2, 'bond']]);
    const found = findFirstOccurrences(a, 'The bond is strong.');
    expect(found.get(1)).toEqual({ index: 4, length: 4 });
    expect(found.get(2)).toEqual({ index: 4, length: 4 });
  });

  it('matches Icelandic headwords case-insensitively', () => {
    const a = build([[1, 'þungi']]);
    expect(findFirstOccurrences(a, 'Þungi hlutarins.').get(1)).toEqual({ index: 0, length: 5 });
  });
});

describe('buildTermAutomaton — degenerate input parity with wholeWordRegex', () => {
  it('EXCLUDES falsy english, which would otherwise match zero-width everywhere', () => {
    // wholeWordRegex maps falsy to /(?!)/ — matches nothing (terminologyService.js:1878).
    // The automaton instead returns a zero-width hit at EVERY position.
    const a = build([[1, ''], [2, 'acid']]);
    const found = findFirstOccurrences(a, 'an acid here');
    expect(found.has(1)).toBe(false);
    expect(found.get(2)).toEqual({ index: 3, length: 4 });
  });

  it('INCLUDES whitespace-only english, which today does match a lone space', () => {
    // ' ' passes the !english guards at :278/:985/:1074; only :1116 trims.
    const a = build([[1, ' ']]);
    expect(findFirstOccurrences(a, 'a b').get(1)).toEqual({ index: 1, length: 1 });
  });

  it('handles an empty haystack and an empty term list', () => {
    expect(findFirstOccurrences(build([[1, 'acid']]), '').size).toBe(0);
    expect(findFirstOccurrences(build([]), 'acid').size).toBe(0);
  });

  it('handles a term longer than the haystack', () => {
    expect(findFirstOccurrences(build([[1, 'acid anhydride']]), 'acid').size).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run server/__tests__/termAutomaton.test.js`
Expected: FAIL — `Cannot find module '../lib/termAutomaton'`.

- [ ] **Step 4: Write the implementation**

Create `server/lib/termAutomaton.js`:

```js
/**
 * Aho-Corasick term matcher — the C24 replacement for one primitive:
 * "first occurrence of English headword T in segment S".
 *
 * ┌─ THE INVARIANT ─────────────────────────────────────────────────────────┐
 * │ firstWholeWordOccurrence(headword, segment) = the EARLIEST position at   │
 * │ which the headword occurs WITH WHOLE-WORD BOUNDARIES.                    │
 * │ Filter to whole-word FIRST, then take the earliest.                      │
 * │ NEVER "all occurrences."                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * This exactly reproduces .exec() on wholeWordRegex([english]). The caller
 * (findTermsInSegments) then applies its own overlap tiler in `terms` order — a
 * term whose first whole-word occurrence overlaps a claimed span is DROPPED, even
 * if it recurs later unoverlapped. Do not "improve" that here.
 *
 * Aho-Corasick returns ALL occurrences, so the tempting next step — "try the next
 * one, it doesn't overlap" — silently breaks byte-identity with the old behaviour.
 */
const { AhoCorasick } = require('@monyone/aho-corasick');
const { foldString } = require('./caseFold');
const { isWholeWordAt } = require('./wordBoundary');

/**
 * @param {Array<{headwordId:number, english:string}>} entries
 * @returns {{ac: AhoCorasick|null, byKeyword: Map<string, number[]>, keywordCount: number}}
 */
function buildTermAutomaton(entries) {
  const byKeyword = new Map();
  for (const { headwordId, english } of entries) {
    // Mirror wholeWordRegex's filter(Boolean) (terminologyService.js:1878): a falsy
    // english yields /(?!)/ there — matches nothing — but an empty automaton keyword
    // matches ZERO-WIDTH AT EVERY POSITION. Whitespace-only must still be INCLUDED:
    // ' ' does match a lone space today. Two opposite answers, one line apart.
    if (!english) continue;
    const keyword = foldString(english);
    const ids = byKeyword.get(keyword);
    if (ids) ids.push(headwordId);
    else byKeyword.set(keyword, [headwordId]);
  }
  const keywords = [...byKeyword.keys()];
  return {
    ac: keywords.length > 0 ? new AhoCorasick(keywords) : null,
    byKeyword,
    keywordCount: keywords.length,
  };
}

/**
 * @returns {Map<number, {index:number, length:number}>} headwordId -> earliest
 *          whole-word occurrence. Absent key means "no match in this text".
 */
function findFirstOccurrences(automaton, text) {
  const first = new Map();
  if (!automaton.ac || !text) return first;

  // Length-stable fold => folded offsets ARE original offsets, no remapping.
  const hits = automaton.ac.matchInText(foldString(text));

  for (const hit of hits) {
    // FILTER FIRST. Reducing before filtering picks an interior hit and then
    // discards it, losing a later valid match.
    if (!isWholeWordAt(text, hit.begin, hit.end)) continue;
    const length = hit.end - hit.begin; // end is EXCLUSIVE (verified against v1.5.2)
    for (const headwordId of automaton.byKeyword.get(hit.keyword)) {
      const existing = first.get(headwordId);
      // Strictly-less: EARLIEST wins. `<=` would silently become last-wins.
      if (existing === undefined || hit.begin < existing.index) {
        first.set(headwordId, { index: hit.begin, length });
      }
    }
  }
  return first;
}

module.exports = { buildTermAutomaton, findFirstOccurrences };
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server/__tests__/termAutomaton.test.js`
Expected: PASS, 22 tests.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/lib/termAutomaton.js server/__tests__/termAutomaton.test.js
git commit -m "feat(terminology): Aho-Corasick term matcher owning the C24 invariant

firstWholeWordOccurrence = the EARLIEST position at which a headword occurs
with whole-word boundaries. Filter to whole-word FIRST, then take the earliest,
never all occurrences.

Three plausible reductions exist and all look correct. Against 'mass
spectrometry uses bitmasses and mass units', filter-then-earliest gives 0,
earliest-then-filter gives no match, and last-wins gives 34. Nothing in the
existing suite distinguishes them, so each is pinned here.

Keyword maps to a LIST of headword ids: UNIQUE(english, pos) is not unique on
english. Production has zero duplicates today, so this is a guard against a
schema-permitted state, not observed behaviour.

Falsy english is excluded (an empty automaton keyword matches zero-width at
every position) while whitespace-only is kept (' ' does match a lone space
today) — mirroring wholeWordRegex's filter(Boolean) exactly."
```

---

## Task 7: Swap the primitive into `findTermsInSegments`

**Files:**
- Modify: `server/services/terminologyService.js:1331-1491`
- Test: `server/__tests__/findTermsGolden.test.js` (must still pass, unchanged)

**Interfaces:**
- Consumes: `buildTermAutomaton`, `findFirstOccurrences` (Task 6).
- Produces: unchanged public return shape — `{[segmentId]: {matches, issues}}`.

- [ ] **Step 1: Confirm the golden passes BEFORE the change**

Run: `npx vitest run server/__tests__/findTermsGolden.test.js`
Expected: PASS. This is the baseline the swap must not move.

- [ ] **Step 2: Add the imports and the automaton cache**

Near the other requires at the top of `server/services/terminologyService.js`:

```js
const { buildTermAutomaton, findFirstOccurrences } = require('../lib/termAutomaton');
```

Immediately above `function findTermsInSegments`:

```js
// C24: the ONLY cached state. It depends solely on the (headword_id, english)
// pairs, and the fingerprint is computed from rows we re-read on every call — so
// the DB stays authoritative and staleness is structurally impossible. No
// invalidation hook to forget, no second connection, no test-mode special case.
//
// PRAGMA data_version cannot do this job: all 16 mutators write through the same
// singleton connection, and data_version is "unchanged for commits made on the
// same database connection".
let _automatonCache = null; // { fingerprint: number, automaton }

/** FNV-1a over id + english, in SQL row order. */
function fingerprintHeadwords(pairs) {
  let hash = 0x811c9dc5;
  for (const [id, english] of pairs) {
    const chunk = `${id} ${english}`;
    for (let i = 0; i < chunk.length; i++) {
      hash ^= chunk.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash;
}
```

- [ ] **Step 3: Make `isRegex` lazy and drop the English regex**

Inside the row loop, replace the `termMap.set(...)` block at `:1357-1363`:

```js
    if (!termMap.has(row.headword_id)) {
      termMap.set(row.headword_id, {
        headwordId: row.headword_id,
        english: row.english,
        regex: wholeWordRegex([row.english]),
        translations: [],
      });
    }
```

with:

```js
    if (!termMap.has(row.headword_id)) {
      // No per-headword regex any more — the automaton replaces ~20,073 compiles
      // per call. `english` is still needed for match output and the fingerprint.
      termMap.set(row.headword_id, {
        headwordId: row.headword_id,
        english: row.english,
        translations: [],
      });
      headwordPairs.push([row.headword_id, row.english]);
    }
```

and declare `headwordPairs` just above the loop (next to `const termMap = new Map();`):

```js
  const headwordPairs = []; // distinct headwords in SQL order, for the fingerprint
```

Then replace the translation push at `:1368-1377`:

```js
    termMap.get(row.headword_id).translations.push({
      id: row.translation_id,
      icelandic: row.icelandic,
      inflections,
      status: row.status,
      subjects,
      isPrimary: bookSubject ? subjects.includes(bookSubject) : false,
      // Build regex for icelandic + all inflections
      isRegex: buildInflectionRegex(row.icelandic, inflections),
    });
```

with:

```js
    const translation = {
      id: row.translation_id,
      icelandic: row.icelandic,
      inflections,
      status: row.status,
      subjects,
      isPrimary: bookSubject ? subjects.includes(bookSubject) : false,
    };
    // C24: LAZY. buildInflectionRegex is constructed 28,903 times per call and
    // executed ~313 times. Because this function rebuilds translation objects on
    // EVERY call, eager construction pays all 28,903 compiles per request — a
    // correct automaton with an eager isRegex is not a fix at all.
    // Non-enumerable so it cannot leak into any serialised output.
    Object.defineProperty(translation, 'isRegex', {
      configurable: true,
      enumerable: false,
      get() {
        const regex = buildInflectionRegex(this.icelandic, this.inflections);
        Object.defineProperty(this, 'isRegex', {
          value: regex,
          configurable: true,
          enumerable: false,
          writable: true,
        });
        return regex;
      },
    });
    termMap.get(row.headword_id).translations.push(translation);
```

- [ ] **Step 4: Build or reuse the automaton, and swap the exec**

Immediately after the `const terms = [...]` assembly at `:1400-1403`, add:

```js
  // Rebuild only when the headword set actually changed. Everything else —
  // translations, inflections, subjects, statuses — is re-read every call.
  const fingerprint = fingerprintHeadwords(headwordPairs);
  if (!_automatonCache || _automatonCache.fingerprint !== fingerprint) {
    _automatonCache = {
      fingerprint,
      automaton: buildTermAutomaton(
        headwordPairs.map(([headwordId, english]) => ({ headwordId, english }))
      ),
    };
  }
  const automaton = _automatonCache.automaton;
```

Then inside the segment loop, replace `:1420-1433`:

```js
    for (const term of terms) {
      term.regex.lastIndex = 0;
      const enMatch = term.regex.exec(seg.enContent);

      if (enMatch) {
        const matchStart = enMatch.index;
        const matchEnd = matchStart + enMatch[0].length;
```

with:

```js
    // One automaton pass per segment, reduced to the earliest whole-word
    // occurrence per headword. The loop below is UNCHANGED: `terms` order is the
    // homograph precedence policy and `consumed` claims spans in exactly that
    // sequence.
    const firstByHeadword = findFirstOccurrences(automaton, seg.enContent);

    for (const term of terms) {
      const enMatch = firstByHeadword.get(term.headwordId);

      if (enMatch) {
        const matchStart = enMatch.index;
        const matchEnd = matchStart + enMatch.length;
```

and change the `position` field at `:1453` from `position: enMatch.index,` to:

```js
          position: matchStart,
```

- [ ] **Step 5: Run the golden and the full service suite**

```bash
npx vitest run server/__tests__/findTermsGolden.test.js
npx vitest run server/__tests__/terminologyService.test.js
```
Expected: BOTH PASS with no changes to either test file. A golden failure here means the swap is not behaviour-preserving — read THE INVARIANT again before touching anything.

- [ ] **Step 6: Add a cache-invalidation test**

Append to `server/__tests__/findTermsGolden.test.js`:

```js
describe('automaton cache stays consistent with the DB', () => {
  it('picks up a headword added after the first call, with no explicit invalidation', () => {
    const db2 = createTestDb();
    terminologyService._setTestDb(db2);

    const seg = [{ segmentId: 's', enContent: 'A catalyst works.', isContent: 'Hvati virkar.' }];
    expect(terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches).toHaveLength(0);

    const hw = db2
      .prepare("INSERT INTO terminology_headwords (english, pos) VALUES ('catalyst', NULL)")
      .run();
    const tr = db2
      .prepare(
        `INSERT INTO terminology_translations
           (headword_id, icelandic, source, status, proposed_by, proposed_by_name)
         VALUES (?, 'hvati', 'fixture', 'approved', 'u1', 'F')`
      )
      .run(hw.lastInsertRowid);
    db2
      .prepare(
        "INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, 'chemistry')"
      )
      .run(tr.lastInsertRowid);

    const after = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e');
    expect(after.s.matches).toHaveLength(1);
    expect(after.s.matches[0].english).toBe('catalyst');

    terminologyService._setTestDb(db);
    db2.close();
  });

  it('reflects a headword RENAME, which a count-based fingerprint would miss', () => {
    const db3 = createTestDb();
    terminologyService._setTestDb(db3);
    const seg = [{ segmentId: 's', enContent: 'An aton and an atom.', isContent: '' }];

    const hw = db3
      .prepare("INSERT INTO terminology_headwords (english, pos) VALUES ('atom', NULL)")
      .run();
    const tr = db3
      .prepare(
        `INSERT INTO terminology_translations
           (headword_id, icelandic, source, status, proposed_by, proposed_by_name)
         VALUES (?, 'frumeind', 'fixture', 'approved', 'u1', 'F')`
      )
      .run(hw.lastInsertRowid);
    db3
      .prepare(
        "INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, 'chemistry')"
      )
      .run(tr.lastInsertRowid);
    expect(terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches[0].english).toBe(
      'atom'
    );

    // Same length, same row count — only the bytes change.
    db3.prepare("UPDATE terminology_headwords SET english='aton' WHERE id=?").run(
      hw.lastInsertRowid
    );
    expect(terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches[0].english).toBe(
      'aton'
    );

    terminologyService._setTestDb(db);
    db3.close();
  });
});
```

- [ ] **Step 7: Run it**

Run: `npx vitest run server/__tests__/findTermsGolden.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/findTermsGolden.test.js
git commit -m "perf(terminology): replace the per-term regex exec with one automaton pass

findTermsInSegments compiled ~48,976 RegExp objects per call and ran 20,073
terms against 282 segments — 5.66M executions, synchronously, blocking the
event loop for ~100s. One editor opening one module took the whole server away
from every editor for 2.6 minutes.

Exactly one expression changes: term.regex.exec(seg.enContent) becomes a lookup
into a per-segment map built by a single Aho-Corasick pass. translationTier,
the in-scope/fallback partition, the consumed span tiler, the translation
ranking, and match/issue construction are untouched — `terms` order IS the
homograph precedence policy.

isRegex becomes lazy. It is built 28,903 times per call and executed ~313
times, and because this function rebuilds translation objects on every call,
eager construction would pay all 28,903 compiles per REQUEST — a correct
automaton with an eager isRegex is not a fix at all.

Only the automaton is cached, fingerprinted from rows already read, so the DB
stays authoritative on every call and staleness is structurally impossible.
Pinned by tests covering an insert and a length-preserving rename."
```

---

## Task 8: Randomised differential

The golden pins one input. This generates the orderings hand-written tests do not.

**Files:**
- Create: `server/__tests__/findTermsDifferential.test.js`

**Interfaces:**
- Consumes: `buildTermAutomaton`, `findFirstOccurrences`, `wholeWordRegex` semantics.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `server/__tests__/findTermsDifferential.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { buildTermAutomaton, findFirstOccurrences } = require('../lib/termAutomaton');

// The reference: exactly what terminologyService.wholeWordRegex builds (:1877-1882),
// used the way findTermsInSegments used it — one exec, first occurrence.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function referenceFirst(english, text) {
  if (!english) return undefined;
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${escapeRegex(english)})(?![\\p{L}\\p{N}_])`,
    'giu'
  );
  re.lastIndex = 0;
  const m = re.exec(text);
  return m ? { index: m.index, length: m[0].length } : undefined;
}

let seed = 20260806;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// Alphabet MUST reach beyond ASCII or the differential can never see a fold bug
// (spec §4.4) or the surrogate boundary bug (§4.5).
const ALPHABET = [
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  ...'áéíóúýþæðöÁÉÍÓÚÝÞÆÐÖ',
  ...'µςσΜΣϕφİi',
  '\u{1D400}',
  '\u{1F600}',
  ' ',
  '-',
  '(',
  ')',
  '.',
];
const word = (n) => Array.from({ length: n }, () => pick(ALPHABET)).join('');

function randomCase(s) {
  return [...s].map((c) => (rnd() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join('');
}

describe('AC vs regex differential (1000 fixtures)', () => {
  it('agrees with the regex on every generated case', () => {
    const mismatches = [];
    for (let i = 0; i < 1000; i++) {
      const terms = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () =>
        word(1 + Math.floor(rnd() * 8))
      ).filter(Boolean);
      if (terms.length === 0) continue;

      // EMBED terms into the text. Purely random text almost never contains a
      // term, so the differential would compare empty against empty — a vacuous
      // pass at scale, which is the most convincing kind.
      let text = word(5 + Math.floor(rnd() * 20));
      const embedCount = Math.floor(rnd() * 4);
      for (let k = 0; k < embedCount; k++) {
        const t = pick(terms);
        const sep = pick([' ', '', '-', '. ', '(']);
        text += sep + (rnd() < 0.5 ? randomCase(t) : t) + pick([' ', '', 'x', '.']);
      }
      text += word(Math.floor(rnd() * 10));

      const automaton = buildTermAutomaton(
        terms.map((english, idx) => ({ headwordId: idx + 1, english }))
      );
      const actual = findFirstOccurrences(automaton, text);

      terms.forEach((english, idx) => {
        const expected = referenceFirst(english, text);
        const got = actual.get(idx + 1);
        const same =
          (expected === undefined && got === undefined) ||
          (expected && got && expected.index === got.index && expected.length === got.length);
        if (!same) {
          mismatches.push({ english, text, expected, got });
        }
      });
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  it('the generator actually produces matches, or the run above proves nothing', () => {
    // Guards against a silently vacuous differential.
    seed = 20260806;
    let found = 0;
    for (let i = 0; i < 200; i++) {
      const t = word(3);
      const text = `${word(4)} ${t} ${word(4)}`;
      if (referenceFirst(t, text)) found++;
    }
    expect(found).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/findTermsDifferential.test.js`
Expected: PASS, 2 tests. If mismatches appear, the first five are printed — fix `termAutomaton.js`, never the reference.

- [ ] **Step 3: Prove the differential can actually fail**

Temporarily change `hit.begin < existing.index` to `hit.begin <= existing.index` in `server/lib/termAutomaton.js` (that is the last-wins bug), then:

Run: `npx vitest run server/__tests__/findTermsDifferential.test.js`
Expected: **FAIL** with concrete mismatches. Revert the change and confirm it passes again. A differential that cannot fail is decoration.

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/findTermsDifferential.test.js
git commit -m "test(c24): randomised differential against the regex it replaces

1000 generated fixtures comparing the automaton path to wholeWordRegex used
exactly as findTermsInSegments used it. This is what catches the reduction
trap and any fold error, because it generates orderings the hand-written tests
do not.

Two properties the generator needs and would be worthless without: it EMBEDS
terms into the text (purely random text almost never contains one, so the run
would compare empty against empty — a vacuous pass at scale), and its alphabet
reaches past ASCII into Icelandic, the divergent Greek pairs, and astral
characters, without which a fold or surrogate-boundary bug is unreachable.

Demonstrated failing against a deliberately introduced last-wins bug."
```

---

## Task 9: Compile-count assertions

Wall-clock is not assertable in CI. Compile count is — but only if calibrated.

**Files:**
- Modify: `server/__tests__/findTermsGolden.test.js`

- [ ] **Step 1: Write the test**

Append to `server/__tests__/findTermsGolden.test.js`:

```js
describe('C24 performance properties, asserted as COMPILE COUNTS not wall-clock', () => {
  it('compiles no per-headword English regex, and only the inflection regexes it executes', () => {
    const NativeRegExp = global.RegExp;
    let compiles = 0;
    // eslint-disable-next-line no-global-assign
    global.RegExp = new Proxy(NativeRegExp, {
      construct(target, args) {
        compiles++;
        return new target(...args);
      },
    });
    try {
      terminologyService.findTermsInSegments(segments, 'efnafraedi-2e');
    } finally {
      // eslint-disable-next-line no-global-assign
      global.RegExp = NativeRegExp;
    }

    const headwordCount = terms.headwords.length;
    const translationCount = terms.headwords.reduce((n, h) => n + h.translations.length, 0);

    // BOTH sides must be asserted. The automaton removes the ~headwordCount English
    // compiles; laziness removes the inflection compiles that are never executed. An
    // assertion covering one side passes on a half-fix — which is exactly the
    // caching-only outcome that makes saves fast and leaves page loads broken.
    expect(compiles).toBeLessThan(headwordCount);
    expect(compiles).toBeLessThan(translationCount);
  });

  it('the assertion above is CALIBRATED — the fixture is large enough to discriminate', () => {
    // An uncalibrated threshold passes on a NO-fix. On this fixture the unmodified
    // function compiled headwordCount + translationCount regexes; if the fixture ever
    // shrinks below the threshold, the assertion silently stops discriminating.
    const headwordCount = terms.headwords.length;
    expect(headwordCount).toBeGreaterThan(300);
  });
});
```

- [ ] **Step 2: Prove it fails on the unfixed code**

```bash
git stash push server/services/terminologyService.js
npx vitest run server/__tests__/findTermsGolden.test.js -t "compiles no per-headword"
```
Expected: **FAIL** — the unmodified function compiles roughly `headwordCount + translationCount` regexes. Then:
```bash
git stash pop
```

- [ ] **Step 3: Confirm it passes on the fixed code**

Run: `npx vitest run server/__tests__/findTermsGolden.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/findTermsGolden.test.js
git commit -m "test(c24): assert the perf property as a compile count, both sides

Wall-clock is not assertable in CI; compile count is. The assertion covers BOTH
reductions — the automaton removing the per-headword English compiles, and lazy
isRegex removing the inflection compiles that are never executed. A one-sided
count passes on a half-fix, and an uncalibrated count passes on a NO-fix, so
the fixture size is pinned too and the assertion was demonstrated failing
against the unmodified function."
```

---

## Task 10: Delete the dead route, port its behavioural tests

**Files:**
- Modify: `server/routes/terminology.js` (delete `POST /check-consistency`, `:1101-1140`)
- Modify: `server/e2e/terminology.spec.js` (remove the 2 tests at `:746-799`)
- Modify: `server/e2e/terminology-multibook.spec.js` (add 2 ported tests)
- Modify: `docs/_generated/routes.md` (regenerate)

- [ ] **Step 1: Delete the route**

In `server/routes/terminology.js`, delete the entire `router.post('/check-consistency', ...)` handler beginning at `:1101`. It has zero production callers, is gated by `requireAuth` **alone** — no `requireRole`, no book scope — and takes a caller-supplied unbounded `segments` array, which under today's cost is a one-request server-outage handle. Following the `/jobs` precedent (issue #328).

- [ ] **Step 2: Remove its two E2E tests**

In `server/e2e/terminology.spec.js`, delete the tests `'consistency check detects missing translation'` (`:746-772`) and `'consistency check passes when translation present'` (`:774-799`), plus the two earlier `check-consistency` calls at `:646` and `:661`.

- [ ] **Step 3: Port the behavioural coverage to the surviving route**

Append to `server/e2e/terminology-multibook.spec.js`:

```js
  // Ported from terminology.spec.js when POST /check-consistency was deleted (C24).
  // They were the only INTEGRATION-level exercise of the issue path; the behaviours
  // stay unit-pinned at terminologyService.test.js:1129-1174, but this keeps a real
  // server + real DB in the loop for the function C24 rewrites.
  //
  // NOTE these deliberately do NOT use the branchless expect([404,500]) idiom of the
  // test above. A ported test that accepts a 500 has preserved nothing.
  test('terms endpoint reports a missing approved translation', async ({ page }) => {
    const response = await page.request.get(
      '/api/segment-editor/efnafraedi-2e/1/m68664/terms'
    );
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('termMatches');

    const withIssues = Object.values(data.termMatches).filter((r) => r.issues.length > 0);
    for (const r of withIssues) {
      for (const issue of r.issues) {
        expect(issue.type).toBe('missing');
        expect(typeof issue.english).toBe('string');
        expect(typeof issue.expected).toBe('string');
        expect(issue.message).toContain('fannst ekki');
      }
    }
  });

  test('terms endpoint returns well-formed matches for every segment', async ({ page }) => {
    const response = await page.request.get(
      '/api/segment-editor/efnafraedi-2e/1/m68664/terms'
    );
    expect(response.status()).toBe(200);
    const data = await response.json();

    const all = Object.values(data.termMatches).flatMap((r) => r.matches);
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(typeof m.headwordId).toBe('number');
      expect(typeof m.english).toBe('string');
      expect(typeof m.position).toBe('number');
      expect(m.position).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(m.translations)).toBe(true);
      expect(m.translations.length).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 4: Regenerate the route docs**

```bash
npm run docs:generate
git diff --stat docs/_generated/routes.md
grep -c 'check-consistency' docs/_generated/routes.md || echo "removed, as expected"
```
Expected: the route is gone from `routes.md`. **`docs-check.yml` path-triggers on `server/routes/**` and diffs `docs/_generated/` — skipping this reds the gate.**

- [ ] **Step 5: Fix the false comment on the save path**

In `server/routes/segment-editor.js:438`, replace the `Live QA (non-blocking)` comment with:

```js
      // Live QA. NOT non-blocking — the try/catch makes this non-FATAL, not
      // non-blocking, and there is no await. It runs synchronously on every save.
      // (Before C24 this cost ~45s; the mislabel is probably why it was never
      // suspected.)
```

- [ ] **Step 6: Run the full suite**

```bash
npm test
```
Expected: PASS. Compare against the recorded baseline of 268 files / 3868 tests — the count should drop by the 2 removed E2E tests and rise by the new unit and E2E tests.

- [ ] **Step 7: Commit**

```bash
git add server/routes/terminology.js server/routes/segment-editor.js server/e2e/ docs/_generated/routes.md
git commit -m "refactor(terminology): delete the dormant check-consistency route

Zero production callers, and the only findTermsInSegments call site gated by
requireAuth ALONE — no requireRole, no book scope — taking a caller-supplied
unbounded segments array. Under the pre-C24 cost that was a one-request
server-outage handle available to any authenticated user, including viewers.
Follows the /jobs precedent (#328). Blast radius goes from 5 call expressions
to 3 (the route held two).

Its two behavioural E2E tests are PORTED to GET .../terms rather than lost:
they were the only integration-level exercise of the issue path, so deleting
them would leave the PR net-negative on tests for the very function it
rewrites. The ported versions deliberately assert status 200 instead of
inheriting the sibling's branchless expect([404,500]) idiom — a ported test
that accepts a 500 has preserved nothing.

Also corrects the save path's 'Live QA (non-blocking)' comment, which was
false: the try/catch makes it non-FATAL, not non-blocking, and there is no
await. That mislabel is probably why the save path was never suspected."
```

---

## Task 11: Measure, and record real numbers

No code. The register's standard is a measurement, not an estimate.

**Files:**
- Create: `server/scripts/bench-c24.js`

- [ ] **Step 1: Write the benchmark**

Create `server/scripts/bench-c24.js`:

```js
/**
 * C24 before/after benchmark. Run: node server/scripts/bench-c24.js <book> <chapter> <moduleId>
 * e.g. node server/scripts/bench-c24.js efnafraedi-2e 3 m68700
 *
 * Reports latency AND RSS. ~85MB resident for the automaton is a real cost on a
 * small Linode; a claim that reports only time is half-measured.
 */
const segmentEditorService = require('../services/segmentEditorService');
const terminologyService = require('../services/terminologyService');

const [book, chapter, moduleId] = process.argv.slice(2);
if (!book || !chapter || !moduleId) {
  console.error('usage: node server/scripts/bench-c24.js <book> <chapter> <moduleId>');
  process.exit(1);
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const rss0 = process.memoryUsage().rss;

const segments = segmentEditorService.buildEffectiveSegments(book, chapter, moduleId);
console.log(`${moduleId}: ${segments.length} segments`);

for (const label of ['cold', 'warm']) {
  const t0 = process.hrtime.bigint();
  const res = terminologyService.findTermsInSegments(segments, book);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const matches = Object.values(res).reduce((n, r) => n + r.matches.length, 0);
  console.log(`  ${label}: ${ms.toFixed(1)} ms, ${matches} matches, rss ${mb(process.memoryUsage().rss)}`);
}

// The save path: one segment.
const t0 = process.hrtime.bigint();
terminologyService.findTermsInSegments([segments[0]], book);
console.log(`  save path (1 segment): ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms`);
console.log(`  rss delta: ${mb(process.memoryUsage().rss - rss0)}`);
```

- [ ] **Step 2: Measure locally and record the numbers**

```bash
node server/scripts/bench-c24.js efnafraedi-2e 3 m68700
```
Record cold, warm, save-path latency and RSS delta. Expected from the spec: ~133 ms scan plus an unmeasured row-read cost, ~85 MB resident. **Report what you actually got.**

- [ ] **Step 3: Commit**

```bash
git add server/scripts/bench-c24.js
git commit -m "chore(c24): benchmark script reporting latency AND RSS

The automaton is ~85MB resident, which is a real cost on the production box.
A performance claim that reports only time is half-measured."
```

- [ ] **Step 4: Whole-branch adversarial review before the PR**

Request a blind review pair (Opus + Fable, same inputs, adjudicated) covering the whole branch, per the C14 precedent. Give reviewers THE INVARIANT verbatim and ask them to try to break equivalence.

- [ ] **Step 5: Open the PR**

Root `npm test` must be green — it is the authoritative gate; there is no branch protection. State the measured numbers in the PR body.

- [ ] **Step 6: Deploy and verify on prod — the actual done bar**

`npm test` green is necessary, not sufficient. §C21 and §C23 were both demonstrated on prod's own deployed code.

```bash
# deploy is TWO steps: deploy.sh aborts at `sudo systemctl restart` (no TTY under
# BatchMode), leaving the tree updated while the service runs the OLD code.
# A human runs the restart.
./scripts/deploy.sh
# then, after the human restart:
journalctl -u ritstjorn | grep '"msg":"request"' | tail -40
```

Confirm:
1. `terminology-report` and `terms` complete in **milliseconds** after a real module open.
2. **Get one real `POST …/edit` into the journal.** Prod has served no `/edit` since C23 deployed, so the ~45 s save figure has never been observed. `/accept` is a different route and does not exercise this path.
3. Read RSS on the box (`systemctl status ritstjorn`), not only from the dev-box benchmark.

⚠️ A fast `/api/health` proves nothing about intermittent blocking — sample **during** a module open, not between.

---

## Self-Review

**Spec coverage:** §4.1 invariant → Task 6 · §4.1.1 duplicate headwords → Task 6 Step 2 · §4.4 folding → Task 4 · §4.5 boundary → Task 5 · §4.6 cache → Task 7 · §4.7 lazy `isRegex` → Task 7 Step 3 · §4.8 dependency → Task 6 Step 1 · §4.9 route deletion + docs + E2E port → Task 10 · §4.10/§4.11 census → Tasks 1–2 fixture and ordering · §5.0 commit order → Tasks 2–3 · §5.1 golden → Tasks 1, 3 · §5.2 differential → Task 8 · §5.3 compile count → Task 9 · §5.4 fold sweep → Task 4 · §5.5 pins → Tasks 2, 5, 6 · §6 comment fix + throw-not-fallback → Task 10 Step 5, Global Constraints · §7 verification → Task 11.

**Gap found and closed:** §4.7's `['mól','mól (m)']` counterexample is generated into the fixture (Task 1 §4) and therefore covered by the golden, but is not separately named. It is asserted structurally by the fixture-realism test.

**Type consistency:** `buildTermAutomaton` returns `{ac, byKeyword, keywordCount}` — used in Task 7 only via `findFirstOccurrences`. `findFirstOccurrences` returns `Map<number, {index, length}>`; Task 7 reads `.index` and `.length`, matching. `foldString`/`foldChar`/`isWholeWordAt` signatures match every call site.
