/**
 * T1, the integrity set (G1.1; spec §10 T1, §5.3; plan decision 17, Task 6).
 *
 * The committed layer 2 (books/efnafraedi-2e/02-mt-revised/<chDir>/<stem>-changes.jsonl) records,
 * for every change the AI pass made, the hash of the text it read (`beforeSha256`). A chain is the
 * change records of one (chDir, module, segmentId, occurrence); its FIRST record's beforeSha256 is
 * what the AI read. This test serves every module that has a chain through the real module route
 * and compares that hash with the `is_sha256` the route minted. The chains that differ fall in two
 * classes. (1) Second-occurrence (`#1`) chains of the ids G1.12 de-duplicated: the English now holds
 * each of those ids once, so only occurrence 0 is served, with the FIRST Icelandic copy. The AI pass
 * read the second copy too (layer 2 keeps both chains), so each `#1` chain has no served occurrence
 * left to match. (2) `#0` chains whose segment Fable changed: the editor serves the Fable layer
 * (02-mt-fable), so the minted `is_sha256` is the hash of Fable's text, and the chain's segment has a
 * line in that unit's `<m>-tags.jsonl` (same segmentId and occurrence) whose `afterSha256` equals the
 * minted hash. Fable's base includes the 02-mt-selected overlay, so the chains that once formed a
 * separate overlay class belong here. An unclassified difference fails the test: a new member must be
 * classified before it is added.
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

/** segmentId#occurrence → that unit's tags line, from the committed Fable layer. */
const tagsCache = new Map();
function fableTagLine(c) {
  const file = path.join(BOOKS, BOOK, '02-mt-fable', c.chDir, `${c.module}-tags.jsonl`);
  if (!tagsCache.has(file)) {
    const m = new Map();
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        const t = JSON.parse(line);
        m.set(`${t.segmentId}#${t.occurrence}`, t);
      }
    }
    tagsCache.set(file, m);
  }
  return tagsCache.get(file).get(`${c.segmentId}#${c.occurrence}`);
}

/**
 * The class of a differing chain, or null when unclassified. `minted` is the is_sha256 the serve
 * minted (null when no row). Class 'fable-changed' is the predicate of the header's class (2).
 */
