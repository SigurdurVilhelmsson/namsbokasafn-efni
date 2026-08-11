/**
 * §C36 B4b-1 — the concept-backed data source for findTermsInSegments.
 *
 * Why this is a module and not three functions in terminologyService: the
 * service is already ~2,100 lines, and these are the only parts of the
 * cut-over that can be unit-tested without its DB singleton.
 */

const { isWholeWordAt } = require('./wordBoundary');

/** §C43: 201 concepts carry this as their ONLY Icelandic term, so it is their
 *  head form and resolve() returns it as a winner with integrity: []. It must
 *  never reach an editor. Filtering here does NOT close §C43. */
const PLACEHOLDER_TEXT = '[vantar]';

/**
 * Is this English entry a SYMBOL — an element symbol or short acronym whose own
 * capitalisation is the only thing separating it from an ordinary English word?
 *
 * Short AND carrying an uppercase letter. `As` `At` `Be` `In` `No` `A` `OR`
 * `ALL` qualify; `ion` does not (no capital, so it is ordinary vocabulary),
 * `ELISA` does not (long enough that its folded form collides with nothing).
 *
 * ⚠️ EXPORTED SO NOBODY RE-IMPLEMENTS IT. This repo has the scar: gate 4 shipped
 * with a PRIVATE copy of `nocaseKey` and therefore policed a function it could
 * not observe. A second copy of this predicate would let the matcher and its
 * gate disagree about what a symbol is, silently.
 *
 * ⚠️ The ≤3 boundary is a judgement, not a measurement: at ≤3 the folded forms
 * are common English words (as, at, be, in, no, a, or, all), and by 4+ they are
 * not. Widening it would start costing real matches on lowercase-written
 * acronyms; narrowing it would let `ALL` and `OR` back through.
 *
 * @param {string} text - an English concept_term text
 * @returns {boolean}
 */
function isSymbolShaped(text) {
  return typeof text === 'string' && text.length <= 3 && /[A-Z]/.test(text);
}

/**
 * English CLOSED-CLASS function words, which must never be reported as
 * terminology however the corpus spells them.
 *
 * ⚠️ THE SECOND HALF OF THE SAME PRODUCTION FINDING, and `isSymbolShaped` alone
 * does not cover it — measured. After the symbol rule, the same ordinary
 * sentence still produced `in` → tomma, `at` → marsnákaætt, `no` → blóð-,
 * `is` → lófalægur and `and` → og, because Árnastofnun also carries these as
 * LOWERCASE terms. `in` really is the abbreviation for *inch*; this is a
 * legitimate term colliding with a function word, NOT corpus junk, which is why
 * the fix belongs in the matcher and not in the import.
 *
 * ⚠️ CLOSED-CLASS ONLY, and that boundary is the whole safety argument: articles,
 * prepositions, conjunctions, pronouns, auxiliaries and a few determiners. No
 * content word appears here. A content word that is also noisy — `point`,
 * `practice`, `same` — is a judgement about THAT term's usefulness and belongs to
 * the editors, not to a hardcoded list in the matcher.
 */
const EN_FUNCTION_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'nor',
  'so',
  'yet',
  'if',
  'than',
  'then',
  'because',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'from',
  'with',
  'as',
  'into',
  'onto',
  'over',
  'under',
  'about',
  'between',
  'through',
  'during',
  'per',
  'via',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'am',
  'do',
  'does',
  'did',
  'has',
  'have',
  'had',
  'can',
  'could',
  'may',
  'might',
  'must',
  'shall',
  'should',
  'will',
  'would',
  'i',
  'it',
  'its',
  'he',
  'she',
  'they',
  'them',
  'we',
  'us',
  'you',
  'this',
  'that',
  'these',
  'those',
  'there',
  'here',
  'which',
  'who',
  'whom',
  'whose',
  'what',
  'when',
  'where',
  'while',
  'how',
  'why',
  'no',
  'not',
  'all',
  'any',
  'both',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'only',
  'own',
  'same',
  'too',
  'very',
  'one',
  'two',
  'up',
  'out',
  'off',
  'down',
  'again',
  'further',
  'once',
]);

