import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * §C108 corpus pin — a book's `server/data/<catalogue>.json` must assign section
 * numbers in the order its own read-only `01-source/collection-order.json` gives,
 * not in alphabetical FILENAME order.
 *
 * WHY THIS EXISTS. The archived one-time generators
 * (`tools/archived/gen-<book>-json.js`) build the catalogue from
 * `readdirSync(chapterDir).filter('.cnxml').sort()` and crown the
 * alphabetically-FIRST file `intro`. Module ids do not sort into reading order,
 * so the catalogue silently disagrees with the book. Measured: replicating that
 * ordering reproduces the committed `organic-chemistry.json` across all 337
 * modules with ZERO disagreements — the cause is proved by reproduction, not
 * inferred.
 *
 * WHAT IT IS AND IS NOT. This compares the catalogue against `collection-order.json`,
 * which is READ-ONLY, OpenStax-derived, and the authoritative reading order. Two
 * artifacts merely differing would say nothing about which is wrong; the manifest
 * is the third party that settles it. For `lifraen-efnafraedi` ch18 it agrees with
 * a fourth, fully independent source — the CNXML's own
 * `md:document-class`/`class="introduction"` (`m00075` is the introduction, and
 * `module-sections.js:247` derives the page slug from exactly that) — while the
 * committed catalogue named `m00074`.
 *
 * SEVERITY, STATED HONESTLY. Since §C104 the index's `sectionSlug`/`sectionTitle`
 * come from the rendered page, and page slugs come from `documentClass`, so a
 * wrong entry here is a wrong DISPLAYED section number, not a broken link
 * (`generate-index.js:467` says so at the site). It is pinned anyway because the
 * defect is latent-by-volume: organic has ~13 rendered pages today and 342
 * modules, so the cost of finding it after the §C82 run is re-rendering and
 * re-indexing a complete textbook.
 *
 * The matching entries are the built-in POSITIVE CONTROL. A harness that read the
 * wrong directory, or compared a map against itself, would report every book clean
 * — so each assertion carries the number that DID match alongside the number that
 * did not.
 */

const KNOWN_BAD = {
  // §C108 / §C109 — College Physics is WITHDRAWN from publication (a reversible
  // pause; nothing is deleted). Its catalogue carries 66 wrong section numbers
  // across 12 chapters and is deliberately NOT being corrected, because the book
  // ships to no reader. Excluded from the equality assertion, NOT skipped: the
  // block below asserts the exclusion is still WARRANTED, so if this book is ever
  // fixed or re-published this test goes red and forces the entry out.
  //
  // ⚠️ The exclusion is keyed on the SLUG, never on publication status — four of
  // five books are `status: 'preview'` in vefur's registry INCLUDING the kept
  // `lifraen-efnafraedi`, so a status-keyed rule would silently exclude a book
  // that must stay covered.
  'edlisfraedi-2e': '§C108 — withdrawn from publication per §C109, deliberately uncorrected',
  // §C108, FOUND BY THIS TEST 2026-08-23 — Microbiology is the THIRD book with the
  // defect (8 wrong sections across ch24 and ch25, of 153 compared), and §C108's
  // own survey had recorded it as "0/8" while explicitly warning that number was
  // measured over too few rendered pages to be evidence. That hedge is what made
  // this findable. Also withdrawn per §C109, so deliberately uncorrected here.
  orverufraedi: '§C108 — withdrawn from publication per §C109, deliberately uncorrected',
};

/**
 * MEASURED 2026-08-23, all five books, with the cause proved by reproduction:
 * replicating `readdirSync().filter('.cnxml').sort()` reproduces the committed
 * catalogue exactly for, and only for, the defective books.
 *
 *   book                 wrong sections   generated alphabetically?
 *   efnafraedi-2e            0 / 135        no  (8 disagreements)  <- kept, clean
 *   liffraedi-2e             0 / 255        no  (5 disagreements)  <- clean
 *   lifraen-efnafraedi       6 / 337        YES, proved            <- kept, FIXED
 *   orverufraedi             8 / 153        YES, proved            <- withdrawn
 *   edlisfraedi-2e          66 / 278        YES, proved            <- withdrawn
 *
 * The correlation is exact — the three alphabetically-generated books are the
 * three defective ones — which is what makes the two zeros a control rather than
 * an absence.
 */

