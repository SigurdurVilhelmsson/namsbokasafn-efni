/**
 * T1, the integrity set (G1.1; spec §10 T1, §5.3; plan decision 17, Task 6).
 *
 * The committed layer 2 (books/efnafraedi-2e/02-mt-revised/<chDir>/<stem>-changes.jsonl) records,
 * for every change the AI pass made, the hash of the text it read (`beforeSha256`). A chain is the
 * change records of one (chDir, module, segmentId, occurrence); its FIRST record's beforeSha256 is
 * what the AI read. This test serves every module that has a chain through the real module route
 * and compares that hash with the `is_sha256` the route minted. The chains that differ are exactly the
 * ten second-occurrence (`#1`) chains of the ids G1.12 de-duplicated: the English now holds each of
 * those ids once, so only occurrence 0 is served, with the FIRST Icelandic copy, and every `#0` chain
 * matches. The AI pass read the second copy too (layer 2 keeps both chains), so each `#1` chain has
 * no served occurrence left to match. A new member must be classified before it is added here.
 *
 * Read-only on books/: the books dir is NOT overridden, and nothing here writes a file. The
 * database is a temp SESSIONS_DB_PATH.
 *
 * A missing minted row is a mismatch, never a fallback, so the test cannot pass on a route that
 * mints nothing. Only ch00 (the route refuses chapter 0, validateParams.js) and an id the response
 * itself shows duplicated (no row by design; none in chemistry since G1.12) use the row builder on the
 * loader's output.
 */
import fs from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'served-integrity-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { handlerFor, invoke, EDITOR } = require('./helpers/servedFixture');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOK = 'efnafraedi-2e';
const BOOKS = path.join(__dirname, '..', '..', 'books');
const LAYER2 = path.join(BOOKS, BOOK, '02-mt-revised');

// Chains: committed layer 2, books/efnafraedi-2e/02-mt-revised/<chDir>/<stem>-changes.jsonl. A chain is the
// change records of one (chDir, module, segmentId, occurrence); its first record's beforeSha256 is what the AI read.
const chapterOf = (chDir) => (chDir === 'appendices' ? -1 : parseInt(chDir.slice(2), 10)); // appendices load as -1
const keyOf = (c) => `${c.chDir}/${c.module}/${c.segmentId}#${c.occurrence}`;

/** key → the first record of its chain, in file order. */
function firstRecords() {
  const chains = new Map();
  for (const chDir of fs.readdirSync(LAYER2).sort()) {
    for (const f of fs.readdirSync(path.join(LAYER2, chDir)).sort()) {
      if (!f.endsWith('-changes.jsonl')) continue;
      for (const line of fs.readFileSync(path.join(LAYER2, chDir, f), 'utf8').split('\n')) {
        if (!line) continue;
        const c = { chDir, ...JSON.parse(line) };
        if (!chains.has(keyOf(c))) chains.set(keyOf(c), c);
      }
    }
  }
  return chains;
}

/** The 0-based occurrence of each segment among those with its id, counted here, not by the code under test. */
function withOccurrence(segments) {
  const seen = new Map();
  return segments.map((s) => {
    const occurrence = seen.get(s.segmentId) || 0;
    seen.set(s.segmentId, occurrence + 1);
    return {
      seg: s,
      occurrence,
      duplicated: segments.filter((t) => t.segmentId === s.segmentId).length > 1,
    };
  });
}

let realBooksDirAtStart;
let segmentParser;
let servedVersions;
let get;
let reader;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  servedVersions = require('../services/servedVersions');
  realBooksDirAtStart = segmentParser.BOOKS_DIR;
  get = handlerFor(require('../routes/segment-editor'), 'get', '/:book/:chapter/:moduleId');
  reader = new Database(dbPath, { readonly: true });
});

afterAll(() => {
  reader.close();
  rmSync(work, { recursive: true, force: true });
});

