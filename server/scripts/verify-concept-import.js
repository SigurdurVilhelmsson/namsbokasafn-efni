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
 * Icelandic term → the domain whose sense it names.
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
 * for the taxonomic rank *class*, so a `flokkur → mathematics` row would fire
 * on biology concepts that are entirely correct. An oracle row is only safe
 * when the term names one domain's sense and no other; adding one requires
 * that measurement, not a guess.
 */
const MEASURED_SENSE_DOMAINS = Object.freeze({
  fruma: 'biology',
  rafhlað: 'physics',
});

function verifyConceptImport(db) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

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
  // verified and cannot be. What IS verified: every Icelandic term whose
  // domain was MEASURED on production sits on a concept of that measured
  // domain. That is a spot-check over known homographs, not a universal
  // detector, and it is only as wide as MEASURED_SENSE_DOMAINS above.
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
  if (oracleTerms.length === 0) {
    // Fail loud. An empty oracle makes this check vacuous, and a check that
    // cannot fail is not a check — it would report ok:true forever.
    throw new Error(
      'MEASURED_SENSE_DOMAINS is empty — homographs-separated would pass vacuously. ' +
        'Restore the measured terms rather than shipping an inert gate.'
    );
  }
  const misplaced = db
    .prepare(
      `SELECT c.id AS conceptId, c.domain AS domain, t.text AS text
         FROM concept_term t JOIN concept c ON c.id = t.concept_id
        WHERE t.lang='is' AND t.text IN (${oracleTerms.map(() => '?').join(',')})`
    )
    .all(...oracleTerms)
    .filter((r) => MEASURED_SENSE_DOMAINS[r.text] !== r.domain);

  // DIAGNOSTIC ONLY — deliberately NOT gated. An Icelandic term that heads a
  // concept in one domain while appearing as a synonym in another is a
  // plausible contamination signal, but a term legitimately shared across two
  // fields (a biochemistry head in EFNAFR, a synonym in LIFORD) produces the
  // same pattern. It has never been measured at corpus scale, so gating on it
  // could fail the real 20-collection import for something that is not a
  // defect. Reported so it can be measured first, gated only if it proves out.
  const crossDomainOverlap = db
    .prepare(
      `SELECT COUNT(*) n FROM (
         SELECT DISTINCT head.text
           FROM concept_term head
           JOIN concept hc ON hc.id = head.concept_id
           JOIN concept_term syn ON syn.text = head.text AND syn.lang='is' AND syn.rank >= 2
           JOIN concept sc ON sc.id = syn.concept_id
          WHERE head.lang='is' AND head.rank = 1 AND sc.domain <> hc.domain)`
    )
    .get().n;

  add(
    'homographs-separated',
    misplaced.length === 0,
    `${misplaced.length} measured terms on a foreign-domain concept` +
      (misplaced.length
        ? ` (${misplaced
            .map(
              (r) =>
                `'${r.text}' on concept ${r.conceptId} (${r.domain}), measured ${MEASURED_SENSE_DOMAINS[r.text]}`
            )
            .join('; ')})`
        : '') +
      `; ${crossDomainOverlap} cross-domain head/synonym overlaps (diagnostic, not gated)`
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