/** Catalogues in server/data, keyed by their own top-level `slug`. */
function cataloguesBySlug() {
  const dir = path.join(REPO_ROOT, 'server', 'data');
  const out = new Map();
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    let j;
    try {
      j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch {
      continue; // not a catalogue (e.g. decisions.json); shape check below filters too
    }
    if (j && typeof j.slug === 'string' && Array.isArray(j.chapters))
      out.set(j.slug, { file: f, json: j });
  }
  return out;
}

/** section assignment implied by the authoritative reading order. */
function manifestSections(slug) {
  const p = path.join(REPO_ROOT, 'books', slug, '01-source', 'collection-order.json');
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const out = new Map();
  for (const ch of j.chapters || []) {
    (ch.modules || []).forEach((id, i) => out.set(id, i === 0 ? 'intro' : `${ch.chapter}.${i}`));
  }
  return out;
}

/** section assignment as committed. */
function catalogueSections(json) {
  const out = new Map();
  for (const ch of json.chapters || []) {
    for (const m of ch.modules || []) out.set(m.id, String(m.section));
  }
  return out;
}

function compare(slug, json) {
  const manifest = manifestSections(slug);
  if (!manifest) return null;
  const committed = catalogueSections(json);
  const mismatches = [];
  let matched = 0;
  for (const [id, want] of manifest) {
    if (!committed.has(id)) continue; // catalogue need not cover every module
    if (committed.get(id) === String(want)) matched += 1;
    else mismatches.push(`${id}: catalogue "${committed.get(id)}" vs manifest "${want}"`);
  }
  return { matched, mismatches, compared: matched + mismatches.length };
}

/** Books carrying BOTH a catalogue and a collection manifest, discovered not listed. */
function coveredBooks() {
  const out = [];
  for (const [slug, { file, json }] of cataloguesBySlug()) {
    if (!fs.existsSync(path.join(REPO_ROOT, 'books', slug, '01-source', 'collection-order.json')))
      continue;
    out.push({ slug, file, json });
  }
  return out;
}

describe('§C108 — server/data catalogues follow collection-order.json', () => {
  const books = coveredBooks();

  it('finds books to check at all (guards against a vacuous pass)', () => {
    expect(books.length).toBeGreaterThan(0);
    // The two kept books must both be in scope — a rename or a moved file that
    // dropped either would otherwise make this whole suite silently trivial.
    const slugs = books.map((b) => b.slug);
    expect(slugs).toContain('efnafraedi-2e');
    expect(slugs).toContain('lifraen-efnafraedi');
  });

  for (const { slug, file } of books) {
    if (KNOWN_BAD[slug]) continue;
    it(`${slug} (${file}) assigns every section in collection order`, () => {
      const r = compare(slug, cataloguesBySlug().get(slug).json);
      expect(r).not.toBeNull();
      // Positive control in the same assertion: a broken harness compares 0.
      expect(r.compared).toBeGreaterThan(0);
      expect({ slug, matched: r.matched, mismatches: r.mismatches }).toEqual({
        slug,
        matched: r.compared,
        mismatches: [],
      });
    });
  }

  for (const [slug, why] of Object.entries(KNOWN_BAD)) {
    it(`${slug} is still legitimately excluded — ${why}`, () => {
      const entry = cataloguesBySlug().get(slug);
      if (!entry) return; // book removed entirely; nothing to warrant
      const r = compare(slug, entry.json);
      expect(r).not.toBeNull();
      expect(r.compared).toBeGreaterThan(0); // control: we really did compare
      // If this book is ever corrected, this fails and the KNOWN_BAD entry must go.
      expect(r.mismatches.length).toBeGreaterThan(0);
    });
  }
});
