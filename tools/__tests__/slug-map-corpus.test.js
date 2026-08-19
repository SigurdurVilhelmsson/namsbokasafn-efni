import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { slugMapFilename } from '../lib/slug-map.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * §C9/§C103 corpus pin — the committed slug maps must satisfy the contract they
 * declare to namsbokasafn-vefur.
 *
 * Why this exists: the map is DATA, not build output. It is written once at prune
 * time and is not regenerable, and §C103 explicitly sanctions hand-editing it to
 * backfill renames that predate prune-on-rename. So the one artifact in this repo
 * that a human is invited to edit by hand is also the one nothing was checking.
 *
 * The two invariants are the ones vefur actually depends on:
 *   1. every `to` names a page that CURRENTLY EXISTS — otherwise a redirect lands
 *      on a 404, which is worse than the dead URL it replaced;
 *   2. that page carries the recorded `moduleId` — vefur fails closed by matching
 *      it, so a wrong id silently disables the redirect rather than misfiring.
 */

function committedMaps() {
  const out = [];
  const booksDir = path.join(REPO_ROOT, 'books');
  for (const book of fs.readdirSync(booksDir).sort()) {
    const pub = path.join(booksDir, book, '05-publication');
    if (!fs.existsSync(pub)) continue;
    for (const track of fs.readdirSync(pub).sort()) {
      const trackDir = path.join(pub, track);
      if (!fs.statSync(trackDir).isDirectory()) continue;
      const mapPath = path.join(trackDir, slugMapFilename(track));
      if (fs.existsSync(mapPath)) out.push({ book, track, trackDir, mapPath });
    }
  }
  return out;
}

const maps = committedMaps();

describe('§C9 slug maps satisfy their declared contract', () => {
  it('finds committed maps at all (harness control)', () => {
    // Without this, an empty discovery makes every case below vacuously pass.
    expect(maps.length).toBeGreaterThan(0);
  });

  for (const { book, track, trackDir, mapPath } of maps) {
    it(`${book}/${track} — every \`to\` exists and carries its recorded moduleId`, () => {
      const { renames } = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      const problems = [];
      let checked = 0;

      for (const [from, entry] of Object.entries(renames)) {
        if (entry.to === from) {
          problems.push(`${from}: self-referential (to === from)`);
          continue;
        }
        const toAbs = path.join(trackDir, entry.to);
        if (!fs.existsSync(toAbs)) {
          problems.push(`${from} -> ${entry.to}: target page does not exist`);
          continue;
        }
        const id = fs.readFileSync(toAbs, 'utf8').match(/data-module-id="([^"]+)"/)?.[1];
        if (id !== entry.moduleId) {
          problems.push(
            `${from} -> ${entry.to}: page carries ${id}, map records ${entry.moduleId}`
          );
          continue;
        }
        // The `from` must be gone, or this records a rename that did not happen.
        if (fs.existsSync(path.join(trackDir, from))) {
          problems.push(`${from}: source page still exists — not a rename`);
          continue;
        }
        checked++;
      }

      // Positive control travels with the assertion: a harness that resolved
      // nothing would report `checked: 0` and cannot pass as clean.
      expect({ problems, anyChecked: checked > 0 }).toEqual({ problems: [], anyChecked: true });
    });
  }
});
