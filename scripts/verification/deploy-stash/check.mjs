// Bounded exhaustive check of scripts/deploy.sh's stash -> pull -> pop (steps 2-4) with REAL git.
//
// Promise (deploy.sh header; CLAUDE.md "deploy.yml no longer hard-resets prod": deploy.sh "stashes and
// re-applies local editorial changes instead of discarding them"): every uncommitted change on prod, and
// every file the live server writes while the deploy runs, is back in the working tree (or committed)
// when the deploy's git steps finish; no conflict marker is committed; the repo is not left mid-operation.
//
// How: for every scenario below, build a throwaway origin (bare) + a dev clone + a "prod" clone under
// the OS temp dir, make prod's local changes, push a dev commit, then run the VERBATIM text of
// deploy.sh from "# 2. Stash" up to "# 5. Install" in a bash process inside the prod clone, with one
// line, `inject <boundary>`, inserted between its steps (B0 before step 2, B1 before step 3, B2 before
// step 4, B3 after). An injection stands for another process acting between two of deploy's commands:
// the running server rewriting a file, or a git-backup cron holding .git/index.lock. Then one cron tick
// (a stand-in for scripts/git-backup.sh's add/commit/push, using its own PATHSPECS), then a second,
// undisturbed run of the same steps (the next deploy). Each scenario's outcome is one row; the rows are
// pinned in expected.json, so any change in git behaviour or in deploy.sh shows up as a changed row.
//
// Never touches the repository it lives in: every git command runs in a temp clone whose toplevel and
// origin are asserted first, with GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE removed and global/system git
// config disabled.
//
// Usage: node scripts/verification/deploy-stash/check.mjs [--deploy <path to deploy.sh>] [--print]
//   --deploy  the script to extract steps 2-4 from (default: this repo's scripts/deploy.sh); mutate.mjs
//             passes temp copies here, so the real file is never edited
//   --print   print every row as JSON (for reviewing a deliberate re-pin) instead of comparing
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const DEPLOY = path.resolve(flag('--deploy') ?? path.join(repo, 'scripts/deploy.sh'));
const PRINT = argv.includes('--print');
process.exitCode = 1; // a verdict must be reached to clear this

// ── the code under test ──────────────────────────────────────────────────────────────────────
const START = '# 2. Stash any local changes';
const B1_AT = '# 3. Pull latest from origin';
const B2_AT = '# 4. Re-apply local changes';
const END = '# 5. Install any new dependencies';
function extractSteps(text) {
  const lines = text.split('\n');
  const at = (m) => {
    const hits = lines.flatMap((l, i) => (l.startsWith(m) ? [i] : []));
    if (hits.length !== 1) throw new Error(`deploy.sh: marker "${m}" found ${hits.length} times`);
    return hits[0];
  };
  const [s, b1, b2, e] = [START, B1_AT, B2_AT, END].map(at);
  if (!(s < b1 && b1 < b2 && b2 < e)) throw new Error('deploy.sh: step markers out of order');
  const body = [
    'inject B0',
    ...lines.slice(s, b1),
    'inject B1',
    ...lines.slice(b1, b2),
    'inject B2',
    ...lines.slice(b2, e),
    'inject B3',
  ].join('\n');
  if (/\b(sudo|npm|systemctl)\b/.test(lines.slice(s, e).join('\n'))) {
    throw new Error(
      'deploy.sh: steps 2-4 now run sudo/npm/systemctl; review before running them here'
    );
  }
  return body;
}
const STEPS = extractSteps(fs.readFileSync(DEPLOY, 'utf8'));
const SET_LINE = 'set -euo pipefail';
if (!fs.readFileSync(DEPLOY, 'utf8').split('\n').includes(SET_LINE)) {
  throw new Error(`deploy.sh no longer has "${SET_LINE}"; the harness assumes it`);
}

