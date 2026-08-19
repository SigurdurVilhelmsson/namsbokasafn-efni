import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPublicationMap, loadPublicationPages, loadModuleMap } from '../generate-index.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * §C104 corpus pin — every `sectionSlug` a shipped index.json cites must name a
 * page that EXISTS in the same publication tree.
 *
 * This is a VALUE check, not a tally, per §C89: the defect it guards against
 * moved no count at all. `index.json` kept its 763 entries and every one kept a
 * non-null `sectionSlug`; five of them simply named a file that had been renamed
 * out of existence. Only comparing the slug against the directory sees it.
 *
 * The already-resolving entries are the built-in positive control — a harness
 * that resolved nothing, or globbed the wrong directory, would report every book
 * as clean, so each assertion carries its own "and N did resolve".
 */

const KNOWN_BAD = {
  // §C108 — this book's server/data catalogue disagrees with BOTH its own
  // 01-source/collection-order.json and its rendered pages, so its committed
  // index cites slugs derived from wrong section numbers. Excluded from the
  // resolution assertion, NOT skipped: the block below asserts the exclusion is
  // still WARRANTED, so fixing §C108 turns this test red and forces the entry out.
  'edlisfraedi-2e': '§C108',
};

/** Books that ship an index.json, discovered rather than listed. */
function publishedIndexes() {
  const out = [];
  for (const book of fs.readdirSync(path.join(REPO_ROOT, 'books')).sort()) {
    const pub = path.join(REPO_ROOT, 'books', book, '05-publication');
    if (!fs.existsSync(pub)) continue;
    for (const track of fs.readdirSync(pub).sort()) {
      const idx = path.join(pub, track, 'index.json');
      if (fs.existsSync(idx)) out.push({ book, track, idx });
    }
  }
  return out;
}

function renderedSlugs(book, track) {
  const dir = path.join(REPO_ROOT, 'books', book, '05-publication', track, 'chapters');
  const slugs = new Set();
  for (const ch of fs.readdirSync(dir)) {
    const chDir = path.join(dir, ch);
    if (!fs.statSync(chDir).isDirectory()) continue;
    for (const f of fs.readdirSync(chDir)) {
      if (f.endsWith('.html')) slugs.add(f.slice(0, -'.html'.length));
    }
  }
  return slugs;
}

const targets = publishedIndexes();

describe('§C104 — every shipped index.json sectionSlug names a real page', () => {
  it('finds the published indexes at all (harness control)', () => {
    // Without this, an empty discovery would make every case below vacuously pass.
    expect(targets.length).toBeGreaterThan(0);
  });

  for (const { book, track, idx } of targets) {
    const excluded = KNOWN_BAD[book];
    const label = `${book}/${track}${excluded ? ` [excluded: ${excluded}]` : ''}`;

    it.skipIf(excluded)(`${label} — no sectionSlug names a missing page`, () => {
      const real = renderedSlugs(book, track);
      const entries = JSON.parse(fs.readFileSync(idx, 'utf8')).entries;
      const dangling = entries.filter((e) => e.sectionSlug && !real.has(e.sectionSlug));
      const resolving = entries.filter((e) => e.sectionSlug && real.has(e.sectionSlug));

      expect({
        dangling: [...new Set(dangling.map((e) => e.sectionSlug))],
        resolvingCount: resolving.length > 0, // positive control, in the same assertion
      }).toEqual({ dangling: [], resolvingCount: true });
    });
  }
});

describe('§C108 exclusion is still warranted (self-retiring)', () => {
  const book = 'edlisfraedi-2e';
  const track = 'mt-preview';

  it('the catalogue still disagrees with the rendered pages for this book', () => {
    // The CAUSE. When §C108 is fixed this goes to 0 and the test fails, which is
    // the signal to delete this block and the KNOWN_BAD entry together.
    const pubMap = buildPublicationMap(loadPublicationPages(book, track));
    const modMap = loadModuleMap(book);
    const disagree = [...modMap.entries()].filter(([id, m]) => {
      const page = pubMap.get(id);
      if (!page || !m.section || m.section === 'intro') return false;
      return !page.slug.startsWith(`${m.section.replace('.', '-')}-`);
    });
    expect(disagree.length).toBeGreaterThan(0);
  });

  it('and chemistry does NOT disagree — the control that makes the above mean something', () => {
    const pubMap = buildPublicationMap(loadPublicationPages('efnafraedi-2e', 'mt-preview'));
    const modMap = loadModuleMap('efnafraedi-2e');
    const disagree = [...modMap.entries()].filter(([id, m]) => {
      const page = pubMap.get(id);
      if (!page || !m.section || m.section === 'intro') return false;
      return !page.slug.startsWith(`${m.section.replace('.', '-')}-`);
    });
    expect(disagree).toEqual([]);
  });
});
