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
  const writtenThisPass = new Set(renderedModules.values());

  for (const [filename, moduleId] of snap) {
    const current = renderedModules.get(moduleId);
    if (!current || current === filename) continue;
    // `filename` belonged to `moduleId` at snapshot time, but it is now the CURRENT
    // name of some OTHER module this pass just wrote (a name handoff between two
    // modules' slugs). Pruning it would delete that other module's fresh page and
    // record a rename onto it — silent content substitution. Skip both the unlink
    // and the record; the file is live and owned by whichever module wrote it.
    if (writtenThisPass.has(filename)) continue;

    const filePath = path.join(outputDir, filename);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Already gone — e.g. the renderer's own full-chapter sweep deleted every
        // .html before rendering. Expected and silent; still record the rename below.
      } else {
        // Any other failure means the superseded file is STILL ON DISK, so the
        // duplicate it exists to fix will persist even though we record the rename
        // (rule 5: a record with no unlink still beats no record at all).
        console.warn(
          `[publication-reconcile] failed to delete superseded page ${filePath} ` +
            `(${err.code}): the old page is still on disk and the duplicate will persist.`
        );
      }
    }

    pruned.push({
      from: `${chapterRelDir}/${filename}`,
      to: `${chapterRelDir}/${current}`,
      moduleId,
    });
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
