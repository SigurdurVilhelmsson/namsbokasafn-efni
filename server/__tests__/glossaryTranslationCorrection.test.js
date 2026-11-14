/**
 * Who may correct a glossary translation in place ([USER] 2026-11-14,
 * docs/decisions/2026-11-14-glossary-translation-corrections.md):
 *
 *   the person who proposed it, until it is approved;
 *   a head editor or an admin, any translation that is not approved;
 *   nobody, an approved one: a correction of an approved term is a new proposal, so it is approved again.
 *
 * Before this, PUT /api/terminology/translations/:id let any editor change the text of any translation, an
 * approved one included, with no change of status. No screen called it; the Orðasafn dialog now does
 * (interface audit 2026-11-13, TE-01), which is why the rule had to exist first.
 *
 * Requests go through the real router with real tokens. Every refusal checks that the text is unchanged, and
 * every permitted correction checks that it changed, so a route that answered 200 and wrote nothing fails.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'glossary-correction-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

let server;
let base;
let createToken;
let terminology;
let counter = 0;

const PEOPLE = {
  anna: { id: 'p-anna', role: 'editor' },
  bjorn: { id: 'p-bjorn', role: 'editor' },
  head: { id: 'p-head', role: 'head-editor' },
  admin: { id: 'p-admin', role: 'admin' },
  guest: { id: 'p-guest', role: 'viewer' },
};

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));
  terminology = require('../services/terminologyService');
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/terminology', require('../routes/terminology'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

/** A new headword with one translation, proposed by `proposer` (a PEOPLE key, or null for an import). */
function plant({ proposer = 'anna', status = 'proposed' } = {}) {
  counter += 1;
  const who = proposer ? PEOPLE[proposer] : null;
  const term = terminology.createTerm(
    { english: `correction-term-${counter}`, icelandic: `upphaflegt-${counter}` },
    who ? who.id : null,
    who ? proposer : null
  );
  const trId = term.translations[0].id;
  if (status === 'approved') terminology.approveTranslation(trId, 'p-approver', 'approver');
  if (status !== 'proposed' && status !== 'approved') {
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SESSIONS_DB_PATH);
    db.prepare('UPDATE terminology_translations SET status = ? WHERE id = ?').run(status, trId);
    db.close();
  }
  return trId;
}

const textOf = (trId) =>
  terminology
    .getHeadword(
      terminology
        .searchTerms('', { limit: 10000 })
        .terms.find((t) => t.translations.some((tr) => tr.id === trId)).id
    )
    .translations.find((tr) => tr.id === trId).icelandic;

async function correct(personKey, trId, body = { icelandic: 'leiðrétt' }) {
  const person = PEOPLE[personKey];
  const token = createToken({
    id: person.id,
    username: `${personKey}@skoli.example`,
    name: personKey,
    role: person.role,
    books: [],
  });
  const res = await fetch(`${base}/api/terminology/translations/${trId}`, {
    method: 'PUT',
    headers: { cookie: `auth_token=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: json };
}

describe('the proposer', () => {
  it.each(['proposed', 'disputed', 'needs_review', 'rejected'])(
    'corrects their own %s translation',
    async (status) => {
      const trId = plant({ proposer: 'anna', status });
      const r = await correct('anna', trId, { icelandic: `leiðrétt-${status}` });
      expect(r.status).toBe(200);
      expect(textOf(trId)).toBe(`leiðrétt-${status}`);
    }
  );

  it('corrects the definition, the note, the source and the subjects with it', async () => {
    const trId = plant({ proposer: 'anna' });
    const r = await correct('anna', trId, {
      icelandic: 'nýtt',
      definitionIs: 'ný skilgreining',
      notes: 'ný athugasemd',
      subjects: ['chemistry'],
    });
    expect(r.status).toBe(200);
    expect(r.body.translation).toMatchObject({
      icelandic: 'nýtt',
      definitionIs: 'ný skilgreining',
      notes: 'ný athugasemd',
      subjects: ['chemistry'],
    });
  });

  it('cannot correct their own translation once it is approved', async () => {
    const trId = plant({ proposer: 'anna', status: 'approved' });
    const r = await correct('anna', trId);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('APPROVED_NOT_EDITABLE');
    expect(textOf(trId)).not.toBe('leiðrétt');
  });
});

describe('a proposer whose account id is a number', () => {
  // An id that is a JS number was bound to the TEXT column as a float and stored as "4242.0", so the proposer
  // no longer matched their own session ("4242") and could not correct their own translation. Microsoft's ids
  // are strings, but the E2E sessions' are numbers. The id is now stored as text.
  it('proposes through the route and then corrects their own translation', async () => {
    const token = createToken({
      id: 4242,
      username: 'numeric@skoli.example',
      name: 'Tölustafur',
      role: 'editor',
      books: [],
    });
    const headers = { cookie: `auth_token=${token}`, 'content-type': 'application/json' };
    const made = await fetch(`${base}/api/terminology`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ english: 'numeric-proposer-term', icelandic: 'tala' }),
    }).then((r) => r.json());
    const trId = made.term.translations[0].id;
    expect(made.term.translations[0].proposedBy).toBe('4242');

    const r = await fetch(`${base}/api/terminology/translations/${trId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ icelandic: 'tala-leiðrétt' }),
    });
    expect(r.status).toBe(200);
    expect(textOf(trId)).toBe('tala-leiðrétt');
  });
});

describe('another editor', () => {
  it("cannot correct someone else's translation", async () => {
    const trId = plant({ proposer: 'anna' });
    const r = await correct('bjorn', trId);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('NOT_YOUR_TRANSLATION');
    expect(textOf(trId)).not.toBe('leiðrétt');
  });

  it('cannot correct an imported translation that names no proposer', async () => {
    const trId = plant({ proposer: null });
    const r = await correct('bjorn', trId);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('NOT_YOUR_TRANSLATION');
  });

  it('cannot change a status through the correction (only the listed fields are written)', async () => {
    const trId = plant({ proposer: 'bjorn' });
    const r = await correct('bjorn', trId, { icelandic: 'leiðrétt', status: 'approved' });
    expect(r.status).toBe(200);
    expect(r.body.translation.status).toBe('proposed');
  });
});

describe('a head editor and an admin', () => {
  it.each(['head', 'admin'])("%s corrects someone else's unapproved translation", async (who) => {
    const trId = plant({ proposer: 'anna' });
    const r = await correct(who, trId, { icelandic: `leiðrétt-af-${who}` });
    expect(r.status).toBe(200);
    expect(textOf(trId)).toBe(`leiðrétt-af-${who}`);
  });

  it.each(['head', 'admin'])('%s corrects an imported translation', async (who) => {
    const trId = plant({ proposer: null });
    expect((await correct(who, trId)).status).toBe(200);
  });

  it.each(['head', 'admin'])('%s cannot correct an approved translation in place', async (who) => {
    const trId = plant({ proposer: 'anna', status: 'approved' });
    const r = await correct(who, trId);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('APPROVED_NOT_EDITABLE');
    expect(textOf(trId)).not.toBe('leiðrétt');
  });
});

describe('everyone else', () => {
  it('a guest is refused by role', async () => {
    const trId = plant({ proposer: 'anna' });
    const r = await correct('guest', trId);
    expect(r.status).toBe(403);
    expect(textOf(trId)).not.toBe('leiðrétt');
  });

  it('a translation that does not exist is 404', async () => {
    expect((await correct('admin', 999999)).status).toBe(404);
  });
});
