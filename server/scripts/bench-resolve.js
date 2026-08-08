/**
 * B1 gate 4. Run: node server/scripts/bench-resolve.js --db <scratch.db> [--book <slug>]
 *
 * Reports latency AND RSS, in bench-c24.js's shape: ~85MB resident for C24's
 * automaton is a real cost on a small Linode, and a claim that reports only time
 * is half-measured.
 *
 * ⚠️ This does NOT set a threshold. B1 publishes the measurement; B4 sets the
 * budget from it. Asserting a guessed number here would be a number invented
 * before it was measured.
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const { buildScope, resolve } = require('../lib/conceptResolver');

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

  const rss0 = process.memoryUsage().rss;
  const db = new Database(args.db);

  const strings = db
    .prepare(
      `SELECT DISTINCT t.text FROM concept_term t
         JOIN concept c ON c.id = t.concept_id
         JOIN book_domain_priority p ON p.domain = c.domain
         JOIN registered_books b ON b.id = p.book_id
        WHERE t.lang = 'en' AND b.slug = ?`
    )
    .all(args.book)
    .map((r) => r.text);
  console.log(`${args.book}: ${strings.length} distinct scoped English terms`);

  const t0 = process.hrtime.bigint();
  const scope = buildScope(db, args.book, 0);
  const scopeMs = Number(process.hrtime.bigint() - t0) / 1e6;
  if (scope.unscoped) {
    console.error(`error: ${args.book} is ${scope.unscoped}`);
    return 2;
  }
  console.log(`  buildScope: ${scopeMs.toFixed(1)} ms`);

  for (const label of ['cold', 'warm']) {
    const s = process.hrtime.bigint();
    let hits = 0;
    for (const en of strings) if (resolve(scope, en).winner) hits++;
    const ms = Number(process.hrtime.bigint() - s) / 1e6;
    console.log(
      `  ${label}: ${ms.toFixed(1)} ms for ${strings.length} resolves ` +
        `(${(ms / strings.length).toFixed(3)} ms each), ${hits} winners, ` +
        `rss ${mb(process.memoryUsage().rss)}`
    );
  }

  const s1 = process.hrtime.bigint();
  resolve(scope, strings[0]);
  console.log(`  single resolve: ${(Number(process.hrtime.bigint() - s1) / 1e6).toFixed(3)} ms`);
  console.log(`  rss delta: ${mb(process.memoryUsage().rss - rss0)}`);

  db.close();
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parseArgs };
