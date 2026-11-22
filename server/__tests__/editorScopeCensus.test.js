// server/__tests__/editorScopeCensus.test.js
//
// G1.13 (spec §6.1): the guard on the guard. Every write route on every mounted router either
// carries the closed-book middleware (`refuseClosedBookForNonAdmins`, marked `editorScopeGuard`) or
// is listed in server/lib/editorScopeExempt.js with a reason. A route in neither list fails here by
// name, so a write route added later cannot reach a closed book unnoticed. Spec §6.2: every route
// that runs requireBookAccess has a `:chapter` in its path, so the chapter check has a chapter.
//
// The census reads the routers' own stacks, the same objects index.js mounts through apiMounts.js,
// so it sees what Express runs, not what the source text suggests.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);

// Route modules read config at load; point any database they open at a throwaway path.
process.env.SESSIONS_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), 'editor-scope-census-')),
  'sessions.db'
);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const { API_MOUNTS } = require('../routes/apiMounts');
const views = require('../routes/views');
const { EDITOR_SCOPE_EXEMPT, ADMIN_ONLY } = require('../lib/editorScopeExempt');
const { refuseClosedBookForNonAdmins } = require('../lib/editorScope');
const { requireRole, requireBookAccess, ROLES } = require('../middleware/requireRole');

// The repository root, from this file's own location (never from the working directory).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const DEFAULT_MOUNTS = [...API_MOUNTS, { prefix: '', router: views }];
const READ_METHODS = new Set(['get', 'head']);

/** `<prefix><path>`, where a route path of `/` contributes nothing. */
const fullPath = (prefix, routePath) => prefix + (routePath === '/' ? '' : routePath) || '/';

/**
 * Walk each mounted router's stack. A route's handles are the path-less router-level middleware
 * registered before it plus its own stack entries for the method in question. A path-scoped
 * `router.use('/x', fn)` is not counted: it does not run for every request to every later route.
 *
 * @returns {{ routes: Array<{ key: string, path: string, handles: Function[] }>, unwalkable: string[] }}
 */
function walk(mounts) {
  const routes = [];
  const unwalkable = [];
  for (const { prefix, router } of mounts) {
    const routerLevel = [];
    router.stack.forEach((layer, index) => {
      if (!layer.route) {
        if (layer.handle && Array.isArray(layer.handle.stack)) {
          unwalkable.push(`nested router in ${prefix || '/'} (stack index ${index})`);
        } else if (layer.slash) {
          routerLevel.push(layer.handle);
        }
        return;
      }
      const route = layer.route;
      if (typeof route.path !== 'string') {
        unwalkable.push(`non-string route path in ${prefix || '/'} (stack index ${index})`);
        return;
      }
      const p = fullPath(prefix, route.path);
      for (const method of Object.keys(route.methods)) {
        if (method === '_all') {
          unwalkable.push(`ALL ${p}`);
          continue;
        }
        const own = route.stack.filter((s) => s.method === method).map((s) => s.handle);
        routes.push({
          key: `${method.toUpperCase()} ${p}`,
          method,
          path: p,
          handles: [...routerLevel, ...own],
        });
      }
    });
  }
  return { routes, unwalkable };
}

const writeRoutes = (mounts) => walk(mounts).routes.filter((r) => !READ_METHODS.has(r.method));
const isGuarded = (r) => r.handles.some((h) => h && h.editorScopeGuard);
const has = (exempt, key) => Object.prototype.hasOwnProperty.call(exempt, key);

/** Write routes that neither carry the guard nor are exempt. */
function unclassified(mounts = DEFAULT_MOUNTS, exempt = EDITOR_SCOPE_EXEMPT) {
  return writeRoutes(mounts)
    .filter((r) => !isGuarded(r) && !has(exempt, r.key))
    .map((r) => r.key);
}

/** `ADMIN_ONLY` exemptions whose route has no `requireRole('admin')` in front of it. */
function falseAdminOnly(mounts = DEFAULT_MOUNTS, exempt = EDITOR_SCOPE_EXEMPT) {
  return writeRoutes(mounts)
    .filter((r) => exempt[r.key] === ADMIN_ONLY)
    .filter((r) => !r.handles.some((h) => h && h.minimumRole === ROLES.ADMIN))
    .map((r) => r.key);
}

/** Exempt keys that name no write route. */
function staleExempt(mounts = DEFAULT_MOUNTS, exempt = EDITOR_SCOPE_EXEMPT) {
  const keys = new Set(writeRoutes(mounts).map((r) => r.key));
  return Object.keys(exempt).filter((k) => !keys.has(k));
}

/** Write routes that carry the guard and are exempt as well. */
function guardedAndExempt(mounts = DEFAULT_MOUNTS, exempt = EDITOR_SCOPE_EXEMPT) {
  return writeRoutes(mounts)
    .filter((r) => isGuarded(r) && has(exempt, r.key))
    .map((r) => r.key);
}

/** Layers the census cannot classify: nested routers, `.all` routes, non-string paths. */
function unwalkable(mounts = DEFAULT_MOUNTS) {
  return walk(mounts).unwalkable;
}

/** Routes of any method that run requireBookAccess without a `:chapter` in their path. */
function bookAccessWithoutChapter(mounts = DEFAULT_MOUNTS) {
  return walk(mounts)
    .routes.filter((r) => r.handles.some((h) => h && h.bookAccessGuard === true))
    .filter((r) => !/(^|\/):chapter(\/|$)/.test(r.path))
    .map((r) => r.key);
}

