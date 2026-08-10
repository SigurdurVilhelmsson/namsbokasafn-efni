/**
 * Populate concept_term.inflections from BÍN — pos-aware (§C36 B4b-0b).
 *
 * ⚠️ THE OLD MODEL IS NOT READ, NOT COPIED AND NOT MIGRATED (spec D1). Part C
 * deletes terminology_translations; routing this data through it would be work
 * performed on a corpse. Migration 045 declared concept_term.inflections and
 * nothing has ever written it.
 *
 * ⚠️ TWO COUNTING UNITS, AND EVERY NUMBER THIS PRINTS SAYS WHICH IT IS IN.
 * concept_term is keyed (concept_id, lang, text), so ONE Icelandic string owns
 * MANY rows — measured 74,004 candidate rows over 53,719 distinct strings, 1.378
 * each. The BÍN lookup happens once per STRING; the write fans out to its ROWS.
 * The same run is a 25.87% hit rate per string and 33.50% per row, so a report
 * that does not name its unit cannot be compared against anything.
 *
 * Usage:
 *   node server/scripts/fetch-bin-inflections.js --db <scratch>            # dry run
 *   node server/scripts/fetch-bin-inflections.js --db <scratch> --execute
 *   node server/scripts/fetch-bin-inflections.js --db <scratch> --execute --limit 50
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
const {
  loadBinEntries,
  chooseEntry,
  inflectionsFor,
  formatInflectionsJson,
} = require('../lib/binInflections');
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
                             [--execute] [--limit <n>] [--force] [--report <path>]

  --db <path>        SQLite database (default: resolveDbPath())
  --bin-data <path>  SHsnid.csv, 6 fields (default: ${DEFAULT_BIN})
  --execute          actually write. WITHOUT THIS NOTHING IS WRITTEN.
  --limit <n>        process at most n DISTINCT STRINGS (0 = all). Whole strings
                     only, so a limited run never half-populates one. It is a
                     smoke test: its yield ratios are not the corpus's.
  --force            re-fetch even for rows that already have inflections
  --report <path>    write the FULL rescue/refusal lists as JSON; stdout shows 50
                     of each. Do NOT commit the file — it carries BÍN ids.

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
  const out = {
    db: DEFAULT_DB,
    binData: DEFAULT_BIN,
    execute: false,
    limit: 0,
    force: false,
    report: null,
  };
  const VALUE_FLAGS = new Set(['--db', '--bin-data', '--limit', '--report']);
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
      else if (a === '--report') out.report = v;
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

/**
 * The candidate set: single-word Icelandic terms on the concept model.
 *
 * ⚠️ THIS RETURNS ROWS, AND ONE STRING OWNS MANY. main() groups them by
 * lowercased text and looks each string up ONCE.
 *
 * ⚠️ NO SQL `LIMIT`. `--limit` bounds distinct STRINGS and is applied in main()
 * after grouping. A row-level LIMIT would split a string's rows across the
 * boundary, populating some and not others — and the in-run partition would
 * still balance, because it counts only the rows it fetched, so the resulting
 * inconsistency would be invisible to every check here. The candidate set is
 * ~74k rows; fetching it whole costs nothing.
 */
