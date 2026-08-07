// server/scripts/verify-concept-import.js
/**
 * Assert the imported model reproduces what was measured on production
 * 2026-08-07. An import that RUNS is not an import that is RIGHT.
 *
 * Read-only: this script opens no transaction and writes no row. It is safe to
 * run against a live database.
 */
const DOMAINS = new Set([
  'biology',
  'chemistry',
  'physics',
  'astronomy',
  'anatomy-physiology',
  'mathematics',
  'earth-science',
]);

/**
 * Icelandic term → a TAG naming which sense that term denotes.
 *
 * ⚠️ The tag is a SENSE LABEL, not a lookup against `concept.domain`. It is
 * only ever compared tag-to-tag, to tell two senses apart. Nothing here is
 * matched against a concept's domain column — see the check below for why
 * that distinction is load-bearing.
 *
 * PROVENANCE — these are not fixtures invented for a test. They are the
 * production measurement recorded in the docstring of
 * `server/migrations/045-concept-model.js`, which predates this script:
 * English `cell` was one headword row carrying five translations drawn from
 * THREE Íðorðabankinn entries — biology `fruma`, physics `rafhlað`,
 * mathematics `flokkur`. Separating exactly those senses is why the concept
 * model exists, so they are what a verification pass must pin.
 *
 * ⚠️ `flokkur` is deliberately NOT listed. It is the ordinary Icelandic word
 * for the taxonomic rank *class*, so tagging it `mathematics` would make any
 * biology concept that legitimately carries it look contaminated. A row is
 * only safe when the term denotes one sense and no other; adding one requires
 * that measurement, not a guess.
 */
const MEASURED_SENSE_DOMAINS = Object.freeze({
  fruma: 'biology',
  rafhlað: 'physics',
});

