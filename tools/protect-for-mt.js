#!/usr/bin/env node

/**
 * protect-for-mt.js
 *
 * Pre-MT protection script that extracts frontmatter and tables before
 * sending content to Erlendur machine translation (malstadur.is).
 *
 * The MT process destroys these structures:
 * - YAML frontmatter: converted to `## title:...` heading
 * - Tables: line breaks removed, pipes merged
 *
 * This script:
 * 1. Extracts YAML frontmatter
 * 2. Finds all markdown tables
 * 3. Replaces tables with [[TABLE:N]]{id="..."} placeholders
 * 4. Writes sidecar JSON file (*-protected.json)
 * 5. Outputs modified markdown
 *
 * Usage:
 *   node tools/protect-for-mt.js <file.en.md> [--in-place]
 *   node tools/protect-for-mt.js --batch <directory>
 *   node tools/protect-for-mt.js <file.en.md> --dry-run
 *
 * Options:
 *   --in-place        Modify the input file in place
 *   --batch <dir>     Process all .en.md files in directory
 *   --dry-run         Show what would change without writing
 *   --verbose         Show processing details
 *   -h, --help        Show help message
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    input: null,
    batch: null,
    inPlace: false,
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--in-place') result.inPlace = true;
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
protect-for-mt.js - Pre-MT protection for tables and frontmatter

Extracts content that would be destroyed by MT and saves to sidecar JSON.
Tables are replaced with [[TABLE:N]]{id="..."} placeholders.

Also generates a strings file (*-strings.en.md) in markdown format with:
- Frontmatter titles
- Table titles and summaries (accessibility text)
- Figure captions and alt text (from figures.json)

The markdown format is compatible with Erlendur MT (malstadur.is).

Usage:
  node tools/protect-for-mt.js <file.en.md> [options]
  node tools/protect-for-mt.js --batch <directory>

Options:
  --in-place        Modify the input file in place
  --batch <dir>     Process all .en.md files in directory recursively
  --dry-run         Show what would change without writing files
  --verbose, -v     Show processing details
  -h, --help        Show this help message

Output Files:
  *-protected.json  Sidecar with extracted tables and frontmatter
  *-strings.en.md   Translatable strings in markdown format (for Erlendur MT)

Examples:
  # Preview protection for a single file
  node tools/protect-for-mt.js books/efnafraedi/02-for-mt/ch01/1-5.en.md --dry-run

  # Protect a file in place (writes sidecar and modifies file)
  node tools/protect-for-mt.js books/efnafraedi/02-for-mt/ch01/1-5.en.md --in-place

  # Process all files in a chapter
  node tools/protect-for-mt.js --batch books/efnafraedi/02-for-mt/ch01/
`);
}

// ============================================================================
// Frontmatter Parsing
// ============================================================================

/**
 * Extract YAML frontmatter from markdown content
 * @param {string} content - The markdown content
 * @returns {{frontmatter: object|null, contentWithoutFrontmatter: string}}
 */
function extractFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

  if (!frontmatterMatch) {
    return { frontmatter: null, contentWithoutFrontmatter: content };
  }

  const frontmatterText = frontmatterMatch[1];
  const frontmatter = {};

  // Parse YAML-like frontmatter (simple key: value pairs)
  for (const line of frontmatterText.split('\n')) {
    const match = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (match) {
      frontmatter[match[1]] = match[2];
    }
  }

  const contentWithoutFrontmatter = content.slice(frontmatterMatch[0].length);

  return { frontmatter, contentWithoutFrontmatter };
}

// ============================================================================
// Directive Protection
// ============================================================================

/**
 * Directive names that should NOT be translated by MT.
 * These are markdown-it-container directive names used by the rendering system.
 * They are NOT user-facing content, so they must remain in English.
 */
const PROTECTED_DIRECTIVES = [
  'example',
  'answer',
  'exercise',
  'learning-objectives',
  'link-to-learning',
  'everyday-life',
  'chemist-portrait',
  'how-sciences-interconnect',
  'sciences-interconnect',
  'glossary-entry',
  'key-term',
  'note',
  'warning',
  'tip',
  'important',
  'caution',
  'info',
  'summary',
  'solution',
  'problem',
  'question',
  'worked-example',
];

/**
 * Protect directive names from MT translation by wrapping them in [[markers]].
 *
 * Transforms: :::example{id="..."} → :::[[DIRECTIVE:example]]{id="..."}
 *
 * The post-MT restoration script will convert these back.
 *
 * @param {string} content - Markdown content
 * @param {boolean} verbose - Whether to log protection details
 * @returns {{content: string, directivesProtected: number}}
 */
