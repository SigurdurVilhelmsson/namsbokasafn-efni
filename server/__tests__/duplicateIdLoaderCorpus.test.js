/**
 * G1.12 (spec §5.2, §5.4, §7 item 3): on the real chemistry files the editor loader serves exactly
 * one row per repeated Icelandic id, from the FIRST copy, with that copy's math.
 *
 * The population is every chemistry module whose committed `02-mt-output` Icelandic file holds an
 * id more than once. Measured pin, spec §3 (ledger Ruling 4): 285 ids in 83 modules.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  writeFileSync,
  rmSync,
} from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const segmentParser = require('../services/segmentParser');
const servedVersions = require('../services/servedVersions');

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOK = 'efnafraedi-2e';
const BOOK_DIR = join(REPO, 'books', BOOK);
const PINNED_IDS = 285;
const PINNED_MODULES = 83;
const originalBooksDir = segmentParser.BOOKS_DIR;
const tmpRoots = [];

afterAll(() => {
  segmentParser._setTestBooksDir(originalBooksDir);
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

const MARKER = /<!--\s*SEG:([^\s]+?)\s*-->/g;
function records(text) {
  const ms = [...text.matchAll(MARKER)];
  return ms.map((m, i) => ({
    id: m[1],
    body: text.slice(m.index + m[0].length, i + 1 < ms.length ? ms[i + 1].index : text.length),
  }));
}

const MODS = [];
const mtRoot = join(BOOK_DIR, '02-mt-output');
for (const chDir of readdirSync(mtRoot).sort()) {
  for (const f of readdirSync(join(mtRoot, chDir)).sort()) {
    const m = f.match(/^(m\d+)-segments\.is\.md$/);
    if (!m) continue;
    const recs = records(readFileSync(join(mtRoot, chDir, f), 'utf8'));
    const seen = new Map();
    for (const r of recs) seen.set(r.id, (seen.get(r.id) || 0) + 1);
    const repeated = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    if (repeated.length)
      MODS.push({ chDir, moduleId: m[1], chapter: Number(chDir.slice(2)), recs, repeated });
  }
}

const firstCopy = (mod, id) => mod.recs.find((r) => r.id === id).body;
// parseSegments trims each record's body (normalizeWraps); compare on the same footing.
const parsedFirst = (mod, id) =>
  segmentParser.parseSegments(`<!-- SEG:${id} -->${firstCopy(mod, id)}`)[0].content;
const mathTokens = (s) => new Set(s.match(/\[\[MATH:\d+\]\]/g) || []);

/**
 * Stage one module's English file, Icelandic file and structure sidecars under `bookTmp`, so a
 * loader test never reads the live tree (the first apply on a live module writes a faithful file,
 * which would turn a test that expects isSource 'mt-output' red for an unrelated reason).
 */
function stageModule(mod, bookTmp, isText) {
  const enSrc = join(BOOK_DIR, '02-for-mt', mod.chDir, `${mod.moduleId}-segments.en.md`);
  mkdirSync(join(bookTmp, '02-for-mt', mod.chDir), { recursive: true });
  copyFileSync(enSrc, join(bookTmp, '02-for-mt', mod.chDir, `${mod.moduleId}-segments.en.md`));
  mkdirSync(join(bookTmp, '02-mt-output', mod.chDir), { recursive: true });
  writeFileSync(join(bookTmp, '02-mt-output', mod.chDir, `${mod.moduleId}-segments.is.md`), isText);
  for (const f of ['structure', 'equations', 'manifest']) {
    const p = join(BOOK_DIR, '02-structure', mod.chDir, `${mod.moduleId}-${f}.json`);
    if (existsSync(p)) {
      mkdirSync(join(bookTmp, '02-structure', mod.chDir), { recursive: true });
      copyFileSync(p, join(bookTmp, '02-structure', mod.chDir, `${mod.moduleId}-${f}.json`));
    }
  }
}

