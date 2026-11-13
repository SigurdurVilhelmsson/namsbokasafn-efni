#!/usr/bin/env bash
# G1.12 Task 5: the before/after run (design docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md
# §7 item 3, plus the re-MT battery per the build ledger's Ruling 21).
#
#   G112_SCRATCH=<an empty directory> bash test-results/g112-duplicate-ids-2026-11-12/before-after.sh <base-ref>
#
# Compares <base-ref> (the last commit before G1.12) with this checkout's HEAD (the branch). For each side in
# turn it checks the commit out as a detached worktree ON DISK, at ONE path that both sides share, so that no
# absolute path in any tool's output can differ between them:
#   ${G112_WORKTREE_DIR:-<repo>/.claude/worktrees}/g112-before-after-side
# (a checkout is ~2.8 GB and /tmp is a RAM disk; only the outputs go under $G112_SCRATCH). Both node_modules
# trees are symlinked in. Then, saving stdout, stderr and the exit code of every command under
# $G112_SCRATCH/out-<side>/cmd/, it runs, in this order:
#   1. the §C82 battery, every tier, through battery-verdicts.mjs --root <side> (this checkout's copy: the
#      script does not exist at base). First, while the side tree is still a pristine checkout;
#   2. cnxml-inject --book efnafraedi-2e --source-dir 02-mt-output --track mt-preview for chapters 0-21 and
#      appendices, then a copy of books/efnafraedi-2e/03-translated/mt-preview without *.backup.* files;
#   3. source-roundtrip-check efnafraedi-2e <dir> for every chemistry 01-source chapter dir;
#   4. render-oracle-check efnafraedi-2e ch01, ch03, and ch03 --control;
#   5. validate-chapter efnafraedi-2e <n> --track mt-preview for chapters 1-21;
#   6. cnxml-extract --book <b> --chapter <n> for every chapter dir of edlisfraedi-2e, liffraedi-2e,
#      orverufraedi and lifraen-efnafraedi (organic is extracted in scratch only, spec §5.5; nothing of it is
#      ever committed), then a copy of each book's 02-for-mt and 02-structure without *.backup.* files and
#      with every manifest's "extractedAt" line deleted.
# Then the worktree is removed (git worktree remove --force; git worktree prune).
#
# The verdict. Every command must exist on both sides with the same exit code. Every copied tree must be
# byte-identical. stdout must be byte-identical. stderr must be identical except for the ONE accepted class:
# lines `Note: N duplicate segment(s) skipped (first-match-wins)` present on base and absent on the branch
# (G1.12 removes the English duplicates that inject's parseSegments reports). Those are checked by VALUE
# against the frozen list books/efnafraedi-2e/g112-unserved-copies.json: for inject, source-roundtrip-check
# and render-oracle-check (without --control), the removed Ns of each command must equal, as a multiset,
# the per-module duplicate counts of that chapter's listed modules (for render-oracle-check, the listed
# modules its manifest covers); for --control, which renders a module more than once and stops at its
# first usable module, every removed line must still be that note. inject and source-roundtrip-check cover
# every chapter, so each must remove exactly 83 lines whose Ns sum to 285. validate-chapter's stdout and
# stderr are compared after one timestamp normalisation (ISO 8601 instants -> <TS>), applied to both sides.
# The battery: 0 (check, unit) verdicts may differ, the two dumps must hold the same non-zero number of
# verdicts with no key on one side only and no CTX-FAILED, and the only finding-level difference allowed is
# the one already recorded in battery-before-fix.txt (A7 ch20/m68848, number-mismatch x3 -> x2: the
# re-extract no longer pairs the second copy). Anything else prints the differing lines and fails.
#
# ONE OTHER DIFFERENCE IS PRE-REGISTERED, BY EXACT VALUE (build ledger Ruling 22): physics ch03 m42045, where a
# fresh extract shows the G1.12 shape (a para in a note nested directly in an example, emitted twice at base and
# once on the branch). The first full run found it; spec §3 and §5.5 had counted only committed 02-for-mt, which
# for physics holds ch04 alone. Accepted are exactly: that command's stdout line 155 -> 154 segments; the one
# removed block of m42045:para:import-auto-id1839825 in m42045-segments.en.md (base minus its second block must
# equal the branch file byte for byte); and in m42045-manifest.json segmentCount 155 -> 154 with exactly that id's
# later entry removed from segmentIds, every other key equal. The difference must be observed; any other physics
# difference, in another module, id or count, still fails.
#
# The exit code is the verdict, and the last line is `RESULT: PASS` or `RESULT: FAIL`. An interrupted run
# removes its worktree and ends `RESULT: FAIL`. Writes nothing in this checkout.
#
# G112_SMOKE=1 runs a reduced set (chemistry ch01 and ch03, orverufraedi ch01, the battery) to try the
# script; its totals are not checked and its result is not evidence.

