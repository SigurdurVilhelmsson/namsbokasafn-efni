# §C36 B4b-0b — pos-aware BÍN inflections onto `concept_term`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the union-based BÍN lookup with a pos-aware one that groups forms per BÍN entry, refuses ambiguous strings instead of unioning them, and writes the result to `concept_term.inflections` — the column migration 045 declared and nothing has ever written.

**Architecture:** Two files change shape and one is new. `server/lib/binInflections.js` keeps its role as the pure half but its index becomes `lemma → [BÍN entry]` instead of `lemma → Set<form>`; `server/scripts/fetch-bin-inflections.js` retargets from `terminology_translations` to `concept_term` and gains bucket reporting; `server/scripts/verify-b4b0-gates.js` is the corpus gate. The differential golden is **kept and strengthened** rather than retired: the new loader's per-lemma union must still reproduce the Python's hashes exactly — verified before this plan was written, 0 mismatches over 23,995 words.

**Tech Stack:** Node 22 CommonJS under `server/` · better-sqlite3 (resolves only from `server/node_modules`) · Vitest (ESM test files with `createRequire`) · `readline` streaming over a 377 MB CSV.

**Spec:** [`docs/superpowers/specs/2026-08-10-terminology-concept-model-part-b4b0-design.md`](../specs/2026-08-10-terminology-concept-model-part-b4b0-design.md) — read D1, D3, D4, D4.1, D4.2, D5, D6, D7 and §5 before starting. §5's input-guard row and §6's guard bullet were **corrected on 2026-08-10 against the files** and the corrections are load-bearing for Task 2.

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **No BÍN bytes may be committed — test fixtures included.** BÍN is CC BY-SA 4.0, this repo is public and `books/` is per-book CC BY. `tools/data/` is gitignored (`.gitignore:56`). Every fixture in this plan uses **invented** Icelandic-shaped rows. Checksums and SHA-256 hashes are not BÍN content and may be committed.
- **🔴 D6 — inflections must never enter the glossary export payload.** `prepareLookupStatements.terms` stays an explicit `SELECT id AS term_id, text, rank`; `resolvedGlossary.js:113` stays `t.text`. A `SELECT *` there is the one edit that breaks this, and it would look like a simplification.
- **`--execute` opt-in, dry-run default.** Nothing is written without the flag. This is the Python's one genuinely good safety property and the port kept it.
- **Streaming, never `readFileSync`, for the CSV.** 377 MB / 7,425,931 lines.
- **`server/` is CommonJS**; `require`/`module.exports`. Test files are the hybrid shape — `import` for vitest and node builtins (**Vitest cannot be `require`d**), `createRequire(import.meta.url)` for the server's own modules. Copy the header from `server/__tests__/binInflectionsGolden.test.js`.
- **`resolveDbPath()` for the DB path, never `process.cwd()`.**
- **Root `npm test` from the repo root is the authoritative gate.** A CSV-dependent test **skips** where the CSV is absent (CI), and **a skip is not a pass**.
- **`server/` is not linted by CI** — `lint` is `eslint tools/ scripts/`. `lint-staged`'s pre-commit hook covers `server/**/*.js` locally. Do **not** widen root `lint` in this PR.
- **No migration.** 045 already declares `concept_term.inflections`.
- **No production write in this PR.** B4b-0b ships code + gates + evidence from a scratch corpus. Running it against prod's `sessions.db` is a separate [LEAD] data op, on B2's precedent.

### Measured constants this plan is built on

Re-derived on 2026-08-10; a divergence is a finding, not a number to update.

| fact | value |
|---|---|
| `SHsnid.csv` rows | 7,425,931 — **all exactly 6 fields, zero variance** |
| `SHsnid.csv` field 2 values | **16**: `lo kvk kk hk so ao rt fn fs to uh st pfn gr afn nhm` |
| `KRISTINsnid.csv` fields | **15** — the file the guard must refuse |
| `SHsnid.csv` SHA-256 | `9c10d70d73c03168f05f152616b8cafa6e4275e7db8701338f5f3c48a45b7ab6` |
| scratch corpus | `concept` **70,187** / `concept_term` **192,189** — reproduces §C36 B2 exactly |
| candidate rows | **74,004** (`lang='is'`, `inflections IS NULL`, single-word) |
| candidate distinct lowercased strings | **53,719** (1.378 rows per string) |
| multi-word skipped rows | **18,299** |

---

## File Structure

| file | responsibility |
|---|---|
| `server/lib/binInflections.js` | **Modify.** The pure half: streaming pos-aware CSV load, entry selection (D4/D4.2), form extraction, Python-compatible JSON encoding. No database, no CLI. |
| `server/scripts/fetch-bin-inflections.js` | **Modify.** The CLI: argument parsing, the `concept_term` query, bucketing, the write transaction, the report. |
| `server/scripts/lib/scratchCorpus.js` | **Create.** `buildCorpusDb` + `seedBooks`, extracted from `verify-b4a-gates.js` so B4b-0b's gate is the second caller and B4b-1's will be the third. |
| `server/scripts/verify-b4b0-gates.js` | **Create.** The corpus gate: six gates plus a fidelity control, against a scratch DB it builds and deletes. |
| `server/__tests__/binInflections.test.js` | **Modify.** Unit tests for the pure half, against invented fixtures. |
| `server/__tests__/binInflectionsGolden.test.js` | **Modify.** The differential golden, re-pointed at the new loader via per-lemma union. |
| `server/__tests__/binInflectionsCli.test.js` | **Modify.** CLI + SQL + bucket-partition tests against a real migrated DB. |
| `test-results/b4b-matcher-cutover-2026-08.md` | **Modify.** Append B4b-0b's measurements. |
| `docs/plans/2026-07-21-post-item17-followup-campaign.md` | **Modify.** Register: B4b-0b status, plus new finding §C43. |

---

## Task 1: The pos-aware loader

