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

module.exports = { formatImportReport, runImport };
