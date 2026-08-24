import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractSegments } from '../cnxml-extract.js';

// The corpus control the spec requires: on real source, alt segments must appear
// where none exist today. A green unit suite proves the fixtures work; this
// proves the change does what it claims on bytes we did not write.
const CHEM = path.join(process.cwd(), 'books/efnafraedi-2e/01-source');
const ORGANIC_SOURCE = path.join(process.cwd(), 'books/lifraen-efnafraedi/01-source');
const ORGANIC_MT = path.join(process.cwd(), 'books/lifraen-efnafraedi/02-for-mt');

/** All .cnxml files under a book's 01-source, across every chapter dir. */
function listAllSourceModules(sourceDir) {
  const out = [];
  for (const entry of fs.readdirSync(sourceDir)) {
    const chDir = path.join(sourceDir, entry);
    if (!fs.statSync(chDir).isDirectory()) continue;
    for (const f of fs.readdirSync(chDir)) {
      if (f.endsWith('.cnxml')) out.push(path.join(chDir, f));
    }
  }
  return out.sort();
}

/**
 * Organic's in-scope PREVIEW population — the 17 modules with extracted segments
 * already present in 02-for-mt/, matched to their 01-source .cnxml. Same method
 * Task 9 used: `m\d+-segments.en.md` basenames (strictly — this excludes
 * `exercises-segments.en.md` / `chapter-metadata-segments.en.md`, which are
 * chapter-level, not per-module, and do not match the `m\d+` shape).
 */
function listOrganicPreviewModules() {
  const basenames = new Set();
  for (const entry of fs.readdirSync(ORGANIC_MT)) {
    const chDir = path.join(ORGANIC_MT, entry);
    if (!fs.statSync(chDir).isDirectory()) continue;
    for (const f of fs.readdirSync(chDir)) {
      const m = f.match(/^(m\d+)-segments\.en\.md$/);
      if (m) basenames.add(m[1]);
    }
  }
  const out = [];
  for (const entry of fs.readdirSync(ORGANIC_SOURCE)) {
    const chDir = path.join(ORGANIC_SOURCE, entry);
    if (!fs.statSync(chDir).isDirectory()) continue;
    for (const f of fs.readdirSync(chDir)) {
      const m = f.match(/^(m\d+)\.cnxml$/);
      if (m && basenames.has(m[1])) out.push(path.join(chDir, f));
    }
  }
  return out.sort();
}

