# C20 — Download Stream Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a mid-stream archive failure in `GET /api/books/:bookId/download` from killing the `ritstjorn` process, and make it fail visibly to the editor instead.

**Architecture:** Inline in the route handler — no new module. Attach `error`/`close` listeners to the archive and response, then replace `await archive.finalize()` with a `Promise.race` between finalize and a failure promise, destroying `res` on any failure. Racing is the fix: awaiting `finalize()` is itself the hang.

**Tech Stack:** Node 22.x (`.nvmrc`), CommonJS under `server/`, `archiver` 8.0.0, Vitest, `node:child_process` for the crash assertion.

**Spec:** [`docs/superpowers/specs/2026-08-06-c20-download-stream-error-design.md`](../specs/2026-08-06-c20-download-stream-error-design.md)
**Register:** [`§C20`](../../plans/2026-07-21-post-item17-followup-campaign.md) (P1, `[CODE]`)
**Baseline:** `main` `027e338e`, root `npm test` **272 files / 3957 tests green**.

## Global Constraints

- **Root `npm test` is the authoritative gate.** Run it from the repo root, never from `server/`. There is no branch protection (register C12), so a red PR can still merge — local green is the real proof.
- **⚠️ GitHub Actions was in a `major_outage` on 2026-08-06** and may still create **zero** runs. Check `total_count`, not run duration: `gh api "repos/SigurdurVilhelmsson/namsbokasafn-efni/actions/runs?head_sha=$(git rev-parse HEAD)" --jq .total_count`. Do not block on CI; do not claim CI green without a run object.
- **Never leave a tracked file at mode `000`.** All permission changes apply to files the test itself created under a throwaway directory, and teardown belongs to the **parent** process, never the child (the pre-fix child dies).
- **Scope is C20 only** (spec D2). Do **not** touch `server/views/books.html` (§C22), and do **not** add `requireBookAccess()` to the route (logged to register §C5).
- **No `process.on('uncaughtException')`.** Rejected in spec §3.3.
- `server/` is CommonJS: `require`, not `import`.
- `server/` is **not** covered by `npm run lint` (which lints only `tools/` and `scripts/`). Lint it with `npx eslint server/...` explicitly.
- Every new test must be **mutation-checked** — see Task 4. A test nobody has watched fail proves nothing.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `server/routes/books.js` | Modify (`:460-493`) | The fix: failure promise, race, destroy-on-failure, abort-on-disconnect. |
| `server/__tests__/helpers/c20DownloadChild.cjs` | Create | Child-process entry point. Invokes the real handler against the unreadable fixture and prints one JSON report line. Not collected by Vitest (no `.test.` in the name). |
| `server/__tests__/booksDownloadStreamFailure.test.js` | Create | T1 (crash + hang, via child process) and T2 (client disconnect, in-process). Owns fixture setup **and teardown**. |
| `server/__tests__/books-routes.test.js` | Unchanged | T3 — the existing C19 ZIP central-directory test must stay green untouched. |
| `docs/plans/2026-07-21-post-item17-followup-campaign.md` | Modify | Register §C20 entry updated with what shipped and what was falsified (Task 5). |

---

### Task 1: The failing test — crash and hang, in a child process

**Files:**
- Create: `server/__tests__/helpers/c20DownloadChild.cjs`
- Create: `server/__tests__/booksDownloadStreamFailure.test.js`

**Interfaces:**
- Consumes: the `/:bookId/download` handler, reached via `require('../routes/books')` and the router stack (same lookup as `books-routes.test.js:307-309`).
- Produces: a child contract later tasks depend on — the child prints exactly one line `REPORT:{"settled":bool,"destroyed":bool,"finished":bool}` on stdout and exits `0`; **on unfixed code it prints nothing and exits `1`**.

**Background the implementer needs:**

