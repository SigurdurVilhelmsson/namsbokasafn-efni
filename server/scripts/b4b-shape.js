/**
 * B4b — READ-ONLY. The CONTRACT of terminology_translations.inflections.
 * `buildInflectionRegex` does `[icelandic, ...inflections]`, so a value that
 * parses to a non-array, or to an array containing non-strings, becomes a
 * malformed regex at MATCH time — far from the migration that copied it.
 * Copying bytes is not the same as copying a contract.
 */
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const db = new Database(resolveDbPath(), { readonly: true });
const line = (s) => console.log(s);

const rows = db
  .prepare(
    `SELECT icelandic, inflections FROM terminology_translations
      WHERE inflections IS NOT NULL AND inflections <> '' AND inflections <> '[]'`
  )
  .all();
line(`inflection-bearing rows: ${rows.length}`);

line('\n── 5 real values, verbatim ──');
for (const r of rows.slice(0, 5)) line(`  ${JSON.stringify(r.icelandic)} -> ${r.inflections}`);

let unparseable = 0,
  notArray = 0,
  nonStringMember = 0,
  emptyArray = 0,
  ok = 0;
const kinds = new Map();
let maxLen = 0;
const badSamples = [];
for (const r of rows) {
  let v;
  try {
    v = JSON.parse(r.inflections);
  } catch {
    unparseable++;
    if (badSamples.length < 5) badSamples.push(`UNPARSEABLE ${JSON.stringify(r.inflections)}`);
    continue;
  }
  if (!Array.isArray(v)) {
    notArray++;
    kinds.set(typeof v, (kinds.get(typeof v) || 0) + 1);
    if (badSamples.length < 5) badSamples.push(`NOT-ARRAY ${JSON.stringify(r.inflections)}`);
    continue;
  }
  if (v.length === 0) {
    emptyArray++;
    continue;
  }
  if (!v.every((x) => typeof x === 'string')) {
    nonStringMember++;
    if (badSamples.length < 5)
      badSamples.push(`NON-STRING MEMBER ${JSON.stringify(r.inflections)}`);
    continue;
  }
  maxLen = Math.max(maxLen, v.length);
  ok++;
}
line('\n── the contract, measured ──');
line(`  parses to an ARRAY OF STRINGS (usable) : ${ok}`);
line(`  parses but is an EMPTY array           : ${emptyArray}`);
line(`  ⚠️ unparseable JSON                     : ${unparseable}`);
line(
  `  ⚠️ parses to a NON-array                : ${notArray}${kinds.size ? ' (' + [...kinds].map(([k, n]) => k + '=' + n).join(', ') + ')' : ''}`
);
line(`  ⚠️ array containing a NON-string        : ${nonStringMember}`);
line(`  max inflected forms on one term         : ${maxLen}`);
if (badSamples.length) {
  line('\n  malformed samples:');
  for (const s of badSamples) line('    ' + s);
}

// Would any inflected form break a regex? buildInflectionRegex escapes, but an
// EMPTY STRING member would produce an always-matching alternative.
let emptyMember = 0;
for (const r of rows) {
  try {
    const v = JSON.parse(r.inflections);
    if (Array.isArray(v) && v.some((x) => typeof x === 'string' && x.trim() === '')) emptyMember++;
  } catch {
    /* counted above */
  }
}
line(`\n  ⚠️ arrays containing an EMPTY/blank string: ${emptyMember}`);
line('     (an empty alternative makes the regex match everywhere — a silent false PASS');
line('      on the `missing` check, i.e. an issue that should fire and never does)');

db.close();
line('\nDONE (read-only).');
