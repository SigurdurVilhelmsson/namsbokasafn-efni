/**
 * READ-ONLY. How many stored inflection sets are homograph-contaminated?
 *
 * THE DIAGNOSTIC: Icelandic suffixed definite articles are gender-marked in the
 * NOMINATIVE SINGULAR — masculine `-inn`, neuter `-ið`. One noun cannot have
 * both. A paradigm containing both therefore merges at least two lemmas.
 *
 * ⚠️ WHY THIS PAIR AND NOT `-in`: `-in` is BOTH feminine nom.sg.def (`bókin`)
 * and neuter nom.pl.def (`börnin`), so it cannot discriminate. `-inn`/`-ið` can.
 *
 * ⚠️ ADJECTIVES ARE THE CONFOUND AND THIS TEST IS IMMUNE TO THEM: adjectives
 * inflect for all three genders, but they take NO suffixed article, so neither
 * pattern appears in an adjective paradigm. Verified against a known adjective
 * below as a CONTROL — if the control fires, the diagnostic is wrong.
 *
 * This UNDERCOUNTS: it sees only masc/neut noun collisions. Same-gender
 * homographs, and collisions involving adjectives or verbs, are invisible to it.
 * The number it prints is therefore a FLOOR, not the contamination rate.
 */
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const db = new Database(resolveDbPath(), { readonly: true });
const line = (s) => console.log(s);

const rows = db
  .prepare(
    `SELECT t.id, t.icelandic, t.inflections, h.english, h.pos
       FROM terminology_translations t
       JOIN terminology_headwords h ON h.id = t.headword_id
      WHERE t.inflections IS NOT NULL AND t.inflections <> '' AND t.inflections <> '[]'`
  )
  .all();
line(`inflection-bearing rows: ${rows.length}`);

// Is there ANY disambiguation signal available in the data today?
const posStats = db
  .prepare(
    `SELECT COUNT(*) tot, SUM(CASE WHEN pos IS NOT NULL AND pos <> '' THEN 1 ELSE 0 END) withPos
       FROM terminology_headwords`
  )
  .get();
line(`\n══ Disambiguation signal available today ══`);
line(`  terminology_headwords with a non-empty pos: ${posStats.withPos} of ${posStats.tot}`);
line('  → if this is 0, a pos-aware fix has NOTHING LOCAL to discriminate on and must');
line('    take its signal from BIN itself (word class / BIN id), not from our own rows.');

const mascDef = (f) => /inn$/.test(f);
const neutDef = (f) => /ið$/.test(f);

let contaminated = 0;
const samples = [];
for (const r of rows) {
  let forms;
  try {
    forms = JSON.parse(r.inflections);
  } catch {
    continue;
  }
  if (!Array.isArray(forms)) continue;
  const m = forms.filter(mascDef);
  const n = forms.filter(neutDef);
  if (m.length && n.length) {
    contaminated++;
    if (samples.length < 12)
      samples.push(
        `  ${r.icelandic.padEnd(18)} (${r.english}) masc:${m.slice(0, 2).join(',')} neut:${n.slice(0, 2).join(',')}  [${forms.length} forms]`
      );
  }
}
line(`\n══ Contamination FLOOR (masc -inn together with neut -ið) ══`);
line(
  `  contaminated paradigms: ${contaminated} of ${rows.length}  (${((100 * contaminated) / rows.length).toFixed(2)}%)`
);
line('\n  samples:');
for (const s of samples) line(s);

// ── THE CONTROL: adjectives must NOT fire. If they do, the test is invalid. ──
line('\n══ CONTROL — adjectives must not trigger the diagnostic ══');
const adjLike = rows.filter((r) => /(ur|legur|aður)$/.test(r.icelandic));
let adjFired = 0;
for (const r of adjLike) {
  let forms;
  try {
    forms = JSON.parse(r.inflections);
  } catch {
    continue;
  }
  if (!Array.isArray(forms)) continue;
  if (forms.some(mascDef) && forms.some(neutDef)) adjFired++;
}
line(`  -ur/-legur/-aður terms examined: ${adjLike.length}, of which fired: ${adjFired}`);
line('  ⚠️ NOTE this set is NOT adjectives-only — masculine nouns also end -ur');
line('     (hestur, alkalímálmur). A non-zero count here is EXPECTED and is not a');
line('     failure of the control; what would invalidate the test is a KNOWN adjective');
line('     firing. Checked explicitly:');
for (const probe of ['afturkræfur', 'gagnhverfur']) {
  const r = rows.find((x) => x.icelandic === probe);
  if (!r) {
    line(`     ${probe}: not present`);
    continue;
  }
  const forms = JSON.parse(r.inflections);
  line(
    `     ${probe}: masc-def forms=${forms.filter(mascDef).length} neut-def forms=${forms.filter(neutDef).length} -> ${forms.some(mascDef) && forms.some(neutDef) ? 'FIRED (test INVALID)' : 'clean (as required)'}`
  );
}

// A second, independent signal: paradigm SIZE. A single Icelandic noun has at
// most 16 forms (4 cases x 2 numbers x 2 definiteness). More than that on a
// NOUN means a merge — or that it is not a noun.
line('\n══ Second signal — paradigm size ══');
const sizes = rows
  .map((r) => {
    try {
      const f = JSON.parse(r.inflections);
      return Array.isArray(f) ? f.length : 0;
    } catch {
      return 0;
    }
  })
  .filter(Boolean)
  .sort((a, b) => a - b);
const pct = (p) => sizes[Math.floor((p / 100) * (sizes.length - 1))];
line(
  `  min ${sizes[0]} · p50 ${pct(50)} · p90 ${pct(90)} · p99 ${pct(99)} · max ${sizes[sizes.length - 1]}`
);
line(
  `  paradigms with >16 forms (above a single noun's ceiling): ${sizes.filter((s) => s > 16).length}`
);
line('  → adjectives legitimately exceed 16, so this is a POINTER, not a verdict.');

db.close();
line('\nDONE (read-only).');
