// §C110 — a re-extract advances 02-for-mt while a LOCKED 02-mt-output stays
// frozen, so the two halves of one module end up at different vintages. Inject
// catches it two stages later and refuses the module ("incomplete injection"),
// which names the wrong cause. These tests pin the diagnostic AT THE POINT OF
// DIVERGENCE — extraction time — which is the only place that can name it.
//
// Real .locked markers on a real temp tree, via the real isMtLocked: the risky
// part of this feature is deriving the mtOutput path from what extraction
// knows, and a stubbed lock predicate would pass while the path was wrong.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mtLockWarnings } from '../cnxml-extract.js';

const dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

/** A book tree with an 02-mt-output/<chapterDir>/ holding the named modules. */
function bookWith(chapterDir, { locked = [], unlocked = [] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'c110-'));
  dirs.push(root);
  const bookDir = path.join(root, 'books', 'efnafraedi-2e');
  const mtDir = path.join(bookDir, '02-mt-output', chapterDir);
  mkdirSync(mtDir, { recursive: true });
  for (const m of [...locked, ...unlocked]) {
    writeFileSync(path.join(mtDir, `${m}-segments.is.md`), '<!-- SEG:x:para:y -->\nhalló\n');
  }
  for (const m of locked) {
    writeFileSync(
      path.join(mtDir, `${m}-segments.locked`),
      JSON.stringify({ lockedAt: '2026-08-22T00:00:00.000Z', reason: 'test' })
    );
  }
  return bookDir;
}

describe('§C110 mtLockWarnings — extraction-time diagnostic for edit-locked modules', () => {
  it('reports a module whose MT output is locked', () => {
    const bookDir = bookWith('ch01', { locked: ['m68664'] });
    expect(mtLockWarnings(bookDir, 1, ['m68664']).locked).toEqual(['m68664']);
  });

  it('does not report an unlocked module in the same chapter', () => {
    const bookDir = bookWith('ch01', { locked: ['m68664'], unlocked: ['m68665'] });
    expect(mtLockWarnings(bookDir, 1, ['m68664', 'm68665']).locked).toEqual(['m68664']);
  });

  it('does not report a module that has no MT output at all', () => {
    const bookDir = bookWith('ch01', { unlocked: [] });
    expect(mtLockWarnings(bookDir, 1, ['m99999']).locked).toEqual([]);
  });

  // The two-conventions trap (CLAUDE.md § Directory Structure): appendices is
  // NOT ch-1. Getting this wrong makes the check silently never fire there.
  it("resolves the appendices sentinel -1 to 'appendices', not 'ch-1'", () => {
    const bookDir = bookWith('appendices', { locked: ['m00099'] });
    expect(mtLockWarnings(bookDir, -1, ['m00099']).locked).toEqual(['m00099']);
  });

  it("resolves the literal 'appendices' chapter the same way", () => {
    const bookDir = bookWith('appendices', { locked: ['m00099'] });
    expect(mtLockWarnings(bookDir, 'appendices', ['m00099']).locked).toEqual(['m00099']);
  });

  it('names the module and the consequence in the per-module warning', () => {
    const bookDir = bookWith('ch01', { locked: ['m68664'] });
    const [warning] = mtLockWarnings(bookDir, 1, ['m68664']).warnings;
    expect(warning).toContain('m68664');
  });

  it('returns no summary when nothing is locked', () => {
    const bookDir = bookWith('ch01', { unlocked: ['m68665'] });
    expect(mtLockWarnings(bookDir, 1, ['m68665']).summary).toBeNull();
  });

  it('summarises the count at run end', () => {
    const bookDir = bookWith('ch01', { locked: ['m68663', 'm68664'], unlocked: ['m68665'] });
    expect(mtLockWarnings(bookDir, 1, ['m68663', 'm68664', 'm68665']).summary).toContain('2');
  });

  // The function is generic over ids, so it handles chapter-metadata already —
  // that assertion would pass without any production change and prove nothing.
  // The real gap is the WIRING (see the wiring block below): main() rewrites
  // chapter-metadata-segments.en.md unconditionally, and a real lock exists on
  // efnafraedi-2e ch05's chapter-metadata, so that leg diverges exactly like a
  // module does. Kept here only to document that the id shape is supported.
  it('treats chapter-metadata as an ordinary id', () => {
    const bookDir = bookWith('ch05', { locked: ['chapter-metadata'] });
    expect(mtLockWarnings(bookDir, 5, ['chapter-metadata']).locked).toEqual(['chapter-metadata']);
  });

  it('names every locked module in the summary, not just the count', () => {
    const bookDir = bookWith('ch01', { locked: ['m68663', 'm68664'] });
    const { summary } = mtLockWarnings(bookDir, 1, ['m68663', 'm68664']);
    expect(summary).toContain('m68663');
  });
});

// A GATE THAT IS NEVER CALLED IS INDISTINGUISHABLE FROM ONE THAT DOES NOT
// EXIST (CLAUDE.md § KEY LESSONS). Unit tests cannot see a missing connection,
// so acceptance counts the PRODUCTION call site, not the suite being green.
describe('§C110 wiring — the diagnostic is actually reached by the extractor', () => {
  // Counting `mtLockWarnings(` across the whole file would be satisfied by the
  // function's OWN definition — a check that passes for the wrong reason. Scope
  // the count to main()'s body so only a real call site can satisfy it.
  it('main() calls mtLockWarnings, so the check is not merely defined', () => {
    const src = readFileSync(new URL('../cnxml-extract.js', import.meta.url), 'utf-8');
    const start = src.indexOf('async function main()');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body).toContain('mtLockWarnings(');
  });

  // The chapter-title leg rewrites chapter-metadata-segments.en.md on every run
  // and a real lock exists on efnafraedi-2e ch05's chapter-metadata, so it can
  // diverge exactly like a module. Only a connection assertion can see this —
  // the function under test is generic and would pass either way.
  it('main() includes chapter-metadata in the ids it checks', () => {
    const src = readFileSync(new URL('../cnxml-extract.js', import.meta.url), 'utf-8');
    const start = src.indexOf('async function main()');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body).toContain("'chapter-metadata'");
  });

  it('the lock check runs AFTER the chapter-title leg, or it cannot see it', () => {
    const src = readFileSync(new URL('../cnxml-extract.js', import.meta.url), 'utf-8');
    const start = src.indexOf('async function main()');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body.indexOf('mtLockWarnings(')).toBeGreaterThan(body.indexOf("'chapter-metadata'"));
  });

  it('the wiring probe reads a real main() body (control for the slice above)', () => {
    const src = readFileSync(new URL('../cnxml-extract.js', import.meta.url), 'utf-8');
    const start = src.indexOf('async function main()');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    // If the slice ever stops finding main(), every wiring assertion above
    // would vacuously pass on an empty string. This is that guard.
    expect(body).toContain('parseCliArgs(process.argv');
  });
});
