import { describe, it, expect } from 'vitest';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from '../lib/parseArgs.js';

describe('parseArgs', () => {
  // ─── Built-in options ────────────────────────────────────────────

  it('returns defaults when no args provided', () => {
    const result = parseArgs([]);
    expect(result.help).toBe(false);
    expect(result.verbose).toBe(false);
  });

  it('parses --help and -h', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('parses --verbose and -v', () => {
    expect(parseArgs(['--verbose']).verbose).toBe(true);
    expect(parseArgs(['-v']).verbose).toBe(true);
  });

  // ─── String options ──────────────────────────────────────────────

  it('parses string options with next-arg value', () => {
    const defs = [{ name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' }];
    const result = parseArgs(['--track', 'faithful'], defs);
    expect(result.track).toBe('faithful');
  });

  it('uses default when string option not provided', () => {
    const defs = [{ name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' }];
    const result = parseArgs([], defs);
    expect(result.track).toBe('mt-preview');
  });

  it('ignores string option at end of args with no value', () => {
    const defs = [{ name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' }];
    const result = parseArgs(['--track'], defs);
    expect(result.track).toBe('mt-preview');
  });

  // ─── Number options ──────────────────────────────────────────────

  it('parses number options', () => {
    const defs = [{ name: 'limit', flags: ['--limit'], type: 'number', default: 100 }];
    const result = parseArgs(['--limit', '42'], defs);
    expect(result.limit).toBe(42);
  });

  // ─── Boolean options ─────────────────────────────────────────────

  it('parses custom boolean flags', () => {
    const defs = [{ name: 'dryRun', flags: ['--dry-run', '-n'], type: 'boolean', default: false }];
    expect(parseArgs(['--dry-run'], defs).dryRun).toBe(true);
    expect(parseArgs(['-n'], defs).dryRun).toBe(true);
    expect(parseArgs([], defs).dryRun).toBe(false);
  });

  // ─── Multiple flags ──────────────────────────────────────────────

  it('supports multiple flags for the same option', () => {
    const defs = [
      { name: 'outputDir', flags: ['--output-dir', '-o'], type: 'string', default: null },
    ];
    expect(parseArgs(['--output-dir', '/tmp'], defs).outputDir).toBe('/tmp');
    expect(parseArgs(['-o', '/tmp'], defs).outputDir).toBe('/tmp');
  });

  // ─── Positional args ────────────────────────────────────────────

  it('captures positional argument', () => {
    const result = parseArgs(['myfile.md'], [], { positional: { name: 'input' } });
    expect(result.input).toBe('myfile.md');
  });

  it('captures only first positional argument', () => {
    const result = parseArgs(['first.md', 'second.md'], [], { positional: { name: 'input' } });
    expect(result.input).toBe('first.md');
  });

  it('does not capture flags as positional', () => {
    const result = parseArgs(['--verbose'], [], { positional: { name: 'input' } });
    expect(result.input).toBe(null);
  });

  // ─── Preset: BOOK_OPTION ────────────────────────────────────────

  it('BOOK_OPTION defaults to efnafraedi-2e', () => {
    const result = parseArgs([], [BOOK_OPTION]);
    expect(result.book).toBe('efnafraedi-2e');
  });

  it('BOOK_OPTION can be overridden', () => {
    const result = parseArgs(['--book', 'liffraedi-2e'], [BOOK_OPTION]);
    expect(result.book).toBe('liffraedi-2e');
  });

  // ─── Preset: CHAPTER_OPTION ─────────────────────────────────────

  it('CHAPTER_OPTION parses numeric chapter', () => {
    const result = parseArgs(['--chapter', '5'], [CHAPTER_OPTION]);
    expect(result.chapter).toBe(5);
  });

  it('CHAPTER_OPTION preserves "appendices" as string', () => {
    const result = parseArgs(['--chapter', 'appendices'], [CHAPTER_OPTION]);
    expect(result.chapter).toBe('appendices');
  });

  it('CHAPTER_OPTION defaults to null', () => {
    const result = parseArgs([], [CHAPTER_OPTION]);
    expect(result.chapter).toBe(null);
  });

  // ─── Preset: MODULE_OPTION ──────────────────────────────────────

  it('MODULE_OPTION parses module ID', () => {
    const result = parseArgs(['--module', 'm68663'], [MODULE_OPTION]);
    expect(result.module).toBe('m68663');
  });

  // ─── Combined real-world usage ──────────────────────────────────

  it('handles typical cnxml-render args', () => {
    const defs = [
      BOOK_OPTION,
      CHAPTER_OPTION,
      MODULE_OPTION,
      { name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' },
      { name: 'lang', flags: ['--lang'], type: 'string', default: 'is' },
    ];
    const result = parseArgs(
      ['--chapter', '1', '--module', 'm68663', '--track', 'faithful', '--verbose'],
      defs
    );
    expect(result.chapter).toBe(1);
    expect(result.module).toBe('m68663');
    expect(result.track).toBe('faithful');
    expect(result.book).toBe('efnafraedi-2e');
    expect(result.verbose).toBe(true);
    expect(result.lang).toBe('is');
  });

  it('handles typical protect-segments args', () => {
    const defs = [
      { name: 'dryRun', flags: ['--dry-run', '-n'], type: 'boolean', default: false },
      { name: 'outputDir', flags: ['--output-dir', '-o'], type: 'string', default: null },
      { name: 'batch', flags: ['--batch'], type: 'string', default: null },
      { name: 'charLimit', flags: ['--char-limit'], type: 'number', default: 80000 },
    ];
    const result = parseArgs(
      ['--batch', 'books/efnafraedi-2e/02-for-mt/ch01/', '--dry-run', '--verbose'],
      defs,
      { positional: { name: 'input' } }
    );
    expect(result.batch).toBe('books/efnafraedi-2e/02-for-mt/ch01/');
    expect(result.dryRun).toBe(true);
    expect(result.verbose).toBe(true);
    expect(result.charLimit).toBe(80000);
    expect(result.input).toBe(null);
  });
});
