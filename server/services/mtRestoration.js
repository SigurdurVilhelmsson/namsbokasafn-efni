/**
 * MT Restoration Service
 *
 * Wraps the CLI tools restore-strings.js and restore-tables.js
 * to integrate translated strings and restore table content
 * during MT preview publication.
 *
 * This service ensures that:
 * - Frontmatter titles are translated
 * - Table titles and summaries are restored
 * - Figure captions and alt text are integrated
 * - Table markdown is restored from sidecar JSON
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TOOLS_DIR = path.join(__dirname, '..', '..', 'tools');
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

/**
 * Run restore-strings.js on a chapter directory
 * Updates sidecar JSON with translated strings from *-strings.is.md files
 *
 * @param {string} chapterDir - Absolute path to the chapter directory (e.g., books/efnafraedi/02-mt-output/ch01)
 * @param {object} options - Options: { dryRun, verbose }
 * @returns {object} Result with success status and details
 */
function restoreStrings(chapterDir, { dryRun = false, verbose = false } = {}) {
  const scriptPath = path.join(TOOLS_DIR, 'restore-strings.js');

  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      error: `restore-strings.js not found at ${scriptPath}`
    };
  }

  if (!fs.existsSync(chapterDir)) {
    return {
      success: false,
      error: `Chapter directory not found: ${chapterDir}`
    };
  }

  try {
    const args = ['--batch', chapterDir];
    if (dryRun) args.push('--dry-run');
    if (verbose) args.push('--verbose');

    const result = execSync(`node "${scriptPath}" ${args.join(' ')}`, {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..', '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Parse output to extract statistics
    const updatesMatch = result.match(/Files updated:\s*(\d+)/);
    const totalMatch = result.match(/Total updates applied:\s*(\d+)/);

    return {
      success: true,
      filesUpdated: updatesMatch ? parseInt(updatesMatch[1], 10) : 0,
      totalUpdates: totalMatch ? parseInt(totalMatch[1], 10) : 0,
      output: result,
      dryRun
    };
  } catch (err) {
    // execSync throws on non-zero exit code
    const output = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';

    return {
      success: false,
      error: err.message,
      output,
      stderr
    };
  }
}

/**
 * Run restore-tables.js on a chapter directory
 * Replaces [[TABLE:N]] placeholders with table markdown from sidecar
 *
 * @param {string} chapterDir - Absolute path to the chapter directory
 * @param {object} options - Options: { dryRun, verbose }
 * @returns {object} Result with success status and details
 */
function restoreTables(chapterDir, { dryRun = false, verbose = false } = {}) {
  const scriptPath = path.join(TOOLS_DIR, 'restore-tables.js');

  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      error: `restore-tables.js not found at ${scriptPath}`
    };
  }

  if (!fs.existsSync(chapterDir)) {
    return {
      success: false,
      error: `Chapter directory not found: ${chapterDir}`
    };
  }

  try {
    const args = ['--batch', chapterDir];
    if (dryRun) args.push('--dry-run');
    if (verbose) args.push('--verbose');

    const result = execSync(`node "${scriptPath}" ${args.join(' ')}`, {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..', '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Parse output to extract statistics
    const restoredMatch = result.match(/Files with tables restored:\s*(\d+)/);
    const tablesMatch = result.match(/Total tables restored:\s*(\d+)/);

    return {
      success: true,
      filesRestored: restoredMatch ? parseInt(restoredMatch[1], 10) : 0,
      totalTables: tablesMatch ? parseInt(tablesMatch[1], 10) : 0,
      output: result,
      dryRun
    };
  } catch (err) {
    const output = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';

    return {
      success: false,
      error: err.message,
      output,
      stderr
    };
  }
}

/**
 * Run full MT restoration pipeline for a chapter
 * Runs restore-strings.js followed by restore-tables.js
 *
 * @param {string} bookSlug - Book slug (e.g., 'efnafraedi')
 * @param {number} chapterNum - Chapter number
 * @param {object} options - Options: { dryRun, verbose }
 * @returns {object} Combined result from both restoration steps
 */
function runMtRestoration(bookSlug, chapterNum, { dryRun = false, verbose = false } = {}) {
  const chapterDir = path.join(
    BOOKS_DIR,
    bookSlug,
    '02-mt-output',
    `ch${String(chapterNum).padStart(2, '0')}`
  );

  if (!fs.existsSync(chapterDir)) {
    return {
      success: false,
      error: `MT output directory not found: ${chapterDir}`,
      stringsResult: null,
      tablesResult: null
    };
  }

  // Step 1: Restore strings (updates sidecar with translated frontmatter, table titles, etc.)
  const stringsResult = restoreStrings(chapterDir, { dryRun, verbose });

  // Step 2: Restore tables (replaces placeholders with table markdown)
  const tablesResult = restoreTables(chapterDir, { dryRun, verbose });

  // Combine results
  const success = stringsResult.success && tablesResult.success;

  return {
    success,
    chapterDir,
    stringsResult,
    tablesResult,
    summary: {
      stringsUpdated: stringsResult.totalUpdates || 0,
      tablesRestored: tablesResult.totalTables || 0
    },
    dryRun
  };
}

module.exports = {
  restoreStrings,
  restoreTables,
  runMtRestoration
};
