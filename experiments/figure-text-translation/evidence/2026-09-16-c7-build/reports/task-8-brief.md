### Task 8: Verify on the corpus, record the evidence, update the documentation

**Files:**
- Create: `experiments/figure-text-translation/evidence/2026-09-16-c7-build/reports/after/…` (generated), `VERIFICATION.md`, `README.md`
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C140 ⑦ row, new ⏩ RESUME block), `experiments/figure-text-translation/REGISTER.md` (the "driver spend gate" component row), `experiments/figure-text-translation/README.md` (read layer and resolver sections)

- [ ] **Step 1: After-runs, 0 ISK**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1        # ALL PASS before any figure-run
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-16-c7-build/instruments/prepare_corpus.py --label after \
  > evidence/2026-09-16-c7-build/reports/after/run.log 2>&1; tail -1 evidence/2026-09-16-c7-build/reports/after/run.log
cd /home/siggi/dev/repos/namsbokasafn-efni
A=experiments/figure-text-translation/evidence/2026-09-16-c7-build/reports/after
for ch in 5 9 10 11 18; do node tools/figure-run.js --book efnafraedi-2e --chapter $ch --dry-run > $A/dry-ch$ch.txt 2>&1; echo "ch$ch exit=$?" >> $A/dry-exit.txt; done
git status --porcelain -- books/                                   # expect: empty
```

- [ ] **Step 2: Check P1–P9 against the files**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-16-c7-build/reports
python3 - <<'EOF'
import csv
def rows(label):
    return {r['basename']: r for r in csv.DictReader(open(f'{label}/summary.tsv'), delimiter='\t')}
b, a = rows('before'), rows('after')
bought = [n for n, r in b.items() if r['group'] == 'bought']
moved = [n for n in bought if b[n]['blocks_sha256'] != a[n]['blocks_sha256']]
print('P1 bought', len(bought), 'blocks moved:', moved, '; repairs in bought:',
      [n for n in bought if a[n]['glyphRepairs'] not in ('[]', 'null', '-')])
for n in ('CNX_Chem_10_01_PentIso', 'CNX_Chem_09_02_Amontons2', 'CNX_Chem_11_04_rvosmosis', 'CNX_Chem_18_07_N2O5'):
    print(n, '| before:', b[n]['status'], b[n]['artwork'].split('/')[-1], '| after:', a[n]['status'],
          a[n]['artwork'].split('/')[-1], a[n]['blocks'], a[n]['sendable'], a[n]['glyphRepairs'])
EOF
grep -h "36 °C\|27 °C\|9.5 °C" after/blocks/CNX_Chem_10_01_PentIso.blocks.json | head -3
grep -h '"english"' after/blocks/CNX_Chem_09_02_Amontons2.blocks.json | head -4
for ch in 5 9 10 11 18; do echo "== ch$ch"; grep -E "REFUSED|earlier translated copy|glyphs repaired|glyphs NOT|would buy|VERDICT" after/dry-ch$ch.txt; done
```
Expected: `P1 bought 34 blocks moved: [] ; repairs in bought: []`; PentIso after `ok … 3 repairs`, blocks read `°C`; Amontons2 blocks `−100`/`−50`; rvosmosis after `refused:production-page`; N2O5 after `ok CNX_Chem_18_07_N2O5.eps 7 0`; ch11 names the refusal and the still-mapped copy; ch10 names PentIso's repair and a would-buy list; ch05 has a would-buy list and no refusal or glyph section.

- [ ] **Step 3: Full test suites, by name**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation
for t in test_readlayer.py test_figure_prepare.py test_sources.py test_sendable.py test_figure_compose.py test_make_fixture.py; do
  printf '%s: ' $t; FIGTEXT_PYLIBS=./pylibs python3 $t 2>&1 | tail -1
