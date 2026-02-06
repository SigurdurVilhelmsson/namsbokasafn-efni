#!/usr/bin/env node

/**
 * validate-chapter.js
 *
 * Validates chapter structure and content for publication readiness.
 * Performs comprehensive checks on markdown files before publication.
 *
 * Usage:
 *   node tools/validate-chapter.js <book> <chapter> [options]
 *   node tools/validate-chapter.js efnafraedi 1 --track faithful
 *
 * Options:
 *   --track <track>   Publication track: mt-preview, faithful, localized (default: faithful)
 *   --strict          Treat warnings as errors (exit code 1)
 *   --json            Output as JSON
 *   --fix             Auto-fix where possible
 *   -h, --help        Show help
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  detectMathMLNumberFormat,
  localizeNumbersInMathML,
  verifyLocalization,
} from './lib/mathml-to-latex.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_ROOT = path.join(__dirname, '..');

// Severity levels
const SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

// Publication tracks and their source directories
const TRACKS = {
  'mt-preview': {
    sourceDir: '02-mt-output',
    pubDir: '05-publication/mt-preview',
  },
  faithful: {
    sourceDir: '03-faithful',
    pubDir: '05-publication/faithful',
  },
  localized: {
    sourceDir: '04-localized',
    pubDir: '05-publication/localized',
  },
};

// ============================================================================
// Validators
// ============================================================================

/**
 * Validator definition format:
 * {
 *   name: 'validator-name',
 *   severity: SEVERITY.ERROR | SEVERITY.WARNING | SEVERITY.INFO,
 *   check: async (context) => [{ file, line, message, fix? }]
 * }
 */

