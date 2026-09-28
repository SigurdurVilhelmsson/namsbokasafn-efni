import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseArgs,
  BOOK_OPTION,
  CHAPTER_OPTION,
  MODULE_OPTION,
  requireBook,
  chapterProvided,
} from '../lib/parseArgs.js';

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

  it('BOOK_OPTION defaults to null (--book is required; no chemistry default)', () => {
    const result = parseArgs([], [BOOK_OPTION]);
    expect(result.book).toBe(null);
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
    expect(result.book).toBe(null); // no --book passed; no default
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

describe('requireBook', () => {
  let exitSpy, errSpy;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('__exit__');
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('exits when --book is missing', () => {
    expect(() => requireBook({ book: null, help: false })).toThrow('__exit__');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits when the book directory does not exist', () => {
    expect(() => requireBook({ book: 'no-such-book-xyz', help: false })).toThrow('__exit__');
  });

  it('does not exit when --help was requested', () => {
    expect(() => requireBook({ book: null, help: true })).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('passes for an existing book directory', () => {
    expect(() => requireBook({ book: 'efnafraedi-2e', help: false })).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('chapterProvided — chapter 0 is a real chapter, not a missing argument', () => {
  it('returns true for chapter 0', () => {
    expect(chapterProvided({ chapter: 0 })).toBe(true);
  });

  it('returns false when no chapter was supplied', () => {
    expect(chapterProvided({ chapter: null })).toBe(false);
  });

  it('returns true for appendices', () => {
    expect(chapterProvided({ chapter: 'appendices' })).toBe(true);
  });

  it('returns false for an unparseable chapter', () => {
    // parseArgs' CHAPTER_OPTION.parse runs parseInt, so `--chapter abc` is NaN.
    expect(chapterProvided({ chapter: NaN })).toBe(false);
  });

  it('returns true for an ordinary chapter', () => {
    expect(chapterProvided({ chapter: 7 })).toBe(true);
  });
});

describe('--flag=value — the GNU spelling, which used to be silently dropped', () => {
  // 🔴 WHY THIS MATTERS BEYOND ERGONOMICS. `flagMap.get(arg)` was an EXACT match, so
  // `--module=m68710` matched no flag and fell into parseArgs' documented
  // silently-drops-unknown-flags path. Measured 2026-08-16 on the shipped tools:
  //
  //   cnxml-fidelity-check --module m99999   -> Checked: 0 modules, EXIT 2   (correct)
  //   cnxml-fidelity-check --module=m99999   -> Checked: 7 modules, EXIT 0   (false GREEN)
  //
  // §C82's Plan C driver builds these arguments programmatically, and `--flag=value`
  // is what an execFile-style builder produces routinely. A per-module gate that
  // silently widens to a whole chapter and exits 0 is the exact failure the
  // zero-examined guards were added to close — walked past by a spelling.
  //
  // Fixing it HERE rather than in each guard closes it for every tool at once:
  // scan-residue, cnxml-render-fidelity-check and validate-chapter shared the hole.

  it('parses --module=m68710 as a value, not as an unknown flag', () => {
    const r = parseArgs(['--module=m68710'], [MODULE_OPTION]);
    expect(r.module).toBe('m68710');
  });

  it('parses --chapter=0 as the number 0 — chapter 0 is a real chapter', () => {
    // Pairs with the chapterProvided suite below: the equals form must not
    // reintroduce the falsy-chapter bug that §C82 Plan A Task 1 fixed at four sites.
    const r = parseArgs(['--chapter=0'], [CHAPTER_OPTION]);
    expect(r.chapter).toBe(0);
    expect(chapterProvided(r)).toBe(true);
  });

  it('keeps a value that itself contains "=" intact', () => {
    // Split on the FIRST '=' only — a naive split('=') would truncate to 'a'.
    //
    // ⚠️ Uses a PLAIN option, deliberately. The first version of this test used
    // BOOK_OPTION and failed — because BOOK_OPTION.parse validates the slug pattern
    // and correctly rejects 'a=b' with process.exit(1). That failure was the
    // validator doing its job, not the splitter dropping characters, and reading it
    // as a splitter bug would have "fixed" working code. Separate the two concerns:
    // this asserts the SPLIT, and the slug rule is tested on its own elsewhere.
    const PLAIN = { name: 'label', flags: ['--label'], type: 'string' };
    const r = parseArgs(['--label=a=b'], [PLAIN]);
    expect(r.label).toBe('a=b');
  });

  it('treats --label= (equals, empty value) on an ordinary option as absent', () => {
    // An option WITHOUT `requiresValue` keeps the lenient reading: absent, default kept.
    const PLAIN = { name: 'label', flags: ['--label'], type: 'string', default: 'x' };
    expect(parseArgs(['--label='], [PLAIN]).label).toBe('x');
  });
});

describe('requiresValue — a SCOPE flag given with no value refuses instead of widening', () => {
  // 🔴 MEASURED 2026-09-28 on the paid tool, `api-translate --dry-run`:
  //   --module m68865   -> 1 module        --chapter=   -> 170 modules (the WHOLE BOOK)
  //   --module=         -> 13 modules      --chapter    -> 170 modules
  //   --module          -> 13 modules      --module ''  -> 13 modules
  // all EXIT 0. These two tests used to pin `--module` and `--module=` as ABSENT, on
  // the reasoning that absent "routes to the bare-flag guard". It did not: the three
  // bare-flag guards (scan-residue, cnxml-fidelity-check, cnxml-linguistic-check) test
  // the RAW TOKEN `argv.includes('--module')`, which `--module=` never satisfies, and
  // api-translate — the one tool where the widening costs money — had no guard at all.
  // ▶ The parser is the only place that SEES the missing value, so it refuses here.
  let exitSpy, errSpy;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('__exit__');
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('refuses a trailing --module with no value', () => {
    expect(() => parseArgs(['--module'], [MODULE_OPTION])).toThrow('__exit__');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('refuses --module= (equals, empty value)', () => {
    expect(() => parseArgs(['--module='], [MODULE_OPTION])).toThrow('__exit__');
  });

  it("refuses --module '' (an empty next argument)", () => {
    expect(() => parseArgs(['--module', ''], [MODULE_OPTION])).toThrow('__exit__');
  });

  it('refuses --module followed by whitespace only', () => {
    expect(() => parseArgs(['--module', '  '], [MODULE_OPTION])).toThrow('__exit__');
  });

  it('refuses --module followed by another DECLARED flag, instead of swallowing it', () => {
    // `--module --dry-run` used to set module = '--dry-run' and drop the dry run.
    const DRY = { name: 'dryRun', flags: ['--dry-run', '-n'], type: 'boolean' };
    expect(() => parseArgs(['--module', '--dry-run'], [MODULE_OPTION, DRY])).toThrow('__exit__');
  });

  it('refuses a trailing --chapter — which widens to the WHOLE BOOK, not a chapter', () => {
    expect(() => parseArgs(['--chapter'], [CHAPTER_OPTION])).toThrow('__exit__');
  });

  it('refuses --chapter= (equals, empty value)', () => {
    expect(() => parseArgs(['--chapter='], [CHAPTER_OPTION])).toThrow('__exit__');
  });

  it('names the flag in the refusal', () => {
    expect(() => parseArgs(['--module='], [MODULE_OPTION])).toThrow('__exit__');
    expect(errSpy.mock.calls.flat().join(' ')).toMatch(/--module requires a value/);
  });

  it('still parses a real module, both spellings (positive control)', () => {
    expect(parseArgs(['--module', 'm68710'], [MODULE_OPTION]).module).toBe('m68710');
    expect(parseArgs(['--module=m68710'], [MODULE_OPTION]).module).toBe('m68710');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('accepts a value that merely starts with "-" when it is not a declared flag', () => {
    // The rule is "the next token is a declared FLAG", never "starts with a dash":
    // -1 is the appendices sentinel's number, and it must stay a value.
    expect(parseArgs(['--chapter', '-1'], [CHAPTER_OPTION]).chapter).toBe(-1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('leaves an absent scope flag absent — only a GIVEN flag with no value refuses', () => {
    const r = parseArgs([], [MODULE_OPTION, CHAPTER_OPTION]);
    expect(r.module).toBeNull();
    expect(r.chapter).toBeNull();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
