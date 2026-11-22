// server/__tests__/editorScope.test.js
//
// G1.13 (spec §6.1): the editor-writable book allowlist and the closed-book middleware, plus the
// two role labels that the route census reads.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

// requireRole.js loads services that open the database; point it at a throwaway path.
process.env.SESSIONS_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), 'editor-scope-')),
  'sessions.db'
);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const {
  EDITOR_WRITABLE_BOOKS,
  isEditorWritableBook,
  isAlwaysEnforced,
  BOOK_CLOSED_MESSAGE,
  refuseClosedBookForNonAdmins,
} = require('../lib/editorScope');
const {
  requireRole,
  requireAdmin,
  requireBookAccess,
  ROLES,
} = require('../middleware/requireRole');

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
  let nexted = false;
  mw({ user }, res, () => {
    nexted = true;
  });
  return { res, nexted };
}

const callOn = (book, role) =>
  call(
    refuseClosedBookForNonAdmins(() => book, 'param'),
    { role }
  );

describe('allowlist', () => {
  it('is chemistry only, frozen', () => {
    expect(EDITOR_WRITABLE_BOOKS).toEqual(['efnafraedi-2e']);
    expect(Object.isFrozen(EDITOR_WRITABLE_BOOKS)).toBe(true);
  });
  it.each([
    'liffraedi-2e',
    '__e2e-fixture__',
    'lifraen-efnafraedi',
    undefined,
    '__proto__',
    ['efnafraedi-2e'],
  ])('isEditorWritableBook(%j) is false', (b) => expect(isEditorWritableBook(b)).toBe(false));
  it('isEditorWritableBook is true for chemistry', () => {
    expect(isEditorWritableBook('efnafraedi-2e')).toBe(true);
  });
  it('isAlwaysEnforced follows STUDY_BOOKS', () => {
    expect(isAlwaysEnforced('efnafraedi-2e')).toBe(true);
    expect(isAlwaysEnforced('liffraedi-2e')).toBe(false);
  });
});

describe('refuseClosedBookForNonAdmins', () => {
  it.each(['editor', 'head-editor'])('refuses %s on a closed book', (role) => {
    const { res, nexted } = callOn('liffraedi-2e', role);
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'BOOK_CLOSED', message: BOOK_CLOSED_MESSAGE });
  });
  it('lets an admin through on a closed book', () => {
    const { res, nexted } = callOn('liffraedi-2e', ROLES.ADMIN);
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });
  it('lets an editor through on chemistry', () => {
    expect(callOn('efnafraedi-2e', 'editor').nexted).toBe(true);
  });
  it('answers 404 with the message when bookOf throws', () => {
    const mw = refuseClosedBookForNonAdmins(() => {
      throw new Error('Edit not found');
    }, 'row');
    const { res, nexted } = call(mw, { role: 'editor' });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Edit not found' });
  });
  it('carries its label', () => {
    expect(refuseClosedBookForNonAdmins(() => 'x', 'row').editorScopeGuard).toBe('row');
    expect(refuseClosedBookForNonAdmins(() => 'x', 'body').editorScopeGuard).toBe('body');
  });
  it('has an Icelandic message', () => {
    expect(BOOK_CLOSED_MESSAGE).toMatch(/\S/);
  });
});

describe('role labels', () => {
  it('requireRole carries its minimum role', () => {
    expect(requireRole(ROLES.ADMIN).minimumRole).toBe('admin');
  });
  it('requireAdmin carries admin', () => {
    expect(requireAdmin().minimumRole).toBe('admin');
  });
  it('requireBookAccess carries bookAccessGuard', () => {
    expect(requireBookAccess().bookAccessGuard).toBe(true);
  });
});
