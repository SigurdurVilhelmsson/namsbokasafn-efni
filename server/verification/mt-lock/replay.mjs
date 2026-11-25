// Replay MtLock.tla's findings, and the guards the model credits to the code, on the REAL functions.
//
// Every replay runs in a fresh temp tree (os.tmpdir()), never under the repository's books/: a
// study-freeze marker there must never be read, written or deleted (CLAUDE.md). The other process
// of each race is simulated by a one-shot hook on `fs.existsSync` for the marker path, which is
// exactly the gap the model names: the hook runs the other writer's REAL function, then lets the
// call under test continue. Nothing here spawns api-translate's CLI or creates a real MT client.
//
// Exit 0 only when every pinned finding still reproduces AND every guard holds. A finding that no
// longer reproduces is an error on purpose: a fix must remove the finding here and in check.sh.
//
// Usage: node server/verification/mt-lock/replay.mjs   (from any directory)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const require = createRequire(import.meta.url);
const lock = require(path.join(repo, 'tools/lib/mt-lock.cjs'));
const sweep = require(path.join(repo, 'server/e2e/helpers/mt-lock-sweep.js'));
const { mtRunDecision, translateModule } = await import(path.join(repo, 'tools/api-translate.js'));

const STUDY_BOOK = 'efnafraedi-2e'; // the e2e suite's real book, and the study book (STUDY_BOOKS)
const results = [];
const roots = [];
const record = (kind, name, ok, detail) => results.push({ kind, name, ok, detail });

/** A temp unit: <root>/<book>/02-mt-output/ch01/m1-segments.is.md (with an EN input beside it). */
function unit() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lock-replay-'));
  roots.push(root);
  const dir = path.join(root, STUDY_BOOK, '02-mt-output', 'ch01');
  fs.mkdirSync(dir, { recursive: true });
  const mtOutput = path.join(dir, 'm1-segments.is.md');
  const enInput = path.join(root, 'm1-segments.en.md');
  fs.writeFileSync(enInput, '<!-- SEG:m1:para:p1 -->\nThe atom is small.\n');
  fs.writeFileSync(mtOutput, '<!-- SEG:m1:para:p1 -->\nGamla þýðingin.\n');
  return { root, mtOutput, enInput, lockPath: lock.mtLockPathFor(mtOutput) };
}

/** Run `fn` with a one-shot hook: the first existsSync(target) runs `other()` after reading. */
async function withGap(target, other, fn) {
  const orig = fs.existsSync;
  let fired = false;
  fs.existsSync = (p) => {
    if (!fired && p === target) {
      fired = true;
      const seen = orig(p);
      other();
      return seen;
    }
    return orig(p);
  };
  try {
    return await fn();
  } finally {
    fs.existsSync = orig;
  }
}

const echo = (onCall) => ({
  translateAuto: async (text) => {
    onCall();
    return { text, usage: { units: text.length, cost: 0 } };
  },
});

// F1: api-translate samples the lock once when it plans, and writes after the paid call.
{
  const u = unit();
  const locked = lock.isMtLocked(u.mtOutput);
  const action = mtRunDecision({ exists: true, force: true, locked });
  const before = fs.readFileSync(u.mtOutput, 'utf8');
  let wrote = false;
  const client = echo(() => {
    if (!wrote) {
      wrote = true; // an editor's first save lands during the paid call
      lock.writeMtLock(u.mtOutput, { reason: 'editing-started', firstEditId: 1 });
    }
  });
  try {
    await translateModule(client, u.enInput, u.mtOutput, null, false);
  } catch {
    // a fixed translateModule may refuse at its write; the bytes below decide
  }
  const changed = fs.readFileSync(u.mtOutput, 'utf8') !== before;
  record(
    'finding',
    'F1 stale lock sample: api-translate overwrites MT locked during its paid call',
    action === 'write' && lock.isMtLocked(u.mtOutput) && changed,
    `planned '${action}', marker now ${lock.isMtLocked(u.mtOutput) ? 'present' : 'absent'}, MT ${changed ? 'changed' : 'unchanged'}`
  );

  // Control: the same marker present at planning time is refused (the decision, not main()'s loop).
  const c = unit();
  lock.writeMtLock(c.mtOutput, { reason: 'editing-started', firstEditId: 1 });
  const ca = mtRunDecision({ exists: true, force: true, locked: lock.isMtLocked(c.mtOutput) });
  record(
    'guard',
    'F1 control: a marker present at planning gives locked-skip',
    ca === 'locked-skip',
    `got '${ca}'`
  );
}

// F2: writeMtLock (existsSync, then a plain write) replaces a freeze marker written in its gap.
{
  const u = unit();
  await withGap(
    u.lockPath,
    () => lock.writeFreezeLock(u.mtOutput),
    () => {
      try {
        lock.writeMtLock(u.mtOutput, { reason: 'editing-started', firstEditId: 1 });
      } catch {
        // a fixed writeMtLock (an exclusive create) may throw EEXIST here; the state below decides
      }
    }
  );
  const state = lock.freezeLockState(u.mtOutput);
  record(
    'finding',
    'F2 writeMtLock replaces a freeze marker written between its check and its write',
    state === 'foreign',
    `marker after both writes: ${state}`
  );
}

// Guard: writeMtLock no-ops on a marker that exists before it looks (model: SrvSave's no-op).
{
  const u = unit();
  lock.writeFreezeLock(u.mtOutput);
  lock.writeMtLock(u.mtOutput, { reason: 'editing-started', firstEditId: 1 });
  const state = lock.freezeLockState(u.mtOutput);
  record(
    'guard',
    'writeMtLock leaves an existing freeze marker alone',
    state === 'freeze',
    `marker: ${state}`
  );
}

