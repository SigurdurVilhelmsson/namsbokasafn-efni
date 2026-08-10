/**
 * B4b CONTROL — READ-ONLY. Q6 returned a perfect 100% subset, which is the shape
 * a broken comparison also produces. This re-derives it by a DIFFERENT method
 * (in-memory sets, no SQL join) and pairs it with two comparisons that MUST come
 * out low. If the EN/IS control also reports ~100%, the method is wrong, not the
 * corpus.
 */
const Database = require('better-sqlite3');
const resolveDbPath = require('./lib/dbPath');
const db = new Database(resolveDbPath(), { readonly: true });
const line = (s) => console.log(s);

const fold = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase()); // nocaseKey, ASCII-only

const enSet = new Set(
  db
    .prepare("SELECT DISTINCT text FROM concept_term WHERE lang='en'")
    .all()
    .map((r) => fold(r.text))
);
const isSet = new Set(
  db
    .prepare("SELECT DISTINCT text FROM concept_term WHERE lang='is'")
    .all()
    .map((r) => fold(r.text))
);
const headwords = db
  .prepare('SELECT DISTINCT english FROM terminology_headwords')
  .all()
  .map((r) => r.english);

line(`concept_term EN distinct (folded): ${enSet.size}`);
line(`concept_term IS distinct (folded): ${isSet.size}`);
line(`old headwords distinct           : ${headwords.length}`);

const inEn = headwords.filter((h) => enSet.has(fold(h)));
const inIs = headwords.filter((h) => isSet.has(fold(h)));
line(
  `\n  MEASUREMENT : old headwords found in concept_term EN : ${inEn.length}  (${((100 * inEn.length) / headwords.length).toFixed(1)}%)`
);
line(
  `  CONTROL     : old headwords found in concept_term IS : ${inIs.length}  (${((100 * inIs.length) / headwords.length).toFixed(1)}%)`
);
line('  → the CONTROL must be LOW. English headwords are not Icelandic words.');
line('    If both read ~100%, the comparison is broken, not the corpus.');

const missing = headwords.filter((h) => !enSet.has(fold(h)));
line(`\n  old headwords ABSENT from concept_term EN: ${missing.length}`);
if (missing.length) line('    e.g. ' + missing.slice(0, 10).join(' · '));

// SECOND CONTROL: a string that must NOT be there.
const bogus = ['zzz-not-a-real-term-xyz', 'qqqqqqq'];
line(
  `\n  CONTROL 2 (bogus strings, must be false): ${bogus.map((b) => `${b}=${enSet.has(b)}`).join(' · ')}`
);

// Direction check: the concept model is a strict SUPERSET, so the reverse must be far from 100%.
const hwSet = new Set(headwords.map(fold));
let enInHw = 0;
for (const e of enSet) if (hwSet.has(e)) enInHw++;
line(
  `\n  REVERSE: concept EN strings that are also old headwords: ${enInHw} of ${enSet.size} (${((100 * enInHw) / enSet.size).toFixed(1)}%)`
);
line('  → must be ~33%, not ~100%. A symmetric result would mean the sets are identical,');
line('    contradicting 20,272 vs 61,042.');

db.close();
line('\nDONE (read-only).');
