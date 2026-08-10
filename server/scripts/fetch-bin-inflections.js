/**
 * Populate terminology_translations.inflections from BÍN.
 *
 * ⚠️ A BEHAVIOUR-IDENTICAL PORT of tools/fetch_bin_inflections.py (§C36 B4b-0a).
 * It changes nothing: same input file, same table, same lookup, same dry-run
 * default. The pos-aware rewrite and the move to concept_term are B4b-0b.
 *
 * Usage:
 *   node server/scripts/fetch-bin-inflections.js                    # dry run
 *   node server/scripts/fetch-bin-inflections.js --execute
 *   node server/scripts/fetch-bin-inflections.js --execute --limit 50
 *
 * BÍN data: Beygingarlýsing íslensks nútímamáls. Stofnun Árna Magnússonar í
 * íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir.
 * https://bin.arnastofnun.is — CC BY-SA 4.0; the forms are modified (selected
 * and subsetted).
 */
const fs = require('fs');
const path = require('path');
const { loadBinData, getInflections, formatInflectionsJson } = require('../lib/binInflections');
const resolveDbPath = require('../lib/dbPath');

// ⚠️ __dirname, never process.cwd() (CLAUDE.md, durable). The server runs with
// cwd=server/ and the cron from the repo root; a cwd-relative default silently
// points at a different tree.
//
// ⚠️ AND NOT server/lib/dbPath.js. tools/ is MIT and server/ is AGPL-3.0; root
// LICENSE enumerates the deliberate edges and this must not become another one.
// ⚠️ resolveDbPath(), never process.cwd() (CLAUDE.md, durable) — the server runs
// with cwd=server/ and the cron from the repo root. Now that this script lives in
// server/, the canonical resolver is available and IS the right answer; the earlier
// tools/ placement is what made a hand-rolled path necessary.
const DEFAULT_DB = resolveDbPath();
// ⚠️ tools/data/ is where the licensed BÍN drop lives (.gitignore:56 names it).
// A DATA path, resolved against __dirname — not a code dependency on tools/.
const DEFAULT_BIN = path.join(__dirname, '..', '..', 'tools', 'data', 'SHsnid.csv');

const USAGE = `Usage: node server/scripts/fetch-bin-inflections.js [--db <path>] [--bin-data <path>]
                                          [--execute] [--limit <n>] [--force]

  --db <path>        SQLite database (default: resolveDbPath())
  --bin-data <path>  SHsnid.csv (default: ${DEFAULT_BIN})
  --execute          actually write. WITHOUT THIS NOTHING IS WRITTEN.
  --limit <n>        process at most n translations (0 = all)
  --force            re-fetch even for rows that already have inflections`;

/**
 * ⚠️ HAND-ROLLED, AND NOT tools/lib/parseArgs.js — DELIBERATELY.
 * That helper SILENTLY DROPS UNKNOWN FLAGS (CLAUDE.md, durable), so a
 * misremembered flag becomes a no-op and the tool runs at full strength with its
 * defaults. Python's argparse exits on an unknown flag, so silently dropping
 * would be a behaviour change in the one direction that matters.
 */
function parseArgs(argv) {
  const out = { db: DEFAULT_DB, binData: DEFAULT_BIN, execute: false, limit: 0, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const takesValue = a === '--db' || a === '--bin-data' || a === '--limit';
    if (takesValue) {
      const v = argv[i + 1];
      // Do not swallow the next flag as a value (B0's finding in the siblings).
      if (v === undefined || v.startsWith('--')) {
        throw new Error(`${a} expects a value, got ${v === undefined ? 'nothing' : `'${v}'`}`);
      }
      if (a === '--db') out.db = v;
      else if (a === '--bin-data') out.binData = v;
      else out.limit = Number(v);
      i++;
    } else if (a === '--execute') out.execute = true;
    else if (a === '--force') out.force = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else throw new Error(`unrecognised argument '${a}'\n\n${USAGE}`);
  }
  return out;
}

/** The Python's SELECT, assembled the same way. */
function selectSql({ force, limit }) {
  const where = [
    force ? '1=1' : 't.inflections IS NULL',
    "t.icelandic NOT LIKE '% %'", // BÍN handles single words
    't.icelandic IS NOT NULL',
  ].join(' AND ');
  return `
        SELECT t.id, t.icelandic, t.headword_id, h.english
        FROM terminology_translations t
        JOIN terminology_headwords h ON h.id = t.headword_id
        WHERE ${where}
        ORDER BY t.id
        ${limit ? `LIMIT ${limit}` : ''}`;
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!fs.existsSync(args.binData)) {
    console.error(`Error: BÍN data file not found: ${args.binData}`);
    console.error('\nTo use this tool:');
    console.error('  1. Visit https://bin.arnastofnun.is/gogn/mimisbrunnur/');
    console.error('  2. Accept the CC BY-SA 4.0 license');
    console.error('  3. Download SHsnid.csv');
    console.error(`  4. Place it at: ${DEFAULT_BIN}`);
    process.exit(1);
  }

  console.log(`Loading BÍN data from ${args.binData}...`);
  const map = await loadBinData(args.binData);
  console.log(`  Loaded inflection records for ${map.size.toLocaleString()} lemmas`);

  // ⚠️ Required INSIDE main(), not at module top level, so the test file can
  // import parseArgs/selectSql without opening a database.
  const Database = require('better-sqlite3');
  const db = new Database(args.db);
  const rows = db.prepare(selectSql(args)).all();
  console.log(`\nFound ${rows.length} translations to process`);
  if (!args.execute) console.log('*** DRY RUN — add --execute to write to database ***\n');

  const update = db.prepare('UPDATE terminology_translations SET inflections = ? WHERE id = ?');
  const stats = { processed: 0, found: 0, notFound: 0 };
  // ⚠️ ALL-OR-NOTHING, matching Python: sqlite3 opened an implicit transaction and
  // wrote only at db.commit(). better-sqlite3's db.transaction() gives that
  // directly. (node:sqlite has no such helper — one reason server/ placement is
  // simpler than the tools/ workaround it replaces.)
  const apply = db.transaction((list) => {
    for (const [i, row] of list.entries()) {
      const forms = getInflections(map, row.icelandic);
      stats.processed++;
      if (forms) {
        stats.found++;
        if (args.execute) update.run(formatInflectionsJson(forms), row.id);
        if (i < 20) console.log(`  ✓ ${row.icelandic} (${row.english}): ${forms.length} forms`);
      } else {
        stats.notFound++;
        if (i < 20) console.log(`  – ${row.icelandic} (${row.english}): not in BÍN`);
      }
    }
  });
  apply(rows);

  console.log(
    args.execute ? `\n✓ Changes committed to ${args.db}` : '\n*** DRY RUN — no changes written ***'
  );
  db.close();

  const rate = stats.processed ? (stats.found / stats.processed) * 100 : 0;
  console.log('\n--- Inflection Summary ---');
  console.log(`  Processed: ${stats.processed}`);
  console.log(`  Found in BÍN: ${stats.found}`);
  console.log(`  Not in BÍN: ${stats.notFound}`);
  console.log(`  Hit rate: ${rate.toFixed(1)}%`);
  if (!args.execute && stats.found) {
    console.log(`\n  Add --execute to apply ${stats.found} inflection updates`);
  }
}

module.exports = { parseArgs, selectSql, main };

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
