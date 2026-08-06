# C20 — make the book-download archive stream fail loudly instead of killing the process

**Created:** 2026-08-06 · **Register item:** [`§C20`](../../plans/2026-07-21-post-item17-followup-campaign.md) (P1, `[CODE]`)
**Baseline:** `main` `30e30301`. Root `npm test` **272 files / 3957 tests green** — measured 2026-08-06 on the C3 branch immediately before it merged as `55024ea1`; `30e30301` adds only a CLAUDE.md docs commit on top, so no test was re-run at exactly this sha
**Runtime measured against:** local Node `v22.22.2`, `archiver` **8.0.0** (`server/node_modules`)

> **Status discipline.** This document is a *design record*, frozen on the date above. It is
> **evidence, never status**. If it disagrees with the active register, **the register wins**.
> Per CLAUDE.md § *One source of truth* it carries no status verbs and no live counts; the
> baseline figure above is a dated measurement, not a claim about any later tree.

---

## 1. Problem

`GET /api/books/:bookId/download` streams a ZIP with no `error` listener on the archive and no
client-disconnect handling:

```js
// server/routes/books.js:460-461
const archive = new ZipArchive({ zlib: { level: 9 } });
archive.pipe(res);
// … addFilesFromDir(…) …
await archive.finalize();          // :493
```

An `error` on that stream therefore **kills the `ritstjorn` process**, not the request — every
editor loses their session mid-work. The handler's `try/catch` does not fire: archiver's
`_modulePipe` registers `_onModuleError` on the module *before* `finalize()` installs its reject
listener, so `_onModuleError`'s `this.emit('error', err)` throws out of the module's `emit` and the
rejection path is never reached.

**Filed P1 on one criterion: it does not fail safe.** Every other hardening row over-refuses or
leaks read-only information. This one takes the whole editorial server down.

**Pre-existing, but made reachable by §C19.** Register §C20 checked the `archiver@7.0.1` tarball
directly: v7's `_modulePipe` and `_onModuleError` are the same two statements as v8's, and neither
attaches a user-facing `error` listener. The hazard has been live since project inception and was
dormant only because the route itself threw on every call between the 2026-05-12 bump to v8 and
C19's fix. **A dead route cannot race.** C19 revives the route, and with it this.

**Not hypothetical:** "Vista + Birta" rewrites `05-publication/` on the same box the download reads
from, so a re-render concurrent with a download is a real trigger.

### 1.1 Measurements this design rests on

From §C20, whose entry records them as re-run first-hand rather than copied from a review's prose.
They are **not** re-measured here; they are re-proven by the RED phase of the implementation.

