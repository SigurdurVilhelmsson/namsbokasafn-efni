// server/scripts/run-concept-import.js
/**
 * Run the concept import over a directory of `raw-<COLLECTION>.json` files
 * produced by `fetch_idordabanki.py --mode fetch-raw`.
 *
 * ⚠️ Per-collection yield is REPORTED, never assumed. A collection's entry count
 * is not its usable count: SJODYR has 985 entries, 838 bilingual, and 0 hits
 * against this project's headwords. A collection that contributes nothing must
 * be VISIBLE here rather than silently bulking out the editor's search.
 */
const fs = require('fs');
const path = require('path');
const { importConcepts } = require('./import-concepts');

function formatImportReport(statsList) {
  const lines = ['Concept import — per-collection yield', ''];
  let totalConcepts = 0;
  for (const st of statsList) {
    totalConcepts += st.imported;
    const flags = [];
    if (st.imported === 0) flags.push('ZERO YIELD — contributes nothing; reconsider importing it');
    if (st.byLang.la > 0 && st.byLang.en === 0)
      flags.push('LATIN-ONLY — reachable by the EDITOR via Latin, never by the EN→IS MT payload');
    lines.push(
      `  ${st.collection.padEnd(22)} ${String(st.imported).padStart(6)} concepts · ` +
        `${String(st.terms).padStart(6)} terms ` +
        `(en ${st.byLang.en} / is ${st.byLang.is} / la ${st.byLang.la})` +
        (st.skippedNoIcelandic ? ` · ${st.skippedNoIcelandic} skipped, no Icelandic` : '')
    );
    for (const f of flags) lines.push(`      ⚠️  ${f}`);
  }
  lines.push('', `  TOTAL: ${totalConcepts} concepts`);
  return lines.join('\n');
}

function runImport(db, dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('raw-') && f.endsWith('.json'))
    .sort();
  const stats = [];
  for (const f of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    stats.push(importConcepts(db, payload));
  }
  return stats;
}

/**
 * ⚠️ Deliberately NOT tools/lib/parseArgs.js, which silently drops any flag it
 * does not declare — no error, no warning on stderr — so a misremembered flag
 * becomes a no-op and the tool runs at full strength with its defaults. This
 * parser returns an `error` string for anything it does not recognise, the
 * shape server/scripts/export-terminology.js already uses.
 */
function parseImportArgs(argv) {
  let dir = null;
  let db = null;
  let allowZeroYield = false;
  let help = false;
  const need = (flag, raw) => {
    if (raw === undefined) return `${flag} requires a value`;
    if (String(raw).trim() === '')
      return `${flag} requires a non-empty value — got ${JSON.stringify(raw)}`;
    return null;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' || a === '--db') {
      const err = need(a, argv[i + 1]);
      if (err) return { dir, db, allowZeroYield, help, error: err };
      if (a === '--dir') dir = argv[i + 1].trim();
      else db = argv[i + 1].trim();
      i++;
    } else if (a === '--allow-zero-yield') {
      allowZeroYield = true;
    } else if (a === '-h' || a === '--help') {
      help = true;
    } else {
      return {
        dir,
        db,
        allowZeroYield,
        help,
        error:
          `unrecognised argument '${a}' — accepted: --dir <path>, --db <path>, ` +
          `--allow-zero-yield, -h/--help (values are the NEXT argument, not --dir=<path>)`,
      };
    }
  }
  if (!help && dir === null) {
    return {
      dir,
      db,
      allowZeroYield,
      help,
      error: '--dir is required (a directory of raw-<COLLECTION>.json files)',
    };
  }
  return { dir, db, allowZeroYield, help, error: null };
}

const USAGE = `Usage: node server/scripts/run-concept-import.js --dir <path> [--db <path>] [--allow-zero-yield]

  --dir <path>          directory of raw-<COLLECTION>.json files produced by
                        tools/fetch_idordabanki.py --mode fetch-raw
  --db <path>           SQLite database (default: SESSIONS_DB_PATH, else
                        pipeline-output/sessions.db)
  --allow-zero-yield    do not refuse when a collection imports 0 concepts
  -h, --help            this message

Exit codes: 0 ok  ·  1 import failed or a collection yielded nothing  ·  2 usage error`;

/**
 * @param {string[]} argv
 * @returns {number} process exit code — returned, not thrown, so it is testable
 */
function main(argv = process.argv.slice(2)) {
  const args = parseImportArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.error) {
    console.error(`error: ${args.error}\n\n${USAGE}`);
    return 2;
  }
  const Database = require('better-sqlite3');
  const resolveDbPath = require('../lib/dbPath');
  const db = new Database(args.db || resolveDbPath());
  try {
    const stats = runImport(db, args.dir);
    console.log(formatImportReport(stats));
    const zero = stats.filter((s) => s.imported === 0).map((s) => s.collection);
    if (zero.length && !args.allowZeroYield) {
      console.error(
        `\nREFUSED: ${zero.length} collection(s) imported 0 concepts — ${zero.join(', ')}.\n` +
          `A collection that contributes nothing must not silently bulk out the editor's ` +
          `search. Investigate, or pass --allow-zero-yield to accept it deliberately.`
      );
      return 1;
    }
    return 0;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { formatImportReport, runImport, parseImportArgs, main };
