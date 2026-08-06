/**
 * Captures the C24 golden oracle. Run: node server/scripts/capture-c24-golden.js
 *
 * ⚠️ MUST be run against the UNMODIFIED matcher — after the ordering fix, and
 * BEFORE any Aho-Corasick code exists. Re-running it after the swap would
 * certify the new implementation against itself and destroy the oracle. There is
 * no observable difference between a correct golden and a worthless one, which
 * is exactly why this is dangerous.
 *
 * If the golden ever needs regenerating, do it from a checkout at the pre-swap
 * commit — never from HEAD.
 *
 * Captured 2026-08-06 at commit c991e2b8 (Task 2 complete, Task 6 not started).
 */
const path = require('path');
const fs = require('fs');
const { createTestDb } = require('../__tests__/helpers/terminologyTestDb');
const terminologyService = require('../services/terminologyService');

const FIX = path.join(__dirname, '..', '__tests__', 'fixtures');
const terms = JSON.parse(fs.readFileSync(path.join(FIX, 'c24-terms.json'), 'utf-8'));
const segments = JSON.parse(fs.readFileSync(path.join(FIX, 'c24-segments.json'), 'utf-8'));

const db = createTestDb();
terminologyService._setTestDb(db);

const insHw = db.prepare('INSERT INTO terminology_headwords (english, pos) VALUES (?, ?)');
const insTr = db.prepare(
  `INSERT INTO terminology_translations
     (headword_id, icelandic, inflections, source, status, proposed_by, proposed_by_name)
   VALUES (?, ?, ?, 'fixture', ?, 'u1', 'Fixture')`
);
const insSubj = db.prepare(
  'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
);

for (const hw of terms.headwords) {
  const hwId = Number(insHw.run(hw.english, hw.pos).lastInsertRowid);
  for (const tr of hw.translations) {
    const trId = Number(
      insTr.run(
        hwId,
        tr.icelandic,
        tr.inflections ? JSON.stringify(tr.inflections) : null,
        tr.status
      ).lastInsertRowid
    );
    for (const s of tr.subjects) insSubj.run(trId, s);
  }
}

const golden = terminologyService.findTermsInSegments(segments, 'efnafraedi-2e');
fs.writeFileSync(path.join(FIX, 'c24-golden.json'), JSON.stringify(golden, null, 1) + '\n');

const nMatches = Object.values(golden).reduce((n, r) => n + r.matches.length, 0);
const nIssues = Object.values(golden).reduce((n, r) => n + r.issues.length, 0);
console.log(
  `golden: ${Object.keys(golden).length} segments, ${nMatches} matches, ${nIssues} issues`
);
if (nMatches === 0 || nIssues === 0) {
  console.error('REFUSING: a golden with zero matches or zero issues proves nothing.');
  process.exitCode = 1;
}

terminologyService._setTestDb(null);
db.close();
