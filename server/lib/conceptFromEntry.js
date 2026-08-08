// server/lib/conceptFromEntry.js
/**
 * Turn one verbatim Íðorðabankinn API entry into a concept and its terms.
 *
 * Pure: no DB, no network. One ENTRY is one CONCEPT — the import never merges
 * (spec decision 1), so two entries sharing an English string stay two concepts
 * and `cell` comes out correct with no editorial work.
 *
 * `rank` carries Árnastofnun's own ordering: the head word is 1, its listed
 * synonyms are 2..n. That single field resolves 7,277 of 7,315 competing groups
 * measured on production — what the old model destroyed by flattening head form
 * and synonyms into sibling rows and bulk-stamping them all `approved`.
 */

/** Collection → OUR domain. Árnastofnun's collection is provenance only. */
const COLLECTION_DOMAIN = Object.freeze({
  EFNAFR: 'chemistry',
  LIFORD: 'biology',
  LIFORD2: 'biology',
  ERFDAFR: 'biology',
  ONAEMI: 'biology',
  LYFJAFRLYFJASTOFNUN: 'biology',
  FARALDSFRAEDI: 'biology',
  LYDHEILSA: 'biology',
  FUGLAR: 'biology',
  PODDUR: 'biology',
  EDLISFR: 'physics',
  STJARNA: 'astronomy',
  GEIMVISINDI: 'astronomy',
  LAEKN: 'anatomy-physiology',
  TANNL: 'anatomy-physiology',
  STAERDFRAEDI: 'mathematics',
  TOLFR: 'mathematics',
  LAND: 'earth-science',
  JARDFRAEDI2: 'earth-science',
  JARDEDLISFRAEDI: 'earth-science',
});

const LANGS = { EN: 'en', IS: 'is', LA: 'la' };

/**
 * Íðorðabankinn separates synonyms with commas. Measured across all 20
 * imported collections: 32,860 synonym fields, zero containing a semicolon;
 * 7,653 comma-only, of which 99.5% are genuine synonym lists. The `;` branch
 * below is kept anyway (lead ruling) — it does not fire on this corpus.
 */
function parseSynonyms(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function conceptFromEntry(entry, { collection, domain }) {
  const terms = [];
  for (const w of entry.words || []) {
    const lang = LANGS[String(w.fklanguage || '').toUpperCase()];
    if (!lang) continue; // the API returns up to 13 languages; we keep three
    const head = (w.word || '').trim();
    if (!head) continue;
    terms.push({ lang, text: head, rank: 1, source: 'idordabankinn' });
    parseSynonyms(w.synonyms).forEach((syn, i) => {
      terms.push({ lang, text: syn, rank: i + 2, source: 'idordabankinn' });
    });
  }

  // No Icelandic side means nothing to translate TO. An entry with no ENGLISH
  // side is kept on purpose — that is PODDUR, reachable via its Latin term.
  if (!terms.some((t) => t.lang === 'is')) return null;

  return {
    concept: {
      idordabankiId: entry.id ?? null,
      collection,
      domain,
      definitionEn: entry.definition_en ?? null,
      definitionIs: entry.definition_is ?? null,
    },
    terms,
  };
}

module.exports = { conceptFromEntry, COLLECTION_DOMAIN, parseSynonyms };
