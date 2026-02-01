/**
 * Shared Utilities
 *
 * Common utility functions used across multiple CLI tools.
 * Import from here instead of duplicating in each tool.
 */

import fs from 'fs';
import path from 'path';

/**
 * Parse command line arguments into an options object.
 *
 * Supports:
 * - Boolean flags: --verbose, -h
 * - Key-value pairs: --output file.md, --chapter 5
 * - Positional arguments (non-flag arguments)
 *
 * @param {string[]} args - Command line arguments (process.argv.slice(2))
 * @param {Object} schema - Schema defining expected arguments
 * @returns {Object} Parsed arguments
 *
 * @example
 * const schema = {
 *   flags: ['verbose', 'help', 'h'],
 *   options: {
 *     output: { alias: 'o', default: null },
 *     chapter: { type: 'number' }
 *   },
 *   positional: ['input']
 * };
 * const args = parseArgs(process.argv.slice(2), schema);
 */
export function parseArgs(args, schema = {}) {
  const result = {
    _positional: [],
  };

  // Initialize defaults
  const flags = new Set(schema.flags || []);
  const options = schema.options || {};
  const aliases = {};

  for (const [key, config] of Object.entries(options)) {
    if (config.default !== undefined) {
      result[key] = config.default;
    }
    if (config.alias) {
      aliases[config.alias] = key;
    }
  }

  for (const flag of flags) {
    result[flag] = false;
  }

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);

      if (flags.has(key)) {
        result[key] = true;
      } else if (options[key]) {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          const value = args[++i];
          result[key] = options[key].type === 'number' ? parseInt(value, 10) : value;
        } else {
          result[key] = true;
        }
      } else {
        // Unknown option, store as-is
        result[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const short = arg.slice(1);

      if (flags.has(short)) {
        result[short] = true;
      } else if (aliases[short]) {
        const key = aliases[short];
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          const value = args[++i];
          result[key] = options[key].type === 'number' ? parseInt(value, 10) : value;
        } else {
          result[key] = true;
        }
      } else {
        result[short] = true;
      }
    } else {
      result._positional.push(arg);
    }
    i++;
  }

  // Assign positional arguments to named fields
  if (schema.positional) {
    for (let j = 0; j < schema.positional.length; j++) {
      const name = schema.positional[j];
      result[name] = result._positional[j] || null;
    }
  }

  return result;
}

/**
 * Validate a chapter number
 * @param {number|string} chapter - Chapter number to validate
 * @param {number} max - Maximum valid chapter (default: 21)
 * @returns {{ valid: boolean, chapter: number|null, error?: string }}
 */
export function validateChapter(chapter, max = 21) {
  const num = typeof chapter === 'string' ? parseInt(chapter, 10) : chapter;

  if (isNaN(num)) {
    return { valid: false, chapter: null, error: 'Chapter must be a number' };
  }

  if (num < 1 || num > max) {
    return { valid: false, chapter: null, error: `Chapter must be between 1 and ${max}` };
  }

  return { valid: true, chapter: num };
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Path to the directory
 * @returns {boolean} True if directory exists or was created
 */
export function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  }
  return fs.statSync(dirPath).isDirectory();
}

/**
 * Format a chapter number with leading zero (e.g., 1 -> "01")
 * @param {number} chapter - Chapter number
 * @returns {string} Zero-padded chapter string
 */
export function padChapter(chapter) {
  return String(chapter).padStart(2, '0');
}

/**
 * Format a section number (e.g., 1, 1 -> "1-1")
 * @param {number} chapter - Chapter number
 * @param {number|string} section - Section number or 'intro'
 * @returns {string} Formatted section string
 */
export function formatSection(chapter, section) {
  if (section === 'intro') {
    return `${chapter}-intro`;
  }
  return `${chapter}-${section}`;
}

/**
 * Print formatted error message to stderr
 * @param {string} message - Error message
 * @param {Object} options - Options
 */
export function printError(message, { exitCode = 1, prefix = 'Error' } = {}) {
  console.error(`${prefix}: ${message}`);
  if (exitCode !== null) {
    process.exit(exitCode);
  }
}

/**
 * Print formatted warning message to stderr
 * @param {string} message - Warning message
 */
export function printWarning(message) {
  console.error(`Warning: ${message}`);
}

/**
 * Print formatted success message
 * @param {string} message - Success message
 */
export function printSuccess(message) {
  console.log(`✓ ${message}`);
}

/**
 * Read JSON file safely
 * @param {string} filePath - Path to JSON file
 * @returns {Object|null} Parsed JSON or null on error
 */
export function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write JSON file with formatting
 * @param {string} filePath - Path to output file
 * @param {Object} data - Data to write
 * @param {number} indent - Indentation (default: 2)
 */
export function writeJsonFile(filePath, data, indent = 2) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, indent) + '\n');
}

/**
 * Create a timestamped backup of a file
 * @param {string} filePath - Path to file to backup
 * @returns {string|null} Path to backup file, or null if original doesn't exist
 */
export function createBackup(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '').replace('T', '-');
  const backupPath = `${filePath}.${timestamp}.bak`;

  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Get the book root directory
 * @param {string} book - Book identifier (e.g., 'efnafraedi')
 * @param {string} baseDir - Base directory (default: './books')
 * @returns {string} Path to book root
 */
export function getBookRoot(book, baseDir = './books') {
  return path.join(baseDir, book);
}

/**
 * Get the chapter directory for a specific stage
 * @param {string} book - Book identifier
 * @param {number} chapter - Chapter number
 * @param {string} stage - Pipeline stage (e.g., '02-for-mt', '03-faithful')
 * @param {string} baseDir - Base directory
 * @returns {string} Path to chapter directory
 */
export function getChapterDir(book, chapter, stage, baseDir = './books') {
  return path.join(baseDir, book, stage, 'chapters', padChapter(chapter));
}

/**
 * Simple progress indicator for CLI tools
 */
export class ProgressIndicator {
  constructor(total, { label = 'Progress', width = 30 } = {}) {
    this.total = total;
    this.current = 0;
    this.label = label;
    this.width = width;
  }

  update(current = this.current + 1) {
    this.current = Math.min(current, this.total);
    const percentage = Math.floor((this.current / this.total) * 100);
    const filled = Math.floor((this.current / this.total) * this.width);
    const bar = '█'.repeat(filled) + '░'.repeat(this.width - filled);

    process.stderr.write(
      `\r${this.label}: [${bar}] ${percentage}% (${this.current}/${this.total})`
    );

    if (this.current === this.total) {
      process.stderr.write('\n');
    }
  }

  complete() {
    this.update(this.total);
  }
}
