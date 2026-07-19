import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  corpusCleanText,
  splitSegId,
  computePostEdited,
  buildRow,
  listEnChapterDirs,
  buildCorpus,
  _setTestBooksDir,
  toJsonl,
  toTsv,
  buildManifest,
  TSV_COLUMNS,
} from '../export-corpus.js';

describe('corpusCleanText', () => {
  it('strips TM markers and decodes lb/rb escapes to literal brackets', () => {
    expect(corpusCleanText('pH [[lb:]]H[[sub:3]]O[[sup:+]][[rb:]]')).toBe('pH [H3O+]');
  });

  it('keeps MATH and MEDIA placeholders verbatim', () => {
    expect(corpusCleanText('See [[MATH:2]] and [[MEDIA:1]]')).toBe(
      'See [[MATH:2]] and [[MEDIA:1]]'
    );
  });

  it('decodes lb/rb LAST so restored brackets never form new markers', () => {
    // Literal source text "[[i:x]]" arrives bracket-escaped; the restored
    // brackets must NOT be re-parsed and stripped as an [[i:]] marker.
    expect(corpusCleanText('[[lb:]][[lb:]]i:x]]')).toBe('[[i:x]]');
  });

  it('leaves single-char legacy markers alone (TM ambiguity rationale)', () => {
    expect(corpusCleanText('H~2~O og *Macro* og __efnafræði__')).toBe(
      'H~2~O og *Macro* og __efnafræði__'
    );
  });
});

describe('splitSegId', () => {
  it('splits a 3-part id', () => {
    expect(splitSegId('m68664:para:fs-idm183676832')).toEqual({
      moduleId: 'm68664',
      segmentType: 'para',
      elementId: 'fs-idm183676832',
    });
  });

  it('tolerates short ids with nulls', () => {
    expect(splitSegId('chapter-title')).toEqual({
      moduleId: 'chapter-title',
      segmentType: null,
      elementId: null,
    });
  });
});

describe('computePostEdited', () => {
  it('is false when faithful equals the normalized MT view (untouched segment)', () => {
    // MT carries a hard wrap + malstadur backslash escapes; the faithful file
    // holds the editor-visible normalization of the same text — no human edit.
    const en = 'Water is a [[i:solid]].';
    const mt = 'Vatn er\n\\[\\[MATH:1\\]\\] fast efni.';
    const faithful = 'Vatn er [[MATH:1]] fast efni.';
    expect(computePostEdited(en, mt, faithful)).toBe(false);
  });

  it('applies the EN-aware term-marker repair before comparing', () => {
    // EN has __term__; MT came back with ** (malstadur artifact). The editor
    // view converts ** back to __ — faithful saved from that view must NOT
    // read as a human edit.
    const en = 'A __mole__ is a unit.';
    const mt = 'Eitt **mól** er eining.';
    const faithful = 'Eitt __mól__ er eining.';
    expect(computePostEdited(en, mt, faithful)).toBe(false);
  });

  it('is true for a real edit', () => {
    expect(computePostEdited('Water.', 'Vatn.', 'Vatnið.')).toBe(true);
  });

  it('is null when either IS tier is missing', () => {
    expect(computePostEdited('Water.', null, 'Vatn.')).toBeNull();
    expect(computePostEdited('Water.', 'Vatn.', null)).toBeNull();
  });
});

describe('buildRow', () => {
  it('emits the frozen field order, raw+clean tiers, and null for absent tiers', () => {
    const row = buildRow({
      id: 'm1:para:p1',
      book: 'efnafraedi-2e',
      chapter: '1',
      module: 'm1',
      licence: 'CC BY 4.0',
      en: 'Water is [[i:wet]].',
      mt: 'Vatn er [[i:blautt]].',
      faithful: null,
      localized: null,
    });
    expect(Object.keys(row)).toEqual([
      'id',
      'book',
      'chapter',
      'module',
      'type',
      'elementId',
      'licence',
      'en',
      'mt',
      'faithful',
      'localized',
      'postEdited',
    ]);
    expect(row.type).toBe('para');
    expect(row.elementId).toBe('p1');
    expect(row.en).toEqual({ raw: 'Water is [[i:wet]].', clean: 'Water is wet.' });
    expect(row.mt.clean).toBe('Vatn er blautt.');
    expect(row.faithful).toBeNull();
    expect(row.localized).toBeNull();
    expect(row.postEdited).toBeNull();
  });
});

// ─── buildCorpus over a book fixture ─────────────────────────────────
// The fixture book MUST use a real licence-map slug (efnafraedi-2e):
// buildCorpus calls getBookLicence, which throws for unknown slugs.

