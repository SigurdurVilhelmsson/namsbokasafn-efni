#!/usr/bin/env node

/**
 * restore-strings.js
 *
 * Post-MT processing script that integrates translated strings into content.
 *
 * After machine translation, this script:
 * 1. Finds the translated strings file (*-strings.is.md)
 * 2. Parses markdown format (sections with **Label:** values)
 * 3. Updates the markdown file's YAML frontmatter with translated title
 * 4. Updates the sidecar JSON with translated values
 * 5. Updates figures.json with translated captions and alt text
 * 6. Updates table titles in the markdown file
 *
 * Usage:
 *   node tools/restore-strings.js <file.is.md> [options]
 *   node tools/restore-strings.js --batch <directory>
 *
 * Options:
 *   --in-place         Update files in place (default behavior)
 *   --batch <dir>      Process all .is.md files in directory
 *   --dry-run          Show what would change without writing
 *   --verbose          Show processing details
 *   -h, --help         Show help message
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    input: null,
    batch: null,
    inPlace: true, // Default to in-place for pipeline use
    dryRun: false,
    verbose: false,
    help: false
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
restore-strings.js - Integrate translated strings into content after MT

Reads translated strings file (*-strings.is.md) in markdown format and updates:
- Markdown file frontmatter with translated title
- Sidecar JSON with translated frontmatter titles, table titles, and summaries
- Figures JSON with translated captions (captionIs) and alt text (altTextIs)
- Table titles in the markdown content

Usage:
  node tools/restore-strings.js <file.is.md> [options]
  node tools/restore-strings.js --batch <directory>

Options:
  --in-place         Update sidecar in place (default)
  --batch <dir>      Process all .is.md files in directory
  --dry-run          Show what would change without writing
  --verbose, -v      Show processing details
  -h, --help         Show this help message

File Resolution:
  For file.is.md, looks for:
  - file-strings.is.md (translated strings in markdown)
  - file-protected.json (sidecar to update)
  - file-figures.json or file.en-figures.json (figures to update)

Markdown Strings Format:
  ## Frontmatter
  **Title:** Translated title here

  ## Tables
  ### Table 1
  **Title:** Translated table title
  **Summary:** Translated table summary text

  ## Figures
  ### CNX_Chem_01_01_Alchemist
  **Caption:** Translated caption
  **Alt text:** Translated alt text

Examples:
  # Preview string restoration
  node tools/restore-strings.js books/efnafraedi/02-mt-output/ch01/1-5.is.md --dry-run

  # Update sidecar with translated strings
  node tools/restore-strings.js books/efnafraedi/02-mt-output/ch01/1-5.is.md

  # Process all translated files
  node tools/restore-strings.js --batch books/efnafraedi/02-mt-output/ch01/
`);
}

// ============================================================================
// File Resolution
// ============================================================================

/**
 * Find the strings file for a translated markdown file.
 *
 * @param {string} mdPath - Path to the translated markdown file
 * @returns {string|null} Path to strings file, or null if not found
 */
function findStringsFile(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath);

  // Extract base name, handling .is.md suffix
  let baseName = basename.replace(/\.is\.md$/, '').replace(/\.md$/, '');

  // Remove split file suffix like (a), (b), etc.
  baseName = baseName.replace(/\([a-z]\)$/, '');

  // Look for translated strings file (prefer .md format, fallback to .txt)
  const possiblePaths = [
    // New markdown format - same directory
    path.join(dir, `${baseName}-strings.is.md`),
    // New markdown format - source directory
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}-strings.is.md`),
    // Legacy txt format - same directory (backwards compatibility)
    path.join(dir, `${baseName}-strings.is.txt`),
    // Legacy txt format - source directory
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}-strings.is.txt`)
  ];

  for (const stringsPath of possiblePaths) {
    if (fs.existsSync(stringsPath)) {
      return stringsPath;
    }
  }

  return null;
}

/**
 * Find the sidecar file for a translated markdown file.
 *
 * @param {string} mdPath - Path to the translated markdown file
 * @returns {string|null} Path to sidecar file, or null if not found
 */
