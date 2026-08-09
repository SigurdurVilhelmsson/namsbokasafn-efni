// server/lib/conceptResolver.js
'use strict';
/**
 * §C36 Part B1 — the terminology resolver.
 *
 * Spec: docs/superpowers/specs/2026-08-08-terminology-concept-model-part-b1-design.md
 *
 * ⚠️ INERT. Nothing calls this yet: B3 cuts the glossary export over, B4 the
 * editor. It reads only tables Part A created, which hold 0 rows on production.
 *
 * The split is the performance design. Everything per-(book, chapter) is hoisted
 * into a Scope built ONCE; resolveCandidates is then PURE, so the editor can call
 * it 47,568 times without reproducing §C24's event-loop block.
 *
 * `db` is always passed EXPLICITLY, never taken from terminologyService's
 * singleton — that keeps this module testable and free of ambient state.
 */

/**
 * Merge a book's preference rows for one chapter: chapter rows win over the
 * chapter-0 default.
 *
 * ⚠️ KEYED ON THE ENGLISH STRING, LOWERCASED (B4a, register §C38). It was keyed
 * on concept_id until 2026-08-09, which could not express what an editor means:
 * one concept carries many English strings, so a row set while looking at one
 * string silently moved all the others.
 *
 * ⚠️ THE LOWERCASING IS NOT OPTIONAL AND MUST MATCH THE LOOKUP. The column is
 * COLLATE NOCASE so SQLite folds case, but a JS Map does not — key it with the
 * raw text and `preference.get('accuracy')` misses a row stored as 'Accuracy'.
 * The row would be stored and never found: silent, and the exact failure class
 * this slice exists to end. resolveCandidates lowercases its lookup to match.
 *
 * ⚠️ `tier` is CARRIED, not discarded. Parent spec §7.2 requires the editor panel
 * to say which rule fired, and this is the only place that still knows.
 *
 * ⚠️ `chapter` is NOT NULL with 0 as the book-default sentinel: in SQLite NULLs do
 * not compare equal inside a primary key, so a nullable chapter would permit two
 * conflicting "book defaults" for one string. -1 is the appendices sentinel.
 */
function buildPreferenceMap(db, bookId, chapter) {
  const rows = db
    .prepare(
      `SELECT english, term_id, chapter
         FROM book_term_preference
        WHERE book_id = ? AND chapter IN (0, ?)`
    )
    .all(bookId, chapter);

  const preference = new Map();
  for (const r of rows) {
    const tier = r.chapter === 0 ? 'book' : 'chapter';
    const key = r.english.toLowerCase();
    // A chapter row always wins; a book row only fills an empty slot. Order of
    // rows from SQLite is not relied on.
    if (tier === 'chapter' || !preference.has(key)) {
      preference.set(key, { termId: r.term_id, tier });
    }
  }
  return preference;
}

/**
 * The five statements `lookupCandidates` and Term B4a lookup need, prepared once.
 *
 * ⚠️ Spec §5 — "In B1 it is a prepared statement held on the scope." These are
 * hoisted onto the Scope by buildScope, NOT prepared per call. Gate 4 measured
 * the difference on the real corpus: preparing per call cost 190,275 prepares
 * for biology's 47,568 resolves, 4.2x the wall time and 21.7x the resident
 * memory (762.8 MB of churn against 35.2 MB). 1.5 GB RSS does not survive the
 * production Linode.
 *
 * ⚠️ A statement is bound to the CONNECTION that prepared it, so the bundle
 * CARRIES that connection and `lookupCandidates` checks it. An earlier version
 * guarded this in `resolve()` only, which left the hazard wide open one level
 * down: `lookupCandidates(dbB, 'force', scopeA.stmts)` answered from connection A
 * without complaint — the verbatim failure the guard existed to prevent.
 */
