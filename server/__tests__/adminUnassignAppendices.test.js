/**
 * C1c Task 4, Part B (admin.js:975) — `DELETE /users/:id/chapters/:book/:chapter`
 * (the legacy user-centric unassign route) used `parseInt(chapter, 10)`, so
 * `chapter='appendices'` reached `userService.removeChapterAssignment` with
 * `NaN` instead of the canonical -1 (item-14's chapterLabel contract). The
 * sibling chapter-centric routes (`/assignments/:book/:chapter`, see
 * adminAssignAppendices.test.js) already use `chapterLabel.normalizeChapter`
 * — this test brings the older route in line, symmetric with those.
 *
 * Harness: route handler invoked directly via router introspection (mirrors
 * adminBooksHonesty.test.js / adminAssignAppendices.test.js), with
 * userService.removeChapterAssignment spied so the exact numeric argument
 * reaching the service is asserted directly rather than inferred from a
 * downstream side effect.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'admin-unassign-app-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

let userService;
let unassignHandler;

function invoke(h, req) {
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
    h(req, res);
  });
}

beforeAll(() => {
  userService = require('../services/userService');
  const router = require('../routes/admin');
  const layer = router.stack.find(
    (l) =>
      l.route && l.route.path === '/users/:id/chapters/:book/:chapter' && l.route.methods.delete
  );
  unassignHandler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

const admin = { id: 'adm1', username: 'admin1', role: 'admin' };

describe('DELETE /api/admin/users/:id/chapters/:book/:chapter — appendices (C1c Task 4B)', () => {
  it("chapter='appendices' reaches removeChapterAssignment with -1, not NaN", async () => {
    const removeSpy = vi.spyOn(userService, 'removeChapterAssignment').mockImplementation(() => {});
    vi.spyOn(userService, 'getChapterAssignments').mockReturnValue([]);

    const { status, body } = await invoke(unassignHandler, {
      params: { id: '42', book: 'efnafraedi-2e', chapter: 'appendices' },
      user: admin,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith(42, 'efnafraedi-2e', -1);
  });

  it('a normal numeric chapter is unaffected (still reaches the service as a number)', async () => {
    const removeSpy = vi.spyOn(userService, 'removeChapterAssignment').mockImplementation(() => {});
    vi.spyOn(userService, 'getChapterAssignments').mockReturnValue([]);

    const { status } = await invoke(unassignHandler, {
      params: { id: '42', book: 'efnafraedi-2e', chapter: '3' },
      user: admin,
    });

    expect(status).toBe(200);
    expect(removeSpy).toHaveBeenCalledWith(42, 'efnafraedi-2e', 3);
  });
});