function findSidecarFile(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath);

  // Extract base name
  let baseName = basename.replace(/\.is\.md$/, '').replace(/\.md$/, '');
  baseName = baseName.replace(/\([a-z]\)$/, '');

  const possiblePaths = [
    // Same directory
    path.join(dir, `${baseName}-protected.json`),
    // Source directory (02-for-mt instead of 02-mt-output)
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}-protected.json`)
  ];

  for (const sidecarPath of possiblePaths) {
    if (fs.existsSync(sidecarPath)) {
      return sidecarPath;
    }
  }

  return null;
}

/**
 * Find the figures file for a translated markdown file.
 *
 * @param {string} mdPath - Path to the translated markdown file
 * @returns {string|null} Path to figures file, or null if not found
 */
function findFiguresFile(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath);

  // Extract base name
  let baseName = basename.replace(/\.is\.md$/, '').replace(/\.md$/, '');
  baseName = baseName.replace(/\([a-z]\)$/, '');

  const possiblePaths = [
    // Same directory - various naming conventions
    path.join(dir, `${baseName}-figures.json`),
    path.join(dir, `${baseName}.en-figures.json`),
    // Source directory (02-for-mt instead of 02-mt-output)
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}-figures.json`),
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}.en-figures.json`)
  ];

  for (const figuresPath of possiblePaths) {
    if (fs.existsSync(figuresPath)) {
      return figuresPath;
    }
  }

  return null;
}

// ============================================================================
// Strings Parsing
// ============================================================================

/**
 * Determine if content is markdown format (new) or legacy txt format.
 *
 * @param {string} content - The strings file content
 * @returns {boolean} True if markdown format
 */
function isMarkdownFormat(content) {
  // Check for markdown headers that indicate new format
  return content.includes('# Translatable Strings') ||
         content.includes('## Frontmatter') ||
         content.includes('## Tables') ||
         content.includes('## Figures');
}

/**
 * Parse a markdown strings file into structured data.
 *
 * @param {string} content - The markdown content
 * @returns {object} Parsed data with frontmatter, tables, and figures
 */
function parseMarkdownStrings(content) {
  const result = {
    frontmatter: {},
    tables: {},
    figures: {}
  };

  // Clean up common MT artifacts
  content = cleanMTMangling(content);

  // Parse frontmatter title
  const titleMatch = content.match(/## Frontmatter[\s\S]*?\*\*Title:\*\*\s*(.+?)(?=\n\n|\n---|$)/);
  if (titleMatch) {
    result.frontmatter.title = titleMatch[1].trim();
  }

  // Parse tables section
  const tablesSection = content.match(/## Tables\s+([\s\S]*?)(?=\n## |$)/);
  if (tablesSection) {
    const tableContent = tablesSection[1];

    // Find all table entries
    const tablePattern = /### Table (\d+)\s+([\s\S]*?)(?=### Table |\n## |$)/g;
    let tableMatch;
    while ((tableMatch = tablePattern.exec(tableContent)) !== null) {
      const tableNum = tableMatch[1];
      const tableData = tableMatch[2];

      result.tables[`TABLE:${tableNum}`] = {};

      const tableTitle = tableData.match(/\*\*Title:\*\*\s*(.+?)(?=\n\n|\n\*\*|$)/);
      if (tableTitle) {
        result.tables[`TABLE:${tableNum}`].title = tableTitle[1].trim();
      }

      const tableSummary = tableData.match(/\*\*Summary:\*\*\s*([\s\S]+?)(?=\n\n|\n---|$)/);
      if (tableSummary) {
        result.tables[`TABLE:${tableNum}`].summary = tableSummary[1].trim();
      }
    }
  }

  // Parse figures section
  const figuresSection = content.match(/## Figures\s+([\s\S]*?)$/);
  if (figuresSection) {
    const figureContent = figuresSection[1];

    // Find all figure entries - match figure IDs (CNX_*, or any alphanumeric with underscores)
    const figurePattern = /### ([A-Za-z0-9_-]+)\s+([\s\S]*?)(?=### [A-Za-z0-9_-]+|\n## |$)/g;
    let figMatch;
    while ((figMatch = figurePattern.exec(figureContent)) !== null) {
      const figId = figMatch[1].trim();
      const figData = figMatch[2];

      // Skip if this looks like a table header we accidentally matched
      if (figId.toLowerCase().startsWith('table')) continue;

      result.figures[figId] = {};

      const caption = figData.match(/\*\*Caption:\*\*\s*([\s\S]+?)(?=\n\n|\n\*\*|$)/);
      if (caption) {
        result.figures[figId].captionIs = caption[1].trim();
      }

      const altText = figData.match(/\*\*Alt text:\*\*\s*([\s\S]+?)(?=\n\n|\n---|$)/);
      if (altText) {
        result.figures[figId].altTextIs = altText[1].trim();
      }
    }
  }

  return result;
}

/**
 * Parse a legacy txt strings file into key-value pairs.
 *
 * Format:
 *   [[KEY]] Value text that can span
 *   multiple lines until the next marker
 *
 *   [[ANOTHER:KEY]] Another value
 *
 * @param {string} content - The strings file content
 * @returns {Map<string, string>} Map of key to value
 */
function parseLegacyStringsFile(content) {
  const strings = new Map();

  // Clean up MT artifacts first
  content = cleanMTMangling(content);

  // Pattern: [[KEY]] followed by value until next [[ or end
  const pattern = /\[\[([^\]]+)\]\]\s*([\s\S]*?)(?=\[\[|$)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();

    if (key && value) {
      strings.set(key, value);
    }
  }

  return strings;
}

/**
 * Convert legacy parsed strings to structured format
 * @param {Map<string, string>} strings - Legacy parsed strings
 * @returns {object} Structured data
 */
function legacyToStructured(strings) {
  const result = {
    frontmatter: {},
    tables: {},
    figures: {}
  };

  for (const [key, value] of strings) {
    if (key === 'FRONTMATTER:title') {
      result.frontmatter.title = value;
    } else if (key.startsWith('TABLE:')) {
      // Parse TABLE:N:field format
      const match = key.match(/TABLE:(\d+):(\w+)/);
      if (match) {
        const tableNum = match[1];
        const field = match[2];
        if (!result.tables[`TABLE:${tableNum}`]) {
          result.tables[`TABLE:${tableNum}`] = {};
        }
        result.tables[`TABLE:${tableNum}`][field] = value;
      }
    }
    // Note: Legacy format didn't support figures
  }

  return result;
}

/**
 * Parse strings file content (auto-detects format).
 *
 * @param {string} content - The strings file content
 * @returns {object} Parsed data with frontmatter, tables, and figures
 */
function parseStringsFile(content) {
  if (isMarkdownFormat(content)) {
    return parseMarkdownStrings(content);
  } else {
    // Legacy format
    const strings = parseLegacyStringsFile(content);
    return legacyToStructured(strings);
  }
}

/**
 * Handle common MT mangling of content
 * @param {string} content - The potentially mangled strings content
 * @returns {string} Cleaned content
 */
function cleanMTMangling(content) {
  // Handle escaped brackets from MT: \[\[ -> [[
  let cleaned = content.replace(/\\\[\\\[/g, '[[');
  cleaned = cleaned.replace(/\\\]\\\]/g, ']]');

  // Handle space-separated brackets: [ [ -> [[
  cleaned = cleaned.replace(/\[\s+\[/g, '[[');
  cleaned = cleaned.replace(/\]\s+\]/g, ']]');

  // Handle escaped asterisks: \*\* -> **
  cleaned = cleaned.replace(/\\\*\\\*/g, '**');

  return cleaned;
}

// ============================================================================
// Sidecar and Figures Updating
// ============================================================================

/**
 * Update sidecar with translated strings
 *
 * @param {object} sidecar - The sidecar data
 * @param {object} parsed - Parsed translated strings (structured format)
 * @param {boolean} verbose - Whether to log details
 * @returns {{sidecar: object, updates: number}}
 */
function updateSidecar(sidecar, parsed, verbose) {
  let updates = 0;

  // Update frontmatter title
  if (parsed.frontmatter?.title && sidecar.frontmatter) {
    const translatedTitle = parsed.frontmatter.title;
    if (sidecar.frontmatter.title !== translatedTitle) {
      if (verbose) {
        console.error(`  Updating frontmatter title: "${sidecar.frontmatter.title}" -> "${translatedTitle}"`);
      }
      sidecar.frontmatter.title = translatedTitle;
      updates++;
    }
  }

  // Update table titles and summaries
  if (sidecar.tables && parsed.tables) {
    for (const [tableKey, tableData] of Object.entries(sidecar.tables)) {
      const translatedTable = parsed.tables[tableKey];
      if (!translatedTable) continue;

      // Update table title
      if (translatedTable.title) {
        if (tableData.title !== translatedTable.title) {
          if (verbose) {
            const oldTitle = tableData.title || '(none)';
            console.error(`  Updating ${tableKey} title: "${oldTitle}" -> "${translatedTable.title}"`);
          }
          tableData.title = translatedTable.title;
          updates++;
        }
      }

      // Update table summary
      if (translatedTable.summary) {
        if (tableData.summary !== translatedTable.summary) {
          if (verbose) {
            const oldSummary = tableData.summary ? tableData.summary.substring(0, 40) + '...' : '(none)';
            const newSummary = translatedTable.summary.substring(0, 40) + '...';
            console.error(`  Updating ${tableKey} summary: "${oldSummary}" -> "${newSummary}"`);
          }
          tableData.summary = translatedTable.summary;
          updates++;
        }
      }
    }
  }

  return { sidecar, updates };
}

/**
 * Update figures JSON with translated captions and alt text
 *
 * @param {object} figuresData - The figures data
 * @param {object} parsed - Parsed translated strings (structured format)
 * @param {boolean} verbose - Whether to log details
 * @returns {{figuresData: object, updates: number}}
 */
function updateFigures(figuresData, parsed, verbose) {
  let updates = 0;

  if (!figuresData?.figures || !parsed.figures) {
    return { figuresData, updates };
  }

  for (const [figId, figData] of Object.entries(figuresData.figures)) {
    const translatedFig = parsed.figures[figId];
    if (!translatedFig) continue;

    // Update caption (captionIs)
    if (translatedFig.captionIs) {
      if (figData.captionIs !== translatedFig.captionIs) {
        if (verbose) {
          const oldCaption = figData.captionIs ? figData.captionIs.substring(0, 40) + '...' : '(none)';
          const newCaption = translatedFig.captionIs.substring(0, 40) + '...';
          console.error(`  Updating ${figId} caption: "${oldCaption}" -> "${newCaption}"`);
        }
        figData.captionIs = translatedFig.captionIs;
        updates++;
      }
    }

    // Update alt text (altTextIs)
    if (translatedFig.altTextIs) {
      if (figData.altTextIs !== translatedFig.altTextIs) {
        if (verbose) {
          const oldAlt = figData.altTextIs ? figData.altTextIs.substring(0, 40) + '...' : '(none)';
          const newAlt = translatedFig.altTextIs.substring(0, 40) + '...';
          console.error(`  Updating ${figId} alt text: "${oldAlt}" -> "${newAlt}"`);
        }
        figData.altTextIs = translatedFig.altTextIs;
        updates++;
      }
    }
  }

  return { figuresData, updates };
}

/**
 * Update markdown file with translated table titles
 *
 * The markdown contains **English Title** before [[TABLE:N]] placeholders.
 * This function replaces them with translated titles from the sidecar.
 *
 * @param {string} content - The markdown content
 * @param {object} sidecar - The updated sidecar with translated titles
 * @param {boolean} verbose - Whether to log details
 * @returns {{content: string, updates: number}}
 */
function updateMarkdownTitles(content, sidecar, verbose) {
  if (!sidecar.tables) {
    return { content, updates: 0 };
  }

  let updates = 0;
  let updatedContent = content;

  for (const [tableKey, tableData] of Object.entries(sidecar.tables)) {
    if (!tableData.title) continue;

    // Pattern: **Any Title**\n\n[[TABLE:N]] or \[\[TABLE:N\]\]
    // We need to replace the title line with the translated one
    const tableNum = tableKey.replace('TABLE:', '');
    const pattern = new RegExp(
      `\\*\\*([^*]+)\\*\\*\\s*\\n\\n((?:\\\\\\[\\\\\\[|\\[\\[)TABLE:${tableNum}(?:\\\\\\]\\\\\\]|\\]\\]))`,
      'g'
    );

    updatedContent = updatedContent.replace(pattern, (match, oldTitle, placeholder) => {
      if (oldTitle.trim() !== tableData.title) {
        updates++;
        if (verbose) {
          console.error(`  Updated markdown title for ${tableKey}`);
        }
      }
      return `**${tableData.title}**\n\n${placeholder}`;
    });
  }

  return { content: updatedContent, updates };
}

/**
 * Update markdown file frontmatter with translated title
 *
 * Adds or updates the `title` field in the YAML frontmatter with the
 * translated title from the strings file.
 *
 * @param {string} content - The markdown content
 * @param {object} parsed - Parsed translated strings
 * @param {boolean} verbose - Whether to log details
 * @returns {{content: string, updates: number}}
 */
function updateMarkdownFrontmatter(content, parsed, verbose) {
  if (!parsed.frontmatter?.title) {
    return { content, updates: 0 };
  }

  const translatedTitle = parsed.frontmatter.title;
  let updates = 0;

  // Check if content has frontmatter
  if (content.startsWith('---')) {
    const endOfFrontmatter = content.indexOf('---', 3);
    if (endOfFrontmatter !== -1) {
      let frontmatter = content.substring(4, endOfFrontmatter).trim();
      const body = content.substring(endOfFrontmatter + 3);

      // Check if title already exists in frontmatter
      const titleRegex = /^title:\s*["']?(.+?)["']?\s*$/m;
      const titleMatch = frontmatter.match(titleRegex);

      if (titleMatch) {
        // Update existing title if different
        if (titleMatch[1].trim() !== translatedTitle) {
          frontmatter = frontmatter.replace(titleRegex, `title: "${translatedTitle}"`);
          updates++;
          if (verbose) {
            console.error(`  Updated frontmatter title: "${titleMatch[1].trim()}" -> "${translatedTitle}"`);
          }
        }
      } else {
        // Add title to frontmatter
        frontmatter = `title: "${translatedTitle}"\n${frontmatter}`;
        updates++;
        if (verbose) {
          console.error(`  Added frontmatter title: "${translatedTitle}"`);
        }
      }

      return {
        content: `---\n${frontmatter}\n---${body}`,
        updates
      };
    }
  }

  // No frontmatter exists - create one with the title
  updates++;
  if (verbose) {
    console.error(`  Created frontmatter with title: "${translatedTitle}"`);
  }

  return {
    content: `---\ntitle: "${translatedTitle}"\n---\n\n${content}`,
    updates
  };
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Process a single file
 * @param {string} filePath - Path to the markdown file
 * @param {object} options - Processing options
 * @returns {object} Processing result
 */
function processFile(filePath, options) {
  const { dryRun, verbose } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  // Find strings file
  const stringsPath = findStringsFile(filePath);

  if (!stringsPath) {
    if (verbose) {
      console.error(`  No strings file found for: ${filePath}`);
    }
    return { success: true, updates: 0, noStringsFile: true };
  }

  // Find sidecar file
  const sidecarPath = findSidecarFile(filePath);

  // Find figures file
  const figuresPath = findFiguresFile(filePath);

  // Need at least sidecar or figures to update
  if (!sidecarPath && !figuresPath) {
    if (verbose) {
      console.error(`  No sidecar or figures file found for: ${filePath}`);
    }
    return { success: true, updates: 0, noSidecar: true };
  }

  // Load and parse strings file
  const stringsContent = fs.readFileSync(stringsPath, 'utf-8');
  const parsed = parseStringsFile(stringsContent);

  // Check if there's anything to update
  const hasContent = parsed.frontmatter?.title ||
                     Object.keys(parsed.tables).length > 0 ||
                     Object.keys(parsed.figures).length > 0;

  if (!hasContent) {
    if (verbose) {
      console.error(`  No valid strings found in: ${stringsPath}`);
    }
    return { success: true, updates: 0, emptyStrings: true };
  }

  // Load sidecar if available
  let sidecar = null;
  if (sidecarPath) {
    try {
      sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
    } catch (err) {
      return { success: false, error: `Failed to parse sidecar: ${sidecarPath}` };
    }
  }

  // Load figures if available
  let figuresData = null;
  if (figuresPath) {
    try {
      figuresData = JSON.parse(fs.readFileSync(figuresPath, 'utf-8'));
    } catch (err) {
      if (verbose) {
        console.error(`  Warning: Failed to parse figures: ${figuresPath}`);
      }
    }
  }

  // Update sidecar with translated strings
  let sidecarUpdates = 0;
  let updatedSidecar = sidecar;
  if (sidecar) {
    const result = updateSidecar(sidecar, parsed, verbose);
    updatedSidecar = result.sidecar;
    sidecarUpdates = result.updates;
  }

  // Update figures with translated captions/alt text
  let figuresUpdates = 0;
  let updatedFigures = figuresData;
  if (figuresData && Object.keys(parsed.figures).length > 0) {
    const result = updateFigures(figuresData, parsed, verbose);
    updatedFigures = result.figuresData;
    figuresUpdates = result.updates;
  }

  // Update markdown file with translated frontmatter title and table titles
  let mdUpdates = 0;
  let frontmatterUpdates = 0;
  let updatedMdContent = null;

  const mdContent = fs.readFileSync(filePath, 'utf-8');
  updatedMdContent = mdContent;

  // Update frontmatter with translated title
  if (parsed.frontmatter?.title) {
    const fmResult = updateMarkdownFrontmatter(updatedMdContent, parsed, verbose);
    updatedMdContent = fmResult.content;
    frontmatterUpdates = fmResult.updates;
  }

  // Update table titles in markdown
  if (updatedSidecar) {
    const result = updateMarkdownTitles(updatedMdContent, updatedSidecar, verbose);
    updatedMdContent = result.content;
    mdUpdates = result.updates;
  }

  const totalUpdates = sidecarUpdates + figuresUpdates + mdUpdates + frontmatterUpdates;

  if (totalUpdates === 0) {
    if (verbose) {
      console.error(`  No updates needed (strings already applied)`);
    }
    return { success: true, updates: 0 };
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would update ${totalUpdates} string(s) for: ${filePath}`);
    console.log(`  Strings file: ${stringsPath} (${stringsPath.endsWith('.md') ? 'markdown' : 'legacy txt'})`);
    if (frontmatterUpdates > 0) {
      console.log(`  Frontmatter title updates: ${frontmatterUpdates}`);
    }
    if (sidecarUpdates > 0) {
      console.log(`  Sidecar updates: ${sidecarUpdates}`);
    }
    if (figuresUpdates > 0) {
      console.log(`  Figures updates: ${figuresUpdates}`);
    }
    if (mdUpdates > 0) {
      console.log(`  Markdown table title updates: ${mdUpdates}`);
    }
    return { success: true, updates: totalUpdates, dryRun: true };
  }

  // Write updated sidecar
  if (sidecarUpdates > 0 && sidecarPath) {
    fs.writeFileSync(sidecarPath, JSON.stringify(updatedSidecar, null, 2));
    if (verbose) {
      console.error(`  Updated sidecar: ${sidecarPath}`);
    }
  }

  // Write updated figures
  if (figuresUpdates > 0 && figuresPath) {
    fs.writeFileSync(figuresPath, JSON.stringify(updatedFigures, null, 2));
    if (verbose) {
      console.error(`  Updated figures: ${figuresPath}`);
    }
  }

  // Write updated markdown if frontmatter or table titles changed
  if ((frontmatterUpdates > 0 || mdUpdates > 0) && updatedMdContent) {
    fs.writeFileSync(filePath, updatedMdContent);
    if (verbose) {
      console.error(`  Updated markdown: ${filePath}`);
    }
  }

  return {
    success: true,
    updates: totalUpdates,
    frontmatterUpdates,
    sidecarUpdates,
    figuresUpdates,
    mdUpdates,
    stringsPath,
    sidecarPath,
    figuresPath: figuresUpdates > 0 ? figuresPath : null
  };
}

