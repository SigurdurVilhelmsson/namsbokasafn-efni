import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseSegments,
  decodeEntities,
  stripMarkers,
  cleanSegmentText,
  xmlEscape,
  tmxDate,
  buildTmx,
  chapterLabel,
  pairModule,
  listFaithfulChapterDirs,
  generateTm,
  _setTestBooksDir,
  FORMAT_OPTION,
  defaultOutPath,
  runExport,
} from '../generate-tm.js';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION } from '../lib/parseArgs.js';

// ─── parseSegments ─────────────────────────────────────────────────

describe('parseSegments', () => {
  it('returns an empty map for empty input', () => {
    expect(parseSegments('').size).toBe(0);
    expect(parseSegments(null).size).toBe(0);
  });

  it('parses a single segment', () => {
    const map = parseSegments('<!-- SEG:m1:title:auto-1 -->\nIntroduction\n');
    expect(map.size).toBe(1);
    expect(map.get('m1:title:auto-1')).toBe('Introduction');
  });

  it('parses multiple segments and trims content', () => {
    const input = [
      '<!-- SEG:m1:para:p1 -->',
      'First.',
      '',
      '<!-- SEG:m1:para:p2 -->',
      'Second.',
      '',
    ].join('\n');
    const map = parseSegments(input);
    expect(map.size).toBe(2);
    expect(map.get('m1:para:p1')).toBe('First.');
    expect(map.get('m1:para:p2')).toBe('Second.');
  });

  it('handles a marker glued onto the previous line (post-#96 behavior)', () => {
    const input = '<!-- SEG:m1:note-title:t1 -->\nSome title<!-- SEG:m1:para:p1 -->\nBody.';
    const map = parseSegments(input);
    expect(map.get('m1:note-title:t1')).toBe('Some title');
    expect(map.get('m1:para:p1')).toBe('Body.');
  });

  it('keeps the first occurrence of a duplicate id', () => {
    const input = '<!-- SEG:m1:title:a -->\nFirst\n\n<!-- SEG:m1:title:a -->\nSecond\n';
    expect(parseSegments(input).get('m1:title:a')).toBe('First');
  });
});

// ─── decodeEntities ─────────────────────────────────────────────────

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('a &amp; b &lt; c &gt; d')).toBe('a & b < c > d');
  });

  it('decodes decimal and hex numeric entities', () => {
    expect(decodeEntities('x&#8201;y')).toBe('x y');
    expect(decodeEntities('x&#x2009;y')).toBe('x y');
  });

  it('leaves unknown named entities untouched', () => {
    expect(decodeEntities('&bogus;')).toBe('&bogus;');
  });
});

// ─── stripMarkers ───────────────────────────────────────────────────

describe('stripMarkers', () => {
  it('keeps inner content of inline formatting markers', () => {
    expect(stripMarkers('[[i:solid]] and [[b:bold]]')).toBe('solid and bold');
    expect(stripMarkers('H[[sub:2]]O and Ca[[sup:2+]]')).toBe('H2O and Ca2+');
  });

  it('keeps the display text of pipe-form link/xref/docref', () => {
    expect(stripMarkers('[[link:click here|http://x.com]]')).toBe('click here');
    expect(stripMarkers('see [[xref:Figure 5.2|CNX_05_02]]')).toBe('see Figure 5.2');
    expect(stripMarkers('[[docref:Algae|m58805]]')).toBe('Algae');
  });

  it('drops reference-only xref/docref, eating one leading space', () => {
    expect(stripMarkers('as shown in [[xref:CNX_Chem_01]] the table')).toBe(
      'as shown in the table'
    );
    expect(stripMarkers('[[docref:m68674#fs-id123]]')).toBe('');
  });

  it('preserves MATH placeholders verbatim', () => {
    expect(stripMarkers('The value [[MATH:5]] is shown')).toBe('The value [[MATH:5]] is shown');
  });

  it('strips legacy underline and paired markers', () => {
    expect(stripMarkers('++important++')).toBe('important');
    expect(stripMarkers('{{term}}mól{{/term}}')).toBe('mól');
    expect(stripMarkers('{{fn}}a note{{/fn}}')).toBe('a note');
  });

  it('leaves ambiguous single-char legacy markers alone', () => {
    expect(stripMarkers('2*3 and x^2 and a~b and __x__')).toBe('2*3 and x^2 and a~b and __x__');
  });

  it('strips B4 id-anchored markers to display text', () => {
    expect(stripMarkers('A [[term:viscosity|term-1]] here')).toBe('A viscosity here');
    expect(stripMarkers('Note [[fn:a comment|fs-1]] end')).toBe('Note a comment end');
    expect(stripMarkers('[[em:R-O-R|emphasis-one]]')).toBe('R-O-R');
    expect(stripMarkers('[[u:key]] and [[term:plain]]')).toBe('key and plain');
    expect(stripMarkers('[[term:H[[sub:2]]O|t1]]')).toBe('H2O'); // nested unwraps first
  });

  // M1/M4: a term/fn marker whose text carries [[MATH:n]] (kept verbatim per TM
  // design). The old `[^\]|]*` text group stopped at the first ']' inside MATH, so
  // the whole wrapper leaked (id + pipe) into the TM TU. The text group must
  // tolerate [[MATH:n]] and keep it verbatim.
  it('keeps [[MATH:n]] verbatim inside a term/fn marker (no id/pipe leak)', () => {
    expect(stripMarkers('[[term:rate [[MATH:1]]|t9]]')).toBe('rate [[MATH:1]]');
    expect(stripMarkers('Note [[fn:see [[MATH:2]]|fs-1]] end')).toBe('Note see [[MATH:2]] end');
  });
});