function candidateSql({ force }) {
  const where = [
    "ct.lang = 'is'",
    force ? '1=1' : 'ct.inflections IS NULL',
    "ct.text NOT LIKE '% %'", // BÍN handles single words
    'ct.text IS NOT NULL',
  ].join(' AND ');
  return `
        SELECT ct.id, ct.text, c.domain
        FROM concept_term ct
        JOIN concept c ON c.id = ct.concept_id
        WHERE ${where}
        ORDER BY ct.id`;
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
    console.error('  2. Accept the CC BY-SA 4.0 licence');
    console.error('  3. Download SHsnid.csv');
    console.error(`  4. Place it at: ${DEFAULT_BIN}`);
    process.exit(1);
  }

  // ⚠️ Required INSIDE main(), not at module top level, so the test file can
  // import parseArgs/candidateSql without opening a database.
  const Database = require('better-sqlite3');
  const db = new Database(args.db);

  const rows = db.prepare(candidateSql(args)).all();
  const multiWordSkipped = db
    .prepare(
      "SELECT COUNT(*) c FROM concept_term WHERE lang='is' AND text LIKE '% %'" +
        (args.force ? '' : ' AND inflections IS NULL')
    )
    .get().c;
  const countPopulated = () =>
    db
      .prepare("SELECT COUNT(*) c FROM concept_term WHERE lang='is' AND inflections IS NOT NULL")
      .get().c;
  const alreadyPopulatedBefore = countPopulated();

  const emptyReport = () => ({
    strings: {
      total: 0,
      unambiguous: 0,
      rescuedNominal: 0,
      refusedAmbiguous: 0,
      refusedNoNoun: 0,
      baseFormOnly: 0,
      notInBin: 0,
    },
    rows: {
      total: 0,
      written: 0,
      refused: 0,
      baseFormOnly: 0,
      notInBin: 0,
      multiWordSkipped,
      alreadyPopulatedBefore,
      alreadyPopulatedAfter: alreadyPopulatedBefore,
    },
    refusals: [],
    rescues: [],
  });

  // ⚠️ ZERO YIELD IS REFUSED, NOT PRINTED (B0's rule, run-concept-import.js's
  // docstring). The DEFAULT --db is resolveDbPath(), which on a dev box points at
  // a database holding no concept model at all — so the commonest mistake yields
  // zero candidates, and a printed "0 found" is indistinguishable from "BÍN does
  // not have these words".
  //
  // ⚠️ BUT "NOTHING TO DO" AND "NOTHING THERE" ARE DIFFERENT FACTS, AND D5 IS
  // BUILT ON TELLING THEM APART. A second --execute run over a fully-populated
  // corpus ALSO returns zero candidates — that is the idempotent no-op the gate
  // exists to demonstrate. `alreadyPopulatedBefore`, measured above, is the
  // discriminator; without it a correct implementation fails its own gate.
  if (rows.length === 0) {
    db.close();
    if (alreadyPopulatedBefore === 0) {
      throw new Error(
        `no candidate rows in ${args.db}, and NO row is populated either: concept_term holds no ` +
          "single-word lang='is' row at all. If this is a dev box, the concept model is empty — " +
          'rebuild a scratch corpus with run-concept-import.js rather than pointing this at ' +
          'sessions.db.'
      );
    }
    console.log(
      `\nNo candidates: all ${alreadyPopulatedBefore} populated row(s) already have inflections. ` +
        'That is the D5 no-op, not an empty database — the count above is what distinguishes them.'
    );
    return emptyReport();
  }

  // ONE lookup per distinct lowercased STRING; the write fans out to its rows.
  const byString = new Map();
  for (const r of rows) {
    const key = r.text.toLowerCase().trim();
    if (!byString.has(key)) byString.set(key, []);
    byString.get(key).push(r);
  }

  // ⚠️ --limit BOUNDS STRINGS AND TAKES WHOLE ONES. Dropping the tail of the map
  // keeps every row of every string it keeps, so a limited run never leaves a
  // string half-populated. rowStats.total is then the KEPT rows — measuring the
  // row partition against rows the run never considered would fire the tripwire
  // spuriously.
  let candidateRowCount = rows.length;
  if (args.limit && byString.size > args.limit) {
    const keep = [...byString.keys()].slice(0, args.limit);
    const limited = new Map(keep.map((k) => [k, byString.get(k)]));
    byString.clear();
    for (const [k, v] of limited) byString.set(k, v);
    candidateRowCount = [...byString.values()].reduce((a, g) => a + g.length, 0);
    console.log(
      `  --limit ${args.limit}: ${byString.size} string(s) / ${candidateRowCount} row(s) of ` +
        `${rows.length}. ⚠️ A LIMITED RUN IS A SMOKE TEST — its ratios are not the corpus's.`
    );
  }

  console.log(`Loading BÍN data from ${args.binData}...`);
  const byLemma = await loadBinEntries(args.binData, new Set(byString.keys()));
  console.log(
    `  ${byLemma.size.toLocaleString()} of ${byString.size.toLocaleString()} candidate string(s) are in BÍN`
  );
  console.log(`\n${candidateRowCount} candidate row(s) over ${byString.size} distinct string(s)`);
  if (!args.execute) console.log('*** DRY RUN — add --execute to write to database ***\n');

  const strings = {
    total: byString.size,
    unambiguous: 0,
    rescuedNominal: 0,
    refusedAmbiguous: 0,
    refusedNoNoun: 0,
    baseFormOnly: 0,
    notInBin: 0,
  };
  const rowStats = {
    total: candidateRowCount,
    written: 0,
    refused: 0,
    baseFormOnly: 0,
    notInBin: 0,
    multiWordSkipped,
    alreadyPopulatedBefore,
    alreadyPopulatedAfter: alreadyPopulatedBefore,
  };
  const refusals = [];
  const rescues = [];
  const plan = [];
  const brief = (e) => ({ binId: e.binId, wordClass: e.wordClass });

  for (const [key, group] of byString) {
    const entries = byLemma.get(key);
    if (!entries || entries.length === 0) {
      strings.notInBin++;
      rowStats.notInBin += group.length;
      continue;
    }
    const { entry, outcome, discarded } = chooseEntry(entries);
    if (!entry) {
      strings[outcome === 'refused-no-noun' ? 'refusedNoNoun' : 'refusedAmbiguous']++;
      rowStats.refused += group.length;
      refusals.push({ text: key, outcome, entries: entries.map(brief) });
      continue;
    }
    const forms = inflectionsFor(entry, key);
    if (forms === null) {
      // ⚠️ NOT the same fact as "not in BÍN". BÍN holds this word and it has no
      // form distinguishable from its base. The predecessor returned null for
      // both, which made the distinction unrecoverable downstream.
      strings.baseFormOnly++;
      rowStats.baseFormOnly += group.length;
      continue;
    }
    strings[outcome === 'rescued-nominal' ? 'rescuedNominal' : 'unambiguous']++;
    if (outcome === 'rescued-nominal') {
      rescues.push({ text: key, chosen: brief(entry), discarded: discarded.map(brief) });
    }
    plan.push({ ids: group.map((r) => r.id), json: formatInflectionsJson(forms) });
  }

  const resolvedRows = plan.reduce((a, p) => a + p.ids.length, 0);
  if (args.execute) {
    // ⚠️ THE `IS NULL` GUARD IS REPEATED HERE, NOT ONLY IN candidateSql — D5's
    // one-way fill must hold even if something populated the row between the
    // SELECT and this UPDATE.
    //
    // ⚠️ AND IT MUST BE DROPPED UNDER --force, OR THE FLAG IS A SILENT NO-OP.
    // --force removes `inflections IS NULL` from the candidate query; leaving it
    // in the UPDATE would select every row, write none of them, and report
    // `written: 0` with a full candidate count — the "flag parsed but never
    // read" shape CLAUDE.md names as durable. Caught while implementing, not by
    // a test: the row partition still balanced, because 0 written is a legal
    // outcome for the dry-run path.
    const update = db.prepare(
      args.force
        ? 'UPDATE concept_term SET inflections = ? WHERE id = ?'
        : 'UPDATE concept_term SET inflections = ? WHERE id = ? AND inflections IS NULL'
    );
    if (args.force) {
      console.log(
        '  ⚠️ --force: the IS NULL guard is OFF, so an existing paradigm WILL be overwritten.'
      );
    }
    // ⚠️ ALL-OR-NOTHING, matching the Python: sqlite3 opened an implicit
    // transaction and wrote only at commit(). better-sqlite3's db.transaction()
    // gives that directly (node:sqlite has no such helper — one reason server/
    // placement is simpler than the tools/ workaround it replaced).
    const apply = db.transaction((list) => {
      for (const p of list) {
        for (const id of p.ids) rowStats.written += update.run(p.json, id).changes;
      }
    });
    apply(plan);
    rowStats.alreadyPopulatedAfter = countPopulated();
  }

  // ⚠️ THE TRIPWIRE, IN BOTH UNITS — they fail differently. A string mis-bucketed
  // breaks the string partition; a row written twice or skipped breaks only the
  // row partition. 048's discipline: an unexplained remainder is louder than a
  // plausible total.
  const sSum =
    strings.unambiguous +
    strings.rescuedNominal +
    strings.refusedAmbiguous +
    strings.refusedNoNoun +
    strings.baseFormOnly +
    strings.notInBin;
  const rSum = resolvedRows + rowStats.refused + rowStats.baseFormOnly + rowStats.notInBin;
  const unexplained = [];
  if (sSum !== strings.total)
    unexplained.push(`strings: ${sSum} bucketed vs ${strings.total} total`);
  if (rSum !== rowStats.total)
    unexplained.push(`rows: ${rSum} bucketed vs ${rowStats.total} total`);
  if (args.execute && rowStats.written !== resolvedRows) {
    unexplained.push(`rows: ${rowStats.written} written vs ${resolvedRows} resolved`);
  }

  const pctS = (n) => `${((n / strings.total) * 100).toFixed(2)}%`;
  const pctR = (n) => `${((n / rowStats.total) * 100).toFixed(2)}%`;
  console.log('\n--- Inflection summary ---');
  console.log('  ⚠️ TWO UNITS: one Icelandic string owns many concept_term rows.');
  console.log(`  strings ${strings.total} · rows ${rowStats.total}`);
  console.log(
    `  unambiguous       ${strings.unambiguous} (${pctS(strings.unambiguous)} of strings)`
  );
  console.log(`  rescued-nominal   ${strings.rescuedNominal} (${pctS(strings.rescuedNominal)})`);
  console.log(
    `  refused-ambiguous ${strings.refusedAmbiguous} (${pctS(strings.refusedAmbiguous)})`
  );
  console.log(`  refused-no-noun   ${strings.refusedNoNoun} (${pctS(strings.refusedNoNoun)})`);
  console.log(`  base-form-only    ${strings.baseFormOnly} (${pctS(strings.baseFormOnly)})`);
  console.log(`  not in BÍN        ${strings.notInBin} (${pctS(strings.notInBin)})`);
  console.log(`  rows written      ${rowStats.written} (${pctR(rowStats.written)} of rows)`);
  console.log(`  multi-word rows skipped  ${multiWordSkipped}`);
  console.log(
    `  already populated (rows) ${alreadyPopulatedBefore} → ${rowStats.alreadyPopulatedAfter}`
  );

  if (unexplained.length) {
    console.error(`\n🔴 UNEXPLAINED: ${unexplained.join(' · ')}`);
    db.close();
    throw new Error(`bucket partition broken — ${unexplained.join(' · ')}`);
  }
  console.log(
    args.execute ? `\n✓ Changes committed to ${args.db}` : '\n*** DRY RUN — no changes written ***'
  );

  // ⚠️ EVERY RESCUE AND REFUSAL IS NAMED. D4.2 is a deliberate exception to D4's
  // never-guess rule and is defensible ONLY while a wrong pick stays discoverable
  // after the fact.
  if (rescues.length) {
    console.log(`\n--- D4.2 nominal rescues (${rescues.length}) ---`);
    for (const r of rescues.slice(0, 50)) {
      console.log(
        `  ${r.text}: chose ${r.chosen.wordClass}#${r.chosen.binId}, discarded ` +
          r.discarded.map((d) => `${d.wordClass}#${d.binId}`).join(' ')
      );
    }
    if (rescues.length > 50) {
      console.log(`  … ${rescues.length - 50} more — pass --report to get them all`);
    }
  }
  if (refusals.length) {
    console.log(`\n--- D4 refusals (${refusals.length}) ---`);
    for (const r of refusals.slice(0, 50)) {
      console.log(`  ${r.text}: ${r.entries.map((e) => `${e.wordClass}#${e.binId}`).join(' ')}`);
    }
    if (refusals.length > 50) {
      console.log(`  … ${refusals.length - 50} more — pass --report to get them all`);
    }
  }

  // ⚠️ THE TRUNCATION ABOVE IS WHY --report EXISTS. A real run makes ~906
  // refusals and ~403 rescues; stdout shows 50 of each, and "the full list is in
  // the return value" promises nothing to a shell caller.
  //
  // ⚠️ NEVER COMMIT THE FILE. It carries BÍN ids and word classes; it carries no
  // forms, and it must not start to (§C41: BÍN is CC BY-SA, this repo is public).
  if (args.report) {
    fs.writeFileSync(
      args.report,
      JSON.stringify({ strings, rows: rowStats, rescues, refusals }, null, 2),
      'utf-8'
    );
    console.log(`\n  full rescue/refusal lists → ${args.report} (do NOT commit: BÍN-derived ids)`);
  }

  db.close();
  return { strings, rows: rowStats, refusals, rescues };
}

module.exports = { parseArgs, candidateSql, main };

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