/**
 * Find all .is.md files in a directory recursively
 * @param {string} dir - Directory path
 * @returns {string[]} Array of file paths
 */
function findTranslatedFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findTranslatedFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.is.md')) {
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
  const files = findTranslatedFiles(directory);

  if (files.length === 0) {
    console.log(`No .is.md files found in ${directory}`);
    return;
  }

  console.log(`Found ${files.length} .is.md file(s) in ${directory}`);
  if (options.dryRun) {
    console.log('[DRY RUN MODE]');
  }
  console.log('');

  let totalUpdates = 0;
  let filesUpdated = 0;
  let filesNoStrings = 0;

  for (const file of files) {
    if (options.verbose) {
      console.log(`Processing: ${path.relative(directory, file)}`);
    }

    const result = processFile(file, options);

    if (result.success) {
      if (result.updates > 0) {
        filesUpdated++;
        totalUpdates += result.updates;
        if (!options.verbose && !options.dryRun) {
          console.log(`  Updated ${result.updates} string(s): ${path.relative(directory, file)}`);
        }
      }
      if (result.noStringsFile) {
        filesNoStrings++;
      }
    } else {
      console.error(`  Error: ${result.error}`);
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('String Restoration Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files updated: ${filesUpdated}`);
  console.log(`  Files without strings: ${filesNoStrings}`);
  console.log(`  Total updates applied: ${totalUpdates}`);
  console.log(`    (includes markdown frontmatter, sidecar, tables, and figures)`);
}

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

      if (args.verbose && result.updates > 0) {
        console.error(`Restored ${result.updates} string(s)`);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
