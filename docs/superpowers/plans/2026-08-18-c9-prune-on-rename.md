# §C9 Prune-on-Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A render that corrects a section title must delete the page it superseded and record `old → new`, so no orphaned duplicate survives and vefur can later serve a redirect.

**Architecture:** Two small pure-ish libs plus one call site. `tools/lib/slug-map.js` owns the persisted map (read / record-with-chain-collapse / write). `tools/lib/publication-reconcile.js` owns detection and the whole reconcile transaction against a directory. `tools/cnxml-render.js` snapshots the output dir before its existing blind sweep, records which module wrote which file, and calls the reconciler once after a successful render.

**Tech Stack:** Node 22 ESM (root `package.json` is `"type": "module"`), Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-18-c9-prune-on-rename-design.md` — read it first; this plan argues from it.

## Global Constraints

- **ESM, not CJS.** Root `package.json` is `"type": "module"`, so everything under `tools/` uses `import`/`export`. ⚠️ **Do NOT create `.cjs` here.** CLAUDE.md: `tools/lib/*.cjs` exists for exactly one reason — modules consumed by *both* the root ESM tree and `server/`'s CommonJS tree. These two are tools-only.
- **Never hand-edit `books/*/05-publication/`.** It is pipeline-written. Every change to it in this plan happens by running a tool. (CLAUDE.md § MANDATORY pipeline operations.)
- **`grep -a` for every search.** Committed files in this repo contain raw NUL bytes; plain `grep` silently reports nothing and exits 1 for strings such files demonstrably contain.
- **Root `npm test` is the authoritative gate**, run from the repo root. `npm run lint` and `npm run format:check` are separate CI jobs — a green `npm test` says nothing about them.
- **A regression test is not verified until it has been run against the broken code.** Every test below has an explicit "watch it fail" step; do not skip it.
- **Every deletion test needs a survival control in the same case.** A reconciler that deleted everything would pass a delete-only suite.
- Backup before editing a file under a WRITE-permission directory: `{filename}.{YYYY-MM-DD-HHMM}.bak`.

---

### Task 1: `slug-map.js` — the persisted old→new map

**Files:**
- Create: `tools/lib/slug-map.js`
- Test: `tools/__tests__/slug-map.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, relied on by Tasks 2 and 3:
  - `SLUG_MAP_FILENAME` → `'slug-map.json'`
  - `readSlugMap(mapPath, { book, track }) → { book, track, contract, renames: Record<string, {to, moduleId, recordedAt}> }` — returns a fresh empty map when the file is absent or unparseable.
  - `recordRename(map, { from, to, moduleId, recordedAt }) → map` — mutates and returns; collapses chains and drops identities.
  - `writeSlugMap(mapPath, map) → void`

- [ ] **Step 1: Write the failing test**

