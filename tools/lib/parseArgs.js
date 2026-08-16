/**
 * Shared argument parser for pipeline CLI tools.
 *
 * Declarative option definitions replace the duplicated for-loop
 * pattern found across 21 tool files.
 *
 * @example
 * import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from './lib/parseArgs.js';
 * const args = parseArgs(process.argv.slice(2), [BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION]);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve books/ relative to the repo root (this file is <root>/tools/lib/), not
// the process cwd, so `requireBook` works regardless of where a CLI tool is run.
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─── Validation patterns ─────────────────────────────────────────────

/** Valid book slug: alphanumeric, hyphens, underscores (no path separators) */
const BOOK_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

// ─── Preset option constants ──────────────────────────────────────────

export const BOOK_OPTION = {
  name: 'book',
  flags: ['--book'],
  type: 'string',
  default: null,
  parse: (val) => {
    if (!BOOK_SLUG_PATTERN.test(val)) {
      console.error('Error: --book must be alphanumeric with hyphens/underscores');
      process.exit(1);
    }
    return val;
  },
};

/**
 * Boundary check for multi-book tools: require a valid --book.
 * No-op when --help was requested (so help can still print). Otherwise exits
 * with a clear error if --book is missing or books/<book>/ does not exist.
 *
 * @param {{book: string|null, help: boolean}} args
 */
export function requireBook(args) {
  if (args.help) return;
  if (!args.book) {
    console.error('Error: --book is required (e.g. --book efnafraedi-2e)');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(REPO_ROOT, 'books', args.book))) {
    console.error(`Error: unknown book "${args.book}" — books/${args.book}/ does not exist`);
    process.exit(1);
  }
}

export const CHAPTER_OPTION = {
  name: 'chapter',
  flags: ['--chapter'],
  type: 'string',
  default: null,
  parse: (val) => (val === 'appendices' ? 'appendices' : parseInt(val, 10)),
};

/**
 * True when the caller actually supplied `--chapter`.
 *
 * `--chapter 0` parses to the NUMBER 0, which is falsy — so the idiomatic
 * `if (args.chapter)` treats a real chapter 0 as "no chapter given" and
 * silently widens the run to the whole book (measured: 149 chemistry modules
 * where `--chapter 1` scanned 7). Chemistry's ch00 is a real chapter; it holds
 * m68662. NaN, from an unparseable `--chapter abc`, is not a chapter.
 *
 * @param {{chapter?: number|string|null}} args parsed args
 * @returns {boolean}
 */
export function chapterProvided(args) {
  const c = args?.chapter;
  if (c === null || c === undefined) return false;
  return !(typeof c === 'number' && Number.isNaN(c));
}

export const MODULE_OPTION = {
  name: 'module',
  flags: ['--module'],
  type: 'string',
  default: null,
};

// ─── Built-in options (always available) ──────────────────────────────

const BUILTIN_OPTIONS = [
  { name: 'help', flags: ['-h', '--help'], type: 'boolean', default: false },
  { name: 'verbose', flags: ['-v', '--verbose'], type: 'boolean', default: false },
];

// ─── Parser ───────────────────────────────────────────────────────────

/**
 * Parse CLI arguments against declared option definitions.
 *
 * @param {string[]} argv - Typically `process.argv.slice(2)`
 * @param {Array<{name: string, flags: string[], type: 'boolean'|'string'|'number', default?, parse?}>} optionDefs
 * @param {{ positional?: { name: string } }} [config]
 * @returns {object} Parsed arguments keyed by option name
 */
export function parseArgs(argv, optionDefs = [], config = {}) {
  const allDefs = [...BUILTIN_OPTIONS, ...optionDefs];

  // Build flag→definition lookup
  const flagMap = new Map();
  for (const def of allDefs) {
    for (const flag of def.flags) {
      flagMap.set(flag, def);
    }
  }

  // Initialize result with defaults
  const result = {};
  for (const def of allDefs) {
    result[def.name] = def.default !== undefined ? def.default : null;
  }

  // Track positional
  const positionalName = config.positional?.name;
  if (positionalName && !(positionalName in result)) {
    result[positionalName] = null;
  }

  // Parse
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    // 🔴 `--flag=value` — the GNU spelling. `flagMap.get(arg)` is an EXACT match, so
    // before 2026-08-16 `--module=m68710` matched nothing and fell into this
    // function's documented silently-drops-unknown-flags path. That is not merely an
    // ergonomic gap: a per-module gate then ran over the WHOLE CHAPTER and exited 0.
    // Measured on the shipped tools:
    //   cnxml-fidelity-check --module m99999  -> Checked: 0 modules, EXIT 2 (correct)
    //   cnxml-fidelity-check --module=m99999  -> Checked: 7 modules, EXIT 0 (false GREEN)
    // §C82's driver builds these arguments programmatically, where `--flag=value` is
    // what an execFile-style builder produces routinely. Handled HERE rather than in
    // each tool's guard because scan-residue, cnxml-render-fidelity-check and
    // validate-chapter all shared the hole.
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    // `eq > 2` keeps `--=x` (no flag name) out; split on the FIRST '=' only so a
    // value containing '=' survives intact.
    const inlineValue = eq > 2 ? arg.slice(eq + 1) : null;
    const def = flagMap.get(eq > 2 ? arg.slice(0, eq) : arg);

    if (def) {
      if (def.type === 'boolean') {
        result[def.name] = true;
      } else if (inlineValue !== null) {
        // `--flag=` with nothing after it is ABSENT, not an empty value. An empty
        // module id matches no module, and reporting it as present would route past
        // the bare-flag guards that exist to catch exactly this operator slip.
        if (inlineValue !== '') {
          if (def.parse) {
            result[def.name] = def.parse(inlineValue);
          } else if (def.type === 'number') {
            result[def.name] = parseInt(inlineValue, 10);
          } else {
            result[def.name] = inlineValue;
          }
        }
      } else {
        // String or number — consume next arg
        const nextArg = argv[i + 1];
        if (nextArg === undefined) continue;
        i++;

        if (def.parse) {
          result[def.name] = def.parse(nextArg);
        } else if (def.type === 'number') {
          result[def.name] = parseInt(nextArg, 10);
        } else {
          result[def.name] = nextArg;
        }
      }
    } else if (positionalName && !arg.startsWith('-') && result[positionalName] === null) {
      result[positionalName] = arg;
    }
  }

  return result;
}