The reproducer is `chmod 000` on a file the test creates. Permission lives on a file's *content*, not its metadata, so `addFilesFromDir`'s `fs.statSync` and archiver's own stat both succeed and only the later `open` fails with `EACCES`. **Measured 3/3 against the unfixed route.** No mid-stream timing, no injectable seam.

`VALID_BOOKS` (`server/config.js:98`) does **not** include `__e2e-fixture__`, so that book 400s. Use `orverufraedi` with a throwaway chapter `99` (`MAX_CHAPTERS` is 99).

`server/services/auth.js` throws at load time unless `JWT_SECRET` is set, so the child needs it in its env (`books-routes.test.js:19` does the same for the parent).

- [ ] **Step 1: Write the child script**

Create `server/__tests__/helpers/c20DownloadChild.cjs`:

```js
/**
 * C20 child-process harness.
 *
 * Asserting "this crashes the process" cannot be done in-process: installing
 * `process.once('uncaughtException')` to observe the crash removes the very
 * behaviour under test, and on unfixed code an in-process run kills the vitest
 * worker rather than failing. So the crash is observed here, from the OUTSIDE,
 * as this script's exit code.
 *
 * Prints exactly one line: REPORT:{"settled":…,"destroyed":…,"finished":…}
 * On unfixed code it prints NOTHING and exits 1 — the parent must key on the
 * exit code, not on a missing field. (Measured: report line empty in 3/3 runs.)
 *
 * Not named *.test.* so Vitest does not collect it.
 */
const { PassThrough } = require('stream');

const [, , bookId, chapter, type] = process.argv;

const router = require('../../routes/books');
const handler = router.stack.find(
  (l) => l.route && l.route.path === '/:bookId/download' && l.route.methods.get
).route.stack.at(-1).handle;

const res = new PassThrough();
res.statusCode = 200;
res.status = function (c) {
  this.statusCode = c;
  return this;
};
res.headersSent = false;
res.setHeader = () => {};
res.json = () => {};
res.on('data', () => {}); // drain, avoid backpressure hangs
res.on('error', () => {}); // a destroyed response may emit; not the subject

let reported = false;
function report() {
  if (reported) return;
  reported = true;
  process.stdout.write(
    'REPORT:' +
      JSON.stringify({
        settled: true,
        destroyed: res.destroyed === true,
        finished: res.writableFinished === true,
      }) +
      '\n'
  );
}

Promise.resolve(
  handler({ params: { bookId }, query: { chapter, type } }, res)
).then(report, report);
```

- [ ] **Step 2: Write the test**

Create `server/__tests__/booksDownloadStreamFailure.test.js`:

