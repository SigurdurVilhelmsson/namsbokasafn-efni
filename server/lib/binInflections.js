/**
 * BÍN inflection lookup — the pure half of server/scripts/fetch-bin-inflections.js.
 *
 * ⚠️ THE CLAIM CHANGED WITH §C36 B4b-0b, AND SO DID WHAT THE GOLDEN PROVES.
 * B4b-0a's version of this file was a behaviour-identical port of
 * tools/fetch_bin_inflections.py: it keyed on the lowercased lemma and UNIONED
 * every BÍN entry sharing a spelling. B4b-0b replaces that lookup — the union
 * was the defect (see loadBinEntries) — so this file is no longer a port of
 * anything.
 *
 * What survives, and is stronger: server/__tests__/binInflectionsGolden.test.js
 * still runs against the SAME oracle, captured from the unmodified Python before
 * any Node existed (producer deleted; `git show 8072a58f` is the only surviving
 * copy). It now asserts that this loader, UNIONED BACK per lemma, reproduces the
 * Python's hashes exactly — verified 0 mismatches over 23,995 words. So the
 * golden pins live code and pins the layer where a CSV-parsing regression would
 * actually land, instead of certifying a function nothing calls.
 *
 * ⚠️ The union in that test is the ORACLE'S ADAPTER and must never be copied
 * into the script: production calls chooseEntry(), which refuses or rescues.
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
 * ⚠️ MEASURED OVER THE WHOLE FILE, NOT ASSUMED (2026-08-10). SHsnid.csv's field
 * 2 takes exactly these values across all 7,425,931 rows. The list is the owner;
 * do not restate its length in prose — an earlier draft of the spec said "17"
 * while listing 16.
 *
 * kk/kvk/hk = the three noun genders · so = verb · lo = adjective · ao = adverb ·
 * rt/fn/fs/to/uh/st/pfn/gr/afn/nhm = the closed classes.
 */
const WORD_CLASSES = new Set([
  'lo',
  'kvk',
  'kk',
  'hk',
  'so',
  'ao',
  'rt',
  'fn',
  'fs',
  'to',
  'uh',
  'st',
  'pfn',
  'gr',
  'afn',
  'nhm',
]);

/** D4.2's discriminator: the three noun genders. */
const NOUN_CLASSES = new Set(['kk', 'kvk', 'hk']);

const SHSNID_FIELDS = 6;
const KRISTINSNID_FIELDS = 15;

/**
 * Stream SHsnid.csv into `lemma.toLowerCase() -> BinEntry[]`, retaining only
 * lemmas present in `candidateLemmas`.
 *
 * ⚠️ GROUPED PER BÍN ENTRY (id + word class), NOT PER LEMMA. That is the whole
 * point of B4b-0b. The predecessor keyed on `word.lower()` and unioned every BÍN
 * lemma sharing a spelling, so `hverfa` — a kvk noun meaning *isomer* — carried
 * two complete conjugations of the unrelated verb *hverfa*, "to disappear":
 * roughly 50 of its 72 stored forms were not this word in any sense. Spec §2.2.1
 * confirms the mechanism against BÍN itself.
 *
 * ⚠️ THE CANDIDATE FILTER IS NOT AN OPTIMISATION YOU MAY DROP. Unrestricted this
 * index is ~700k entries over 7.4M form strings — multiple GB. Restricted to a
 * real candidate set it is ~17k entries. It changes NO semantics: every entry for
 * a retained lemma is retained, so D4's "more than one entry" test sees exactly
 * the population it would have seen unfiltered.
 *
 * ⚠️ STREAMED. 377 MB / 7,425,931 lines; readFileSync is both slow here and close
 * to Node's string limit.
 *
 * ⚠️ A PLAIN `split(';')`, NOT A CSV PARSER. Python used csv.reader, which treats
 * `"` as a quote character — but the real file contains ZERO double quotes
 * (measured), so the two agree on every row that exists. If a future BÍN release
 * introduces quoting, this is the line that has to change.
 *
 * ⚠️ REFUSES, NEVER SKIPS, on a malformed row — a deliberate change from the
 * ported Python, whose `len(row) < 5: continue` dropped one silently. A wrong
 * file must report as a wrong file. Note the trap inverts with the guard: a
 * LOWER-BOUND check would ACCEPT KRISTINsnid (15 fields) and read its field 4 —
 * a numeric code — as inflected forms. Corrupt yield reads as data, where zero
 * yield at least looks wrong. Hence positive identification: exact field count
 * AND a known word class.
 *
 * @param {string} csvPath
 * @param {Set<string>} candidateLemmas lowercased, trimmed
 * @returns {Promise<Map<string, Array<{binId:string,lemma:string,wordClass:string,forms:Set<string>}>>>}
 */
