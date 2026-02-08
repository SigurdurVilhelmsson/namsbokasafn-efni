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

const BOOKS_DIR = 'books/efnafraedi';

function parseArgs(args) {
  const result = {
    chapter: null,
    module: null,
    track: 'mt-preview',
    verbose: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--json') result.json = true;
    else if (arg === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i], 10);
    else if (arg === '--module' && args[i + 1]) result.module = args[++i];
    else if (arg === '--track' && args[i + 1]) result.track = args[++i];
  }

  return result;
}

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
      const relativeSrc = src.replace(/^\/content\/efnafraedi\/chapters\/\d+\//, '');
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
  const sourcePath = path.join(BOOKS_DIR, '01-source', `ch${chapterStr}`, `${moduleId}.cnxml`);
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
    issues.push({
      check: 'id-preservation',
      severity: 'warning',
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
    `ch${chapterStr}`,
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
  const chapterStr = String(chapter).padStart(2, '0');
  const sourceDir = path.join(BOOKS_DIR, '01-source', `ch${chapterStr}`);

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
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.chapter) {
    console.error('Error: --chapter is required');
    process.exit(1);
  }

  try {
    const modules = findModules(args.chapter, args.module);
    const allResults = [];
    let totalIssues = 0;
    let totalErrors = 0;

    for (const moduleId of modules) {
      const result = await auditModule(args.chapter, moduleId, args.track, args.verbose);
      allResults.push(result);

      if (result.error) {
        console.error(`${moduleId}: ${result.error}`);
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

    if (args.json) {
      console.log(JSON.stringify(allResults, null, 2));
    } else {
      console.log('\n' + '='.repeat(60));
      console.log(
        `Audit complete: ${modules.length} module(s), ${totalIssues} issue(s) (${totalErrors} error(s))`
      );
      if (totalErrors === 0 && totalIssues === 0) {
        console.log('Result: PASS');
      } else if (totalErrors === 0) {
        console.log('Result: PASS with warnings');
      } else {
        console.log('Result: FAIL');
      }
    }

    process.exit(totalErrors > 0 ? 1 : 0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