```js
/**
 * C20 — a mid-stream archive failure must not kill the process, and must not
 * hang. Both halves matter: §C20 measured 4/4 that adding `archive.on('error')`
 * ALONE converts the crash into a hang (finalize() still pending at 3s, res
 * never ended), so a harness asserting only "no crash" would call that green.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const { execFileSync, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const FIXTURE_BOOK = 'orverufraedi'; // VALID_BOOKS excludes __e2e-fixture__
const FIXTURE_CHAPTER = '99'; // MAX_CHAPTERS is 99
const FIXTURE_DIR = path.join(
  REPO, 'books', FIXTURE_BOOK, '05-publication', 'mt-preview', 'chapters', FIXTURE_CHAPTER
);
const FIXTURE_FILE = path.join(FIXTURE_DIR, 'm99999.html');
const CHILD = path.join(__dirname, 'helpers', 'c20DownloadChild.cjs');

// Teardown belongs to the PARENT: on unfixed code the child DIES, so anything
// it registered never runs. The fixture is a directory this test creates, so
// the worst residue is an untracked scratch dir — never a tracked file at 000.
function makeUnreadableFixture() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(FIXTURE_FILE, '<html>c20 fixture</html>\n');
  fs.chmodSync(FIXTURE_FILE, 0o000);

  // `chmod 000` is a NO-OP AS ROOT: the read succeeds, no error is raised, and
  // this test passes on broken code. Fail loudly rather than skipping — a
  // silent skip is the same failure with better manners.
  let readable = false;
  try {
    fs.readFileSync(FIXTURE_FILE);
    readable = true;
  } catch {
    /* expected: EACCES */
  }
  if (readable) {
    throw new Error(
      'C20 fixture: cannot revoke read permission (running as root?) — ' +
        'this test cannot detect the defect under this uid'
    );
  }
}

function removeFixture() {
  try {
    fs.chmodSync(FIXTURE_FILE, 0o644);
  } catch {
    /* already gone */
  }
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

beforeEach(makeUnreadableFixture);
afterEach(removeFixture);

describe('GET /:bookId/download — mid-stream archive failure (C20)', () => {
  it('does not kill the process, settles, and destroys the response', async () => {
    const result = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [CHILD, FIXTURE_BOOK, FIXTURE_CHAPTER, 'pub-mt-preview'],
        {
          cwd: path.join(REPO, 'server'),
          env: { ...process.env, JWT_SECRET: 'test-secret' },
          timeout: 5000, // §C20: finalize() was still pending at 3s
          encoding: 'utf8',
        },
        (err, stdout) => resolve({ code: err ? (err.code ?? 1) : 0, killed: err?.killed === true, stdout })
      );
    });

    // Pre-fix: exit 1 with an uncaught EACCES and NO report line at all.
    expect(result.killed).toBe(false); // the hang: timeout would kill it
    expect(result.code).toBe(0);

    const line = result.stdout.split('\n').find((l) => l.startsWith('REPORT:'));
    expect(line, `child printed no REPORT line; stdout=${JSON.stringify(result.stdout)}`).toBeTruthy();

    const report = JSON.parse(line.slice('REPORT:'.length));
    expect(report.settled).toBe(true);
    expect(report.destroyed).toBe(true); // fail visibly (spec D1)
    expect(report.finished).toBe(false); // never ended cleanly with a truncated zip
  }, 15000);
});
```

- [ ] **Step 3: Run the test and confirm it fails FOR THE RIGHT REASON**

Run: `npx vitest run server/__tests__/booksDownloadStreamFailure.test.js`

Expected: **FAIL** on `expect(result.code).toBe(0)` — received `1`. That is the uncaught `EACCES` killing the child.

⚠️ **If it fails on the missing `REPORT` line instead, the assertion order is wrong** — fix it so the exit code is asserted first, or the pre-fix RED reports the wrong defect.

⚠️ **If it fails with `cannot revoke read permission`, you are root.** That is the guard working. Re-run as a non-root user; do not weaken the guard.

- [ ] **Step 4: Commit the failing test**

```bash
git add server/__tests__/helpers/c20DownloadChild.cjs server/__tests__/booksDownloadStreamFailure.test.js
git commit -m "test(C20): red — a mid-stream archive failure kills the process

Child-process harness, because asserting process death in-process is not
honest: installing an uncaughtException handler removes the behaviour under
test, and on unfixed code an in-process run kills the vitest worker.

Reproducer is chmod 000 applied BEFORE the request — permission lives on a
file's content, not its metadata, so both stats succeed and only the open
fails. Measured 3/3, no mid-stream timing needed.

Guards against the chmod-is-a-no-op-as-root trap by attempting a read and
throwing rather than skipping."
```

---

### Task 2: The fix

**Files:**
- Modify: `server/routes/books.js:460-493`

**Interfaces:**
- Consumes: `ZipArchive` (`books.js:17`), `log` (already used at `books.js:494`), `bookId` and `type` (already in scope from `req.params` / `req.query`).
- Produces: no new exports. The handler's observable contract gains: on mid-stream failure it destroys `res` and resolves rather than throwing or hanging.

- [ ] **Step 1: Insert the failure promise**

In `server/routes/books.js`, replace these two lines (currently `:460-461`):

```js
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.pipe(res);
```

with:

```js
    const archive = new ZipArchive({ zlib: { level: 9 } });

    // Settles on the FIRST failure of either stream; never resolves on success.
    //
    // Without an 'error' listener an archive error KILLS THE PROCESS: archiver's
    // _modulePipe registers _onModuleError on the module BEFORE finalize()
    // installs its reject listener, so _onModuleError's `this.emit('error', err)`
    // throws out of emit and the catch below is never reached. Register §C20.
    const failure = new Promise((resolve) => {
      archive.on('error', (err) => resolve({ kind: 'archive', err }));
      res.on('error', (err) => resolve({ kind: 'response', err }));
      res.on('close', () => {
        // `close` follows `finish` on EVERY successful download, so without the
        // writableFinished guard this would abort a completed archive.
        if (!res.writableFinished) resolve({ kind: 'disconnect' });
      });
    });

    archive.pipe(res);
```

- [ ] **Step 2: Replace the unconditional await**

Replace this line (currently `:493`):

```js
    await archive.finalize();
```

with:

```js
    // ⚠️ RACE, do not `await archive.finalize()` alone — that IS the hang.
    // Measured 4/4 (register §C20): with an 'error' listener attached, the
    // listener fires and then finalize() NEVER settles (still pending at 3s)
    // and res is never ended, so the crash becomes an open download that never
    // completes and never errors, leaking the handler promise and the Archiver.
    const outcome = await Promise.race([
      archive.finalize().then(
        () => null,
        (err) => ({ kind: 'finalize', err })
      ),
      failure,
    ]);

    if (outcome) {
      if (outcome.kind === 'disconnect') {
        archive.abort();
      } else {
        log.error(
          { err: outcome.err, bookId, type, kind: outcome.kind },
          'Download archive failed mid-stream'
        );
      }
      // destroy(), NOT end(): the response is chunked (no Content-Length), so
      // destroying leaves the framing unterminated and the browser reports a
      // FAILED download. Ending cleanly would hand the editor a truncated .zip
      // that opens and is silently missing files. Spec D1.
      res.destroy();
    }
```

Leave the existing `catch (err)` block **unchanged** — it is still correct for pre-stream failures and is still guarded by `!res.headersSent`.

- [ ] **Step 3: Verify it parses and lints**

```bash
node -e "require('./server/routes/books.js')" && npx eslint server/routes/books.js
```

Expected: no output from either (`npm run lint` does **not** cover `server/`).

- [ ] **Step 4: Run the T1 test**

Run: `npx vitest run server/__tests__/booksDownloadStreamFailure.test.js`
Expected: **PASS** (1 test).

- [ ] **Step 5: Verify the happy path is unchanged**

Run: `npx vitest run server/__tests__/books-routes.test.js`
Expected: **PASS**, unchanged — including the C19 ZIP central-directory assertions.

- [ ] **Step 6: Commit**

```bash
git add server/routes/books.js
git commit -m "fix(C20): race finalize against failure, destroy res, abort on disconnect

An error on the download archive killed the ritstjorn process rather than the
request. Adding an error listener alone does NOT fix it — measured 4/4, it
converts the crash into a hang, because finalize() never settles. So the
handler races finalize against a failure promise and never awaits finalize
unconditionally.

On failure the response is DESTROYED rather than ended: the stream is chunked,
so unterminated framing makes the browser report a failed download instead of
saving a truncated zip that opens and is silently missing files."
```

---

### Task 3: Client disconnect

**Files:**
- Modify: `server/__tests__/booksDownloadStreamFailure.test.js`

**Interfaces:**
- Consumes: the handler and the `PassThrough` fake-`res` shape from Task 1.
- Produces: nothing later tasks depend on.