async function loadBinEntries(csvPath, candidateLemmas) {
  if (!(candidateLemmas instanceof Set) || candidateLemmas.size === 0) {
    throw new Error(
      'loadBinEntries: refusing an empty candidate set. It would load nothing and report a ' +
        'clean zero-yield run, which is indistinguishable from "BÍN does not have these words".'
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
            ? ' That is KRISTINsnid.csv, whose inflected form is at index 9, not 4 — reading it ' +
              'as SHsnid would write its numeric field 4 as inflections. Pass --bin-data ' +
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
    if (!lemma || !form) continue; // Python: `if lemma and form`
    const key = lemma.toLowerCase();
    if (!candidateLemmas.has(key)) continue;
    let entries = byLemma.get(key);
    if (!entries) {
      entries = [];
      byLemma.set(key, entries);
    }
    const binId = row[1].trim();
    // ⚠️ Linear find over `entries`, not a nested Map: a lemma has 1-3 BÍN
    // entries in practice (measured max on our candidate set is small), so the
    // scan is shorter than a Map allocation per lemma across ~15k lemmas.
    let entry = entries.find((e) => e.binId === binId);
    if (!entry) {
      entry = { binId, lemma, wordClass, forms: new Set() };
      entries.push(entry);
    }
    entry.forms.add(form); // a SET, so duplicates collapse
  }
  return byLemma;
}

/**
 * Pick the BÍN entry a string should take its paradigm from — or refuse.
 *
 * D4: an ambiguous string is REPORTED, never unioned and never guessed. A
 * deterministic tie-break — first id, largest paradigm, commonest word class —
 * would let an arbitrary rule decide an editorial answer. That is §C18's defect
 * (row order deciding which Icelandic word readers see) reproduced inside its own
 * successor, and §C38's (a mechanism that cannot express what the editor means)
 * one level down.
 *
 * ⚠️ THE RULE IS >1 ENTRY, NOT >1 WORD CLASS. The word-class split is what makes
 * contamination visible, but two same-class entries sharing a lemma are still two
 * different words.
 *
 * ⚠️ D4.2 IS A DELIBERATE, RECORDED EXCEPTION TO D4 — NOT A REFINEMENT OF IT.
 * D4 forbids picking; this picks. It is defensible only because the discriminator
 * is CATEGORICAL rather than arbitrary — "a glossary headword denotes a concept,
 * and a concept is a noun" is a statement about this corpus, where a first-id
 * tie-break would be a statement about nothing — and because it fires ONLY when
 * exactly one noun exists, so it never picks between nouns, which is where the
 * domain argument runs out. Its failure mode is paid for by `discarded`: the
 * caller reports every rescue with what it threw away, so a wrong pick is
 * discoverable after the fact instead of silent. It also is NOT always right:
 * measured 6 of 686 ambiguous strings on the old model have no noun entry at all
 * (genuine adjective headwords), and where such a headword also has a noun
 * homograph this rule silently prefers the noun.
 *
 * @param {Array<{binId:string,wordClass:string,forms:Set<string>}>} entries
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
 * One entry's inflected forms, base form excluded, code-point sorted.
 *
 * ⚠️ RETURNS `null`, NEVER `[]`. `null` means "no paradigm to write". An empty
 * array would encode as `"[]"` — a value the Python never emitted, and which
 * reads as a word that provably does not inflect rather than as an absence.
 * ⚠️ The caller must NOT fold this case into "not in BÍN": BÍN holding a word
 * with no distinguishable inflected form is a different fact from BÍN not
 * holding it, and the predecessor returned null for both.
 *
 * ⚠️ SORTED BY CODE POINT, matching Python's `sorted()`. A default
 * Array.prototype.sort() compares UTF-16 code units, which equals code-point
 * order across the BMP — and every Icelandic character is BMP. DO NOT use
 * localeCompare: under Icelandic collation 'ö' sorts after 'z', which would
 * reorder ~every accented paradigm and break the differential golden.
 *
 * @param {{forms: Set<string>}} entry
 * @param {string} key lowercased, trimmed lookup string
 * @returns {string[]|null}
 */
function inflectionsFor(entry, key) {
  const forms = [...entry.forms].filter((f) => f.toLowerCase() !== key).sort();
  return forms.length > 0 ? forms : null;
}

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

module.exports = {
  WORD_CLASSES,
  NOUN_CLASSES,
  loadBinEntries,
  chooseEntry,
  inflectionsFor,
  formatInflectionsJson,
};
