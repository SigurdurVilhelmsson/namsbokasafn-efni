#!/usr/bin/env node
/**
 * §C116 — remove the wrong-sense English headwords that no matching rule can fix.
 *
 * ── WHY A SCRIPT AND NOT SQL ───────────────────────────────────────────────────
 * The 2026-08-30 cleanup was hand-run SQL against `book_domain_priority`, and
 * migration 047 ("ENFORCEMENT, NOT A ONE-TIME SEED") silently reverted it on the next
 * boot. This targets `concept_term` instead, which NO migration writes — verified with
 * a positive control (047 does insert into `book_domain_priority`; 045/048 insert
 * nothing into `concept_term`). So these deletions are durable. Running it as a guarded,
 * reviewable, dry-run-by-default script rather than pasted SQL is the difference.
 *
 * ── WHAT IT DELETES, AND WHY EACH ONE ──────────────────────────────────────────
 * ONLY the ENGLISH (`lang='en'`) `concept_term` row. The concept and its Icelandic terms
 * are left intact — this removes a HEADWORD from the glossary, it does not destroy a
 * concept. `ON DELETE CASCADE` runs from concept→term, not term→concept, so deleting an
 * `en` row cannot take the concept with it.
 *
 * Every entry below passes §C73's test — "what does the model do UNPROMPTED?" — measured
 * against the committed `02-mt-output`, which was produced under an older glossary and is
 * therefore that control:
 *
 *   headword    forced value      unprompted count   what the model already produces
 *   is       -> lófalægur                   0        (the English copula; never a term)
 *   no       -> blóð-                       0
 *   at       -> marsnákaætt                 0
 *   di       -> sprettfiskaætt              0
 *   ic       -> sýrukær                     0
 *   py       -> graftar-                    0
 *   OS       -> gamli stíll                 0
 *   moles    -> moldvörpur                  0        (the ANIMAL; chemistry means mól)
 *   appendix -> botnlangi                   0        (the ORGAN)
 *   alcohol  -> vínandi                     0        alkóhól ×64  ← the right word
 *   molar    -> mól-                        0        mólar  ×34   ← bound form forced on
 *   molar    -> jaxl                        1        the standalone; jaxl is the TOOTH
 *   in       -> tomma                       2        (the English preposition)
 *   As       -> arsen                      20        arsen ×20 — already correct unprompted
 *   At       -> astat                       4        astat ×4  — already correct unprompted
 *
 * ⚠️ `As`/`At` are CORRECT translations and are still removed. §C73's rule is "delete it
 * when it overrides a choice the model makes better than a flat map can": the model
 * already writes `arsen` unprompted, so the entry buys nothing — while costing a false
 * fire on every sentence-initial "As we saw", which case-sensitivity CANNOT filter
 * (measured: 195 files → 112 after the matcher fix, not 0).
 *
 * ⚠️ `alcohol` is the case worth understanding. The concept carries `alkóhól | vínandi`
 * and `buildGlossaryMap` is LAST-WRITE-WINS, so the wrong one was reaching readers while
 * the right one sat in the same row. Chemistry has no `alcohol` concept of its own, so
 * this removes the headword entirely — which is correct, because `alkóhól` ×64 is what
 * the model already produces.
 *
 * ── AFTER RUNNING ──────────────────────────────────────────────────────────────
 * A one-time `node server/scripts/export-terminology.js --force` is required: the export
 * shrinks and the 2-hourly cron passes no override, so without it the export refuses and
 * opens a D6-clocked alarm instead of writing.
 *
 * Usage:
 *   node server/scripts/remove-wrong-sense-headwords.js            # dry run (default)
 *   node server/scripts/remove-wrong-sense-headwords.js --apply    # actually delete
 */
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');

