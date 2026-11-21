# The term check accepts a word that starts with the term (§C246)

> 🧊 DRAFT, 2026-11-21, for [USER]'s review. Every design choice below is one of [USER]'s five rulings of
> 2026-11-21. The rest is how to build them, and §8 lists the calls this draft makes on its own. Once [USER]
> approves it, it is frozen: the design record (evidence, never status). Status lives in the register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C246).

## 1. Intent

The editor's term check accepts an approved Icelandic term only as a whole word. Icelandic writes compounds as
one word, so a segment that holds the term only as the first part of a compound warns. `magnesíumklóríð` does
not count as `magnesíum`, and `magnesíum-jón` passes only because a hyphen is not a letter.

**Measured cost** (all read-only on production, 2026-11-21; evidence in `experiments/element-names/`):
- **Measurement 14** (`reports/termcheck-dryruns.md`): §C245's 59 element-name adds would raise 152 warnings on
  140 segments across 19 names, and **151 of them are closed compounds only**. [USER] holds those 59 adds until
  this change lands (§C245).
- **Measurement 15** (`reports/c246-census.md`): chemistry has **31,573 term warnings today**. A plain "word
  starts with the term" rule would remove 5,135 of them, with a false-pass rate that falls with term length.
- **Measurement 16** (`reports/c246-options.md`): the two remaining questions, measured with the first three
  rulings built in.

**[USER]'s rulings, 2026-11-21:**
1. **The base rule.** The term counts if a word starts with it. Its stored inflected forms still count only as
   whole words.
2. **A minimum term length of four letters.**
3. **The form `merki` is excluded.**
4. **A2:** the winner and the tie options take the prefix rule; alternatives stay whole-word.
5. **B3:** a multi-word or hyphenated term takes it only when its last word has four letters or more.

## 2. Goals, non-goals, anti-goals

**Goals.**
- Implement the five rulings exactly, and nothing else.
- Make the change measurable: the acceptance test in §6 passes or fails on numbers.
- Leave every other behaviour of the term check unchanged.

**Non-goals.**
- **The English side.** Which English terms match where (`termAutomaton`, `isWholeWordAt`, the overlap tiler) is
  untouched. So is the editor's highlighting of English terms (`public/js/term-highlight.js`).
- **The book-glossary worklist** (`lib/worklistMatch.js`) stays whole-word. It lists segments that still hold an
  *old* form, so a compound of an old form is still not listed. That is a known blind spot, and it is separate.
- **The MT glossary** (`tools/api-translate.js`) and the glossary export are untouched.
- **Per-book settings.** One rule for every book (§8, call 3).

**Anti-goals.**
- **Do not change `wholeWordRegex`.** The English-side matcher promises to reproduce it exactly
  (`lib/termAutomaton.js` and `lib/wordBoundary.js` say so, and tests mirror it). The prefix shape is a separate
  builder, used only by the Icelandic-side test.
- **Do not regenerate the C24 golden** (`__tests__/fixtures/c24-golden.json`). Its capture script forbids it. It
  pins English span sets, which this change does not move, so it must stay green as it is.

## 3. The rule, precisely

### 3.1 Which terms qualify for the prefix

`prefixQualifies(text)` is true when all of these hold:
- **Not excluded:** the term text, lowercased, is not in the exclusion list (`merki`). The match is exact, so
  `formerki` is not excluded.
- **A single word** (no whitespace, no hyphen) **has four characters or more.**
- **A multi-word or hyphenated term qualifies when its last part** (split on whitespace and hyphens) **has four
  characters or more.** A term that ends in a hyphen (`upphafs-`) has an empty last part, so it never qualifies.

Length counts the characters of the term text as stored, in code points, so `ál` is 2 and `vetni` is 5.

### 3.2 The Icelandic-side test for one candidate

For each candidate form the check tests (its text plus its stored inflections):
- **If the candidate is the winner or a tie option, and its text qualifies:** the segment passes when a word
  starts with the text (left boundary as today, no right boundary), or when a stored inflection occurs as a
  whole word.
- **Otherwise** (every alternative, and every candidate whose text does not qualify): today's whole-word test,
  unchanged.