**Files:**
- Modify: `server/lib/binInflections.js`
- Test: `server/__tests__/binInflections.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `WORD_CLASSES: Set<string>` — the 16 measured values.
  - `NOUN_CLASSES: Set<string>` — `kk`, `kvk`, `hk`.
  - `loadBinEntries(csvPath, candidateLemmas) → Promise<Map<string, BinEntry[]>>` where `candidateLemmas` is a `Set<string>` of lowercased+trimmed keys and `BinEntry = { binId: string, lemma: string, wordClass: string, forms: Set<string> }`. Keyed by lowercased lemma. **Throws** on a malformed file.
  - `formatInflectionsJson(forms: string[]) → string` — unchanged from B4b-0a.
  - **Removed:** `loadBinData`, `getInflections`. Task 3 re-points the golden; Task 5 re-points the CLI. No other caller exists (measured: only `fetch-bin-inflections.js` and the three test files).

- [ ] **Step 1: Write the failing tests**

Replace the `loadBinData` and `getInflections` describe blocks in `server/__tests__/binInflections.test.js`. Keep the existing `formatInflectionsJson` block untouched — that function does not change. Keep the file's existing fixture-writing helper if it has one; otherwise add this one.

```js
// ⚠️ INVENTED ROWS ONLY. `zafl`/`zhverfa` are not Icelandic words and the ids are
// not BÍN's. Committing real BÍN lines is what §C41's ShareAlike analysis forbids.
function writeCsv(rows) {
  const p = path.join(os.tmpdir(), `bin-fixture-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(p, rows.join('\n') + '\n', 'utf-8');
  return p;
}

// SHsnid layout: lemma;binId;wordClass;register;form;tag
const ROWS = [
  'zafl;9001;kk;alm;zafl;NFET',
  'zafl;9001;kk;alm;zafli;ÞGFET',
  'zafl;9002;hk;alm;zafls;EFET',
  'zhverfa;9101;kvk;alm;zhverfa;NFET',
  'zhverfa;9101;kvk;alm;zhverfu;ÞGFET',
  'zhverfa;9102;so;alm;zhorfinn;LHÞT',
  'zsolo;9201;kvk;alm;zsolo;NFET',
  'zsolo;9201;kvk;alm;zsolu;ÞGFET',
  'zonly;9301;hk;alm;zonly;NFET',
  'zadj;9401;lo;alm;zadj;FSB',
  'zadj;9402;ao;alm;zadjt;FST',
];

describe('loadBinEntries', () => {
  it('groups forms per BÍN entry, not per lemma', async () => {
    const p = writeCsv(ROWS);
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    expect(byLemma.get('zafl').map((e) => e.binId).sort()).toEqual(['9001', '9002']);
  });

  it('keeps each entry’s word class', async () => {
    const p = writeCsv(ROWS);
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    const classes = byLemma.get('zafl').map((e) => e.wordClass).sort();
    expect(classes).toEqual(['hk', 'kk']);
  });

  it('does NOT union two entries’ forms — the defect this replaces', async () => {
    const p = writeCsv(ROWS);
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    const kk = byLemma.get('zafl').find((e) => e.wordClass === 'kk');
    expect([...kk.forms].sort()).toEqual(['zafl', 'zafli']);
    expect([...kk.forms]).not.toContain('zafls');
  });

  it('retains ONLY candidate lemmas', async () => {
    const p = writeCsv(ROWS);
    const byLemma = await loadBinEntries(p, new Set(['zsolo']));
    expect([...byLemma.keys()]).toEqual(['zsolo']);
  });

  it('keys on the lowercased lemma', async () => {
    const p = writeCsv(['zAfl;9001;kk;alm;zAfli;ÞGFET']);
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    expect(byLemma.has('zafl')).toBe(true);
  });

  it('REFUSES an empty candidate set rather than loading nothing quietly', async () => {
    const p = writeCsv(ROWS);
    await expect(loadBinEntries(p, new Set())).rejects.toThrow(/candidate/i);
  });

  // ⚠️ D7's input guard. Measured: the real file has ZERO rows failing either
  // half, so both are provably inert on the supported input.
  it('REFUSES a 15-field KRISTINsnid row, naming the file confusion', async () => {
    const p = writeCsv(['zafl;9001;kvk;alm;1;;;;V;zafl;NFET;1;;;']);
    await expect(loadBinEntries(p, new Set(['zafl']))).rejects.toThrow(/15 field|KRISTINsnid/i);
  });

  it('REFUSES a row whose field 2 is not a known word class', async () => {
    const p = writeCsv(['zafl;9001;xx;alm;zafli;ÞGFET']);
    await expect(loadBinEntries(p, new Set(['zafl']))).rejects.toThrow(/word class/i);
  });

  // The guard must REFUSE, never skip: a skipped row is data lost silently.
  it('does not silently skip a malformed row', async () => {
    const p = writeCsv(['zafl;9001;kk;alm;zafli;ÞGFET', 'zafl;9001;kk']);
    await expect(loadBinEntries(p, new Set(['zafl']))).rejects.toThrow();
  });

  it('skips a blank line without refusing the file', async () => {
    const p = writeCsv(['zafl;9001;kk;alm;zafli;ÞGFET', '']);
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    expect(byLemma.get('zafl')).toHaveLength(1);
  });

  it('drops a row with an empty lemma or an empty form', async () => {
    const p = writeCsv([';9001;kk;alm;zafli;ÞGFET', 'zafl;9001;kk;alm;;ÞGFET']);
    const byLemma = await loadBinEntries(p, new Set(['zafl', '']));
    expect(byLemma.get('zafl')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/binInflections.test.js`
Expected: FAIL — `loadBinEntries is not a function`.

- [ ] **Step 3: Implement `loadBinEntries`**

Replace `loadBinData` and `getInflections` in `server/lib/binInflections.js`. Update the file's header comment: it currently says the module is a behaviour-identical port pinned by the golden — after this task the golden pins **union-equivalence**, which is a different and stronger claim.

```js
/**
 * ⚠️ MEASURED, NOT ASSUMED (2026-08-10, whole file). SHsnid.csv's field 2 takes
 * exactly these 16 values across all 7,425,931 rows. The list is the owner; do
 * not restate the count in prose.
 */
const WORD_CLASSES = new Set([
  'lo', 'kvk', 'kk', 'hk', 'so', 'ao', 'rt', 'fn',
  'fs', 'to', 'uh', 'st', 'pfn', 'gr', 'afn', 'nhm',
]);

/** kk = masculine, kvk = feminine, hk = neuter. D4.2's discriminator. */
const NOUN_CLASSES = new Set(['kk', 'kvk', 'hk']);

const SHSNID_FIELDS = 6;
const KRISTINSNID_FIELDS = 15;

/**
 * Stream SHsnid.csv into `lemma.toLowerCase() → BinEntry[]`, retaining only
 * lemmas in `candidateLemmas`.
 *
 * ⚠️ GROUPED PER BÍN ENTRY (id + word class), NOT PER LEMMA. That is the whole
 * point of B4b-0b: the old loader unioned every lemma sharing a spelling, so
 * `hverfa` (a kvk noun meaning isomer) carried two complete conjugations of the
 * unrelated verb *hverfa*. See spec §2.2.1.
 *
 * ⚠️ THE CANDIDATE FILTER IS NOT AN OPTIMISATION YOU MAY DROP. Unrestricted, the
 * index is ~700k entries over 7.4M form strings — multiple GB. Restricted to a
 * real candidate set it is ~17k entries. It changes no semantics: every entry
 * for a retained lemma is retained, so D4's "more than one entry" test sees the
 * same population it would have seen.
 *
 * ⚠️ REFUSES, NEVER SKIPS, on a malformed row. A wrong file must report as a
 * wrong file. Handing KRISTINsnid to a lower-bound check would pass, read its
 * field 4 — a NUMERIC CODE — and write numbers as inflections: corrupt yield
 * reads as data, where zero yield at least looks wrong.
 *
 * @param {string} csvPath
 * @param {Set<string>} candidateLemmas lowercased, trimmed
 * @returns {Promise<Map<string, Array<{binId:string,lemma:string,wordClass:string,forms:Set<string>}>>>}
 */
async function loadBinEntries(csvPath, candidateLemmas) {
  if (!(candidateLemmas instanceof Set) || candidateLemmas.size === 0) {
    throw new Error(
      'loadBinEntries: refusing an empty candidate set — it would load nothing and ' +
        'report a clean zero-yield run, which is indistinguishable from "BÍN lacks these words".'
    );
  }
  const byLemma = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (line === '') continue;
    const row = line.split(';');
    if (row.length !== SHSNID_FIELDS) {
      throw new Error(
        `${csvPath}:${lineNo} has ${row.length} fields, expected ${SHSNID_FIELDS} (SHsnid).` +
          (row.length === KRISTINSNID_FIELDS
            ? ' That is KRISTINsnid.csv, whose form column is index 9, not 4 — reading it as ' +
              'SHsnid would write its numeric field 4 as inflections. Pass --bin-data ' +
              'tools/data/SHsnid.csv, or port the parser deliberately (spec D2).'
            : ' Refusing rather than skipping: a silently dropped row is data lost with no signal.')
      );
    }
    const wordClass = row[2].trim();
    if (!WORD_CLASSES.has(wordClass)) {
      throw new Error(
        `${csvPath}:${lineNo} field 2 is '${wordClass}', which is not a known BÍN word class. ` +
          'Either the column order differs from SHsnid, or BÍN has added a class — both are ' +
          'decisions for a human, not for this parser (spec D4: never guess).'
      );
    }
    const lemma = row[0].trim();
    const form = row[4].trim();
    if (!lemma || !form) continue; // the Python's own filter, kept
    const key = lemma.toLowerCase();
    if (!candidateLemmas.has(key)) continue;
    let entries = byLemma.get(key);
    if (!entries) {
      entries = [];
      byLemma.set(key, entries);
    }
    const binId = row[1].trim();
    let entry = entries.find((e) => e.binId === binId);
    if (!entry) {
      entry = { binId, lemma, wordClass, forms: new Set() };
      entries.push(entry);
    }
    entry.forms.add(form);
  }
  return byLemma;
}
```

Update `module.exports` to `{ WORD_CLASSES, NOUN_CLASSES, loadBinEntries, formatInflectionsJson }` — Task 2 adds two more.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/__tests__/binInflections.test.js`
Expected: PASS. The `formatInflectionsJson` block must still pass untouched.

- [ ] **Step 5: Commit**

```bash
git add server/lib/binInflections.js server/__tests__/binInflections.test.js
git commit -m "feat(B4b-0b): loadBinEntries — group per BÍN entry, refuse a wrong file

The union keyed on lemma is the contamination (spec §2.2.1): hverfa the kvk
noun carried two conjugations of the unrelated verb. Group on binId instead.

The input guard refuses rather than skips, and refuses on POSITIVE
identification — exact field count AND a known word class. A lower bound
would accept KRISTINsnid and read its numeric field 4 as forms; corrupt
yield reads as data. Measured inert: 0 of 7,425,931 real rows fail either half."
```

---

## Task 2: Entry selection — D4 and the D4.2 nominal rescue

**Files:**
- Modify: `server/lib/binInflections.js`
- Test: `server/__tests__/binInflections.test.js`

**Interfaces:**
- Consumes: `loadBinEntries`'s `BinEntry` shape, `NOUN_CLASSES`.
- Produces:
  - `chooseEntry(entries) → { entry: BinEntry|null, outcome: string, discarded: BinEntry[] }` where `outcome ∈ {'unambiguous','rescued-nominal','refused-ambiguous','refused-no-noun'}`.
  - `inflectionsFor(entry, key) → string[]|null` — `key` is the lowercased lookup string; the base form is excluded and the result is **code-point** sorted. `null` when nothing remains.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/binInflections.test.js`:

```js
const E = (binId, wordClass, forms) => ({ binId, lemma: 'x', wordClass, forms: new Set(forms) });

describe('chooseEntry — D4 and D4.2', () => {
  it('a single entry is unambiguous and is chosen', () => {
    const e = E('1', 'kvk', ['a']);
    expect(chooseEntry([e])).toEqual({ entry: e, outcome: 'unambiguous', discarded: [] });
  });

  // D4's anchor: two entries of the same broad class are two different words.
  // The `afl` case — kk + hk, both nouns.
  it('REFUSES two noun entries — never unions, never picks', () => {
    const r = chooseEntry([E('1', 'kk', ['a']), E('2', 'hk', ['b'])]);
    expect(r.outcome).toBe('refused-ambiguous');
    expect(r.entry).toBeNull();
  });

  it('refuses two entries of the IDENTICAL word class too', () => {
    expect(chooseEntry([E('1', 'kk', ['a']), E('2', 'kk', ['b'])]).outcome)
      .toBe('refused-ambiguous');
  });

  // D4.2's anchor: the `hverfa` case — kvk + so + so.
  it('RESCUES the sole noun among several entries', () => {
    const noun = E('1', 'kvk', ['a']);
    const r = chooseEntry([noun, E('2', 'so', ['b']), E('3', 'so', ['c'])]);
    expect(r.outcome).toBe('rescued-nominal');
    expect(r.entry).toBe(noun);
  });

  // ⚠️ The price of the D4.2 exception: a wrong pick must be discoverable.
  it('names every entry the rescue discarded', () => {
    const r = chooseEntry([E('1', 'kvk', ['a']), E('2', 'so', ['b']), E('3', 'so', ['c'])]);
    expect(r.discarded.map((e) => e.binId).sort()).toEqual(['2', '3']);
  });

  // D4.2 must NOT fire on afturkræfur — a genuine adjective headword.
  it('refuses when no entry is a noun', () => {
    const r = chooseEntry([E('1', 'lo', ['a']), E('2', 'ao', ['b'])]);
    expect(r.outcome).toBe('refused-no-noun');
    expect(r.entry).toBeNull();
  });

  it('accepts an UNAMBIGUOUS non-noun — D4.2’s noun test fires only on ambiguity', () => {
    const r = chooseEntry([E('1', 'lo', ['a'])]);
    expect(r.outcome).toBe('unambiguous');
    expect(r.entry.wordClass).toBe('lo');
  });

  it('treats all three noun genders as nouns', () => {
    for (const g of ['kk', 'kvk', 'hk']) {
      expect(chooseEntry([E('1', g, ['a']), E('2', 'so', ['b'])]).outcome).toBe('rescued-nominal');
    }
  });
});

describe('inflectionsFor', () => {
  it('excludes the base form', () => {
    expect(inflectionsFor(E('1', 'kk', ['zafl', 'zafli']), 'zafl')).toEqual(['zafli']);
  });

  it('excludes the base form case-insensitively', () => {
    expect(inflectionsFor(E('1', 'kk', ['ZAFL', 'zafli']), 'zafl')).toEqual(['zafli']);
  });

  // ⚠️ null, never []. The CLI branches on truthiness and "[]" is a value the
  // Python never wrote; conflating them writes an empty paradigm as if it were data.
  it('returns null, not [], when only the base form remains', () => {
    expect(inflectionsFor(E('1', 'kk', ['zafl']), 'zafl')).toBeNull();
  });

  it('returns null for an entry with no forms', () => {
    expect(inflectionsFor(E('1', 'kk', []), 'zafl')).toBeNull();
  });

  // ⚠️ CODE POINT order, matching Python's sorted(). localeCompare puts ö after
  // z under Icelandic collation and would reorder every accented paradigm.
  it('sorts by code point, not by Icelandic collation', () => {
    expect(inflectionsFor(E('1', 'kk', ['zafl', 'ö', 'z', 'a']), 'zafl')).toEqual(['a', 'z', 'ö']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/binInflections.test.js`
Expected: FAIL — `chooseEntry is not a function`.

- [ ] **Step 3: Implement both functions**

```js
/**
 * Pick the BÍN entry a string should take its paradigm from — or refuse.
 *
 * D4: an ambiguous string is REPORTED, never unioned and never guessed. A
 * deterministic tie-break (first id, largest paradigm, commonest class) would
 * let an arbitrary rule decide an editorial answer — §C18's defect reproduced
 * inside its own successor.
 *
 * ⚠️ D4.2 IS A DELIBERATE, RECORDED EXCEPTION TO D4, NOT A REFINEMENT OF IT.
 * D4 forbids picking; this picks. It is defensible only because the
 * discriminator is CATEGORICAL — "a glossary headword denotes a concept, and a
 * concept is a noun" — and because it fires ONLY when exactly one noun exists,
 * so it never picks between nouns, which is where the domain argument runs out.
 * Its failure mode is paid for by `discarded`: every rescue names what it threw
 * away, so a wrong pick is discoverable after the fact instead of silent.
 *
 * @param {Array} entries from loadBinEntries
 * @returns {{entry: object|null, outcome: string, discarded: Array}}
 */
function chooseEntry(entries) {
  if (entries.length === 1) {
    return { entry: entries[0], outcome: 'unambiguous', discarded: [] };
  }
  const nouns = entries.filter((e) => NOUN_CLASSES.has(e.wordClass));
  if (nouns.length === 1) {
    return {
      entry: nouns[0],
      outcome: 'rescued-nominal',
      discarded: entries.filter((e) => e !== nouns[0]),
    };
  }
  return {
    entry: null,
    outcome: nouns.length === 0 ? 'refused-no-noun' : 'refused-ambiguous',
    discarded: entries,
  };
}

/**
 * The entry's inflected forms, base form excluded, code-point sorted.
 *
 * ⚠️ RETURNS null, NEVER []. `null` means "no paradigm to write". An empty array
 * would encode as "[]" — a value the Python never emitted and which reads as a
 * word that provably does not inflect, rather than as an absence.
 *
 * ⚠️ SORTED BY CODE POINT. A default Array.prototype.sort() compares UTF-16 code
 * units, which equals code-point order across the BMP, and every Icelandic
 * character is BMP. DO NOT use localeCompare.
 *
 * @param {{forms: Set<string>}} entry
 * @param {string} key lowercased, trimmed lookup string
 * @returns {string[]|null}
 */
function inflectionsFor(entry, key) {
  const forms = [...entry.forms].filter((f) => f.toLowerCase() !== key).sort();
  return forms.length > 0 ? forms : null;
}
```

Extend `module.exports` to `{ WORD_CLASSES, NOUN_CLASSES, loadBinEntries, chooseEntry, inflectionsFor, formatInflectionsJson }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/__tests__/binInflections.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/binInflections.js server/__tests__/binInflections.test.js
git commit -m "feat(B4b-0b): chooseEntry + inflectionsFor — D4 refuses, D4.2 rescues

D4: >1 entry is refused and named. The rule is >1 ENTRY, not >1 word class —
two same-class entries sharing a lemma are still two different words.

D4.2 is a recorded EXCEPTION, not a refinement: it picks where D4 forbids
picking, defensible because the discriminator is categorical and because it
fires only when exactly one noun exists. Every rescue names its discards."
```

---

## Task 3: Re-point the differential golden at the new loader

**Files:**
- Modify: `server/__tests__/binInflectionsGolden.test.js`

**Interfaces:**
- Consumes: `loadBinEntries`, `formatInflectionsJson`.
- Produces: nothing consumed later. This task converts a check that would otherwise pin dead code into a fidelity proof for the new one.

**Why this works — verified before the plan was written, not assumed.** The pos-aware index, unioned back per lemma and passed through the Python's base-form filter and code-point sort, reproduces the committed hashes **exactly**: 0 mismatches over 23,995 golden words, 7,285 hits / 16,710 misses. So the golden keeps a subject and its claim gets *stronger* — it now proves the new parser reads the same `(lemma, form)` pairs the Python did, rather than proving a superseded function still works.

- [ ] **Step 1: Rewrite the comparison test**

Replace the import line and the body of `it('reproduces the Python byte-for-byte on every word')`. Leave the `beforeAll` CSV-checksum guard, the `describe.skipIf(!haveCsv)`, and the `distinguishes null from an empty list` test **exactly as they are**.

```js
const { loadBinEntries, formatInflectionsJson } = require('../lib/binInflections');
```

```js
  // ⚠️ THE CLAIM CHANGED WITH B4b-0b, AND IT GOT STRONGER. B4b-0a asserted "the
  // Node port equals the Python". The union lookup that claim was about is gone.
  // What is asserted now is that the POS-AWARE loader, unioned back per lemma,
  // reads exactly the (lemma, form) pairs the Python read — so the golden still
  // pins live code, and it pins the layer where a CSV-parsing regression would
  // actually land. Verified 0/23,995 mismatches before B4b-0b was written.
  //
  // ⚠️ The union here is DELIBERATE and is not what production does. Production
  // runs chooseEntry(), which refuses or rescues. Unioning is the transform that
  // makes the two designs comparable at all; it is the oracle's adapter, and it
  // must never be copied into the script.
  it('reads the same (lemma, form) pairs as the Python, per-lemma union', async () => {
    const golden = JSON.parse(fs.readFileSync(HASHES, 'utf-8'));
    const words = fs
      .readFileSync(WORDS, 'utf-8')
      .split('\n')
      .filter((w) => w !== '');
    const candidates = new Set(words.map((w) => w.toLowerCase().trim()));
    const byLemma = await loadBinEntries(CSV, candidates);

    const mismatches = [];
    let hits = 0;
    let misses = 0;
    for (const w of words) {
      const key = w.toLowerCase().trim();
      const entries = byLemma.get(key);
      let actual = null;
      if (entries) {
        const union = new Set();
        for (const e of entries) for (const f of e.forms) union.add(f);
        const forms = [...union].filter((f) => f.toLowerCase() !== key).sort();
        if (forms.length > 0) {
          actual = crypto
            .createHash('sha256')
            .update(formatInflectionsJson(forms), 'utf-8')
            .digest('hex');
        }
      }
      if (actual === null) misses++;
      else hits++;
      if (actual !== golden[w]) mismatches.push(`${w}: expected ${golden[w]}, got ${actual}`);
    }

    // ⚠️ THE CONTROLS. A run where everything returned null would produce zero
    // mismatches against a golden that was also all-null, and prove nothing.
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
    expect(words.length).toBeGreaterThan(1000);

    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  }, 300000);
```

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/binInflectionsGolden.test.js`
Expected: PASS on a box holding `tools/data/SHsnid.csv`; **SKIP** where it is absent. A skip is not a pass — say which one you got.

- [ ] **Step 3: Prove the gate can still fail**

A gate that cannot fail is not a gate, and this one just changed subject. Temporarily change `formatInflectionsJson`'s separator from `', '` to `','`, re-run, and confirm mass mismatches. Then revert and confirm `git diff server/lib/binInflections.js` is **empty** — a break-and-revert proof leaks if the revert is partial, which is the specific hazard B4b-0a recorded.

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/binInflectionsGolden.test.js
git commit -m "test(B4b-0b): re-point the differential golden at the pos-aware loader

The union lookup the golden was written against is gone, so left alone it
would be green forever over dead code. Re-pointed: the new index, unioned
back per lemma, must reproduce the Python's hashes exactly — 0/23,995. That
is a stronger claim than before and it pins the layer a CSV-parsing
regression lands in. Observed failing via the separator, then reverted clean."
```

---

## Task 4: `--limit`-free CLI plumbing — argument parsing and the `concept_term` query

**Files:**
- Modify: `server/scripts/fetch-bin-inflections.js`
- Test: `server/__tests__/binInflectionsCli.test.js`

**Interfaces:**
- Consumes: nothing from Tasks 1–3 yet.
- Produces: `parseArgs(argv)` (unchanged shape: `{db, binData, execute, limit, force, help}`) and `candidateSql({force, limit}) → string`, replacing `selectSql`.

- [ ] **Step 1: Write the failing tests**

In `server/__tests__/binInflectionsCli.test.js`, keep every existing `parseArgs` test — that parser's strictness is B4b-0a's reviewed work and must not regress. Replace the `selectSql` describe block with:

```js
const { parseArgs, candidateSql } = require('../scripts/fetch-bin-inflections');

describe('candidateSql', () => {
  it('targets concept_term, not the old terminology tables', () => {
    const sql = candidateSql({ force: false, limit: 0 });
    expect(sql).toMatch(/FROM concept_term/);
    expect(sql).not.toMatch(/terminology_translations/);
  });

  it("selects only Icelandic terms", () => {
    expect(candidateSql({ force: false, limit: 0 })).toMatch(/lang\s*=\s*'is'/);
  });

  it('excludes already-populated rows by default — D5’s one-way fill', () => {
    expect(candidateSql({ force: false, limit: 0 })).toMatch(/inflections IS NULL/);
  });

  it('--force drops the IS NULL guard', () => {
    expect(candidateSql({ force: true, limit: 0 })).not.toMatch(/inflections IS NULL/);
  });

  it('skips multi-word strings — BÍN handles single words', () => {
    expect(candidateSql({ force: false, limit: 0 })).toMatch(/NOT LIKE '% %'/);
  });

  it('emits no LIMIT clause when limit is 0', () => {
    expect(candidateSql({ force: false, limit: 0 })).not.toMatch(/LIMIT/);
  });

  it('emits a LIMIT clause when limit is set', () => {
    expect(candidateSql({ force: false, limit: 50 })).toMatch(/LIMIT 50/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/binInflectionsCli.test.js`
Expected: FAIL — `candidateSql is not a function`.

- [ ] **Step 3: Implement `candidateSql`**

Replace `selectSql` in `server/scripts/fetch-bin-inflections.js`:

```js
/**
 * The candidate set: single-word Icelandic terms on the concept model.
 *
 * ⚠️ `concept_term` IS KEYED (concept_id, lang, text), SO ONE STRING OWNS MANY
 * ROWS — 74,004 candidate rows over 53,719 distinct strings, 1.378 rows each.
 * This query returns ROWS. The BÍN lookup happens once per distinct lowercased
 * STRING and its result is written to every row of that string. Every count this
 * script prints therefore has to say which unit it is in.
 *
 * ⚠️ --limit BOUNDS ROWS, NOT STRINGS, so a limited run may hold only part of a
 * string's rows. That is fine for a smoke run and wrong for a yield measurement.
 */
function candidateSql({ force, limit }) {
  const where = [
    "ct.lang = 'is'",
    force ? '1=1' : 'ct.inflections IS NULL',
    "ct.text NOT LIKE '% %'", // BÍN handles single words
    'ct.text IS NOT NULL',
  ].join(' AND ');
  return `
        SELECT ct.id, ct.text, c.domain
        FROM concept_term ct
        JOIN concept c ON c.id = ct.concept_id
        WHERE ${where}
        ORDER BY ct.id
        ${limit ? `LIMIT ${limit}` : ''}`;
}
```

Update `module.exports` to export `candidateSql` in place of `selectSql`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/__tests__/binInflectionsCli.test.js`
Expected: the `candidateSql` block passes; the `main` tests fail (Task 5 rewrites them). If the file's existing `main` tests break here, mark them `it.skip` with a `// Task 5` comment rather than deleting them.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/fetch-bin-inflections.js server/__tests__/binInflectionsCli.test.js
git commit -m "feat(B4b-0b): candidateSql — retarget from terminology_translations to concept_term

D1: the old table is not read, not copied and not migrated; Part C deletes it.
The comment carries the counting unit, because concept_term is keyed
(concept_id, lang, text) and one string owns 1.378 rows on average."
```

---

## Task 5: The run — buckets, the partition tripwire, and the write

**Files:**
- Modify: `server/scripts/fetch-bin-inflections.js`
- Test: `server/__tests__/binInflectionsCli.test.js`

**Interfaces:**
- Consumes: `loadBinEntries`, `chooseEntry`, `inflectionsFor`, `formatInflectionsJson`, `candidateSql`.
- Produces: `main(argv) → Promise<{strings, rows, written}>` — the report object, so tests assert on values rather than on stdout.
  - `strings`: `{ total, unambiguous, rescuedNominal, refusedAmbiguous, refusedNoNoun, baseFormOnly, notInBin }`
  - `rows`: `{ total, written, refused, baseFormOnly, notInBin, multiWordSkipped, alreadyPopulatedBefore, alreadyPopulatedAfter }`
  - `refusals`: `Array<{ text, entries: Array<{binId, wordClass}> }>`
  - `rescues`: `Array<{ text, chosen: {binId, wordClass}, discarded: Array<{binId, wordClass}> }>`

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/binInflectionsCli.test.js`. This block needs a real migrated DB, so use the same helper the other concept tests use.

```js
import { describe, it, expect, beforeEach } from 'vitest';
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { main } = require('../scripts/fetch-bin-inflections');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ⚠️ INVENTED ROWS. See Task 1.
const CSV_ROWS = [
  'zafl;9001;kk;alm;zafl;NFET',
  'zafl;9001;kk;alm;zafli;ÞGFET',
  'zafl;9002;hk;alm;zafl;NFET',
  'zafl;9002;hk;alm;zafls;EFET',
  'zhverfa;9101;kvk;alm;zhverfa;NFET',
  'zhverfa;9101;kvk;alm;zhverfu;ÞGFET',
  'zhverfa;9102;so;alm;zhorfinn;LHÞT',
  'zsolo;9201;kvk;alm;zsolo;NFET',
  'zsolo;9201;kvk;alm;zsolu;ÞGFET',
  'zflat;9301;hk;alm;zflat;NFET',
];

function writeCsv() {
  const p = path.join(os.tmpdir(), `bin-cli-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(p, CSV_ROWS.join('\n') + '\n', 'utf-8');
  return p;
}

/** One concept per term, so the string→row fan-out is controllable per test. */
function seedTerm(db, text, domain = 'chemistry') {
  const c = db
    .prepare("INSERT INTO concept (domain, collection) VALUES (?, 'test')")
    .run(domain);
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, 1, 'test')"
  ).run(c.lastInsertRowid, text);
  return c.lastInsertRowid;
}