done > evidence/2026-09-16-c7-build/reports/after/python-tests.txt; cat evidence/2026-09-16-c7-build/reports/after/python-tests.txt
cd /home/siggi/dev/repos/namsbokasafn-efni
npx vitest run --reporter=json --outputFile=/tmp/c7-vitest-after.json > /dev/null 2>&1
node -e "
const r=require('/tmp/c7-vitest-after.json'); const now=[];
for (const f of r.testResults) for (const a of f.assertionResults) if (a.status==='failed') now.push(require('path').relative(process.cwd(), f.name)+' :: '+a.ancestorTitles.concat(a.title).join(' '));
now.sort(); const E='experiments/figure-text-translation/evidence/2026-09-16-c7-build/reports';
require('fs').writeFileSync(E+'/after/npm-failing-by-name.txt', now.join('\n')+'\n');
const before=require('fs').readFileSync(E+'/before/npm-failing-by-name.txt','utf8').trim().split('\n');
console.log('now', now.length, 'before', before.length);
console.log('only-now', now.filter(n=>!before.includes(n)), 'only-before', before.filter(n=>!now.includes(n)));
console.log('files that died without a failing test:', r.testResults.filter(f=>f.status==='failed' && !f.assertionResults.some(a=>a.status==='failed')).map(f=>f.name));
const planted=[...now,'tools/__tests__/zz.test.js :: planted']; console.log('CONTROL planted shows as only-now:', planted.filter(n=>!before.includes(n)));"
```
Expected: every Python line `ALL PASS`; `only-now []`, `only-before []`, no file that died, and the planted name surfaces.

- [ ] **Step 4: Write `VERIFICATION.md` and `README.md` for the evidence folder**

`VERIFICATION.md`: one table row per prediction P1–P10 with `predicted | measured | file`, copying numbers from the files above (never retyped from memory). `README.md`: a frozen banner (`🧊 FROZEN, 2026-09-16 … status lives in the campaign register §C140 ⑦`), what the folder holds (instruments, before/after reports, predictions, verification), the commands from Tasks 1 and 8, and a Limits section copied from the spec's § 8.

- [ ] **Step 5: Update the documentation**

- Register §C140 ⑦ row, status cell: `✅ built + verified on feat/c140-c7-spend-gates` with links to the spec, this plan and `evidence/2026-09-16-c7-build/VERIFICATION.md`; keep the problem cells as they are.
- Register: a new ⏩ RESUME block on top whose single next action is `[USER]'s merge of the ⑦ PR → deploy → §C140 ④`, stating that ⑦ is merged-pending, and that the two live June sheets are named by the run report but not retired (S1).
- `experiments/figure-text-translation/REGISTER.md`: the `driver spend gate` component row → `✅ repairs misread symbol glyphs (figglyphs), refuses production pages at resolution, lists would-buy figures with billable characters` citing `evidence/2026-09-16-c7-build/VERIFICATION.md`.
- `experiments/figure-text-translation/README.md`: one paragraph under the read-layer section naming `figglyphs.py` and the "add an entry only with a raster" rule; one under the resolver section naming the paper-size refusal and `resolve_detail`.

- [ ] **Step 6: Commit, push, open the PR**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/evidence/2026-09-16-c7-build docs/plans/2026-07-21-post-item17-followup-campaign.md experiments/figure-text-translation/REGISTER.md experiments/figure-text-translation/README.md
git commit -m "docs(figures): §C140 ⑦ verified on the corpus, 0 ISK — keys of the 34 unmoved, both hazards caught

Before/after prepares of the 34 bought figures: blocks.json byte-identical,
no repairs. PentIso reads °C (3 repairs), Amontons2 reads −100/−50,
rvosmosis refused as a Letter page, N2O5 resolves to its EPS. Dry runs of
ch05/09/10/11/18 name refusals, still-mapped copies, repairs and would-buy
lists. Python ALL PASS; npm test failing names identical to the baseline
both directions, planted control surfaces.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/c140-c7-spend-gates
```
Open the PR with `gh pr create --base main`, body: what ⑦ does, the verification table's headline rows, "merge commit, not squash — the evidence cites SHAs", and that merging needs a deploy for prod to read the new resolver (no server code). **Do not merge** — the merge is [USER]'s.
