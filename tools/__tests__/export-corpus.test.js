import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  corpusCleanText,
  splitSegId,
  computePostEdited,
  loadSidecar,
  resolveReviewStatus,
  buildRow,
  listEnChapterDirs,
  buildCorpus,
  _setTestBooksDir,
  toJsonl,
  toTsv,
  buildManifest,
  writeOutputs,
  TSV_COLUMNS,
  TSV_SPEC,
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

  it('drops the legacy [#id] xref dialect, eating one leading space (m68700 chloroform case)', () => {
    expect(
      corpusCleanText('þessara frumeinda. [#CNX_Chem_03_01_chloroform] sýnir útreikningana')
    ).toBe('þessara frumeinda. sýnir útreikningana');
  });

  it('strips [#id] BEFORE lb/rb decode so a restored literal bracket is never re-eaten', () => {
    // If the [#id] strip ran after lb/rb decode, "[[lb:]]#1[[rb:]]" would
    // decode to "[#1]" first and then be wrongly stripped to "".
    expect(corpusCleanText('[[lb:]]#1[[rb:]]')).toBe('[#1]');
  });

  it('trims the leading space left behind when a segment BEGINS with [#id]', () => {
    expect(corpusCleanText('[#CNX_Chem_12_07_CatReCoDig] sýnir hvarfið')).toBe('sýnir hvarfið');
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

  it('is null when either IS tier is whitespace-only (MUSTFIX2/F3)', () => {
    expect(computePostEdited('Water.', '   ', 'Vatn.')).toBeNull();
    expect(computePostEdited('Water.', 'Vatn.', '   ')).toBeNull();
  });
});

describe('loadSidecar', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sidecar-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const write = (name, body) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body));
    return p;
  };

  it('returns absent when the file does not exist', () => {
    expect(loadSidecar(path.join(tmp, 'nope.json'), 'm1')).toEqual({ state: 'absent' });
  });

  it('returns ok with the segments map for a well-formed matching sidecar', () => {
    const p = write('s.json', { module: 'm1', segments: { 'm1:para:p1': { status: 'accepted' } } });
    const r = loadSidecar(p, 'm1');
    expect(r.state).toBe('ok');
    expect(r.segments['m1:para:p1'].status).toBe('accepted');
  });

  it('returns malformed on invalid JSON (D3.3)', () => {
    expect(loadSidecar(write('s.json', '{not json'), 'm1').state).toBe('malformed');
  });

  it('returns malformed when segments is missing or not a plain object', () => {
    expect(loadSidecar(write('a.json', { module: 'm1' }), 'm1').state).toBe('malformed');
    expect(loadSidecar(write('b.json', { module: 'm1', segments: [] }), 'm1').state).toBe(
      'malformed'
    );
    expect(loadSidecar(write('c.json', { module: 'm1', segments: null }), 'm1').state).toBe(
      'malformed'
    );
  });

  it('returns malformed when the sidecar module does not match the expected module (D2)', () => {
    const p = write('s.json', { module: 'mOTHER', segments: {} });
    expect(loadSidecar(p, 'm1').state).toBe('malformed');
  });
});