function protectDirectives(content, verbose) {
  let directivesProtected = 0;

  // Pattern matches directive opening: :::name or :::name{attributes}
  // Captures: (1) directive name, (2) optional attributes including braces
  const directivePattern = /^(:::)(\w+(?:-\w+)*)((?:\{[^}]*\})?)/gm;

  const protectedContent = content.replace(directivePattern, (match, prefix, name, attrs) => {
    // Only protect known directive names
    if (PROTECTED_DIRECTIVES.includes(name.toLowerCase())) {
      directivesProtected++;
      if (verbose) {
        console.error(`  Protected directive: :::${name}`);
      }
      return `${prefix}[[DIRECTIVE:${name}]]${attrs}`;
    }
    return match;
  });

  return { content: protectedContent, directivesProtected };
}

// ============================================================================
// Table Detection and Protection
// ============================================================================

/**
 * Match a markdown table with optional preceding title and trailing attributes.
 *
 * Pattern matches:
 * - Optional bolded title: **Title Text**
 * - Table: rows starting with |
 * - Optional trailing attributes: {id="..." summary="..."}
 */
const TABLE_PATTERN = /(?:^\*\*([^*\n]+)\*\*\s*\n\n)?((?:^\|[^\n]+\|\s*\n)+)(?:\{([^}]+)\})?/gm;

/**
 * Extract tables from markdown and replace with placeholders
 * @param {string} content - Markdown content (without frontmatter)
 * @param {boolean} verbose - Whether to output verbose info
 * @returns {{content: string, tables: object}}
 */
function extractTables(content, verbose) {
  const tables = {};
  let tableCount = 0;

  const protectedContent = content.replace(
    TABLE_PATTERN,
    (match, title, tableMarkdown, attributes) => {
      tableCount++;
      const key = `TABLE:${tableCount}`;

      // Parse attributes to extract id
      let id = null;
      let summary = null;

      if (attributes) {
        const idMatch = attributes.match(/id="([^"]+)"/);
        if (idMatch) id = idMatch[1];

        const summaryMatch = attributes.match(/summary="([^"]+)"/);
        if (summaryMatch) summary = summaryMatch[1];
      }

      // Store the table data
      tables[key] = {
        markdown: tableMarkdown.trim(),
        ...(title && { title: title.trim() }),
        ...(id && { id }),
        ...(summary && { summary }),
      };

      if (verbose) {
        console.error(`  Protected ${key}: ${title || '(no title)'} ${id ? `(id="${id}")` : ''}`);
      }

      // Create placeholder with optional id attribute
      let placeholder = `[[${key}]]`;
      if (id) {
        placeholder += `{id="${id}"}`;
      }

      // If there was a title, preserve it before the placeholder
      if (title) {
        return `**${title.trim()}**\n\n${placeholder}`;
      }

      return placeholder;
    }
  );

  return { content: protectedContent, tables };
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Get the sidecar file path for a markdown file
 * @param {string} mdPath - Path to the markdown file
 * @returns {string} Path to the sidecar JSON file
 */
function getSidecarPath(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath, '.en.md');
  return path.join(dir, `${basename}-protected.json`);
}

/**
 * Get the strings file path for a markdown file
 * @param {string} mdPath - Path to the markdown file
 * @returns {string} Path to the strings .en.md file
 */
function getStringsPath(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath, '.en.md');
  return path.join(dir, `${basename}-strings.en.md`);
}

/**
 * Get the figures file path for a markdown file
 * @param {string} mdPath - Path to the markdown file
 * @returns {string|null} Path to the figures.json file if it exists
 */
