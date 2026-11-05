/**
 * servedVersions: the occurrence counter, the version rows, the serve annotation and the mint
 * (G1.1; spec §5.2, §5.3, §5.4 steps 1–3 and fail-soft, §11; T3, the service half).
 *
 * Fixtures are plain loader-shaped objects ({ isSource, segments: [{ segmentId, en, is }] }), so no
 * file is read and nothing under books/ is touched. Database cases run on a database every real
 * migration built (freshMigratedDb). Every negative case carries its control in the same fixture:
 * the read-only handle that mints nothing also refuses a real write, and a module that mints
 * nothing sits beside one that does.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const logger = require('../lib/logger');
const { sha256Text } = require('../lib/servedText');
const { withOccurrences } = require('../../tools/lib/seg-markers.cjs');
const {
  countOccurrences,
  buildVersionRow,
  versionRowsFor,
  annotateServed,
  mintVersions,
  recordServe,
} = require('../services/servedVersions');

const open = [];
function track(db) {
  open.push(db);
  return db;
}
afterEach(() => {
  while (open.length) {
    const db = open.pop();
    if (db.open) db.close();
  }
  vi.restoreAllMocks();
});

function migrated() {
  const built = freshMigratedDb();
  track(built.db);
  return built;
}

const KEY = Object.freeze({ book: 'efnafraedi-2e', chapter: 2, moduleId: 'm68700' });
const DUP = 'm68700:para:dup';

/** Three segments, one id twice: the duplicated copies carry different text, as raw MT copies can. */
function threeWithDuplicate(isSource = 'mt-output') {
  return {
    isSource,
    segments: [
      { segmentId: DUP, en: 'First copy', is: 'Fyrra eintak' },
      { segmentId: 'm68700:para:b', en: 'Beta', is: 'Beta á íslensku' },
      { segmentId: DUP, en: 'Second copy', is: 'Seinna eintak' },
    ],
  };
}

/** Four segments: one id twice, and an untranslated segment whose served `is` is '' (spec §5.3). */
function fourWithDuplicate(isSource = 'mt-output') {
  return {
    isSource,
    segments: [
      { segmentId: DUP, en: 'First copy', is: 'Fyrra eintak' },
      { segmentId: 'm68700:para:b', en: 'Beta', is: 'Beta á íslensku' },
      { segmentId: DUP, en: 'Second copy', is: 'Seinna eintak' },
      { segmentId: 'm68700:para:c', en: 'Gamma', is: '' },
    ],
  };
}

function row(overrides = {}) {
  return buildVersionRow({
    ...KEY,
    segmentId: 'm68700:para:a',
    occurrence: 0,
    en: 'Alpha',
    is: 'Alfa',
    layer: 'mt-output',
    ...overrides,
  });
}

function allIds(db) {
  return db
    .prepare('SELECT id FROM served_text_versions ORDER BY id')
    .all()
    .map((r) => r.id);
}

function idByKey(db, r) {
  return db
    .prepare(
      `SELECT id FROM served_text_versions
        WHERE book = ? AND chapter = ? AND module_id = ? AND segment_id = ? AND occurrence = ?
          AND en_sha256 = ? AND is_sha256 = ? AND layer = ?`
    )
    .get(r.book, r.chapter, r.moduleId, r.segmentId, r.occurrence, r.enSha256, r.isSha256, r.layer)
    ?.id;
}

describe('countOccurrences (spec §5.3)', () => {
  it('numbers each copy of an id in served order and names the duplicated ids', () => {
    const { occurrences, duplicated } = countOccurrences(
      ['a', 'b', 'a', 'c', 'a'].map((segmentId) => ({ segmentId }))
    );
    expect(occurrences).toEqual([0, 0, 1, 0, 2]);
    expect([...duplicated]).toEqual(['a']);
  });

  it('never throws on an id holding #', () => {
    const result = countOccurrences([{ segmentId: 'm1:para:x#y' }]);
    expect(result).toMatchObject({ occurrences: [0] });
    expect([...result.duplicated]).toEqual([]);
    // Control: the shared helper the spec declines to reuse does throw on it, so the hazard is real.
    expect(() => withOccurrences([{ segmentId: 'm1:para:x#y' }])).toThrow();
  });
});

