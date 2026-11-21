// What the head-editor page's automatic BÍN lookup finds for each of the 59 §C73 entries' Icelandic,
// using the page's own chooser (server/lib/binInflections: loadBinEntries -> preferExactCase ->
// chooseEntry -> inflectionsFor, as server/scripts/fetch-bin-inflections.js runs it). Writes only the
// outcome and the NUMBER of forms per name, never the forms: BÍN is CC BY-SA and is not committed
// (docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md).
//
// Usage (from this folder; SHsnid.csv unpacked from your own BÍN download):
//   node bin-outcomes-c73.cjs <SHsnid.csv> ../reports/c73-entries.json ../data/c73-bin-outcomes.json
const fs = require('fs');
const path = require('path');

const [csv, entriesPath, outPath] = process.argv.slice(2);
if (!csv || !entriesPath || !outPath) throw new Error('usage: node bin-outcomes-c73.cjs <SHsnid.csv> <c73-entries.json> <out.json>');
const bin = require(path.resolve(__dirname, '../../../../../server/lib/binInflections'));

async function main() {
  process.exitCode = 1;
  const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8')).entries;
  if (entries.length !== 59) throw new Error(`expected 59 entries, got ${entries.length}`);
  const keys = new Set(entries.map((e) => e.icelandic.toLowerCase().trim()));
  const byLemma = await bin.loadBinEntries(csv, keys);
  const rows = entries.map((e) => {
    const key = e.icelandic.toLowerCase().trim();
    const all = byLemma.get(key) || [];
    if (all.length === 0) return { english: e.english, icelandic: e.icelandic, outcome: 'not-in-bin', forms: 0 };
    const { entry, outcome } = bin.chooseEntry(bin.preferExactCase(all, e.icelandic));
    const forms = entry ? bin.inflectionsFor(entry, key) : null;
    return {
      english: e.english,
      icelandic: e.icelandic,
      outcome: entry && forms === null ? 'base-form-only' : outcome,
      forms: forms ? forms.length : 0,
      ...(entry ? {} : { binEntries: all.length }),
    };
  });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ _meta: { measured: '2026-11-21', chooser: 'server/lib/binInflections', bin: 'SHsnid.csv (not committed)' }, rows }, null, 1) + '\n'
  );
  const tally = {};
  for (const r of rows) tally[r.outcome] = (tally[r.outcome] || 0) + 1;
  console.log(JSON.stringify(tally));
  process.exitCode = 0;
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