```js
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
});

describe('slug-map: recordRename', () => {
  it('records a single rename', () => {
    const map = recordRename(m(), { from: `${K}a.html`, to: `${K}b.html`, moduleId: 'm1', recordedAt: AT });
    expect(map.renames).toEqual({
      [`${K}a.html`]: { to: `${K}b.html`, moduleId: 'm1', recordedAt: AT },
    });
  });

  it('🔴 COLLAPSES A CHAIN: A→B then B→C leaves A→C and B→C, never A→B', () => {
    // The property vefur depends on: every `to` names a file that CURRENTLY EXISTS,
    // so one lookup suffices and a redirect can never land on a deleted page.
    let map = recordRename(m(), { from: `${K}a.html`, to: `${K}b.html`, moduleId: 'm1', recordedAt: AT });
    map = recordRename(map, { from: `${K}b.html`, to: `${K}c.html`, moduleId: 'm1', recordedAt: AT });
    expect(map.renames[`${K}a.html`].to).toBe(`${K}c.html`);
    expect(map.renames[`${K}b.html`].to).toBe(`${K}c.html`);
    expect(Object.keys(map.renames).sort()).toEqual([`${K}a.html`, `${K}b.html`]);
  });

  it('🔴 A→B then B→A removes the A entry instead of storing an identity redirect', () => {
    let map = recordRename(m(), { from: `${K}a.html`, to: `${K}b.html`, moduleId: 'm1', recordedAt: AT });
    map = recordRename(map, { from: `${K}b.html`, to: `${K}a.html`, moduleId: 'm1', recordedAt: AT });
    // b.html was live and is now gone, so it redirects. a.html exists — it must NOT.
    expect(map.renames).toEqual({
      [`${K}b.html`]: { to: `${K}a.html`, moduleId: 'm1', recordedAt: AT },
    });
  });

  it('✅ CONTROL: collapsing does not disturb an unrelated module entry', () => {
    let map = recordRename(m(), { from: `${K}x.html`, to: `${K}y.html`, moduleId: 'm9', recordedAt: AT });
    map = recordRename(map, { from: `${K}a.html`, to: `${K}b.html`, moduleId: 'm1', recordedAt: AT });
    map = recordRename(map, { from: `${K}b.html`, to: `${K}c.html`, moduleId: 'm1', recordedAt: AT });
    expect(map.renames[`${K}x.html`].to).toBe(`${K}y.html`);
  });

  it('is a no-op when from === to', () => {
    const map = recordRename(m(), { from: `${K}a.html`, to: `${K}a.html`, moduleId: 'm1', recordedAt: AT });
    expect(map.renames).toEqual({});
  });
});

describe('slug-map: round-trip', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c9-rt-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes and reads back identically', () => {
    const p = path.join(dir, SLUG_MAP_FILENAME);
    const map = recordRename(m(), { from: `${K}a.html`, to: `${K}b.html`, moduleId: 'm1', recordedAt: AT });
    writeSlugMap(p, map);
    expect(readSlugMap(p, { book: 'efnafraedi-2e', track: 'mt-preview' }).renames).toEqual(map.renames);
  });

  it('writes a trailing newline and 2-space indent, so diffs stay readable', () => {
    const p = path.join(dir, SLUG_MAP_FILENAME);
    writeSlugMap(p, recordRename(m(), { from: `${K}a.html`, to: `${K}b.html`, moduleId: 'm1', recordedAt: AT }));
    const raw = fs.readFileSync(p, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n  "renames"');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/slug-map.test.js`
Expected: FAIL — `Cannot find module '../lib/slug-map.js'`.

- [ ] **Step 3: Write the implementation**

