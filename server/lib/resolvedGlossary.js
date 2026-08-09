// server/lib/resolvedGlossary.js
/**
 * The glossary export's payload, built as a RESOLVED VIEW of the concept model
 * (register §C36 B3; spec docs/superpowers/specs/2026-08-08-...-part-b3-design.md).
 *
 * Replaces terminologyService.exportBookGlossary, which emitted a
 * subject-filtered dump of the old terminology tables with NO fallback — the
 * reason chemistry's adoption was destructive: it discarded pH, bond, carbon
 * dioxide, nitrogen and 108 more correct terms for want of one.
 *
 * ⚠️ THIS FILE'S OUTPUT IS NOT MT-ONLY. Approved terms are substituted into
 * published CNXML by tools/lib/math-label-substitute.js. `status: 'approved'`
 * on every term is therefore load-bearing (spec D2): buildGlossaryMap drops
 * everything else, and an unstamped export silently puts English into
 * published math.
 */
const { buildScope, resolve } = require('./conceptResolver');
const { collectSourceEnglish } = require('./sourceEnglish');
const { PRODUCER_RESOLVED } = require('./glossaryProducer');

/**
 * @param {import('better-sqlite3').Database} db an OPEN connection
 * @param {string} bookSlug
 * @param {{census?: {strings: string[], filesRead: number, root: string}, booksDir?: string}} [opts]
 * @returns {{producer, generated, book, stats, terms: Array}}
 * @throws when the book is unscoped, or its census is empty
 */
function buildResolvedGlossary(db, bookSlug, { census, booksDir } = {}) {
  // ⚠️ Chapter 0 — the book default — ALWAYS. glossary-unified.json is one file
  // per book, so a chapter-scoped answer is not expressible here; consulting
  // chapter preferences would silently pick one chapter's choices for the book.
  const scope = buildScope(db, bookSlug, 0);
  if (scope.unscoped) {
    // ⚠️ Two faults with DIFFERENT remedies, never collapsed (B1 spec D3):
    // 'unregistered' -> add the book via the admin route.
    // 'no-priorities' -> the book is registered but absent from migration 046's
    // frozen map, which needs a migration.
    throw new Error(
      `${bookSlug}: cannot build a resolved glossary — the book is unscoped (${scope.unscoped}). ` +
        (scope.unscoped === 'unregistered'
          ? 'It has no registered_books row; register it through the admin route.'
          : 'It is registered but has no book_domain_priority rows; that needs a migration.')
    );
  }

  const source = census || collectSourceEnglish(bookSlug, booksDir ? { booksDir } : undefined);

  // ⚠️ THE AGGREGATE CASE FIRST. A per-string filter over an EMPTY list finds
  // nothing to complain about, so a book with no extracted source would produce
  // a valid-shaped 0-term payload and read like a legitimate export. That is
  // B0's zero-yield lesson; an unextracted book is an environment fact.
  if (!source.strings.length) {
    throw new Error(
      `${bookSlug}: census is empty (${source.filesRead} .md file(s) under ${source.root}) — ` +
        `refusing to build a glossary from no source text. Extract the book first.`
    );
  }

  const stats = {
    total: 0,
    approved: 0,
    ties: 0,
    nominalTies: 0,
    outOfScopeOnly: 0,
    censusStrings: source.strings.length,
  };
  const terms = [];

  for (const english of source.strings) {
    const r = resolve(scope, english);

    if (!r.winner) {
      if (r.tied.length) stats.ties++;
      else if (r.outOfScope.length) stats.outOfScopeOnly++;
      continue;
    }
    if (r.nominalTie.length) stats.nominalTies++;

    const alternatives = scope.stmts.terms
      .all(r.winner.conceptId)
      .filter((t) => t.term_id !== r.winner.termId)
      .map((t) => t.text);

    terms.push({
      english,
      icelandic: r.winner.text,
      // D2: load-bearing. buildGlossaryMap drops anything else.
      status: 'approved',
      // Provenance, kept SEPARATE from the selector above — §C18's lesson is
      // that one column read as both is how row order came to decide what
      // readers see.
      reason: r.reason,
      // The producer fingerprint. Never `subjects`/`category`/`chapter`.
      domain: r.winner.domain,
      position: r.winner.position,
      conceptId: r.winner.conceptId,
      alternatives,
    });
  }

  terms.sort((a, b) => (a.english < b.english ? -1 : a.english > b.english ? 1 : 0));
  stats.total = terms.length;
  stats.approved = terms.length;

  return {
    producer: PRODUCER_RESOLVED,
    generated: new Date().toISOString(),
    book: bookSlug,
    stats,
    terms,
  };
}

/**
 * The `exportFn` runGlossaryExport injects.
 *
 * ⚠️ export-terminology.js has NEVER opened a database — today's exportFn
 * reaches terminologyService's lazy module-level singleton, which is why the
 * script appears not to need one. buildResolvedGlossary takes an explicit
 * connection, so this factory is the lifetime that has to exist now.
 *
 * Used as a DEFAULT PARAMETER, so it is evaluated only when no exportFn was
 * injected — a test that supplies its own opens no database at all.
 *
 * ⚠️ THE OPEN IS LAZY ON PURPOSE (whole-branch adversarial review, Task 5,
 * Important 1). Default parameters are evaluated during destructuring —
 * *before* runGlossaryExport's body, its `books.length === 0` guard, and its
 * per-book `try { next = exportFn(b) } catch { … }` — and `main()` wraps none
 * of it in a try/catch. An eager `new Database(...)` here therefore throws
 * OUTSIDE every safety net this file has: on a box with a missing/unreadable
 * sessions.db (a fresh clone, a moved SESSIONS_DB_PATH, a permissions fault)
 * the process would crash with a raw stack trace, writing NEITHER the status
 * file nor the heartbeat — worse than pre-B3, where the old builder called
 * getDb() *inside itself* and produced four structured per-book `error`
 * outcomes plus a written status file. Deferring the `new Database(...)`
 * call to the returned closure's FIRST invocation moves the throw inside the
 * per-book try/catch, so a missing DB becomes one book's `error` outcome —
 * with the status file and every other book's outcome intact — exactly like
 * every other exportFn failure mode this file already handles.
 */
function createResolvedExportFn(dbPath) {
  let db = null;
  return (slug) => {
    if (!db) {
      const Database = require('better-sqlite3');
      const resolveDbPath = require('./dbPath');
      // ⚠️ resolveDbPath(), never process.cwd() (CLAUDE.md, durable): the cron
      // runs this from the repo root and systemd runs the server from server/.
      db = new Database(dbPath || resolveDbPath(), { readonly: true });
    }
    return buildResolvedGlossary(db, slug);
  };
}

module.exports = { buildResolvedGlossary, createResolvedExportFn };
