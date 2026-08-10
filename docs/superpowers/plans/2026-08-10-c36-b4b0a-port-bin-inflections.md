# §C36 B4b-0a — Port `fetch_bin_inflections.py` to Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tools/fetch_bin_inflections.py` with a behaviour-identical Node CLI, so the script lands inside root `npm test` — the campaign's authoritative gate — with its inertness *measured* by a differential golden rather than asserted.

**Architecture:** Split the script in two. `tools/lib/bin-inflections.js` holds the three **pure** functions (CSV load, lookup, JSON encode) — pure because the golden captures exactly those, with no database. `tools/fetch-bin-inflections.js` is the CLI shell: argument parsing, SQL, reporting. The golden is captured from the **unmodified Python first**, in its own commit, and the Python is deleted **last**.

**Tech Stack:** Node 22 (`.nvmrc`), CommonJS (`tools/` convention), `better-sqlite3`, Vitest. Python 3 is needed for Task 1 only.

**Spec:** [`docs/superpowers/specs/2026-08-10-terminology-concept-model-part-b4b0-design.md`](../specs/2026-08-10-terminology-concept-model-part-b4b0-design.md) §1.1a. **Read it before starting.**

## Global Constraints

- **This PR changes NO behaviour.** Same input file (`tools/data/SHsnid.csv`), same target table (`terminology_translations`), same union-by-lowercased-lemma lookup, same `--execute` opt-in. Every logic change belongs to B4b-0b.
- **🔴 NEVER commit BÍN bytes.** `tools/data/` is gitignored (`.gitignore:56`). The golden stores **SHA-256 hashes**, never inflected forms. This repo is public.
- **🔴 `tools/` is MIT, `server/` is AGPL-3.0.** Do **not** import anything from `server/` — that would add a third MIT→AGPL edge requiring an update to root `LICENSE`. In particular **do not use `server/lib/dbPath.js`**.
- **Resolve paths against `__dirname`, never `process.cwd()`** (CLAUDE.md, durable).
- **Do NOT use `tools/lib/parseArgs.js`.** It **silently drops unknown flags** (CLAUDE.md, durable); Python's `argparse` exits **2** on them. Using it would be a behaviour regression.
- **Stream the CSV.** `SHsnid.csv` is **377 MB / 7,425,931 lines**. `readFileSync` is wrong.
- Run `npm test` from the **repo root**.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## The Python behaviour being preserved

Read `tools/fetch_bin_inflections.py` once before Task 2. The contract, verbatim from the source:

| # | behaviour | source |
|---|---|---|
| 1 | CSV split on `;` | `csv.reader(f, delimiter=";")` `:67` |
| 2 | skip rows with `len(row) < 5` | `:69` |
| 3 | `lemma = row[0].strip()`, `form = row[4].strip()` | `:71-72` |
| 4 | skip if either is empty | `:73` |
| 5 | `map[lemma.lower()]` is a **SET** — duplicate forms collapse | `:74` |
| 6 | lookup key is `word.lower().strip()` | `:87` |
| 7 | miss → **`None`**, never `[]` | `:91` |
| 8 | exclude the base form: `f.lower() != key` | `:94` |
| 9 | **`sorted(...)`** — Unicode **code-point** order | `:94` |
| 10 | empty result → **`None`**, never `[]` | `:95` |
| 11 | `json.dumps(forms, ensure_ascii=False)` | `:187` |
| 12 | SQL filters `NOT LIKE '% %'` and `IS NOT NULL` | `:147-149` |
| 13 | `--execute` opt-in; without it nothing is written | `:189` |
| 14 | missing CSV → 4-line help on stderr, `exit(1)` | `:128-135` |

⚠️ **Measured 2026-08-10 against the real `SHsnid.csv`: rows containing `"` = 0, rows with <5 fields = 0, rows with an empty lemma or form = 0, rows with stray whitespace = 0.** So behaviours **2, 3, 4** and the CSV-quoting difference between `csv.reader` and `split(';')` are **entirely unexercised by real data**. **The golden therefore CANNOT prove they were ported correctly** — they get unit tests with synthetic rows in Task 2. This is the plan's single most important structural point: *the differential golden covers the happy path; the guards need their own tests.*

---

## File Structure

**Create:**
- `tools/capture-bin-golden.py` — Task 1. Imports the **unmodified** Python and hashes its output. Deleted in Task 7.
- `tools/__tests__/fixtures/bin-golden-words.txt` — the word list. **Our own terminology; committable.**
- `tools/__tests__/fixtures/bin-golden-hashes.json` — `{word: sha256|null}`. **No BÍN bytes.**
- `tools/lib/bin-inflections.js` — the three pure functions.
- `tools/fetch-bin-inflections.js` — the CLI.
- `tools/__tests__/bin-inflections.test.js` — unit tests for the pure functions.
- `tools/__tests__/bin-inflections-golden.test.js` — the differential gate.
- `tools/__tests__/bin-inflections-cli.test.js` — CLI/SQL tests.

**Delete (Task 7, last):**
- `tools/fetch_bin_inflections.py`
- `tools/capture-bin-golden.py`

---

### Task 1: Capture the golden from the UNMODIFIED Python

⚠️ **This task MUST complete and commit before any Node file exists.** `capture-c24-golden.js` states the reason: *"Re-running it after the swap would certify the new implementation against itself and destroy the oracle. There is no observable difference between a correct golden and a worthless one."*

**Files:**
- Create: `tools/capture-bin-golden.py`
- Create: `tools/__tests__/fixtures/bin-golden-words.txt`
- Create: `tools/__tests__/fixtures/bin-golden-hashes.json`

**Interfaces:**
- Consumes: `tools/fetch_bin_inflections.py`'s `load_bin_data(path)` and `get_inflections(map, word)`; `tools/data/SHsnid.csv`.
- Produces: `bin-golden-hashes.json`, a JSON object mapping **word → `sha256(json.dumps(forms, ensure_ascii=False))`** or **`null`** when the Python returned `None`. Task 6 asserts against it.

