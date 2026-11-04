// server/__tests__/helpers/servedFixture.js
/**
 * Fixtures for the G1.1 route tests: synthetic segment files under a temp books root, and a
 * route's own handler driven without HTTP (plan Task 6; later PRs drive their route tests with
 * the same helpers).
 *
 * ⚠️ The SEG marker takes NO space after the colon (CLAUDE.md § SEG marker): the spaced form
 * parses to an empty segment list, silently.
 *
 * Plain CJS so ESM vitest files can load it via createRequire.
 */
const fs = require('fs');
const path = require('path');

const segFile = (pairs) => pairs.map(([id, text]) => `<!-- SEG:${id} -->\n${text}\n`).join('\n');

function writeRaw(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

/** { book, chapterDir, moduleId, en: [[id, text]], mt?: [[id, text]] | string, faithful?: same } */
function writeModule(root, { book, chapterDir, moduleId, en, mt = null, faithful = null }) {
  const body = (x) => (typeof x === 'string' ? x : segFile(x));
  writeRaw(root, `${book}/02-for-mt/${chapterDir}/${moduleId}-segments.en.md`, body(en));
  if (mt) writeRaw(root, `${book}/02-mt-output/${chapterDir}/${moduleId}-segments.is.md`, body(mt));
  if (faithful) {
    writeRaw(
      root,
      `${book}/03-faithful-translation/${chapterDir}/${moduleId}-segments.is.md`,
      body(faithful)
    );
  }
}

/** The route's last handler (the one after its middleware), found by path and method. */
function handlerFor(router, method, routePath) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  return layer.route.stack.at(-1).handle;
}

function invoke(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    handler(req, res);
  });
}

const EDITOR = Object.freeze({ id: 'u-ed1', username: 'editor1', role: 'editor', books: [] });

module.exports = { segFile, writeModule, writeRaw, handlerFor, invoke, EDITOR };
