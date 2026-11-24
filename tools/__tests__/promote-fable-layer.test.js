import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promoteFableLayer, readSources } from '../promote-fable-layer.js';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const REAL_BOOK = path.join(REPO, 'books', 'efnafraedi-2e');
const TRIAL = path.join(REPO, 'experiments', 'fable-editor-trial');
const WRITTEN_BY = { tool: 'tools/promote-fable-layer.js', commit: 'test' };
const ch00Run = readSources().chapters.ch00;

const temps = [];
afterEach(() => {
  for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A temp `books/efnafraedi-2e` holding only ch00 of the layers the writer reads. */
function tempBook(ch = 'ch00') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fable-layer-'));
  temps.push(root);
  const book = path.join(root, 'books', 'efnafraedi-2e');
  for (const layer of [
    '02-for-mt',
    '02-structure',
    '02-mt-output',
    '02-mt-selected',
    '02-mt-revised',
    '03-faithful-translation',
  ]) {
    const from = path.join(REAL_BOOK, layer, ch);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(book, layer, ch), { recursive: true });
  }
  return book;
}

const run = (bookDir, extra = {}) =>
  promoteFableLayer({ chapters: ['ch00'], bookDir, writtenBy: WRITTEN_BY, ...extra });

const readTree = (dir) => {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
};

describe('promote-fable-layer', () => {
  it("rebuilds ch00 byte-identical to the run's committed fe-layer", () => {
    const book = tempBook();
    run(book);
    const layer = path.join(book, '02-mt-fable', 'ch00');
    const feDir = path.join(TRIAL, 'results', ch00Run, 'fe-layer');
    const stems = fs.readdirSync(feDir).filter((f) => f.endsWith('-segments.is.md'));
    expect(stems.length).toBeGreaterThan(0);
    for (const f of stems) {
      expect(fs.readFileSync(path.join(layer, f), 'utf8')).toBe(
        fs.readFileSync(path.join(feDir, f), 'utf8')
      );
    }
  });

  it('takes ch11 m68783 from the re-send and names both runs', () => {
    const sources = readSources();
    const o = sources.modules['ch11/m68783'];
    const bookDir = tempBook('ch11');
    promoteFableLayer({ chapters: ['ch11'], bookDir, writtenBy: WRITTEN_BY });
    const prov = JSON.parse(
      fs.readFileSync(path.join(bookDir, '02-mt-fable', 'ch11', 'm68783-fable.json'), 'utf8')
    );
    expect(prov.runs).toHaveLength(2);
    const used = prov.runs.find((r) => r.used);
    const unused = prov.runs.find((r) => !r.used);
    expect(used.runId).toBe(o.run);
    expect(unused.runId).toBe(sources.chapters.ch11);
    expect(unused.reason).toBe(o.reason);
  }, 120000);

  it('refuses a unit with an unanswered segment', () => {
    const sources = { ...readSources(), modules: {} };
    expect(() =>
      promoteFableLayer({ chapters: ['ch11'], dryRun: true, sources, writtenBy: WRITTEN_BY })
    ).toThrow(/m68783.*unanswered/);
  }, 120000);

  it('refuses to overwrite different bytes', () => {
    const book = tempBook();
    run(book);
    const file = path.join(book, '02-mt-fable', 'ch00', 'm68662-segments.is.md');
    const altered = fs.readFileSync(file, 'utf8') + 'x';
    fs.writeFileSync(file, altered);
    expect(() => run(book)).toThrow(/different bytes/);
    expect(fs.readFileSync(file, 'utf8')).toBe(altered);
  });

  it('is deterministic', () => {
    const a = tempBook();
    const b = tempBook();
    run(a);
    run(b);
    expect(readTree(path.join(a, '02-mt-fable'))).toEqual(readTree(path.join(b, '02-mt-fable')));
  });

  it('refuses when the base moved', () => {
    const book = tempBook();
    const file = path.join(book, '02-mt-output', 'ch00', 'm68662-segments.is.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8') + '\n');
    expect(() => run(book)).toThrow(/differ from term-pass run/);
  });

  it('refuses an English change other than the G1.12 repeat removal', () => {
    const book = tempBook();
    const file = path.join(book, '02-for-mt', 'ch00', 'm68662-segments.en.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/(-->\n)(\S)/, '$1Changed $2'));
    expect(() => run(book)).toThrow(/enSha256 differs/);
  });
});
