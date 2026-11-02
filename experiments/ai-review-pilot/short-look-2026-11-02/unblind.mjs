// Joins the saved verdicts to the sample key, per category, and applies the drop rule
// (any wrong-changed, or >= 2 wrong of either kind, drops the category).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const key = JSON.parse(readFileSync('sample.json', 'utf8')).key;
const items = Object.fromEntries(JSON.parse(readFileSync('items.json', 'utf8')).map((i) => [i.id, i]));
const verdicts = Object.fromEntries(readdirSync('answers/verdicts').map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(`answers/verdicts/${f}`, 'utf8'))]));
const rows = key.map((k) => ({ ...k, choice: verdicts[k.id]?.choice ?? 'OPEN', note: verdicts[k.id]?.note ?? '' }));
const byCat = {};
for (const r of rows) (byCat[r.category] ??= []).push(r);
const summary = {};
for (const [cat, rs] of Object.entries(byCat)) {
  const n = (c) => rs.filter((r) => r.choice === c).length;
  const s = { total: rs.length, right: n('right'), wrongKept: n('wrong-kept'), wrongChanged: n('wrong-changed'), cantJudge: n('cant-judge'), open: n('OPEN') };
  s.wrong = s.wrongKept + s.wrongChanged;
  s.drop = s.wrongChanged > 0 || s.wrong >= 2;
  s.reason = s.wrongChanged > 0 ? 'a wrong-changed' : s.wrong >= 2 ? '>=2 wrong' : null;
  summary[cat] = s;
}
writeFileSync('unblinded.json', JSON.stringify({ rule: 'drop on any wrong-changed or >=2 wrong per category', summary, rows }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 1));
for (const r of rows.filter((r) => r.choice !== 'right' || r.note)) {
  const it = items[r.id];
  console.log(`\n== ${r.id} ${r.category} ${r.choice} | ${r.opId} ${r.segmentType}`);
  console.log(' find:', JSON.stringify(it.find), ' replace:', JSON.stringify(it.replace));
  console.log(' judged mt:', JSON.stringify(it.judged?.mt), ' sg:', JSON.stringify(it.judged?.suggestion));
  console.log(' note:', r.note);
}