function prepareLookupStatements(db) {
  return {
    db,
    // ⚠️ No DISTINCT. It was provably dead — `concept_term` has
    // UNIQUE(concept_id, lang, text), so one English string cannot produce two
    // rows for the same concept — and it was not free: EXPLAIN QUERY PLAN showed
    // `USE TEMP B-TREE FOR DISTINCT` on every call, at 47,568 calls per book.
    // De-duplication that IS load-bearing happens on `byId` below, after
    // merged_into resolution, where two distinct concepts really can converge.
    hits: db.prepare(
      `SELECT c.id AS concept_id
         FROM concept_term t
         JOIN concept c ON c.id = t.concept_id
        WHERE t.lang = 'en' AND t.text = ?`
    ),
    merge: db.prepare('SELECT merged_into FROM concept WHERE id = ?'),
    concept: db.prepare('SELECT id, domain FROM concept WHERE id = ?'),
    terms: db.prepare(
      `SELECT id AS term_id, text, rank
         FROM concept_term
        WHERE concept_id = ? AND lang = 'is'
        ORDER BY rank ASC, id ASC`
    ),
    // B4a: distinguishes `preference-term-missing` (this returns undefined) from
    // `preference-not-a-candidate` (it returns a row, but no candidate for this
    // English string carries it). One code for both would name two faults with
    // different remedies — the gap D4 exists to close.
    termById: db.prepare('SELECT id AS term_id, concept_id FROM concept_term WHERE id = ?'),
  };
}

/**
 * Build the per-(book, chapter) scope.
 *
 * ⚠️ Returns WHICH fault, not a boolean (spec D3). 'unregistered' and
 * 'no-priorities' have different remedies — the admin route vs a migration — and
 * collapsing them repeats one level down the very failure D3 exists to prevent.
 *
 * ⚠️ The scope carries `db` and `stmts`. ⚠️ CORRECTED 2026-08-09 (B4a) — this
 * used to say "`resolveCandidates` reads NEITHER", which stopped being true the
 * moment step 6 landed. The narrower truth: `resolveCandidates` never touches
 * `scope.db`, and it reads exactly ONE statement, `scope.stmts.termById`, on the
 * preference-FAULT path alone (a preference row exists and no candidate carries
 * its term). conceptResolverResolve.test.js still imports no database at all —
 * it stubs that single statement — and a resolution that succeeds still issues
 * no query, so §C24's hoisting rationale is untouched.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} bookSlug
 * @param {number} [chapter] 0 = book default · 1..n = chapter · -1 = appendices
 * @returns {{unscoped:'unregistered'}|{unscoped:'no-priorities'}|object}
 */
function buildScope(db, bookSlug, chapter = 0) {
  const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
  if (!book) return { unscoped: 'unregistered' };

  const prio = db
    .prepare(
      'SELECT domain, position FROM book_domain_priority WHERE book_id = ? ORDER BY position'
    )
    .all(book.id);
  if (prio.length === 0) return { unscoped: 'no-priorities' };

  return {
    bookId: book.id,
    chapter,
    positionOf: new Map(prio.map((r) => [r.domain, r.position])),
    preference: buildPreferenceMap(db, book.id, chapter),
    db,
    stmts: prepareLookupStatements(db),
    unscoped: false,
  };
}

/**
 * Walk merged_into to the surviving concept.
 *
 * ⚠️ Import NEVER writes merged_into (parent spec decision 1), so a cycle means
 * editorial corruption. It must terminate and it must be visible — on a cycle we
 * stop at the LAST UNVISITED concept and report, rather than looping or throwing.
 *
 * ⚠️ CORRECTED 2026-08-09 (register §C39). This comment used to claim: "Resolving
 * THROUGH merged_into is what makes an editorial merge take effect with no data
 * migration: preference rows still naming the absorbed concept keep working."
 * THEY DO NOT. buildPreferenceMap keys its map on the RAW preference row's
 * concept_id; lookupCandidates reports the post-followMerge SURVIVOR id. The
 * lookup therefore misses, the `if (pref)` branch never runs, and NO integrity
 * code fires — a silent swallow. Pinned by conceptResolverScope.test.js's §C39
 * case. B4a's re-key onto the English string defuses this (it surfaces as
 * `preference-not-a-candidate`); Part C's merge tooling still has to face it.
 */
