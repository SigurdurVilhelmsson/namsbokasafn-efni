// server/__tests__/mtFindings.test.js
//
// §C124 — the reader that puts already-computed MT findings in front of an editor.
//
// ⚠️ EVERY NULL IN THIS FILE IS PAIRED WITH A CONTROL THAT FIRES, in the same
// test where practical. An absent-report case that returns "no findings" is
// indistinguishable from a reader that cannot read anything at all, and this
// repo has shipped that mistake more than once. The control is what tells them
// apart.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const mtFindings = require('../lib/mtFindings');

// A trimmed copy of the real shape, taken verbatim from
// books/lifraen-efnafraedi/residue-report.mt-preview.json (2026-09-05):
// per-module buckets of `exact` (segment id strings) and `warnings`
// ({segmentId, ratio}). `summary` is deliberately WRONG here relative to
// `modules` — the real file's modulesWithResidue counts only modules with
// `exact` entries (3) while 6 modules carry findings. The reader must read
// `modules`, never `summary`.
const REPORT = {
  track: 'mt-preview',
  generatedBy: 'cnxml-inject.js',
  generatedAt: '2026-09-05T09:15:36.850Z',
  summary: { modulesWithResidue: 3, exactResidues: 6, ratioWarnings: 5, toleratedResidues: 0 },
  modules: {
    m00037: { exact: ['m00037:para:para-00003'], warnings: [], tolerated: [] },
    m00035: {
      exact: [],
      warnings: [{ segmentId: 'm00035:para:para-00035', ratio: 0.8 }],
      tolerated: [],
    },
    m00032: {
      exact: [],
      warnings: [
        { segmentId: 'm00032:entry:auto-42', ratio: 0.86 },
        { segmentId: 'm00032:entry:auto-46', ratio: 0.88 },
      ],
      tolerated: [],
    },
  },
};

let booksDir;
const bookDir = () => path.join(booksDir, 'testbook');
const reportPath = (track) => path.join(bookDir(), `residue-report.${track}.json`);

function writeReport(track, payload) {
  fs.mkdirSync(bookDir(), { recursive: true });
  fs.writeFileSync(
    reportPath(track),
    typeof payload === 'string' ? payload : JSON.stringify(payload)
  );
}

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtfindings-'));
  mtFindings._setTestBooksDir(booksDir);
});
afterEach(() => {
  mtFindings._setTestBooksDir(null);
  fs.rmSync(booksDir, { recursive: true, force: true });
});

describe('read — availability, with a control in every null case', () => {
  it('reports available:false when the book has no report — and available:true when it does', () => {
    // THE NULL …
    const absent = mtFindings.read('testbook', 'mt-preview');
    expect(absent.available).toBe(false);
    expect(absent.bySegment.size).toBe(0);

    // … AND THE CONTROL, same reader, same book, one file apart. Without this a
    // reader that always returns empty passes the assertion above.
    writeReport('mt-preview', REPORT);
    const present = mtFindings.read('testbook', 'mt-preview');
    expect(present.available).toBe(true);
    expect(present.bySegment.size).toBeGreaterThan(0);
  });

  it('treats malformed JSON as "no findings" rather than throwing — with a control that valid JSON still parses', () => {
    writeReport('mt-preview', '{ this is not json');
    const corrupt = mtFindings.read('testbook', 'mt-preview');
    expect(corrupt.available).toBe(false);
    expect(corrupt.bySegment.size).toBe(0);

    writeReport('mt-preview', REPORT);
    expect(mtFindings.read('testbook', 'mt-preview').available).toBe(true);
  });

  it('treats a report with no `modules` object as empty rather than throwing', () => {
    writeReport('mt-preview', { track: 'mt-preview', summary: { exactResidues: 99 } });
    const r = mtFindings.read('testbook', 'mt-preview');
    expect(r.bySegment.size).toBe(0);
  });
});