- [ ] **Step 1: Export the word list from production**

The list must be the **full candidate set**, not the 7,278 that already carry inflections — those only exercise the success path.

```bash
ssh siggi@172.236.212.190 'cd ~/repos/namsbokasafn-efni/server && node -e "
const D=require(\"better-sqlite3\");const p=require(\"./lib/dbPath\");
const db=new D(p(),{readonly:true});
for(const r of db.prepare(\"SELECT DISTINCT icelandic FROM terminology_translations WHERE icelandic IS NOT NULL ORDER BY icelandic\").all())
  console.log(r.icelandic);
db.close();"' > tools/__tests__/fixtures/bin-golden-words.txt
wc -l tools/__tests__/fixtures/bin-golden-words.txt
```

Expected: ~20,000 lines. **Read-only; nothing is written to production.**

⚠️ **Prod is `siggi@172.236.212.190`, repo `~/repos/namsbokasafn-efni` — that address lives in shell history, not `~/.ssh/config`.** If you cannot reach prod, any database with a populated `terminology_translations` works; the local dev DB does **not** (it holds 6 rows, which would give a golden with almost no coverage). **Do not substitute a short list to get moving** — a golden built on a handful of words passes trivially and certifies nothing. This file is committed once and never regenerated, so it is worth getting from the real corpus.

- [ ] **Step 2: Write the capture script**

```python
# tools/capture-bin-golden.py
"""
Captures the B4b-0a differential golden from the UNMODIFIED Python implementation.

⚠️ MUST be run BEFORE tools/fetch-bin-inflections.js exists. Re-running it after
the port would certify the new implementation against itself and destroy the
oracle — there is no observable difference between a correct golden and a
worthless one. (Same rule as tools/../server/scripts/capture-c24-golden.js.)

⚠️ Stores SHA-256 HASHES, never the forms themselves: the values are BÍN-derived
(CC BY-SA) and this repository is public. A hash is fully discriminating for a
differential test and carries no BÍN bytes.

`null` means the Python returned None. That is DISTINCT from a hash of "[]" and
the distinction is load-bearing — see the port's getInflections.

Run: python3 tools/capture-bin-golden.py
Captured at commit: <FILL IN with `git rev-parse HEAD` before committing>
"""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fetch_bin_inflections import load_bin_data, get_inflections  # noqa: E402

CSV = HERE / "data" / "SHsnid.csv"
WORDS = HERE / "__tests__" / "fixtures" / "bin-golden-words.txt"
OUT = HERE / "__tests__" / "fixtures" / "bin-golden-hashes.json"

if not CSV.exists():
    sys.exit(f"REFUSING: {CSV} not found. Download SHsnid.csv first.")

inflection_map = load_bin_data(CSV)
words = [w for w in WORDS.read_text(encoding="utf-8").split("\n") if w != ""]
print(f"words: {len(words)}")

golden = {}
found = missing = 0
for w in words:
    forms = get_inflections(inflection_map, w)
    if forms is None:
        golden[w] = None
        missing += 1
    else:
        payload = json.dumps(forms, ensure_ascii=False)
        golden[w] = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        found += 1

OUT.write_text(json.dumps(golden, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
               encoding="utf-8")
print(f"  found: {found}\n  not in BÍN (null): {missing}")

# A golden with no misses would never exercise the None path; one with no hits
# proves nothing at all. Both are worthless in different directions.
if found == 0 or missing == 0:
    sys.exit("REFUSING: a golden with zero hits or zero misses proves nothing.")
```

- [ ] **Step 3: Run the capture**

Run: `python3 tools/capture-bin-golden.py`

Expected: prints `words: ~20000`, then a non-zero `found` **and** a non-zero `not in BÍN`, and exits 0. If it exits with the REFUSING message, stop — the golden is worthless and the port cannot be verified.

- [ ] **Step 4: Verify no BÍN forms leaked into the golden**

```bash
grep -c '"[0-9a-f]\{64\}"' tools/__tests__/fixtures/bin-golden-hashes.json
python3 -c "
import json,re
g=json.load(open('tools/__tests__/fixtures/bin-golden-hashes.json'))
bad=[k for k,v in g.items() if v is not None and not re.fullmatch(r'[0-9a-f]{64}',v)]
print('non-hash values:',len(bad))
assert not bad, bad[:5]
print('OK — every non-null value is a bare SHA-256')
"
```

Expected: `non-hash values: 0` and `OK`. **This is the licence gate: a value that is not a 64-hex-char string would mean BÍN text is about to be committed.**

- [ ] **Step 5: Fill in the capture commit sha and commit**

Put the current `git rev-parse HEAD` into the docstring's `Captured at commit:` line, then:

```bash
git add tools/capture-bin-golden.py tools/__tests__/fixtures/bin-golden-words.txt tools/__tests__/fixtures/bin-golden-hashes.json
git commit -m "$(cat <<'EOF'
test(B4b-0a): capture the differential golden from the UNMODIFIED Python

The port's inertness has to be measurable, not asserted. get_inflections is a
pure function of (SHsnid, word), so its output is capturable over a fixed word
list with no database at all.

Captured BEFORE any Node exists, deliberately: re-running this after the port
would certify the new implementation against itself, and there is no observable
difference between a correct golden and a worthless one.

Hashes, not forms — the values are BIN-derived CC BY-SA and this repo is public.
null is kept distinct from a hash of "[]", because the Python returns None in two
places where an empty list would be the easy mistake.

The word list is the FULL candidate set, not the 7,278 that already carry
inflections; those are exactly the words the Python already resolved, so a golden
built on them would be blind to the not-found path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `loadBinData` — the streaming CSV loader

**Files:**
- Create: `tools/lib/bin-inflections.js`
- Create: `tools/__tests__/bin-inflections.test.js`

**Interfaces:**
- Produces: `loadBinData(csvPath) → Promise<Map<string, Set<string>>>`, keyed on `lemma.toLowerCase()`. Tasks 3 and 6 consume it.

- [ ] **Step 1: Write the failing tests**

```javascript
// tools/__tests__/bin-inflections.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, expect, beforeAll, afterAll } = require('vitest');
const { loadBinData } = require('../lib/bin-inflections');

