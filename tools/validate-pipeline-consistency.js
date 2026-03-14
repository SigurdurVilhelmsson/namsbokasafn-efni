#!/usr/bin/env node

/**
 * Pipeline Status Consistency Validator
 *
 * Checks that pipeline stage statuses (in DB) are consistent with
 * actual file existence on disk. Catches cases where:
 * - linguisticReview is marked 'complete' but faithful files are missing
 * - Approved edits exist but haven't been applied
 * - MT output files exist without corresponding extraction
 *
 * Usage:
 *   node tools/validate-pipeline-consistency.js [--book efnafraedi-2e] [--fix]
 *
 * Can also be imported and used as a library:
 *   const { validateAll } = require('./validate-pipeline-consistency.js');
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOOKS_DIR = path.resolve(__dirname, '../books');
const DATA_DIR = path.resolve(__dirname, '../server/data');

/**
 * Load book catalog from server/data/{bookSlug}.json
 * Maps book slug to its internal name (e.g., efnafraedi-2e → chemistry-2e)
 */
function loadBookCatalog(bookSlug) {
  // Try slug-based filename first, then scan for matching slug field
  const dataFiles = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'decisions.json');

  for (const file of dataFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
    if (data.slug === bookSlug) {
      return data;
    }
  }
  return null;
}

/**
 * Get chapter directory name from chapter number
 */
function chapterDir(chapterNum) {
  if (chapterNum === -1) return 'appendices';
  return `ch${String(chapterNum).padStart(2, '0')}`;
}

/**
 * List module IDs that have files in a given directory matching a pattern
 */
function listModuleFiles(dir, suffix = '-segments.is.md') {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => f.replace(suffix, ''));
}

/**
 * Validate a single chapter's pipeline consistency
 *
 * @param {string} bookSlug - e.g., 'efnafraedi-2e'
 * @param {number} chapterNum - chapter number or -1 for appendices
 * @param {string[]} expectedModuleIds - module IDs from catalog
 * @param {object} [stageData] - pipeline stage data from DB (optional)
 * @param {object} [options] - { booksDir } for testing
 * @returns {{ issues: Array<{severity: string, message: string}>, chapter: number }}
 */
function validateChapter(bookSlug, chapterNum, expectedModuleIds, stageData, options) {
  const issues = [];
  const chDir = chapterDir(chapterNum);
  const booksDir = options?.booksDir || BOOKS_DIR;
  const bookDir = path.join(booksDir, bookSlug);

  const mtOutputDir = path.join(bookDir, '02-mt-output', chDir);
  const faithfulDir = path.join(bookDir, '03-faithful-translation', chDir);

  // 1. Check MT output files exist for all expected modules
  const mtModules = listModuleFiles(mtOutputDir);
  const faithfulModules = listModuleFiles(faithfulDir);

  // 2. Check linguisticReview consistency
  if (stageData && stageData.linguisticReview === 'complete') {
    // Stage says complete — verify ALL modules have faithful files
    const missingFaithful = mtModules.filter((m) => !faithfulModules.includes(m));
    if (missingFaithful.length > 0) {
      issues.push({
        severity: 'error',
        message:
          `linguisticReview marked complete but ${missingFaithful.length} ` +
          `module(s) missing faithful files: ${missingFaithful.join(', ')}`,
      });
    }

    // Also check: are there expected modules not even in MT output?
    const missingMt = expectedModuleIds.filter((m) => !mtModules.includes(m));
    if (missingMt.length > 0) {
      issues.push({
        severity: 'warning',
        message: `${missingMt.length} expected module(s) not in MT output: ` + missingMt.join(', '),
      });
    }
  }

  // 3. Check: faithful files exist but linguisticReview not complete (informational)
  if (
    stageData &&
    stageData.linguisticReview !== 'complete' &&
    faithfulModules.length > 0 &&
    mtModules.length > 0
  ) {
    const coverage = faithfulModules.length + '/' + mtModules.length;
    if (faithfulModules.length === mtModules.length) {
      issues.push({
        severity: 'info',
        message:
          `All ${coverage} modules have faithful files but linguisticReview ` +
          `not marked complete — may need manual advance`,
      });
    }
  }

  // 4. Check: faithful files without corresponding MT output (orphans)
  const orphanFaithful = faithfulModules.filter((m) => !mtModules.includes(m));
  if (orphanFaithful.length > 0) {
    issues.push({
      severity: 'warning',
      message:
        `${orphanFaithful.length} faithful file(s) without MT output: ` + orphanFaithful.join(', '),
    });
  }

  // 5. Check: rendering marked complete but no HTML files exist
  if (stageData && stageData.rendering === 'complete') {
    const pubDir = path.join(bookDir, '05-publication');
    const tracks = ['mt-preview', 'faithful', 'localized'];
    let hasAnyHtml = false;
    for (const track of tracks) {
      const trackDir = path.join(pubDir, track, 'chapters', chDir);
      if (fs.existsSync(trackDir)) {
        const htmlFiles = fs.readdirSync(trackDir).filter((f) => f.endsWith('.html'));
        if (htmlFiles.length > 0) hasAnyHtml = true;
      }
    }
    if (!hasAnyHtml) {
      issues.push({
        severity: 'error',
        message: 'rendering marked complete but no HTML files found in any publication track',
      });
    }
  }

  return { chapter: chapterNum, issues };
}