function getFiguresPath(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath, '.en.md');

  // Try different naming conventions
  const candidates = [
    path.join(dir, `${basename}-figures.json`),
    path.join(dir, `${basename}.en-figures.json`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Load figures data from JSON file
 * @param {string} mdPath - Path to the markdown file
 * @returns {object|null} Figures data or null if not found
 */
function loadFiguresData(mdPath) {
  const figuresPath = getFiguresPath(mdPath);
  if (!figuresPath) return null;

  try {
    return JSON.parse(fs.readFileSync(figuresPath, 'utf-8'));
  } catch (err) {
    return null;
  }
}

/**
 * Generate translatable strings content in markdown format
 *
 * Format designed for Erlendur MT compatibility:
 * - Uses markdown headers and bold labels
 * - Readable format that survives MT processing
 *
 * @param {object} sidecar - The sidecar data with frontmatter and tables
 * @param {object|null} figuresData - The figures data from figures.json
 * @returns {string} Formatted markdown content for MT
 */
function generateStringsContent(sidecar, figuresData) {
  const lines = [];
  const section = sidecar.section || sidecar.frontmatter?.section || 'unknown';

  lines.push(`# Translatable Strings - Section ${section}`);
  lines.push('');

  let hasContent = false;

  // Frontmatter section - use [[markers]] to protect from MT translation
  if (sidecar.frontmatter?.title) {
    hasContent = true;
    lines.push('## [[FRONTMATTER]]');
    lines.push('');
    lines.push(`**[[TITLE]]:** ${sidecar.frontmatter.title}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Tables section - use [[markers]] to protect from MT translation
  if (sidecar.tables && Object.keys(sidecar.tables).length > 0) {
    hasContent = true;
    lines.push('## [[TABLES]]');
    lines.push('');

    for (const [key, table] of Object.entries(sidecar.tables)) {
      const tableNum = key.replace('TABLE:', '');
      lines.push(`### [[TABLE:${tableNum}]]`);
      lines.push('');

      if (table.title) {
        lines.push(`**[[TITLE]]:** ${table.title}`);
        lines.push('');
      }

      if (table.summary) {
        lines.push(`**[[SUMMARY]]:** ${table.summary}`);
        lines.push('');
      }
    }
    lines.push('---');
    lines.push('');
  }

  // Figures section (from figures.json) - use [[markers]] to protect from MT
  const figures = figuresData?.figures;
  if (figures && Object.keys(figures).length > 0) {
    hasContent = true;
    lines.push('## [[FIGURES]]');
    lines.push('');

    for (const [figId, fig] of Object.entries(figures)) {
      lines.push(`### [[${figId}]]`);
      lines.push('');

      if (fig.captionEn) {
        lines.push(`**[[CAPTION]]:** ${fig.captionEn}`);
        lines.push('');
      }

      if (fig.altText) {
        lines.push(`**[[ALT_TEXT]]:** ${fig.altText}`);
        lines.push('');
      }
    }
  }

  // Only return content if there's something to translate
  if (!hasContent) {
    return '';
  }

  return lines.join('\n');
}

/**
 * Process a single file
 * @param {string} filePath - Path to the markdown file
 * @param {object} options - Processing options
 * @returns {object} Processing result
 */
function processFile(filePath, options) {
  const { dryRun, verbose, inPlace } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  if (!filePath.endsWith('.en.md')) {
    return { success: false, error: 'File must have .en.md extension' };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract frontmatter
  const { frontmatter, contentWithoutFrontmatter } = extractFrontmatter(content);

  // Protect directives from translation
  const { content: directiveProtectedContent, directivesProtected } = protectDirectives(
    contentWithoutFrontmatter,
    verbose
  );

  // Extract tables
  const { content: protectedContent, tables } = extractTables(directiveProtectedContent, verbose);

  const tableCount = Object.keys(tables).length;
  const hasFrontmatter = frontmatter !== null;

  if (tableCount === 0 && !hasFrontmatter && directivesProtected === 0) {
    if (verbose) {
      console.log(`  No tables, frontmatter, or directives to protect in: ${filePath}`);
    }
    return { success: true, tablesProtected: 0, directivesProtected: 0, hasFrontmatter: false };
  }

  // Build sidecar data
  const sidecar = {
    sourceFile: path.basename(filePath),
    ...(frontmatter?.module && { module: frontmatter.module }),
    ...(frontmatter?.section && { section: frontmatter.section }),
    ...(hasFrontmatter && { frontmatter }),
    ...(tableCount > 0 && { tables }),
  };

  // Load figures data if available
  const figuresData = loadFiguresData(filePath);
  const hasFigures = figuresData?.figures && Object.keys(figuresData.figures).length > 0;

  // Determine outputs
  const sidecarPath = getSidecarPath(filePath);
  const stringsPath = getStringsPath(filePath);
  const stringsContent = generateStringsContent(sidecar, figuresData);
  const hasStrings = stringsContent.length > 0;

  if (dryRun) {
    console.log(`[DRY RUN] Would protect in: ${filePath}`);
    if (hasFrontmatter) {
      console.log(`  Frontmatter keys: ${Object.keys(frontmatter).join(', ')}`);
    }
    if (directivesProtected > 0) {
      console.log(`  Directives: ${directivesProtected} directive(s)`);
    }
    if (tableCount > 0) {
      console.log(`  Tables: ${Object.keys(tables).join(', ')}`);
      for (const [key, table] of Object.entries(tables)) {
        const preview = table.markdown.split('\n')[0].substring(0, 60);
        console.log(`    ${key}: ${table.title || '(no title)'} - ${preview}...`);
      }
    }
    if (hasFigures) {
      const figureIds = Object.keys(figuresData.figures);
      console.log(`  Figures: ${figureIds.length} figure(s)`);
      for (const figId of figureIds.slice(0, 3)) {
        const fig = figuresData.figures[figId];
        const captionPreview = fig.captionEn
          ? fig.captionEn.substring(0, 50) + '...'
          : '(no caption)';
        console.log(`    ${figId}: ${captionPreview}`);
      }
      if (figureIds.length > 3) {
        console.log(`    ... and ${figureIds.length - 3} more`);
      }
    }
    console.log(`  Would write sidecar: ${sidecarPath}`);
    if (hasStrings) {
      console.log(`  Would write strings (markdown): ${stringsPath}`);
    }
    return {
      success: true,
      tablesProtected: tableCount,
      directivesProtected,
      hasFrontmatter,
      hasFigures,
      hasStrings,
      dryRun: true,
    };
  }

  // Write sidecar file
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));

  if (verbose) {
    console.log(`  Wrote sidecar: ${sidecarPath}`);
  }

  // Write strings file if there's translatable content
  if (hasStrings) {
    fs.writeFileSync(stringsPath, stringsContent);
    if (verbose) {
      console.log(`  Wrote strings: ${stringsPath}`);
    }
  }

  // Write protected content (without frontmatter, tables replaced with placeholders, directives protected)
  if (inPlace) {
    fs.writeFileSync(filePath, protectedContent);
    if (verbose) {
      console.log(`  Modified: ${filePath}`);
    }
  } else {
    console.log(protectedContent);
  }

  return {
    success: true,
    tablesProtected: tableCount,
    directivesProtected,
    hasFrontmatter,
    hasFigures,
    hasStrings,
    sidecarPath,
    stringsPath: hasStrings ? stringsPath : null,
  };
}

/**
 * Find all .en.md files in a directory recursively
 * @param {string} dir - Directory path
 * @returns {string[]} Array of file paths
 */
function findEnglishMarkdownFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findEnglishMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.en.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Process multiple files in batch mode
 * @param {string} directory - Directory to process
 * @param {object} options - Processing options
 */
function processBatch(directory, options) {
  const files = findEnglishMarkdownFiles(directory);

  if (files.length === 0) {
    console.log(`No .en.md files found in ${directory}`);
    return;
  }

  console.log(`Found ${files.length} .en.md file(s) in ${directory}`);
  if (options.dryRun) {
    console.log('[DRY RUN MODE]');
  }
  console.log('');

  let totalTables = 0;
  let totalDirectives = 0;
  let filesWithTables = 0;
  let filesWithDirectives = 0;
  let filesWithFrontmatter = 0;
  let filesWithFigures = 0;
  let filesWithStrings = 0;

  for (const file of files) {
    if (options.verbose) {
      console.log(`Processing: ${path.relative(directory, file)}`);
    }

    const result = processFile(file, { ...options, inPlace: true });

    if (result.success) {
      if (result.tablesProtected > 0) {
        filesWithTables++;
        totalTables += result.tablesProtected;
        if (!options.verbose && !options.dryRun) {
          console.log(
            `  Protected ${result.tablesProtected} table(s): ${path.relative(directory, file)}`
          );
        }
      }
      if (result.directivesProtected > 0) {
        filesWithDirectives++;
        totalDirectives += result.directivesProtected;
        if (!options.verbose && !options.dryRun) {
          console.log(
            `  Protected ${result.directivesProtected} directive(s): ${path.relative(directory, file)}`
          );
        }
      }
      if (result.hasFrontmatter) {
        filesWithFrontmatter++;
      }
      if (result.hasFigures) {
        filesWithFigures++;
      }
      if (result.hasStrings) {
        filesWithStrings++;
      }
    } else {
      console.error(`  Error: ${result.error}`);
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Pre-MT Protection Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with frontmatter: ${filesWithFrontmatter}`);
  console.log(`  Files with directives: ${filesWithDirectives}`);
  console.log(`  Total directives protected: ${totalDirectives}`);
  console.log(`  Files with tables: ${filesWithTables}`);
  console.log(`  Total tables protected: ${totalTables}`);
  console.log(`  Files with figures: ${filesWithFigures}`);
  console.log(`  Files with translatable strings (markdown): ${filesWithStrings}`);
}

// ============================================================================
// Exports for programmatic use
// ============================================================================

export { processFile, processBatch, findEnglishMarkdownFiles };

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input && !args.batch) {
    console.error('Error: Please provide a file or --batch option');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    if (args.batch) {
      processBatch(path.resolve(args.batch), args);
    } else {
      const result = processFile(path.resolve(args.input), args);

      if (!result.success) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      if (!args.dryRun && (result.tablesProtected > 0 || result.hasFrontmatter)) {
        console.error(`Protected ${result.tablesProtected} table(s)`);
        if (result.sidecarPath) {
          console.error(`Sidecar: ${result.sidecarPath}`);
        }
        if (result.stringsPath) {
          console.error(`Strings: ${result.stringsPath}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Only run main if executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