describe('bySegment — the per-segment badge lookup', () => {
  beforeEach(() => writeReport('mt-preview', REPORT));

  it('maps an `exact` residue to its segment id', () => {
    const r = mtFindings.read('testbook', 'mt-preview');
    expect(r.bySegment.get('m00037:para:para-00003')).toEqual({ kind: 'exact' });
  });

  it('maps a ratio warning to its segment id, carrying the ratio', () => {
    const r = mtFindings.read('testbook', 'mt-preview');
    expect(r.bySegment.get('m00035:para:para-00035')).toEqual({ kind: 'ratio', ratio: 0.8 });
  });

  it('returns undefined for a segment with no finding — the neighbour control', () => {
    const r = mtFindings.read('testbook', 'mt-preview');
    // para-00004 is m00037's next paragraph and is NOT flagged. If this came
    // back truthy the badge would light up every row.
    expect(r.bySegment.get('m00037:para:para-00004')).toBeUndefined();
  });
});

describe('byModule — the module-list count', () => {
  beforeEach(() => writeReport('mt-preview', REPORT));

  it('counts exact residues and ratio warnings together, per module', () => {
    const r = mtFindings.read('testbook', 'mt-preview');
    expect(r.byModule.get('m00037')).toBe(1);
    expect(r.byModule.get('m00032')).toBe(2);
  });

  it('reads `modules`, NOT `summary` — the two disagree in the real file', () => {
    const r = mtFindings.read('testbook', 'mt-preview');
    // summary.modulesWithResidue is 3 and counts only modules with `exact`;
    // three modules actually carry findings in this fixture. Reading summary
    // would make m00035 and m00032 invisible despite having warnings.
    expect(r.byModule.size).toBe(3);
    expect(r.byModule.has('m00035')).toBe(true);
  });

  it('returns undefined for a module with no findings', () => {
    const r = mtFindings.read('testbook', 'mt-preview');
    expect(r.byModule.get('m99999')).toBeUndefined();
  });
});

describe('track selection — the flag must describe the text on screen', () => {
  it('reads the faithful report when asked for faithful, not the mt-preview one', () => {
    writeReport('mt-preview', REPORT);
    writeReport('faithful', {
      track: 'faithful',
      generatedAt: '2026-09-06T00:00:00.000Z',
      modules: { m00099: { exact: ['m00099:para:para-00001'], warnings: [], tolerated: [] } },
    });

    const faithful = mtFindings.read('testbook', 'faithful');
    expect(faithful.bySegment.has('m00099:para:para-00001')).toBe(true);
    // CONTROL: the mt-preview finding must NOT leak into the faithful read.
    expect(faithful.bySegment.has('m00037:para:para-00003')).toBe(false);

    // …and the reverse, so this is not just "faithful happens to be loaded".
    const preview = mtFindings.read('testbook', 'mt-preview');
    expect(preview.bySegment.has('m00037:para:para-00003')).toBe(true);
    expect(preview.bySegment.has('m00099:para:para-00001')).toBe(false);
  });

  it('rejects a track that is not a known publication track', () => {
    expect(() => mtFindings.read('testbook', '../../etc')).toThrow(/track/i);
  });
});

describe('generatedAt — the vintage shown to the editor', () => {
  it('carries the report timestamp through', () => {
    writeReport('mt-preview', REPORT);
    expect(mtFindings.read('testbook', 'mt-preview').generatedAt).toBe('2026-09-05T09:15:36.850Z');
  });

  it('returns null when the report predates the generatedAt field, rather than inventing one', () => {
    // Reports written before §C124 carry no timestamp. The editor shows
    // "dagsetning óþekkt" for these — it must never fall back to file mtime,
    // which a fresh clone or a depth-1 CI checkout rewrites.
    const old = { ...REPORT };
    delete old.generatedAt;
    writeReport('mt-preview', old);
    const r = mtFindings.read('testbook', 'mt-preview');
    expect(r.generatedAt).toBeNull();
    expect(r.available).toBe(true); // still usable — only the date is unknown
  });
});