let dir;
const write = (name, body) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body, 'utf-8');
  return p;
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-inf-'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('loadBinData', () => {
  it('groups forms by lowercased lemma', async () => {
    const p = write('a.csv', 'Zafl;9001;kk;alm;zafli;X\nzafl;9002;hk;alm;zaflið;Y\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')].sort()).toEqual(['afli', 'aflið']);
  });

  // GUARD — unexercised by the real file (0 such rows measured 2026-08-10),
  // so the golden cannot cover it. Python: `if len(row) < 5: continue`.
  it('skips rows with fewer than 5 fields', async () => {
    const p = write('b.csv', 'zafl;9001;kk;alm\nzafl;9001;kk;alm;zafli;X\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afli']);
  });

  // GUARD — Python: `if lemma and form`.
  it('skips rows whose lemma or form is empty', async () => {
    const p = write('c.csv', ';9001;kk;alm;zafli;X\nzafl;9001;kk;alm;;X\nzafl;9001;kk;alm;zafls;X\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afls']);
  });

  // GUARD — Python: `.strip()` on both.
  it('trims whitespace around lemma and form', async () => {
    const p = write('d.csv', '  zafl  ;9001;kk;alm;  zafli  ;X\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afli']);
  });

  // Python stores a SET, so duplicates collapse.
  it('deduplicates identical forms', async () => {
    const p = write('e.csv', 'zafl;9001;kk;alm;zafli;X\nzafl;9002;hk;alm;zafli;Y\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afli']);
  });

  it('tolerates a missing trailing newline', async () => {
    const p = write('f.csv', 'zafl;9001;kk;alm;zafli;X');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afli']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/bin-inflections.test.js`
Expected: FAIL — `Cannot find module '../lib/bin-inflections'`

- [ ] **Step 3: Implement `loadBinData`**

```javascript
// tools/lib/bin-inflections.js
/**
 * BÍN inflection lookup — the pure half of tools/fetch-bin-inflections.js.
 *
 * ⚠️ PORTED FROM tools/fetch_bin_inflections.py AND DELIBERATELY BEHAVIOUR-
 * IDENTICAL TO IT (register §C36 B4b-0a). Every quirk below is the Python's
 * quirk and is pinned by tools/__tests__/bin-inflections-golden.test.js, whose
 * oracle was captured from the Python before this file existed. If you are
 * tempted to "clean up" something here, that is B4b-0b's job, not this file's.
 *
 * ⚠️ NO `require` OF ANYTHING UNDER server/. tools/ is MIT, server/ is AGPL-3.0,
 * and root LICENSE enumerates the (deliberate) edges between them. Do not add one.
 *
 * BÍN data: Beygingarlýsing íslensks nútímamáls. Stofnun Árna Magnússonar í
 * íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir.
 * https://bin.arnastofnun.is — CC BY-SA 4.0. Forms are SELECTED and SUBSETTED
 * (the base form is removed), i.e. modified.
 */
const fs = require('fs');
const readline = require('readline');

/**
 * Load SHsnid.csv into `lemma.toLowerCase() → Set<form>`.
 *
 * ⚠️ STREAMED. The real file is ~377 MB / 7,425,931 lines; readFileSync would
 * be both slow and close to Node's string limit.
 *
 * ⚠️ A PLAIN `split(';')`, NOT A CSV PARSER. Python used csv.reader, which
 * treats `"` as a quote character — but the real file contains ZERO double
 * quotes (measured 2026-08-10), so the two agree on every row that exists.
 * Splitting keeps this dependency-free; if a future BÍN release introduces
 * quoting, this is the line that has to change.
 *
 * @param {string} csvPath
 * @returns {Promise<Map<string, Set<string>>>}
 */
async function loadBinData(csvPath) {
  const map = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line === '') continue;
    const row = line.split(';');
    if (row.length < 5) continue; // Python: `if len(row) < 5: continue`
    const lemma = row[0].trim();
    const form = row[4].trim();
    if (!lemma || !form) continue; // Python: `if lemma and form`
    const key = lemma.toLowerCase();
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(form); // a SET, so duplicates collapse — as in Python
  }
  return map;
}

module.exports = { loadBinData };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/bin-inflections.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/bin-inflections.js tools/__tests__/bin-inflections.test.js
git commit -m "$(cat <<'EOF'
feat(B4b-0a): loadBinData — the streaming CSV loader, guards included

Four of the Python's guards (short row, empty lemma, empty form, stray
whitespace) match ZERO rows in the real SHsnid.csv, measured 2026-08-10. The
differential golden therefore cannot prove they were ported, which is exactly
why they get unit tests with synthetic rows instead.

Streamed rather than read whole: 377 MB, 7.4M lines. Split on ';' rather than a
CSV parser because the real file contains zero double quotes, so csv.reader and
split agree on every row that exists — noted in the code as the line to change
if that ever stops being true.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `getInflections` — the lookup

**Files:**
- Modify: `tools/lib/bin-inflections.js`
- Modify: `tools/__tests__/bin-inflections.test.js`

**Interfaces:**
- Consumes: `loadBinData`'s `Map<string, Set<string>>`.
- Produces: `getInflections(map, word) → string[] | null`. **`null`, never `[]`.** Tasks 5 and 6 consume it.

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/bin-inflections.test.js`:

```javascript
const { getInflections } = require('../lib/bin-inflections');

