/**
 * remt-corpus.js — the §C82 battery's corpus walker, shared by every Tier-1 test file.
 *
 * ⚠️ IT WALKS `01-source` AND TESTS FOR THE SEGMENT FILE, RATHER THAN WALKING
 * `02-for-mt`. That is the whole point, not an implementation detail: `02-for-mt`
 * holds dated backups beside every live segment file — chemistry ch01 alone has
 * ELEVEN for `m68663` (re-measured 2026-08-27; this said "three", and the shape is
 * `<name>.backup.<ISO>`, not a dated `.md`) — so a naive `endsWith('.md')` walk counts each stale vintage
 * as a module and inflates every corpus number derived from it. Driving from the
 * `.cnxml` side cannot see a backup at all, because the filter is the extension.
 *
 * ⚠️ THE POPULATION IS "MODULES WITH BOTH SIDES", WHICH IS SMALLER THAN "MODULES".
 * Only 17 of organic's 342 and 10 of micro's 159 carry a segment file today. Any
 * number a caller derives from this walker must be stated with that coverage — a
 * measurement generalised one step past its coverage is this repo's commonest error.
 *
 * Extracted from `tools/__tests__/remt-checks-extract.test.js` (Task 3), whose own
 * header told Tasks 4-12 to inherit this walker rather than re-derive it. Kept as a
 * helper module rather than exported from that test file, because importing one
 * `.test.js` from another registers its `describe`s into the importer's run too.
 */
import fs from 'node:fs';
import path from 'node:path';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/**
 * Every module of `book` that has BOTH an `01-source` CNXML and a live `02-for-mt`
 * segment file, in stable (chapter, module) order.
 *
 * @param {string} book book slug, e.g. 'efnafraedi-2e'
 * @returns {Array<{ch: string, m: string}>}
 */
export function modulesWithSegments(book) {
  const srcRoot = path.join(REPO_ROOT, 'books', book, '01-source');
  const segRoot = path.join(REPO_ROOT, 'books', book, '02-for-mt');
  const out = [];
  for (const ch of fs
    .readdirSync(srcRoot)
    .filter((d) => fs.statSync(path.join(srcRoot, d)).isDirectory())
    .sort()) {
    for (const f of fs
      .readdirSync(path.join(srcRoot, ch))
      .filter((f) => f.endsWith('.cnxml'))
      .sort()) {
      const m = f.replace(/\.cnxml$/, '');
      if (fs.existsSync(path.join(segRoot, ch, `${m}-segments.en.md`))) out.push({ ch, m });
    }
  }
  return out;
}

/** The module's read-only `01-source` CNXML text. */
export const srcText = (b, ch, m) =>
  fs.readFileSync(path.join(REPO_ROOT, 'books', b, '01-source', ch, `${m}.cnxml`), 'utf8');

/** The module's committed `02-for-mt` EN segment file text. */
export const segTextOf = (b, ch, m) =>
  fs.readFileSync(path.join(REPO_ROOT, 'books', b, '02-for-mt', ch, `${m}-segments.en.md`), 'utf8');

/** The `{cnxml, segText}` ctx a Tier-1 per-module gate takes. */
export const modCtx = (b, ch, m) => ({ cnxml: srcText(b, ch, m), segText: segTextOf(b, ch, m) });

/**
 * Every LIVE `02-mt-output` IS segment file of `book`, in stable path order — the
 * Tier-2 population, and it is NOT the Tier-1 one.
 *
 * ⚠️ IT DRIVES FROM `02-mt-output`, NOT FROM `01-source`, AND THAT IS A DELIBERATE
 * DEPARTURE FROM `modulesWithSegments` ABOVE. Tier 2 judges what came BACK from the
 * paid MT, and a large part of that has no `01-source` counterpart at all: organic's
 * `exercises-segments.is.md` bundles are its own files, not modules. Driving from the
 * source side would silently drop them — and they are exactly where A1's only natural
 * must-trip lives (4 of them), so the drop would read as "A1 never fires".
 *
 * ⚠️ `chapter-metadata-*` IS EXCLUDED: those units carry `SEG:chapter:…` markers and
 * no module id, and Tier 1's own ctx guard already treats them as a separate class.
 * Including them changes every count below without changing what is being measured.
 *
 * ⚠️ The `-segments.is.md` suffix filter is what keeps dated backups out — a backup is
 * `…-segments.is.<date>.md` and cannot end with the live suffix. Measured 2026-08-25:
 * chemistry 149, organic 48, micro 10.
 *
 * @param {string} book book slug
 * @returns {string[]} absolute paths
 */
export function mtOutputSegmentFiles(book) {
  const root = path.join(REPO_ROOT, 'books', book, '02-mt-output');
  const out = [];
  const walk = (dir) => {
    for (const e of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('-segments.is.md') && !e.name.startsWith('chapter-metadata')) {
        out.push(p);
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

/** The `02-for-mt` EN counterpart of an IS segment file path, or null if there is none. */
export function enCounterpart(isPath) {
  const en = isPath
    .replace('/02-mt-output/', '/02-for-mt/')
    .replace('-segments.is.md', '-segments.en.md');
  return fs.existsSync(en) ? en : null;
}