```js
// tools/lib/slug-map.js
/**
 * §C9 — the old→new slug map a render emits when it supersedes a page.
 *
 * CONTRACT WITH namsbokasafn-vefur: every `to` names a file that CURRENTLY EXISTS.
 * Chains are collapsed on write, so a consumer does ONE lookup — no transitive walk,
 * no cycle handling, and no redirect that lands on a page we deleted.
 *
 * Lives at `books/<slug>/05-publication/<track>/slug-map.json`: inside the tree
 * `sync-content.js` copies (it copies only `05-publication/{mt-preview,faithful}/`),
 * and at TRACK ROOT rather than in `chapters/NN/`, which the renderer's sweep empties
 * and vefur's generate-toc reads as pages.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SLUG_MAP_FILENAME = 'slug-map.json';

const CONTRACT =
  'C9 — old→new so vefur can serve redirects. Every value is CURRENT: chains are ' +
  'collapsed on write, so a single lookup suffices and no transitive walk is needed.';

/** Absolute path to a book+track's map. `trackDir` is `<book>/05-publication/<track>`. */
export function slugMapPath(trackDir) {
  return path.join(trackDir, SLUG_MAP_FILENAME);
}

/**
 * Read the map, or return a fresh empty one.
 *
 * Fails SAFE on a corrupt file: losing redirect history is recoverable, aborting a
 * render is not proportionate. The next successful render rewrites the file.
 */
export function readSlugMap(mapPath, { book, track }) {
  const empty = { book, track, contract: CONTRACT, renames: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.renames !== 'object' || !parsed.renames) {
      return empty;
    }
    return { book, track, contract: CONTRACT, renames: parsed.renames };
  } catch {
    return empty;
  }
}

/**
 * Record `from → to`, collapsing chains so every value stays current.
 *
 * Order matters and is the whole algorithm:
 *   1. Re-point every entry that used to end at `from` so it ends at `to`.
 *   2. Drop any entry that has become an identity (a rename that returned to its
 *      original name) — that file exists again and must not redirect.
 *   3. Add `from → to`, unless nothing moved.
 *
 * @param {object} map        as returned by readSlugMap; MUTATED and returned
 * @param {object} rename     { from, to, moduleId, recordedAt } — paths are track-relative
 */
export function recordRename(map, { from, to, moduleId, recordedAt }) {
  if (from === to) return map;

  for (const [key, entry] of Object.entries(map.renames)) {
    if (entry.to === from) map.renames[key] = { to, moduleId, recordedAt };
  }
  for (const key of Object.keys(map.renames)) {
    if (map.renames[key].to === key) delete map.renames[key];
  }

  map.renames[from] = { to, moduleId, recordedAt };
  return map;
}

/** Write the map, sorted by key so the committed diff is stable. */
export function writeSlugMap(mapPath, map) {
  const renames = {};
  for (const key of Object.keys(map.renames).sort()) renames[key] = map.renames[key];
  const payload = { book: map.book, track: map.track, contract: CONTRACT, renames };
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tools/__tests__/slug-map.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify the chain-collapse test is not vacuous**

In `tools/lib/slug-map.js`, temporarily delete the whole `for (const [key, entry] of ...)` re-point loop. Re-run.
Expected: the two chain tests go RED (`A→B` survives instead of becoming `A→C`); the single-rename test stays green.
Restore the loop and confirm green again. **Do not commit the mutant.**

- [ ] **Step 6: Commit**

```bash
git add tools/lib/slug-map.js tools/__tests__/slug-map.test.js
git commit -m "feat(C9): slug-map — old→new with chains collapsed on write"
```

---

### Task 2: `publication-reconcile.js` — detect and perform the prune

**Files:**
- Create: `tools/lib/publication-reconcile.js`
- Test: `tools/__tests__/publication-reconcile.test.js`

**Interfaces:**
- Consumes from Task 1: `slugMapPath`, `readSlugMap`, `recordRename`, `writeSlugMap`.
- Produces, relied on by Task 3:
  - `snapshotModuleIds(outputDir) → Map<filename, moduleId>` — only files that actually carry `data-module-id`.
  - `reconcilePublishedRenames({ outputDir, trackDir, chapterRelDir, renderedModules, book, track, recordedAt }) → { pruned: [{from, to, moduleId}] }`
    - `renderedModules` is `Map<moduleId, filename>` for the modules written this pass.
    - Deletes each superseded file, records it, writes the map. Writes no map file when nothing was pruned.

- [ ] **Step 1: Write the failing test**

```js
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
  fs.writeFileSync(path.join(outputDir, name), `<html><body><article data-module-id="${moduleId}">x</article></body></html>`);
}
/** A compiled rollup page — no module id, fixed name, cannot rename. */
function rollup(name) {
  fs.writeFileSync(path.join(outputDir, name), '<html><body><article>summary</article></body></html>');
}
const reconcile = (renderedModules) =>
  reconcilePublishedRenames({
    outputDir, trackDir, chapterRelDir: 'chapters/10',
    renderedModules, book: 'efnafraedi-2e', track: 'mt-preview', recordedAt: AT,
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
      { from: 'chapters/10/10-5-fast-astand-efnis.html', to: 'chapters/10/10-5-fastur-efnishamur.html', moduleId: 'm68770' },
    ]);
    expect(fs.existsSync(path.join(outputDir, '10-5-fast-astand-efnis.html'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, '10-5-fastur-efnishamur.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, '10-4-other.html'))).toBe(true);

    const map = readSlugMap(path.join(trackDir, SLUG_MAP_FILENAME), { book: 'efnafraedi-2e', track: 'mt-preview' });
    expect(map.renames['chapters/10/10-5-fast-astand-efnis.html'].to)
      .toBe('chapters/10/10-5-fastur-efnishamur.html');
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

    const map = readSlugMap(path.join(trackDir, SLUG_MAP_FILENAME), { book: 'efnafraedi-2e', track: 'mt-preview' });
    expect(Object.keys(map.renames).sort()).toEqual([
      'chapters/10/10-5-old.html', 'chapters/10/10-6-old.html',
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/publication-reconcile.test.js`
Expected: FAIL — `Cannot find module '../lib/publication-reconcile.js'`.

- [ ] **Step 3: Write the implementation**

```js
// tools/lib/publication-reconcile.js
/**
 * §C9 — prune-on-rename for the publication tree.
 *
 * A Pass-1 review that corrects a section title RENAMES the rendered file, because the
 * title drives the slug. Before this, a single-module render wrote the new name and left
 * the old file behind, so the chapter TOC listed the section twice — one entry under the
 * corrected title, one under the old machine-translated one.
 *
 * SAFETY, and the first rule is what makes this complete rather than merely cautious:
 *  1. A file with no `data-module-id` is never pruned. Measured 2026-08-18: 94 of 335
 *     published files have none, and ALL 94 are compiled rollups (answer-key, summary,
 *     exercises, …) whose names come from the chapter number plus a fixed suffix, never
 *     from a translated title. They cannot rename, so ignoring them loses nothing.
 *  2. Only modules rendered THIS PASS are considered. A single-module render has no
 *     knowledge of the chapter's other modules and must not act as if it does.
 *  3. Matching is by module id alone — never by name similarity, never by mtime. mtime
 *     and git order are not content properties.
 *  4. The caller must invoke this only after a SUCCESSFUL render; a failed render must
 *     delete nothing.
 *  5. Recording precedes nothing useful if the unlink already happened, so the map write
 *     is part of this transaction: after vefur PR #200 the old filename no longer exists
 *     on its side to derive a redirect from, and an unlink without a record destroys the
 *     last copy of that information.
 */
import fs from 'node:fs';
import path from 'node:path';
import { slugMapPath, readSlugMap, recordRename, writeSlugMap } from './slug-map.js';

const MODULE_ID_RE = /data-module-id="([^"]+)"/;

/**
 * @param {string} outputDir absolute path to `.../chapters/<NN>`
 * @returns {Map<string,string>} filename → module id, omitting files that carry none
 */
export function snapshotModuleIds(outputDir) {
  const out = new Map();
  if (!fs.existsSync(outputDir)) return out;
  for (const name of fs.readdirSync(outputDir)) {
    if (!name.endsWith('.html')) continue;
    let html;
    try {
      html = fs.readFileSync(path.join(outputDir, name), 'utf8');
    } catch {
      continue;
    }
    const m = MODULE_ID_RE.exec(html);
    if (m) out.set(name, m[1]);
  }
  return out;
}

/**
 * Delete pages superseded by a rename in this pass, and record old → new.
 *
 * @param {object}              params
 * @param {string}              params.outputDir      absolute `.../chapters/<NN>`
 * @param {string}              params.trackDir       absolute `<book>/05-publication/<track>`
 * @param {string}              params.chapterRelDir  track-relative, e.g. `chapters/10`
 * @param {Map<string,string>}  params.renderedModules moduleId → filename written this pass
 * @param {string}              params.book
 * @param {string}              params.track
 * @param {string}              params.recordedAt     ISO date
 * @param {Map<string,string>}  [params.snapshot]     pre-render snapshot; taken now if omitted
 * @returns {{pruned: Array<{from:string,to:string,moduleId:string}>}}
 */
export function reconcilePublishedRenames({
  outputDir,
  trackDir,
  chapterRelDir,
  renderedModules,
  book,
  track,
  recordedAt,
  snapshot,
}) {
  const snap = snapshot || snapshotModuleIds(outputDir);
  const pruned = [];

  for (const [filename, moduleId] of snap) {
    const current = renderedModules.get(moduleId);
    if (!current || current === filename) continue;
    try {
      fs.unlinkSync(path.join(outputDir, filename));
    } catch {
      continue; // already gone (e.g. the full-chapter sweep took it) — still record it
    } finally {
      pruned.push({
        from: `${chapterRelDir}/${filename}`,
        to: `${chapterRelDir}/${current}`,
        moduleId,
      });
    }
  }

  if (pruned.length === 0) return { pruned };

  const mapPath = slugMapPath(trackDir);
  const map = readSlugMap(mapPath, { book, track });
  for (const p of pruned) {
    recordRename(map, { from: p.from, to: p.to, moduleId: p.moduleId, recordedAt });
  }
  writeSlugMap(mapPath, map);
  return { pruned };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tools/__tests__/publication-reconcile.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Verify the id-less safety rule is not vacuous**

In `snapshotModuleIds`, temporarily change `if (m) out.set(name, m[1]);` to `out.set(name, m ? m[1] : 'UNKNOWN');`. Re-run.
Expected: the "NEVER deletes an id-less rollup" test stays GREEN (an `UNKNOWN` id is still not in `renderedModules`) — **so that mutation does not discriminate.** Now also change the test's `reconcile(...)` call to `new Map([['m68770','10-5-new.html'], ['UNKNOWN','10-summary.html']])` and confirm the rollup is deleted, proving the assertion can fail. Restore both. **Do not commit either mutant.**
This step exists because the obvious mutation here is a false negative — record what you observed in the ledger.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/publication-reconcile.js tools/__tests__/publication-reconcile.test.js
git commit -m "feat(C9): publication reconciler — prune superseded pages, record old→new"
```

---

### Task 3: Wire the reconciler into `cnxml-render.js`

**Files:**
- Modify: `tools/cnxml-render.js` — import block (~`:20`), the sweep at `:3254-3277`, the module write at `:3579`, the post-render success block at `:4047`.

**Interfaces:**
- Consumes from Task 2: `snapshotModuleIds`, `reconcilePublishedRenames`.
- Produces: no new exports. The observable effect is the deletion plus `slug-map.json`.

**Context an implementer needs.** `BOOKS_DIR` is the *per-book* directory (`books/<slug>`), set from `--book` at `:3229`. `formatChapterOutput(args.chapter)` yields the BARE publication dir name (`10`, or `appendices`) — **not** the `ch`-prefixed source convention. `writtenFiles` (declared `:3501`) accumulates absolute paths for rollback. The module write is at `:3579`, where `moduleId` is in scope; the end-of-chapter write at `:3659` is for compiled rollups and must **not** be tracked — those have no module id and fixed names.

- [ ] **Step 1: Add the import**

Add beside the other `tools/lib` imports near the top of `tools/cnxml-render.js`:

```js
import { snapshotModuleIds, reconcilePublishedRenames } from './lib/publication-reconcile.js';
```

- [ ] **Step 2: Hoist `outputDir` and snapshot BEFORE the sweep**

Replace the block at `:3257-3277` (the comment through the closing brace of `if (!args.module)`) with:

```js
    // §C9 — snapshot filename → module id BEFORE anything is deleted or written. This is
    // the only moment both the old and the new file sets are knowable, and for a full-chapter
    // render it MUST precede the sweep below, which unlinks every .html and would otherwise
    // destroy the old→new information permanently.
    const outputDir = path.join(BOOKS_DIR, '05-publication', args.track, 'chapters', chapterStr);
    const preRenderSnapshot = snapshotModuleIds(outputDir);

    // Clean stale HTML files before rendering (full chapter only, not single-module).
    // Also sweep editor/pipeline artifacts (safeWrite `.backup.*`, stray `.pre-fix-*`,
    // `.bak`, leftover `.tmp.*`) so they never accumulate in — or get synced from —
    // the publication directory (handoff #9).
    if (!args.module) {
      if (fs.existsSync(outputDir)) {
        const all = fs.readdirSync(outputDir);
        const html = all.filter((f) => f.endsWith('.html'));
        const artifacts = all.filter((f) => isPublicationArtifact(f));
        for (const f of [...html, ...artifacts]) {
          fs.unlinkSync(path.join(outputDir, f));
        }
        if (html.length > 0) {
          console.log(`Cleaned ${html.length} existing HTML file(s) from ${chapterStr}/`);
        }
        if (artifacts.length > 0) {
          console.log(`Cleaned ${artifacts.length} stale artifact file(s) from ${chapterStr}/`);
        }
      }
    }
```

- [ ] **Step 3: Track which module wrote which file**

Immediately after `const writtenFiles = [];` at `:3501`, add:

```js
    // §C9 — moduleId → basename written this pass. Only real modules go in here; the
    // end-of-chapter rollups below carry no data-module-id and have fixed, title-independent
    // names, so they cannot rename and must not be tracked.
    const renderedModules = new Map();
```

Then at the module write (`:3579-3580`), after `writtenFiles.push(outputPath);`, add:

```js
          renderedModules.set(moduleId, path.basename(outputPath));
```

- [ ] **Step 4: Reconcile after a successful render**

In the post-render success block, immediately **before** the `for (const f of writtenFiles) {` backup-cleanup loop at `:4047`, insert:

```js
    // §C9 — prune pages this render superseded, and record old→new so vefur can redirect.
    // AFTER the rollback boundary on purpose: a failed render must delete nothing.
    try {
      const { pruned } = reconcilePublishedRenames({
        outputDir,
        trackDir: path.join(BOOKS_DIR, '05-publication', args.track),
        chapterRelDir: `chapters/${chapterStr}`,
        renderedModules,
        book: BOOK_SLUG,
        track: args.track,
        recordedAt: new Date().toISOString().slice(0, 10),
        snapshot: preRenderSnapshot,
      });
      for (const p of pruned) {
        console.log(`Pruned superseded page: ${p.from} → ${p.to} (${p.moduleId})`);
      }
      if (pruned.length > 0) {
        console.log(`Recorded ${pruned.length} rename(s) in 05-publication/${args.track}/slug-map.json`);
      }
    } catch (err) {
      console.error(`§C9 reconcile failed (render itself succeeded): ${err.message}`);
    }
```

- [ ] **Step 5: Confirm the wiring exists — count call sites, do not assume**

```bash
grep -an "reconcilePublishedRenames(\|snapshotModuleIds(" tools/cnxml-render.js
```
Expected: exactly **2** invocations — `snapshotModuleIds` once (Step 2), `reconcilePublishedRenames` once (Step 4) — plus the single `import` line, which is a BINDING and **not** a call site. Record both numbers.

- [ ] **Step 6: Run the full suite and the linters**

```bash
npm test
npm run lint
npm run format:check
```
Expected: all green. Note the test count; it should be Task 1 + Task 2's additions above the pre-branch baseline and nothing else.

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-render.js
git commit -m "feat(C9): wire prune-on-rename into the renderer, snapshot before the sweep"
```

---

### Task 4: Move the `publicationAppendices` count pin

**Files:**
- Modify: `server/__tests__/publicationAppendices.test.js:193`

**Interfaces:** none.

**Why:** the test pins `getPublicationStatus(-1).mtPreview.fileCount === 13` against a **write** directory. Prune-on-rename is exactly the change that starts deleting stale slugs from such a directory, so a hard-coded count becomes a tripwire on unrelated work. It has not fired yet only because a plain republish rewrites the same 13 files.

- [ ] **Step 1: Read the surrounding case**

```bash
sed -n '180,200p' server/__tests__/publicationAppendices.test.js
```

- [ ] **Step 2: Replace the hard-coded count with an observed one**

Replace the line `expect(status.mtPreview.fileCount).toBe(13);` with:

```js
    // §C9: this used to pin 13 against a WRITE directory, so prune-on-rename — which
    // deliberately deletes superseded pages from exactly such a directory — would have
    // turned it red for a reason unrelated to what it tests. Observe the directory and
    // assert agreement instead. The sibling `.path` assertion below is KEPT AS IS: that
    // one genuinely discriminates.
    const appendixDir = path.join(
      REPO_ROOT, 'books', 'efnafraedi-2e', '05-publication', 'mt-preview', 'chapters', 'appendices'
    );
    const onDisk = fs.readdirSync(appendixDir).filter((f) => f.endsWith('.html')).length;
    expect(onDisk).toBeGreaterThan(0); // control: an empty dir must not make this vacuous
    expect(status.mtPreview.fileCount).toBe(onDisk);
```

Also update the case's leading comment, which currently asserts the number 13 in prose — leave the
`.path` assertion on the next line exactly as it is.

✅ **No imports needed.** Verified 2026-08-18: the file already imports `fs` and `path` from
`node:*` and defines `REPO_ROOT` via `fileURLToPath(new URL('../..', import.meta.url))` at `:22`.
⚠️ **It is `REPO_ROOT`, not `PROJECT_ROOT`** — the two names appear in different files in this
repo and using the wrong one here is a `ReferenceError`, not a lint error.

- [ ] **Step 3: Run it and confirm green**

Run: `npx vitest run server/__tests__/publicationAppendices.test.js`
Expected: PASS.

- [ ] **Step 4: Verify the new assertion still discriminates**

Temporarily change `expect(status.mtPreview.fileCount).toBe(onDisk);` to `toBe(onDisk + 1)`. Re-run.
Expected: FAIL. Restore. **This matters** — an assertion that compares a value to itself via two paths can be trivially true; the control proves it is not.

- [ ] **Step 5: Commit**

```bash
git add server/__tests__/publicationAppendices.test.js
git commit -m "test(C9): observe the appendix file count instead of pinning 13"
```

---

### Task 5: Perform the ch10 repair BY RUNNING THE TOOL

**Files:**
- Modify (by tool, never by hand): `books/efnafraedi-2e/05-publication/mt-preview/chapters/10/`
- Create (by tool): `books/efnafraedi-2e/05-publication/mt-preview/slug-map.json`

**Why by tool:** `05-publication/` is pipeline-written and CLAUDE.md forbids editing it outside the tools. The register's sequencing ruling is explicit — build the mechanism first and let it perform the deletion. Hand-deleting would pre-empt the tool, do the work twice, and set the precedent the rule exists to prevent.

- [ ] **Step 1: Record the BEFORE state — this is the positive control**

```bash
ls books/efnafraedi-2e/05-publication/mt-preview/chapters/10/10-5-*.html
grep -aco '10-5-fast-astand-efnis' books/efnafraedi-2e/05-publication/mt-preview/chapters/10/10-0-introduction.html
```
Expected before: **two** `10-5-*.html` files; the intro references the stale slug at least once. Write both numbers down — a clean AFTER is meaningless without them.

- [ ] **Step 2: Run the full-chapter render**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 10 --track mt-preview --verbose
```
⚠️ Flags are `--book`/`--chapter`, **not** positionals. Expected in the output: a `Pruned superseded page:` line naming `10-5-fast-astand-efnis.html → 10-5-fastur-efnishamur.html (m68770)`.

- [ ] **Step 3: Verify the AFTER state against the BEFORE**

```bash
ls books/efnafraedi-2e/05-publication/mt-preview/chapters/10/10-5-*.html
grep -aco '10-5-fast-astand-efnis' books/efnafraedi-2e/05-publication/mt-preview/chapters/10/10-0-introduction.html
cat books/efnafraedi-2e/05-publication/mt-preview/slug-map.json
```
Expected: **one** `10-5-*.html` (`10-5-fastur-efnishamur.html`); the intro reference count is now **0**; the map holds exactly one entry whose `to` names a file that exists.

- [ ] **Step 4: Re-run the corpus census and compare to the pre-change value of 1**

```bash
node - <<'JS'
const fs=require('fs'), path=require('path');
let groups=0, files=0;
for (const book of fs.readdirSync('books')) {
  const pub=path.join('books',book,'05-publication'); if(!fs.existsSync(pub)) continue;
  for (const track of fs.readdirSync(pub)) {
    const ch=path.join(pub,track,'chapters'); if(!fs.existsSync(ch)) continue;
    for (const c of fs.readdirSync(ch)) {
      const d=path.join(ch,c); if(!fs.statSync(d).isDirectory()) continue;
      const byId=new Map();
      for (const f of fs.readdirSync(d).filter(f=>f.endsWith('.html'))) {
        files++;
        const m=/data-module-id="([^"]+)"/.exec(fs.readFileSync(path.join(d,f),'utf8'));
        if(!m) continue;
        byId.set(m[1], (byId.get(m[1])||0)+1);
      }
      for (const n of byId.values()) if(n>1) groups++;
    }
  }
}
console.log(`scanned ${files} files; duplicate module-id groups: ${groups} (was 1 before this change)`);
JS
```
Expected: `duplicate module-id groups: 0`, and the scanned file count should be **one lower** than the pre-change 335.

- [ ] **Step 5: Sanity-check the re-render did not churn the whole chapter**

```bash
git status --short books/efnafraedi-2e/05-publication/mt-preview/
```
A full-chapter render rewrites every file, so many may show as modified. Confirm the *content* diff is limited to the intro's nav link:
```bash
git diff --stat books/efnafraedi-2e/05-publication/mt-preview/chapters/10/
```
⚠️ If unrelated pages changed materially, STOP and report — that is a renderer drift finding, not part of §C9.

- [ ] **Step 6: Commit the repair with its evidence**

```bash
git add books/efnafraedi-2e/05-publication/mt-preview/
git commit -m "fix(C9): prune ch10's superseded 10.5 page and record the rename"
```

---

### Task 6: Final verification, docs and the register

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C9's block)
- Modify: `CLAUDE.md` (the cross-repo durable rules list)

- [ ] **Step 1: Run the authoritative gates from the repo root**

```bash
npm test
npm run lint
npm run format:check
npm run docs:generate && git status --short docs/_generated/
```
Expected: all green; `docs:generate` may produce no diff — commit anything it does produce, because `docs-check` CI fires on `tools/**` changes and this branch changed `tools/`.

- [ ] **Step 2: Prove the wiring is load-bearing — mutation, not assumption**

Comment out the `reconcilePublishedRenames({...})` call added in Task 3 Step 4. Re-run the ch10 render into a scratch copy is NOT possible (the tool writes the real tree), so instead re-run:
```bash
npx vitest run tools/__tests__/publication-reconcile.test.js
```
Expected: still GREEN — **the unit tests cannot see a missing call site.** Record that explicitly: it is this repo's documented failure mode ("a gate that is never called is indistinguishable from one that does not exist"), and the *only* evidence the wiring works is Task 5's before/after census. Restore the call. **Do not commit the mutant.**

- [ ] **Step 3: Update CLAUDE.md's cross-repo rules**

Under `### ⚠️ Durable cross-repo rules`, replace the `Prune-on-rename MUST EMIT…` bullet with:

```markdown
- **✅ Prune-on-rename SHIPPED (§C9).** A render that supersedes a page deletes it and records
  `old → new` in **`books/<slug>/05-publication/<track>/slug-map.json`** — inside the synced
  tree, at track root (not in `chapters/NN/`, which the render sweep empties and vefur's
  `generate-toc` reads as pages). **Chains collapse on write**, so every `to` names a file that
  currently exists and vefur does ONE lookup — no transitive walk, no cycles, no redirect onto
  a deleted page. ⚠️ **`books/_slug-maps/` is NOT that map** — `sync-content.js` copies only
  `05-publication/{mt-preview,faithful}/`, so nothing there ever reaches vefur.
  ⚠️ **The vefur consumer is not built yet**, so a superseded URL 404s until it is.
```

- [ ] **Step 4: Update the register's §C9 block**

Mark the three efni tasks done, record that the root cause was narrower than the entry described (the sweep already existed at `cnxml-render.js:3261`, guarded by `if (!args.module)`; only the single-module path could orphan), record the measured census (335 files → 1 duplicate group → 0 after), and state that the vefur redirect consumer is the remaining half with its own session and PR. Do **not** restate the map format — cite the spec.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/plans/2026-07-21-post-item17-followup-campaign.md docs/_generated/
git commit -m "docs(C9): prune-on-rename shipped; record the narrower root cause"
```

- [ ] **Step 6: Whole-branch adversarial review before the PR**

Per the project's standing practice. Scope it to the whole branch and instruct reviewers to **count production call sites themselves** rather than read a reported number, and to check that every deletion test has a survival control.

---

## Self-Review

**Spec coverage.** §2 root cause → Task 3 Steps 2–4. §4 snapshot/reconcile → Tasks 2, 3. §5 map contract (location, chain collapse, accumulation) → Task 1 (collapse, round-trip), Task 2 (location, accumulation). §6 safety rules 1–6 → Task 2's tests and module docstring; rule 4 (failed render deletes nothing) → Task 3 Step 4's placement after the rollback boundary. §7 ch10 repair by tool → Task 5. §8 test plan rows 1–8 → Task 1 (rows 5, 6), Task 2 (rows 1, 2, 3, 4), Task 3 (row 8 via the snapshot hoist), Task 5 (corpus check). §9 test pin → Task 4. §10 cross-repo → Task 6 Step 3.

⚠️ **One spec row is only partly covered and it is stated rather than hidden:** §8 row 7 ("a failing render deletes nothing"). Task 3 Step 4 places the call after the rollback boundary, but no test drives a *failing* render end-to-end — the tool writes the real `books/` tree and the `__e2e-fixture__` book has no `03-translated/` or `05-publication/` to render into. **Log this as a coverage gap in the ledger and the PR body; do not claim it as tested.**

**Placeholder scan:** none — every code step carries the actual code, and Task 4 Step 2 names the exact line it replaces.

**Type consistency:** `renderedModules` is `Map<moduleId, filename>` in Tasks 2 and 3. `snapshot`/`preRenderSnapshot` is `Map<filename, moduleId>` — the inverse, deliberately, and named differently in each direction. `recordRename` takes `{from, to, ...}` while `reconcilePublishedRenames` returns `pruned: [{from, to, moduleId}]` — same key names, checked.