| Scenario | Outcome | Repeatability |
|---|---|---|
| unlink **immediately** after `.file()` (archiver's stat fails) | `warning ENOENT`, `finalize()` resolves, exit 0 — process survives | 6/6 |
| unlink one tick later, **after** the stat (`setImmediate`) | uncaught `ENOENT` → exit 1 | ⚠️ **1 of 6** |
| **`chmod 000` after `.file()`** — stat succeeds, read denied | uncaught `EACCES` → exit 1 | **6/6 — the deterministic reproducer** |
| an appended stream that errors mid-read | uncaught → exit 1 | 3/3 |

⚠️ **Use the `chmod` row, not the unlink row.** Unlink-after-stat crashed 1 run in 6, so a fix
"verified" against it looks green ~83% of the time on broken code.

### 1.2 The trap that defines the fix

**The obvious one-line fix does not fix this; it converts a crash into a hang. Measured 4/4.**
With `archive.on('error', …)` attached and the deterministic `chmod` trigger: the listener fires
with `EACCES`, then **`finalize()` never settles** (still pending at 3 s) and **`res` is never
ended**. The process survives; the editor's browser instead holds an open chunked download that
never completes and never errors, while the handler promise and the `Archiver` leak for the process
lifetime.

**A fix validated only by "the server stopped crashing" ships exactly this.**

---

## 2. Decisions taken

Two questions were open in the register. Both were decided by the lead on 2026-08-06.

**D1 — a mid-stream failure fails the download visibly.** The response is destroyed, so the chunked
stream is never terminated and the browser reports a failed/incomplete download. Rejected: ending
the response cleanly (hands the editor a truncated `.zip` that opens and is silently missing files)
and skipping the bad file with an in-archive warnings manifest (more machinery, and still delivers a
"successful" download for a failed operation). Consistent with the project's standing
*fail loud, no escape hatches in prod* preference.

**D2 — scope is C20 only.** §C22 is **not** fixed here. Its mechanism is in doubt as of
2026-08-06 (the register's correction: the UI reads `/api/status/…`, which *does* emit
`publication.<track>.complete`, and the field is `complete` for `efnafraedi-2e` ch1–5 in the dev DB),
and settling it needs one read-only production measurement rather than code.

**Consequence to state plainly: this PR cannot be proven end to end through the UI.** §C22 keeps the
download button hidden, so the route remains reachable only by test and by a hand-typed URL. That is
accepted, not overlooked.

---

## 3. Design

### 3.1 Why the client's call shape decides the failure UX

`downloadPublishedHtml()` (`server/views/books.html:2251-2254`) does
`window.location.href = '/api/books/…/download?…'` — a **browser navigation, not `fetch`**. There is
no page-side JavaScript to receive an error, so the server's only channel for "this failed" is the
shape of the HTTP response.

The route sets no `Content-Length` (it streams), so the response is chunked. **Destroying the socket
leaves the chunked framing unterminated**, which browsers surface as a failed download. Ending it
cleanly would present a complete-looking, truncated archive. That is the whole mechanism behind D1.

### 3.2 Control flow

Inline in the handler — no new module. Replaces `await archive.finalize()` at `books.js:493`:

```js
const archive = new ZipArchive({ zlib: { level: 9 } });

// Settles on the FIRST failure of either stream; never resolves on success.
const failure = new Promise((resolve) => {
  archive.on('error', (err) => resolve({ kind: 'archive', err }));
  res.on('error', (err) => resolve({ kind: 'response', err }));
  res.on('close', () => {
    if (!res.writableFinished) resolve({ kind: 'disconnect' });
  });
});

archive.pipe(res);
// … addFilesFromDir(…) unchanged …

const outcome = await Promise.race([
  archive.finalize().then(
    () => null,
    (err) => ({ kind: 'finalize', err })
  ),
  failure,
]);

if (outcome) {
  if (outcome.kind === 'disconnect') archive.abort();
  else log.error({ err: outcome.err, bookId, type, kind: outcome.kind }, 'Download archive failed mid-stream');
  res.destroy();
}
```

Each element is load-bearing:

- **`Promise.race`, not `await finalize()` — this is the fix.** §1.2 measured `finalize()` still
  pending at 3 s after the error, so awaiting it *is* the hang. The race means the handler never
  depends on it settling.
- **`res.destroy()`, not `res.end()`** — implements D1 (§3.1).
- **`res.on('close')` guarded by `writableFinished`** — `close` follows `finish` on **every**
  successful download, so without the guard this would abort a completed archive on the happy path.
- **`res.on('error')`** — a vanishing client can emit `ECONNRESET` on the response; cheap insurance
  against a second uncaught path.
- **`archive.abort()`** on disconnect only — `abort` exists on `archiver@8.0.0`'s `ZipArchive`
  (verified against the installed package, not from documentation).

### 3.3 Deliberately excluded

- **No `process.on('uncaughtException')` net.** That is the escape hatch the project's standing
  *robustness over expedience* preference rejects: it would mask the next unrelated fatal bug too.
- **No change to `addFilesFromDir`,** and no injectable file-enumeration seam. §C20 speculated a fix
  "likely means making the file-enumeration seam injectable"; it does not, because the deterministic
  reproducer is a real unreadable file and needs no injection.
- **No change to the existing `catch`.** It stays, still guarded by `!res.headersSent`, and remains
  correct for pre-stream failures (invalid type, missing dir, the `409` unprotected-files case).
- **No `requireBookAccess()`.** The route is `requireAuth`-only with no book scoping — logged to
  register §C5 on 2026-08-06. Mixing an authz change into a stream-failure fix muddies both reviews.

---

## 4. Testing

### 4.1 Why the existing harness cannot cover this

`server/__tests__/books-routes.test.js`'s C19 block settles on the response stream's `end` or on
`res.json`, so a mid-stream failure is outside what it observes. **C19's green is not coverage of
this.** Worse, on unfixed code an in-process test does not fail — it **kills the vitest worker** —
and installing `process.once('uncaughtException')` to observe the crash removes the very behaviour
under test. The crash assertion must therefore run in a **child process** and be read from its
**exit code**.

### 4.2 Fixture

`VALID_BOOKS` (`server/config.js:98`) is
`[efnafraedi-2e, liffraedi-2e, orverufraedi, lifraen-efnafraedi, edlisfraedi-2e]` — it does **not**
include `__e2e-fixture__`, so the route 400s on the gitignored fixture book and it cannot be used
here.

The test instead creates a **throwaway chapter directory it owns**:
`books/orverufraedi/05-publication/mt-preview/chapters/99/` (`MAX_CHAPTERS` is 99, so the route
accepts chapter 99), containing one `.html` file, removed on teardown.

**It never changes a tracked file's mode.** If teardown is ever skipped — and the pre-fix child
*dies*, so teardown must be the parent's responsibility — the worst residue is an untracked scratch
directory, not a committed file left at `000`.

### 4.3 The root guard, made loud

**`chmod 000` is a no-op as root**: the read succeeds, no error is raised, and the test passes on
broken code — the project's catalogued *check that passes for the wrong reason*. After chmod, setup
**attempts a read and throws** `cannot revoke read permission (running as root?)` rather than
skipping. A silent skip is the same failure with better manners. (Local uid is 1000; this bites only
where CI or a container runs as root.)

### 4.4 The three tests

**T1 — crash + hang, one child process.** The child invokes the real handler with a fake `req`/`res`
against the unreadable fixture, then prints one JSON line. The parent asserts:

| Assertion | Catches | Pre-fix |
|---|---|---|
| child exit code `0` | the crash | exit `1` (uncaught `EACCES`) |
| `settled: true` within a **5 s** parent timeout | **the hang** | child never exits → parent kills → fail |
| `destroyed: true` | D1 (fail visibly) | n/a |
| `finished: false` | that we did not end cleanly and hand over a truncated zip | n/a |

The middle two are what stop a fix that merely ends the crash from passing. 5 s is chosen against
§1.2's measurement that `finalize()` was still pending at 3 s.

⚠️ **A crashing child prints no JSON at all** — it dies before the report line. The parent must
therefore treat "no JSON" as a failure attributable to the exit code, not as an assertion error on a
missing field, or the pre-fix RED will be reported as the wrong defect.

**T2 — client disconnect (in-process, safe).** Emit `close` on `res` before finish; assert the
handler settles and `archive.abort()` ran. No error is emitted on this path, so it cannot take the
worker down.

**T3 — the happy path still works.** The existing C19 ZIP central-directory test must stay green
unchanged; the race must not alter success behaviour.

### 4.5 Mutation checks (required, not optional)

Per this repo's standing lesson — *the dangerous check is the one that passes for the wrong reason* —
each half of the fix is reverted independently and must turn **its own** assertion red:

| Mutation | Must turn red | Must stay green |
|---|---|---|
| remove `archive.on('error')` | T1 exit code | T3 |
| keep the listener, restore `await archive.finalize()` | T1 `settled` | T3 |
| replace `res.destroy()` with `res.end()` | T1 `destroyed` / `finished` | T1 exit code, T3 |
| remove the `res.on('close')` handler | T2 | T1, T3 |
| remove the `writableFinished` guard | ⚠️ **expected T3 — but UNVERIFIED, see below** | — |

⚠️ **The last row is a prediction, not a measurement, and it may well be wrong.** On the happy path
the ordering is: `finalize()` resolves → `res` finishes → `res` emits `close`. If `finalize()`
therefore always wins the race, the late `close` resolution is discarded and removing the guard
**breaks nothing** — making it defensive rather than load-bearing. Run the mutation and record the
actual result:

- **If T3 goes red**, the guard is load-bearing and the prediction stood.
- **If nothing goes red**, the guard is belt-and-braces against an ordering this design has not
  demonstrated. Keep it — but comment it as defensive, and **correct this table**, because an
  untriggerable mutation row is exactly the vacuous check §4.3 warns about, one level up.

Either outcome is a result. Recording "unverified" here rather than asserting the red is the point:
the register's §C20 entry exists because a confident, unmeasured claim was caught before it shipped.

### 4.6 Not asserted

That the **browser** displays "download failed". That is a client-side consequence of an
unterminated chunked stream and is outside what a Node test observes. It is recorded here as the
reasoning behind D1, **not** as a covered claim.

---

## 5. Done-bar

- Root `npm test` green from the repo root (the authoritative gate — there is no branch protection).
- T1, T2, T3 pass; **every row of §4.5 verified by actually running the mutation.**
- No change to the happy-path ZIP bytes: the C19 central-directory assertions pass unmodified.
- The register's §C20 entry updated with what shipped, and with any premise this work falsified.

**Out of scope for the done-bar, and stated so it is not mistaken for an omission:** no deploy, no
re-render, no vefur sync (server-only, nothing reader-facing moves), and **no end-to-end UI proof** —
§C22 still hides the button (D2).
