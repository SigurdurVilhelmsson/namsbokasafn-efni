// G1.7 §8 landing condition 1, verified: every study unit (listStudyUnits, the freeze's own enumeration) has its
// 02-for-mt file REWRITTEN by the fresh extraction (mtime after the run's start: the control that a "byte-identical"
// file was not simply left untouched) AND byte-identical to the committed file at the base (the real worktree, whose
// 02-for-mt equals ae833a0d1). Also reports every other changed file under 02-for-mt / 02-structure, informationally.
const fs = require('fs');
const path = require('path');
const REPO = '/home/siggi/dev/repos/namsbokasafn-efni/.claude/worktrees/c46-bundle';
const S = '/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni--claude-worktrees-c46-bundle/65cf454c-c38e-4656-b54a-f1df1c1536f4/scratchpad';
const OUT = path.join(S, 'cut-extract');
const { listStudyUnits } = require(path.join(REPO, 'server/lib/studyUnits.js'));
const start = Number(fs.readFileSync(path.join(S, 'cut-extract-logs/start-epoch'), 'utf8')) * 1000;
const book = 'efnafraedi-2e';

const units = listStudyUnits({ book, booksDir: path.join(REPO, 'books') });
const res = { units: units.length, rewrittenIdentical: 0, rewrittenDifferent: [], notRewritten: [], missing: [] };
for (const u of units) {
  const rel = path.relative(path.join(REPO, 'books'), u.enSource);
  const fresh = path.join(OUT, 'books', rel);
  if (!fs.existsSync(fresh)) { res.missing.push(u.unit); continue; }
  const rewritten = fs.statSync(fresh).mtimeMs >= start;
  const same = Buffer.compare(fs.readFileSync(fresh), fs.readFileSync(u.enSource)) === 0;
  if (!rewritten) res.notRewritten.push(`${u.unit}${same ? ' (identical, untouched)' : ' (DIFFERENT, untouched)'}`);
  else if (same) res.rewrittenIdentical++;
  else res.rewrittenDifferent.push(u.unit);
}

// Every other file under the two generated trees (excluding safeWrite's .backup.* copies), informationally.
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (!/\.backup\.\d{4}-/.test(e.name)) acc.push(p);
  }
  return acc;
}
const unitFiles = new Set(units.map((u) => path.relative(path.join(REPO, 'books'), u.enSource)));
const other = { forMtChanged: [], forMtNew: [], structureChanged: 0, structureChangedOnlyExtractedAt: 0, structureOtherChange: [] };
for (const tree of ['02-for-mt', '02-structure']) {
  for (const fresh of walk(path.join(OUT, 'books', book, tree))) {
    const rel = path.relative(path.join(OUT, 'books'), fresh);
    if (unitFiles.has(rel)) continue;
    const committed = path.join(REPO, 'books', rel);
    if (!fs.existsSync(committed)) { if (tree === '02-for-mt') other.forMtNew.push(rel); else other.structureOtherChange.push(`NEW ${rel}`); continue; }
    const a = fs.readFileSync(fresh, 'utf8');
    const b = fs.readFileSync(committed, 'utf8');
    if (a === b) continue;
    if (tree === '02-for-mt') { other.forMtChanged.push(rel); continue; }
    other.structureChanged++;
    const strip = (s) => s.replace(/"extractedAt":\s*"[^"]*"/g, '"extractedAt":"X"');
    if (strip(a) === strip(b)) other.structureChangedOnlyExtractedAt++;
    else other.structureOtherChange.push(rel);
  }
}
const pass = res.units > 0 && res.rewrittenIdentical === res.units;
console.log(JSON.stringify({ ...res, other, verdict: pass ? 'LANDING CONDITION 1: PASS' : 'LANDING CONDITION 1: FAIL' }, null, 1));
process.exitCode = pass ? 0 : 1;