describe('§C81 corpus control', () => {
  it('emits alt segments across a real chemistry chapter', () => {
    const dir = path.join(CHEM, 'ch01');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml'));
    expect(files.length).toBeGreaterThan(0); // control: the glob found something

    let altCount = 0;
    let mediaWithAlt = 0;
    for (const f of files) {
      const cnxml = fs.readFileSync(path.join(dir, f), 'utf-8');
      mediaWithAlt += (cnxml.match(/\balt="[^"]+"/g) || []).length;
      altCount += extractSegments(cnxml).segments.filter((s) => s.type === 'alt').length;
    }

    expect(mediaWithAlt).toBeGreaterThan(0); // control: the chapter really has alt text
    expect(altCount).toBeGreaterThan(0); // the change fires on real input
  });

  // The spec's other corpus assertion: chemistry has ZERO id-less media, so the
  // positional fallback must never fire there. If it does, either the census was
  // wrong or altElementId is being called with a missing id it should have had.
  // Both positional forms are checked — the inline/figure counter's `media-N-alt`
  // AND the standalone counter's `standalone-N-alt` (altElementId's two `kind`
  // namespaces) — the brief's own regex only covered the first.
  it('produces no positional alt ids anywhere in chemistry', () => {
    const dir = path.join(CHEM, 'ch01');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml'));
    const positional = [];
    for (const f of files) {
      const cnxml = fs.readFileSync(path.join(dir, f), 'utf-8');
      for (const s of extractSegments(cnxml).segments) {
        if (
          s.type === 'alt' &&
          (/:alt:media-\d+-alt$/.test(s.id) || /:alt:standalone-\d+-alt$/.test(s.id))
        ) {
          positional.push(s.id);
        }
      }
    }
    expect(positional).toEqual([]);
  });
});

// §C81 Task 10 — the acceptance criterion for the duplicate-alt-segment fix
// ([LEAD] ruling: fix before the whole-branch review). Task 9 measured 5
// duplicate alt segment ids in chemistry (m68739.cnxml ×4, m68764.cnxml ×1) and
// 4 duplicate alt-TEXT emissions in organic's 17-module preview (m00033.cnxml,
// m00035.cnxml ×2, m00038.cnxml), all newly introduced by this branch (verified
// against pre-branch commit 40d0f0d4: zero existed there). This is a committed
// regression test over the real, full in-scope population — not a one-off script
// — so the fix (and its continued correctness) is checked on every run, not just
// this task's own verification.
describe('§C81 Task 10 — zero duplicate alt segments across the in-scope corpus', () => {
  it('chemistry: no module emits two alt segments sharing the same segment id (all 149 source modules)', () => {
    const files = listAllSourceModules(CHEM);
    // Control: the population must actually be the full in-scope set, not an
    // accidentally-empty or partially-globbed one.
    expect(files.length).toBe(149);

    const duplicates = [];
    for (const file of files) {
      const cnxml = fs.readFileSync(file, 'utf-8');
      const alts = extractSegments(cnxml).segments.filter((s) => s.type === 'alt');
      const counts = new Map();
      for (const a of alts) counts.set(a.id, (counts.get(a.id) || 0) + 1);
      for (const [id, count] of counts) {
        if (count > 1) duplicates.push({ file: path.basename(file), id, count });
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('organic preview: no module emits two alt segments sharing the same segment id (17 in-scope modules)', () => {
    const files = listOrganicPreviewModules();
    // Control: the population must actually be the 17-module in-scope preview
    // set Task 9 used, not an accidentally-empty or differently-scoped one.
    expect(files.length).toBe(17);

    const duplicates = [];
    for (const file of files) {
      const cnxml = fs.readFileSync(file, 'utf-8');
      const alts = extractSegments(cnxml).segments.filter((s) => s.type === 'alt');
      const counts = new Map();
      for (const a of alts) counts.set(a.id, (counts.get(a.id) || 0) + 1);
      for (const [id, count] of counts) {
        if (count > 1) duplicates.push({ file: path.basename(file), id, count });
      }
    }
    expect(duplicates).toEqual([]);
  });

  // Organic's media are id-less, so `altElementId()` falls back to positional
  // `${kind}-${index}-alt` ids — a double emission there produces two DIFFERENT
  // positional ids, not a colliding duplicate id (this is why the id-based check
  // above is structurally blind to organic's version of the defect — see
  // test-results/c81-alt-extraction-2026-08-15.json). Check duplicate TEXT
  // instead, the same method Task 9 used to find the original 4.
  it('organic preview: no module emits two alt segments with identical text (id-less media, 17 in-scope modules)', () => {
    const files = listOrganicPreviewModules();
    expect(files.length).toBe(17);

    const duplicates = [];
    for (const file of files) {
      const cnxml = fs.readFileSync(file, 'utf-8');
      const alts = extractSegments(cnxml).segments.filter((s) => s.type === 'alt');
      const counts = new Map();
      for (const a of alts) counts.set(a.text, (counts.get(a.text) || 0) + 1);
      for (const [text, count] of counts) {
        if (count > 1)
          duplicates.push({ file: path.basename(file), text: text.slice(0, 60), count });
      }
    }
    expect(duplicates).toEqual([]);
  });
});

// §C88 Unit A — the id-less table-cell population, corpus-wide.
//
// 🔴 WHY THIS IS A SEPARATE CASE FROM THE 17-MODULE PREVIEW ABOVE. Unit A's 244
// new alt segments live in 33 organic modules; the preview set is 17 modules
// chosen for a different reason and does not contain all of them. A duplicate-key
// check that happens not to cover the population it is supposed to guard reads
// exactly like one that does — so the scope is stated and asserted here.
//
// The failure this guards is not hypothetical: the `if (!media.id) continue` that
// Unit A removed was suppressing TWO defects while its comment documented one, and
// the undocumented half was a COLLISION — the emit site called
// `altElementId(media.id, 0)` with a hardcoded index, so every id-less media in a
// module would have collapsed onto a single `media-0-alt`.
describe('§C88 Unit A — id-less table-cell alt keys are unique and content-anchored', () => {
  it('organic, ALL 342 modules: no module emits two alt segments sharing an id', () => {
    const files = listAllSourceModules(ORGANIC_SOURCE);
    expect(files.length).toBe(342); // control: the walk really covered the book

    const duplicates = [];
    let altTotal = 0;
    for (const file of files) {
      const alts = extractSegments(fs.readFileSync(file, 'utf-8')).segments.filter(
        (s) => s.type === 'alt'
      );
      altTotal += alts.length;
      const counts = new Map();
      for (const a of alts) counts.set(a.id, (counts.get(a.id) || 0) + 1);
      for (const [id, count] of counts) {
        if (count > 1) duplicates.push({ file: path.basename(file), id, count });
      }
    }
    // Control: an empty `duplicates` means nothing if no alts were examined.
    // 2,163 since §C85-alt: Unit A's 244 plus the 245th (m00032's `cellParas` cell).
    expect(altTotal).toBe(2163);
    expect(duplicates).toEqual([]);
  }, 300_000);

  it('Unit A adds no positional alt ids — its key is anchored to content, not order', () => {
    // A positional key would pass the uniqueness case above and still be wrong: it
    // drifts with cell indexing, and an alt written to the wrong cell is SILENT —
    // no count moves (§C89). That is why `src` was chosen over an index, and this
    // is the assertion that separates the two.
    //
    // ⚠️ THE ASSERTION IS 17, NOT 0, AND THE DIFFERENCE IS A MEASUREMENT RATHER
    // THAN A CONCESSION. An earlier cut of this case asserted `[]` — a tidier,
    // stronger-looking claim that was simply FALSE: organic already emitted 17
    // `media-N-alt` ids from the INLINE-media path (`altElementId(media.id,
    // media.mediaIndex)`), which Unit A does not touch. Measured on both sides of
    // the change — 17 before, 17 after — so the number pins "Unit A contributed
    // none of them", which is the real claim. Asserting an absence that was never
    // true would have failed immediately; asserting one that happened to be true
    // for the wrong reason is the version that survives and rots.
    //
    // 📌 Those 17 are a LATENT instance of the very collision class Unit A closed
    // (a hardcoded/derived index rather than content). They are unique today —
    // the case above proves it corpus-wide — so this is a note, not a defect.
    const positional = { media: [], standalone: [] };
    let altTotal = 0;
    for (const file of listAllSourceModules(ORGANIC_SOURCE)) {
      for (const s of extractSegments(fs.readFileSync(file, 'utf-8')).segments) {
        if (s.type !== 'alt') continue;
        altTotal++;
        if (/:alt:media-\d+-alt$/.test(s.id)) positional.media.push(s.id);
        if (/:alt:standalone-\d+-alt$/.test(s.id)) positional.standalone.push(s.id);
      }
    }
    expect(altTotal).toBe(2163); // control: the population really was examined
    expect(positional.media).toHaveLength(17);
    expect(positional.standalone).toEqual([]);
  }, 300_000);
});