describe('G1.12 loader on the real chemistry corpus', () => {
  it('the population is 285 ids in 83 modules', () => {
    expect({ modules: MODS.length, ids: MODS.reduce((a, m) => a + m.repeated.length, 0) }).toEqual({
      modules: PINNED_MODULES,
      ids: PINNED_IDS,
    });
    const frozen = JSON.parse(readFileSync(join(BOOK_DIR, 'g112-unserved-copies.json'), 'utf8'));
    const want = frozen.entries.map((e) => `${e.moduleId}|${e.segmentId}`).sort();
    const got = MODS.flatMap((m) => m.repeated.map((id) => `${m.moduleId}|${id}`)).sort();
    expect(got).toEqual(want);
  });

  it('no first copy is empty', () => {
    const empty = [];
    for (const mod of MODS) {
      for (const id of mod.repeated)
        if (!parsedFirst(mod, id).trim()) empty.push(`${mod.moduleId} ${id}`);
    }
    expect(empty).toEqual([]);
  });

  it(
    'one served row per repeated id, from the first copy, with its math',
    { timeout: 120000 },
    () => {
      const tmp = mkdtempSync(join(tmpdir(), 'g112-served-'));
      tmpRoots.push(tmp);
      const books = join(tmp, 'books');
      for (const mod of MODS) {
        stageModule(
          mod,
          join(books, BOOK),
          readFileSync(join(mtRoot, mod.chDir, `${mod.moduleId}-segments.is.md`), 'utf8')
        );
      }
      segmentParser._setTestBooksDir(books);
      const bad = [];
      let checked = 0;
      for (const mod of MODS) {
        const data = segmentParser.loadModuleForEditing(BOOK, mod.chapter, mod.moduleId);
        if (data.isSource !== 'mt-output') bad.push(`${mod.moduleId}: isSource ${data.isSource}`);
        const versions = servedVersions.versionRowsFor(data, {
          book: BOOK,
          chapter: mod.chapter,
          moduleId: mod.moduleId,
        });
        if (versions.duplicatedIds.length)
          bad.push(`${mod.moduleId}: duplicatedIds ${versions.duplicatedIds}`);
        for (const id of mod.repeated) {
          const rows = data.segments.filter((s) => s.segmentId === id);
          if (rows.length !== 1) {
            bad.push(`${mod.moduleId} ${id}: ${rows.length} rows`);
            continue;
          }
          checked++;
          const want = segmentParser.normalizeTermMarkers(
            rows[0].en,
            segmentParser.unescapeMtMarkers(parsedFirst(mod, id))
          );
          if (rows[0].is !== want) bad.push(`${mod.moduleId} ${id}: is differs from first copy`);
          const isMath = mathTokens(rows[0].is);
          for (const t of mathTokens(rows[0].en))
            if (!isMath.has(t)) bad.push(`${mod.moduleId} ${id}: missing ${t}`);
        }
      }
      expect(bad).toEqual([]);
      expect(checked).toBe(PINNED_IDS);
    }
  );

  it('the loader serves the planted first copy', { timeout: 120000 }, () => {
    const tmp = mkdtempSync(join(tmpdir(), 'g112-loader-'));
    tmpRoots.push(tmp);
    const books = join(tmp, 'books');
    const bookTmp = join(books, BOOK);
    const first = {};
    let n = 0;
    for (const mod of MODS) {
      const seen = new Map();
      const out = mod.recs.map((r) => {
        let body = r.body;
        if (mod.repeated.includes(r.id)) {
          const occ = seen.get(r.id) || 0;
          seen.set(r.id, occ + 1);
          if (occ === 0) {
            first[`${mod.moduleId}|${r.id}`] = `G112FIRST${++n}`;
            body = `\n${first[`${mod.moduleId}|${r.id}`]}\n\n`;
          } else {
            body = `\n${first[`${mod.moduleId}|${r.id}`].replace('FIRST', 'LAST')}\n\n`;
          }
        }
        return `<!-- SEG:${r.id} -->${body}`;
      });
      stageModule(mod, bookTmp, out.join(''));
    }
    segmentParser._setTestBooksDir(books);
    const bad = [];
    let checked = 0;
    for (const mod of MODS) {
      const data = segmentParser.loadModuleForEditing(BOOK, mod.chapter, mod.moduleId);
      if (data.segments.some((s) => /G112LAST/.test(s.is)))
        bad.push(`${mod.moduleId}: a LAST token is served`);
      for (const id of mod.repeated) {
        const rows = data.segments.filter((s) => s.segmentId === id);
        checked++;
        const want = first[`${mod.moduleId}|${id}`];
        if (rows.length !== 1 || rows[0].is !== want) {
          bad.push(
            `${mod.moduleId} ${id}: want ${want}, got ${JSON.stringify(rows.map((r) => r.is))}`
          );
        }
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBe(PINNED_IDS);
  });
});