// Guard: writeFreezeLock's exclusive create ('wx') never replaces an editing marker written in
// its own gap; it throws FOREIGN_LOCK instead (model: FzCreate's EEXIST branch).
{
  const u = unit();
  let code = null;
  await withGap(
    u.lockPath,
    () => fs.writeFileSync(u.lockPath, JSON.stringify({ reason: 'editing-started' }) + '\n'),
    () => {
      try {
        lock.writeFreezeLock(u.mtOutput);
      } catch (e) {
        code = e.code;
      }
    }
  );
  const state = lock.freezeLockState(u.mtOutput);
  record(
    'guard',
    "writeFreezeLock's exclusive create keeps an editing marker written in its gap",
    code === 'FOREIGN_LOCK' && state === 'foreign',
    `threw ${code ?? 'nothing'}, marker: ${state}`
  );
}

// F3: the e2e sweep deletes a freeze marker written after its snapshot, without reading it.
{
  const u = unit();
  const snapshot = sweep.listLockFiles(u.root);
  lock.writeFreezeLock(u.mtOutput);
  const r = sweep.sweepStrayLocks(u.root, snapshot);
  const state = lock.freezeLockState(u.mtOutput);
  record(
    'finding',
    'F3 the e2e sweep deletes a freeze marker written during the run',
    r.removed.length === 1 && state === 'absent',
    `removed ${r.removed.length}, marker: ${state}`
  );

  // Control: the same marker present at the snapshot is kept.
  const c = unit();
  lock.writeFreezeLock(c.mtOutput);
  const cr = sweep.sweepStrayLocks(c.root, sweep.listLockFiles(c.root));
  record(
    'guard',
    'F3 control: a freeze marker present at the snapshot is kept',
    cr.kept.length === 1 && lock.freezeLockState(c.mtOutput) === 'freeze',
    `kept ${cr.kept.length}`
  );
}

// Guard: mtRunDecision, all 16 inputs: a lock always wins (model: AtPlan's locked-skip).
{
  const bad = [];
  for (const exists of [false, true])
    for (const force of [false, true])
      for (const locked of [false, true])
        for (const topUp of [false, true]) {
          const got = mtRunDecision({ exists, force, locked, topUp });
          if (locked && got !== 'locked-skip')
            bad.push(JSON.stringify({ exists, force, locked, topUp, got }));
        }
  record(
    'guard',
    'mtRunDecision: every locked input is locked-skip (16 inputs)',
    bad.length === 0,
    bad.join(' ') || 'all 8 locked inputs refused'
  );
}

// Guard: isMtLocked treats an unreadable marker as locked (fail-safe).
{
  const u = unit();
  fs.writeFileSync(u.lockPath, '{not json');
  record(
    'guard',
    'isMtLocked: an unreadable marker counts as locked',
    lock.isMtLocked(u.mtOutput) === true,
    ''
  );
}

// Guard: promoteFableLayer never overwrites a Fable file whose bytes differ, and reads no marker
// (model: PfWrite). Runs on a temp copy of one chapter's inputs; nothing under books/ is written.
{
  const { promoteFableLayer, readSources } = await import(
    path.join(repo, 'tools/promote-fable-layer.js')
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lock-replay-pf-'));
  roots.push(root);
  const book = path.join(root, 'books', STUDY_BOOK);
  const realBook = path.join(repo, 'books', STUDY_BOOK);
  for (const layer of [
    '02-for-mt',
    '02-structure',
    '02-mt-output',
    '02-mt-selected',
    '02-mt-revised',
    '03-faithful-translation',
  ]) {
    const from = path.join(realBook, layer, 'ch00');
    if (fs.existsSync(from)) fs.cpSync(from, path.join(book, layer, 'ch00'), { recursive: true });
  }
  const opts = {
    chapters: ['ch00'],
    bookDir: book,
    writtenBy: { tool: 'tools/promote-fable-layer.js', commit: 'replay' },
    // CI-style depth-1 clones lack the term pass's commit: read "then" English as English now
    inputOptions: {
      gitShow: (_commit, repoRel) => fs.readFileSync(path.join(repo, repoRel), 'utf8'),
    },
    sources: readSources(),
  };
  promoteFableLayer(opts);
  const file = path.join(book, '02-mt-fable', 'ch00', 'm68662-segments.is.md');
  const altered = `${fs.readFileSync(file, 'utf8')}x`;
  fs.writeFileSync(file, altered);
  let refused = false;
  try {
    promoteFableLayer(opts);
  } catch (e) {
    refused = /different bytes/.test(e.message);
  }
  record(
    'guard',
    'promoteFableLayer refuses a Fable file with different bytes and leaves it as it was',
    refused && fs.readFileSync(file, 'utf8') === altered,
    `refused: ${refused}`
  );
}

for (const r of roots) fs.rmSync(r, { recursive: true, force: true });

let fail = 0;
for (const r of results) {
  if (r.kind === 'finding') {
    if (r.ok) console.log(`finding still present: ${r.name} (${r.detail})`);
    else {
      console.log(
        `PINNED FINDING NO LONGER REPRODUCES: ${r.name} (${r.detail}) — if fixed on purpose, remove it here, in check.sh and in the skill`
      );
      fail = 1;
    }
  } else if (r.ok) console.log(`guard holds: ${r.name}`);
  else {
    console.log(`GUARD BROKEN: ${r.name} (${r.detail})`);
    fail = 1;
  }
}
console.log(
  fail ? '\nREPLAY FAIL' : '\nREPLAY OK: findings reproduce on the real code, guards hold'
);
process.exitCode = fail;
