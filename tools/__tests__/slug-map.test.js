// tools/__tests__/slug-map.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SLUG_MAP_FILENAME, readSlugMap, recordRename, writeSlugMap } from '../lib/slug-map.js';

const AT = '2026-08-18';
const K = 'chapters/10/';

/** Fresh empty map for efnafraedi-2e / mt-preview. */
function m() {
  return readSlugMap(path.join(os.tmpdir(), 'nope-does-not-exist', SLUG_MAP_FILENAME), {
    book: 'efnafraedi-2e',
    track: 'mt-preview',
  });
}

describe('slug-map: reading', () => {
  it('returns an empty, well-formed map when the file does not exist', () => {
    const map = m();
    expect(map.book).toBe('efnafraedi-2e');
    expect(map.track).toBe('mt-preview');
    expect(map.renames).toEqual({});
  });

  it('returns an empty map rather than throwing on unparseable JSON', () => {
    // Fail SAFE: a corrupt map must not abort a render. Losing redirect history is
    // recoverable; refusing to publish is not proportionate.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c9-'));
    const p = path.join(dir, SLUG_MAP_FILENAME);
    fs.writeFileSync(p, '{ this is not json');
    expect(readSlugMap(p, { book: 'b', track: 't' }).renames).toEqual({});
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty map when renames is an array, not an object', () => {
    // typeof [] === 'object', so the guard must reject arrays explicitly.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c9-arr-'));
    const p = path.join(dir, SLUG_MAP_FILENAME);
    fs.writeFileSync(p, JSON.stringify({ renames: ['oops'] }));
    expect(readSlugMap(p, { book: 'b', track: 't' }).renames).toEqual({});
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('slug-map: recordRename', () => {
  it('records a single rename', () => {
    const map = recordRename(m(), {
      from: `${K}a.html`,
      to: `${K}b.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    expect(map.renames).toEqual({
      [`${K}a.html`]: { to: `${K}b.html`, moduleId: 'm1', recordedAt: AT },
    });
  });

  it('🔴 COLLAPSES A CHAIN: A→B then B→C leaves A→C and B→C, never A→B', () => {
    // The property vefur depends on: every `to` names a file that CURRENTLY EXISTS,
    // so one lookup suffices and a redirect can never land on a deleted page.
    let map = recordRename(m(), {
      from: `${K}a.html`,
      to: `${K}b.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    map = recordRename(map, {
      from: `${K}b.html`,
      to: `${K}c.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    expect(map.renames[`${K}a.html`].to).toBe(`${K}c.html`);
    expect(map.renames[`${K}b.html`].to).toBe(`${K}c.html`);
    expect(Object.keys(map.renames).sort()).toEqual([`${K}a.html`, `${K}b.html`]);
  });

  it('🔴 A→B then B→A removes the A entry instead of storing an identity redirect', () => {
    let map = recordRename(m(), {
      from: `${K}a.html`,
      to: `${K}b.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    map = recordRename(map, {
      from: `${K}b.html`,
      to: `${K}a.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    // b.html was live and is now gone, so it redirects. a.html exists — it must NOT.
    expect(map.renames).toEqual({
      [`${K}b.html`]: { to: `${K}a.html`, moduleId: 'm1', recordedAt: AT },
    });
  });

  it('✅ CONTROL: collapsing does not disturb an unrelated module entry', () => {
    let map = recordRename(m(), {
      from: `${K}x.html`,
      to: `${K}y.html`,
      moduleId: 'm9',
      recordedAt: AT,
    });
    map = recordRename(map, {
      from: `${K}a.html`,
      to: `${K}b.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    map = recordRename(map, {
      from: `${K}b.html`,
      to: `${K}c.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    expect(map.renames[`${K}x.html`].to).toBe(`${K}y.html`);
  });

  it('is a no-op when from === to', () => {
    const map = recordRename(m(), {
      from: `${K}a.html`,
      to: `${K}a.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    expect(map.renames).toEqual({});
  });

  it('🔴 FREED-SLUG REUSE: A→B then D→A drops the stale A entry instead of shadowing D', () => {
    // A→B frees the slug "A". D→A then reclaims it: A is live again, now holding D's
    // content. A lookup on A must land on D's page, not redirect away to B.
    let map = recordRename(m(), {
      from: `${K}a.html`,
      to: `${K}b.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    map = recordRename(map, {
      from: `${K}d.html`,
      to: `${K}a.html`,
      moduleId: 'm2',
      recordedAt: AT,
    });
    expect(map.renames).toEqual({
      [`${K}d.html`]: { to: `${K}a.html`, moduleId: 'm2', recordedAt: AT },
    });
  });

  it('✅ CONTROL: a rename that does not reuse a freed slug leaves the earlier entry intact', () => {
    let map = recordRename(m(), {
      from: `${K}a.html`,
      to: `${K}b.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    map = recordRename(map, {
      from: `${K}x.html`,
      to: `${K}y.html`,
      moduleId: 'm2',
      recordedAt: AT,
    });
    expect(map.renames).toEqual({
      [`${K}a.html`]: { to: `${K}b.html`, moduleId: 'm1', recordedAt: AT },
      [`${K}x.html`]: { to: `${K}y.html`, moduleId: 'm2', recordedAt: AT },
    });
  });
});

describe('slug-map: round-trip', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c9-rt-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes and reads back identically', () => {
    const p = path.join(dir, SLUG_MAP_FILENAME);
    const map = recordRename(m(), {
      from: `${K}a.html`,
      to: `${K}b.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });
    writeSlugMap(p, map);
    expect(readSlugMap(p, { book: 'efnafraedi-2e', track: 'mt-preview' }).renames).toEqual(
      map.renames
    );
  });

  it('writes a trailing newline and 2-space indent, so diffs stay readable', () => {
    const p = path.join(dir, SLUG_MAP_FILENAME);
    writeSlugMap(
      p,
      recordRename(m(), { from: `${K}a.html`, to: `${K}b.html`, moduleId: 'm1', recordedAt: AT })
    );
    const raw = fs.readFileSync(p, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n  "renames"');
  });
});