function followMerge(stmt, startId) {
  const seen = new Set([startId]);
  let id = startId;
  for (;;) {
    const row = stmt.get(id);
    const next = row ? row.merged_into : null;
    if (next == null) return { id, cycle: false };
    if (seen.has(next)) return { id, cycle: true };
    seen.add(next);
    id = next;
  }
}

/**
 * Find every concept having an 'en' term equal to `english`, resolved through
 * merged_into, with its Icelandic terms in rank order.
 *
 * ⚠️ Matching is EXACT and BINARY. Normalisation is the caller's job — C24's
 * automaton folds case and Unicode upstream and yields a canonical headword. A
 * COLLATE NOCASE comparison cannot use idx_concept_term_lookup and would
 * full-scan on every one of biology's 47,568 lookups.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} english
 * @param {object} [stmts] from `scope.stmts`. Omitted, this prepares its own —
 *   correct but ~4x slower per call, so the hot path (resolve()) always passes
 *   them. Kept optional so lookupCandidates stays directly callable.
 * @returns {{candidates: Array<{conceptId:number, domain:string,
 *            isTerms: Array<{termId:number, text:string, rank:number}>}>,
 *           integrity: string[]}}
 */
function lookupCandidates(db, english, stmts) {
  // ⚠️ FAIL LOUD, do not fall back. Supplied statements are bound to the
  // connection that prepared them; running them while the caller believes it is
  // querying `db` would silently answer from the WRONG DATABASE. Preparing fresh
  // ones instead would hide the caller's mistake at ~4x the cost.
  if (stmts && stmts.db !== db) {
    throw new Error(
      'lookupCandidates(): the supplied statements belong to a different database ' +
        'connection — rebuild the scope with buildScope(db, …) for the connection you are querying'
    );
  }
  const {
    hits: hitsStmt,
    merge: mergeStmt,
    concept: conceptStmt,
    terms: termsStmt,
  } = stmts || prepareLookupStatements(db);

  const hits = hitsStmt.all(english);

  const integrity = [];
  const byId = new Map(); // de-duplicates two hits that merge into one survivor
  for (const h of hits) {
    const { id, cycle } = followMerge(mergeStmt, h.concept_id);
    if (cycle && !integrity.includes('merge-cycle')) integrity.push('merge-cycle');
    if (byId.has(id)) continue;
    const c = conceptStmt.get(id);
    // ⚠️ A merged_into pointer to a row that does not exist. Unreachable while
    // foreign keys are on — and better-sqlite3 is compiled with
    // SQLITE_DEFAULT_FOREIGN_KEYS=1, so they are on for every connection in this
    // project — but a candidate vanishing SILENTLY is exactly the failure this
    // resolver exists to end. Report it rather than dropping it quietly.
    if (!c) {
      if (!integrity.includes('dangling-merge')) integrity.push('dangling-merge');
      continue;
    }
    byId.set(id, {
      conceptId: c.id,
      domain: c.domain,
      isTerms: termsStmt.all(id).map((r) => ({ termId: r.term_id, text: r.text, rank: r.rank })),
    });
  }
  return { candidates: [...byId.values()], integrity };
}

/** The rank-1 Icelandic head form, or null. isTerms is already rank-sorted. */
function headForm(candidate) {
  return candidate.isTerms.length > 0 ? candidate.isTerms[0] : null;
}

function emptyResolution(unscoped, integrity, outOfScope) {
  return {
    winner: null,
    reason: null,
    nominalTie: [],
    tied: [],
    outOfScope,
    integrity,
    unscoped,
    alsoInScope: [],
  };
}