function verifyConceptImport(db) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  // ⚠️ FIRST, because every other check counts bad things and asserts the count
  // is zero — which an EMPTY model satisfies trivially. Without this, a run that
  // imported nothing at all reports ok:true on all four, and the caller that
  // gates on `ok` cannot tell "verified" from "there was nothing to verify".
  //
  // This is reachable in practice and silently: `runImport` on an empty or
  // wrong directory finds no `raw-*.json`, returns [], writes no rows, and
  // every downstream check passes. Task 6's report DOES compute yield (its
  // per-collection `imported` counts and ZERO YIELD flag) but only PRINTS it;
  // this function is what callers GATE on. The thing that measured emptiness
  // could not stop a release, and the thing that stops a release could not
  // measure it — so the measurement belongs here too.
  const conceptCount = db.prepare('SELECT COUNT(*) n FROM concept').get().n;
  add('model-is-non-empty', conceptCount > 0, `${conceptCount} concepts imported`);

  const noIs = db
    .prepare(
      `SELECT COUNT(*) n FROM concept c
        WHERE NOT EXISTS (SELECT 1 FROM concept_term t
                           WHERE t.concept_id = c.id AND t.lang = 'is')`
    )
    .get().n;
  add('every-concept-has-icelandic', noIs === 0, `${noIs} concepts with no Icelandic term`);

  const badHeads = db
    .prepare(
      `SELECT COUNT(*) n FROM (
         SELECT concept_id FROM concept_term WHERE lang='is'
          GROUP BY concept_id HAVING SUM(CASE WHEN rank=1 THEN 1 ELSE 0 END) <> 1)`
    )
    .get().n;
  add(
    'one-head-form-per-concept',
    badHeads === 0,
    `${badHeads} concepts without exactly one head form`
  );

  // ── homographs-separated ─────────────────────────────────────────────────
  //
  // ⚠️ WHAT THIS VERIFIES, AND WHAT IT DOES NOT. The check's name overclaims,
  // and the name cannot change (callers look it up by string), so the gap is
  // documented here instead.
  //
  // A "sense" is not representable in this schema — there is no column that
  // says which sense a term belongs to. So general sense separation is NOT
  // verified and cannot be. What IS verified: no SINGLE concept carries two
  // terms that were measured as denoting DIFFERENT senses.
  //
  // ⚠️ This rule is deliberately INTRA-CONCEPT and never reads
  // `concept.domain`. An earlier version compared each oracle term against
  // that column and was WRONG: `domain` is derived from COLLECTION_DOMAIN, so
  // it records WHICH COLLECTION AN ENTRY CAME FROM, not which sense a term
  // denotes. `fruma` correctly appears in both LIFORD (biology) and LAEKN
  // (anatomy-physiology, 33,593 medical terms for exactly these chapters), and
  // the old rule turned RED on that entirely correct import. Comparing tags
  // only to each other, within one concept, makes that false-fire structurally
  // impossible rather than merely unlikely.
  //
  // Coverage is therefore one oracle PAIR wide, not one row per term: the gate
  // fires only when two differently-tagged terms land on the SAME concept.
  //
  // Why this shape rather than a structural rule. A *cross-entry merge* — two
  // Íðorðabankinn entries collapsing onto one concept — is unreachable by
  // construction, not merely unlikely: `importConcepts` looks concepts up by
  // `idordabanki_id`, inserts exactly one per entry, and `concept.idordabanki_id`
  // is UNIQUE (migration 045), so the schema cannot represent the merge. The
  // residual risk is the opposite shape: ONE entry that itself lists another
  // sense's term among its synonyms. Íðorðabankinn is authoritative but
  // self-inconsistent, so that is a live source-data risk — and it is exactly
  // the state the control test seeds.
  //
  // That case is invisible to any structural rule. Inside one concept,
  // contamination (`fruma` + synonym `rafhlað`) and a legitimate synonym pair
  // (`frumeind` + synonym `atóm`) are byte-for-byte the same shape: one rank-1
  // head plus one rank-2 synonym. Only external knowledge of what the terms
  // MEAN separates them, which is why the oracle above must be external.
  const oracleTerms = Object.keys(MEASURED_SENSE_DOMAINS);
  const senseTags = new Set(Object.values(MEASURED_SENSE_DOMAINS));
  if (oracleTerms.length < 2 || senseTags.size < 2) {
    // Fail loud. The rule fires only on two DIFFERENTLY-tagged terms meeting on
    // one concept, so fewer than two distinct tags makes it inert — and a check
    // that cannot fail is not a check. It would report ok:true forever.
    throw new Error(
      'MEASURED_SENSE_DOMAINS needs at least two terms carrying at least two ' +
        'distinct sense tags — homographs-separated cannot fire otherwise, and ' +
        'would pass vacuously. Restore the measured terms rather than shipping ' +
        'an inert gate.'
    );
  }

  // `lang='is'` matters: an oracle string colliding with a Latin term must not
  // count. UNIQUE(concept_id, lang, text) already rules out the same term
  // appearing twice on one concept, so every row here is a distinct term.
  const byConcept = new Map();
  for (const r of db
    .prepare(
      `SELECT concept_id AS conceptId, text
         FROM concept_term
        WHERE lang='is' AND text IN (${oracleTerms.map(() => '?').join(',')})`
    )
    .all(...oracleTerms)) {
    if (!byConcept.has(r.conceptId)) byConcept.set(r.conceptId, []);
    byConcept.get(r.conceptId).push(r.text);
  }

  const contaminated = [];
  for (const [conceptId, texts] of byConcept) {
    const tags = new Set(texts.map((t) => MEASURED_SENSE_DOMAINS[t]));
    if (tags.size > 1) {
      contaminated.push(
        `concept ${conceptId} carries ${texts
          .map((t) => `'${t}' (${MEASURED_SENSE_DOMAINS[t]})`)
          .join(' + ')}`
      );
    }
  }

  add(
    'homographs-separated',
    contaminated.length === 0,
    `${contaminated.length} concepts carrying terms of two measured senses` +
      (contaminated.length ? ` (${contaminated.join('; ')})` : '')
  );

  const unknown = db
    .prepare('SELECT DISTINCT domain FROM concept')
    .all()
    .map((r) => r.domain)
    .filter((d) => !DOMAINS.has(d));
  add(
    'domains-are-known',
    unknown.length === 0,
    `unknown domains: ${unknown.join(', ') || 'none'}`
  );

  return { ok: checks.every((c) => c.ok), checks };
}

module.exports = { verifyConceptImport, DOMAINS };
