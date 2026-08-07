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