/** `{english, domain}` pairs. Domain-qualified so a chemistry homograph is never hit. */
const REMOVE = Object.freeze([
  { english: 'is', domain: 'biology' },
  { english: 'no', domain: 'biology' },
  { english: 'at', domain: 'biology' },
  { english: 'di', domain: 'biology' },
  { english: 'ic', domain: 'biology' },
  { english: 'py', domain: 'biology' },
  { english: 'moles', domain: 'biology' },
  { english: 'appendix', domain: 'biology' },
  { english: 'alcohol', domain: 'biology' },
  { english: 'molar', domain: 'biology' },
  { english: 'in', domain: 'physics' },
  { english: 'molar', domain: 'physics' },
  { english: 'OS', domain: 'physics' },
  { english: 'As', domain: 'physics' },
  { english: 'At', domain: 'physics' },
  // Second batch, 2026-08-31: surfaced by G3 (function-word headwords) once the first batch
  // landed. Both are ordinary English words carrying a specialist abbreviation's sense, and
  // both fail §C73 outright — the forced value appears 0 times in 3.4M chars of committed MT.
  //   AM -> víddarmótun          (amplitude modulation)  ×0
  //   OR -> gagnlíkindahlutfall  (odds ratio)            ×0
  // ⚠️ `minus → mínus` and `plus → plús` are ALSO flagged by G3 and are deliberately NOT here:
  // they are CORRECT, the model produces them unprompted (×3 and ×8), and the render side
  // resolves both to the right value. G3's function-word heuristic is over-broad for these
  // two; deleting a correct term to turn a check green is the §C73 error in reverse.
  { english: 'AM', domain: 'physics' },
  { english: 'OR', domain: 'biology' },
  { english: 'OR', domain: 'physics' },
]);

function main() {
  const apply = process.argv.includes('--apply');
  const db = new Database(resolveDbPath(), { readonly: !apply });

  // 🔴 THE MATCH IS CASE-SENSITIVE AND EXACT. SQLite's `=` on TEXT is case-sensitive by
  // default, but `LIKE` is NOT — and `As` vs `as` is exactly the distinction this whole
  // item is about, so using LIKE here would delete the wrong row while looking right.
  const find = db.prepare(`
    SELECT en.id AS en_term_id, en.text AS english, c.domain, c.id AS concept_id,
           (SELECT group_concat(t2.text, ' | ') FROM concept_term t2
             WHERE t2.concept_id = c.id AND t2.lang = 'is') AS icelandic
      FROM concept_term en JOIN concept c ON c.id = en.concept_id
     WHERE en.lang = 'en' AND en.text = ? AND c.domain = ?`);

  const targets = [];
  const missing = [];
  for (const r of REMOVE) {
    const rows = find.all(r.english, r.domain);
    if (rows.length === 0) missing.push(r);
    else targets.push(...rows);
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${resolveDbPath()}\n`);
  for (const t of targets) {
    console.log(
      `  en_term ${String(t.en_term_id).padStart(7)}  ${t.english.padEnd(10)} ` +
        `${t.domain.padEnd(9)} concept ${String(t.concept_id).padEnd(7)} -> ${t.icelandic}`
    );
  }
  console.log(`\n  ${targets.length} English headword row(s) matched.`);

  // Already-absent is reported, never treated as an error: this script is idempotent by
  // design, and a second run legitimately finds nothing. Silence here would make a
  // re-run indistinguishable from a run against the wrong database.
  if (missing.length) {
    console.log(`  ${missing.length} already absent (idempotent re-run, or a different DB):`);
    for (const m of missing) console.log(`     ${m.english} (${m.domain})`);
  }

  if (!apply) {
    console.log('\nDry run — nothing was written. Re-run with --apply to delete.');
    db.close();
    return;
  }

  const del = db.prepare('DELETE FROM concept_term WHERE id = ? AND lang = ?');
  const run = db.transaction((rows) => {
    let n = 0;
    // `AND lang = 'en'` is restated at the delete even though the SELECT already filtered
    // on it: the id came from another statement, and a guard that costs nothing belongs on
    // the statement that does the damage, not only on the one that chose the target.
    for (const t of rows) n += del.run(t.en_term_id, 'en').changes;
    return n;
  });
  const deleted = run(targets);
  console.log(`\n  DELETED ${deleted} row(s).`);
  console.log('  NEXT: node server/scripts/export-terminology.js --force  (the cron cannot).');
  db.close();
}

if (require.main === module) main();
module.exports = { REMOVE };
