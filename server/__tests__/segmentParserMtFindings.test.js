// server/__tests__/segmentParserMtFindings.test.js
//
// §C124 leg 1 — loadModuleForEditing attaches the MT finding to the segment it
// belongs to, so an editor opening a module sees WHICH row the machine got
// wrong.
//
// ⚠️ The interesting assertion here is the NEGATIVE one: an unflagged
// neighbour must come back with `mtFinding: null`. A badge that lights up
// every row is worse than no badge, because it trains the editor to ignore it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const segmentParser = require('../services/segmentParser');
const mtFindings = require('../lib/mtFindings');

const BOOK = 'testbook';
const MODULE = 'm00037';
let booksDir;

// ⚠️ The SEG marker takes NO SPACE after the colon. The spaced form parses to
// an EMPTY list, silently — prose across this repo writes it spaced for
// readability, and copying that into a fixture yields a test that measures
// nothing. This fixture is deliberately in the parser's real form.
const EN = `<!-- SEG:${MODULE}:para:para-00003 -->
The different arrangements of atoms that result from bond rotation.

<!-- SEG:${MODULE}:para:para-00004 -->
Conformers are represented in two ways.
`;
const IS = `<!-- SEG:${MODULE}:para:para-00003 -->
The different arrangements of atoms that result from bond rotation.

<!-- SEG:${MODULE}:para:para-00004 -->
Stellingarhverfur eru sýndar á tvo vegu.
`;

function write(rel, content) {
  const p = path.join(booksDir, BOOK, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-mtfind-'));
  segmentParser._setTestBooksDir(booksDir);
  mtFindings._setTestBooksDir(booksDir);
  write(`02-for-mt/ch03/${MODULE}-segments.en.md`, EN);
  write(`02-mt-output/ch03/${MODULE}-segments.is.md`, IS);
});
afterEach(() => {
  segmentParser._setTestBooksDir(null);
  mtFindings._setTestBooksDir(null);
  fs.rmSync(booksDir, { recursive: true, force: true });
});

const seg = (data, id) => data.segments.find((s) => s.segmentId === `${MODULE}:para:${id}`);

describe('loadModuleForEditing — MT findings on the segment they describe', () => {
  it('flags the reported segment and leaves its neighbour unflagged', () => {
    write(
      'residue-report.mt-preview.json',
      JSON.stringify({
        track: 'mt-preview',
        generatedAt: '2026-09-05T09:15:36.850Z',
        modules: {
          [MODULE]: { exact: [`${MODULE}:para:para-00003`], warnings: [], tolerated: [] },
        },
      })
    );

    const data = segmentParser.loadModuleForEditing(BOOK, 3, MODULE);

    expect(seg(data, 'para-00003').mtFinding).toEqual({ kind: 'exact' });
    // THE CONTROL — without this, "every segment is flagged" also passes above.
    expect(seg(data, 'para-00004').mtFinding).toBeNull();
  });

  it('carries the report vintage so the editor can judge staleness', () => {
    write(
      'residue-report.mt-preview.json',
      JSON.stringify({
        track: 'mt-preview',
        generatedAt: '2026-09-05T09:15:36.850Z',
        modules: {
          [MODULE]: { exact: [`${MODULE}:para:para-00003`], warnings: [], tolerated: [] },
        },
      })
    );

    const data = segmentParser.loadModuleForEditing(BOOK, 3, MODULE);
    expect(data.mtFindingsGeneratedAt).toBe('2026-09-05T09:15:36.850Z');
  });

  it('loads the module normally when no report exists — every segment unflagged', () => {
    const data = segmentParser.loadModuleForEditing(BOOK, 3, MODULE);

    // CONTROL FIRST: the module really did load, so the nulls below mean
    // "no findings" rather than "nothing was read".
    expect(data.segments).toHaveLength(2);
    expect(data.segments.every((s) => s.mtFinding === null)).toBe(true);
    expect(data.mtFindingsGeneratedAt).toBeNull();
  });

  it('reads the FAITHFUL report when the module was loaded from faithful', () => {
    // Same segment id flagged in BOTH reports, with different kinds — so the
    // assertion can only pass if the right file was chosen. A single-report
    // fixture would pass even if the track were ignored entirely.
    write(`03-faithful-translation/ch03/${MODULE}-segments.is.md`, IS);
    write(
      'residue-report.mt-preview.json',
      JSON.stringify({
        modules: {
          [MODULE]: { exact: [`${MODULE}:para:para-00003`], warnings: [], tolerated: [] },
        },
      })
    );
    write(
      'residue-report.faithful.json',
      JSON.stringify({
        modules: {
          [MODULE]: {
            exact: [],
            warnings: [{ segmentId: `${MODULE}:para:para-00003`, ratio: 0.9 }],
            tolerated: [],
          },
        },
      })
    );

    const data = segmentParser.loadModuleForEditing(BOOK, 3, MODULE);
    expect(data.isSource).toBe('faithful'); // control: the fixture really is on the faithful path
    expect(seg(data, 'para-00003').mtFinding).toEqual({ kind: 'ratio', ratio: 0.9 });
  });

  it('does not fail the module load when the report is corrupt', () => {
    write('residue-report.mt-preview.json', '{ not json');
    const data = segmentParser.loadModuleForEditing(BOOK, 3, MODULE);
    expect(data.segments).toHaveLength(2);
    expect(seg(data, 'para-00003').mtFinding).toBeNull();
  });
});
