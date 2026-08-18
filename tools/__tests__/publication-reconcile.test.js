// tools/__tests__/publication-reconcile.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotModuleIds, reconcilePublishedRenames } from '../lib/publication-reconcile.js';
import { SLUG_MAP_FILENAME, readSlugMap } from '../lib/slug-map.js';

const AT = '2026-08-18';

let root, trackDir, outputDir;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'c9-rec-'));
  trackDir = path.join(root, '05-publication', 'mt-preview');
  outputDir = path.join(trackDir, 'chapters', '10');
  fs.mkdirSync(outputDir, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** A published page carrying a module id. */
function page(name, moduleId) {
  fs.writeFileSync(
    path.join(outputDir, name),
    `<html><body><article data-module-id="${moduleId}">x</article></body></html>`
  );
}
/** A compiled rollup page — no module id, fixed name, cannot rename. */
function rollup(name) {
  fs.writeFileSync(
    path.join(outputDir, name),
    '<html><body><article>summary</article></body></html>'
  );
}
const reconcile = (renderedModules) =>
  reconcilePublishedRenames({
    outputDir,
    trackDir,
    chapterRelDir: 'chapters/10',
    renderedModules,
    book: 'efnafraedi-2e',
    track: 'mt-preview',
    recordedAt: AT,
  });

describe('snapshotModuleIds', () => {
  it('maps filename → module id', () => {
    page('10-5-old.html', 'm68770');
    expect(snapshotModuleIds(outputDir)).toEqual(new Map([['10-5-old.html', 'm68770']]));
  });

  it('🔴 OMITS files with no data-module-id — they can never be pruned', () => {
    page('10-5-old.html', 'm68770');
    rollup('10-summary.html');
    const snap = snapshotModuleIds(outputDir);
    expect(snap.has('10-summary.html')).toBe(false);
    expect(snap.has('10-5-old.html')).toBe(true); // control: the scan does find pages
  });

  it('returns an empty map for a directory that does not exist', () => {
    expect(snapshotModuleIds(path.join(root, 'nope'))).toEqual(new Map());
  });
});

describe('reconcilePublishedRenames', () => {
  it('🔴 deletes the superseded page and records old → new', () => {
    page('10-5-fast-astand-efnis.html', 'm68770');
    page('10-5-fastur-efnishamur.html', 'm68770');
    page('10-4-other.html', 'm68769'); // CONTROL: different module, must survive

    const res = reconcile(new Map([['m68770', '10-5-fastur-efnishamur.html']]));

    expect(res.pruned).toEqual([
      {
        from: 'chapters/10/10-5-fast-astand-efnis.html',
        to: 'chapters/10/10-5-fastur-efnishamur.html',
        moduleId: 'm68770',
      },
    ]);
    expect(fs.existsSync(path.join(outputDir, '10-5-fast-astand-efnis.html'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, '10-5-fastur-efnishamur.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, '10-4-other.html'))).toBe(true);

    const map = readSlugMap(path.join(trackDir, SLUG_MAP_FILENAME), {
      book: 'efnafraedi-2e',
      track: 'mt-preview',
    });
    expect(map.renames['chapters/10/10-5-fast-astand-efnis.html'].to).toBe(
      'chapters/10/10-5-fastur-efnishamur.html'
    );
  });

  it('🔴 NEVER deletes an id-less rollup, even when a real rename happens beside it', () => {
    page('10-5-old.html', 'm68770');
    page('10-5-new.html', 'm68770');
    rollup('10-summary.html');
    rollup('10-answer-key.html');

    reconcile(new Map([['m68770', '10-5-new.html']]));

    expect(fs.existsSync(path.join(outputDir, '10-summary.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, '10-answer-key.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, '10-5-old.html'))).toBe(false); // control: it DID prune
  });

  it('does nothing when the filename is unchanged', () => {
    page('10-5-same.html', 'm68770');
    const res = reconcile(new Map([['m68770', '10-5-same.html']]));
    expect(res.pruned).toEqual([]);
    expect(fs.existsSync(path.join(outputDir, '10-5-same.html'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, SLUG_MAP_FILENAME))).toBe(false); // no map on a no-op
  });

  it('🔴 ignores modules that were NOT rendered this pass', () => {
    // A single-module render knows nothing about the chapter's other modules and
    // must not act as if it does.
    page('10-4-a.html', 'm68769');
    page('10-4-b.html', 'm68769'); // a pre-existing duplicate for a module we did not render
    page('10-5-new.html', 'm68770');

    reconcile(new Map([['m68770', '10-5-new.html']]));

    expect(fs.existsSync(path.join(outputDir, '10-4-a.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, '10-4-b.html'))).toBe(true);
  });

  it('accumulates across calls rather than regenerating the map', () => {
    page('10-5-old.html', 'm68770');
    page('10-5-new.html', 'm68770');
    reconcile(new Map([['m68770', '10-5-new.html']]));

    page('10-6-old.html', 'm68771');
    page('10-6-new.html', 'm68771');
    reconcile(new Map([['m68771', '10-6-new.html']]));

    const map = readSlugMap(path.join(trackDir, SLUG_MAP_FILENAME), {
      book: 'efnafraedi-2e',
      track: 'mt-preview',
    });
    expect(Object.keys(map.renames).sort()).toEqual([
      'chapters/10/10-5-old.html',
      'chapters/10/10-6-old.html',
    ]);
  });
});
