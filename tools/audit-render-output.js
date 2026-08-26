#!/usr/bin/env node

/**
 * audit-render-output.js
 *
 * Post-render audit: compares source CNXML against rendered HTML output
 * to verify structural completeness and detect pipeline losses.
 *
 * Checks:
 *   1. Element count comparison (source vs output)
 *   2. ID preservation (all source IDs should appear in HTML)
 *   3. Image existence (all referenced images exist on disk)
 *   4. Placeholder leak detection (no [[MATH:N]], {{SEG:...}}, etc. in output)
 *   5. Equation render validation (no empty equations, no merror elements)
 *   6. Manifest consistency (if manifest.json exists, verify counts match)
 *
 * Usage:
 *   node tools/audit-render-output.js --chapter <num> [options]
 *
 * Options:
 *   --chapter <num>    Chapter number
 *   --module <id>      Specific module ID (default: all in chapter)
 *   --track <name>     Publication track (default: mt-preview)
 *   --verbose          Show detailed output
 *   --json             Output as JSON
 *   -h, --help         Show this help
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  parseArgs,
  BOOK_OPTION,
  CHAPTER_OPTION,
  MODULE_OPTION,
  requireBook,
  chapterProvided,
} from './lib/parseArgs.js';

// Set from --book in main(). No default: see AUDIT_OPTIONS below.
let BOOKS_DIR = null;
let BOOK_SLUG = null;

/**
 * 🔴 `--track` AND `--json` MUST BE DECLARED HERE OR THEY VANISH SILENTLY.
 * `tools/lib/parseArgs.js` DROPS UNKNOWN FLAGS WITHOUT WARNING (§C83), so migrating
 * off this file's former module-local parser would otherwise turn `--track faithful`
 * into a no-op that quietly falls back to `mt-preview` — a wrong answer reported as
 * a right one, which is the failure this whole battery exists to prevent.
 * `--help` and `--verbose` come from the parser's BUILTIN_OPTIONS and must NOT be
 * re-declared. Bound by the `--track` test in
 * `tools/__tests__/audit-render-output-defects.test.js`, whose fixture is decisive
 * because the two tracks give OPPOSITE verdicts on chemistry ch01: mt-preview FAILs
 * (2 errors, exit 1) and faithful PASSes with warnings (exit 0). A dropped flag
 * therefore shows up as the wrong verdict rather than as a missing option.
 *
 * ▶ THE MIGRATION IS WHAT FIXES TWO OF THE FOUR DEFECTS, and it is the idiom the
 * sibling tool `cnxml-fidelity-check.js` already uses: `BOOK_OPTION.default` is
 * `null` + `requireBook()` (defect 4), and `chapterProvided()` (defect 2). It also
 * gains `--flag=value` support, which the former local parser did not handle.
 */