This path emits no error, so it is safe in-process — it cannot take the worker down.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/booksDownloadStreamFailure.test.js`, inside the existing `describe`:

```js
  it('aborts the archive and settles when the client disconnects', async () => {
    const { PassThrough } = require('node:stream');
    const router = require('../routes/books');
    const handler = router.stack.find(
      (l) => l.route && l.route.path === '/:bookId/download' && l.route.methods.get
    ).route.stack.at(-1).handle;

    const res = new PassThrough();
    res.statusCode = 200;
    res.status = function (c) {
      this.statusCode = c;
      return this;
    };
    res.headersSent = false;
    res.setHeader = () => {};
    res.json = () => {};
    res.on('data', () => {});
    res.on('error', () => {});

    // Chapter 1 is a real, readable publication dir — this test is about the
    // client vanishing, not about a read failure.
    const pending = handler(
      { params: { bookId: FIXTURE_BOOK }, query: { chapter: '1', type: 'pub-mt-preview' } },
      res
    );

    // The client goes away mid-download: `close` with writableFinished false.
    setImmediate(() => res.emit('close'));

    await expect(
      Promise.race([
        Promise.resolve(pending).then(() => 'settled'),
        new Promise((r) => setTimeout(() => r('hung'), 5000)),
      ])
    ).resolves.toBe('settled');
  }, 15000);
```

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/booksDownloadStreamFailure.test.js`
Expected: **PASS** (2 tests) — Task 2 already added the `close` handler.

⚠️ **This test is written after its implementation, so it has not been seen to fail.** Task 4's mutation row for `res.on('close')` is what actually earns it. Do not skip that row.

- [ ] **Step 3: Commit**

```bash
git add server/__tests__/booksDownloadStreamFailure.test.js
git commit -m "test(C20): a client disconnect aborts the archive and settles the handler"
```

---

### Task 4: Mutation checks — prove each test can fail

**Files:**
- Modify (temporarily, then revert): `server/routes/books.js`
- Modify: `docs/superpowers/specs/2026-08-06-c20-download-stream-error-design.md` (only if row 5 falsifies the prediction)

**Interfaces:**
- Consumes: the fix from Task 2, the tests from Tasks 1 and 3.
- Produces: a recorded result per row, carried into Task 5's register entry.

The repo's standing lesson is that **the dangerous check is the one that passes for the wrong reason**. A test nobody has watched fail proves nothing.

For each row: make the mutation, run the command, record the result, then **restore the file** (`git checkout -- server/routes/books.js`) and confirm green before the next row.

- [ ] **Step 1: Save a clean copy**

```bash
cp server/routes/books.js /tmp/books.js.good
```

- [ ] **Step 2: Run all five mutations**

Run after each: `npx vitest run server/__tests__/booksDownloadStreamFailure.test.js server/__tests__/books-routes.test.js`

| # | Mutation | Must turn RED | Must stay GREEN |
|---|---|---|---|
| 1 | delete the `archive.on('error', …)` line | T1 exit code | T3 |
| 2 | keep the listener; replace the race with `await archive.finalize()` and drop the `if (outcome)` block | T1 `settled` (child times out, `killed: true`) | T3 |
| 3 | change `res.destroy()` to `res.end()` | T1 `destroyed` / `finished` | T1 exit code, T3 |
| 4 | delete the `res.on('close', …)` handler | T2 | T1, T3 |
| 5 | delete the `if (!res.writableFinished)` guard, leaving `resolve({ kind: 'disconnect' })` unconditional | ⚠️ **predicted T3 — but UNVERIFIED** | — |

Restore between rows:

```bash
cp /tmp/books.js.good server/routes/books.js
```

- [ ] **Step 3: Resolve row 5 honestly**

Row 5 is a **prediction, not a measurement**. On the happy path the order is `finalize()` resolves → `res` finishes → `res` emits `close`, so `finalize()` may always win the race and the late `close` is discarded — which would make the guard defensive rather than load-bearing.

- **If T3 goes red:** the guard is load-bearing. Record that.
- **If nothing goes red:** the guard is belt-and-braces against an ordering not demonstrated here. **Keep it**, but change its code comment from *"without the guard this would abort a completed archive"* to a comment that says it is defensive and that the mutation was measured not to fire — and **correct spec §4.5**, because an untriggerable mutation row is exactly the vacuous check the spec warns about, one level up.