set -u -o pipefail

VERDICT_REACHED=0
WT=''
cleanup() {
  if [ -n "$WT" ] && [ -e "$WT" ]; then
    git -C "$REPO_ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || echo "WARNING: could not remove $WT"
    git -C "$REPO_ROOT" worktree prune
  fi
  if [ "$VERDICT_REACHED" != 1 ]; then
    echo 'RESULT: FAIL (the run stopped before a verdict)'
    exit 1
  fi
}
trap cleanup EXIT
die() {
  echo "ERROR: $*"
  exit 1
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE="$REPO_ROOT/test-results/g112-duplicate-ids-2026-11-12"
BOOK=efnafraedi-2e
OTHER_BOOKS=(edlisfraedi-2e liffraedi-2e orverufraedi lifraen-efnafraedi)
SMOKE="${G112_SMOKE:-0}"

[ $# -eq 1 ] || die 'usage: G112_SCRATCH=<empty dir> before-after.sh <base-ref>'
[ -n "${G112_SCRATCH:-}" ] || die 'G112_SCRATCH must name an empty directory'
[ -d "$G112_SCRATCH" ] || die "G112_SCRATCH ($G112_SCRATCH) is not a directory"
[ -z "$(ls -A "$G112_SCRATCH")" ] || die "G112_SCRATCH ($G112_SCRATCH) is not empty"
SCRATCH="$(cd "$G112_SCRATCH" && pwd)"

BASE_SHA="$(git -C "$REPO_ROOT" rev-parse --verify "$1^{commit}")" || die "unknown ref $1"
BRANCH_SHA="$(git -C "$REPO_ROOT" rev-parse --verify HEAD)"
# The branch side is HEAD, so the code under test must be HEAD's: no uncommitted change to it here.
DIRTY="$(git -C "$REPO_ROOT" status --porcelain -- tools server books scripts package.json package-lock.json)"
[ -z "$DIRTY" ] || die "uncommitted changes under tools/, server/, books/ or scripts/; the branch side would not test them:
$DIRTY"

COMMON="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)"
WT_PARENT="${G112_WORKTREE_DIR:-$(dirname "$COMMON")/.claude/worktrees}"
mkdir -p "$WT_PARENT"
WT_PATH="$(cd "$WT_PARENT" && pwd)/g112-before-after-side"
[ ! -e "$WT_PATH" ] || die "$WT_PATH already exists; remove it first"
case "$WT_PATH" in /tmp/*) die "the worktree must not live on /tmp (a RAM disk): $WT_PATH" ;; esac
NM_ROOT="$(readlink -f "$REPO_ROOT/node_modules")"
NM_SERVER="$(readlink -f "$REPO_ROOT/server/node_modules")"
[ -d "$NM_ROOT" ] && [ -d "$NM_SERVER" ] || die 'both node_modules trees must exist in this checkout'

echo 'G1.12 before/after run'
echo "base   $1 = $BASE_SHA"
echo "branch HEAD = $BRANCH_SHA"
echo "node $(node --version); side worktree $WT_PATH; outputs $SCRATCH"
[ "$SMOKE" = 1 ] && echo 'SMOKE MODE: reduced set, totals not checked, not evidence'
echo

# run <out-dir> <name> <command...>: runs in the side worktree; saves stdout, stderr and the exit code.
run() {
  local out="$1" name="$2"
  shift 2
  (cd "$WT" && "$@") >"$out/cmd/$name.out" 2>"$out/cmd/$name.err"
  echo $? >"$out/cmd/$name.exit"
}

copy_tree() { # <src> <dst>: without backups
  mkdir -p "$2"
  rsync -a --exclude='*.backup.*' --exclude='*.backup' --exclude='*.bak' "$1/" "$2/"
}

side() {
  local label="$1" sha="$2"
  local out="$SCRATCH/out-$label"
  mkdir -p "$out/cmd" "$out/tree"
  local t0=$SECONDS
  WT="$WT_PATH"
  git -C "$REPO_ROOT" worktree add --quiet --detach "$WT" "$sha" || die "worktree add failed ($label)"
  ln -s "$NM_ROOT" "$WT/node_modules"
  ln -s "$NM_SERVER" "$WT/server/node_modules"
  [ "$(git -C "$WT" rev-parse HEAD)" = "$sha" ] || die "$label worktree is not at $sha"

  # 1. the battery, on the pristine checkout. The dump prints its own --out path, so both sides write it to one
  #    shared path (their stdout must compare equal) and it is moved into the side's out dir afterwards.
  run "$out" battery node "$EVIDENCE/battery-verdicts.mjs" --root "$WT" --book "$BOOK" --out "$SCRATCH/battery.jsonl"
  mv "$SCRATCH/battery.jsonl" "$out/battery.jsonl" || die "the battery dump was not written ($label)"

  # 2. inject, all chemistry, mt-preview track
  local chapters=(0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 appendices)
  [ "$SMOKE" = 1 ] && chapters=(1 3)
  local c cd
  for c in "${chapters[@]}"; do
    if [ "$c" = appendices ]; then cd=appendices; else cd="ch$(printf '%02d' "$c")"; fi
    run "$out" "inject-$cd" node tools/cnxml-inject.js --book "$BOOK" --chapter "$c" \
      --source-dir 02-mt-output --track mt-preview
  done
  # control that the copied tree holds inject's output, not only the committed files: how many files inject
  # overwrote (safeWrite leaves one *.backup.* per overwritten file) and how many tracked files it changed
  echo "$(find "$WT/books/$BOOK/03-translated/mt-preview" -name '*.backup.*' | wc -l)" \
    "$(git -C "$WT" status --porcelain -- "books/$BOOK/03-translated/mt-preview" | wc -l)" >"$out/inject-control.txt"
  copy_tree "$WT/books/$BOOK/03-translated/mt-preview" "$out/tree/$BOOK-03-translated-mt-preview"

  # 3. source-roundtrip-check, every chemistry chapter dir
  local dirs
  if [ "$SMOKE" = 1 ]; then dirs=(ch01 ch03); else
    mapfile -t dirs < <(cd "$WT/books/$BOOK/01-source" && ls -d ch[0-9]* appendices 2>/dev/null | sort)
  fi
  for cd in "${dirs[@]}"; do
    run "$out" "roundtrip-$cd" node tools/source-roundtrip-check.js "$BOOK" "$cd"
  done

  # 4. render-oracle-check
  run "$out" oracle-ch01 node tools/render-oracle-check.js "$BOOK" ch01
  run "$out" oracle-ch03 node tools/render-oracle-check.js "$BOOK" ch03
  run "$out" oracle-ch03-control node tools/render-oracle-check.js "$BOOK" ch03 --control

  # 5. validate-chapter, mt-preview track
  local vchapters=(1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21)
  [ "$SMOKE" = 1 ] && vchapters=(1 3)
  for c in "${vchapters[@]}"; do
    run "$out" "validate-ch$(printf '%02d' "$c")" node tools/validate-chapter.js "$BOOK" "$c" --track mt-preview
  done

  # 6. extract every chapter of the other books
  local b n
  for b in "${OTHER_BOOKS[@]}"; do
    if [ "$SMOKE" = 1 ]; then
      [ "$b" = orverufraedi ] || continue
      dirs=(ch01)
    else
      mapfile -t dirs < <(cd "$WT/books/$b/01-source" && ls -d ch[0-9]* appendices 2>/dev/null | sort)
    fi
    for cd in "${dirs[@]}"; do
      if [ "$cd" = appendices ]; then n=appendices; else n=$((10#${cd#ch})); fi
      run "$out" "extract-$b-$cd" node tools/cnxml-extract.js --book "$b" --chapter "$n"
    done
    copy_tree "$WT/books/$b/02-for-mt" "$out/tree/$b-02-for-mt"
    copy_tree "$WT/books/$b/02-structure" "$out/tree/$b-02-structure"
  done
  find "$out/tree" -name '*-manifest.json' -exec sed -i '/"extractedAt":/d' {} +

  git -C "$REPO_ROOT" worktree remove --force "$WT" || die "worktree remove failed ($label)"
  git -C "$REPO_ROOT" worktree prune
  [ ! -e "$WT" ] || die "$WT still exists after removal"
  WT=''
  echo "side $label: $(ls "$out/cmd" | grep -c '\.exit$') commands, $((SECONDS - t0)) s"
}

side base "$BASE_SHA"
side branch "$BRANCH_SHA"
echo

# The comparison. Node prints the per-command lines and the differences; its exit code is the verdict.
node "$EVIDENCE/battery-verdicts.mjs" --compare "$SCRATCH/out-base/battery.jsonl" \
  "$SCRATCH/out-branch/battery.jsonl" >"$SCRATCH/battery-compare.txt" 2>&1
echo $? >"$SCRATCH/battery-compare.exit"

SCRATCH="$SCRATCH" REPO_ROOT="$REPO_ROOT" BOOK="$BOOK" SMOKE="$SMOKE" node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.exitCode = 1;
const { SCRATCH, REPO_ROOT, BOOK, SMOKE } = process.env;
const A = path.join(SCRATCH, 'out-base');
const B = path.join(SCRATCH, 'out-branch');
const fails = [];
const lines = [];
const fail = (msg) => fails.push(msg);
const read = (p) => fs.readFileSync(p, 'utf8');

// Expected base-only notes, from the frozen list: per chapter dir, the per-module duplicate counts.
const list = JSON.parse(read(path.join(REPO_ROOT, 'books', BOOK, 'g112-unserved-copies.json')));
const perModule = new Map(); // moduleId -> {cd, n}
for (const e of list.entries) {
  const m = perModule.get(e.moduleId) || { cd: e.chapterDir, n: 0 };
  m.n += 1;
  perModule.set(e.moduleId, m);
}
const expectedFor = (cd, onlyModules = null) =>
  [...perModule]
    .filter(([id, m]) => m.cd === cd && (!onlyModules || onlyModules.has(id)))
    .map(([, m]) => m.n)
    .sort((x, y) => x - y);
const manifest = JSON.parse(read(path.join(REPO_ROOT, 'books', BOOK, 'openstax-id-manifest.json')));

const NOTE = /^\s*Note: (\d+) duplicate segment\(s\) skipped \(first-match-wins\)$/;

// PRE-REGISTERED (build ledger Ruling 22), keyed by exact value. Why: the G1.12 shape (a para in a note nested
// directly in an example) on a FRESH extract of physics ch03 m42045. Spec §3/§5.5 counted only committed
// 02-for-mt, and physics commits ch04 alone. Physics ch03 has no 02-mt-output and nothing for physics is
// committed, so nothing ships. Any other physics difference still fails, and this one must be observed.
const PRE = {
  cmd: 'extract-edlisfraedi-2e-ch03',
  stdoutRemoved: ['m42045: 155 segments, 126 equations extracted'],
  stdoutAdded: ['m42045: 154 segments, 126 equations extracted'],
  segTree: 'edlisfraedi-2e-02-for-mt',
  segFile: 'ch03/m42045-segments.en.md',
  manTree: 'edlisfraedi-2e-02-structure',
  manFile: 'ch03/m42045-manifest.json',
  id: 'm42045:para:import-auto-id1839825',
  countBase: 155,
  countBranch: 154,
};
const preSeen = { stdout: false, seg: false, man: false };
const SEG_RE = /<!--\s*SEG:([^\s]+?)\s*-->/g;
function checkPreSegFile(textA, textB) {
  const ma = [...textA.matchAll(SEG_RE)];
  const at = ma.map((m, i) => ({ id: m[1], start: m.index, end: i + 1 < ma.length ? ma[i + 1].index : textA.length }));
  const copies = at.filter((b) => b.id === PRE.id);
  const inB = [...textB.matchAll(SEG_RE)].filter((m) => m[1] === PRE.id).length;
  if (copies.length !== 2 || inB !== 1) return `id ${PRE.id}: ${copies.length} at base, ${inB} on branch (want 2 and 1)`;
  const cut = textA.slice(0, copies[1].start) + textA.slice(copies[1].end);
  return cut === textB ? null : 'base minus the second block is not byte-identical to the branch file';
}
function checkPreManifest(textA, textB) {
  const a = JSON.parse(textA);
  const b = JSON.parse(textB);
  if (a.segmentCount !== PRE.countBase || b.segmentCount !== PRE.countBranch)
    return `segmentCount ${a.segmentCount} -> ${b.segmentCount} (want ${PRE.countBase} -> ${PRE.countBranch})`;
  const idx = a.segmentIds.map((x, i) => (x === PRE.id ? i : -1)).filter((i) => i >= 0);
  if (idx.length !== 2) return `segmentIds at base hold the id ${idx.length} times (want 2)`;
  const expectIds = a.segmentIds.filter((_, i) => i !== idx[1]);
  if (JSON.stringify(expectIds) !== JSON.stringify(b.segmentIds)) return 'segmentIds differ by more than the later entry of the id';
  const rest = (o) => JSON.stringify({ ...o, segmentCount: null, segmentIds: null });
  return rest(a) === rest(b) ? null : 'a key other than segmentCount and segmentIds differs';
}
const TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;

function lineDiff(textA, textB) {
  const ta = path.join(SCRATCH, '.diff-a');
  const tb = path.join(SCRATCH, '.diff-b');
  fs.writeFileSync(ta, textA);
  fs.writeFileSync(tb, textB);
  let outText;
  try {
    outText = execFileSync('diff', ['--old-line-format=-%L', '--new-line-format=+%L', '--unchanged-line-format=', ta, tb], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (e) {
    if (e.status !== 1) throw e;
    outText = e.stdout;
  }
  const removed = [];
  const added = [];
  for (const l of outText.split('\n')) {
    if (l.startsWith('-')) removed.push(l.slice(1));
    else if (l.startsWith('+')) added.push(l.slice(1));
  }
  return { removed, added };
}
const show = (label, arr) => {
  const max = 60;
  const out = arr.slice(0, max).map((l) => `      ${label} ${l}`);
  if (arr.length > max) out.push(`      … ${arr.length - max} more`);
  return out;
};
const sameMultiset = (x, y) => JSON.stringify([...x].sort((a, b) => a - b)) === JSON.stringify([...y].sort((a, b) => a - b));

const names = (dir) =>
  fs.readdirSync(path.join(dir, 'cmd')).filter((f) => f.endsWith('.exit')).map((f) => f.slice(0, -5)).sort();
const na = names(A);
const nb = names(B);
const onlyA = na.filter((n) => !nb.includes(n));
const onlyB = nb.filter((n) => !na.includes(n));
if (onlyA.length || onlyB.length) fail(`commands on one side only: base ${JSON.stringify(onlyA)}, branch ${JSON.stringify(onlyB)}`);

const totals = {}; // tool -> {lines, sum}
lines.push('== per command: exit base/branch; stdout; stderr ==');
for (const name of na.filter((n) => nb.includes(n))) {
  const tool = name.split('-')[0];
  const ea = read(path.join(A, 'cmd', `${name}.exit`)).trim();
  const eb = read(path.join(B, 'cmd', `${name}.exit`)).trim();
  const detail = [];
  let ok = true;
  if (ea !== eb) {
    ok = false;
    fail(`${name}: exit ${ea} on base, ${eb} on branch`);
  }
  const norm = (s) => (tool === 'validate' ? s.replace(TS, '<TS>') : s);
  // stdout: identical (validate: after the timestamp normalisation)
  const so = lineDiff(norm(read(path.join(A, 'cmd', `${name}.out`))), norm(read(path.join(B, 'cmd', `${name}.out`))));
  let stdoutState = 'same';
  if (
    name === PRE.cmd &&
    JSON.stringify(so.removed) === JSON.stringify(PRE.stdoutRemoved) &&
    JSON.stringify(so.added) === JSON.stringify(PRE.stdoutAdded)
  ) {
    preSeen.stdout = true;
    stdoutState = `pre-registered only (${PRE.stdoutRemoved[0]} -> ${PRE.stdoutAdded[0].split(': ')[1]})`;
  } else if (so.removed.length || so.added.length) {
    ok = false;
    stdoutState = 'DIFFERS';
    fail(`${name}: stdout differs`);
    detail.push(`    stdout differs (- base only, + branch only):`, ...show('-', so.removed), ...show('+', so.added));
  }
  // stderr: identical except base-only duplicate notes
  const se = lineDiff(norm(read(path.join(A, 'cmd', `${name}.err`))), norm(read(path.join(B, 'cmd', `${name}.err`))));
  const notes = se.removed.filter((l) => NOTE.test(l)).map((l) => Number(l.match(NOTE)[1]));
  const otherRemoved = se.removed.filter((l) => !NOTE.test(l));
  let stderrState = notes.length ? `same apart from ${notes.length} base-only note(s) [${notes.join(',')}]` : 'same';
  if (otherRemoved.length || se.added.length) {
    ok = false;
    stderrState = 'DIFFERS';
    fail(`${name}: stderr differs outside the accepted note lines`);
    detail.push(`    stderr differs (- base only, + branch only):`, ...show('-', otherRemoved), ...show('+', se.added));
  }
  if (notes.length) {
    totals[tool] = totals[tool] || { lines: 0, sum: 0 };
    totals[tool].lines += notes.length;
    totals[tool].sum += notes.reduce((a, b) => a + b, 0);
  }
  // the notes, by value, against the frozen list
  const cd = name.match(/-(ch\d+|appendices)(?:-|$)/)?.[1];
  let expected = null;
  if ((tool === 'inject' || tool === 'roundtrip') && cd) expected = expectedFor(cd);
  else if (name === 'oracle-ch01' || name === 'oracle-ch03') expected = expectedFor(cd, new Set(Object.keys(manifest.chapters[cd] || {})));
  if (expected && !sameMultiset(notes, expected)) {
    ok = false;
    fail(`${name}: base-only notes [${notes.join(',')}] != the frozen list's [${expected.join(',')}] for ${cd}`);
  }
  if (!expected && notes.length && tool !== 'oracle') {
    ok = false;
    fail(`${name}: ${notes.length} base-only note(s) in a command that should parse no chemistry English`);
  }
  lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} exit ${ea}/${eb}; stdout ${stdoutState}; stderr ${stderrState}`);
  lines.push(...detail);
}
lines.push('');
lines.push('== accepted differences: base-only duplicate notes, per tool ==');
for (const [tool, t] of Object.entries(totals)) lines.push(`  ${tool}: ${t.lines} line(s), N summing to ${t.sum}`);
if (SMOKE !== '1') {
  for (const tool of ['inject', 'roundtrip']) {
    const t = totals[tool] || { lines: 0, sum: 0 };
    if (t.lines !== 83 || t.sum !== 285) fail(`${tool}: ${t.lines} base-only notes summing to ${t.sum}; expected 83 summing to 285`);
  }
}

// trees
lines.push('', '== copied trees ==');
const trees = fs.readdirSync(path.join(A, 'tree')).sort();
const treesB = fs.readdirSync(path.join(B, 'tree')).sort();
if (JSON.stringify(trees) !== JSON.stringify(treesB)) fail(`tree sets differ: ${trees} vs ${treesB}`);
const countFiles = (d) => {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) n += e.isDirectory() ? countFiles(path.join(d, e.name)) : 1;
  return n;
};
for (const t of trees.filter((x) => treesB.includes(x))) {
  const da = path.join(A, 'tree', t);
  const db = path.join(B, 'tree', t);
  let out = '';
  try {
    execFileSync('diff', ['-rq', da, db], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.status !== 1) throw e;
    out = e.stdout;
  }
  const nfa = countFiles(da);
  const diffLines = out.trim() ? out.trim().split('\n') : [];
  const preTree = t === PRE.segTree ? PRE.segFile : t === PRE.manTree ? PRE.manFile : null;
  const preLine = preTree && `Files ${path.join(da, preTree)} and ${path.join(db, preTree)} differ`;
  if (preTree && diffLines.length === 1 && diffLines[0] === preLine) {
    const check = t === PRE.segTree ? checkPreSegFile : checkPreManifest;
    const why = check(read(path.join(da, preTree)), read(path.join(db, preTree)));
    if (why) {
      fail(`tree ${t}: ${preTree} differs, but not as pre-registered: ${why}`);
      lines.push(`FAIL ${t}: ${preTree} differs, but not as pre-registered: ${why}`);
    } else {
      preSeen[t === PRE.segTree ? 'seg' : 'man'] = true;
      lines.push(`ok   ${t}: ${nfa} files, byte-identical except the pre-registered ${preTree} (verified by value)`);
    }
  } else if (out.trim()) {
    const diffs = diffLines;
    fail(`tree ${t}: ${diffs.length} difference(s)`);
    lines.push(`FAIL ${t}: ${nfa} files on base; ${diffs.length} difference(s)`);
    for (const d of diffs.slice(0, 40)) lines.push(`      ${d.split(SCRATCH).join('<scratch>')}`);
  } else {
    if (nfa === 0) fail(`tree ${t} is empty on both sides`);
    lines.push(`${nfa ? 'ok  ' : 'FAIL'} ${t}: ${nfa} files, byte-identical`);
  }
}

if (SMOKE !== '1') {
  lines.push(`  pre-registered physics m42045 (Ruling 22) observed: stdout ${preSeen.stdout}, segment file ${preSeen.seg}, manifest ${preSeen.man}`);
  if (!preSeen.stdout || !preSeen.seg || !preSeen.man) fail('the pre-registered physics m42045 difference was not observed in full');
}
// the inject tree holds inject's output (control for the tree comparison above)
const ic = (d) => read(path.join(d, 'inject-control.txt')).trim().split(/\s+/).map(Number);
const [owA, chA] = ic(A);
const [owB, chB] = ic(B);
lines.push(`  inject wrote over ${owA}/${owB} files (base/branch) and changed ${chA}/${chB} tracked files against the committed tree`);
if (!(owA > 0 && owA === owB && chA === chB)) fail(`inject control: overwritten ${owA}/${owB}, changed ${chA}/${chB}`);

// battery
lines.push('', '== §C82 battery (battery-verdicts.mjs --compare) ==');
const bexit = read(path.join(SCRATCH, 'battery-compare.exit')).trim();
const bc = read(path.join(SCRATCH, 'battery-compare.txt'));
const ctxFailed = (p) => read(p).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.verdict === 'CTX-FAILED').length;
const nBefore = Number(bc.match(/^before: .* \((\d+) verdicts\)$/m)?.[1] ?? -1);
const nAfter = Number(bc.match(/^after: .* \((\d+) verdicts\)$/m)?.[1] ?? -1);
const keys = bc.match(/^\(check, unit\) keys only before: (\d+); only after: (\d+)$/m);
const vd = Number(bc.match(/^== \(check, unit\) verdicts that differ: (\d+) ==$/m)?.[1] ?? -1);
const findingsBlock = (bc.split('== findings (kinds / count) that differ, by check ==')[1] || '').split('\n== ')[0].trim();
const EXPECTED_FINDINGS = ['A7: 1 unit(s)', 'ch20/m68848 [number-mismatch] x3 -> [number-mismatch] x2'];
const findingsOk = JSON.stringify(findingsBlock.split('\n').map((l) => l.trim()).filter(Boolean)) === JSON.stringify(EXPECTED_FINDINGS);
const cfA = ctxFailed(path.join(A, 'battery.jsonl'));
const cfB = ctxFailed(path.join(B, 'battery.jsonl'));
lines.push(`  dump exit base/branch ${read(path.join(A, 'cmd', 'battery.exit')).trim()}/${read(path.join(B, 'cmd', 'battery.exit')).trim()}; compare exit ${bexit}`);
lines.push(`  verdicts: ${nBefore} base, ${nAfter} branch; keys on one side only: ${keys ? `${keys[1]}/${keys[2]}` : '(unparsed)'}; CTX-FAILED ${cfA}/${cfB}`);
lines.push(`  (check, unit) verdicts that differ: ${vd}`);
lines.push(`  finding-level differences: ${findingsOk ? 'only the recorded A7 ch20/m68848 x3 -> x2' : 'UNEXPECTED'}`);
if (!findingsOk) lines.push(...findingsBlock.split('\n').map((l) => `      ${l}`));
if (bexit !== '0') fail(`battery compare exited ${bexit}`);
if (!(nBefore > 0 && nBefore === nAfter)) fail(`battery verdict totals ${nBefore}/${nAfter}`);
if (!keys || keys[1] !== '0' || keys[2] !== '0') fail('battery: keys on one side only, or unparsed');
if (vd !== 0) fail(`battery: ${vd} verdict difference(s)`);
if (cfA || cfB) fail(`battery: CTX-FAILED ${cfA}/${cfB}`);
if (!findingsOk) fail('battery: unexpected finding-level differences');
const tally = bc.split('== per-check verdict tallies (before | after) ==')[1]?.split('\n\n')[0];
if (tally) lines.push('  per-check tallies (base | branch):', ...tally.replace(/^\n+|\s+$/g, '').split('\n').map((l) => `  ${l}`));

lines.push('');
if (fails.length) {
  lines.push(`== ${fails.length} failure(s) ==`, ...fails.map((f) => `  ${f}`));
}
process.stdout.write(lines.join('\n') + '\n');
process.exitCode = fails.length ? 1 : 0;
JS
CMP=$?
VERDICT_REACHED=1
if [ "$CMP" = 0 ]; then
  echo 'RESULT: PASS'
  exit 0
fi
echo 'RESULT: FAIL'
exit 1