/** Every `require('./routes/…')` in a repo file. */
function routeRequiresIn(relPath) {
  const src = readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  return [...src.matchAll(/require\(\s*['"](\.\/routes\/[^'"]+)['"]\s*\)/g)].map((m) => m[1]);
}

const ok = (req, res) => res.end();
const planted = (router) => [{ prefix: '/api/planted', router }];

describe('editor scope route census (spec §6.1)', () => {
  it('every write route is guarded or exempt with a reason', () =>
    expect(unclassified()).toEqual([]));

  it('every admin-only exemption is admin-only in code', () =>
    expect(falseAdminOnly()).toEqual([]));

  it('no exempt key is stale, none is also guarded', () => {
    expect(staleExempt()).toEqual([]);
    expect(guardedAndExempt()).toEqual([]);
  });

  it('every exemption gives a reason', () =>
    expect(
      Object.entries(EDITOR_SCOPE_EXEMPT)
        .filter(([, reason]) => typeof reason !== 'string' || reason.trim() === '')
        .map(([key]) => key)
    ).toEqual([]));

  it('no nested router and no all-method route', () => expect(unwalkable()).toEqual([]));

  it('every route with requireBookAccess has :chapter in its path (spec §6.2)', () =>
    expect(bookAccessWithoutChapter()).toEqual([]));

  it('index.js mounts routers only through apiMounts and views', () =>
    expect(routeRequiresIn('server/index.js').sort()).toEqual([
      './routes/apiMounts',
      './routes/views',
    ]));
});

describe('editor scope route census: the controls', () => {
  it('control: a planted router with an unguarded POST is named', () => {
    const r = express.Router();
    r.post('/:book/x', ok);
    expect(unclassified(planted(r))).toEqual(['POST /api/planted/:book/x']);
  });

  it('control: the same route with the guard, or a path-less router-level guard, is not named', () => {
    const own = express.Router();
    own.post(
      '/:book/x',
      refuseClosedBookForNonAdmins((q) => q.params.book, 'param'),
      ok
    );
    const level = express.Router();
    level.use(refuseClosedBookForNonAdmins((q) => q.params.book, 'param'));
    level.post('/:book/x', ok);
    expect([unclassified(planted(own)), unclassified(planted(level))]).toEqual([[], []]);
  });

  it('control: a path-scoped router-level guard, or one on another method, does not count', () => {
    const scoped = express.Router();
    scoped.use(
      '/:book',
      refuseClosedBookForNonAdmins((q) => q.params.book, 'param')
    );
    scoped.post('/:book/x', ok);
    const otherMethod = express.Router();
    otherMethod
      .route('/:book/y')
      .get(
        refuseClosedBookForNonAdmins((q) => q.params.book, 'param'),
        ok
      )
      .post(ok);
    expect([...unclassified(planted(scoped)), ...unclassified(planted(otherMethod))]).toEqual([
      'POST /api/planted/:book/x',
      'POST /api/planted/:book/y',
    ]);
  });

  it('control: an admin-only key on a non-admin route is named', () => {
    const r = express.Router();
    r.post('/x', requireRole(ROLES.EDITOR), ok);
    r.post('/y', requireRole(ROLES.ADMIN), ok);
    const exempt = { 'POST /api/planted/x': ADMIN_ONLY, 'POST /api/planted/y': ADMIN_ONLY };
    expect(falseAdminOnly(planted(r), exempt)).toEqual(['POST /api/planted/x']);
  });

  it('control: a stale key and a guarded-and-exempt key are named', () => {
    const r = express.Router();
    r.post(
      '/guarded',
      refuseClosedBookForNonAdmins((q) => q.body.book, 'body'),
      ok
    );
    r.get('/read', ok);
    const exempt = {
      'POST /api/planted/guarded': 'a reason',
      'POST /api/planted/gone': 'a reason',
      'GET /api/planted/read': 'a reason',
    };
    expect([staleExempt(planted(r), exempt), guardedAndExempt(planted(r), exempt)]).toEqual([
      ['POST /api/planted/gone', 'GET /api/planted/read'],
      ['POST /api/planted/guarded'],
    ]);
  });

  it('control: a nested router and an all-method route are named', () => {
    const r = express.Router();
    r.use('/sub', express.Router());
    r.all('/any', ok);
    expect(unwalkable(planted(r))).toEqual([
      'nested router in /api/planted (stack index 0)',
      'ALL /api/planted/any',
    ]);
  });

  it('control: requireBookAccess on a route without :chapter is named, of any method', () => {
    const r = express.Router();
    r.get('/:book/list', requireBookAccess(), ok);
    r.post('/:book/:chapter/edit', requireBookAccess(), ok);
    r.post('/:book/:chapterNum/x', requireBookAccess(), ok);
    expect(bookAccessWithoutChapter(planted(r))).toEqual([
      'GET /api/planted/:book/list',
      'POST /api/planted/:book/:chapterNum/x',
    ]);
  });

  it('control: the route census sees the real routers (not an empty walk)', () => {
    const keys = writeRoutes(DEFAULT_MOUNTS).map((r) => r.key);
    expect(keys).toContain('POST /api/segment-editor/edit/:editId/comment');
  });
});