// ─── cleanSegmentText ───────────────────────────────────────────────

describe('cleanSegmentText', () => {
  it('flattens hard wraps into single spaces', () => {
    expect(cleanSegmentText('line one\nline two')).toBe('line one line two');
    expect(cleanSegmentText('para one\n\npara two')).toBe('para one para two');
  });

  it('strips markers then decodes entities (no double-escaping)', () => {
    // Source literally contains the entity inside the link display text.
    expect(cleanSegmentText('[[link:PhET Reactions &amp; Rates|http://x]]')).toBe(
      'PhET Reactions & Rates'
    );
  });

  it('collapses whitespace left by dropped reference markers', () => {
    expect(cleanSegmentText('see [[xref:CNX_01]]  now')).toBe('see now');
  });
});

// ─── xmlEscape ──────────────────────────────────────────────────────

describe('xmlEscape', () => {
  it('escapes &, <, > and orders & first', () => {
    expect(xmlEscape('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    expect(xmlEscape('<tag>')).toBe('&lt;tag&gt;');
  });
});

// ─── tmxDate ────────────────────────────────────────────────────────

describe('tmxDate', () => {
  it('formats a Date as YYYYMMDDTHHMMSSZ', () => {
    expect(tmxDate(new Date('2026-06-13T00:19:35.123Z'))).toBe('20260613T001935Z');
  });
});

// ─── chapterLabel ───────────────────────────────────────────────────

describe('chapterLabel', () => {
  it('strips ch and zero-padding', () => {
    expect(chapterLabel('ch03')).toBe('3');
    expect(chapterLabel('ch12')).toBe('12');
  });
  it('passes appendices through', () => {
    expect(chapterLabel('appendices')).toBe('appendices');
  });
});

// ─── buildTmx ───────────────────────────────────────────────────────

describe('buildTmx', () => {
  const tus = [
    {
      book: 'b',
      chapter: '3',
      module: 'm1',
      segmentId: 'm1:para:p1',
      en: 'Acids & bases <x>',
      is: 'Sýrur og basar',
    },
  ];

  it('produces a TMX 1.4 document with header and provenance props', () => {
    const tmx = buildTmx(tus, { date: new Date('2026-06-13T00:00:00Z') });
    expect(tmx).toContain('<tmx version="1.4">');
    expect(tmx).toContain('srclang="en"');
    expect(tmx).toContain('creationdate="20260613T000000Z"');
    expect(tmx).toContain('<prop type="book">b</prop>');
    expect(tmx).toContain('<prop type="segment-id">m1:para:p1</prop>');
    expect(tmx).toContain('<tuv xml:lang="en">');
    expect(tmx).toContain('<tuv xml:lang="is">');
  });

  it('escapes special characters in seg content', () => {
    const tmx = buildTmx(tus, { date: new Date() });
    expect(tmx).toContain('<seg>Acids &amp; bases &lt;x&gt;</seg>');
  });

  it('round-trips Icelandic diacritics unescaped', () => {
    const tmx = buildTmx(tus, { date: new Date() });
    expect(tmx).toContain('Sýrur og basar');
  });

  it('emits an empty body without TUs', () => {
    const tmx = buildTmx([], { date: new Date() });
    expect(tmx).toContain('<body>');
    expect(tmx).toContain('</body>');
    expect(tmx).not.toContain('<tu>');
  });
});

// ─── pairModule ─────────────────────────────────────────────────────

describe('pairModule', () => {
  const meta = { book: 'b', chapter: '3', module: 'm1' };

  it('pairs aligned segments and strips markers', () => {
    const en = '<!-- SEG:m1:para:p1 -->\nCa[[sup:2+]] ion';
    const is = '<!-- SEG:m1:para:p1 -->\nCa[[sup:2+]] jón';
    const { tus, stats } = pairModule(en, is, meta);
    expect(tus).toHaveLength(1);
    expect(tus[0].en).toBe('Ca2+ ion');
    expect(tus[0].is).toBe('Ca2+ jón');
    expect(stats.pairs).toBe(1);
  });

  it('skips segments missing on the IS side', () => {
    const en = '<!-- SEG:m1:para:p1 -->\nA\n\n<!-- SEG:m1:para:p2 -->\nB';
    const is = '<!-- SEG:m1:para:p1 -->\nÁ';
    const { tus, stats } = pairModule(en, is, meta);
    expect(tus).toHaveLength(1);
    expect(stats.missingIs).toBe(1);
  });

  it('skips pairs that are empty after stripping', () => {
    const en = '<!-- SEG:m1:para:p1 -->\n[[xref:CNX_01]]';
    const is = '<!-- SEG:m1:para:p1 -->\n[[xref:CNX_01]]';
    const { tus, stats } = pairModule(en, is, meta);
    expect(tus).toHaveLength(0);
    expect(stats.emptyAfterStrip).toBe(1);
  });

  it('keeps but counts identical EN/IS pairs', () => {
    const en = '<!-- SEG:m1:para:p1 -->\nNaCl';
    const is = '<!-- SEG:m1:para:p1 -->\nNaCl';
    const { tus, stats } = pairModule(en, is, meta);
    expect(tus).toHaveLength(1);
    expect(stats.identical).toBe(1);
  });

  it('counts IS segments with no EN counterpart', () => {
    const en = '<!-- SEG:m1:para:p1 -->\nA';
    const is = '<!-- SEG:m1:para:p1 -->\nÁ\n\n<!-- SEG:m1:para:px -->\nórphan';
    const { stats } = pairModule(en, is, meta);
    expect(stats.orphanIs).toBe(1);
  });
});

// ─── generateTm + listFaithfulChapterDirs (fixture-backed) ──────────

describe('generateTm over a book fixture', () => {
  let tmpRoot;

  function writeBook() {
    const book = 'testbook';
    const mk = (...p) => {
      const full = path.join(tmpRoot, ...p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      return full;
    };
    fs.writeFileSync(
      mk('books', book, '02-for-mt', 'ch03', 'm1-segments.en.md'),
      '<!-- SEG:m1:title:t -->\nIntroduction\n\n<!-- SEG:m1:para:p1 -->\nWater is H[[sub:2]]O.'
    );
    fs.writeFileSync(
      mk('books', book, '03-faithful-translation', 'ch03', 'm1-segments.is.md'),
      '<!-- SEG:m1:title:t -->\nInngangur\n\n<!-- SEG:m1:para:p1 -->\nVatn er H[[sub:2]]O.'
    );
    // A faithful module with no EN source — should be skipped, not crash.
    fs.writeFileSync(
      mk('books', book, '03-faithful-translation', 'appendices', 'm9-segments.is.md'),
      '<!-- SEG:m9:para:p1 -->\nViðauki.'
    );
    return book;
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-tm-'));
    _setTestBooksDir(path.join(tmpRoot, 'books'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    _setTestBooksDir(path.join(process.cwd(), 'books'));
  });

  it('lists faithful chapter dirs and filters by chapter', () => {
    writeBook();
    expect(listFaithfulChapterDirs('testbook', null)).toEqual(['appendices', 'ch03']);
    expect(listFaithfulChapterDirs('testbook', 3)).toEqual(['ch03']);
    expect(listFaithfulChapterDirs('testbook', 'appendices')).toEqual(['appendices']);
  });

  it('generates TUs only from faithful modules with an EN source', () => {
    const book = writeBook();
    const { tus, totals } = generateTm(book, {});
    expect(totals.modules).toBe(1);
    expect(totals.pairs).toBe(2);
    expect(totals.skippedNoEn).toBe(1); // the appendices m9 has no EN source
    expect(tus.map((t) => t.is)).toContain('Vatn er H2O.');
    expect(tus.every((t) => t.chapter === '3')).toBe(true);
  });

  it('respects the chapter filter', () => {
    const book = writeBook();
    const { totals } = generateTm(book, { chapter: 3 });
    expect(totals.modules).toBe(1);
    expect(totals.pairs).toBe(2);
    expect(totals.skippedNoEn).toBe(0);
  });

  it('builds a well-formed TMX from the generated TUs', () => {
    const book = writeBook();
    const { tus } = generateTm(book, { chapter: 3 });
    const tmx = buildTmx(tus, { date: new Date() });
    expect(tmx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(tmx).toContain('<prop type="module">m1</prop>');
    expect(tmx).toContain('Vatn er H2O.');
  });
});

// ─── CLI --format (auto-regen contract) ──────────────────────────────

describe('CLI --format (auto-regen contract)', () => {
  it('defaults to tmx when --format is absent (protects tmService spawn)', () => {
    const args = parseArgs(
      ['--book', 'efnafraedi-2e'],
      [BOOK_OPTION, CHAPTER_OPTION, FORMAT_OPTION]
    );
    expect(args.format).toBe('tmx');
  });

  it('parses an explicit --format', () => {
    const args = parseArgs(
      ['--book', 'b', '--format', 'csv'],
      [BOOK_OPTION, CHAPTER_OPTION, FORMAT_OPTION]
    );
    expect(args.format).toBe('csv');
  });

  it('default out-path keeps the .tmx extension for tmx', () => {
    expect(defaultOutPath('efnafraedi-2e', 'tmx').endsWith('.tmx')).toBe(true);
  });

  it('default out-path swaps the extension per format', () => {
    expect(defaultOutPath('b', 'csv').endsWith('.csv')).toBe(true);
    expect(defaultOutPath('b', 'json').endsWith('.json')).toBe(true);
  });

  it('default out-path lives under books/<book>/tm/', () => {
    expect(defaultOutPath('b', 'tmx').includes(`${'b'}/tm/`)).toBe(true);
  });
});

// End-to-end wiring of main()'s core: the load-bearing "no --format → TMX at
// .tmx" contract, driven through the real generate → serialize → write path
// (tmService.test.js mocks the runner and can't catch a mis-wired main()).
describe('runExport (main() core, fixture-backed)', () => {
  let tmpRoot;
  function writeFixture() {
    const mk = (...p) => {
      const full = path.join(tmpRoot, ...p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      return full;
    };
    fs.writeFileSync(
      mk('books', 'efnafraedi-2e', '02-for-mt', 'ch03', 'm1-segments.en.md'),
      '<!-- SEG:m1:para:p1 -->\nWater.'
    );
    fs.writeFileSync(
      mk('books', 'efnafraedi-2e', '03-faithful-translation', 'ch03', 'm1-segments.is.md'),
      '<!-- SEG:m1:para:p1 -->\nVatn.'
    );
  }
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-export-'));
    _setTestBooksDir(path.join(tmpRoot, 'books'));
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    _setTestBooksDir(path.join(process.cwd(), 'books'));
  });

  it('with no format writes TMX at a .tmx path (the tmService contract)', () => {
    writeFixture();
    const r = runExport({ book: 'efnafraedi-2e' });
    expect(r.outPath.endsWith('.tmx')).toBe(true);
    const written = fs.readFileSync(r.outPath, 'utf-8');
    expect(written).toContain('<tmx version="1.4">');
    // getBookLicence is wired end-to-end on the default (TMX) path too, not
    // just CSV — the auto-regen cron never passes --format.
    expect(written).toContain('<prop type="licence">CC BY 4.0</prop>');
    expect(r.tus).toHaveLength(1);
  });

  it('honors an explicit format + out path', () => {
    writeFixture();
    const out = path.join(tmpRoot, 'x.csv');
    const r = runExport({ book: 'efnafraedi-2e', format: 'csv', out });
    expect(r.outPath).toBe(out);
    const lines = fs.readFileSync(out, 'utf-8').split('\n');
    expect(lines[0]).toBe('book,chapter,module,segment_id,en,is,licence');
    expect(lines[1].endsWith(',CC BY 4.0')).toBe(true); // efnafraedi-2e licence stamped
  });

  it('dry-run computes the path + bytes without writing', () => {
    writeFixture();
    const r = runExport({ book: 'efnafraedi-2e', dryRun: true });
    expect(r.bytes).toBeGreaterThan(0);
    expect(fs.existsSync(r.outPath)).toBe(false);
  });
});