const AUDIT_OPTIONS = [
  BOOK_OPTION,
  CHAPTER_OPTION,
  MODULE_OPTION,
  { name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' },
  { name: 'json', flags: ['--json'], type: 'boolean', default: false },
];

function printHelp() {
  console.log(`
audit-render-output.js - Post-render audit comparing source CNXML to HTML output

Checks:
  1. Element count comparison (figures, tables, equations, etc.)
  2. ID preservation (all source IDs should appear in output)
  3. Image existence (referenced images exist on disk)
  4. Placeholder leak detection ([[MATH:N]], {{SEG:...}}, etc.)
  5. Equation render quality (no empty SVGs, no merror)
  6. Manifest consistency

Usage:
  node tools/audit-render-output.js --chapter <num> [--track <track>]

Options:
  --chapter <num>    Chapter number
  --module <id>      Specific module (default: all)
  --track <name>     Publication track (default: mt-preview)
  --verbose          Show detailed output
  --json             Output as JSON
  -h, --help         Show this help
`);
}

/**
 * The SOURCE/STRUCTURE chapter directory name — `chNN`, or `appendices` unprefixed.
 *
 * 🔴 CLAUDE.md § Directory Structure: source/structure/status dirs are `ch`-PREFIXED while
 * publication-track OUTPUT dirs are BARE (`chapters/01`, `chapters/appendices`). This tool
 * touches both, and only the prefixed side was wrong: three sites built
 * `` `ch${String(chapter).padStart(2,'0')}` ``, which for `appendices` yields the
 * non-existent **`chappendices`**. The bare publication path needs no branch, because
 * `String('appendices').padStart(2,'0')` is already `'appendices'` — which is exactly the
 * kind of coincidence that makes one half of a two-convention pair look fine.
 *
 * ⚠️ NOT A REGRESSION FROM THIS BRANCH'S parseArgs MIGRATION, and it is worth being precise:
 * the previous parser did `parseInt('appendices', 10)` -> NaN -> falsy -> `--chapter is
 * required`. BOTH refused; the migration did not break appendices, it declined to fix them
 * while copying the idiom from a sibling (`cnxml-fidelity-check.js`) that HAS the branch.
 * Fixed here because R4's own base rates are counted per chapter and appendices are 13 real
 * auditable modules — measured: 13 attempted, 13 audited, 6 errors across 5 modules.
 */
function sourceChapterDir(chapter) {
  return chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
}

/**
 * Count element types in CNXML source.
 */
function countSourceElements(cnxml) {
  return {
    figures: (cnxml.match(/<figure\s/g) || []).length,
    tables: (cnxml.match(/<table\s/g) || []).length,
    equations: (cnxml.match(/<equation\s/g) || []).length,
    examples: (cnxml.match(/<example\s/g) || []).length,
    exercises: (cnxml.match(/<exercise\s/g) || []).length,
    notes: (cnxml.match(/<note\s/g) || []).length,
    sections: (cnxml.match(/<section\s/g) || []).length,
    glossaryTerms: (cnxml.match(/<definition\s/g) || []).length,
  };
}

/**
 * Count element types in rendered HTML.
 */
function countOutputElements(html) {
  return {
    figures: (html.match(/<figure[\s>]/g) || []).length,
    tables: (html.match(/<table[\s>]/g) || []).length,
    equations: (html.match(/class="equation[\s"]/g) || []).length,
    examples: (html.match(/class="example[\s"]/g) || []).length,
    exercises: (html.match(/class="exercise[\s"]/g) || []).length,
    notes: (html.match(/class="note[\s]/g) || []).length,
    sections: (html.match(/<section[\s>]/g) || []).length,
    glossaryTerms: (html.match(/<dt[\s>]/g) || []).length,
  };
}

/**
 * Extract all IDs from CNXML source.
 */