/**
 * Resolve candidates against a scope. NO I/O and no ambient state; the one
 * database read it does make is stated in full below.
 *
 * ⚠️ THE FILTER ON STEP 3 IS LOAD-BEARING AND IS NOT IN THE PARENT SPEC.
 * §6 orders it "choose each candidate's term (3) -> lowest position wins (4)",
 * which reads correctly until a chosen term is undefined. Chemistry is position 1
 * for efnafraedi-2e, so a chemistry concept with no Icelandic head form would win
 * the position race and then resolve to NOTHING, while biology's perfectly good
 * word sat at position 3 and was never consulted. Term-less candidates must be
 * dropped BETWEEN steps 3 and 4.
 *
 * ⚠️ NEARLY PURE, and the exception is narrow enough to state exactly (B4a).
 * Steps 2-5 read nothing but their arguments. Step 6's fault path — reached only
 * when a preference row exists AND no candidate carries its term — reads ONE
 * prepared statement, `scope.stmts.termById`, to tell `preference-term-missing`
 * (a stale row to delete) from `preference-not-a-candidate` (a misfiled row to
 * re-file). It never touches `scope.db`, it never runs on the hot path, and
 * conceptResolverResolve.test.js still imports no database at all — it stubs
 * that single statement. The §C24 hoisting rationale is untouched: no query is
 * added to a resolution that succeeds.
 *
 * @param {object} scope from buildScope
 * @param {Array} candidates from lookupCandidates
 * @param {string[]} [integrity] codes carried in from lookupCandidates
 * @param {string|null} [english] the string being resolved. OPTIONAL so this
 *   function stays callable without a preference model; omitted, `scope.preference`
 *   is never consulted and the position walk is the whole answer.
 */
