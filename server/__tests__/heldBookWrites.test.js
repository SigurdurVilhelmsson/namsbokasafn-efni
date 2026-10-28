// server/__tests__/heldBookWrites.test.js
//
// Skerfur plan G1.14, the held-book write guard, in applyHold's style. #556's hold covers only
// the writers of faithful files. While chemistry's whole-book re-render and the reader sync are
// held, the pipeline routes and the publish routes must refuse non-admins too; while figure
// review is closed (register R-22), so must the figure-correction route; and the manual stage
// advance becomes admin-only. Paired tests: refused for non-admins on the held book, open to
// admins, open on a book that is not held.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

// Route modules read config at load; point any database they open at a throwaway path.
process.env.SESSIONS_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), 'held-writes-')),
  'sessions.db'
);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const {
  pipelineHold,
  figureReviewClosed,
  refuseHeldForNonAdmins,
  HELD_FOR_PIPELINE,
} = require('../lib/heldBookWrites');

const CHEM = 'efnafraedi-2e';

function call(mw, user) {
  const res = {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  let passed = false;
  mw({ user, params: { book: CHEM }, body: { book: CHEM } }, res, () => {
    passed = true;
  });
  return { passed, res };
}

const guard = refuseHeldForNonAdmins(pipelineHold, (req) => req.body.book, 'pipeline');

describe('held-book write guard: the middleware', () => {
  it('refuses a head editor on a held book with 423', () => {
    expect(call(guard, { role: 'head-editor' }).res.statusCode).toBe(423);
  });

  it('says it is held, so the client can tell it from an error', () => {
    expect(call(guard, { role: 'editor' }).res.body.held).toBe(true);
  });

  it('lets an admin through on a held book', () => {
    expect(call(guard, { role: 'admin' }).passed).toBe(true);
  });

  it('lets a non-admin through on a book that is not held', () => {
    const other = refuseHeldForNonAdmins(pipelineHold, () => 'liffraedi-2e', 'pipeline');
    expect(call(other, { role: 'head-editor' }).passed).toBe(true);
  });

  it('holds chemistry for the pipeline', () => {
    expect(HELD_FOR_PIPELINE).toContain(CHEM);
  });

  it('keeps figure review closed for chemistry (R-22)', () => {
    expect(figureReviewClosed(CHEM)).toBeTruthy();
  });
});

/** The route-level middleware of one route, so a test can see what guards it. */
function stackOf(router, method, path) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`no ${method} ${path}`);
  return layer.route.stack.map((s) => s.handle);
}
const guarded = (handles, label) => handles.some((h) => h.heldBookGuard === label);

describe('held-book write guard: the routes it sits on', () => {
  const pipeline = require('../routes/pipeline');
  const publication = require('../routes/publication');
  const segmentEditor = require('../routes/segment-editor');

  for (const path of ['/inject', '/render', '/run']) {
    it(`guards POST /api/pipeline${path}`, () => {
      expect(guarded(stackOf(pipeline, 'post', path), 'pipeline')).toBe(true);
    });
  }

  for (const track of ['mt-preview', 'faithful', 'localized']) {
    it(`guards the ${track} publish`, () => {
      expect(
        guarded(stackOf(publication, 'post', `/:bookSlug/:chapterNum/${track}`), 'pipeline')
      ).toBe(true);
    });
  }

  it('guards the figure-correction route while figure review is closed', () => {
    const path = '/:book/:chapter/:moduleId/figures/:basename/block';
    expect(guarded(stackOf(segmentEditor, 'post', path), 'figure-review')).toBe(true);
  });

  // The route G1.14 names: a figure's review state. Missed in the first wiring, and found by
  // figureReviewRoutes.test.js's shape check, which saw only the block route change.
  it('guards the figure-state route while figure review is closed', () => {
    const path = '/:book/:chapter/:moduleId/figures/:basename/state';
    expect(guarded(stackOf(segmentEditor, 'post', path), 'figure-review')).toBe(true);
  });
});

describe('the manual stage advance', () => {
  const pipelineStatus = require('../routes/pipeline-status');

  it('is refused to an editor', () => {
    const [roleCheck] = stackOf(pipelineStatus, 'post', '/:bookSlug/:chapterNum/advance');
    const { passed, res } = call(roleCheck, { role: 'head-editor' });
    expect({ passed, status: res.statusCode }).toEqual({ passed: false, status: 403 });
  });
});
