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
 *
 * (M-1) The same credit is repeated in `--help` output (`USAGE` below) — SÁM's
 * terms require crediting "in products built on BÍN data" and this header
 * comment is never seen at runtime.
 */
const fs = require('fs');
const path = require('path');
const { loadBinData, getInflections, formatInflectionsJson } = require('../lib/binInflections');
const resolveDbPath = require('../lib/dbPath');

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
  --force            re-fetch even for rows that already have inflections

BÍN data: Beygingarlýsing íslensks nútímamáls. Stofnun Árna Magnússonar í
íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir.
https://bin.arnastofnun.is — CC BY-SA 4.0. The forms this tool writes are
GENERATED from that data (selected and subsetted per lemma), not verbatim.`;

/**
 * ⚠️ HAND-ROLLED, AND NOT tools/lib/parseArgs.js — DELIBERATELY.
 * That helper SILENTLY DROPS UNKNOWN FLAGS (CLAUDE.md, durable), so a
 * misremembered flag becomes a no-op and the tool runs at full strength with its
 * defaults. Python's argparse exits on an unknown flag, so silently dropping
 * would be a behaviour change in the one direction that matters.
 *
 * ⚠️ DELIBERATE DEVIATION FROM argparse: NO PREFIX-ABBREVIATION SUPPORT.
 * argparse resolves an unambiguous prefix (`--lim` → `--limit`) by default. This
 * parser does not, on purpose: an abbreviation's resolution is only as stable as
 * the current flag set — adding a future `--limit-rows` would silently change
 * what `--lim` means for anyone whose muscle memory or scripts used it. Strictness
 * is the entire reason this parser exists instead of a shared helper; accepting
 * abbreviations would reintroduce the ambiguity that same reasoning rejects
 * elsewhere in this file. (wb-review-A, coordinator finding, 2026-08-10.)
 */
function parseArgs(argv) {
  const out = { db: DEFAULT_DB, binData: DEFAULT_BIN, execute: false, limit: 0, force: false };
  const VALUE_FLAGS = new Set(['--db', '--bin-data', '--limit']);
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    // ⚠️ Support `--flag=value`, not only `--flag value` — argparse accepts both
    // and a runbook or muscle memory using `=` should not silently break (I-1
    // coordinator finding). Only unpacked for flags that actually TAKE a value:
    // splitting on `=` universally would let `--execute=false` still enable
    // --execute, which is worse than not supporting `=` at all.
    const eq = raw.indexOf('=');
    const flagPart = eq !== -1 ? raw.slice(0, eq) : raw;
    const takesValue = VALUE_FLAGS.has(flagPart);
    if (takesValue) {
      const a = flagPart;
      let v;
      if (eq !== -1) {
        v = raw.slice(eq + 1);
      } else {
        v = argv[i + 1];
        // Do not swallow the next flag as a value (B0's finding in the siblings).
        if (v === undefined || v.startsWith('--')) {
          throw new Error(`${a} expects a value, got ${v === undefined ? 'nothing' : `'${v}'`}`);
        }
        i++;
      }
      if (a === '--db') out.db = v;
      else if (a === '--bin-data') out.binData = v;
      else {
        // ⚠️ I-1: Number('abc') is NaN, which is FALSY, so an invalid --limit
        // used to silently drop the LIMIT clause entirely and the run processed
        // EVERY row instead of refusing. Python's argparse(type=int) exits 2
        // before the CSV is even opened. Reject anything that is not a plain
        // signed-integer literal — this also rejects '', whitespace-only, '3.7'
        // and '0x10'/'1e3', all of which Number() would coerce to a number that
        // is not what the operator typed.
        if (!/^-?\d+$/.test(v)) {
          throw new Error(
            `--limit expects an integer, got ${v === '' ? 'an empty string' : `'${v}'`}`
          );
        }
        out.limit = Number(v);
      }
    } else if (raw === '--execute') out.execute = true;
    else if (raw === '--force') out.force = true;
    else if (raw === '-h' || raw === '--help') out.help = true;
    else throw new Error(`unrecognised argument '${raw}'\n\n${USAGE}`);
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