- [ ] **Step 4: Confirm the tree is restored and green**

```bash
git diff --stat server/routes/books.js   # expect: no diff, or only the row-5 comment change
npx vitest run server/__tests__/booksDownloadStreamFailure.test.js server/__tests__/books-routes.test.js
```

- [ ] **Step 5: Commit any row-5 correction**

```bash
git add server/routes/books.js docs/superpowers/specs/2026-08-06-c20-download-stream-error-design.md
git commit -m "docs(C20): record the writableFinished mutation result

The spec predicted removing the guard would turn the happy-path test red.
Records what actually happened when the mutation was run, and corrects the
spec if the prediction did not hold — an untriggerable mutation row is the
vacuous check the spec itself warns about, one level up."
```

(If row 5 turned red as predicted, skip this commit — there is nothing to correct.)

---

### Task 5: Full gate, register, PR

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C20 entry)

**Interfaces:**
- Consumes: the mutation results from Task 4.
- Produces: the merged branch.

- [ ] **Step 1: Run the authoritative gate**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni && npm test
```

Expected: **272 files green, 3960 tests** (3957 baseline + 2 new tests here… verify the arithmetic against what actually prints, and if it does not add up, find out why before continuing — the count mismatch is the check).

- [ ] **Step 2: Update the register's §C20 entry**

Mark it fixed, and record specifically:
- the simpler reproducer (`chmod 000` before the request, 3/3) versus the entry's after-`.file()` framing;
- that the crashing child prints **no** JSON, so the parent keys on the exit code;
- the row-5 outcome from Task 4, whichever way it went;
- that this ships with **no end-to-end UI proof**, because §C22 still hides the button;
- CI status — check `total_count` for the head sha; if Actions is still in outage, say local `npm test` was the gate and that no run object exists.

- [ ] **Step 3: Commit and push**

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(register): C20 fixed — the download stream no longer kills the process"
git fetch origin && git push -u origin fix/c20-download-stream-error
```

(`git fetch` first: after a previous `gh pr merge --delete-branch`, pushing without fetching has produced a 2 GiB remote reject.)

- [ ] **Step 4: Open the PR**

Body must state: the measured before/after, the four T1 assertions and why the middle two matter, the mutation table **with actual results**, the root guard, and the two "not included" items (no deploy needed — server-only; no end-to-end UI proof — §C22).

---

## Self-Review

**Spec coverage:** §1 problem → Task 2. §2 D1 (fail visibly) → Task 2 step 2 (`res.destroy()`) + T1's `destroyed`/`finished` assertions. §2 D2 (scope) → Global Constraints. §3.2 control flow → Task 2 steps 1–2, verbatim. §3.3 exclusions → Global Constraints. §4.1 child process → Task 1. §4.2 fixture → Task 1 step 2. §4.3 root guard → Task 1 step 2 `makeUnreadableFixture`. §4.4 T1/T2/T3 → Tasks 1, 3, and Task 2 step 5. §4.5 mutations → Task 4. §4.6 not-asserted → carried into the register in Task 5 step 2. §5 done-bar → Task 5. **No gaps.**

**Placeholder scan:** No TBD/TODO. Every code step carries real code. The one intentionally open item — mutation row 5 — is open *by design*, with both outcomes specified and an action for each, which is the opposite of a placeholder.

**Type consistency:** `FIXTURE_BOOK`, `FIXTURE_CHAPTER`, `FIXTURE_DIR`, `FIXTURE_FILE`, `CHILD` are defined once in Task 1 and reused unchanged in Task 3. The child's report keys (`settled`, `destroyed`, `finished`) match T1's assertions exactly. `outcome.kind` values (`archive`, `response`, `disconnect`, `finalize`) are produced in Task 2 step 1 and consumed in step 2. The `failure` promise is named consistently across both steps of Task 2.
