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
import fs from 'fs';
import readline from 'readline';

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

export { loadBinData };
