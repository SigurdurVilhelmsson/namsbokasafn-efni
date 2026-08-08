/**
 * The measurement behind spec §5's "prepared statement held on the scope", made
 * REPRODUCIBLE. Run:
 *   node server/scripts/bench-prepare-arms.js --db <seeded-scratch.db> [--book <slug>]
 *
 * ⚠️ WHY THIS EXISTS. The 4.2x / 21.7x figures recorded in
 * test-results/b1-resolve-gates-2026-08.md were originally produced by a throwaway
 * script in a scratch directory. A whole-branch reviewer pointed out that this made
 * them unreproducible from anything committed — a number in a results file that no
 * one can re-run is an assertion, not a measurement. This is that script, committed.
 *
 * ⚠️ HOW IT ISOLATES THE VARIABLE. Both arms run SHIPPED code; neither reverts or
 * copies the resolver. `lookupCandidates` still accepts its statements as an optional
 * third argument and compiles its own when they are omitted — so the two arms are
 * exactly the two supported ways to call it:
 *   compile-per-call : lookupCandidates(db, en)              — no statements supplied
 *   compile-once     : resolve(scope, en)                    — statements off the scope
 *
 * ⚠️ THE OBVIOUS WAY TO WRITE THIS IS WRONG, AND IT FAILS QUIETLY. Wrapping
 * `db.prepare` with a memoiser — which is how the original figures were produced, back
 * when the resolver itself compiled per call — now measures NOTHING: the statements are
 * hoisted before either arm starts, so both arms compile 7 statements and the script
 * reports a 1.0x speedup while its winner-count control passes happily. A control that
 * checks the arms AGREE cannot notice that neither arm does the thing under test.
 *
 * The winner count is still printed for both arms, because a performance comparison
 * whose arms compute different things is worthless — it is just not sufficient alone.
 *
 * Requires a scratch DB whose books are seeded — run verify-resolve-gates.js first.
 * Never point --db at a real database.
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const {
  buildScope,
  resolve,
  lookupCandidates,
  resolveCandidates,
} = require('../lib/conceptResolver');

function parseArgs(argv) {
  let db = null;
  let book = 'liffraedi-2e';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db' || a === '--book') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        return { error: `${a} needs a value as the next argument` };
      }
      if (a === '--db') db = argv[++i].trim();
      else book = argv[++i].trim();
    } else {
      return { error: `unrecognised argument '${a}' — accepted: --db <path>, --book <slug>` };
    }
  }
  return db ? { db, book } : { error: '--db is required' };
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * One arm. `hoisted` false drives `lookupCandidates` with no statements, which is the
 * supported call shape that compiles per call; true drives `resolve()`, which is what
 * every real consumer will use. Neither arm modifies the resolver.
 */
function arm(dbPath, book, hoisted) {
  const rss0 = process.memoryUsage().rss;
  const db = new Database(dbPath);

  // Counting only; it never changes what gets compiled. The ARM decides that, by
  // choosing which shipped call shape to use.
  let realPrepares = 0;
  const orig = db.prepare.bind(db);
  db.prepare = (sql) => {
    realPrepares++;
    return orig(sql);
  };

  const strings = orig(
    `SELECT DISTINCT t.text FROM concept_term t
       JOIN concept c ON c.id = t.concept_id
       JOIN book_domain_priority p ON p.domain = c.domain
       JOIN registered_books b ON b.id = p.book_id
      WHERE t.lang = 'en' AND b.slug = ?`
  )
    .all(book)
    .map((r) => r.text);

  const scope = buildScope(db, book, 0);
  if (scope.unscoped) {
    db.close();
    return { error: `${book} is ${scope.unscoped} — run verify-resolve-gates.js first` };
  }

  const t0 = process.hrtime.bigint();
  let winners = 0;
  if (hoisted) {
    for (const en of strings) if (resolve(scope, en).winner) winners++;
  } else {
    for (const en of strings) {
      const { candidates, integrity } = lookupCandidates(db, en);
      if (resolveCandidates(scope, candidates, integrity).winner) winners++;
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const rssDelta = process.memoryUsage().rss - rss0;
  db.close();
  return { n: strings.length, ms, winners, realPrepares, rssDelta };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`error: ${args.error}`);
    return 2;
  }
  if (!fs.existsSync(args.db)) {
    console.error(`error: no such database ${args.db}`);
    return 2;
  }

  const rows = [];
  for (const [label, hoisted] of [
    ['compile-per-call', false],
    ['compile-once', true],
  ]) {
    const r = arm(args.db, args.book, hoisted);
    if (r.error) {
      console.error(`error: ${r.error}`);
      return 2;
    }
    rows.push([label, r]);
    console.log(
      `${label.padEnd(17)} ${args.book}: ${r.ms.toFixed(1)} ms for ${r.n} resolves ` +
        `(${(r.ms / r.n).toFixed(3)} ms each), ${r.winners} winners, ` +
        `${r.realPrepares} prepares, rss delta ${mb(r.rssDelta)}`
    );
  }

  const [[, slow], [, fast]] = rows;
  // ⚠️ The control, printed rather than assumed: if the arms disagree on winners,
  // they are not computing the same thing and the speedup below means nothing.
  if (slow.winners !== fast.winners) {
    console.error(
      `\nCONTROL FAILED: the arms disagree on winners (${slow.winners} vs ${fast.winners}). ` +
        'The comparison is void — they are not computing the same thing.'
    );
    return 1;
  }
  console.log(
    `\ncontrol: both arms agree on ${fast.winners} winners — the difference is cost, not behaviour`
  );
  console.log(
    `speedup ${(slow.ms / fast.ms).toFixed(1)}x · ` +
      `resident memory ${(slow.rssDelta / fast.rssDelta).toFixed(1)}x less · ` +
      `prepares ${slow.realPrepares} -> ${fast.realPrepares}`
  );
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parseArgs, arm };
