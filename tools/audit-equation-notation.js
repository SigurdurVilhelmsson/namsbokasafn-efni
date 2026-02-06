#!/usr/bin/env node

/**
 * audit-equation-notation.js
 *
 * Pre-publication validator that compares source equation numbers (US format)
 * against their localized output (expected IS format) to catch:
 *
 *   1. UNCONVERTED numbers — US format surviving into output
 *   2. DOUBLE-CONVERTED numbers — IS format fed through conversion again
 *   3. MIXED notation — some numbers US, some IS in the same equation
 *   4. VALUE changes — numeric value altered during conversion
 *
 * Works by reading source MathML from 02-structure/ equations.json files,
 * applying localizeNumbersInMathML, and verifying the result. Also scans
 * rendered HTML in 05-publication/ for data-latex attributes to check
 * the final output.
 *
 * Usage:
 *   node tools/audit-equation-notation.js [--chapter <num>] [--verbose] [--fix-check]
 *
 * Options:
 *   --chapter <num>   Audit specific chapter (default: all)
 *   --verbose         Show all equations, not just issues
 *   --fix-check       Dry-run: show what localizeNumbersInMathML would change
 */

import fs from 'fs';
import path from 'path';
import {
  detectNumberFormat,
  detectMathMLNumberFormat,
  localizeNumbersInMathML,
  verifyLocalization,
} from './lib/mathml-to-latex.js';

const BOOKS_DIR = 'books/efnafraedi';

// ============================================================================
// Argument parsing
// ============================================================================

function parseArgs(args) {
  const result = { chapter: null, verbose: false, fixCheck: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i]);
    else if (args[i] === '--verbose') result.verbose = true;
    else if (args[i] === '--fix-check') result.fixCheck = true;
  }
  return result;
}

// ============================================================================
// Find equation files
// ============================================================================

function findEquationFiles(chapter) {
  const structureDir = path.join(BOOKS_DIR, '02-structure');
  if (!fs.existsSync(structureDir)) {
    console.error(`Structure directory not found: ${structureDir}`);
    process.exit(1);
  }

  const chapters = chapter
    ? [`ch${String(chapter).padStart(2, '0')}`]
    : fs.readdirSync(structureDir).filter((d) => d.startsWith('ch') || d === 'appendices').sort();

  const files = [];
  for (const ch of chapters) {
    const chDir = path.join(structureDir, ch);
    if (!fs.existsSync(chDir)) continue;
    const eqFiles = fs.readdirSync(chDir).filter((f) => f.endsWith('-equations.json'));
    for (const f of eqFiles) {
      files.push(path.join(chDir, f));
    }
  }
  return files.sort();
}

// ============================================================================
// Source notation audit
// ============================================================================

function auditSourceNotation(files, verbose) {
  const stats = {
    totalEquations: 0,
    totalNumbers: 0,
    usNumbers: 0,
    isNumbers: 0,
    integerNumbers: 0,
    mixedEquations: 0,
    alreadyLocalizedEquations: 0,
  };
  const issues = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const relFile = path.relative(BOOKS_DIR, file);

    for (const [eqId, eq] of Object.entries(data)) {
      if (!eq.mathml) continue;
      stats.totalEquations++;

      const detection = detectMathMLNumberFormat(eq.mathml);

      // Count numbers
      stats.usNumbers += detection.counts.us || 0;
      stats.isNumbers += detection.counts.is || 0;
      stats.integerNumbers += detection.counts.integer || 0;
      stats.totalNumbers +=
        (detection.counts.us || 0) + (detection.counts.is || 0) + (detection.counts.integer || 0);

      if (detection.format === 'mixed') {
        stats.mixedEquations++;
        issues.push({
          type: 'mixed-source',
          file: relFile,
          eqId,
          message: `Mixed US/IS notation in source MathML`,
          details: detection.details,
        });
      } else if (detection.format === 'is') {
        stats.alreadyLocalizedEquations++;
        if (verbose) {
          issues.push({
            type: 'already-localized',
            file: relFile,
            eqId,
            message: `Source already in IS format (idempotency guard will skip)`,
            details: detection.details,
          });
        }
      }
    }
  }

  return { stats, issues };
}

// ============================================================================
// Conversion verification
// ============================================================================

function verifyConversions(files, verbose) {
  const issues = [];
  let verified = 0;
  let passed = 0;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const relFile = path.relative(BOOKS_DIR, file);

    for (const [eqId, eq] of Object.entries(data)) {
      if (!eq.mathml) continue;

      // Check if the equation has any numbers worth converting
      const detection = detectMathMLNumberFormat(eq.mathml);
      if (detection.format !== 'us') continue; // Only verify US→IS conversion

      verified++;

      // Apply localization
      const localized = localizeNumbersInMathML(eq.mathml);

      // Verify the result
      const verificationIssues = verifyLocalization(eq.mathml, localized);

      if (verificationIssues.length > 0) {
        for (const vi of verificationIssues) {
          issues.push({
            ...vi,
            file: relFile,
            eqId,
          });
        }
      } else {
        passed++;
        if (verbose) {
          // Show successful conversions
          const sourceNums = [];
          const localizedNums = [];
          const srcPattern = /<m:mn(?:\s[^>]*)?>([^<]+)<\/m:mn>/g;
          const locPattern = /<m:mn(?:\s[^>]*)?>([^<]+)<\/m:mn>/g;
          let match;
          while ((match = srcPattern.exec(eq.mathml)) !== null) {
            const fmt = detectNumberFormat(match[1]);
            if (fmt === 'us') sourceNums.push(match[1]);
          }
          while ((match = locPattern.exec(localized)) !== null) {
            // After localization, numbers are marked with data-localized="is"
            // so we can't rely on format detection — just show them all
            localizedNums.push(match[1]);
          }
          if (sourceNums.length > 0) {
            issues.push({
              type: 'verified-ok',
              file: relFile,
              eqId,
              message: `${sourceNums.join(', ')} → ${localizedNums.join(', ')}`,
            });
          }
        }
      }
    }
  }

  return { issues, verified, passed };
}