/**
 * Should this SURFACE form — the text as it appears in the English content, not
 * the corpus entry — be refused as a terminology match?
 *
 * ⚠️ IT KEYS ON THE SURFACE, NOT THE ENTRY, AND THAT IS LOAD-BEARING. `NO`
 * written in full caps is nitric oxide and must still match; `no` and `No` are
 * the English word. So a fully-uppercase surface of two or more characters is
 * exempt, and everything else that folds to a function word is refused.
 *
 * ⚠️ Single characters get no exemption: a sentence-initial `A` is the article
 * far more often than it is the ampere, and `A` is unreachable as a symbol in
 * running prose anyway.
 *
 * @param {string} surface - the matched text exactly as it appears in the source
 * @returns {boolean}
 */
function isFunctionWordSurface(surface) {
  if (typeof surface !== 'string' || !EN_FUNCTION_WORDS.has(surface.toLowerCase())) return false;
  const shoutedSymbol = surface.length >= 2 && surface === surface.toUpperCase();
  return !shoutedSymbol;
}

/**
 * Is this English entry a token that is NOT TRANSLATED between languages?
 *
 * ⚠️ A DIFFERENT QUESTION FROM `isSymbolShaped`, AND THE TWO MUST NOT BE MERGED.
 * `isSymbolShaped` answers "may this match at all", and is case-sensitive because
 * that is what stops `in` reaching indium. This one answers "must this be
 * TRANSLATED", and it is deliberately wider: it also admits any SINGLE character,
 * because a lone letter in running text is a variable or a unit — `m` is metre,
 * `s` is second, `b` is a coefficient — and those are as language-invariant as
 * `O`, whatever their case.
 *
 * Widening is safe here in a way it would NOT be on the matching side, and the
 * reason is structural: this predicate only ever gates an exemption that ALSO
 * requires the Icelandic to already contain the same token. It can suppress a
 * false alarm; it cannot hide a real omission.
 *
 * Measured on `efnafraedi-2e 3:m68700`: the capitalised class (`H` `C` `O` `Cl`
 * `Na` …) fell to ZERO under `isSymbolShaped` alone, leaving 43 lowercase
 * single-letter issues — the same defect in lower case.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isUntranslatedToken(text) {
  return typeof text === 'string' && (text.length === 1 || isSymbolShaped(text));
}

/**
 * Does `text` contain `symbol` as a whole word, in exactly that case?
 *
 * ⚠️ WHY THIS EXISTS: a chemical symbol is LANGUAGE-INVARIANT. The Icelandic for
 * `O` is `O`, not `súrefni` — the name exists, but running text writes the
 * symbol. The Icelandic-side QA check asks "does the translation contain the
 * Icelandic term", which for a symbol demands a translation that must never
 * happen, and then reports a `missing` that is simply false.
 *
 * Measured in the §C50 re-measurement (2026-08-11), on real module content:
 * after §C52 the top offenders in `efnafraedi-2e 3:m68700` were `H` (48 issues),
 * `C` (36), `O` (31), then `Cl` `Na` `Al` `Ca` `Cu` `Au` — **all matched
 * CORRECTLY**, all producing false `missing`s. 76 of that module's 572 non-tie
 * issues were single letters.
 *
 * ⚠️ CASE-SENSITIVE, and that is the safety property. `isWholeWordAt`'s class is
 * case-insensitive by design (see its docstring — the `i` is load-bearing for a
 * single Unicode code point), but the TOKEN comparison here is exact: `O` is
 * oxygen, `o` is not. This runs only for entries `isSymbolShaped` already
 * accepted, so it can never exempt ordinary vocabulary — an editor who leaves an
 * English word untranslated still fails QA, which is pinned by a control test.
 *
 * @param {string} text - the Icelandic content
 * @param {string} symbol - the English symbol, e.g. 'O', 'Cl', 'pH'
 * @returns {boolean}
 */