function classify(c, minted, repeats, tagLine = fableTagLine) {
  if (repeats.includes(keyOf(c))) return 'g112-repeat';
  const t = tagLine(c);
  if (t && minted !== null && minted === t.afterSha256) return 'fable-changed';
  return null;
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
    'T1: the chains whose first beforeSha256 differs from G1.1’s is_sha256 are exactly the classified chains (G1.12 repeats; Fable-changed)',
    { timeout: 120_000 },
    async () => {
      // the real tree, not a temp root
      expect(path.resolve(realBooksDirAtStart)).toBe(path.resolve(BOOKS));
      const chains = firstRecords();
      const mismatched = new Set();
      const mintedOf = new Map(); // key → the is_sha256 the serve minted (null when none)
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
          mintedOf.set(keyOf(c), isSha256);
          if (isSha256 !== null && isSha256 === c.beforeSha256) {
            matched.add(keyOf(c));
            (byBuilder ? matchedByBuilder : matchedByRow).add(keyOf(c));
          } else mismatched.add(keyOf(c));
        }
      }

      // (1) Second-occurrence chains of ids G1.12 de-duplicated: their occurrence is no longer served
      // (the English holds the id once), so no minted row exists for them.
      const UNSERVED_G112_REPEATS = [
        'ch05/m68726/m68726:para:fs-idm5945296#1',
        'ch05/m68726/m68726:para:fs-idm94618544#1',
        'ch07/m68742/m68742:para:fs-idp55819408#1',
        'ch10/m68761/m68761:para:fs-idm91556848#1',
        'ch10/m68768/m68768:para:fs-idm44101792#1',
        'ch10/m68773/m68773:para:fs-idp76470512#1',
      ];
      // (2) The five chains that were built on the layer-1s overlay (ch08, ch21) before the editor served
      // Fable. Measured: the Fable base includes the overlay, so each is a 'fable-changed' chain now.
      const FORMER_OVERLAY_CHAINS = [
        'ch08/m68744/m68744:para:fs-idp92007424#0',
        'ch21/m68852/m68852:alt:fs-idp74884384-alt#0',
        'ch21/m68852/m68852:para:fs-idm5999248#0',
        'ch21/m68852/m68852:para:fs-idp1433408#0',
        'ch21/m68856/m68856:para:fs-idm211204656#0',
      ];
      const classes = { 'g112-repeat': [], 'fable-changed': [], unclassified: [] };
      for (const k of mismatched) {
        classes[
          classify(chains.get(k), mintedOf.get(k), UNSERVED_G112_REPEATS) ?? 'unclassified'
        ].push(k);
      }
      expect(classes.unclassified.sort()).toEqual([]);
      expect(classes['g112-repeat'].sort()).toEqual([...UNSERVED_G112_REPEATS].sort());
      // an expected-non-empty class, so a classifier that classifies nothing cannot pass
      expect(classes['fable-changed'].length).toBeGreaterThan(0);
      expect(classes['fable-changed']).toEqual(expect.arrayContaining(FORMER_OVERLAY_CHAINS));
      // Value controls, read from the DB rows the route minted, never from the builder. Every
      // Fable-changed chain's row must equal its tags line's afterSha256 (what the editor serves),
      // and every chain matched through a row must equal its beforeSha256 (what the AI read). Both
      // populations are non-empty, so a route that mints nothing, or hashes the MT text, goes red.
      const rowOf = (k) => {
        const c = chains.get(k);
        return rowFor.get(BOOK, chapterOf(c.chDir), c.module, c.segmentId, c.occurrence)?.is_sha256;
      };
      // (ch00 is never served by the route, so it has no row to read; it is the builder's.)
      const fableRows = classes['fable-changed'].filter((k) => !k.startsWith('ch00/'));
      expect(fableRows.length).toBeGreaterThan(0);
      expect(matchedByRow.size).toBeGreaterThan(0);
      for (const k of fableRows) {
        expect(rowOf(k), k).toBe(fableTagLine(chains.get(k)).afterSha256);
      }
      for (const k of matchedByRow) {
        expect(rowOf(k), k).toBe(chains.get(k).beforeSha256);
      }
      // The builder decides only ch00; its chains classify through the builder's own Fable hash.
      expect([...matchedByBuilder].filter((k) => !k.startsWith('ch00/'))).toEqual([]);
      expect(classes['fable-changed'].some((k) => k.startsWith('ch00/'))).toBe(true);
      // Each G1.12 repeat's #0 sibling is served and minted (the first copy, G1.12): it has a row, and it
      // is either matched or Fable-changed, never unclassified.
      for (const k of UNSERVED_G112_REPEATS.map((r) => r.replace(/#1$/, '#0'))) {
        expect(rowOf(k), k).toBeTruthy();
        expect(matched.has(k) || classes['fable-changed'].includes(k), k).toBe(true);
      }
      // the chains include chapter metadata, an appendix and ch00, each matched or Fable-changed
      for (const k of [
        'ch02/chapter-metadata/chapter:title:ch02#0',
        'appendices/m68860/m68860:para:fs-idm37591248#0',
        'ch00/m68662/m68662:para:pref-p-009#0',
      ]) {
        expect(matched.has(k) || classes['fable-changed'].includes(k), k).toBe(true);
      }
      // the response's own baseSha256 is the minted hash for every served chain; an unserved occurrence
      // has no entry and no row, so it disagrees — exactly the G1.12 repeats above. The Fable-changed class
      // is served: its entry and its row agree with each other, and differ only from what the AI read.
      expect(bodyDisagrees.sort()).toEqual(UNSERVED_G112_REPEATS);
    }
  );

  it('control: the classifier leaves a planted unclassified chain unclassified', () => {
    const chain = { chDir: 'ch01', module: 'm00001', segmentId: 'm00001:para:x', occurrence: 0 };
    const withTag = (afterSha256) => () => ({ afterSha256 });
    // positive: a Fable-changed chain whose minted hash is the tag line's afterSha256
    expect(classify(chain, 'a'.repeat(64), [], withTag('a'.repeat(64)))).toBe('fable-changed');
    // negative: minted differs from afterSha256, no tag line, no minted row
    expect(classify(chain, 'b'.repeat(64), [], withTag('a'.repeat(64)))).toBeNull();
    expect(classify(chain, 'a'.repeat(64), [], () => undefined)).toBeNull();
    expect(classify(chain, null, [], withTag('a'.repeat(64)))).toBeNull();
  });
});