describe('buildCorpus over a book fixture', () => {
  let tmpRoot;
  const BOOK = 'efnafraedi-2e';

  function mk(...p) {
    const full = path.join(tmpRoot, ...p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    return full;
  }

  function writeFixtureBook() {
    // m1: all-tier module — t untouched, p1 untouched-but-normalized, p2 edited
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'm1-segments.en.md'),
      '<!-- SEG:m1:title:t -->\nIntroduction\n\n' +
        '<!-- SEG:m1:para:p1 -->\nWater is a [[i:solid]].\n\n' +
        '<!-- SEG:m1:para:p2 -->\nSolid.'
    );
    // MT: p1 carries escapes+wrap; p2 duplicated (benign, first-wins);
    // px is an IS orphan (no EN counterpart)
    fs.writeFileSync(
      mk('books', BOOK, '02-mt-output', 'ch01', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n' +
        '<!-- SEG:m1:para:p1 -->\nVatn er\n\\[\\[MATH:1\\]\\] fast efni.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast.\n\n' +
        '<!-- SEG:m1:para:px -->\nMunaðarlaus.'
    );
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n' +
        '<!-- SEG:m1:para:p1 -->\nVatn er [[MATH:1]] fast efni.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast efni.'
    );
    fs.writeFileSync(
      mk('books', BOOK, '04-localized-content', 'ch01', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n' +
        '<!-- SEG:m1:para:p1 -->\nVatn er [[MATH:1]] fast efni.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast efni (staðfært).'
    );
    // m2: EN+MT only (no faithful/localized)
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'm2-segments.en.md'),
      '<!-- SEG:m2:para:p1 -->\nAtoms.'
    );
    fs.writeFileSync(
      mk('books', BOOK, '02-mt-output', 'ch01', 'm2-segments.is.md'),
      '<!-- SEG:m2:para:p1 -->\nFrumeindir.'
    );
    // m3: EN only (no MT) — tier must be null, not an error
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'm3-segments.en.md'),
      '<!-- SEG:m3:para:p1 -->\nIons.'
    );
    // skip-report triggers in ch01
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'm1-segments.en.md.backup.20260701'),
      'x'
    );
    fs.writeFileSync(mk('books', BOOK, '02-for-mt', 'ch01', 'm1-segments-links.json'), '{}');
    // ch02: exercise sidecar with lb/rb + MEDIA markers
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch02', 'exercises-segments.en.md'),
      '<!-- SEG:02-01-X:stimulus:b0 -->\n[[lb:]]Choice A[[rb:]] [[MEDIA:1]]'
    );
    fs.writeFileSync(
      mk('books', BOOK, '02-mt-output', 'ch02', 'exercises-segments.is.md'),
      '<!-- SEG:02-01-X:stimulus:b0 -->\n[[lb:]]Valkostur A[[rb:]] [[MEDIA:1]]'
    );
    // appendices module
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'appendices', 'm9-segments.en.md'),
      '<!-- SEG:m9:para:p1 -->\nAppendix.'
    );
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'export-corpus-'));
    _setTestBooksDir(path.join(tmpRoot, 'books'));
    writeFixtureBook();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    _setTestBooksDir(path.join(process.cwd(), 'books'));
  });

  it('lists EN chapter dirs numeric-ascending with appendices last, and filters', () => {
    expect(listEnChapterDirs(BOOK, null)).toEqual(['ch01', 'ch02', 'appendices']);
    expect(listEnChapterDirs(BOOK, 1)).toEqual(['ch01']);
    expect(listEnChapterDirs(BOOK, 'appendices')).toEqual(['appendices']);
    expect(listEnChapterDirs(BOOK, 7)).toEqual([]);
  });

  it('builds rows for every EN segment with correct tier presence', () => {
    const { rows, stats } = buildCorpus(BOOK, {});
    // 3 (m1) + 1 (m2) + 1 (m3) + 1 (exercises) + 1 (m9) = 7 rows
    expect(rows).toHaveLength(7);
    expect(stats.rows).toBe(7);
    expect(stats.modulesListed).toBe(5);
    expect(stats.tiers).toEqual({ mt: 5, faithful: 3, localized: 3 });

    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m3:para:p1').mt).toBeNull();
    expect(byId.get('m2:para:p1').faithful).toBeNull();
    expect(byId.get('m9:para:p1').chapter).toBe('appendices');
    expect(byId.get('m1:title:t').chapter).toBe('1');
    expect(byId.get('m1:title:t').licence).toBe('CC BY 4.0');
  });

  it('computes postEdited per the editor view: normalization is not an edit', () => {
    const byId = new Map(buildCorpus(BOOK, {}).rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').postEdited).toBe(false);
    expect(byId.get('m1:para:p1').postEdited).toBe(false); // escapes+wrap only
    expect(byId.get('m1:para:p2').postEdited).toBe(true); // real edit
    expect(byId.get('m2:para:p1').postEdited).toBeNull(); // no faithful
    expect(byId.get('m3:para:p1').postEdited).toBeNull(); // no MT
  });

  it('decodes exercise lb/rb in clean text and keeps MEDIA verbatim', () => {
    const byId = new Map(buildCorpus(BOOK, {}).rows.map((r) => [r.id, r]));
    const ex = byId.get('02-01-X:stimulus:b0');
    expect(ex.module).toBe('exercises');
    expect(ex.en.clean).toBe('[Choice A] [[MEDIA:1]]');
    expect(ex.mt.clean).toBe('[Valkostur A] [[MEDIA:1]]');
  });

  it('counts duplicates, orphans, and skipped files without dropping data silently', () => {
    const { stats, skipped } = buildCorpus(BOOK, {});
    expect(stats.duplicateIds).toBe(1); // m1 MT p2 twice
    expect(stats.orphanIs).toBe(1); // m1 MT px
    expect(stats.filesSkipped).toBe(2);
    expect(skipped).toContain(path.join('ch01', 'm1-segments.en.md.backup.20260701'));
    expect(skipped).toContain(path.join('ch01', 'm1-segments-links.json'));
  });

  it('respects the chapter filter', () => {
    const { rows, stats } = buildCorpus(BOOK, { chapter: 2 });
    expect(rows).toHaveLength(1);
    expect(stats.modulesListed).toBe(1);
  });

  it('throws loudly for a book with no recorded licence', () => {
    fs.writeFileSync(
      mk('books', 'stjornufraedi', '02-for-mt', 'ch01', 'm1-segments.en.md'),
      '<!-- SEG:m1:para:p1 -->\nStars.'
    );
    expect(() => buildCorpus('stjornufraedi', {})).toThrow(/book-licences\.cjs/);
  });
});