The left boundary stays. A word must *start* with the term, so an occurrence inside a word never counts:
`miðberyllínatómið` still warns for `beryllíum`. Case handling is unchanged (`giu`).

### 3.3 The three roles

`findTermsInSegments` tests a form in three places:

| Role | Where | Ruling |
|---|---|---|
| winner | `matchesForm(winner)` | prefix (rulings 1–3, 5) |
| tie | `hit.tied.some(matchesForm)` | prefix; each tied option qualifies on its own text (A2) |
| alternative | `alts.find(matchesForm)` and the `isTermsFor(…)` sibling search | whole-word, as today (A2) |

Under A2 an alternative that appears only as the start of a compound does **not** turn a `missing` into an
`alternative`. Measurement 16 showed some of those relabellings would be wrong (`gildistala` would name `gildi`,
from `gildishvolf`).

### 3.4 Expected outcomes (each row is a test)

| Expected term | Segment holds | Today | After |
|---|---|---|---|
| `magnesíum` | `Magnesíumjónin` | warns | **passes** |
| `magnesíum` | `Magnesíum-jónin` | passes | passes |
| `magnesíum` | `magnesíums`, a stored form | passes | passes |
| `magnesíum` | `magnesíums`, not stored | warns | **passes**, because it starts with the base |
| `magnesíum` | only `Mg` | warns | warns |
| `magnesíum` | `Magnesín` | warns | warns |
| `beryllíum` | `miðberyllínatómið` | warns | warns (inside a word) |
| a 3-letter term such as `jón` | `jónun` | warns | warns (below the minimum) |
| `merki` | `merkingin` | warns | warns (excluded) |
| a tie that includes `merki` | `merkingin` | warns | warns (excluded form) |
| `Lewis-mynd` | `Lewis-myndin` | warns | **passes** (last part has 4 letters) |
| `sýrubindandi lyf` | `sýrubindandi lyfið` | warns | warns (last part has 3) |
| `upphafs-` | `Upphafs-pH` | warns | warns (empty last part) |
| winner `gildistala`, alternative `gildi` | `gildishvolf` only | `missing` | `missing` (alternatives stay whole-word) |

## 4. Where it changes

- **A new module, `server/lib/termPrefixRule.js`,** owns the enforceable values: `MIN_PREFIX_TERM_LENGTH = 4`,
  `PREFIX_EXCLUDED_FORMS = ['merki']`, and `prefixQualifies(text)`. Its test pins them. Per CLAUDE.md
  § *One source of truth*, no other file restates them.
- **`server/services/terminologyService.js`:**
  - `buildInflectionRegex` gains an option to build the prefix shape: the text with a left boundary only,
    alternated with the stored inflections as whole words.
  - `matchesForm(term, role)` asks for the prefix shape when `role !== 'alternative'` and
    `prefixQualifies(term.text)`.
  - The three call sites pass their role.
  - `wholeWordRegex` is unchanged.
- **No migration, no data change, no new route.** Every caller sees the new rule:
  - the segment editor's terms panel (`routes/segment-editor.js`);
  - the per-save warnings (`segmentEditorService.getSegmentTerminologyWarnings`);
  - the module report (`segmentEditorService.getModuleTerminologyReport`);
  - the census script `scripts/read-firing-rows.js`.
- **The comments at `matchesForm` and `buildInflectionRegex`** must say what the rule is and point to this spec.

## 5. Tests

- **`prefixQualifies` unit tests:** lengths 3, 4 and 5; the exclusion, including that `formerki` is not
  excluded; multi-word and hyphenated terms with last parts of 3 and 4 letters; a term ending in a hyphen.
- **`findTermsInSegments` tests on a freshly migrated database**, one per row of §3.4, ties and alternatives
  included. Copy the test-file header from `__tests__/importConcepts.test.js`; Vitest cannot be `require`d.
- **Red first.** Each test of new behaviour must fail on the code before the change. Each control (whole-word
  still passes, inside-a-word still warns, `Mg` still warns) must pass both before and after. A test only ever
  run against the new code proves nothing about the change.