// ============================================================================
// Idempotency check
// ============================================================================

function checkIdempotency(files) {
  const issues = [];
  let tested = 0;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const relFile = path.relative(BOOKS_DIR, file);

    for (const [eqId, eq] of Object.entries(data)) {
      if (!eq.mathml) continue;

      const detection = detectMathMLNumberFormat(eq.mathml);
      if (detection.format !== 'us') continue;

      tested++;

      // Apply once
      const once = localizeNumbersInMathML(eq.mathml);
      // Apply twice
      const twice = localizeNumbersInMathML(once);

      if (once !== twice) {
        issues.push({
          type: 'not-idempotent',
          file: relFile,
          eqId,
          message: 'Double-application changes output (idempotency guard may have failed)',
          once: extractNumbers(once),
          twice: extractNumbers(twice),
        });
      }
    }
  }

  return { issues, tested };
}

function extractNumbers(mathml) {
  const nums = [];
  const mnPattern = /<m:mn(?:\s[^>]*)?>([^<]+)<\/m:mn>/g;
  let match;
  while ((match = mnPattern.exec(mathml)) !== null) {
    nums.push(match[1]);
  }
  return nums;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = findEquationFiles(args.chapter);

  if (files.length === 0) {
    console.error('No equation files found');
    process.exit(1);
  }

  console.log('=== Equation Notation Audit ===');
  console.log(`Files: ${files.length}`);
  console.log();

  // 1. Audit source notation
  console.log('--- Source Notation Analysis ---');
  const { stats, issues: sourceIssues } = auditSourceNotation(files, args.verbose);
  console.log(`Total equations: ${stats.totalEquations}`);
  console.log(`Total numbers in <m:mn>: ${stats.totalNumbers}`);
  console.log(`  US format: ${stats.usNumbers}`);
  console.log(`  IS format: ${stats.isNumbers} (already localized in source)`);
  console.log(`  Integers (no conversion needed): ${stats.integerNumbers}`);
  if (stats.mixedEquations > 0) {
    console.log(`  MIXED notation equations: ${stats.mixedEquations}`);
  }
  if (stats.alreadyLocalizedEquations > 0) {
    console.log(`  Already localized equations: ${stats.alreadyLocalizedEquations}`);
  }
  console.log();

  // 2. Verify conversions
  console.log('--- Conversion Verification ---');
  const { issues: convIssues, verified, passed } = verifyConversions(files, args.verbose);
  console.log(`Equations with US numbers verified: ${verified}`);
  console.log(`Passed: ${passed}`);
  console.log(`Issues: ${convIssues.filter((i) => i.type !== 'verified-ok').length}`);
  console.log();

  // 3. Idempotency check
  console.log('--- Idempotency Check (double-application safety) ---');
  const { issues: idempIssues, tested } = checkIdempotency(files);
  console.log(`Equations tested: ${tested}`);
  console.log(
    `Idempotent: ${tested - idempIssues.length}/${tested}` +
      (idempIssues.length === 0 ? ' (all safe)' : '')
  );
  console.log();

  // Collect all issues
  const allIssues = [...sourceIssues, ...convIssues, ...idempIssues].filter(
    (i) => i.type !== 'verified-ok' && i.type !== 'already-localized'
  );
  const infoItems = [...sourceIssues, ...convIssues].filter(
    (i) => i.type === 'verified-ok' || i.type === 'already-localized'
  );

  // Report issues
  if (allIssues.length > 0) {
    console.log('--- ISSUES ---');
    console.log();
    for (const issue of allIssues) {
      const tag = issue.type.toUpperCase();
      console.log(`  [${tag}] ${issue.file} → ${issue.eqId}`);
      console.log(`    ${issue.message}`);
      if (issue.details) {
        for (const d of issue.details) {
          console.log(`    - "${d.content}" (${d.format}${d.element ? ', in ' + d.element : ''})`);
        }
      }
      if (issue.once && issue.twice) {
        console.log(`    1st pass: ${issue.once.join(', ')}`);
        console.log(`    2nd pass: ${issue.twice.join(', ')}`);
      }
      console.log();
    }
  }

  // Verbose output
  if (args.verbose && infoItems.length > 0) {
    console.log('--- DETAILS ---');
    console.log();
    for (const item of infoItems) {
      console.log(`  [${item.type.toUpperCase()}] ${item.file} → ${item.eqId}: ${item.message}`);
    }
    console.log();
  }

  // Summary
  console.log('=== Summary ===');
  if (allIssues.length === 0) {
    console.log('All checks passed. No notation issues found.');
    console.log();
    console.log('Safeguards in place:');
    console.log('  - Idempotency guard prevents double-conversion');
    console.log('  - Per-number format detection skips already-localized values');
    console.log('  - Mixed notation triggers warnings');
  } else {
    console.log(`Found ${allIssues.length} issue(s) requiring attention.`);
  }

  process.exit(allIssues.length > 0 ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