function extractSourceIds(cnxml) {
  const ids = new Set();
  const pattern = /\bid="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(cnxml)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

/**
 * Extract all IDs from rendered HTML.
 */
function extractOutputIds(html) {
  const ids = new Set();
  const pattern = /\bid="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

/**
 * Check for placeholder leaks in rendered HTML.
 */
function checkPlaceholderLeaks(html) {
  const leaks = [];

  // [[MATH:N]] placeholders
  const mathLeaks = html.match(/\[\[MATH:\d+\]\]/g) || [];
  for (const leak of mathLeaks) {
    leaks.push({ type: 'MATH', value: leak });
  }

  // {{SEG:...}} placeholders
  const segLeaks = html.match(/\{\{SEG:[^}]+\}\}/g) || [];
  for (const leak of segLeaks) {
    leaks.push({ type: 'SEG', value: leak });
  }

  // {{LINK:N}} or {{XREF:N}} placeholders
  const linkLeaks = html.match(/\{\{(?:LINK|XREF):\d+\}\}/g) || [];
  for (const leak of linkLeaks) {
    leaks.push({ type: 'LINK/XREF', value: leak });
  }

  // <!-- SEG:... --> comment tags that shouldn't be in rendered HTML
  const commentLeaks = html.match(/<!--\s*SEG:[^>]+-->/g) || [];
  for (const leak of commentLeaks) {
    leaks.push({ type: 'SEG-COMMENT', value: leak.substring(0, 50) });
  }

  // B4 inline markers that should have been consumed at inject
  const inlineMarkerLeaks = html.match(/\[\[(?:term|fn|u|em):[^\]]*\]\]/g) || [];
  for (const leak of inlineMarkerLeaks) {
    leaks.push({ type: 'INLINE-MARKER', value: leak.substring(0, 60) });
  }

  // Unresolved cross-references showing as raw IDs
  const rawRefLeaks = html.match(/\[#[A-Za-z][^\]]*\]/g) || [];
  for (const leak of rawRefLeaks) {
    leaks.push({ type: 'RAW-REF', value: leak });
  }

  return leaks;
}

/**
 * Check equation render quality in HTML.
 */
function checkEquationQuality(html) {
  const issues = [];

  // Find all equation divs
  const eqPattern = /<div[^>]*class="equation[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let match;
  while ((match = eqPattern.exec(html)) !== null) {
    const eqContent = match[1];
    const idMatch = match[0].match(/id="([^"]+)"/);
    const eqId = idMatch ? idMatch[1] : 'unknown';

    // Check for MathJax error elements
    if (eqContent.includes('merror') || eqContent.includes('data-mjx-error')) {
      issues.push({ id: eqId, issue: 'mathjax-error' });
    }

    // Check for empty SVG (rendered but no visible content)
    if (eqContent.includes('<svg') && !eqContent.includes('<path') && !eqContent.includes('<use')) {
      issues.push({ id: eqId, issue: 'empty-svg' });
    }

    // Check for missing SVG entirely (should have been rendered)
    if (!eqContent.includes('<svg') && !eqContent.includes('mathjax')) {
      issues.push({ id: eqId, issue: 'no-render' });
    }
  }

  return issues;
}

/**
 * Check referenced images exist.
 */
function checkImageExistence(html, chapter, track) {
  const issues = [];
  const chapterStr = String(chapter).padStart(2, '0');
  const pubDir = path.join(BOOKS_DIR, '05-publication', track, 'chapters', chapterStr);

  // Find all img src attributes
  const imgPattern = /src="([^"]+)"/g;
  let match;
  while ((match = imgPattern.exec(html)) !== null) {
    const src = match[1];
    // Only check local images (not external URLs)
    if (src.startsWith('http://') || src.startsWith('https://')) continue;

    // For absolute paths like /content/efnafraedi/chapters/05/images/media/...
    // Check relative to 05-publication directory
    if (src.startsWith('/content/')) {
      const relativeSrc = src.replace(new RegExp(`^/content/${BOOK_SLUG}/chapters/\\d+/`), '');
      const imgPath = path.join(pubDir, relativeSrc);
      if (!fs.existsSync(imgPath)) {
        // Also check source media directory as fallback
        const sourceMediaPath = path.join(BOOKS_DIR, '01-source', 'media', path.basename(src));
        if (!fs.existsSync(sourceMediaPath)) {
          issues.push({ src, resolved: imgPath });
        }
      }
    }
  }

  return issues;
}

/**
 * Audit a single module.
 */
