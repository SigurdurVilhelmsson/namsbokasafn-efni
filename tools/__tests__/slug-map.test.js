// tools/__tests__/slug-map.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  slugMapFilename,
  slugMapPath,
  readSlugMap,
  recordRename,
  writeSlugMap,
} from '../lib/slug-map.js';

const AT = '2026-08-18';
const K = 'chapters/10/';

/** Fresh empty map for efnafraedi-2e / mt-preview. */
function m() {
  return readSlugMap(path.join(os.tmpdir(), 'nope-does-not-exist', slugMapFilename('mt-preview')), {
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
    const p = path.join(dir, slugMapFilename('mt-preview'));
    fs.writeFileSync(p, '{ this is not json');
    expect(readSlugMap(p, { book: 'b', track: 't' }).renames).toEqual({});
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty map when renames is an array, not an object', () => {
    // typeof [] === 'object', so the guard must reject arrays explicitly.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c9-arr-'));
    const p = path.join(dir, slugMapFilename('mt-preview'));
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
    const p = path.join(dir, slugMapFilename('mt-preview'));
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
    const p = path.join(dir, slugMapFilename('mt-preview'));
    writeSlugMap(
      p,
      recordRename(m(), { from: `${K}a.html`, to: `${K}b.html`, moduleId: 'm1', recordedAt: AT })
    );
    const raw = fs.readFileSync(p, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n  "renames"');
  });

  it('🔴 writes ATOMICALLY: content lands via a `.tmp` file + rename, not a direct write, and no `.tmp` survives', () => {
    // A bare writeFileSync(mapPath, …) can leave a truncated/zero-length
    // slug-map.json if the process is killed mid-write (measured: 8 of 55 SIGINT
    // trials). write-to-tmp-then-rename closes that window because a rename is a
    // single filesystem operation — there is no instant at which mapPath is
    // partially written. Pin the MECHANISM, not just the end state: a direct
    // writeFileSync(mapPath, …) with no renameSync would satisfy every
    // outcome-only assertion (no .tmp file, one file in the dir) just as well,
    // so this must also assert the write went through a differently-named path.
    const p = path.join(dir, slugMapFilename('mt-preview'));
    const map = recordRename(m(), {
      from: `${K}a.html`,
      to: `${K}b.html`,
      moduleId: 'm1',
      recordedAt: AT,
    });

    const writeSpy = vi.spyOn(fs, 'writeFileSync');
    const renameSpy = vi.spyOn(fs, 'renameSync');
    try {
      writeSlugMap(p, map);

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const [writtenPath] = writeSpy.mock.calls[0];
      expect(writtenPath).not.toBe(p); // content must NOT land directly on the final path
      expect(writtenPath).toBe(`${p}.tmp`);

      expect(renameSpy).toHaveBeenCalledTimes(1);
      expect(renameSpy.mock.calls[0]).toEqual([`${p}.tmp`, p]);
    } finally {
      writeSpy.mockRestore();
      renameSpy.mockRestore();
    }

    // Outcome checks, alongside the mechanism pin above.
    expect(fs.existsSync(`${p}.tmp`)).toBe(false);
    expect(fs.readdirSync(dir).sort()).toEqual([slugMapFilename('mt-preview')]);
    expect(readSlugMap(p, { book: 'efnafraedi-2e', track: 'mt-preview' }).renames).toEqual(
      map.renames
    );
  });
});

// =====================================================================
// slugMapFilename — the map's name is TRACK-QUALIFIED (§C9 F3 follow-up, 2026-08-18)
// =====================================================================
//
// The reader site flattens both publication tracks into one directory and its overlay filter has
// no branch for a track-root file, so a single `slug-map.json` written by a faithful render would
// be copied over the mt-preview one. Qualifying the name is what makes both survive the sync — so
// these tests pin the NAME SHAPE, not just that some name is produced.

describe('§C9 slugMapFilename', () => {
  it('qualifies the filename with the track', () => {
    expect(slugMapFilename('mt-preview')).toBe('slug-map.mt-preview.json');
    expect(slugMapFilename('faithful')).toBe('slug-map.faithful.json');
  });

  it('🔴 the two tracks produce DIFFERENT names — the whole point of the change', () => {
    // If these ever collide, a faithful republish silently overwrites mt-preview's map at the
    // reader site, destroying redirect history for every rename recorded under the other track.
    expect(slugMapFilename('mt-preview')).not.toBe(slugMapFilename('faithful'));
  });

  it('🔴 REFUSES a track name that could escape the directory', () => {
    // `track` reaches here from a CLI flag and is interpolated into a filename.
    for (const bad of ['../evil', 'a/b', '..', '', 'Mt-Preview', '-leading', 'x\ny']) {
      expect(() => slugMapFilename(bad)).toThrow(/unsafe track name/);
    }
  });

  it('🔴 REFUSES a non-string track', () => {
    for (const bad of [undefined, null, 42, {}, ['mt-preview']]) {
      expect(() => slugMapFilename(bad)).toThrow(/unsafe track name/);
    }
  });

  it('✅ CONTROL: an ordinary hyphenated track name is accepted', () => {
    // Without this the refusal tests are consistent with a function that rejects everything.
    expect(() => slugMapFilename('mt-preview')).not.toThrow();
    expect(() => slugMapFilename('faithful')).not.toThrow();
  });
});

describe('§C9 slugMapPath', () => {
  it('places the track-qualified map at the track root', () => {
    expect(slugMapPath('/books/x/05-publication/mt-preview', 'mt-preview')).toBe(
      '/books/x/05-publication/mt-preview/slug-map.mt-preview.json'
    );
  });

  it('🔴 propagates the track validation rather than building a path from a bad name', () => {
    expect(() => slugMapPath('/books/x/05-publication/mt-preview', '../evil')).toThrow(
      /unsafe track name/
    );
  });
});
