import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  serializeCsv,
  serializeJson,
  serializeTm,
  buildTmx,
  FORMATS,
} = require('../lib/tm-export.cjs');

const TUS = [
  {
    book: 'efnafraedi-2e',
    chapter: '3',
    module: 'm1',
    segmentId: 'm1:para:p1',
    en: 'Water is H2O.',
    is: 'Vatn er H2O.',
  },
  {
    book: 'efnafraedi-2e',
    chapter: '3',
    module: 'm1',
    segmentId: 'm1:para:p2',
    en: 'Acids, bases "and" salts',
    is: 'Sýrur',
  },
];
const LIC = 'CC BY 4.0';

describe('FORMATS', () => {
  it('is exactly tmx, csv, json', () => {
    expect(FORMATS).toEqual(['tmx', 'csv', 'json']);
  });
});

describe('serializeCsv', () => {
  it('emits a header (with licence column) and one row per TU', () => {
    const csv = serializeCsv(TUS, { licence: LIC });
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('book,chapter,module,segment_id,en,is,licence');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('efnafraedi-2e,3,m1,m1:para:p1,Water is H2O.,Vatn er H2O.,CC BY 4.0');
  });

  it('quotes fields containing commas or quotes (RFC 4180)', () => {
    const csv = serializeCsv(TUS, { licence: LIC });
    // en of p2 has a comma AND embedded quotes -> quoted, inner " doubled
    expect(csv).toContain('"Acids, bases ""and"" salts"');
  });

  it('ends with a trailing newline', () => {
    expect(serializeCsv(TUS, { licence: LIC }).endsWith('\n')).toBe(true);
  });
});

describe('serializeJson', () => {
  it('emits a doc with stats + units + licence and a fixed date when provided', () => {
    const json = serializeJson(TUS, {
      date: new Date('2026-01-02T03:04:05Z'),
      book: 'efnafraedi-2e',
      licence: LIC,
      obtained: '2026-01-19',
    });
    const doc = JSON.parse(json);
    expect(doc.generated).toBe('2026-01-02T03:04:05.000Z');
    expect(doc.tool).toBe('generate-tm.js');
    expect(doc.version).toBe('1.0');
    expect(doc.book).toBe('efnafraedi-2e');
    expect(doc.licence).toBe('CC BY 4.0');
    expect(doc.obtained).toBe('2026-01-19');
    expect(doc.stats.units).toBe(2);
    expect(doc.units[0]).toEqual({
      book: 'efnafraedi-2e',
      chapter: '3',
      module: 'm1',
      segmentId: 'm1:para:p1',
      en: 'Water is H2O.',
      is: 'Vatn er H2O.',
    });
  });
});

describe('buildTmx licence prop', () => {
  it('emits a licence header prop when opts.licence is set', () => {
    expect(buildTmx(TUS, { date: new Date('2026-01-02Z'), licence: LIC })).toContain(
      '<prop type="licence">CC BY 4.0</prop>'
    );
  });
  it('omits the licence prop (self-closed header) when no licence given', () => {
    expect(buildTmx(TUS, { date: new Date('2026-01-02Z') })).not.toContain('type="licence"');
  });
});

describe('serializeTm dispatch', () => {
  it('tmx dispatches to buildTmx, passing licence through', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    expect(serializeTm(TUS, 'tmx', { date: d, licence: LIC })).toBe(
      buildTmx(TUS, { date: d, licence: LIC })
    );
  });
  it('csv dispatches to serializeCsv, passing licence through', () => {
    expect(serializeTm(TUS, 'csv', { licence: LIC })).toBe(serializeCsv(TUS, { licence: LIC }));
  });
  it('json dispatches to serializeJson, passing licence through', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    const o = { date: d, book: 'efnafraedi-2e', licence: LIC, obtained: '2026-01-19' };
    expect(serializeTm(TUS, 'json', o)).toBe(serializeJson(TUS, o));
  });
  it('defaults to tmx when no format given', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    expect(serializeTm(TUS, undefined, { date: d, licence: LIC })).toBe(
      buildTmx(TUS, { date: d, licence: LIC })
    );
  });
  it('throws on an unknown format', () => {
    expect(() => serializeTm(TUS, 'xml')).toThrow(/Unknown TM format/);
  });
});