async function auditModule(chapter, moduleId, track, _verbose) {
  const chapterStr = String(chapter).padStart(2, '0');
  const issues = [];
  const details = {};

  // Load source CNXML
  const sourcePath = path.join(
    BOOKS_DIR,
    '01-source',
    sourceChapterDir(chapter),
    `${moduleId}.cnxml`
  );
  if (!fs.existsSync(sourcePath)) {
    return { moduleId, error: `Source CNXML not found: ${sourcePath}`, issues: [], details: {} };
  }
  const sourceCnxml = fs.readFileSync(sourcePath, 'utf-8');

  // Find rendered HTML
  const pubDir = path.join(BOOKS_DIR, '05-publication', track, 'chapters', chapterStr);
  const htmlFiles = fs.existsSync(pubDir)
    ? fs.readdirSync(pubDir).filter((f) => f.endsWith('.html'))
    : [];

  // Find the HTML file for this module (by data-module-id attribute or filename)
  let htmlPath = null;
  for (const file of htmlFiles) {
    const filePath = path.join(pubDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes(`data-module-id="${moduleId}"`)) {
      htmlPath = filePath;
      break;
    }
  }

  if (!htmlPath) {
    // Try matching by module ID in filename
    const fallback = htmlFiles.find((f) => f.includes(moduleId));
    if (fallback) {
      htmlPath = path.join(pubDir, fallback);
    }
  }

  if (!htmlPath) {
    return { moduleId, error: `Rendered HTML not found for ${moduleId}`, issues: [], details: {} };
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');

  // 1. Element count comparison
  const sourceCounts = countSourceElements(sourceCnxml);
  const outputCounts = countOutputElements(html);
  details.elementCounts = { source: sourceCounts, output: outputCounts };

  // Sections are excluded from main content (summary, exercises, key-equations)
  // so output will have fewer. Exercises and glossary terms in excluded sections
  // are expected to be missing — only flag unexpected drops.
  const expectPartialExclusion = new Set(['exercises', 'sections', 'glossaryTerms']);

  for (const [type, sourceCount] of Object.entries(sourceCounts)) {
    const outputCount = outputCounts[type] || 0;
    if (type === 'sections') continue; // Sections are heavily filtered, skip

    if (expectPartialExclusion.has(type)) {
      // These types commonly have elements in excluded sections; warn only
      if (sourceCount > 0 && outputCount === 0 && sourceCount > 1) {
        issues.push({
          check: 'element-count',
          severity: 'warning',
          message: `${type}: 0/${sourceCount} in output (may be in excluded sections: summary, exercises, key-equations)`,
        });
      }
    } else {
      // For core content types (figures, tables, equations, examples, notes),
      // missing elements are more concerning
      if (sourceCount > 0 && outputCount === 0) {
        issues.push({
          check: 'element-count',
          severity: 'error',
          message: `All ${sourceCount} ${type} missing from output`,
        });
      } else if (outputCount < sourceCount * 0.5 && sourceCount > 2) {
        issues.push({
          check: 'element-count',
          severity: 'warning',
          message: `${type}: ${outputCount}/${sourceCount} (${Math.round((outputCount / sourceCount) * 100)}% preserved)`,
        });
      }
    }
  }

  // 2. ID preservation
  const sourceIds = extractSourceIds(sourceCnxml);
  const outputIds = extractOutputIds(html);
  const missingIds = [];
  // Only check structurally important IDs (figures, tables, examples, sections, exercises)
  for (const id of sourceIds) {
    if (
      id.startsWith('fs-') ||
      id.startsWith('CNX_') ||
      id.match(/^(fig|table|example|exercise|note|eq)-/)
    ) {
      if (!outputIds.has(id)) {
        missingIds.push(id);
      }
    }
  }
  details.idPreservation = {
    sourceIds: sourceIds.size,
    outputIds: outputIds.size,
    missingCount: missingIds.length,
  };

  if (missingIds.length > 0) {
    // 🔴 PROMOTED warning -> error (§C82 Plan B Task 11, R4 defect 1). The exit code
    // keys on `totalErrors`, so as a `warning` a real ID drop printed
    // `PASS with warnings` and exited 0 — reader-visible content going missing,
    // reported as success by the tool whose job is to catch exactly that. Measured on
    // `m68663 --track mt-preview`: `0 error(s), 1 warning(s)` / `1 ID(s) missing from
    // output`, exit 0.
    issues.push({
      check: 'id-preservation',
      severity: 'error',
      message: `${missingIds.length} ID(s) missing from output`,
      details: missingIds.slice(0, 10),
    });
  }

  // 3. Placeholder leak detection
  const leaks = checkPlaceholderLeaks(html);
  details.placeholderLeaks = leaks.length;
  if (leaks.length > 0) {
    issues.push({
      check: 'placeholder-leak',
      severity: 'error',
      message: `${leaks.length} placeholder(s) leaked into output`,
      details: leaks.slice(0, 5),
    });
  }

  // 4. Equation render quality
  const eqIssues = checkEquationQuality(html);
  details.equationIssues = eqIssues.length;
  if (eqIssues.length > 0) {
    issues.push({
      check: 'equation-quality',
      severity: 'warning',
      message: `${eqIssues.length} equation(s) with render issues`,
      details: eqIssues.slice(0, 5),
    });
  }

  // 5. Image existence
  const imgIssues = checkImageExistence(html, chapter, track);
  details.missingImages = imgIssues.length;
  if (imgIssues.length > 0) {
    issues.push({
      check: 'image-existence',
      severity: 'warning',
      message: `${imgIssues.length} referenced image(s) not found`,
      details: imgIssues.slice(0, 5),
    });
  }

  // 6. Manifest consistency
  const manifestPath = path.join(
    BOOKS_DIR,
    '02-structure',
    sourceChapterDir(chapter),
    `${moduleId}-manifest.json`
  );
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Check if source has changed since extraction
    const currentHash = crypto
      .createHash('sha256')
      .update(sourceCnxml)
      .digest('hex')
      .substring(0, 16);
    if (manifest.sourceHash !== currentHash) {
      issues.push({
        check: 'manifest-consistency',
        severity: 'warning',
        message: `Source CNXML has changed since extraction (hash mismatch: ${manifest.sourceHash} vs ${currentHash})`,
      });
    }

    details.manifest = { exists: true, sourceHashMatch: manifest.sourceHash === currentHash };
  } else {
    details.manifest = { exists: false };
  }

  return { moduleId, htmlFile: path.basename(htmlPath), issues, details };
}