- **The existing suites:** `terminologyService`, `findTermsTie`, `findTermsDifferential`, `findTermsSymbolCase`,
  `findTermsGolden`, `readFiringRows`, `bookGlossaryResolve`, `findTermsC19ApplyProbe`.
  - The golden must pass unchanged (§2).
  - Any existing test that asserts a warning on a word that starts with a qualifying term will flip. Judge each
    flip against the rulings; never edit a test green without saying why.
  - Run the full `npm test`. The E2E job also runs in CI, so check it for term-warning expectations.

## 6. Acceptance test and expected effect

### 6.1 Measurement 14 must pass

Rebuild measurement 14's two dry-run scripts with `build-termcheck-dryruns.py` from the committed templates. Run
them on the changed code, with production's database read-only, the way measurement 14 ran (§8, call 5).
Expected, with measurements 7–9's fix drafts overlaid and the BÍN lookup done:
- **The 151 closed-compound warnings stop.** Magnesium goes from 43 to 0.
- **One warning remains:** `miðberyllínatómið` (a non-official form inside a word). It goes when measurement 13's
  draft is overlaid too (`editor-fixes-inner.json`).
- **The synthetic controls:**
  - `Magnesíumjónin` now passes for all 59 names;
  - `Mg` alone and `Magnesín` still warn;
  - a standalone name and a hyphenated compound still pass.
- **Predicted, not measured:** before the lookup finishes the count also drops to 1, because forms such as
  `magnesíums` start with the base.

### 6.2 Expected corpus effect (measurements 15 and 16)

On chemistry's text of 2026-11-21, the five rulings remove **4,451 of 31,573 warnings** (14.1%), across 376 terms,
with a false range of **1.3–6.0%**. That is measured as arm M2; under A2, alternatives remove nothing. They add no
warning and relabel none. 233 of the removals are ties.

| Term length | Removed | True | Undecided | False | False range |
|---|---:|---:|---:|---:|---|
| 4 | 925 | 825 | 79 | 21 | 2.3–10.8% |
| 5 | 1,000 | 921 | 60 | 19 | 1.9–7.9% |
| 6–7 | 1,228 | 1,158 | 62 | 8 | 0.7–5.7% |
| 8–10 | 640 | 627 | 9 | 4 | 0.6–2.0% |
| 11+ | 589 | 586 | 3 | 0 | 0.0–0.5% |
| hyphenated | 32 | 32 | 0 | 0 | 0.0% |
| multi-word | 37 | 33 | 0 | 4 | 10.8% |

The classes are heuristic: "true" is a ceiling and "false" a floor (measurement 15 explains why). The text moves
as editors work, so a later re-run will not reproduce 4,451 exactly. What must hold is the shape: no added
warning, no relabelling, and a false range of the same order.

### 6.3 Rollout

1. Merge and deploy; it is server code only. The warnings are advisory, so the change cannot block a save or a
   submit.
2. Run §6.1 read-only on production.
3. If it passes, §C245's hold lifts. Follow step 4 of `reports/c73-entries.md`: enter magnesium first, check that
   its 43 compound segments no longer warn, then enter the other 58 in one sitting.

## 7. Risks

- **False passes, by design.** About 1–6% of the removed warnings are words that start with the term without
  being its compound or inflection (for example `flóki` → `flókin`, `próf` → `prófaðu`). The rulings accept that
  rate. The exclusion list is the lever for a term that turns out worse.
- **Other books are unmeasured.** The rule applies to every book, but only chemistry was measured.
- **Tie options remove at a higher false rate:** 7.3–28.0% on the 232 tie-only removals of measurement 16. [USER]
  ruled them in (A2).

## 8. Calls made in this draft (for [USER] to check)

1. **The values live in a new module,** `server/lib/termPrefixRule.js`, with its own test, not in
   `server/constants.js`.
2. **Length is counted in code points** of the term text as stored.
3. **The rule applies to every book**, not only chemistry, as the rulings read.
4. **The exclusion matches the term text exactly**, case-insensitively, so `formerki` is not excluded. It applies
   wherever `merki` is a candidate, the tie options included.
5. **The acceptance test runs after deploy,** read-only on production, as measurement 14 did. Running it before
   deploy would need production's database on another machine.
6. **Each tie option qualifies on its own text.**