function containsSymbolToken(text, symbol) {
  if (typeof text !== 'string' || typeof symbol !== 'string' || !symbol) return false;
  let from = 0;
  for (;;) {
    const at = text.indexOf(symbol, from);
    if (at === -1) return false;
    if (isWholeWordAt(text, at, at + symbol.length)) return true;
    from = at + 1;
  }
}

/**
 * Does the match at `index` begin a sentence?
 *
 * ⚠️ THIS EXISTS TO SETTLE A REAL CONFLICT BETWEEN THE TWO RULES ABOVE, and
 * without it the fix costs a chemistry textbook its chemistry. `As` is both the
 * correct symbol for arsenic and the capitalised form of a function word, so the
 * function-word rule alone refuses arsenic written exactly as a chemist writes
 * it. Position separates them: mid-sentence `As` is overwhelmingly the symbol,
 * sentence-initial `As` is overwhelmingly the word. Same for `In` `At` `No` `Be`.
 *
 * Looks BACKWARD over whitespace only — start of text, terminal punctuation, or
 * a closing tag (the content is HTML-ish) means sentence-initial.
 *
 * ⚠️ Deliberately crude. It cannot tell "Fig. 3" from an end of sentence, and it
 * does not need to: the consequence of a wrong answer here is one advisory
 * highlight appearing or not appearing, and both directions are recoverable by
 * the editor. Anything more would be sentence segmentation, which is a different
 * project.
 *
 * @param {string} text
 * @param {number} index - start offset of the match within `text`
 * @returns {boolean}
 */
function isSentenceInitial(text, index) {
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue;
    return ch === '.' || ch === '!' || ch === '?' || ch === ':' || ch === ';' || ch === '>';
  }
  return true; // nothing but whitespace before it
}

/**
 * FNV-1a over the (id, english) pairs, in SQL row order.
 *
 * ⚠️ MOVED HERE FROM terminologyService.fingerprintHeadwords, AND THE MOVE IS
 * THE POINT (spec §7.3). There it hashed `terminology_headwords` while the
 * automaton was built from the same array — a coupling that was structural and
 * so never asserted. Build the automaton from concept EN strings while the
 * fingerprint still reads the old table and editorial changes NEVER invalidate
 * the cache: stale matches for the whole process lifetime, and all four
 * existing cache tests pass anyway. Returning it from loadEnglishEntries,
 * computed over the very array that is returned, makes the coupling structural
 * again instead of a convention.
 *
 * ⚠️ The NUL separators are load-bearing: with no separator [[1,'a'],[2,'b']]
 * and [[1,'a2 b']] collide, and a SPACE is worse because a space is legal
 * inside a term. `\0` here is the two-character JS escape, not a raw NUL byte —
 * a raw byte would make this file binary to grep (CLAUDE.md § Commands).
 *
 * ⚠️ The 0x01000193 multiply is load-bearing: replacing it with 1 degrades this
 * to an order-blind XOR fold, under which 'atom' → 'atmo' would NOT invalidate.
 */
