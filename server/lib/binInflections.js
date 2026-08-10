/**
 * BÍN inflection lookup — the pure half of server/scripts/fetch-bin-inflections.js.
 *
 * ⚠️ PORTED FROM tools/fetch_bin_inflections.py AND DELIBERATELY BEHAVIOUR-
 * IDENTICAL TO IT (register §C36 B4b-0a). Every quirk below is the Python's
 * quirk and is pinned by server/__tests__/binInflectionsGolden.test.js, whose
 * oracle was captured from the Python before this file existed. If you are
 * tempted to "clean up" something here, that is B4b-0b's job, not this file's.
 *
 * ⚠️ Lives in server/ (AGPL-3.0), alongside import-concepts.js and the rest of the
 * concept-model data ops. An earlier draft put it in tools/ (MIT), which forced a
 * .cjs bridge and put better-sqlite3 out of reach; re-homed 2026-08-10.
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
