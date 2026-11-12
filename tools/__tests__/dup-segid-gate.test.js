import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { checkDuplicateSegIds, analyzeModule } from '../lib/extraction-coverage.js';

const seg = (id, text) => `<!-- SEG:${id} -->\n${text}\n`;

describe('checkDuplicateSegIds — content classification', () => {
  it('classifies a byte-identical duplicate as benign', () => {
    const segText = seg('m1:para:p1', 'Hello world') + seg('m1:para:p1', 'Hello world');
    const { rawDup } = checkDuplicateSegIds(null, segText);
    expect(rawDup).toHaveLength(1);
    expect(rawDup[0]).toMatchObject({ segId: 'm1:para:p1', count: 2, kind: 'benign' });
  });

  it('classifies a duplicate differing only in [[MATH:N]] index as benign', () => {
    const segText =
      seg('m1:para:p1', '4.586 [[MATH:12]] atoms') + seg('m1:para:p1', '4.586 [[MATH:13]] atoms');
    const { rawDup } = checkDuplicateSegIds(null, segText);
    expect(rawDup[0].kind).toBe('benign');
  });

  it('classifies a duplicate with different words as real', () => {
    const segText = seg('m1:para:p1', 'The cat sat') + seg('m1:para:p1', 'A dog ran');
    const { rawDup } = checkDuplicateSegIds(null, segText);
    expect(rawDup[0].kind).toBe('real');
    expect(rawDup[0].sampleA).toContain('cat');
    expect(rawDup[0].sampleB).toContain('dog');
  });

  it('does not flag a unique seg-id', () => {
    const segText = seg('m1:para:p1', 'x') + seg('m1:para:p2', 'y');
    expect(checkDuplicateSegIds(null, segText).rawDup).toHaveLength(0);
  });
});

describe('analyzeModule — hasFindings counts only real dups', () => {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml"><content><section id="s"><title>S</title></section></content></document>`;
  it('is clean when the only duplicate is benign', () => {
    const segText = seg('m1:para:p1', 'same') + seg('m1:para:p1', 'same');
    expect(analyzeModule(cnxml, segText).hasFindings).toBe(false);
  });
  it('flags when a duplicate is real', () => {
    const segText = seg('m1:para:p1', 'alpha') + seg('m1:para:p1', 'beta gamma');
    expect(analyzeModule(cnxml, segText).hasFindings).toBe(true);
  });
});

describe('verify-extraction-coverage gate — benign dups do not fail', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const cli = join(repoRoot, 'tools', 'verify-extraction-coverage.js');

  it('exits 0 on frozen efnafraedi-2e, which holds no duplicate seg-id since G1.12', () => {
    // Until G1.12's re-extract this book held 285 benign duplicates and the gate printed its
    // benign note. The re-extract removed them; the benign path is now pinned by the planted
    // test below. Throws on non-zero exit; passing means exit 0.
    const out = execFileSync('node', [cli, '--book', 'efnafraedi-2e'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(out).toMatch(/0 duplicate seg-id\(s\) across 0 module\(s\)/);
    expect(out).not.toMatch(/benign duplicate seg-id/i);
  });

  // PLANTED (hermetic, through --root), because the corpus no longer holds a duplicate. Both arms
  // through the real CLI: a benign duplicate exits 0 with the benign note; a real one exits 1.
  it('planted: a benign duplicate exits 0 with its note, and a real duplicate exits 1', () => {
    const root = mkdtempSync(join(tmpdir(), 'dup-segid-gate-'));
    try {
      const book = join(root, 'books', 'planted');
      mkdirSync(join(book, '01-source', 'ch01'), { recursive: true });
      mkdirSync(join(book, '02-for-mt', 'ch01'), { recursive: true });
      writeFileSync(
        join(book, '01-source', 'ch01', 'm1.cnxml'),
        '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
          '<para id="p1">Hello world</para></content></document>'
      );
      const run = (segText) => {
        writeFileSync(join(book, '02-for-mt', 'ch01', 'm1-segments.en.md'), segText);
        return spawnSync('node', [cli, '--book', 'planted', '--root', root], {
          cwd: repoRoot,
          encoding: 'utf8',
        });
      };
      const benign = run(seg('m1:para:p1', 'Hello world') + seg('m1:para:p1', 'Hello world'));
      expect([benign.status, benign.stdout]).toEqual([
        0,
        expect.stringMatching(/1 benign duplicate seg-id/),
      ]);
      const real = run(seg('m1:para:p1', 'Hello world') + seg('m1:para:p1', 'Goodbye moon'));
      expect(real.status).toBe(1);
      expect(real.stdout).toMatch(/duplicate seg-id m1:para:p1 \(2×\) — DIFFERENT visible text/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
