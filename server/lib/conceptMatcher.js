/**
 * §C36 B4b-1 — the concept-backed data source for findTermsInSegments.
 *
 * Why this is a module and not three functions in terminologyService: the
 * service is already ~2,100 lines, and these are the only parts of the
 * cut-over that can be unit-tested without its DB singleton.
 */

/** §C43: 201 concepts carry this as their ONLY Icelandic term, so it is their
 *  head form and resolve() returns it as a winner with integrity: []. It must
 *  never reach an editor. Filtering here does NOT close §C43. */
const PLACEHOLDER_TEXT = '[vantar]';

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
 * ⚠️ NEVER THROW. `'[]'` is truthy and parses to [] harmlessly, but the
 * four-byte string `'null'` is truthy, parses to a non-iterable, and
 * `[text, ...null]` throws TypeError inside a request. The B4b-0b producer
 * writes only non-empty JSON arrays; this guards a future writer.
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
};