// The cron's pathspecs, read from git-backup.sh itself (its PATHSPECS=( … ) array).
function cronPathspecs() {
  const src = fs.readFileSync(path.join(repo, 'scripts/git-backup.sh'), 'utf8');
  const m = src.match(/\nPATHSPECS=\(\n([\s\S]*?)\n\)/);
  if (!m) throw new Error('git-backup.sh: PATHSPECS array not found');
  return [...m[1].matchAll(/^\s*'([^']+)'/gm)].map((x) => x[1]);
}
const PATHSPECS = cronPathspecs();

// ── a clean git environment ─────────────────────────────────────────────────────────────────
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/.test(k)));
function envFor(home) {
  return {
    ...baseEnv,
    HOME: home,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.invalid',
    GIT_TERMINAL_PROMPT: '0',
  };
}
function sh(cmd, args, cwd, env, allowFail = false) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
  if (!allowFail && r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} (in ${cwd}) failed: ${r.stderr || r.stdout}`);
  }
  return r;
}

// ── fixture ─────────────────────────────────────────────────────────────────────────────────
const G = 'books/b/03-faithful-translation/ch01/m1-segments.is.md'; // an editor's applied text
const F = 'books/b/05-publication/faithful/chapters/01/1-1.html'; // a page the server renders
const T = 'books/b/translation-errors.json'; // a merge=ours manifest (.gitattributes)
const U = 'books/b/README.md'; // something only dev touches
const N = 'books/b/05-publication/faithful/chapters/01/1-2.html'; // a page new on prod (untracked)
const CONTENT = {
  G: { base: 'faithful v0\n', local: 'faithful EDITOR\n' },
  F: {
    base: 'page v0\n',
    local: 'page PROD-RENDER\n',
    server: 'page PROD-RENDER-2\n',
    dev: 'page DEV\n',
    prodCommit: 'page PROD-COMMIT\n',
  },
  T: { base: '{"v":0}\n', local: '{"v":"prod"}\n', dev: '{"v":"dev"}\n' },
  N: { prod: 'new page PROD\n', dev: 'new page DEV\n' },
};

function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

// ── scenarios ───────────────────────────────────────────────────────────────────────────────
// origin: what the dev side pushed (or why the pull cannot happen)
const ORIGINS = ['clean', 'same-file', 'manifest', 'adds-path', 'diverged', 'unreachable'];
const SCENARIOS = [];
for (const origin of ORIGINS) {
  for (const serverWrite of ['none', 'B1', 'B2']) {
    for (const untracked of [false, true])
      SCENARIOS.push({ origin, serverWrite, untracked, lock: 'none' });
  }
  for (const lock of ['B0', 'B1', 'B2'])
    SCENARIOS.push({ origin, serverWrite: 'none', untracked: false, lock });
}
const keyOf = (s) =>
  `${s.origin}|write:${s.serverWrite}|untracked:${s.untracked ? 'yes' : 'no'}|lock:${s.lock}`;

function runScenario(s) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-stash-'));
  const env = envFor(root);
  const origin = path.join(root, 'origin.git');
  const dev = path.join(root, 'dev');
  const prod = path.join(root, 'prod');
  try {
    sh('git', ['init', '-q', '--bare', '-b', 'main', origin], root, env);
    sh('git', ['clone', '-q', origin, dev], root, env);
    fs.copyFileSync(path.join(repo, '.gitattributes'), path.join(dev, '.gitattributes'));
    write(dev, '.gitignore', 'pipeline-output/\n');
    write(
      dev,
      'scripts/record-deployed-commit.sh',
      fs.readFileSync(path.join(repo, 'scripts/record-deployed-commit.sh'), 'utf8')
    );
    write(dev, G, CONTENT.G.base);
    write(dev, F, CONTENT.F.base);
    write(dev, T, CONTENT.T.base);
    write(dev, U, 'readme v0\n');
    sh('git', ['add', '-A'], dev, env);
    sh('git', ['commit', '-qm', 'seed'], dev, env);
    sh('git', ['push', '-q', 'origin', 'main'], dev, env);
    sh('git', ['clone', '-q', origin, prod], root, env);
    fs.mkdirSync(path.join(prod, 'pipeline-output'));

    // prod's own unpushed commit (a cron commit whose push failed), only for 'diverged'
    if (s.origin === 'diverged') {
      write(prod, F, CONTENT.F.prodCommit);
      sh('git', ['commit', '-qam', 'auto-backup: unpushed'], prod, env);
    }
    // prod's uncommitted changes
    write(prod, G, CONTENT.G.local);
    write(prod, F, CONTENT.F.local);
    write(prod, T, CONTENT.T.local);
    if (s.untracked) write(prod, N, CONTENT.N.prod);

    // the dev side's push
    if (s.origin === 'same-file' || s.origin === 'diverged') write(dev, F, CONTENT.F.dev);
    else if (s.origin === 'manifest') write(dev, T, CONTENT.T.dev);
    else if (s.origin === 'adds-path') write(dev, N, CONTENT.N.dev);
    else write(dev, U, 'readme v1\n');
    sh('git', ['add', '-A'], dev, env);
    sh('git', ['commit', '-qm', 'dev change'], dev, env);
    sh('git', ['push', '-q', 'origin', 'main'], dev, env);
    if (s.origin === 'unreachable')
      sh('git', ['remote', 'set-url', 'origin', path.join(root, 'gone.git')], prod, env);

    // safety: we are in the temp clone, and its origin is inside the temp root
    const top = sh('git', ['rev-parse', '--show-toplevel'], prod, env).stdout.trim();
    const url = sh('git', ['remote', 'get-url', 'origin'], prod, env).stdout.trim();
    if (fs.realpathSync(top) !== fs.realpathSync(prod) || !url.startsWith(root)) {
      throw new Error(`safety: refusing to run outside the temp clone (${top}, ${url})`);
    }

    const injLog = path.join(root, 'injected.log');
    const preamble = [
      SET_LINE,
      `inject() {`,
      `  [ -n "\${LOCK_HELD:-}" ] && rm -f .git/index.lock && LOCK_HELD=`,
      `  if [ "$1" = "${s.serverWrite}" ]; then printf '%s\\n' '${CONTENT.F.server.trimEnd()}' > '${F}'; echo "write@$1" >> '${injLog}'; fi`,
      `  if [ "$1" = "${s.lock}" ]; then : > .git/index.lock; LOCK_HELD=1; echo "lock@$1" >> '${injLog}'; fi`,
      `  return 0`,
      `}`,
    ].join('\n');
    const script = path.join(root, 'steps.sh');
    fs.writeFileSync(script, `${preamble}\n${STEPS}\n`);
    const first = sh('bash', [script], prod, env, true);
    fs.rmSync(path.join(prod, '.git/index.lock'), { force: true }); // the lock holder exits

    const injected = fs.existsSync(injLog)
      ? fs.readFileSync(injLog, 'utf8').trim().split('\n')
      : [];
    cronTick(prod, env);
    const after = observe(s, prod, origin, env, first, injected);

    // the next deploy, undisturbed (origin reachable again)
    if (s.origin === 'unreachable') sh('git', ['remote', 'set-url', 'origin', origin], prod, env);
    fs.writeFileSync(script, `${SET_LINE}\ninject() { return 0; }\n${STEPS}\n`);
    const second = sh('bash', [script], prod, env, true);
    // Same expected content as the first observation: the page prod should hold is what the server last
    // wrote, whichever run is being judged. (`injected` decides that; it is not re-injected.)
    const next = observe(s, prod, origin, env, second, injected, false);
    return { after, next };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// A stand-in for git-backup.sh's core: stage its PATHSPECS (skipping ignored matches, as it does),
// commit if anything is staged, push. Not the whole script: no exporter, no status file.
function cronTick(prod, env) {
  const specs = PATHSPECS.map((p) => `'${p}'`).join(' ');
  const body = [
    'for spec in ' + specs + '; do',
    '  for m in $(compgen -G "$spec" || true); do git check-ignore -q "$m" || git add -- "$m" 2>/dev/null || true; done',
    'done',
    'git diff --cached --quiet || git commit -qm "auto-backup: tick" 2>/dev/null || true',
    'git push -q origin main 2>/dev/null || true',
  ].join('\n');
  sh('bash', ['-c', body], prod, env, true);
}

function observe(s, prod, origin, env, run, injected, reportInjected = true) {
  const git = (...a) => sh('git', a, prod, env, true);
  const tree = (rel) => {
    try {
      return fs.readFileSync(path.join(prod, rel), 'utf8');
    } catch {
      return null;
    }
  };
  const stashes = git('stash', 'list').stdout.split('\n').filter(Boolean).length;
  const where = (rel, want) => {
    const t = tree(rel);
    if (t === want) return 'tree';
    if (t !== null && t.includes('<<<<<<<')) return 'conflict';
    if (git('show', `HEAD:${rel}`).stdout === want) return 'head';
    // A stopped rebase detaches HEAD and leaves the branch at its pre-rebase tip: a change the cron
    // committed there is on `main` but not in HEAD or the tree.
    if (git('show', `refs/heads/main:${rel}`).stdout === want) return 'branch';
    for (let i = 0; i < stashes; i++) {
      if (git('show', `stash@{${i}}:${rel}`).stdout === want) return 'stash';
      if (git('show', `stash@{${i}}^3:${rel}`).stdout === want) return 'stash';
    }
    return 'gone';
  };
  const wantF =
    s.serverWrite !== 'none' && injected.includes(`write@${s.serverWrite}`)
      ? CONTENT.F.server
      : CONTENT.F.local;
  const out = {
    G: where(G, CONTENT.G.local),
    F: where(F, wantF),
    T: where(T, CONTENT.T.local),
  };
  if (s.untracked) out.N = where(N, CONTENT.N.prod);
  const markers = (gitArgs) => sh('git', gitArgs, prod, env, true).stdout.trim() !== '';
  const gitDir = path.join(prod, '.git');
  return {
    ...out,
    exit: run.status,
    warned: /WARNING: Merge conflict/.test(run.stdout),
    stashes,
    markersInHead: markers(['grep', '-l', '<<<<<<<', 'HEAD']),
    markersOnOrigin:
      sh(
        'git',
        ['--git-dir', origin, 'grep', '-l', '<<<<<<<', 'main'],
        prod,
        env,
        true
      ).stdout.trim() !== '',
    midOperation: ['rebase-merge', 'rebase-apply', 'MERGE_HEAD'].some((p) =>
      fs.existsSync(path.join(gitDir, p))
    ),
    injected: reportInjected ? injected.join(',') : '',
  };
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────
const gitVersion = sh('git', ['--version'], repo, baseEnv).stdout.trim();
const rows = {};
for (const s of SCENARIOS) rows[keyOf(s)] = runScenario(s);

if (PRINT) {
  console.log(JSON.stringify({ gitVersion, rows }, null, 2));
  process.exitCode = 0;
} else {
  const expectedPath = path.join(here, 'expected.json');
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  let changed = 0;
  for (const [k, got] of Object.entries(rows)) {
    const want = expected.rows[k];
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      changed++;
      console.log(
        `CHANGED ${k}\n  expected ${JSON.stringify(want)}\n  got      ${JSON.stringify(got)}`
      );
    }
  }
  for (const k of Object.keys(expected.rows))
    if (!(k in rows)) {
      changed++;
      console.log(`MISSING ${k}`);
    }
  const findings = Object.entries(rows).filter(([, r]) => isFinding(r.after));
  console.log(
    `${gitVersion} (pinned with ${expected.gitVersion}); ${Object.keys(rows).length} scenarios`
  );
  console.log(
    `scenarios where a change is not back in the tree, or markers were committed, or the repo is mid-operation: ${findings.length}`
  );
  if (changed) console.log(`\nFAIL: ${changed} row(s) differ from expected.json`);
  else console.log('\nOK: every scenario matches its pinned outcome');
  process.exitCode = changed ? 1 : 0;
}

function isFinding(a) {
  const locs = ['G', 'F', 'T', 'N'].filter((k) => k in a).map((k) => a[k]);
  return (
    locs.some((l) => l !== 'tree' && l !== 'head') ||
    a.markersInHead ||
    a.markersOnOrigin ||
    a.midOperation
  );
}