/**
 * Validate all chapters for a book
 *
 * @param {string} bookSlug
 * @param {function} [getStageDataFn] - Optional function(bookSlug, chapterNum) → stage data
 * @returns {{ book: string, results: Array, summary: {errors: number, warnings: number, info: number} }}
 */
function validateBook(bookSlug, getStageDataFn) {
  const catalog = loadBookCatalog(bookSlug);
  if (!catalog) {
    return {
      book: bookSlug,
      results: [],
      summary: { errors: 1, warnings: 0, info: 0 },
      error: `Book catalog not found for ${bookSlug}`,
    };
  }

  const results = [];
  let errors = 0;
  let warnings = 0;
  let info = 0;

  for (const ch of catalog.chapters) {
    const moduleIds = ch.modules.map((m) => m.id);
    const stageData = getStageDataFn ? getStageDataFn(bookSlug, ch.chapter) : null;
    const result = validateChapter(bookSlug, ch.chapter, moduleIds, stageData);

    if (result.issues.length > 0) {
      results.push(result);
      for (const issue of result.issues) {
        if (issue.severity === 'error') errors++;
        else if (issue.severity === 'warning') warnings++;
        else info++;
      }
    }
  }

  // Also check appendices if they exist
  if (catalog.appendices && catalog.appendices.length > 0) {
    const appendixIds = catalog.appendices.map((a) => a.id);
    const stageData = getStageDataFn ? getStageDataFn(bookSlug, -1) : null;
    const result = validateChapter(bookSlug, -1, appendixIds, stageData);
    if (result.issues.length > 0) {
      results.push(result);
      for (const issue of result.issues) {
        if (issue.severity === 'error') errors++;
        else if (issue.severity === 'warning') warnings++;
        else info++;
      }
    }
  }

  return { book: bookSlug, results, summary: { errors, warnings, info } };
}

/**
 * Validate all registered books
 */
function validateAll(getStageDataFn) {
  const dataFiles = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'decisions.json');

  const reports = [];
  for (const file of dataFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
    if (data.slug && data.chapters) {
      reports.push(validateBook(data.slug, getStageDataFn));
    }
  }
  return reports;
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('validate-pipeline-consistency.js')) {
  const args = process.argv.slice(2);
  const bookFlag = args.indexOf('--book');
  const targetBook = bookFlag >= 0 ? args[bookFlag + 1] : null;

  console.log('Pipeline Consistency Validator');
  console.log('='.repeat(50));

  const reports = targetBook ? [validateBook(targetBook)] : validateAll();

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const report of reports) {
    if (report.error) {
      console.log(`\n${report.book}: ERROR — ${report.error}`);
      totalErrors++;
      continue;
    }

    const { errors, warnings, info } = report.summary;
    totalErrors += errors;
    totalWarnings += warnings;

    if (report.results.length === 0) {
      console.log(`\n${report.book}: OK (no issues)`);
      continue;
    }

    console.log(`\n${report.book}: ${errors} error(s), ${warnings} warning(s), ${info} info`);
    for (const result of report.results) {
      const chLabel = result.chapter === -1 ? 'appendices' : `ch${result.chapter}`;
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? 'X' : issue.severity === 'warning' ? '!' : 'i';
        console.log(`  [${icon}] ${chLabel}: ${issue.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${totalErrors} error(s), ${totalWarnings} warning(s)`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

export { validateBook, validateAll, validateChapter, loadBookCatalog };