describe('resolveReviewStatus', () => {
  const ok = {
    state: 'ok',
    segments: {
      'm1:para:p1': { status: 'accepted' },
      'm1:para:p2': { status: 'edited' },
      'm1:para:p3': { status: 'carryover' },
    },
  };

  it('returns the verbatim status for a listed segment with faithful text (D3.5)', () => {
    expect(resolveReviewStatus(ok, 'm1:para:p2', 'Fast efni.')).toEqual({
      status: 'edited',
      segMissing: false,
    });
  });

  it('is null when faithful is null even if the sidecar lists the segment (D3.1 beats a stale sidecar)', () => {
    expect(resolveReviewStatus(ok, 'm1:para:p1', null)).toEqual({
      status: null,
      segMissing: false,
    });
  });

  it('is null when faithful is whitespace-only', () => {
    expect(resolveReviewStatus(ok, 'm1:para:p1', '   ')).toEqual({
      status: null,
      segMissing: false,
    });
  });

  it('is null for an absent sidecar (D3.2)', () => {
    expect(resolveReviewStatus({ state: 'absent' }, 'm1:para:p1', 'Vatn.')).toEqual({
      status: null,
      segMissing: false,
    });
  });

  it('is null for a malformed sidecar (D3.3)', () => {
    expect(resolveReviewStatus({ state: 'malformed' }, 'm1:para:p1', 'Vatn.')).toEqual({
      status: null,
      segMissing: false,
    });
  });

  it('flags segMissing when the sidecar is ok but omits the segment (D3.4 drift tripwire)', () => {
    expect(resolveReviewStatus(ok, 'm1:para:pX', 'Vatn.')).toEqual({
      status: null,
      segMissing: true,
    });
  });

  it('does not flag segMissing for an omitted segment whose faithful is null', () => {
    expect(resolveReviewStatus(ok, 'm1:para:pX', null)).toEqual({
      status: null,
      segMissing: false,
    });
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
      'reviewStatus',
    ]);
    expect(row.type).toBe('para');
    expect(row.elementId).toBe('p1');
    expect(row.en).toEqual({ raw: 'Water is [[i:wet]].', clean: 'Water is wet.' });
    expect(row.mt.clean).toBe('Vatn er blautt.');
    expect(row.faithful).toBeNull();
    expect(row.localized).toBeNull();
    expect(row.postEdited).toBeNull();
    expect(row.reviewStatus).toBeNull(); // absent from p → defaults null
  });

  it('carries a provided reviewStatus through as the last key', () => {
    const row = buildRow({
      id: 'm1:para:p1',
      book: 'efnafraedi-2e',
      chapter: '1',
      module: 'm1',
      licence: 'CC BY 4.0',
      en: 'Water.',
      mt: 'Vatn.',
      faithful: 'Vatn.',
      localized: null,
      reviewStatus: 'accepted',
    });
    expect(Object.keys(row).at(-1)).toBe('reviewStatus');
    expect(row.reviewStatus).toBe('accepted');
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
    // m1: all-tier module — t untouched, p1 untouched-but-normalized, p2 edited,
    // p3 has MT but an empty-content faithful marker (MUSTFIX2/F3: must gate to null)
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'm1-segments.en.md'),
      '<!-- SEG:m1:title:t -->\nIntroduction\n\n' +
        '<!-- SEG:m1:para:p1 -->\nWater is a [[i:solid]].\n\n' +
        '<!-- SEG:m1:para:p2 -->\nSolid.\n\n' +
        '<!-- SEG:m1:para:p3 -->\nGas.'
    );
    // MT: p1 carries escapes+wrap; p2 duplicated (benign, first-wins — occurrences
    // deliberately DIFFER so first-wins is discriminated, not accidentally proven
    // by two identical strings); px is an IS orphan (no EN counterpart)
    fs.writeFileSync(
      mk('books', BOOK, '02-mt-output', 'ch01', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n' +
        '<!-- SEG:m1:para:p1 -->\nVatn er\n\\[\\[MATH:1\\]\\] fast efni.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nÖNNUR.\n\n' +
        '<!-- SEG:m1:para:px -->\nMunaðarlaus.\n\n' +
        '<!-- SEG:m1:para:p3 -->\nGas.'
    );
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n' +
        '<!-- SEG:m1:para:p1 -->\nVatn er [[MATH:1]] fast efni.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast efni.\n\n' +
        '<!-- SEG:m1:para:p3 -->\n'
    );
    fs.writeFileSync(
      mk('books', BOOK, '04-localized-content', 'ch01', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n' +
        '<!-- SEG:m1:para:p1 -->\nVatn er [[MATH:1]] fast efni.\n\n' +
        '<!-- SEG:m1:para:p2 -->\nFast efni (staðfært).'
    );
    // m1 review-status sidecar (item 20b PR2): all three statuses on
    // faithful-present segments, plus a STALE accepted claim on p3 whose
    // faithful is empty — D3.1 must override it to null.
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-review-status.json'),
      JSON.stringify({
        generated: '2026-07-19T00:00:00.000Z',
        book: BOOK,
        chapter: '1',
        module: 'm1',
        segments: {
          'm1:title:t': { status: 'edited', by: 'ed', at: '2026-07-19 09:00:00' },
          'm1:para:p1': { status: 'accepted', by: 'ed', at: '2026-07-19 09:00:00' },
          'm1:para:p2': { status: 'carryover' },
          'm1:para:p3': { status: 'accepted', by: 'ed', at: '2026-07-19 09:00:00' },
        },
      })
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
    // chapter-metadata: accepted basename, no tier files (F13)
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'chapter-metadata-segments.en.md'),
      '<!-- SEG:chapter-title -->\nChapter One'
    );
    // m4: accepted basename but zero SEG markers — skip-reported, not fatal (M8)
    fs.writeFileSync(
      mk('books', BOOK, '02-for-mt', 'ch01', 'm4-segments.en.md'),
      'No markers here, just prose.'
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
    // 4 (m1: t,p1,p2,p3) + 1 (m2) + 1 (m3) + 1 (chapter-metadata) + 1 (exercises)
    // + 1 (m9) = 9 rows; m4 has zero SEG markers and contributes none (M8)
    expect(rows).toHaveLength(9);
    expect(stats.rows).toBe(9);
    expect(stats.modulesListed).toBe(6);
    expect(stats.tiers).toEqual({ mt: 6, faithful: 3, localized: 3 });

    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m3:para:p1').mt).toBeNull();
    expect(byId.get('m2:para:p1').faithful).toBeNull();
    expect(byId.get('m9:para:p1').chapter).toBe('appendices');
    expect(byId.get('m1:title:t').chapter).toBe('1');
    expect(byId.get('m1:title:t').licence).toBe('CC BY 4.0');
    // F10: pin passthrough fields exactly (a field swap would otherwise pass)
    expect(byId.get('m1:title:t').id).toBe('m1:title:t');
    expect(byId.get('m1:title:t').book).toBe('efnafraedi-2e');
    expect(byId.get('m1:title:t').module).toBe('m1');
    // F13: chapter-metadata basename is accepted; the row carries the short seg-id
    const meta = byId.get('chapter-title');
    expect(meta.module).toBe('chapter-metadata');
    expect(meta.mt).toBeNull();
    // MUSTFIX2 (F3): an empty-content faithful marker is gated to null, not
    // treated as present — mt stays non-null, faithful and postEdited go null
    expect(byId.get('m1:para:p3').mt).not.toBeNull();
    expect(byId.get('m1:para:p3').faithful).toBeNull();
  });

  it('emits rows in deterministic chapter -> file -> segment order (F11)', () => {
    const { rows } = buildCorpus(BOOK, {});
    expect(rows.map((r) => r.id)).toEqual([
      'chapter-title',
      'm1:title:t',
      'm1:para:p1',
      'm1:para:p2',
      'm1:para:p3',
      'm2:para:p1',
      'm3:para:p1',
      '02-01-X:stimulus:b0',
      'm9:para:p1',
    ]);
  });

  it('computes postEdited per the editor view: normalization is not an edit', () => {
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').postEdited).toBe(false);
    expect(byId.get('m1:para:p1').postEdited).toBe(false); // escapes+wrap only
    expect(byId.get('m1:para:p2').postEdited).toBe(true); // real edit
    expect(byId.get('m1:para:p3').postEdited).toBeNull(); // empty faithful (MUSTFIX2/F3)
    expect(byId.get('m2:para:p1').postEdited).toBeNull(); // no faithful
    expect(byId.get('m3:para:p1').postEdited).toBeNull(); // no MT
    // F12: pin the aggregate stats too (previously computed but unasserted)
    expect(stats.postEditedTrue).toBe(1);
    expect(stats.postEditedFalse).toBe(2);
    expect(stats.emptyClean).toBe(0);
  });

  it('decodes exercise lb/rb in clean text and keeps MEDIA verbatim', () => {
    const byId = new Map(buildCorpus(BOOK, {}).rows.map((r) => [r.id, r]));
    const ex = byId.get('02-01-X:stimulus:b0');
    expect(ex.module).toBe('exercises');
    expect(ex.en.clean).toBe('[Choice A] [[MEDIA:1]]');
    expect(ex.mt.clean).toBe('[Valkostur A] [[MEDIA:1]]');
  });

  it('counts duplicates, orphans, and skipped files without dropping data silently', () => {
    const { rows, stats, skipped } = buildCorpus(BOOK, {});
    expect(stats.duplicateIds).toBe(1); // m1 MT p2 twice
    expect(stats.orphanIs).toBe(1); // m1 MT px
    expect(stats.filesSkipped).toBe(3); // + m4 (no SEG markers, M8)
    expect(skipped).toContain(path.join('ch01', 'm1-segments.en.md.backup.20260701'));
    expect(skipped).toContain(path.join('ch01', 'm1-segments-links.json'));
    expect(skipped).toContain(`${path.join('ch01', 'm4-segments.en.md')} (no SEG markers)`);
    // Fixture honesty: the two p2 MT occurrences now differ, so first-wins is
    // actually discriminated rather than incidentally proven by two identical strings.
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:para:p2').mt.raw).toBe('Fast.');
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
    expect(() => buildCorpus('stjornufraedi', {})).toThrow(/book-config\.json/i);
  });

  it('writeOutputs writes jsonl, tsv, and manifest to the out dir', () => {
    const { rows, stats, skipped } = buildCorpus(BOOK, {});
    const manifest = buildManifest({
      book: BOOK,
      licence: 'CC BY 4.0',
      obtained: '2026-01-19',
      stats,
      skipped,
      generated: '2026-07-19T12:00:00.000Z',
    });
    const outDir = path.join(tmpRoot, 'out');
    const paths = writeOutputs(rows, manifest, outDir, BOOK);
    expect(fs.readFileSync(paths.jsonlPath, 'utf-8').trimEnd().split('\n')).toHaveLength(9);
    expect(fs.readFileSync(paths.tsvPath, 'utf-8').startsWith('id\tbook\t')).toBe(true);
    const written = JSON.parse(fs.readFileSync(paths.manifestPath, 'utf-8'));
    expect(written.stats.rows).toBe(9);
  });

  it('resolves reviewStatus from the sidecar; faithful-null beats a stale sidecar (D3)', () => {
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').reviewStatus).toBe('edited');
    expect(byId.get('m1:para:p1').reviewStatus).toBe('accepted');
    expect(byId.get('m1:para:p2').reviewStatus).toBe('carryover');
    // p3: sidecar says 'accepted' but faithful is empty -> null (D3.1)
    expect(byId.get('m1:para:p3').reviewStatus).toBeNull();
    // no faithful tier at all -> null (D3.1)
    expect(byId.get('m2:para:p1').reviewStatus).toBeNull();
    // no sidecar for m2/m3/... -> null (D3.2)
    expect(byId.get('m3:para:p1').reviewStatus).toBeNull();
    expect(stats.reviewStatus).toEqual({ edited: 1, accepted: 1, carryover: 1, null: 6 });
  });

  it('passes an out-of-vocabulary status through verbatim and gives it its own stats key (honesty)', () => {
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-review-status.json'),
      JSON.stringify({ module: 'm1', segments: { 'm1:title:t': { status: 'reviewed' } } })
    );
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').reviewStatus).toBe('reviewed'); // verbatim, not remapped to null
    expect(stats.reviewStatus.reviewed).toBe(1); // own key, not dropped
  });

  it('counts sidecar states and holds the read+malformed+absent === listed invariant (D4)', () => {
    const { stats } = buildCorpus(BOOK, {});
    expect(stats.sidecarsRead).toBe(1); // m1
    expect(stats.sidecarsMalformed).toBe(0);
    expect(stats.sidecarsAbsent).toBe(5); // m2, m3, chapter-metadata, exercises, m9
    expect(stats.sidecarsRead + stats.sidecarsMalformed + stats.sidecarsAbsent).toBe(
      stats.modulesListed
    );
    expect(stats.sidecarSegMissing).toBe(0);
  });

  it('treats a malformed sidecar as null for the whole module without aborting (D3.3)', () => {
    // Overwrite the fixture's good sidecar with invalid JSON.
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-review-status.json'),
      '{ this is not json'
    );
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').reviewStatus).toBeNull();
    expect(byId.get('m1:para:p1').reviewStatus).toBeNull();
    expect(stats.sidecarsMalformed).toBe(1);
    expect(stats.sidecarsRead).toBe(0);
    expect(stats.reviewStatus).toEqual({ edited: 0, accepted: 0, carryover: 0, null: 9 });
  });

  it('flags the drift tripwire when the sidecar omits a faithful-present segment (D3.4)', () => {
    // Rewrite the sidecar to list t and p1 but OMIT p2 (whose faithful text
    // "Fast efni." exists). m1's faithful-present segments are t, p1, p2 —
    // p3 is empty so D3.1 nulls it before any lookup and it never counts as
    // drift. Only p2 is present-in-file-absent-from-sidecar → exactly 1.
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-review-status.json'),
      JSON.stringify({
        module: 'm1',
        segments: {
          'm1:title:t': { status: 'edited' },
          'm1:para:p1': { status: 'accepted' },
        },
      })
    );
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:para:p2').reviewStatus).toBeNull();
    expect(byId.get('m1:para:p3').reviewStatus).toBeNull(); // empty faithful, NOT counted as drift
    expect(stats.sidecarSegMissing).toBe(1); // only p2: present in file, absent from sidecar
    expect(stats.sidecarsRead).toBe(1);
  });

  it('treats a module-mismatched sidecar as malformed (D2)', () => {
    fs.writeFileSync(
      mk('books', BOOK, '03-faithful-translation', 'ch01', 'm1-review-status.json'),
      JSON.stringify({ module: 'mWRONG', segments: { 'm1:title:t': { status: 'edited' } } })
    );
    const { rows, stats } = buildCorpus(BOOK, {});
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('m1:title:t').reviewStatus).toBeNull();
    expect(stats.sidecarsMalformed).toBe(1);
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
      'reviewStatus',
    ]);
    expect(jsonl.endsWith('\n')).toBe(true);
  });

  it('toTsv emits the byte-literal 12-column header and sanitizes tabs/newlines', () => {
    const tsv = toTsv([row]);
    // No trimEnd(): reviewStatus is now the LAST column and is empty here (null);
    // trimEnd() strips trailing tab whitespace and would eat that empty field
    // before the split, collapsing 12 fields to 11. split('\n')[1] is the row;
    // toTsv's single real trailing '\n' becomes a harmless final '' element.
    const lines = tsv.split('\n');
    expect(lines[0]).toBe(
      'id\tbook\tchapter\tmodule\ttype\tlicence\ten_clean\tmt_clean\tfaithful_clean\tlocalized_clean\tpostEdited\treviewStatus'
    );
    const fields = lines[1].split('\t');
    expect(fields).toHaveLength(12);
    expect(fields[TSV_COLUMNS.indexOf('en_clean')]).toBe('A B C.');
    expect(fields[TSV_COLUMNS.indexOf('localized_clean')]).toBe('');
    expect(fields[TSV_COLUMNS.indexOf('postEdited')]).toBe('true');
    expect(fields[TSV_COLUMNS.indexOf('reviewStatus')]).toBe(''); // row has no status → null → ''
  });

  it('exports TSV_SPEC as the single source TSV_COLUMNS derives from (I20-R6)', () => {
    expect(TSV_SPEC.map((c) => c.column)).toEqual(TSV_COLUMNS);
    expect(TSV_SPEC).toHaveLength(12);
    for (const entry of TSV_SPEC) {
      expect(typeof entry.get).toBe('function');
    }
  });

  it('maps every column to its value at the right index (I20-R6: no silent field swap)', () => {
    const fields = toTsv([row]).split('\n')[1].split('\t');
    expect(fields[0]).toBe('m1:para:p1'); // id
    expect(fields[1]).toBe('efnafraedi-2e'); // book
    expect(fields[2]).toBe('1'); // chapter
    expect(fields[3]).toBe('m1'); // module
    expect(fields[4]).toBe('para'); // type
    expect(fields[5]).toBe('CC BY 4.0'); // licence
    expect(fields[6]).toBe('A B C.'); // en_clean
    expect(fields[7]).toBe('Vatn.'); // mt_clean
    expect(fields[8]).toBe('Vatnið.'); // faithful_clean
    expect(fields[9]).toBe(''); // localized_clean (null tier)
    expect(fields[10]).toBe('true'); // postEdited
    expect(fields[11]).toBe(''); // reviewStatus (null → '')
  });

  it('serializes a non-null reviewStatus into the last column', () => {
    const r = buildRow({
      id: 'm1:para:p1',
      book: 'efnafraedi-2e',
      chapter: '1',
      module: 'm1',
      licence: 'CC BY 4.0',
      en: 'Water.',
      mt: 'Vatn.',
      faithful: 'Vatn.',
      localized: null,
      reviewStatus: 'accepted',
    });
    const fields = toTsv([r]).split('\n')[1].split('\t');
    expect(fields[TSV_COLUMNS.indexOf('reviewStatus')]).toBe('accepted');
  });

  it('serializes postEdited true/false/null through the bare accessor (ternary removal safe)', () => {
    const col = (pe) =>
      // No trimEnd(): reviewStatus (not postEdited) is the last column now,
      // and trimEnd() strips trailing tab whitespace too, silently eating an
      // empty last field before it can be split out — any column whose value
      // can be empty is vulnerable if it ends up last, so this locates the
      // field via TSV_COLUMNS.indexOf('postEdited') rather than a hardcoded
      // index/position assumption.
      toTsv([{ ...row, postEdited: pe }])
        .split('\n')[1]
        .split('\t')[TSV_COLUMNS.indexOf('postEdited')];
    expect(col(true)).toBe('true');
    expect(col(false)).toBe('false');
    expect(col(null)).toBe('');
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
    // Byte-exact notes pin: verifies UTF-8 typographic apostrophe in MT'd (not ASCII)
    expect(manifest.notes).toEqual([
      'single-char legacy markers (*…*, ~…~, ^…^, __…__) retained in clean text (TM ambiguity rationale)',
      '[[MATH:N]]/[[MEDIA:n]] placeholders retained, resolve via 02-structure sidecars; [[BR]]/[[SPACE]] formatting placeholders also retained and are NOT sidecar-resolvable',
      `EN tier is the current extraction; for modules MT’d before a re-extraction the exact bytes sent to MT may differ (dialect drift, e.g. m68664)`,
      'faithful-tier presence and postEdited=false do not imply per-segment human review — apply rebuilds whole-module files, carrying unreviewed segments through as the normalized MT view; the per-segment record is the reviewStatus field (note 5)',
      'reviewStatus reflects the last apply, faithful-restore, or acceptance-revoke for the module — not live DB state, and not necessarily the current file bytes (a hand-edit to 03-faithful-translation/ does not regenerate the sidecar); null means unknown (no sidecar, no faithful tier, or a segment the sidecar does not list), never "unreviewed"',
    ]);
    expect(manifest.toolVersion).toBe('1.1');
  });
});