describe('T1: the committed layer-2 chains against the served versions (spec §10 T1)', () => {
  it(
    'T1: the chains whose first beforeSha256 differs from G1.1’s is_sha256 are exactly the ten unserved #1 chains (G1.12)',
    { timeout: 120_000 },
    async () => {
      // the real tree, not a temp root
      expect(path.resolve(realBooksDirAtStart)).toBe(path.resolve(BOOKS));
      const chains = firstRecords();
      const allKeys = [...chains.keys()];
      const mismatched = new Set();
      const matched = new Set();
      const matchedByRow = new Set(); // through the row the route minted
      const matchedByBuilder = new Set(); // through the row builder on the loader's output
      const bodyDisagrees = [];
      const rowFor = reader.prepare(
        `SELECT is_sha256 FROM served_text_versions
          WHERE book = ? AND chapter = ? AND module_id = ? AND segment_id = ? AND occurrence = ?`
      );

      const byModule = new Map();
      for (const c of chains.values()) {
        const m = `${c.chDir}/${c.module}`;
        if (!byModule.has(m)) byModule.set(m, []);
        byModule.get(m).push(c);
      }

      for (const list of byModule.values()) {
        const { chDir, module } = list[0];
        const chapter = chapterOf(chDir);
        const key = { book: BOOK, chapter, moduleId: module };
        const builder = () => {
          const { rows } = servedVersions.versionRowsFor(
            segmentParser.loadModuleForEditing(BOOK, chapter, module),
            key
          );
          return (c) =>
            rows.find((r) => r.segmentId === c.segmentId && r.occurrence === c.occurrence)
              ?.isSha256 ?? null;
        };
        let served = null;
        let built = null;
        if (chDir !== 'ch00') {
          const out = await invoke(get, {
            params: {
              book: BOOK,
              chapter: chDir === 'appendices' ? 'appendices' : String(chapter),
              moduleId: module,
            },
            chapterNum: chapter,
            user: EDITOR,
          });
          expect(out.status, `${chDir}/${module}`).toBe(200);
          served = withOccurrence(out.body.segments);
        }
        for (const c of list) {
          let isSha256;
          let byBuilder = false;
          const entry = served?.find(
            (e) => e.seg.segmentId === c.segmentId && e.occurrence === c.occurrence
          );
          const duplicated = served?.some((e) => e.seg.segmentId === c.segmentId && e.duplicated);
          if (chDir === 'ch00' || duplicated) {
            built ??= builder();
            isSha256 = built(c);
            byBuilder = true;
          } else {
            const row = rowFor.get(BOOK, chapter, module, c.segmentId, c.occurrence);
            isSha256 = row ? row.is_sha256 : null; // a missing row is a mismatch, never a fallback
            if (!entry || entry.seg.baseSha256 !== isSha256) bodyDisagrees.push(keyOf(c));
          }
          if (isSha256 !== null && isSha256 === c.beforeSha256) {
            matched.add(keyOf(c));
            (byBuilder ? matchedByBuilder : matchedByRow).add(keyOf(c));
          } else mismatched.add(keyOf(c));
        }
      }

      // The second-occurrence chains of the ten segments G1.12 de-duplicated: their occurrence is no
      // longer served (the English holds the id once), so no minted row exists for them.
      const UNSERVED = [
        'ch05/m68726/m68726:para:fs-idm5945296#1',
        'ch05/m68726/m68726:para:fs-idm94618544#1',
        'ch07/m68742/m68742:para:fs-idp55819408#1',
        'ch08/m68744/m68744:para:fs-idp204958944#1',
        'ch08/m68747/m68747:para:fs-idm171143328#1',
        'ch08/m68747/m68747:para:fs-idm99049568#1',
        'ch10/m68761/m68761:para:fs-idm91556848#1',
        'ch10/m68768/m68768:para:fs-idm44101792#1',
        'ch10/m68773/m68773:para:fs-idp76470512#1',
        'ch21/m68851/m68851:para:fs-idm46993968#1',
      ];
      expect([...mismatched].sort()).toEqual(UNSERVED);
      // Value controls (PR1 review C22; every key is in exactly one of the two sets, so comparing matched with the
      // complement of mismatched could not fail). The rows the route minted decide nearly every chain: a route
      // whose response showed every id duplicated would send them all through the builder, which reads no row,
      // and fail here. Since G1.12 no chemistry id is duplicated, so the builder decides only ch00.
      expect(matchedByRow.size).toBeGreaterThan(allKeys.length * 0.9);
      expect(matchedByBuilder.size).toBeGreaterThan(0);
      expect([...matchedByBuilder].filter((k) => !k.startsWith('ch00/'))).toEqual([]);
      // Each unserved chain's #0 sibling is served, minted and matched (the first copy, G1.12).
      expect([...matchedByRow]).toEqual(
        expect.arrayContaining(UNSERVED.map((k) => k.replace(/#1$/, '#0')))
      );
      // the matched set includes chapter metadata, an appendix and ch00
      expect([...matched]).toEqual(
        expect.arrayContaining([
          'ch02/chapter-metadata/chapter:title:ch02#0',
          'appendices/m68860/m68860:para:fs-idm37591248#0',
          'ch00/m68662/m68662:para:pref-p-009#0',
        ])
      );
      // the response's own baseSha256 is the minted hash for every served chain; an unserved occurrence
      // has no entry and no row, so it disagrees — exactly the ten above
      expect(bodyDisagrees.sort()).toEqual(UNSERVED);
    }
  );
});
