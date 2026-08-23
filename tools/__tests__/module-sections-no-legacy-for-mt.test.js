// §C113 follow-on — `02-for-mt` must no longer be a source of Icelandic title
// segments. It is a GENERATED directory whose contract is the English extraction
// (`*-segments.en.md`); the 30 committed `*-segments.is.md` that used to live
// there were legacy residue of a pre-2026-03 layout, and while they existed they
// outranked BOTH reviewed translations and fresh MT for the section title — which
// becomes the reader slug.
//
// WHY THIS IS A STRUCTURAL ASSERTION AND NOT A BEHAVIOURAL ONE, stated plainly so
// the next reader does not "improve" it into something weaker:
//   - `buildModuleSections` anchors on REPO_ROOT via import.meta.url and takes no
//     books-root override, so a test cannot point it at a fixture tree.
//   - There are now ZERO `*-segments.is.md` under any book's `02-for-mt`, so no
//     real book can distinguish the two implementations behaviourally.
//   - The obvious alternative guard — "03-faithful-translation beats 02-mt-output"
//     — was MEASURED and cannot discriminate: for all four chemistry modules that
//     have both files, the titles are byte-identical. It would pass either way.
// The observable property being protected is therefore the precedence list itself.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'node:fs/promises';

const SRC = new URL('../lib/module-sections.js', import.meta.url);

/** The `segDirs` array literal — the precedence list under test. */
function segDirsSource() {
  const src = readFileSync(SRC, 'utf-8');
  const start = src.indexOf('const segDirs = [');
  if (start === -1) return '';
  return src.slice(start, src.indexOf('];', start));
}

describe('§C113 — 02-for-mt is not a title-segment source', () => {
  it('the segment precedence list does not include 02-for-mt', () => {
    expect(segDirsSource()).not.toContain('02-for-mt');
  });

  it('the probe actually found the precedence list (control for the slice above)', () => {
    // Without this, a renamed variable would make the assertion above pass
    // vacuously on an empty string — the exact failure mode this repo logs as
    // "an absence you manufactured".
    expect(segDirsSource()).toContain('03-faithful-translation');
  });

  it('the surviving precedence still prefers reviewed translations over raw MT', () => {
    const s = segDirsSource();
    expect(s.indexOf('03-faithful-translation')).toBeLessThan(s.indexOf('02-mt-output'));
  });
});

describe('§C113 — the corpus is actually clean, not just the code', () => {
  it('no book has a *-segments.is.md under 02-for-mt', async () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    const found = [];
    for await (const f of glob('books/*/02-for-mt/*/*-segments.is.md', { cwd: root })) {
      found.push(f);
    }
    expect(found).toEqual([]);
  });

  it('the glob works (control) — 02-for-mt does contain English segments', async () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    const found = [];
    for await (const f of glob('books/*/02-for-mt/*/*-segments.en.md', { cwd: root })) {
      found.push(f);
    }
    expect(found.length).toBeGreaterThan(0);
  });
});