function fingerprintEntries(entries) {
  let hash = 0x811c9dc5;
  for (const { headwordId, english } of entries) {
    const chunk = `${headwordId}\0${english}\0`;
    for (let i = 0; i < chunk.length; i++) {
      hash ^= chunk.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash;
}

/**
 * One automaton entry per DISTINCT English string (spec D4.2).
 *
 * ⚠️ NOT one per concept_term ROW. 18.9% of English strings are carried by more
 * than one concept; one entry per row makes both ids match the SAME span, and
 * findTermsInSegments's `consumed` tiler then drops whichever arrives second —
 * a database row order deciding an editorial answer, which is §C18's defect.
 * The homograph choice belongs to resolve(), which has domain priority, the
 * book preference and rank to decide it with.
 *
 * ⚠️ MIN(id) rather than any id: the handle must be stable across re-reads, or
 * the fingerprint changes when nothing did.
 *
 * ⚠️ Case-SENSITIVE, deliberately. conceptResolver.lookupCandidates matches
 * `text = ?` exactly and relies on idx_concept_term_lookup; a COLLATE NOCASE
 * grouping here would hand it a string it cannot find. The automaton folds case
 * downstream via foldString — that is a THIRD identity, and gate 4 is what
 * proves the three agree.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{entries: Array<{headwordId:number, english:string}>,
 *            englishById: Map<number,string>, fingerprint: number}}
 */
function loadEnglishEntries(db) {
  const rows = db
    .prepare(
      // ⚠️ THE ORDER BY IS FOR FINGERPRINT STABILITY ONLY — it is NOT the
      // longest-first match precedence it looks like, and no test pins it on
      // purpose (both whole-branch reviewers re-derived this independently,
      // 2026-08-11). The old matcher's ORDER BY LENGTH DESC *was* load-bearing;
      // the cut-over moved that job to `findTermsInSegments`'s own `hits.sort`,
      // a TOTAL order (tier, english.length desc, headwordId — and headwordId is
      // unique, so it never ties). `buildTermAutomaton` builds an
      // order-insensitive Map, and `findFirstOccurrences` reduces per headword
      // independently, so row order cannot reach the output.
      //
      // What it does protect: `fingerprintEntries` is order-SENSITIVE by
      // construction (that is its point), so if SQLite's GROUP BY output order
      // ever shifted between versions the fingerprint would move for a corpus
      // that had not changed. Cost of that: ONE spurious automaton rebuild
      // (~177 MB, measured) — never a wrong answer. A test pinning this SQL
      // text would enshrine a vestige and teach the next reader that entry order
      // is load-bearing downstream, which is now false.
      `SELECT MIN(id) AS id, text
         FROM concept_term
        WHERE lang = 'en'
        GROUP BY text
        ORDER BY LENGTH(text) DESC, id ASC`
    )
    .all();

  const entries = [];
  const englishById = new Map();
  for (const r of rows) {
    entries.push({ headwordId: r.id, english: r.text });
    englishById.set(r.id, r.text);
  }
  return { entries, englishById, fingerprint: fingerprintEntries(entries) };
}

/**
 * Hoisted per scope, not prepared per call — B1 gate 4 measured preparing
 * per call at 4.2x the wall time and 21.7x the resident memory.
 */
function prepareParadigmStatement(db) {
  return db.prepare('SELECT inflections FROM concept_term WHERE id = ?');
}

/**
 * The stored BÍN paradigm for one Icelandic term, or [].
 *
 * ⚠️ [] IS THE CORRECT DEGRADATION, NOT A FAILURE. buildInflectionRegex(text, [])
 * yields a correct base-form word-boundary regex, and ~70% of Icelandic rows
 * have no paradigm (71.18% of strings are absent from BÍN, plus 18,299
 * multi-word rows the producer skips permanently). The register's ruling is
 * explicit: degrade to base-form matching rather than report a fault.
 *
 * ⚠️ NEVER THROWS ON A STORED VALUE. `'[]'` is truthy and parses to [] harmlessly,
 * but the four-byte string `'null'` is truthy, parses to a non-iterable, and
 * `[text, ...null]` throws TypeError inside a request. The B4b-0b producer writes
 * only non-empty JSON arrays; this guards a future writer.
 *
 * ⚠️ The `try` deliberately does NOT cover `stmt.get()`. A type-confused `termId`
 * is a CALLER bug — better-sqlite3 throws for an object or a boolean — and it is
 * left loud on purpose: swallowing it would hide the mistake at its only visible
 * moment, and would also mask get-time DB faults (locked, IO error) as "this term
 * has no paradigm". Missing table/column already fails at prepare() time.
 */
function paradigmFor(stmt, termId) {
  const row = stmt.get(termId);
  if (!row || !row.inflections) return [];
  try {
    const parsed = JSON.parse(row.inflections);
    return Array.isArray(parsed) ? parsed.filter((f) => typeof f === 'string' && f) : [];
  } catch {
    return [];
  }
}

module.exports = {
  loadEnglishEntries,
  fingerprintEntries,
  prepareParadigmStatement,
  paradigmFor,
  PLACEHOLDER_TEXT,
  isSymbolShaped,
  isFunctionWordSurface,
  isSentenceInitial,
  containsSymbolToken,
  isUntranslatedToken,
};
