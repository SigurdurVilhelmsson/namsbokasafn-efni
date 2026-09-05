/**
 * The figure MT leg's glossary wiring — the first of the three gates the
 * figure-text register puts in front of the bulk run.
 *
 * ⚠️ THIS FILE LIVES IN `tools/__tests__/` ON PURPOSE, though the module under
 * test is in `experiments/`. Root `vitest.config.js` declares no `include`, so
 * it would in fact discover `experiments/**` today — but only because
 * `vitest.workspace.js` cannot load (CLAUDE.md § Notes for Code Reviewers). The
 * moment that file is repaired, `experiments/` belongs to no project and a test
 * placed there silently stops running. `tools/__tests__/**` is covered by BOTH
 * configs, so this test cannot become a gate that does not exist.
 *
 * ⚠️ NO NETWORK. The client is a stub; the assertions are about what would ride
 * the wire, which is the only half of gate 1 that is ours. Whether the glossary
 * FILE carries a given ruling is a data state — see the register's predicate.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseFigureArgs,
  resolveGlossaryOrRefuse,
  translateOptsFor,
} from '../../experiments/figure-text-translation/translate-blocks.mjs';

/** A books/ tree holding one book with the given glossary payload. */
function bookTreeWith(payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmt-'));
  const glossaryDir = path.join(dir, 'efnafraedi-2e', 'glossary');
  fs.mkdirSync(glossaryDir, { recursive: true });
  if (payload !== null) {
    fs.writeFileSync(path.join(glossaryDir, 'glossary-unified.json'), JSON.stringify(payload));
  }
  return dir;
}

const CELSIUS = {
  terms: [{ english: 'Celsius', icelandic: 'Celsíus', status: 'approved' }],
};

describe('parseFigureArgs', () => {
  it('rejects an unknown flag rather than ignoring it', () => {
    // The CLAUDE.md parseArgs trap one level down: a hand-rolled
    // `argv.includes` drops `--bok` silently and the run sends bare.
    const r = parseFigureArgs(['--bok', 'efnafraedi-2e']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('--bok');
  });

  it('reads the book slug from --book', () => {
    expect(parseFigureArgs(['--book', 'efnafraedi-2e'])).toMatchObject({
      ok: true,
      book: 'efnafraedi-2e',
    });
  });

  it('carries --dry-run and --no-glossary through as flags', () => {
    expect(parseFigureArgs(['--book', 'x', '--dry-run', '--no-glossary'])).toMatchObject({
      ok: true,
      dryRun: true,
      noGlossary: true,
    });
  });
});

describe('resolveGlossaryOrRefuse', () => {
  it('refuses when no book was named', () => {
    // The gate: a bulk run that forgets --book must not reach the paid wire.
    const r = resolveGlossaryOrRefuse({ book: null, booksDir: bookTreeWith(CELSIUS) });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('no-book');
  });

  it('refuses when the named book has no glossary file', () => {
    const r = resolveGlossaryOrRefuse({ book: 'efnafraedi-2e', booksDir: bookTreeWith(null) });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('no-glossary-file');
  });

  it('refuses with a DIFFERENT code when the file loads to zero usable terms', () => {
    // loadGlossary returns null for both, and its own comment says the caller
    // renders them identically. A setup error and a data defect are not the
    // same finding.
    const r = resolveGlossaryOrRefuse({
      book: 'efnafraedi-2e',
      booksDir: bookTreeWith({
        terms: [{ english: 'Celsius', icelandic: '', status: 'approved' }],
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('glossary-unusable');
  });

  it('returns the loaded glossary and its term count for a healthy book', () => {
    const r = resolveGlossaryOrRefuse({ book: 'efnafraedi-2e', booksDir: bookTreeWith(CELSIUS) });
    expect(r).toMatchObject({ ok: true, termCount: 1 });
    expect(r.glossary.terms[0]).toMatchObject({ sourceWord: 'Celsius', targetWord: 'Celsíus' });
  });

  it('allows a deliberate bare run under --no-glossary, the §C73 control path', () => {
    const r = resolveGlossaryOrRefuse({ book: null, noGlossary: true, booksDir: '/nonexistent' });
    expect(r).toMatchObject({ ok: true, glossary: null, termCount: 0 });
  });
});

describe('translateOptsFor', () => {
  const glossary = {
    domain: 'chemistry',
    terms: [{ sourceWord: 'Celsius', targetWord: 'Celsíus' }],
  };

  it('sends the matching headword on the wire for a block that contains it', () => {
    const opts = translateOptsFor(glossary, '100 Celsius degrees');
    expect(opts.glossaries[0].terms).toEqual([{ sourceWord: 'Celsius', targetWord: 'Celsíus' }]);
  });

  it('omits the glossaries field entirely for a block that contains no headword', () => {
    // The negative control. Málstaður is per-request; an empty glossaries array
    // is not the same as no field, and api-translate omits it.
    const opts = translateOptsFor(glossary, 'Freezing point of water');
    expect(opts).not.toHaveProperty('glossaries');
  });

  it('omits the glossaries field when running bare', () => {
    expect(translateOptsFor(null, '100 Celsius degrees')).not.toHaveProperty('glossaries');
  });

  it('always asks for Icelandic', () => {
    expect(translateOptsFor(null, 'x').targetLanguage).toBe('is');
  });
});
