/**
 * A book's slug is checked when the book is registered (logged 2026-10-25).
 *
 * The slug becomes directory names: registerBook creates books/<slug>/..., and a registration
 * that fetches its source writes books/<slug>/01-source/. Registration checked only that a slug
 * was present, so an admin-supplied slug holding `..` or `/` reached the filesystem, and so did
 * capitals, underscores and accents that no route or tool expects. A slug is now lowercase
 * letters, digits and single hyphens, which every slug in use already is (prod's six, the
 * config defaults, and the test fixtures registered through registerBook).
 *
 * Where it is checked: at the top of registerBook, before the catalogue lookup and anything
 * after it, so every caller is covered; and in POST /api/admin/books/register before its
 * duplicate check, so a bad slug is a 400 rather than "not registered, carry on". Pinning the
 * ORDER is what shows the hazard without running a real registration, which on the old code
 * would create directories outside books/ in this checkout.
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath() and the auth config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'book-slug-validation-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.ADMIN_USERS = '';
delete process.env.AUTO_CREATE_USERS;

const BOOKS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  'books'
);

// Every slug in use: prod's six registered books (read 2026-10-25), and the slugs the tests
// register through registerBook or the register route.
const IN_USE = [
  'edlisfraedi-2e',
  'efnafraedi-2e',
  'liffraedi-2e',
  'lifraen-efnafraedi',
  'orverufraedi',
  'stjornufraedi',
  'c1b-test-book',
  'c557-multer-fixture',
];

const REFUSED = [
  ['a parent-directory walk', '../c21e-escape'],
  ['a bare parent directory', '..'],
  ['a slash', 'efnafraedi-2e/01-source'],
  ['capitals', 'Efnafraedi-2e'],
  ['an underscore', 'efnafraedi_2e'],
  ['a double hyphen', 'efnafraedi--2e'],
  ['a leading hyphen', '-efnafraedi'],
  ['a trailing hyphen', 'efnafraedi-'],
  ['a dot', 'efnafraedi.2e'],
  ['a space', 'efnafraedi 2e'],
  ['an accented letter', 'efnafræði'],
  ['an empty string', ''],
  ['a list', ['efnafraedi-2e']],
  ['65 characters, past the limit', 'a'.repeat(65)],
];

let bookRegistration;
let openstaxCatalogue;
let server;
let base;
let adminToken;

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  bookRegistration = require('../services/bookRegistration');
  openstaxCatalogue = require('../services/openstaxCatalogue');
  const auth = require('../services/auth');
  const userService = require('../services/userService');

  // An admin, as the admin page creates one, signed in as authenticate() signs one in.
  const ms = {
    id: 'ms-oid-c21e-admin',
    displayName: 'Stjórnandi',
    mail: 'c21e-admin@skoli.example',
  };
  userService.createUser({
    providerId: ms.id,
    providerUsername: ms.mail,
    email: ms.mail,
    role: 'admin',
  });
  const roleInfo = auth.determineUserRole(ms);
  expect(roleInfo.role).toBe('admin');
  adminToken = auth.createToken({
    id: ms.id,
    username: ms.mail,
    name: ms.displayName,
    avatar: null,
    role: roleInfo.role,
    books: roleInfo.books,
  });

  const express = require('express');
  const cookieParser = require('cookie-parser');
  const { errorHandler } = require('../middleware/errorHandler');
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/admin', require('../routes/admin'));
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

describe('the slug rule', () => {
  it('accepts 64 characters, the limit', () => {
    expect(bookRegistration.isValidBookSlug('a'.repeat(64))).toBe(true);
  });
  for (const slug of IN_USE) {
    it(`accepts ${slug}, a slug in use`, () => {
      expect(bookRegistration.isValidBookSlug(slug)).toBe(true);
    });
  }
  for (const [what, slug] of REFUSED) {
    it(`refuses ${what}`, () => {
      expect(bookRegistration.isValidBookSlug(slug)).toBe(false);
    });
  }
});

describe('registerBook refuses a bad slug before anything else runs', () => {
  it('throws InvalidSlugError before the catalogue lookup, and creates no directory', async () => {
    const lookup = vi.spyOn(openstaxCatalogue, 'getCatalogueEntry');
    try {
      await expect(
        bookRegistration.registerBook({
          catalogueSlug: 'chemistry-2e',
          slug: '../c21e-escape',
          titleIs: 'Prófun',
          registeredBy: 'u-test',
        })
      ).rejects.toMatchObject({ name: 'InvalidSlugError' });
      expect(lookup).not.toHaveBeenCalled();
      expect(existsSync(path.join(BOOKS_DIR, '../c21e-escape'))).toBe(false);
    } finally {
      lookup.mockRestore();
    }
  });
});

describe('POST /api/admin/books/register', () => {
  async function register(slug, catalogueSlug = 'chemistry-2e') {
    const res = await fetch(`${base}/api/admin/books/register`, {
      method: 'POST',
      body: JSON.stringify({ catalogueSlug, slug, titleIs: 'Prófun' }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  it('refuses a bad slug with 400 before the duplicate check or the registration runs', async () => {
    const registered = vi.spyOn(bookRegistration, 'isBookRegistered');
    const registers = vi.spyOn(bookRegistration, 'registerBook');
    try {
      const res = await register('../c21e-escape');
      expect([
        res.status,
        res.json?.error,
        registered.mock.calls.length,
        registers.mock.calls.length,
      ]).toEqual([400, 'Invalid slug', 0, 0]);
    } finally {
      registered.mockRestore();
      registers.mockRestore();
    }
  });

  it('lets a good slug past the check to the registration (the control)', async () => {
    // An empty catalogue in this database: the registration's own lookup answers 404.
    const res = await register('c21e-good-slug', 'no-such-catalogue');
    expect([res.status, res.json?.error]).toEqual([404, 'Not found']);
  });
});