function resolveCandidates(scope, candidates, integrity = [], english = null) {
  const codes = [...integrity];
  if (scope.unscoped) return emptyResolution(scope.unscoped, codes, []);

  // Step 2 — partition. D1: out-of-scope survives as a soft badged tier.
  const inScope = [];
  const outOfScope = [];
  for (const c of candidates) {
    if (scope.positionOf.has(c.domain)) {
      inScope.push(c);
    } else {
      const head = headForm(c);
      // A term-less candidate has nothing to suggest either.
      if (head) outOfScope.push({ conceptId: c.conceptId, text: head.text, domain: c.domain });
    }
  }

  // Step 3 — choose each in-scope candidate's term, then DROP the term-less ones.
  //
  // ⚠️ THE HEAD FORM, ALWAYS. The preference used to be applied HERE, per
  // candidate, keyed on concept id; B4a moved it out to step 6 (see
  // `applyPreference`). One consequence is easy to miss and is pinned by
  // 'TIE DETECTION READS HEAD FORMS, never preferred terms': the step-4/5 tie
  // comparison now compares head forms only, so a preference can never make two
  // concepts *look* nominally tied.
  const chosen = [];
  for (const c of inScope) {
    const term = headForm(c);
    if (!term) continue; // ← the filter, between steps 3 and 4
    chosen.push({
      conceptId: c.conceptId,
      termId: term.termId,
      text: term.text,
      domain: c.domain,
      position: scope.positionOf.get(c.domain),
      reason: 'head-form',
    });
  }

  if (chosen.length === 0) return emptyResolution(false, codes, outOfScope);

  // Step 4 — lowest position wins.
  let best = chosen[0].position;
  for (const c of chosen) if (c.position < best) best = c.position;
  const atBest = chosen
    .filter((c) => c.position === best)
    .sort((a, b) => a.conceptId - b.conceptId);

  const asWinner = (c) => ({
    conceptId: c.conceptId,
    termId: c.termId,
    text: c.text,
    domain: c.domain,
    position: c.position,
  });

  // B4a/D3 — the in-scope answers that LOST. §C38's hiding-factor ②: resolve()
  // reported outOfScope but a lower-position IN-SCOPE concept that lost the race
  // vanished, so `hittni [biology @3]` was invisible behind `nákvæmni [physics @2]`.
  //
  // Built from `chosen` — after term selection and after the term-less filter —
  // so every entry is a real, offerable answer. Excludes anything already
  // reported as winner, in `tied`, or in `nominalTie`.
  const alsoFrom = (reportedIds) =>
    chosen
      .filter((c) => !reportedIds.has(c.conceptId))
      .sort((a, b) => a.position - b.position || a.conceptId - b.conceptId)
      .map((c) => ({
        conceptId: c.conceptId,
        termId: c.termId,
        text: c.text,
        domain: c.domain,
        position: c.position,
      }));

  // Step 6 — B4a/D3, THE OVERRIDE. §C38: chemistry resolved BOTH `accuracy` and
  // `precision` to `nákvæmni` because its chain is 1.chemistry → 2.physics →
  // 3.biology, chemistry has no `accuracy` concept, physics@2 decided, and
  // biology's `hittni` at position 3 was never consulted. An editor had no way
  // to say "for this book, `accuracy` means `hittni`".
  //
  // ⚠️ APPLIED AFTER THE POSITION WALK, NEVER INSTEAD OF IT. A short-circuit
  // that returned the preferred term immediately skips step 5, and that was
  // MEASURED to destroy the nominal-tie merge hint when tie members straddle
  // the preference: nominalTie [1, 2] became []. Every existing report survives
  // here; only the answer changes.
  //
  // Determinism needs no sort: the primary key permits one preference per
  // (book, chapter, english), and a term_id belongs to exactly one concept, so
  // at most one candidate can carry it.
  const applyPreference = (result) => {
    if (english == null) return result;
    // ⚠️ LOWERCASED, matching buildPreferenceMap. The column is COLLATE NOCASE
    // so SQLite folds case, but a JS Map does not — key one way and look up the
    // other and the row is stored and never found, silently.
    const pref = scope.preference.get(english.toLowerCase());
    if (!pref) return result;

    // ⚠️ Search ALL candidates, in-scope AND out. The `outOfScope` OUTPUT is
    // lossy in two independent ways — it carries only the head form's `text`
    // and no termId, and step 2 drops term-less concepts before recording them
    // (pinned by 'a term-less out-of-scope concept is not listed as a
    // suggestion either') — so a check written against it stays silent for
    // exactly the concepts most likely to be broken.
    const owner = candidates.find((c) => c.isTerms.some((t) => t.termId === pref.termId));

    // ⚠️ THE FAULT PATHS PUSH ONTO `codes` AND THEN `return result` UNCHANGED —
    // no spread, unlike the success path below. That is not an oversight and it
    // is not safe by accident: it works ONLY because `result.integrity` IS this
    // same `codes` array, so the push is already visible through the object
    // being returned. A refactor that copies the array into the result
    // (`integrity: [...codes]`) would drop EVERY fault code silently, with the
    // three D4 tests still asserting a `winner` that never changed. Keep the
    // alias, or spread these two returns as well.
    if (!owner) {
      // Two faults, two remedies: delete a stale row vs. re-file a misfiled one.
      const exists = scope.stmts && scope.stmts.termById && scope.stmts.termById.get(pref.termId);
      codes.push(exists ? 'preference-not-a-candidate' : 'preference-term-missing');
      return result;
    }
    if (!scope.positionOf.has(owner.domain)) {
      // D1: in-scope only. Ignoring it is CORRECT; ignoring it silently is not.
      codes.push('preference-out-of-scope');
      return result;
    }

    const term = owner.isTerms.find((t) => t.termId === pref.termId);
    const winner = {
      conceptId: owner.conceptId,
      termId: term.termId,
      text: term.text,
      domain: owner.domain,
      position: scope.positionOf.get(owner.domain),
    };
    return {
      ...result,
      winner,
      reason: pref.tier === 'chapter' ? 'chapter-preference' : 'book-preference',
      // ⚠️ A real tie the editor has ANSWERED is no longer a tie — but its
      // members are still real, offerable, in-scope answers and MUST stay
      // visible. Clearing `tied` without re-homing them makes them vanish from
      // BOTH lists: D3's own invisibility, re-created inside D3.
      tied: [],
      // Duplicate concepts to MERGE — true regardless of which term the book
      // uses, so this report is carried through untouched.
      nominalTie: result.nominalTie,
      alsoInScope: alsoFrom(new Set([winner.conceptId])),
    };
  };

  if (atBest.length === 1) {
    return applyPreference({
      winner: asWinner(atBest[0]),
      reason: atBest[0].reason,
      nominalTie: [],
      tied: [],
      outOfScope,
      integrity: codes,
      unscoped: false,
      alsoInScope: alsoFrom(new Set([atBest[0].conceptId])),
    });
  }

  // Step 5 — a position tie. Compare the CHOSEN TEXTS of ALL tied candidates.
  //
  // ⚠️ ALL-OR-NOTHING on purpose. With three tied where two agree and one differs
  // there is still a real choice to make, so every tied candidate is reported —
  // including the two that agreed. Resolving to the majority form would be
  // guessing, which parent spec §6 step 5 forbids in as many words.
  const texts = new Set(atBest.map((c) => c.text));
  if (texts.size === 1) {
    // D2: a NOMINAL tie. Both candidates answer with the identical string, so
    // nothing is guessed — but the duplicate concepts are reported so an editor
    // can merge them.
    //
    // ⚠️ atBest is sorted by conceptId, so the winner is DETERMINISTIC. Taking
    // whichever row came back first would let database row order decide the
    // recorded termId — which is §C18's defect, reproduced inside its own fix.
    return applyPreference({
      winner: asWinner(atBest[0]),
      reason: atBest[0].reason,
      nominalTie: atBest.map((c) => c.conceptId),
      tied: [],
      outOfScope,
      integrity: codes,
      unscoped: false,
      alsoInScope: alsoFrom(new Set(atBest.map((c) => c.conceptId))),
    });
  }

  return applyPreference({
    winner: null,
    reason: null,
    nominalTie: [],
    tied: atBest.map((c) => ({ conceptId: c.conceptId, text: c.text, domain: c.domain })),
    outOfScope,
    integrity: codes,
    unscoped: false,
    alsoInScope: alsoFrom(new Set(atBest.map((c) => c.conceptId))),
  });
}