describe('serializers', () => {
  const row = buildRow({
    id: 'm1:para:p1',
    book: 'efnafraedi-2e',
    chapter: '1',
    module: 'm1',
    licence: 'CC BY 4.0',
    en: 'A\tB\nC.',
    mt: 'Vatn.',
    faithful: 'Vatnið.',
    localized: null,
  });

  it('toJsonl emits one parseable object per line in frozen key order', () => {
    const jsonl = toJsonl([row, row]);
    const lines = jsonl.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]);
    expect(Object.keys(parsed)).toEqual([
      'id',
      'book',
      'chapter',
      'module',
      'type',
      'elementId',
      'licence',
      'en',
      'mt',
      'faithful',
      'localized',
      'postEdited',
    ]);
    expect(jsonl.endsWith('\n')).toBe(true);
  });

  it('toTsv emits the frozen header and sanitizes tabs/newlines in fields', () => {
    const tsv = toTsv([row]);
    const lines = tsv.trimEnd().split('\n');
    expect(lines[0]).toBe(TSV_COLUMNS.join('\t'));
    const fields = lines[1].split('\t');
    expect(fields).toHaveLength(TSV_COLUMNS.length);
    // en clean had a tab; the raw text's tab/newline must not split columns
    expect(fields[TSV_COLUMNS.indexOf('en_clean')]).toBe('A B C.');
    expect(fields[TSV_COLUMNS.indexOf('localized_clean')]).toBe('');
    expect(fields[TSV_COLUMNS.indexOf('postEdited')]).toBe('true');
  });

  it('buildManifest carries licence, stats, skipped, and the spec notes', () => {
    const manifest = buildManifest({
      book: 'efnafraedi-2e',
      licence: 'CC BY 4.0',
      obtained: '2026-01-19',
      stats: { rows: 1 },
      skipped: ['ch01/x.bak'],
      generated: '2026-07-19T12:00:00.000Z',
    });
    expect(manifest.tool).toBe('export-corpus.js');
    expect(manifest.licence).toBe('CC BY 4.0');
    expect(manifest.licenceObtained).toBe('2026-01-19');
    expect(manifest.provenance).toBe('docs/provenance/openstax-cnxml-licence-provenance.md');
    expect(manifest.skipped).toEqual(['ch01/x.bak']);
    expect(manifest.notes.some((n) => n.includes('dialect drift'))).toBe(true);
  });
});
