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
 * ⚠️ `tier` is CARRIED, not discarded. Parent spec §7.2 requires the editor panel
 * to say which rule fired — "chapter override / book default / head form of
 * domain X" — and this is the only place that still knows.
 *
 * ⚠️ `chapter` is NOT NULL with 0 as the book-default sentinel: in SQLite NULLs do
 * not compare equal inside a primary key, so a nullable chapter would permit two
 * conflicting "book defaults" for one concept. -1 is the appendices sentinel.
 */
function buildPreferenceMap(db, bookId, chapter) {
  const rows = db
    .prepare(
      `SELECT concept_id, term_id, chapter
         FROM book_concept_preference
        WHERE book_id = ? AND chapter IN (0, ?)`
    )
    .all(bookId, chapter);

  const preference = new Map();
  for (const r of rows) {
    const tier = r.chapter === 0 ? 'book' : 'chapter';
    // A chapter row always wins; a book row only fills an empty slot. Order of
    // rows from SQLite is not relied on.
    if (tier === 'chapter' || !preference.has(r.concept_id)) {
      preference.set(r.concept_id, { termId: r.term_id, tier });
    }
  }
  return preference;
}

/**
 * The four statements `lookupCandidates` needs, prepared once.
 *
 * ⚠️ Spec §5 — "In B1 it is a prepared statement held on the scope." These are
 * hoisted onto the Scope by buildScope, NOT prepared per call. Gate 4 measured
 * the difference on the real corpus: preparing per call cost 190,275 prepares
 * for biology's 47,568 resolves, 4.2x the wall time and 21.7x the resident
 * memory (762.8 MB of churn against 35.2 MB). 1.5 GB RSS does not survive the
 * production Linode.
 *
 * ⚠️ A statement is bound to the CONNECTION that prepared it — see resolve()'s
 * guard.
 */
function prepareLookupStatements(db) {
  return {
    hits: db.prepare(
      `SELECT DISTINCT c.id AS concept_id
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
  };
}

/**
 * Build the per-(book, chapter) scope.
 *
 * ⚠️ Returns WHICH fault, not a boolean (spec D3). 'unregistered' and
 * 'no-priorities' have different remedies — the admin route vs a migration — and
 * collapsing them repeats one level down the very failure D3 exists to prevent.
 *
 * ⚠️ The scope carries `db` and `stmts`. `resolveCandidates` reads NEITHER — it
 * stays pure, which conceptResolverResolve.test.js pins by importing no database
 * at all. Only resolve()/lookupCandidates touch them.
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
 * Resolving THROUGH merged_into is what makes an editorial merge take effect with
 * no data migration: preference rows still naming the absorbed concept keep working.
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
    if (!c) continue;
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
  };
}

/**
 * Resolve candidates against a scope. PURE — no database, no I/O, no ambient state.
 *
 * ⚠️ THE FILTER ON STEP 3 IS LOAD-BEARING AND IS NOT IN THE PARENT SPEC.
 * §6 orders it "choose each candidate's term (3) -> lowest position wins (4)",
 * which reads correctly until a chosen term is undefined. Chemistry is position 1
 * for efnafraedi-2e, so a chemistry concept with no Icelandic head form would win
 * the position race and then resolve to NOTHING, while biology's perfectly good
 * word sat at position 3 and was never consulted. Term-less candidates must be
 * dropped BETWEEN steps 3 and 4.
 *
 * @param {object} scope from buildScope
 * @param {Array} candidates from lookupCandidates
 * @param {string[]} [integrity] codes carried in from lookupCandidates
 */
function resolveCandidates(scope, candidates, integrity = []) {
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
  const chosen = [];
  for (const c of inScope) {
    const pref = scope.preference.get(c.conceptId);
    let term = null;
    let reason = null;
    if (pref) {
      term = c.isTerms.find((t) => t.termId === pref.termId) || null;
      if (term) reason = pref.tier === 'chapter' ? 'chapter-preference' : 'book-preference';
      else if (!codes.includes('orphan-preference')) codes.push('orphan-preference');
    }
    if (!term) {
      term = headForm(c);
      if (term) reason = 'head-form';
    }
    if (!term) continue; // ← the filter, between steps 3 and 4
    chosen.push({
      conceptId: c.conceptId,
      termId: term.termId,
      text: term.text,
      domain: c.domain,
      position: scope.positionOf.get(c.domain),
      reason,
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

  if (atBest.length === 1) {
    return {
      winner: asWinner(atBest[0]),
      reason: atBest[0].reason,
      nominalTie: [],
      tied: [],
      outOfScope,
      integrity: codes,
      unscoped: false,
    };
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
    return {
      winner: asWinner(atBest[0]),
      reason: atBest[0].reason,
      nominalTie: atBest.map((c) => c.conceptId),
      tied: [],
      outOfScope,
      integrity: codes,
      unscoped: false,
    };
  }

  return {
    winner: null,
    reason: null,
    nominalTie: [],
    tied: atBest.map((c) => ({ conceptId: c.conceptId, text: c.text, domain: c.domain })),
    outOfScope,
    integrity: codes,
    unscoped: false,
  };
}

/**
 * The public entry point. B3 (glossary export) and B4 (editor) call this.
 *
 * ⚠️ Build the scope ONCE per (book, chapter) and reuse it. Building it per string
 * turns every lookup into three extra queries — which is how §C24 happened: a
 * correct per-item function called in a loop over tens of thousands of items.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} scope from buildScope
 * @param {string} english EXACT, already-normalised English string
 */
function resolve(db, scope, english) {
  if (scope.unscoped) return resolveCandidates(scope, [], []);
  // ⚠️ FAIL LOUD, do not fall back. scope.stmts are bound to the connection that
  // prepared them, so running them while the caller believes it is querying `db`
  // would silently answer from the WRONG DATABASE. Preparing fresh statements
  // instead would hide the caller's mistake at 4x the cost.
  if (scope.db && scope.db !== db) {
    throw new Error(
      'resolve(): scope was built from a different database connection — ' +
        'rebuild the scope with buildScope(db, …) for the connection you are querying'
    );
  }
  const { candidates, integrity } = lookupCandidates(db, english, scope.stmts);
  return resolveCandidates(scope, candidates, integrity);
}

module.exports = { buildScope, lookupCandidates, resolveCandidates, resolve };