const VALIDATORS = {
  'files-exist': {
    severity: SEVERITY.ERROR,
    description: 'Required markdown files are present',
    check: async ({ book, chapter: _chapter, track, chapterDir, statusData }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      // Check if source directory exists
      if (!fs.existsSync(sourceDir)) {
        issues.push({
          file: sourceDir,
          message: `Source directory not found for ${track} track`,
        });
        return issues;
      }

      // Get expected sections from status.json
      const sections = statusData?.sections || [];

      for (const section of sections) {
        // Convert section ID (e.g., "1.1") to filename (e.g., "1-1.is.md")
        const sectionId = section.id;
        let expectedFilename;

        if (sectionId === 'intro' || sectionId === '0' || sectionId.endsWith('.0')) {
          expectedFilename = 'intro.is.md';
        } else {
          expectedFilename = `${sectionId.replace('.', '-')}.is.md`;
        }

        const filePath = path.join(sourceDir, expectedFilename);
        if (!fs.existsSync(filePath)) {
          // Also check without .is suffix (some files may use just .md)
          const altFilename = expectedFilename.replace('.is.md', '.md');
          const altPath = path.join(sourceDir, altFilename);
          if (!fs.existsSync(altPath)) {
            issues.push({
              file: expectedFilename,
              message: `Section ${sectionId} "${section.titleIs || section.titleEn}" file not found`,
            });
          }
        }
      }

      return issues;
    },
  },

  frontmatter: {
    severity: SEVERITY.ERROR,
    description: 'Valid YAML frontmatter with required fields',
    check: async ({ book, chapter: _chapter, track, chapterDir }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      if (!fs.existsSync(sourceDir)) {
        return issues;
      }

      const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for frontmatter
        if (!content.startsWith('---')) {
          issues.push({
            file,
            line: 1,
            message: 'Missing YAML frontmatter (file must start with ---)',
          });
          continue;
        }

        // Extract frontmatter
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!fmMatch) {
          issues.push({
            file,
            line: 1,
            message: 'Malformed frontmatter (missing closing ---)',
          });
          continue;
        }

        const frontmatter = fmMatch[1];

        // Check required fields
        const requiredFields = ['title'];
        for (const field of requiredFields) {
          const fieldPattern = new RegExp(`^${field}:`, 'm');
          if (!fieldPattern.test(frontmatter)) {
            issues.push({
              file,
              line: 1,
              message: `Missing required frontmatter field: ${field}`,
            });
          }
        }

        // Check for empty title
        const titleMatch = frontmatter.match(/^title:\s*["']?([^"'\n]*)["']?\s*$/m);
        if (titleMatch && !titleMatch[1].trim()) {
          issues.push({
            file,
            line: 2,
            message: 'Frontmatter title is empty',
          });
        }
      }

      return issues;
    },
  },

  equations: {
    severity: SEVERITY.ERROR,
    description: 'No orphan equation placeholders',
    check: async ({ book, chapter: _chapter, track, chapterDir }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      if (!fs.existsSync(sourceDir)) {
        return issues;
      }

      const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));

      // Pattern for equation placeholders
      const eqPattern = /\[\[EQ:(\d+)\]\]/g;

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        let match;
        while ((match = eqPattern.exec(content)) !== null) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          issues.push({
            file,
            line: lineNum,
            message: `Orphan equation placeholder: ${match[0]}`,
          });
        }
      }

      return issues;
    },
  },

  'equation-notation': {
    severity: SEVERITY.WARNING,
    description: 'Equation numbers use Icelandic notation after localization',
    check: async ({ book, chapter: _chapter, _track, chapterDir }) => {
      const issues = [];
      const structureDir = path.join(PROJECT_ROOT, 'books', book, '02-structure', chapterDir);

      if (!fs.existsSync(structureDir)) return issues;

      const eqFiles = fs.readdirSync(structureDir).filter((f) => f.endsWith('-equations.json'));

      for (const file of eqFiles) {
        const filePath = path.join(structureDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        for (const [eqId, eq] of Object.entries(data)) {
          if (!eq.mathml) continue;

          const detection = detectMathMLNumberFormat(eq.mathml);

          // Check for mixed notation in source (indicates corruption)
          if (detection.format === 'mixed') {
            issues.push({
              file,
              message: `Equation ${eqId}: mixed US/IS notation in source MathML`,
            });
            continue;
          }

          // Only verify US→IS conversion for equations with US numbers
          if (detection.format !== 'us') continue;

          const localized = localizeNumbersInMathML(eq.mathml);
          const verificationIssues = verifyLocalization(eq.mathml, localized);

          for (const vi of verificationIssues) {
            issues.push({
              file,
              message: `Equation ${eqId}: ${vi.message}`,
            });
          }

          // Idempotency check
          const twice = localizeNumbersInMathML(localized);
          if (localized !== twice) {
            issues.push({
              file,
              message: `Equation ${eqId}: localization is not idempotent (double-application changes output)`,
            });
          }
        }
      }

      return issues;
    },
  },

  images: {
    severity: SEVERITY.WARNING,
    description: 'All referenced images exist',
    check: async ({ book, chapter: _chapter, track, chapterDir }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      if (!fs.existsSync(sourceDir)) {
        return issues;
      }

      const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));

      // Pattern for markdown images
      const imgPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        let match;
        while ((match = imgPattern.exec(content)) !== null) {
          const imagePath = match[2];

          // Skip external URLs
          if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
            continue;
          }

          // Resolve relative path
          const resolvedPath = path.resolve(path.dirname(filePath), imagePath);

          if (!fs.existsSync(resolvedPath)) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            issues.push({
              file,
              line: lineNum,
              message: `Image not found: ${imagePath}`,
            });
          }
        }
      }

      return issues;
    },
  },

  directives: {
    severity: SEVERITY.WARNING,
    description: 'All directive blocks properly closed',
    check: async ({ book, chapter: _chapter, track, chapterDir }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      if (!fs.existsSync(sourceDir)) {
        return issues;
      }

      const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        const openDirectives = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // Opening directive
          const openMatch = line.match(/^:::([a-zA-Z][-a-zA-Z0-9]*)/);
          if (openMatch) {
            openDirectives.push({
              name: openMatch[1],
              line: i + 1,
            });
            continue;
          }

          // Closing marker
          if (line === ':::') {
            if (openDirectives.length > 0) {
              openDirectives.pop();
            }
          }
        }

        // Report unclosed directives
        for (const directive of openDirectives) {
          issues.push({
            file,
            line: directive.line,
            message: `Unclosed directive: :::${directive.name}`,
            fix: 'Run: node tools/repair-directives.js',
          });
        }
      }

      return issues;
    },
  },

  links: {
    severity: SEVERITY.WARNING,
    description: 'No broken internal links',
    check: async ({ book, chapter: _chapter, track, chapterDir }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      if (!fs.existsSync(sourceDir)) {
        return issues;
      }

      const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));

      // Collect all defined IDs first
      const definedIds = new Set();
      const idPattern = /\{#([^}]+)\}/g;

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        let match;
        while ((match = idPattern.exec(content)) !== null) {
          definedIds.add(match[1]);
        }
      }

      // Check internal links
      const linkPattern = /\[([^\]]*)\]\(#([^)]+)\)/g;

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        let match;
        while ((match = linkPattern.exec(content)) !== null) {
          const targetId = match[2];

          if (!definedIds.has(targetId)) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            issues.push({
              file,
              line: lineNum,
              message: `Broken internal link: #${targetId}`,
            });
          }
        }
      }

      return issues;
    },
  },

  'mt-safe-syntax': {
    severity: SEVERITY.WARNING,
    description: 'No remaining MT-safe link syntax',
    check: async ({ book, chapter: _chapter, track, chapterDir }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      if (!fs.existsSync(sourceDir)) {
        return issues;
      }

      const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));

      // Pattern for MT-safe link syntax that should have been restored
      const mtSafePattern = /\[([^\]]*)\]\{(url|ref|doc)="[^"]*"\}/g;

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        let match;
        while ((match = mtSafePattern.exec(content)) !== null) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          issues.push({
            file,
            line: lineNum,
            message: `Unrestored MT-safe link syntax: ${match[0].substring(0, 50)}...`,
            fix: 'Run: node tools/restore-links.js',
          });
        }
      }

      return issues;
    },
  },

  'status-match': {
    severity: SEVERITY.INFO,
    description: 'File state matches status.json',
    check: async ({ book, chapter: _chapter, track, chapterDir, statusData }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      // Check if status indicates this track should have content
      const status = statusData?.status || {};

      // Map track to status field
      const trackStatusMap = {
        'mt-preview': status.mtOutput?.complete || status.publication?.mtPreview?.complete,
        faithful: status.editorialPass1?.complete,
        localized: status.editorialPass2?.complete,
      };

      const shouldHaveContent = trackStatusMap[track];
      const hasContent =
        fs.existsSync(sourceDir) &&
        fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md')).length > 0;

      if (shouldHaveContent && !hasContent) {
        issues.push({
          file: 'status.json',
          message: `Status indicates ${track} track complete, but no files found`,
        });
      }

      if (hasContent && !shouldHaveContent) {
        issues.push({
          file: 'status.json',
          message: `Files exist for ${track} track, but status doesn't indicate completion`,
        });
      }

      return issues;
    },
  },

  'figure-numbers': {
    severity: SEVERITY.WARNING,
    description: 'Figure numbers are sequential within chapter (no gaps)',
    check: async ({ book, chapter, track, chapterDir }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      if (!fs.existsSync(sourceDir)) {
        return issues;
      }

      const files = fs
        .readdirSync(sourceDir)
        .filter((f) => f.endsWith('.md'))
        .sort();

      // Collect all figure numbers across the chapter
      const figureNumbers = [];
      const captionPattern = /\*(?:Mynd|Figure)\s+(\d+)\.(\d+):/g;

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        let match;
        while ((match = captionPattern.exec(content)) !== null) {
          const chapterNum = parseInt(match[1], 10);
          const figNum = parseInt(match[2], 10);
          const lineNum = content.substring(0, match.index).split('\n').length;

          figureNumbers.push({
            chapter: chapterNum,
            figure: figNum,
            full: `${chapterNum}.${figNum}`,
            file,
            line: lineNum,
          });
        }
      }

      // Sort by figure number
      figureNumbers.sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.figure - b.figure;
      });

      // Check for gaps and duplicates
      const expectedChapter = parseInt(chapter, 10);
      let expectedFigure = 1;
      const seen = new Set();

      for (const fig of figureNumbers) {
        const key = fig.full;

        // Check for duplicate
        if (seen.has(key)) {
          issues.push({
            file: fig.file,
            line: fig.line,
            message: `Duplicate figure number: Mynd ${key}`,
          });
        }
        seen.add(key);

        // Check chapter number
        if (fig.chapter !== expectedChapter) {
          issues.push({
            file: fig.file,
            line: fig.line,
            message: `Wrong chapter number: Mynd ${key} (expected chapter ${expectedChapter})`,
          });
        }

        // Check for gap
        if (fig.figure !== expectedFigure && fig.figure > expectedFigure) {
          issues.push({
            file: fig.file,
            line: fig.line,
            message: `Gap in figure numbering: Mynd ${expectedChapter}.${expectedFigure} missing before Mynd ${key}`,
          });
        }

        expectedFigure = Math.max(expectedFigure, fig.figure + 1);
      }

      return issues;
    },
  },

  'cross-references': {
    severity: SEVERITY.WARNING,
    description: 'Cross-references match existing figure/table captions',
    check: async ({ book, chapter: _chapter, track, chapterDir }) => {
      const issues = [];
      const trackConfig = TRACKS[track];
      const sourceDir = path.join(PROJECT_ROOT, 'books', book, trackConfig.sourceDir, chapterDir);

      if (!fs.existsSync(sourceDir)) {
        return issues;
      }

      const files = fs
        .readdirSync(sourceDir)
        .filter((f) => f.endsWith('.md'))
        .sort();

      // First pass: collect all figure/table numbers from captions
      const figureIds = new Set();
      const tableIds = new Set();
      const captionPattern = /\*(?:Mynd|Figure)\s+(\d+\.?\d*):.*?\*(?:\{(?:#|id=")([^}"]+))?/g;
      const tableCaptionPattern = /\*(?:Tafla|Table)\s+(\d+\.?\d*):.*?\*(?:\{(?:#|id=")([^}"]+))?/g;

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        let match;
        while ((match = captionPattern.exec(content)) !== null) {
          figureIds.add(match[1]);
          if (match[2]) figureIds.add(match[2]);
        }
        while ((match = tableCaptionPattern.exec(content)) !== null) {
          tableIds.add(match[1]);
          if (match[2]) tableIds.add(match[2]);
        }
      }

      // Second pass: check cross-references
      const figRefPattern = /\[sjá mynd\s*(\d+\.?\d*)?\]\(#([^)]+)\)/g;
      const tableRefPattern = /\[sjá töflu\s*(\d+\.?\d*)?\]\(#([^)]+)\)/g;

      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        let match;
        while ((match = figRefPattern.exec(content)) !== null) {
          const refNumber = match[1];
          const refId = match[2];
          const lineNum = content.substring(0, match.index).split('\n').length;

          // Check if referenced number or ID exists
          if (refNumber && !figureIds.has(refNumber)) {
            issues.push({
              file,
              line: lineNum,
              message: `Cross-reference to non-existent figure: Mynd ${refNumber}`,
            });
          }
          // Also check ID if provided (CNX_Chem_... pattern)
          if (refId && refId.startsWith('CNX_') && !figureIds.has(refId)) {
            // Only warn if no number was provided - the ID might be in the caption
          }
        }

        while ((match = tableRefPattern.exec(content)) !== null) {
          const refNumber = match[1];
          const lineNum = content.substring(0, match.index).split('\n').length;

          if (refNumber && !tableIds.has(refNumber)) {
            issues.push({
              file,
              line: lineNum,
              message: `Cross-reference to non-existent table: Tafla ${refNumber}`,
            });
          }
        }
      }

      return issues;
    },
  },
};

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    book: null,
    chapter: null,
    track: 'faithful',
    strict: false,
    json: false,
    fix: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--strict') {
      result.strict = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--fix') {
      result.fix = true;
    } else if (arg === '--track' && args[i + 1]) {
      result.track = args[++i];
    } else if (!arg.startsWith('-')) {
      if (!result.book) {
        result.book = arg;
      } else if (!result.chapter) {
        result.chapter = parseInt(arg, 10);
      }
    }
  }

  return result;
}

function printHelp() {
  console.log(`
validate-chapter.js - Validate chapter structure and content

Usage:
  node tools/validate-chapter.js <book> <chapter> [options]

Arguments:
  book           Book slug (e.g., efnafraedi)
  chapter        Chapter number (e.g., 1, 2, 3)

Options:
  --track <track>   Publication track: mt-preview, faithful, localized (default: faithful)
  --strict          Treat warnings as errors (exit code 1)
  --json            Output as JSON
  --fix             Show fix suggestions
  -h, --help        Show this help message

Validation Checks:
  files-exist      Required markdown files are present
  frontmatter      Valid YAML frontmatter with required fields
  equations        No orphan [[EQ:n]] placeholders
  images           All referenced images exist
  directives       All ::: blocks properly closed
  links            No broken internal #id links
  mt-safe-syntax   No remaining [text]{url="..."} syntax
  status-match     File state matches status.json

Examples:
  # Validate chapter 1 for faithful track
  node tools/validate-chapter.js efnafraedi 1 --track faithful

  # Validate with JSON output
  node tools/validate-chapter.js efnafraedi 2 --json

  # Strict mode (warnings fail)
  node tools/validate-chapter.js efnafraedi 1 --strict
`);
}

// ============================================================================
// Main Validation
// ============================================================================

async function validateChapter(options) {
  const { book, chapter, track, strict } = options;

  // Validate track
  if (!TRACKS[track]) {
    throw new Error(`Invalid track: ${track}. Valid tracks: ${Object.keys(TRACKS).join(', ')}`);
  }

  // Build context
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  const statusPath = path.join(PROJECT_ROOT, 'books', book, 'chapters', chapterDir, 'status.json');

  let statusData = null;
  if (fs.existsSync(statusPath)) {
    try {
      statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    } catch (e) {
      // Ignore parse errors
    }
  }

  const context = {
    book,
    chapter,
    track,
    chapterDir,
    statusData,
  };

  const results = {
    book,
    chapter,
    track,
    chapterDir,
    valid: true,
    checks: {},
    summary: {
      errors: 0,
      warnings: 0,
      info: 0,
      passed: 0,
    },
  };

  // Run each validator
  for (const [name, validator] of Object.entries(VALIDATORS)) {
    try {
      const issues = await validator.check(context);

      results.checks[name] = {
        description: validator.description,
        severity: validator.severity,
        passed: issues.length === 0,
        issues: issues.map((issue) => ({
          ...issue,
          severity: validator.severity,
        })),
      };

      if (issues.length === 0) {
        results.summary.passed++;
      } else {
        if (validator.severity === SEVERITY.ERROR) {
          results.summary.errors += issues.length;
          results.valid = false;
        } else if (validator.severity === SEVERITY.WARNING) {
          results.summary.warnings += issues.length;
          if (strict) {
            results.valid = false;
          }
        } else {
          results.summary.info += issues.length;
        }
      }
    } catch (err) {
      results.checks[name] = {
        description: validator.description,
        severity: validator.severity,
        passed: false,
        error: err.message,
      };
      results.summary.errors++;
      results.valid = false;
    }
  }

  return results;
}

function formatResults(results, options) {
  const { json, fix } = options;

  if (json) {
    return JSON.stringify(results, null, 2);
  }

  const lines = [];

  lines.push(`Validating ${results.book} chapter ${results.chapter} (${results.track})...`);
  lines.push('');

  // Show each check result
  for (const [name, check] of Object.entries(results.checks)) {
    const symbol = check.passed ? '\u2713' : check.severity === 'error' ? '\u2717' : '\u26a0';
    const issueCount = check.issues?.length || 0;

    if (check.passed) {
      lines.push(`${symbol} ${name}: ${check.description}`);
    } else if (check.error) {
      lines.push(`\u2717 ${name}: Error - ${check.error}`);
    } else {
      lines.push(`${symbol} ${name}: ${issueCount} ${check.severity}(s)`);

      // Show issues
      for (const issue of check.issues || []) {
        const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
        const prefix =
          check.severity === 'error' ? 'ERROR' : check.severity === 'warning' ? 'WARNING' : 'INFO';
        lines.push(`  ${prefix}: ${issue.message} (${location})`);

        if (fix && issue.fix) {
          lines.push(`    Fix: ${issue.fix}`);
        }
      }
    }
  }

  lines.push('');
  lines.push(
    `Summary: ${results.summary.errors} error(s), ${results.summary.warnings} warning(s), ${results.summary.info} info`
  );

  if (results.valid) {
    lines.push('');
    lines.push('Validation PASSED');
  } else {
    lines.push('');
    lines.push('Validation FAILED');
  }

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.book || !args.chapter) {
    console.error('Error: Please provide book and chapter');
    console.error('Usage: node tools/validate-chapter.js <book> <chapter> [options]');
    console.error('Use --help for more information');
    process.exit(1);
  }

  // Check book directory exists
  const bookDir = path.join(PROJECT_ROOT, 'books', args.book);
  if (!fs.existsSync(bookDir)) {
    console.error(`Error: Book directory not found: ${args.book}`);
    process.exit(1);
  }

  try {
    const results = await validateChapter(args);
    const output = formatResults(results, args);

    console.log(output);

    process.exit(results.valid ? 0 : 1);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