/**
 * Find modules for a chapter.
 */
function findModules(chapter, moduleId) {
  const sourceDir = path.join(BOOKS_DIR, '01-source', sourceChapterDir(chapter));

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  if (moduleId) {
    return [moduleId];
  }

  return fs
    .readdirSync(sourceDir)
    .filter((f) => f.endsWith('.cnxml'))
    .map((f) => f.replace('.cnxml', ''))
    .sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2), AUDIT_OPTIONS);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // 🔴 DEFECT 4 — `--book` no longer defaults to `efnafraedi-2e`. Omitting it used to
  // audit chemistry whichever book you meant. `requireBook` is a no-op under --help,
  // so the help text above still prints. Swept before changing: NOTHING executable
  // invokes this tool (package.json, scripts/, .github/workflows/, server/), so no
  // caller relied on the default.
  requireBook(args);
  BOOKS_DIR = `books/${args.book}`;
  BOOK_SLUG = args.book;

  // 🔴 DEFECT 2 — `if (!args.chapter)` rejected `--chapter 0`, the falsy-zero
  // truthiness bug. Chemistry's ch00 is a real chapter: it holds `m68662` and its
  // rendered page `0-1-formali.html` exists, so the chapter was fully auditable and
  // the tool simply refused to look. Plan A fixed this class in four tools and never
  // enumerated this one. `chapterProvided` also rejects NaN from `--chapter abc`.
  if (!chapterProvided(args)) {
    console.error('Error: --chapter is required');
    process.exit(1);
  }

  try {
    const modules = findModules(args.chapter, args.module);
    const allResults = [];
    let totalIssues = 0;
    let totalErrors = 0;
    // 🔴 DEFECT 3 — modules the tool COULD NOT AUDIT were `continue`d past without
    // touching `totalErrors` or any success counter, so a chapter in which every
    // module failed printed `Result: PASS` and exited 0. That is §C60's signature —
    // a check reporting clean having read nothing — inside the tool §C82's Tier 3
    // wraps. Measured 2026-08-26 by sweeping every chapter of both kept books, and
    // it is WHOLE-CHAPTER rather than the single-module edge case it was filed as:
    //
    //   book                track       chapters printing PASS over ZERO audited
    //   efnafraedi-2e       mt-preview   0 of 23   <- control: it discriminates
    //   efnafraedi-2e       faithful    19 of 23
    //   lifraen-efnafraedi  mt-preview  30 of 31   (329 modules)
    //   lifraen-efnafraedi  faithful    n/a — no rendered html exists at all
    //
    // ⚠️ QUOTE THE TRACK WITH THE NUMBER. "chemistry: 0 of 23" is true of mt-preview
    // and false of faithful; stating it as a BOOK figure is a measurement generalised
    // one step past its coverage.
    let failedModules = 0;

    for (const moduleId of modules) {
      const result = await auditModule(args.chapter, moduleId, args.track, args.verbose);
      allResults.push(result);

      if (result.error) {
        console.error(`${moduleId}: ${result.error}`);
        failedModules++;
        continue;
      }

      const errors = result.issues.filter((i) => i.severity === 'error').length;
      const warnings = result.issues.filter((i) => i.severity === 'warning').length;
      totalIssues += result.issues.length;
      totalErrors += errors;

      if (args.json) continue;

      if (result.issues.length === 0) {
        console.log(`${moduleId}: PASS (${result.htmlFile})`);
      } else {
        console.log(`${moduleId}: ${errors} error(s), ${warnings} warning(s) (${result.htmlFile})`);
        for (const issue of result.issues) {
          const prefix = issue.severity === 'error' ? 'ERROR' : 'WARNING';
          console.log(`  ${prefix}: ${issue.message}`);
          if (args.verbose && issue.details) {
            for (const detail of Array.isArray(issue.details) ? issue.details : [issue.details]) {
              console.log(`    - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
            }
          }
        }
      }

      if (args.verbose && result.details.elementCounts) {
        const s = result.details.elementCounts.source;
        const o = result.details.elementCounts.output;
        console.log(
          `  Elements: figures ${o.figures}/${s.figures}, tables ${o.tables}/${s.tables}, equations ${o.equations}/${s.equations}, examples ${o.examples}/${s.examples}`
        );
      }
    }

    const audited = modules.length - failedModules;

    if (args.json) {
      console.log(JSON.stringify(allResults, null, 2));
    } else {
      console.log('\n' + '='.repeat(60));
      // The count says how many modules were ATTEMPTED and how many were actually
      // AUDITED. Reporting only the former is what made `13 module(s), 0 issue(s)`
      // read as a clean chapter when all 13 had failed.
      console.log(
        `Audit complete: ${modules.length} module(s) attempted, ${audited} audited, ` +
          `${totalIssues} issue(s) (${totalErrors} error(s), ${failedModules} unauditable)`
      );
      if (failedModules > 0) {
        console.log(`Result: FAIL — ${failedModules} module(s) could not be audited`);
      } else if (totalErrors === 0 && totalIssues === 0) {
        console.log('Result: PASS');
      } else if (totalErrors === 0) {
        console.log('Result: PASS with warnings');
      } else {
        console.log('Result: FAIL');
      }
    }

    // 🔴 `process.exitCode`, NOT `process.exit()`. Node writes stdout to a PIPE
    // asynchronously, so `process.exit()` DISCARDS whatever is still queued —
    // silently, with the exit code still correct. This is the LAST statement of the
    // try block, so letting the function return changes nothing else; the
    // usage-error exits above are deliberately left as `process.exit()`, because
    // converting one of those makes `main()` fall THROUGH to the rest of the run.
    // ⚠️ HONEST SCOPE: measured 2026-08-26, this is NOT a live truncation today —
    // the largest real `--json` payload is chemistry ch18 at 21,657 bytes against a
    // 65,536-byte pipe buffer, and redirect and pipe were byte-identical. It is
    // closed anyway because the margin is only ~3x and Plan C's driver reads this
    // tool's `--json` through a PIPE (the spawn model at
    // `server/services/publicationService.js:124-184`), which is precisely the
    // invocation shape that trips it.
    process.exitCode = totalErrors > 0 || failedModules > 0 ? 1 : 0;
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run as CLI when executed directly (allows safe import for unit testing).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { checkPlaceholderLeaks };