/**
 * The public entry point. B3 (glossary export) and B4 (editor) call this.
 *
 * ⚠️ Build the scope ONCE per (book, chapter) and reuse it. Building it per string
 * turns every lookup into three extra queries — which is how §C24 happened: a
 * correct per-item function called in a loop over tens of thousands of items.
 *
 * ⚠️ TAKES NO `db`. It used to be `resolve(db, scope, english)`, and the `db` was
 * used for NOTHING except checking it matched the one the scope already carried.
 * A parameter whose only purpose is to be validated against another parameter is
 * a hazard the API invents and then defends: the wrong-connection state is now
 * UNREPRESENTABLE rather than guarded. Both reviewers of the whole branch reached
 * this independently, and B1 is inert, so this was the cheapest moment it would
 * ever be — after B3 and B4 it is a consumer-wide refactor.
 *
 * @param {object} scope from buildScope — carries its own connection
 * @param {string} english EXACT, already-normalised English string
 */
function resolve(scope, english) {
  // ⚠️ THREE arguments on purpose. An unscoped book has no preference map to
  // consult — passing `english` here would ask `scope.preference.get()` of a
  // scope that has no `preference` at all.
  if (scope.unscoped) return resolveCandidates(scope, [], []);
  const { candidates, integrity } = lookupCandidates(scope.db, english, scope.stmts);
  return resolveCandidates(scope, candidates, integrity, english);
}

module.exports = {
  buildScope,
  lookupCandidates,
  resolveCandidates,
  resolve,
  prepareLookupStatements,
};