describe('versionRowsFor', () => {
  it('builds one row per served segment, hashing en and is, and marks the duplicated copies', () => {
    const data = threeWithDuplicate();
    const { rows, duplicatedIds } = versionRowsFor(data, KEY);
    expect(rows).toHaveLength(3);
    rows.forEach((r, i) => {
      const seg = data.segments[i];
      expect(r.segmentId).toBe(seg.segmentId);
      expect(r.enSha256).toBe(sha256Text(seg.en));
      expect(r.isSha256).toBe(sha256Text(seg.is));
      expect(r.enText).toBe(seg.en);
      expect(r.isText).toBe(seg.is);
      expect(r.layer).toBe(data.isSource);
      expect(r).toMatchObject(KEY);
    });
    const copies = rows.filter((r) => r.segmentId === DUP);
    expect(copies.map((r) => [r.duplicated, r.occurrence])).toEqual([
      [true, 0],
      [true, 1],
    ]);
    // Control: the sibling is not marked.
    expect(rows[1]).toMatchObject({ duplicated: false, occurrence: 0 });
    expect(duplicatedIds).toEqual([DUP]);
  });

  it('carries the faithful layer when the loader says faithful', () => {
    const { rows } = versionRowsFor(threeWithDuplicate('faithful'), KEY);
    expect(rows.map((r) => r.layer)).toEqual(['faithful', 'faithful', 'faithful']);
  });

  it('throws NO_LAYER for a module with no layer', () => {
    let caught;
    try {
      versionRowsFor(threeWithDuplicate(null), KEY);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('NO_LAYER');
  });
});

describe('annotateServed (spec §5.4 steps 1–2)', () => {
  it('a minted book: every segment gets occurrence, only non-duplicated ones get baseSha256', () => {
    const data = fourWithDuplicate();
    const result = annotateServed(data, KEY);
    expect(result.scope).toBe('minted');
    expect(result.duplicatedIds).toEqual([DUP]);
    expect(data.segments.map((s) => s.occurrence)).toEqual([0, 0, 1, 0]);
    for (const seg of data.segments) {
      if (seg.segmentId === DUP) {
        expect('baseSha256' in seg).toBe(false);
      } else {
        expect(seg.baseSha256).toBe(sha256Text(seg.is));
      }
    }
    // The untranslated segment's '' is hashed as such (spec §5.3).
    expect(data.segments[3].baseSha256).toBe(sha256Text(''));
    expect(result.rows.map((r) => r.segmentId)).toEqual(['m68700:para:b', 'm68700:para:c']);
    expect(result.rows.map((r) => r.isSha256)).toEqual([
      data.segments[1].baseSha256,
      data.segments[3].baseSha256,
    ]);
  });

  it('lifraen-efnafraedi: not minted, no baseSha256, but every segment has occurrence', () => {
    const data = fourWithDuplicate();
    const result = annotateServed(data, { ...KEY, book: 'lifraen-efnafraedi' });
    expect(result.scope).toBe('not-minted-book');
    expect(result.rows).toEqual([]);
    expect(data.segments.some((s) => 'baseSha256' in s)).toBe(false);
    expect(data.segments.map((s) => s.occurrence)).toEqual([0, 0, 1, 0]);
  });

  it('a module with no layer: no rows and no baseSha256', () => {
    const data = fourWithDuplicate(null);
    const result = annotateServed(data, KEY);
    expect(result.scope).toBe('no-layer');
    expect(result.rows).toEqual([]);
    expect(data.segments.some((s) => 'baseSha256' in s)).toBe(false);
    expect(data.segments.map((s) => s.occurrence)).toEqual([0, 0, 1, 0]);
  });
});

describe('mintVersions (spec §5.4 step 3)', () => {
  it('returns one id per row, aligned; minting the same rows again adds nothing', () => {
    const { db } = migrated();
    const rows = [row(), row({ segmentId: 'm68700:para:b', en: 'Beta', is: 'Beta-is' })];
    const ids = mintVersions(db, rows);
    expect(ids).toHaveLength(2);
    ids.forEach((id) => expect(Number.isInteger(id)).toBe(true));
    expect(ids.map((id, i) => [id, idByKey(db, rows[i])])).toEqual(ids.map((id) => [id, id]));
    const before = allIds(db);
    expect(mintVersions(db, rows)).toEqual(ids);
    expect(allIds(db)).toEqual(before);
  });

  it('a row differing only in isSha256, only in enSha256, or only in layer gets a new id each', () => {
    const { db } = migrated();
    const first = mintVersions(db, [row()]);
    const changed = [
      row({ is: 'Alfa breytt' }),
      row({ en: 'Alpha changed' }),
      row({ layer: 'faithful' }),
    ];
    const ids = mintVersions(db, changed);
    expect(new Set(ids).size).toBe(3);
    ids.forEach((id) => expect(first).not.toContain(id));
    expect(allIds(db)).toEqual([...first, ...ids].sort((a, b) => a - b));
  });

  it('a second module served alongside gains its own rows (T3 control)', () => {
    const { db } = migrated();
    const first = mintVersions(db, [row()]);
    const other = mintVersions(db, [row({ moduleId: 'm68701' })]);
    expect(other).toHaveLength(1);
    expect(first).not.toContain(other[0]);
  });

  it('chapter is part of the key: chapter-metadata on two chapters mints two rows', () => {
    const { db } = migrated();
    const meta = { moduleId: 'chapter-metadata', segmentId: 'chapter-metadata:title:t' };
    const [ch2] = mintVersions(db, [row({ ...meta, chapter: 2 })]);
    const [ch5] = mintVersions(db, [row({ ...meta, chapter: 5 })]);
    expect(ch5).not.toBe(ch2);
  });

  it('refuses organic and writes nothing, even in a mixed batch', () => {
    const { db } = migrated();
    mintVersions(db, [row({ segmentId: 'm68700:para:seed' })]);
    const before = allIds(db);
    let caught;
    try {
      mintVersions(db, [row(), row({ book: 'lifraen-efnafraedi' })]);
    } catch (err) {
      caught = err;
    }
    expect(caught?.code).toBe('BOOK_NOT_MINTED');
    expect(allIds(db)).toEqual(before);
    // Control: the chemistry row alone mints.
    expect(mintVersions(db, [row()])).toHaveLength(1);
    expect(allIds(db)).toHaveLength(before.length + 1);
  });

  it('an unchanged set takes no write: it succeeds on a read-only handle', () => {
    const { db, path } = migrated();
    const rows = [row(), row({ segmentId: 'm68700:para:b', en: 'Beta', is: 'Beta-is' })];
    const ids = mintVersions(db, rows);
    const ro = track(new Database(path, { readonly: true }));
    expect(mintVersions(ro, rows)).toEqual(ids);
    // Control: the read-only handle does refuse a write, so the call above attempted none.
    expect(() => mintVersions(ro, [row({ segmentId: 'm68700:para:new' })])).toThrow();
    expect(allIds(db)).toEqual([...ids].sort((a, b) => a - b));
  });

  it('an empty list mints nothing and returns []', () => {
    const { db } = migrated();
    expect(mintVersions(db, [])).toEqual([]);
    expect(allIds(db)).toEqual([]);
  });
});

describe('recordServe (spec §5.4 fail-soft)', () => {
  it('on a writable handle: mintOk, and servedVersionIds aligned with the rows by key', () => {
    const { db } = migrated();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const data = fourWithDuplicate();
    const served = recordServe(db, data, KEY);
    expect(served.mintOk).toBe(true);
    expect(served.scope).toBe('minted');
    expect(served.duplicatedIds).toEqual([DUP]);
    const ids = served.rows.map((r) => idByKey(db, r));
    ids.forEach((id) => expect(Number.isInteger(id)).toBe(true));
    expect(served.servedVersionIds).toEqual(
      served.rows.map((r, i) => ({
        segmentId: r.segmentId,
        occurrence: r.occurrence,
        servedVersionId: ids[i],
      }))
    );
    // A duplicated id mints nothing: only the two non-duplicated segments have rows.
    expect(allIds(db)).toHaveLength(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('a module with no layer and an organic module mint nothing (T3)', () => {
    const { db } = migrated();
    const noLayer = recordServe(db, fourWithDuplicate(null), KEY);
    expect(noLayer).toMatchObject({ scope: 'no-layer', mintOk: true, servedVersionIds: [] });
    const organic = recordServe(db, fourWithDuplicate(), { ...KEY, book: 'lifraen-efnafraedi' });
    expect(organic).toMatchObject({ scope: 'not-minted-book', mintOk: true, servedVersionIds: [] });
    expect(allIds(db)).toEqual([]);
    // Control: the same module on a minted book does mint.
    recordServe(db, fourWithDuplicate(), KEY);
    expect(allIds(db)).toHaveLength(2);
  });

  it('on a read-only handle with a never-minted row: served with baseSha256, logged once', () => {
    const { path } = migrated();
    const ro = track(new Database(path, { readonly: true }));
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const data = fourWithDuplicate();
    const served = recordServe(ro, data, KEY);
    expect(served.mintOk).toBe(false);
    expect(served.servedVersionIds).toBeNull();
    for (const seg of data.segments) {
      if (seg.segmentId !== DUP) expect(seg.baseSha256).toBe(sha256Text(seg.is));
    }
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [obj, msg] = errorSpy.mock.calls[0];
    expect(msg).toMatch(/Served-version mint failed/);
    expect(obj).toMatchObject({ book: KEY.book, chapter: KEY.chapter, moduleId: KEY.moduleId });
    // No text: neither language of any served segment reaches the log.
    const logged = JSON.stringify(obj);
    for (const seg of data.segments) {
      if (seg.en) expect(logged).not.toContain(seg.en);
      if (seg.is) expect(logged).not.toContain(seg.is);
    }
  });
});
