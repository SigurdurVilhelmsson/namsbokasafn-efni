/**
 * The head editor's book glossary page (design §5.3): who is served the view, and the page script's
 * one rendering rule.
 *
 * The page shows reasons, sources, Icelandic terms, names and excerpts of editors' text, and CSP
 * allows inline script, so building every server-supplied value with textContent is the only
 * control. The E2E spec (server/e2e/book-glossary.spec.js) pins it in a browser; the static check
 * here is the second line, and it carries its own control so that a check matching nothing cannot
 * read as a pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'book-glossary-page-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

let server;
let base;
let createToken;

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));
  const app = express();
  app.use(cookieParser());
  app.use('/', require('../routes/views'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

function cookieFor(role, books = []) {
  const token = createToken({
    id: `enginn-reikningur-${role}`,
    username: `${role}@skoli.example`,
    name: role,
    role,
    books,
  });
  return `auth_token=${token}`;
}

const SESSIONS = {
  editor: () => cookieFor('editor'),
  'a head editor': () => cookieFor('head-editor', ['efnafraedi-2e']),
  'an admin': () => cookieFor('admin'),
};

async function page(session) {
  const res = await fetch(base + '/book-glossary', {
    headers: { cookie: SESSIONS[session]() },
    redirect: 'manual',
  });
  return { status: res.status, location: res.headers.get('location'), body: await res.text() };
}

describe('the page', () => {
  it('an editor is sent to Heim', async () => {
    const { status, location } = await page('editor');
    expect({ status, location }).toEqual({ status: 302, location: '/' });
  });

  it.each(['a head editor', 'an admin'])('%s gets the page', async (session) => {
    const { status, body } = await page(session);
    expect({ status, script: body.includes('/js/book-glossary.js') }).toEqual({
      status: 200,
      script: true,
    });
  });
});

const SINK =
  /innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser|srcdoc|setAttribute\(\s*['"]on/g;
// Exactly this text, statement end included, so `innerHTML = '' + x` is still a sink.
const ALLOWED = "innerHTML = '';";

/** Every HTML sink in a script's code (comments stripped) other than the text `innerHTML = '';`. */
function sinks(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return [...code.matchAll(SINK)]
    .filter((m) => !code.startsWith(ALLOWED, m.index))
    .map((m) => code.slice(m.index, m.index + 40).split('\n')[0]);
}

describe('the page script', () => {
  it('the sink check flags a planted sink and nothing else (control)', () => {
    const planted = [
      "list.innerHTML = '';",
      '// row.innerHTML = reason;',
      '/* row.outerHTML = reason; */',
      'row.innerHTML = reason;',
      // Starts like the one permitted text, and is not it.
      "row.innerHTML = '' + x;",
    ].join('\n');
    expect(sinks(planted)).toEqual(['innerHTML = reason;', "innerHTML = '' + x;"]);
  });

  it('book-glossary.js uses no HTML sink', () => {
    const file = path.join(here, '..', 'public', 'js', 'book-glossary.js');
    expect(sinks(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
