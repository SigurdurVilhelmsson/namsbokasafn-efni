import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('../__tests__/helpers/freshMigratedDb');
const { seedBooks } = require('../scripts/lib/scratchCorpus');
const { seedC24Concepts } = require('../__tests__/helpers/seedC24Concepts');
const terminologyService = require('../services/terminologyService');
const { buildScope, resolve } = require('../lib/conceptResolver');
const { collectFiringRows } = require('../scripts/read-firing-rows');

const BOOK = 'efnafraedi-2e';
const SCRIPT = path.join(__dirname_of(import.meta.url), '..', 'scripts', 'read-firing-rows.js');
function __dirname_of(url) {
  return path.dirname(new URL(url).pathname);
}

const segments = JSON.parse(
  readFileSync(new URL('./fixtures/c24-segments.json', import.meta.url), 'utf-8')
);

function seededDb() {
  const fresh = freshMigratedDb();
  const realLog = console.log;
  console.log = () => {}; // seedBooks narrates to stdout
  try {
    seedBooks(fresh.db);
  } finally {
    console.log = realLog;
  }
  seedC24Concepts(fresh.db);
  return fresh;
}

const loadSegments = () => [{ moduleId: 'm001', segments }];

const tmpDirs = [];
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

/** A books dir with one chapter of `copies` repetitions of the fixture segments. */
function makeBooksDir(copies) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'c19-census-'));
  tmpDirs.push(root);
  const chDir = path.join(root, BOOK, '02-for-mt', 'ch01');
  mkdirSync(chDir, { recursive: true });
  let body = '';
  for (let c = 0; c < copies; c++) {
    segments.forEach((s, i) => {
      body += `<!-- SEG:m001:para:fs-c${c}-${i} -->\n${s.enContent}\n\n`;
    });
  }
  writeFileSync(path.join(chDir, 'm001-segments.en.md'), body);
  return root;
}

function runCli(dbPath, booksDir) {
  return spawnSync('node', [SCRIPT, BOOK, '--books-dir', booksDir], {
    env: { ...process.env, SESSIONS_DB_PATH: dbPath },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** The production way: `node - <book>` from server/scripts, the source on stdin. */
function runCliStdin(dbPath, booksDir) {
  return spawnSync('node', ['-', BOOK, '--books-dir', booksDir], {
    cwd: path.dirname(SCRIPT),
    input: readFileSync(SCRIPT),
    env: { ...process.env, SESSIONS_DB_PATH: dbPath },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

let fresh;
let db;
let result;
beforeAll(() => {
  fresh = seededDb();
  db = fresh.db;
  terminologyService._setTestDb(db);
  result = collectFiringRows({ db, book: BOOK, chapters: [1], loadSegments });
});

describe('collectFiringRows', () => {
  it('finds rows at all (the control)', () => {
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('puts every match findTermsInSegments returns into exactly one row', () => {
    const direct = terminologyService.findTermsInSegments(segments, BOOK, 1);
    const expected = Object.entries(direct)
      .flatMap(([segmentId, r]) => r.matches.map(() => segmentId))
      .sort();
    const got = result.rows.flatMap((r) => r.matches.map((m) => m.segmentId)).sort();
    expect(got).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it('records chapter and module on each match', () => {
    const m = result.rows[0].matches[0];
    expect({ chapter: m.chapter, moduleId: m.moduleId }).toEqual({ chapter: 1, moduleId: 'm001' });
  });

  it('flags a fallback match isFallback: true', () => {
    const direct = terminologyService.findTermsInSegments(segments, BOOK, 1);
    const fb = Object.values(direct)
      .flatMap((r) => r.matches)
      .find((m) => m.isFallback);
    expect(fb).toBeDefined();
    const row = result.rows.find((r) => r.english === fb.english && r.icelandic === fb.icelandic);
    expect(row.isFallback).toBe(true);
  });

  it('flags a tied match isTied: true with a null icelandic', () => {
    const tdb = freshMigratedDb().db;
    const realLog = console.log;
    console.log = () => {};
    try {
      seedBooks(tdb);
    } finally {
      console.log = realLog;
    }
    for (const is of ['alfa', 'beta']) {
      const cid = Number(
        tdb.prepare("INSERT INTO concept (domain) VALUES ('chemistry')").run().lastInsertRowid
      );
      tdb
        .prepare(
          "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', 'tiedword', 1, 'fixture')"
        )
        .run(cid);
      tdb
        .prepare(
          "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, 1, 'fixture')"
        )
        .run(cid, is);
    }
    terminologyService._setTestDb(tdb);
    try {
      const out = collectFiringRows({
        db: tdb,
        book: BOOK,
        chapters: [1],
        loadSegments: () => [
          {
            moduleId: 'm9',
            segments: [{ segmentId: 'm9:p:1', enContent: 'A tiedword here.', isContent: '' }],
          },
        ],
      });
      const row = out.rows.find((r) => r.english === 'tiedword');
      expect(row).toMatchObject({ isTied: true, icelandic: null });
    } finally {
      terminologyService._setTestDb(db);
      tdb.close();
    }
  });

  it('gives each row the reason the resolver gives', () => {
    const scope = buildScope(db, BOOK, 1);
    const mismatches = result.rows.filter(
      (r) => r.reason !== (resolve(scope, r.english).reason ?? null)
    );
    expect(mismatches.map((r) => r.english)).toEqual([]);
  });

  it('writes nothing to the filesystem', () => {
    const spies = ['writeFileSync', 'mkdirSync', 'appendFileSync'].map((n) => vi.spyOn(fs, n));
    try {
      collectFiringRows({ db, book: BOOK, chapters: [1], loadSegments });
      expect(spies.map((s) => s.mock.calls.length)).toEqual([0, 0, 0]);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

describe('read-firing-rows CLI', () => {
  it('prints one complete JSON document through a pipe even beyond 64 KB', () => {
    const booksDir = makeBooksDir(40);
    fresh.db.pragma('wal_checkpoint(TRUNCATE)');
    const r = runCli(fresh.path, booksDir);
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(64 * 1024);
    const doc = JSON.parse(r.stdout);
    expect(doc.schema).toBe('c19-census/1');
    expect(doc.rows.length).toBeGreaterThan(0);
  });

  it('keeps log lines out of stdout when the book has no domain priorities', () => {
    const bare = freshMigratedDb();
    bare.db.prepare('DELETE FROM book_domain_priority').run(); // the matcher's warn-logging path
    bare.db.close();
    const booksDir = makeBooksDir(1);
    const r = runCli(bare.path, booksDir);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).rows).toEqual([]);
  });

  it('runs exactly the production way: node - <book> with the source on stdin', () => {
    const booksDir = makeBooksDir(1);
    fresh.db.pragma('wal_checkpoint(TRUNCATE)');
    const r = runCliStdin(fresh.path, booksDir);
    expect(r.status).toBe(0);
    const doc = JSON.parse(r.stdout);
    expect(doc.schema).toBe('c19-census/1');
    expect(doc.rows.length).toBeGreaterThan(0);
  });

  it('keeps log lines out of stdout under node - too', () => {
    const bare = freshMigratedDb();
    bare.db.prepare('DELETE FROM book_domain_priority').run();
    bare.db.close();
    const r = runCliStdin(bare.path, makeBooksDir(1));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).rows).toEqual([]);
  });
});
