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
  let totalPruned = 0;
  let totalPrefsDropped = 0;
  let totalUpdated = 0;
  for (const st of statsList) {
    totalConcepts += st.imported;
    totalPruned += st.prunedTerms || 0;
    totalPrefsDropped += st.preferencesDropped || 0;
    totalUpdated += st.updatedTerms || 0;
    const flags = [];
    if (st.imported === 0) flags.push('ZERO YIELD — contributes nothing; reconsider importing it');
    if (st.byLang.la > 0 && st.byLang.en === 0)
      flags.push('LATIN-ONLY — reachable by the EDITOR via Latin, never by the EN→IS MT payload');
    // A withdrawn term costing an editor's choice must be VISIBLE at the moment
    // it happens. import-concepts.js counts it; printing it is what makes the
    // count worth having.
    if (st.preferencesDropped)
      flags.push(
        `${st.preferencesDropped} EDITOR PREFERENCE(S) DROPPED — the preferred term is gone upstream`
      );
    lines.push(
      `  ${st.collection.padEnd(22)} ${String(st.imported).padStart(6)} concepts · ` +
        `${String(st.terms).padStart(6)} terms ` +
        `(en ${st.byLang.en} / is ${st.byLang.is} / la ${st.byLang.la})` +
        (st.skippedNoIcelandic ? ` · ${st.skippedNoIcelandic} skipped, no Icelandic` : '') +
        (st.prunedTerms ? ` · ${st.prunedTerms} pruned` : '')
    );
    for (const f of flags) lines.push(`      ⚠️  ${f}`);
  }
  lines.push('', `  TOTAL: ${totalConcepts} concepts`);
  // ⚠️ `updatedTerms` is the field that distinguishes a real import from a
  // no-op: on a refresh that changes nothing, every term is an update and zero
  // are inserts, while `terms` reports the same total either way.
  lines.push(
    `  ${totalUpdated} term(s) updated in place · ${totalPruned} pruned · ` +
      `${totalPrefsDropped} editor preference(s) dropped`
  );
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
    // ⚠️ Do not swallow the NEXT FLAG as a value. `--db --allow-zero-yield` used
    // to take the flag as the database path, silently losing the flag and
    // creating a 0-byte SQLite file named `--allow-zero-yield`.
    if (String(raw).startsWith('--'))
      return (
        `${flag} requires a value, but the next argument is the flag ${JSON.stringify(raw)}. ` +
        `If you really mean a path beginning with '--', write it as './${raw}'.`
      );
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
  // ⚠️ Opening the DB and reading the directory are ENVIRONMENT failures, and
  // they exit 2 like a usage error — not 1. Exit 1 means "ran and refused", and
  // an unopenable --db previously produced a raw Node stack trace at exit 1,
  // making a mistyped path indistinguishable from a deliberate refusal.
  let db;
  try {
    db = new Database(args.db || resolveDbPath());
  } catch (e) {
    console.error(`error: cannot open database ${args.db || resolveDbPath()} — ${e.message}`);
    return 2;
  }
  try {
    let stats;
    try {
      stats = runImport(db, args.dir);
    } catch (e) {
      if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR' || e.code === 'EACCES')) {
        console.error(`error: cannot read --dir ${args.dir} — ${e.message}`);
        return 2;
      }
      console.error(`import failed: ${e.message}`);
      return 1;
    }
    console.log(formatImportReport(stats));
    // ⚠️ The aggregate case FIRST. `stats.filter(s => s.imported === 0)` finds
    // nothing in an EMPTY array, so a directory holding no raw-<COLL>.json used
    // to print "TOTAL: 0 concepts" and exit 0 — a green runbook over a refresh
    // that moved nothing. Reachable without a typo: fetch_idordabanki.py writes
    // `raw_fetch.json` in --mode fetch and `raw-<COLL>.json` only in
    // --mode fetch-raw, and only the latter is read here.
    if (!stats.length && !args.allowZeroYield) {
      console.error(
        `\nREFUSED: no raw-<COLLECTION>.json files found in ${args.dir}.\n` +
          `Nothing was imported. Note that --mode fetch writes raw_fetch.json (underscore) ` +
          `while this reads raw-<COLLECTION>.json (hyphen), produced by --mode fetch-raw. ` +
          `Pass --allow-zero-yield to accept an empty run deliberately.`
      );
      return 1;
    }
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