describe('fetch-bin-inflections main()', () => {
  let db, dbPath, csv;
  beforeEach(() => {
    const built = freshMigratedDb();
    db = built.db;
    dbPath = built.path;
    csv = writeCsv();
  });

  const run = (extra = []) => main(['--db', dbPath, '--bin-data', csv, ...extra]);

  it('writes nothing without --execute', async () => {
    seedTerm(db, 'zsolo');
    await run();
    expect(db.prepare("SELECT inflections FROM concept_term WHERE text='zsolo'").get().inflections)
      .toBeNull();
  });

  it('writes the paradigm of an unambiguous term with --execute', async () => {
    seedTerm(db, 'zsolo');
    await run(['--execute']);
    const v = db.prepare("SELECT inflections FROM concept_term WHERE text='zsolo'").get().inflections;
    expect(JSON.parse(v)).toEqual(['zsolu']);
  });

  // D4's anchor at the CLI level.
  it('REFUSES an ambiguous term and names its contending entries', async () => {
    seedTerm(db, 'zafl');
    const rep = await run(['--execute']);
    expect(db.prepare("SELECT inflections FROM concept_term WHERE text='zafl'").get().inflections)
      .toBeNull();
    const r = rep.refusals.find((x) => x.text === 'zafl');
    expect(r.entries.map((e) => e.wordClass).sort()).toEqual(['hk', 'kk']);
  });

  // D4.2's anchor, asserted by IDENTITY: the verb participle must not be there.
  it('RESCUES the sole noun and writes ONLY its forms', async () => {
    seedTerm(db, 'zhverfa');
    const rep = await run(['--execute']);
    const v = JSON.parse(
      db.prepare("SELECT inflections FROM concept_term WHERE text='zhverfa'").get().inflections
    );
    expect(v).toEqual(['zhverfu']);
    expect(v).not.toContain('zhorfinn');
    expect(rep.rescues.find((x) => x.text === 'zhverfa').discarded[0].wordClass).toBe('so');
  });

  it('buckets a BÍN word with no non-base form separately from an absent one', async () => {
    seedTerm(db, 'zflat');
    seedTerm(db, 'zabsent');
    const rep = await run();
    expect(rep.strings.baseFormOnly).toBe(1);
    expect(rep.strings.notInBin).toBe(1);
  });

  it('writes one lookup to EVERY row sharing the string', async () => {
    seedTerm(db, 'zsolo', 'chemistry');
    seedTerm(db, 'zsolo', 'biology');
    const rep = await run(['--execute']);
    expect(rep.strings.unambiguous).toBe(1);
    expect(rep.rows.written).toBe(2);
    expect(
      db.prepare("SELECT COUNT(*) c FROM concept_term WHERE text='zsolo' AND inflections IS NOT NULL").get().c
    ).toBe(2);
  });

  it('reports multi-word strings as skipped rather than dropping them silently', async () => {
    seedTerm(db, 'zsolo');
    seedTerm(db, 'zafl zsolo');
    const rep = await run();
    expect(rep.rows.multiWordSkipped).toBe(1);
  });

  // ⚠️ Assert the PARTITION, not a total that happens to equal the fixture's row
  // count — that passes for the wrong reason the moment the fixture changes.
  it('every string lands in exactly one bucket', async () => {
    ['zsolo', 'zafl', 'zhverfa', 'zflat', 'zabsent'].forEach((t) => seedTerm(db, t));
    const rep = await run();
    const s = rep.strings;
    expect(
      s.unambiguous + s.rescuedNominal + s.refusedAmbiguous + s.refusedNoNoun +
        s.baseFormOnly + s.notInBin
    ).toBe(s.total);
  });

  it('every row lands in exactly one bucket', async () => {
    ['zsolo', 'zafl', 'zhverfa', 'zflat', 'zabsent'].forEach((t) => seedTerm(db, t));
    const rep = await run(['--execute']);
    const r = rep.rows;
    expect(r.written + r.refused + r.baseFormOnly + r.notInBin).toBe(r.total);
  });

  // D5: idempotency MEASURED, not inferred.
  it('a re-run writes 0 rows, and the before/after counts prove it', async () => {
    seedTerm(db, 'zsolo');
    await run(['--execute']);
    const rep = await run(['--execute']);
    expect(rep.rows.written).toBe(0);
    expect(rep.rows.alreadyPopulatedBefore).toBe(1);
    expect(rep.rows.alreadyPopulatedAfter).toBe(1);
  });

  it('never clobbers a non-null value', async () => {
    seedTerm(db, 'zsolo');
    db.prepare("UPDATE concept_term SET inflections = '[\"hand-written\"]' WHERE text='zsolo'").run();
    await run(['--execute']);
    expect(db.prepare("SELECT inflections FROM concept_term WHERE text='zsolo'").get().inflections)
      .toBe('["hand-written"]');
  });

  // B0's rule: a zero-yield run is REFUSED, not printed. The dev DB has no
  // concept model at all, so a bare run would otherwise report a clean 0.
  it('REFUSES a run with no candidates rather than reporting a clean zero', async () => {
    await expect(run()).rejects.toThrow(/no candidate/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/binInflectionsCli.test.js`
Expected: FAIL — `main` still targets `terminology_translations` and returns `undefined`.

- [ ] **Step 3: Rewrite `main`**

Replace `main` in `server/scripts/fetch-bin-inflections.js`. Also update the file header — it currently describes a behaviour-identical port of the Python.

```js
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
    console.error('  2. Accept the CC BY-SA 4.0 licence');
    console.error('  3. Download SHsnid.csv');
    console.error(`  4. Place it at: ${DEFAULT_BIN}`);
    process.exit(1);
  }

  // ⚠️ Required INSIDE main() so the test file can import parseArgs/candidateSql
  // without opening a database.
  const Database = require('better-sqlite3');
  const db = new Database(args.db);

  const rows = db.prepare(candidateSql(args)).all();
  const multiWordSkipped = db
    .prepare(
      "SELECT COUNT(*) c FROM concept_term WHERE lang='is' AND text LIKE '% %'" +
        (args.force ? '' : ' AND inflections IS NULL')
    )
    .get().c;
  const countPopulated = () =>
    db.prepare("SELECT COUNT(*) c FROM concept_term WHERE lang='is' AND inflections IS NOT NULL")
      .get().c;
  const alreadyPopulatedBefore = countPopulated();

  // ⚠️ ZERO-YIELD IS REFUSED, NOT PRINTED (B0's rule, run-concept-import.js's
  // docstring). The DEFAULT --db is resolveDbPath(), which on a dev box points at
  // a database with no concept model — so the commonest mistake produces zero
  // candidates, and a printed "0 found" is indistinguishable from "BÍN lacks
  // these words". Refusing turns that from a misleading success into a diagnosis.
  if (rows.length === 0) {
    db.close();
    throw new Error(
      `no candidate rows in ${args.db}: concept_term has no single-word lang='is' row with ` +
        `inflections IS NULL. ${alreadyPopulatedBefore} row(s) are already populated. ` +
        'If this is a dev box, the concept model is probably empty — rebuild a scratch ' +
        'corpus with run-concept-import.js rather than pointing this at sessions.db.'
    );
  }

  // ONE lookup per distinct lowercased STRING; the write fans out to its rows.
  const byString = new Map();
  for (const r of rows) {
    const key = r.text.toLowerCase().trim();
    if (!byString.has(key)) byString.set(key, []);
    byString.get(key).push(r);
  }

  console.log(`Loading BÍN data from ${args.binData}...`);
  const byLemma = await loadBinEntries(args.binData, new Set(byString.keys()));
  console.log(`  ${byLemma.size.toLocaleString()} of ${byString.size.toLocaleString()} candidate strings are in BÍN`);
  console.log(`\n${rows.length} candidate row(s) over ${byString.size} distinct string(s)`);
  if (!args.execute) console.log('*** DRY RUN — add --execute to write to database ***\n');

  const strings = {
    total: byString.size,
    unambiguous: 0,
    rescuedNominal: 0,
    refusedAmbiguous: 0,
    refusedNoNoun: 0,
    baseFormOnly: 0,
    notInBin: 0,
  };
  const rowStats = {
    total: rows.length,
    written: 0,
    refused: 0,
    baseFormOnly: 0,
    notInBin: 0,
    multiWordSkipped,
    alreadyPopulatedBefore,
    alreadyPopulatedAfter: alreadyPopulatedBefore,
  };
  const refusals = [];
  const rescues = [];
  const plan = []; // [{ids, json}]

  for (const [key, group] of byString) {
    const entries = byLemma.get(key);
    if (!entries || entries.length === 0) {
      strings.notInBin++;
      rowStats.notInBin += group.length;
      continue;
    }
    const { entry, outcome, discarded } = chooseEntry(entries);
    const brief = (e) => ({ binId: e.binId, wordClass: e.wordClass });
    if (!entry) {
      strings[outcome === 'refused-no-noun' ? 'refusedNoNoun' : 'refusedAmbiguous']++;
      rowStats.refused += group.length;
      refusals.push({ text: key, outcome, entries: entries.map(brief) });
      continue;
    }
    const forms = inflectionsFor(entry, key);
    if (forms === null) {
      // ⚠️ NOT the same fact as "not in BÍN". BÍN holds this word and it has no
      // form distinguishable from its base. The port's getInflections returned
      // null for both, which made the distinction unrecoverable downstream.
      strings.baseFormOnly++;
      rowStats.baseFormOnly += group.length;
      continue;
    }
    strings[outcome === 'rescued-nominal' ? 'rescuedNominal' : 'unambiguous']++;
    if (outcome === 'rescued-nominal') {
      rescues.push({ text: key, chosen: brief(entry), discarded: discarded.map(brief) });
    }
    plan.push({ ids: group.map((r) => r.id), json: formatInflectionsJson(forms) });
  }

  if (args.execute) {
    const update = db.prepare(
      // ⚠️ The IS NULL guard is repeated HERE as well as in candidateSql. D5's
      // one-way fill must hold even if a concurrent writer populated the row
      // between the SELECT and this UPDATE.
      'UPDATE concept_term SET inflections = ? WHERE id = ? AND inflections IS NULL'
    );
    // All-or-nothing, matching the Python's implicit transaction + commit().
    const apply = db.transaction((list) => {
      for (const p of list) for (const id of p.ids) rowStats.written += update.run(p.json, id).changes;
    });
    apply(plan);
    rowStats.alreadyPopulatedAfter = countPopulated();
  } else {
    rowStats.written = 0;
  }

  // ⚠️ THE TRIPWIRE, IN BOTH UNITS — they fail differently. A string mis-bucketed
  // breaks the string partition; a row written twice or skipped breaks only the
  // row partition. 048's discipline: an unexplained remainder is louder than a
  // plausible total.
  const sSum =
    strings.unambiguous + strings.rescuedNominal + strings.refusedAmbiguous +
    strings.refusedNoNoun + strings.baseFormOnly + strings.notInBin;
  const resolvedRows = plan.reduce((a, p) => a + p.ids.length, 0);
  const rSum = resolvedRows + rowStats.refused + rowStats.baseFormOnly + rowStats.notInBin;
  const unexplained = [];
  if (sSum !== strings.total) unexplained.push(`strings: ${sSum} bucketed vs ${strings.total} total`);
  if (rSum !== rowStats.total) unexplained.push(`rows: ${rSum} bucketed vs ${rowStats.total} total`);
  if (args.execute && rowStats.written !== resolvedRows) {
    unexplained.push(`rows: ${rowStats.written} written vs ${resolvedRows} resolved`);
  }

  const pctS = (n) => `${((n / strings.total) * 100).toFixed(2)}%`;
  const pctR = (n) => `${((n / rowStats.total) * 100).toFixed(2)}%`;
  console.log('\n--- Inflection summary ---');
  console.log('  ⚠️ TWO UNITS. One Icelandic string owns many concept_term rows.');
  console.log(`  strings: ${strings.total} · rows: ${rowStats.total}`);
  console.log(`  unambiguous      ${strings.unambiguous} (${pctS(strings.unambiguous)})`);
  console.log(`  rescued-nominal  ${strings.rescuedNominal} (${pctS(strings.rescuedNominal)})`);
  console.log(`  refused-ambig.   ${strings.refusedAmbiguous} (${pctS(strings.refusedAmbiguous)})`);
  console.log(`  refused-no-noun  ${strings.refusedNoNoun} (${pctS(strings.refusedNoNoun)})`);
  console.log(`  base-form-only   ${strings.baseFormOnly} (${pctS(strings.baseFormOnly)})`);
  console.log(`  not in BÍN       ${strings.notInBin} (${pctS(strings.notInBin)})`);
  console.log(`  rows written     ${rowStats.written} (${pctR(rowStats.written)})`);
  console.log(`  multi-word rows skipped   ${multiWordSkipped}`);
  console.log(
    `  already populated (rows)  ${alreadyPopulatedBefore} → ${rowStats.alreadyPopulatedAfter}`
  );
  if (unexplained.length) {
    console.error(`\n🔴 UNEXPLAINED: ${unexplained.join(' · ')}`);
    db.close();
    throw new Error(`bucket partition broken — ${unexplained.join(' · ')}`);
  }
  console.log(
    args.execute ? `\n✓ Changes committed to ${args.db}` : '\n*** DRY RUN — no changes written ***'
  );

  // ⚠️ Every rescue and refusal is NAMED. D4.2 is an exception to the never-guess
  // rule and this listing is the price of it: a wrong pick must be discoverable
  // after the fact rather than silent.
  if (rescues.length) {
    console.log(`\n--- D4.2 nominal rescues (${rescues.length}) ---`);
    for (const r of rescues.slice(0, 50)) {
      console.log(
        `  ${r.text}: chose ${r.chosen.wordClass}#${r.chosen.binId}, discarded ` +
          r.discarded.map((d) => `${d.wordClass}#${d.binId}`).join(' ')
      );
    }
    if (rescues.length > 50) console.log(`  … ${rescues.length - 50} more (full list in the return value)`);
  }
  if (refusals.length) {
    console.log(`\n--- D4 refusals (${refusals.length}) ---`);
    for (const r of refusals.slice(0, 50)) {
      console.log(`  ${r.text}: ${r.entries.map((e) => `${e.wordClass}#${e.binId}`).join(' ')}`);
    }
    if (refusals.length > 50) console.log(`  … ${refusals.length - 50} more (full list in the return value)`);
  }

  db.close();
  return { strings, rows: rowStats, refusals, rescues };
}
```

Update the `require` line at the top to `const { loadBinEntries, chooseEntry, inflectionsFor, formatInflectionsJson } = require('../lib/binInflections');`, and the `USAGE` string's `--force` line to say it re-fetches rows that already have inflections (keeping the BÍN credit block verbatim — SÁM's terms require it at runtime).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/__tests__/binInflectionsCli.test.js`
Expected: PASS, all blocks.

- [ ] **Step 5: Run the whole suite**

Run: `npm test` (from the **repo root**)
Expected: green. Report the file/test counts you actually saw; do not copy a number from any document.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/fetch-bin-inflections.js server/__tests__/binInflectionsCli.test.js
git commit -m "feat(B4b-0b): pos-aware run over concept_term, bucketed and tripwired

One lookup per distinct string, written to every row of that string, with the
partition asserted in BOTH units — they fail differently.

base-form-only is its own bucket: the port's getInflections returned null both
for 'absent from BÍN' and 'present but does not inflect distinguishably', and
carried forward those collapse into one count while the tripwire still balances.

Zero candidates REFUSES. The default --db is resolveDbPath(), which on a dev
box has no concept model, so the commonest mistake would otherwise print a
clean 0 that reads as 'BÍN lacks these words'."
```

---

## Task 6: Extract the scratch-corpus helper

**Files:**
- Create: `server/scripts/lib/scratchCorpus.js`
- Modify: `server/scripts/verify-b4a-gates.js`

**Interfaces:**
- Consumes: `freshMigratedDb`, `runImport`, `formatImportReport`, `BOOK_DOMAIN_PRIORITY`.
- Produces: `buildCorpusDb(corpusDir) → { db, path, applied, errors, warnings }` and `seedBooks(db) → void`. Task 7 is the second caller; B4b-1's gate will be the third.

- [ ] **Step 1: Move the two functions verbatim**

Cut `seedBooks` (currently `verify-b4a-gates.js:191-218`) and `buildCorpusDb` (`:228-252`) into the new file with their comments intact — especially `buildCorpusDb`'s note that migration 048's **silence** is the measurement, and `seedBooks`' §C35 guard explaining why an `INSERT OR IGNORE` that swallows chemistry must throw. Add the module header:

```js
// server/scripts/lib/scratchCorpus.js
/**
 * A throwaway concept corpus for the acceptance gates: every real migration
 * against an empty file, then the 20-collection Íðorðabankinn import.
 *
 * ⚠️ EXTRACTED FROM verify-b4a-gates.js, NOT REWRITTEN. B4b-0b's gate is the
 * second caller and B4b-1's will be the third; a second hand-copy of this setup
 * is how two gates end up measuring subtly different databases and neither
 * notices. The §C35 and migration-048 comments below travel WITH the code —
 * they are the reason each line is shaped as it is.
 *
 * ⚠️ NEVER pipeline-output/sessions.db, NEVER production. The local dev DB holds
 * 6 terminology rows and no concept model, so it cannot host these gates at all.
 */
```

- [ ] **Step 2: Re-point `verify-b4a-gates.js`**

Replace the two function definitions with `const { buildCorpusDb, seedBooks } = require('./lib/scratchCorpus');` and drop any imports that become unused (`freshMigratedDb`, `runImport`, `formatImportReport`, and `BOOK_DOMAIN_PRIORITY` if nothing else in that file uses it — check before deleting).

- [ ] **Step 3: Verify B4a's gate still runs**

Run: `node server/scripts/verify-b4a-gates.js`
Expected: the same verdicts as before the extraction. This is a refactor with a live check available — use it. If the corpus directory is missing the script exits 2; that is an environment failure, not a pass.

- [ ] **Step 4: Commit**

```bash
git add server/scripts/lib/scratchCorpus.js server/scripts/verify-b4a-gates.js
git commit -m "refactor: extract the scratch-corpus builder for B4b-0b's gate

Moved verbatim with its comments — 048's silence-is-the-measurement note and
the §C35 INSERT OR IGNORE guard are the reason the code is shaped this way.
Second caller now, third when B4b-1 lands. Verified by re-running B4a's gate."
```

---

## Task 7: The corpus gate

**Files:**
- Create: `server/scripts/verify-b4b0-gates.js`

**Interfaces:**
- Consumes: `buildCorpusDb`, `seedBooks`, `main` from `fetch-bin-inflections`, `buildResolvedGlossary`, `terminologyService.findTermsInSegments`, the C24 fixtures.
- Produces: exit 0 all gates passed · 1 a gate failed · 2 usage or environment.

Model the structure on `verify-b4a-gates.js`: a `record(id, verdict, measured)` helper, a printed caveat block, and a summary table. **Copy its two caveats verbatim** — this is a reconstruction, not production's database; and `efnafraedi-2e` is registered by the script, not by the admin route (§C35).

- [ ] **Step 1: Write the gate script**

Gates, in order. Each must print what it measured, not merely a verdict.

```
gate 0  CSV identity — SHA-256 of tools/data/SHsnid.csv equals
        9c10d70d73c03168f05f152616b8cafa6e4275e7db8701338f5f3c48a45b7ab6,
        asserted BEFORE anything else and streamed, so a data swap reports as a
        data swap rather than as a code regression. Exit 2 if the file is absent.

setup   buildCorpusDb(corpusDir) + seedBooks(db). ASSERT the reconstruction:
        concept = 70187 and concept_term = 192189. A divergence here invalidates
        every number below, so it stops the run.

fidelity  runScript('verify-resolve-gates.js', ['--db', scratchPath]) — B1's own
        gate on THIS database. What converts caveat 1 from a disclaimer into a
        measurement. If that script cannot take a --db, run it as B4a's gate does
        and record the mechanism used.

gate 1  `afl` is REFUSED and named, with both entries reported (kk + hk).
        Assert it is in the report's `refusals`, and that its concept_term rows
        still have inflections IS NULL.

gate 1b `hverfa` and `vinna` are RESCUED to the kvk noun. Asserted BY IDENTITY:
        the stored forms must contain NONE of horfinn, horfið, unninn, unnið.
        ⚠️ This gate did not exist until D4.2 was adopted and the spec's table
        asserted the opposite — a gate written against a superseded decision
        passes or fails for reasons unconnected to the code.

gate 2  THE CONTROL, and it is what makes gate 1 mean anything: a run that
        refused everything would pass gate 1 perfectly. Assert rows.written > 0,
        strings.unambiguous > 0, and pick one unambiguous term and show its
        paradigm is non-empty.

gate 3  INERTNESS. Seed the C24 fixture (server/__tests__/fixtures/c24-terms.json,
        c24-segments.json) into the OLD terminology tables the way
        findTermsGolden.test.js's seedFixture does, capture
        findTermsInSegments(segments, 'efnafraedi-2e'), run the population, and
        capture again. The two must be deeply equal.
        ⚠️ ASSERT THE CAPTURE IS NON-EMPTY FIRST — matches > 0 and issues > 0.
        Without that, an unseeded database gives two identical empty results and
        the gate passes for the wrong reason.

gate 4  🔴 THE LICENCE CONTROL (D6). Build the resolved glossary payload for
        efnafraedi-2e before and after the population and assert NO term object
        gains an `inflections` key, at any depth. Assert the payload is non-empty
        first — an empty payload trivially has no inflections key.

gate 5  D5 idempotency. Re-run with --execute; assert rows.written === 0 and that
        alreadyPopulatedBefore === alreadyPopulatedAfter and both equal the
        previous run's after-count. Report all three: "already populated" and
        "nothing matched" must be distinguishable.
```

- [ ] **Step 2: Run it**

Run: `node server/scripts/verify-b4b0-gates.js`
Expected: every gate PASS, exit 0. Record the wall time and the measured bucket table.

- [ ] **Step 3: Prove at least one gate can fail**

Temporarily invert `chooseEntry`'s rescue condition to `nouns.length >= 1` (so it picks a noun even when several exist) and re-run. Gate 1 must go red on `afl`. Revert, and confirm `git diff server/lib/binInflections.js` is **empty** before continuing.

- [ ] **Step 4: Commit**

```bash
git add server/scripts/verify-b4b0-gates.js
git commit -m "test(B4b-0b): the corpus gate — six gates plus a fidelity control

Gate 2 is what makes gate 1 mean anything: a run that refused everything
would pass gate 1 perfectly. Gates 3 and 4 assert their captures are
NON-EMPTY before comparing, because an unseeded database makes both pass for
the wrong reason. Observed failing by inverting the D4.2 rescue condition."
```

---

## Task 8: Evidence and the register

**Files:**
- Modify: `test-results/b4b-matcher-cutover-2026-08.md`
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md`

- [ ] **Step 1: Append the B4b-0b evidence section**

Add a dated section to `test-results/b4b-matcher-cutover-2026-08.md` (append; do not edit the existing B4b-0a content). It must carry:

- The scratch-corpus reconstruction and its control: `concept` 70,187 / `concept_term` 192,189, matching §C36 B2 exactly.
- The candidate set **in both units**: 74,004 rows / 53,719 distinct strings / 1.378 rows per string / 18,299 multi-word rows skipped.
- The measured bucket table in both units (spec §5 carries the same table — cite it, do not diverge from it).
- 🔴 The yield headline: **71.18% of candidate strings are not in BÍN**; a full run writes 14,299 of 53,719 strings (26.6%), 25,810 of 74,004 rows. This is §7's compounder prediction landing, and it is a **B4b-1 acceptance input**.
- The two independent confirmations: the three worked cases reproduce (`afl` refused, `hverfa`/`vinna` rescued), and D4.2's rescue share is 30.8% here against 30.3% on the old model.
- The union-equivalence result: 0 mismatches over 23,995 golden words, 7,285 hits / 16,710 misses.
- The input-guard measurement: 0 of 7,425,931 rows fail either half; 16 distinct word classes; KRISTINsnid is 15 fields.
- ⚠️ **No BÍN forms.** Name strings, BÍN ids and word classes only — never paradigms. §C41's ShareAlike constraint has no evidence-file exemption.

- [ ] **Step 2: Update the register**

In `docs/plans/2026-07-21-post-item17-followup-campaign.md`, under §C36's B4b block, replace the `▶ NEXT IS B4b-0b` bullet with B4b-0b's outcome, and add the new finding below. Then update the ⏩ RESUME block's top bullet. Per § *One source of truth*: **do not restate the numbers** — cite the spec and the evidence file.

The new finding to log (measured this session, out of B4b-0b's scope):

> **🆕 §C43 (NEW, P1, 2026-08-10) — `resolve()` RETURNS THE PLACEHOLDER STRING `[vantar]` AS A WINNING TRANSLATION, WITH NO INTEGRITY FAULT.** 201 concepts hold `[vantar]` ("missing") as their Icelandic term, and for all 201 it is the **only** Icelandic term, so it is the head form. Measured on the rebuilt corpus: `resolve(scope,'abembryonic pole')` returns `{text:'[vantar]', reason:'head-form', integrity:[]}` — no existing fault code sees it. **Not currently in any committed artifact**, because every book's `glossary-unified.json` still carries the merge-glossary fingerprint and the producer gate refuses the resolved exporter; **it becomes reader- and MT-visible the moment a book is `--adopt`ed.** So it is a **blocker for the first adopt**, not for B4b-0b. ⚠️ It also shows the integrity codes test *structure* (ties, scope, missing terms) and not *content*: a well-formed term that is not a word passes every one — the same shape as [[concept-priority-overrules-consensus]], where a wrong-but-well-formed translation is invisible to every mechanical gate.

- [ ] **Step 3: Commit**

```bash
git add test-results/b4b-matcher-cutover-2026-08.md docs/plans/2026-07-21-post-item17-followup-campaign.md docs/superpowers/specs/2026-08-10-terminology-concept-model-part-b4b0-design.md
git commit -m "docs(B4b-0b): evidence, register status, and §C43

Also carries the spec corrections made before implementation: §5's input-guard
row and §6's guard bullet both specified the guard against KRISTINsnid, which
D2-as-demoted had already ruled out — implemented literally they refuse the
only file the script reads. Fixed in the spec rather than logged, per
CLAUDE.md § One source of truth."
```

---

## Task 9: Whole-branch adversarial review

- [ ] **Step 1: Run the authoritative gate**

Run: `npm test` from the repo root, and `node server/scripts/verify-b4b0-gates.js`. Record what you actually saw.

- [ ] **Step 2: Blind-pair adversarial review of the whole branch**

Per the campaign's standard. The two highest-value targets, from where defects have actually been found in this thread:

1. **The input guard's positive identification** — can any file that is not SHsnid reach the write path? Can any real SHsnid row be refused?
2. **The bucket partition** — is there a candidate string that lands in two buckets, or none? Does the row partition hold when a string's rows are split across a `--limit` boundary?
3. **The CLI beyond the measured half.** B4b-0a's own review found `--limit <non-integer>` processing every row while printing a plausible summary — *a measurement generalised one step past its coverage*. The golden exercises the pure functions and never the CLI; assume the same gap exists here until it is closed.

- [ ] **Step 3: Fix what the review confirms, then re-review the fixes.**

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/c36-b4b0b-pos-aware-inflections
gh pr create --title "§C36 B4b-0b — pos-aware BÍN inflections onto concept_term" --body "..."
```

⚠️ `git fetch origin` first if a previous `gh pr merge --delete-branch` ran in this clone — otherwise a 2 GiB remote-reject hides behind `| tail`.

⚠️ **Pushing to `main` strands prod's content backup** until the next deploy. This branch does not push to `main`, but the merge will; say so in the PR body.

---

## Self-Review

**Spec coverage:** D1 → Task 4 · D2 (SHsnid, corrected) → Tasks 1, 4 · D3 → Task 1 · D4 → Task 2 · D4.1 → Task 8's evidence · D4.2 → Task 2, gate 1b · D5 → Task 5, gate 5 · D6 → gate 4 · D7 → Task 1's guard · §5's script table → Tasks 4–5 · §5's counting unit and `base-form-only` → Task 5 · §6 unit list → Tasks 1–2, 5 · §6 corpus gate → Task 7 · §7 deferred → recorded, not implemented · §9 attribution → the `USAGE` credit block is preserved in Task 5.

**Not covered, deliberately:** §9's closing note that **Ritstjóri must carry BÍN credit once this writes** is a UI task with no home in this PR — it belongs with B4c, which is the first slice with an editor surface. Task 8's register update must log it rather than let it disappear; it is a licence obligation, not a nicety.

**Known gap:** §C42 — the propose route still writes `terminology_translations.inflections`, so an editor's inflection between now and Part C never reaches the concept model and nothing goes red. Already logged in the register; **Part C must not drop the old tables while it is open.**
