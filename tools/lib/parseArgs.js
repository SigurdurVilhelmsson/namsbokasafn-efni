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

// ─── Preset option constants ──────────────────────────────────────────

export const BOOK_OPTION = {
  name: 'book',
  flags: ['--book'],
  type: 'string',
  default: 'efnafraedi-2e',
};

export const CHAPTER_OPTION = {
  name: 'chapter',
  flags: ['--chapter'],
  type: 'string',
  default: null,
  parse: (val) => (val === 'appendices' ? 'appendices' : parseInt(val, 10)),
};

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
    const def = flagMap.get(arg);

    if (def) {
      if (def.type === 'boolean') {
        result[def.name] = true;
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
