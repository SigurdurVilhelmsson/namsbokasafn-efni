// server/__tests__/listChapterModulesMtFindings.test.js
//
// §C124 leg 2 — the module list carries a per-module MT-finding count, so an
// editor can tell WHICH MODULE to open. Leg 1 (the per-segment badge) only
// helps once you are already inside the right module.
//
// ⚠️ This deliberately lives in listChapterModules rather than in
// enrichModules: enrichModules early-returns when a book has no entry in
// book-data, which would silently drop the count for exactly the books least
// well covered — a null that looks like "no findings".
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const segmentParser = require('../services/segmentParser');
const mtFindings = require('../lib/mtFindings');

const BOOK = 'testbook';
let booksDir;

const EN = (m) => `<!-- SEG:${m}:para:para-00001 -->\nSome English.\n`;

function write(rel, content) {
  const p = path.join(booksDir, BOOK, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcm-mtfind-'));
  segmentParser._setTestBooksDir(booksDir);
  mtFindings._setTestBooksDir(booksDir);
  for (const m of ['m00035', 'm00037', 'm00040']) {
    write(`02-for-mt/ch03/${m}-segments.en.md`, EN(m));
    write(`02-mt-output/ch03/${m}-segments.is.md`, EN(m));
  }
});
afterEach(() => {
  segmentParser._setTestBooksDir(null);
  mtFindings._setTestBooksDir(null);
  fs.rmSync(booksDir, { recursive: true, force: true });
});

const byId = (list) => Object.fromEntries(list.map((m) => [m.moduleId, m]));

describe('listChapterModules — per-module MT finding counts', () => {
  it('counts findings per module, and reports 0 for a clean module', () => {
    write(
      'residue-report.mt-preview.json',
      JSON.stringify({
        modules: {
          m00037: { exact: ['m00037:para:para-00003'], warnings: [], tolerated: [] },
          m00035: {
            exact: [],
            warnings: [
              { segmentId: 'm00035:para:para-00035', ratio: 0.8 },
              { segmentId: 'm00035:para:para-00036', ratio: 0.7 },
            ],
            tolerated: [],
          },
        },
      })
    );

    const mods = byId(segmentParser.listChapterModules(BOOK, 3));

    expect(mods.m00037.mtFindingCount).toBe(1);
    expect(mods.m00035.mtFindingCount).toBe(2);
    // THE CONTROL — m00040 is in the same chapter and carries no findings. If
    // this were also non-zero the badge would fire on every module.
    expect(mods.m00040.mtFindingCount).toBe(0);
  });

  it('reports 0 for every module when no report exists, and still lists them', () => {
    const mods = segmentParser.listChapterModules(BOOK, 3);
    // CONTROL FIRST: the listing itself works, so the zeros below mean "no
    // findings" and not "nothing was listed".
    expect(mods).toHaveLength(3);
    expect(mods.every((m) => m.mtFindingCount === 0)).toBe(true);
  });

  it('counts a faithful module against the FAITHFUL report', () => {
    // Same module flagged with different counts in each report, so the
    // assertion can only pass if the per-module track choice is real.
    write(`03-faithful-translation/ch03/m00037-segments.is.md`, EN('m00037'));
    write(
      'residue-report.mt-preview.json',
      JSON.stringify({
        modules: {
          m00037: { exact: ['a', 'b', 'c'], warnings: [], tolerated: [] },
          m00035: { exact: ['x'], warnings: [], tolerated: [] },
        },
      })
    );
    write(
      'residue-report.faithful.json',
      JSON.stringify({ modules: { m00037: { exact: ['a'], warnings: [], tolerated: [] } } })
    );

    const mods = byId(segmentParser.listChapterModules(BOOK, 3));

    expect(mods.m00037.hasFaithful).toBe(true); // control: the fixture really is faithful
    expect(mods.m00037.mtFindingCount).toBe(1); // faithful report, not the 3 in mt-preview
    // …and a sibling still on mt-preview reads the mt-preview report.
    expect(mods.m00035.mtFindingCount).toBe(1);
  });

  it('reports 0 on a Fable-served unit, which the loader shows without findings (whole-branch review B M2)', () => {
    // Chemistry is Fable-served (server/lib/servedLayer.js): the mt-preview report describes MT text its
    // editor is not shown, so the loader attaches no finding and the list must not badge the unit.
    const CHEM = 'efnafraedi-2e';
    const chem = (rel, content) => {
      const p = path.join(booksDir, CHEM, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    };
    for (const m of ['m00035', 'm00037']) {
      chem(`02-for-mt/ch03/${m}-segments.en.md`, EN(m));
      chem(`02-mt-output/ch03/${m}-segments.is.md`, EN(m));
      chem(`02-mt-fable/ch03/${m}-segments.is.md`, EN(m));
      chem(`02-mt-fable/ch03/${m}-tags.jsonl`, '');
    }
    chem(`03-faithful-translation/ch03/m00037-segments.is.md`, EN('m00037'));
    chem(
      'residue-report.mt-preview.json',
      JSON.stringify({ modules: { m00035: { exact: ['a', 'b'], warnings: [], tolerated: [] } } })
    );
    chem(
      'residue-report.faithful.json',
      JSON.stringify({ modules: { m00037: { exact: ['a'], warnings: [], tolerated: [] } } })
    );

    const mods = byId(segmentParser.listChapterModules(CHEM, 3));

    expect(segmentParser.loadModuleForEditing(CHEM, 3, 'm00035').isSource).toBe('fable'); // control
    expect(mods.m00035.mtFindingCount).toBe(0);
    // Control: a faithful unit of the same book still reads its faithful report, as the loader does.
    expect(mods.m00037.mtFindingCount).toBe(1);
  });
});