describe('getInflections', () => {
  const map = new Map([
    ['afl', new Set(['afl', 'afli', 'afls', 'öfl', 'Afl'])],
    ['bara', new Set(['bara'])],
  ]);

  it('returns the forms with the base form removed', () => {
    expect(getInflections(map, 'afl')).toEqual(['afli', 'afls', 'öfl']);
  });

  it('matches case-insensitively on the lookup key', () => {
    expect(getInflections(map, 'AFL')).toEqual(['afli', 'afls', 'öfl']);
  });

  it('removes every case variant of the base form, not just the exact one', () => {
    // Python: `f.lower() != key` — so 'Afl' is dropped alongside 'afl'.
    expect(getInflections(map, 'afl')).not.toContain('Afl');
  });

  // ⚠️ null, NOT []. Both callers branch on it.
  it('returns null for a word BÍN does not have', () => {
    expect(getInflections(map, 'kjarnsækir')).toBeNull();
  });

  it('returns null when the only form IS the base form', () => {
    expect(getInflections(map, 'bara')).toBeNull();
  });

  it('trims the incoming word', () => {
    expect(getInflections(map, '  afl  ')).toEqual(['afli', 'afls', 'öfl']);
  });

  // ⚠️ CODE-POINT ORDER, matching Python's sorted(). localeCompare would put
  // 'öfl' before 'z' under Icelandic collation; code-point order does not.
  it('sorts by code point, NOT by locale', () => {
    const m = new Map([['x', new Set(['zzz', 'öfl', 'afli'])]]);
    expect(getInflections(m, 'x')).toEqual(['afli', 'zzz', 'öfl']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/bin-inflections.test.js -t getInflections`
Expected: FAIL — `getInflections is not a function`

- [ ] **Step 3: Implement `getInflections`**

Add to `tools/lib/bin-inflections.js`, and extend the export.

```javascript
/**
 * All inflected forms of `word`, base form excluded.
 *
 * ⚠️ RETURNS `null`, NEVER `[]` — in BOTH the not-found case and the
 * only-the-base-form case. Python returns None in both (`:91`, `:95`) and the
 * CLI branches on truthiness, so an empty array would silently become a written
 * `"[]"` where the Python wrote nothing at all.
 *
 * ⚠️ SORTED BY CODE POINT, matching Python's `sorted()`. A default JS
 * `Array.prototype.sort()` compares UTF-16 code units, which equals code-point
 * order for the BMP — and every Icelandic character is BMP. DO NOT use
 * `localeCompare`: under Icelandic collation `ö` sorts after `z`, which would
 * reorder ~every paradigm containing an accented character and break the golden.
 *
 * @param {Map<string, Set<string>>} map from loadBinData
 * @param {string} word
 * @returns {string[]|null}
 */
function getInflections(map, word) {
  const key = word.toLowerCase().trim(); // Python: `word.lower().strip()`
  const forms = map.get(key);
  if (!forms || forms.size === 0) return null;
  const result = [...forms].filter((f) => f.toLowerCase() !== key).sort();
  return result.length > 0 ? result : null;
}

module.exports = { loadBinData, getInflections };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/bin-inflections.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/bin-inflections.js tools/__tests__/bin-inflections.test.js
git commit -m "$(cat <<'EOF'
feat(B4b-0a): getInflections — null-not-empty, and code-point sort

Two Python behaviours that a rewrite loses silently. It returns None in TWO
places — word absent, and only-the-base-form-present — and the caller branches on
truthiness, so an empty array would become a written "[]" where the Python wrote
nothing.

And sorted() is code-point order. Default JS sort compares UTF-16 code units,
which equals code-point order across the BMP, and every Icelandic character is
BMP. localeCompare would NOT: Icelandic collation puts o-umlaut after z, which
would reorder nearly every accented paradigm and break the golden. Pinned by a
test that fails under locale collation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `formatInflectionsJson` — Python-compatible encoding

**Files:**
- Modify: `tools/lib/bin-inflections.js`
- Modify: `tools/__tests__/bin-inflections.test.js`

**Interfaces:**
- Produces: `formatInflectionsJson(forms) → string`. Tasks 5 and 6 consume it.

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/bin-inflections.test.js`:

```javascript
const { formatInflectionsJson } = require('../lib/bin-inflections');

describe('formatInflectionsJson', () => {
  // ⚠️ THE WHOLE POINT: json.dumps separates with ", " and JSON.stringify with ",".
  // Production rows confirm the spaced form, e.g. ["afla", "aflana", ...].
  it('separates items with a comma AND a space, like json.dumps', () => {
    expect(formatInflectionsJson(['a', 'b'])).toBe('["a", "b"]');
  });

  it('does NOT produce JSON.stringify output', () => {
    expect(formatInflectionsJson(['a', 'b'])).not.toBe(JSON.stringify(['a', 'b']));
  });

  // ensure_ascii=False -> raw characters, not \uXXXX escapes.
  it('emits non-ASCII raw', () => {
    expect(formatInflectionsJson(['öfl', 'aflið'])).toBe('["öfl", "aflið"]');
  });

  it('escapes quotes and backslashes as JSON requires', () => {
    expect(formatInflectionsJson(['a"b', 'c\\d'])).toBe('["a\\"b", "c\\\\d"]');
  });

  it('round-trips through JSON.parse', () => {
    const forms = ['öfl', 'a"b'];
    expect(JSON.parse(formatInflectionsJson(forms))).toEqual(forms);
  });

  it('renders a single item without a separator', () => {
    expect(formatInflectionsJson(['a'])).toBe('["a"]');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/bin-inflections.test.js -t formatInflectionsJson`
Expected: FAIL — `formatInflectionsJson is not a function`

- [ ] **Step 3: Implement it**

Add to `tools/lib/bin-inflections.js` and extend the export.

```javascript
/**
 * Encode exactly as Python's `json.dumps(forms, ensure_ascii=False)` does.
 *
 * ⚠️ THE SEPARATOR IS `", "`, NOT `","`. Python's json.dumps defaults to
 * `separators=(', ', ': ')`; JSON.stringify emits no space. Production rows are
 * in the spaced form — e.g. ["afla", "aflana", "aflanna", ...] — so a plain
 * JSON.stringify here would change the bytes of every value the script has ever
 * written, while still parsing identically. That is precisely the class of
 * difference the differential golden exists to catch.
 *
 * Per-item JSON.stringify already matches ensure_ascii=False: it emits non-ASCII
 * raw and escapes `"` and `\` the same way Python does.
 *
 * @param {string[]} forms
 * @returns {string}
 */
function formatInflectionsJson(forms) {
  return '[' + forms.map((f) => JSON.stringify(f)).join(', ') + ']';
}

module.exports = { loadBinData, getInflections, formatInflectionsJson };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/bin-inflections.test.js`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/bin-inflections.js tools/__tests__/bin-inflections.test.js
git commit -m "$(cat <<'EOF'
feat(B4b-0a): formatInflectionsJson — json.dumps uses ", ", JSON.stringify does not

Python's json.dumps defaults to separators=(', ', ': '); JSON.stringify emits no
space. Production rows are in the spaced form — ["afla", "aflana", ...] — so a
plain JSON.stringify would change the bytes of every value this script has ever
written while still parsing identically.

A difference that survives JSON.parse but not a byte comparison is exactly what
the differential golden is for, and exactly what a reviewer reading the diff
would not notice.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The CLI

**Files:**
- Create: `tools/fetch-bin-inflections.js`
- Create: `tools/__tests__/bin-inflections-cli.test.js`

**Interfaces:**
- Consumes: `loadBinData(csvPath)`, `getInflections(map, word)`, `formatInflectionsJson(forms)` from `tools/lib/bin-inflections.js`.
- Produces, all exported for test:
  - `parseArgs(argv) → {db: string, binData: string, execute: boolean, limit: number, force: boolean, help?: boolean}` — **throws** on an unknown flag or a missing value.
  - `selectSql({force: boolean, limit: number}) → string`
  - `main(argv) → Promise<void>`

⚠️ `better-sqlite3` is `require`d **inside `main()`**, not at module top level, so the test file can import `parseArgs`/`selectSql` without opening any database. Keep it that way.

- [ ] **Step 1: Write the failing tests**

```javascript
// tools/__tests__/bin-inflections-cli.test.js
const { describe, it, expect } = require('vitest');
const { parseArgs, selectSql } = require('../fetch-bin-inflections');

describe('parseArgs', () => {
  it('defaults to dry-run', () => {
    expect(parseArgs([]).execute).toBe(false);
  });

  it('accepts --execute', () => {
    expect(parseArgs(['--execute']).execute).toBe(true);
  });

  it('reads --db and --bin-data as the NEXT argument', () => {
    const a = parseArgs(['--db', '/tmp/x.db', '--bin-data', '/tmp/y.csv']);
    expect(a.db).toBe('/tmp/x.db');
    expect(a.binData).toBe('/tmp/y.csv');
  });

  it('parses --limit as a number', () => {
    expect(parseArgs(['--limit', '50']).limit).toBe(50);
  });

  // ⚠️ argparse EXITS on an unknown flag. tools/lib/parseArgs.js silently drops
  // it (CLAUDE.md, durable) — using that helper here would be a regression.
  it('THROWS on an unknown flag rather than ignoring it', () => {
    expect(() => parseArgs(['--output-dir', '/tmp'])).toThrow(/unrecognised/i);
  });

  // The value-swallow bug B0 found in the sibling scripts.
  it('refuses a flag as the value of another flag', () => {
    expect(() => parseArgs(['--db', '--execute'])).toThrow(/expects a value/i);
  });
});

describe('selectSql', () => {
  it('filters to rows lacking inflections by default', () => {
    expect(selectSql({ force: false, limit: 0 })).toContain('t.inflections IS NULL');
  });

  it('drops that filter under --force', () => {
    const sql = selectSql({ force: true, limit: 0 });
    expect(sql).toContain('1=1');
    expect(sql).not.toContain('t.inflections IS NULL');
  });

  // Both filters are unconditional in the Python.
  it('always excludes multi-word and NULL icelandic', () => {
    for (const force of [true, false]) {
      const sql = selectSql({ force, limit: 0 });
      expect(sql).toContain("t.icelandic NOT LIKE '% %'");
      expect(sql).toContain('t.icelandic IS NOT NULL');
    }
  });

  it('adds LIMIT only when limit is non-zero', () => {
    expect(selectSql({ force: false, limit: 0 })).not.toContain('LIMIT');
    expect(selectSql({ force: false, limit: 5 })).toContain('LIMIT 5');
  });

  it('orders by t.id for a deterministic --limit slice', () => {
    expect(selectSql({ force: false, limit: 0 })).toContain('ORDER BY t.id');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/bin-inflections-cli.test.js`
Expected: FAIL — `Cannot find module '../fetch-bin-inflections'`

- [ ] **Step 3: Implement the CLI**

```javascript
// tools/fetch-bin-inflections.js
/**
 * Populate terminology_translations.inflections from BÍN.
 *
 * ⚠️ A BEHAVIOUR-IDENTICAL PORT of tools/fetch_bin_inflections.py (§C36 B4b-0a).
 * It changes nothing: same input file, same table, same lookup, same dry-run
 * default. The pos-aware rewrite and the move to concept_term are B4b-0b.
 *
 * Usage:
 *   node tools/fetch-bin-inflections.js                    # dry run
 *   node tools/fetch-bin-inflections.js --execute
 *   node tools/fetch-bin-inflections.js --execute --limit 50
 *
 * BÍN data: Beygingarlýsing íslensks nútímamáls. Stofnun Árna Magnússonar í
 * íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir.
 * https://bin.arnastofnun.is — CC BY-SA 4.0; the forms are modified (selected
 * and subsetted).
 */
const fs = require('fs');
const path = require('path');
const { loadBinData, getInflections, formatInflectionsJson } = require('./lib/bin-inflections');

// ⚠️ __dirname, never process.cwd() (CLAUDE.md, durable). The server runs with
// cwd=server/ and the cron from the repo root; a cwd-relative default silently
// points at a different tree.
//
// ⚠️ AND NOT server/lib/dbPath.js. tools/ is MIT and server/ is AGPL-3.0; root
// LICENSE enumerates the deliberate edges and this must not become another one.
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DB = path.join(REPO_ROOT, 'pipeline-output', 'sessions.db');
const DEFAULT_BIN = path.join(__dirname, 'data', 'SHsnid.csv');

const USAGE = `Usage: node tools/fetch-bin-inflections.js [--db <path>] [--bin-data <path>]
                                          [--execute] [--limit <n>] [--force]

  --db <path>        SQLite database (default: ${DEFAULT_DB})
  --bin-data <path>  SHsnid.csv (default: ${DEFAULT_BIN})
  --execute          actually write. WITHOUT THIS NOTHING IS WRITTEN.
  --limit <n>        process at most n translations (0 = all)
  --force            re-fetch even for rows that already have inflections`;

/**
 * ⚠️ HAND-ROLLED, AND NOT tools/lib/parseArgs.js — DELIBERATELY.
 * That helper SILENTLY DROPS UNKNOWN FLAGS (CLAUDE.md, durable), so a
 * misremembered flag becomes a no-op and the tool runs at full strength with its
 * defaults. Python's argparse exits on an unknown flag, so silently dropping
 * would be a behaviour change in the one direction that matters.
 */
function parseArgs(argv) {
  const out = { db: DEFAULT_DB, binData: DEFAULT_BIN, execute: false, limit: 0, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const takesValue = a === '--db' || a === '--bin-data' || a === '--limit';
    if (takesValue) {
      const v = argv[i + 1];
      // Do not swallow the next flag as a value (B0's finding in the siblings).
      if (v === undefined || v.startsWith('--')) {
        throw new Error(`${a} expects a value, got ${v === undefined ? 'nothing' : `'${v}'`}`);
      }
      if (a === '--db') out.db = v;
      else if (a === '--bin-data') out.binData = v;
      else out.limit = Number(v);
      i++;
    } else if (a === '--execute') out.execute = true;
    else if (a === '--force') out.force = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else throw new Error(`unrecognised argument '${a}'\n\n${USAGE}`);
  }
  return out;
}

/** The Python's SELECT, assembled the same way. */
function selectSql({ force, limit }) {
  const where = [
    force ? '1=1' : 't.inflections IS NULL',
    "t.icelandic NOT LIKE '% %'", // BÍN handles single words
    't.icelandic IS NOT NULL',
  ].join(' AND ');
  return `
        SELECT t.id, t.icelandic, t.headword_id, h.english
        FROM terminology_translations t
        JOIN terminology_headwords h ON h.id = t.headword_id
        WHERE ${where}
        ORDER BY t.id
        ${limit ? `LIMIT ${limit}` : ''}`;
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!fs.existsSync(args.binData)) {
    console.error(`Error: BÍN data file not found: ${args.binData}`);
    console.error('\nTo use this tool:');
    console.error('  1. Visit https://bin.arnastofnun.is/gogn/mimisbrunnur/');
    console.error('  2. Accept the CC BY-SA 4.0 license');
    console.error('  3. Download SHsnid.csv');
    console.error(`  4. Place it at: ${DEFAULT_BIN}`);
    process.exit(1);
  }

  console.log(`Loading BÍN data from ${args.binData}...`);
  const map = await loadBinData(args.binData);
  console.log(`  Loaded inflection records for ${map.size.toLocaleString()} lemmas`);

  const Database = require('better-sqlite3');
  const db = new Database(args.db);
  const rows = db.prepare(selectSql(args)).all();
  console.log(`\nFound ${rows.length} translations to process`);
  if (!args.execute) console.log('*** DRY RUN — add --execute to write to database ***\n');

  const update = db.prepare('UPDATE terminology_translations SET inflections = ? WHERE id = ?');
  const stats = { processed: 0, found: 0, notFound: 0 };
  const apply = db.transaction((list) => {
    for (const [i, row] of list.entries()) {
      const forms = getInflections(map, row.icelandic);
      stats.processed++;
      if (forms) {
        stats.found++;
        if (args.execute) update.run(formatInflectionsJson(forms), row.id);
        if (i < 20) console.log(`  ✓ ${row.icelandic} (${row.english}): ${forms.length} forms`);
      } else {
        stats.notFound++;
        if (i < 20) console.log(`  – ${row.icelandic} (${row.english}): not in BÍN`);
      }
    }
  });
  apply(rows);

  console.log(args.execute ? `\n✓ Changes committed to ${args.db}` : '\n*** DRY RUN — no changes written ***');
  db.close();

  const rate = stats.processed ? (stats.found / stats.processed) * 100 : 0;
  console.log('\n--- Inflection Summary ---');
  console.log(`  Processed: ${stats.processed}`);
  console.log(`  Found in BÍN: ${stats.found}`);
  console.log(`  Not in BÍN: ${stats.notFound}`);
  console.log(`  Hit rate: ${rate.toFixed(1)}%`);
  if (!args.execute && stats.found) {
    console.log(`\n  Add --execute to apply ${stats.found} inflection updates`);
  }
}

module.exports = { parseArgs, selectSql, main };

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/bin-inflections-cli.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Verify the dry-run default against a throwaway database**

```bash
node -e "
const D=require('better-sqlite3'); const db=new D('/tmp/b4b0a-check.db');
db.exec(\`CREATE TABLE terminology_headwords (id INTEGER PRIMARY KEY, english TEXT, pos TEXT);
CREATE TABLE terminology_translations (id INTEGER PRIMARY KEY, headword_id INTEGER, icelandic TEXT, inflections TEXT);
INSERT INTO terminology_headwords (id,english) VALUES (1,'power');
INSERT INTO terminology_translations (id,headword_id,icelandic) VALUES (1,1,'afl');\`);
db.close();"
node tools/fetch-bin-inflections.js --db /tmp/b4b0a-check.db
node -e "
const D=require('better-sqlite3'); const db=new D('/tmp/b4b0a-check.db',{readonly:true});
const r=db.prepare('SELECT inflections FROM terminology_translations WHERE id=1').get();
console.log('after DRY RUN, inflections =', r.inflections);
if (r.inflections !== null) { console.error('FAIL: dry run wrote to the database'); process.exit(1); }
console.log('OK — dry run wrote nothing');"
```

Expected: reports `1 translations to process`, a `✓ afl (power): N forms` line, and then **`OK — dry run wrote nothing`**. ⚠️ **If it writes, stop** — the single most important safety property has regressed.

- [ ] **Step 6: Commit**

```bash
rm -f /tmp/b4b0a-check.db
git add tools/fetch-bin-inflections.js tools/__tests__/bin-inflections-cli.test.js
git commit -m "$(cat <<'EOF'
feat(B4b-0a): the CLI — strict args, dry-run default, no server/ import

Argument parsing is hand-rolled and deliberately NOT tools/lib/parseArgs.js: that
helper silently drops unknown flags, and Python's argparse exits on them. Silently
dropping would be a behaviour change in the one direction that matters — a
misremembered flag becoming a no-op while the tool runs at full strength. It also
refuses to swallow a following flag as a value, which is B0's finding in the
sibling scripts.

The DB path resolves against __dirname rather than cwd, and deliberately does NOT
use server/lib/dbPath.js: tools/ is MIT and server/ is AGPL-3.0, and root LICENSE
enumerates the deliberate edges between them. This must not become another one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The differential gate

**Files:**
- Create: `tools/__tests__/bin-inflections-golden.test.js`

**Interfaces:**
- Consumes: `bin-golden-words.txt`, `bin-golden-hashes.json` (Task 1); `loadBinData`, `getInflections`, `formatInflectionsJson`.

- [ ] **Step 1: Write the differential test**

```javascript
// tools/__tests__/bin-inflections-golden.test.js
/**
 * THE INERTNESS PROOF for §C36 B4b-0a.
 *
 * The golden was captured from the UNMODIFIED Python before this port existed
 * (see tools/capture-bin-golden.py in the capture commit). It stores a SHA-256
 * per word, never the forms — the values are BÍN-derived CC BY-SA and this repo
 * is public.
 *
 * ⚠️ SKIPS when tools/data/SHsnid.csv is absent, because that file is gitignored
 * and CI does not have it. A skip is NOT a pass: the run prints why, and the
 * gate is only meaningful on a box that has the CSV. Re-download it from
 * https://bin.arnastofnun.is/gogn/mimisbrunnur/ before trusting a green run here.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { describe, it, expect } = require('vitest');
const { loadBinData, getInflections, formatInflectionsJson } = require('../lib/bin-inflections');

const CSV = path.join(__dirname, '..', 'data', 'SHsnid.csv');
const WORDS = path.join(__dirname, 'fixtures', 'bin-golden-words.txt');
const HASHES = path.join(__dirname, 'fixtures', 'bin-golden-hashes.json');
const haveCsv = fs.existsSync(CSV);

describe.skipIf(!haveCsv)('B4b-0a differential golden', () => {
  it('reproduces the Python byte-for-byte on every word', async () => {
    const golden = JSON.parse(fs.readFileSync(HASHES, 'utf-8'));
    const words = fs.readFileSync(WORDS, 'utf-8').split('\n').filter((w) => w !== '');
    const map = await loadBinData(CSV);

    const mismatches = [];
    let hits = 0;
    let misses = 0;
    for (const w of words) {
      const forms = getInflections(map, w);
      const actual = forms === null ? null : crypto.createHash('sha256')
        .update(formatInflectionsJson(forms), 'utf-8').digest('hex');
      if (actual === null) misses++;
      else hits++;
      if (actual !== golden[w]) {
        mismatches.push(`${w}: expected ${golden[w]}, got ${actual}`);
      }
    }

    // ⚠️ THE CONTROLS. A run where everything returned null would produce zero
    // mismatches against a golden that was also all-null, and prove nothing.
    // Assert the shape of the work, not only its agreement.
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
    expect(words.length).toBeGreaterThan(1000);

    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  }, 300000);

  it('distinguishes null from an empty list in the golden itself', () => {
    const golden = JSON.parse(fs.readFileSync(HASHES, 'utf-8'));
    const emptyHash = crypto.createHash('sha256').update('[]', 'utf-8').digest('hex');
    // The Python never emits "[]" — it returns None instead. If the golden
    // contains that hash, the capture was wrong and this gate is worthless.
    expect(Object.values(golden)).not.toContain(emptyHash);
  });
});

it('records whether the differential gate actually ran', () => {
  if (!haveCsv) {
    console.warn(
      '\n⚠️  B4b-0a differential golden SKIPPED — tools/data/SHsnid.csv is absent.\n' +
        '   This is NOT a pass. The port is unverified on this box.\n'
    );
  }
  expect(true).toBe(true);
});
```

- [ ] **Step 2: Run the differential gate**

Run: `npx vitest run tools/__tests__/bin-inflections-golden.test.js`

Expected on a box with the CSV: **PASS**, taking ~30–90 s (it streams 377 MB).

⚠️ **If it FAILS, the port is not behaviour-preserving.** The message names the first ten mismatching words. Check, in this order: the `", "` separator (Task 4), the sort comparator (Task 3 — did `localeCompare` creep in?), then `null` vs `[]`.

- [ ] **Step 3: Deliberately break it, to prove the gate discriminates**

A gate that cannot fail is not a gate. Temporarily change `formatInflectionsJson`'s `join(', ')` to `join(',')`:

Run: `npx vitest run tools/__tests__/bin-inflections-golden.test.js`
Expected: **FAIL**, with thousands of mismatches.

**Then revert the change** and re-run to confirm PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/__tests__/bin-inflections-golden.test.js
git commit -m "$(cat <<'EOF'
test(B4b-0a): the differential gate — the port is inert, measured

Replays every word in the golden through the Node implementation and compares
SHA-256 per word against the capture taken from the unmodified Python.

Carries its own controls, because agreement alone proves nothing: a run where
every lookup returned null would agree perfectly with an all-null golden. So the
test asserts a non-zero hit count, a non-zero miss count, and a word list of real
size — then asserts zero mismatches.

Also asserts the golden contains no hash of "[]": the Python returns None where an
empty list would be the easy mistake, so that hash appearing would mean the
capture itself was wrong and this gate was worthless.

Skips loudly when SHsnid.csv is absent, since it is gitignored and CI has no copy.
A skip is not a pass and says so.

Verified to discriminate by breaking the separator on purpose and watching it go
red before reverting.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Delete the Python, and update the docs

⚠️ **LAST, on purpose.** Deleting the Python destroys the golden's producer. Doing it here means the whole port was developed against a producer still in the tree, and `git show <capture-sha>` recovers it afterwards.

**Files:**
- Delete: `tools/fetch_bin_inflections.py`, `tools/capture-bin-golden.py`
- Modify: `docs/superpowers/specs/2026-08-10-terminology-concept-model-part-b4b0-design.md`
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md`

- [ ] **Step 1: Confirm nothing references the Python**

```bash
grep -rn "fetch_bin_inflections" --include="*.js" --include="*.json" --include="*.yml" --include="*.sh" . | grep -v node_modules | grep -v '^./docs/'
```

Expected: **no output.** Any hit must be updated before deleting. (Documentation hits are fine and are handled in Step 3.)

- [ ] **Step 2: Delete both Python scripts**

```bash
git rm tools/fetch_bin_inflections.py tools/capture-bin-golden.py
```

- [ ] **Step 3: Correct the spec's test-location claim**

The spec's §6.0 says *"tests are Vitest under `server/__tests__/`"*. **That is wrong** — this is a `tools/` script, and `tools/__tests__/` is the established home (it already holds ~30 test files). Replace that clause with exactly:

```markdown
tests are Vitest under `tools/__tests__/` — the established home for `tools/`
scripts — so they run in `npm test` and in CI's `test` job with no new surface.
⚠️ `vitest.config.js` sets `fileParallelism: false` globally, so they run
sequentially with everything else; the golden's ~30–90 s CSV stream is additive
to total suite time, not hidden by parallelism.
```

- [ ] **Step 4: Run the FULL suite from the repo root**

Run: `npm test`

Expected: PASS. ⚠️ **This is the authoritative gate and the entire reason for the port** — before B4b-0a, a green `npm test` said nothing about this script.

Record the file and test counts printed. Do **not** copy them into any document (CLAUDE.md § One source of truth: no prose holds a test count).

- [ ] **Step 5: Run lint and format, as CI does**

Run: `npm run lint && npm run format:check`

Expected: both PASS. ⚠️ `npm run lint` alone is **not** the Lint job — CI also runs `format:check` (CLAUDE.md, durable).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(B4b-0a): delete the Python — the port is verified and inert

Deleted LAST on purpose: removing it destroys the golden's producer, so the whole
port was developed against a producer still in the tree, and git show at the
capture commit recovers it.

The port is now covered by root npm test, which is the entire point of B4b-0a —
before this, the campaign's authoritative gate said nothing about this script.

Also corrects the spec, which placed the tests under server/__tests__/; this is a
tools/ script and tools/__tests__/ is the established home.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Update the register**

Add this as a new sub-bullet under §C36's B4b-0 entry, filling in the two shas. **Follow the register's own rules — no test counts, no green/red verdict; the Actions tab owns gate status and `npm test` owns the number.**

```markdown
      - **✅ B4b-0a IS IMPLEMENTED — the port is inert, and that is MEASURED.** `tools/fetch_bin_inflections.py` → `tools/fetch-bin-inflections.js` + `tools/lib/bin-inflections.js`; the Python is deleted. **The differential golden was captured from the UNMODIFIED Python at `<CAPTURE-SHA>`, before any Node existed** — `git show <CAPTURE-SHA>` is the only surviving copy of the producer, since B4b-0a deletes it. Golden stores **SHA-256 per word, never forms** (BÍN is CC BY-SA and this repo is public); `null` is kept distinct from a hash of `"[]"`, which the Python never emits. ⚠️ **The gate SKIPS when `tools/data/SHsnid.csv` is absent** — it is gitignored, so **CI never runs it**; a green CI is not evidence the port is inert, and the run says so out loud. ⚠️ **Two Python behaviours a rewrite loses silently, both now pinned:** `json.dumps` separates with `", "` where `JSON.stringify` uses `","` (production rows are the spaced form, so a naive port rewrites every byte while still parsing), and `sorted()` is **code-point** order — a later "improvement" to `localeCompare` puts `ö` after `z` under Icelandic collation and breaks every accented paradigm. ⚠️ **The golden covers the happy path ONLY:** `loadBinData`'s four guards (short row, empty lemma, empty form, stray whitespace) match **zero** rows in the real CSV, so unit tests are their only cover. **▶ NEXT IS B4b-0b**, which still needs the scratch-DB corpus rebuild.
```

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "$(cat <<'EOF'
docs(register): B4b-0a is implemented — the port is inert, measured

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Before opening the PR

Per the campaign's process (project memory, ⏩ ACTIVE RESUME):

- [ ] **Whole-branch adversarial review** — run it as a **blind pair** (the B1/B3/B4a precedent: each reviewer found a real defect the other missed, ~4/17 overlap). Give each reviewer the spec and the diff, and ask for a *design* reading rather than fact-checking: on B4a, **all three design-breaking findings came from the single agent asked to review the design adversarially**, and none from the four checking facts.
- [ ] Root `npm test` green, run by the coordinator rather than inherited from a task.
- [ ] Confirm `git ls-files | grep -iE 'KRISTINsnid|SHsnid'` returns **nothing**.
- [ ] ⚠️ **Do not push `main`.** Docs commits sit unpushed there; pushing strands prod's content backup until someone deploys (CLAUDE.md, durable).

**Specific things worth pointing a reviewer at:**

1. **The golden proves the happy path only.** `loadBinData`'s four guards match zero rows in the real CSV, so they are covered by unit tests alone. Are those tests right?
2. **`toLowerCase()` vs Python's `.lower()`** are both Unicode-aware but not identical for every code point. The golden covers this for ~20k real words — but only those.
3. **The `", "` separator** is the highest-value single line in the diff.
4. **The sort comparator** — a later "improvement" to `localeCompare` would break every accented paradigm and is the most plausible future regression.
