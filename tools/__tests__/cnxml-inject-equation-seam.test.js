// Regression test for the WS4 item 5 "second seam" bug: standalone <equation> blocks
// (and example/exercise/note math) are sliced VERBATIM out of `originalCnxml` by
// regex-based builders in cnxml-inject.js and never touch the `equations` object,
// so substituting only the equations object (Task 2) leaves their math labels in
// English. The fix substitutes `originalCnxml` itself at the read seam in
// loadModuleInputs() so every builder that slices from it inherits the substitution.
//
// Uses the real book fixture (mirrors tools/__tests__/pipeline-integration.test.js):
// module m68786 (ch12) is the confirmed real-world repro — its source has two
// <m:mtext>rate</m:mtext> labels, one reachable only via the inline [[MATH:N]] →
// equations-object path, and one inside a standalone
// <equation id="fs-idm243742160"> sliced straight from originalCnxml.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, cpSync, rmSync, mkdtempSync } from 'fs';
import { join, sep } from 'path';
import { tmpdir } from 'os';

const REAL_ROOT = join(import.meta.dirname, '..', '..');
const TOOLS = join(REAL_ROOT, 'tools');

let ROOT;
let BOOKS;

beforeAll(() => {
  ROOT = mkdtempSync(join(tmpdir(), 'efni-equation-seam-'));
  BOOKS = join(ROOT, 'books', 'efnafraedi-2e');
  // Same exclusion policy as pipeline-integration.test.js: drop media/ (heavy images +
  // image-mapping.json) and .backup artifacts so the copy stays small and fast.
  cpSync(join(REAL_ROOT, 'books', 'efnafraedi-2e'), BOOKS, {
    recursive: true,
    filter: (src) => !src.includes(`${sep}media`) && !src.includes('.backup'),
  });
}, 60_000);

afterAll(() => {
  if (ROOT) rmSync(ROOT, { recursive: true, force: true });
});

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
}

describe('originalCnxml math-label substitution seam (standalone <equation>)', () => {
  it('substitutes the English math label inside a standalone <equation> block (m68786, ch12)', () => {
    run(`node ${join(TOOLS, 'cnxml-inject.js')} --book efnafraedi-2e --chapter 12 --module m68786`);

    const outputPath = join(BOOKS, '03-translated', 'mt-preview', 'ch12', 'm68786.cnxml');
    expect(existsSync(outputPath)).toBe(true);

    const cnxml = readFileSync(outputPath, 'utf8');

    // The standalone equation (never touches the `equations` object at emit time —
    // it's sliced verbatim from originalCnxml by buildEquation) must have its
    // English math label substituted.
    const equationMatch = cnxml.match(/<equation id="fs-idm243742160"[\s\S]*?<\/equation>/);
    expect(
      equationMatch,
      'standalone <equation id="fs-idm243742160"> not found in output'
    ).not.toBeNull();
    expect(equationMatch[0]).toContain('<m:mtext>hraði</m:mtext>');
    expect(equationMatch[0]).not.toContain('<m:mtext>rate</m:mtext>');

    // The inline [[MATH:N]] occurrence (routed through the equations object) should
    // also be substituted — confirming both paths agree, not just the fixed one.
    const bareRateLabels = (cnxml.match(/<m:mtext>rate<\/m:mtext>/g) || []).length;
    expect(bareRateLabels).toBe(0);
    const hradiLabels = (cnxml.match(/<m:mtext>hraði<\/m:mtext>/g) || []).length;
    expect(hradiLabels).toBeGreaterThanOrEqual(2);
  });
});

// Regression test for WS4 #3: the unmapped-math-label WARNING must also cover the
// second seam. Before the fix, reportMathLabels() only read Object.values(equations)
// — a label whose ONLY occurrence is inside a standalone <equation> (sliced verbatim
// from originalCnxml, never entering the equations object) shipped English with no
// warning. The fix runs reportMathLabels() on the raw originalCnxml instead.
describe('unmapped math label report covers standalone <equation> math (WS4 #3)', () => {
  it('warns about a label that appears only in a standalone <equation>, not in the equations object', () => {
    const sourcePath = join(BOOKS, '01-source', 'ch12', 'm68786.cnxml');
    const original = readFileSync(sourcePath, 'utf8');

    // "enzyme" is all-lowercase ASCII >=3 chars (buckets as a label), is absent from
    // efnafraedi-2e's math-label-map.json overlay, and never occurs as m:mtext/m:mi
    // content anywhere else in the book — so this is its one and only unmapped
    // occurrence, planted inside a standalone <equation> that buildEquation slices
    // verbatim from originalCnxml (never touching the `equations` object).
    const marker = '<equation id="fs-idm243742160"';
    expect(original.includes(marker), 'anchor equation not found in fixture').toBe(true);
    const injected = original.replace(
      marker,
      '<equation id="fs-test-ws4-3-enzyme" class="unnumbered"><m:math><m:mrow><m:mtext>enzyme</m:mtext></m:mrow></m:math></equation>' +
        marker
    );
    expect(injected).not.toBe(original);
    writeFileSync(sourcePath, injected, 'utf8');

    // Capture stderr (merged via shell redirection) — console.error warnings land there.
    const output = execSync(
      `node ${join(TOOLS, 'cnxml-inject.js')} --book efnafraedi-2e --chapter 12 --module m68786 2>&1`,
      { cwd: ROOT, encoding: 'utf8', timeout: 60_000 }
    );

    expect(output).toMatch(/unmapped math label\(s\): .*\benzyme\b/);
  });
});
